import { backendRequest } from "@/lib/marketing/backend";

export const runtime = "nodejs";

const outputFile = /^[a-f0-9]{32}_(?:poster\.png|video\.mp4|voice\.wav|bailian\.(?:png|mp4|wav))$/;
const assetFile = /^[a-f0-9]{32}\.(?:jpg|jpeg|png|webp)$/;

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!outputFile.test(filename) && !assetFile.test(filename)) return Response.json({ detail: "无效的产物路径" }, { status: 400 });
  const range = request.headers.get("range");
  const upstream = await backendRequest(`/api/files/${filename}`, { headers: range ? { Range: range } : {} });
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const contentType = filename.endsWith(".mp4") ? "video/mp4" : filename.endsWith(".wav") ? "audio/wav" : filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : filename.endsWith(".webp") ? "image/webp" : "image/png";
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": contentType, "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", ...(upstream.headers.get("Content-Range") ? { "Content-Range": upstream.headers.get("Content-Range")! } : {}), ...(upstream.headers.get("Content-Length") ? { "Content-Length": upstream.headers.get("Content-Length")! } : {}) } });
}
