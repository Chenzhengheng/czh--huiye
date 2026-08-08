# 回页开发入口

本页只回答：如何运行、验证和定位代码。产品是什么请读[根 README](../README.md)。

## 环境与命令

- Node.js 22.13+
- `pnpm install`：安装依赖
- `pnpm local`：本地私人模式，默认 `127.0.0.1:4317`
- `pnpm test`：构建并运行回归测试
- `pnpm local:verify`：校验本地不可变数据代次
- `pnpm local:verify-echoes`：校验 EchoRecord

## 目录

- `app/page.tsx`：当前客户端流程和界面组合；
- `app/thought-line-model.ts`：思考线领域操作的集中接口；
- `app/echo-card.tsx`：回响的证据、AI 初判、卡片内 EchoReply 和反馈呈现；
- `build/local-data-store.mjs`：本地不可变代次读写；
- `build/echo-record-store.mjs`：回响事件存储与校验；
- `worker/index.ts`：公开托管入口，不接触私人本地数据；
- `tests/`：数据、领域规则和服务端渲染回归测试；
- `local-data/`：私人数据，忽略于 Git。

## 安全边界

本地模式的 `local-data/` 是私人内容的唯一主数据源。公开托管构建不提供私人数据 API，也不绑定私人存储。完整备份包含 Entry、ThoughtLine、CaseRecord 和 EchoReply；旧 v1 回响不会被误映射进正式回响。

开发时不得用演示数据冒充用户日记，不得自动清空或覆盖旧代次，不得让 `legacy_evaluation` 进入正式候选。
