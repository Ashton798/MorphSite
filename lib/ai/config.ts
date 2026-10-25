// Server-only provider configuration. Never import this from a client component:
// the API key must never reach the browser bundle.
export type AiConfig = {
  provider: "compatible" | "gemini" | "bailian";
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  visionModel: string;
  imageModel: string;
  videoModel: string;
  textEnabled: boolean;
  imageEnabled: boolean;
  videoEnabled: boolean;
  videoTimeoutMs: number;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return !["off", "false", "0", "no", "disabled"].includes(value.trim().toLowerCase());
}

export function readAiConfig(): AiConfig | { error: string } {
  const geminiKey = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "").trim();
  const requested = (process.env.AI_PROVIDER ?? (geminiKey ? "gemini" : "compatible")).trim().toLowerCase();
  const provider: AiConfig["provider"] = requested === "bailian" ? "bailian" : requested === "gemini" ? "gemini" : "compatible";
  const apiKey = provider === "gemini" ? geminiKey : (process.env.AI_API_KEY ?? "").trim();
  if (provider !== "bailian" && !apiKey) return { error: provider === "gemini" ? "服务端未配置 GEMINI_API_KEY。" : "服务端未配置 AI_API_KEY，已回退到本地 Demo 模式。" };
  const baseUrl = (provider === "bailian" ? process.env.MARKETING_BACKEND_URL ?? "http://127.0.0.1:8002" : process.env.AI_BASE_URL ?? "https://api.openai-next.com").trim().replace(/\/+$/, "");
  if (provider === "compatible" && !/^https:\/\/[^\s]+$/i.test(baseUrl)) return { error: "AI_BASE_URL 必须是 HTTPS 地址。" };
  const gemini = provider === "gemini";
  const bailian = provider === "bailian";
  const textApproved = flag(process.env.AI_TEXT_COST_APPROVED ?? process.env.GEMINI_TEXT_COST_APPROVED, false);
  const imageApproved = flag(process.env.AI_IMAGE_COST_APPROVED ?? process.env.GEMINI_IMAGE_COST_APPROVED ?? process.env.GEMINI_IMAGE_PAID_APPROVED, false);
  return {
    provider,
    baseUrl,
    apiKey,
    chatModel: (bailian ? process.env.BAILIAN_TEXT_MODEL ?? "qwen3.8-flash" : gemini ? process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash" : process.env.AI_CHAT_MODEL ?? "gpt-4o-mini").trim(),
    visionModel: (bailian ? process.env.BAILIAN_TEXT_MODEL ?? "qwen3.8-flash" : gemini ? process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash" : process.env.AI_VISION_MODEL ?? process.env.AI_CHAT_MODEL ?? "gpt-4o-mini").trim(),
    imageModel: (bailian ? process.env.BAILIAN_IMAGE_MODEL ?? "wan2.7-image" : gemini ? process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image" : process.env.AI_IMAGE_MODEL ?? "gpt-image-1").trim(),
    videoModel: (provider === "compatible" ? process.env.AI_VIDEO_MODEL ?? "doubao-seedance-2-5-260628" : bailian ? process.env.BAILIAN_I2V_MODEL ?? "wan2.7-i2v" : process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-generate-preview").trim(),
    textEnabled: bailian || textApproved,
    imageEnabled: bailian || imageApproved && flag(process.env.GEMINI_IMAGE_ENABLED ?? process.env.AI_IMAGE_ENABLED, false),
    videoEnabled: provider === "compatible" ? flag(process.env.AI_VIDEO_ENABLED, false) : bailian || gemini && flag(process.env.GEMINI_VIDEO_ENABLED, false) && flag(process.env.GEMINI_VIDEO_COST_APPROVED, false) && Number(process.env.GEMINI_VIDEO_MAX_COST_USD) > 0,
    videoTimeoutMs: positiveInt(process.env.GEMINI_VIDEO_TIMEOUT_MS, 480_000),
  };
}

/** True when the deployment is allowed to call the provider at all. */
export function aiEnabled(): boolean {
  return flag(process.env.MORPHSITE_AI, true);
}

export const AI_TIMEOUT_MS = 75_000;
export const AI_IMAGE_TIMEOUT_MS = 150_000;
export const AI_VIDEO_TIMEOUT_MS = 480_000;
export const AI_MEDIA_MAX_BYTES = 15_000_000;
