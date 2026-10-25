"""Pydantic 响应模型。"""
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class CreateGenerationResponse(BaseModel):
    task_id: str
    status: str = "pending"
    project_id: str | None = None


class GenerationStatusResponse(BaseModel):
    task_id: str
    component_status: dict[str, str] = {}
    status: str  # pending | processing | completed | failed
    stage: str  # analysis | copywriting | audio | poster | video | completed
    poster_url: str | None = None
    video_url: str | None = None
    copy_text: list[str] = []
    error_message: str | None = None
    mock_mode: bool = False  # 海报是否为本地模板生成（兼容旧客户端）
    poster_model: str | None = None
    video_mode: str = "local"
    copy_is_mock: bool = True  # 文案是否为本地示例（未使用真实模型）
    model_name: str | None = None
    google_image: bool = False
    google_video: bool = False
    copy_is_google: bool = False
    ffmpeg_available: bool = True
    audio_url: str | None = None
    audio_mode: str = "none"
    project_id: str | None = None
    poster_provider: str = "local-template"
    video_provider: str = "local-ffmpeg"
    copy_provider: str = "mock"


CopyText = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=4000)]

class CopyResult(BaseModel):
    """文案 Provider 的统一返回结构：不接受类型强转、空文案或多/少于三条。"""
    model_config = ConfigDict(strict=True, extra="forbid")

    main_title: CopyText
    subtitle: CopyText
    copies: list[CopyText] = Field(min_length=3, max_length=3)
    video_caption: CopyText


class ProviderTaskResponse(BaseModel):
    task_id: str
    provider: str = "bailian"
    kind: str
    model: str
    status: str
    stage: str
    result_url: str | None = None
    error_message: str | None = None


class ProviderMediaResponse(BaseModel):
    status: str
    provider: str
    model: str
    result_url: str
    paid_call: bool = True


class BailianJsonRequest(BaseModel):
    system: str = Field(min_length=1, max_length=20000)
    user: str | list[dict[str, Any]]
    model: str | None = Field(default=None, max_length=100)
    max_tokens: int = Field(default=6000, ge=128, le=16000)
    temperature: float = Field(default=0.7, ge=0, le=2)


class BailianJsonResponse(BaseModel):
    data: dict[str, Any]
    provider: str = "bailian-qwen"
    model: str
