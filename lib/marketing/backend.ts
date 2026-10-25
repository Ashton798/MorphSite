import "server-only";

const BACKEND = process.env.MARKETING_BACKEND_URL || "http://127.0.0.1:8002";

export function backendUrl(path: string) {
  const url = new URL(BACKEND);
  if (!(["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash)) throw new Error("营销后端地址配置无效");
  return new URL(path, `${url.origin}/`).toString();
}

export async function backendRequest(path: string, init?: RequestInit) {
  try {
    return await fetch(backendUrl(path), { ...init, cache: "no-store", signal: AbortSignal.timeout(init?.method === "POST" ? 90000 : 16000) });
  } catch {
    return Response.json({ detail: "营销素材服务未启动。请启动 FastAPI 后端，或检查 MARKETING_BACKEND_URL。" }, { status: 503 });
  }
}

export function relayJson(response: Response) {
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
