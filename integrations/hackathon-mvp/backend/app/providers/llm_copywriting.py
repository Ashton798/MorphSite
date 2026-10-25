"""基于 OpenAI 兼容 Chat 接口的文案 Provider：使用用户选择的模型生成结构化文案。"""
import json
import re

from ..schemas import CopyResult
from ..services.llm_service import LLMError, ModelInfo, chat_completion
from .base import CopywritingProvider

_PROMPT = """你是资深宣传文案策划。请根据下面的信息，为商品生成宣传文案。

商品名称：{product}
活动描述：{desc}
宣传风格：{style}
宣传平台：{platform}

严格只输出一个 JSON 对象，不要输出其他文字，格式如下：
{{
  "main_title": "主标题（15 字以内）",
  "subtitle": "副标题（20 字以内）",
  "copies": ["宣传文案 1", "宣传文案 2", "宣传文案 3"],
  "video_caption": "短视频字幕（20 字以内）"
}}
要求：三条文案风格各异、符合「{style}」风格与「{platform}」平台调性，中文输出。"""


def _extract_json(text: str) -> dict:
    """兼容模型把 JSON 包在 ```json 代码块或前后带说明文字的情况。"""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("no json")
    return json.loads(m.group(0))


class LLMCopywritingProvider(CopywritingProvider):
    def __init__(self, model: ModelInfo) -> None:
        self.model = model

    async def generate_copy(
        self, product_name: str, description: str, style: str, platform: str
    ) -> CopyResult:
        prompt = _PROMPT.format(
            product=product_name, desc=description, style=style, platform=platform
        )
        text = await chat_completion(self.model, [{"role": "user", "content": prompt}])
        try:
            data = _extract_json(text)
            return CopyResult.model_validate(data)
        except (ValueError, KeyError, TypeError):
            # Never coerce objects/null to text or silently discard extra copies.
            raise LLMError("模型返回的文案格式不符合要求，请重试或更换模型") from None
