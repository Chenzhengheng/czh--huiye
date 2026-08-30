import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTEXT_MAINTENANCE_PROMPT,
  ENTRY_CARD_PROMPT,
  THOUGHT_LINE_CONTEXT_PROMPT,
} from "../app/thought-line-context-prompts.ts";
import { createContextModule } from "../build/thought-line-context-module.mjs";

const promptVersions = {
  entryCard: "entry-card-v0.1",
  thoughtLineContext: "thought-line-context-v0.1",
  contextMaintenance: "context-maintenance-v0.1",
  relationJudgment: "relation-judgment-v0.1",
};

function sourceFixture() {
  return {
    generationId: "generation-dev-1",
    data: {
      thoughtLines: [
        { id: "line-autumn", name: "秋招", status: "active", allowEcho: true },
        { id: "line-ai", name: "AI", status: "active", allowEcho: true },
      ],
      entries: [
        { id: 102, title: "等待反馈", content: "投递后，我想在等待期继续完善作品。", createdAt: "2026-08-24T02:00:00.000Z", tags: ["秋招"], aiLink: true, thoughtLineIds: ["line-autumn", "line-ai"] },
        { id: 101, title: "准备秋招", content: "我先整理项目，再开始投递。", createdAt: "2026-08-24T01:00:00.000Z", tags: ["求职"], aiLink: true, thoughtLineIds: ["line-autumn"] },
        { id: 103, title: "私人草稿", content: "不得交给 Agent。", createdAt: "2026-08-24T03:00:00.000Z", tags: [], aiLink: false, thoughtLineIds: ["line-autumn"] },
        { id: 104, title: "另一条线", content: "不得借交汇点扩读。", createdAt: "2026-08-24T04:00:00.000Z", tags: [], aiLink: true, thoughtLineIds: ["line-ai"] },
      ],
    },
  };
}

test("maintain rejects a version-only Agent invocation without Prompt text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-missing-prompt-"));
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => sourceFixture(),
    agentAdapter: {
      generateEntryCards: async () => [],
      generateThoughtLineContext: async () => ({ macroSections: {} }),
    },
    promptVersions,
  });

  try {
    await assert.rejects(
      contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" }),
      /缺少 Prompt 正文：entryCard/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintain builds the first ready ContextSnapshot from every eligible Entry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-maintain-"));
  let entryCardAgentInput;
  let thoughtLineContextAgentInput;
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => sourceFixture(),
    agentAdapter: {
      generateEntryCards: async (input) => {
        entryCardAgentInput = input;
        return [
          { entryId: "101", summary: "开始用整理项目的方式准备秋招。", uncertainty: [] },
          { entryId: "102", summary: "等待反馈期间仍希望继续完善作品。", uncertainty: ["等待的具体结果尚未说明。"] },
        ];
      },
      generateThoughtLineContext: async (input) => {
        thoughtLineContextAgentInput = input;
        return {
          macroSections: {
            discusses: "怎样准备秋招，并在等待期继续行动。",
            majorConcerns: "项目呈现、投递与等待反馈。",
            thoughtStages: "从整理项目走到投递后的持续完善。",
            stableView: "行动比被动等待更重要。",
            currentFocus: "继续完善作品。",
            tensions: "等待外部反馈与维持主动性之间的张力。",
          },
        };
      },
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    const result = await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const snapshot = await contextModule.inspect("line-autumn");

    assert.deepEqual(result, {
      thoughtLineId: "line-autumn",
      status: "ready",
      maintenanceMethod: "full_rebuild",
      snapshotId: snapshot.snapshotId,
    });
    assert.equal(snapshot.sourceGenerationId, "generation-dev-1");
    assert.deepEqual(snapshot.promptVersions, promptVersions);
    assert.deepEqual(snapshot.entryCards.map((card) => card.entryId), [101, 102]);
    assert.deepEqual(snapshot.entryCards[0], {
      format: "huiye-entry-card-version",
      version: 1,
      cardVersion: snapshot.thoughtLineContext.entryCardReferences[0].cardVersion,
      entryId: 101,
      occurredAt: "2026-08-24T01:00:00.000Z",
      tags: ["求职"],
      thoughtLineIds: ["line-autumn"],
      aiLink: true,
      sourceRef: { entryId: "101" },
      sourceFingerprint: snapshot.entryCards[0].sourceFingerprint,
      summary: "开始用整理项目的方式准备秋招。",
      uncertainty: [],
      promptVersion: "entry-card-v0.1",
      createdAt: "2026-08-24T05:00:00.000Z",
    });
    assert.match(snapshot.entryCards[0].sourceFingerprint, /^[a-f0-9]{64}$/u);
    assert.equal(Object.hasOwn(snapshot.entryCards[0], "content"), false);
    assert.deepEqual(snapshot.thoughtLineContext.entryCardReferences.map((reference) => reference.entryId), ["101", "102"]);
    assert.equal(snapshot.thoughtLineContext.macroSections.currentFocus, "继续完善作品。");
    assert.equal(snapshot.history.length, 0);
    assert.equal(entryCardAgentInput.prompt, ENTRY_CARD_PROMPT);
    assert.equal(thoughtLineContextAgentInput.prompt, THOUGHT_LINE_CONTEXT_PROMPT);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a not_quite Echo feedback can leave ThoughtLineContext unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-feedback-"));
  let maintenanceInput;
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => sourceFixture(),
    agentAdapter: {
      generateEntryCards: async ({ entries }) => entries.map((entry) => ({
        entryId: String(entry.id),
        summary: entry.title,
        uncertainty: [],
      })),
      generateThoughtLineContext: async () => ({
        macroSections: {
          discusses: "怎样准备秋招。",
          majorConcerns: "项目呈现与投递。",
          thoughtStages: "从准备走到等待反馈。",
          stableView: "继续行动。",
          currentFocus: "完善作品。",
          tensions: "等待与主动行动。",
        },
      }),
      decideMaintenance: async (input) => {
        maintenanceInput = input;
        return {
          decision: "no_context_change",
          affectedEntryIds: [],
          affectedSections: [],
          reason: "用户否定的是这次 Echo 对两篇来源的连接，没有指出线级宏观认识错误。",
        };
      },
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => new Date("2026-08-24T05:00:00.000Z"),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const before = await contextModule.inspect("line-autumn");
    const result = await contextModule.maintain({
      type: "feedback_not_quite",
      thoughtLineId: "line-autumn",
      feedback: {
        sourceEntryIds: [101, 102],
        userFeedbackText: "这两篇都在行动，但不是同一个判断的延续。",
        echo: {
          relationType: "continuation",
          reason: "等待期间仍保持主动行动。",
        },
      },
    });
    const after = await contextModule.inspect("line-autumn");

    assert.deepEqual(result, {
      thoughtLineId: "line-autumn",
      status: "ready",
      maintenanceDecision: "no_context_change",
      snapshotId: before.snapshotId,
    });
    assert.equal(after.snapshotId, before.snapshotId);
    assert.equal(after.history.length, 0);
    assert.equal(maintenanceInput.prompt, CONTEXT_MAINTENANCE_PROMPT);
    assert.equal(maintenanceInput.promptVersion, "context-maintenance-v0.1");
    assert.deepEqual(maintenanceInput.relatedEntries.map((entry) => entry.id), [101, 102]);
    assert.deepEqual(maintenanceInput.relatedEntryCards.map((card) => card.entryId), [101, 102]);
    assert.equal(maintenanceInput.currentContext.macroSections.currentFocus, "完善作品。");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an Entry increment publishes a new CardVersion even when macro Context stays unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-card-only-change-"));
  let source = sourceFixture();
  let contextGenerationCount = 0;
  let requireFullRebuild = false;
  const times = [
    new Date("2026-08-24T05:00:00.000Z"),
    new Date("2026-08-25T05:00:00.000Z"),
    new Date("2026-08-26T05:00:00.000Z"),
  ];
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => source,
    agentAdapter: {
      generateEntryCards: async ({ entries }) => entries.map((entry) => ({
        entryId: String(entry.id),
        summary: entry.content,
        uncertainty: [],
      })),
      generateThoughtLineContext: async () => {
        contextGenerationCount += 1;
        return {
          macroSections: {
            discusses: "怎样准备秋招。",
            majorConcerns: "项目呈现与投递。",
            thoughtStages: "从准备走到等待反馈。",
            stableView: "继续行动。",
            currentFocus: "完善作品。",
            tensions: "等待与主动行动。",
          },
        };
      },
      decideMaintenance: async () => ({
        decision: requireFullRebuild ? "full_rebuild_needed" : "no_context_change",
        affectedEntryIds: ["102"],
        affectedSections: requireFullRebuild ? ["discusses", "currentFocus"] : [],
        reason: requireFullRebuild ? "累计变化需要重新理解整条线。" : "原文补充没有改变六个宏观章节。",
      }),
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => times.shift(),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const before = await contextModule.inspect("line-autumn");
    const previousCardVersion = before.entryCards.find((card) => card.entryId === 102).cardVersion;
    source = sourceFixture();
    source.generationId = "generation-dev-2";
    source.data.entries.find((entry) => entry.id === 102).content = "投递后继续完善作品，并记录每天的具体修改。";

    const result = await contextModule.maintain({ type: "entry_increment", thoughtLineId: "line-autumn", entryIds: ["102"] });
    const after = await contextModule.inspect("line-autumn");

    assert.equal(result.maintenanceDecision, "no_context_change");
    assert.equal(result.status, "ready");
    assert.notEqual(after.snapshotId, before.snapshotId);
    assert.notEqual(after.entryCards.find((card) => card.entryId === 102).cardVersion, previousCardVersion);
    assert.deepEqual(after.thoughtLineContext.macroSections, before.thoughtLineContext.macroSections);
    assert.deepEqual(after.history[0].diff.macroSections, []);
    assert.deepEqual(after.history[0].diff.entryCardReferences.changed.map((change) => change.entryId), ["102"]);
    assert.equal(contextGenerationCount, 1);

    requireFullRebuild = true;
    source = sourceFixture();
    source.generationId = "generation-dev-3";
    source.data.entries.find((entry) => entry.id === 102).content = "外部反馈改变了我准备秋招的整体方式。";
    const rebuilt = await contextModule.maintain({ type: "entry_increment", thoughtLineId: "line-autumn", entryIds: ["102"] });
    assert.equal(rebuilt.maintenanceDecision, "full_rebuild_needed");
    assert.equal(rebuilt.maintenanceMethod, "full_rebuild");
    assert.equal(contextGenerationCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintain reuses one global EntryCardVersion across ThoughtLines", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-shared-card-"));
  const times = [
    new Date("2026-08-24T05:00:00.000Z"),
    new Date("2026-08-24T06:00:00.000Z"),
  ];
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => sourceFixture(),
    agentAdapter: {
      generateEntryCards: async ({ entries }) => entries.map((entry) => ({
        entryId: String(entry.id),
        summary: `全局概要：${entry.title}`,
        uncertainty: [],
      })),
      generateThoughtLineContext: async ({ thoughtLine }) => ({
        macroSections: {
          discusses: `${thoughtLine.name}线的讨论。`,
          majorConcerns: "主要关切。",
          thoughtStages: "思考阶段。",
          stableView: "已有认识。",
          currentFocus: "当前聚焦。",
          tensions: "尚未解决。",
        },
      }),
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => times.shift(),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const autumnBefore = await contextModule.inspect("line-autumn");
    const sharedVersion = autumnBefore.thoughtLineContext.entryCardReferences
      .find((reference) => reference.entryId === "102").cardVersion;

    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-ai" });
    const autumnAfter = await contextModule.inspect("line-autumn");
    const aiSnapshot = await contextModule.inspect("line-ai");

    assert.equal(
      autumnAfter.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "102").cardVersion,
      sharedVersion,
    );
    assert.equal(
      aiSnapshot.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "102").cardVersion,
      sharedVersion,
    );
    assert.deepEqual(aiSnapshot.entryCards.map((card) => card.entryId), [102, 104]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maintain exposes stale until an incremental snapshot is completely published", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-incremental-"));
  let source = sourceFixture();
  let releaseIncrement;
  let reportIncrementStarted;
  const incrementStarted = new Promise((resolve) => { reportIncrementStarted = resolve; });
  const incrementGate = new Promise((resolve) => { releaseIncrement = resolve; });
  let maintenanceInput;
  const times = [
    new Date("2026-08-24T05:00:00.000Z"),
    new Date("2026-08-25T05:00:00.000Z"),
  ];
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => source,
    agentAdapter: {
      decideMaintenance: async (input) => {
        maintenanceInput = input;
        return {
          decision: "revise_context",
          affectedEntryIds: ["102"],
          affectedSections: ["currentFocus"],
          reason: "变化后的 Entry 改变了当前焦点。",
        };
      },
      generateEntryCards: async ({ entries }) => {
        if (source.generationId === "generation-dev-2") {
          reportIncrementStarted();
          await incrementGate;
        }
        return entries.map((entry) => ({
          entryId: String(entry.id),
          summary: entry.content,
          uncertainty: [],
        }));
      },
      generateThoughtLineContext: async ({ entryCards }) => ({
        macroSections: {
          discusses: "怎样准备秋招。",
          majorConcerns: "作品与投递。",
          thoughtStages: "从准备走到等待。",
          stableView: "保持行动。",
          currentFocus: entryCards.some((card) => card.summary.includes("复盘")) ? "复盘反馈并修改作品。" : "等待反馈时继续完善作品。",
          tensions: "等待与行动。",
        },
      }),
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => times.shift(),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const before = await contextModule.inspect("line-autumn");
    const previous101 = before.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "101").cardVersion;
    const previous102 = before.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "102").cardVersion;

    source = sourceFixture();
    source.generationId = "generation-dev-2";
    source.data.entries.find((entry) => entry.id === 102).content = "收到反馈后，我开始复盘并修改作品。";
    const maintenance = contextModule.maintain({ type: "entry_increment", thoughtLineId: "line-autumn", entryIds: ["102"] });
    await incrementStarted;

    const whileRunning = await contextModule.inspect("line-autumn");
    assert.equal(whileRunning.status, "stale");
    assert.equal(whileRunning.snapshotId, before.snapshotId);

    releaseIncrement();
    const result = await maintenance;
    const after = await contextModule.inspect("line-autumn");
    const next101 = after.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "101").cardVersion;
    const next102 = after.thoughtLineContext.entryCardReferences.find((reference) => reference.entryId === "102").cardVersion;

    assert.equal(result.maintenanceMethod, "incremental");
    assert.equal(after.status, "ready");
    assert.notEqual(after.snapshotId, before.snapshotId);
    assert.equal(next101, previous101);
    assert.notEqual(next102, previous102);
    assert.equal(after.history.length, 1);
    assert.deepEqual(after.history[0].diff.macroSections, [{
      section: "currentFocus",
      previous: "等待反馈时继续完善作品。",
      next: "复盘反馈并修改作品。",
    }]);
    assert.deepEqual(after.history[0].diff.entryCardReferences.changed.map((change) => change.entryId), ["102"]);
    assert.equal(maintenanceInput.prompt, CONTEXT_MAINTENANCE_PROMPT);
    assert.deepEqual(maintenanceInput.changedEntries.map((entry) => entry.id), [102]);
  } finally {
    releaseIncrement();
    await rm(root, { recursive: true, force: true });
  }
});

test("maintain fully rebuilds line context for a ThoughtLineContext Prompt change without rebuilding unchanged cards", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-prompt-rebuild-"));
  const contextRoot = path.join(root, "context");
  const evaluationRoot = path.join(root, "evaluation");
  const baseAgent = {
    decideMaintenance: async () => ({
      decision: "full_rebuild_needed",
      affectedEntryIds: [],
      affectedSections: ["discusses", "majorConcerns", "thoughtStages", "stableView", "currentFocus", "tensions"],
      reason: "ThoughtLineContext Prompt 的实质规则发生变化。",
    }),
    generateEntryCards: async ({ entries }) => entries.map((entry) => ({
      entryId: String(entry.id),
      summary: entry.title,
      uncertainty: [],
    })),
    generateThoughtLineContext: async ({ promptVersion }) => ({
      macroSections: {
        discusses: "怎样准备秋招。",
        majorConcerns: "作品与投递。",
        thoughtStages: "从准备走到等待。",
        stableView: "保持行动。",
        currentFocus: promptVersion.endsWith("v0.2") ? "以反馈校准作品。" : "继续完善作品。",
        tensions: "等待与行动。",
      },
    }),
  };

  try {
    const firstModule = createContextModule({
      contextRoot,
      evaluationRoot,
      sourceReader: async () => sourceFixture(),
      agentAdapter: baseAgent,
      prompts: {
        entryCard: ENTRY_CARD_PROMPT,
        thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
        contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
      },
      promptVersions,
      now: () => new Date("2026-08-24T05:00:00.000Z"),
    });
    await firstModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    const before = await firstModule.inspect("line-autumn");

    const nextPromptVersions = { ...promptVersions, thoughtLineContext: "thought-line-context-v0.2" };
    const nextModule = createContextModule({
      contextRoot,
      evaluationRoot,
      sourceReader: async () => sourceFixture(),
      agentAdapter: baseAgent,
      prompts: {
        entryCard: ENTRY_CARD_PROMPT,
        thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
        contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
      },
      promptVersions: nextPromptVersions,
      now: () => new Date("2026-08-25T05:00:00.000Z"),
    });
    const result = await nextModule.maintain({ type: "prompt_change", thoughtLineId: "line-autumn", module: "thoughtLineContext" });
    const after = await nextModule.inspect("line-autumn");

    assert.equal(result.maintenanceMethod, "full_rebuild");
    assert.deepEqual(
      after.thoughtLineContext.entryCardReferences,
      before.thoughtLineContext.entryCardReferences,
    );
    assert.deepEqual(after.history[0].diff.promptVersions, [{
      module: "thoughtLineContext",
      previous: "thought-line-context-v0.1",
      next: "thought-line-context-v0.2",
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an Entry increment marks every affected existing ThoughtLineContext stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-affected-lines-"));
  let source = sourceFixture();
  let releaseIncrement;
  let reportIncrementStarted;
  let shouldPause = false;
  const incrementStarted = new Promise((resolve) => { reportIncrementStarted = resolve; });
  const incrementGate = new Promise((resolve) => { releaseIncrement = resolve; });
  let autumnMaintenance;
  const times = [
    new Date("2026-08-24T05:00:00.000Z"),
    new Date("2026-08-24T06:00:00.000Z"),
    new Date("2026-08-25T05:00:00.000Z"),
    new Date("2026-08-25T06:00:00.000Z"),
  ];
  const contextModule = createContextModule({
    contextRoot: path.join(root, "context"),
    evaluationRoot: path.join(root, "evaluation"),
    sourceReader: async () => source,
    agentAdapter: {
      decideMaintenance: async () => ({
        decision: "revise_context",
        affectedEntryIds: ["102"],
        affectedSections: ["currentFocus"],
        reason: "共享 Entry 的变化影响两条线的当前焦点。",
      }),
      generateEntryCards: async ({ entries }) => {
        if (shouldPause) {
          shouldPause = false;
          reportIncrementStarted();
          await incrementGate;
        }
        return entries.map((entry) => ({ entryId: String(entry.id), summary: entry.content, uncertainty: [] }));
      },
      generateThoughtLineContext: async ({ thoughtLine, entryCards }) => ({
        macroSections: {
          discusses: `${thoughtLine.name}线的讨论。`,
          majorConcerns: "主要关切。",
          thoughtStages: "思考阶段。",
          stableView: "已有认识。",
          currentFocus: entryCards.some((card) => card.summary.includes("复盘")) ? "复盘新反馈。" : "继续行动。",
          tensions: "尚未解决。",
        },
      }),
    },
    prompts: {
      entryCard: ENTRY_CARD_PROMPT,
      thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
      contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    },
    promptVersions,
    now: () => times.shift(),
  });

  try {
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-autumn" });
    await contextModule.maintain({ type: "initial_build", thoughtLineId: "line-ai" });
    source = sourceFixture();
    source.generationId = "generation-dev-2";
    source.data.entries.find((entry) => entry.id === 102).content = "收到反馈后开始复盘。";
    shouldPause = true;

    autumnMaintenance = contextModule.maintain({ type: "entry_increment", thoughtLineId: "line-autumn", entryIds: ["102"] });
    await incrementStarted;
    assert.equal((await contextModule.inspect("line-autumn")).status, "stale");
    assert.equal((await contextModule.inspect("line-ai")).status, "stale");

    releaseIncrement();
    await autumnMaintenance;
    assert.equal((await contextModule.inspect("line-autumn")).status, "ready");
    assert.equal((await contextModule.inspect("line-ai")).status, "stale");

    await contextModule.maintain({ type: "entry_increment", thoughtLineId: "line-ai", entryIds: ["102"] });
    assert.equal((await contextModule.inspect("line-ai")).status, "ready");
  } finally {
    releaseIncrement();
    await autumnMaintenance?.catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
