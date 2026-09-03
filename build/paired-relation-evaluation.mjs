import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { readEchoRecords } from "./echo-record-store.mjs";
import { entrySourceFingerprint } from "./context-maintenance.mjs";
import { readLocalData } from "./local-data-store.mjs";
import { createRelationModule } from "./relation-module.mjs";
import { readAllThoughtLineContextSnapshots } from "./thought-line-context-store.mjs";

const NAVIGATION_FIELDS = ["attentionSignal", "whyTheseEntries", "minimalityBasis", "checkFocus"];
const CONTEXT_EFFECTS = {
  B: new Set(["not_provided"]),
  C: new Set(["no_material_effect", "changed_interpretation", "revealed_gap"]),
};
const COMPLETENESS = {
  B: new Set(["sufficient", "uncertain"]),
  C: new Set(["sufficient", "missing_indispensable_entry", "uncertain"]),
};

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
  return value;
}

function validateNavigationSelection(output) {
  if (!output || !Array.isArray(output.candidates) || output.candidates.length > 3) {
    throw new Error("CandidateSelection 必须返回零至三个候选");
  }
  return {
    candidates: output.candidates.map((candidate, index) => {
      const navigationBasis = candidate?.navigationBasis;
      if (!navigationBasis || typeof navigationBasis !== "object" || Array.isArray(navigationBasis)) {
        throw new Error(`candidates[${index}].navigationBasis 必须是结构化对象`);
      }
      for (const field of NAVIGATION_FIELDS) requireText(navigationBasis[field], `navigationBasis.${field}`);
      return {
        thoughtLineId: requireText(candidate.thoughtLineId, "candidate.thoughtLineId"),
        entryIds: Array.isArray(candidate.entryIds) ? candidate.entryIds.map(String) : [],
        navigationBasis: Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, navigationBasis[field]])),
      };
    }),
  };
}

function selectedLineContext(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    sourceGenerationId: snapshot.sourceGenerationId,
    thoughtLine: snapshot.thoughtLine,
    macroSections: snapshot.thoughtLineContext.macroSections,
    entryCards: snapshot.entryCards.map((card) => ({
      entryId: String(card.entryId),
      occurredAt: card.occurredAt ?? null,
      summary: card.summary,
      uncertainty: card.uncertainty ?? [],
    })),
  };
}

function validateAssessment(output, variant, candidate, lineContext) {
  const assessment = output?.assessment;
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) {
    throw new Error(`${variant} 判断缺少 assessment`);
  }
  requireText(assessment.decisionReason, `${variant}.assessment.decisionReason`);
  if (!COMPLETENESS[variant].has(assessment.candidateCompleteness)) {
    throw new Error(`${variant}.assessment.candidateCompleteness 无效`);
  }
  if (!CONTEXT_EFFECTS[variant].has(assessment.contextEffect)) {
    throw new Error(`${variant}.assessment.contextEffect 无效`);
  }
  if (!Array.isArray(assessment.indispensableMissingEntryIds)) {
    throw new Error(`${variant}.assessment.indispensableMissingEntryIds 必须是数组`);
  }
  const missingIds = assessment.indispensableMissingEntryIds.map(String);
  if (new Set(missingIds).size !== missingIds.length) throw new Error(`${variant} 遗漏 Entry ID 不能重复`);
  if (variant === "B" && missingIds.length) throw new Error("B 不得推测未提供的必要 Entry");
  if (variant === "C") {
    const allowed = new Set(lineContext.entryCards.map((card) => card.entryId));
    const candidateIds = new Set(candidate.entryIds);
    if (missingIds.some((entryId) => !allowed.has(entryId) || candidateIds.has(entryId))) {
      throw new Error("C 的遗漏 Entry 必须来自选中线且不属于当前候选");
    }
  }
  if (output.decision === "output" && (assessment.candidateCompleteness !== "sufficient" || missingIds.length)) {
    throw new Error(`${variant} 只有来源充分且没有遗漏时才能 output`);
  }
  if (variant === "C" && output.decision === "output" && assessment.contextEffect === "revealed_gap") {
    throw new Error("C 发现来源缺口时不得 output");
  }
  if (output.decision === "next_candidate" && output.echo !== null && output.echo !== undefined) {
    throw new Error(`${variant} 放弃候选时不得生成 echo`);
  }
  return { ...assessment, indispensableMissingEntryIds: missingIds };
}

function frozenSourceIndex(source) {
  return {
    generationId: source.generationId,
    thoughtLines: structuredClone(source.data.thoughtLines ?? []),
    entries: (source.data.entries ?? []).map((entry) => ({
      ...structuredClone(entry),
      sourceFingerprint: entrySourceFingerprint(entry),
    })),
  };
}

function frozenHistoryIdentity(history) {
  return {
    sha256: createHash("sha256").update(JSON.stringify(history)).digest("hex"),
    echoCount: history.echoes.length,
    caseRecordCount: history.caseRecords.length,
  };
}

function sourceAdapters(sourceIndex) {
  const originalsById = new Map(sourceIndex.entries.map((entry) => [String(entry.id), entry]));
  return {
    readIndex: async () => structuredClone(sourceIndex),
    readOriginalEntries: async ({ thoughtLineId, entryIds }) => entryIds
      .map(String)
      .map((entryId) => originalsById.get(entryId))
      .filter((entry) => entry?.thoughtLineIds?.includes(thoughtLineId))
      .map((entry) => structuredClone(entry)),
  };
}

async function assertSnapshotIdentity(contextRoot, evaluationRoot, expected) {
  const current = await readAllThoughtLineContextSnapshots({ contextRoot, evaluationRoot });
  const currentById = new Map(current.map((snapshot) => [snapshot.thoughtLine.id, snapshot]));
  for (const snapshot of expected) {
    const actual = currentById.get(snapshot.thoughtLine.id);
    if (!actual || actual.status !== "ready" || actual.snapshotId !== snapshot.snapshotId) {
      throw new Error(`ContextSnapshot 在配对分支之间发生变化：${snapshot.thoughtLine.id}`);
    }
  }
}

async function runVariant({
  variant,
  contexts,
  candidates,
  contextRoot,
  evaluationRoot,
  sourceAdapter,
  historyAdapter,
  agentAdapter,
  prompt,
  promptVersion,
  trigger,
}) {
  const attempts = [];
  const contextByLine = new Map(contexts.map((snapshot) => [snapshot.thoughtLine.id, selectedLineContext(snapshot)]));
  const judge = variant === "B" ? agentAdapter.judgeRelationCandidateB : agentAdapter.judgeRelationCandidateC;
  if (typeof judge !== "function") throw new Error(`${variant} 缺少真实判断 Adapter`);
  const relationModule = createRelationModule({
    contextRoot,
    evaluationRoot,
    sourceAdapter,
    historyAdapter,
    prompt,
    promptVersion,
    agentAdapter: {
      selectCandidates: async () => structuredClone(candidates),
      judgeCandidate: async (input) => {
        const { selectedLineContext: canonicalSelectedLineContext, ...candidateInput } = input;
        const lineContext = contextByLine.get(input.candidate.thoughtLineId);
        if (!lineContext) throw new Error(`${variant} 找不到候选所属 Context`);
        const output = await judge({
          ...candidateInput,
          ...(variant === "C"
            ? { selectedLineContext: structuredClone(canonicalSelectedLineContext ?? lineContext) }
            : {}),
        });
        const assessment = validateAssessment(output, variant, input.candidate, lineContext);
        attempts.push({
          step: input.step,
          candidate: structuredClone(input.candidate),
          decision: output.decision,
          assessment,
        });
        // The canonical RelationModule now enforces the C assessment contract.
        // Keep B's historical output in `attempts`, but adapt its unavailable
        // Context effect at this compatibility seam before returning to core.
        return variant === "B"
          ? { ...output, assessment: { ...output.assessment, contextEffect: "no_material_effect" } }
          : output;
      },
    },
  });
  const result = await relationModule.run(trigger);
  return result.decision === "output"
    ? { decision: "accepted", attempts, draft: result }
    : { decision: "silent", attempts, draft: null };
}

async function publishPairedRun(evaluationRoot, record) {
  const runPath = path.join(evaluationRoot, "paired-runs", record.runId, "result.json");
  await writeJsonAtomic(runPath, record);
  const indexPath = path.join(evaluationRoot, "paired-runs", "index.json");
  const previous = await readOptionalJson(indexPath);
  const previousRuns = previous?.format === "huiye-paired-relation-evaluation-index" ? previous.runs ?? [] : [];
  await writeJsonAtomic(indexPath, {
    format: "huiye-paired-relation-evaluation-index",
    version: 1,
    latestRunId: record.runId,
    runs: [
      ...previousRuns.filter((run) => run.runId !== record.runId),
      { runId: record.runId, thoughtLineId: record.thoughtLineId, evaluatedAt: record.evaluatedAt, B: record.variants.B.decision, C: record.variants.C.decision },
    ],
  });
  return runPath;
}

export async function readLatestPairedRelationEvaluation(evaluationRoot) {
  const index = await readOptionalJson(path.join(evaluationRoot, "paired-runs", "index.json"));
  if (!index?.latestRunId) return null;
  return readOptionalJson(path.join(evaluationRoot, "paired-runs", String(index.latestRunId), "result.json"));
}

export async function runPairedRelationEvaluation({
  sourceRoot,
  contextRoot,
  evaluationRoot,
  thoughtLineId,
  prompts,
  promptVersions,
  agentAdapter,
  model,
  reasoningEffort = "high",
  now = () => new Date(),
  idFactory = () => `paired-relation-${Date.now()}-${randomUUID()}`,
}) {
  if (!sourceRoot || !contextRoot || !evaluationRoot || !thoughtLineId) throw new Error("配对评测缺少数据目录或 ThoughtLine");
  if (!model) throw new Error("配对评测缺少模型");
  for (const key of ["candidateSelection", "judgmentB", "judgmentC"]) {
    requireText(prompts?.[key], `prompts.${key}`);
    requireText(promptVersions?.[key], `promptVersions.${key}`);
  }
  if (typeof agentAdapter?.selectRelationCandidates !== "function") throw new Error("配对评测缺少 CandidateSelection Adapter");

  const [source, allContexts, echoes] = await Promise.all([
    readLocalData(sourceRoot),
    readAllThoughtLineContextSnapshots({ contextRoot, evaluationRoot }),
    readEchoRecords(sourceRoot),
  ]);
  if (!source?.generationId || !source.data) throw new Error("配对评测没有可读取的开发 generation");
  const contexts = allContexts.filter((snapshot) => snapshot.thoughtLine.id === thoughtLineId && snapshot.status === "ready");
  if (contexts.length !== 1) throw new Error(`配对评测需要一份 ready Context：${thoughtLineId}`);
  if (contexts[0].sourceGenerationId !== source.generationId) throw new Error("ContextSnapshot 与当前开发 generation 不一致");
  const sourceIndex = frozenSourceIndex(source);
  const navigationContexts = contexts.map((snapshot) => ({
    status: snapshot.status,
    sourceGenerationId: snapshot.sourceGenerationId,
    snapshotId: snapshot.snapshotId,
    thoughtLine: snapshot.thoughtLine,
    thoughtLineContext: snapshot.thoughtLineContext,
    entryCards: snapshot.entryCards,
    promptVersions: snapshot.promptVersions,
  }));
  const selection = validateNavigationSelection(await agentAdapter.selectRelationCandidates({
    step: "select_candidates",
    trigger: { type: "paired_evaluation", thoughtLineId },
    contexts: structuredClone(navigationContexts),
    prompt: prompts.candidateSelection,
    promptVersion: promptVersions.candidateSelection,
  }));
  const frozenHistory = { echoes: structuredClone(echoes), caseRecords: structuredClone(source.data.caseRecords ?? []) };
  const historyAdapter = {
    readStatus: async () => ({ status: "ready" }),
    readIndex: async () => structuredClone(frozenHistory),
  };
  const sourceAdapter = sourceAdapters(sourceIndex);
  const trigger = { type: "paired_evaluation", thoughtLineId };
  await assertSnapshotIdentity(contextRoot, evaluationRoot, contexts);
  const B = await runVariant({ variant: "B", contexts, candidates: selection, contextRoot, evaluationRoot, sourceAdapter, historyAdapter, agentAdapter, prompt: prompts.judgmentB, promptVersion: promptVersions.judgmentB, trigger });
  await assertSnapshotIdentity(contextRoot, evaluationRoot, contexts);
  const C = await runVariant({ variant: "C", contexts, candidates: selection, contextRoot, evaluationRoot, sourceAdapter, historyAdapter, agentAdapter, prompt: prompts.judgmentC, promptVersion: promptVersions.judgmentC, trigger });
  await assertSnapshotIdentity(contextRoot, evaluationRoot, contexts);

  const record = {
    format: "huiye-paired-relation-evaluation",
    version: 1,
    lifecycle: "evaluation_only",
    runId: idFactory(),
    thoughtLineId,
    sourceGenerationId: source.generationId,
    contextSnapshots: contexts.map((snapshot) => ({ thoughtLineId: snapshot.thoughtLine.id, snapshotId: snapshot.snapshotId })),
    frozenHistoryIdentity: frozenHistoryIdentity(frozenHistory),
    promptVersions: structuredClone(promptVersions),
    prompts: structuredClone(prompts),
    model,
    reasoningEffort,
    evaluatedAt: now().toISOString(),
    sharedSelection: selection,
    variants: { B, C },
  };
  const evaluationPath = await publishPairedRun(evaluationRoot, record);
  return { ...record, evaluationPath };
}
