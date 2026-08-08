# 回页领域语言

本文件是项目唯一术语表。实现、文档、Issue 与 Prompt 应优先使用下列语言。

## 核心对象

**Entry（日记）**：用户确认保存的一次自我表达。可属于零条或多条 ThoughtLine；`aiLink=false` 时 AI 必须跳过。避免：知识条目、AI 生成的人生结论。

**ThoughtLine（思考线）**：用户主动创建、具有稳定 ID 的主题边界，用于聚合关于同一件事的 Entry。它不是 AI 推导的路径，也不等于普通 Tag。避免：自动分类、派生关系图、空思考线。

**ThoughtLineTag（思考线标签）**：ThoughtLine 在 Entry 上的特殊视觉入口。用户的操作看起来像打标签，数据上引用 ThoughtLine ID。避免：用名称字符串当主键。

**EchoRecord（回响记录）**：AI 在一条 ThoughtLine 内基于至少两篇 Entry 形成的持久观察，保存来源、证据、初判、关系类型、生命周期和事件。避免：用户手工连线、EchoCard。

**CaseRecord（案例评测记录）**：对 EchoRecord 的 good/bad、反馈原因和备注，不复制私人原文，不进入正式回响。避免：正式回响、评测内容副本。

**EvaluationSet（评测集）**：在同一场景定义下，供人工反复检查的一组输入案例。当前由真实 Entry、ThoughtLine 和对应候选共同构成。避免：只收集模型输出、把私人原文复制成另一份数据。

**ModelOutputSet（模型输出集）**：模型面对 EvaluationSet 后产生的 EchoRecord 集合，用于与人工反馈对照和归因。避免：参考答案、用户原话。

**ReferenceAnswer（参考答案）**：对某个输入预先认可的理想输出或关键判断。当前 good case 探索期尚未建立，应从真实 good case 中逐步推演，不能提前伪造。避免：把第一批模型输出直接当标准答案。

**EvaluationCriteria（评测标准）**：用于判断模型输出质量的明确维度。当前首先观察 ManifestationValue，并以 clarified、already_known、not_quite 区分新增显化、重复认知和偏差；完整归因标准待 good case 稳定后建立。避免：只看相关性、只看是否继续写。

## 核心体验

**ManifestationValue（显化价值）**：AI 把用户已经隐约记录、但尚未清楚说出的变化变得更可见。这是回响第一质量。避免：相关即有价值、AI 检出即成功。

**ReencounterFeeling（重逢感）**：用户在当下重新遇见写下旧 Entry 时的自己。它可能来自怀念、情绪、联系或变化，是第二质量，不要求继续写。

**MisalignedGrowth（错位生长）**：看见与写下不必发生在同一时刻。用户今天看见一处联系，可能未来才回应；新思考也可以从回页之外进入。避免：线性成长漏斗。

**InterpretiveHypothesis（解释性初判）**：AI 基于原文证据提出、允许用户修正的方向性理解。避免：最终解释、人格诊断。

**CompanionPresence（陪伴式在场）**：以低打扰提示让用户知道有回响可看，不制造待办与未读焦虑。

## 行为与状态

**LineMembership（归线关系）**：Entry 对 ThoughtLine ID 的多对多引用。由用户建立，不是 AI 自动关系。

**LineEchoPermission（整线回响权限）**：ThoughtLine 是否允许 AI 生成正式观察。

**EntryEchoPermission（单篇回响权限）**：Entry 是否允许参与任何 AI 回响。拒绝优先。

**EchoRelationType（回响关系类型）**：`continuation` 延续、`revision` 修正、`branch` 分支、`conflict` 冲突、`unresolved_question` 未解决问题或 `other`。

**LegacyEvaluation（历史评测）**：旧单页回看或无共同用户思考线的关系记录。只供评测和兼容读取，永不成为正式候选。

**OptionalEchoFeedback（可选反馈）**：`clarified` 看清了一点、`already_known` 我已经知道了、`not_quite` 不太对。旧反馈值只兼容读取。

**EchoDot（回响点）**：已出现过的回响在线上留下的可点击状态标记；它是 EchoRecord 的呈现，不是新领域对象。

## 边界术语

**UnlinedEntry（未归线日记）**：没有 ThoughtLine 的 Entry。可正常保存，只在未来用户授权的低频复盘中参与。

**LowFrequencyReview（低频复盘）**：未来由用户主动启动的一周/月级全库或跨线复盘，不属于当前正式自动回响。

**KnowledgeBase（知识库）**：保存理论知识、资料与知识图谱的外部工具职责，不属于回页。

**PortfolioMode（展示模式）**：只使用脱敏固定数据，不读取私人 Entry 的公开演示环境。
