"""Provider 抽象接口：业务逻辑只依赖这些接口，不依赖具体 AI 平台。"""
from abc import ABC, abstractmethod
from pathlib import Path

from ..schemas import CopyResult


class CopywritingProvider(ABC):
    """文案生成：主标题、副标题、三条宣传文案、短视频字幕。"""

    @abstractmethod
    async def generate_copy(
        self, product_name: str, description: str, style: str, platform: str
    ) -> CopyResult: ...


class PosterProvider(ABC):
    """海报生成：输入商品原图与文案，输出海报图片文件路径。"""

    @abstractmethod
    async def generate_poster(
        self,
        source_image: Path,
        copy: CopyResult,
        style: str,
        output_path: Path,
    ) -> Path: ...


class VideoProvider(ABC):
    """视频生成：输入商品原图（可多张）、海报与文案，输出 MP4 文件路径。"""

    @abstractmethod
    async def generate_video(
        self,
        source_images: list[Path],
        poster_image: Path,
        copy: CopyResult,
        style: str,
        output_path: Path,
    ) -> Path: ...


class AudioProvider(ABC):
    """TTS 生成：输入旁白文本，输出可交给 FFmpeg 的音频文件。"""

    @abstractmethod
    async def generate_audio(self, text: str, output_path: Path) -> Path: ...


# Product-facing provider names. Compatibility aliases keep the existing
# marketing pipeline intact while exposing the requested four-layer contract.
class TextProvider(CopywritingProvider):
    pass


class ImageProvider(PosterProvider):
    pass


class TTSProvider(AudioProvider):
    pass
