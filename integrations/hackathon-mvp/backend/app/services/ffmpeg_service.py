"""FFmpegService：将商品图（可多张轮播）+ 海报 + 字幕合成 8~12 秒宣传短视频（1080x1440 MP4）。

流程：商品图逐张淡入淡出轮播（带字幕）→ 海报收尾 → 整体淡出。

说明：字幕使用 Pillow 预先绘制到帧图片上，而不是 FFmpeg drawtext 滤镜，
因为部分 FFmpeg 发行版（如 Homebrew 新版）未编译 drawtext/freetype。
"""
import asyncio
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from ..config import settings


class FFmpegNotFoundError(RuntimeError):
    pass


class FFmpegError(RuntimeError):
    pass


XFADE = 0.8  # 转场时长（秒）
W, H = 1080, 1440


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(settings.font_path, size)
    except OSError:
        return ImageFont.load_default(size)


def _render_frame(image_path: Path, caption: str | None, out_path: Path) -> None:
    """将素材图等比缩放到 1080x1440 黑底画布；可选叠加底部字幕条。"""
    canvas = Image.new("RGB", (W, H), (0, 0, 0))
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((W, H))
    canvas.paste(img, ((W - img.width) // 2, (H - img.height) // 2))

    if caption:
        draw = ImageDraw.Draw(canvas, "RGBA")
        size = 58
        font = _load_font(size)
        while draw.textlength(caption, font=font) > W - 120 and size > 24:
            size -= 4
            font = _load_font(size)
        tw = draw.textlength(caption, font=font)
        ty = H - 220
        draw.rectangle(
            [(int((W - tw) / 2) - 24, ty - 18), (int((W + tw) / 2) + 24, ty + size + 18)],
            fill=(0, 0, 0, 115),
        )
        draw.text(((W - tw) / 2, ty), caption, font=font, fill=(255, 255, 255))

    canvas.save(out_path, "PNG")


class FFmpegService:
    def __init__(self) -> None:
        self.ffmpeg = settings.ffmpeg_path

    async def add_voiceover(self, video_path: Path, audio_path: Path) -> Path:
        return await asyncio.to_thread(self.add_voiceover_sync, video_path, audio_path)

    def add_voiceover_sync(self, video_path: Path, audio_path: Path) -> Path:
        """Mux a standalone TTS WAV into an existing MP4 without altering its video.

        Replace only after FFmpeg succeeds, so a failed mux preserves both the
        original video and the separately downloadable audio asset.
        """
        self.ensure_available()
        with tempfile.NamedTemporaryFile(suffix=".mp4", dir=video_path.parent, delete=False) as tmp:
            candidate = Path(tmp.name)
        try:
            proc = subprocess.run([
                self.ffmpeg, "-v", "error", "-y", "-i", str(video_path), "-i", str(audio_path),
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                "-af", "apad", "-shortest", "-movflags", "+faststart", str(candidate),
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, check=False)
            if proc.returncode != 0 or candidate.stat().st_size == 0:
                raise FFmpegError("AI 配音合成失败；原视频和独立配音仍可下载")
            os.replace(candidate, video_path)
            return video_path
        finally:
            candidate.unlink(missing_ok=True)

    def ensure_available(self) -> None:
        if not shutil.which(self.ffmpeg):
            raise FFmpegNotFoundError(
                "未找到 FFmpeg：请先安装 FFmpeg（macOS 执行 brew install ffmpeg），"
                "或在 backend/.env 中通过 FFMPEG_PATH 指定其路径"
            )

    async def compose_promo_video(
        self,
        source_images: list[Path],
        poster_image: Path,
        caption: str,
        output_path: Path,
    ) -> Path:
        return await asyncio.to_thread(self.compose_promo_video_sync, source_images, poster_image, caption, output_path)

    def compose_promo_video_sync(
        self, source_images: list[Path], poster_image: Path, caption: str, output_path: Path,
    ) -> Path:
        """商品图轮播与海报收尾；编码最多运行 120 秒。"""
        self.ensure_available()
        if not source_images:
            raise FFmpegError("视频合成失败：缺少商品图片")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(dir=output_path.parent) as tmp:
            tmpdir = Path(tmp)
            # 预渲染所有帧：商品图带字幕，海报收尾不带
            frames: list[Path] = []
            for i, src in enumerate(source_images):
                frame = tmpdir / f"frame_{i}.png"
                _render_frame(src, caption, frame)
                frames.append(frame)
            poster_frame = tmpdir / "frame_poster.png"
            _render_frame(poster_image, None, poster_frame)
            frames.append(poster_frame)

            n = len(frames)
            # 总时长 8~12 秒：2 段 10s；每多一张图 +1s，封顶 12s
            duration = 5.0
            # xfade 链：总时长 = n*seg - (n-1)*XFADE
            seg = (duration + (n - 1) * XFADE) / n

            inputs: list[str] = []
            for frame in frames:
                inputs += ["-loop", "1", "-t", f"{seg:.3f}", "-i", str(frame)]

            parts = [f"[{i}:v]setsar=1,fps=30[s{i}];" for i in range(n)]
            prev = "s0"
            for k in range(1, n):
                out = f"x{k}"
                offset = k * (seg - XFADE)
                parts.append(
                    f"[{prev}][s{k}]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}[{out}];"
                )
                prev = out
            parts.append(
                f"[{prev}]fade=t=in:st=0:d=0.6,"
                f"fade=t=out:st={duration - 0.6:.3f}:d=0.6,format=yuv420p[v]"
            )
            filter_complex = "".join(parts)

            cmd = [
                self.ffmpeg, "-y",
                *inputs,
                "-filter_complex", filter_complex,
                "-map", "[v]",
                "-t", f"{duration:.3f}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-movflags", "+faststart",
                str(output_path),
            ]
            try:
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=False)
            except subprocess.TimeoutExpired:
                raise FFmpegError("FFmpeg 合成超过 120 秒，任务已停止。") from None
            if proc.returncode != 0:
                tail = proc.stderr.decode(errors="replace")[-500:]
                raise FFmpegError(f"视频合成失败（FFmpeg 返回错误）：{tail}")

        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise FFmpegError("视频合成失败：输出文件为空")
        return output_path
