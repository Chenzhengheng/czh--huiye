import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
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
  assert.doesNotMatch(page, /删除后无法恢复|setEntries\(current => current\.filter\(entry => entry\.id !== selected\.id\)/);
  assert.match(page, /createData\(\[\], \[\], \[\]\)/);
  assert.match(page, /内容保存在本地文件夹/);
  assert.match(page, /旧代次不会自动删除/);
  assert.match(page, /删除（回收站待完成）/);
});

test("saves user tags from the writing page into the new Entry", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const \[writeTags, setWriteTags\] = useState<string\[\]>\(\[\]\)/);
  assert.match(page, /<TagEditor tags=\{writeTags\} onChange=\{setWriteTags\}/);
  assert.match(page, /tags: writeTags/);
  assert.match(page, /setWriteTags\(\[\]\)/);
  assert.match(page, /thoughtLineSelections: writeThoughtLineSelections/);
  assert.match(page, /setWriteTags\(pendingDraft\.tags \|\| \[\]\)/);
});

test("does not revive the retired v1 echo flow", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /fetch\("\/api\/recall"/);
  assert.doesNotMatch(page, /function prepareEcho|reconsiderLatestEcho/);
  assert.match(page, /setEchoes\(\[\]\)/);
  assert.match(page, /const restoredEchoes: Echo\[\] = \[\]/);
  assert.match(page, /<EchoCard/);
  assert.match(page, /\/api\/echo-records/);
  assert.match(page, /\/api\/echo-events/);
  assert.match(page, /一次只遇见一页/);
  assert.match(page, /echo-presence-dot/);
  assert.match(page, /response_started/);
  assert.match(page, /response_saved/);
  assert.doesNotMatch(page, /约 80%|约 20%/);
  assert.doesNotMatch(worker, /\/api\/recall|prepareRecall|RECALL_SCHEMA|OPENROUTER_API_KEY/);
});

test("uses the confirmed three-level source disclosure without embedding private diary text in code", async () => {
  const card = await readFile(new URL("../app/echo-card.tsx", import.meta.url), "utf8");

  assert.match(card, /查看原文/);
  assert.match(card, /原文节选/);
  assert.match(card, /展开整篇/);
  assert.match(card, /完整原文/);
  assert.match(card, /AI 暂时看见 · 由你判断/);
  assert.match(card, /看清了一点/);
  assert.match(card, /我已经知道了/);
  assert.match(card, /不太对/);
  assert.doesNotMatch(card, /第一份工作强调的是|出类拔萃，一定是热爱|腾讯、Joe/);
});

test("uses the real date and keeps demo data isolated from private evaluation", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function formatWritingDate/);
  assert.match(page, /formatWritingDate\(now\)/);
  assert.doesNotMatch(page, /2026 年 7 月 17 日/);
  assert.doesNotMatch(page, /你在 4 月留下的疑问|引用了 3 篇你允许关联的记录/);
  assert.match(page, /展示模式永不读取或展示私人日记/);
  assert.match(page, /evaluationMode === "demo"/);
});

test("exposes the three ThoughtLine assignment entries and formal echo boundary", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /label: "思考线"/);
  assert.match(page, /writeThoughtLineSelections/);
  assert.match(page, /edit\.thoughtLineSelections/);
  assert.match(page, /从日记池加入/);
  assert.match(page, /record\.thoughtLineId/);
  assert.match(page, /record\.lifecycle !== "legacy_evaluation"/);
  assert.match(page, /line\.allowEcho/);
  assert.match(page, /entry\?\.aiLink/);
});

test("structures evaluation cases and switches to an overview table after fifteen", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /echoRecords\.length <= 15/);
  assert.match(page, /className="evaluation-sources"/);
  assert.match(page, /AI 模型输出 · 由你判断/);
  assert.match(page, /className="evaluation-table"/);
  assert.match(page, /点击一个 case 编号，展开完整原文证据与评测操作/);
  assert.match(page, /参考答案将在\s*good\s*case\s*稳定后建立/);
  assert.match(css, /\.evaluation-sources\s*\{/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("keeps ThoughtLine assignment as a marked tag and fits the first writing screen", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /tag-editor thought-line-tag-editor/);
  assert.match(page, /思考线将你的思考连接/);
  assert.match(page, /line\.name === nextValue/);
  assert.match(page, /onChange\(\[\.\.\.selections, existing\.id\]\)/);
  assert.match(page, /paddingTop: 20/);
  assert.match(css, /\.write-page \.save-row/);
  assert.match(css, /\.thought-line-tag-editor > button/);
  assert.match(css, /\.edit-tags-row\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.edit-tags-row > div\s*\{[^}]*width:\s*100%/s);
});

test("does not retain the retired AI organization client", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /fetch\("\/api\/organize"/);
  assert.doesNotMatch(page, /DEFAULT_ORGANIZE_PROMPT|ORGANIZATION_SAMPLE|OrganizationExample/);
  assert.doesNotMatch(page, /huiye-organization-prompt-v1|huiye-organization-examples-v1/);
  assert.doesNotMatch(worker, /\/api\/organize|organizeDiary|ORGANIZE_PROMPT|ORGANIZE_SCHEMA/);
});

test("keeps hosted builds free of private data APIs and bindings", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

  assert.doesNotMatch(worker, /\/api\/data|R2Bucket|huiye-data\.json|oai-authenticated-user-email/);
  assert.equal(hosting.r2, null);
});
