"use client";

import type { GenerationStatus } from "@/lib/api";

// 页面显示的任务状态步骤
const STEPS = [
  { key: "idle", label: "等待提交" },
  { key: "analysis", label: "正在分析素材" },
  { key: "copywriting", label: "正在生成文案" },
  { key: "poster", label: "正在生成海报" },
  { key: "video", label: "正在合成视频" },
  { key: "completed", label: "已完成" },
] as const;

function currentStepIndex(status: GenerationStatus | null, submitting: boolean): number {
  if (!status) return submitting ? 1 : 0;
  if (status.status === "completed") return STEPS.length - 1;
  const idx = STEPS.findIndex((s) => s.key === status.stage);
  return idx >= 0 ? idx : 1;
}

export default function StatusPanel({
  status,
  submitting,
}: {
  status: GenerationStatus | null;
  submitting: boolean;
}) {
  const failed = status?.status === "failed";
  const active = currentStepIndex(status, submitting);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">任务状态</h2>
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, i) => {
          const done = !failed && i < active;
          const current = !failed && i === active;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <span
                className={
                  "rounded-full px-3 py-1 " +
                  (done
                    ? "bg-emerald-100 text-emerald-700"
                    : current
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-400")
                }
              >
                {done ? "✓ " : ""}
                {step.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
            </li>
          );
        })}
        {failed && (
          <li>
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">生成失败</span>
          </li>
        )}
      </ol>
      {failed && status?.error_message && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {status.error_message}
        </p>
      )}
    </section>
  );
}
