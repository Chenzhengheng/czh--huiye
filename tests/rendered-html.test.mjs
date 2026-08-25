import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render(pathname = "/", origin = "http://localhost") {
  const worker = await loadWorker();
  const url = new URL(pathname, origin);

  return worker.fetch(
    new Request(url, {
      headers: {
        accept: "text/html",
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.slice(0, -1),
      },
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

test("shows the ICP filing link on every mainland public page", async () => {
  for (const pathname of ["/", "/portfolio/demo", "/portfolio/demo/evaluation"]) {
    const response = await render(pathname, "https://huiye-ai.cn");
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.match(html, /粤ICP备2026122805号/);
    assert.match(html, /href="https:\/\/beian\.miit\.gov\.cn\/"/);
  }
});

test("does not add mainland compliance copy to the overseas backup", async () => {
  const response = await render(
    "/",
    "https://huiye-ai-diary.zhenghengchen13.chatgpt.site",
  );
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /粤ICP备2026122805号/);
});

test("keeps the public root free of visit tracking while preserving the legacy portfolio route", async () => {
  const rootResponse = await render("/", "https://huiye-ai.cn");
  assert.equal(rootResponse.status, 200);
  assert.doesNotMatch(await rootResponse.text(), /portfolio-visit-beacon/);

  const legacyResponse = await render(
    "/portfolio",
    "https://huiye-ai-diary.zhenghengchen13.chatgpt.site",
  );
  assert.equal(legacyResponse.status, 200);
  assert.match(await legacyResponse.text(), /portfolio-visit-beacon/);
});

test("renders the portfolio at the public root instead of the private writing canvas", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /让思考/);
  assert.match(html, /继续生长/);
  assert.match(html, /从 0 到 1 独立负责回页的产品定位/);
  assert.match(html, /体验回页/);
  assert.match(html, /查看完整评测/);
  assert.match(html, /负责人：陈政亨/);
  assert.match(html, /回页是一款能随时随地、无负担地记录思考，并让思考彼此连接的 AI 原生记录产品/);
  assert.match(html, /回页<\/b><em>让思考继续生长<\/em>/);
  assert.match(html, /回页完整用户流程图/);
  assert.match(html, /github\.com\/Chenzhengheng\/czh--huiye/);
  assert.doesNotMatch(html, /此刻，想留下什么？/);
});

test("presents the portfolio as a Chinese evidence-led project archive", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /产品核心/);
  assert.match(html, /用户流程图/);
  assert.match(html, /回响评测/);
  assert.match(html, /思考线（ThoughtLine）/);
  assert.match(html, /回响（Echo）/);
  assert.match(html, /工程交付/);
  assert.doesNotMatch(html, /AI PRODUCT|CASE STUDY|USER FLOW|EVALUATION|PRODUCT/);

  const productIndex = html.indexOf('id="product"');
  const flowIndex = html.indexOf('id="flow"');
  const evaluationIndex = html.indexOf('id="evaluation"');
  const deliveryIndex = html.indexOf('id="delivery"');
  assert.ok(productIndex > -1 && productIndex < flowIndex);
  assert.ok(flowIndex < evaluationIndex);
  assert.ok(evaluationIndex < deliveryIndex);

  assert.match(html, /日记 A/);
  assert.match(html, /日记 B/);
  assert.match(html, /均来自真实脱敏笔记/);
  assert.match(html, /思考中隐藏的变化显化/);
  assert.match(html, /一条真实产品思考线/);
  assert.match(html, /我真正缺少的是：让一段思考拥有后续生命的机制/);
  assert.match(html, /AI 选择后两篇作为最小充分证据/);
  assert.ok((html.match(/✦ 回页/g) ?? []).length >= 6);
  assert.match(html, /CASE 01 · BAD/);
  assert.match(html, /CASE 10 · GOOD/);
  assert.match(html, /AI 的最后问题/);
  assert.match(html, /缺少上下文的环境/);
  assert.match(html, /AI 的判断令我一点惊喜都没有/);
  assert.match(html, /我得到了反馈后对自己结论的修正/);
  assert.match(html, /在我阅读了《复利效应》的一部分后/);
  assert.match(html, /阅读《复利效应》后会发现/);
  assert.match(html, /比较惊喜。我惊觉对我产品定位和AI思考都有突破的来源都是《复利效应》/);
  assert.match(html, /Prompt v0\.3/);
  assert.doesNotMatch(html, /进入回页演示/);
});

test("keeps PortfolioMode explicit and isolated from private storage", async () => {
  const response = await render("/portfolio/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  const page = await readFile(
    new URL("../app/huiye-app.tsx", import.meta.url),
    "utf8",
  );
  const seed = await readFile(
    new URL("../app/portfolio/demo/demo-seed.ts", import.meta.url),
    "utf8",
  );
  const entries = await readFile(
    new URL("../app/portfolio/demo/demo-entries.ts", import.meta.url),
    "utf8",
  );
  const evaluation = await readFile(
    new URL("../app/portfolio/demo/demo-evaluation.ts", import.meta.url),
    "utf8",
  );

  assert.match(html, /data-runtime-mode="portfolio"/);
  assert.match(html, /脱敏演示/);
  assert.match(html, /固定公开数据，不读取私人日记/);
  assert.match(page, /if \(portfolioMode\) \{/);
  assert.match(page, /PortfolioMode 不允许写入私人数据接口/);
  assert.match(page, /操作只在当前会话生效，不会保存/);
  assert.match(seed, /user-approved MinimumRedaction data/);
  assert.match(entries, /export const portfolioEntries/);
  assert.equal((entries.match(/\n  entry\(/g) ?? []).length, 13);
  assert.equal((evaluation.match(/id: "case-\d{2}"/g) ?? []).length, 10);
  assert.match(
    evaluation,
    /id: "echo-eval-v03-case-01"[\s\S]*?lifecycle: "candidate"/,
  );
  assert.match(
    page,
    /setCurrentEchoId\(\s*selectCurrentEcho\(\s*seed\.echoRecords/,
  );
  assert.doesNotMatch(
    `${seed}\n${entries}\n${evaluation}`,
    /local-data|api\/data|api\/echo-records|腾讯|字节|coze|Joe|尚文|明俊|程昊|王者|剑灵|三角洲|飞书/,
  );
});

test("keeps portfolio diary data redacted and orders the diary pool newest first", async () => {
  const demoEntries = await readFile("app/portfolio/demo/demo-entries.ts", "utf8");
  const appPage = await readFile("app/huiye-app.tsx", "utf8");

  assert.doesNotMatch(demoEntries, /大公司在8\.15左右开始投递/);
  assert.doesNotMatch(demoEntries, /学习婉拒、接受、谈薪等话术/);
  assert.doesNotMatch(demoEntries, /未来开发都会被取代的，他们没机会了/);
  assert.doesNotMatch(demoEntries, /从UGC知识库到VLM再到游戏娱乐陪伴/);
  assert.match(
    appPage,
    /\.sort\(\(left, right\) => entryTimestamp\(right\) - entryTimestamp\(left\)\)/,
  );
});

test("server-renders the private Huiye writing canvas at its dedicated entry", async () => {
  const response = await render("/app");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>回页 · 让思考继续生长<\/title>/i);
  assert.match(html, /此刻，想留下什么？/);
  assert.match(html, /不急着下结论，顺着念头再想一点。/);
  assert.match(html, /一段推理、一个疑问，或正在形成的看法……/);
  assert.match(html, /class="[^"]*\bpaper\b[^"]*\brich-paper\b[^"]*"/);
  assert.match(html, /class="rich-editor"/);
  assert.match(html, /height:304px/);
  assert.doesNotMatch(html, /支持 Markdown/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps the desktop launcher pointed at the private Huiye entry", async () => {
  const launcher = await readFile(
    new URL("../scripts/start-huiye-ui.ps1", import.meta.url),
    "utf8",
  );
  const consoleLauncher = await readFile(
    new URL("../scripts/start-huiye-local.ps1", import.meta.url),
    "utf8",
  );

  assert.match(launcher, /\$url = "http:\/\/localhost:4317\/app"/);
  assert.match(consoleLauncher, /\$url = "http:\/\/localhost:4317\/app"/);
});

test("uses a cache-busting high-contrast desktop icon", async () => {
  const installer = await readFile(
    new URL("../scripts/install-huiye-shortcut.ps1", import.meta.url),
    "utf8",
  );

  assert.match(installer, /huiye-desktop-icon-v2\.png/);
  assert.match(installer, /huiye-desktop-icon-v2\.ico/);
  assert.match(installer, /ie4uinit\.exe/);
  assert.match(installer, /-ArgumentList "-show"/);
});

test("uses one lined editor with context-specific outer-page following", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");
  const model = await readFile(new URL("../app/lined-editor-model.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(model, /LINED_EDITOR_LINE_HEIGHT = 41/);
  assert.match(model, /LINED_EDITOR_MIN_LINES = 6/);
  assert.match(model, /LINED_EDITOR_MAX_LINES = 15/);
  assert.equal((page.match(/<LinedMarkdownEditor/g) ?? []).length, 2);
  assert.doesNotMatch(page, /transform: `translateY/);
  assert.doesNotMatch(page, /Markdown 编辑|预览 Markdown|previewMarkdown/);
  assert.match(page, /followCaretAfterInput/);
  assert.match(page, /paper\.appendChild\(mirror\)/);
  assert.match(page, /editor\.scrollTo\(\{ top: nextScrollTop, behavior: "auto" \}\)/);
  assert.match(page, /pageScrollBeforeInputRef/);
  assert.match(page, /followWritingPageAfterInput/);
  assert.match(page, /restorePoolBackgroundScroll/);
  assert.match(page, /context === "write"/);
  assert.doesNotMatch(page, /behavior: reduceMotion \? "auto" : "smooth"/);
  assert.match(page, /context="write"/);
  assert.match(page, /context="pool"/);
  assert.match(page, /Array\.from\(markdownPreviewText\(firstLine\)\)\.slice\(0, 15\)/);
  assert.doesNotMatch(css, /overscroll-behavior:\s*contain/);
  assert.match(
    css,
    /\.lined-markdown-editor-pool\s*\{[^}]*background:\s*#faf9f5/s,
  );
  assert.match(
    css,
    /\.lined-markdown-editor-pool:before\s*\{[^}]*background:\s*none/s,
  );
  assert.match(css, /\.lined-markdown-editor-pool \.rich-editor\s*\{[^}]*background-attachment:\s*local/s);
  assert.match(css, /\.write-page\s*\{[^}]*padding-bottom:\s*141px/s);
});

test("keeps scrolling ruled paper scoped to the diary pool editor", async () => {
  const appPage = await readFile("app/huiye-app.tsx", "utf8");
  const styles = await readFile("app/globals.css", "utf8");

  assert.doesNotMatch(appPage, /syncPaperRules|--paper-scroll-offset/);
  assert.match(
    styles,
    /\.lined-markdown-editor-pool \.rich-editor\s*\{[\s\S]*background-image:\s*repeating-linear-gradient[\s\S]*background-attachment:\s*local/,
  );
  assert.match(styles, /background-position-y:\s*-14px/);
  assert.match(
    styles,
    /--paper-rule-color:\s*rgba\(233,\s*229,\s*217,\s*0\.46\)/,
  );
  assert.match(styles, /--paper-line-height:\s*41px/);
  assert.match(
    styles,
    /\.lined-markdown-editor-pool:before\s*\{\s*background:\s*none/,
  );
  assert.doesNotMatch(styles, /\.rich-paper:before\s*\{\s*background:\s*none/);
  assert.doesNotMatch(
    styles,
    /(?:^|\n)\.rich-editor\s*\{[^}]*background-image:/,
  );
});

test("never seeds or clears diary data automatically", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /const seedEntries|createData\(seedEntries|clearLegacyData/);
  assert.doesNotMatch(page, /删除后无法恢复|setEntries\(current => current\.filter\(entry => entry\.id !== selected\.id\)/);
  assert.match(page, /createData\(\[\], \[\], \[\]\)/);
  assert.match(page, /内容保存在本地文件夹/);
  assert.match(page, /旧代次不会自动删除/);
  assert.match(page, /删除（回收站待完成）/);
});

test("saves user tags from the writing page into the new Entry", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");

  assert.match(page, /const \[writeTags, setWriteTags\] = useState<string\[\]>\(\[\]\)/);
  assert.match(page, /<TagEditor tags=\{writeTags\} onChange=\{setWriteTags\}/);
  assert.match(page, /tags: writeTags/);
  assert.match(page, /setWriteTags\(\[\]\)/);
  assert.match(page, /thoughtLineSelections: writeThoughtLineSelections/);
  assert.match(page, /setWriteTags\(pendingDraft\.tags \|\| \[\]\)/);
});

test("does not revive the retired v1 echo flow", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");
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
  assert.match(page, /saveEchoReply/);
  assert.match(page, /deleteEchoReply/);
  assert.match(page, /echoReplies/);
  assert.doesNotMatch(page, /function respondFromEcho/);
  assert.doesNotMatch(page, /约 80%|约 20%/);
  assert.doesNotMatch(worker, /\/api\/recall|prepareRecall|RECALL_SCHEMA|OPENROUTER_API_KEY/);
});

test("uses the confirmed three-level source disclosure without embedding private diary text in code", async () => {
  const card = await readFile(new URL("../app/echo-card.tsx", import.meta.url), "utf8");

  assert.match(card, /查看原文/);
  assert.match(card, /原文节选/);
  assert.match(card, /展开整篇/);
  assert.match(card, /完整原文/);
  assert.match(card, /<details className="echo-v2-preview" open>/);
  assert.match(card, /<details className="echo-v2-full">/);
  assert.match(card, /AI 暂时看见 · 由你判断/);
  assert.match(card, /看清了一点/);
  assert.match(card, /我已经知道了/);
  assert.match(card, /不太对/);
  assert.match(card, /回一句，或写下此刻/);
  assert.match(card, /此刻想回应什么？/);
  assert.match(card, /留下回应/);
  assert.match(card, /删除回应/);
  assert.match(card, /selectedFeedback/);
  assert.match(card, /lineNames/);
  assert.match(card, /来自思考线/);
  assert.match(card, /echo-v2-origin/);
  assert.doesNotMatch(card, /第一份工作强调的是|出类拔萃，一定是热爱|腾讯、Joe/);
});

test("uses the real date and keeps demo data isolated from private evaluation", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");

  assert.match(page, /function formatWritingDate/);
  assert.match(page, /formatWritingDate\(now\)/);
  assert.doesNotMatch(page, /2026 年 7 月 17 日/);
  assert.doesNotMatch(page, /你在 4 月留下的疑问|引用了 3 篇你允许关联的记录/);
  assert.match(page, /展示模式永不读取或展示私人日记/);
  assert.match(page, /evaluationMode === "demo"/);
});

test("keeps two ThoughtLine assignment entries and formal echo boundary", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");

  assert.match(page, /label: "思考线"/);
  assert.match(page, /writeThoughtLineSelections/);
  assert.match(page, /edit\.thoughtLineSelections/);
  assert.doesNotMatch(page, /setLineBatchIds/);
  assert.doesNotMatch(page, /从日记池加入|搜索要加入的笔记|加入选中的/);
  assert.match(page, /record\.thoughtLineId/);
  assert.match(page, /record\.lifecycle !== "legacy_evaluation"/);
  assert.match(page, /record\.lifecycle !== "evaluation_only"/);
  assert.match(page, /line\.allowEcho/);
  assert.match(page, /entry\?\.aiLink/);
});

test("uses an always-visible evaluation workbook with criteria and one selected detail", async () => {
  const page = await readFile(
    new URL("../app/huiye-app.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(page, /echoRecords\.length <= 15/);
  assert.match(page, /evaluationSheet/);
  assert.match(page, /评测总表/);
  assert.match(page, /评测标准/);
  assert.match(page, /Prompt 版本记录/);
  assert.match(page, /关系成立度/);
  assert.match(page, /显化增量/);
  assert.match(page, /重逢感/);
  assert.match(page, /Prompt 版本/);
  assert.match(page, /selectedEvaluationRecord/);
  assert.match(page, /thoughtLineNamesForRecord/);
  assert.match(page, /evaluationCaseName/);
  assert.match(page, /echoRelationLabel/);
  assert.match(page, /className="evaluation-echo-card"/);
  assert.match(page, /className="evaluation-assessment"/);
  assert.match(page, /评测结论与上方反馈相互独立/);
  assert.match(page, /userFeedbackText/);
  assert.match(page, /className="evaluation-table"/);
  assert.match(page, /evaluationRecords\.length\s*-\s*index/);
  assert.doesNotMatch(page, /String\(index\s*\+\s*1\)\.padStart/);
  assert.match(page, /参考答案将在\s*good\s*case\s*稳定后建立/);
  assert.match(css, /\.evaluation-echo-card\s*\{/);
  assert.match(css, /\.evaluation-assessment\s*\{/);
  assert.match(css, /\.evaluation-sheet-tabs\s*\{/);
  assert.match(css, /\.evaluation-criteria-sheet\s*\{/);
  assert.match(css, /\.evaluation-prompt-history\s*\{/);
  assert.match(css, /min-width:\s*1780px/);
});

test("keeps evaluation criteria, Chinese relation labels and traceable Prompt versions in one shared module", async () => {
  const model = await readFile(
    new URL("../app/evaluation-model.ts", import.meta.url),
    "utf8",
  );

  assert.match(model, /echo-eval-v0\.1/);
  assert.match(model, /echo-eval-v0\.2/);
  assert.match(model, /echo-eval-v0\.3/);
  assert.match(model, /echo-eval-v0\.4/);
  assert.match(model, /status:\s*"evaluated"/);
  assert.match(
    model,
    /version:\s*"echo-eval-v0\.3",\s*status:\s*"evaluated"/s,
  );
  assert.match(
    model,
    /version:\s*"echo-eval-v0\.4",\s*status:\s*"pending_evaluation"/s,
  );
  assert.match(model, /人工评测为 good/);
  assert.match(model, /inheritsFrom:\s*"echo-eval-v0\.1"/);
  assert.match(model, /主思考线就是本次搜索边界/);
  assert.match(model, /最小充分集/);
  assert.match(model, /决定：生成／保持沉默/);
  assert.match(model, /无真实关系／证据不足／无显化增量／解释风险过高/);
  assert.match(model, /relationValidity/);
  assert.match(model, /source_usage_count/);
  assert.match(model, /candidate_usage_count/);
  assert.match(model, /来源复用负面信号/);
  assert.match(model, /来源过度复用/);
  assert.match(model, /ECHO_EVAL_PROMPT_VERSION = "echo-eval-v0\.4"/);
  assert.match(model, /ECHO_EVAL_PROMPT = ECHO_EVAL_PROMPT_V04/);
  assert.match(model, /manifestationGain/);
  assert.match(model, /reencounterFeeling/);
  assert.match(model, /同主题、关键词相似或情绪相似本身不构成关系/);
  assert.match(model, /选择延续、修正、分支、冲突、未解决问题或其他/);
  assert.match(model, /continuation:\s*"延续"/);
  assert.match(model, /relational:\s*"联系回响"/);
  assert.match(model, /不要输出 good\/bad/);
});

test("keeps ThoughtLine assignment as a marked tag and fits the first writing screen", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");
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

test("shows newest ThoughtLine entries first with five-line inline expansion", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /entryTimestamp\(right\) - entryTimestamp\(left\)/);
  assert.match(page, /篇笔记，最新在前/);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /expanded \? "收起原文" : "展开原文"/);
  assert.match(page, /className="line-entry-full"/);
  assert.match(page, /className="line-entry-title-row"/);
  assert.match(page, /className="line-entry-tags"/);
  assert.match(page, /\(entry\.tags \?\? \[\]\)\.map/);
  assert.match(css, /\.line-entry-preview\s*\{[^}]*-webkit-line-clamp:\s*5/s);
  assert.match(css, /\.line-entry-tags > span\s*\{/);
});

test("aligns primary desktop page tops while preserving mobile header spacing", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.pool-page,\s*\.thought-lines-page,\s*\.echo-page\s*\{[^}]*padding-top:\s*20px/s,
  );
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.pool-page,\s*\.thought-lines-page,\s*\.echo-page\s*\{[^}]*padding-top:\s*38px/s,
  );
});

test("keeps README diagrams backed by canonical SVG sources", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const docsIndex = await readFile(
    new URL("../docs/01_DOCUMENTATION_INDEX.md", import.meta.url),
    "utf8",
  );
  const diagramNames = [
    "huiye-user-path-bpmn.svg",
    "huiye-product-structure.svg",
    "huiye-data-relationship.svg",
  ];

  for (const name of diagramNames) {
    assert.match(readme, new RegExp(`docs/assets/${name}`));
    const svg = await readFile(
      new URL(`../docs/assets/${name}`, import.meta.url),
      "utf8",
    );
    assert.match(svg, /<svg[\s>]/);
    assert.match(svg, /<title id="title">回页/);
  }

  assert.doesNotMatch(readme, /```mermaid/);
  assert.match(docsIndex, /SVG 是唯一可编辑源/);
});

test("does not retain the retired AI organization client", async () => {
  const page = await readFile(new URL("../app/huiye-app.tsx", import.meta.url), "utf8");
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

test("keeps the RSC runtime out of Vite dependency prebundling", async () => {
  const config = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /optimizeDeps:\s*\{[\s\S]*exclude:\s*\["react-server-dom-webpack\/server\.edge"\]/);
});

test("desktop launchers wait for both the data API and the app page", async () => {
  const cliLauncher = await readFile(
    new URL("../scripts/start-huiye-local.ps1", import.meta.url),
    "utf8",
  );
  const uiLauncher = await readFile(
    new URL("../scripts/start-huiye-ui.ps1", import.meta.url),
    "utf8",
  );

  for (const launcher of [cliLauncher, uiLauncher]) {
    assert.match(launcher, /Invoke-RestMethod\s+-Uri\s+\$apiUrl/);
    assert.match(launcher, /Invoke-WebRequest\s+-Uri\s+\$url/);
    assert.match(launcher, /StatusCode\s+-ne\s+200/);
  }
});
