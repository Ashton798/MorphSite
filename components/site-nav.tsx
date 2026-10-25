"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Asterisk, Menu, X } from "lucide-react";

export function SiteNav({ studio = false, mode = "demo" }: { studio?: boolean; mode?: "ai" | "demo" }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menuOpen]);
  return <header className={`site-nav ${studio ? "studio-nav" : "immersive-nav"} ${scrolled ? "scrolled" : ""}`}>
    <Link href="/" className="wordmark" aria-label="MorphSite 首页"><Asterisk size={22} strokeWidth={2.3} />MorphSite<span className="wordmark-dot">®</span></Link>
    {!studio && <nav id="home-navigation" className={`nav-pill ${menuOpen ? "is-open" : ""}`} aria-label="主导航" onClick={() => setMenuOpen(false)}>
      <Link href="/#describe" className="nav-link">Product</Link>
      <Link href="/#describe" className="nav-link">How It Works</Link>
      <Link href="/#showcase" className="nav-link">Showcase</Link>
    </nav>}
    {studio ? <div className="studio-nav-actions"><span className="nav-demo"><i />{mode === "ai" ? "AI CONNECTED" : "LOCAL DEMO"}</span><Link href="/" className="nav-start">Back to site <ArrowUpRight size={15} /></Link></div> : <div className="site-nav-actions"><span className="nav-status">AI BRAND STUDIO / 01</span><Link href="/studio" className="nav-start">Launch studio <ArrowUpRight size={15} /></Link><button className="nav-menu" type="button" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} aria-controls="home-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={17} /> : <Menu size={17} />}</button></div>}
  </header>;
}
