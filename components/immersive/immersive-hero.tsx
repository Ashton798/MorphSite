"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ParticleUniverse } from "./particle-universe";
import type { SceneInput } from "./particle-scene";
import { playInterfaceSound } from "@/components/generation-provider";

const forms = [
  { name: "Universe", title: "An idea,\nstill becoming.", detail: "Every possibility begins without a shape.", tag: "CREATIVE MATTER" },
  { name: "Website", title: "A world\nto step into.", detail: "从一句话，到一个有结构、有声音的品牌网站。", tag: "01 / WEBSITE STRUCTURE" },
  { name: "Poster", title: "A moment.\nMade visible.", detail: "同一个品牌，凝聚为一张有态度的海报。", tag: "02 / POSTER COMPOSITION" },
  { name: "Video", title: "A story,\nready to move.", detail: "把品牌的节奏，写进下一段影像的分镜。", tag: "03 / VIDEO STORYBOARD" },
];
const initialInput: SceneInput = { progress: 0, pointerX: 0, pointerY: 0, paused: false, reduced: false, magnetism: .75, focus: 0, converge: 0 };

export function ImmersiveHero({ children }: { children: ReactNode }) {
  const reducedPreference = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const reduced = mounted && !!reducedPreference;
  const heroRef = useRef<HTMLElement>(null);
  const input = useRef<SceneInput>({ ...initialInput });
  const composerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const [paused, setPaused] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end end"] });
  const introOpacity = useTransform(scrollYProgress, [0, .06, .17], [1, 1, 0]);
  const introY = useTransform(scrollYProgress, [0, .2], [0, reduced ? 0 : -45]);
  const detailOpacity = useTransform(scrollYProgress, [0, .12, .24], [0, 0, 1]);

  useEffect(() => scrollYProgress.on("change", (value) => {
    const sceneProgress = Math.min(value * 3.55, 3);
    input.current.progress = input.current.reduced ? Math.round(sceneProgress) : sceneProgress;
    setActive(Math.min(3, Math.round(sceneProgress)));
    if (input.current.reduced || input.current.paused) window.dispatchEvent(new Event("morph-settings"));
  }), [scrollYProgress]);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    input.current.paused = paused;
    input.current.reduced = !!reduced;
    input.current.progress = reduced ? Math.round(Math.min(scrollYProgress.get() * 3.55, 3)) : Math.min(scrollYProgress.get() * 3.55, 3);
    window.dispatchEvent(new Event("morph-settings"));
  }, [paused, reduced, scrollYProgress]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || paused || reduced) return;
      input.current.pointerX = (event.clientX / window.innerWidth - .5) * 2;
      input.current.pointerY = (.5 - event.clientY / window.innerHeight) * 2;
    };
    const reset = () => { input.current.pointerX = 0; input.current.pointerY = 0; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset); };
  }, [paused, reduced]);
  useEffect(() => {
    const generate = (event: Event) => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (generating) return;
      setGenerating(true);
      const bounds = composerRef.current?.getBoundingClientRect();
      const detailX = bounds ? bounds.left + bounds.width / 2 : x;
      const detailY = bounds ? bounds.top + bounds.height / 2 : y;
      const dispatch = (phase: "gather" | "frame" | "handoff") => composerRef.current?.dispatchEvent(new CustomEvent("morph-generate-phase", { detail: { phase, x: detailX, y: detailY } }));
      if (reduced) { dispatch("frame"); return; }
      input.current.pointerX = (x / window.innerWidth - .5) * 2;
      input.current.pointerY = (.5 - y / window.innerHeight) * 2;
      input.current.magnetism = 1.9;
      dispatch("gather");
      window.dispatchEvent(new Event("morph-settings"));
      timers.current.push(window.setTimeout(() => { input.current.converge = .76; window.dispatchEvent(new Event("morph-settings")); }, 280));
      timers.current.push(window.setTimeout(() => dispatch("frame"), 650));
      timers.current.push(window.setTimeout(() => dispatch("handoff"), 980));
    };
    window.addEventListener("morph-generate", generate);
    return () => window.removeEventListener("morph-generate", generate);
  }, [generating, reduced]);
  const setPointerPresence = (present: boolean) => {
    input.current.magnetism = present ? 1.75 : .75;
    input.current.focus = present ? 1 : 0;
  };

  function jumpToForm(index: number) {
    const hero = heroRef.current;
    if (!hero) return;
    playInterfaceSound("tap");
    const travel = hero.offsetHeight - (hero.firstElementChild as HTMLElement).offsetHeight;
    window.scrollTo({ top: hero.offsetTop + travel * index / 3.55, behavior: reduced ? "instant" : "smooth" });
  }

  return <section ref={heroRef} onPointerDown={(event) => {
      const target = event.target as Element;
      if (event.button !== 0 || target.closest("button, a, input, textarea, select, label")) return;
      window.dispatchEvent(new CustomEvent("morph-ripple", { detail: { clientX: event.clientX, clientY: event.clientY } }));
    }} className="immersive-hero" aria-labelledby="home-title" data-scene-status={status} data-active-form={forms[active].name.toLowerCase()} data-generating={generating}>
    <div className="immersive-sticky">
      <div className="particle-atmosphere" aria-hidden="true" />
      <ParticleUniverse input={input} onReady={() => setStatus("ready")} onFallback={() => setStatus("fallback")} />
      <div className="particle-vignette" aria-hidden="true" />
      <motion.div className="hero-intro" style={{ opacity: introOpacity, y: introY, pointerEvents: "none" }} inert={active > 0 && status !== "fallback"}>
        <div className="hero-eyebrow"><span className="live-dot" /> A LITTLE IMAGINATION. A WHOLE NEW WORLD.</div>
        <div className="immersive-brand">
          <motion.h1 id="home-title" initial={false} animate={{ rotateX: reduced ? 0 : [10, 0], rotateY: reduced ? 0 : [-5, 0], z: 0 }} transition={{ duration: 1.5, ease: [.16, 1, .3, 1] }}>MORPHSITE<span>®</span></motion.h1>
          <p className="immersive-tagline">Ideas become <span>experiences.</span></p>
        </div>
        <div className="hero-composer-dock">
          <div className="hero-dock-copy"><span className="dock-kicker">THE NEXT THING STARTS HERE</span><h2>Your ideas.<br /><span>Made real.</span></h2><Link href="/studio?demo=1" className="demo-entry" onClick={() => playInterfaceSound("tap")}>使用演示品牌 <ArrowUpRight size={14} /></Link></div>
          <div id="create" ref={composerRef} className="hero-dock-form-slot" onPointerEnter={() => setPointerPresence(true)} onPointerLeave={() => setPointerPresence(false)} onFocusCapture={() => setPointerPresence(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPointerPresence(false); }}>{children}</div>
        </div>
      </motion.div>
      <motion.div className="morph-explainer" style={{ opacity: detailOpacity }} aria-hidden={active === 0}>
        <span className="section-index">{forms[active].tag}</span>
        <h2>{forms[active].title}</h2><p>{forms[active].detail}</p>
        <span className="morph-explainer-note">{active === 3 ? "DEMO / STORYBOARD STUDY · NOT RENDERED VIDEO" : "PARTICLE STUDY / NOT GENERATED OUTPUT"}</span>
      </motion.div>
      {status === "fallback" && <span className="scene-fallback-note">静态视觉模式 · 当前设备无法运行 WebGL</span>}
      <div className="hero-floor">
        <button className="hero-scroll-prompt" onClick={() => jumpToForm(active < 3 ? active + 1 : 0)}><ArrowDown size={15} />Scroll to morph</button>
        <div className="hero-morph-rail" aria-label="粒子形态导航">{forms.map((form, index) => <button key={form.name} className={active === index ? "active" : ""} onClick={() => jumpToForm(index)} aria-pressed={active === index}><span>0{index}</span>{form.name}</button>)}</div>
        {mounted
          ? <button className="motion-control" onClick={() => { setPaused(!paused); playInterfaceSound("tap"); }} aria-label={reduced ? "已启用减少动态效果" : paused ? "播放场景动画" : "暂停场景动画"} aria-pressed={paused || reduced} disabled={reduced || status === "fallback"}>{paused || reduced ? <Play size={12} /> : <Pause size={12} />}<span>{status === "fallback" ? "Static mode" : reduced ? "Reduced motion" : paused ? "Motion off" : "Motion on"}</span></button>
          : <span className="motion-control" aria-hidden="true" />}
      </div>
    </div>
  </section>;
}
