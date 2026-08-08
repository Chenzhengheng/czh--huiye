import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title:"回页 · 让写下的自己再次回来", description:"保存此刻的自我表达，在另一个时刻重新遇见曾经的自己。" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){ return <html lang="zh-CN"><body>{children}</body></html>; }
