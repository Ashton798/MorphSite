"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import type { BrandSpec } from "@/lib/brand-spec";
import { paletteVars } from "@/lib/preview-theme";
import { BrandImage } from "./website/shared";

export function StoryboardPreview({ spec }: { spec: BrandSpec }) {
  const [selected, setSelected] = useState(0);
  const scene = spec.video.scenes[selected] ?? spec.video.scenes[0];
  return <article className="video-preview" style={paletteVars(spec)} data-theme={spec.theme.id} aria-label="视频分镜预览">
    <div className="storyboard-heading"><div><div className="site-eyebrow">STORYBOARD / {spec.brand.name}</div><h2>从一个画面开始。</h2></div><Clapperboard size={28} /></div>
    <p className="storyboard-notice">静态分镜方案 · 计划时长 {spec.video.duration} · 尚未生成视频</p>
    <div className="storyboard-screen"><BrandImage spec={spec} /><div><span>SCENE {scene?.number}</span><h3>{scene?.title}</h3></div></div>
    <p className="scene-description" aria-live="polite">{scene?.description}</p>
    <div className="scene-list" aria-label="选择分镜">{spec.video.scenes.map((item, index) =>
      <button type="button" key={item.number} className={`scene-row ${index === selected ? "selected" : ""}`} aria-pressed={index === selected} onClick={() => setSelected(index)}>
        <span className="site-eyebrow">{item.number}</span><strong>{item.title}</strong><span>{item.description}</span>
      </button>)}
    </div>
    <p className="storyboard-notice">每帧共用品牌主视觉作为占位参考；不含真实镜头、音频或 MP4 文件。</p>
    <button className="secondary-button" disabled title="第二阶段接入渲染引擎后开放">渲染视频 · 尚未接入</button>
  </article>;
}
