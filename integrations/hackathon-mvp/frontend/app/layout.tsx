import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宣传内容生成器",
  description: "上传商品照片，生成一套可以直接发布的宣传内容",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
