import type { ReactNode } from "react";

import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "./globals.css";
import "./immersive.css";
import "./studio-visual.css";
import "./website-saas.css";
import "./marketing.css";
import { GenerationProvider } from "@/components/generation-provider";
import { SoundControl } from "@/components/sound-control";

export const metadata = {
  title: "MorphSite — brand worlds, made in one sentence",
  description: "A creative studio for small businesses powered by conversation.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body><GenerationProvider><a className="skip-link" href="#main-content">跳到主要内容</a><div id="main-content">{children}</div><SoundControl /></GenerationProvider></body>
    </html>
  );
}
