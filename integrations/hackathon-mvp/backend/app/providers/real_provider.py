"""Marketing provider selection for copy, poster and video.

The selected copy model is never overridden by a global Google flag. Local
FFmpeg remains the explicit non-Veo fallback; existing providers stay usable.
"""
from ..config import settings
from .base import CopywritingProvider, PosterProvider, VideoProvider
from .google_genai_provider import (
    GoogleGeminiCopywritingProvider,
    GoogleGeminiPosterProvider,
    GoogleVeoVideoProvider,
)
from ..services.llm_service import is_bailian_model, is_google_model


class ProviderNotConfiguredError(RuntimeError):
    pass


def get_providers(
    model_id: str | None = None,
    poster_model: str | None = None,
    video_mode: str | None = None,
    brand_spec_json: str | None = None,
) -> tuple[CopywritingProvider, PosterProvider, VideoProvider]:
    from ..services.llm_service import get_model
    from .llm_copywriting import LLMCopywritingProvider
    from .mock_provider import MockCopywritingProvider, MockPosterProvider, MockVideoProvider
    from .image_provider import ImagePosterProvider

    model = get_model(model_id)
    if model is None:
        raise ProviderNotConfiguredError("所选文案模型不存在或已被移除，请重新选择")
    if not model.configured:
        raise ProviderNotConfiguredError(f"文案模型「{model.name}」尚未配置完整")
    if model.id == "brand-spec":
        from .brand_spec_provider import BrandSpecCopywritingProvider
        copy_provider = BrandSpecCopywritingProvider(brand_spec_json)
    elif is_google_model(model):
        copy_provider = GoogleGeminiCopywritingProvider()
    elif is_bailian_model(model):
        from .bailian_provider import BailianTextProvider
        copy_provider = BailianTextProvider()
    else:
        copy_provider = MockCopywritingProvider() if model.is_mock else LLMCopywritingProvider(model)
    if poster_model and poster_model.startswith("google:"):
        poster = GoogleGeminiPosterProvider(poster_model.removeprefix("google:"))
    elif poster_model:
        if not (settings.poster_api_key and settings.poster_base_url):
            raise ProviderNotConfiguredError("海报模型尚未配置完整，请补充后端图片模型配置")
        poster = ImagePosterProvider(poster_model)
    else:
        poster = MockPosterProvider()
    use_veo = video_mode == "google-veo"
    video = GoogleVeoVideoProvider() if use_veo else MockVideoProvider()
    return copy_provider, poster, video
