"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "./image-upload";
import { HANDOFF_KEY, HandoffSchema } from "@/lib/studio-state";
import { useGeneration, playInterfaceSound } from "./generation-provider";

type TransitionPhase = "idle" | "gather" | "frame" | "handoff";

export function HomeComposer() {
  const router = useRouter();
  const { startGeneration } = useGeneration();
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const timer = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const opening = phase !== "idle";
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const source = root.current?.parentElement;
    if (!source) return;
    const transition = (event: Event) => {
      const detail = (event as CustomEvent<{ phase: TransitionPhase; x: number; y: number }>).detail;
      if (detail.phase === "gather") {
        playInterfaceSound("whoosh");
        root.current?.style.setProperty("--gather-x", `${detail.x}px`);
        root.current?.style.setProperty("--gather-y", `${detail.y}px`);
      }
      setPhase(detail.phase);
      // The provider request already runs. This timer only controls the view change.
      if (detail.phase === "frame") {
        if (timer.current) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => router.push("/studio?brief=1"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300);
      }
    };
    source.addEventListener("morph-generate-phase", transition);
    return () => source.removeEventListener("morph-generate-phase", transition);
  }, [router]);

  return <div ref={root} className="home-composer-wrap" data-phase={phase} data-opening={opening}>
    <form className="home-composer" onSubmit={(event) => {
      event.preventDefault();
      if (busy || opening || !prompt.trim()) {
        if (!prompt.trim()) { setError("先写下一句想法，再让它开始成形。"); textarea.current?.focus(); }
        return;
      }
      try {
        const brief = HandoffSchema.parse({ prompt: prompt.trim(), image });
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(brief));
        // Start the real fetch before any transition timer, exactly once.
        startGeneration(brief.prompt, brief.image);
        const bounds = root.current?.getBoundingClientRect();
        const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
        const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
        setPhase("gather");
        // Navigation must still work if WebGL or the decorative timeline fails.
        timer.current = window.setTimeout(() => router.push("/studio?brief=1"), 1400);
        window.dispatchEvent(new CustomEvent("morph-generate", { detail: { x, y } }));
      } catch { setError("浏览器临时存储不可用，请直接进入工作台；图片尚未传递。"); }
    }}>
      <div className="composer-prompt-heading"><span className="prompt-mark">↳</span><span>Describe your brand. Create your world.</span></div>
      <label className="sr-only" htmlFor="home-prompt">一句话描述你的品牌</label>
      <textarea ref={textarea} id="home-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); setError(""); }} placeholder="描述你的品牌，或告诉 AI 你想创造什么……" aria-describedby="home-demo-note" aria-invalid={!!error} maxLength={2000} rows={2} disabled={opening} />
      {image && <div className="upload-thumbnail"><img src={image} alt="待生成的产品图片" /><span>Product image ready</span><button type="button" disabled={opening} className="icon-button" aria-label="移除图片" onClick={() => { setImage(null); playInterfaceSound("tap"); }}><X size={14} /></button></div>}
      <div className="composer-bottom"><ImageUpload onUpload={(value) => { setImage(value); setError(""); playInterfaceSound("tap"); }} onError={setError} onBusy={setBusy} disabled={opening} /><button className="create-button" type="submit" disabled={busy || opening}>{phase === "idle" ? "Generate" : phase === "gather" ? "Gathering ideas" : "Opening studio"}<ArrowUpRight size={17} /></button></div>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="home-prompt-examples" aria-label="示例提示词"><span>Try</span>{["周末咖啡节", "独立香氛品牌"].map((example) => <button type="button" key={example} disabled={opening} onClick={() => { setPrompt(`为${example}设计一个有个性的品牌世界。`); setError(""); textarea.current?.focus(); playInterfaceSound("tap"); }}>{example}<ArrowUpRight size={10} /></button>)}</div>
    <p id="home-demo-note" className="composer-caption"><ImagePlus size={12} /> AI 启用时会向供应商发送简报与素材；未启用时明确提示 Demo。</p>
    <span className="sr-only" role="status" aria-live="polite">{opening ? "简报已提交，正在进入工作台。" : ""}</span>
    {phase === "frame" && <div className="generation-frame" aria-hidden="true"><i /><i /><i /><i /><span>YOUR IDEA / TAKING SHAPE</span></div>}
    {phase === "handoff" && <span className="generation-handoff" aria-hidden="true">ENTERING STUDIO</span>}
  </div>;
}
