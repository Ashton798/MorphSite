import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return Response.json({ detail: "项目 ID 无效" }, { status: 400 });
  return relayJson(await backendRequest(`/api/projects/${id}`));
}
