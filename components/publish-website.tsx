"use client";

import { useEffect, useState } from "react";
import type { BrandSpec } from "@/lib/brand-spec";

type Publication = { id: string; projectId: string; slug: string; token: string; url: string; published: boolean; version: number; updatedAt: string };
export function PublishWebsite({ spec, documentId, disabled }: { spec: BrandSpec; documentId: string; disabled: boolean }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [configuration, setConfiguration] = useState<{ configured: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrNonce, setQrNonce] = useState(0);
  const key = "morphsite.publication." + documentId;
  useEffect(() => {
    let active = true;
    setPublication(null); setError("");
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Publication;
        if (/^[a-f0-9]{32}$/.test(saved.id) && /^[a-f0-9]{64}$/.test(saved.token)) {
          setPublication(saved);
          void fetch("/api/publish?id=" + saved.id, { headers: { Authorization: "Bearer " + saved.token }, cache: "no-store" })
            .then(async response => { if (!response.ok) return; const result = await response.json(); if (active) setPublication({ ...saved, ...result }); }).catch(() => {});
        }
      }
    } catch { setError("浏览器无法恢复发布管理凭证，请勿清除此站点的浏览器数据。"); }
    void fetch("/api/publish", { cache: "no-store" }).then(response => response.json()).then(result => { if (active) setConfiguration(result); }).catch(() => { if (active) setError("无法检查发布配置。"); });
    return () => { active = false; };
  }, [key]);
  async function run(action: "publish" | "unpublish") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      // Verify browser storage before creating a site: losing this token prevents management.
      localStorage.setItem(key + ".check", "1"); localStorage.removeItem(key + ".check");
      const response = await fetch(action === "publish" ? "/api/publish" : "/api/publish?id=" + publication!.id, {
        method: action === "publish" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", ...(publication ? { Authorization: "Bearer " + publication.token } : {}) },
        ...(action === "publish" ? { body: JSON.stringify({ spec, projectId: documentId, ...(publication ? { id: publication.id } : {}) }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布操作失败。");
      const next = { ...publication, ...result } as Publication;
      localStorage.setItem(key, JSON.stringify(next)); setPublication(next);
      setNotice(action === "publish" ? "网站已发布。再次发布保持相同链接和二维码。" : "网站已下线；原链接保留，再次发布可恢复访问。");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "发布失败，当前作品已保留。"); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!publication) return;
    try { await navigator.clipboard.writeText(publication.url); setNotice("链接已复制。"); }
    catch { setError("复制失败，请选中下方链接手动复制。"); }
  }
  return <section className="publish-panel" aria-label="网站发布">
    <div className="publish-panel-actions">
      <button className="primary-button" type="button" disabled={disabled || busy || !configuration?.configured} onClick={() => void run("publish")}>
        {busy ? "发布处理中…" : publication ? "重新发布网站" : "Publish Website · 发布网站"}
      </button>
      {publication?.published && <button className="secondary-button" type="button" disabled={busy} onClick={() => void run("unpublish")}>取消发布</button>}
      {publication && <span>版本 {publication.version} · {publication.published ? "已发布" : "已下线"}</span>}
    </div>
    {configuration && !configuration.configured && <p role="status">{configuration.reason}</p>}
    {publication && <div className="publication-detail">
      <label>固定公开地址<input aria-label="公开网站链接" readOnly value={publication.url} onFocus={event => event.currentTarget.select()} /></label>
      {publication.published && <><div className="publish-panel-actions"><a href={publication.url} target="_blank" rel="noreferrer">打开网站</a><button className="secondary-button" type="button" onClick={() => void copy()}>复制链接</button><button className="secondary-button" type="button" onClick={() => setQrNonce(value => value + 1)}>重新生成二维码</button><a href={"/api/publish/qr?id=" + publication.id + "&download=1"} download="morphsite-qr.png">下载二维码 PNG</a></div>
        <img width={160} height={160} src={"/api/publish/qr?id=" + publication.id + "&v=" + publication.version + "-" + qrNonce} alt="已发布网站的可扫描二维码" /></>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
