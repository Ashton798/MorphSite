import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { demoBrandSpec, replaceWebsiteTitle } from "../lib/brand-spec";
import { publicOrigin, verifyPublicUrl } from "../lib/publishing/origin";
import { publishWebsite, publishedWebsite, publishedWebsiteBySlug, publicationStatus, unpublishWebsite } from "../lib/publishing/store";
import { GET as qr } from "../app/api/publish/qr/route";
import { POST as publishApi, DELETE as unpublishApi } from "../app/api/publish/route";
import { POST as editApi } from "../app/api/brand/edit/route";
import { initialStudioState, SavedWorkspaceSchema, studioReducer } from "../lib/studio-state";

test("public URLs reject loopback, private hosts and credentials", () => {
  for (const value of ["http://localhost:3000", "https://localhost", "https://127.0.0.1", "https://192.168.1.10", "https://172.16.0.1", "https://[::1]", "https://app.local", "https://user:secret@shop.company.com", "https://shop.company.com/path"]) assert.throws(() => publicOrigin(value));
  assert.equal(publicOrigin("https://shop.company.com"), "https://shop.company.com");
});

test("public readiness performs one bounded HTTPS check and rejects redirects", async () => {
  const previousFetch = globalThis.fetch;
  const previousProbe = process.env.MORPHSITE_PUBLIC_PROBE;
  process.env.MORPHSITE_PUBLIC_PROBE = "on";
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response("ok", { status: 200 }); };
    await verifyPublicUrl("https://shop.company.com");
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: "https://other.company.com" } });
    await assert.rejects(verifyPublicUrl("https://shop.company.com"), /HTTP 302/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProbe === undefined) delete process.env.MORPHSITE_PUBLIC_PROBE; else process.env.MORPHSITE_PUBLIC_PROBE = previousProbe;
  }
});

test("publication lifecycle: durable uploads, stable URL, ownership, QR and unpublish", async () => {
  const root = path.resolve("test-results/publishing");
  const directory = path.join(root, randomUUID());
  await mkdir(directory, { recursive: true });
  const original = { directory: process.env.MORPHSITE_PUBLISH_DIR, origin: process.env.PUBLIC_SITE_URL, probe: process.env.MORPHSITE_PUBLIC_PROBE };
  process.env.MORPHSITE_PUBLISH_DIR = directory;
  // Fixture URL only: no DNS/hosting is asserted by this in-process test.
  process.env.PUBLIC_SITE_URL = "https://shop.company.com";
  process.env.MORPHSITE_PUBLIC_PROBE = "off";
  try {
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvZkAAAAASUVORK5CYII=";
    const spec = { ...demoBrandSpec, assets: { ...demoBrandSpec.assets, heroImage: image, gallery: [image] } };
    const projectId = "project-void-coffee";
    const createdResponse = await publishApi(new Request("http://localhost/api/publish", { method: "POST", body: JSON.stringify({ spec, projectId }) }));
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json();
    assert.match(created.url, /^https:\/\/shop.company.com\/s\/void-coffee-[a-f0-9]{10}$/);
    assert.equal(created.projectId, projectId);
    assert.equal((await publishedWebsiteBySlug(created.slug))?.spec.brand.name, "VOID COFFEE");
    assert.equal((await publishedWebsite(created.id))?.spec.assets.heroImage, image);
    assert.equal(JSON.parse(await readFile(path.join(directory, created.id + ".json"), "utf8")).tokenHash.includes(created.token), false);
    await assert.rejects(publicationStatus(created.id, "0".repeat(64)), /凭证/);
    const forbidden = await publishApi(new Request("http://localhost/api/publish", { method: "POST", body: JSON.stringify({ id: created.id, projectId, spec }) }));
    assert.equal(forbidden.status, 403);
    const changed = replaceWebsiteTitle(spec, "周末，来喝一杯。");
    const second = await publishWebsite(changed, "https://another.company.com", { id: created.id, token: created.token }, projectId);
    assert.equal(second.url, created.url);
    assert.equal(second.version, 2);
    assert.equal((await publishedWebsite(created.id))?.spec.website.title, changed.website.title);
    assert.equal(second.slug, created.slug);
    await assert.rejects(publishWebsite(changed, "https://another.company.com", { id: created.id, token: created.token }, "another-project"), /不属于当前项目/);
    // This proves the actual encoder's payload, not a physical phone scan.
    const encoded = QRCode.create(second.url).segments.map(segment => typeof segment.data === "string" ? segment.data : Buffer.from(segment.data as Uint8Array).toString("utf8")).join("");
    assert.equal(encoded, second.url);
    const png = await qr(new Request("http://localhost/api/publish/qr?id=" + created.id + "&download=1"));
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("Content-Type"), "image/png");
    assert.ok(png.headers.get("Content-Disposition")?.startsWith("attachment"));
    assert.equal(Buffer.from(await png.arrayBuffer()).subarray(0,8).toString("hex"), "89504e470d0a1a0a");
    const removed = await unpublishApi(new Request("http://localhost/api/publish?id=" + created.id, { method: "DELETE", headers: { Authorization: "Bearer " + created.token } }));
    assert.equal(removed.status, 200);
    assert.equal(await publishedWebsite(created.id), null);
    assert.equal((await qr(new Request("http://localhost/api/publish/qr?id=" + created.id))).status, 404);
    const restored = await publishWebsite(changed, "https://another.company.com", { id: created.id, token: created.token }, projectId);
    assert.equal(restored.url, created.url);
    assert.ok(await readFile(path.join(directory, created.id, "1.json")));
  } finally {
    if (original.directory === undefined) delete process.env.MORPHSITE_PUBLISH_DIR; else process.env.MORPHSITE_PUBLISH_DIR = original.directory;
    if (original.origin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = original.origin;
    if (original.probe === undefined) delete process.env.MORPHSITE_PUBLIC_PROBE; else process.env.MORPHSITE_PUBLIC_PROBE = original.probe;
    assert.ok(directory.startsWith(root + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing public origin never creates a localhost publication", async () => {
  const saved = process.env.PUBLIC_SITE_URL;
  delete process.env.PUBLIC_SITE_URL;
  try {
    const response = await publishApi(new Request("http://localhost/api/publish", { method: "POST", body: JSON.stringify({ spec: demoBrandSpec, projectId: "test-project" }) }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /PUBLIC_SITE_URL/);
  } finally { if (saved !== undefined) process.env.PUBLIC_SITE_URL = saved; }
});

test("title and color edits work without calling a paid or unavailable model", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No provider should be called"); };
  try {
    for (const prompt of ["把标题改成周末咖啡节", "改成粉色"]) {
      const response = await editApi(new Request("http://localhost/api/brand/edit", { method: "POST", body: JSON.stringify({ spec: demoBrandSpec, prompt }) }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.model, "local-editor");
      assert.equal(prompt === "改成粉色" ? result.spec.theme.id : result.spec.website.title, prompt === "改成粉色" ? "soft-minimal" : "周末咖啡节");
    }
  } finally { globalThis.fetch = fetchBefore; }
});

test("layout and history survive saving, restoring and undo with publication identity", () => {
  let state = studioReducer(initialStudioState, { type: "generated", spec: demoBrandSpec, prompt: "coffee", message: "fixture" });
  const id = state.draft.documentId;
  state = studioReducer(state, { type: "layout", layout: "product-first" });
  state = studioReducer(state, { type: "theme", theme: "soft-minimal" });
  assert.equal(state.draft.documentId, id);
  const restored = studioReducer(initialStudioState, { type: "restore", saved: SavedWorkspaceSchema.parse({ version: 1, draft: state.draft, history: state.history, messages: state.messages }) });
  assert.equal(restored.history.length, 3);
  assert.equal(studioReducer(restored, { type: "undo" }).draft.spec?.theme.id, "noir-luxury");
  const historical = studioReducer(restored, { type: "history", index: 1 });
  assert.equal(historical.draft.documentId, id);
  assert.equal(historical.draft.spec?.website.layout, demoBrandSpec.website.layout);
});
