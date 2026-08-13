# 回页技术指南

## 作品集匿名访问与本地看板

- Worker 只在精确路径 `/portfolio` 返回成功页面时创建或复用 30 分钟访问会话。
- 客户端不可见 Beacon 在页面完成渲染后确认会话；没有 Beacon 的记录保持“未确认”，不自动归为失败。
- `/api/portfolio-visits/summary` 只接受本机代理持有的 Bearer 密钥，线上不提供看板 UI 或导航入口。
- 本地 `scripts/portfolio-dashboard-server.mjs` 从被 Git 忽略的 `local-data/portfolio-dashboard-admin.json` 读取密钥并代理汇总；浏览器页面接触不到线上密钥。
- `scripts/install-portfolio-dashboard-shortcut.ps1` 在桌面创建“回页 · 访问看板”，复用回页双页连接图标。

本页只描述当前代码，不写未来设想。

## 运行结构

公开根路由由 `app/page.tsx` 提供作品集；私人入口 `/app` 与 PortfolioMode 入口 `/portfolio/demo` 复用 `app/huiye-app.tsx`，后者组合写下、日记池、思考线、回响、评测和设置。`app/thought-line-model.ts` 集中处理思考线选择物化、归线、移出、重命名、归档、权限和合并；`app/lined-editor-model.ts` 集中定义纸张编辑器的行数上限与光标跟随计算；`app/echo-card.tsx` 负责证据优先的回响呈现；`app/evaluation-model.ts` 是评测维度、尺度、回响名、关系类型中文展示映射和 PromptVersion 历史的单一来源。

作品集页面实现位于 `app/portfolio/page.tsx` 与对应 CSS Module。公开首页在 Hero 左上角显示项目负责人署名；公开页面只引用已经审核的固定脱敏片段和 `app/portfolio/demo/` 中的评测事实，不在运行时访问私人存储；产品核心区用三段逐字原文呈现一条真实 ThoughtLine，并标出 AI 选择的最小充分来源，完整原文仍由 PortfolioMode 提供。章节顺序固定为产品核心、用户流程图、评测、工程交付，完整交互与完整评测通过独立深链进入 PortfolioMode。演示版“回响”默认呈现已通过人工评测的 Case 10；其余 good / bad Case 只在评测工作台回溯，不进入正式回响候选。

本地私人模式通过 `/api/data` 读写 `local-data/` 不可变 generation：创建 staging、校验内容与引用、生成 manifest、再更新 current pointer。保存成功后按“当前版本 + 最新 20 个 + 近 30 天每日最后一个 + 更早每月最后一个”保留恢复点；首次删除前生成并校验完整 JSON 备份，清理失败不影响已完成的保存。EchoRecord 和事件经独立端点读取、追加。

公开 `worker/index.ts` 只服务托管页面，不暴露私人数据 API、不读取 `local-data/`、不绑定私人存储。

## 当前状态流

1. 启动读取 Entry、ThoughtLine、CaseRecord、EchoReply，再读取 EchoRecord；
2. 缺少 `thoughtLineIds` 的旧 Entry 在内存归一为空数组；
3. 新思考线名称编辑时只是 `draft:` selection，保存 Entry 时才物化；
4. 自动保存把 Entry、ThoughtLine、CaseRecord、EchoReply 写入新 generation；
5. `selectCurrentEcho` 同时检查 lifecycle、线状态、整线权限、单篇权限、共同归属、时间和结束事件；`evaluation_only` 只供评测工作台读取；
6. 回响回应在 EchoCard 内原地编辑，保存为独立 EchoReply；反馈事件与回应互不推断；
7. EvaluationWorkbook 总表直接编辑 CaseRecord 的 dimensions、verdict 和 notes；详情卡仍负责证据阅读、EchoReply 与 OptionalEchoFeedback；
8. 总表从来源 Entry 的 `thoughtLineIds` 与 EchoRecord 的 `thoughtLineId` 计算 ThoughtLine 并集，PromptVersion 优先读取 CaseRecord，旧数据回退到 EchoRecord ruleVersion；
9. “Prompt 版本” Sheet 从 `promptVersions` 读取 v0.1–v0.3 的全文、状态、变更依据和继承关系；当前工作常量指向 v0.3，历史 Case 不随之改写；
10. Prompt 与评测界面用中文关系类型；EchoRecord 仍保存英文枚举，通过 `echoRelationLabel` 在展示层映射，避免迁移旧数据；
11. EchoSource 外层 `details` 默认 open，直接显示原文节选；嵌套的完整原文 `details` 保持关闭。评测工作台和正式回响复用同一 EchoCard，因此初始状态一致。
12. 日记池在搜索过滤后统一按 Entry 时间倒序排列，日期和具体时间越晚越靠前；PortfolioMode 的固定数据必须先通过 MinimumRedaction 审核，并由测试阻止已删除的敏感片段再次进入公开构建。
13. 写下页与日记池编辑复用同一个 `LinedMarkdownEditor`：纸张先随内容增长，到 15 行后改为纸内滚动；当前行进入上方或下方边界时，只按重新进入舒适区所需的最小距离平滑跟随，不再瞬间回到编辑区中央。用户手动向上回看时不抢夺滚动位置，下一次输入才恢复跟随；系统启用“减少动态效果”时使用即时最小距离。页面本身不再通过位移追踪光标，因此标题和首行始终可由正常页面滚动到达。
14. 日记池仍将标题、普通标签、思考线、AI 权限、导出和保存作为结构化字段；只有正文编辑面板改用同款富文本纸张。正文继续按 Markdown 字符串保存，旧 Entry 无需迁移。
15. generation 清理由 `pruneLocalDataGenerations` 负责：每次保存后检查、每天至多实际执行一次；`npm run local:prune` 可在校验当前 pointer 后手动执行相同策略。PortfolioMode 不访问这套私人存储和清理逻辑。

## 测试与技术债

领域规则在 `thought-line-model.test.mjs`；纸张增长和光标跟随计算在 `lined-editor-model.test.mjs`；存储兼容在 `local-data-store.test.mjs`；界面边界在 `rendered-html.test.mjs`；回响事件由 store 测试覆盖。

`app/huiye-app.tsx` 仍承担较多视图编排，MVP 验证后再拆组件。当前无生产模型调用；v0.3 是可追溯的生成契约，还没有接入自动调用或持久化保持沉默结果。CaseRecord 与 EchoReply 暂随主 generation 保存；`docs/assets/` 中三张正式图以 SVG 为唯一可编辑源，PNG、BPMN 与 HTML 为同步产物。
