# 回页技术指南

## 作品集匿名访问与本地看板

- Worker 只在精确路径 `/portfolio` 返回成功页面时创建或复用 30 分钟访问会话。
- 客户端不可见 Beacon 在页面完成渲染后确认会话；没有 Beacon 的记录保持“未确认”，不自动归为失败。
- `/api/portfolio-visits/summary` 只接受本机代理持有的 Bearer 密钥，线上不提供看板 UI 或导航入口。
- 本地 `scripts/portfolio-dashboard-server.mjs` 从被 Git 忽略的 `local-data/portfolio-dashboard-admin.json` 读取密钥与本机代理地址并代理汇总；浏览器页面接触不到线上密钥或代理配置。旧配置由启动脚本补入默认代理 `http://127.0.0.1:12000`，代理不可用时看板给出明确的开启提示。
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
9. “Prompt 版本” Sheet 从 `promptVersions` 读取 v0.1–v0.4 的全文、状态、变更依据和继承关系；当前工作常量指向待评测的 v0.4，历史 Case 不随之改写；
10. Prompt 与评测界面用中文关系类型；EchoRecord 仍保存英文枚举，通过 `echoRelationLabel` 在展示层映射，避免迁移旧数据；
11. EchoSource 外层 `details` 默认 open，直接显示原文节选；嵌套的完整原文 `details` 保持关闭。评测工作台和正式回响复用同一 EchoCard，因此初始状态一致。
12. 日记池在搜索过滤后统一按 Entry 时间倒序排列，日期和具体时间越晚越靠前；PortfolioMode 的固定数据必须先通过 MinimumRedaction 审核，并由测试阻止已删除的敏感片段再次进入公开构建。
13. 写下页与日记池编辑复用同一个 `LinedMarkdownEditor`：测量镜像挂在真实纸张节点内，继承相同宽度、行高和场景样式，因此自动换行也按视觉行计数。前 15 行完整展开，并在第 15 行预先启用内部 overflow；第 16 行起增加光标舒适区，当前行进入上方或下方边界时立即按最小距离跟随。空白新行的 Range 若返回零尺寸，改用选区锚点所在块计算光标位置，避免连续回车时内部滚动反向。外层页面跟随按场景区分：写下页在确实产生纸内下滚时至少按一条视觉行自然向下，直到纸张靠近可见区域顶部；主动向上回看时保持位置，下一次输入才找回光标。日记池则在输入前记录背景页面位置，并在纸内跟随前恢复，避免固定面板带动背景页面。
14. 日记池仍将标题、普通标签、思考线、AI 权限、导出和保存作为结构化字段；只有正文编辑面板改用同款富文本纸张。正文继续按 Markdown 字符串保存，旧 Entry 无需迁移。
15. generation 清理由 `pruneLocalDataGenerations` 负责：每次保存后检查、每天至多实际执行一次；`npm run local:prune` 可在校验当前 pointer 后手动执行相同策略。PortfolioMode 不访问这套私人存储和清理逻辑。

## 测试与技术债

领域规则在 `thought-line-model.test.mjs`；纸张增长和光标跟随计算在 `lined-editor-model.test.mjs`；写下页与日记池的真实排版、连续回车、写下页自然下移、日记池背景稳定和手动回看恢复由 Chromium 驱动的 `lined-editor-browser.test.mjs` 覆盖；存储兼容在 `local-data-store.test.mjs`；界面边界在 `rendered-html.test.mjs`；回响事件由 store 测试覆盖。

`build/echo-candidate-controller.mjs` 为本地自动评测候选提供确定性控制：统计有效来源使用次数、构造排除组合、限制每条线最多三轮并校验强烈变化例外；`writeEchoRecord` 在落盘前重复执行来源复用门禁。语义上的关系、证据、显化增量、解释风险及例外是否真实仍由模型判断。Codex 自动化动态读取当前 Prompt，在每条合格主思考线内运行规则与模型循环，各线最多保留一条候选，最终至多写入一条 `evaluation_only` EchoRecord；保持沉默不持久化。

`app/huiye-app.tsx` 仍承担较多视图编排，MVP 验证后再拆组件。当前应用运行时无生产模型调用；v0.4 是待评测的自动候选生成契约，调用发生在本地 Codex 自动化中。CaseRecord 与 EchoReply 暂随主 generation 保存；`docs/assets/` 中三张正式图以 SVG 为唯一可编辑源，PNG、BPMN 与 HTML 为同步产物。
