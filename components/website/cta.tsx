import { SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function CTA({ section }: BlockProps) {
  return <section id={`brand-${section.id}`} className="site-section cta">
    <SectionCopy section={section} /><SectionDetail section={section} />
  </section>;
}
