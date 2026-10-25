import assert from "node:assert/strict";
import { test } from "node:test";
import { BrandSpecSchema, demoBrandSpec } from "../lib/brand-spec";
import { draftToBrandSpec } from "../lib/ai/draft";
import { applyOps, parseOps } from "../lib/ai/ops";
import { AiDraftSchema, AiEditSchema, BRAND_SYSTEM_PROMPT } from "../lib/ai/prompts";
import { parseJsonLoose } from "../lib/ai/client";
import { GenerateRequestSchema } from "../lib/ai/contracts";

const rawDraft = {
  brand: { name: "weekend brew", shortName: "wknd", category: "Coffee", voice: "Warm", descriptor: "Slow coffee" },
  campaign: { name: "Weekend / 01" },
  themeId: "soft-minimal",
  website: {
    title: "周末咖啡节",
    subtitle: "两天的手冲与朋友",
    sections: [
      { type: "Hero", id: "hero", eyebrow: "wknd", title: "被模型写错的标题", body: "开场正文", cta: "进来坐坐", target: "story", detail: "01 / HELLO" },
      { type: "ProductShowcase", id: "showcase", title: "本周豆单", body: "耶加雪菲", cta: "看豆单", target: "cta" },
      { type: "Story", id: "story", title: "十二亩地", body: "来自云南保山" },
      { type: "Promotion", id: "promotion", title: "周末限定", body: "只做两天", cta: "预约", target: "cta" },
      { type: "Gallery", id: "gallery", title: "现场", body: "光与蒸汽" },
      { type: "CTA", id: "cta", title: "把位置留给你", body: "周六见", cta: "加入名单" },
    ],
  },
  poster: { title: "周末咖啡节", line: "slow is a state", footnote: "WEEKEND / SAT" },
  video: { duration: "00:18", scenes: [{ number: "1", title: "第一束光", description: "暗房间" }] },
  summary: "做了个品牌",
  imagePrompt: "coffee cup, morning light",
};

test("a loose model draft is normalized into a valid, allowlisted BrandSpec", () => {
  const draft = AiDraftSchema.parse(rawDraft);
  const spec = draftToBrandSpec(draft, { prompt: "咖啡节" });
  assert.equal(BrandSpecSchema.safeParse(spec).success, true);
  assert.deepEqual(spec.website.sections.map((s) => s.type), ["Hero", "ProductShowcase", "Story", "Promotion", "Gallery", "CTA"]);
  assert.deepEqual(spec.website.sections.map((s) => s.id), ["hero", "showcase", "story", "promotion", "gallery", "cta"]);
  // Model-supplied Hero title/target can never break the "one hero matching the site title" invariant.
  assert.equal(spec.website.sections[0].title, spec.website.title);
  assert.equal(spec.website.sections[0].target, "showcase");
  assert.equal(spec.website.sections[1].target, "story");
  assert.equal(spec.brand.name, "WEEKEND BREW");
  assert.equal(spec.assets.logo, "WKND");
  assert.equal(spec.poster.line, "SLOW IS A STATE");
  assert.equal(spec.theme.palette.accent, "#e66c93");
  assert.equal(spec.video.scenes[0].number, "01");
  assert.equal(spec.campaign.status, "draft");
});

test("missing sections are filled from the fixed skeleton, unknown types are dropped", () => {
  const draft = AiDraftSchema.parse({
    ...rawDraft,
    website: { title: "只有标题", subtitle: "副标题", sections: [{ type: "Script", title: "注入 <script>" }] },
  });
  const spec = draftToBrandSpec(draft, { prompt: "x" });
  assert.equal(spec.website.sections.length, 6);
  assert.equal(spec.website.sections.filter((s) => s.title.includes("<script")).length, 0);
  assert.equal(BrandSpecSchema.safeParse(spec).success, true);
});

test("uploaded image is validated and becomes the hero asset", () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  const spec = draftToBrandSpec(AiDraftSchema.parse(rawDraft), { prompt: "x", image });
  assert.equal(spec.assets.heroImage, image);
  assert.equal(spec.campaign.status, "ready");
  assert.throws(() => draftToBrandSpec(AiDraftSchema.parse(rawDraft), { prompt: "x", image: "javascript:alert(1)" }));
});

test("invalid drafts and payloads are rejected before any rendering", () => {
  assert.equal(AiDraftSchema.safeParse({ ...rawDraft, themeId: "neon-vapor" }).success, false);
  assert.equal(AiDraftSchema.safeParse({ ...rawDraft, brand: { ...rawDraft.brand, name: "" } }).success, false);
  assert.equal(GenerateRequestSchema.safeParse({ prompt: "  " }).success, false);
  assert.equal(GenerateRequestSchema.safeParse({ prompt: "ok", image: "javascript:alert(1)" }).success, false);
});

test("edit ops are parsed from loose model output and applied as pure functions", () => {
  const parsed = parseOps([
    { op: "setTitle", title: "周末咖啡节" },
    { type: "SET_THEME", theme: "bold-future", note: null },
    { action: "change_title", title: "周末咖啡节 · 夜场" },
    { op: "deleteEverything" },
    "setCampaign",
  ]);
  // `change_title` is an accepted alias; only the unknown op and the bare "setCampaign" are rejected.
  assert.equal(parsed.rejected, 2);
  assert.deepEqual(parsed.ops.map((op) => op.op), ["setTitle", "setTheme", "setTitle"]);
  const result = applyOps(demoBrandSpec, parsed.ops);
  assert.equal(result.changed, true);
  // Ops apply in order, so the later title wins; site, hero and poster stay in sync.
  assert.equal(result.spec.website.title, "周末咖啡节 · 夜场");
  assert.equal(result.spec.poster.title, "周末咖啡节 · 夜场");
  assert.equal(result.spec.website.sections[0].title, "周末咖啡节 · 夜场");
  assert.equal(result.spec.theme.id, "bold-future");
  assert.equal(BrandSpecSchema.safeParse(result.spec).success, true);
});

test("section, poster, brand and scene edits keep the document valid", () => {
  const { ops } = parseOps([
    { op: "setSection", id: "story", body: "我们的豆子来自云南保山，只有十二亩。", cta: "去看看" },
    { op: "setPoster", title: "慢一点", line: "slow is a state" },
    { op: "setBrand", name: "WEEKEND BREW", shortName: "WKND" },
    { op: "setScene", number: "02", title: "注水" },
    { op: "setImagePrompt", imagePrompt: "coffee, morning light" },
  ]);
  const result = applyOps(demoBrandSpec, ops);
  assert.equal(result.spec.website.sections[2].body, "我们的豆子来自云南保山，只有十二亩。");
  assert.equal(result.spec.website.sections[2].cta, "去看看");
  assert.equal(result.spec.poster.title, "慢一点");
  assert.equal(result.spec.poster.line, "SLOW IS A STATE");
  assert.equal(result.spec.brand.name, "WEEKEND BREW");
  assert.equal(result.spec.assets.logo, "WKND");
  assert.equal(result.spec.video.scenes[1].title, "注水");
  assert.equal(result.imagePrompt, "coffee, morning light");
  assert.equal(BrandSpecSchema.safeParse(result.spec).success, true);
  // An empty op list is a no-op, never a rewrite of the document.
  assert.equal(applyOps(demoBrandSpec, []).changed, false);
});

test("unknown ops and invalid values cannot change the document", () => {
  const { ops } = parseOps([
    { op: "setTheme", theme: "neon" },
    { op: "setTitle", title: "" },
    { op: "setSection", id: "footer", title: "x" },
    { op: "publishToInternet" },
    { op: "setPoster", title: "a".repeat(400) },
  ]);
  assert.equal(ops.length, 0);
  assert.equal(applyOps(demoBrandSpec, ops).changed, false);
});

test("edit responses must carry an ops array and a message", () => {
  const ok = AiEditSchema.safeParse({ message: "改好了", ops: [] });
  assert.equal(ok.success, true);
  const missing = AiEditSchema.safeParse({ ops: [] });
  assert.equal(missing.success, true, "message has a default");
  assert.equal(AiEditSchema.safeParse({ message: "x".repeat(400), ops: [] }).success, false);
  assert.equal(AiEditSchema.safeParse({ message: "x", ops: new Array(20).fill({}) }).success, false);
});

test("fenced or chatty JSON is still parsed, garbage is not", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.equal(parseJsonLoose("no json here"), undefined);
});

test("the system prompt pins the fixed section skeleton", () => {
  for (const type of ["Hero", "ProductShowcase", "Story", "Promotion", "Gallery", "CTA"]) assert.ok(BRAND_SYSTEM_PROMPT.includes(type));
  assert.ok(BRAND_SYSTEM_PROMPT.includes("JSON"));
});

