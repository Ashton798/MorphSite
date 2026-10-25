"""Ark image and asynchronous video adapter. Never retries paid creation."""
import base64
import io
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image

from ..config import settings
from .bailian_provider import BailianProviderError, BailianVideoTask, _data_uri


class ArkProvider:
    def __init__(self, kind: str):
        self.model = settings.ark_image_model if kind == "image" else settings.ark_video_model
        if not settings.ark_api_key or not self.model:
            raise BailianProviderError("请填写方舟 API Key 和对应模型 ID。", category="not_configured")
        self.base = settings.ark_base_url.rstrip("/")
        if self.base != "https://ark.cn-beijing.volces.com/api/v3":
            raise BailianProviderError("方舟 API 地址无效。", category="invalid_request")

    async def request(self, method, path, payload=None):
        try:
            async with httpx.AsyncClient(timeout=300, follow_redirects=False) as client:
                response = await client.request(method, self.base + path, headers={"Authorization": f"Bearer {settings.ark_api_key}"}, json=payload)
        except httpx.HTTPError as exc:
            raise BailianProviderError("方舟请求超时或网络不可用，未自动重试。", category="provider_timeout", status_code=504) from exc
        if response.status_code >= 400:
            raise BailianProviderError(f"方舟调用失败（HTTP {response.status_code}），请检查密钥、模型权限与额度。", category="provider_error", status_code=response.status_code)
        return response.json()

    async def download(self, url):
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not any(host.endswith(suffix) for suffix in (".volces.com", ".volccdn.com", ".volcengine.com", ".byteimg.com", ".ibytedtos.com")):
            raise BailianProviderError("方舟返回的素材地址不受信任。", category="invalid_response")
        async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content

    async def generate_image(self, prompt: str, output_path: Path, source_image: Path | None = None):
        payload = {"model": self.model, "prompt": prompt, "size": "2K", "response_format": "b64_json", "watermark": False}
        if source_image:
            payload["image"] = _data_uri(source_image)
        result = await self.request("POST", "/images/generations", payload)
        try:
            item = result["data"][0]
            data = base64.b64decode(item["b64_json"], validate=True) if item.get("b64_json") else await self.download(item["url"])
            with Image.open(io.BytesIO(data)) as image:
                image.convert("RGB").save(output_path, "PNG")
        except (KeyError, IndexError, ValueError, OSError) as exc:
            raise BailianProviderError("方舟未返回有效图片。", category="invalid_response") from exc
        return output_path

    async def create_task(self, prompt: str, first_frame: Path | None = None):
        content = [{"type": "text", "text": prompt}]
        if first_frame:
            content.append({"type": "image_url", "image_url": {"url": _data_uri(first_frame)}, "role": "first_frame"})
        result = await self.request("POST", "/contents/generations/tasks", {"model": self.model, "content": content, "duration": settings.ark_video_duration_seconds, "resolution": "720p", "watermark": False})
        if not isinstance(result.get("id"), str):
            raise BailianProviderError("方舟未返回视频任务 ID。", category="invalid_response")
        return BailianVideoTask(result["id"], "PENDING")

    async def fetch_task(self, task_id):
        result = await self.request("GET", f"/contents/generations/tasks/{task_id}")
        status = {"queued": "PENDING", "running": "RUNNING", "succeeded": "SUCCEEDED", "failed": "FAILED", "cancelled": "CANCELED", "expired": "FAILED"}.get(result.get("status"), "UNKNOWN")
        return BailianVideoTask(task_id, status, result.get("content", {}).get("video_url"))

    async def save_result(self, task, output_path):
        data = await self.download(task.result_url)
        if b"ftyp" not in data[:32]:
            raise BailianProviderError("方舟返回的视频文件无效。", category="invalid_response")
        output_path.write_bytes(data)
        return output_path
