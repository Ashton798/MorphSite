"""LLM 服务：模型注册表 + OpenAI 兼容的 Chat Completions 调用。

模型来源（均在后端配置，API Key 绝不下发到前端）：
1. 内置 Mock 模型（id=mock）：本地示例回复，非真实 AI
2. 默认模型（id=default）：由 COPYWRITING_BASE_URL / COPYWRITING_API_KEY / COPYWRITING_MODEL 组成
3. 自定义模型：backend/models.json 中的条目，密钥通过 api_key_env 指向 .env 里的变量名

注册表每次请求时重新读取，修改 models.json / .env 后无需重启。
"""
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from dotenv import dotenv_values

from ..config import BACKEND_DIR, settings

logger = logging.getLogger(__name__)

MOCK_MODEL_ID = "mock"
DEFAULT_MODEL_ID = "default"
GOOGLE_MODEL_ID = "google-gemini"
BAILIAN_MODEL_ID = "bailian-qwen"
_RESERVED_IDS = {MOCK_MODEL_ID, DEFAULT_MODEL_ID, GOOGLE_MODEL_ID, BAILIAN_MODEL_ID, "brand-spec"}
MAX_REPLY_CHARS = 16000


class LLMError(RuntimeError):
    """模型调用失败，message 为面向用户的中文提示。"""


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str
    base_url: str = field(default="", repr=False)
    api_key: str = field(default="", repr=False)
    model: str = ""
    is_mock: bool = False

    @property
    def configured(self) -> bool:
        return self.is_mock or bool(self.base_url and self.api_key and self.model)


def _read_env(name: str) -> str:
    """优先读进程环境变量，其次读 backend/.env。"""
    if not name:
        return ""
    # An explicitly empty process variable must disable, not resurrect, a file key.
    if name in os.environ:
        return os.environ[name].strip()
    return (dotenv_values(BACKEND_DIR / ".env").get(name) or "").strip()


def list_models() -> list[ModelInfo]:
    models = [ModelInfo(id=MOCK_MODEL_ID, name="Mock 模型（本地示例，非真实 AI）", is_mock=True), ModelInfo(id="brand-spec", name="当前网站文案（本地，无 API）", base_url="local", api_key="unused", model="brand-spec")]

    if settings.google_text_configured:
        models.append(
            ModelInfo(
                id=GOOGLE_MODEL_ID,
                name=f"Google Gemini（{settings.google_text_model}）",
                base_url="google-genai",
                api_key="configured",
                model=settings.google_text_model,
            )
        )

    if settings.bailian_text_configured:
        models.append(
            ModelInfo(
                id=BAILIAN_MODEL_ID,
                name=f"阿里云百炼（{settings.bailian_text_model}）",
                base_url=settings.bailian_http_base_url,
                api_key="configured",
                model=settings.bailian_text_model,
            )
        )

    base_url = _read_env("COPYWRITING_BASE_URL")
    api_key = _read_env("COPYWRITING_API_KEY")
    model_name = _read_env("COPYWRITING_MODEL")
    if base_url or api_key or model_name:
        models.append(
            ModelInfo(
                id=DEFAULT_MODEL_ID,
                name=f"默认模型（{model_name or '未设置模型名'}）",
                base_url=base_url,
                api_key=api_key,
                model=model_name,
            )
        )

    path = Path(_read_env("LLM_MODELS_FILE") or settings.llm_models_file)
    if not path.is_absolute():
        path = BACKEND_DIR / path
    if path.is_file():
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.warning("自定义模型清单解析失败，请检查文件格式与权限")
            entries = []
        seen = {m.id for m in models}
        for e in entries if isinstance(entries, list) else []:
            if not isinstance(e, dict):
                continue
            mid = e.get("id", "")
            if not isinstance(mid, str) or not mid.strip() or len(mid.strip()) > 100:
                continue
            mid = mid.strip()
            if mid in _RESERVED_IDS or mid in seen:
                continue
            # Malformed configuration must not become truthy strings such as "None".
            fields = {key: e.get(key, "") for key in ("name", "base_url", "api_key_env", "model")}
            if any(not isinstance(value, str) for value in fields.values()):
                continue
            seen.add(mid)
            models.append(
                ModelInfo(
                    id=mid,
                    name=fields["name"].strip() or mid,
                    base_url=fields["base_url"].strip(),
                    api_key=_read_env(fields["api_key_env"].strip()),
                    model=fields["model"].strip(),
                )
            )
    return models


def get_model(model_id: str | None) -> ModelInfo | None:
    wanted = model_id or MOCK_MODEL_ID
    return next((m for m in list_models() if m.id == wanted), None)


def is_google_model(model: ModelInfo | None) -> bool:
    return bool(model and model.id == GOOGLE_MODEL_ID)


def is_bailian_model(model: ModelInfo | None) -> bool:
    return bool(model and model.id == BAILIAN_MODEL_ID)


async def chat_completion(
    model: ModelInfo, messages: list[dict], temperature: float = 0.7
) -> str:
    """调用 OpenAI 兼容的 /chat/completions，返回助手文本。"""
    if not model.configured:
        raise LLMError(f"模型「{model.name}」未配置完整：请在后端填写 BASE_URL、API Key 和模型名")

    url = model.base_url.rstrip("/") + "/chat/completions"
    payload = {"model": model.model, "messages": messages, "temperature": temperature}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url, json=payload, headers={"Authorization": f"Bearer {model.api_key}"}
            )
    except httpx.TimeoutException:
        raise LLMError("模型调用超时，请稍后重试") from None
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        raise LLMError("无法连接模型服务：请检查 BASE_URL 配置与网络") from None

    if resp.status_code in (401, 403):
        raise LLMError("模型服务拒绝访问：请检查 API Key 是否正确")
    if resp.status_code == 429:
        raise LLMError("模型服务请求过于频繁或额度不足，请稍后重试")
    if not resp.is_success:
        # Upstream bodies/URLs may echo credentials. Log status only, never raw text.
        logger.error("模型服务错误 HTTP %s", resp.status_code)
        raise LLMError(f"模型服务返回错误（HTTP {resp.status_code}）")

    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise LLMError("模型返回格式无法解析：请确认该接口兼容 OpenAI Chat Completions") from None
    if not isinstance(content, str) or not content.strip():
        raise LLMError("模型返回了空内容，请重试")
    content = content.strip()
    if len(content) > MAX_REPLY_CHARS:
        raise LLMError("模型返回内容过长，请要求更简短的回答后重试")
    return content


def mock_chat_reply(user_text: str) -> str:
    """Mock 模型的本地示例回复（非真实 AI）。"""
    snippet = user_text.strip().replace("\n", " ")[:30]
    return (
        f"【Mock 模型示例回复，非真实 AI】已收到：「{snippet}」。\n"
        "建议的活动描述写法：突出一个核心卖点 + 一个限时优惠 + 一句行动号召，"
        "例如「秋季新品上市，前100名下单立减20元，数量有限先到先得」。"
    )
