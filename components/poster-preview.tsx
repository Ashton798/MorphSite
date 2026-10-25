import type { BrandSpec } from "@/lib/brand-spec";
import { paletteVars } from "@/lib/preview-theme";
import { BrandImage } from "./website/shared";

export function PosterPreview({ spec }: { spec: BrandSpec }) {
  return <article className="poster-preview" style={paletteVars(spec)} data-theme={spec.theme.id} aria-label="海报基础预览">
    <header><span>{spec.brand.name}</span><span>CAMPAIGN / 2026</span></header>
    <div className="poster-visual"><BrandImage spec={spec} /><span aria-hidden="true">{spec.brand.shortName}</span></div>
    <div className="poster-copy"><p className="poster-line">{spec.poster.line}</p><h2>{spec.poster.title}</h2></div>
    <footer><span>{spec.poster.footnote}</span><span>DEMO — LAYOUT ONLY</span></footer>
  </article>;
}
