import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ detail: "请求格式不正确" }, { status: 400 }); }
  if (JSON.stringify(body).length > 120_000) return Response.json({ detail: "对话过长" }, { status: 413 });
  return relayJson(await backendRequest("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
