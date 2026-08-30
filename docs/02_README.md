# 回页开发入口

本页只回答：如何运行、验证和定位代码。产品是什么请读[根 README](../README.md)。

## 环境与命令

- Node.js 22.13+
- `pnpm install`：安装依赖
- `pnpm local`：本地私人模式，默认 `127.0.0.1:4317/app`
- `scripts/start-huiye-local.ps1 -Port <端口>`：为独立开发 worktree 使用不同端口启动私人模式；Context/关系模型开发版固定使用 `4324`，避免碰撞稳定版与其他实验版；
- `pnpm test`：构建并运行回归测试
- `pnpm local:verify`：校验本地不可变数据代次
- `pnpm local:verify-echoes`：校验 EchoRecord

## 目录

- `app/page.tsx`：公开作品集根入口；
- `app/huiye-app.tsx`：回页客户端流程和界面组合；
- `app/app/page.tsx`：本地私人回页入口；
- `app/app/context/page.tsx`：Context 与关系模型开发版的只读入口；
- `app/portfolio/demo/`：只使用固定脱敏数据的 PortfolioMode 与完整评测入口；
- `app/thought-line-model.ts`：思考线领域操作的集中接口；
- `app/thought-line-context-model.ts`：当前 Context + Relation 新机制的兼容入口，重新导出四模块 Prompt；
- `app/thought-line-context-prompts.ts`：EntryCard、ThoughtLineContext、ContextMaintenance、RelationJudgment 四份 Prompt 的唯一正文与版本记录；
- `build/codex-json-agent-adapter.mjs`、`build/context-relation-evaluation-runner.mjs`：仅供显式授权的开发评测使用，以 Structured Outputs 调用 Codex CLI，并经 ContextModule、RelationModule 与 EchoRecord store 完成落盘；
- `app/thought-line-context-workbench.tsx`：新版 ContextSnapshot、历史 diff、四模块 Prompt 与关系状态的内部只读看板；
- `app/echo-card.tsx`：回响的证据、AI 初判、卡片内 EchoReply 和反馈呈现；
- `build/local-data-store.mjs`：本地不可变代次读写；
- `build/thought-line-context-module.mjs`、`build/context-maintenance.mjs`、`build/thought-line-context-store.mjs`：新版 Context 深模块、维护路由与只读检查；
- `build/relation-module.mjs`：新版 RelationJudgment 导航、规则门禁与最多三组判断 loop；
- `build/thought-line-context-runtime.mjs`：仍可写入隔离 `local-context` 的旧三段式实验执行器，只供回归对照；不得把它接入新版路径或稳定数据；
- `build/echo-record-store.mjs`：回响事件存储与校验；
- `worker/index.ts`：公开托管入口，不接触私人本地数据；
- `tests/`：数据、领域规则和服务端渲染回归测试；
- `local-data/`：私人数据，忽略于 Git。
- `local-context/`：开发分支中的私人 AI Context 与关系评测产物，忽略于 Git；它引用 `local-data/` 的 generation，但不是主数据源。

## 安全边界

本地模式的 `local-data/` 是私人内容的唯一主数据源。公开托管构建不提供私人数据 API，也不绑定私人存储。完整备份包含 Entry、ThoughtLine、CaseRecord 和 EchoReply；旧 v1 回响不会被误映射进正式回响。

公开根网址只展示作品集；桌面快捷方式和本地启动脚本均打开 `/app`。公开演示只读取代码内经用户审核的 MinimumRedaction 固定数据，不会回退到私人模式。

开发时不得用演示数据冒充用户日记，不得自动清空或覆盖旧代次，不得让 `legacy_evaluation` 进入正式候选。

旧线级 Context 试跑曾使用 `scripts/create-isolated-context-generation.mjs` 建立开发副本，并由 `scripts/run-manual-context-agent.mjs` 写入旧格式 `local-context/`；它只保留为兼容数据。新版机制可由 `scripts/run-context-relation-evaluation.mjs` 在用户明确授权后读取开发副本、调用真实模型，并只写 `local-context/` 与开发版 `local-data/echoes/`。2026-08-28 已对“秋招”线完成一次 9 篇 Entry 的隔离运行，写入一条 `evaluation_only` EchoRecord；这不是生产调度接入，也不代表质量已经通过人工评测。源 `local-data/current.json` 保持只读。
