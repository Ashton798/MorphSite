import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return Response.json({ detail: "项目 ID 无效" }, { status: 400 });
  return relayJson(await backendRequest(`/api/projects/${id}/brand-specs`));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return Response.json({ detail: "项目 ID 无效" }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 2_600_000) return Response.json({ detail: "BrandSpec 过大" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 2_600_000) return Response.json({ detail: "BrandSpec 过大" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ detail: "请求格式不正确" }, { status: 400 }); }
  return relayJson(await backendRequest(`/api/projects/${id}/brand-specs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
