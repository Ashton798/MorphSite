import assert from "node:assert/strict";
import { test } from "node:test";
import { BrandSpecSchema, ImageSourceSchema, applyDemoPrompt, cloneBrandSpec, demoBrandSpec, makeUploadedAssetSpec, setBrandTheme, themePresets } from "../lib/brand-spec";
import { initialStudioState, SavedWorkspaceSchema, studioReducer } from "../lib/studio-state";
import { websiteRegistry } from "../lib/website-registry";

const image = "data:image/png;base64,iVBORw0KGgo=";

test("demo validates and every section has a registered component", () => {
  assert.equal(BrandSpecSchema.safeParse(demoBrandSpec).success, true);
  for (const section of demoBrandSpec.website.sections) assert.equal(typeof websiteRegistry[section.type], "function");
  assert.equal(Object.keys(websiteRegistry).length, 6);
});

test("all themes validate and preserve the rest of the document", () => {
  for (const theme of Object.values(themePresets)) {
    const changed = setBrandTheme(demoBrandSpec, theme.id);
    assert.deepEqual(changed.brand, demoBrandSpec.brand);
    assert.deepEqual(changed.assets, demoBrandSpec.assets);
    assert.deepEqual(changed.website, demoBrandSpec.website);
    assert.equal(BrandSpecSchema.safeParse(changed).success, true);
  }
});

test("pink changes actual theme tokens without modifying brand, brief, sections or assets", () => {
  const original = makeUploadedAssetSpec(demoBrandSpec, image);
  const result = applyDemoPrompt(original, "改成粉色");
  assert.equal(result.changed, true);
  assert.equal(result.spec.theme.palette.accent, "#e66c93");
  assert.notEqual(result.spec.theme.palette.canvas, original.theme.palette.canvas);
  const { theme: _before, ...before } = original;
  const { theme: _after, ...after } = result.spec;
  assert.deepEqual(after, before);
  assert.equal(original.theme.id, "noir-luxury");
});

test("title update preserves unrelated data, including theme, image and brief", () => {
  const original = setBrandTheme(makeUploadedAssetSpec(demoBrandSpec, image), "soft-minimal");
  const result = applyDemoPrompt(original, "把标题改成周末咖啡节");
  assert.equal(result.spec.website.title, "周末咖啡节");
  assert.equal(result.spec.website.sections[0].title, "周末咖啡节");
  assert.equal(result.spec.poster.title, "周末咖啡节");
  assert.deepEqual(result.spec.website.sections.slice(1), original.website.sections.slice(1));
  for (const key of ["brand", "campaign", "theme", "assets", "video"] as const) assert.deepEqual(result.spec[key], original[key]);
});

test("title containing pink is parsed as a title, not a theme command", () => {
  const result = applyDemoPrompt(demoBrandSpec, "把标题改成粉色咖啡节");
  assert.equal(result.spec.website.title, "粉色咖啡节");
  assert.equal(result.spec.theme.id, "noir-luxury");
});

test("unknown, negated and invalid commands do not change the spec", () => {
  for (const prompt of ["不要改成粉色", "给我自动发布到互联网", "", "把标题改成“”", `把标题改成${"a".repeat(161)}`]) {
    const result = applyDemoPrompt(demoBrandSpec, prompt);
    assert.equal(result.changed, false);
    assert.deepEqual(result.spec, demoBrandSpec);
  }
});

test("schema rejects malformed colors, image injection, missing / duplicate sections", () => {
  assert.equal(ImageSourceSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(ImageSourceSchema.safeParse("data:image/svg+xml;base64,PHN2Zz4=").success, false);
  const badColor = cloneBrandSpec(demoBrandSpec);
  badColor.theme.palette.accent = "url(https://example.com)";
  assert.equal(BrandSpecSchema.safeParse(badColor).success, false);
  const duplicate = cloneBrandSpec(demoBrandSpec);
  duplicate.website.sections.push(duplicate.website.sections[0]);
  assert.equal(BrandSpecSchema.safeParse(duplicate).success, false);
  assert.equal(BrandSpecSchema.safeParse({ ...demoBrandSpec, website: { ...demoBrandSpec.website, sections: [] } }).success, false);
});

test("demo generation records the submitted brief and stays clearly labelled", () => {
  const state = studioReducer(initialStudioState, { type: "generate", prompt: "一个独立花店的春季活动", image });
  assert.equal(state.draft.spec?.campaign.status, "demo");
  assert.equal(state.draft.spec?.campaign.prompt, "一个独立花店的春季活动");
  assert.equal(state.draft.spec?.assets.heroImage, image);
  assert.ok(state.messages.at(-1)?.text.includes("本地演示品牌"));
});

test("a model-generated spec is committed as one undoable snapshot", () => {
  const spec = cloneBrandSpec(demoBrandSpec);
  spec.brand.name = "WEEKEND BREW";
  spec.campaign.status = "ready";
  spec.website.title = "周末咖啡节";
  spec.website.sections[0].title = "周末咖啡节";
  spec.poster.title = "周末咖啡节";
  const state = studioReducer(initialStudioState, { type: "generated", spec, prompt: "一家咖啡店", message: "已生成品牌世界。" });
  assert.equal(state.draft.spec?.brand.name, "WEEKEND BREW");
  assert.equal(state.draft.image, spec.assets.heroImage ?? null);
  assert.equal(state.messages.at(-1)?.text, "已生成品牌世界。");
  assert.equal(state.messages.at(-2)?.text, "一家咖啡店");
  const undone = studioReducer(state, { type: "undo" });
  assert.deepEqual(undone.draft, initialStudioState.draft);
});

test("AI edits commit once and no-op edits never consume undo history", () => {
  const generated = studioReducer(initialStudioState, { type: "generate", prompt: "" });
  const changed = cloneBrandSpec(demoBrandSpec);
  changed.theme = structuredClone(themePresets["bold-future"]);
  const applied = studioReducer(generated, { type: "applied", spec: changed, message: "换成未来感主题。", prompt: "换成科技感" });
  assert.equal(applied.draft.spec?.theme.id, "bold-future");
  assert.equal(applied.history.length, generated.history.length + 1);
  const same = studioReducer(applied, { type: "applied", spec: applied.draft.spec!, message: "没有可改的地方。", prompt: "给我做一部电影" });
  assert.equal(same.history.length, applied.history.length);
  assert.deepEqual(same.draft, applied.draft);
  assert.equal(same.messages.at(-1)?.text, "没有可改的地方。");
  const failed = studioReducer(same, { type: "failed", prompt: "再改一次", message: "超时了。上一版作品已保留。" });
  assert.deepEqual(failed.draft, same.draft);
  assert.equal(failed.history.length, same.history.length);
  assert.ok(failed.messages.at(-1)?.text.includes("已保留"));
});

test("undo is a complete snapshot for title, theme, upload and first generation", () => {
  const generated = studioReducer(initialStudioState, { type: "generate", prompt: "", demo: true });
  const pink = studioReducer(generated, { type: "prompt", prompt: "改成粉色" });
  const title = studioReducer(pink, { type: "prompt", prompt: "把标题改成周末咖啡节" });
  const uploaded = studioReducer(title, { type: "upload", image });
  const u1 = studioReducer(uploaded, { type: "undo" });
  assert.deepEqual(u1.draft, title.draft);
  const u2 = studioReducer(u1, { type: "undo" });
  assert.deepEqual(u2.draft, pink.draft);
  const u3 = studioReducer(u2, { type: "undo" });
  assert.deepEqual(u3.draft, generated.draft);
  const u4 = studioReducer(u3, { type: "undo" });
  assert.deepEqual(u4.draft, initialStudioState.draft);
  assert.strictEqual(studioReducer(u4, { type: "undo" }), u4);
});

test("unknown commands and unchanged themes do not consume undo history", () => {
  const generated = studioReducer(initialStudioState, { type: "generate", prompt: "" });
  const same = studioReducer(generated, { type: "theme", theme: "noir-luxury" });
  assert.strictEqual(same, generated);
  const unknown = studioReducer(generated, { type: "prompt", prompt: "制作全新音乐" });
  assert.deepEqual(unknown.draft, generated.draft);
  assert.equal(unknown.history.length, generated.history.length);
});

test("drafts are schema validated at the restore boundary", () => {
  const generated = studioReducer(initialStudioState, { type: "generate", prompt: "" });
  const saved = SavedWorkspaceSchema.parse({ version: 1, draft: generated.draft, messages: generated.messages });
  const restored = studioReducer(initialStudioState, { type: "restore", saved });
  assert.deepEqual(restored.draft, generated.draft);
  assert.deepEqual(restored.history, []);
  assert.equal(SavedWorkspaceSchema.safeParse({ ...saved, version: 2 }).success, false);
});

test("history, gallery and chat have finite limits", () => {
  let state = studioReducer(initialStudioState, { type: "generate", prompt: "" });
  for (let i = 0; i < 80; i++) state = studioReducer(state, { type: "prompt", prompt: `把标题改成活动 ${i}` });
  assert.equal(state.history.length, 12);
  assert.equal(state.messages.length, 60);
  for (let i = 0; i < 6; i++) state = studioReducer(state, { type: "upload", image });
  assert.equal(state.draft.spec?.assets.gallery.length, 4);
});
