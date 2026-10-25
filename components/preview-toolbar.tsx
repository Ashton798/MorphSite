import { Download, Globe, Monitor, Smartphone, Undo2 } from "lucide-react";
import { themePresets, ThemeIdSchema, type ThemeId } from "@/lib/brand-spec";
import type { DeviceMode, PreviewMode } from "@/lib/preview-theme";

export function PreviewToolbar({ mode, device, theme, disabled, canUndo, onMode, onDevice, onTheme, onUndo, onExport, onPublish, hasMedia = false }: {
  hasMedia?: boolean;
  mode: PreviewMode; device: DeviceMode; theme?: ThemeId; disabled: boolean; canUndo: boolean;
  onMode: (mode: PreviewMode) => void; onDevice: (device: DeviceMode) => void; onTheme: (theme: ThemeId) => void;
  onUndo: () => void; onExport: () => void; onPublish: () => void;
}) {
  return <div className="preview-toolbar">
    <div className="preview-topbar"><div className="segmented" aria-label="作品类型">{([['website', 'Website'], ['poster', 'Poster'], ['video', 'Video']] as const).map(([value, label]) =>
      <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? "active" : ""} onClick={() => onMode(value)}>{label}</button>)}</div>
      <div className="preview-controls"><div className="device-switch" aria-label="预览尺寸"><button type="button" className={`icon-button ${device === "desktop" ? "active" : ""}`} aria-label="桌面端预览" aria-pressed={device === "desktop"} onClick={() => onDevice("desktop")}><Monitor size={16} /></button><button type="button" className={`icon-button ${device === "mobile" ? "active" : ""}`} aria-label="移动端预览" aria-pressed={device === "mobile"} onClick={() => onDevice("mobile")}><Smartphone size={16} /></button></div><button type="button" className="icon-button" aria-label="撤销修改" title="撤销最近一次内容或图片修改" disabled={!canUndo} onClick={onUndo}><Undo2 size={17} /></button><button type="button" className="icon-button" aria-label="导出 BrandSpec JSON" title="导出 BrandSpec JSON（不导出网站或视频）" disabled={disabled} onClick={onExport}><Download size={17} /></button><button type="button" className="publish-entry" disabled={disabled} onClick={onPublish} aria-label="发布网站" title="发布到固定公开地址，生成二维码"><Globe size={13} /><span>发布网站</span></button></div>
    </div>
    <div className="theme-toolbar"><label><span className="theme-dot" style={{ background: theme ? themePresets[theme].palette.accent : "var(--muted)" }} />
      <span className="sr-only">品牌主题</span><select aria-label="品牌主题" value={theme ?? "noir-luxury"} disabled={disabled} onChange={(event) => onTheme(ThemeIdSchema.parse(event.target.value))}>{Object.values(themePresets).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
      <span>{mode === "website" ? "实时网站预览" : hasMedia ? "AI 生成素材 · 可预览与下载" : mode === "poster" ? "海报排版预览 · 不含导出" : "静态分镜 · 非视频文件"}</span>
    </div>
  </div>;
}
