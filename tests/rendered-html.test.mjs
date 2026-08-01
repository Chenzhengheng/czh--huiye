import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function createDataBucket() {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      const value = objects.get(key);
      if (!value) return null;
      return {
        uploaded: value.uploaded,
        async text() { return value.contents; },
      };
    },
    async put(key, contents) {
      objects.set(key, { contents, uploaded: new Date() });
    },
  };
}

async function render() {
  const worker = await loadWorker();

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Huiye writing canvas", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>回页 · 让思考继续生长<\/title>/i);
  assert.match(html, /此刻，想留下什么？/);
  assert.match(html, /class="paper rich-paper"/);
  assert.match(html, /class="rich-editor"/);
  assert.match(html, /height:304px/);
  assert.doesNotMatch(html, /支持 Markdown/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps the writing canvas responsive to rendered lines", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /WRITE_LINE_HEIGHT = 41/);
  assert.match(page, /WRITE_MIN_LINES = 6/);
  assert.match(page, /WRITE_MAX_LINES = 15/);
  assert.match(page, /new ResizeObserver\(\(\) => measureWritingEditor\(\)\)/);
  assert.match(page, /editor\.cloneNode\(true\)/);
  assert.match(page, /mirror\.scrollHeight \/ WRITE_LINE_HEIGHT/);
  assert.match(page, /writeLines \+ 3/);
  assert.match(page, /writeLines >= WRITE_MAX_LINES \? "auto" : "hidden"/);
  assert.match(page, /Array\.from\(markdownPreviewText\(firstLine\)\)\.slice\(0, 15\)/);
});

test("never seeds or clears diary data automatically", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /const seedEntries|createData\(seedEntries|clearLegacyData/);
  assert.match(page, /createData\(\[\], \[\], \[\]\)/);
  assert.match(page, /内容保存在本地文件夹/);
  assert.match(page, /旧代次不会自动删除/);
});

test("requires a signed-in ChatGPT user for private data", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/data"),
    { DATA: createDataBucket() },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);
});

test("persists data separately for each signed-in account", async () => {
  const worker = await loadWorker();
  const bucket = createDataBucket();
  const env = { DATA: bucket };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const data = {
    format: "huiye-backup",
    version: 1,
    exportedAt: "2026-07-31T00:00:00.000Z",
    entries: [{ id: 1, title: "私人思考" }],
    echoes: [],
    echoCheckedIds: [],
  };

  const saveResponse = await worker.fetch(
    new Request("http://localhost/api/data", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "owner@example.com",
      },
      body: JSON.stringify(data),
    }),
    env,
    context,
  );
  assert.equal(saveResponse.status, 200);
  assert.equal(bucket.objects.size, 1);
  assert.doesNotMatch([...bucket.objects.keys()][0], /owner@example\.com/);

  const readResponse = await worker.fetch(
    new Request("http://localhost/api/data", {
      headers: { "oai-authenticated-user-email": "owner@example.com" },
    }),
    env,
    context,
  );
  assert.equal(readResponse.status, 200);
  const saved = await readResponse.json();
  assert.equal(saved.data.entries[0].title, "私人思考");

  const otherResponse = await worker.fetch(
    new Request("http://localhost/api/data", {
      headers: { "oai-authenticated-user-email": "other@example.com" },
    }),
    env,
    context,
  );
  assert.equal(otherResponse.status, 200);
  assert.equal((await otherResponse.json()).data, null);
});
