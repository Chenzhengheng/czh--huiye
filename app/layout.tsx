import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:4317";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "由你建立思考线，让 AI 显化已经隐约记录的延续、修正、分支与冲突。";

  return {
    metadataBase: new URL(origin),
    title: "回页 · 让思考继续生长",
    description,
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: origin,
      siteName: "回页",
      title: "回页 · 让思考继续生长",
      description,
      images: [{ url: `${origin}/og.png`, alt: "回页 · 让思考继续生长" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "回页 · 让思考继续生长",
      description,
      images: [`${origin}/og.png`],
    },
  };
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
