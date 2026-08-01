import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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

test("allows only loopback same-origin requests to the local data API", () => {
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "127.0.0.1:4317", origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin" } }), true);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "localhost:4317" } }), true);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "127.0.0.1:4317", origin: "https://attacker.example", "sec-fetch-site": "cross-site" } }), false);
  assert.equal(isLocalDataRequestAllowed({ headers: { host: "192.168.1.20:4317" } }), false);
});
