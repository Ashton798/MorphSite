import { SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function Promotion({ section }: BlockProps) {
  return <section id={`brand-${section.id}`} className="site-section promotion">
    <SectionCopy section={section} /><SectionDetail section={section} />
  </section>;
}
