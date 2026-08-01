# 回页｜技术指南

## 文档入口

- [文档索引](DOCUMENTATION_INDEX.md)：所有核心文档、当前交付计划和历史资料的统一入口；
- [产品共识](README.md)：回页是什么，以及哪些原则不轻易改变；
- [阶段规划](ROADMAP.md)：当前验证什么、接下来先做什么；
- 本文：当前代码如何运行、数据在哪里、已知技术边界是什么；
- [文档维护说明](DOCUMENTATION_INSTRUCTIONS.md)：三类文档的边界、优先级和更新规则。

## 当前目标

回页不是通用聊天机器人。当前技术目标是跑通一个可解释的关联闭环：发现过去与当下尚未被用户表达的联系，以原句和问题形成回响，并以用户真正保存的新思考验证延续是否发生。

## 逻辑架构

```text
原料层
  └─ 用户确认的「我的思考」
       ↓
记忆层
  ├─ 候选关联
  ├─ 回响交互日志
  └─ 用户保存后形成的思考线
       ↓
应用层
  ├─ 安静写下
  ├─ 关系回响：A + B → C
  ├─ 时间回响：A + 现在 → B
  └─ 主动对话
```

Chat 属于应用层；只有用户在对话后明确确认保存的内容，才进入原料层。模型是应用层可替换的判断工具，不是独立的数据层，也不能把自己的输出自动写成用户记忆。

当前可以用 `/api/recall` 调用通用模型，也可以在研究阶段用人工或 CLI 模拟同一判断流程。路由名暂时保留以避免无意义的兼容改动，但它承担的是“关联是否值得形成回响”的判断。系统先积累真实的交互与保存信号，再判断是否需要学习排序或其他模型能力。

## 当前架构

```text
本地 React / TypeScript 应用
  ├─ 日记、图片、思考线、回响反馈：项目 local-data 文件夹
  ├─ 每次保存：写入完整新代次 → 校验 → 切换 current.json
  ├─ 未保存草稿与少量界面设置：当前浏览器 localStorage
  ├─ 写作、日记池、详情、Markdown、完整备份与导入
  └─ 本地开发服务拦截 /api/data，其他 AI 请求仍调用 Worker API

本地文件数据层
  ├─ entries/<id>/content.md：用户确认的唯一当前正文
  ├─ entries/<id>/record.json：时间、来源、标签、关联许可与附件索引
  ├─ relations/：现有 Echo 与检查记录
  ├─ associations/：下一阶段 AssociationRecord
  ├─ backup.json：每一代的完整恢复快照
  └─ pointer-history/：当前代次指针历史

Cloudflare Worker（线上遗留与模型接口）
  ├─ /api/data：旧私人站的 R2 数据接口；保留迁移源，不是本地应用主数据源
  ├─ /api/organize：遗留 AI 整理接口，产品界面已移除入口，待清理
  └─ /api/recall：从候选记录中严格判断是否存在值得提出的联系（路由名暂保留）

OpenRouter 模型
  └─ 回响：是否建立关联、证据记录 ID、原文引句、轻量理由
```

密钥只在服务端环境变量中使用。私人日记的主副本保存在本地文件夹；只有用户允许参与未来回响的记录会在发起关联判断时发送给模型。旧线上数据按 ChatGPT 账号隔离并暂时保留，只用于迁移核对和恢复，不能自动覆盖本地数据。

## 本地数据写入协议

`local-data` 使用不可变数据代次：

1. 在 `generations/.staging-*` 写入完整的新代次；
2. 重建所有 Markdown、元数据、回响和附件并进行结构及哈希校验；
3. 校验成功后将 staging 原子改名为正式代次；
4. 保存旧 `current.json` 到 `pointer-history`；
5. 最后切换 `current.json`；
6. 任一步失败都不修改当前有效代次，也不删除旧代次。

若当前指针损坏或写入中断，读取端会扫描已有完整代次并恢复最近一个可验证版本。`local-data`、导入源文件和数据代次均被 Git 忽略，不进入 GitHub 或 Sites 部署。

## 本地启动与校验

- Windows 可双击桌面的“回页”快捷方式，或运行仓库根目录的 `启动回页.cmd`；启动器会先校验本地数据，再启动仅监听 `127.0.0.1:4317` 的应用；
- 启动器窗口需要在使用期间保持打开；关闭启动器只会停止本地服务，不会删除或改写日记数据；
- 开发命令：`npm run local`；
- 校验当前本地数据：`npm run local:verify`；
- 从完整 JSON 建立新数据代次：`npm run local:import -- <备份文件路径>`。

当前已经从 2026-08-01 的云端完整副本建立第一份本地有效代次。迁移源文件继续保存在 `local-data/imports`，源 SHA-256 与下载目录原件一致。启动入口不会扫描其他磁盘目录，也不会把 `local-data` 发送到 Sites。

## 当前关系回响 0.1 流程

```text
保存新记录
  → 过滤：仅允许关联的旧记录
  → 候选：当前 MVP 传入少量已有记录
  → AI 严格判断：无确实价值则不返回
  → 校验：引用必须是候选原文中的精确片段
  → 本地保存 Echo（pending / opened / continued / irrelevant）
  → 回响页最多展示一张 pending 卡片
```

回响 API 不是“相似文本搜索”。当前实现主要覆盖关系延续：模型必须判断 A 与 B 之间是否存在旧假设、条件、证据或判断的变化；仅关键词相同必须拒绝。时间延续尚未进入当前代码流程。

## 数据模型

字段、允许值、物理目录和关系图统一维护在 [DATA_SCHEMA.md](DATA_SCHEMA.md)。本节只说明当前兼容结构与迁移方向，不再复制完整字段字典。

### Entry

- `content`：用户当前确认的唯一「我的思考」；
- `originalContent`：旧双版本方案留下的兼容字段，不代表产品仍展示两个版本；
- `createdAt`、来源、附件；
- `aiLink`：是否参与未来回响；字段名暂为兼容保留；
- `continuesFrom`：当前单来源思考线兼容字段，只能记录一篇旧记录，无法完整表达 A + B → C。

### Echo

- 当前记录与旧记录 ID；
- 可核对的旧原文引句；
- 限长的关联理由；
- 状态：`pending`、`opened`、`continued`、`irrelevant`；
- 生成时间。

以上是当前线上兼容结构。它会在用户点击“继续写”时提前记为 `continued`，也只能记录一个 `continuesFrom`；因此点击不能代表延续成功，且无法完整表达 A + B → C。

### 目标结构：AssociationRecord

```ts
AssociationRecord {
  id
  mode: "judgment_shift" | "temporal_checkin"
  sourceEntryIds: number[]
  triggerEntryId?: number
  evidence: { entryId: number; quote: string }[]
  reason: string
  question: string
  ruleVersion: string
  events: AssociationEvent[]
}
```

新思考保存来源：

```ts
derivedFrom?: {
  associationId: string
  entryIds: number[]
}
```

事件分为：`opened`、`relation_rejected`、`not_now`、`continuation_started`、`continuation_saved`。只有 `continuation_saved` 验证一次思考延续真实发生。

该结构是下一轮 Demo 的目标，不代表当前代码已经完成迁移。完整备份格式必须在迁移实现后同步升级并验证向后兼容。

## 为什么还不是完整 RAG

当前版本只服务于少量真实日记的体验验证，不需要先引入复杂基础设施。随着记录数量增长，再引入：

- D1：日记、版本、权限、思考线、回响反馈；
- R2：图片和附件；
- FTS：精确检索；
- Vectorize / Embedding：从大量记录中生成候选；
- rerank / recall gate：决定候选是否真的值得展示。

检索只负责生成候选；关联判断负责“过去与当下是否真的值得相遇”；用户保存的新思考负责验证“延续是否发生”。三者不能混为一谈，回页当前也不以建设 RAG 为目标。

## 非目标

- 不做复杂 Agent 编排；
- 不把模型推断自动写成长期用户画像；
- 不把 AI 整理作为记忆系统的核心；
- 不以聊天回答替代用户自己的判断。

## 当前数据原则

- 每篇记录只有一份用户确认的「我的思考」；AI 整理不再是当前主线。
- 日记、图片、思考线和回响反馈保存在本地 `local-data` 文件夹；未保存草稿与少量界面设置保存在当前浏览器。
- Markdown 导出用于阅读与归档；完整 JSON 备份与导入用于换电脑迁移。
- 完整 JSON 包含思考、图片、关联许可、思考线、回响和回响检查记录；未保存草稿不在备份内。
- JSON 导入会创建新的本地数据代次，原代次与导入源文件继续保留。

## 当前已知边界

- “和 AI 聊聊”仍是静态演示，尚未接入真实、可解释的关联判断；
- 日记池筛选按钮目前只有视觉状态，尚未真正筛选；
- 部分日期仍为硬编码；
- `/api/organize`、旧 Prompt、兼容字段和样例状态仍留在代码中，确认无依赖后再清理。
- 当前本地形态已提供 Windows 桌面快捷方式和轻量启动器，但尚未封装为独立安装包；
- 跨设备同步、文件冲突合并和本地模型不属于当前阶段；
- 旧 Sites 私人站仍保留 R2 数据读取能力，待本地版本验收后再将其降级为只读迁移入口；
- 公开作品集必须使用独立的脱敏演示数据，不能读取或打包 `local-data`。
