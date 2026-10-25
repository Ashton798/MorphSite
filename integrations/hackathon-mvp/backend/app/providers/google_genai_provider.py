"""Google Gemini/Veo/TTS providers backed by the official ``google-genai`` SDK.

The provider module deliberately imports google-genai lazily.  The local/mock
workflow can therefore still boot when the optional SDK is not installed, while
all configured Google requests use the first-party SDK rather than a hand-built
REST client.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import wave
from pathlib import Path
from typing import Any

from ..config import settings
from ..schemas import CopyResult
from ..services.ffmpeg_service import FFmpegError
from .base import AudioProvider, CopywritingProvider, PosterProvider, VideoProvider
from .image_provider import ImageProviderError, _save_png, _source_png
from ..services.llm_service import LLMError

logger = logging.getLogger(__name__)


class GoogleProviderError(RuntimeError):
    """A provider failure safe to show to an end user (never an upstream body)."""


class GoogleAudioError(GoogleProviderError):
    pass


def _sdk_modules():
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover - exercised in installations without the optional dep
        raise GoogleProviderError(
            "Google AI SDK 未安装，请在后端环境执行 pip install -r requirements.txt"
        ) from exc
    return genai, types


def _base_url() -> str:
    """Convert the legacy setting into the base URL expected by google-genai.

    google-genai appends its api_version itself.  The previous REST provider
    accepted a URL ending in /v1beta, so strip that suffix to avoid producing
    /v1beta/v1beta when upgrading an existing .env file.
    """
    value = settings.google_api_base_url.strip().rstrip("/")
    for suffix in ("/v1beta", "/v1", "/v1beta1"):
        if value.lower().endswith(suffix):
            return value[: -len(suffix)].rstrip("/")
    return value


def _client():
    genai, types = _sdk_modules()
    options = types.HttpOptions(
        base_url=_base_url(),
        api_version=settings.google_api_version,
        timeout=max(1, int(settings.google_sdk_timeout_seconds * 1000)),
        retry_options=types.HttpRetryOptions(attempts=1),
    )
    return genai.Client(api_key=settings.google_api_key, http_options=options), types


def _safe_error(exc: Exception, fallback: str) -> str:
    """Map SDK/network exceptions without returning provider response bodies."""
    if isinstance(exc, OSError) and not getattr(exc, "code", None):
        return f"{fallback}：本地网络或文件访问失败，尚未取得 Google HTTP 响应"
    text = str(exc).lower()
    code = getattr(exc, "code", None)
    if code == 400:
        return f"{fallback}：请求参数或模型能力不匹配（HTTP 400）"
    if code == 503:
        return f"{fallback}：Google 服务暂时不可用（HTTP 503）"
    if code == 504:
        return f"{fallback}：Google 请求超时（HTTP 504）"
    if code == 429:
        category = "当前配额为 0" if "limit: 0" in text else "每日额度耗尽" if "perday" in text or "per day" in text else "每分钟速率限制" if "perminute" in text or "per minute" in text else "额度或速率限制，类型未明确"
        return f"{fallback}：{category}（HTTP 429）；不自动重试"
    if "permission" in text or "unauthenticated" in text or "api key" in text or "401" in text or "403" in text:
        return f"{fallback}：Google API Key 或模型权限不可用"
    if "quota" in text or "resource exhausted" in text or "429" in text:
        return f"{fallback}：Google 配额不足或请求过于频繁"
    if "not found" in text or "404" in text:
        return f"{fallback}：模型不存在或当前项目无权访问"
    if "timeout" in text or "timed out" in text:
        return f"{fallback}：请求超时"
    return fallback


def _close(client: Any) -> None:
    try:
        client.close()
    except Exception:
        pass


def _copy_prompt(product_name: str, description: str, style: str, platform: str) -> str:
    return f"""你是资深中文电商文案策划。为下面商品生成严格的 JSON，不要 markdown，不要解释：
{{
  \"main_title\": \"主标题（15字以内）\",
  \"subtitle\": \"副标题（20字以内）\",
  \"copies\": [\"宣传文案1\", \"宣传文案2\", \"宣传文案3\"],
  \"video_caption\": \"短视频字幕（20字以内）\"
}}
商品名称：{product_name}
活动描述：{description}
宣传风格：{style}
发布平台：{platform}
要求：中文输出；三条文案具体、风格各异；不要编造价格、功效、认证或活动事实。"""


def _parse_copy(raw: str) -> CopyResult:
    try:
        value = raw.strip()
        start, end = value.find("{"), value.rfind("}")
        if start >= 0 and end > start:
            value = value[start : end + 1]
        return CopyResult.model_validate(json.loads(value))
    except (ValueError, TypeError, json.JSONDecodeError):
        raise LLMError("Gemini 返回的文案格式不符合要求，请重试") from None


def _generate_copy_sync(product_name: str, description: str, style: str, platform: str) -> CopyResult:
    client = None
    try:
        client, types = _client()
        response = client.models.generate_content(
            model=settings.google_text_model,
            contents=_copy_prompt(product_name, description, style, platform),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7,
                max_output_tokens=700,
            ),
        )
        text = getattr(response, "text", None)
        if not isinstance(text, str) or not text.strip():
            raise LLMError("Gemini 返回了空文案")
        return _parse_copy(text)
    except LLMError:
        raise
    except Exception as exc:
        raise LLMError(_safe_error(exc, "Gemini 文案生成失败")) from None
    finally:
        _close(client)


class GoogleGeminiCopywritingProvider(CopywritingProvider):
    """Structured Chinese copy generated by Gemini through google-genai."""

    async def generate_copy(self, product_name: str, description: str, style: str, platform: str) -> CopyResult:
        if not settings.google_text_configured:
            raise LLMError("Gemini 文案模型尚未配置，请检查 GOOGLE_TEXT_ENABLED、Key 和模型名")
        return await asyncio.to_thread(_generate_copy_sync, product_name, description, style, platform)


def _chat_sync(system: str, messages: list[dict[str, str]]) -> str:
    client = None
    try:
        client, types = _client()
        transcript = "\n".join(f"{item['role']}：{item['content']}" for item in messages)
        response = client.models.generate_content(
            model=settings.google_text_model,
            contents=transcript,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0.6,
                max_output_tokens=1000,
            ),
        )
        text = getattr(response, "text", None)
        if not isinstance(text, str) or not text.strip():
            raise LLMError("Gemini 返回了空内容")
        return text.strip()
    except LLMError:
        raise
    except Exception as exc:
        raise LLMError(_safe_error(exc, "Gemini 对话生成失败")) from None
    finally:
        _close(client)


async def gemini_chat(system: str, messages: list[dict[str, str]]) -> str:
    if not settings.google_text_configured:
        raise LLMError("Gemini 文案模型尚未配置")
    return await asyncio.to_thread(_chat_sync, system, messages)


def _poster_prompt(copy: CopyResult, style: str) -> str:
    return (
        "Create a vertical commercial product poster using the supplied product reference image. "
        "Preserve the exact product appearance, packaging, colors and logo. Do not invent claims, prices, certifications or watermarks. "
        f"Visual style: {style}. Main title: {copy.main_title}. Subtitle: {copy.subtitle}. "
        f"Campaign copy: {'; '.join(copy.copies)}. Use clean, legible Chinese typography."
    )


def _generate_image_sync(source_image: Path, copy: CopyResult, style: str, output_path: Path, model: str | None = None) -> Path:
    client = None
    try:
        client, types = _client()
        source = _source_png(source_image)
        content = [
            types.Part.from_text(text=_poster_prompt(copy, style)),
            types.Part.from_bytes(data=source, mime_type="image/png"),
        ]
        response = client.models.generate_content(
            model=model or settings.google_image_model,
            contents=content,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16"),
            ),
        )
        for part in response.parts or []:
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None) if inline else None
            if isinstance(data, bytes) and data:
                # Re-use the existing Pillow validation and PNG normalization.
                _save_png(data, output_path)
                return output_path
        raise ImageProviderError("Gemini 未返回有效图片，请确认图片模型支持 IMAGE 响应")
    except ImageProviderError:
        raise
    except Exception as exc:
        raise ImageProviderError(_safe_error(exc, "Gemini 图片生成失败")) from None
    finally:
        _close(client)


class GoogleGeminiPosterProvider(PosterProvider):
    def __init__(self, model: str | None = None):
        self.model = model or settings.google_image_model

    async def generate_poster(self, source_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        if not settings.google_image_configured:
            raise ImageProviderError("Google 图片模型尚未配置，请检查 GOOGLE_IMAGE_ENABLED、Key 和模型名")
        return await asyncio.to_thread(_generate_image_sync, source_image, copy, style, output_path, self.model)


def _video_prompt(copy: CopyResult, style: str) -> str:
    return (
        "Create a short vertical product advertisement using the supplied product image as the first frame. "
        "Keep the product appearance, packaging, colors and logo consistent. No invented claims, pricing, certifications or watermark. "
        f"Style: {style}. Product message: {copy.video_caption}. Main title: {copy.main_title}. "
        "Use a restrained camera move, attractive product lighting and clear commercial composition."
    )


def _generate_video_sync(source_image: Path, copy: CopyResult, style: str, output_path: Path, model: str | None = None) -> Path:
    client = None
    try:
        client, types = _client()
        image = types.Image.from_file(location=str(source_image))
        operation = client.models.generate_videos(
            model=model or settings.google_video_model,
            source=types.GenerateVideosSource(prompt=_video_prompt(copy, style), image=image),
            config=types.GenerateVideosConfig(
                number_of_videos=1,
                duration_seconds=settings.google_video_duration_seconds,
                aspect_ratio="9:16",
                enhance_prompt=True,
            ),
        )
        deadline = time.monotonic() + settings.google_video_timeout_seconds
        while not getattr(operation, "done", False):
            if time.monotonic() >= deadline:
                raise FFmpegError("Google Veo 生成超时，视频任务未在设定时间内完成")
            time.sleep(max(0.5, settings.google_poll_seconds))
            operation = client.operations.get(operation)
        error = getattr(operation, "error", None)
        if error:
            raise FFmpegError(_safe_error(Exception(str(error)), "Google Veo 生成失败"))
        result = getattr(operation, "response", None) or getattr(operation, "result", None)
        videos = getattr(result, "generated_videos", None) if result else None
        video = videos[0].video if videos else None
        if video is None:
            raise FFmpegError("Google Veo 已完成但未返回视频")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        raw = getattr(video, "video_bytes", None)
        if isinstance(raw, bytes) and raw:
            output_path.write_bytes(raw)
        else:
            client.files.download(file=video, destination=str(output_path))
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise FFmpegError("Google Veo 返回的视频文件为空")
        return output_path
    except FFmpegError:
        raise
    except Exception as exc:
        raise FFmpegError(_safe_error(exc, "Google Veo 视频生成失败")) from None
    finally:
        _close(client)


class GoogleVeoVideoProvider(VideoProvider):
    def __init__(self, model: str | None = None):
        self.model = model or settings.google_video_model

    async def generate_video(self, source_images: list[Path], poster_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        if not settings.google_video_configured:
            raise FFmpegError("Google Veo 尚未配置，请检查 GOOGLE_VIDEO_ENABLED、Key 和模型名")
        if not source_images:
            raise FFmpegError("Google Veo 缺少商品图片")
        return await asyncio.to_thread(_generate_video_sync, source_images[0], copy, style, output_path, self.model)


def _generate_audio_sync(text: str, output_path: Path) -> Path:
    client = None
    try:
        client, types = _client()
        response = client.models.generate_content(
            model=settings.google_tts_model,
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    language_code=settings.google_tts_language,
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=settings.google_tts_voice,
                        )
                    ),
                ),
            ),
        )
        for part in response.parts or []:
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None) if inline else None
            if isinstance(data, bytes) and data:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                mime = (getattr(inline, "mime_type", "") or "").lower()
                # google-genai TTS commonly returns raw 24 kHz mono PCM. Do
                # not label arbitrary bytes as WAV or silently misplay them.
                if data.startswith(b"RIFF") and b"WAVE" in data[:16]:
                    output_path.write_bytes(data)
                elif "pcm" in mime or "l16" in mime:
                    with wave.open(str(output_path), "wb") as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(24000)
                        wav.writeframes(data)
                else:
                    raise GoogleAudioError("Gemini TTS 返回的音频格式暂不受支持")
                return output_path
        raise GoogleAudioError("Gemini TTS 未返回有效音频")
    except GoogleAudioError:
        raise
    except Exception as exc:
        raise GoogleAudioError(_safe_error(exc, "Gemini TTS 生成失败")) from None
    finally:
        _close(client)


class GoogleGeminiTTSProvider(AudioProvider):
    async def generate_audio(self, text: str, output_path: Path) -> Path:
        if not settings.google_tts_configured:
            raise GoogleAudioError("Gemini TTS 尚未配置，请检查 GOOGLE_TTS_ENABLED、Key 和模型名")
        return await asyncio.to_thread(_generate_audio_sync, text[: settings.max_tts_chars], output_path)
