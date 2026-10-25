"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Clipboard, Download, ImagePlus, LoaderCircle, MessageSquare, RefreshCcw, Sparkles, Video } from "lucide-react";
import { z } from "zod";
import type { BrandSpec } from "@/lib/brand-spec";
import { readProductImage } from "@/lib/image-upload";
import { filePath, marketingJson, MarketingConfigSchema, MarketingModelSchema, MarketingTaskSchema, type MarketingTask } from "@/lib/marketing/client";

const STORE = "morphsite.marketing.v1";
const savedSchema = z.object({ project: z.string().max(160), taskId: z.string().regex(/^[a-f0-9]{32}$/), projectId: z.string().regex(/^[a-f0-9]{32}$/).optional(), brand: z.string().max(200), product: z.string().max(200), description: z.string().max(2000), style: z.string(), platform: z.string() });
type Saved = z.infer<typeof savedSchema>;
type Model = z.infer<typeof MarketingModelSchema>;
type Config = z.infer<typeof MarketingConfigSchema>;
const styles = ["简约高级", "温暖手作", "活泼促销"];
const platforms = ["朋友圈", "小红书", "短视频"];

function assetFile(image: string): Promise<File> {
  return fetch(image).then(async (response) => {
    if (!response.ok) throw new Error("产品图片已失效，请重新上传。");
    const blob = await response.blob();
    if (blob.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB。");
    return new File([blob], "product.webp", { type: blob.type || "image/webp" });
  });
}

export function MarketingPanel({ spec, image, onWebsite }: { spec: BrandSpec | null; image: string | null; onWebsite: (brief: string, image: string | null) => void }) {
  const [brand, setBrand] = useState(""); const [product, setProduct] = useState(""); const [description, setDescription] = useState("");
  const [style, setStyle] = useState(styles[0]!); const [platform, setPlatform] = useState(platforms[0]!);
  const [picture, setPicture] = useState<string | null>(null); const [models, setModels] = useState<Model[]>([]); const [model, setModel] = useState("brand-spec");
  const [config, setConfig] = useState<Config | null>(null); const [task, setTask] = useState<MarketingTask | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [savedEntries, setSavedEntries] = useState<Saved[]>([]); const [taskId, setTaskId] = useState(""); const [working, setWorking] = useState(false); const [chatBusy, setChatBusy] = useState(false);
  const [advice, setAdvice] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [copied, setCopied] = useState<number | null>(null);
  const [versions, setVersions] = useState<{ id: string; version: number; source: string }[]>([]);
  const [outputs, setOutputs] = useState<{ id: string; kind: string; provider: string; is_mock: boolean; url: string | null }[]>([]);
  const [assets, setAssets] = useState<{ id: string; original_name: string; mime_type: string; url: string | null }[]>([]);
  const project = spec ? `${spec.brand.name}|${spec.campaign.prompt}` : "draft";
  const source = picture || image || (spec?.assets.heroImage?.startsWith("/assets/") ? null : spec?.assets.heroImage) || null;
  const selectedModel = models.find((item) => item.id === model);
  const googleImage = config?.google_image_configured;
  const googleVideo = config?.google_video_configured;
  const googleTts = config?.google_tts_configured;
  const [includeGoogleImage, setIncludeGoogleImage] = useState(false);
  const [includeVoiceover, setIncludeVoiceover] = useState(false);
  const [allowVeo, setAllowVeo] = useState(false);
  useEffect(() => {
    try { setSavedEntries(z.array(savedSchema).max(20).parse(JSON.parse(localStorage.getItem(STORE) || "[]"))); } catch { setSavedEntries([]); }
    setLoaded(true);
  }, []);

  const refresh = useCallback(async (id: string) => {
    try { const next = await marketingJson(`generations/${id}`, MarketingTaskSchema); setTask(next); if (next.project_id) setProjectId(next.project_id); setError(""); return next.status; }
    catch (failure) { setError(failure instanceof Error ? failure.message : "查询任务失败"); return "unreachable"; }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([marketingJson("models", z.array(MarketingModelSchema)), marketingJson("config", MarketingConfigSchema)])
      .then(([available, next]) => { if (active) { setModels(available); setConfig(next); setModel((current) => available.some((item) => item.id === current && item.configured) ? current : (available.find((item) => item.id === "mock")?.id || available.find((item) => item.configured)?.id || "mock")); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "营销服务不可用"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!spec) return;
    setBrand((previous) => previous || spec.brand.name);
    setProduct((previous) => previous || spec.brand.shortName);
    setDescription((previous) => previous || spec.website.subtitle);
  }, [spec]);
  useEffect(() => {
    if (!loaded || selectedProject === project) return;
    setSelectedProject(project); setTask(null); setTaskId(""); setProjectId(null); setConversationId(null);
    const latest = savedEntries.find((item) => item.project === project);
    if (latest) { setTaskId(latest.taskId); setProjectId(latest.projectId || null); setBrand(latest.brand); setProduct(latest.product); setDescription(latest.description); setStyle(latest.style); setPlatform(latest.platform); }
  }, [project, savedEntries, selectedProject, loaded]);
  useEffect(() => {
    if (!taskId) return;
    void refresh(taskId);
    const timer = window.setInterval(() => { void refresh(taskId); }, task?.status === "pending" || task?.status === "processing" || !task ? 3000 : 0x7fffffff);
    return () => window.clearInterval(timer);
  }, [taskId, task?.status, refresh]);

  useEffect(() => {
    if (!projectId) { setVersions([]); setOutputs([]); setAssets([]); return; }
    let active = true;
    Promise.all([
      marketingJson(`projects/${projectId}/brand-specs`, z.array(z.object({ id: z.string(), version: z.number(), source: z.string() }))),
      marketingJson(`projects/${projectId}/outputs`, z.array(z.object({ id: z.string(), kind: z.string(), provider: z.string(), is_mock: z.boolean(), url: z.string().nullable() }))),
      marketingJson(`projects/${projectId}/assets`, z.array(z.object({ id: z.string(), original_name: z.string(), mime_type: z.string(), url: z.string().nullable() }))),
    ]).then(([nextVersions, nextOutputs, nextAssets]) => { if (active) { setVersions(nextVersions); setOutputs(nextOutputs); setAssets(nextAssets); } }).catch(() => { /* existing task results remain available if history is offline */ });
    return () => { active = false; };
  }, [projectId, task?.status]);

  async function upload(file: File | undefined) {
    if (!file) return;
    try { setPicture(await readProductImage(file)); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "图片无法读取"); }
  }
  async function create() {
    if (!spec) { setError("请先生成推广网页，再生成营销素材。"); return; }
    if (spec.campaign.status === "demo" && !source) { setError("演示品牌需要另外上传一张 JPG、PNG 或 WebP 商品图片（内置 SVG 仅作网站预览）。"); return; }
    if (!product.trim() || !description.trim() || !source) { setError("请填写商品名、推广需求并上传商品图片。"); return; }
    if (googleVideo && allowVeo && !config?.google_video_max_cost_usd) { setError("后端没有提供 Google Veo 预算上限，已阻止付费视频请求。"); return; }
    setWorking(true); setError("");
    try {
      const data = new FormData(); data.append("images", await assetFile(source)); data.append("product_name", product.trim());
      data.append("description", `${brand.trim() ? `品牌：${brand.trim()}。` : ""}${description.trim()}`.slice(0, 2000));
      data.append("style", style); data.append("platform", platform); data.append("model_id", model); data.append("brand_spec_json", JSON.stringify(spec)); data.append("voiceover", googleTts && includeVoiceover ? "true" : "false");
      data.append("poster_mode", googleImage && includeGoogleImage ? "google" : config?.poster_mode === "ai" ? "ai" : "local"); data.append("video_mode", googleVideo && allowVeo ? "google-veo" : "local");
      if (googleVideo && allowVeo) data.append("video_cost_limit_usd", String(config?.google_video_max_cost_usd || 0));
      if (projectId) data.append("project_id", projectId);
      const result = await marketingJson("generations", z.object({ task_id: z.string().regex(/^[a-f0-9]{32}$/), status: z.string(), project_id: z.string().regex(/^[a-f0-9]{32}$/).nullable().optional() }), { method: "POST", body: data });
      if (result.project_id) setProjectId(result.project_id);
      if (result.project_id) {
        try {
          const conversation = await marketingJson(`projects/${result.project_id}/conversations`, z.object({ id: z.string().regex(/^[a-f0-9]{32}$/) }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${brand.trim() || "品牌"} · 营销素材` }) });
          setConversationId(conversation.id);
          await marketingJson(`projects/${result.project_id}/conversations/${conversation.id}/messages`, z.object({ id: z.string() }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "user", content: `生成${product.trim()}的${style}${platform}营销素材：${description.trim()}` }) });
        } catch { setMessage("素材已创建，但项目会话记录暂时无法保存。"); }
      }
      const record: Saved = { project, taskId: result.task_id, projectId: result.project_id || undefined, brand: brand.trim(), product: product.trim(), description: description.trim(), style, platform };
      try {
        const current = z.array(savedSchema).max(20).parse(JSON.parse(localStorage.getItem(STORE) || "[]"));
        const entries = [record, ...current.filter((item) => item.project !== project)].slice(0, 20);
        localStorage.setItem(STORE, JSON.stringify(entries)); setSavedEntries(entries);
      } catch { setMessage("本地存储不可用：刷新后请重新创建任务或保存任务 ID。"); }
      setTask(null); setTaskId(result.task_id); await refresh(result.task_id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "创建任务失败"); }
    finally { setWorking(false); }
  }
  async function consult() {
    if (!product.trim() || !description.trim()) { setError("先填写商品名和推广需求，再请模型完善卖点。"); return; }
    setChatBusy(true); setError("");
    try {
      const result = await marketingJson("chat", z.object({ reply: z.string(), model_id: z.string(), is_mock: z.boolean() }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model_id: model, messages: [{ role: "user", content: `请完善商品卖点，并给出一段可直接使用的活动描述：${description.trim()}` }], product_name: product.trim(), description: description.trim(), style, platform }) });
      setAdvice(`${result.is_mock ? "示例建议" : "模型建议"}：${result.reply}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "对话失败"); }
    finally { setChatBusy(false); }
  }
  function website() {
    if (!product.trim() || !description.trim()) { setError("请填写商品名和推广需求。"); return; }
    setError(""); onWebsite(`为${brand.trim() || "品牌"}的商品「${product.trim()}」生成推广网页。风格：${style}；平台：${platform}；需求：${description.trim()}`, source);
  }
  async function copy(text: string, index: number) {
    try { await navigator.clipboard.writeText(text); setCopied(index); window.setTimeout(() => setCopied(null), 2200); }
    catch { setError("复制失败，请手动选取文案。"); }
  }
  return <section className="marketing-panel" aria-label="营销素材生成">
    <header><span className="mono-label">CAMPAIGN STUDIO / 01</span><h2>从推广页到整套营销素材。</h2><p>沿用当前品牌项目。先生成网页，再按需生成配套文案、海报与短视频；示例内容会明确标记。</p></header>
    <div className="marketing-grid"><div className="marketing-form">
      <div className="marketing-row"><label>品牌名<input value={brand} maxLength={200} onChange={(e) => setBrand(e.target.value)} placeholder="例如：VOID COFFEE" /></label><label>商品名<input value={product} maxLength={200} onChange={(e) => setProduct(e.target.value)} placeholder="例如：午夜拼配咖啡" /></label></div>
      <label>推广需求<textarea value={description} maxLength={1900} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder="一句话描述商品、卖点与活动" /></label>
      <div className="marketing-row"><label>宣传风格<select value={style} onChange={(e) => setStyle(e.target.value)}>{styles.map((option) => <option key={option}>{option}</option>)}</select></label><label>发布平台<select value={platform} onChange={(e) => setPlatform(e.target.value)}>{platforms.map((option) => <option key={option}>{option}</option>)}</select></label></div>
      <label className="marketing-file"><ImagePlus size={17} /> 上传商品图片 <input aria-label="营销商品图片" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {source && <div className="marketing-source"><img src={source} alt="当前商品图" /><span>当前商品图已准备好 · 可替换</span></div>}
      <div className="marketing-actions"><button className="primary-button" type="button" onClick={website}>① 生成推广网页 <ArrowUpRight size={15} /></button><button className="secondary-button" type="button" onClick={() => { void create(); }} disabled={working || !spec}>{working ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />} ② 生成营销素材</button></div>
      <p className="marketing-hint">{spec ? `关联当前项目：${spec.brand.name} · ${spec.campaign.status === "demo" ? "演示网站 / 素材仅供演示，需上传真实商品图" : "网站已在 Website 预览中"}` : "尚无网站作品。先生成推广网页；AI 未配置时会明确使用本地演示品牌。"}</p>
      {googleImage && <label className="marketing-hint"><input type="checkbox" checked={includeGoogleImage} onChange={(event) => setIncludeGoogleImage(event.target.checked)} /> 本次使用 Google Gemini 图片生成海报（可能产生模型费用）。</label>}
      {googleTts && <label className="marketing-hint"><input type="checkbox" checked={includeVoiceover} onChange={(event) => setIncludeVoiceover(event.target.checked)} /> 本次生成 Google Gemini TTS 配音（可能产生模型费用）。</label>}
      {googleVideo && <label className="marketing-hint"><input type="checkbox" checked={allowVeo} onChange={(event) => setAllowVeo(event.target.checked)} /> 我确认本次使用 Google Veo，授权单次不超过 ${config?.google_video_max_cost_usd ?? "后端预算"} 的视频生成预算。</label>}
      <div className="marketing-model"><label>文案 / 卖点模型<select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((option) => <option key={option.id} value={option.id} disabled={!option.configured}>{option.name}{option.is_mock ? " · 示例" : option.configured ? " · 真实模型" : " · 未配置"}</option>)}</select></label><button type="button" className="secondary-button" onClick={() => { void consult(); }} disabled={chatBusy || !selectedModel?.configured}><MessageSquare size={14} />完善卖点</button></div>
      {advice && <div className="marketing-advice"><p>{advice}</p><button type="button" onClick={() => { const match = advice.match(/活动描述：([^\n]+)/); setDescription((match?.[1] || advice).slice(0, 1900)); }}>采用建议描述</button></div>}
      <p className="marketing-hint">海报：{googleImage && includeGoogleImage ? `Google Gemini · ${config?.poster_model || "已配置"}` : config?.poster_mode === "ai" ? `AI 模型 ${config.poster_model || "未配置"}` : "本地模板（非 AI）"} · 文案：{selectedModel?.id === "google-gemini" ? `Google Gemini · ${config?.google_text_model || "已配置"}` : selectedModel?.is_mock !== false ? "示例" : "真实模型"} · 视频：{googleVideo && allowVeo ? "Google Veo" : "本地 FFmpeg"} · 配音：{googleTts && includeVoiceover ? "Google Gemini TTS" : "未启用"}</p>
    </div><div className="marketing-results" aria-live="polite"><div className="marketing-results-head"><span className="mono-label">DELIVERABLES / 02</span>{taskId && <button type="button" onClick={() => { void refresh(taskId); }}><RefreshCcw size={13} /> 查询任务</button>}</div>
      {!task && <div className="marketing-await"><Sparkles size={26} /><p>{taskId ? "正在恢复任务结果…" : "网站生成后，点击「生成营销素材」开始。"}</p></div>}
      {task && <><div className="marketing-task-status"><strong>{task.status === "completed" ? "素材已生成" : task.status === "failed" ? "生成失败" : "正在生成"}</strong><span>{task.stage} · {task.task_id.slice(0, 10)}</span></div>
        {projectId && <p className="marketing-hint">项目 ID：{projectId} · BrandSpec 版本：{versions[0] ? `v${versions[0].version}` : "暂无"} · 已保存素材：{assets.length} · 已保存产出：{outputs.length}</p>}
        {Object.keys(task.component_status).length > 0 && <p role="status" className="marketing-hint">{Object.entries(task.component_status).map(([kind, value]) => `${({ copy: "文案", poster: "海报", video: "视频", audio: "配音" } as Record<string, string>)[kind]}：${({ completed: "已完成", failed: "失败", running: "运行中", pending: "等待中", disabled: "未启用" } as Record<string, string>)[value] || value}`).join(" · ")}</p>}
        {task.error_message && <p className="marketing-warning">{task.error_message}</p>}
        {!task.ffmpeg_available && task.video_provider !== "google-veo" && <p className="marketing-warning">FFmpeg 未配置：文案与海报仍可生成，视频暂不可用。</p>}
        {task.copy_text.length > 0 && <div className="marketing-result-block"><h3>宣传文案 <small>{task.copy_provider === "brand-spec" ? "网站文案 / 本地复用 / 非 AI" : task.copy_provider === "mock" ? "示例 / 非 AI" : task.copy_provider === "google-gemini" ? `Google Gemini · ${task.model_name || "真实模型"}` : `真实模型 · ${task.model_name || "已配置"}`}</small></h3>{task.copy_text.map((text, index) => <div className="marketing-copy" key={index}><p>{text}</p><button type="button" onClick={() => { void copy(text, index); }} aria-label={`复制文案 ${index + 1}`}>{copied === index ? <Check size={14} /> : <Clipboard size={14} />}</button></div>)}</div>}
        {task.poster_url && <div className="marketing-result-block"><h3>宣传海报 <small>{task.poster_provider === "google-gemini-image" ? "Google Gemini 图片模型" : task.poster_provider === "local-template" ? "本地模板 / 非 AI" : `真实模型 · ${task.poster_model}`}
</small></h3><img className="marketing-poster" src={filePath(task.poster_url)} alt="生成的商品宣传海报" /><a href={`${filePath(task.poster_url)}?download=1`} download>下载 PNG <Download size={14} /></a></div>}
        {task.video_url && <div className="marketing-result-block"><h3>宣传短视频 <small>{task.video_provider === "google-veo" ? "Google Veo" : "本地 FFmpeg 合成"}</small></h3><video controls playsInline preload="metadata" src={filePath(task.video_url)} aria-label="生成的商品宣传视频" /><a href={`${filePath(task.video_url)}?download=1`} download>下载 MP4 <Download size={14} /></a></div>}
        {task.audio_url && <div className="marketing-result-block"><h3>AI 配音 <small>Google Gemini TTS</small></h3><audio controls preload="metadata" src={filePath(task.audio_url)} aria-label="生成的品牌配音" /><a href={`${filePath(task.audio_url)}?download=1`} download>下载 WAV <Download size={14} /></a></div>}
      </>}
      {error && <p role="alert" className="marketing-warning">{error}</p>}{message && <p role="status" className="marketing-warning">{message}</p>}
    </div></div>
  </section>;
}
