import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEchoEvent, readEchoRecords, writeEchoRecord } from "../build/echo-record-store.mjs";
import { pruneLocalDataGenerations, readLocalData, selectRetainedGenerationIds, writeLocalData } from "../build/local-data-store.mjs";
import { isLocalDataRequestAllowed } from "../build/local-data-vite-plugin.mjs";

function fixture() {
  return {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-08-01T00:00:00.000Z",
    entries: [
      {
        id: 101,
        title: "第一篇思考",
        content: "原句必须完整保留。\n\n第二段。",
        createdAt: "2026-08-01T00:00:00.000Z",
        tags: ["验证"],
        source: "测试",
        aiLink: true,
        attachments: [{ name: "证据.txt", type: "text/plain", data: "附件原文" }],
      },
      {
        id: 102,
        title: "第二篇思考",
        content: "用于建立关系。",
        createdAt: "2026-08-01T01:00:00.000Z",
        tags: [],
        source: "测试",
        aiLink: false,
      },
    ],
    echoes: [{ id: "echo-1", currentEntryId: 102, previousEntryId: 101, quote: "原句必须完整保留。", reason: "条件发生变化", createdAt: "2026-08-01T02:00:00.000Z", status: "pending" }],
    echoCheckedIds: [102],
  };
}

function echoFixture() {
  return {
    schemaVersion: 2,
    id: "echo-test-1",
    mode: "relational",
    sourceEntryIds: [101, 102],
    triggerEntryId: 102,
    evidence: [
      { entryId: 101, quote: "原句必须完整保留。" },
      { entryId: 102, quote: "用于建立关系。" },
    ],
    sourceSummaries: [
      { entryId: 101, text: "第一篇的浓缩" },
      { entryId: 102, text: "第二篇的浓缩" },
    ],
    reason: "两篇记录出现了可核验的变化。",
    question: "这次变化对你意味着什么？",
    discoveredAt: "2026-08-02T00:00:00.000Z",
    eligibleAfter: "2026-08-03T00:00:00.000Z",
    ruleVersion: "test-1",
    events: [],
  };
}

function echoFixtureWithSources(id, sourceEntryIds) {
  const record = echoFixture();
  record.id = id;
  record.sourceEntryIds = sourceEntryIds;
  record.triggerEntryId = sourceEntryIds.at(-1);
  record.evidence = sourceEntryIds.map((entryId) => ({ entryId, quote: `Entry ${entryId} 的逐字证据。` }));
  record.sourceSummaries = sourceEntryIds.map((entryId) => ({ entryId, text: `Entry ${entryId} 的浓缩。` }));
  return record;
}

test("writes immutable generations and reconstructs human-readable entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    assert.equal(await readLocalData(root), null);
    const first = await writeLocalData(root, fixture(), { source: "test" });
    const loaded = await readLocalData(root);
    assert.equal(loaded.generationId, first.generationId);
    assert.equal(loaded.data.entries.length, 2);
    assert.equal(loaded.data.entries[0].content, "原句必须完整保留。\n\n第二段。");
    assert.deepEqual(loaded.data.entries[0].attachments, [{ name: "证据.txt", type: "text/plain", data: "附件原文" }]);
    assert.equal(loaded.data.echoes[0].previousEntryId, 101);

    const entryDir = path.join(root, "generations", first.generationId, "entries", "101");
    assert.equal(await readFile(path.join(entryDir, "content.md"), "utf8"), "原句必须完整保留。\n\n第二段。");

    const changed = fixture();
    changed.entries[1].content = "新的当前内容";
    const second = await writeLocalData(root, changed, { source: "test-edit" });
    assert.notEqual(second.generationId, first.generationId);
    const generations = (await readdir(path.join(root, "generations"))).filter(name => !name.startsWith(".staging-"));
    assert.equal(generations.length, 2);
    assert.equal((await readLocalData(root)).data.entries[1].content, "新的当前内容");
    assert.equal(await readFile(path.join(root, "generations", first.generationId, "entries", "102", "content.md"), "utf8"), "用于建立关系。");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid writes without changing the current generation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const first = await writeLocalData(root, fixture(), { source: "test" });
    const invalid = fixture();
    invalid.entries[1].id = invalid.entries[0].id;
    await assert.rejects(() => writeLocalData(root, invalid), /日记 ID 重复/);
    assert.equal((await readLocalData(root)).generationId, first.generationId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists thought lines, memberships and evaluation records in a recoverable generation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const data = fixture();
    data.thoughtLines = [{
      id: "line-product",
      name: "回页-产品",
      status: "active",
      allowEcho: true,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    }];
    data.entries[0].thoughtLineIds = ["line-product"];
    data.caseRecords = [{
      id: "case-1",
      echoRecordId: "echo-test-1",
      verdict: "good",
      feedback: "clarified",
      dimensions: {
        relationValidity: "high",
        manifestationGain: "medium",
        reencounterFeeling: "low",
      },
      promptVersion: "echo-eval-v0.1",
      reasonCodes: ["manifested_change", "recent_understanding_low_increment"],
      userFeedbackText: "变化确实存在，但因为刚刚悟出来，感触增量较低。",
      createdAt: "2026-08-08T00:00:00.000Z",
    }];
    data.echoReplies = [{
      id: "reply-1",
      echoRecordId: "echo-test-1",
      content: "AI 可以帮我看清变化，但初稿仍应由我完成。",
      createdAt: "2026-08-08T00:01:00.000Z",
      updatedAt: "2026-08-08T00:01:00.000Z",
    }];
    await writeLocalData(root, data, { source: "test" });
    const restored = (await readLocalData(root)).data;
    assert.deepEqual(restored.thoughtLines, data.thoughtLines);
    assert.deepEqual(restored.entries[0].thoughtLineIds, ["line-product"]);
    assert.deepEqual(restored.caseRecords, data.caseRecords);
    assert.deepEqual(restored.echoReplies, data.echoReplies);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retains recent, daily and monthly generation recovery points", () => {
  const generations = [];
  for (let day = 0; day < 45; day += 1) {
    for (let version = 0; version < 2; version += 1) {
      const date = new Date(Date.UTC(2026, 7, 13 - day, 8 + version, 0, 0));
      generations.push({ generationId: `day-${day}-${version}`, updatedAt: date.toISOString() });
    }
  }
  generations.push({ generationId: "june-last", updatedAt: "2026-06-30T15:00:00.000Z" });
  generations.push({ generationId: "june-older", updatedAt: "2026-06-01T01:00:00.000Z" });

  const retained = selectRetainedGenerationIds(generations, "day-0-1", new Date("2026-08-13T12:00:00+08:00"));
  assert.equal(retained.has("day-0-1"), true);
  assert.equal(retained.has("day-9-0"), true, "the latest 20 generations stay dense");
  assert.equal(retained.has("day-20-1"), true, "the latest generation for a recent day is retained");
  assert.equal(retained.has("day-20-0"), false, "an older same-day generation is pruned");
  assert.equal(retained.has("june-last"), true, "the latest generation for an older month is retained");
  assert.equal(retained.has("june-older"), false);
});

test("prunes obsolete generations only after creating a recoverable backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-retention-"));
  try {
    const current = await writeLocalData(root, fixture(), { source: "test" });
    const generationsDir = path.join(root, "generations");
    const historyDir = path.join(root, "pointer-history");
    await mkdir(historyDir, { recursive: true });
    for (let index = 0; index < 24; index += 1) {
      const generationId = `old-${String(index).padStart(2, "0")}`;
      const generationDir = path.join(generationsDir, generationId);
      await mkdir(generationDir, { recursive: true });
      await writeFile(path.join(generationDir, "generation.json"), `${JSON.stringify({
        format: "huiye-local-store",
        version: 1,
        generationId,
        updatedAt: new Date(Date.UTC(2026, 7, 12, index, 0, 0)).toISOString(),
      })}\n`, "utf8");
      await writeFile(path.join(historyDir, `${generationId}.previous.json`), `${JSON.stringify({ generationId })}\n`, "utf8");
    }

    const result = await pruneLocalDataGenerations(root, {
      force: true,
      now: new Date("2026-08-13T18:00:00+08:00"),
    });
    assert.equal(result.deleted.length > 0, true);
    assert.equal((await readdir(generationsDir)).includes(current.generationId), true);
    const backup = JSON.parse(await readFile(path.join(root, result.initialBackupPath), "utf8"));
    assert.equal(backup.entries.length, fixture().entries.length);
    assert.equal((await readLocalData(root)).generationId, current.generationId);
    const history = await readdir(historyDir);
    assert.equal(history.some(name => result.deleted.some(id => name.startsWith(id))), false);

    const second = await pruneLocalDataGenerations(root, {
      now: new Date("2026-08-13T20:00:00+08:00"),
    });
    assert.equal(second.skipped, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unknown CaseRecord evaluation levels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const data = fixture();
    data.caseRecords = [{
      id: "case-invalid-level",
      echoRecordId: "echo-test-1",
      dimensions: { relationValidity: "almost" },
      createdAt: "2026-08-09T00:00:00.000Z",
    }];
    await assert.rejects(
      () => writeLocalData(root, data),
      /CaseRecord 评测维度无效/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicate EchoReplies for the same EchoRecord", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const data = fixture();
    data.echoReplies = [
      { id: "reply-1", echoRecordId: "echo-test-1", content: "第一条", createdAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-08T00:00:00.000Z" },
      { id: "reply-2", echoRecordId: "echo-test-1", content: "第二条", createdAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-08T00:00:00.000Z" },
    ];
    await assert.rejects(() => writeLocalData(root, data), /一条回响只能保存一个回应/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovers from a broken current pointer by scanning valid generations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const first = await writeLocalData(root, fixture(), { source: "test" });
    await writeFile(path.join(root, "current.json"), '{"generationId":"missing"}\n', "utf8");
    const recovered = await readLocalData(root);
    assert.equal(recovered.generationId, first.generationId);
    assert.equal(recovered.data.entries.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotes a complete newer staging generation after an interrupted save", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-local-store-"));
  try {
    const first = await writeLocalData(root, fixture(), { source: "test" });
    const changed = fixture();
    changed.entries.unshift({
      id: 103,
      title: "中断后仍应恢复",
      content: "这篇记录已经完整写入暂存代次。",
      createdAt: "2026-08-01T03:00:00.000Z",
      tags: [],
      source: "测试",
      aiLink: true,
    });
    const second = await writeLocalData(root, changed, { source: "local-app" });
    const finalDir = path.join(root, "generations", second.generationId);
    const stagingDir = path.join(root, "generations", `.staging-${second.generationId}`);
    await rename(finalDir, stagingDir);
    await writeFile(path.join(root, "current.json"), `${JSON.stringify({
      format: "huiye-local-store",
      version: 1,
      generationId: first.generationId,
      updatedAt: first.updatedAt,
    }, null, 2)}\n`, "utf8");

    const recovered = await readLocalData(root);
    assert.equal(recovered.generationId, second.generationId);
    assert.equal(recovered.data.entries.length, 3);
    assert.equal(JSON.parse(await readFile(path.join(root, "current.json"), "utf8")).generationId, second.generationId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("allows only loopback same-origin requests to the local data API", () => {
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "127.0.0.1:4317", origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin" } }), true);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "localhost:4317" } }), true);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "127.0.0.1:4317", origin: "https://attacker.example", "sec-fetch-site": "cross-site" } }), false);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "192.168.1.20:4317" } }), false);
});

test("stores reviewed EchoRecords separately and appends verified continuation events", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    await writeEchoRecord(root, echoFixture());
    const records = await readEchoRecords(root);
    assert.equal(records.length, 1);
    assert.equal(records[0].sourceSummaries.length, 2);

    await appendEchoEvent(root, "echo-test-1", { type: "continuation_started", createdAt: "2026-08-04T00:00:00.000Z" });
    const saved = await appendEchoEvent(root, "echo-test-1", { type: "continuation_saved", resultEntryId: 103, createdAt: "2026-08-04T01:00:00.000Z" });
    assert.deepEqual(saved.events.map(event => event.type), ["continuation_started", "continuation_saved"]);
    assert.equal(saved.events[1].resultEntryId, 103);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stores reencounter feedback and saved response events", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    await writeEchoRecord(root, echoFixture());
    const feedback = await appendEchoEvent(root, "echo-test-1", {
      type: "feedback_submitted",
      feedback: "accurate_no_resonance",
      reasonCodes: ["already_active_understanding"],
      createdAt: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(feedback.events[0].feedback, "accurate_no_resonance");
    assert.match(feedback.events[0].id, /^event-/);

    const saved = await appendEchoEvent(root, "echo-test-1", {
      type: "response_saved",
      resultEntryId: 103,
      createdAt: "2026-08-05T01:00:00.000Z",
    });
    assert.equal(saved.events[1].resultEntryId, 103);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid reencounter feedback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    await writeEchoRecord(root, echoFixture());
    await assert.rejects(() => appendEchoEvent(root, "echo-test-1", {
      type: "feedback_submitted",
      feedback: "liked_it",
    }), /feedback/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects incomplete EchoRecords before creating a private relation file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    const invalid = echoFixture();
    invalid.sourceSummaries = invalid.sourceSummaries.slice(0, 1);
    await assert.rejects(() => writeEchoRecord(root, invalid), /sourceSummaries/);
    assert.deepEqual(await readEchoRecords(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts an evaluation-only EchoRecord without promoting it to a formal candidate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    const record = echoFixture();
    record.lifecycle = "evaluation_only";
    await writeEchoRecord(root, record);
    assert.equal((await readEchoRecords(root))[0].lifecycle, "evaluation_only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects writing an EchoRecord that would reuse one source for the third time", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    await writeEchoRecord(root, echoFixtureWithSources("echo-reuse-1", [101, 102]));
    await writeEchoRecord(root, echoFixtureWithSources("echo-reuse-2", [101, 103]));

    await assert.rejects(
      () => writeEchoRecord(root, echoFixtureWithSources("echo-reuse-3", [101, 104])),
      /第三次/,
    );
    assert.equal((await readEchoRecords(root)).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("allows third source use when the write includes a complete strong-change exception", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "huiye-echo-store-"));
  try {
    await writeEchoRecord(root, echoFixtureWithSources("echo-exception-1", [101, 102]));
    await writeEchoRecord(root, echoFixtureWithSources("echo-exception-2", [101, 103]));

    await writeEchoRecord(
      root,
      echoFixtureWithSources("echo-exception-3", [101, 104]),
      {
        sourceReuseExceptions: [
          {
            entryId: 101,
            materialChange: { passed: true, reason: "后来的行动结果修正了早期判断。" },
            indispensableSource: { passed: true, reason: "删除早期来源后修正链不成立。" },
            nonRestatement: { passed: true, reason: "候选显化了任意单篇都没有说清的变化。" },
          },
        ],
      },
    );

    assert.equal((await readEchoRecords(root)).length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
