"""Offline Google SDK contract tests. No credentials or network calls."""
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# Offline tests must never inherit a developer's enabled paid providers.
for _flag in ("GOOGLE_TEXT_ENABLED", "GOOGLE_IMAGE_ENABLED", "GOOGLE_VIDEO_ENABLED", "GOOGLE_TTS_ENABLED"):
    os.environ[_flag] = "false"

from PIL import Image

from app.config import settings
from app.providers import google_genai_provider as provider
from app.schemas import CopyResult

TEST_TEMP = Path(__file__).resolve().parents[4] / "test-results" / "backend-temp"
TEST_TEMP.mkdir(parents=True, exist_ok=True)


class _Part:
    def __init__(self, data: bytes, mime_type: str):
        self.inline_data = type("Blob", (), {"data": data, "mime_type": mime_type})()


class _Response:
    def __init__(self, parts=None, text=None):
        self.parts = parts or []
        self.text = text


class _Operation:
    def __init__(self, done=False, response=None, error=None):
        self.done = done
        self.response = response
        self.error = error


class _FakeModels:
    def __init__(self, response=None, operation=None):
        self.response = response
        self.operation = operation
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.response

    def generate_videos(self, **kwargs):
        self.calls.append(kwargs)
        return self.operation


class _FakeClient:
    def __init__(self, models):
        self.models = models
        self.closed = False
        self.files = type("Files", (), {"download": lambda _, file, destination: Path(destination).write_bytes(b"video-bytes")})()
        self.operations = type("Operations", (), {"get": lambda _, operation: _Operation(done=True, response=operation.response)})()

    def close(self):
        self.closed = True


class GoogleProviderTests(unittest.TestCase):
    def setUp(self):
        self.copy = CopyResult(main_title="夜间咖啡", subtitle="放慢一点", copies=["一", "二", "三"], video_caption="慢慢喝咖啡")
        self.image = io.BytesIO()
        Image.new("RGB", (64, 64), (30, 40, 50)).save(self.image, format="PNG")
        self.image_bytes = self.image.getvalue()

    def test_missing_sdk_is_reported_without_exposing_details(self):
        with patch.object(provider, "_sdk_modules", side_effect=provider.GoogleProviderError("SDK missing")):
            with self.assertRaisesRegex(provider.LLMError, "Gemini 文案生成失败") as caught:
                provider._generate_copy_sync("咖啡", "新品", "简约高级", "朋友圈")
            self.assertNotIn("SDK missing", str(caught.exception))

    def test_text_copy_via_sdk(self):
        from google.genai import types
        models = _FakeModels(response=_Response(text='{"main_title":"夜间咖啡","subtitle":"放慢一点","copies":["一","二","三"],"video_caption":"慢慢喝咖啡"}'))
        client = _FakeClient(models)
        with patch.object(provider, "_client", return_value=(client, types)):
            result = provider._generate_copy_sync("咖啡", "夜间新品", "简约高级", "朋友圈")
        self.assertEqual(result.copies, ["一", "二", "三"])
        self.assertEqual(models.calls[0]["model"], settings.google_text_model)
        self.assertTrue(client.closed)

    def test_image_reference_via_sdk(self):
        from google.genai import types
        models = _FakeModels(response=_Response(parts=[_Part(self.image_bytes, "image/png")]))
        client = _FakeClient(models)
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as directory:
            source = Path(directory) / "source.png"
            source.write_bytes(self.image_bytes)
            output = Path(directory) / "poster.png"
            with patch.object(provider, "_client", return_value=(client, types)):
                provider._generate_image_sync(source, self.copy, "简约高级", output)
            self.assertTrue(output.is_file())
            self.assertEqual(models.calls[0]["model"], settings.google_image_model)
            self.assertEqual(models.calls[0]["config"].response_modalities, ["IMAGE"])
            self.assertEqual(models.calls[0]["contents"][1].inline_data.mime_type, "image/png")
        self.assertTrue(client.closed)

    def test_video_operation_poll_and_download_via_sdk(self):
        from google.genai import types
        video = types.Video(uri="https://example.invalid/generated/video")
        result = types.GenerateVideosResponse(generated_videos=[types.GeneratedVideo(video=video)])
        models = _FakeModels(operation=_Operation(done=False, response=result))
        client = _FakeClient(models)
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as directory:
            source = Path(directory) / "source.png"
            source.write_bytes(self.image_bytes)
            output = Path(directory) / "video.mp4"
            with patch.object(provider, "_client", return_value=(client, types)), patch.object(provider.time, "sleep", return_value=None):
                provider._generate_video_sync(source, self.copy, "简约高级", output)
            self.assertEqual(output.read_bytes(), b"video-bytes")
            self.assertEqual(models.calls[0]["model"], settings.google_video_model)
            self.assertEqual(models.calls[0]["config"].number_of_videos, 1)
        self.assertTrue(client.closed)

    def test_tts_audio_via_sdk(self):
        from google.genai import types
        import wave
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(b"\x00\x00" * 10)
        audio = wav_buffer.getvalue()
        models = _FakeModels(response=_Response(parts=[_Part(audio, "audio/wav")]))
        client = _FakeClient(models)
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as directory:
            output = Path(directory) / "voice.wav"
            with patch.object(provider, "_client", return_value=(client, types)):
                provider._generate_audio_sync("今天喝咖啡", output)
            self.assertEqual(output.read_bytes(), audio)
            self.assertEqual(models.calls[0]["config"].response_modalities, ["AUDIO"])
        self.assertTrue(client.closed)

    def test_tts_pcm_is_wrapped_in_playable_wav(self):
        from google.genai import types
        import wave
        samples = b"\x00\x00\x10\x00" * 100
        client = _FakeClient(_FakeModels(response=_Response(parts=[_Part(samples, "audio/L16;rate=24000")])))
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as directory:
            output = Path(directory) / "voice.wav"
            with patch.object(provider, "_client", return_value=(client, types)):
                provider._generate_audio_sync("咖啡", output)
            with wave.open(str(output), "rb") as wav:
                self.assertEqual(wav.getframerate(), 24000)
                self.assertEqual(wav.getnchannels(), 1)
                self.assertEqual(wav.readframes(200), samples)

    def test_old_base_url_normalized(self):
        with patch.object(settings, "google_api_base_url", "https://generativelanguage.googleapis.com/v1beta"):
            self.assertEqual(provider._base_url(), "https://generativelanguage.googleapis.com")

    def test_sdk_constructs_versioned_base_url_without_network(self):
        with patch.object(settings, "google_api_key", "test-only-key"):
            client, _ = provider._client()
            try:
                self.assertEqual(client._api_client._http_options.base_url, "https://generativelanguage.googleapis.com")
                self.assertEqual(client._api_client._http_options.api_version, "v1beta")
            finally:
                client.close()


if __name__ == "__main__":
    unittest.main()
