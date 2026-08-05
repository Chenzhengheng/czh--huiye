# 回页：文档索引

> 最后更新：2026-08-03

## 推荐阅读顺序

| 文档 | 唯一职责 | 状态 |
|---|---|---|
| [02_README.md](02_README.md) | 项目入口、当前状态、启动方式 | 活跃 |
| [03_PROJECT_ALIGNMENT.md](03_PROJECT_ALIGNMENT.md) | 已确认的产品目标、边界与完整方案 | 活跃 |
| [04_CONTEXT.md](04_CONTEXT.md) | 项目唯一术语表 | 活跃 |
| [05_DATA_SCHEMA.md](05_DATA_SCHEMA.md) | 目标数据契约、目录和旧数据迁移映射 | 活跃 |
| [06_TECHNICAL_GUIDE.md](06_TECHNICAL_GUIDE.md) | 当前代码实际上如何运行，以及与目标的差距 | 活跃 |
| [07_ROADMAP.md](07_ROADMAP.md) | 当前优先级、实施顺序与完成标准 | 活跃 |

## 文档边界

- 产品原则或边界发生变化：更新 `03_PROJECT_ALIGNMENT.md`，并同步 README 摘要。
- 新增或修改领域术语：更新 `04_CONTEXT.md`。
- 数据字段、允许值、目录或迁移规则变化：更新 `05_DATA_SCHEMA.md`。
- 代码、接口、命令或运行方式变化：更新 `06_TECHNICAL_GUIDE.md`。
- 优先级、阶段状态或验收进度变化：更新 `07_ROADMAP.md`。
- `02_README.md` 只保留新成员第一次打开项目时必须知道的内容，不复制完整方案。

## 冲突处理

文档出现冲突时按问题类型判断，不采用“一份文档覆盖所有事实”的规则：

1. 产品意图以 `03_PROJECT_ALIGNMENT.md` 为准；
2. 术语以 `04_CONTEXT.md` 为准；
3. 目标数据结构以 `05_DATA_SCHEMA.md` 为准；
4. 当前实现以代码和测试为准，`06_TECHNICAL_GUIDE.md` 必须与其同步；
5. 当前先做什么以 `07_ROADMAP.md` 为准。

如果目标文档与当前代码不同，应明确写为“待迁移”，不能把目标描述成已经实现。

## 已删除的过时文档

以下文档已于 2026-08-02 删除，其仍有效的结论已并入上述活跃文档：

- `DOCUMENTATION_INSTRUCTIONS.md`：与本索引重复，并且只覆盖旧的三文档结构；
- `docs/plans/2026-08-01_08-05_DELIVERY_PLAN.md`：时间窗口已过，且包含“14 篇、缺第 15 篇”等失效状态；
- `docs/legacy/AI_ORGANIZATION_STANDARD.md`：AI 整理已退出产品主线；
- `docs/legacy/AI_ORGANIZATION_EXAMPLES.md`：只服务于已退出的 AI 整理回归样例。
