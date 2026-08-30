import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTEXT_MAINTENANCE_PROMPT,
  ENTRY_CARD_PROMPT,
  RELATION_JUDGMENT_PROMPT,
  THOUGHT_LINE_CONTEXT_PROMPT,
} from "../app/thought-line-context-prompts.ts";
import { createContextModule } from "../build/thought-line-context-module.mjs";
import { createRelationModule } from "../build/relation-module.mjs";

const promptVersions = {
  entryCard: "entry-card-v0.1",
  thoughtLineContext: "thought-line-context-v0.1",
  contextMaintenance: "context-maintenance-v0.1",
  relationJudgment: "relation-judgment-v0.1",
};

const contextPrompts = {
  entryCard: ENTRY_CARD_PROMPT,
  thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
  contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
};

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceFingerprint(entry) {
  return createHash("sha256").update(stableStringify({
    id: String(entry.id),
    title: entry.title ?? "",
    content: entry.content,
    createdAt: entry.createdAt ?? null,
    updatedAt: entry.updatedAt ?? null,
    tags: entry.tags ?? [],
    thoughtLineIds: entry.thoughtLineIds ?? [],
    aiLink: entry.aiLink,
  })).digest("hex");
}

function sourceFixture() {
  return {
    generationId: "generation-dev-1",
    data: {
      thoughtLines: [
        { id: "line-autumn", name: "秋招", status: "active", allowEcho: true },
        { id: "line-ai", name: "AI", status: "active", allowEcho: true },
      ],
      entries: [
        { id: 101, title: "准备", content: "整理项目。", createdAt: "2026-08-24T01:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-autumn"] },
        { id: 102, title: "交汇", content: "用 AI 完善作品。", createdAt: "2026-08-24T02:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-autumn", "line-ai"] },
        { id: 103, title: "AI 实验", content: "记录 Agent 实验。", createdAt: "2026-08-24T03:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-ai"] },
        { id: 105, title: "继续行动", content: "等待中继续修改作品。", createdAt: "2026-08-24T04:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-autumn"] },
      ],
      echoes: [],
    },
  };
}

function contextAgentAdapter() {
  return {
    decideMaintenance: async () => ({
      decision: "full_rebuild_needed",
      affectedEntryIds: [],
      affectedSections: ["discusses", "majorConcerns", "thoughtStages", "stableView", "currentFocus", "tensions"],
      reason: "Prompt 变化需要全量重建。",
    }),
    generateEntryCards: async ({ entries }) => entries.map((entry) => ({
      entryId: String(entry.id),
      summary: entry.title,
      uncertainty: [],
    })),
    generateThoughtLineContext: async ({ thoughtLine }) => ({
      macroSections: {
        discusses: `${thoughtLine.name}线在讨论什么。`,
        majorConcerns: "主要关切。",
        thoughtStages: "思考阶段。",
        stableView: "已有认识。",
        currentFocus: "当前聚焦。",
        tensions: "未解决问题。",
      },
    }),
  };
}

function relationSourceAdapter(source, readOriginalEntries = async ({ entryIds }) => (
  source.data.entries.filter((entry) => entryIds.includes(String(entry.id)))
)) {
  return {
    readIndex: async () => ({
      generationId: source.generationId,
      thoughtLines: source.data.thoughtLines,
      entries: source.data.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        tags: entry.tags,
        aiLink: entry.aiLink,
        thoughtLineIds: entry.thoughtLineIds,
        sourceFingerprint: sourceFingerprint(entry),
      })),
    }),
    readOriginalEntries,
  };
}

function historyAdapter(index = { echoes: [], caseRecords: [] }) {
  return {
    readStatus: async () => ({ status: "ready" }),
    readIndex: async () => index,
  };
}

test("run stays silent when the ready Contexts produce no candidate combinations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-select-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const times = [
    new Date("2026-08-24T04:00:00.000Z"),
    new Date("2026-08-24T05:00:00.000Z"),
    new Date("2026-08-24T06:00:00.000Z"),
  ];
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => times.shift(),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-ai" });
    await contextModule.maintain({ type: "prompt_change", thoughtLineId: "line-autumn", module: "thoughtLineContext" });

    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter: relationSourceAdapter(source),
      historyAdapter: historyAdapter(),
      agentAdapter: {
        selectCandidates: async ({ contexts }) => {
          assert.deepEqual(contexts.map((context) => context.thoughtLine.id), ["line-autumn"]);
          assert.equal(Object.hasOwn(contexts[0], "history"), false);
          assert.equal(Object.hasOwn(contexts[0], "relationshipEvaluation"), false);
          return { candidates: [] };
        },
        judgeCandidate: async () => {
          throw new Error("没有候选时不应进入判断阶段");
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    assert.deepEqual(await relationModule.run({ type: "evaluation" }), { decision: "silent" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run rejects a cross-line candidate before reading any original Entry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-hard-gate-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => new Date("2026-08-24T04:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-ai" });
    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter: relationSourceAdapter(source, async () => {
        throw new Error("硬门禁失败时不得读取原文");
      }),
      historyAdapter: historyAdapter(),
      agentAdapter: {
        selectCandidates: async () => ({
          candidates: [{
            thoughtLineId: "line-autumn",
            entryIds: ["101", "103"],
            navigationBasis: "两篇看似都涉及工具。",
          }],
        }),
        judgeCandidate: async () => {
          throw new Error("硬门禁失败时不得进入关系判断");
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    assert.deepEqual(await relationModule.run({ type: "evaluation" }), { decision: "silent" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run reads originals and deterministic candidate history before returning an in-memory Echo draft", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-output-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter: relationSourceAdapter(source),
      historyAdapter: {
        readStatus: async () => ({ status: "ready" }),
        readIndex: async () => ({
          echoes: [
            { id: "echo-exact", thoughtLineId: "line-autumn", lifecycle: "evaluation_only", sourceEntryIds: [101, 102], relationType: "continuation", reason: "旧表达。" },
            { id: "echo-overlap", thoughtLineId: "line-autumn", lifecycle: "candidate", sourceEntryIds: [102, 105], relationType: "revision", reason: "另一种表达。" },
          ],
          caseRecords: [
            { echoRecordId: "echo-exact", feedback: "not_quite", userFeedbackText: "不是从被动变主动。" },
          ],
        }),
      },
      agentAdapter: {
        selectCandidates: async ({ prompt }) => {
          assert.equal(prompt, RELATION_JUDGMENT_PROMPT);
          return {
            candidates: [{
              thoughtLineId: "line-autumn",
              entryIds: ["101", "102"],
              navigationBasis: "准备方式在投递前后可能发生延续。",
            }],
          };
        },
        judgeCandidate: async ({ step, originals, historyBundle, prompt, promptVersion }) => {
          assert.equal(step, "check_candidate_1");
          assert.equal(prompt, RELATION_JUDGMENT_PROMPT);
          assert.deepEqual(originals.map((entry) => entry.id), [101, 102]);
          assert.deepEqual(historyBundle, {
            exactEchoes: [{ id: "echo-exact", thoughtLineId: "line-autumn", lifecycle: "evaluation_only", sourceEntryIds: [101, 102], relationType: "continuation", reason: "旧表达。" }],
            overlappingEchoes: [{ id: "echo-overlap", thoughtLineId: "line-autumn", lifecycle: "candidate", sourceEntryIds: [102, 105], relationType: "revision", reason: "另一种表达。" }],
            feedback: [{ echoRecordId: "echo-exact", feedback: "not_quite", userFeedbackText: "不是从被动变主动。" }],
            sourceUsage: [
              { entryId: "101", sourceUsageCount: 1 },
              { entryId: "102", sourceUsageCount: 2 },
            ],
          });
          assert.equal(promptVersion, "relation-judgment-v0.1");
          return {
            decision: "output",
            echo: {
              mode: "relational",
              thoughtLineId: "line-autumn",
              relationType: "continuation",
              sourceEntryIds: [101, 102],
              triggerEntryId: 102,
              evidence: [{ entryId: 101, quote: "整理项目" }, { entryId: 102, quote: "完善作品" }],
              sourceSummaries: [{ entryId: 101, text: "投递前整理项目。" }, { entryId: 102, text: "投递后继续完善。" }],
              reason: "行动方式从准备延续到等待阶段。",
              question: "这份主动性现在还在吗？",
              manifestationGain: "把等待前后的行动串联起来。",
              explanationRisk: "low",
              uncertainty: "仍需用户判断这是否是一条连续变化。",
            },
          };
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    assert.deepEqual(await relationModule.run({ type: "evaluation" }), {
      decision: "output",
      mode: "relational",
      thoughtLineId: "line-autumn",
      relationType: "continuation",
      sourceEntryIds: [101, 102],
      triggerEntryId: 102,
      evidence: [{ entryId: 101, quote: "整理项目" }, { entryId: 102, quote: "完善作品" }],
      sourceSummaries: [{ entryId: 101, text: "投递前整理项目。" }, { entryId: 102, text: "投递后继续完善。" }],
      reason: "行动方式从准备延续到等待阶段。",
      question: "这份主动性现在还在吗？",
      manifestationGain: "把等待前后的行动串联起来。",
      explanationRisk: "low",
      uncertainty: "仍需用户判断这是否是一条连续变化。",
      ruleVersion: "relation-judgment-v0.1",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run rejects a candidate whose EntryCard source version is stale before reading originals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-stale-card-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const sourceAdapter = relationSourceAdapter(source, async () => {
      throw new Error("EntryCard 过期时不得读取原文");
    });
    const currentIndex = await sourceAdapter.readIndex();
    currentIndex.entries.find((entry) => entry.id === 102).sourceFingerprint = "changed-source-fingerprint";
    sourceAdapter.readIndex = async () => currentIndex;
    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter,
      historyAdapter: historyAdapter(),
      agentAdapter: {
        selectCandidates: async () => ({
          candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "102"], navigationBasis: "可能存在延续。" }],
        }),
        judgeCandidate: async () => {
          throw new Error("EntryCard 过期时不得判断关系");
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    assert.deepEqual(await relationModule.run({ type: "evaluation" }), { decision: "silent" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run rejects stale CandidateHistory before reading originals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-stale-history-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter: relationSourceAdapter(source, async () => {
        throw new Error("历史状态过期时不得读取原文");
      }),
      historyAdapter: {
        readStatus: async () => ({ status: "stale" }),
        readIndex: async () => {
          throw new Error("历史状态过期时不得读取历史内容");
        },
      },
      agentAdapter: {
        selectCandidates: async () => ({
          candidates: [{ thoughtLineId: "line-autumn", entryIds: ["101", "102"], navigationBasis: "可能存在延续。" }],
        }),
        judgeCandidate: async () => {
          throw new Error("历史状态过期时不得判断关系");
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    assert.deepEqual(await relationModule.run({ type: "evaluation" }), { decision: "silent" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run consumes at most three candidates and stops at the first output decision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-relation-loop-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const source = sourceFixture();
  const contextModule = createContextModule({
    contextRoot,
    evaluationRoot,
    sourceReader: async () => source,
    agentAdapter: contextAgentAdapter(),
    prompts: contextPrompts,
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const baseSourceAdapter = relationSourceAdapter(source);
    const relationModule = createRelationModule({
      contextRoot,
      evaluationRoot,
      sourceAdapter: {
        ...baseSourceAdapter,
        readOriginalEntries: async (input) => {
          assert.ok(input.entryIds.length >= 2, "硬门禁失败的候选不得读取原文");
          return baseSourceAdapter.readOriginalEntries(input);
        },
      },
      historyAdapter: historyAdapter(),
      agentAdapter: {
        selectCandidates: async () => ({
          candidates: [
            { thoughtLineId: "line-autumn", entryIds: ["101"], navigationBasis: "来源不足。" },
            { thoughtLineId: "line-autumn", entryIds: ["101", "102"], navigationBasis: "先检查准备和交汇。" },
            { thoughtLineId: "line-autumn", entryIds: ["102", "105"], navigationBasis: "再检查等待和行动。" },
          ],
        }),
        judgeCandidate: async ({ step, candidate }) => {
          if (step === "check_candidate_2") return { decision: "next_candidate" };
          assert.equal(step, "check_candidate_3");
          assert.deepEqual(candidate.entryIds, ["102", "105"]);
          return {
            decision: "output",
            echo: {
              mode: "relational",
              thoughtLineId: "line-autumn",
              relationType: "continuation",
              sourceEntryIds: [102, 105],
              triggerEntryId: 105,
              evidence: [{ entryId: 102, quote: "完善作品" }, { entryId: 105, quote: "修改作品" }],
              sourceSummaries: [{ entryId: 102, text: "用 AI 完善作品。" }, { entryId: 105, text: "等待中继续修改。" }],
              reason: "等待阶段延续了完善作品的行动。",
              manifestationGain: "看到了行动的延续。",
              explanationRisk: "low",
              uncertainty: "仍需用户判断。",
            },
          };
        },
      },
      prompt: RELATION_JUDGMENT_PROMPT,
      promptVersion: promptVersions.relationJudgment,
    });

    const result = await relationModule.run({ type: "evaluation" });
    assert.equal(result.decision, "output");
    assert.deepEqual(result.sourceEntryIds, [102, 105]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
