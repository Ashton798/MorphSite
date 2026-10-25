"""Offline smoke path: VOID COFFEE project → mock/local marketing material →
SQLite records → downloadable PNG/MP4. No provider requests are made.
"""
import io
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_sandbox = tempfile.TemporaryDirectory(prefix="morphsite-void-acceptance-")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_sandbox.name}/void.db",
    "UPLOAD_DIR": f"{_sandbox.name}/uploads",
    "OUTPUT_DIR": f"{_sandbox.name}/outputs",
    "MOCK_MODE": "true",
    "POSTER_MODE": "local",
    "GOOGLE_TEXT_ENABLED": "false",
    "GOOGLE_IMAGE_ENABLED": "false",
    "GOOGLE_VIDEO_ENABLED": "false",
    "GOOGLE_TTS_ENABLED": "false",
    "GOOGLE_API_KEY": "",
})

from fastapi.testclient import TestClient
from PIL import Image
from app.main import app


def main() -> None:
    photo = io.BytesIO()
    Image.new("RGB", (720, 960), (30, 25, 28)).save(photo, format="PNG")
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        response = client.post("/api/generations", data={
            "product_name": "VOID COFFEE 午夜拼配",
            "description": "为独立咖啡品牌制作夜间新品推广素材，不虚构价格。",
            "style": "简约高级",
            "platform": "朋友圈",
            "model_id": "mock",
        }, files={"images": ("void-coffee.png", photo.getvalue(), "image/png")})
        assert response.status_code == 200, response.text
        ids = response.json()
        assert ids["project_id"] and ids["task_id"]
        result = client.get(f"/api/generations/{ids['task_id']}").json()
        assert result["status"] == "completed", result
        assert result["copy_provider"] == "mock"
        assert result["poster_provider"] == "local-template"
        assert result["video_provider"] == "local-ffmpeg"
        assert len(result["copy_text"]) == 3
        assert client.get(result["poster_url"]).headers["content-type"].startswith("image/png")
        assert client.get(result["video_url"]).headers["content-type"].startswith("video/mp4")
        outputs = client.get(f"/api/projects/{ids['project_id']}/outputs").json()
        assert {item["kind"] for item in outputs} == {"copy", "poster", "video"}, outputs
        assert all("path" not in item for item in outputs)
        print("VOID COFFEE offline acceptance: PASS")
        print("project/task records: PASS")
        print("copy: mock (non-AI); poster: local template; video: local FFmpeg")
        print("PNG/MP4 downloads: PASS")
        print("Google text/image/video/TTS: NOT CALLED (no rotated key)")
    from app.database import engine
    engine.dispose()
    _sandbox.cleanup()


if __name__ == "__main__":
    main()
