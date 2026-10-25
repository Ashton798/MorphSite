"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Asterisk, Check, FlaskConical, LoaderCircle } from "lucide-react";
import type { Message } from "@/lib/studio-state";
import type { BrandSpec } from "@/lib/brand-spec";
import { GENERATION_STAGE_LABELS, type AiStatus } from "@/lib/ai-client";
import type { GenerationStage } from "@/lib/ai/contracts";
import { ImageUpload } from "./image-upload";

const SUGGESTIONS = ["改成粉色", "把标题改成周末咖啡节", "为这个产品生成一张宣传图", "为这个产品生成宣传视频"];
const EDIT_LABELS: Partial<Record<GenerationStage, string>> = {
  queued: "修改已提交，等待服务端响应…", model: "AI 正在理解修改，并生成受限操作…",
  validating: "修改已返回，正在校验并保留其他字段…", complete: "修改已完成。",
};

export function StudioChat({ messages, spec, image, disabled, busy, ai, stage, onPrompt, onDemo, onUpload, onBusy, onError, mediaBusy = false }: {
  mediaBusy?: boolean;
  messages: Message[]; spec: BrandSpec | null; image: string | null; disabled: boolean; busy: boolean; ai: AiStatus; stage: GenerationStage | null;
  onPrompt: (prompt: string) => void; onDemo: () => void;
  onUpload: (image: string) => void; onBusy: (busy: boolean) => void; onError: (error: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  function send() {
    if (!prompt.trim() || disabled) return;
    onPrompt(prompt.trim()); setPrompt("");
  }
  const actionLabel = busy ? "生成中" : ai.enabled ? "发送" : "生成演示";
  return <aside className="studio-sidebar" aria-label="品牌创意对话">
    <div className="sidebar-top"><div><div className="mono-label">YOUR CREATIVE PARTNER</div><h1>让想法，有了形状。</h1></div><span className="mode-badge" title={ai.reason}>{ai.enabled ? "AI" : "Demo"}</span></div>
    <div className="project-meta"><div className="project-symbol"><Asterisk size={22} /></div><div><strong>{spec?.brand.name ?? "新的品牌创作"}</strong><p>{spec ? `${spec.theme.name} · ${ai.enabled ? ai.model : "本地草稿"}` : ai.enabled ? `已连接 ${ai.model}` : "从一句话开始，或体验演示"}</p></div>{spec && <Check size={15} className="project-check" />}</div>
    <div className="chat-log" ref={log} role="log" aria-label="对话历史" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
      {messages.map((message, i) => <div className={`chat-message ${message.role}`} key={i}><div className="message-label">{message.role === "assistant" ? <><Asterisk size={14} />MORPHSITE</> : "YOU"}</div><p>{message.text}</p></div>)}
      {busy && <div className="chat-message assistant pending"><div className="message-label"><Asterisk size={14} />MORPHSITE</div><p><LoaderCircle size={13} className="spin" />{mediaBusy ? "正在生成推广素材，视频可能需要数分钟…" : spec ? EDIT_LABELS[stage ?? "model"] ?? EDIT_LABELS.model : GENERATION_STAGE_LABELS[stage ?? "queued"]}</p><div className="request-steps" aria-label="实际请求进度">{(["model", "validating", "image"] as const).map((step) => <span key={step} className={stage === step || (stage === "image" && step === "validating") || stage === "complete" ? "reached" : ""}><i />{step === "model" ? "理解" : step === "validating" ? "校验" : "主视觉"}</span>)}</div></div>}
    </div>
    {spec && <div className="prompt-suggestions" aria-label="示例修改指令"><span>试着说</span>{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={disabled} onClick={() => onPrompt(suggestion)}>{suggestion}<ArrowUp size={12} /></button>)}</div>}
    {image && <div className="upload-thumbnail"><img src={image} alt="当前上传的产品图片" /><div><strong>产品图片已应用</strong><small>{ai.enabled ? "生成时会发送给 AI 供应商" : "图片仅在本标签页保存"}</small></div><Check size={14} /></div>}
    <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <label htmlFor="studio-prompt" className="sr-only">品牌创意指令</label>
      <textarea id="studio-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000}
        placeholder="描述你的产品并上传图片，自动生成网站、宣传图、海报和视频…"
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      <div className="input-toolbar"><ImageUpload onUpload={onUpload} onError={onError} onBusy={onBusy} disabled={disabled} /><button type="submit" className="send-button" disabled={disabled || !prompt.trim()}>{actionLabel}<ArrowUp size={15} /></button></div>
    </form>
    <button type="button" className="demo-brand-button" onClick={onDemo} disabled={disabled}><FlaskConical size={15} />使用演示品牌<span>VOID COFFEE ↗</span></button>
    <p className="sidebar-footnote">{ai.enabled ? `AI 生成 · ${ai.model} · Enter 发送` : "确定性 Demo · 不调用 AI · Enter 发送"}</p>
  </aside>;
}
