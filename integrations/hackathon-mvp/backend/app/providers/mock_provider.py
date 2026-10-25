"""Mock Provider：不调用任何外部 AI API。

- 文案：按风格/平台返回本地示例文案（模板填充，非 AI 生成）
- 海报：基于上传原图 + Pillow 绘制简单模板
- 视频：交给 FFmpegService 合成基础短视频

⚠️ 这是 Mock 模式，所有产出均为本地模板生成，不是真实 AI 结果。
"""
import asyncio
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from ..config import settings
from ..schemas import CopyResult
from .base import CopywritingProvider, PosterProvider, VideoProvider

# ---------- 示例文案库（按风格区分） ----------

_COPY_TEMPLATES: dict[str, dict] = {
    "温暖手作": {
        "main_title": "{product}",
        "subtitle": "每一份，都是手心的温度",
        "copies": [
            "【Mock 示例】{product}，用心手作，只为留住最初的味道。{desc}，等你来感受这份温暖。",
            "【Mock 示例】慢工出细活，{product} 的每一个细节都藏着心意。{desc}，快来体验吧！",
            "【Mock 示例】生活需要一点温度，{product} 刚刚好。{desc}，期待与你相遇。",
        ],
        "video_caption": "{product} · 手作的温度",
    },
    "简约高级": {
        "main_title": "{product}",
        "subtitle": "少即是多，质感生活",
        "copies": [
            "【Mock 示例】{product}，简约设计，高级质感。{desc}，为懂生活的你准备。",
            "【Mock 示例】删繁就简，只留精华。{product} 重新定义你的品质日常。{desc}。",
            "【Mock 示例】真正的高级，是恰到好处。{product}，{desc}，值得拥有。",
        ],
        "video_caption": "{product} · 简约而不简单",
    },
    "活泼促销": {
        "main_title": "{product}",
        "subtitle": "限时钜惠，错过再等一年！",
        "copies": [
            "【Mock 示例】🎉 重磅来袭！{product} 限时特惠！{desc}，手慢无，快来抢购！",
            "【Mock 示例】💥 全场狂欢！{product} 超值优惠进行中！{desc}，心动不如行动！",
            "【Mock 示例】🔥 爆款推荐！{product} 人气飙升！{desc}，现在入手最划算！",
        ],
        "video_caption": "{product} · 限时特惠中",
    },
}

# 风格对应的海报配色（背景渐变起止色、强调色）
_STYLE_COLORS: dict[str, dict] = {
    "温暖手作": {"top": (62, 39, 35), "bottom": (121, 85, 72), "accent": (255, 204, 128)},
    "简约高级": {"top": (33, 33, 33), "bottom": (66, 66, 66), "accent": (224, 224, 224)},
    "活泼促销": {"top": (183, 28, 28), "bottom": (255, 111, 0), "accent": (255, 235, 59)},
}
_DEFAULT_COLORS = _STYLE_COLORS["简约高级"]


class MockCopywritingProvider(CopywritingProvider):
    async def generate_copy(
        self, product_name: str, description: str, style: str, platform: str
    ) -> CopyResult:
        await asyncio.sleep(1.0)  # 模拟 API 耗时，便于演示进度
        tpl = _COPY_TEMPLATES.get(style, _COPY_TEMPLATES["简约高级"])
        fmt = {"product": product_name, "desc": description}
        return CopyResult(
            main_title=tpl["main_title"].format(**fmt),
            subtitle=tpl["subtitle"].format(**fmt),
            copies=[c.format(**fmt) for c in tpl["copies"]],
            video_caption=tpl["video_caption"].format(**fmt),
        )


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(settings.font_path, size)
    except OSError:
        return ImageFont.load_default(size)


def _fit_text(draw: ImageDraw.ImageDraw, text: str, font_size: int, max_width: int) -> ImageFont.FreeTypeFont:
    """缩小字号直到文本宽度不超过 max_width。"""
    size = font_size
    while size > 16:
        font = _load_font(size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 4
    return _load_font(16)


class MockPosterProvider(PosterProvider):
    """用 Pillow 基于原图绘制模板海报（1080x1440 竖版）。"""

    W, H = 1080, 1440

    async def generate_poster(
        self, source_image: Path, copy: CopyResult, style: str, output_path: Path
    ) -> Path:
        return await asyncio.to_thread(
            self._render, source_image, copy, style, output_path
        )

    def _render(self, source_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        colors = _STYLE_COLORS.get(style, _DEFAULT_COLORS)
        poster = Image.new("RGB", (self.W, self.H))
        # 垂直渐变背景
        top, bottom = colors["top"], colors["bottom"]
        for y in range(self.H):
            t = y / self.H
            row = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
            poster.paste(Image.new("RGB", (self.W, 1), row), (0, y))

        # 商品图：等比缩放放入中部圆角卡片
        product = Image.open(source_image).convert("RGB")
        card_w, card_h = 880, 760
        product.thumbnail((card_w, card_h))
        # 卡片底（带阴影感的模糊底）
        shadow = Image.new("RGB", (product.width + 40, product.height + 40), (0, 0, 0))
        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
        sx = (self.W - shadow.width) // 2
        sy = 300
        poster.paste(shadow, (sx, sy + 12))
        px = (self.W - product.width) // 2
        py = sy + 20
        poster.paste(product, (px, py))

        draw = ImageDraw.Draw(poster)

        # 主标题
        title_font = _fit_text(draw, copy.main_title, 110, self.W - 160)
        tw = draw.textlength(copy.main_title, font=title_font)
        draw.text(((self.W - tw) / 2, 110), copy.main_title, font=title_font, fill=(255, 255, 255))

        # 副标题
        sub_font = _fit_text(draw, copy.subtitle, 52, self.W - 200)
        sw = draw.textlength(copy.subtitle, font=sub_font)
        draw.text(((self.W - sw) / 2, 240), copy.subtitle, font=sub_font, fill=colors["accent"])

        # 底部装饰条 + 字幕
        draw.rectangle([(0, self.H - 220), (self.W, self.H)], fill=tuple(max(0, c - 20) for c in top))
        cap_font = _fit_text(draw, copy.video_caption, 44, self.W - 200)
        cw = draw.textlength(copy.video_caption, font=cap_font)
        draw.text(((self.W - cw) / 2, self.H - 160), copy.video_caption, font=cap_font, fill=(255, 255, 255))

        # Mock 模式水印：明确标注非真实 AI 生成
        mark = "本地排版 · 使用产品原图"
        mark_font = _load_font(30)
        mw = draw.textlength(mark, font=mark_font)
        draw.text((self.W - mw - 30, self.H - 60), mark, font=mark_font, fill=(255, 255, 255, 128))

        output_path.parent.mkdir(parents=True, exist_ok=True)
        poster.save(output_path, "PNG")
        return output_path


class MockVideoProvider(VideoProvider):
    """Mock 视频：用 FFmpeg 将多张原图轮播 + 海报 + 字幕合成 10 秒 MP4。"""

    async def generate_video(
        self, source_images: list[Path], poster_image: Path, copy: CopyResult, style: str, output_path: Path
    ) -> Path:
        from ..services.ffmpeg_service import FFmpegService

        return await FFmpegService().compose_promo_video(
            source_images=source_images,
            poster_image=poster_image,
            caption=copy.video_caption,
            output_path=output_path,
        )
