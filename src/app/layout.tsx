import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Austin Edu · 学生管理",
  description: "线索别漏掉，交付别出丑",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
