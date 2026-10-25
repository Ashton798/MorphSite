"""GenerationService：生成任务的完整流水线。

当前通过 FastAPI BackgroundTasks 调度（run_generation 为普通协程入口）；
以后切换 Celery + Redis 时，只需把 run_generation 包装为 Celery task，
在 task 内自行创建 DB session 调用 execute_pipeline 即可，业务逻辑不变。
"""
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import GeneratedOutput, GenerationTask
from ..providers.bailian_provider import BailianTTSProvider, BailianProviderError
from ..providers.real_provider import ProviderNotConfiguredError, get_providers
from ..providers.mock_provider import MockCopywritingProvider, MockPosterProvider
from ..providers.google_genai_provider import GoogleGeminiTTSProvider, GoogleAudioError
from .ffmpeg_service import FFmpegError, FFmpegNotFoundError, FFmpegService
from ..services.llm_service import LLMError
from ..providers.image_provider import ImageProviderError
from .storage_service import storage_service

logger = logging.getLogger(__name__)


def _update(db: Session, task: GenerationTask, **fields) -> None:
    for k, v in fields.items():
        setattr(task, k, v)
    db.commit()


async def run_generation(task_id: str) -> None:
    """BackgroundTasks 入口：自行管理 DB session。"""
    db = SessionLocal()
    try:
        task = db.get(GenerationTask, task_id)
        if task is None:
            logger.error("任务不存在：%s", task_id)
            return
        await execute_pipeline(db, task)
    finally:
        db.close()


async def execute_pipeline(db: Session, task: GenerationTask) -> None:
    try:
        copy_provider, poster_provider, video_provider = get_providers(task.model_id, task.poster_model, task.video_mode, task.brand_spec_json)
        if task.video_mode == "google-veo" and task.video_model:
            video_provider.model = task.video_model
    except ProviderNotConfiguredError as e:
        logger.warning("任务 %s Provider 配置无效", task.id)
        _update(db, task, status="failed", error_message=str(e))
        return
    except Exception:
        logger.error("任务 %s Provider 初始化失败", task.id)
        _update(db, task, status="failed", error_message="Provider 初始化失败，请检查后端配置")
        return

    try:
        # source_image_path accepts legacy single paths as well as JSON arrays.
        raw = task.source_image_path or "[]"
        try:
            paths = json.loads(raw)
        except json.JSONDecodeError:
            paths = [raw]
        if isinstance(paths, str):
            paths = [paths]
        if not isinstance(paths, list) or not all(isinstance(p, str) and p for p in paths):
            raise ValueError("原始图片记录无效，请重新上传")
        source_images = [Path(p) for p in paths]

        # 阶段 1：分析素材（校验原图可读）
        _update(db, task, status="processing", stage="analysis")
        if not source_images or not all(p.is_file() for p in source_images):
            raise FileNotFoundError("原始图片丢失，请重新上传")
        main_image = source_images[0]  # 第一张为主图，用于海报

        # 阶段 2：生成文案
        _update(db, task, stage="copywriting")
        try:
            copy = await copy_provider.generate_copy(
                task.product_name, task.description, task.style, task.platform
            )
        except LLMError:
            if task.model_id != "google-gemini":
                raise
            logger.warning("任务 %s Gemini 文案失败，使用明确标记的本地示例", task.id)
            copy = await MockCopywritingProvider().generate_copy(
                task.product_name, task.description, task.style, task.platform
            )
            _update(db, task, model_id="mock", error_message="Gemini 文案不可用，已改用标记为 Mock 的本地示例。")
        _update(db, task, copy_text=json.dumps(copy.copies, ensure_ascii=False))
        db.add(GeneratedOutput(project_id=task.project_id, task_id=task.id, kind="copy", path=None, mime_type="text/plain", provider="brand-spec" if task.model_id == "brand-spec" else "google-gemini" if task.model_id == "google-gemini" else ("mock" if task.model_id == "mock" else "openai-compatible"), is_mock=task.model_id == "mock", metadata_json=json.dumps({"copies": copy.copies}, ensure_ascii=False)))
        db.commit()

        # Optional Gemini TTS asset. It is independently durable: a TTS failure
        # does not discard copy, poster or video.
        if task.voiceover and settings.bailian_tts_configured and not settings.google_tts_configured:
            try:
                _update(db, task, stage="audio", audio_mode="bailian-qwen-tts")
                audio_path = storage_service.output_file(task.id, "voice.wav")
                await BailianTTSProvider().generate_audio(copy.video_caption[:24], audio_path)
                _update(db, task, audio_path=str(audio_path))
                db.add(GeneratedOutput(project_id=task.project_id, task_id=task.id, kind="audio", path=str(audio_path), mime_type="audio/wav", provider="bailian-qwen-tts", is_mock=False))
                db.commit()
            except BailianProviderError:
                _update(db, task, audio_mode="failed", error_message="百炼配音不可用，当前视频无配音。")
        if task.voiceover and settings.google_tts_configured:
            try:
                _update(db, task, stage="audio", audio_mode="google-gemini-tts")
                audio_path = storage_service.output_file(task.id, "voice.wav")
                await GoogleGeminiTTSProvider().generate_audio(copy.video_caption, audio_path)
                _update(db, task, audio_path=str(audio_path))
                db.add(GeneratedOutput(project_id=task.project_id, task_id=task.id, kind="audio", path=str(audio_path), mime_type="audio/wav", provider="google-gemini-tts", is_mock=False))
                db.commit()
            except GoogleAudioError as exc:
                logger.warning("任务 %s TTS 不可用：%s", task.id, exc)
                _update(db, task, audio_mode="failed", error_message="AI 配音暂不可用，其他素材仍会继续生成。")

        # 阶段 3：生成海报（基于主图）
        _update(db, task, stage="poster")
        poster_path = storage_service.output_file(task.id, "poster.png")
        try:
            await poster_provider.generate_poster(main_image, copy, task.style, poster_path)
        except ImageProviderError:
            if not (task.poster_model and task.poster_model.startswith("google:")):
                raise
            logger.warning("任务 %s Gemini 海报失败，使用明确标记的本地模板", task.id)
            await MockPosterProvider().generate_poster(main_image, copy, task.style, poster_path)
            _update(db, task, poster_model=None, error_message="Gemini 图片不可用，已改用标记为本地模板的海报。")
        _update(db, task, poster_path=str(poster_path))
        db.add(GeneratedOutput(project_id=task.project_id, task_id=task.id, kind="poster", path=str(poster_path), mime_type="image/png", provider="google-gemini-image" if task.poster_model and task.poster_model.startswith("google:") else ("openai-compatible" if task.poster_model else "local-template"), is_mock=not bool(task.poster_model)))
        db.commit()

        # 阶段 4：合成视频（多图轮播 + 海报收尾）
        _update(db, task, stage="video")
        video_path = storage_service.output_file(task.id, "video.mp4")
        await video_provider.generate_video(
            source_images, poster_path, copy, task.style, video_path
        )
        _update(db, task, video_path=str(video_path))
        # Standalone WAV is retained if FFmpeg muxing fails or Veo returns a
        # clip with its own audio; never replace a Veo soundtrack implicitly.
        if task.audio_path and task.video_mode != "google-veo":
            try:
                await FFmpegService().add_voiceover(video_path, Path(task.audio_path))
            except (FFmpegError, FFmpegNotFoundError) as exc:
                logger.warning("任务 %s 配音合成失败：%s", task.id, exc)
                _update(db, task, error_message="配音未加入视频；原视频和独立 WAV 仍可下载。")
        db.add(GeneratedOutput(project_id=task.project_id, task_id=task.id, kind="video", path=str(video_path), mime_type="video/mp4", provider="google-veo" if task.video_mode == "google-veo" else "local-ffmpeg", is_mock=task.video_mode != "google-veo"))
        db.commit()

        # 完成
        _update(db, task, status="completed", stage="completed")
        logger.info("任务完成：%s", task.id)

    except (FFmpegNotFoundError, FFmpegError) as e:
        logger.warning("任务 %s 视频合成不可用：%s", task.id, e)
        # Copy/poster/audio stay available. Avoid claiming FFmpeg is the fix for Veo.
        warning = "Google Veo 视频暂不可用；文案、海报与配音仍可下载。" if task.video_mode == "google-veo" else "本地 FFmpeg 视频暂不可用；文案、海报与配音仍可下载。"
        _update(db, task, status="completed", stage="completed", video_path=None, error_message=warning)
    except (LLMError, ImageProviderError, GoogleAudioError) as e:
        logger.warning("任务 %s 模型调用失败：%s", task.id, e)
        _update(db, task, status="failed", error_message=str(e))
    except NotImplementedError as e:
        _update(db, task, status="failed", error_message=f"Provider 未实现：{e}")
    except Exception:
        # Unexpected provider exceptions can contain credentials or upstream bodies.
        logger.error("任务 %s 生成失败", task.id)
        _update(db, task, status="failed", error_message="生成任务失败，请检查后端配置或重试")
