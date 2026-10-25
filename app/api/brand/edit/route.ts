import { NextResponse } from "next/server";
import { applyDemoPrompt, BrandSpecSchema } from "@/lib/brand-spec";
import { aiEnabled } from "@/lib/ai/config";
import { AiError, chatJson, requireConfig } from "@/lib/ai/client";
import { EditRequestSchema, jsonError, type EditResponse } from "@/lib/ai/contracts";
import { summarizeSpec } from "@/lib/ai/draft";
import { applyOps, parseOps } from "@/lib/ai/ops";
import { AiEditSchema, EDIT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { clientKey, rateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError("请求格式无效。", 400); }
  const limited = rateLimit(`edit:${clientKey(request)}`, 24);
  if (!limited.ok) return jsonError(`修改太频繁，请 ${limited.retryAfter} 秒后再试。`, 429);
  const parsed = EditRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("修改指令无效。", 400);
  // The client sends its current document; it is re-validated here before any model call.
  const spec = BrandSpecSchema.safeParse(parsed.data.spec);
  if (!spec.success) return jsonError("当前作品数据无效，请刷新后重试。", 400);

  const direct = applyDemoPrompt(spec.data, parsed.data.prompt);
  if (direct.changed) return NextResponse.json({ ok: true, spec: direct.spec, message: direct.message, changed: true, model: "local-editor" } satisfies EditResponse);
  if (!aiEnabled()) return jsonError("服务端已关闭 AI；可以使用标题、粉色主题指令或主题控件。", 503, true);
  let config;
  try { config = requireConfig(); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "AI 未配置。", 503, true); }

  let message = "";
  let ops: ReturnType<typeof parseOps>["ops"] = [];
  try {
    const { json } = await chatJson(config, {
      model: parsed.data.image ? config.visionModel : config.chatModel,
      system: EDIT_SYSTEM_PROMPT,
      user: parsed.data.image ? [
        { type: "text", text: `当前作品摘要：\n${JSON.stringify(summarizeSpec(spec.data))}\n\n修改指令：${parsed.data.prompt}\n结合参考图中真实产品修改，保留未要求修改的内容，不编造参数。` },
        { type: "image_url", image_url: { url: parsed.data.image } },
      ] : `当前作品摘要：\n${JSON.stringify(summarizeSpec(spec.data))}\n\n修改指令：${parsed.data.prompt}`,
      maxTokens: 1600,
      temperature: 0.4,
    });
    const checked = AiEditSchema.safeParse(json);
    if (!checked.success) return jsonError("AI 返回的修改方案无效，作品未修改。", 502);
    message = checked.data.message;
    ops = parseOps(checked.data.ops).ops;
  } catch (error) {
    if (error instanceof AiError) return jsonError(error.message, error.status, true);
    return jsonError("修改失败，作品未修改，请重试。", 502, true);
  }

  let result;
  try { result = applyOps(spec.data, ops); }
  catch { return jsonError("AI 的修改与当前作品冲突，作品未修改。", 502); }
  const validated = BrandSpecSchema.safeParse(result.spec);
  if (!validated.success) return jsonError("修改后的作品未通过校验，已保留上一版。", 502);

  const nextSpec = validated.data;

  return NextResponse.json({
    ok: true,
    spec: nextSpec,
    message: message || (result.changed ? "已按你的指令更新作品。" : "这条指令没有改变作品。"),
    ...(result.imagePrompt ? { imagePrompt: result.imagePrompt } : {}),
    changed: JSON.stringify(nextSpec) !== JSON.stringify(spec.data),
    model: config.chatModel,
  } satisfies EditResponse);
}
