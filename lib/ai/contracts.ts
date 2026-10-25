import { z } from "zod";
import { ImageSourceSchema } from "@/lib/brand-spec";

// Shared request/response contracts between the browser and the route handlers.
export const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1, "请先描述你的品牌").max(2000),
  // Reject javascript:/SVG payloads at the boundary, before any provider call.
  image: ImageSourceSchema.optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const EditRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  spec: z.unknown(),
  image: ImageSourceSchema.optional(),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

export const ImageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(900),
});
export type ImageRequest = z.infer<typeof ImageRequestSchema>;

export type GenerateResponse = {
  ok: true;
  spec: unknown;
  summary: string;
  model: string;
  imageError?: string;
  imagePrompt?: string;
};
export const GenerationStageSchema = z.enum(["queued", "connecting", "model", "validating", "image", "complete", "demo"]);
export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationStreamEvent =
  | { type: "stage"; stage: GenerationStage }
  | { type: "result"; data: GenerateResponse }
  | { type: "error"; error: string };
export type EditResponse = { ok: true; spec: unknown; message: string; changed: boolean; model: string; imagePrompt?: string };
export type ImageResponse = { ok: true; url: string };
export type AiErrorResponse = { ok: false; error: string; fallback?: boolean };
export type AiStatusResponse = { ok: boolean; enabled: boolean; imageEnabled: boolean; videoEnabled: boolean; model: string; imageModel: string; videoModel: string; provider?: "compatible" | "gemini" | "bailian"; reason?: string };

export function jsonError(error: string, status: number, fallback = false) {
  return Response.json({ ok: false, error, ...(fallback ? { fallback: true } : {}) } satisfies AiErrorResponse, { status });
}
