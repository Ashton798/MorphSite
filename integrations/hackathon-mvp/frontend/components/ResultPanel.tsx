"use client";

import { useState } from "react";
import type { GenerationStatus } from "@/lib/api";

export default function ResultPanel({
  status,
  onRegenerate,
}: {
  status: GenerationStatus;
  onRegenerate: () => void;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function copyText(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板不可用时退化为手动选择
      window.prompt("复制失败，请手动复制：", text);
      return;
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">生成结果</h2>
        {(
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            {status.poster_model ? `海报：${status.poster_model}` : "海报：本地模板"} · 视频：本地合成
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {status.copy_is_mock
          ? "文案：Mock 本地示例，非真实 AI 生成"
          : `文案：由 ${status.model_name || "所选模型"} 生成`}
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {/* 海报 */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-600">宣传海报</h3>
          {status.poster_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={status.poster_url}
                alt="宣传海报"
                className="w-full rounded-lg border border-slate-200"
              />
              <a
                href={status.poster_url}
                download
                className="mt-2 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
              >
                下载海报
              </a>
            </>
          ) : (
            <p className="text-sm text-slate-400">暂无海报</p>
          )}
        </div>

        {/* 视频 */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-600">宣传短视频</h3>
          {status.video_url ? (
            <>
              <video
                src={status.video_url}
                controls
                className="w-full rounded-lg border border-slate-200 bg-black"
              />
              <a
                href={status.video_url}
                download
                className="mt-2 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
              >
                下载视频
              </a>
            </>
          ) : (
            <p className="text-sm text-slate-400">暂无视频</p>
          )}
        </div>
      </div>

      {/* 文案 */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-slate-600">宣传文案</h3>
        {status.copy_text.length > 0 ? (
          <ul className="space-y-3">
            {status.copy_text.map((text, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm leading-relaxed">{text}</p>
                <button
                  onClick={() => copyText(text, i)}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  {copiedIndex === i ? "已复制 ✓" : "复制文案"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">暂无文案</p>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          onClick={onRegenerate}
          className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          重新生成
        </button>
      </div>
    </section>
  );
}
