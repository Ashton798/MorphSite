import Link from "next/link";
import { ArrowUpRight, Asterisk, MoveDown } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { HomeComposer } from "@/components/home-composer";
import { ImmersiveHero } from "@/components/immersive/immersive-hero";
import { RemakeDemo } from "@/components/remake-demo";
import { Reveal } from "@/components/motion-elements";
import { AmbientParticles } from "@/components/ambient-particles";

const creationModes = [
  { number: "01", title: "Website Generation", detail: "A living front door for your brand.", className: "creation-website" },
  { number: "02", title: "Poster Creation", detail: "产品视觉与准确文案，在同一张画面里。", className: "creation-poster" },
  { number: "03", title: "Video Production", detail: "微距、光影与运镜，让产品真正动起来。", className: "creation-video" },
];

export default function HomePage() {
  return <main className="morph-shell home-page immersive-home">
    <AmbientParticles />
    <SiteNav />
    <ImmersiveHero><HomeComposer /></ImmersiveHero>

    <section className="describe-section" id="describe" aria-labelledby="describe-title">
      <div className="section-index">01 / DESCRIBE</div>
      <div className="describe-layout">
        <Reveal className="describe-head"><h2 id="describe-title">Start with<br /><span>one sentence.</span></h2><p>你不需要准备一份完整的品牌手册。告诉 MorphSite 你正在做什么、想让人感受到什么，剩下的由对话继续。</p></Reveal>
        <Reveal className="describe-sentence" delay={0.1}><span className="sentence-line" /><blockquote>“一家独立咖啡店，<br />想做一场不一样的周末咖啡节。”</blockquote><span className="sentence-source">A brief is enough to begin.</span></Reveal>
      </div>
      <div className="describe-foot"><span>语气 / 画面 / 节奏 / 方向</span><MoveDown size={16} /><span>Tell it like you would tell a person.</span></div>
    </section>

    <section className="create-section" id="work" aria-labelledby="create-title">
      <span id="showcase" className="anchor-marker" />
      <div className="section-index">02 / CREATE</div>
      <div className="create-heading"><h2 id="create-title">One brief.<br /><span>Many forms.</span></h2><p>一张产品图，一个想法。延展成网站、海报与动态短片，让每一种表达都属于同一个品牌。</p></div>
      <div className="creation-grid">{creationModes.map((mode, index) => <Reveal key={mode.number} className={`creation-item ${mode.className}`} delay={index * 0.08}><Link href={`/studio?demo=1${index === 1 ? "&view=poster" : index === 2 ? "&view=video" : ""}`} className="creation-link"><div className="creation-visual"><span className="creation-number">{mode.number}</span>{index === 0 && <><div className="creation-brand-label">VOID / INDEPENDENT COFFEE</div><strong>Coffee for<br />the in-between<br />hours.</strong><img className="creation-product" src="/assets/showcase/coffee-editorial.webp" alt="奶油色咖啡杯与深色咖啡包装的原创 AI 产品摄影" loading="lazy" /></>}{index === 1 && <><div className="creation-poster-type">SLOW<br /><span>IS A</span><br />STATE.</div><img className="creation-poster-photo" src="/assets/showcase/coffee-poster.webp" alt="粉色台座上的酒红色咖啡杯与悬浮咖啡豆" loading="lazy" /><span className="creation-art-note">A MOMENT, MADE YOURS.</span></>}{index === 2 && <><div className="creation-video-screen"><img src="/assets/showcase/coffee-cinematic.webp" alt="金色轮廓光中的浓缩咖啡微距摄影，短片创意示意" loading="lazy" /><span>FILM DIRECTION / MACRO STUDY</span><strong>THE<br />FIRST<br />LIGHT</strong><i /></div><div className="creation-play">↗</div></>}</div><div className="creation-caption"><div><strong>{mode.title}</strong><span>{mode.detail}</span></div><ArrowUpRight size={18} /></div></Link></Reveal>)}</div>
      <div className="create-foot"><span>原创 AI 视觉概念 · 咖啡品牌演示，非真实客户案例</span><Link href="/studio?demo=1" className="text-link">Explore the demo <ArrowUpRight size={15} /></Link></div>
    </section>

    <RemakeDemo />

    <section className="launch-section" aria-labelledby="launch-title">
      <div className="launch-field"><div className="launch-star launch-star-one" /><div className="launch-star launch-star-two" /><div className="launch-ring" /><span className="launch-index">04 / LAUNCH</span><h2 id="launch-title">One idea.<br /><span>Infinite possibilities.</span></h2><p>从今天的一句话开始，让它成为明天被看见的世界。</p><Link href="/studio" className="launch-button">Start Creating <ArrowUpRight size={17} /></Link><span className="launch-caption">MORPHSITE / CREATIVE STUDIO FOR SMALL BUSINESS</span></div>
    </section>

    <div className="home-closing-line"><span>YOUR NEXT CHAPTER IS STILL UNWRITTEN.</span><span>MAKE IT YOURS. ↗</span></div>
    <footer className="site-footer container"><Link href="/" className="wordmark"><Asterisk size={20} />MorphSite</Link><span>Brand worlds, made in one sentence.</span><span className="mono-label">1024 HACKATHON / OPC 2026</span></footer>
  </main>;
}
