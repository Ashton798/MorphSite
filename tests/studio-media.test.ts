import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignIntent, studioIntent } from "../lib/studio-intent";
import { initialStudioState, SavedWorkspaceSchema, studioReducer } from "../lib/studio-state";
import { readAiConfig } from "../lib/ai/config";

test("chat routes media creation without hijacking website edits and storyboards", () => {
  assert.deepEqual(studioIntent("为产品生成宣传图和视频"), { website: false, image: true, video: true });
  assert.deepEqual(studioIntent("生成网站、图片和视频"), { website: true, image: true, video: true });
  assert.deepEqual(studioIntent("把主视觉换成清晨窗边的咖啡"), { website: true, image: false, video: false });
  assert.deepEqual(studioIntent("生成视频分镜"), { website: true, image: false, video: false });
});

test("a fresh product description replaces an old campaign while explicit edits remain edits", () => {
  assert.deepEqual(campaignIntent("我要推广一款粉色玫瑰", true, false), { website: true, image: true, video: true, campaign: true });
  assert.equal(campaignIntent("改成粉色", true, false).campaign, false);
  assert.equal(campaignIntent("生成宣传视频", true, false).image, false);
  assert.equal(campaignIntent("这是我的新产品", true, true).campaign, true);
});

test("media-only results survive restore and undo without manufacturing a BrandSpec", () => {
  const result = { kind: "video" as const, url: `/api/brand/media/${"a".repeat(32)}.mp4`, model: "veo" };
  const next = studioReducer(initialStudioState, { type: "media", result, prompt: "生成宣传视频" });
  assert.equal(next.draft.spec, null);
  assert.equal(next.draft.media[0].url, result.url);
  const saved = SavedWorkspaceSchema.parse({ version: 1, draft: next.draft, messages: next.messages });
  assert.equal(studioReducer(initialStudioState, { type: "restore", saved }).draft.media.length, 1);
  assert.equal(studioReducer(next, { type: "undo" }).draft.media.length, 0);
  assert.deepEqual(SavedWorkspaceSchema.parse({ version: 1, draft: { spec: null, image: null }, messages: [] }).draft.media, []);
});

test("Bailian image and video results remain valid after saving the campaign", () => {
  let state = studioReducer(initialStudioState, { type: "generate", prompt: "一朵鲜花", demo: true });
  const image = `/api/marketing/files/${"a".repeat(32)}_bailian.png`;
  state = studioReducer(state, { type: "hero-image", image });
  state = studioReducer(state, { type: "media", result: { kind: "image", url: image, model: "wan2.7-image" }, prompt: "鲜花图片" });
  state = studioReducer(state, { type: "media", result: { kind: "video", url: `/api/marketing/files/${"b".repeat(32)}_bailian.mp4`, model: "wan2.7-i2v" }, prompt: "鲜花视频" });
  const saved = SavedWorkspaceSchema.parse({ version: 1, draft: state.draft, messages: state.messages });
  assert.equal(saved.draft.spec?.assets.heroImage, image);
  assert.equal(saved.draft.media.length, 2);
});

test("Gemini credentials do not inherit incompatible model names", () => {
  const original = { ...process.env };
  try {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_CHAT_MODEL = "compatible-chat";
    process.env.AI_IMAGE_MODEL = "compatible-image";
    delete process.env.GEMINI_TEXT_MODEL;
    delete process.env.GEMINI_IMAGE_MODEL;
    const config = readAiConfig();
    assert.ok(!("error" in config));
    assert.equal(config.chatModel, "gemini-2.5-flash");
    assert.equal(config.imageModel, "gemini-2.5-flash-image");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test("Bailian site generation is proxied through FastAPI without exposing a key to Next.js", () => {
  const original = { ...process.env };
  try {
    process.env.AI_PROVIDER = "bailian";
    process.env.MARKETING_BACKEND_URL = "http://127.0.0.1:8002";
    delete process.env.AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const config = readAiConfig();
    assert.ok(!("error" in config));
    assert.equal(config.provider, "bailian");
    assert.equal(config.chatModel, "qwen3.8-flash");
    assert.equal(config.textEnabled, true);
    assert.equal(config.apiKey, "");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
