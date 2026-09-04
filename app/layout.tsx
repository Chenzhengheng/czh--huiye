import type { Metadata } from "next";
import "./globals.css";
import { getPublicRequestContext } from "./public-deployment";

export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getPublicRequestContext();
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
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isMainland } = await getPublicRequestContext();

  return (
    <html lang="zh-CN">
      <body>
        {children}
        {isMainland ? (
          <footer className="mainland-compliance-footer">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
              粤ICP备2026122805号
            </a>
          </footer>
        ) : null}
      </body>
    </html>
  );
}
