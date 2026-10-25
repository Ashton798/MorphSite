import { BrandImage, SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function Hero({ section, spec }: BlockProps) {
  return <section id={`brand-${section.id}`} className="site-section hero">
    <SectionCopy section={section} />
    <div className="hero-product"><BrandImage spec={spec} /></div>
    <SectionDetail section={section} />
  </section>;
}
