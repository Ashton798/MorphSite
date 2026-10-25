import { NextResponse } from "next/server";
import { BrandSpecSchema } from "@/lib/brand-spec";
import { aiEnabled } from "@/lib/ai/config";
import { AiError, chatJson, requireConfig } from "@/lib/ai/client";
import { GenerateRequestSchema, jsonError, type GenerateResponse, type GenerationStreamEvent, type GenerationStage } from "@/lib/ai/contracts";
import { draftToBrandSpec } from "@/lib/ai/draft";
import { AiDraftSchema, BRAND_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { clientKey, rateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const imageInstruction = "用户上传了一张产品图，请让品牌与文案贴合图中真实的产品、材质与场景，不要凭空编造品类。";

export async function POST(request: Request) {
  // Streaming is a progress envelope, not a change to the provider or BrandSpec contract.
  // Legacy JSON clients retain the same validated response payload.
  if (new URL(request.url).searchParams.get("stream") !== "1") return generate(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerationStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const stage = (value: GenerationStage) => send({ type: "stage", stage: value });
      try {
        stage("connecting");
        const response = await generate(request, stage);
        const body = await response.json() as GenerateResponse | { ok?: false; error?: string };
        if (response.ok && body.ok) send({ type: "result", data: body as GenerateResponse });
        else send({ type: "error", error: "error" in body && body.error ? body.error : "生成失败，请重试。" });
      } catch {
        send({ type: "error", error: "生成连接中断，作品未更新，请重试。" });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" } });
}

async function generate(request: Request, onStage?: (stage: GenerationStage) => void) {
  if (!aiEnabled()) return jsonError("服务端已关闭 AI（MORPHSITE_AI=off），请使用演示品牌。", 503, true);
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError("请求格式无效。", 400); }
  const limited = rateLimit(`generate:${clientKey(request)}`);
  if (!limited.ok) return jsonError(`请求太频繁，请 ${limited.retryAfter} 秒后再试。`, 429);
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "简报无效。", 400);

  let config;
  try { config = requireConfig(); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "AI 未配置。", 503, true); }

  const { prompt, image } = parsed.data;
  onStage?.("model");
  const userContent = image
    ? [{ type: "text" as const, text: `${prompt}\n\n${imageInstruction}` }, { type: "image_url" as const, image_url: { url: image } }]
    : `${prompt}\n\n请为这句简报设计完整的品牌世界。`;

  let draft;
  let summary = "";
  try {
    const { json } = await chatJson(config, {
      model: image ? config.visionModel : config.chatModel,
      system: BRAND_SYSTEM_PROMPT,
      user: userContent,
      maxTokens: 6000,
      // Creative enough for naming, tight enough that the product category stays literal.
      temperature: 0.7,
    });
    const checked = AiDraftSchema.safeParse(json);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      return jsonError(`AI 返回的品牌数据不完整（${issue?.path.join(".") || "结构"}），作品未创建，请重试。`, 502);
    }
    onStage?.("validating");
    draft = checked.data;
    summary = draft.summary ?? "已根据你的简报生成品牌网站、海报与分镜。";
  } catch (error) {
    if (error instanceof AiError) return jsonError(error.message, error.status, true);
    return jsonError("生成失败，作品未创建，请重试。", 502, true);
  }

  // Return the website first. Image generation runs independently in the Studio.
  const heroImage = image;

  let spec;
  try { spec = draftToBrandSpec(draft, { prompt, image: heroImage ?? null }); }
  catch { return jsonError("AI 返回的内容未通过品牌校验，作品未创建。", 502); }
  const validated = BrandSpecSchema.safeParse(spec);
  onStage?.("complete");
  if (!validated.success) return jsonError("AI 返回的内容未通过品牌校验，作品未创建。", 502);

  return NextResponse.json({
    ok: true,
    spec: validated.data,
    summary,
    model: image ? config.visionModel : config.chatModel,
    ...(!image && config.imageEnabled && draft.imagePrompt ? { imagePrompt: draft.imagePrompt } : {}),
  } satisfies GenerateResponse);
}
