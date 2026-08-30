import { readAllThoughtLineContextSnapshots } from "./thought-line-context-store.mjs";

function validateSelectedCandidates(output) {
  if (!output || !Array.isArray(output.candidates)) throw new Error("Relation Agent 输出缺少 candidates");
  if (output.candidates.length > 3) throw new Error("Relation Agent 最多返回 3 个候选组合");
  const combinations = new Set();
  return output.candidates.map((candidate) => {
    const thoughtLineId = typeof candidate?.thoughtLineId === "string" ? candidate.thoughtLineId : "";
    const entryIds = Array.isArray(candidate?.entryIds) ? candidate.entryIds.map(String) : [];
    const navigationBasis = normalizeNavigationBasis(candidate?.navigationBasis);
    const combinationKey = `${thoughtLineId}\u0000${[...entryIds].sort().join("\u0000")}`;
    const duplicate = combinations.has(combinationKey);
    combinations.add(combinationKey);
    return { thoughtLineId, entryIds, navigationBasis, duplicate };
  });
}

function candidatePassesHardGate(candidate, readyContexts, sourceIndex) {
  if (
    !candidate.thoughtLineId ||
    candidate.entryIds.length < 2 ||
    candidate.entryIds.length > 3 ||
    new Set(candidate.entryIds).size !== candidate.entryIds.length ||
    !navigationBasisPasses(candidate.navigationBasis) ||
    candidate.duplicate
  ) return false;
  const context = readyContexts.find((item) => item.thoughtLine.id === candidate.thoughtLineId);
  if (!context) return false;
  const line = sourceIndex.thoughtLines.find((item) => item.id === candidate.thoughtLineId);
  if (!line || line.status !== "active" || !line.allowEcho) return false;
  const entriesById = new Map(sourceIndex.entries.map((entry) => [String(entry.id), entry]));
  const referencesById = new Map(context.thoughtLineContext.entryCardReferences.map((reference) => [String(reference.entryId), reference]));
  const cardsById = new Map(context.entryCards.map((card) => [String(card.entryId), card]));
  const entries = candidate.entryIds.map((entryId) => entriesById.get(entryId));
  if (entries.some((entry) => !entry)) return false;
  if (entries.some((entry) => !entry.aiLink || !entry.thoughtLineIds?.includes(candidate.thoughtLineId))) return false;
  if (candidate.entryIds.some((entryId) => {
    const entry = entriesById.get(entryId);
    const reference = referencesById.get(entryId);
    const card = cardsById.get(entryId);
    return !reference || !card || card.cardVersion !== reference.cardVersion || card.sourceFingerprint !== entry.sourceFingerprint;
  })) return false;
  const chronologicalIds = [...entries]
    .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) || String(left.id).localeCompare(String(right.id)))
    .map((entry) => String(entry.id));
  return chronologicalIds.every((entryId, index) => entryId === candidate.entryIds[index]);
}

function normalizeNavigationBasis(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = ["attentionSignal", "whyTheseEntries", "minimalityBasis", "checkFocus"];
  if (fields.some((field) => typeof value[field] !== "string" || !value[field].trim())) return null;
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function navigationBasisPasses(value) {
  return typeof value === "string" ? Boolean(value.trim()) : Boolean(normalizeNavigationBasis(value));
}

const COUNTED_LIFECYCLES = new Set([undefined, "candidate", "evaluation_only"]);
const RELATION_TYPES = new Set(["continuation", "revision", "branch", "conflict", "unresolved_question", "other"]);

function sourceSetKey(entryIds) {
  return [...new Set(entryIds.map(String))].sort((left, right) => left.localeCompare(right)).join("\u0000");
}

function buildCandidateHistoryBundle(historyIndex, candidate) {
  if (!Array.isArray(historyIndex?.echoes) || !Array.isArray(historyIndex?.caseRecords)) {
    throw new Error("CandidateHistory 历史索引无效");
  }
  const candidateIds = new Set(candidate.entryIds);
  const sameLineEchoes = historyIndex.echoes
    .filter((echo) => echo.thoughtLineId === candidate.thoughtLineId)
    .filter((echo) => echo.sourceEntryIds?.some((entryId) => candidateIds.has(String(entryId))))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const exactEchoes = sameLineEchoes.filter((echo) => sourceSetKey(echo.sourceEntryIds) === sourceSetKey(candidate.entryIds));
  const exactIds = new Set(exactEchoes.map((echo) => echo.id));
  const overlappingEchoes = sameLineEchoes.filter((echo) => !exactIds.has(echo.id));
  const relevantEchoIds = new Set(sameLineEchoes.map((echo) => echo.id));
  const feedback = historyIndex.caseRecords
    .filter((record) => relevantEchoIds.has(record.echoRecordId))
    .sort((left, right) => String(left.echoRecordId).localeCompare(String(right.echoRecordId)));
  const sourceUsageCounts = new Map(candidate.entryIds.map((entryId) => [entryId, 0]));
  for (const echo of historyIndex.echoes) {
    if (!COUNTED_LIFECYCLES.has(echo.lifecycle)) continue;
    for (const entryId of new Set((echo.sourceEntryIds ?? []).map(String))) {
      if (sourceUsageCounts.has(entryId)) sourceUsageCounts.set(entryId, sourceUsageCounts.get(entryId) + 1);
    }
  }
  return {
    exactEchoes,
    overlappingEchoes,
    feedback,
    sourceUsage: candidate.entryIds.map((entryId) => ({ entryId, sourceUsageCount: sourceUsageCounts.get(entryId) })),
  };
}

function normalizeOriginals(originals, candidate) {
  if (!Array.isArray(originals)) throw new Error("来源 Adapter 未返回原文列表");
  const originalsById = new Map(originals.map((entry) => [String(entry?.id), entry]));
  if (originalsById.size !== candidate.entryIds.length || candidate.entryIds.some((entryId) => !originalsById.has(entryId))) {
    throw new Error("来源 Adapter 未完整返回候选原文");
  }
  return candidate.entryIds.map((entryId) => originalsById.get(entryId));
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
  return value;
}

function validateEchoDraft(output, candidate, originals, promptVersion) {
  if (output?.decision !== "output" || !output.echo || typeof output.echo !== "object") {
    throw new Error("Relation Agent 判断必须返回 output 或 next_candidate");
  }
  const echo = output.echo;
  if (echo.mode !== "relational" || echo.thoughtLineId !== candidate.thoughtLineId) throw new Error("结构化回响归属无效");
  if (!RELATION_TYPES.has(echo.relationType)) throw new Error("结构化回响关系类型无效");
  if (
    !Array.isArray(echo.sourceEntryIds) ||
    echo.sourceEntryIds.some((entryId) => !Number.isSafeInteger(entryId) || entryId <= 0) ||
    echo.sourceEntryIds.map(String).some((entryId, index) => entryId !== candidate.entryIds[index])
  ) {
    throw new Error("结构化回响来源必须保持候选顺序");
  }
  if (echo.triggerEntryId !== undefined && (!Number.isSafeInteger(echo.triggerEntryId) || !echo.sourceEntryIds.includes(echo.triggerEntryId))) {
    throw new Error("结构化回响 triggerEntryId 无效");
  }
  const originalsById = new Map(originals.map((entry) => [String(entry.id), entry]));
  if (!Array.isArray(echo.evidence) || !echo.evidence.length) throw new Error("结构化回响缺少证据");
  for (const evidence of echo.evidence) {
    const original = originalsById.get(String(evidence?.entryId));
    if (!Number.isSafeInteger(evidence?.entryId) || !original || typeof original.content !== "string" || typeof evidence.quote !== "string" || !original.content.includes(evidence.quote)) {
      throw new Error(`结构化回响证据无法逐字核验：${evidence?.entryId}`);
    }
  }
  if (!Array.isArray(echo.sourceSummaries) || echo.sourceSummaries.length !== candidate.entryIds.length) {
    throw new Error("结构化回响必须包含逐篇来源摘要");
  }
  const summaryIds = new Set(echo.sourceSummaries.map((summary) => String(summary?.entryId)));
  if (candidate.entryIds.some((entryId) => !summaryIds.has(entryId))) throw new Error("结构化回响来源摘要不完整");
  for (const summary of echo.sourceSummaries) {
    if (!Number.isSafeInteger(summary?.entryId)) throw new Error("结构化回响来源摘要 ID 无效");
    requireText(summary.text, "来源摘要");
  }
  for (const field of ["reason", "manifestationGain", "explanationRisk", "uncertainty"]) requireText(echo[field], field);
  if (echo.question !== undefined) requireText(echo.question, "question");
  return {
    decision: "output",
    mode: "relational",
    thoughtLineId: echo.thoughtLineId,
    relationType: echo.relationType,
    sourceEntryIds: echo.sourceEntryIds,
    ...(echo.triggerEntryId !== undefined ? { triggerEntryId: echo.triggerEntryId } : {}),
    evidence: echo.evidence,
    sourceSummaries: echo.sourceSummaries,
    reason: echo.reason,
    ...(echo.question !== undefined ? { question: echo.question } : {}),
    manifestationGain: echo.manifestationGain,
    explanationRisk: echo.explanationRisk,
    uncertainty: echo.uncertainty,
    ruleVersion: promptVersion,
  };
}

export function createRelationModule({
  contextRoot,
  evaluationRoot,
  sourceAdapter,
  historyAdapter,
  agentAdapter,
  prompt,
  promptVersion,
}) {
  if (!contextRoot || !evaluationRoot) throw new Error("RelationModule 缺少 Context 数据目录");
  if (
    typeof sourceAdapter?.readIndex !== "function" ||
    typeof sourceAdapter?.readOriginalEntries !== "function" ||
    typeof historyAdapter?.readStatus !== "function" ||
    typeof historyAdapter?.readIndex !== "function"
  ) {
    throw new Error("RelationModule 缺少来源或历史 Adapter");
  }
  if (typeof agentAdapter?.selectCandidates !== "function" || typeof agentAdapter?.judgeCandidate !== "function") {
    throw new Error("RelationModule 缺少 Fake Agent Adapter");
  }
  if (!prompt) throw new Error("RelationModule 缺少 RelationJudgment Prompt");
  if (!promptVersion) throw new Error("RelationModule 缺少 RelationJudgment Prompt 版本");

  return Object.freeze({
    async run(trigger) {
      const [contexts, sourceIndex] = await Promise.all([
        readAllThoughtLineContextSnapshots({ contextRoot, evaluationRoot }),
        sourceAdapter.readIndex(),
      ]);
      if (!Array.isArray(sourceIndex?.thoughtLines) || !Array.isArray(sourceIndex?.entries)) {
        throw new Error("RelationModule 没有可读取的来源索引");
      }
      const linesById = new Map(sourceIndex.thoughtLines.map((line) => [line.id, line]));
      const readyContexts = contexts.filter((context) => {
        const line = linesById.get(context.thoughtLine.id);
        return context.status === "ready" && line?.status === "active" && line.allowEcho;
      });
      const navigationContexts = readyContexts.map((context) => ({
        status: context.status,
        sourceGenerationId: context.sourceGenerationId,
        thoughtLine: context.thoughtLine,
        thoughtLineContext: context.thoughtLineContext,
        entryCards: context.entryCards,
        promptVersions: context.promptVersions,
      }));
      const candidates = validateSelectedCandidates(await agentAdapter.selectCandidates({
        step: "select_candidates",
        trigger,
        contexts: navigationContexts,
        prompt,
        promptVersion,
      }));
      if (!candidates.length) return { decision: "silent" };
      for (const [index, candidate] of candidates.entries()) {
        if (!candidatePassesHardGate(candidate, readyContexts, sourceIndex)) continue;
        const checkedCandidate = {
          thoughtLineId: candidate.thoughtLineId,
          entryIds: candidate.entryIds,
          navigationBasis: candidate.navigationBasis,
        };
        const historyStatus = await historyAdapter.readStatus({
          thoughtLineId: checkedCandidate.thoughtLineId,
          entryIds: checkedCandidate.entryIds,
        });
        if (historyStatus?.status !== "ready") continue;
        const originals = normalizeOriginals(await sourceAdapter.readOriginalEntries({
          thoughtLineId: checkedCandidate.thoughtLineId,
          entryIds: checkedCandidate.entryIds,
        }), checkedCandidate);
        const historyBundle = buildCandidateHistoryBundle(await historyAdapter.readIndex(), checkedCandidate);
        const judgment = await agentAdapter.judgeCandidate({
          step: `check_candidate_${index + 1}`,
          trigger,
          candidate: checkedCandidate,
          originals,
          historyBundle,
          prompt,
          promptVersion,
        });
        if (judgment?.decision === "next_candidate") continue;
        return validateEchoDraft(judgment, checkedCandidate, originals, promptVersion);
      }
      return { decision: "silent" };
    },
  });
}
