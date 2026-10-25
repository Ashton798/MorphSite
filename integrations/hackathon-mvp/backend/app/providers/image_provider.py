"""通过 OpenAI 兼容的图片编辑接口，用商品原图生成宣传海报。"""
import asyncio
import base64
import binascii
import io
import json
import warnings
from pathlib import Path

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from ..config import settings
from ..schemas import CopyResult
from .base import PosterProvider

MAX_RESPONSE_BYTES = 40 * 1024 * 1024


class ImageProviderError(RuntimeError):
    pass


def _source_png(path: Path) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as original:
                picture = ImageOps.exif_transpose(original).convert("RGB")
                picture.thumbnail((2048, 2048))
                output = io.BytesIO()
                picture.save(output, format="PNG")
                return output.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageProviderError("商品图片无法读取，请重新上传有效图片") from None


def _save_png(raw: bytes, destination: Path) -> None:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as picture:
                picture.load()
                destination.parent.mkdir(parents=True, exist_ok=True)
                picture.convert("RGB").save(destination, format="PNG")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageProviderError("图片模型返回的内容不是有效图片，请重试") from None


class ImagePosterProvider(PosterProvider):
    def __init__(self, model: str):
        self.model = model

    async def generate_poster(self, source_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        if not (settings.poster_base_url and settings.poster_api_key and self.model):
            raise ImageProviderError("图片模型尚未配置完整")
        source = await asyncio.to_thread(_source_png, source_image)
        campaign = "\n".join(item.replace("【Mock 示例】", "") for item in copy.copies)
        prompt = (
            "请根据参考商品图片制作一张竖版中文商品宣传海报。"
            "忠实保留商品的外观、包装、颜色和标识，不要替换商品。"
            "中文排版清晰、构图专业，商品为视觉中心。"
            "只使用以下资料中的信息，不要额外编造价格、折扣、认证或功效。"
            "不要出现 Mock、示例、测试或水印字样。\n"
            f"风格：{style}\n主标题：{copy.main_title}\n副标题：{copy.subtitle}\n"
            f"宣传信息（用于参考，不必全部放入画面）：\n{campaign}"
        )
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=20), follow_redirects=False) as client:
                async with client.stream(
                    "POST", settings.poster_base_url.rstrip("/") + "/images/edits",
                    headers={"Authorization": f"Bearer {settings.poster_api_key}"},
                    data={"model": self.model, "prompt": prompt, "n": "1",
                          "size": settings.poster_size, "response_format": "b64_json"},
                    files={"image": ("product.png", source, "image/png")},
                ) as response:
                    if response.status_code in (401, 403):
                        raise ImageProviderError("图片模型拒绝访问，请检查 API Key 或模型权限")
                    if response.status_code == 429:
                        raise ImageProviderError("图片模型额度不足或请求频繁，请稍后重试")
                    if not response.is_success:
                        raise ImageProviderError(f"图片模型调用失败（HTTP {response.status_code}），请检查模型名与接口配置")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE_BYTES:
                            raise ImageProviderError("图片模型返回内容过大，请调低生成尺寸")
        except httpx.TimeoutException:
            raise ImageProviderError("图片模型生成超时，请先确认服务端结果与用量，再决定是否重试") from None
        except (httpx.HTTPError, httpx.InvalidURL, ValueError):
            raise ImageProviderError("无法连接图片模型服务，请检查接口地址与网络") from None

        try:
            encoded = json.loads(body)["data"][0]["b64_json"]
            if not isinstance(encoded, str) or not encoded:
                raise ValueError("empty image")
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, KeyError, IndexError, TypeError, binascii.Error):
            raise ImageProviderError("图片接口未返回有效的 b64_json 图片，请确认服务兼容图片编辑接口") from None
        await asyncio.to_thread(_save_png, raw, output_path)
        return output_path
