import { AiError, decodeDataUrl } from "./client";
import type { AiConfig } from "./config";

export async function bailianRequest(config: AiConfig, path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/bailian${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(330_000) });
  } catch { throw new AiError("无法连接百炼后端或请求超时。请稍后查看任务状态。", 504); }
  const body = await response.json();
  if (!response.ok) throw new AiError(typeof body.detail === "string" ? body.detail : "百炼素材请求失败。", response.status);
  return body;
}

export async function bailianMedia(config: AiConfig, kind: "image" | "video", prompt: string, image?: string | null) {
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("cost_confirmed", "true");
  const decoded = image ? decodeDataUrl(image) : undefined;
  if (decoded) form.set("image", new Blob([Buffer.from(decoded.data, "base64")], { type: decoded.mimeType }), "source.png");
  if (kind === "video") form.set("mode", decoded ? "i2v" : "t2v");
  return bailianRequest(config, kind === "image" ? "/images" : "/video-tasks", {
    method: "POST", body: form,
    ...(kind === "video" ? { headers: { "Idempotency-Key": crypto.randomUUID() } } : {}),
  });
}

export function bailianResultUrl(value: unknown): string {
  if (typeof value !== "string" || !/^\/api\/files\/[A-Za-z0-9._-]+$/.test(value)) throw new AiError("百炼未返回可用的本地素材地址。", 502);
  return value.replace("/api/files/", "/api/marketing/files/");
}
