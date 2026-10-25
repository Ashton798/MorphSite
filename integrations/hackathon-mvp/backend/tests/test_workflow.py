"""本地回归测试：隔离数据库和文件，不调用外部模型。"""
import importlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

_sandbox = tempfile.TemporaryDirectory(prefix="promo-tests-")
os.environ.update(
    DATABASE_URL=f"sqlite:///{_sandbox.name}/test.db",
    UPLOAD_DIR=f"{_sandbox.name}/uploads",
    OUTPUT_DIR=f"{_sandbox.name}/outputs",
    MOCK_MODE="true",
    POSTER_MODE="local",
    POSTER_API_KEY="",
    POSTER_BASE_URL="",
    POSTER_MODEL="",
    COPYWRITING_API_KEY="",
    COPYWRITING_BASE_URL="",
    COPYWRITING_MODEL="",
    LLM_MODELS_FILE=f"{_sandbox.name}/models.json",
    GOOGLE_TEXT_ENABLED="false",
    GOOGLE_IMAGE_ENABLED="false",
    GOOGLE_VIDEO_ENABLED="false",
    GOOGLE_TTS_ENABLED="false",
)

from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.services.llm_service import ModelInfo

chat_route = importlib.import_module("app.routes.chat")


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        from app.database import engine
        engine.dispose()
        _sandbox.cleanup()

    def test_models_and_mock_chat(self):
        response = self.client.get("/api/models")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["id"], "mock")
        self.assertNotIn("api_key", response.text)
        response = self.client.post("/api/chat", json={
            "model_id": "mock", "messages": [{"role": "user", "content": "帮我润色"}],
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_mock"])

    def test_description_reaches_model(self):
        model = ModelInfo(id="test", name="Test", base_url="https://example.invalid", api_key="test", model="test")
        completion = AsyncMock(return_value="活动描述：秋季新品")
        with patch.object(chat_route, "get_model", return_value=model), patch.object(chat_route, "chat_completion", completion):
            response = self.client.post("/api/chat", json={
                "model_id": "test", "product_name": "桂花乌龙茶", "description": "第二件半价",
                "messages": [{"role": "user", "content": "请保留原优惠"}],
            })
        self.assertEqual(response.status_code, 200)
        prompt = completion.call_args.args[1][0]["content"]
        self.assertIn("第二件半价", prompt)
        self.assertIn("桂花乌龙茶", prompt)

    def test_description_limit_and_unknown_model(self):
        payload = {"messages": [{"role": "user", "content": "你好"}], "description": "字" * 2001}
        self.assertEqual(self.client.post("/api/chat", json=payload).status_code, 422)
        payload.update(description="", model_id="missing")
        self.assertEqual(self.client.post("/api/chat", json=payload).status_code, 404)

    def test_mock_generation_and_downloads(self):
        picture = io.BytesIO()
        Image.new("RGB", (640, 480), (204, 167, 118)).save(picture, format="PNG")
        response = self.client.post("/api/generations", data={
            "product_name": "桂花乌龙茶", "description": "秋季新品，第二件半价",
            "style": "温暖手作", "platform": "朋友圈", "model_id": "mock",
        }, files=[("images", ("product.png", picture.getvalue(), "image/png"))])
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(len(result["copy_text"]), 3)
        self.assertTrue(result["copy_is_mock"])
        self.assertEqual(result["copy_provider"], "mock")
        self.assertEqual(result["poster_provider"], "local-template")
        self.assertEqual(result["video_provider"], "local-ffmpeg")
        outputs = self.client.get(f"/api/projects/{response.json()['project_id']}/outputs").json()
        self.assertEqual({item["kind"] for item in outputs}, {"copy", "poster", "video"})
        self.assertTrue(all("path" not in item for item in outputs))
        self.assertTrue(all(item["url"] is None or item["url"].startswith("/api/files/") for item in outputs))
        for key, content_type in (("poster_url", "image/png"), ("video_url", "video/mp4")):
            download = self.client.get(result[key])
            self.assertEqual(download.status_code, 200)
            self.assertIn(content_type, download.headers["content-type"])
            self.assertGreater(len(download.content), 1000)




    def test_google_text_failure_is_labeled_mock_without_leaking_upstream(self):
        from app.config import settings
        from app.services.llm_service import LLMError
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_text_enabled", True), patch.object(settings, "google_text_cost_approved", True), patch("app.providers.google_genai_provider.GoogleGeminiCopywritingProvider.generate_copy", side_effect=LLMError("upstream-secret-body")):
            response = self.client.post("/api/generations", data={"product_name": "茶", "description": "新品", "model_id": "google-gemini"}, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(result["copy_provider"], "mock")
        self.assertIn("Mock", result["error_message"])
        self.assertNotIn("upstream-secret-body", str(result))

    def test_google_image_failure_falls_back_to_local_template(self):
        from app.config import settings
        from app.providers.image_provider import ImageProviderError
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_image_enabled", True), patch("app.providers.google_genai_provider.GoogleGeminiPosterProvider.generate_poster", side_effect=ImageProviderError("upstream-secret-body")):
            response = self.client.post("/api/generations", data={"product_name": "茶", "description": "新品", "model_id": "mock"}, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(result["poster_provider"], "local-template")
        self.assertTrue(result["mock_mode"])
        self.assertNotIn("upstream-secret-body", str(result))

    def test_google_video_requires_explicit_task_mode(self):
        from app.config import settings
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_video_enabled", True), patch("app.providers.google_genai_provider.GoogleVeoVideoProvider.generate_video") as veo:
            response = self.client.post("/api/generations", data={"product_name": "茶", "description": "新品", "model_id": "mock"}, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["video_provider"], "local-ffmpeg")
        veo.assert_not_called()

    def test_veo_failure_preserves_copy_poster_and_labels(self):
        from app.config import settings
        from app.services.ffmpeg_service import FFmpegError
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_video_enabled", True), patch.object(settings, "google_video_cost_approved", True), patch("app.providers.google_genai_provider.GoogleVeoVideoProvider.generate_video", side_effect=FFmpegError("upstream-secret-body")):
            response = self.client.post("/api/generations", data={"product_name": "茶", "description": "新品", "model_id": "mock", "video_mode": "google-veo", "video_cost_limit_usd": "1"}, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(result["video_provider"], "google-veo")
        self.assertIsNone(result["video_url"])
        self.assertIsNotNone(result["poster_url"])
        self.assertIn("Google Veo", result["error_message"])
        self.assertNotIn("upstream-secret-body", str(result))

    def test_veo_requires_explicit_budget_without_calling_google(self):
        from app.config import settings
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_video_enabled", True), patch.object(settings, "google_video_cost_approved", True):
            response = self.client.post("/api/generations", data={
                "product_name": "茶", "description": "新品", "model_id": "mock", "video_mode": "google-veo",
            }, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 422)
        self.assertIn("费用上限", response.json()["detail"])

    def test_local_video_can_include_optional_tts_without_google_request(self):
        import math
        import shutil
        import struct
        import wave
        from app.config import settings
        if not shutil.which(settings.ffmpeg_path) or not shutil.which("ffprobe"):
            self.skipTest("FFmpeg and ffprobe are required to inspect the audio track")
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")

        async def fake_tts(text, path):
            samples = (int(1400 * math.sin(2 * math.pi * 440 * i / 24000)) for i in range(24000))
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                wav.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))
            return path

        with patch.object(settings, "google_api_key", "test-only-key"), patch.object(settings, "google_tts_enabled", True), patch.object(settings, "google_tts_cost_approved", True), patch("app.services.generation_service.GoogleGeminiTTSProvider.generate_audio", side_effect=fake_tts):
            response = self.client.post("/api/generations", data={
                "product_name": "茶", "description": "新品", "model_id": "mock", "voiceover": "true",
            }, files={"images": ("test.png", picture.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client.get(f"/api/generations/{response.json()['task_id']}").json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(result["audio_mode"], "google-gemini-tts")
        self.assertEqual(self.client.get(result["audio_url"]).status_code, 200)
        from app.database import SessionLocal
        from app.models import GenerationTask
        with SessionLocal() as db:
            video_path = db.get(GenerationTask, result["task_id"]).video_path
        import subprocess
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1", video_path], capture_output=True, text=True, check=True)
        self.assertIn("codec_name=aac", probe.stdout)
        outputs = self.client.get(f"/api/projects/{response.json()['project_id']}/outputs").json()
        self.assertEqual({item["kind"] for item in outputs}, {"copy", "poster", "audio", "video"})

    def test_image_config_excludes_credentials(self):
        from app.config import settings
        with patch.object(settings, "poster_mode", "ai"), patch.object(settings, "poster_model", "gpt-image-2.5-flare"), patch.object(settings, "poster_base_url", "https://example.invalid/v1"), patch.object(settings, "poster_api_key", "test-secret"):
            response = self.client.get("/api/generation-config")
        self.assertTrue(response.json()["poster_configured"])
        self.assertEqual(response.json()["poster_model"], "gpt-image-2.5-flare")
        self.assertNotIn("test-secret", response.text)
        self.assertNotIn("example.invalid", response.text)

    def test_ai_task_keeps_model_after_configuration_changes(self):
        from app.config import settings
        import shutil
        async def poster(source, copy, style, output):
            shutil.copyfile(source, output)
            return output
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        with patch.object(settings, "poster_mode", "ai"), patch.object(settings, "poster_model", "gpt-image-2.5-flare"), patch.object(settings, "poster_base_url", "https://example.invalid/v1"), patch.object(settings, "poster_api_key", "test-secret"), patch("app.providers.image_provider.ImagePosterProvider.generate_poster", side_effect=poster):
            response = self.client.post("/api/generations", data={"product_name":"茶", "description":"新品", "model_id":"mock"}, files={"images":("test.png",picture.getvalue(),"image/png")})
        self.assertEqual(response.status_code, 200)
        result = self.client.get("/api/generations/"+response.json()["task_id"]).json()
        self.assertEqual(result["status"], "completed", result)
        self.assertEqual(result["poster_model"], "gpt-image-2.5-flare")
        self.assertFalse(result["mock_mode"])
        self.assertEqual(result["video_mode"], "local")


class ImageProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_image_edit_request_and_png_output(self):
        import base64
        import httpx
        from app.config import settings
        from app.providers.image_provider import ImagePosterProvider
        from app.schemas import CopyResult
        picture = io.BytesIO()
        Image.new("RGB", (64, 64), "green").save(picture, format="PNG")
        def respond(request):
            self.assertEqual(request.url.path, "/v1/images/edits")
            self.assertEqual(request.headers["Authorization"], "Bearer test-secret")
            self.assertIn(b'gpt-image-2.5-flare', request.content)
            self.assertIn(b'name="image"', request.content)
            return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(picture.getvalue()).decode()}]})
        real_client = httpx.AsyncClient
        def client(**kwargs):
            return real_client(transport=httpx.MockTransport(respond), **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/"source.png"
            source.write_bytes(picture.getvalue())
            target = Path(directory)/"result.png"
            with patch.object(settings, "poster_base_url", "https://example.invalid/v1"), patch.object(settings, "poster_api_key", "test-secret"), patch("app.providers.image_provider.httpx.AsyncClient", client):
                await ImagePosterProvider("gpt-image-2.5-flare").generate_poster(source, CopyResult(main_title="茶", subtitle="新品", copies=["一","二","三"], video_caption="新品"), "简约高级", target)
            with Image.open(target) as result:
                self.assertEqual(result.format, "PNG")
                self.assertEqual(result.size, (64, 64))

    async def test_upstream_failure_does_not_echo_secret(self):
        import httpx
        from app.config import settings
        from app.providers.image_provider import ImagePosterProvider, ImageProviderError
        from app.schemas import CopyResult
        real_client = httpx.AsyncClient
        def client(**kwargs):
            return real_client(transport=httpx.MockTransport(lambda request: httpx.Response(401, text="test-secret")), **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/"source.png"
            Image.new("RGB", (64, 64), "green").save(source)
            with patch.object(settings, "poster_base_url", "https://example.invalid/v1"), patch.object(settings, "poster_api_key", "test-secret"), patch("app.providers.image_provider.httpx.AsyncClient", client):
                with self.assertRaises(ImageProviderError) as caught:
                    await ImagePosterProvider("gpt-image-2.5-flare").generate_poster(source, CopyResult(main_title="茶", subtitle="新品", copies=["一","二","三"], video_caption="新品"), "简约高级", Path(directory)/"out.png")
            self.assertNotIn("test-secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
