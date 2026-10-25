"""Offline direct-service tests; no socket loop or external provider calls."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import settings
from app.providers.brand_spec_provider import BrandSpecCopywritingProvider
from app.providers.real_provider import get_providers
from app.services.llm_service import LLMError, list_models
from app.providers.google_genai_provider import _safe_error

def immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    finally:
        coroutine.close()
    raise AssertionError("Unexpected asynchronous operation in direct-service test")

class LocalMarketingTests(unittest.TestCase):
    def test_reuses_site_copy_and_does_not_invent_offers(self):
        spec = {"website": {"title": "周末咖啡", "subtitle": "下午来坐坐", "sections": [{"body": "云南咖啡豆"}, {"body": "手冲与朋友"}, {"body": "欢迎光临"}]}}
        provider = BrandSpecCopywritingProvider(json.dumps(spec))
        copy = immediate(provider.generate_copy("coffee", "description", "简约高级", "短视频"))
        self.assertEqual(copy.main_title, "周末咖啡")
        self.assertEqual(copy.copies, ["云南咖啡豆", "手冲与朋友", "欢迎光临"])
        self.assertNotIn("Mock", copy.copies[0])

    def test_missing_brand_spec_cannot_be_silently_substituted(self):
        for value in [None, "null", "{}", "not json"]:
            with self.assertRaises(LLMError):
                BrandSpecCopywritingProvider(value)

    def test_veo_requires_separate_explicit_cost_approval(self):
        with patch.object(settings, "google_video_enabled", True), patch.object(settings, "google_api_key", "fake"), patch.object(settings, "google_video_cost_approved", False):
            self.assertFalse(settings.google_video_configured)
        with patch.object(settings, "google_video_enabled", True), patch.object(settings, "google_api_key", "fake"), patch.object(settings, "google_video_cost_approved", True):
            self.assertTrue(settings.google_video_configured)

    def test_errors_distinguish_local_failure_and_google_status(self):
        self.assertIn("本地网络或文件", _safe_error(PermissionError("denied"), "failed"))
        for code in [400, 429, 503, 504]:
            error = type("GoogleError", (Exception,), {"code": code})("secret-provider-body")
            result = _safe_error(error, "failed")
            self.assertIn(str(code), result)
            self.assertNotIn("secret-provider-body", result)

    def test_local_provider_is_available_without_ai_keys(self):
        model = next(item for item in list_models() if item.id == "brand-spec")
        self.assertTrue(model.configured)
        spec = json.dumps({"website":{"title":"标题","subtitle":"副标题","sections":[]}})
        copy, poster, video = get_providers("brand-spec", None, "local", spec)
        self.assertIsInstance(copy, BrandSpecCopywritingProvider)
