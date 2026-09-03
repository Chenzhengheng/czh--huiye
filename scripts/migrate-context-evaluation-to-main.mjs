import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { entrySourceFingerprint } from "../build/context-maintenance.mjs";
import { readLocalData } from "../build/local-data-store.mjs";
import { createContextModule } from "../build/thought-line-context-module.mjs";

const thoughtLineId = "line-1786190755581-1";
const sourceProjectRoot = path.resolve(process.argv[2] || ".");
const targetProjectRoot = path.resolve(process.argv[3] || path.join(sourceProjectRoot, "..", "..", ".."));
const sourceContextRoot = path.join(sourceProjectRoot, "local-context");
const targetContextRoot = path.join(targetProjectRoot, "local-context");
const sourceDataRoot = path.join(sourceProjectRoot, "local-data");
const targetDataRoot = path.join(targetProjectRoot, "local-data");
const resume = process.argv.includes("--resume");

async function exists(filePath) {
  try { await stat(filePath); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex").toUpperCase();
}

function eligibleFingerprints(source) {
  return source.data.entries
    .filter((entry) => entry.aiLink && entry.thoughtLineIds?.includes(thoughtLineId))
    .map((entry) => ({ id: String(entry.id), fingerprint: entrySourceFingerprint(entry) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeTrace(trace) {
  return (trace.calls ?? []).map((call) => ({
    step: call.seen?.step ?? ({
      decideMaintenance: "decide_maintenance",
      selectCandidates: "select_candidates",
      judgeCandidate: "judge_candidate",
    }[call.agent] ?? call.agent),
    input: call.seen,
    output: call.output,
  }));
}

function deriveRuleTrace(trace) {
  return (trace.calls ?? [])
    .filter((call) => call.agent === "judgeCandidate" && call.seen?.candidate)
    .map((call, candidateIndex) => ({
      candidateIndex,
      candidate: call.seen.candidate,
      stage: "hard_gate",
      decision: "passed",
      reason: null,
    }));
}

function projectEvaluationEchoCard(record) {
  return {
    schemaVersion: 2,
    id: record.id,
    mode: record.mode,
    thoughtLineId: record.thoughtLineId,
    relationType: record.relationType,
    lifecycle: "evaluation_only",
    sourceEntryIds: record.sourceEntryIds,
    ...(record.triggerEntryId === undefined ? {} : { triggerEntryId: record.triggerEntryId }),
    evidence: record.evidence,
    sourceSummaries: record.sourceSummaries,
    reason: record.reason,
    ...(record.question === undefined ? {} : { question: record.question }),
    discoveredAt: record.discoveredAt,
    eligibleAfter: record.eligibleAfter,
    ruleVersion: record.ruleVersion,
    model: record.model,
    events: [],
  };
}

function projectEvaluationSources(entries, sourceEntryIds) {
  const wanted = new Set(sourceEntryIds.map(String));
  return entries
    .filter((entry) => wanted.has(String(entry.id)))
    .map(({ id, title, content, createdAt, date }) => ({ id, title, content, ...(createdAt ? { createdAt } : {}), ...(date ? { date } : {}) }));
}

if (sourceProjectRoot === targetProjectRoot) throw new Error("迁移源与目标不能相同");
if (await exists(targetContextRoot) && !resume) throw new Error(`目标 local-context 已存在，拒绝覆盖：${targetContextRoot}`);

const currentPath = path.join(targetDataRoot, "current.json");
const beforeHash = await sha256(currentPath);
const [sourceData, targetData] = await Promise.all([readLocalData(sourceDataRoot), readLocalData(targetDataRoot)]);
const sourceEntries = eligibleFingerprints(sourceData);
const targetEntries = eligibleFingerprints(targetData);
if (JSON.stringify(sourceEntries) !== JSON.stringify(targetEntries)) {
  throw new Error("开发 Context 的授权 Entry 与主目录不一致，拒绝迁移");
}

if (!resume) {
  await cp(path.join(sourceContextRoot, "thought-line-context"), path.join(targetContextRoot, "thought-line-context"), { recursive: true });
}

const sourceEvaluationRoot = path.join(sourceContextRoot, "evaluation");
const targetEvaluationRoot = path.join(targetContextRoot, "evaluation");
const index = await readJson(path.join(sourceEvaluationRoot, "index.json"));
const latestRunId = String(index.latestRunId);
const sourceRunRoot = path.join(sourceEvaluationRoot, "runs", latestRunId);
const targetRunRoot = path.join(targetEvaluationRoot, "runs", latestRunId);
await cp(sourceRunRoot, targetRunRoot, { recursive: true });
await cp(path.join(sourceEvaluationRoot, "paired-runs"), path.join(targetEvaluationRoot, "paired-runs"), { recursive: true });
const activePairedIndex = path.join(sourceEvaluationRoot, "paired-runs", "index.json");
const archivedPairedIndex = path.join(sourceContextRoot, "reproduction-reset", "20260903-selected-c", "paired-runs", "index.json");
await cp(
  await exists(activePairedIndex) ? activePairedIndex : archivedPairedIndex,
  path.join(targetEvaluationRoot, "paired-runs", "index.json"),
);
const [legacyResult, rawTrace] = await Promise.all([
  readJson(path.join(sourceRunRoot, "result.json")),
  readJson(path.join(sourceRunRoot, "agent-trace.json")),
]);
const legacyEchoRecord = await readJson(path.join(sourceDataRoot, "echoes", `${legacyResult.echoRecordId}.json`));
const echoCard = projectEvaluationEchoCard(legacyEchoRecord);
const migratedResult = {
  ...legacyResult,
  sourceGenerationId: targetData.generationId,
  echoCard,
  sourceEntries: projectEvaluationSources(sourceData.data.entries, echoCard.sourceEntryIds),
  agentTrace: normalizeTrace(rawTrace),
  ruleTrace: deriveRuleTrace(rawTrace),
};
delete migratedResult.echoRecordId;
await writeJson(path.join(targetRunRoot, "result.json"), migratedResult);
await writeJson(path.join(targetEvaluationRoot, "index.json"), {
  format: "huiye-thought-line-relation-evaluation-index",
  version: 1,
  latestRunId,
  runs: [{
    runId: latestRunId,
    thoughtLineId: migratedResult.thoughtLineId,
    decision: migratedResult.decision,
    evaluatedAt: migratedResult.evaluatedAt,
  }],
});

const copiedSnapshot = await readJson(path.join(targetContextRoot, "thought-line-context", "thought-lines", thoughtLineId, "snapshot.json"));
const contextModule = createContextModule({
  contextRoot: path.join(targetContextRoot, "thought-line-context"),
  evaluationRoot: targetEvaluationRoot,
  sourceReader: async () => targetData,
  agentAdapter: {
    generateEntryCards: async () => { throw new Error("generation sync 不应生成 EntryCard"); },
    generateThoughtLineContext: async () => { throw new Error("generation sync 不应生成 Context"); },
    decideMaintenance: async () => { throw new Error("generation sync 不应调用 Agent"); },
  },
  prompts: { entryCard: "migration", thoughtLineContext: "migration", contextMaintenance: "migration" },
  promptVersions: copiedSnapshot.promptVersions,
  now: () => new Date(),
});
const beforeSyncSnapshot = await contextModule.inspect(thoughtLineId);
if (beforeSyncSnapshot.sourceGenerationId !== targetData.generationId) {
  await contextModule.maintain({ type: "source_generation_sync", thoughtLineId });
}
const migratedSnapshot = await contextModule.inspect(thoughtLineId);
if (migratedSnapshot.sourceGenerationId !== targetData.generationId || migratedSnapshot.entryCards.length !== targetEntries.length) {
  throw new Error("迁移后的 ContextSnapshot 未与主 generation 对齐");
}

const afterHash = await sha256(currentPath);
if (beforeHash !== afterHash) throw new Error("迁移期间 stable local-data/current.json 发生变化");

process.stdout.write(`${JSON.stringify({
  migrated: true,
  latestRunId,
  historicalExperimentCount: (await readJson(path.join(targetEvaluationRoot, "paired-runs", "index.json"))).runs?.length ?? 0,
  entryCardCount: migratedSnapshot.entryCards.length,
  sourceGenerationId: migratedSnapshot.sourceGenerationId,
  stableLocalDataCurrentSha256: afterHash,
}, null, 2)}\n`);
