import { NextResponse } from "next/server";
import { aiEnabled, readAiConfig } from "@/lib/ai/config";
import type { AiStatusResponse } from "@/lib/ai/contracts";

export const dynamic = "force-dynamic";

/** Lets the workspace label its mode ("AI 已连接" vs "本地 Demo") without exposing the key. */
export async function GET() {
  const config = readAiConfig();
  if (!aiEnabled()) {
    return NextResponse.json({ ok: true, enabled: false, imageEnabled: false, videoEnabled: false, model: "offline", imageModel: "offline", videoModel: "offline", reason: "MORPHSITE_AI=off" } satisfies AiStatusResponse);
  }
  if ("error" in config) {
    return NextResponse.json({ ok: false, enabled: false, imageEnabled: false, videoEnabled: false, model: "offline", imageModel: "offline", videoModel: "offline", reason: config.error } satisfies AiStatusResponse);
  }
  if (config.provider === "bailian") {
    try {
      const response = await fetch(`${config.baseUrl}/api/generation-config`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const backend = await response.json();
      const capabilities = backend.bailian?.capabilities;
      return NextResponse.json({ ok: true, enabled: Boolean(capabilities?.text), imageEnabled: Boolean(capabilities?.image), videoEnabled: Boolean(capabilities?.video), model: config.chatModel, imageModel: config.imageModel, videoModel: config.videoModel, provider: config.provider, ...(!capabilities?.text ? { reason: "百炼后端文本服务未配置，请重启后端并检查密钥。" } : {}) } satisfies AiStatusResponse);
    } catch {
      return NextResponse.json({ ok: false, enabled: false, imageEnabled: false, videoEnabled: false, model: config.chatModel, imageModel: config.imageModel, videoModel: config.videoModel, provider: config.provider, reason: "百炼后端未启动。" } satisfies AiStatusResponse);
    }
  }
  return NextResponse.json({ ok: true, enabled: true, imageEnabled: config.imageEnabled, videoEnabled: config.videoEnabled, model: config.chatModel, imageModel: config.imageModel, videoModel: config.videoModel, provider: config.provider } satisfies AiStatusResponse);
}
