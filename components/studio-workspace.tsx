"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowUpRight, Asterisk, Check, LayoutTemplate } from "lucide-react";
import { BrandSpecSchema } from "@/lib/brand-spec";
import { HANDOFF_KEY, HandoffSchema, PROJECT_KEY, SavedWorkspaceSchema, STORAGE_KEY, initialStudioState, studioReducer } from "@/lib/studio-state";

import { requestEdit, requestGenerate, requestMedia } from "@/lib/ai-client";
import { requestLocalMedia } from "@/lib/local-media-client";
import { readWorkspace, saveWorkspace } from "@/lib/workspace-storage";
import { readProductImage } from "@/lib/image-upload";
import { campaignIntent } from "@/lib/studio-intent";
import type { GenerationStage } from "@/lib/ai/contracts";
import type { PreviewMode, DeviceMode } from "@/lib/preview-theme";
import { SiteNav } from "./site-nav";
import { BrandPreview } from "./brand-preview";
import { StudioChat } from "./studio-chat";
import { PublishWebsite } from "./publish-website";
import { PreviewToolbar } from "./preview-toolbar";
import { StudioActivity } from "./studio-activity";
import { MarketingPanel } from "./marketing-panel";
import { useGeneration, playInterfaceSound } from "./generation-provider";

export function StudioWorkspace() {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  const [mode, setMode] = useState<PreviewMode>("website");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [marketingVisited, setMarketingVisited] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroError, setHeroError] = useState("");
  const heroRunning = useRef(false);
  const heroEpoch = useRef(0);
  const documentRef = useRef(state.draft.spec);
  documentRef.current = state.draft.spec;
  const lastHeroPrompt = useRef("");
  const [publishOpen, setPublishOpen] = useState(false);
  const mediaRunning = useRef(false);
  const freshUpload = useRef(false);
  const [campaignProgress, setCampaignProgress] = useState("");
  const [error, setError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState<GenerationStage>("queued");
  const { ai, aiReady, task, subscribe, startGeneration, consumePending, consumePendingFailure } = useGeneration();
  const initialized = useRef(false);
  const handledPrompt = useRef("");
  const projectRef = useRef<string | null>(null);
  const projectNameRef = useRef("");
  const conversationRef = useRef<string | null>(null);
  const persistedSpecRef = useRef("");
  const persistedMessageCountRef = useRef(0);
  const persistenceQueueRef = useRef(Promise.resolve());
  const projectHydrationStartedRef = useRef(false);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const { spec, image } = state.draft;

  // AI status belongs to the root provider. Initialize the document exactly once.
  useEffect(() => {
    if (!aiReady || initialized.current) return;
    initialized.current = true;
    async function initialize() {
    const query = new URLSearchParams(window.location.search);
    try {
      const savedProject = sessionStorage.getItem(PROJECT_KEY);
      if (savedProject && /^[a-f0-9]{32}$/.test(savedProject)) projectRef.current = savedProject;
      if (query.get("demo") === "1") dispatch({ type: "generate", prompt: "", demo: true });
      else if (query.get("brief") === "1") {
        const raw = sessionStorage.getItem(HANDOFF_KEY);
        if (!raw) setError("没有找到首页简报，请重新输入或使用演示品牌。");
        else {
          const brief = HandoffSchema.parse(JSON.parse(raw));
          sessionStorage.removeItem(HANDOFF_KEY);
          if (!ai.enabled) {
            dispatch({ type: "generate", prompt: brief.prompt, image: brief.image });
            setError(`AI 未启用${ai.reason ? `（${ai.reason}）` : ""}，已改用本地演示品牌。`);
          } else {
            handledPrompt.current = brief.prompt;
            const pending = consumePending(brief.prompt);
            const failure = consumePendingFailure(brief.prompt);
            if (pending) {
              dispatch({ type: "generated", spec: pending.spec, prompt: brief.prompt, message: pending.summary });
              if (pending.imagePrompt) void generateHero(pending.imagePrompt);
              playInterfaceSound("success");
            } else if (failure) {
              dispatch({ type: "failed", prompt: brief.prompt, message: `${failure} 作品未创建。` });
              setError(failure);
            } else {
              setBusy(true);
              if (task?.prompt !== brief.prompt) startGeneration(brief.prompt, brief.image);
            }
          }
        }
      } else {
        let durable = null;
        try { durable = await readWorkspace(); } catch { /* browser storage fallback below */ }
        const saved = durable ?? JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
        if (saved) {
          const result = SavedWorkspaceSchema.safeParse(saved);
          if (result.success) dispatch({ type: "restore", saved: result.data });
          else setError("旧草稿未通过数据校验，已打开空白工作台。");
        }
      }
      if (query.get("view") === "poster") setMode("poster");
      if (query.get("view") === "video") setMode("video");
    } catch { setError("无法读取本地草稿，你仍然可以使用演示品牌。"); }
    window.history.replaceState(null, "", "/studio");
    setReady(true);
    }
    void initialize();
  }, [aiReady]); // The provider and its task are intentionally stable across this handoff.

  useEffect(() => subscribe({
    onSuccess: (result, prompt) => {
      if (handledPrompt.current && handledPrompt.current !== prompt) return;
      dispatch({ type: "generated", spec: result.spec, prompt, message: result.summary });
      heroEpoch.current += 1;
      if (result.imagePrompt) void generateHero(result.imagePrompt);
      setBusy(false); setStage("complete"); handledPrompt.current = "";
      playInterfaceSound("success");
    },
    onFailure: (message, prompt) => {
      if (handledPrompt.current && handledPrompt.current !== prompt) return;
      dispatch({ type: "failed", prompt, message: `${message} 已有作品保持不变。` });
      setError(message); setBusy(false); handledPrompt.current = "";
    },
  }), [subscribe]);

  useEffect(() => {
    if (task) { setStage(task.stage); setBusy(true); }
    else if (!handledPrompt.current) setBusy(false);
  }, [task]);

  useEffect(() => {
    if (!ready || projectHydrationStartedRef.current) return;
    projectHydrationStartedRef.current = true;
    const projectId = projectRef.current;
    if (!projectId) { setPersistenceReady(true); return; }
    let active = true;
    async function hydrate() {
      try {
        const [specResponse, conversationResponse] = await Promise.all([
          fetch(`/api/marketing/projects/${projectId}/brand-specs`, { cache: "no-store" }),
          fetch(`/api/marketing/projects/${projectId}/conversations`, { cache: "no-store" }),
        ]);
        if (!specResponse.ok || !conversationResponse.ok) return;
        const versions = await specResponse.json() as { spec_json?: string }[];
        const conversations = await conversationResponse.json() as { id?: string }[];
        const latestSpec = versions[0]?.spec_json;
        if (typeof latestSpec === "string") persistedSpecRef.current = latestSpec;
        const latestConversation = conversations[0]?.id;
        if (typeof latestConversation !== "string" || !/^[a-f0-9]{32}$/.test(latestConversation)) return;
        const messageResponse = await fetch(`/api/marketing/projects/${projectId}/conversations/${latestConversation}/messages`, { cache: "no-store" });
        if (!messageResponse.ok) return;
        const messages = await messageResponse.json() as unknown[];
        conversationRef.current = latestConversation;
        persistedMessageCountRef.current = messages.length;
      } catch { /* an offline backend must not block local Studio */ }
      finally { if (active) setPersistenceReady(true); }
    }
    void hydrate();
    return () => { active = false; };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      const saved = SavedWorkspaceSchema.parse({ version: 1, draft: state.draft, messages: state.messages, history: state.history });
      let fallback = false;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, history: [] }));
        fallback = true;
      } catch { /* IndexedDB retains uploaded photos and history without Web Storage's small quota. */ }
      void saveWorkspace(saved).then(() => setSaveWarning("")).catch(() => {
        if (!fallback) setSaveWarning("无法持久保存草稿；请导出 JSON，刷新前保存当前作品。");
        else setSaveWarning("已保存当前草稿，但版本历史未能持久保存；刷新前可导出 JSON。");
      });
    } catch { setSaveWarning("临时存储已满或不可用：本次修改仍在内存中，刷新会丢失。请导出 JSON 备份。"); }
  }, [state.draft, state.messages, state.history, ready]);

  useEffect(() => {
    if (!ready || !persistenceReady || !state.draft.spec) return;
    const timer = window.setTimeout(() => { void persistStudioState(state.draft.spec, state.messages); }, 250);
    return () => window.clearTimeout(timer);
  }, [state.draft.spec, state.messages, ready, persistenceReady]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);


  async function persistStudioState(nextSpec: typeof spec, nextMessages: typeof state.messages) {
    if (!nextSpec) return;
    const serialized = JSON.stringify(nextSpec);
    const shouldSaveSpec = serialized !== persistedSpecRef.current;
    if (!shouldSaveSpec && nextMessages.length <= persistedMessageCountRef.current) return;
    persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
      try {
        if (!projectRef.current) {
          const created = await fetch("/api/marketing/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextSpec.brand.name, description: nextSpec.campaign.prompt }) });
          if (!created.ok) return;
          const project = await created.json() as { id: string };
          projectRef.current = project.id;
          sessionStorage.setItem(PROJECT_KEY, project.id);
          projectNameRef.current = nextSpec.brand.name;
        }
        if (shouldSaveSpec) {
          const saved = await fetch(`/api/marketing/projects/${projectRef.current}/brand-specs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec_json: serialized, prompt: nextSpec.campaign.prompt, source: "studio" }) });
          if (!saved.ok) return;
          persistedSpecRef.current = serialized;
        }
        if (!conversationRef.current) {
          const created = await fetch(`/api/marketing/projects/${projectRef.current}/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${nextSpec.brand.name} · Studio` }) });
          if (created.ok) conversationRef.current = (await created.json() as { id: string }).id;
        }
        if (!conversationRef.current) return;
        const pendingMessages = nextMessages.slice(persistedMessageCountRef.current);
        for (const message of pendingMessages) {
          const saved = await fetch(`/api/marketing/projects/${projectRef.current}/conversations/${conversationRef.current}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: message.role, content: message.text }) });
          if (!saved.ok) break;
          persistedMessageCountRef.current += 1;
        }
      } catch { /* local Studio remains usable when the optional backend is offline */ }
    });
    await persistenceQueueRef.current;
  }

  function generate(prompt: string, imageData: string | null) {
    if (busy) return;
    if (!ai.enabled) { dispatch({ type: "generate", prompt, image: imageData }); return; }
    setError(""); setBusy(true); setStage("queued"); handledPrompt.current = prompt;
    startGeneration(prompt, imageData);
  }

  function generateMarketingWebsite(brief: string, source: string | null) {
    if (busy) return;
    setError(""); setMode("website");
    if (!ai.enabled) { dispatch({ type: "generate", prompt: brief, image: source }); setError("AI 未启用，已使用本地演示品牌生成推广网页；营销素材可在示例模式下继续生成。"); return; }
    setBusy(true); setStage("queued"); handledPrompt.current = brief;
    startGeneration(brief, source);
  }

  async function edit(prompt: string) {
    if (!spec || busy) return;
    if (!ai.enabled) { dispatch({ type: "prompt", prompt }); playInterfaceSound("success"); return; }
    setError(""); setBusy(true); setStage("model"); playInterfaceSound("tap");
    try {
      const result = await requestEdit(spec, prompt, image);
      setStage("validating");
      dispatch({ type: "applied", spec: result.spec, message: result.message, prompt });
      if (result.imagePrompt) void generateHero(result.imagePrompt);
      setStage("complete"); playInterfaceSound("success");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "修改失败。";
      dispatch({ type: "failed", prompt, message: `${message} 上一版作品已保留。` });
      setError(message);
    } finally { setBusy(false); }
  }

  async function submitPrompt(prompt: string) {
    if (busy || mediaRunning.current) return;
    const intent = campaignIntent(prompt, !!spec, freshUpload.current);
    setMarketingOpen(false);
    setError("");
    if (!intent.image && !intent.video) {
      setMode("website");
      spec ? void edit(prompt) : generate(prompt, image);
      return;
    }
    if (!ai.enabled && !spec) {
      setError(`请先创建网站并上传照片，再使用本地素材合成。${ai.reason ?? "请检查服务端 .env.local。"}`);
      return;
    }
    mediaRunning.current = true; setMediaBusy(true);
    try {
      let currentSpec = intent.campaign ? null : spec;
      let sourceImage = image;
      setMode("website");
      setCampaignProgress("正在理解产品并生成网站…");
      if (intent.campaign) { projectRef.current = null; conversationRef.current = null; persistedSpecRef.current = ""; persistedMessageCountRef.current = 0; sessionStorage.removeItem(PROJECT_KEY); }
      if (intent.website) {
        setBusy(true); setStage("model");
        try {
          if (currentSpec) {
            const result = await requestEdit(currentSpec, prompt, image);
            currentSpec = result.spec;
            dispatch({ type: "applied", spec: result.spec, message: result.message, prompt });
          } else {
            const result = await requestGenerate(prompt, image, setStage);
            currentSpec = result.spec;
            heroEpoch.current += 1;
            dispatch({ type: "generated", spec: result.spec, prompt, message: result.summary });
          }
        } finally { setBusy(false); }
      }
      const context = currentSpec ? `品牌：${currentSpec.brand.name}。产品：${currentSpec.brand.descriptor}。推广主题：${currentSpec.campaign.prompt}。\n` : "";
      freshUpload.current = false;
      const generatedSpec = currentSpec;
      let posterTask: Promise<void> = Promise.resolve();

      const createMedia = async (kind: "image" | "video") => {
        if (!(kind === "image" ? intent.image : intent.video)) return;
        setCampaignProgress(kind === "image" ? "网站已就绪，正在生成产品宣传图…" : "正在生成5秒宣传视频，可切换查看网站和图片…");
        try {
          let result;
          if (!ai.enabled) {
            if (!currentSpec) throw new Error("请先生成网站并上传产品照片，再合成本地素材。");
            result = await requestLocalMedia(kind, currentSpec, sourceImage);
          } else {
            result = await requestMedia(kind, `${context}${prompt}。严格保留参考图片中的产品包装、形状、颜色、商标和文字，不替换商品。${kind === "video" ? "生成5秒高端产品发布短片，微距质感特写、真实环绕视差、轮廓光扫过、完整产品揭幕，原创电子配乐与转场音效，保持同一产品外观。" : "商业主视觉摄影，无新增文字，无水印。"}`.slice(0, 2000), sourceImage);
          }
          if (kind === "image") {
            dispatch({ type: "hero-image", image: result.url });
            const photo = await fetch(result.url);
            if (photo.ok) {
              const blob = await photo.blob();
              sourceImage = await readProductImage(new File([blob], "generated.png", { type: blob.type }));
            }
          }
          dispatch({ type: "media", result, prompt });
          if (kind === "image" && generatedSpec) {
            const posterSpec = { ...generatedSpec, assets: { ...generatedSpec.assets, heroImage: result.url } };
            posterTask = requestLocalMedia("image", posterSpec, result.url).then(poster => {
              dispatch({ type: "media", result: poster, prompt: "根据产品文案制作宣传海报" });
            }).catch(failure => { dispatch({ type: "failed", prompt: "宣传海报", message: failure instanceof Error ? failure.message : "海报排版失败。" }); });
          }
          playInterfaceSound("success");
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : "素材生成失败。";
          dispatch({ type: "failed", prompt, message }); setError(message);
        }
      };
      if (sourceImage) {
        // Both tasks reference the user's product; video need not wait for a new image.
        await Promise.all([createMedia("image"), createMedia("video")]);
      } else {
        await createMedia("image");
        await createMedia("video");
      }
      await posterTask;
      setCampaignProgress("生成任务已结束，可切换查看网站、宣传图、海报和视频。");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "生成失败。";
      dispatch({ type: "failed", prompt, message }); setError(message);
    } finally { mediaRunning.current = false; setMediaBusy(false); }
  }

  async function generateHero(prompt?: string) {
    if (heroRunning.current) return;
    if (!prompt && image) {
      dispatch({ type: "hero-image", image });
      setHeroError(""); setNotice("已使用上传的产品照片，无需请求图片模型。");
      return;
    }
    const current = documentRef.current;
    const brief = prompt || lastHeroPrompt.current || (current ? `Commercial product photography, ${current.brand.category}, ${current.brand.descriptor}. ${current.campaign.prompt}. No text or logos.` : "");
    if (!brief) return;
    lastHeroPrompt.current = brief;
    const epoch = heroEpoch.current;
    heroRunning.current = true; setHeroBusy(true); setHeroError("");
    try {
      const result = await requestMedia("image", brief.slice(0, 2000), image);
      if (epoch === heroEpoch.current) dispatch({ type: "hero-image", image: result.url });
    } catch (failure) {
      if (epoch === heroEpoch.current) setHeroError(failure instanceof Error ? failure.message : "主视觉生成失败，已保留现有图片或渐变背景。");
    } finally { heroRunning.current = false; setHeroBusy(false); }
  }

  function loadDemo() {
    heroEpoch.current += 1; setHeroError("");
    setError(""); dispatch({ type: "generate", prompt: "", demo: true }); playInterfaceSound("success");
  }
  function exportSpec() {
    if (!spec) return;
    const validated = BrandSpecSchema.parse(spec);
    const url = URL.createObjectURL(new Blob([JSON.stringify(validated, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "morphsite-brand-spec.json";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("BrandSpec JSON 已导出（包含上传的图片数据）。");
    playInterfaceSound("success");
  }

  return <main className="morph-shell studio-page">
    <SiteNav studio mode={ai.enabled ? "ai" : "demo"} />
    <div className="studio-shell">
      <StudioChat messages={state.messages} spec={spec} image={image} disabled={!ready || busy || mediaBusy} busy={busy || mediaBusy} ai={ai} stage={busy ? stage : null} mediaBusy={mediaBusy}
        onPrompt={(prompt) => { void submitPrompt(prompt); }}
        onDemo={loadDemo} onUpload={(uploaded) => { heroEpoch.current += 1; freshUpload.current = true; setHeroError(""); dispatch({ type: "upload", image: uploaded }); playInterfaceSound("success"); }}
        onBusy={setBusy} onError={setError} />
      <section className="preview-stage" aria-label="作品预览工作区" aria-busy={busy || mediaBusy}>
        <div className="marketing-entry"><button type="button" aria-expanded={marketingOpen} onClick={() => { setMarketingVisited(true); setMarketingOpen((open) => !open); }}><LayoutTemplate size={15} />{marketingOpen ? "返回作品预览" : "营销素材 · 文案 / 海报 / 短视频"}<ArrowUpRight size={14} /></button></div>
        {marketingVisited && <div className="marketing-scroll" hidden={!marketingOpen}><MarketingPanel spec={spec} image={image} onWebsite={(brief, source) => { setMarketingOpen(false); generateMarketingWebsite(brief, source); }} /></div>}
        {!marketingOpen && <>
        {campaignProgress && <p role="status" style={{ padding: "12px 24px", margin: 0 }}>{campaignProgress}</p>}
        <PreviewToolbar mode={mode} device={device} theme={spec?.theme.id} disabled={!spec || !ready || busy} canUndo={state.history.length > 0 && !busy && !mediaBusy} hasMedia={state.draft.media.some((item) => item.kind === (mode === "poster" ? "image" : mode === "video" ? "video" : ""))}
          onMode={(next) => { setMode(next); playInterfaceSound("tap"); }} onDevice={setDevice} onTheme={(theme) => { dispatch({ type: "theme", theme }); playInterfaceSound("tap"); }}
          onUndo={() => { heroEpoch.current += 1; dispatch({ type: "undo" }); playInterfaceSound("tap"); }} onExport={exportSpec} onPublish={() => setPublishOpen(open => !open)} />
        {spec && <div className="hero-task-controls" style={{ padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><button type="button" className="secondary-button" disabled={heroBusy} onClick={() => { void generateHero(); }}>{heroBusy ? "主视觉图片生成中…" : "重新生成主视觉图片"}</button><span role="status">{heroBusy ? "独立图片任务运行中，网站可继续编辑和发布" : image ? "使用上传照片，无需 AI 图片额度" : spec.assets.heroImage ? "已使用现有主视觉" : "使用品牌渐变背景，无需图片额度"}</span>{heroError && <p role="alert" style={{ width: "100%", margin: 0 }}>{heroError}</p>}</div>}
        {spec && <div className="document-tools">
          <label>网站布局 <select aria-label="网站布局" value={spec.website.layout ?? "cinematic"} disabled={busy} onChange={event => dispatch({ type: "layout", layout: event.target.value as "cinematic" | "editorial" | "product-first" })}><option value="cinematic">沉浸式</option><option value="editorial">品牌图文</option><option value="product-first">产品优先</option></select></label>
          <label>版本历史 <select aria-label="版本历史" value="" disabled={busy || !state.history.some(item => item.spec)} onChange={event => { heroEpoch.current++; dispatch({ type: "history", index: Number(event.target.value) }); }}><option value="">选择历史版本</option>{state.history.map((draft, index) => draft.spec && <option key={index} value={index}>{index + 1}. {draft.spec.website.title} · {draft.spec.theme.name}</option>)}</select></label>
        </div>}
        {publishOpen && spec && <PublishWebsite key={state.draft.documentId ?? "legacy"} spec={spec} documentId={state.draft.documentId ?? "legacy"} disabled={busy || mediaBusy} />}
        <div className="preview-wrap" tabIndex={0} aria-label="预览滚动区域">
          {mode !== "website" && state.draft.media.some((item) => item.kind === (mode === "poster" ? "image" : "video")) ? <div className="generated-media-preview" style={{ padding: 24, display: "grid", gap: 16, justifyItems: "center" }}>{state.draft.media.filter((item) => item.kind === (mode === "poster" ? "image" : "video")).slice().reverse().map((item) => <figure key={item.url} style={{ margin: 0, maxWidth: "100%" }}>{item.kind === "video" ? <video src={item.url} controls playsInline preload="metadata" style={{ maxWidth: "100%", maxHeight: "65vh" }} /> : <img src={item.url} alt="产品宣传图" style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" }} />}<figcaption><a className="secondary-button" href={item.url} download target="_blank" rel="noreferrer">下载{item.kind === "image" ? "宣传图" : "视频"}</a><span> · {item.model}</span></figcaption></figure>)}</div> : spec ? <div className="preview-result" key={`${spec.brand.name}-${mode}`}><BrandPreview spec={spec} mode={mode} device={device} /></div> : mode === "website" ? <div className="preview-result"><BrandPreview spec={null} mode="website" device={device} /></div> : <div className={`empty-preview ${busy ? "is-generating" : ""}`}><div className="empty-art"><Asterisk size={96} strokeWidth={0.7} /><i /><i /></div><div className="mono-label">A BLANK CANVAS. A NEW POSSIBILITY.</div><h2>你的下一个品牌，<br />从这里开始。</h2><p>输入创意、上传一张图片，或先看看<br />VOID COFFEE 的完整演示。</p><button className="primary-button" onClick={loadDemo} disabled={!ready || busy}>使用演示品牌<ArrowUpRight size={16} /></button><span className="empty-caption"><LayoutTemplate size={13} />网站 · 海报 · 视频分镜</span></div>}
        </div>
        <StudioActivity busy={busy} ready={ready} stage={stage} editing={!!spec} />
        <div className="preview-status"><span><Check size={12} />{spec ? "BrandSpec 已校验" : busy ? "等待完整的校验结果" : mode === "website" ? "默认模板预览 · 尚未生成作品" : "等待创意输入"}</span><span>{spec ? `${spec.website.sections.length} 个区块 · ${spec.theme.name}` : ai.enabled ? `AI 已连接 · ${ai.model}` : "本地 Demo / 未连接 AI"}</span></div></>}
      </section>
    </div>
    {(error || saveWarning) && <div className="workspace-alert" role="alert"><p>{error || saveWarning}</p><button className="secondary-button" type="button" onClick={() => { setError(""); setSaveWarning(""); }}>知道了</button></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
