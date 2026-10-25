import { z } from "zod";
import { aiEnabled } from "./config";
import { AiError, decodeDataUrl, geminiImage, geminiVideo, generateImage, requireConfig } from "./client";
import { GenerateRequestSchema, jsonError } from "./contracts";
import { clientKey, rateLimit } from "./rate-limit";
import { storeMedia } from "./media-storage";
import { bailianMedia, bailianRequest, bailianResultUrl } from "./bailian-media";

export async function generateMedia(request: Request, kind: "image" | "video") {
  if (request.method === "GET") {
    try {
      const config = requireConfig();
      if (!aiEnabled() || !["bailian", "compatible"].includes(config.provider)) return jsonError("视频任务服务未启用。", 503);
      const id = new URL(request.url).searchParams.get("task");
      if (!id || !/^[a-f0-9]{32}$/.test(id)) return jsonError("任务编号无效。", 400);
      const taskConfig = config.provider === "compatible" ? { ...config, baseUrl: process.env.MARKETING_BACKEND_URL ?? "http://127.0.0.1:8002" } : config;
      const task = await bailianRequest(taskConfig, `/video-tasks/${id}`);
      return Response.json({ ok: true, taskId: task.task_id, status: task.status, error: task.error_message, ...(task.result_url ? { url: bailianResultUrl(task.result_url) } : {}), model: task.model });
    } catch (error) { return jsonError(error instanceof Error ? error.message : "视频状态查询失败。", error instanceof AiError ? error.status : 502); }
  }
  if (!aiEnabled()) return jsonError("服务端已关闭 AI，无法生成素材。", 503);
  const limited = rateLimit(`media:${clientKey(request)}`);
  if (!limited.ok) return jsonError(`请求太频繁，请 ${limited.retryAfter} 秒后再试。`, 429);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("请求格式无效。", 400); }
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "素材简报无效。", 400);
  try {
    const config = requireConfig();
    if (config.provider === "bailian" || (kind === "video" && config.provider === "compatible" && config.videoEnabled)) {
      const taskConfig = config.provider === "compatible" ? { ...config, baseUrl: process.env.MARKETING_BACKEND_URL ?? "http://127.0.0.1:8002" } : config;
      const result = await bailianMedia(taskConfig, kind, parsed.data.prompt, parsed.data.image);
      if (kind === "video") return Response.json({ ok: true, taskId: result.task_id, status: result.status, model: result.model });
      return Response.json({ ok: true, url: bailianResultUrl(result.result_url), model: result.model });
    }
    if (kind === "video" && !config.videoEnabled) return jsonError("AI 视频调用已锁定：须核对 Veo 权限和额度，并经费用批准后设置 GEMINI_VIDEO_COST_APPROVED 和预算；当前请使用营销素材的免费 FFmpeg 合成。", 503);
    const { prompt, image } = parsed.data;
    let url = kind === "video" ? await geminiVideo(config, prompt)
      : config.provider === "gemini" ? await geminiImage(config, prompt, image ? decodeDataUrl(image) : undefined)
      : await generateImage(config, prompt, image);
    const data = url.match(/^data:(image\/(?:png|jpeg|webp)|video\/mp4);base64,([A-Za-z0-9+/]+=*)$/);
    if (data) url = (await storeMedia(Buffer.from(data[2], "base64"), data[1])).url;
    if (!z.string().min(1).safeParse(url).success) throw new AiError("未收到可用的素材。", 502);
    return Response.json({ ok: true, url, model: kind === "video" ? config.videoModel : config.imageModel });
  } catch (error) {
    if (error instanceof AiError) return Response.json({ ok: false, error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: error.status });
    return jsonError("素材生成失败，请重试。", 502);
  }
}
