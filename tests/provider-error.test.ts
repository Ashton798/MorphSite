import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError, withImageRetry } from "../lib/ai/provider-error";
import { demoBrandSpec } from "../lib/brand-spec";
import { initialStudioState, studioReducer } from "../lib/studio-state";

const failure = (status: number, message: string, details: unknown[] = []) => ({ status, message: JSON.stringify({ error: { code: status, message, details } }) });

test("provider status remains accurate and never exposes raw text or keys", () => {
  for (const [status, category] of [[400, "invalid_request"], [402, "billing"], [403, "permission"], [404, "model"], [503, "unavailable"]] as const) {
    const result = classifyProviderError(failure(status, "secret-key fake-provider-detail"));
    assert.equal(result.httpStatus, status);
    assert.equal(result.category, category);
    assert.ok(!JSON.stringify(result).includes("secret-key"));
  }
});
test("429 distinguishes zero allowance, daily, minute and unknown quota", () => {
  assert.equal(classifyProviderError(failure(429, "free tier requests per day limit: 0")).category, "zero_quota");
  assert.equal(classifyProviderError(failure(429, "requests per day exceeded")).retryable, false);
  assert.equal(classifyProviderError(failure(429, "requests per minute exceeded")).category, "rate_limit");
  assert.equal(classifyProviderError(failure(429, "resource exhausted")).category, "quota_unknown");
});
test("retries are bounded, honor RetryInfo, and skip daily / zero / billing failures", async () => {
  for (const error of [failure(429, "limit: 0"), failure(429, "per day"), failure(402, "billing"), failure(403, "permission")]) {
    let calls = 0;
    await assert.rejects(withImageRetry(async () => { calls++; throw error; }, async () => { assert.fail("must not wait"); }));
    assert.equal(calls, 1);
  }
  let calls = 0; const delays: number[] = [];
  await assert.rejects(withImageRetry(async () => { calls++; throw failure(503, "busy"); }, async (ms) => { delays.push(ms); }));
  assert.equal(calls, 3); assert.equal(delays.length, 2);
  calls = 0;
  await assert.rejects(withImageRetry(async () => { calls++; throw failure(429, "per minute", [{ retryDelay: "60s" }]); }, async () => assert.fail()));
  assert.equal(calls, 1);
});
test("independent image completion preserves concurrent website edits and upload source", () => {
  let state = studioReducer(initialStudioState, { type: "generated", spec: demoBrandSpec, prompt: "coffee", message: "ready" });
  state = studioReducer(state, { type: "prompt", prompt: "把标题改成周末咖啡节" });
  state = studioReducer(state, { type: "hero-image", image: `/api/brand/media/${"c".repeat(32)}.png` });
  assert.equal(state.draft.spec?.website.title, "周末咖啡节");
  assert.equal(state.draft.image, demoBrandSpec.assets.heroImage);
  assert.match(state.draft.spec?.assets.heroImage ?? "", /^\/api\/brand\/media/);
});
