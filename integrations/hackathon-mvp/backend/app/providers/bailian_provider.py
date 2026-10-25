"""Alibaba Cloud Model Studio providers using the official HTTP protocols.

No method retries automatically. Paid capabilities require both a server-side
approval flag and an explicit user confirmation at the API boundary.
"""
from __future__ import annotations

import base64
import io
import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from PIL import Image

from ..config import Settings, settings
from ..schemas import CopyResult
from .base import ImageProvider, TextProvider, TTSProvider, VideoProvider


class BailianProviderError(RuntimeError):
    def __init__(self, message: str, *, category: str, status_code: int | None = None, request_id: str | None = None):
        super().__init__(message)
        self.category = category
        self.status_code = status_code
        self.request_id = request_id


def _category(status: int) -> str:
    return {
        400: "invalid_request",
        401: "authentication",
        402: "billing",
        403: "permission_or_quota",
        404: "model_or_endpoint",
        429: "quota_or_rate_limit",
        503: "provider_unavailable",
        504: "provider_timeout",
    }.get(status, "provider_error")


def _data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0]
    if mime not in {"image/jpeg", "image/png", "image/webp", "image/bmp"}:
        raise BailianProviderError("不支持的图片格式。", category="invalid_asset")
    data = path.read_bytes()
    if len(data) > 20 * 1024 * 1024:
        raise BailianProviderError("图片超过百炼 20MB 限制。", category="invalid_asset")
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


class BailianHTTPClient:
    def __init__(self, config: Settings = settings, client: httpx.AsyncClient | None = None):
        self.config = config
        self._client = client
        if not config.dashscope_api_key:
            raise BailianProviderError("未配置普通百炼 API Key。", category="not_configured")
        if not config.bailian_key_is_application_key:
            raise BailianProviderError("检测到 Coding Plan Key；它不能用作 MorphSite 业务模型凭据。", category="wrong_key_type")
        if not config.dashscope_workspace_id:
            raise BailianProviderError("未配置百炼 Workspace ID。", category="not_configured")
        parsed = urlparse(config.bailian_http_base_url)
        expected_host = f"{config.dashscope_workspace_id}.{config.dashscope_region}.maas.aliyuncs.com".lower()
        if parsed.scheme != "https" or parsed.hostname != expected_host or parsed.path.rstrip("/") != "/api/v1" or parsed.query or parsed.fragment:
            raise BailianProviderError("百炼 Endpoint、Workspace ID 与地域不匹配。", category="region_mismatch")
        self.base_url = config.bailian_http_base_url

    async def request(self, method: str, path: str, *, payload: dict[str, Any] | None = None, asynchronous: bool = False) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.config.dashscope_api_key}", "Content-Type": "application/json"}
        if asynchronous:
            headers["X-DashScope-Async"] = "enable"
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=max(self.config.bailian_timeout_seconds, 300), follow_redirects=False)
        try:
            response = await client.request(method, self.base_url + path, headers=headers, json=payload)
        except httpx.TimeoutException as exc:
            raise BailianProviderError("百炼请求超时，未自动重试。", category="network_timeout") from exc
        except httpx.HTTPError as exc:
            raise BailianProviderError("无法连接百炼服务，未自动重试。", category="network_error") from exc
        finally:
            if owns_client:
                await client.aclose()
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 400:
            request_id = body.get("request_id") if isinstance(body, dict) else None
            raise BailianProviderError(
                f"百炼调用失败（HTTP {response.status_code}，{_category(response.status_code)}）。",
                category=_category(response.status_code), status_code=response.status_code,
                request_id=request_id if isinstance(request_id, str) else None,
            )
        if not isinstance(body, dict):
            raise BailianProviderError("百炼返回格式无效。", category="invalid_response")
        return body

    async def download(self, url: str) -> bytes:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or not (host.endswith(".aliyuncs.com") or host.endswith(".alicdn.com")):
            raise BailianProviderError("模型返回了不可信的素材地址。", category="invalid_response")
        async with httpx.AsyncClient(timeout=self.config.bailian_timeout_seconds, follow_redirects=False) as client:
            response = await client.get(url)
        if response.status_code != 200:
            raise BailianProviderError(f"下载模型结果失败（HTTP {response.status_code}）。", category=_category(response.status_code), status_code=response.status_code)
        return response.content


def _first_text(body: dict[str, Any]) -> str:
    try:
        content = body["output"]["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise BailianProviderError("百炼文本响应缺少 content。", category="invalid_response") from exc
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = [item.get("text", "") for item in content if isinstance(item, dict) and isinstance(item.get("text"), str)]
        if texts:
            return "\n".join(texts)
    raise BailianProviderError("百炼文本响应无法解析。", category="invalid_response")


class BailianTextProvider(TextProvider):
    def __init__(self, config: Settings = settings, client: BailianHTTPClient | None = None):
        if not config.bailian_text_cost_approved:
            raise BailianProviderError("百炼文本调用尚未获得费用授权。", category="cost_not_approved")
        self.config = config
        self.client = client or BailianHTTPClient(config)

    async def generate_json(self, system: str, user: str | list[dict[str, Any]], *, model: str | None = None, max_tokens: int = 6000, temperature: float = 0.7) -> dict[str, Any]:
        if isinstance(user, str):
            user_content = [{"text": user}]
        else:
            user_content = []
            for item in user:
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    user_content.append({"text": item["text"]})
                elif item.get("type") == "image_url" and isinstance(item.get("image_url"), dict):
                    url = item["image_url"].get("url")
                    if not isinstance(url, str) or not url.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")) or len(url) > 20_000_000:
                        raise BailianProviderError("网站生成图片格式无效或过大。", category="invalid_asset")
                    user_content.append({"image": url})
                else:
                    raise BailianProviderError("网站生成消息包含不支持的内容。", category="invalid_request")
        body = await self.client.request("POST", "/services/aigc/multimodal-generation/generation", payload={
            "model": model or self.config.bailian_text_model,
            "input": {"messages": [
                {"role": "system", "content": [{"text": system}]},
                {"role": "user", "content": user_content},
            ]},
            "parameters": {"result_format": "message", "enable_thinking": False, "preserve_thinking": False, "max_tokens": max_tokens, "temperature": temperature},
        })
        text = _first_text(body).strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise BailianProviderError("千问未返回合法 JSON。", category="invalid_response") from exc
        if not isinstance(parsed, dict):
            raise BailianProviderError("千问 JSON 顶层必须是对象。", category="invalid_response")
        return parsed

    async def generate_copy(self, product_name: str, description: str, style: str, platform: str) -> CopyResult:
        prompt = (
            "为商家生成中文营销文案。只返回 JSON，不要 Markdown。字段必须是 "
            "main_title、subtitle、copies（恰好3条字符串）、video_caption。\n"
            f"商家：{product_name}\n介绍：{description}\n风格：{style}\n平台：{platform}"
        )
        try:
            return CopyResult.model_validate(await self.generate_json("你是商业品牌文案师，严格输出可解析 JSON。", prompt))
        except ValueError as exc:
            raise BailianProviderError("千问未返回合法的结构化文案。", category="invalid_response") from exc


class BailianImageProvider(ImageProvider):
    def __init__(self, config: Settings = settings, client: BailianHTTPClient | None = None):
        if not config.bailian_image_cost_approved:
            raise BailianProviderError("百炼图片调用尚未获得费用授权。", category="cost_not_approved")
        self.config = config
        self.client = client or BailianHTTPClient(config)

    async def generate_poster(self, source_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        return await self.generate_image(
            f"将商品照片制作成{style}商业宣传主视觉，不添加模型生成文字，保留商品真实外观。品牌标题：{copy.main_title}",
            output_path,
            source_image,
        )

    async def generate_image(self, prompt: str, output_path: Path, source_image: Path | None = None) -> Path:
        content = ([{"image": _data_uri(source_image)}] if source_image else []) + [{"text": prompt[:2000]}]
        body = await self.client.request("POST", "/services/aigc/multimodal-generation/generation", payload={
            "model": self.config.bailian_image_model,
            "input": {"messages": [{"role": "user", "content": content}]},
            "parameters": {"size": "2K", "n": 1, "watermark": False},
        })
        try:
            items = body["output"]["choices"][0]["message"]["content"]
            url = next(item["image"] for item in items if isinstance(item, dict) and isinstance(item.get("image"), str))
        except (KeyError, IndexError, StopIteration, TypeError) as exc:
            raise BailianProviderError("万相响应缺少图片地址。", category="invalid_response") from exc
        image_bytes = await self.client.download(url)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(io.BytesIO(image_bytes)) as image:
                image.convert("RGB").save(output_path, "PNG")
        except Exception as exc:
            raise BailianProviderError("万相返回的图片文件无效。", category="invalid_response") from exc
        return output_path


@dataclass(frozen=True)
class BailianVideoTask:
    task_id: str
    status: str
    result_url: str | None = None


class BailianVideoProvider(VideoProvider):
    def __init__(self, config: Settings = settings, client: BailianHTTPClient | None = None):
        if not config.bailian_video_cost_approved:
            raise BailianProviderError("百炼视频调用尚未获得费用授权。", category="cost_not_approved")
        self.config = config
        self.client = client or BailianHTTPClient(config)

    async def create_task(self, prompt: str, first_frame: Path | None = None) -> BailianVideoTask:
        model = self.config.bailian_i2v_model if first_frame else self.config.bailian_t2v_model
        input_data: dict[str, Any] = {"prompt": prompt[:5000]}
        if first_frame:
            input_data["media"] = [{"type": "first_frame", "url": _data_uri(first_frame)}]
        elif not prompt.strip():
            raise BailianProviderError("文生视频提示词不能为空。", category="invalid_request")
        body = await self.client.request("POST", "/services/aigc/video-generation/video-synthesis", asynchronous=True, payload={
            "model": model,
            "input": input_data,
            "parameters": {"resolution": self.config.bailian_video_resolution, "duration": self.config.bailian_video_duration_seconds, "prompt_extend": True, "watermark": True},
        })
        output = body.get("output", {})
        task_id = output.get("task_id") if isinstance(output, dict) else None
        if not isinstance(task_id, str) or not task_id:
            raise BailianProviderError("万相视频响应缺少 task_id。", category="invalid_response")
        return BailianVideoTask(task_id=task_id, status=str(output.get("task_status", "PENDING")))

    async def fetch_task(self, task_id: str) -> BailianVideoTask:
        body = await self.client.request("GET", f"/tasks/{task_id}")
        output = body.get("output", {})
        if not isinstance(output, dict):
            raise BailianProviderError("万相任务响应格式无效。", category="invalid_response")
        status = str(output.get("task_status", "UNKNOWN"))
        url = output.get("video_url")
        return BailianVideoTask(task_id=task_id, status=status, result_url=url if isinstance(url, str) else None)

    async def save_result(self, task: BailianVideoTask, output_path: Path) -> Path:
        if task.status != "SUCCEEDED" or not task.result_url:
            raise BailianProviderError("视频任务尚未成功，不能保存结果。", category="task_not_ready")
        data = await self.client.download(task.result_url)
        if not data.startswith(b"\x00\x00") and b"ftyp" not in data[:32]:
            raise BailianProviderError("万相返回的 MP4 文件无效。", category="invalid_response")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(data)
        return output_path

    async def generate_video(self, source_images: list[Path], poster_image: Path, copy: CopyResult, style: str, output_path: Path) -> Path:
        raise BailianProviderError("万相视频必须通过异步任务接口创建并查询，禁止在请求内循环轮询。", category="async_required")


class BailianTTSProvider(TTSProvider):
    def __init__(self, config: Settings = settings, client: BailianHTTPClient | None = None):
        if not config.bailian_tts_cost_approved:
            raise BailianProviderError("百炼配音调用尚未获得费用授权。", category="cost_not_approved")
        self.config = config
        self.client = client or BailianHTTPClient(config)

    async def generate_audio(self, text: str, output_path: Path) -> Path:
        if not text.strip() or len(text) > self.config.max_tts_chars:
            raise BailianProviderError("配音文本为空或过长。", category="invalid_request")
        body = await self.client.request("POST", "/services/audio/tts/SpeechSynthesizer", payload={
            "model": self.config.bailian_tts_model,
            "input": {"text": text, "voice": self.config.bailian_tts_voice, "format": "wav", "sample_rate": 24000},
        })
        try:
            url = body["output"]["audio"]["url"]
        except (KeyError, TypeError) as exc:
            raise BailianProviderError("千问配音响应缺少音频地址。", category="invalid_response") from exc
        if not isinstance(url, str):
            raise BailianProviderError("千问配音响应格式无效。", category="invalid_response")
        data = await self.client.download(url)
        if not (data.startswith(b"RIFF") and data[8:12] == b"WAVE"):
            raise BailianProviderError("千问返回的 WAV 文件无效。", category="invalid_response")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(data)
        return output_path
