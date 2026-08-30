import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readEchoRecords } from "../build/echo-record-store.mjs";
import { createCodexJsonAgentAdapter } from "../build/codex-json-agent-adapter.mjs";
import { runContextRelationEvaluation } from "../build/context-relation-evaluation-runner.mjs";
import { writeLocalData } from "../build/local-data-store.mjs";
import { createContextModule } from "../build/thought-line-context-module.mjs";
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
  relationJudgment: "relation-judgment-v0.1",
};

const prompts = {
  entryCard: ENTRY_CARD_PROMPT,
  thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
  contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
  relationJudgment: RELATION_JUDGMENT_PROMPT,
};

test("Codex JSON Agent maps nullable Echo output back to the RelationModule decision contract", async () => {
  let receivedSchema;
  const adapter = createCodexJsonAgentAdapter({
    invokeJson: async ({ schema }) => {
      receivedSchema = schema;
      return { decision: "next_candidate", echo: null };
    },
  });

  assert.deepEqual(await adapter.judgeCandidate({
    step: "check_candidate_1",
    prompt: RELATION_JUDGMENT_PROMPT,
    promptVersion: "relation-judgment-v0.1",
  }), { decision: "next_candidate" });
  assert.doesNotMatch(JSON.stringify(receivedSchema), /oneOf/);
  assert.equal(receivedSchema.properties.decision.type, "string");
  assert.equal(receivedSchema.properties.echo.anyOf[0].properties.mode.type, "string");
});

test("one Harness run publishes inspectable Context and one evaluation-only EchoRecord", async () => {
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
        selectCandidates: async () => ({ candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "102"], navigationBasis: "等待前后的状态值得核验。" }] }),
        judgeCandidate: async () => ({ decision: "output", echo: {
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
        } }),
      },
    });

    assert.equal(result.decision, "accepted");
    assert.equal(result.echoRecord.id, "echo-context-eval-test");
    assert.equal(result.echoRecord.lifecycle, "evaluation_only");
    assert.equal(result.echoRecord.schemaVersion, 2);
    assert.match(result.echoRecord.reason, /不确定性：尚未获得面试结果/);

    const records = await readEchoRecords(sourceRoot);
    assert.deepEqual(records.map((record) => record.id), ["echo-context-eval-test"]);

    const contextModule = createContextModule({ contextRoot, evaluationRoot });
    const snapshot = await contextModule.inspect("line-autumn");
    assert.equal(snapshot.entryCards.length, 2);
    assert.equal(snapshot.relationshipEvaluation.status, "accepted");
    assert.equal(snapshot.relationshipEvaluation.latest.echoRecordId, "echo-context-eval-test");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
