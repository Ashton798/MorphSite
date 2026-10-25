import type { CSSProperties } from "react";
import type { BrandSpec } from "./brand-spec";

export function paletteVars(spec: BrandSpec): CSSProperties {
  return {
    "--preview-canvas": spec.theme.palette.canvas,
    "--preview-surface": spec.theme.palette.surface,
    "--preview-text": spec.theme.palette.text,
    "--preview-muted": spec.theme.palette.muted,
    "--preview-accent": spec.theme.palette.accent,
    "--preview-accent-soft": spec.theme.palette.accentSoft,
    "--preview-line": spec.theme.palette.line,
  } as CSSProperties;
}
export type PreviewMode = "website" | "poster" | "video";
export type DeviceMode = "desktop" | "mobile";
