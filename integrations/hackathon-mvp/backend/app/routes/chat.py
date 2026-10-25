"""模型列表与对话接口。API Key 只在后端使用，接口不会返回任何密钥。"""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from starlette.responses import JSONResponse

from ..providers.google_genai_provider import gemini_chat
from ..services.llm_service import (
    LLMError,
    MAX_REPLY_CHARS,
    chat_completion,
    get_model,
    is_google_model,
    list_models,
    mock_chat_reply,
)

router = APIRouter(prefix="/api", tags=["chat"])

MAX_MESSAGES = 20
MAX_CONTENT_CHARS = 2000
MAX_CHAT_BODY_BYTES = 1024 * 1024


class ChatBodyLimitMiddleware:
    """Bound JSON before parsing, including requests without Content-Length."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"].rstrip("/") != "/api/chat":
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_CHAT_BODY_BYTES:
                response = JSONResponse(status_code=413, content={"detail": "对话请求过大，请开始新对话"})
                await response(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def limited_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, limited_receive, send)


SYSTEM_PROMPT = (
    "你是一名资深电商/新媒体宣传文案顾问。用户正在为商品准备宣传内容，"
    "你的任务是帮助他们把商品卖点和活动描述打磨得更清晰、更有吸引力。"
    "回答要简洁（200 字以内），使用中文。"
    "如果给出可直接使用的「活动描述」，请单独放在最后一段，并以「活动描述：」开头。"
)


class ModelOut(BaseModel):
    id: str
    name: str
    configured: bool
    is_mock: bool


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_REPLY_CHARS)

    @model_validator(mode="after")
    def validate_content(self):
        if not self.content.strip():
            raise ValueError("消息不能为空")
        if self.role == "user" and len(self.content) > MAX_CONTENT_CHARS:
            raise ValueError("用户消息过长")
        return self


class ChatRequest(BaseModel):
    model_id: str = Field(default="mock", min_length=1, max_length=100)
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    product_name: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)
    style: str = Field(default="", max_length=50)
    platform: str = Field(default="", max_length=50)

    @model_validator(mode="after")
    def validate_history_size(self):
        if sum(len(message.content) for message in self.messages) > 100000:
            raise ValueError("对话内容过长，请开始新对话")
        return self


class ChatResponse(BaseModel):
    reply: str
    model_id: str
    is_mock: bool


@router.get("/models", response_model=list[ModelOut])
async def get_models():
    return [
        ModelOut(id=m.id, name=m.name, configured=m.configured, is_mock=m.is_mock)
        for m in list_models()
    ]


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.messages or req.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="请输入要发送的内容")
    if not req.messages[-1].content.strip():
        raise HTTPException(status_code=422, detail="请输入要发送的内容")

    model = get_model(req.model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="所选模型不存在，请刷新页面后重新选择")
    if not model.configured:
        raise HTTPException(
            status_code=400,
            detail=f"模型「{model.name}」尚未配置完整，请在后端补充 BASE_URL、API Key 和模型名",
        )

    history = req.messages[-MAX_MESSAGES:]

    if model.is_mock:
        return ChatResponse(
            reply=mock_chat_reply(history[-1].content), model_id=model.id, is_mock=True
        )

    context = []
    if req.product_name.strip():
        context.append(f"商品名称：{req.product_name.strip()}")
    if req.description.strip():
        context.append(f"活动描述：{req.description.strip()}")
    if req.description.strip():
        context.append(f"当前活动描述：{req.description.strip()}")
    if req.style:
        context.append(f"宣传风格：{req.style}")
    if req.platform:
        context.append(f"宣传平台：{req.platform}")
    system = SYSTEM_PROMPT + ("\n当前信息：" + "；".join(context) if context else "")

    messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in history
    ]
    try:
        if is_google_model(model):
            reply = await gemini_chat(system, [{"role": m.role, "content": m.content} for m in history])
        else:
            reply = await chat_completion(model, messages)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return ChatResponse(reply=reply, model_id=model.id, is_mock=False)


@router.get("/generation-config")
async def generation_config():
    """Expose model capability without exposing API keys."""
    from ..config import settings
    return {
        "poster_mode": "google" if settings.google_image_configured else settings.poster_mode,
        "poster_model": settings.google_image_model if settings.google_image_configured else (settings.poster_model if settings.poster_mode == "ai" else None),
        "poster_configured": settings.google_image_configured or not settings.poster_mode == "ai" or bool(settings.poster_model and settings.poster_base_url and settings.poster_api_key),
        "video_mode": "google-veo" if settings.google_video_configured else "local",
        "google_image_configured": settings.google_image_configured,
        "google_video_configured": settings.google_video_configured,
        "google_text_configured": settings.google_text_configured,
        "google_text_model": settings.google_text_model if settings.google_text_configured else None,
        "google_tts_configured": settings.google_tts_configured,
        "google_tts_model": settings.google_tts_model if settings.google_tts_configured else None,
        "google_sdk": "google-genai",
        "google_capabilities": {
            "text": settings.google_text_configured,
            "image": settings.google_image_configured,
            "video": settings.google_video_configured,
            "tts": settings.google_tts_configured,
        },
        "google_video_duration_seconds": settings.google_video_duration_seconds if settings.google_video_configured else None,
        "google_video_max_cost_usd": settings.google_video_max_cost_usd if settings.google_video_configured else None,
        "ffmpeg_available": settings.ffmpeg_available,
        "bailian": {
            "credentials_configured": settings.bailian_credentials_configured,
            "application_key": settings.bailian_key_is_application_key,
            "region": settings.dashscope_region,
            "text_model": settings.bailian_text_model,
            "image_model": settings.bailian_image_model,
            "i2v_model": settings.bailian_i2v_model,
            "t2v_model": settings.bailian_t2v_model,
            "tts_model": settings.bailian_tts_model,
            "capabilities": {
                "text": settings.bailian_text_configured,
                "image": settings.bailian_image_configured,
                "video": settings.bailian_video_configured,
                "tts": settings.bailian_tts_configured,
            },
        },
    }
