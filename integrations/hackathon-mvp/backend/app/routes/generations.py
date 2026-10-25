"""生成任务相关接口。"""
import json

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Asset, BrandSpecVersion, GenerationTask, Project
from ..schemas import CreateGenerationResponse, GenerationStatusResponse
from ..services.generation_service import run_generation
from ..services.llm_service import get_model
from ..services.storage_service import FileValidationError, storage_service

router = APIRouter(prefix="/api/generations", tags=["generations"])

ALLOWED_STYLES = {"温暖手作", "简约高级", "活泼促销"}
ALLOWED_PLATFORMS = {"朋友圈", "小红书", "短视频"}
MAX_IMAGES = 5


@router.post("", response_model=CreateGenerationResponse)
async def create_generation(
    background_tasks: BackgroundTasks,
    images: list[UploadFile] = File(..., description="商品照片（JPG/PNG/WEBP，1~5 张，第一张为主图）"),
    product_name: str = Form("", max_length=200),
    description: str = Form("", max_length=2000),
    style: str = Form("简约高级", max_length=50),
    platform: str = Form("朋友圈", max_length=50),
    model_id: str = Form("mock", min_length=1, max_length=100),
    project_id: str = Form("", max_length=32),
    brand_spec_json: str = Form("", max_length=2_500_000),
    voiceover: bool = Form(False),
    poster_mode: str = Form("", max_length=20),
    video_mode: str = Form("", max_length=20),
    video_cost_limit_usd: float = Form(0.0),
    db: Session = Depends(get_db),
):
    product_name = product_name.strip()
    description = description.strip()
    if not images:
        raise HTTPException(status_code=422, detail="请先上传商品照片")
    if len(images) > MAX_IMAGES:
        raise HTTPException(status_code=422, detail=f"最多上传 {MAX_IMAGES} 张商品照片")
    if not product_name:
        raise HTTPException(status_code=422, detail="请填写商品名称")
    if not description:
        raise HTTPException(status_code=422, detail="请填写宣传描述")
    if style not in ALLOWED_STYLES:
        raise HTTPException(status_code=422, detail="宣传风格无效，请从列表中选择")
    if platform not in ALLOWED_PLATFORMS:
        raise HTTPException(status_code=422, detail="宣传平台无效，请从列表中选择")

    model = get_model(model_id)
    if model is None:
        raise HTTPException(status_code=422, detail="所选模型不存在，请刷新页面后重新选择")
    if not model.configured:
        raise HTTPException(
            status_code=422,
            detail=f"模型「{model.name}」尚未配置完整，请在后端补充 BASE_URL、API Key 和模型名",
        )

    if model_id == "brand-spec" and not brand_spec_json.strip():
        raise HTTPException(status_code=422, detail="本地复用文案需要当前网站 BrandSpec")
    if brand_spec_json.strip():
        try:
            spec = json.loads(brand_spec_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="BrandSpec JSON 无效") from None
        if not isinstance(spec, dict) or not all(key in spec for key in ("brand", "campaign", "theme", "assets", "website", "poster", "video")):
            raise HTTPException(status_code=422, detail="BrandSpec 结构不完整")

    requested_poster_mode = poster_mode.strip() or (settings.poster_mode if settings.poster_mode == "ai" else "local")
    if requested_poster_mode not in {"local", "ai", "google"}:
        raise HTTPException(status_code=422, detail="海报生成模式无效")
    if requested_poster_mode == "google" and not settings.google_image_configured:
        raise HTTPException(status_code=422, detail="Google 图片模型尚未配置或未启用")
    requested_video_mode = video_mode.strip() or "local"
    if requested_video_mode not in {"local", "google-veo"}:
        raise HTTPException(status_code=422, detail="视频生成模式无效")
    project = db.get(Project, project_id) if project_id.strip() else None
    if project_id.strip() and project is None:
        raise HTTPException(status_code=422, detail="项目不存在，请刷新 Studio 后重试")
    if project is None:
        project = Project(name=product_name, description=description)
        db.add(project)
        db.flush()

    poster_model = f"google:{settings.google_image_model}" if requested_poster_mode == "google" else settings.poster_model.strip() if requested_poster_mode == "ai" else None
    if requested_poster_mode == "ai" and not (poster_model and settings.poster_base_url and settings.poster_api_key):
        raise HTTPException(status_code=422, detail="海报模型尚未配置完整，请补充后端图片模型配置")

    if requested_video_mode == "google-veo":
        if not settings.google_video_configured:
            raise HTTPException(status_code=422, detail="Google Veo 尚未配置或未启用")
        if not (0 < video_cost_limit_usd <= settings.google_video_max_cost_usd):
            raise HTTPException(status_code=422, detail="Google Veo 需要明确的视频费用上限；请设置不超过后端配置的单次预算")

    saved_paths: list[str] = []
    try:
        for img in images:
            saved = await storage_service.save_upload(img)
            saved_paths.append(str(saved))
            asset = Asset(project_id=project.id, kind="image", path=str(saved), mime_type=img.content_type or "application/octet-stream", original_name=img.filename or "asset")
            db.add(asset)
    except FileValidationError as e:
        # 任一文件校验失败则整体失败，清理已保存的文件
        storage_service.cleanup_files(saved_paths)
        raise HTTPException(status_code=422, detail=str(e))

    task = GenerationTask(
        project_id=project.id,
        product_name=product_name,
        description=description,
        style=style,
        platform=platform,
        model_id=model.id,
        poster_model=poster_model,
        brand_spec_json=brand_spec_json.strip() or None,
        voiceover=voiceover,
        audio_mode=("google-gemini-tts" if settings.google_tts_configured else "bailian-qwen-tts" if settings.bailian_tts_configured else "failed") if voiceover else "none",
        error_message="配音未启用或未配置；其他素材继续生成。" if voiceover and not (settings.google_tts_configured or settings.bailian_tts_configured) else None,
        video_mode=requested_video_mode,
        video_model=settings.google_video_model if requested_video_mode == "google-veo" else None,
        source_image_path=json.dumps(saved_paths, ensure_ascii=False),
        status="pending",
        stage="analysis",
    )
    db.add(task)
    db.flush()
    if brand_spec_json.strip():
        last_version = db.query(BrandSpecVersion.version).filter(BrandSpecVersion.project_id == project.id).order_by(BrandSpecVersion.version.desc()).first()
        version = BrandSpecVersion(project_id=project.id, version=(last_version[0] if last_version else 0) + 1, spec_json=brand_spec_json, prompt=description, source="marketing")
        db.add(version)
        db.flush()
        project.active_brand_spec_version_id = version.id
    db.commit()
    db.refresh(task)
    background_tasks.add_task(run_generation, task.id)
    return CreateGenerationResponse(task_id=task.id, status="pending", project_id=task.project_id)


@router.get("/{task_id}", response_model=GenerationStatusResponse)
async def get_generation(task_id: str, db: Session = Depends(get_db)):
    task = db.get(GenerationTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在，请重新发起生成")

    copies: list[str] = []
    if task.copy_text:
        try:
            copies = json.loads(task.copy_text)
        except json.JSONDecodeError:
            copies = [task.copy_text]

    used_model = get_model(task.model_id)
    return GenerationStatusResponse(
        task_id=task.id,
        component_status={
            "copy": "completed" if task.copy_text else "failed" if task.status == "failed" else "running" if task.stage == "copywriting" else "pending",
            "poster": "completed" if task.poster_path else "failed" if task.status in {"failed", "completed"} else "running" if task.stage == "poster" else "pending",
            "video": "completed" if task.video_path else "failed" if task.status in {"failed", "completed"} else "running" if task.stage == "video" else "pending",
            "audio": "completed" if task.audio_path else "failed" if task.audio_mode == "failed" else "disabled" if not task.voiceover else "running" if task.stage == "audio" else "pending",
        },
        project_id=task.project_id,
        poster_provider="google-gemini-image" if task.poster_model and task.poster_model.startswith("google:") else ("openai-compatible" if task.poster_model else "local-template"),
        video_provider="google-veo" if task.video_mode == "google-veo" else "local-ffmpeg",
        copy_provider="brand-spec" if task.model_id == "brand-spec" else "google-gemini" if task.model_id == "google-gemini" else ("mock" if task.model_id == "mock" else "openai-compatible"),
        video_mode=task.video_mode,
        copy_is_mock=(task.model_id or "mock") == "mock",
        model_name=used_model.name if used_model else None,
        google_image=bool(task.poster_model and task.poster_model.startswith("google:")),
        google_video=task.video_mode == "google-veo",
        copy_is_google=(task.model_id or "") == "google-gemini",
        status=task.status,
        stage=task.stage,
        poster_url=storage_service.public_url(task.poster_path),
        video_url=storage_service.public_url(task.video_path),
        copy_text=copies,
        error_message=task.error_message,
        mock_mode=not bool(task.poster_model),
        poster_model=(task.poster_model.removeprefix("google:") if task.poster_model and task.poster_model.startswith("google:") else task.poster_model),
        ffmpeg_available=settings.ffmpeg_available,
        audio_url=storage_service.public_url(task.audio_path),
        audio_mode=task.audio_mode,
    )
