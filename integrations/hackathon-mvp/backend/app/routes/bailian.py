"""Explicit, cost-gated Bailian media endpoints.

Video creation is idempotent. GET performs at most one upstream status query;
the client decides when to query again, so the server never loops blindly.
"""
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..providers.ark_provider import ArkProvider
from ..providers.next_video_provider import NextVideoProvider
from ..services.ffmpeg_service import FFmpegService, FFmpegError, FFmpegNotFoundError
from ..config import settings
from ..database import get_db
from ..models import ProviderTask
from ..providers.bailian_provider import BailianImageProvider, BailianProviderError, BailianTTSProvider, BailianTextProvider, BailianVideoProvider
from ..schemas import BailianJsonRequest, BailianJsonResponse, ProviderMediaResponse, ProviderTaskResponse
from ..services.storage_service import FileValidationError, storage_service

router = APIRouter(prefix="/api/bailian", tags=["bailian"])
KEY = re.compile(r"^[A-Za-z0-9._:-]{16,128}$")


def _response(task: ProviderTask) -> ProviderTaskResponse:
    return ProviderTaskResponse(
        task_id=task.id,
        kind=task.kind,
        model=task.model,
        status=task.status,
        stage=task.stage,
        result_url=storage_service.public_url(task.output_path),
        error_message=task.error_message,
    )


def _provider_error(error: BailianProviderError) -> HTTPException:
    status = {
        "cost_not_approved": 402,
        "not_configured": 503,
        "wrong_key_type": 403,
        "region_mismatch": 422,
        "authentication": 401,
        "permission": 403,
        "model_or_endpoint": 404,
        "quota_or_rate_limit": 429,
        "provider_unavailable": 503,
        "provider_timeout": 504,
    }.get(error.category, error.status_code or 502)
    return HTTPException(status_code=status, detail=str(error))


@router.post("/json", response_model=BailianJsonResponse)
async def generate_json(request: BailianJsonRequest):
    try:
        provider = BailianTextProvider()
        model = request.model or settings.bailian_text_model
        data = await provider.generate_json(request.system, request.user, model=model, max_tokens=request.max_tokens, temperature=request.temperature)
        return BailianJsonResponse(data=data, model=model)
    except BailianProviderError as error:
        raise _provider_error(error) from error


@router.post("/images", response_model=ProviderMediaResponse)
async def generate_image(
    prompt: str = Form(..., min_length=1, max_length=2000),
    cost_confirmed: bool = Form(False),
    image: UploadFile | None = File(None),
):
    if not cost_confirmed:
        raise HTTPException(status_code=402, detail="本次 AI 图片费用尚未由用户确认。")
    source = None
    try:
        if image:
            source = await storage_service.save_upload(image)
        output = storage_service.output_file(uuid.uuid4().hex, "bailian.png")
        use_ark = bool(settings.ark_api_key and settings.ark_image_model)
        provider = ArkProvider("image") if use_ark else BailianImageProvider()
        await provider.generate_image(prompt, output, source)
        return ProviderMediaResponse(status="completed", provider="ark-seedream" if use_ark else "bailian-wan-image", model=settings.ark_image_model if use_ark else settings.bailian_image_model, result_url=storage_service.public_url(output) or "")
    except FileValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except BailianProviderError as error:
        raise _provider_error(error) from error


@router.post("/tts", response_model=ProviderMediaResponse)
async def generate_tts(
    text: str = Form(..., min_length=1, max_length=4000),
    cost_confirmed: bool = Form(False),
):
    if not cost_confirmed:
        raise HTTPException(status_code=402, detail="本次 TTS 费用尚未由用户确认。")
    try:
        output = storage_service.output_file(uuid.uuid4().hex, "bailian.wav")
        await BailianTTSProvider().generate_audio(text, output)
        return ProviderMediaResponse(status="completed", provider="bailian-qwen-audio-tts", model=settings.bailian_tts_model, result_url=storage_service.public_url(output) or "")
    except BailianProviderError as error:
        raise _provider_error(error) from error


@router.post("/video-tasks", response_model=ProviderTaskResponse)
async def create_video_task(
    prompt: str = Form(..., min_length=1, max_length=5000),
    mode: str = Form("i2v"),
    cost_confirmed: bool = Form(False),
    image: UploadFile | None = File(None),
    idempotency_key: str = Header("", alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    if not cost_confirmed:
        raise HTTPException(status_code=402, detail="本次 AI 视频费用尚未由用户确认。")
    if not KEY.fullmatch(idempotency_key):
        raise HTTPException(status_code=422, detail="必须提供 16-128 位 Idempotency-Key，避免重复创建付费任务。")
    if mode not in {"i2v", "t2v"}:
        raise HTTPException(status_code=422, detail="视频模式必须是 i2v 或 t2v。")
    if mode == "i2v" and image is None:
        raise HTTPException(status_code=422, detail="图生视频需要一张首帧图片。")
    existing = db.query(ProviderTask).filter(ProviderTask.idempotency_key == idempotency_key).first()
    if existing:
        return _response(existing)
    use_ark = bool(settings.ark_api_key and settings.ark_video_model)
    use_next = bool(settings.openai_next_api_key and settings.openai_next_video_model)
    model = settings.openai_next_video_model if use_next else settings.ark_video_model if use_ark else settings.bailian_i2v_model if mode == "i2v" else settings.bailian_t2v_model
    task = ProviderTask(idempotency_key=idempotency_key, provider="next" if use_next else "ark" if use_ark else "bailian", kind=f"video-{mode}", model=model, status="creating", stage="creating")
    db.add(task)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(ProviderTask).filter(ProviderTask.idempotency_key == idempotency_key).first()
        if existing:
            return _response(existing)
        raise
    db.refresh(task)
    source = None
    try:
        if image:
            source = await storage_service.save_upload(image)
            task.source_path = str(source)
            db.commit()
        provider = NextVideoProvider() if use_next else ArkProvider("video") if use_ark else BailianVideoProvider()
        remote = await provider.create_task(prompt, source)
        task.external_task_id = remote.task_id
        task.status = remote.status.lower()
        task.stage = "queued" if remote.status == "PENDING" else "processing"
        db.commit()
        # Persist the paid task before attempting optional narration.
        # A short neutral CTA avoids reading the entire generation instruction.
        if not use_next and settings.bailian_tts_configured:
            try:
                brand = re.search(r"品牌：([^。\n]{1,20})", prompt)
                narration = f"{brand.group(1)}，发现产品之美。" if brand else "发现产品之美，让美好走进生活。"
                await BailianTTSProvider().generate_audio(narration, storage_service.output_file(task.id, "voice.wav"))
            except BailianProviderError:
                task.error_message = "配音暂不可用，视频任务继续生成。"
                db.commit()
        db.refresh(task)
        return _response(task)
    except FileValidationError as error:
        task.status, task.stage, task.error_message = "failed", "failed", str(error)
        db.commit()
        raise HTTPException(status_code=422, detail=str(error)) from error
    except BailianProviderError as error:
        task.status, task.stage, task.error_message = "failed", "failed", str(error)
        db.commit()
        raise _provider_error(error) from error


@router.get("/video-tasks/{task_id}", response_model=ProviderTaskResponse)
async def get_video_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(ProviderTask, task_id)
    if not task or task.provider not in {"bailian", "ark", "next"} or not task.kind.startswith("video-"):
        raise HTTPException(status_code=404, detail="视频任务不存在。")
    if task.status in {"succeeded", "failed", "canceled"} or not task.external_task_id:
        return _response(task)
    try:
        provider = NextVideoProvider() if task.provider == "next" else ArkProvider("video") if task.provider == "ark" else BailianVideoProvider()
        remote = await provider.fetch_task(task.external_task_id)
        task.status = remote.status.lower()
        task.stage = {"PENDING": "queued", "RUNNING": "processing", "SUCCEEDED": "saving"}.get(remote.status, "failed")
        if remote.status == "SUCCEEDED":
            output = storage_service.output_file(task.id, "bailian.mp4")
            await provider.save_result(remote, output)
            audio = storage_service.output_file(task.id, "voice.wav")
            if audio.is_file():
                try:
                    await FFmpegService().add_voiceover(output, audio)
                except (FFmpegError, FFmpegNotFoundError):
                    task.error_message = "视频已生成，但配音合成失败。"
            task.output_path, task.stage = str(output), "completed"
        elif remote.status in {"FAILED", "CANCELED", "UNKNOWN"}:
            task.error_message = f"视频任务状态：{remote.status}。"
        db.commit()
        db.refresh(task)
        return _response(task)
    except BailianProviderError as error:
        # A transient status-query failure is observable but does not discard the
        # provider task ID and does not create a replacement paid task.
        task.error_message = str(error)
        db.commit()
        raise _provider_error(error) from error
