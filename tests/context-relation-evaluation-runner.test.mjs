import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { readEchoRecords } from "../build/echo-record-store.mjs";
import { entrySourceFingerprint } from "../build/context-maintenance.mjs";
import { createCodexJsonAgentAdapter } from "../build/codex-json-agent-adapter.mjs";
import { assertEvaluationStorageBoundary, detectContextSourceChanges, runContextRelationEvaluation } from "../build/context-relation-evaluation-runner.mjs";
import { readLocalData, writeLocalData } from "../build/local-data-store.mjs";
import { createContextModule } from "../build/thought-line-context-module.mjs";
import { readEvaluationWorkbench } from "../build/evaluation-workbench-store.mjs";
import {
  CONTEXT_MAINTENANCE_PROMPT,
  ENTRY_CARD_PROMPT,
  RELATION_JUDGMENT_PROMPT,
  THOUGHT_LINE_CONTEXT_PROMPT,
} from "../app/thought-line-context-prompts.ts";

const promptVersions = {
  entryCard: "entry-card-v0.1",
  thoughtLineContext: "thought-line-context-v0.1",
  contextMaintenance: "context-maintenance-v0.1",
  relationJudgment: "relation-judgment-v0.2",
};

const prompts = {
  entryCard: ENTRY_CARD_PROMPT,
  thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
  contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
  relationJudgment: RELATION_JUDGMENT_PROMPT,
};

const structuredNavigationBasis = {
  attentionSignal: "等待前后的状态发生变化。",
  whyTheseEntries: "两篇分别位于等待前后。",
  minimalityBasis: "两篇已经构成最小充分来源。",
  checkFocus: "核查问题是否从预见走向具体。",
};

test("rejects Context or evaluation writes nested under the source directory", () => {
  assert.throws(() => assertEvaluationStorageBoundary({
    sourceRoot: path.join("root", "local-data"),
    contextRoot: path.join("root", "local-data", "context"),
    evaluationRoot: path.join("root", "local-context", "evaluation"),
  }), /不得写入 local-data/);
});

test("Codex JSON Agent maps nullable Echo output back to the RelationModule decision contract", async () => {
  let receivedSchema;
  const adapter = createCodexJsonAgentAdapter({
    invokeJson: async ({ schema }) => {
      receivedSchema = schema;
      return {
        decision: "next_candidate",
        assessment: {
          decisionReason: "Context 显示候选可能遗漏中间阶段。",
          candidateCompleteness: "missing_indispensable_entry",
          indispensableMissingEntryIds: [102],
          contextEffect: "revealed_gap",
        },
        echo: null,
      };
    },
  });

  assert.deepEqual(await adapter.judgeCandidate({
    step: "check_candidate_1",
    prompt: RELATION_JUDGMENT_PROMPT,
    promptVersion: "relation-judgment-v0.2",
  }), {
    decision: "next_candidate",
    assessment: {
      decisionReason: "Context 显示候选可能遗漏中间阶段。",
      candidateCompleteness: "missing_indispensable_entry",
      indispensableMissingEntryIds: [102],
      contextEffect: "revealed_gap",
    },
    echo: null,
  });
  assert.doesNotMatch(JSON.stringify(receivedSchema), /oneOf/);
  assert.equal(receivedSchema.properties.decision.type, "string");
  assert.deepEqual(receivedSchema.properties.assessment.properties.contextEffect.enum, ["no_material_effect", "changed_interpretation", "revealed_gap"]);
  assert.equal(receivedSchema.properties.echo.anyOf[0].properties.mode.type, "string");
});

test("one Harness run publishes a self-contained evaluation artifact without writing an EchoRecord", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-relation-run-"));
  const sourceRoot = path.join(root, "local-data");
  const contextRoot = path.join(root, "local-context", "thought-line-context");
  const evaluationRoot = path.join(root, "local-context", "evaluation");
  const now = () => new Date("2026-08-28T08:00:00.000Z");
  const sourceData = {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-08-28T07:00:00.000Z",
    entries: [
      { id: 101, title: "开始投递", content: "我担心等待时后期乏力。", createdAt: "2026-08-11T00:00:00.000Z", tags: ["秋招"], aiOrganize: true, aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
      { id: 102, title: "等待之后", content: "现在更清楚自己需要一次真实面试。", createdAt: "2026-08-27T00:00:00.000Z", tags: ["秋招"], aiOrganize: true, aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
    ],
    echoes: [],
    echoCheckedIds: [],
    thoughtLines: [{ id: "line-autumn", name: "秋招", status: "active", allowEcho: true, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
    caseRecords: [],
    echoReplies: [],
  };

  try {
    await writeLocalData(sourceRoot, sourceData, { source: "test" });
    const result = await runContextRelationEvaluation({
      sourceRoot,
      contextRoot,
      evaluationRoot,
      thoughtLineId: "line-autumn",
      prompts,
      promptVersions,
      model: "test-model",
      now,
      idFactory: () => "echo-context-eval-test",
      agentAdapter: {
        generateEntryCards: async ({ entries }) => entries.map((entry) => ({ entryId: entry.id, summary: entry.title, uncertainty: [] })),
        generateThoughtLineContext: async () => ({ macroSections: {
          discusses: "秋招等待期。",
          majorConcerns: "怎样保持状态。",
          thoughtStages: "从投递走到等待。",
          stableView: "仍希望持续成长。",
          currentFocus: "获得真实反馈。",
          tensions: "尚无面试结果。",
        } }),
        decideMaintenance: async () => { throw new Error("首次构建不应调用维护判断"); },
        selectCandidates: async () => ({ candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "102"], navigationBasis: structuredNavigationBasis }] }),
        judgeCandidate: async ({ selectedLineContext }) => {
          assert.equal(selectedLineContext.thoughtLine.id, "line-autumn");
          return { decision: "output", assessment: {
            decisionReason: "两篇来源充分。",
            candidateCompleteness: "sufficient",
            indispensableMissingEntryIds: [],
            contextEffect: "no_material_effect",
          }, echo: {
          mode: "relational",
          thoughtLineId: "line-autumn",
          relationType: "continuation",
          sourceEntryIds: [101, 102],
          triggerEntryId: 102,
          evidence: [{ entryId: 101, quote: "后期乏力" }, { entryId: 102, quote: "真实面试" }],
          sourceSummaries: [{ entryId: 101, text: "预见等待期乏力。" }, { entryId: 102, text: "开始寻求真实反馈。" }],
          reason: "等待中的问题逐渐变得具体。",
          manifestationGain: "两篇共同显示问题从预见走向具体。",
          explanationRisk: "low",
          uncertainty: "尚未获得面试结果。",
          } };
        },
      },
    });

    assert.equal(result.decision, "accepted");
    assert.equal(result.evaluation.echoCard.id, "echo-context-eval-test");
    assert.equal(result.evaluation.echoCard.lifecycle, "evaluation_only");
    assert.equal(result.evaluation.echoCard.schemaVersion, 2);
    assert.match(result.evaluation.echoCard.reason, /不确定性：尚未获得面试结果/);
    assert.deepEqual(result.evaluation.echoCard.sourceEntryIds, [101, 102]);
    assert.deepEqual(result.evaluation.agentTrace.map((step) => step.step), [
      "generate_entry_cards",
      "generate_thought_line_context",
      "select_candidates",
      "check_candidate_1",
    ]);
    assert.deepEqual(result.evaluation.ruleTrace.map((event) => [event.stage, event.decision]), [["hard_gate", "passed"]]);

    const records = await readEchoRecords(sourceRoot);
    assert.deepEqual(records, []);

    const artifact = JSON.parse(await readFile(result.evaluationPath, "utf8"));
    assert.deepEqual(artifact.echoCard, result.evaluation.echoCard);
    assert.equal(artifact.agentTrace[3].output.decision, "output");

    const contextModule = createContextModule({ contextRoot, evaluationRoot });
    const snapshot = await contextModule.inspect("line-autumn");
    assert.equal(snapshot.entryCards.length, 2);
    assert.equal(snapshot.relationshipEvaluation.status, "accepted");
    assert.equal(snapshot.relationshipEvaluation.latest.echoCard.id, "echo-context-eval-test");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detects only added, changed and removed eligible Entries", () => {
  const snapshot = {
    entryCards: [
      { entryId: "101", sourceFingerprint: "stale" },
      { entryId: "102", sourceFingerprint: "removed" },
    ],
  };
  const unchanged = { id: 101, title: "A", content: "same", aiLink: true, thoughtLineIds: ["line-autumn"] };
  snapshot.entryCards[0].sourceFingerprint = entrySourceFingerprint(unchanged);
  const firstPass = detectContextSourceChanges(snapshot, [unchanged, { id: 103, title: "C", content: "new", aiLink: true, thoughtLineIds: ["line-autumn"] }]);
  assert.deepEqual(firstPass.addedEntryIds, ["103"]);
  assert.deepEqual(firstPass.changedEntryIds, []);
  assert.deepEqual(firstPass.removedEntryIds, ["102"]);
});

test("syncs a new source generation without inventing changed Entries or calling Context agents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-generation-sync-"));
  const sourceRoot = path.join(root, "local-data");
  const contextRoot = path.join(root, "local-context", "thought-line-context");
  const evaluationRoot = path.join(root, "local-context", "evaluation");
  const data = {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-09-03T00:00:00.000Z",
    entries: [
      { id: 101, title: "A", content: "第一篇。", createdAt: "2026-08-01T00:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
      { id: 102, title: "B", content: "第二篇。", createdAt: "2026-08-02T00:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
    ],
    echoes: [], echoCheckedIds: [], caseRecords: [], echoReplies: [],
    thoughtLines: [{ id: "line-autumn", name: "秋招", status: "active", allowEcho: true }],
  };
  const macroSections = {
    discusses: "秋招。", majorConcerns: "反馈。", thoughtStages: "等待。",
    stableView: "继续。", currentFocus: "面试。", tensions: "未知。",
  };
  const relationOnlyAdapter = {
    generateEntryCards: async () => { throw new Error("generation sync 不应生成 EntryCard"); },
    generateThoughtLineContext: async () => { throw new Error("generation sync 不应生成 Context"); },
    decideMaintenance: async () => { throw new Error("generation sync 不应调用维护 Agent"); },
    selectCandidates: async () => ({ candidates: [] }),
    judgeCandidate: async () => { throw new Error("没有候选不应判断"); },
  };

  try {
    await writeLocalData(sourceRoot, data, { source: "test" });
    await runContextRelationEvaluation({
      sourceRoot, contextRoot, evaluationRoot, thoughtLineId: "line-autumn", prompts, promptVersions,
      model: "test-model", now: () => new Date("2026-09-03T01:00:00.000Z"),
      agentAdapter: {
        ...relationOnlyAdapter,
        generateEntryCards: async ({ entries }) => entries.map((entry) => ({ entryId: entry.id, summary: entry.title, uncertainty: [] })),
        generateThoughtLineContext: async () => ({ macroSections }),
      },
    });
    const secondWrite = await writeLocalData(sourceRoot, { ...data, exportedAt: "2026-09-03T02:00:00.000Z" }, { source: "test" });
    await runContextRelationEvaluation({
      sourceRoot, contextRoot, evaluationRoot, thoughtLineId: "line-autumn", prompts, promptVersions,
      model: "test-model", now: () => new Date("2026-09-03T03:00:00.000Z"), agentAdapter: relationOnlyAdapter,
    });
    const snapshot = await createContextModule({ contextRoot, evaluationRoot }).inspect("line-autumn");
    assert.equal(snapshot.sourceGenerationId, secondWrite.generationId);
    assert.equal((await readLocalData(sourceRoot)).generationId, secondWrite.generationId);
    assert.deepEqual(snapshot.trigger, { type: "source_generation_sync", thoughtLineId: "line-autumn" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lists current C runs and historical B/C experiments through one workbench seam", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-evaluation-workbench-"));
  const currentRun = { runId: "run-c", evaluatedAt: "2026-09-03T03:00:00.000Z", decision: "silent" };
  const pairedRun = { runId: "run-bc", evaluatedAt: "2026-08-30T03:00:00.000Z", variants: { B: {}, C: {} } };
  try {
    await mkdir(path.join(root, "runs", currentRun.runId), { recursive: true });
    await mkdir(path.join(root, "paired-runs", pairedRun.runId), { recursive: true });
    await writeFile(path.join(root, "index.json"), JSON.stringify({
      format: "huiye-thought-line-relation-evaluation-index", version: 1, runs: [{ runId: currentRun.runId }],
    }));
    await writeFile(path.join(root, "runs", currentRun.runId, "result.json"), JSON.stringify(currentRun));
    await writeFile(path.join(root, "paired-runs", "index.json"), JSON.stringify({
      format: "huiye-paired-relation-evaluation-index", version: 1, runs: [{ runId: pairedRun.runId }],
    }));
    await writeFile(path.join(root, "paired-runs", pairedRun.runId, "result.json"), JSON.stringify(pairedRun));

    const workbench = await readEvaluationWorkbench(root);
    assert.equal(workbench.currentScheme, "C");
    assert.deepEqual(workbench.runs, [currentRun]);
    assert.deepEqual(workbench.historicalExperiments, [pairedRun]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
