// Server-side clients for Gemini and compatible providers.
import { AI_IMAGE_TIMEOUT_MS, AI_MEDIA_MAX_BYTES, AI_TIMEOUT_MS, readAiConfig, type AiConfig } from "./config";

import { classifyProviderError, withImageRetry, type ProviderFailure } from "./provider-error";

export class AiError extends Error {
  status: number;
  details?: ProviderFailure;
  constructor(message: string, status = 502, details?: ProviderFailure) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.details = details;
  }
}

export function requireConfig(): AiConfig {
  const config = readAiConfig();
  if ("error" in config) throw new AiError(config.error, 503);
  return config;
}

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

async function postJson<T>(config: AiConfig, path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "MorphSite/1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = "";
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } };
        detail = parsed.error?.message || parsed.error?.code || "";
      } catch { detail = text.slice(0, 160); }
      if (response.status === 401 || response.status === 403) throw new AiError("AI 供应商拒绝了密钥，请检查服务端 AI_API_KEY。", 502);
      if (response.status === 429) throw new AiError("AI 供应商限流或额度不足，请稍后再试。", 429);
      throw new AiError(`AI 供应商返回 ${response.status}${detail ? `：${detail.slice(0, 120)}` : ""}`, 502);
    }
    try { return JSON.parse(text) as T; }
    catch { throw new AiError("AI 供应商返回了无法解析的响应。", 502); }
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AiError("AI 请求超时，作品未修改，请重试。", 504);
    throw new AiError("无法连接 AI 供应商，请检查网络或 AI_BASE_URL。", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function geminiContent(config: AiConfig, options: { model: string; contents: unknown; config?: Record<string, unknown> }) {
  if (config.provider !== "gemini") throw new AiError("当前 AI Provider 不是 Gemini。", 500);
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: AI_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  try {
    return await client.models.generateContent(options as Parameters<typeof client.models.generateContent>[0]);
  } catch (error) {
    throw providerAiError(error);
  }
}

function providerAiError(error: unknown): AiError {
  const details = classifyProviderError(error);
  return new AiError(details.message, details.httpStatus, details);
}

export function decodeDataUrl(value: string): { data: string; mimeType: string } | undefined {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/i);
  if (!match?.[1] || !match[2]) return undefined;
  if (Buffer.byteLength(match[2], "base64") > AI_MEDIA_MAX_BYTES) throw new AiError("上传图片过大，无法发送给 Gemini。", 413);
  return { mimeType: match[1].toLowerCase(), data: match[2] };
}

export async function geminiImage(config: AiConfig, prompt: string, imageData?: { data: string; mimeType: string }): Promise<string> {
  if (config.provider !== "gemini") throw new AiError("当前 AI Provider 不是 Gemini。", 500);
  if (!config.imageEnabled) throw new AiError("服务端未开启 Gemini 图片生成。", 503);
  if (/^gemini-3\.1-flash(?:-lite)?-image$/.test(config.imageModel) && process.env.GEMINI_IMAGE_PAID_APPROVED !== "true") {
    throw new AiError("当前图片模型没有免费 API 层。gemini-3.1-flash-image 标准 1K 输出约 US$0.067/张，另计输入费用；需先批准费用、在 Google 项目配置账单与配额，再设置 GEMINI_IMAGE_PAID_APPROVED=true。当前未发起付费请求，网站继续使用照片或渐变背景。", 402);
  }
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: AI_IMAGE_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  try {
    const contents = imageData
      ? [{ text: prompt.slice(0, 2000) }, { inlineData: { data: imageData.data, mimeType: imageData.mimeType } }]
      : prompt.slice(0, 2000);
    const response = await withImageRetry(() => client.models.generateContent({ model: config.imageModel, contents, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } }));
    const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
    if (!part?.inlineData?.data) throw new AiError("Gemini 未返回图片。", 502);
    return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw providerAiError(error);
  }
}

export async function geminiVideo(config: AiConfig, prompt: string): Promise<string> {
  if (config.provider !== "gemini") throw new AiError("当前 AI Provider 不是 Gemini。", 500);
  if (!config.videoEnabled) throw new AiError("服务端未开启 Gemini 视频生成。", 503);
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  try {
    let operation = await client.models.generateVideos({ model: config.videoModel, source: { prompt: prompt.slice(0, 3000) }, config: { numberOfVideos: 1, aspectRatio: "9:16" } });
    const deadline = Date.now() + config.videoTimeoutMs;
    while (!operation.done) {
      if (Date.now() >= deadline) throw new AiError("Gemini 视频生成超时。", 504);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      operation = await client.operations.getVideosOperation({ operation });
    }
    const video = operation.response?.generatedVideos?.[0]?.video;
    const bytes = video?.videoBytes;
    if (bytes) return `data:video/mp4;base64,${bytes}`;
    if (video?.uri && /^https:\/\//.test(video.uri)) {
      const { withTempMedia, storeMedia } = await import("./media-storage");
      const { readFile } = await import("node:fs/promises");
      return await withTempMedia("mp4", async (filename) => {
        await client.files.download({ file: video, downloadPath: filename });
        return (await storeMedia(await readFile(filename), "video/mp4")).url;
      });
    }
    throw new AiError("Gemini 未返回视频。", 502);
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw providerAiError(error);
  }
}


type ChatResponse = { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> };
type BailianJsonResponse = { data?: unknown; model?: string; detail?: string };

async function bailianJson(
  config: AiConfig,
  options: { model: string; system: string; user: ChatMessage["content"]; maxTokens?: number; temperature?: number },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/api/bailian/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MorphSite/1.0" },
      body: JSON.stringify({ system: options.system, user: options.user, model: options.model, max_tokens: options.maxTokens ?? 6000, temperature: options.temperature ?? 0.7 }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as BailianJsonResponse;
    if (!response.ok) throw new AiError(payload.detail || `百炼服务返回 HTTP ${response.status}。`, response.status);
    if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new AiError("百炼未返回合法 JSON 对象。", 502);
    return payload.data;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AiError("百炼文本请求超时，未自动重试。", 504);
    throw new AiError("无法连接 FastAPI 百炼服务，请先启动后端。", 503);
  } finally { clearTimeout(timer); }
}

/** One chat completion that must return a JSON object. */
export async function chatJson(
  config: AiConfig,
  options: { model: string; system: string; user: ChatMessage["content"]; maxTokens?: number; temperature?: number },
): Promise<{ json: unknown; raw: string }> {
  if (!config.textEnabled) throw new AiError("真实文本模型尚未获得费用授权；当前可继续使用本地 Demo 与确定性编辑。", 402);
  if (config.provider === "bailian") {
    const json = await bailianJson(config, options);
    return { json, raw: JSON.stringify(json) };
  }
  let text = "";
  if (config.provider === "gemini") {
    const userParts = Array.isArray(options.user)
      ? options.user.map((part) => "text" in part ? { text: part.text } : { inlineData: { data: part.image_url.url.split(",")[1] ?? "", mimeType: part.image_url.url.match(/^data:([^;]+);/)?.[1] ?? "image/png" } })
      : [{ text: options.user }];
    const response = await geminiContent(config, {
      model: options.model,
      contents: [{ role: "user", parts: [{ text: options.system }, ...userParts] }],
      config: { responseMimeType: "application/json", temperature: options.temperature ?? 0.8, maxOutputTokens: options.maxTokens ?? 1800 },
    });
    text = response.text ?? response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  } else {
    const payload = await postJson<ChatResponse>(config, "/v1/chat/completions", {
      model: options.model,
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
      response_format: { type: "json_object" },
      max_tokens: options.maxTokens ?? 1800,
      temperature: options.temperature ?? 0.8,
    }, AI_TIMEOUT_MS);
    text = payload.choices?.[0]?.message?.content ?? "";
  }
  if (!text.trim()) throw new AiError("AI 返回了空内容，作品未修改。", 502);
  const json = parseJsonLoose(text);
  if (json === undefined) throw new AiError("AI 返回的 JSON 无法解析，作品未修改。", 502);
  return { json, raw: text };
}

/** Models sometimes wrap JSON in fences or add a sentence before it. */
export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* try next shape */ }
  }
  return undefined;
}

type ImageResponse = { data?: Array<{ url?: string; b64_json?: string }> };

/** Text-to-image. Returns a short-lived provider URL or a base64 data URL. */
export async function generateImage(config: AiConfig, prompt: string, reference?: string): Promise<string> {
  if (!config.imageEnabled) throw new AiError("服务端未开启图片生成（AI_IMAGE_ENABLED=off）。", 503);
  if (config.provider === "gemini") return geminiImage(config, prompt);
  if (reference) {
    const decoded = decodeDataUrl(reference);
    if (!decoded) throw new AiError("参考图必须为有效上传图片。", 400);
    const form = new FormData();
    form.set("model", config.imageModel);
    form.set("prompt", prompt.slice(0, 2000));
    form.set("size", "1024x1024");
    form.set("n", "1");
    form.set("image", new Blob([new Uint8Array(Buffer.from(decoded.data, "base64"))], { type: decoded.mimeType }), "product.png");
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(AI_IMAGE_TIMEOUT_MS) });
    } catch { throw new AiError("参考图优化请求超时或网络不可用，请重试。", 504); }
    if (!response.ok) throw new AiError(`参考图优化失败（HTTP ${response.status}），原图已保留。`, 502);
    const edited = await response.json() as ImageResponse;
    const item = edited.data?.[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item?.url && /^https:\/\//i.test(item.url)) return item.url;
    throw new AiError("图片编辑模型未返回有效图片。", 502);
  }
  const payload = await postJson<ImageResponse>(config, "/v1/images/generations", {
    model: config.imageModel,
    prompt: prompt.slice(0, 900),
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  }, AI_IMAGE_TIMEOUT_MS);
  const first = payload.data?.[0];
  if (first?.url && /^https:\/\//i.test(first.url)) return first.url;
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  throw new AiError("AI 未返回图片地址。", 502);
}
