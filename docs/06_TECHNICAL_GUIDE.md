# 回页技术指南

本页只描述当前代码，不写未来设想。

## 运行结构

公开根路由由 `app/page.tsx` 提供作品集；私人入口 `/app` 与 PortfolioMode 入口 `/portfolio/demo` 复用 `app/huiye-app.tsx`，后者组合写下、日记池、思考线、回响、评测和设置。`app/thought-line-model.ts` 集中处理思考线选择物化、归线、移出、重命名、归档、权限和合并；`app/echo-card.tsx` 负责证据优先的回响呈现；`app/evaluation-model.ts` 是评测维度、尺度、回响名、关系类型中文展示映射和 PromptVersion 历史的单一来源。

作品集页面实现位于 `app/portfolio/page.tsx` 与对应 CSS Module。公开页面只引用已经审核的固定脱敏片段和 `app/portfolio/demo/` 中的评测事实，不在运行时访问私人存储；产品核心区用三段逐字原文呈现一条真实 ThoughtLine，并标出 AI 选择的最小充分来源，完整原文仍由 PortfolioMode 提供。章节顺序固定为产品核心、用户流程图、评测、工程交付，完整交互与完整评测通过独立深链进入 PortfolioMode。

本地私人模式通过 `/api/data` 读写 `local-data/` 不可变 generation：创建 staging、校验内容与引用、生成 manifest、再更新 current pointer，旧代次不自动删除。EchoRecord 和事件经独立端点读取、追加。

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

## 测试与技术债

领域规则在 `thought-line-model.test.mjs`；存储兼容在 `local-data-store.test.mjs`；界面边界在 `rendered-html.test.mjs`；回响事件由 store 测试覆盖。

`app/huiye-app.tsx` 仍承担较多视图编排，MVP 验证后再拆组件。当前无生产模型调用；v0.3 是可追溯的生成契约，还没有接入自动调用或持久化保持沉默结果。CaseRecord 与 EchoReply 暂随主 generation 保存；`docs/assets/` 中三张正式图以 SVG 为唯一可编辑源，PNG、BPMN 与 HTML 为同步产物。
