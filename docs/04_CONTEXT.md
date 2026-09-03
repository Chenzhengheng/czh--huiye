# 回页领域语言

本文件是项目唯一术语表。实现、文档、Issue 与 Prompt 应优先使用下列语言。

## 核心对象

**Huiye（回页）**：一款能随时随地、无负担地记录思考，并让思考彼此连接的 AI 原生记录产品。唯一口号是“让思考继续生长”。

**Entry（日记）**：用户确认保存的一次自我表达。可属于零条或多条 ThoughtLine；`aiLink=false` 时 AI 必须跳过。避免：知识条目、AI 生成的人生结论。

**ThoughtLine（思考线）**：用户主动创建、具有稳定 ID 的主题边界，用于聚合关于同一件事的 Entry。它不是 AI 推导的路径，也不等于普通 Tag。避免：自动分类、派生关系图、空思考线。

**EntryCard（Entry 卡片）**：一篇允许参与 AI 处理的 Entry 所对应的唯一、跨 ThoughtLine 共用的基础结构化认识。固定字段为 `entryId`、`occurredAt`、普通 `tags`、`thoughtLineIds`、权限快照 `aiLink`、一至三句 `summary`、原文自身尚未确定内容的 `uncertainty`，以及确定性回到原文的 `sourceRef`。只有 `summary` 与 `uncertainty` 由 AI 生成，其余字段由系统提供；最终读取权限仍由 RelationRuleEngine 检查实时 Entry，而不信任卡片快照。EntryCard 只描述该篇 Entry 明确表达的内容，不保存它在某条 ThoughtLine 中意味着什么，也不把模型置信度写成用户的不确定性；线内意义由对应 ThoughtLineContext 表达。卡片不复制或覆盖原文，多线交汇也不扩大任一条线的读取边界。避免：为同一 Entry 按 ThoughtLine 生成多张卡、把普通 Tag 当 ThoughtLine、把线内解释写进基础卡片、把暂时语气压平为确定结论、把模型摘要当用户事实。

**EntryCardVersion（Entry 卡片版本）**：EntryCard 每次 AI 概要、uncertainty 或系统元数据发生有效变化时形成的不可变版本；当前 EntryCard 指向最新有效版本，ContextSnapshot 引用具体 CardVersion 而不只引用 Entry ID。Entry 原文变化后，旧版本只用于历史检查，不能参与新的关系判断；权限关闭不会删除历史版本，但会阻止任何新运行读取或使用对应 Entry。避免：原地覆盖卡片导致历史 Context 无法还原、把旧卡片当当前原文、因权限关闭而破坏既有审计历史。

**ThoughtLineContext（思考线上下文）**：AI 根据一条 ThoughtLine 内允许使用的 Entry、EntryCard 和用户明确校准生成的、可重建且带版本的线级认识。它使用固定骨架记录“这条线在讨论什么”“主要关注面”“思考阶段”“目前已经说到哪里”“当前聚焦”“仍有张力或未解决之处”，并包含一个独立的 EntryCard 引用章节。引用章节通过 Entry ID 关联全局唯一的 EntryCard，不复制卡片；每篇属于该线且允许 AI 使用的 Entry 都必须在其中恰好出现一次，Context 维护模块不得按主观重要性提前删选。引用按 Entry 时间正序排列，时间相同时以稳定 Entry ID 排序；这是提供给 Context 维护和关系判断 LLM 的规范顺序，展示层可以另行排序。EntryCard 引用章节保持完整，六个宏观章节则持续压缩：相近旧阶段可以合并，近期或仍变化的阶段保留更多细节，已稳定认识压缩但保留 Entry ID 依据，未解决问题不能因年代久远自动消失。当前实验通过真实 Context 评测信息预算，不预设死板字数上限。宏观章节不保存具体 Entry 之间的关系、关系类型或核验状态。ThoughtLineContext 不是不可丢失的事实源；Entry 原文与用户明确校准才是持久依据。它为关系判断提供宏观上下文与导航，不是回响、关系真相或用户人生图谱。避免：`ContextThread`、把宏观章节追加成逐篇摘要串、把旧问题因压缩而删除、把旧 Context 自身当事实、隐藏看似不重要的合格 Entry、让普通模型输出在反复维护中固化为用户结论、用 Context 替代原文核验。

**ContextMaintenance（Context 维护）**：由 Entry 及其归线或权限变化、用户反馈与明确校准、Context Prompt 实质修改等信号触发的异步 Context 更新过程。Entry 必须先可靠保存，不能等待 AI；受影响 Context 随即变为 `stale`，短时间内连续编辑、改标签或归线可以合并为一次后台维护。日常变化优先增量更新受影响的 EntryCard 与 ThoughtLineContext；Prompt 实质修改、章节或版本不一致、累计 diff 异常及维护失败时，从 Entry 原文与用户明确校准等持久依据全量重建。“不太对”的补充说明只针对对应 Echo，维护时先读取该 Echo、其两至三篇来源原文、反馈说明、当前 ThoughtLineContext 与对应 EntryCard，再输出 `no_context_change`、`revise_context` 或 `full_rebuild_needed`；只有最后一种判断才扩大到整条 ThoughtLine 的全部有效材料。增量与重建都必须先形成完整新快照，成功后原子切换，不能向关系判断模块暴露半更新状态。维护失败不影响 Entry 保存，也不向普通用户制造错误或待办。未来可沉淀为包含不同场景维护规则的 Skill。避免：让保存等待模型、只追加新摘要而不修正旧认识、把单次回响反馈自动推广到整条线、每次局部反馈都重读整条线、把全量重建当作丢失用户校准、原地暴露半完成 Context。

**ContextInspectionView（Context 检查视图）**：仅供产品负责人在内部查看 EntryCard、ThoughtLineContext、版本与确定性 diff 的检查入口，用于评估 AI 是否正确理解整条思考线。负责人可以针对某段认识提出明确修正，但不能直接覆盖生成后的 Context；修正作为不可丢失的用户校准保存，再由 ContextMaintenance 生成新版本。Context 当前不作为普通用户可见的产品内容，也不因内部可查看而成为用户事实或正式回响。避免：直接编辑派生 Context、把内部 Context 当成正式用户体验、公开私人线级认识、因负责人可查看就宣称普通用户已经验证。

面向普通访客介绍产品时，术语采用中文优先、英文括注的形式：`思考线（ThoughtLine）`、`回响（Echo）`；工程文档、代码标识和数据契约继续使用既有英文领域名。

**ThoughtLineTag（思考线标签）**：ThoughtLine 在 Entry 上的特殊视觉入口。用户的操作看起来像打标签，数据上引用 ThoughtLine ID。避免：用名称字符串当主键。

**EchoRecord（回响记录）**：AI 在一条 ThoughtLine 内基于两至三篇 Entry 形成的持久观察，沿用现有来源、证据、来源摘要、初判、关系类型、可选问题、不确定性、生命周期、Prompt 版本和事件契约。Context、候选导航与 RelationSearchLoop 只替换回响形成前的内部路径，不改变最终 EchoRecord 数据结构、既有历史记录或证据优先的用户呈现。避免：把内部 Context 或候选中间态写进回响、为新关系路径迁移既有 EchoRecord、用户手工连线、EchoCard。

**CaseRecord（案例评测记录）**：对 EchoRecord 的结构化反馈、用户原话、评测判断和备注；引用对应 EchoRecord，不复制来源 Entry 私人原文，也不进入正式回响。结构化反馈与用户原话必须分别保存，不能用其中一项推断另一项。避免：正式回响、来源内容副本、把“写了回应”自动判为 good。

**EchoReply（回响回应）**：用户直接写在某条 EchoRecord 下方的一段回应。它可以很短或很长，可编辑、可删除；不是 Entry，不进入日记池，也不自动参与未来回响。未来可以由用户明确选择“转为日记”。避免：自动新建 Entry、把回应内容当作评测反馈、因用户回应而自动选择反馈。

**EvaluationSet（评测集）**：在同一场景定义下，供人工反复检查的一组输入案例。当前由真实 Entry、ThoughtLine 和对应候选共同构成。避免：只收集模型输出、把私人原文复制成另一份数据。

**ModelOutputSet（模型输出集）**：模型面对 EvaluationSet 后产生的 EchoRecord 集合，用于与人工反馈对照和归因。避免：参考答案、用户原话。

**ReferenceAnswer（参考答案）**：对某个输入预先认可的理想输出或关键判断。当前 good case 探索期尚未建立，应从真实 good case 中逐步推演，不能提前伪造。避免：把第一批模型输出直接当标准答案。

**EvaluationCriteria（评测标准）**：用于判断模型输出质量的明确维度。当前首先观察 ManifestationValue，并以 clarified、already_known、not_quite 区分新增显化、重复认知和偏差；完整归因标准待 good case 稳定后建立。避免：只看相关性、只看是否继续写。

**EvaluationWorkbench（评测工作台）**：本地开发评测的统一入口，只有 `Context` 与`回响`两个一级类别。Context 直接展示思考线认识、EntryCards、历史 Diff 与 Prompt，不增加人工评分；回响展示当前 C 方案运行、Agent 每步输入与结构化输出、候选及规则门禁、最终测试回响或沉默、既有人工评测和历史 B/C。避免：独立 Context 导航、把 B/C 当当前并列方案、用“展示模式”切换评测数据。

**EvaluationWorkbook（评测工作簿）**：EvaluationWorkbench 的回响人工评测区，用于浏览、比较和展开既有 EvaluationSet。包含“评测总表”“评测标准”和“Prompt 版本”三个 Sheet；分别承担跨 Case 比较、判定尺度和生成规则追溯。“Prompt 版本”必须同时标明 Prompt 所属模块与该模块版本，至少区分 EntryCard、ThoughtLineContext、ContextMaintenance 与 RelationJudgment，不能把四条版本线混成一个编号。避免：把全部完整卡片连续铺开、把评测标准或 Prompt 历史散落在备注中、只显示版本号而无法知道影响模块。

**EvaluationRunArtifact（评测运行产物）**：一次 Context + Relation 开发评测在 `local-context/evaluation` 中持久化的自足记录，保存源 generation、Prompt/模型/时间、Agent trace、候选顺序、规则门禁与最终测试回响卡片或沉默。测试回响卡片只由该产物渲染，不创建 EchoRecord，也不改变正式回响资格、历史或来源使用次数。避免：依赖 `local-data/echoes` 才能展示、把运行产物称为正式回响。

**EvaluationDimension（评测维度）**：EvaluationCriteria 中可独立判断的一条质量轴。首批维度为关系成立度、显化增量和重逢感，每项使用高／中／低尺度；Case 的 good / bad 仍由人最终判断，不由维度机械计算。关系成立度为低时原则上是 bad；关系成立但其余两项都低时通常也是 bad。避免：把用户是否回应当作质量维度、用单一总分遮蔽失败原因。

**ContextEvaluation（Context 评测）**：Context 与关系路径实验的第一层评测，检查合格 EntryCard 是否完整、summary 是否忠于原文、ThoughtLineContext 是否准确且不过度推断、是否保留必要阶段连续性、当前聚焦与未解决问题是否失真，以及是否足以帮助关系判断 Agent 找到候选。代码负责完整且恰好一次、顺序、权限、引用、版本、哈希和 diff 等确定性检查；产品负责人对真实 ThoughtLine 人工判断语义忠实、阶段连续、遗漏与越界，模型只能辅助提示风险，不能替代最终判断。第二层继续沿用最终 Echo 的关系成立度、显化增量和重逢感，并在相同 ThoughtLine、Entry 与历史状态下对照冻结的旧机制；“遗漏必要中间 Entry”先作为失败归因，不立即增加新的正式 EvaluationDimension。新路径只有在保持 Context 忠实、找回旧机制主要 good case、解决至少一类稳定失败且不明显增加错误关系、重复、三篇阅读负担与运行成本时，才达到“值得扩大实验”的门槛；这不等于已经可以替换旧机制。Context 写得流畅不等于实验成功，最终价值仍由回响结果证明。避免：让一个模型评价另一个模型后自证正确、只看最终回响而无法归因、把漂亮的线级总结当作产品价值、用不同输入比较新旧路径、用少量 Case 宣布旧机制已被淘汰。

**PromptVersion（Prompt 版本）**：一次可复现的候选生成规则，包含完整文本、状态、变更摘要、评测依据和继承关系。输入数量、时间跨度和 ThoughtLine 不同不触发升级；规则实质修改才创建新版本，旧 Case 保留原版本。`echo-eval-v0.1` 冻结首批规则，`v0.2` 仅将关系类型中文化并继承其评测，`v0.3` 负责主思考线内搜索与生成决策且已完成一条新 good case 的首轮验证；当前 `v0.4` 增加来源复用负面信号，状态为待评测。避免：覆盖旧规则、把输入变化冒充版本变化、把继承结果说成独立评测。

**ContextVersionSet（Context 版本集）**：系统独立记录四份 Prompt：`EntryCardPromptVersion`、`ThoughtLineContextPromptVersion`、`ContextMaintenancePromptVersion` 与 `RelationJudgmentPromptVersion`。EntryCard Prompt 实质变化时重新生成受影响卡片，并由卡片变化触发其所属 ThoughtLineContext 更新；ThoughtLineContext Prompt 实质变化时复用有效 EntryCard，只重建线级 Context；ContextMaintenance Prompt 决定不同信号下是否增量修订、保持不变或全量重建；RelationJudgment Prompt 在同一个 Agent loop 内同时定义全局候选导航与读取原文及历史状态后的输出判断。只有改变输入理解、输出结构或维护判断的修改才升级，纯文案、注释和不影响语义的格式变化不升级。避免：用一个版本号混合四类变化、把导航与关系判断拆成两份 Prompt、修改线级 Prompt 时无意义地重建所有卡片、覆盖旧版本导致历史不可解释。

**PromptChangeApproval（Prompt 变更确认）**：四份 Prompt 的任何实质修改在应用前都必须向产品负责人展示完整 diff、修改理由、针对的真实失败、预计影响层、旧 Case 与新 Case 的验证方法及失败后的恢复方式；只有负责人明确确认后才创建新的模块 PromptVersion。ContextMaintenance Skill 可以提出修改建议，但不能自行覆盖当前 Prompt。避免：根据单个 bad case 自动改 Prompt、只展示摘要不展示实际 diff、用格式变化冒充语义新版本。

**ContextSnapshot（Context 快照）**：一次 ContextMaintenance 成功后原子发布的不可变完整版本，保存完整 ThoughtLineContext、所引用 EntryCard 的版本与哈希、ContextVersionSet、触发信号、维护方式和时间；同时保存由代码确定性计算的 diff，列明 EntryCard 章节的新增、移除与变化、六个宏观章节的前后变化及 Prompt 版本变化。LLM 可以另行解释变化，但不能生成或改写事实 diff。历史快照只用于检查、追溯和恢复，不作为下一版 Context 的事实来源。避免：只保存无法独立恢复的差异链、让 LLM 描述冒充确定性 diff、从旧快照反推用户事实。

**ContextAvailability（Context 可用状态）**：ThoughtLineContext 是否可参与新的 RelationSearchLoop。`ready` 表示当前快照与有效 Entry、EntryCard、权限和版本一致；任一来源新增、修改、移线或权限变化后，受影响 ThoughtLine 立即变为 `stale`，直到 ContextMaintenance 成功原子发布新快照才恢复 `ready`。维护失败时继续保持 `stale`，旧快照仍可供内部检查但不能回退参与关系判断；其他未受影响的 `ready` Context 可以继续运行。该延迟符合 MisalignedGrowth：新思考写下与回响出现不必同步。避免：用过期 Context 追求实时输出、因一条线维护失败而阻断全部思考线、删除旧快照掩盖失败。

**RelationRunTrigger（关系运行触发）**：启动 RelationSearchLoop 的独立信号，例如低频调度、用户主动动作或评测任务。ContextMaintenance 把 ThoughtLineContext 恢复为 `ready` 只表示它可以参与未来关系判断，不自动触发运行，也不提高该线的候选优先级；每次运行只读取当时所有 `ready` 且允许 AI 使用的 Context。避免：刚写完或刚维护完就实时制造回响、把 Context 更新与回响出现绑定、因某条线刚更新而强制优先。

**SilentDecision（保持沉默）**：Agent 在一次主 ThoughtLine 搜索中没有候选同时通过关系、证据、显化和解释风险门槛时作出的内部决定。正式体验不呈现失败内容，评测阶段可查看放弃阶段与原因。避免：为了每次都有输出而勉强连接、把沉默保存成正式 EchoRecord。

**SourceReuseSignal（来源复用信号）**：规则引擎为 CandidateHistoryBundle 确定性计算的来源使用事实，覆盖仍有效的正式候选与 EvaluationOnly，不计 Invalidated 和 LegacyEvaluation。它告诉关系判断 LLM 每篇来源曾被使用多少次，但不自动判定本次候选必须放弃；LLM 仍需结合新增变化、来源是否不可替代以及是否复述旧观察作出语义判断。允许参与 AI 不等于值得反复呈现。避免：把来源次数直接等同于重复、通过更换搭档掩盖同一旧观察、让 LLM 自行编造计数。

**MinimalSufficientSourceSet（最小充分来源集）**：一次关系判断与回响只使用两篇或三篇 Entry。两篇是默认形态；只有移除中间 Entry 会造成思想变化断层或使解释失真时才使用三篇，绝不超过三篇。“约八成为两篇”是产品预期而非机械配额。避免：固定只选两篇、为了显得完整而加入可替代来源、把整条 ThoughtLine 塞进一次回响。

**RelationSearchLoop（关系搜索循环）**：一个关系判断 Agent 使用同一份 RelationJudgment Prompt 完成导航与输出判断；Agent Harness 以 `select_candidates`、`check_candidate_1..3`、`complete` 等确定性状态保存当前步骤并控制工具调用与停止，LLM 只执行当前状态允许的语义判断。Agent 先读取全部允许 AI 使用的 ThoughtLineContext，从全局一次生成零至三个按优先级排列的候选组合，再按顺序运行最多三次判断。没有明显候选时可以直接保持沉默；只有一个强候选时不为凑数补足。每个组合包含一个 `thoughtLineId`、两至三个按 Entry 时间正序排列的 `entryId`，时间相同以稳定 Entry ID 排序，并附带结构化导航依据；同一组合内的 Entry 必须共同属于指定 ThoughtLine。LLM 选择来源但不能改变时间顺序，最终回响证据沿用该顺序，关系方向也据此解释。每次判断先由 RelationRuleEngine 检查权限、同线归属、来源数量、ID 与版本一致性；硬门禁失败时不读取原文、不补充新候选，直接尝试已有的下一组合。通过后才读取该组合原文，再获取组合是否出现过、以前以何种形式出现、用户给过什么反馈及来源使用情况等 CandidateHistoryBundle；同一 Agent 同时继续持有导航阶段使用的同一份候选所属线 ContextSnapshot 投影，其中包含六个宏观章节和该线全部有效 EntryCard 概要，但不包含非候选原文。该投影只用于检查候选完整性、不可省略的中间 Entry 与解释风险，不能成为用户事实、关系证据或 Echo evidence；若发现必要来源缺失，只能放弃当前候选并尝试已有下一组合，不能自行扩写候选。同一 Agent 随后决定直接输出或放弃。只有决定输出后才形成结构化回响，放弃的候选不生成回响结构，也不持久化。输出后立即停止，全部候选均未输出则保持沉默。全局读取只分配当前注意力，不授权跨线组合。避免：让 LLM 伪造或跳过运行阶段、把导航和关系判断拆成两份 Prompt 或两个语义模型、强制凑足候选、让模型重排来源制造叙事、把 Context 当作关系证据、读取非候选原文、先读原文再检查权限、在读取历史状态前先形成结构化回响、把每条 ThoughtLine 分别启动三轮搜索、输出后继续比较候选、把候选持久化为关系事实、为了跑满次数而勉强建立关系。

**CandidateHistoryBundle（候选历史包）**：系统在关系判断 LLM 读取一组候选原文后返回的确定性历史状态。它不仅包含来源完全相同的既有回响，还包含来源有重叠的回响、过去的关系与表达、对应用户反馈和明确校准，以及每篇来源的累计使用情况。历史包只提供事实，不替 LLM 判断本次候选是重复、补全旧断层还是产生了新的看见。它是单次运行输入，不因查询而创建新的持久对象。避免：只按完全相同的 Entry ID 集合查重、把增加一篇来源自动视为新关系、让规则系统代替 LLM 判断语义重复。

**RelationRuleEngine（关系规则引擎）**：关系判断流程中的确定性边界与状态计算模块。它直接拒绝权限关闭、跨出指定 ThoughtLine、来源数量或 ID 无效、数据不存在以及 Context 或历史状态过期等不可解释的候选；对语义相关的历史只构造 CandidateHistoryBundle 交给 LLM，不替 LLM 判断重复、显化价值或是否输出。避免：把权限交给 LLM 自由判断、用规则次数代替语义判断、在规则层再次生成或评价回响。

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

**EvaluationOnly（仅评测候选）**：旧开发评测曾写入 EchoRecord 的兼容生命周期，只能进入评测读取，永不成为正式候选。新 Context + Relation 评测改用 EvaluationRunArtifact，不再创建此类 EchoRecord。避免：继续把它作为新评测持久化格式、迁移进稳定 `local-data`。

**OptionalEchoFeedback（可选反馈）**：用户对 AI 观察质量的可选判断：`clarified` 看清了一点、`already_known` 我已经知道了、`not_quite` 不太对。选择“不太对”后可以额外填写一段只针对当前 Echo 的可选说明，用于指出这次理解哪里偏了；该说明不进入日记池、不替代 EchoReply，也不自动成为整条 ThoughtLine 的用户校准，只触发 ContextMaintenance 判断是否需要修改 ThoughtLineContext。它与 EchoReply 相互独立：用户可以只反馈、只回应、两者都做或两者都不做；任何一方都不能自动推断另一方。旧反馈值只兼容读取。避免：把“不太对”自动解释为某一种错误、把局部说明直接推广成线级事实、因用户填写说明而自动创建 Entry。

**EchoDot（回响点）**：已出现过的回响在线上留下的可点击状态标记；它是 EchoRecord 的呈现，不是新领域对象。

## 边界术语

**UnlinedEntry（未归线日记）**：没有 ThoughtLine 的 Entry。可正常保存，只在未来用户授权的低频复盘中参与。

**LowFrequencyReview（低频复盘）**：未来由用户主动启动的一周/月级全库或跨线复盘，不属于当前正式自动回响。

**KnowledgeBase（知识库）**：保存理论知识、资料与知识图谱的外部工具职责，不属于回页。

**PortfolioMode（展示模式）**：只使用脱敏固定数据、不读取或写入私人 Entry 的公开演示环境。访客操作只影响当前浏览器会话；刷新或执行“恢复演示数据”后回到固定初始状态，不建立账户、云存储或访客持久化数据。避免：复用私人模式的数据接口、把本地真实 Entry 打包进公开产物、把展示操作保存成正式数据。

**AnonymousPortfolioVisit（作品集匿名访问）**：一台非管理员设备访问公开 `/portfolio` 页面所形成的匿名统计单位。同一设备在 30 分钟内重复打开或刷新只计为一次访问；不记录姓名、公司或账户身份。避免：把请求次数直接称为用户数、统计 `/portfolio/demo`、把管理员检查计入访问。

**ConfirmedPortfolioVisit（作品集成功访问）**：匿名设备打开 `/portfolio` 后，页面在浏览器内完成渲染并主动上报成功信号的访问。避免：仅凭服务器返回页面就认定访客已成功看到内容。

**UnconfirmedPortfolioVisit（作品集未确认访问）**：服务器收到 `/portfolio` 页面请求，但在统计窗口内没有收到该设备的页面完成上报。它不自动等于失败。避免：把未确认访问直接标记为加载失败。

**PortfolioAdminDevice（作品集管理员设备）**：经专属授权标记、可读取私有访问看板且其 `/portfolio` 访问不进入访客统计的设备。避免：公开看板数据、仅依靠可猜测路径保护看板、把管理员刷新计入匿名访问。

**LocalPortfolioVisitDashboard（本地作品集访问看板）**：只在负责人本地电脑打开的私有统计界面，通过管理员授权只读获取 `/portfolio` 的匿名访问汇总。它不是作品集网站的一条公开或私有展示路由；线上作品集只承载不可见的访问上报与受保护统计接口。避免：把看板页面部署进作品集、让普通访客获得统计入口、把本地看板误称为作品集功能。

**PortfolioVisitSession（作品集访问会话）**：同一匿名浏览器设备在 30 分钟窗口内对 `/portfolio` 的一次或多次打开。页面请求先形成未确认会话，浏览器完成渲染后再转为成功访问；`/portfolio/demo` 不参与统计。避免：把刷新次数当作独立访客、把未确认直接称为失败、从历史日志倒推上线前数据。

**MinimumRedaction（最小脱敏）**：PortfolioMode 公开数据的处理原则。以用户批准的评测来源为边界，保留原文语气、上下文、真实日期、不确定性和与 Case 直接相关的自我暴露；只自然替换可识别的真实姓名、公司、面试平台、具体团队或业务列表，并删除与 Case 无关、会分散观看者注意力的私人细节。Entry、EchoRecord、CaseRecord 和 EchoReply 在进入公开数据前都必须逐项经用户审核。避免：把原文润色成作品集文案、为显得完整而补写事实、仅凭“没有真实姓名”判断已经安全、直接打包私人数据文件。
