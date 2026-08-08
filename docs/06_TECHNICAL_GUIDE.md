# 回页：技术指南

> 职责：只描述当前代码事实、运行方式和与目标模型的差距
> 最后核对：2026-08-05

## 1. 当前技术形态

- 前端：React 19、Next 16 API 兼容层、vinext、Vite；
- 私人数据服务：Vite 插件拦截本地接口，读写项目内 `local-data`；
- Worker：只负责页面与静态资源，不提供私人数据或模型接口；
- 私人应用默认监听 `127.0.0.1:4317`，`/portfolio` 是同仓库的脱敏作品集骨架；
- 本轮没有部署，也没有改动真实 Entry 正文或当前 generation。

## 2. 代码入口

| 路径 | 当前职责 |
|---|---|
| `app/page.tsx` | 私人应用、Entry 状态、单候选回响节奏与事件衔接 |
| `app/echo-card.tsx` | 原文优先的 EchoCard、可选反馈、回应入口与已保存回应 |
| `app/portfolio/page.tsx` | 脱敏产品叙事，不读取私人原文 |
| `build/local-data-store.mjs` | generation 存储、校验与恢复 |
| `build/local-data-vite-plugin.mjs` | 本地数据和回响接口、同源限制 |
| `build/echo-record-store.mjs` | EchoRecord 校验、原子写入与事件追加 |
| `tests/*.test.mjs` | 页面语义、私人接口和存储回归测试 |

`build/` 包含正在使用的本地存储模块，不是可随意删除的构建产物。

## 3. 启动与验证

日常启动：双击 `启动回页.cmd`。开发时运行：

```powershell
npm run local
```

打开 `http://localhost:4317`。验证命令：

```powershell
npm run local:verify
npm run local:verify-echoes
npm test
```

## 4. 当前数据读写

Entry 主存储仍是 v1 generation：每次保存先写完整 `.staging-*`，校验后改名并更新 `current.json`；指针损坏时会扫描有效 generation 恢复。它安全但会复制整库，尚未迁移为目标中的单 Entry 文件、journal、有限 history 与 trash。

`local-data/echoes/*.json` 独立保存手工 EchoRecord。当前两个候选分别为 `relational` 和 `reflective_revisit`，仅引用 Entry ID、精确引文和 AI 浓缩，不复制完整日记。真实数据可能继续变化，迁移前必须重新运行数量、ID、正文哈希和附件校验，不能把历史的 15 篇基线当作永久事实。

## 5. 当前回响实现

私人页面当前已经实现：

- 从手工 EchoRecord 中选择一个当前候选，不展示候选总数；
- 回响导航只出现一个无数字的小棕点；
- 一次只呈现一个，反馈或保存回应后留白，不立即补下一条；
- 原句、原文节选与完整原文先于 AI 摘要和解释性初判；
- 回应入口与三类反馈入口分开：`resonated`、`accurate_no_resonance`、`not_quite`；
- 沉默离开不写负面事件；
- 保存回应写入新 Entry，并追加 `response_saved.resultEntryId`；
- EchoCard 可以从来源看到已保存回应；Entry 查看页也能从来源或回应双向读取连接。

当前选择器只是兼容层：它在已有手工记录中排除已结束和仍在冷却的记录，没有自动发现、真正的时间调度或新的呈现快照。一个记录提交反馈后，在现有结构中会长期退出候选；未来必须由 `EchoPresentation` 支持同一来源在新情境下再次呈现。

## 6. 本地回响接口与事件

- `GET /api/echo-records`：读取并校验 `local-data/echoes/*.json`；
- `POST /api/echo-events`：原子追加事件；
- 新写事件包括 `opened`、`feedback_submitted`、`response_started`、`response_saved`；
- 为避免破坏现有私有记录，仍兼容 `not_now`、`continuation_started`、`continuation_saved`；
- `feedback_submitted` 校验反馈值、原因码和可选否定范围；
- `response_saved` 校验结果 Entry ID；
- EchoRecord 损坏只影响回响页，不阻断日记读取与写作。

## 7. 已确认目标与尚未实现

| 方面 | 当前实现 | 目标差距 |
|---|---|---|
| 候选发现 | 两条人工 EchoRecord | 用真实 case 校准的关系发现与受约束单页回看 |
| 呈现历史 | 事件直接挂在 EchoRecord | 独立 `EchoPresentation` 快照，可支持再次呈现 |
| 反馈 | 三类事件已可写 | 原因补充、否定范围选择、冷却执行与个体校准 |
| 连接 | 来源与回应可双向读取，多个结果 Entry 可并列展示 | 尚无独立关系索引；当前由 EchoRecord 事件即时推导 |
| 原意保护 | Entry 仍可直接编辑 | 只允许纠错；实质变化保存为新回应或版本 |
| 案例 | 结论只在文档中 | 可验证的 CaseRecord 与 Prompt/模型版本 |
| Entry 存储 | v1 generation | Markdown/frontmatter、journal、history、trash |
| 作品集 | 同仓库脱敏页面 | 持续保证构建不含 `local-data` 和真实原文 |

目标字段和迁移映射只在 [05_DATA_SCHEMA.md](05_DATA_SCHEMA.md) 维护。

## 8. 数据安全约束

- `local-data` 必须保持 Git ignored，公开构建发现它或真实日记时必须失败；
- 迁移写入新位置，不能就地覆盖唯一副本；
- 切换来源前验证数量、ID、正文哈希、附件和关系；
- 用户验收前保留旧结构只读回退；
- 本地存储不等于本地推理；远程模型只能收到用户许可的最小必要原文。

## 9. 验证边界

当前测试覆盖 generation 写入与恢复、EchoRecord 校验与事件追加、页面关键语义和公开 Worker 边界。它不证明自动发现质量、重逢感、完整 v2 迁移或删除恢复流程已经完成；这些必须分别通过真实 case 回归和迁移测试验证。
