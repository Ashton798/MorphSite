import { NextResponse } from "next/server";
import { resolveMediaPath } from "@/lib/ai/media-storage";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentType(filename: string): string {
  if (filename.endsWith(".mp4")) return "video/mp4";
  if (filename.endsWith(".wav")) return "audio/wav";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const resolved = resolveMediaPath(filename);
  if (!resolved) return NextResponse.json({ ok: false, error: "无效的媒体文件。" }, { status: 400 });
  try {
    const bytes = await readFile(resolved);
    return new Response(bytes, { headers: { "Content-Type": contentType(filename), "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "媒体文件不存在。" }, { status: 404 });
  }
}
