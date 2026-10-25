import type { BrandSpec, WebsiteSection } from "@/lib/brand-spec";
import { ArrowUpRight } from "lucide-react";

export type BlockProps = { section: WebsiteSection; spec: BrandSpec };
export function SectionCopy({ section }: { section: WebsiteSection }) {
  return <div className="section-copy">
    {section.eyebrow && <div className="site-eyebrow">{section.eyebrow}</div>}
    <h2>{section.title}</h2>
    {section.body && <p>{section.body}</p>}
    {section.cta && (section.target
      ? <a className="site-cta" href={`#brand-${section.target}`}>{section.cta}<ArrowUpRight size={14} /></a>
      : <><button type="button" className="site-cta" disabled title="Demo 预览，尚未接入预约或订阅服务">{section.cta}<ArrowUpRight size={14} /></button><small className="preview-disclaimer">演示按钮 · 尚未接入订阅服务</small></>)}
  </div>;
}
export function SectionDetail({ section }: { section: WebsiteSection }) {
  return section.detail ? <div className="site-detail">{section.detail}</div> : null;
}
export function BrandImage({ spec, className = "", src }: { spec: BrandSpec; className?: string; src?: string }) {
  const source = src ?? spec.assets.heroImage;
  return source ? <img src={source} alt={`${spec.brand.name} 品牌产品主视觉`} className={`brand-image ${className}`} loading="lazy" />
    : <div className={`image-placeholder ${className}`} role="img" aria-label={`${spec.brand.name} 品牌渐变背景`} style={{ background: `linear-gradient(135deg, ${spec.theme.palette.surface}, ${spec.theme.palette.accentSoft})` }}>{spec.brand.shortName}</div>;
}
