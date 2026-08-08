import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEchoEvent, readEchoRecords, writeEchoRecord } from "../build/echo-record-store.mjs";
import { readLocalData, writeLocalData } from "../build/local-data-store.mjs";
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
