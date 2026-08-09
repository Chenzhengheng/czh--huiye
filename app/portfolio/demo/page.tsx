import type { Metadata } from "next";
import HuiyeApp from "../../page";
import { portfolioSeed } from "./demo-seed";

export const metadata: Metadata = {
  title: "回页脱敏演示｜让思考继续生长",
  description: "使用固定脱敏数据体验回页；不会读取或保存私人日记。",
};

export default function PortfolioDemoPage() {
  return <HuiyeApp mode="portfolio" seed={portfolioSeed} />;
}
