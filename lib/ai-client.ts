"use client";

import { BrandSpecSchema, type BrandSpec } from "./brand-spec";
import { GenerationStageSchema, type AiStatusResponse, type EditResponse, type GenerateResponse, type GenerationStage, type GenerationStreamEvent } from "./ai/contracts";

export type AiStatus = { enabled: boolean; imageEnabled: boolean; videoEnabled: boolean; model: string; imageModel: string; videoModel: string; provider?: "compatible" | "gemini" | "bailian"; reason?: string };
export type GeneratedBrand = { spec: BrandSpec; summary: string; imageError?: string; imagePrompt?: string };
export type GeneratedMedia = { url: string; kind: "image" | "video"; model: string };
export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  queued: "简报已提交，等待服务端响应…",
  connecting: "正在连接生成服务…",
  model: "AI 正在构思品牌文案、视觉与分镜…",
  validating: "品牌文案已返回，正在校验并固定网站结构…",
  image: "品牌结构已就绪，正在生成可选主视觉…",
  complete: "生成已完成，正在安全更新预览…",
  demo: "正在载入本地演示品牌，不调用 AI。",
};
const OFFLINE: AiStatus = { enabled: false, imageEnabled: false, videoEnabled: false, model: "offline", imageModel: "offline", videoModel: "offline" };

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    if (body.error) return body.error;
  } catch { /* fall through */ }
  return `请求失败（HTTP ${response.status}）`;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const response = await fetch("/api/brand/status", { cache: "no-store" });
    if (!response.ok) return OFFLINE;
    const body = await response.json() as AiStatusResponse;
    return { enabled: body.enabled, imageEnabled: body.imageEnabled, videoEnabled: body.videoEnabled, model: body.model, imageModel: body.imageModel, videoModel: body.videoModel, provider: body.provider, ...(body.reason ? { reason: body.reason } : {}) };
  } catch { return OFFLINE; }
}

export async function requestMedia(kind: "image" | "video", prompt: string, image: string | null = null): Promise<GeneratedMedia> {
  const signature = JSON.stringify([prompt, image]);
  const stored = sessionStorage.getItem("morphsite-pending-video-v2");
  let pending: { taskId: string; signature: string } | null = null;
  try { pending = stored ? JSON.parse(stored) : null; } catch { /* invalid saved record */ }
  const pendingTask = kind === "video" && pending?.signature === signature ? pending.taskId : null;
  const response = pendingTask ? await fetch(`/api/brand/video?task=${encodeURIComponent(pendingTask)}`, { cache: "no-store" }) : await fetch(`/api/brand/${kind}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...(image ? { image } : {}) }),
  });
  if (!response.ok) throw new Error(await readError(response));
  let body = await response.json() as { ok: true; url?: string; model: string; taskId?: string; status?: string; error?: string };
  if (body.taskId) {
    const taskId = body.taskId;
    sessionStorage.setItem("morphsite-pending-video-v2", JSON.stringify({ taskId, signature }));
    for (let poll = 0; poll < 100 && !body.url; poll++) {
      await new Promise(resolve => setTimeout(resolve, 6000));
      const status = await fetch(`/api/brand/video?task=${encodeURIComponent(taskId)}`, { cache: "no-store" });
      if (!status.ok) throw new Error(await readError(status));
      body = await status.json();
      if (["failed", "canceled", "unknown"].includes(body.status ?? "")) {
        sessionStorage.removeItem("morphsite-pending-video-v2");
        throw new Error(body.error || "视频模型生成失败。");
      }
    }
    if (!body.url) throw new Error("视频仍在生成，任务已保存，请稍后继续查询。");
    sessionStorage.removeItem("morphsite-pending-video-v2");
  }
  if (!body.url) throw new Error("未收到素材地址。");
  return { url: body.url, kind, model: body.model };
}

export function validateGeneratedBrand(body: GenerateResponse): GeneratedBrand {
  const spec = BrandSpecSchema.safeParse(body.spec);
  if (!spec.success) throw new Error("AI 返回的作品未通过校验，已保留原有画布。");
  return { spec: spec.data, summary: body.summary, ...(body.imageError ? { imageError: body.imageError } : {}), ...(body.imagePrompt ? { imagePrompt: body.imagePrompt } : {}) };
}


/** NDJSON reports actual server milestones. It never reports fabricated percentages. */
export async function requestGenerate(prompt: string, image: string | null, onStage?: (stage: GenerationStage) => void): Promise<GeneratedBrand> {
  onStage?.("queued");
  const response = await fetch("/api/brand/generate?stream=1", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...(image ? { image } : {}) }),
  });
  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("浏览器无法读取生成进度，请重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", result: GeneratedBrand | undefined, failure = "";
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as GenerationStreamEvent;
    if (event.type === "stage" && GenerationStageSchema.safeParse(event.stage).success) onStage?.(event.stage);
    if (event.type === "error") failure = event.error || "生成失败，请重试。";
    if (event.type === "result") result = validateGeneratedBrand(event.data);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    // A valid NDJSON response may omit its final newline; do not lose the result.
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
  } finally { reader.releaseLock(); }
  if (failure) throw new Error(failure);
  if (!result) throw new Error("生成响应不完整，作品未更新，请重试。");
  return result;
}

export async function requestEdit(spec: BrandSpec, prompt: string, image?: string | null): Promise<{ spec: BrandSpec; message: string; changed: boolean; imagePrompt?: string }> {
  const response = await fetch("/api/brand/edit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, spec, ...(image ? { image } : {}) }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as EditResponse;
  const next = BrandSpecSchema.safeParse(body.spec);
  if (!next.success) throw new Error("AI 的修改未通过校验，已保留上一版作品。");
  return { spec: next.data, message: body.message, changed: body.changed, imagePrompt: body.imagePrompt };
}
