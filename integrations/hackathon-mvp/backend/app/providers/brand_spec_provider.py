"""Use existing validated site copy for local marketing; this is not an AI model."""
import json
from ..schemas import CopyResult
from ..services.llm_service import LLMError
from .base import CopywritingProvider

class BrandSpecCopywritingProvider(CopywritingProvider):
    def __init__(self, spec_json: str | None):
        try:
            self.spec = json.loads(spec_json or "")
            if not isinstance(self.spec, dict) or not isinstance(self.spec.get("website"), dict):
                raise ValueError()
        except (TypeError, ValueError):
            raise LLMError("使用当前网站文案需要有效 BrandSpec，请先生成网站。") from None

    async def generate_copy(self, product_name: str, description: str, style: str, platform: str) -> CopyResult:
        spec = self.spec
        try:
            website = spec["website"]
            title = str(website["title"]).strip()
            subtitle = str(website["subtitle"]).strip()
            copies = [str(section["body"]).strip() for section in website.get("sections", []) if isinstance(section, dict) and isinstance(section.get("body"), str) and section["body"].strip()]
            while len(copies) < 3:
                copies.append(subtitle)
            return CopyResult(main_title=title[:120], subtitle=subtitle[:200], copies=copies[:3], video_caption=title[:80])
        except (KeyError, TypeError, ValueError):
            raise LLMError("BrandSpec 文案不完整，无法进行本地素材排版。") from None
