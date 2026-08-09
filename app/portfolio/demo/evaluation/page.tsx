import type { Metadata } from "next";
import HuiyeApp from "../../../huiye-app";
import { portfolioSeed } from "../demo-seed";

export const metadata: Metadata = {
  title: "回页完整评测｜脱敏演示",
  description: "查看回页的 10 个脱敏 Case、评测标准与 Prompt 版本记录。",
};

export default function PortfolioEvaluationPage() {
  return (
    <HuiyeApp
      mode="portfolio"
      seed={portfolioSeed}
      initialView="evaluation"
    />
  );
}
