# 回页：技术指南

> 职责：只描述当前代码事实、运行方式和与目标模型的差距
> 最后核对：2026-08-03

## 1. 当前技术形态

- 前端：React 19、Next 16 API 兼容层、vinext、Vite；
- 本地服务：Vite 插件拦截 `/api/data`，读写项目内 `local-data`；
- Worker：`worker/index.ts` 只负责页面与静态资源，不提供私人数据或模型接口；
- 部署兼容：仓库保留 `.openai/hosting.json` 和 Sites Vite 插件，用于未来作品集；不再声明 R2 私人数据绑定；
- 本地启动：`启动回页.cmd` 调用 PowerShell 启动器，默认监听 `127.0.0.1:4317`；
- 桌面入口：安装脚本创建名为“回页 · AI Diary”的快捷方式，指向同一个本地启动器；
- 公开展示：`/portfolio` 是当前仓库中的作品集骨架，不代表已经完成独立公开发布。

私人本地应用是当前主线。旧私人 Sites 及其 R2 数据只具有历史和迁移意义，不是本地日记的主数据源。本轮没有重新部署。

## 2. 代码入口

| 路径 | 当前职责 |
|---|---|
| `app/page.tsx` | 私人应用 UI、v1 Entry 状态、导入导出和 EchoRecord 事件衔接 |
| `app/echo-card.tsx` | 两类 EchoCard、三级原文展开和延伸入口 |
| `app/portfolio/page.tsx` | 脱敏作品集骨架 |
| `worker/index.ts` | Sites/Worker 页面与静态资源入口，不提供私人数据接口 |
| `vite.config.ts` | 组合本地数据插件、vinext、Sites 和 Cloudflare 插件 |
| `build/local-data-store.mjs` | 当前 generation 存储、校验与恢复实现 |
| `build/local-data-vite-plugin.mjs` | 本地 `/api/data` 读写入口与请求限制 |
| `build/echo-record-store.mjs` | 私有 EchoRecord v2 校验、原子文件写入和事件追加 |
| `scripts/import-local-data.mjs` | 从完整 JSON 导入为新的 v1 generation |
| `scripts/verify-local-data.mjs` | 校验当前 generation 并输出数量摘要 |
| `scripts/start-huiye-*.ps1` | Windows 启动器与桌面入口 |
| `tests/local-data-store.test.mjs` | generation 写入、恢复和访问限制测试 |
| `tests/rendered-html.test.mjs` | Worker、页面和接口回归测试 |

`build/` 当前包含项目实际引用的本地存储模块，不应在迁移完成前当作普通构建产物删除。

## 3. 当前启动方式

日常启动：

```text
双击 启动回页.cmd
```

开发启动：

```powershell
npm run local
```

打开：`http://localhost:4317`

数据校验与测试：

```powershell
npm run local:verify
npm test
```

如果系统终端找不到 `npm`，应使用项目启动器已经定位到的 Node 运行环境；这属于环境路径问题，不代表日记数据损坏。

## 4. 当前数据读写

当前前端逻辑对象仍是：

```ts
type HuiyeBackupV1 = {
  format: "huiye-backup";
  version: 1;
  exportedAt: string;
  entries: EntryV1[];
  echoes: EchoV1[];
  echoCheckedIds: number[];
};
```

当前磁盘布局：

```text
local-data/
├─ current.json
├─ generations/
│  └─ <generationId>/
│     ├─ generation.json
│     ├─ entries/<entryId>/content.md
│     ├─ entries/<entryId>/record.json
│     └─ associations/
├─ pointer-history/
└─ imports/
```

每次保存创建一个完整、不可变的新 generation：先写 `.staging-*`，校验后改名，再更新 `current.json`。指针损坏时读取端会扫描有效 generation 恢复。这套机制已经解决了直接覆盖唯一副本的问题，但会复制整库，也与已确认的“一条记录一份当前文件”目标不一致。

当前有效基线为：15 篇 Entry、15 个唯一 ID、0 条 Echo、0 个 `echoCheckedIds`、0 个附件。2026-08-02 清空旧回响时先复制了完整 v1 备份，再创建新的有效 generation；15 篇 Entry 在写入前后逐项序列化比对一致。数据可能在用户继续写作后变化，迁移前必须重新运行校验。

在不改动上述 Entry generation 的前提下，`local-data/echoes/` 已加入 2 条经用户确认卡片形态的候选 EchoRecord：1 条 `relational`、1 条 `reflective_revisit`。它们引用 Entry ID、精确原句和当次 AI 浓缩，不复制完整日记；完整原文由页面按 Entry ID 读取。

## 5. 当前接口

### 本地 `/api/data`

- 仅在本地运行时由 Vite 插件接管，读写 `local-data`；
- 托管 Worker 不实现 `/api/data`，也没有 R2 私人数据绑定；
- 前端只接受 `storageKind: local-folder`，否则禁止进入可写状态。

### 本地回响接口

- `GET /api/echo-records`：读取并校验 `local-data/echoes/*.json`；
- `POST /api/echo-events`：原子追加 `not_now`、`continuation_started` 或 `continuation_saved` 等事件；
- 两个接口沿用本地回环地址和同源限制，托管 Worker 不提供这些私人接口；
- 若 EchoRecord 损坏，日记读取和写作仍保持可用，回响页单独显示读取失败。

## 6. 当前 v1 结构的限制

- Entry 仍包含 `date`、`status`、`source`、`aiLink`、`continuesFrom` 等兼容字段；
- 附件仍可以内嵌 Base64 形式存在；
- Echo 只有 `pending/opened/continued/irrelevant`；
- `continued` 在点击“继续写”时就产生，不能证明用户保存了新思考；
- `continuesFrom` 只能表达单一来源，不能表达 `A + B → C`；
- `echoCheckedIds` 只有检查标记，缺乏可解释的质量与行为记录；
- `associations/` 目录存在，但当前基线没有正式关系文件；
- 私人页面已停用旧自动回响，并在导入 v1 JSON 时丢弃 Echo 与 `echoCheckedIds`；
- 回看回响的自动资格筛选与随机调度、CaseRecord、候选/已验证拓扑尚未实现；
- 两类回响卡片和手工候选 EchoRecord 已实现；自动关系发现、比例调度、CaseRecord 与拓扑仍未实现；
- 日记池部分筛选按钮仍只有视觉状态，尚未执行真实筛选；
- 写作页日期已改为读取真实当前日期；虚构日记引用的静态聊天已停用，真实 Entry 引用链路完成前只显示校准说明。

## 7. 目标与当前差距

| 方面 | 当前实现 | 已确认目标 |
|---|---|---|
| Entry | v1 对象拆成 `content.md + record.json` | 每篇一个 Markdown + frontmatter |
| 关系 | Echo + `continuesFrom` + `echoCheckedIds` | 唯一 EchoRecord |
| 思考线 | 单来源兼容字段 | 从 Entry + EchoRecord 推导 |
| 案例 | 无物理记录 | CaseRecord 引用已有内容 |
| 保存 | 每次复制完整 generation | 当前文件 + journal + 有限 history |
| 备份 | generation 自动累积、JSON 导出 | 用户主动完整备份，日常历史有上限 |
| 删除 | 旧的一步永久删除入口已禁用；尚无完整两阶段语义 | trash + 永久级联清理 |
| 作品集 | 同仓库 `/portfolio` 骨架 | 与真实 `local-data` 构建隔离 |

目标字段和迁移映射只在 [05_DATA_SCHEMA.md](05_DATA_SCHEMA.md) 维护，不在本文复制第二份。

## 8. 数据安全约束

- `local-data` 必须保持 Git ignored；
- 迁移只能写入新位置，不能就地覆盖旧 generation；
- 切换读取来源前必须验证数量、ID、正文哈希、附件和关系；
- 旧结构在用户验收前保持只读可恢复；
- 空目录不得自动写入示例日记；
- 启动器不得扫描项目外磁盘或自动寻找私人备份；
- 公开构建必须有检查，发现 `local-data` 或真实日记时直接失败；
- 本地存储不等于本地推理，远程模型调用只能发送获得许可的最小必要原文。

## 9. 当前验证

最近一次代码验证通过 15 项测试，并完成过一次真实本地写入检查。该结果证明当前 v1 Entry 保存链路、EchoRecord 文件校验、事件追加和卡片构建可运行，不证明完整 v2 数据迁移已经完成。

完成 v2 迁移前至少需要新增：

- v1 → v2 内容与关系迁移测试；
- Markdown/frontmatter 往返一致性测试；
- 事务中断与恢复测试；
- history 上限、回收站和永久删除测试；
- EchoRecord 事件与拓扑推导测试；
- CaseRecord 引用完整性测试；
- 作品集构建不包含私人数据的强制测试。
