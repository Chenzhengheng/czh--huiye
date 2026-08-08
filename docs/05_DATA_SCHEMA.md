# 回页数据契约

> 当前实现契约，2026-08-08。私人数据以不可变 generation 保存；缺少新文件的旧 generation 仍可读取。

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

正式扩展字段为 `thoughtLineId`、`relationType` 和 `lifecycle: candidate | legacy_evaluation | invalidated`。正式候选要求：思考线 active 且允许 AI；至少两篇来源 Entry 同属该线且 `aiLink=true`；lifecycle 不是 legacy/invalidated。原有 evidence、sourceSummaries、reason、question、时间、规则版本和事件继续保留。

## CaseRecord

`CaseRecord` 引用 `echoRecordId`，保存 `verdict: good | bad`、`feedback: clarified | already_known | not_quite`、reasonCodes、可选 notes 和 createdAt。它不复制 Entry 原文，不改变正式候选状态。

## generation 文件与兼容

- `entries.json`：Entry；
- `relations/thought-lines.json`：有思考线时写入；
- `relations/case-records.json`：有评测时写入；
- EchoRecord 延续独立受校验存储；
- 旧 generation 缺少新文件时按空数组读取且不改变原哈希语义；
- 旧反馈 `resonated`、`accurate_no_resonance` 只读兼容；
- 旧单页回看或无共同用户线的记录只作 `legacy_evaluation`；
- v1 Echo 不自动迁移为正式 EchoRecord，避免伪造关系。
