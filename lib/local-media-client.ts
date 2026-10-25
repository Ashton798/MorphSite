import { type BrandSpec } from "./brand-spec";
import { MarketingTaskSchema, marketingJson, filePath } from "./marketing/client";
import { z } from "zod";

/** Reuse FastAPI's durable task and FFmpeg pipeline; no Veo request is made. */
export async function requestLocalMedia(kind: "image" | "video", spec: BrandSpec, image: string | null) {
  const source = image || spec.assets.heroImage;
  if (!source || source.startsWith("/assets/")) throw new Error("请先上传 JPG、PNG 或 WebP 产品照片，再生成海报或 FFmpeg 视频。");
  const response = await fetch(source);
  if (!response.ok) throw new Error("产品图片无法读取，请重新上传。");
  const blob = await response.blob();
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new Error("营销合成只支持 JPG、PNG 或 WebP 产品照片。");
  const data = new FormData();
  data.set("images", new File([blob], "product." + (blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1]), { type: blob.type }));
  data.set("product_name", spec.brand.name.slice(0, 200));
  data.set("description", spec.campaign.prompt.slice(0, 2000));
  data.set("style", "简约高级"); data.set("platform", "短视频");
  data.set("model_id", "brand-spec"); data.set("brand_spec_json", JSON.stringify(spec));
  data.set("poster_mode", "local"); data.set("video_mode", "local"); data.set("voiceover", kind === "video" ? "true" : "false");
  const created = await marketingJson("generations", z.object({ task_id: z.string().regex(/^[a-f0-9]{32}$/) }), { method: "POST", body: data, signal: AbortSignal.timeout(30000) });
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const task = await marketingJson("generations/" + created.task_id, MarketingTaskSchema, { signal: AbortSignal.timeout(16000) });
    const url = kind === "image" ? task.poster_url : task.video_url;
    if (url && (kind === "image" || task.status === "completed")) return { url: filePath(url), kind, model: kind === "image" ? "local-poster · 产品原图排版" : `local-ffmpeg · 5秒图片动效视频 · ${task.audio_url ? "AI配音" : "无配音"}` };
    if (task.status === "failed" || task.status === "completed") throw new Error(task.error_message || "任务已结束，但没有生成所需文件。");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("本地素材任务仍在处理中；请在营销素材工作台查询任务 " + created.task_id + "，不要重复提交。");
}
