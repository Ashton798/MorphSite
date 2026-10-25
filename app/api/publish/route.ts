import { BrandSpecSchema } from "@/lib/brand-spec";
import { publishingOrigin, verifyPublicUrl } from "@/lib/publishing/origin";
import { publicationStatus, publishWebsite, unpublishWebsite, PROJECT_ID, PublishError, SITE_ID } from "@/lib/publishing/store";
import { clientKey, rateLimit } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const message = error instanceof PublishError ? error.message : "发布配置或持久存储不可用，请检查 PUBLIC_SITE_URL 和磁盘权限。";
  return Response.json({ error: message }, { status: error instanceof PublishError ? error.status : 503, headers });
}
function token(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""; }
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) { try { return Response.json(await publicationStatus(id, token(request)), { headers }); } catch (error) { return failure(error); } }
  try {
    const origin = publishingOrigin();
    await verifyPublicUrl(origin);
    return Response.json({ configured: true, verified: true, origin, storage: "persistent-disk" }, { headers });
  }
  catch (error) { return Response.json({ configured: false, reason: error instanceof Error ? error.message : "发布配置缺失。" }, { headers }); }
}
export async function POST(request: Request) {
  const limited = rateLimit("publish:" + clientKey(request), 12);
  if (!limited.ok) return Response.json({ error: "发布过于频繁，请稍后再试。" }, { status: 429, headers });
  try {
    let origin; try { origin = publishingOrigin(); } catch (error) { throw new PublishError(error instanceof Error ? error.message : "发布配置无效。", 503); }
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 12_000_000) throw new PublishError("网站素材总量过大。", 413);
    let body; try { body = JSON.parse(raw); } catch { throw new PublishError("请求 JSON 无效。"); }
    const checked = BrandSpecSchema.safeParse(body?.spec);
    if (!checked.success) throw new PublishError("网站数据未通过 BrandSpec 校验。");
    if (body.id !== undefined && (typeof body.id !== "string" || !SITE_ID.test(body.id))) throw new PublishError("网站 ID 无效。");
    if (typeof body.projectId !== "string" || !PROJECT_ID.test(body.projectId)) throw new PublishError("项目 ID 无效。");
    await verifyPublicUrl(origin);
    const result = await publishWebsite(checked.data, origin, body.id ? { id: body.id, token: token(request) } : undefined, body.projectId);
    return Response.json({ ...result, originVerified: true, path: "/s/" + result.slug }, { headers });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { return Response.json(await unpublishWebsite(new URL(request.url).searchParams.get("id") ?? "", token(request)), { headers }); }
  catch (error) { return failure(error); }
}
