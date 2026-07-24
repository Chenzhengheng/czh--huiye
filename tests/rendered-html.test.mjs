import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

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
});
