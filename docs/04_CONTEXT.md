# 回页领域语言

本文件是项目唯一术语表。实现、文档、Issue 与 Prompt 应优先使用下列语言。

## 核心对象

**Entry（日记）**：用户确认保存的一次自我表达。可属于零条或多条 ThoughtLine；`aiLink=false` 时 AI 必须跳过。避免：知识条目、AI 生成的人生结论。

**ThoughtLine（思考线）**：用户主动创建、具有稳定 ID 的主题边界，用于聚合关于同一件事的 Entry。它不是 AI 推导的路径，也不等于普通 Tag。避免：自动分类、派生关系图、空思考线。

面向普通访客介绍产品时，术语采用中文优先、英文括注的形式：`思考线（ThoughtLine）`、`回响（Echo）`；工程文档、代码标识和数据契约继续使用既有英文领域名。

**ThoughtLineTag（思考线标签）**：ThoughtLine 在 Entry 上的特殊视觉入口。用户的操作看起来像打标签，数据上引用 ThoughtLine ID。避免：用名称字符串当主键。

**EchoRecord（回响记录）**：AI 在一条 ThoughtLine 内基于至少两篇 Entry 形成的持久观察，保存来源、证据、初判、关系类型、生命周期和事件。避免：用户手工连线、EchoCard。

**CaseRecord（案例评测记录）**：对 EchoRecord 的结构化反馈、用户原话、评测判断和备注；引用对应 EchoRecord，不复制来源 Entry 私人原文，也不进入正式回响。结构化反馈与用户原话必须分别保存，不能用其中一项推断另一项。避免：正式回响、来源内容副本、把“写了回应”自动判为 good。

**EchoReply（回响回应）**：用户直接写在某条 EchoRecord 下方的一段回应。它可以很短或很长，可编辑、可删除；不是 Entry，不进入日记池，也不自动参与未来回响。未来可以由用户明确选择“转为日记”。避免：自动新建 Entry、把回应内容当作评测反馈、因用户回应而自动选择反馈。

**EvaluationSet（评测集）**：在同一场景定义下，供人工反复检查的一组输入案例。当前由真实 Entry、ThoughtLine 和对应候选共同构成。避免：只收集模型输出、把私人原文复制成另一份数据。

**ModelOutputSet（模型输出集）**：模型面对 EvaluationSet 后产生的 EchoRecord 集合，用于与人工反馈对照和归因。避免：参考答案、用户原话。

**ReferenceAnswer（参考答案）**：对某个输入预先认可的理想输出或关键判断。当前 good case 探索期尚未建立，应从真实 good case 中逐步推演，不能提前伪造。避免：把第一批模型输出直接当标准答案。

**EvaluationCriteria（评测标准）**：用于判断模型输出质量的明确维度。当前首先观察 ManifestationValue，并以 clarified、already_known、not_quite 区分新增显化、重复认知和偏差；完整归因标准待 good case 稳定后建立。避免：只看相关性、只看是否继续写。

**EvaluationWorkbook（评测工作簿）**：用于浏览、比较和展开 EvaluationSet 的工作台。包含“评测总表”“评测标准”和“Prompt 版本”三个 Sheet；分别承担跨 Case 比较、判定尺度和生成规则追溯。避免：把全部完整卡片连续铺开、把评测标准或 Prompt 历史散落在备注中。

**EvaluationDimension（评测维度）**：EvaluationCriteria 中可独立判断的一条质量轴。首批维度为关系成立度、显化增量和重逢感，每项使用高／中／低尺度；Case 的 good / bad 仍由人最终判断，不由维度机械计算。关系成立度为低时原则上是 bad；关系成立但其余两项都低时通常也是 bad。避免：把用户是否回应当作质量维度、用单一总分遮蔽失败原因。

**PromptVersion（Prompt 版本）**：一次可复现的候选生成规则，包含完整文本、状态、变更摘要、评测依据和继承关系。输入数量、时间跨度和 ThoughtLine 不同不触发升级；规则实质修改才创建新版本，旧 Case 保留原版本。`echo-eval-v0.1` 冻结首批规则，`v0.2` 仅将关系类型中文化并继承其评测，当前 `v0.3` 负责主思考线内搜索与生成决策，且已完成一条新 good case 的首轮验证。避免：覆盖旧规则、把输入变化冒充版本变化、把继承结果说成独立评测。

**SilentDecision（保持沉默）**：Agent 在一次主 ThoughtLine 搜索中没有候选同时通过关系、证据、显化和解释风险门槛时作出的内部决定。正式体验不呈现失败内容，评测阶段可查看放弃阶段与原因。避免：为了每次都有输出而勉强连接、把沉默保存成正式 EchoRecord。

## 核心体验

**ManifestationValue（显化价值）**：AI 把用户已经隐约记录、但尚未清楚说出的变化变得更可见。这是回响第一质量。避免：相关即有价值、AI 检出即成功。

**ReencounterFeeling（重逢感）**：用户在当下重新遇见写下旧 Entry 时的自己。它可能来自怀念、情绪、联系或变化，是第二质量，不要求继续写。

**MisalignedGrowth（错位生长）**：看见与写下不必发生在同一时刻。用户今天看见一处联系，可能未来才回应；新思考也可以从回页之外进入。避免：线性成长漏斗。

**InterpretiveHypothesis（解释性初判）**：AI 基于原文证据提出、允许用户修正的方向性理解。避免：最终解释、人格诊断。

**SourceDisclosure（来源披露）**：EchoCard 对来源 Entry 的三层呈现：逐字证据、原文节选、完整原文。原文节选默认展开且可收起，完整原文默认关闭并由用户主动展开；评测与正式回响保持一致。避免：只给 AI 摘要、默认铺开整篇长文、评测状态与正式体验不一致。

**CompanionPresence（陪伴式在场）**：以低打扰提示让用户知道有回响可看，不制造待办与未读焦虑。

## 行为与状态

**LineMembership（归线关系）**：Entry 对 ThoughtLine ID 的多对多引用。由用户建立，不是 AI 自动关系。

**LineEchoPermission（整线回响权限）**：ThoughtLine 是否允许 AI 生成正式观察。

**EntryEchoPermission（单篇回响权限）**：Entry 是否允许参与任何 AI 回响。拒绝优先。

**EchoRelationType（回响关系类型）**：面向用户和 Prompt 统一显示“延续、修正、分支、冲突、未解决问题、其他”；内部数据仍分别保存为 `continuation`、`revision`、`branch`、`conflict`、`unresolved_question`、`other`。历史记录缺少具体关系时，`relational` 显示为“联系回响”，`reflective_revisit` 显示为“回看回响”。避免：把英文存储枚举直接暴露给用户、为了中文展示迁移已有数据。

**LegacyEvaluation（历史评测）**：旧单页回看或无共同用户思考线的关系记录。只供评测和兼容读取，永不成为正式候选。

**EvaluationOnly（仅评测候选）**：使用真实线内 Entry 构造、只进入评测工作台的 EchoRecord 生命周期。它用于高频校准，不得出现在正式回响入口；与只负责兼容旧机制的 LegacyEvaluation 不同。

**OptionalEchoFeedback（可选反馈）**：用户对 AI 观察质量的可选判断：`clarified` 看清了一点、`already_known` 我已经知道了、`not_quite` 不太对。它与 EchoReply 相互独立：用户可以只反馈、只回应、两者都做或两者都不做；任何一方都不能自动推断另一方。旧反馈值只兼容读取。

**EchoDot（回响点）**：已出现过的回响在线上留下的可点击状态标记；它是 EchoRecord 的呈现，不是新领域对象。

## 边界术语

**UnlinedEntry（未归线日记）**：没有 ThoughtLine 的 Entry。可正常保存，只在未来用户授权的低频复盘中参与。

**LowFrequencyReview（低频复盘）**：未来由用户主动启动的一周/月级全库或跨线复盘，不属于当前正式自动回响。

**KnowledgeBase（知识库）**：保存理论知识、资料与知识图谱的外部工具职责，不属于回页。

**PortfolioMode（展示模式）**：只使用脱敏固定数据、不读取或写入私人 Entry 的公开演示环境。访客操作只影响当前浏览器会话；刷新或执行“恢复演示数据”后回到固定初始状态，不建立账户、云存储或访客持久化数据。避免：复用私人模式的数据接口、把本地真实 Entry 打包进公开产物、把展示操作保存成正式数据。

**MinimumRedaction（最小脱敏）**：PortfolioMode 公开数据的处理原则。以用户批准的评测来源为边界，保留原文语气、上下文、真实日期、不确定性和与 Case 直接相关的自我暴露；只自然替换可识别的真实姓名、公司、面试平台、具体团队或业务列表，并删除与 Case 无关、会分散观看者注意力的私人细节。Entry、EchoRecord、CaseRecord 和 EchoReply 在进入公开数据前都必须逐项经用户审核。避免：把原文润色成作品集文案、为显得完整而补写事实、仅凭“没有真实姓名”判断已经安全、直接打包私人数据文件。
