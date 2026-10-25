import type { BrandSpec } from "@/lib/brand-spec";
import { getWebsiteBlock } from "@/lib/website-registry";
import { paletteVars, type PreviewMode, type DeviceMode } from "@/lib/preview-theme";
import { PosterPreview } from "./poster-preview";
import { StoryboardPreview } from "./storyboard-preview";
import { SaasVideoHeroTemplate } from "./website/saas-video-hero-template";

function WebsitePreview({ spec, published = false }: { spec: BrandSpec; published?: boolean }) {
  const layout = spec.website.layout ?? "cinematic";
  const isSaasNoir = layout === "cinematic" && spec.theme.id === "noir-luxury" && !published;
  const sections = layout === "product-first" ? [...spec.website.sections].sort((a, b) => {
    const order = ["Hero", "ProductShowcase", "Promotion", "Gallery", "Story", "CTA"];
    return order.indexOf(a.type) - order.indexOf(b.type);
  }) : spec.website.sections;
  return <article className={`website-frame ${isSaasNoir ? "website-frame-saas" : ""}`} style={paletteVars(spec)} data-layout={layout} data-theme={spec.theme.id} aria-label="品牌网站预览">
    {!isSaasNoir && <div className="website-nav"><strong>{spec.assets.logo}</strong><span>{spec.brand.category}</span></div>}
    {sections.map((section) => {
      if (isSaasNoir && section.type === "Hero") return <SaasVideoHeroTemplate key={section.id} spec={spec} section={section} />;
      const Block = getWebsiteBlock(section.type);
      return <Block key={section.id} section={section} spec={spec} />;
    })}
    <div className="website-footer"><strong>{spec.brand.name}</strong><span>{spec.campaign.status === "demo" ? "DEMO BRAND / MORPHSITE" : "MADE WITH MORPHSITE"}</span></div>
  </article>;
}

export function BrandPreview({ spec, mode, device, published = false }: { spec: BrandSpec | null; mode: PreviewMode; device: DeviceMode; published?: boolean }) {
  if (!spec) return mode === "website" ? <div className={`preview-document ${device}`} data-testid="preview-document"><article className="website-frame" data-template="saas-default" aria-label="SaaS 默认网站模板预览"><SaasVideoHeroTemplate /><div className="saas-template-caption"><strong>APEX · SaaS 模板预览</strong><span>尚未生成作品 · 请在左侧输入简报或使用演示品牌</span></div></article></div> : null;
  return <div className={`preview-document ${device}`} data-testid="preview-document">
    {mode === "website" ? <WebsitePreview spec={spec} published={published} /> : mode === "poster" ? <PosterPreview spec={spec} /> : <StoryboardPreview spec={spec} />}
  </div>;
}
