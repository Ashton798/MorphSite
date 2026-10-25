import { BrandImage, SectionCopy, SectionDetail, type BlockProps } from "./shared";

export function Gallery({ section, spec }: BlockProps) {
  // Missing gallery assets use the same branded artwork, never invented photographs.
  const images = spec.assets.gallery.length ? spec.assets.gallery : [spec.assets.heroImage];
  return <section id={`brand-${section.id}`} className="site-section gallery">
    <SectionCopy section={section} />
    <div className="gallery-strip">{images.map((src, i) => <figure key={`${i}-${src?.slice(0, 60)}`}><BrandImage src={src} spec={spec} /><figcaption>{spec.brand.name} / {String(i + 1).padStart(2, "0")}</figcaption></figure>)}</div>
    <SectionDetail section={section} />
  </section>;
}
