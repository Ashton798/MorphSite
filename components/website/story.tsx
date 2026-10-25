import { SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function Story({ section, spec }: BlockProps) {
  return <section id={`brand-${section.id}`} className="site-section story">
    <div className="story-mark" aria-hidden="true">{spec.brand.shortName}</div>
    <SectionCopy section={section} /><SectionDetail section={section} />
  </section>;
}
