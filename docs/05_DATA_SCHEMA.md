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

> 当前实现契约，2026-08-09。私人数据以不可变 generation 保存；缺少新文件的旧 generation 仍可读取。

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
