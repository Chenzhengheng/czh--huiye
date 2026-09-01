# 回页开发入口

本页只回答：如何运行、验证和定位代码。产品是什么请读[根 README](../README.md)。

## 环境与命令

- Node.js 22.13+
- `pnpm install`：安装依赖
- `pnpm local`：本地私人模式，默认 `127.0.0.1:4317/app`
- `pnpm test`：构建并运行回归测试
- `pnpm build:edgeone`：从当前源码生成 `.site-artifacts/edgeone-public/` 国内公开静态产物和可直接上传的 `.site-artifacts/huiye-edgeone.zip`；
- `pnpm test:edgeone-export`：验证 EdgeOne 产物的公开路由、备案展示和隐私边界；
- `pnpm test:portfolio-dashboard`：验证双部署汇总、单站故障降级和本地私有配置迁移；
- `pnpm local:verify`：校验本地不可变数据代次
- `pnpm local:verify-echoes`：校验 EchoRecord

## 目录

- `app/page.tsx`：公开作品集根入口；
- `app/huiye-app.tsx`：回页客户端流程和界面组合；
- `app/app/page.tsx`：本地私人回页入口；
- `app/portfolio/demo/`：只使用固定脱敏数据的 PortfolioMode 与完整评测入口；
- `app/thought-line-model.ts`：思考线领域操作的集中接口；
- `app/echo-card.tsx`：回响的证据、AI 初判、卡片内 EchoReply 和反馈呈现；
- `build/local-data-store.mjs`：本地不可变代次读写；
- `build/echo-record-store.mjs`：回响事件存储与校验；
- `scripts/export-edgeone-static.mjs`：将已构建页面、EdgeOne 中间件与统计 Edge Functions 导出为 EdgeOne Makers 可直接上传的目录和 ZIP；
- `edgeone/`：国内主站的响应后访问采集、中间件和受保护汇总接口；
- `worker/index.ts`：公开托管入口，不接触私人本地数据；
- `tests/`：数据、领域规则和服务端渲染回归测试；
- `local-data/`：私人数据，忽略于 Git。

## 安全边界

本地模式的 `local-data/` 是私人内容的唯一主数据源。公开托管构建不提供私人数据 API，也不绑定私人存储。完整备份包含 Entry、ThoughtLine、CaseRecord 和 EchoReply；旧 v1 回响不会被误映射进正式回响。

公开根网址只展示作品集；桌面快捷方式和本地启动脚本均打开 `/app`。公开演示只读取代码内经用户审核的 MinimumRedaction 固定数据，不会回退到私人模式。

国内 `PublicPortfolioDeployment` 只导出 `/`、`/portfolio/demo`、`/portfolio/demo/evaluation`、所需静态资源与 EdgeOne 统计运行时代码；`edgeone.json` 将旧 `/portfolio` 入口永久跳转到 `/`。产物不生成 `/app` 页面，不复制 `local-data`，也不使用客户端访问 Beacon。

开发时不得用演示数据冒充用户日记，不得自动清空或覆盖旧代次，不得让 `legacy_evaluation` 进入正式候选。
