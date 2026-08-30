import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createContextModule } from "../build/thought-line-context-module.mjs";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("reads one ThoughtLineContext as a private read-only workbench snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-snapshot-"));
  const contextRoot = path.join(root, "thought-line-context");
  const evaluationRoot = path.join(root, "evaluation");
  try {
    await writeJson(path.join(contextRoot, "manifest.json"), {
      format: "huiye-thought-line-context",
      version: 1,
      sourceGenerationId: "generation-dev-1",
      thoughtLines: ["line-autumn"],
      entryIds: ["101", "102"],
      updatedAt: "2026-08-24T04:00:00.000Z",
    });
    await writeJson(path.join(contextRoot, "thought-lines", "line-autumn", "record.json"), {
      thoughtLineId: "line-autumn",
      thoughtLineName: "秋招",
      sourceGenerationId: "generation-dev-1",
      entryIds: ["101", "102"],
      promptVersion: "thought-line-context-v0.1",
      model: "gpt-5",
      updatedAt: "2026-08-24T04:00:00.000Z",
    });
    await mkdir(path.join(contextRoot, "thought-lines", "line-autumn"), { recursive: true });
    await writeFile(path.join(contextRoot, "thought-lines", "line-autumn", "context.md"), "# 秋招\n\n## 当前问题\n\n怎样在等待期继续成长？\n", "utf8");
    const historyRoot = path.join(contextRoot, "thought-lines", "line-autumn", "history", "2026-08-23T04-00-00-000Z");
    await mkdir(historyRoot, { recursive: true });
    await writeFile(path.join(historyRoot, "context.md"), "# 秋招\n\n## 当前问题\n\n怎样准备秋招？\n", "utf8");
    await writeJson(path.join(historyRoot, "change.json"), {
      changedAt: "2026-08-23T04:00:00.000Z",
      previousSha256: "old-sha",
      nextSha256: "new-sha",
    });
    for (const [entryId, title] of [["101", "准备秋招"], ["102", "等待反馈"]]) {
      await writeJson(path.join(contextRoot, "entries", entryId, "card.json"), {
        entryId: Number(entryId),
        type: "求职思考",
        summary: title,
        topics: ["秋招"],
        entities: [],
        uncertainty: [],
        source: { title, createdAt: "2026-08-24T00:00:00.000Z", tags: ["秋招"], thoughtLineIds: ["line-autumn"] },
      });
    }

    const contextModule = createContextModule({ contextRoot, evaluationRoot });
    const snapshot = await contextModule.inspect();

    assert.equal(snapshot.thoughtLine.id, "line-autumn");
    assert.equal(snapshot.thoughtLine.name, "秋招");
    assert.equal(snapshot.sourceGenerationId, "generation-dev-1");
    assert.equal(snapshot.contextMarkdown, "# 秋招\n\n## 当前问题\n\n怎样在等待期继续成长？\n");
    assert.deepEqual(snapshot.entryCards.map((card) => card.entryId), [101, 102]);
    assert.equal(snapshot.history.length, 1);
    assert.equal(snapshot.history[0].changedAt, "2026-08-23T04:00:00.000Z");
    assert.deepEqual(snapshot.history[0].diff, [
      { type: "removed", text: "怎样准备秋招？" },
      { type: "added", text: "怎样在等待期继续成长？" },
    ]);
    assert.deepEqual(snapshot.relationshipEvaluation, { status: "not_run", latest: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a ThoughtLine ID that could escape the private context directory", async () => {
  const contextModule = createContextModule({ contextRoot: "ignored", evaluationRoot: "ignored" });
  await assert.rejects(
    () => contextModule.inspect("../outside"),
    /思考线 ID 无效/,
  );
});

test("returns immutable snapshot metadata and deterministic adjacent snapshot diffs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-context-versioned-snapshot-"));
  const contextRoot = path.join(root, "thought-line-context");
  const evaluationRoot = path.join(root, "evaluation");
  const lineRoot = path.join(contextRoot, "thought-lines", "line-autumn");
  const promptVersions = {
    entryCard: "entry-card-v1",
    thoughtLineContext: "thought-line-context-v2",
    contextMaintenance: "context-maintenance-v1",
    relationJudgment: "relation-judgment-v1",
  };
  const previousSnapshot = {
    format: "huiye-context-snapshot",
    version: 1,
    snapshotId: "snapshot-1",
    status: "ready",
    sourceGenerationId: "generation-dev-1",
    thoughtLine: { id: "line-autumn", name: "秋招" },
    thoughtLineContext: {
      macroSections: {
        discusses: "怎样准备秋招。",
        majorConcerns: "作品与面试。",
        thoughtStages: "开始准备。",
        stableView: "先完善作品。",
        currentFocus: "作品集。",
        tensions: "等待与行动。",
      },
      entryCardReferences: [
        { entryId: "101", cardVersion: "card-101-v1", sha256: "sha-101-v1" },
      ],
    },
    promptVersions: { ...promptVersions, thoughtLineContext: "thought-line-context-v1" },
    trigger: { type: "initial_build" },
    maintenanceMethod: "full_rebuild",
    createdAt: "2026-08-23T04:00:00.000Z",
  };
  const currentSnapshot = {
    ...previousSnapshot,
    snapshotId: "snapshot-2",
    sourceGenerationId: "generation-dev-2",
    thoughtLineContext: {
      macroSections: {
        ...previousSnapshot.thoughtLineContext.macroSections,
        currentFocus: "等待反馈时继续完善作品集。",
      },
      entryCardReferences: [
        { entryId: "101", cardVersion: "card-101-v2", sha256: "sha-101-v2" },
        { entryId: "102", cardVersion: "card-102-v1", sha256: "sha-102-v1" },
      ],
    },
    promptVersions,
    trigger: { type: "entry_increment", entryIds: ["102"] },
    maintenanceMethod: "incremental",
    createdAt: "2026-08-24T04:00:00.000Z",
  };

  try {
    await writeJson(path.join(contextRoot, "manifest.json"), {
      format: "huiye-thought-line-context",
      version: 1,
      sourceGenerationId: "generation-dev-2",
      thoughtLines: ["line-autumn"],
      entryIds: ["101", "102"],
      updatedAt: currentSnapshot.createdAt,
    });
    await writeJson(path.join(lineRoot, "snapshot.json"), currentSnapshot);
    await writeJson(path.join(lineRoot, "history", "snapshot-1", "snapshot.json"), previousSnapshot);
    await writeJson(path.join(contextRoot, "entries", "101", "versions", "card-101-v2.json"), { entryId: 101, summary: "继续完善作品" });
    await writeJson(path.join(contextRoot, "entries", "102", "versions", "card-102-v1.json"), { entryId: 102, summary: "等待反馈" });

    const contextModule = createContextModule({ contextRoot, evaluationRoot });
    const firstRead = await contextModule.inspect("line-autumn");
    const secondRead = await contextModule.inspect("line-autumn");

    assert.equal(firstRead.snapshotId, "snapshot-2");
    assert.equal(firstRead.status, "ready");
    assert.deepEqual(firstRead.promptVersions, promptVersions);
    assert.deepEqual(firstRead.trigger, { type: "entry_increment", entryIds: ["102"] });
    assert.equal(firstRead.maintenanceMethod, "incremental");
    assert.deepEqual(firstRead.entryCards.map((card) => card.entryId), [101, 102]);
    assert.equal(firstRead.history.length, 1);
    assert.deepEqual(firstRead.history[0].diff, {
      macroSections: [
        {
          section: "currentFocus",
          previous: "作品集。",
          next: "等待反馈时继续完善作品集。",
        },
      ],
      entryCardReferences: {
        added: [{ entryId: "102", cardVersion: "card-102-v1", sha256: "sha-102-v1" }],
        removed: [],
        changed: [{
          entryId: "101",
          previous: { entryId: "101", cardVersion: "card-101-v1", sha256: "sha-101-v1" },
          next: { entryId: "101", cardVersion: "card-101-v2", sha256: "sha-101-v2" },
        }],
      },
      promptVersions: [{
        module: "thoughtLineContext",
        previous: "thought-line-context-v1",
        next: "thought-line-context-v2",
      }],
    });
    assert.deepEqual(secondRead.history[0].diff, firstRead.history[0].diff);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
