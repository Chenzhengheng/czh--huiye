import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title:"回页 · 让思考继续生长", description:"保存当下的思考，在过去与现在产生联系时，让思考继续发生。" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){ return <html lang="zh-CN"><body>{children}</body></html>; }
