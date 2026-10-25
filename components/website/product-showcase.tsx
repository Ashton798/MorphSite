import { BrandImage, SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function ProductShowcase({ section, spec }: BlockProps) {
  return <section id={`brand-${section.id}`} className="site-section showcase">
    <div className="product-art"><BrandImage spec={spec} /></div>
    <SectionCopy section={section} /><SectionDetail section={section} />
  </section>;
}
