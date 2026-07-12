import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title:"回页 · 让思考继续生长", description:"一个轻量、克制的 AI 日记。先写下来，未完成的思考会在未来重新接上。" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){ return <html lang="zh-CN"><body>{children}</body></html>; }
