import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrandSpecSchema, type BrandSpec } from "../brand-spec";
import { publicOrigin } from "./origin";

export const SITE_ID = /^[a-f0-9]{32}$/;
export const OWNER_TOKEN = /^[a-f0-9]{64}$/;
export const SITE_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;
export const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
type RecordData = {
  id: string;
  projectId: string;
  ownerId: string;
  slug: string;
  tokenHash: string;
  url: string;
  published: boolean;
  version: number;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
  spec: BrandSpec;
};
export class PublishError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function publishDirectory() { return path.resolve(process.env.MORPHSITE_PUBLISH_DIR || path.join(process.cwd(), ".morphsite-published")); }
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const summary = (record: RecordData) => ({
  id: record.id,
  projectId: record.projectId,
  slug: record.slug,
  url: record.url,
  published: record.published,
  version: record.version,
  publishedAt: record.publishedAt,
  updatedAt: record.updatedAt,
});
async function readRecord(id: string): Promise<RecordData | null> {
  if (!SITE_ID.test(id)) return null;
  try {
    const record = JSON.parse(await readFile(path.join(publishDirectory(), id + ".json"), "utf8")) as RecordData;
    if (record.id !== id || !OWNER_TOKEN.test(record.tokenHash)) return null;
    // Backward-compatible migration for local publications created before slug support.
    record.slug ||= new URL(record.url).pathname.match(/^\/s\/([^/]+)$/)?.[1] ?? record.id;
    record.projectId ||= record.id;
    record.ownerId ||= record.tokenHash;
    record.publishedAt ||= record.createdAt;
    if (!SITE_SLUG.test(record.slug) || !PROJECT_ID.test(record.projectId) || !OWNER_TOKEN.test(record.ownerId)) return null;
    record.spec = BrandSpecSchema.parse(record.spec);
    publicOrigin(new URL(record.url).origin);
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PublishError("发布记录无法读取，请检查持久磁盘。", 500);
  }
}
function authorize(record: RecordData | null, token: string): asserts record is RecordData {
  if (!record) throw new PublishError("网站不存在。", 404);
  if (!OWNER_TOKEN.test(token) || !timingSafeEqual(Buffer.from(hash(token), "hex"), Buffer.from(record.tokenHash, "hex"))) throw new PublishError("网站管理凭证无效。", 403);
}
async function locked<T>(id: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(publishDirectory(), { recursive: true });
  const filename = path.join(publishDirectory(), id + ".lock");
  let lock;
  try { lock = await open(filename, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new PublishError("此网站正在发布，请稍后再试。", 409);
    throw error;
  }
  try { return await operation(); }
  finally { await lock.close(); await unlink(filename).catch(() => undefined); }
}
async function save(record: RecordData) {
  const directory = publishDirectory();
  const history = path.join(directory, record.id);
  const slugDirectory = path.join(directory, "slugs");
  await mkdir(history, { recursive: true });
  await mkdir(slugDirectory, { recursive: true });
  const serialized = JSON.stringify(record);
  // Latest record is atomic; historical snapshots are kept independently.
  const temporary = path.join(directory, record.id + "." + randomBytes(8).toString("hex") + ".tmp");
  try {
    await writeFile(temporary, serialized);
    await writeFile(path.join(history, record.version + ".json"), serialized);
    await rename(temporary, path.join(directory, record.id + ".json"));
    await writeFile(path.join(slugDirectory, record.slug + ".json"), JSON.stringify({ id: record.id }));
  } finally { await unlink(temporary).catch(() => undefined); }
}

function slugBase(name: string) {
  return name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "site";
}

async function createSlug(name: string) {
  const directory = path.join(publishDirectory(), "slugs");
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = `${slugBase(name)}-${randomBytes(5).toString("hex")}`;
    try { await readFile(path.join(directory, slug + ".json")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return slug;
      throw error;
    }
  }
  throw new PublishError("无法创建唯一网址，请稍后重试。", 503);
}
/** Snapshot raster assets into the publication, independently of temporary uploads. */
export async function snapshotAssets(input: BrandSpec): Promise<BrandSpec> {
  const spec = BrandSpecSchema.parse(input);
  const cache = new Map<string, string>();
  async function asset(source: string): Promise<string> {
    if (cache.has(source)) return cache.get(source)!;
    if (source.startsWith("data:image/")) return source;
    let filename: string;
    if (source.startsWith("/assets/")) {
      const root = path.resolve(process.cwd(), "public/assets");
      filename = path.resolve(process.cwd(), "public", "." + source);
      if (!filename.startsWith(root + path.sep)) throw new PublishError("公开素材路径无效。");
    } else if (/^\/api\/brand\/media\/[a-f0-9]{32}\.(png|jpeg|jpg|webp)$/.test(source)) filename = path.join(process.cwd(), ".morphsite-media", path.basename(source));
    else throw new PublishError("外部或临时图片不能持久发布，请下载后重新上传 JPG、PNG 或 WebP 素材。");
    // Bundled SVGs are trusted source assets, never user supplied SVG.
    if (source.startsWith("/assets/") && path.extname(filename) === ".svg") { await readFile(filename); return source; }
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[path.extname(filename).toLowerCase()];
    if (!mime) throw new PublishError("发布只支持 JPG、PNG、WebP 产品素材。");
    let bytes: Buffer;
    try { bytes = await readFile(filename); } catch { throw new PublishError("产品素材已丢失，请重新上传后发布。"); }
    const value = "data:" + mime + ";base64," + bytes.toString("base64");
    if (value.length > 2_000_000) throw new PublishError("产品图片过大，请压缩后重新上传。");
    cache.set(source, value); return value;
  }
  spec.assets = { ...spec.assets, ...(spec.assets.heroImage ? { heroImage: await asset(spec.assets.heroImage) } : {}), gallery: await Promise.all(spec.assets.gallery.map(asset)) };
  return BrandSpecSchema.parse(spec);
}
export async function publishWebsite(spec: BrandSpec, origin: string, existing?: { id: string; token: string }, projectId = "anonymous") {
  publicOrigin(origin);
  if (!PROJECT_ID.test(projectId)) throw new PublishError("项目 ID 无效。");
  const id = existing?.id ?? randomBytes(16).toString("hex");
  if (!SITE_ID.test(id)) throw new PublishError("网站 ID 无效。");
  return locked(id, async () => {
    const previous = await readRecord(id);
    if (existing) authorize(previous, existing.token);
    const token = existing?.token ?? randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    const legacyProject = previous?.projectId === previous?.id;
    if (previous && !legacyProject && previous.projectId !== projectId && projectId !== "anonymous") throw new PublishError("该发布记录不属于当前项目。", 403);
    const slug = previous?.slug ?? await createSlug(spec.brand.name);
    const record: RecordData = {
      id,
      projectId: previous && !legacyProject ? previous.projectId : projectId,
      ownerId: previous?.ownerId ?? hash(token),
      slug,
      tokenHash: hash(token),
      url: previous?.url ?? origin + "/s/" + slug,
      published: true,
      version: (previous?.version ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      publishedAt: previous?.publishedAt ?? now,
      updatedAt: now,
      spec: await snapshotAssets(spec),
    };
    await save(record); return { ...summary(record), token };
  });
}
export async function publicationStatus(id: string, token: string) {
  const record = await readRecord(id); authorize(record, token); return summary(record);
}
export async function unpublishWebsite(id: string, token: string) {
  if (!SITE_ID.test(id)) throw new PublishError("网站 ID 无效。");
  return locked(id, async () => {
    const record = await readRecord(id); authorize(record, token);
    if (record.published) { record.published = false; record.version++; record.updatedAt = new Date().toISOString(); await save(record); }
    return summary(record);
  });
}
export async function publishedWebsite(id: string) {
  const record = await readRecord(id);
  return record?.published ? { ...summary(record), spec: record.spec } : null;
}

export async function publishedWebsiteBySlug(slug: string) {
  if (!SITE_SLUG.test(slug)) return null;
  try {
    const index = JSON.parse(await readFile(path.join(publishDirectory(), "slugs", slug + ".json"), "utf8")) as { id?: unknown };
    if (typeof index.id !== "string" || !SITE_ID.test(index.id)) return null;
    const record = await readRecord(index.id);
    return record?.published && record.slug === slug ? { ...summary(record), spec: record.spec } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PublishError("发布索引无法读取，请检查持久存储。", 500);
  }
}
