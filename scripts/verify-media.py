"""Real local poster + FFmpeg encode check. No HTTP or external AI."""
import json
import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "integrations/hackathon-mvp/backend"
sys.path.insert(0, str(BACKEND))
DEST = (ROOT / "test-results/coffee-acceptance").resolve()
DEST.mkdir(parents=True, exist_ok=True)
os.environ["GOOGLE_VIDEO_ENABLED"] = "false"

import tempfile
import uuid
def tempdir(suffix=None, prefix=None, dir=None):
    root = Path(dir or DEST).resolve()
    if not root.is_relative_to(DEST):
        root = DEST
    target = root / ((prefix or "tmp") + uuid.uuid4().hex + (suffix or ""))
    target.mkdir(mode=0o777)
    return str(target)
tempfile.mkdtemp = tempdir

from PIL import Image, ImageDraw, ImageFont
from app.config import settings
from app.schemas import CopyResult
from app.providers.mock_provider import MockPosterProvider
from app.services.ffmpeg_service import FFmpegService

photo = DEST / "coffee-product.png"
im = Image.new("RGB", (900, 1000), (234, 218, 193))
draw = ImageDraw.Draw(im)
draw.ellipse((210, 240, 730, 780), fill=(60, 38, 27))
draw.ellipse((250, 275, 690, 695), fill=(218, 173, 104))
draw.ellipse((290, 315, 650, 655), fill=(65, 35, 20))
font = ImageFont.truetype(settings.font_path, 38)
draw.text((145, 850), "咖啡产品测试图 · 非 AI 摄影", font=font, fill=(65, 35, 20))
im.save(photo)
copy = CopyResult(main_title="周末，来喝一杯。", subtitle="手冲咖啡与一个安静的下午",
    copies=["本地验收文案一", "本地验收文案二", "本地验收文案三"], video_caption="周末，来喝一杯。")
poster = DEST / "coffee-poster.png"
MockPosterProvider()._render(photo, copy, "简约高级", poster)
assert Image.open(poster).size == (1080, 1440)
video = DEST / "coffee-video.mp4"
FFmpegService().compose_promo_video_sync([photo], poster, copy.video_caption, video)
assert b"ftyp" in video.read_bytes()[:32]
# Ask the actual installed FFmpeg to decode the complete generated video.
import subprocess
decoded = subprocess.run([settings.ffmpeg_path, "-v", "error", "-i", str(video), "-f", "null", "-"], capture_output=True, timeout=60)
assert decoded.returncode == 0, decoded.stderr.decode(errors="replace")
report = {"poster": {"ok": True, "provider": "local-pillow", "size": [1080,1440]}, "video": {"ok": True, "provider": "local-ffmpeg", "bytes": video.stat().st_size, "full_decode": True}, "paid_calls": 0, "browser_playback_verified": False}
(DEST / "result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2), flush=True)
print("PNG and fully decodable MP4 saved in test-results/coffee-acceptance", flush=True)
