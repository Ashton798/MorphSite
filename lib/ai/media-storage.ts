import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const MEDIA_DIR = path.join(process.cwd(), ".morphsite-media");
const MEDIA_NAME = /^[a-f0-9]{32}\.(?:png|jpeg|jpg|webp|mp4|wav)$/i;

export type StoredMedia = { filename: string; url: string; mimeType: string };

function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "video/mp4") return "mp4";
  return "png";
}

export async function storeMedia(bytes: Uint8Array, mimeType: string): Promise<StoredMedia> {
  const filename = `${randomBytes(16).toString("hex")}.${extensionFor(mimeType)}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, filename), bytes);
  return { filename, mimeType, url: `/api/brand/media/${filename}` };
}

export function resolveMediaPath(filename: string): string | null {
  if (!MEDIA_NAME.test(filename)) return null;
  return path.join(MEDIA_DIR, filename);
}

export async function readStoredMedia(filename: string): Promise<Buffer | null> {
  const resolved = resolveMediaPath(filename);
  if (!resolved) return null;
  try { return await readFile(resolved); } catch { return null; }
}

export async function withTempMedia<T>(extension: string, action: (filename: string) => Promise<T>): Promise<T> {
  const filename = path.join(tmpdir(), `morphsite-${randomBytes(12).toString("hex")}.${extension}`);
  try { return await action(filename); } finally { await unlink(filename).catch(() => undefined); }
}
