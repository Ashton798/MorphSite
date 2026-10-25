"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createGeneration,
  getGeneration,
  listModels,
  getGenerationConfig,
  type GenerationConfig,
  type GenerationStatus,
  type ModelOption,
} from "@/lib/api";
import StatusPanel from "@/components/StatusPanel";
import ResultPanel from "@/components/ResultPanel";
import ChatPanel from "@/components/ChatPanel";

const STYLES = ["温暖手作", "简约高级", "活泼促销"];
const PLATFORMS = ["朋友圈", "小红书", "短视频"];
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const POLL_INTERVAL_MS = 1500;
const MAX_IMAGES = 5;

interface PickedImage {
  file: File;
  url: string; // Object URL 预览
}

export default function Home() {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("mock");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshModels = useCallback(async () => {
    setModelsLoading(true);
    setModelError(null);
    try {
      const [options, config] = await Promise.all([listModels(), getGenerationConfig()]);
      setGenerationConfig(config);
      setModels(options);
      setSelectedModelId((current) =>
        options.some((option) => option.id === current) ? current : "mock"
      );
    } catch (e) {
      setModelError(e instanceof ApiError ? e.message : "模型列表加载失败，请重试");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  const selectedModel = models.find((model) => model.id === selectedModelId);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const [pollingPaused, setPollingPaused] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);

  // 每次查询完成后再等待，避免慢请求堆积；离开任务后忽略旧响应。
  useEffect(() => {
    if (!taskId) return;
    let failCount = 0;
    let cancelled = false;
    setPollingPaused(false);

    const poll = async () => {
      try {
        const data = await getGeneration(taskId);
        if (cancelled) return;
        failCount = 0;
        setStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
          setSubmitting(false);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        failCount += 1;
        // 连续失败后允许恢复同一任务的查询，避免重复生成。
        if (failCount >= 5) {
          stopPolling();
          setPollingPaused(true);
          setFormError(
            e instanceof ApiError ? e.message : "网络请求失败，请检查后端服务后重试"
          );
          return;
        }
      }
      if (!cancelled) pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [taskId, pollAttempt, stopPolling]);

  function handleImagesAdd(files: FileList | null) {
    setFormError(null);
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const bad = incoming.find((f) => !ACCEPTED_TYPES.includes(f.type));
    if (bad) {
      setFormError(`「${bad.name}」文件类型不支持：仅支持 JPG、PNG、WEBP 格式的图片`);
      return;
    }
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (incoming.length > room) {
        setFormError(`最多上传 ${MAX_IMAGES} 张商品照片`);
      }
      const accepted = incoming.slice(0, Math.max(0, room));
      return [
        ...prev,
        ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ];
    });
  }

  function handleImageRemove(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    setFormError(null);
    if (images.length === 0) {
      setFormError("请先上传商品照片");
      return;
    }
    if (!productName.trim()) {
      setFormError("请填写商品名称");
      return;
    }
    if (!description.trim()) {
      setFormError("请填写宣传描述");
      return;
    }

    if (!selectedModel?.configured || modelError) {
      setFormError("请先加载模型列表并选择已配置的模型");
      return;
    }
    if (!generationConfig?.poster_configured) {
      setFormError("海报模型尚未配置完整，请检查后端配置");
      return;
    }
    setPollingPaused(false);
    setSubmitting(true);
    setStatus(null);
    setTaskId(null);
    try {
      const res = await createGeneration({
        images: images.map((i) => i.file),
        product_name: productName.trim(),
        description: description.trim(),
        style,
        platform,
        model_id: selectedModelId,
      });
      setTaskId(res.task_id);
    } catch (e) {
      setSubmitting(false);
      setFormError(e instanceof ApiError ? e.message : "提交失败，请稍后重试");
    }
  }

  function handleRegenerate() {
    stopPolling();
    setTaskId(null);
    setStatus(null);
    handleSubmit();
  }

  const busy = submitting || status?.status === "processing" || status?.status === "pending";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* 顶部标题 */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold">宣传内容生成器</h1>
        <p className="mt-2 text-slate-500">
          上传商品照片，生成一套可以直接发布的宣传内容
        </p>
      </header>

      <div className="space-y-6">
        {/* 输入区域 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">填写宣传信息</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {/* 图片上传（支持多张） */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                商品照片 <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-slate-400">
                  （支持 JPG / PNG / WEBP，最多 {MAX_IMAGES} 张，第一张为海报主图）
                </span>
              </label>
              {images.length > 0 && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <div key={img.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`商品图 ${i + 1}`}
                        className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                          主图
                        </span>
                      )}
                      {!busy && (
                        <button
                          type="button"
                          onClick={() => handleImageRemove(i)}
                          aria-label={`删除第 ${i + 1} 张图片`}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {images.length < MAX_IMAGES && (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400">
                  <span className="text-sm text-slate-400">
                    {images.length === 0
                      ? "点击选择图片（可多选）"
                      : `继续添加（还可选 ${MAX_IMAGES - images.length} 张）`}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      handleImagesAdd(e.target.files);
                      e.target.value = ""; // 允许重复选择同一文件
                    }}
                  />
                </label>
              )}
            </div>

            {/* 文本与下拉 */}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  商品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={productName}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例如：手工桂花乌龙茶"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  活动描述 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例如：秋季新品上市，前 100 名下单立减 20 元"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    宣传风格
                  </label>
                  <select
                    value={style}
                    disabled={busy}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {STYLES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    宣传平台
                  </label>
                  <select
                    value={platform}
                    disabled={busy}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            {generationConfig && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
                <p className="font-medium">海报生成：{generationConfig.poster_mode === "ai" ? generationConfig.poster_model : "本地模板"}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {generationConfig.poster_mode === "ai"
                    ? "点击开始生成后，会将商品主图与宣传信息发送至已配置的图片模型，产生 API 费用。"
                    : "本地模板合成，无需调用图片模型。"}
                  视频由商品图与海报在本地合成。
                </p>
                {!generationConfig.poster_configured && <p role="alert" className="mt-1 text-red-700">图片模型配置不完整</p>}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="model-select" className="mb-1 block text-sm font-medium text-slate-600">
                  对话与文案模型
                </label>
                <select
                  id="model-select"
                  value={selectedModelId}
                  disabled={busy || modelsLoading}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {models.length === 0 && <option value="mock">{modelsLoading ? "正在加载模型…" : "模型列表未加载"}</option>}
                  {models.map((model) => (
                    <option key={model.id} value={model.id} disabled={!model.configured}>
                      {model.name}{model.configured ? "" : "（未配置完整）"}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" disabled={busy || modelsLoading} onClick={() => void refreshModels()}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:text-slate-400">
                刷新模型
              </button>
            </div>
            {modelError && <p role="alert" className="text-sm text-red-700">{modelError}</p>}
            <p className="text-xs text-slate-500">
              {selectedModel?.is_mock
                ? "当前为 Mock 模型：对话和文案均为本地示例，不调用真实 AI。"
                : "选择真实模型后，对话和文案会发送到该模型服务，可能产生 API 费用。"}
              切换模型会清空当前对话。对话暂不分析上传图片。
            </p>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer text-blue-600">如何接入自定义模型？</summary>
              <p className="mt-2 leading-relaxed">
                在后端 backend/models.json 填写模型名称、模型 ID 和 OpenAI 兼容接口地址；
                api_key_env 填写密钥环境变量名，实际密钥只保存到 backend/.env。
                可参考 backend/models.example.json。保存后点击「刷新模型」，无需把密钥填入网页。
              </p>
            </details>
            <ChatPanel
              key={selectedModelId}
              model={selectedModel}
              productName={productName}
              description={description}
              style={style}
              platform={platform}
              disabled={Boolean(busy || modelsLoading || modelError)}
              onUseAsDescription={setDescription}
            />
          </div>

          {formError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={images.length === 0 || busy || modelsLoading || !!modelError || !selectedModel?.configured}
            className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-base font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto md:px-10"
          >
            {busy ? "正在生成中…" : "开始生成"}
          </button>
          {images.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">请先上传商品照片后再提交</p>
          )}
        </section>

        {/* 任务状态区域 */}
        <StatusPanel status={status} submitting={submitting} />
        {pollingPaused && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p>任务状态暂时无法获取。服务恢复后可继续查询，已有任务不会重复提交。</p>
            <button type="button" className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-white"
              onClick={() => { setFormError(null); setPollingPaused(false); setPollAttempt((n) => n + 1); }}>
              重新查询任务
            </button>
          </div>
        )}

        {/* 结果区域 */}
        {status?.status === "completed" && (
          <ResultPanel status={status} onRegenerate={handleRegenerate} />
        )}
        {status?.status === "failed" && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              onClick={handleRegenerate}
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              重新生成
            </button>
          </section>
        )}
      </div>

      <footer className="mt-10 text-center text-xs text-slate-400">
        黑客松 MVP · 仅演示用途
      </footer>
    </main>
  );
}
