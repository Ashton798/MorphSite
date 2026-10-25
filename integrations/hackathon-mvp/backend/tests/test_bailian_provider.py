"""Offline Bailian protocol tests. No API keys, billing or network calls."""
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path

import httpx
from PIL import Image
from sqlalchemy import create_engine, inspect

from app.config import Settings
from app.database import Base
from app import models  # noqa: F401 - registers tables
from app.providers.bailian_provider import (
    BailianHTTPClient,
    BailianImageProvider,
    BailianProviderError,
    BailianTTSProvider,
    BailianTextProvider,
    BailianVideoProvider,
)


def config(**overrides):
    values = {
        "dashscope_api_key": "sk-test-normal-application-key",
        "dashscope_workspace_id": "ws-test123",
        "dashscope_region": "cn-beijing",
        "bailian_text_cost_approved": True,
        "bailian_image_cost_approved": True,
        "bailian_video_cost_approved": True,
        "bailian_tts_cost_approved": True,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


class FakeHTTP:
    def __init__(self, handler):
        self.handler = handler

    async def request(self, method, url, headers=None, json=None):
        request = httpx.Request(method, url, headers=headers, json=json)
        return await self.handler(request)


class FakeServiceClient:
    def __init__(self, response, content):
        self.response = response
        self.content = content
        self.calls = []

    async def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.response

    async def download(self, url):
        self.calls.append(("GET", url, {}))
        return self.content


def immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    finally:
        coroutine.close()
    raise AssertionError("Unexpected asynchronous suspension in offline test")


class BailianProviderTests(unittest.TestCase):
    def test_rejects_coding_plan_key(self):
        with self.assertRaises(BailianProviderError) as caught:
            BailianHTTPClient(config(dashscope_api_key="test-coding-plan-key", dashscope_api_key_kind="coding_plan"))
        self.assertEqual(caught.exception.category, "wrong_key_type")
        self.assertNotIn("exposed", str(caught.exception))

    def test_rejects_mixed_region_endpoint(self):
        with self.assertRaises(BailianProviderError) as caught:
            BailianHTTPClient(config(dashscope_base_url="https://ws-test123.ap-southeast-1.maas.aliyuncs.com/api/v1"))
        self.assertEqual(caught.exception.category, "region_mismatch")

    def test_qwen_copy_uses_workspace_endpoint_and_validates_json(self):
        calls = []

        async def handler(request: httpx.Request):
            calls.append(request)
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "qwen3.8-flash")
            self.assertFalse(payload["parameters"]["enable_thinking"])
            return httpx.Response(200, json={"output": {"choices": [{"message": {"content": [{"text": json.dumps({
                "main_title": "周末咖啡节", "subtitle": "冰美式第二杯半价",
                "copies": ["黑金开场", "清爽一杯", "周末见"], "video_caption": "来 VOID COFFEE 喝一杯",
            }, ensure_ascii=False)}]}}]}})

        cfg = config()
        provider = BailianTextProvider(cfg, BailianHTTPClient(cfg, FakeHTTP(handler)))
        result = immediate(provider.generate_copy("VOID COFFEE", "精品咖啡店", "黑金", "网站"))
        self.assertEqual(result.main_title, "周末咖啡节")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].url.host, "ws-test123.cn-beijing.maas.aliyuncs.com")
        self.assertEqual(calls[0].headers["authorization"], "Bearer sk-test-normal-application-key")

    def test_429_is_classified_and_never_retried(self):
        count = 0

        async def handler(request: httpx.Request):
            nonlocal count
            count += 1
            return httpx.Response(429, json={"code": "Throttling", "request_id": "request-test"})

        client = BailianHTTPClient(config(), FakeHTTP(handler))
        with self.assertRaises(BailianProviderError) as caught:
            immediate(client.request("POST", "/services/aigc/multimodal-generation/generation", payload={}))
        self.assertEqual(count, 1)
        self.assertEqual(caught.exception.category, "quota_or_rate_limit")
        self.assertEqual(caught.exception.request_id, "request-test")

    def test_403_covers_permission_or_exhausted_free_quota(self):
        async def handler(request: httpx.Request):
            return httpx.Response(403, json={"request_id": "request-403"})

        client = BailianHTTPClient(config(), FakeHTTP(handler))
        with self.assertRaises(BailianProviderError) as caught:
            immediate(client.request("POST", "/services/aigc/multimodal-generation/generation", payload={}))
        self.assertEqual(caught.exception.category, "permission_or_quota")
        self.assertEqual(caught.exception.request_id, "request-403")

    def test_video_create_then_query_uses_same_task_id(self):
        seen = []

        async def handler(request: httpx.Request):
            seen.append((request.method, request.url.path, request.headers.get("X-DashScope-Async")))
            if request.method == "POST":
                payload = json.loads(request.content)
                self.assertEqual(payload["model"], "wan2.7-t2v")
                self.assertEqual(payload["parameters"]["resolution"], "720P")
                return httpx.Response(200, json={"output": {"task_id": "task-123", "task_status": "PENDING"}})
            return httpx.Response(200, json={"output": {"task_id": "task-123", "task_status": "RUNNING"}})

        cfg = config()
        provider = BailianVideoProvider(cfg, BailianHTTPClient(cfg, FakeHTTP(handler)))
        created = immediate(provider.create_task("咖啡杯在黑金灯光中缓慢旋转"))
        queried = immediate(provider.fetch_task(created.task_id))
        self.assertEqual(created.task_id, queried.task_id)
        self.assertEqual(queried.status, "RUNNING")
        self.assertEqual(seen, [
            ("POST", "/api/v1/services/aigc/video-generation/video-synthesis", "enable"),
            ("GET", "/api/v1/tasks/task-123", None),
        ])

    def test_wan_image_result_is_saved_as_real_png(self):
        image_buffer = io.BytesIO()
        Image.new("RGB", (32, 24), (20, 30, 40)).save(image_buffer, "JPEG")
        service = FakeServiceClient({"output": {"choices": [{"message": {"content": [{"image": "https://result.aliyuncs.com/output.jpg"}]}}]}}, image_buffer.getvalue())
        root = Path(__file__).resolve().parents[4] / "test-results" / "backend-temp"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            output = Path(directory) / "wan.png"
            result = immediate(BailianImageProvider(config(), service).generate_image("精品咖啡商业海报", output))
            self.assertEqual(result, output)
            with Image.open(output) as saved:
                self.assertEqual(saved.format, "PNG")
        self.assertEqual(service.calls[0][2]["payload"]["model"], "wan2.7-image")

    def test_qwen_tts_result_is_saved_as_real_wav(self):
        audio_buffer = io.BytesIO()
        with wave.open(audio_buffer, "wb") as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(b"\x00\x00" * 20)
        service = FakeServiceClient({"output": {"audio": {"url": "http://result.aliyuncs.com/output.wav"}}}, audio_buffer.getvalue())
        root = Path(__file__).resolve().parents[4] / "test-results" / "backend-temp"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            output = Path(directory) / "voice.wav"
            result = immediate(BailianTTSProvider(config(), service).generate_audio("周末咖啡节，冰美式第二杯半价。", output))
            self.assertEqual(result, output)
            with wave.open(str(output), "rb") as wav:
                self.assertEqual(wav.getframerate(), 24000)
        self.assertEqual(service.calls[0][2]["payload"]["model"], "qwen-audio-3.1-tts-flash")

    def test_paid_capabilities_default_to_blocked(self):
        cfg = config(bailian_text_cost_approved=False, bailian_video_cost_approved=False)
        with self.assertRaises(BailianProviderError) as text_error:
            BailianTextProvider(cfg)
        with self.assertRaises(BailianProviderError) as video_error:
            BailianVideoProvider(cfg)
        self.assertEqual(text_error.exception.category, "cost_not_approved")
        self.assertEqual(video_error.exception.category, "cost_not_approved")

    def test_provider_task_schema_is_created_in_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        columns = {column["name"] for column in inspect(engine).get_columns("provider_tasks")}
        self.assertTrue({"idempotency_key", "external_task_id", "status", "stage", "output_path"}.issubset(columns))


if __name__ == "__main__":
    unittest.main()
