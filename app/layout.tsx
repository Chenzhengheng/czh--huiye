import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "回页 · 让思考继续生长",
  description:
    "由你建立思考线，让 AI 显化已经隐约记录的延续、修正、分支与冲突。",
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
