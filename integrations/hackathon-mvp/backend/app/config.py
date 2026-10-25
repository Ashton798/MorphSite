"""应用配置：全部从环境变量 / .env 读取，API Key 绝不进入前端。"""
import shutil
import sys
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR / ".env.volcengine.local", BACKEND_DIR / ".env.openai-next.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 基础
    mock_mode: bool = True
    database_url: str = "sqlite:///./data/promo.db"
    upload_dir: str = "../uploads"
    output_dir: str = "../outputs"
    max_upload_mb: int = 10
    ffmpeg_path: str = "ffmpeg"
    font_path: str = (
        "C:/Windows/Fonts/msyh.ttc"
        if sys.platform == "win32"
        else "/System/Library/Fonts/Hiragino Sans GB.ttc"
    )

    # 兼容现有 OpenAI-compatible providers（只在后端使用）
    copywriting_api_key: str = ""
    copywriting_base_url: str = ""
    copywriting_model: str = ""
    llm_models_file: str = "models.json"
    poster_mode: Literal["local", "ai"] = "local"
    poster_model: str = ""
    poster_size: str = "1024x1536"
    poster_api_key: str = ""
    poster_base_url: str = ""
    video_api_key: str = ""
    video_base_url: str = ""

    # Google AI Studio / Gemini Developer API（仅后端读取，默认关闭）
    google_api_key: str = ""
    # google-genai 会自动拼接 api_version；允许旧 .env 写 /v1beta，provider 会规范化。
    google_api_base_url: str = "https://generativelanguage.googleapis.com"
    google_api_version: str = "v1beta"
    google_text_model: str = "gemini-2.5-flash"
    google_image_model: str = "gemini-2.5-flash-image"
    google_video_model: str = "veo-3.1-generate-preview"
    google_tts_model: str = "gemini-2.5-flash-preview-tts"
    google_text_enabled: bool = False
    google_text_cost_approved: bool = False
    google_image_enabled: bool = False
    google_image_cost_approved: bool = False
    google_video_enabled: bool = False
    google_video_cost_approved: bool = False
    google_tts_enabled: bool = False
    google_tts_cost_approved: bool = False
    google_sdk_timeout_seconds: int = 180
    google_video_timeout_seconds: int = 480
    google_video_duration_seconds: int = 8
    google_video_max_cost_usd: float = 1.0
    google_poll_seconds: float = 10.0
    google_tts_voice: str = "Aoede"
    google_tts_language: str = "zh-CN"
    max_tts_chars: int = 4000

    # Volcengine Ark credentials are loaded only by the backend.
    ark_api_key: str = ""
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_image_model: str = ""
    ark_video_model: str = ""
    ark_video_duration_seconds: int = 5
    openai_next_api_key: str = ""
    openai_next_base_url: str = ""
    openai_next_video_model: str = ""

    # Alibaba Cloud Model Studio (Bailian). Key prefixes alone do not identify
    # purpose; the server-side key kind must explicitly be "application".
    dashscope_api_key: str = ""
    dashscope_api_key_kind: Literal["application", "coding_plan"] = "application"
    dashscope_workspace_id: str = ""
    dashscope_region: Literal["cn-beijing", "ap-southeast-1", "cn-hongkong"] = "cn-beijing"
    dashscope_base_url: str = ""
    bailian_text_model: str = "qwen3.8-flash"
    bailian_image_model: str = "wan2.7-image"
    bailian_i2v_model: str = "wan2.7-i2v"
    bailian_t2v_model: str = "wan2.7-t2v"
    bailian_tts_model: str = "qwen-audio-3.1-tts-flash"
    bailian_tts_voice: str = "longanhuan_v3.1"
    bailian_text_enabled: bool = True
    bailian_image_enabled: bool = True
    bailian_video_enabled: bool = True
    bailian_tts_enabled: bool = True
    bailian_text_cost_approved: bool = False
    bailian_image_cost_approved: bool = False
    bailian_video_cost_approved: bool = False
    bailian_tts_cost_approved: bool = False
    bailian_timeout_seconds: int = 120
    bailian_video_duration_seconds: int = 5
    bailian_video_resolution: Literal["720P", "1080P"] = "720P"

    @property
    def bailian_key_is_application_key(self) -> bool:
        # Key prefixes are not a reliable discriminator: current workspace-scoped
        # application keys may also use an sk-ws prefix. Keep the declared key
        # purpose server-side and let the provider verify it with one bounded call.
        return bool(self.dashscope_api_key and self.dashscope_api_key_kind == "application")

    @property
    def bailian_credentials_configured(self) -> bool:
        return bool(self.bailian_key_is_application_key and self.dashscope_workspace_id)

    @property
    def bailian_http_base_url(self) -> str:
        return (self.dashscope_base_url.strip().rstrip("/") or f"https://{self.dashscope_workspace_id}.{self.dashscope_region}.maas.aliyuncs.com/api/v1")

    @property
    def bailian_text_configured(self) -> bool:
        return bool(self.bailian_text_enabled and self.bailian_text_cost_approved and self.bailian_credentials_configured and self.bailian_text_model)

    @property
    def bailian_image_configured(self) -> bool:
        return bool(self.bailian_image_enabled and self.bailian_image_cost_approved and self.bailian_credentials_configured and self.bailian_image_model)

    @property
    def bailian_video_configured(self) -> bool:
        return bool(self.bailian_video_enabled and self.bailian_video_cost_approved and self.bailian_credentials_configured and self.bailian_i2v_model and self.bailian_t2v_model)

    @property
    def bailian_tts_configured(self) -> bool:
        return bool(self.bailian_tts_enabled and self.bailian_tts_cost_approved and self.bailian_credentials_configured and self.bailian_tts_model)

    @property
    def google_text_configured(self) -> bool:
        return bool(self.google_text_enabled and self.google_text_cost_approved and self.google_api_key and self.google_text_model)

    @property
    def google_image_configured(self) -> bool:
        return bool(self.google_image_enabled and self.google_image_cost_approved and self.google_api_key and self.google_image_model)

    @property
    def google_video_configured(self) -> bool:
        return bool(self.google_video_enabled and self.google_video_cost_approved and self.google_api_key and self.google_video_model)

    @property
    def google_tts_configured(self) -> bool:
        return bool(self.google_tts_enabled and self.google_tts_cost_approved and self.google_api_key and self.google_tts_model)

    @property
    def ffmpeg_available(self) -> bool:
        return bool(shutil.which(self.ffmpeg_path))

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (BACKEND_DIR / path).resolve()

    @property
    def output_path(self) -> Path:
        path = Path(self.output_dir)
        return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


settings = Settings()
