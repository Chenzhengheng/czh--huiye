import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readLocalData, writeLocalData } from "../build/local-data-store.mjs";
import { createThoughtLineContextRuntime } from "../build/thought-line-context-runtime.mjs";

function sourceFixture() {
  const createdAt = "2026-08-24T00:00:00.000Z";
  return {
    format: "huiye-backup",
    version: 1,
    exportedAt: createdAt,
    thoughtLines: [
      { id: "line-autumn", name: "秋招", status: "active", allowEcho: true, createdAt, updatedAt: createdAt },
      { id: "line-ai", name: "AI", status: "active", allowEcho: true, createdAt, updatedAt: createdAt },
    ],
    entries: [
      { id: 101, title: "秋招一", content: "第一篇原文", createdAt, tags: ["求职"], source: "测试", aiLink: true, thoughtLineIds: ["line-autumn"] },
      { id: 102, title: "秋招交汇", content: "交汇原文", createdAt: "2026-08-24T01:00:00.000Z", tags: ["求职", "AI"], source: "测试", aiLink: true, thoughtLineIds: ["line-autumn", "line-ai"] },
      { id: 103, title: "关闭 AI", content: "不得交给 Context Agent", createdAt: "2026-08-24T02:00:00.000Z", tags: [], source: "测试", aiLink: false, thoughtLineIds: ["line-autumn"] },
      { id: 104, title: "仅 AI 线", content: "不得借交汇点扩读", createdAt: "2026-08-24T03:00:00.000Z", tags: [], source: "测试", aiLink: true, thoughtLineIds: ["line-ai"] },
    ],
    echoes: [],
    echoCheckedIds: [],
  };
}

test("buildContext isolates source data and persists only eligible line understanding", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "huiye-thought-line-context-"));
  const sourceRoot = path.join(temp, "source-local-data");
  const contextRoot = path.join(temp, "thought-line-context");
  try {
    const written = await writeLocalData(sourceRoot, sourceFixture(), { source: "test" });
    const pointerBefore = await readFile(path.join(sourceRoot, "current.json"), "utf8");
    let capturedInput;
    const runtime = createThoughtLineContextRuntime({
      sourceRoot,
      contextRoot,
      promptVersion: "thought-line-context-v0.1",
      model: "test-model",
      now: () => new Date("2026-08-24T04:00:00.000Z"),
      contextAgent: async (input) => {
        capturedInput = input;
        return {
          entryCards: input.entries.map((entry) => ({
            entryId: entry.id,
            type: "对求职的思考",
            summary: `概要：${entry.title}`,
            topics: ["秋招"],
            entities: [],
            uncertainty: [],
          })),
          contextMarkdown: "# 秋招\n\n## 当前认识\n\n尚未强行建立关系。\n",
        };
      },
    });

    const result = await runtime.buildContext("line-autumn");

    assert.equal(result.sourceGenerationId, written.generationId);
    assert.deepEqual(capturedInput.entries.map((entry) => entry.id), [101, 102]);
    assert.deepEqual(capturedInput.entries[1].thoughtLineIds, ["line-autumn", "line-ai"]);
    assert.equal(capturedInput.entries.some((entry) => entry.id === 103), false);
    assert.equal(capturedInput.entries.some((entry) => entry.id === 104), false);
    assert.equal((await readLocalData(sourceRoot)).generationId, written.generationId);
    assert.equal(await readFile(path.join(sourceRoot, "current.json"), "utf8"), pointerBefore);

    const card = JSON.parse(await readFile(path.join(contextRoot, "entries", "101", "card.json"), "utf8"));
    assert.equal(card.entryId, 101);
    assert.equal(card.sourceGenerationId, written.generationId);
    assert.equal(card.promptVersion, "thought-line-context-v0.1");
    assert.equal(Object.hasOwn(card, "content"), false, "EntryCard must not duplicate source text");
    assert.match(await readFile(path.join(contextRoot, "thought-lines", "line-autumn", "context.md"), "utf8"), /尚未强行建立关系/);

    const manifest = JSON.parse(await readFile(path.join(contextRoot, "manifest.json"), "utf8"));
    assert.equal(manifest.sourceGenerationId, written.generationId);
    assert.deepEqual(manifest.thoughtLines, ["line-autumn"]);
    assert.deepEqual(manifest.entryIds, ["101", "102"]);
    assert.equal(Object.hasOwn(manifest, "echoRecords"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("evaluateRelations navigates once, verifies once, and never creates an EchoRecord", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "huiye-thought-line-relation-"));
  const sourceRoot = path.join(temp, "source-local-data");
  const contextRoot = path.join(temp, "thought-line-context");
  const evaluationRoot = path.join(temp, "thought-line-evaluation");
  try {
    const relationSource = sourceFixture();
    relationSource.entries.push({ id: 105, title: "秋招三", content: "第三篇原文", createdAt: "2026-08-24T04:00:00.000Z", tags: ["求职"], source: "测试", aiLink: true, thoughtLineIds: ["line-autumn"] });
    await writeLocalData(sourceRoot, relationSource, { source: "test" });
    let navigationCalls = 0;
    let verificationCalls = 0;
    let verificationInput;
    const runtime = createThoughtLineContextRuntime({
      sourceRoot,
      contextRoot,
      evaluationRoot,
      promptVersion: "thought-line-context-v0.1",
      navigationPromptVersion: "thought-line-relation-navigation-v0.1",
      verificationPromptVersion: "thought-line-relation-verification-v0.1",
      model: "test-model",
      now: () => new Date("2026-08-24T04:00:00.000Z"),
      contextAgent: async (input) => ({
        entryCards: input.entries.map((entry) => ({ entryId: entry.id, type: "思考", summary: entry.title, topics: ["秋招"], entities: [], uncertainty: [] })),
        contextMarkdown: "# 秋招\n\nEntry 101 与 102 可能存在待核验关系。\n",
      }),
      navigationAgent: async (input) => {
        navigationCalls += 1;
        assert.equal(input.entries.some((entry) => Object.hasOwn(entry, "content")), false, "Navigation Agent only reads EntryCards");
        return {
          candidates: [
            { sourceEntryIds: [101, 102], expectedRelationType: "continuation", reason: "不得传给核验 Agent" },
            { sourceEntryIds: [102, 105], expectedRelationType: "revision" },
          ],
        };
      },
      verificationAgent: async (input) => {
        verificationCalls += 1;
        verificationInput = input;
        return {
          attempts: [
            { sourceEntryIds: [101, 102], decision: "rejected", rejectionStage: "no_manifestation_gain", reason: "只有同主题。" },
            {
              sourceEntryIds: [102, 105],
              decision: "accepted",
              relationType: "branch",
              evidence: [{ entryId: 102, quote: "交汇原文" }, { entryId: 105, quote: "第三篇原文" }],
              sourceSummaries: [{ entryId: 102, text: "交汇篇" }, { entryId: 105, text: "第三篇" }],
              reason: "两篇形成了一个可核验分支。",
              uncertainty: "仍需用户判断。",
              manifestationGain: "组合后才显出的分支。",
              explanationRisk: "low",
            },
          ],
        };
      },
    });
    await runtime.buildContext("line-autumn");
    const result = await runtime.evaluateRelations("line-autumn");

    assert.equal(navigationCalls, 1);
    assert.equal(verificationCalls, 1);
    assert.equal(verificationInput.candidates.length, 2);
    assert.equal(Object.hasOwn(verificationInput.candidates[0], "reason"), false, "persuasive navigation reasons must be stripped");
    assert.deepEqual(verificationInput.entries.map((entry) => entry.id), [101, 102, 105]);
    assert.equal(result.decision, "accepted");
    assert.deepEqual(result.sourceEntryIds, [102, 105]);

    const run = JSON.parse(await readFile(result.evaluationPath, "utf8"));
    assert.equal(run.lifecycle, "evaluation_only");
    assert.equal(run.echoRecordId, undefined);
    assert.equal((await readLocalData(sourceRoot)).data.echoes.length, 0);
    assert.deepEqual(await readdir(path.join(evaluationRoot, "runs")), [path.basename(path.dirname(result.evaluationPath))]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
