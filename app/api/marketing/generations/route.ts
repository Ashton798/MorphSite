import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) return Response.json({ detail: "上传总大小不能超过 11 MB" }, { status: 413 });
  let data: FormData;
  try { data = await request.formData(); } catch { return Response.json({ detail: "上传格式不正确" }, { status: 400 }); }
  const images = data.getAll("images");
  if (images.length !== 1 || !(images[0] instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(images[0].type) || images[0].size > 8 * 1024 * 1024 || images[0].size === 0) {
    return Response.json({ detail: "请选择一张 8 MB 以内的 JPG、PNG 或 WebP 商品图片" }, { status: 422 });
  }
  const fields = ["product_name", "description", "style", "platform", "model_id", "brand_spec_json", "voiceover", "poster_mode", "video_mode", "project_id", "video_cost_limit_usd"] as const;
  const lengths = [200, 2000, 50, 50, 100, 2_500_000, 5, 20, 20, 32, 8];
  for (const [index, field] of fields.entries()) if (data.get(field) !== null && (typeof data.get(field) !== "string" || String(data.get(field)).length > lengths[index]!)) return Response.json({ detail: `参数 ${field} 无效` }, { status: 422 });
  for (const field of fields.slice(0, 5)) if (typeof data.get(field) !== "string") return Response.json({ detail: `参数 ${field} 无效` }, { status: 422 });
  if (data.get("voiceover") !== null && !["true", "false"].includes(String(data.get("voiceover")))) return Response.json({ detail: "配音参数无效" }, { status: 422 });
  if (data.get("poster_mode") !== null && !["", "local", "ai", "google"].includes(String(data.get("poster_mode")))) return Response.json({ detail: "海报模式参数无效" }, { status: 422 });
  if (data.get("video_mode") !== null && !["", "local", "google-veo"].includes(String(data.get("video_mode")))) return Response.json({ detail: "视频模式参数无效" }, { status: 422 });
  if (data.get("video_cost_limit_usd") !== null && !/^\d+(?:\.\d{1,2})?$/.test(String(data.get("video_cost_limit_usd")))) return Response.json({ detail: "视频预算参数无效" }, { status: 422 });
  const payload = new FormData();
  payload.set("images", images[0], images[0].name);
  for (const field of fields) if (data.get(field) !== null) payload.set(field, String(data.get(field)));
  return relayJson(await backendRequest("/api/generations", { method: "POST", body: payload }));
}
