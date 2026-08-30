import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { entrySourceFingerprint } from "./context-maintenance.mjs";
import { writeEchoRecord, readEchoRecords } from "./echo-record-store.mjs";
import { readLocalData } from "./local-data-store.mjs";
import { createRelationModule } from "./relation-module.mjs";
import { createContextModule } from "./thought-line-context-module.mjs";

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

function normalizeSource(source) {
  if (!source?.generationId || !source.data) throw new Error("评测运行没有可读取的开发版 generation");
  return {
    generationId: source.generationId,
    data: source.data,
  };
}

function buildEchoRecord(draft, { id, model, evaluatedAt }) {
  const uncertainty = String(draft.uncertainty ?? "").trim();
  return {
    schemaVersion: 2,
    id,
    mode: draft.mode,
    thoughtLineId: draft.thoughtLineId,
    relationType: draft.relationType,
    lifecycle: "evaluation_only",
    sourceEntryIds: draft.sourceEntryIds,
    ...(draft.triggerEntryId === undefined ? {} : { triggerEntryId: draft.triggerEntryId }),
    evidence: draft.evidence,
    sourceSummaries: draft.sourceSummaries,
    reason: uncertainty ? `${draft.reason}\n\n不确定性：${uncertainty}` : draft.reason,
    ...(draft.question === undefined ? {} : { question: draft.question }),
    discoveredAt: evaluatedAt,
    eligibleAfter: evaluatedAt,
    ruleVersion: draft.ruleVersion,
    model,
    events: [],
  };
}

async function publishEvaluation(evaluationRoot, record) {
  const runPath = path.join(evaluationRoot, "runs", record.runId, "result.json");
  await writeJsonAtomic(runPath, record);
  const previousIndex = await readOptionalJson(path.join(evaluationRoot, "index.json"));
  const previousRuns = previousIndex?.format === "huiye-thought-line-relation-evaluation-index"
    ? previousIndex.runs ?? []
    : [];
  await writeJsonAtomic(path.join(evaluationRoot, "index.json"), {
    format: "huiye-thought-line-relation-evaluation-index",
    version: 1,
    latestRunId: record.runId,
    runs: [
      ...previousRuns.filter((run) => run.runId !== record.runId),
      {
        runId: record.runId,
        thoughtLineId: record.thoughtLineId,
        decision: record.decision,
        evaluatedAt: record.evaluatedAt,
      },
    ],
  });
  return runPath;
}

export async function runContextRelationEvaluation({
  sourceRoot,
  contextRoot,
  evaluationRoot,
  thoughtLineId,
  prompts,
  promptVersions,
  agentAdapter,
  model,
  now = () => new Date(),
  idFactory = () => `echo-context-eval-${Date.now()}-${randomUUID()}`,
}) {
  if (!model) throw new Error("评测运行缺少模型名称");
  const readSource = async () => normalizeSource(await readLocalData(sourceRoot));
  const source = await readSource();
  const eligibleEntryIds = source.data.entries
    .filter((entry) => entry.aiLink && entry.thoughtLineIds?.includes(thoughtLineId))
    .map((entry) => String(entry.id));
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: readSource,
    agentAdapter,
    prompts,
    promptVersions,
    now,
  });
  const existing = await contextModule.inspect(thoughtLineId).catch((error) => {
    if (/不包含思考线|manifest/.test(String(error?.message))) return null;
    throw error;
  });
  const signal = existing?.snapshotId
    ? { type: "entry_increment", thoughtLineId, thoughtLineIds: [thoughtLineId], entryIds: eligibleEntryIds }
    : { type: "initial_build", thoughtLineId };
  await contextModule.maintain(signal);

  const relationSource = async () => {
    const current = await readSource();
    return {
      generationId: current.generationId,
      thoughtLines: current.data.thoughtLines ?? [],
      entries: (current.data.entries ?? []).map((entry) => ({
        ...entry,
        sourceFingerprint: entrySourceFingerprint(entry),
      })),
      caseRecords: current.data.caseRecords ?? [],
    };
  };
  const sourceAdapter = {
    readIndex: relationSource,
    readOriginalEntries: async ({ thoughtLineId: requestedLineId, entryIds }) => {
      const current = await relationSource();
      const requested = new Set(entryIds.map(String));
      return current.entries
        .filter((entry) => requested.has(String(entry.id)) && entry.thoughtLineIds?.includes(requestedLineId));
    },
  };
  const historyAdapter = {
    readStatus: async () => ({ status: "ready" }),
    readIndex: async () => {
      const current = await relationSource();
      return {
        echoes: await readEchoRecords(sourceRoot),
        caseRecords: current.caseRecords,
      };
    },
  };
  const relationModule = createRelationModule({
    contextRoot,
    evaluationRoot,
    sourceAdapter,
    historyAdapter,
    agentAdapter,
    prompt: prompts.relationJudgment,
    promptVersion: promptVersions.relationJudgment,
  });
  const draft = await relationModule.run({ type: "evaluation", thoughtLineId });
  const evaluatedAt = now().toISOString();
  const runId = `run-${evaluatedAt.replace(/[:.]/g, "-")}-${randomUUID()}`;
  if (draft.decision === "silent") {
    const evaluation = {
      format: "huiye-thought-line-relation-evaluation",
      version: 1,
      lifecycle: "evaluation_only",
      runId,
      thoughtLineId,
      sourceGenerationId: source.generationId,
      promptVersions,
      model,
      evaluatedAt,
      decision: "silent",
    };
    const evaluationPath = await publishEvaluation(evaluationRoot, evaluation);
    return { decision: "silent", evaluationPath };
  }

  const echoRecord = await writeEchoRecord(sourceRoot, buildEchoRecord(draft, {
    id: idFactory(),
    model,
    evaluatedAt,
  }));
  const evaluation = {
    format: "huiye-thought-line-relation-evaluation",
    version: 1,
    lifecycle: "evaluation_only",
    runId,
    thoughtLineId,
    sourceGenerationId: source.generationId,
    promptVersions,
    model,
    evaluatedAt,
    decision: "accepted",
    echoRecordId: echoRecord.id,
    sourceEntryIds: echoRecord.sourceEntryIds,
    relationType: echoRecord.relationType,
    reason: echoRecord.reason,
  };
  const evaluationPath = await publishEvaluation(evaluationRoot, evaluation);
  return { decision: "accepted", echoRecord, evaluationPath };
}
