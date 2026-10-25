"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Crosshair, Pause, Play } from "lucide-react";
import type { BrandSpec, WebsiteSection } from "@/lib/brand-spec";
import { DEFAULT_SAAS_HERO, resolveSaasHeroContent, SAAS_HERO_VIDEO_URL, SAAS_PROOF_BRANDS, type SaasHeroContent } from "@/lib/saas-hero-content";
import { LiquidGlass } from "./liquid-glass";

type HeroLinks = { features: string; solutions: string; plans: string; learning: string; action: string };
type PreviewLinkHandler = (event: MouseEvent<HTMLAnchorElement>) => void;

function HeroNavbar({ logo, links, navigate }: { logo: string; links: HeroLinks; navigate: PreviewLinkHandler }) {
  return <LiquidGlass className="saas-hero-nav mx-auto flex w-full max-w-[850px] items-center justify-between rounded-3xl">
    <a className="saas-hero-logo" href={links.features} onClick={navigate} aria-label={`${logo} · Features`}>
      <span className="saas-logo-mark rounded-lg"><Crosshair size={20} strokeWidth={1.8} aria-hidden="true" /></span>
      <strong className="text-xl font-semibold">{logo}</strong>
    </a>
    <nav className="saas-hero-links" aria-label="网站模板导航">
      <a href={links.features} onClick={navigate}>Features <ChevronDown size={13} aria-hidden="true" /></a>
      <a href={links.solutions} onClick={navigate}>Solutions</a>
      <a href={links.plans} onClick={navigate}>Plans</a>
      <a href={links.learning} onClick={navigate}>Learning <ChevronDown size={13} aria-hidden="true" /></a>
    </nav>
    <a className="saas-signup rounded-xl" href={links.action} onClick={navigate}>Sign Up <ArrowUpRight size={13} aria-hidden="true" /></a>
  </LiquidGlass>;
}

function AnnouncementBadge({ href, navigate }: { href: string; navigate: PreviewLinkHandler }) {
  return <LiquidGlass className="saas-announcement rounded-full"><span>Nova+ Launched!</span><a className="saas-explore" href={href} onClick={navigate}>Explore <ChevronRight size={13} aria-hidden="true" /></a></LiquidGlass>;
}

function HeroCTAGroup({ content, href, navigate }: { content: SaasHeroContent; href: string; navigate: PreviewLinkHandler }) {
  return <div className="saas-hero-actions flex flex-wrap justify-center">
    <a className="saas-button saas-button-primary rounded-full px-6 py-3 text-base font-medium" href={href} onClick={navigate}>{content.primaryLabel}</a>
    <a className="saas-button saas-button-secondary liquid-glass rounded-full px-6 py-3 text-base font-normal" href={href} onClick={navigate}>{content.secondaryLabel}</a>
  </div>;
}

function SocialProofMarquee({ paused }: { paused: boolean }) {
  return <div className="saas-proof">
    <p className="saas-proof-label">Relied on by brands<br className="saas-proof-break" /> across the globe</p>
    <div className="saas-marquee-viewport" aria-label={`示例品牌：${SAAS_PROOF_BRANDS.join(", ")}`}>
      <div className="saas-marquee-track" style={{ animationPlayState: paused ? "paused" : "running" }} aria-hidden="true">
        {[0, 1].map((copy) => <div className="saas-marquee-group" key={copy}>{SAAS_PROOF_BRANDS.map((brand) => <span className="saas-proof-brand" key={brand}><span className="liquid-glass rounded-lg">{brand[0]}</span><b>{brand}</b></span>)}</div>)}
      </div>
    </div>
  </div>;
}

/** Only a Website renderer. Decorative media and mock social proof never enter BrandSpec. */
export function SaasVideoHeroTemplate({ spec, section, content: overrides, videoUrl = SAAS_HERO_VIDEO_URL }: {
  spec?: BrandSpec | null;
  section?: WebsiteSection;
  content?: Partial<SaasHeroContent>;
  videoUrl?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [videoState, setVideoState] = useState<"loading" | "playing" | "paused" | "fallback">("loading");
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const content = resolveSaasHeroContent(spec, section, overrides);
  const stopMotion = reduced || paused;
  const heroSection = section ?? spec?.website.sections.find((item) => item.type === "Hero");
  const sectionHref = (type: WebsiteSection["type"]) => {
    const match = spec?.website.sections.find((item) => item.type === type);
    return match ? `#brand-${match.id}` : `#${noteId}`;
  };
  const links: HeroLinks = {
    features: sectionHref("ProductShowcase"), solutions: sectionHref("Story"),
    plans: sectionHref("Promotion"), learning: sectionHref("Gallery"),
    action: heroSection?.target ? `#brand-${heroSection.target}` : sectionHref("CTA"),
  };
  const navigate: PreviewLinkHandler = (event) => {
    event.preventDefault();
    const id = event.currentTarget.hash.slice(1);
    const frame = root.current?.closest(".website-frame");
    const target = frame ? Array.from(frame.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id === id) : null;
    const scroll = root.current?.closest<HTMLElement>(".preview-wrap");
    if (spec && target && scroll) {
      // Scroll the preview pane only, never the Studio page or its chat history.
      const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 12;
      scroll.scrollTo({ top, behavior: reduced ? "instant" : "smooth" });
    } else setNotice("模板交互示例，尚未接入注册或咨询服务。输入简报或使用演示品牌以生成可编辑作品。");
  };

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference.matches);
    sync(); preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let inView = true, active = true;
    const sync = () => {
      if (!active || videoState === "fallback") return;
      if (stopMotion || !inView || document.hidden) { element.pause(); return; }
      void element.play().catch(() => { if (active) setVideoState("paused"); });
    };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: .02 });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { active = false; observer.disconnect(); document.removeEventListener("visibilitychange", sync); element.pause(); };
  }, [stopMotion, videoState === "fallback"]);

  // These are local HSL tokens, deliberately not the app's global primary/theme tokens.
  const tokens = {
    "--saas-bg": "hsl(260 87% 3%)", "--saas-fg": "hsl(40 6% 95%)",
    "--saas-primary": "hsl(121 95% 76%)", "--saas-primary-foreground": "hsl(0 0% 5%)",
    "--saas-heading": "hsl(40 10% 96%)", "--saas-sub": "hsl(40 6% 82%)",
    "--saas-muted": "hsl(240 4% 16%)", "--saas-border": "hsl(240 4% 20%)",
  } as CSSProperties;

  return <section ref={root} id={`brand-${heroSection?.id ?? "hero"}`} className="site-section hero saas-video-hero" style={tokens} aria-labelledby={titleId} data-video-state={videoState} data-template-default={!spec}>
    <div className="saas-video-layer pointer-events-none" aria-hidden="true">
      <div className="saas-video-fallback" />
      <video ref={video} className="saas-hero-video absolute inset-0 size-full object-cover" src={videoUrl} autoPlay={!stopMotion} loop muted playsInline preload="metadata" tabIndex={-1}
        onPlaying={() => setVideoState("playing")} onPause={() => setVideoState((value) => value === "fallback" ? value : "paused")} onError={() => setVideoState("fallback")} />
      <div className="saas-video-overlay" />
    </div>
    <div className="saas-hero-content relative z-10 flex flex-col">
      <HeroNavbar logo={content.logo} links={links} navigate={navigate} />
      <div className="saas-hero-center text-center">
        <AnnouncementBadge href={links.features} navigate={navigate} />
        <h2 id={titleId} className="font-semibold tracking-tight">{content.title === DEFAULT_SAAS_HERO.title ? <><span>Accelerate Your</span><span>Revenue Growth Now</span></> : content.title.split("\n").map((line, index) => <span key={index}>{line}</span>)}</h2>
        <p className="saas-hero-sub">{content.subtitle}</p>
        <HeroCTAGroup content={content} href={links.action} navigate={navigate} />
        <p id={noteId} className="saas-interaction-note" role="status">{notice}</p>
      </div>
      <SocialProofMarquee paused={stopMotion} />
      <div className="saas-template-meta"><span>ILLUSTRATIVE BRANDS · 模板品牌示例</span><button type="button" className="saas-motion-toggle" disabled={reduced} aria-pressed={stopMotion} aria-label={reduced ? "模板已启用减少动态效果" : paused ? "播放模板背景与品牌滚动" : "暂停模板背景与品牌滚动"} onClick={() => setPaused((value) => !value)}>{stopMotion ? <Play size={12} /> : <Pause size={12} />}{reduced ? "Reduced motion" : paused ? "Motion off" : "Motion on"}</button></div>
    </div>
  </section>;
}
