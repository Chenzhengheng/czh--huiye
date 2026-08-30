# 回页数据契约

## PortfolioVisitSession（作品集访问会话）

公开作品集只新增一张与私人日记完全隔离的 D1 表 `portfolio_visit_sessions`：

| 字段 | 含义 |
| --- | --- |
| `id` | 30 分钟访问会话 ID |
| `device_id` | 随机浏览器设备标识的 SHA-256，不是账户或真实身份 |
| `started_at` | 会话首次请求 `/portfolio` 的时间 |
| `latest_at` | 同一窗口内最近一次活动时间 |
| `confirmed_at` | 浏览器完成渲染并上报的时间；为空仅表示未确认 |

记录保留 90 天。系统不保存 IP、地区、浏览器详情、姓名或公司；`/portfolio/demo` 与管理员设备不写入此表。

> 当前实现契约，最后检查于 2026-08-24。私人数据以不可变 generation 保存；缺少新文件的旧 generation 仍可读取。

## Entry

`Entry` 保存原文、时间、普通标签、`thoughtLineIds?: string[]` 和单篇权限 `aiLink`。缺少 `thoughtLineIds` 等同空数组；引用必须指向存在的 ThoughtLine。`continuesFrom` 只记录写作来源，不代表正式线关系。

## ThoughtLine

```ts
type ThoughtLine = {
  id: string
  name: string
  status: "active" | "archived" | "merged"
  allowEcho: boolean
  createdAt: string
  updatedAt: string
  mergedIntoId?: string
}
```

ID 稳定唯一，非 merged 线名称唯一。新线只随 Entry 保存物化。合并保留来源线并指向目标；目标 `allowEcho = source.allowEcho && target.allowEcho`。

## EchoRecord v2

正式扩展字段为 `thoughtLineId`、`relationType` 和 `lifecycle: candidate | evaluation_only | legacy_evaluation | invalidated`。正式候选要求：思考线 active 且允许 AI；至少两篇来源 Entry 同属该线且 `aiLink=true`；lifecycle 必须是 candidate 或缺省。`evaluation_only` 只进入评测工作台，`legacy_evaluation` 只兼容旧机制，invalidated 不再有效。原有 evidence、sourceSummaries、reason、question、时间、规则版本和事件继续保留。

`relationType` 继续使用英文枚举 `continuation | revision | branch | conflict | unresolved_question | other`。Prompt 输出和界面展示使用对应中文“延续、修正、分支、冲突、未解决问题、其他”，这只是展示映射，不改变存储契约。

## CaseRecord

`CaseRecord` 引用 `echoRecordId`，分别保存可选 `verdict: good | bad`、可选 `feedback: clarified | already_known | not_quite`、reasonCodes、可选 `userFeedbackText`、可选 notes、可选 `promptVersion`、可选 dimensions 和 createdAt。dimensions 的三个固定键为 `relationValidity`、`manifestationGain`、`reencounterFeeling`，每项只允许 `high | medium | low`。旧记录缺少这些字段时按“待评测”和 EchoRecord 自身 ruleVersion 兼容显示。feedback、dimensions 和 verdict 互不自动推断；userFeedbackText 逐字保存用户对反馈的说明。它不复制来源 Entry 原文，也不改变正式候选状态。

## EchoReply

`EchoReply` 引用 `echoRecordId`，保存 id、content、createdAt 与 updatedAt。当前一条 EchoRecord 至多对应一个 EchoReply；正文不能为空。它不是 Entry，不使用 resultEntryId，不进入日记池，也不自动参与未来回响。

## generation 文件与兼容

- `entries.json`：Entry；
- `relations/thought-lines.json`：有思考线时写入；
- `relations/case-records.json`：有评测时写入；
- `relations/echo-replies.json`：有回响回应时写入；
- EchoRecord 延续独立受校验存储；
- 旧 generation 缺少新文件时按空数组读取且不改变原哈希语义；
- 旧反馈 `resonated`、`accurate_no_resonance` 只读兼容；
- 旧单页回看或无共同用户线的记录只作 `legacy_evaluation`；
- v1 Echo 不自动迁移为正式 EchoRecord，避免伪造关系。

## generation 保留与恢复

每次成功保存仍先生成一个完整、不可变的 generation，再切换 `current.json`。保留策略只在保存完成后运行，失败不会反向把本次保存报告为失败：

- 始终保留当前 generation；
- 保留最新 20 个 generation；
- 最近 30 天按自然日保留每天最后一个 generation；
- 更早历史按自然月保留每月最后一个 generation；
- 首次实际删除前，把当前完整数据导出到 `local-data/backups/before-generation-retention-*.json` 并重新读回校验；
- 删除 generation 时同步移除指向已删除 generation 的 pointer history；
- 自动清理每天至多实际执行一次，也可用 `npm run local:prune` 手动执行并输出结果。

自然日和自然月均按 `Asia/Shanghai` 计算。这里的“每日/每月版本”是从已经发生的保存中选取恢复点，不是定时复制数据。

## 实验性 ThoughtLineContext 私有存储

线级 Context 不写入主 `local-data` generation，而是保存在同样被 Git 忽略的 `local-context/`。它引用某个只读的 `sourceGenerationId`；源 generation 变化后，关系核验必须先拒绝并要求重新建立或增量更新 Context。

- `thought-line-context/manifest.json`：当前实验涉及的 ThoughtLine、Entry 与源 generation 索引；
- `thought-line-context/entries/<entryId>/versions/<cardVersion>.json`：不可变 EntryCardVersion；保存结构化系统字段、AI 概要与不确定性，不复制 Entry 原文；
- `thought-line-context/entries/<entryId>/current.json`：全局 EntryCard 当前版本指针；来源指纹与 EntryCard Prompt 版本均未变化时，不同 ThoughtLine 复用同一个 CardVersion；
- `thought-line-context/thought-lines/<thoughtLineId>/snapshot.json`：当前完整 ContextSnapshot，包含六个宏观章节、完整 EntryCardVersion 引用与哈希、四份 Prompt 版本、触发信号、维护方式、状态和创建时间；
- `thought-line-context/thought-lines/<thoughtLineId>/state.json`：当前发布门。Entry 增量或 Prompt 重建开始后先切为 `stale`，完整新快照与索引发布完毕后才切回 `ready`；失败时保持 `stale`；
- `thought-line-context/thought-lines/<thoughtLineId>/history/<snapshotId>/snapshot.json`：不可变历史完整快照。检查视图按 `createdAt`、再按 `snapshotId` 稳定排序，并对相邻快照用代码生成宏观章节、EntryCard 引用和 Prompt 版本三类 diff；
- 旧实验的 `entries/<entryId>/card.json`、`context.md`、`record.json` 与 `history/*/{context.md,change.json}` 暂时保留只读兼容，不是新版写入契约；
- `evaluation/runs/<runId>/result.json`：旧实验 runtime 与新版隔离评测运行器共用的关系评测结果位置；新版只记录最终 accepted/silent 结果，不保留临时候选组合；
- 开发版 `local-data/echoes/<echoRecordId>.json`：新版运行 accepted 后，经 `writeEchoRecord` 门禁写入的 `evaluation_only` EchoRecord；稳定版目录不写入。

新版 ThoughtLineContext 不保存具体 Entry 关系、关系类型或核验状态。测试夹具的 accepted 结果不构成真实候选或质量证据。

## 实验性 RelationModule 内存契约

`RelationModule.run(trigger)` 只读取全部 `ready` 且当前仍允许 AI 的 Context，并把去除审计历史与旧评测结果后的 Context 视图连同 RelationJudgment Prompt 正文与版本交给同一个 Agent Adapter。选择阶段一次返回零至三个临时候选；每组包含一个 `thoughtLineId`、两至三个时间正序 `entryIds` 和 `navigationBasis`，不写入文件。

每个候选先使用只含元数据与来源指纹的 SourceIndex、ContextSnapshot/CardVersion 和 CandidateHistory 状态执行硬门禁。数量、唯一性、重复组合、权限、同线归属、存在性、时间顺序、卡片来源版本或历史 ready 状态任一失败时，不调用原文读取。通过后才按候选顺序读取两至三篇原文，再从历史索引确定性构造：

- `exactEchoes`：来源集合完全相同的旧回响；
- `overlappingEchoes`：同线且与候选至少共享一篇来源的其他回响；
- `feedback`：上述回响对应的用户反馈与补充说明；
- `sourceUsage`：仍有效候选及 `evaluation_only` 的逐篇累计来源次数。

同一个 Agent 随后返回 `next_candidate` 或 `output`；前者继续已有下一组，首个 `output` 立即结束，全部失败则返回 `{ decision: "silent" }`。`RelationModule.run()` 本身仍只返回内存 `StructuredEchoDraft`。显式调用 `runContextRelationEvaluation()` 时，外层运行器才会把 accepted 草稿映射为原有 `EchoRecordV2`，补充 ID、`evaluation_only`、时间、模型与空事件数组，并经 `writeEchoRecord` 再次执行来源复用门禁。

一次性 B/C 配对实验使用独立目录 `local-context/evaluation/paired-runs/<runId>/result.json`，索引为 `paired-runs/index.json`。记录冻结的共享候选、Snapshot 与 History 身份、B/C 各自 attempts、只供诊断的 `assessment` 与可选内存草稿；同目录 `data-protection.json` 保存真实运行前后的稳定版与隔离版 `current.json` 哈希及 Echo 文件名集合。实验不会写入 `EchoRecord`、`CaseRecord`、Prompt 正式评测维度或来源使用历史。B 的逐组输入不含 Context；C 只额外得到所选线的宏观六段 Context 与全部有效 EntryCard 摘要。该 Context 是 AI 生成的参考认识，不能充当用户事实或回响证据。
