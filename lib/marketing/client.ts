import { z } from "zod";

const fileUrl = z.string().regex(/^\/api\/files\/[a-f0-9]{32}_(poster\.png|video\.mp4|voice\.wav)$/);
const audioFileUrl = z.string().regex(/^\/api\/files\/[a-f0-9]{32}_voice\.wav$/);
export const MarketingTaskSchema = z.object({
  task_id: z.string().regex(/^[a-f0-9]{32}$/),
  component_status: z.record(z.string(), z.string()).default({}),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  stage: z.enum(["analysis", "copywriting", "audio", "poster", "video", "completed"]),
  poster_url: fileUrl.nullable(), video_url: fileUrl.nullable(), audio_url: audioFileUrl.nullable().optional(), project_id: z.string().regex(/^[a-f0-9]{32}$/).nullable().optional(),
  copy_text: z.array(z.string()).max(3), error_message: z.string().nullable(),
  mock_mode: z.boolean(), copy_is_mock: z.boolean(),
  poster_model: z.string().nullable(), model_name: z.string().nullable(),
  ffmpeg_available: z.boolean().default(true), google_image: z.boolean().default(false), google_video: z.boolean().default(false), copy_is_google: z.boolean().default(false), audio_mode: z.string().default("none"), poster_provider: z.string().default("local-template"), video_provider: z.string().default("local-ffmpeg"), copy_provider: z.string().default("mock"),
});
export type MarketingTask = z.infer<typeof MarketingTaskSchema>;
export const MarketingModelSchema = z.object({ id: z.string(), name: z.string(), configured: z.boolean(), is_mock: z.boolean() });
export const MarketingConfigSchema = z.object({ poster_mode: z.enum(["local", "ai", "google"]), poster_model: z.string().nullable(), poster_configured: z.boolean(), video_mode: z.string(), google_image_configured: z.boolean().default(false), google_video_configured: z.boolean().default(false), google_text_configured: z.boolean().default(false), google_text_model: z.string().nullable().optional(), google_tts_configured: z.boolean().default(false), google_tts_model: z.string().nullable().optional(), google_sdk: z.string().optional(), google_capabilities: z.object({ text: z.boolean(), image: z.boolean(), video: z.boolean(), tts: z.boolean() }).optional(), google_video_duration_seconds: z.number().nullable().optional(), google_video_max_cost_usd: z.number().nullable().optional(), bailian: z.object({ credentials_configured: z.boolean(), application_key: z.boolean(), region: z.string(), text_model: z.string(), image_model: z.string(), i2v_model: z.string(), t2v_model: z.string(), tts_model: z.string(), capabilities: z.object({ text: z.boolean(), image: z.boolean(), video: z.boolean(), tts: z.boolean() }) }).optional(), ffmpeg_available: z.boolean().default(true) });


export function filePath(path: string) { return path.replace(/^\/api\/files\//, "/api/marketing/files/"); }
export async function marketingJson<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`/api/marketing/${path}`, { ...init, cache: "no-store" }); }
  catch { throw new Error("无法连接营销素材服务。请检查网络或启动 FastAPI 后端。"); }
  if (!res.ok) {
    let message = `营销服务请求失败（${res.status}）`;
    try { const data: unknown = await res.json(); if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") message = data.detail; } catch { /* use status */ }
    throw new Error(message);
  }
  return schema.parse(await res.json());
}
