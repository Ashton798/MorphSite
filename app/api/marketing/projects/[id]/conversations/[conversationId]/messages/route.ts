import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{32}$/.test(conversationId)) return Response.json({ detail: "项目或会话 ID 无效" }, { status: 400 });
  return relayJson(await backendRequest(`/api/projects/${id}/conversations/${conversationId}/messages`));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{32}$/.test(conversationId)) return Response.json({ detail: "项目或会话 ID 无效" }, { status: 400 });
  const raw = await request.text();
  if (raw.length > 20_000) return Response.json({ detail: "消息过长" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ detail: "请求格式不正确" }, { status: 400 }); }
  return relayJson(await backendRequest(`/api/projects/${id}/conversations/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
