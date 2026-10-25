import assert from "node:assert/strict";
import { test } from "node:test";
import { AiDraftSchema } from "../lib/ai/prompts";
import { draftToBrandSpec } from "../lib/ai/draft";
import { demoBrandSpec } from "../lib/brand-spec";
import { campaignIntent } from "../lib/studio-intent";

test("product-specific palette survives normalization and explicit layout overrides model choice", () => {
  const palette = { canvas: "#fdfbf7", surface: "#f4efe6", text: "#2c2a29", muted: "#7a7572", accent: "#476b42", accentSoft: "#e2ebde", line: "#d9dfd2" };
  const draft = AiDraftSchema.parse({ ...demoBrandSpec, themeId: "soft-minimal", palette, website: { ...demoBrandSpec.website, layout: "editorial" } });
  const spec = draftToBrandSpec(draft, { prompt: "产品优先，突出实际包装", image: null });
  assert.deepEqual(spec.theme.palette, palette);
  assert.equal(spec.website.layout, "product-first");
});

test("retouching a product image preserves the existing website campaign", () => {
  const intent = campaignIntent("优化这张产品图片，保留包装，换背景", true, false);
  assert.equal(intent.image, true);
  assert.equal(intent.website, false);
  assert.equal(intent.campaign, false);
});
