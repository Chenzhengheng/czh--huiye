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

旧 `build/thought-line-context-runtime.mjs` 仍是可执行的隔离实验写入器，但不是新版调用路径：`buildContext(thoughtLineId)` 只读取绑定的开发 generation，把旧格式 EntryCard 与 `context.md` 写入独立 `local-context/`；`evaluateRelations(thoughtLineId)` 使用已退役的 Navigation/Verification 两段式 Adapter 并把结果写入独立 evaluation 目录。它不调用 `writeEchoRecord`、不写稳定版 `local-data`，只为旧数据兼容与回归测试保留；不得用它运行新版四 Prompt 机制。

新版深模块实验以 `createContextModule()` 暴露 `maintain(signal)` 与 `inspect(thoughtLineId)` 两个 seam。`maintain()` 接受注入的来源读取器、Agent Adapter、固定时间、三份 Context 侧 Prompt 正文及四份 Prompt 版本；仅传版本而没有正文会被拒绝。它生成或复用全局不可变 EntryCardVersion，维护六章节 ThoughtLineContext；Entry 增量、Prompt 变化与 `feedback_not_quite` 由 ContextMaintenance Agent 判断 `no_context_change | revise_context | full_rebuild_needed`。Entry 或 Prompt 变化先把受影响线切为 `stale`；即使宏观章节无需改变，来源变化仍会发布包含新 CardVersion 的完整快照。只有单次 `feedback_not_quite` 被判断为不影响 Context 时不创建快照；其余路径完整写入卡片、历史快照、当前快照与 manifest 后再把目标线切回 `ready`。该框架仍不由 Entry 保存路径同步调用；真实 Adapter 只存在于显式运行的开发评测脚本。

四份新 Prompt 的唯一正文与版本记录位于 `app/thought-line-context-prompts.ts`：EntryCard、ThoughtLineContext、ContextMaintenance 保持 `v0.1`；RelationJudgment 在 B/C 诊断后升级为 `v0.2`，选择候选判断继续携带所选线 Context 的 C 方案。各模块保存模块名、版本、待评测状态、完整正文、变化说明、基线、评测方法与回滚方式，并以同一段回页产品价值观开头。`app/thought-line-context-model.ts` 不再提供旧 Navigation/Verification 运行时导出，只作为兼容入口重新导出这套新机制。Prompt 正文与版本已分别接入 ContextModule 和 RelationModule 的 Adapter seam；这表示调用契约已接通，不表示真实模型质量经过验证。

`createRelationModule()` 只暴露 `run(trigger)`：内部 Harness 把同一份 RelationJudgment Prompt 正文与版本交给同一个 Agent，先以 `select_candidates` 读取全部 ready Context，再按 `check_candidate_1..3` 顺序处理最多三组。Source Adapter 把元数据索引与原文读取拆成两个操作，使规则层能在原文读取前拒绝权限、跨线、数量、顺序、CardVersion/来源指纹或历史状态无效的组合；通过后才读取原文，并由 History Adapter 构造精确/重叠旧回响、反馈和来源使用次数。C 方案同时向判断步骤传入同一 Snapshot 投影出的 `selectedLineContext`，只含六个宏观章节与全线 Card 概要；规则层校验完整性 assessment 中的遗漏 ID 必须来自该线且不属于当前候选，发现缺口时禁止 output。Agent 首次输出即返回内存 StructuredEchoDraft，全部放弃则沉默；模块没有写入路径。

`scripts/create-isolated-context-generation.mjs` 使用 `readLocalData` 与 `writeLocalData` 建立开发 generation，显式拒绝源目录与目标目录相同；`scripts/run-manual-context-agent.mjs` 只保留旧格式兼容。新版 `scripts/run-context-relation-evaluation.mjs` 使用 `gpt-5.6-sol` 与 Codex Structured Outputs，依次通过 ContextModule 和 RelationModule，再由 `context-relation-evaluation-runner.mjs` 写 EvaluationRunArtifact。历史真实运行曾额外写开发版 `evaluation_only` EchoRecord；迁移只把其卡片字段和来源展示投影嵌入 artifact，不把该记录带入稳定数据。

`runPairedRelationEvaluation()` 保留为一次性 B/C 历史诊断 seam：只执行一次候选选择并冻结 Source、CandidateHistory 与 ContextSnapshot，随后让 B 与 C 独立遍历同一候选。其完整结果继续留在隔离的 paired-runs，并只在统一工作台的“历史实验”中追溯；当前方案由 canonical `relation-judgment-v0.2` 的 C 路径生成 EvaluationRunArtifact，不再创建 `evaluation_only` EchoRecord。

`scripts/start-huiye-local.ps1` 接受可选 `-Port`，使稳定版和多个 worktree 使用彼此独立的本地端口；Context/关系模型开发版桌面快捷方式固定打开 `http://localhost:4324/app`，其工作目录和 `local-data/` 都位于该开发 worktree。

本地侧边栏只有一个“评测工作台”入口，一级类别为 Context 与回响；旧 `/app/context` 深链只作兼容，直接进入同一工作台的 Context 类别。Context 通过 `/api/thought-line-context` 只读展示思考线认识、EntryCards、历史 Diff 与 Prompt 版本；关系运行只在回响类别展示。回响通过 `/api/evaluation-workbench` 同时读取当前 C runs 与历史 B/C。每个 C run 可展开完整 Agent 输入／结构化输出、候选门禁、测试回响卡片、沉默或失败。旧“私人评测／展示模式”切换和独立 Context 侧边栏均已移除。

`runContextRelationEvaluation` 在开始时冻结当前 `local-data` generation，并只向 `local-context` 写入：先比较当前有效 Entry fingerprint 与快照 EntryCard，只把真实新增／变化／移除交给 ContextMaintenance；无内容变化时用 `source_generation_sync` 更新 generation。RelationModule 只接纳与该 generation 相同的 ready Context，候选 `navigationBasis` 必须是四字段对象。accepted 结果把 `echoCard` 与来源展示投影直接嵌入 artifact；失败也保存已完成 trace 与错误。运行不调用 EchoRecord store 写入评测 Echo。

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
9. “Prompt 版本” Sheet 分两组读取：`thoughtLinePromptVersions` 展示 Context + Relation 四模块的独立版本、状态和全文；`promptVersions` 展示冻结 Echo v0.1–v0.4 基线。历史 Case 不随任一当前版本改写；
10. Prompt 与评测界面用中文关系类型；EchoRecord 仍保存英文枚举，通过 `echoRelationLabel` 在展示层映射，避免迁移旧数据；
11. EchoSource 外层 `details` 默认 open，直接显示原文节选；嵌套的完整原文 `details` 保持关闭。评测工作台和正式回响复用同一 EchoCard，因此初始状态一致。
12. 日记池在搜索过滤后统一按 Entry 时间倒序排列，日期和具体时间越晚越靠前；PortfolioMode 的固定数据必须先通过 MinimumRedaction 审核，并由测试阻止已删除的敏感片段再次进入公开构建。
13. 写下页与日记池编辑复用同一个 `LinedMarkdownEditor`：测量镜像挂在真实纸张节点内，继承相同宽度、行高和场景样式，因此自动换行也按视觉行计数。前 15 行完整展开，并在第 15 行预先启用内部 overflow；第 16 行起增加光标舒适区，当前行进入上方或下方边界时立即按最小距离跟随。空白新行的 Range 若返回零尺寸，改用选区锚点所在块计算光标位置，避免连续回车时内部滚动反向。外层页面跟随按场景区分：写下页在确实产生纸内下滚时至少按一条视觉行自然向下，直到纸张靠近可见区域顶部；主动向上回看时保持位置，下一次输入才找回光标。日记池则在输入前记录背景页面位置，并在纸内跟随前恢复，避免固定面板带动背景页面。
14. 日记池仍将标题、普通标签、思考线、AI 权限、导出和保存作为结构化字段；只有正文编辑面板改用同款富文本纸张。正文继续按 Markdown 字符串保存，旧 Entry 无需迁移。
15. generation 清理由 `pruneLocalDataGenerations` 负责：每次保存后检查、每天至多实际执行一次；`npm run local:prune` 可在校验当前 pointer 后手动执行相同策略。PortfolioMode 不访问这套私人存储和清理逻辑。

## 测试与技术债

领域规则在 `thought-line-model.test.mjs`；纸张增长和光标跟随计算在 `lined-editor-model.test.mjs`；写下页与日记池的真实排版、连续回车、写下页自然下移、日记池背景稳定和手动回看恢复由 Chromium 驱动的 `lined-editor-browser.test.mjs` 覆盖；存储兼容在 `local-data-store.test.mjs`；界面边界在 `rendered-html.test.mjs`；回响事件由 store 测试覆盖。

线级 Context 的旧 runtime 只保留兼容回归在 `thought-line-context-runtime.test.mjs`。新版 `context-module-maintenance.test.mjs` 只经 `ContextModule` seam 覆盖维护行为；`thought-line-context-snapshot.test.mjs` 覆盖快照、diff 和目录穿越；`relation-module.test.mjs` 覆盖同 Prompt 双阶段、硬门禁、历史包和三候选 loop；`context-relation-evaluation-runner.test.mjs` 覆盖最终 Context、关系评测、自足 EvaluationRunArtifact、失败 trace 与不写 EchoRecord。测试仍以 Fake Adapter 隔离外部模型；历史真实模型内部运行尚待用户人工标注 good/bad，不能视为质量验证。

`paired-relation-evaluation.test.mjs` 额外约束三份独立 Structured Output 合约、共享且冻结的选择/历史、只有 C 获得完整所选线 Context，以及配对结果只写独立实验目录。`context-relation-evaluation-runner.test.mjs` 约束真实增量、generation 同步、自足 artifact 和不写 EchoRecord。这里验证的是 Harness 与隔离边界，不等同于 B/C 或 C 的语义质量结论。

`build/echo-candidate-controller.mjs` 为本地自动评测候选提供确定性控制：统计有效来源使用次数、构造排除组合、限制每条线最多三轮并校验强烈变化例外；`writeEchoRecord` 在落盘前重复执行来源复用门禁。语义上的关系、证据、显化增量、解释风险及例外是否真实仍由模型判断。Codex 自动化动态读取当前 Prompt，在每条合格主思考线内运行规则与模型循环，各线最多保留一条候选，最终至多写入一条 `evaluation_only` EchoRecord；保持沉默不持久化。

`app/huiye-app.tsx` 仍承担较多视图编排，MVP 验证后再拆组件。当前应用运行时无生产模型调用；v0.4 是待评测的自动候选生成契约，调用发生在本地 Codex 自动化中。CaseRecord 与 EchoReply 暂随主 generation 保存；`docs/assets/` 中三张正式图以 SVG 为唯一可编辑源，PNG、BPMN 与 HTML 为同步产物。
