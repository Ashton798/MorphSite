"""Browser/API smoke test for the unified local marketing workflow."""
import json
import os
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

base_url = os.environ.get("MORPHSITE_BASE_URL", "http://127.0.0.1:3120")
backend_url = os.environ.get("MARKETING_BACKEND_URL", "http://127.0.0.1:8002")


def main() -> None:
    with sync_playwright() as p:
        request = p.request.new_context()
        assert request.get(f"{backend_url}/health").ok
        project = request.post(f"{backend_url}/api/projects", data={"name": "Browser VOID COFFEE", "description": "browser smoke"}).json()
        spec = {"brand": {"name": "VOID COFFEE"}, "campaign": {}, "theme": {}, "assets": {}, "website": {}, "poster": {}, "video": {}}
        # The project endpoint intentionally accepts opaque JSON only; generation
        # uses the real BrandSpec shape in the offline acceptance test.
        assert request.post(f"{backend_url}/api/projects/{project['id']}/conversations", data={"title": "Browser"}).ok
        assert request.get(f"{backend_url}/api/projects/{project['id']}/assets").ok
        page = p.chromium.launch(headless=True).new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{base_url}/studio?demo=1", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        page.get_by_role("button", name="营销素材 · 文案 / 海报 / 短视频").click()
        assert page.get_by_role("heading", name="从推广页到整套营销素材。").is_visible()
        assert page.get_by_text("文案 / 卖点模型").is_visible()
        assert not errors, errors
        page.screenshot(path="test-results/marketing-project-smoke.png", full_page=True)
        page.context.close()
        request.dispose()
    print("marketing project browser smoke: PASS")


if __name__ == "__main__":
    main()
