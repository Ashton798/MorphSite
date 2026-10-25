"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowUp, RotateCcw, Check } from "lucide-react";
import { setBrandTheme, demoBrandSpec } from "@/lib/brand-spec";
import { paletteVars } from "@/lib/preview-theme";
import { getWebsiteBlock } from "@/lib/website-registry";
import { Reveal } from "./motion-elements";

export function RemakeDemo() {
  const [remade, setRemade] = useState(false);
  const themed = setBrandTheme(demoBrandSpec, remade ? "bold-future" : "soft-minimal");
  const spec = { ...themed, assets: { ...themed.assets, heroImage: "/assets/showcase/coffee-editorial.webp" } };
  const hero = spec.website.sections.find((section) => section.type === "Hero")!;
  // This is a single-section demonstration, not the complete site: no dead anchor.
  const displayHero = { ...hero, target: undefined, cta: undefined };
  const Hero = getWebsiteBlock("Hero");
  return <section className="remake-section" id="remake" aria-labelledby="remake-title">
    <Reveal className="remake-intro">
      <span className="section-index">03 / REMAKE</span>
      <h2 id="remake-title">Remake<br /><span>anything.</span></h2>
      <p>创意不需要一次就对。换一个方向，不用推翻整个世界。</p>
      <button type="button" className="remake-prompt" onClick={() => setRemade(true)} disabled={remade}>“Make it more futuristic.”<ArrowUp size={17} /></button>
      <div className="remake-response" role="status">{remade ? <><Check size={14} />Bold Future 已应用，内容与图片保持不变。</> : <><ArrowUpRight size={14} />点击指令，试一个新方向。</>}</div>
      <button type="button" className="remake-trigger" onClick={() => setRemade(false)} disabled={!remade}><RotateCcw size={14} />Restore original</button>
      <small>本地 Demo · 切换真实 BrandSpec 主题，非 AI 对话结果</small>
    </Reveal>
    <div className="remake-stage" data-remade={remade}>
      <div className="remake-stage-top"><span>VOID COFFEE / SAME IDEA</span><span>{spec.theme.name}</span></div>
      <div className="remake-canvas" data-theme={spec.theme.id} style={paletteVars(spec)}>
        <div className="remake-brand-bar"><strong>{spec.assets.logo}</strong><span>WEEKEND / 01</span></div>
        <Hero section={displayHero} spec={spec} />
      </div>
      <div className="remake-stage-bottom"><span>ONE CHANGE. NOT A RESET.</span><span>{remade ? "02 — Bold Future" : "01 — Soft Minimal"}</span></div>
    </div>
  </section>;
}
