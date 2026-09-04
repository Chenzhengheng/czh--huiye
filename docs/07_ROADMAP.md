# 回页路线图

## 已进入上线：双部署作品集匿名访问闭环

- 国内站统计 `/`，海外站统计 `/` 与兼容入口 `/portfolio`，以各部署独立的匿名设备 Cookie 和 30 分钟会话为口径。
- 负责人本机以访问次数查看今天、近 7 天、近 30 天和每日趋势，同时保留大陆站/海外站拆分；匿名设备仅作分站辅助指标。
- 海外既有历史全部按普通访问保留；国内数据自上线开始积累、不回填；两边各保留 90 天。
- 看板保持本地私有，线上作品集没有统计页面。
- [x] 完成 Cloudflare 海外统计契约迁移、EdgeOne 国内统计代码、本地双站汇总与故障降级。
- [ ] 在 EdgeOne 配置 KV 与独立管理员密钥，完成预览验收后发布生产。
- [ ] 发布海外 Worker 新统计契约，并完成一次披露的生产访问冒烟测试。

> 先验证“用户归线 + AI 显化”是否有感觉，再扩大自动化。

## 第一版

- [x] ThoughtLine 稳定对象与 Entry 多线归属
- [x] 写下、日记池编辑、详情批量加入三入口
- [x] 时间线、移出、重命名、归档、恢复、合并
- [x] 整线与单篇双重 AI 权限
- [x] 正式回响只接受共同用户线内观察
- [x] 回响点、三类反馈、评测/展示隔离
- [x] 卡片内 EchoReply 与独立评测判断
- [x] 评测工作簿总表、标准 Sheet、Prompt 版本 Sheet 与三维尺度
- [x] Agent Prompt v0.4：在 v0.3 主线内搜索上增加第三次来源复用门禁与三轮规则/LLM 循环（待真实 Case 评测）
- [x] 本地兼容存储、测试和核心文档
- [x] 公开作品集、13 篇 MinimumRedaction 演示数据、10 个评测 Case 与稳定深链
- [x] 公开作品集入口与私人本地回页入口分流
- [x] 写下与日记池复用同款纸张编辑器：按视觉行计数，连续回车即时稳定地在纸内跟随；写下页自然向下、日记池背景稳定，并由真实浏览器回归覆盖
- [x] 本地 generation 分层保留、首次清理前完整备份与失效 pointer history 清理

## 下一步：案例校准

用真实笔记重新归线；高频生成候选但不打扰正式体验；分别记录“看清 / 已知 / 不太对”、用户原话与 good/bad 判断；从 case 反推候选条件、原文证据、时机和 Prompt；之后再决定生产模型和出现频率。

评测集尚未建立参考答案。当前始终使用表格总览与单条展开寻找 good case，并以关系成立度、显化增量、重逢感记录人的判断；继续扩充后再逐步补齐参考答案和可归因的评测标准。

Agent Prompt v0.3 已完成一条新 good case 的首轮验证：它从完整主思考线中选择未使用过的最小来源组合，三个评测维度均为高。当前 10 个 Case 共 7 个 good、3 个 bad；v0.4 已根据“旧 Entry 反复出现但缺少可感知变化”的真实负面反馈进入待评测状态，尚不新增 good/bad 结论。私人原文和逐条评测仍只保存在本地。

### 线级 Context 可替换实验（开发分支）

- [x] #62：通过 `ContextModule.inspect()` 读取完整 ContextSnapshot、不可变历史与代码确定性 diff；
- [x] #63：通过 Fake Agent Adapter 建立 `ContextModule.maintain()`，传入三份 Context 侧 Prompt 正文与版本，覆盖全局 EntryCardVersion、六章节 Context、跨线复用、`not_quite` 维护判断、stale/ready、增量与 Prompt 全量重建；
- [x] #64：把同一 RelationJudgment Prompt 接入候选导航与逐组判断，保留规则门禁、原文与历史读取、最多三轮 loop，并只返回沉默或内存草稿；
- [x] #66：内部 Context 检查入口展示新版快照、历史 Diff 与四模块 Prompt；评测工作台按新机制与冻结 Echo 基线分组显示模块、版本、状态和全文；
- [x] 分模块确认并记录四份 Prompt；EntryCard、ThoughtLineContext、ContextMaintenance 为 v0.1，RelationJudgment 在 B/C 诊断后选择 C 并升级为 v0.2；四份 Prompt 均以回页产品价值观开头，当前仍为 `pending_evaluation`；
- [x] 在隔离开发 generation 中接入 Codex JSON Agent Adapter，完成一次“秋招”线 9 篇真实 Harness 运行，并生成一条开发版 `evaluation_only` EchoRecord；尚待人工评测，不进入生产调度；
- [x] #68–#70：建立 RelationJudgment B/C 一次性配对 Harness并完成真实诊断；产品负责人选择 C 作为当前 canonical 实验方案，旧配对数据只作追溯，不再占据当前评测工作台；C 的真实结果仍需人工判断，不能视为生产结论；
- [x] #61–#64：将 Context 与回响收进统一 EvaluationWorkbench；收紧 Context generation 与结构化 navigation 门禁；按真实 Entry 差异维护 Context；每次 C 评测只写自足 EvaluationRunArtifact，不再写 `local-data/echoes`；历史 B/C 归入“回响 → 历史实验”。
- [ ] 用隔离数据与冻结旧基线完成两层评测后，再决定是否接真实模型或扩大实验。

本实验不表示动态排序已被生产机制取代，也不创建正式回响。自动化回归使用 Fake Adapter；显式授权的真实开发评测只形成隔离证据，不运行旧实验的 Navigation/Verification，也不写稳定版 `local-data`。旧机制冻结为对照基线；新机制如果不如更简单的 LLM + Prompt，可以在清晰模块边界上直接替换。

## 随后可能做

用户主动启动回响；周/月级授权的未归线与跨线复盘；在 AI 聊聊中调用思考线；连接足够多后探索主线、分支和交汇网络。

## 暂不做

自动归线、父子线、实时全库扫描、随机单页正式召回、生产 Prompt 编辑器、知识库、未读队列、强制回应、自动跨线人格分析。

## 已完成的作品集交付

1. [x] 用 Agent Prompt v0.3 从一条真实主思考线生成一条新候选，完成 good case 人工评测闭环。
2. [x] 对公开代码与文档做隐私审计，本地提交并推送 GitHub。
3. [x] 将回页本体、可公开笔记、思考线 Case、回响 Case、完整评测、GitHub 与产品流程图组织为公开作品集。
4. [x] 使用经用户审核的 13 篇 MinimumRedaction Entry 和 10 个 Case 建立可操作 PortfolioMode；不公开私人本地数据。
5. [x] 公开根网址展示作品集，本地桌面快捷方式进入 `/app` 私人回页。
6. [x] 将作品集从宣传式长页重构为证据型项目档案，以真实脱敏笔记、Case、模型观察和用户反馈呈现产品判断与评测迭代。
7. [x] 完成 `huiye-ai.cn` 的 ICP 备案合规页脚、EdgeOne 静态导出流程、旧 `/portfolio` 跳转和国内统计运行时代码；正式上线仍待配置 KV、密钥并完成生产发布。
