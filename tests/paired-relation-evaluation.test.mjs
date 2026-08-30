import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONTEXT_MAINTENANCE_PROMPT,
  ENTRY_CARD_PROMPT,
  RELATION_CANDIDATE_SELECTION_PROMPT,
  RELATION_JUDGMENT_B_PROMPT,
  RELATION_JUDGMENT_C_PROMPT,
  THOUGHT_LINE_CONTEXT_PROMPT,
} from "../app/thought-line-context-prompts.ts";
import { createCodexJsonAgentAdapter } from "../build/codex-json-agent-adapter.mjs";
import { readEchoRecords } from "../build/echo-record-store.mjs";
import { writeLocalData } from "../build/local-data-store.mjs";
import { runPairedRelationEvaluation } from "../build/paired-relation-evaluation.mjs";
import { createContextModule } from "../build/thought-line-context-module.mjs";

const navigationBasis = {
  attentionSignal: "等待期的关注点发生变化。",
  whyTheseEntries: "起点与当前状态指向同一个具体问题。",
  minimalityBasis: "两篇构成待核验的最小候选。",
  checkFocus: "核查中间阶段是否不可省略。",
};

function echoDraft() {
  return {
    mode: "relational",
    thoughtLineId: "line-autumn",
    relationType: "continuation",
    sourceEntryIds: [101, 103],
    triggerEntryId: 103,
    evidence: [
      { entryId: 101, quote: "担心等待" },
      { entryId: 103, quote: "真实反馈" },
    ],
    sourceSummaries: [
      { entryId: 101, text: "担心等待期失去状态。" },
      { entryId: 103, text: "开始期待真实反馈。" },
    ],
    reason: "等待中的担忧逐渐指向对真实反馈的需要。",
    manifestationGain: "把早期预感与当前需要放到同一条轨迹中。",
    explanationRisk: "low",
    uncertainty: "中间阶段是否改变了关系仍需判断。",
  };
}

test("Codex JSON Adapter keeps selection, B and C on separate Structured Output contracts", async () => {
  const seenSchemas = [];
  const adapter = createCodexJsonAgentAdapter({
    invokeJson: async ({ prompt, schema }) => {
      seenSchemas.push(schema);
      if (prompt.includes("candidate-selection-test")) {
        return { candidates: [{ thoughtLineId: "line-autumn", entryIds: [101, 103], navigationBasis }] };
      }
      if (prompt.includes("judgment-b-test")) {
        return { decision: "next_candidate", assessment: { decisionReason: "B 放弃。", candidateCompleteness: "uncertain", indispensableMissingEntryIds: [], contextEffect: "not_provided" }, echo: null };
      }
      return { decision: "next_candidate", assessment: { decisionReason: "C 发现断层。", candidateCompleteness: "missing_indispensable_entry", indispensableMissingEntryIds: [102], contextEffect: "revealed_gap" }, echo: null };
    },
  });

  const selection = await adapter.selectRelationCandidates({ step: "select_candidates", prompt: "candidate-selection-test", promptVersion: "selection-v-test" });
  const B = await adapter.judgeRelationCandidateB({ step: "check_candidate_1", prompt: "judgment-b-test", promptVersion: "b-v-test" });
  const C = await adapter.judgeRelationCandidateC({ step: "check_candidate_1", prompt: "judgment-c-test", promptVersion: "c-v-test" });

  assert.deepEqual(selection.candidates[0].navigationBasis, navigationBasis);
  assert.equal(B.assessment.contextEffect, "not_provided");
  assert.equal(C.assessment.contextEffect, "revealed_gap");
  assert.equal(seenSchemas[0].properties.candidates.items.properties.navigationBasis.type, "object");
  assert.deepEqual(seenSchemas[1].properties.assessment.properties.contextEffect.enum, ["not_provided"]);
  assert.deepEqual(seenSchemas[2].properties.assessment.properties.contextEffect.enum, ["no_material_effect", "changed_interpretation", "revealed_gap"]);
});

test("one paired run shares selection and frozen history while C alone receives selected-line Context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-paired-relation-"));
  const sourceRoot = path.join(root, "local-data");
  const contextRoot = path.join(root, "local-context", "thought-line-context");
  const evaluationRoot = path.join(root, "local-context", "evaluation");
  const sourceData = {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-08-30T00:00:00.000Z",
    entries: [
      { id: 101, title: "开始等待", content: "我担心等待时失去状态。", createdAt: "2026-08-01T00:00:00.000Z", tags: ["秋招"], aiOrganize: true, aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
      { id: 102, title: "调整方式", content: "我先把作品整理清楚，再等待结果。", createdAt: "2026-08-10T00:00:00.000Z", tags: ["秋招"], aiOrganize: true, aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
      { id: 103, title: "需要反馈", content: "现在更需要一次真实反馈。", createdAt: "2026-08-20T00:00:00.000Z", tags: ["秋招"], aiOrganize: true, aiLink: true, thoughtLineIds: ["line-autumn"], attachments: [] },
    ],
    echoes: [],
    echoCheckedIds: [],
    thoughtLines: [{ id: "line-autumn", name: "秋招", status: "active", allowEcho: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
    caseRecords: [],
    echoReplies: [],
  };
  const contextPromptVersions = {
    entryCard: "entry-card-v0.1",
    thoughtLineContext: "thought-line-context-v0.1",
    contextMaintenance: "context-maintenance-v0.1",
    relationJudgment: "relation-judgment-v0.1",
  };

  try {
    const saved = await writeLocalData(sourceRoot, sourceData, { source: "test" });
    const contextModule = createContextModule({
      contextRoot,
      evaluationRoot,
      sourceReader: async () => ({ generationId: saved.generationId, data: sourceData }),
      agentAdapter: {
        generateEntryCards: async ({ entries }) => entries.map((entry) => ({ entryId: entry.id, summary: entry.title, uncertainty: [] })),
        generateThoughtLineContext: async () => ({ macroSections: {
          discusses: "秋招等待与反馈。",
          majorConcerns: "如何维持行动。",
          thoughtStages: "担心、调整、寻求反馈。",
          stableView: "希望通过行动获得反馈。",
          currentFocus: "获得真实反馈。",
          tensions: "等待是否消耗状态。",
        } }),
        decideMaintenance: async () => { throw new Error("首次构建不应维护"); },
      },
      prompts: {
        entryCard: ENTRY_CARD_PROMPT,
        thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
        contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
      },
      promptVersions: contextPromptVersions,
      now: () => new Date("2026-08-30T01:00:00.000Z"),
    });
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });

    let selectionCalls = 0;
    const result = await runPairedRelationEvaluation({
      sourceRoot,
      contextRoot,
      evaluationRoot,
      thoughtLineId: "line-autumn",
      prompts: {
        candidateSelection: RELATION_CANDIDATE_SELECTION_PROMPT,
        judgmentB: RELATION_JUDGMENT_B_PROMPT,
        judgmentC: RELATION_JUDGMENT_C_PROMPT,
      },
      promptVersions: {
        candidateSelection: "relation-candidate-selection-v0.2",
        judgmentB: "relation-judgment-b-v0.2",
        judgmentC: "relation-judgment-c-v0.2",
      },
      model: "test-model",
      reasoningEffort: "high",
      now: () => new Date("2026-08-30T02:00:00.000Z"),
      idFactory: () => "paired-run-test",
      agentAdapter: {
        selectRelationCandidates: async ({ contexts, prompt }) => {
          selectionCalls += 1;
          assert.equal(prompt, RELATION_CANDIDATE_SELECTION_PROMPT);
          assert.deepEqual(contexts.map((context) => context.thoughtLine.id), ["line-autumn"]);
          return { candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "103"], navigationBasis }] };
        },
        judgeRelationCandidateB: async (input) => {
          assert.equal(input.prompt, RELATION_JUDGMENT_B_PROMPT);
          assert.equal(Object.hasOwn(input, "selectedLineContext"), false);
          assert.deepEqual(input.historyBundle, { exactEchoes: [], overlappingEchoes: [], feedback: [], sourceUsage: [{ entryId: "101", sourceUsageCount: 0 }, { entryId: "103", sourceUsageCount: 0 }] });
          return {
            decision: "output",
            assessment: { decisionReason: "原文足够。", candidateCompleteness: "sufficient", indispensableMissingEntryIds: [], contextEffect: "not_provided" },
            echo: echoDraft(),
          };
        },
        judgeRelationCandidateC: async (input) => {
          assert.equal(input.prompt, RELATION_JUDGMENT_C_PROMPT);
          assert.equal(input.selectedLineContext.snapshotId.startsWith("snapshot-"), true);
          assert.deepEqual(input.selectedLineContext.entryCards.map((card) => card.entryId), ["101", "102", "103"]);
          assert.deepEqual(input.historyBundle, { exactEchoes: [], overlappingEchoes: [], feedback: [], sourceUsage: [{ entryId: "101", sourceUsageCount: 0 }, { entryId: "103", sourceUsageCount: 0 }] });
          return {
            decision: "next_candidate",
            assessment: { decisionReason: "中间阶段不可省略。", candidateCompleteness: "missing_indispensable_entry", indispensableMissingEntryIds: ["102"], contextEffect: "revealed_gap" },
            echo: null,
          };
        },
      },
    });

    assert.equal(selectionCalls, 1);
    assert.equal(result.variants.B.decision, "accepted");
    assert.equal(result.variants.C.decision, "silent");
    assert.deepEqual(result.variants.C.attempts[0].assessment.indispensableMissingEntryIds, ["102"]);
    assert.deepEqual(await readEchoRecords(sourceRoot), []);

    const stored = JSON.parse(await readFile(result.evaluationPath, "utf8"));
    assert.equal(stored.runId, "paired-run-test");
    assert.equal(stored.promptVersions.judgmentB, "relation-judgment-b-v0.2");
    assert.equal(stored.variants.B.draft.reason, echoDraft().reason);
    assert.match(stored.frozenHistoryIdentity.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(stored.frozenHistoryIdentity, {
      sha256: stored.frozenHistoryIdentity.sha256,
      echoCount: 0,
      caseRecordCount: 0,
    });

    for (const [BDecision, CDecision] of [
      ["accepted", "accepted"],
      ["silent", "accepted"],
      ["silent", "silent"],
    ]) {
      const outputFor = (variant, decision) => decision === "accepted"
        ? {
            decision: "output",
            assessment: {
              decisionReason: `${variant} 达到门槛。`,
              candidateCompleteness: "sufficient",
              indispensableMissingEntryIds: [],
              contextEffect: variant === "B" ? "not_provided" : "changed_interpretation",
            },
            echo: echoDraft(),
          }
        : {
            decision: "next_candidate",
            assessment: {
              decisionReason: `${variant} 保持沉默。`,
              candidateCompleteness: "uncertain",
              indispensableMissingEntryIds: [],
              contextEffect: variant === "B" ? "not_provided" : "no_material_effect",
            },
            echo: null,
          };
      const matrixResult = await runPairedRelationEvaluation({
        sourceRoot,
        contextRoot,
        evaluationRoot,
        thoughtLineId: "line-autumn",
        prompts: {
          candidateSelection: RELATION_CANDIDATE_SELECTION_PROMPT,
          judgmentB: RELATION_JUDGMENT_B_PROMPT,
          judgmentC: RELATION_JUDGMENT_C_PROMPT,
        },
        promptVersions: {
          candidateSelection: "relation-candidate-selection-v0.2",
          judgmentB: "relation-judgment-b-v0.2",
          judgmentC: "relation-judgment-c-v0.2",
        },
        model: "test-model",
        idFactory: () => `paired-${BDecision}-${CDecision}`,
        agentAdapter: {
          selectRelationCandidates: async () => ({ candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "103"], navigationBasis }] }),
          judgeRelationCandidateB: async () => outputFor("B", BDecision),
          judgeRelationCandidateC: async () => outputFor("C", CDecision),
        },
      });
      assert.deepEqual(
        [matrixResult.variants.B.decision, matrixResult.variants.C.decision],
        [BDecision, CDecision],
      );
      const matrixStored = JSON.parse(await readFile(matrixResult.evaluationPath, "utf8"));
      assert.deepEqual(
        [matrixStored.variants.B.decision, matrixStored.variants.C.decision],
        [BDecision, CDecision],
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
