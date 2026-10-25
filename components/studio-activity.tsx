import { GENERATION_STAGE_LABELS } from "@/lib/ai-client";
import type { GenerationStage } from "@/lib/ai/contracts";

export function StudioActivity({ busy, ready, stage, editing }: { busy: boolean; ready: boolean; stage: GenerationStage; editing: boolean }) {
  if (ready && !busy) return null;
  return <div className="studio-loading" role="status" aria-live="polite">
    <div className="loading-matter" aria-hidden="true"><i /><i /><i /></div>
    <div><p>{ready ? editing ? "正在处理你的修改…" : GENERATION_STAGE_LABELS[stage] : "正在准备工作台…"}</p><small>{ready ? "仅在完整数据通过校验后更新；已有作品保持不变。" : "读取连接状态与当前草稿。"}</small></div>
  </div>;
}
