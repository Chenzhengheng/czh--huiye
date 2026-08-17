import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const lineHeight = 41;

let server;
let browser;
let serverOutput = "";
let port;
let baseUrl;

async function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "localhost", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`Vinext exited before startup:\n${serverOutput}`);
    }
    if (!serverOutput.includes(String(port))) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    try {
      const response = await fetch(`${baseUrl}/portfolio/demo`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for Vinext:\n${serverOutput}`);
}

async function openDemoPage() {
  const context = await browser.newContext({
    viewport: { width: 1565, height: 1084 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/portfolio/demo`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('[data-editor-context="write"]').waitFor();
  await page.waitForFunction(() => {
    const save = document.querySelector(".write-page .save-row button.primary");
    return save instanceof HTMLButtonElement && !save.disabled;
  });
  return { context, page };
}

async function editorMetrics(editor) {
  return editor.evaluate((node) => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const caret = range?.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    return {
      caretBottom: caret?.bottom ?? null,
      caretHeight: caret?.height ?? null,
      caretTop: caret?.top ?? null,
      clientHeight: node.clientHeight,
      editorBottom: bounds.bottom,
      editorTop: bounds.top,
      overflowY: getComputedStyle(node).overflowY,
      pageY: window.scrollY,
      paddingBottom: Number.parseFloat(getComputedStyle(node).paddingBottom),
      paperHeight: node.parentElement?.getBoundingClientRect().height ?? null,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
      textLength: node.textContent?.length ?? 0,
      childCount: node.childElementCount,
    };
  });
}

async function waitForEditorMetrics(editor, predicate, message) {
  const deadline = Date.now() + 5_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await editorMetrics(editor);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${message}: ${JSON.stringify(latest)}`);
}

async function waitForAnimationFrames(page, count = 3) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const next = (remaining) => {
          if (remaining === 0) return resolve();
          requestAnimationFrame(() => next(remaining - 1));
        };
        next(frames);
      }),
    count,
  );
}

async function typeFifteenLines(editor) {
  await editor.fill("第1行");
  for (let index = 2; index <= 15; index += 1) {
    await editor.press("Enter");
    await editor.type(`第${index}行`);
  }
}

async function assertStableRepeatedEnter(page, contextName) {
  const paper = page.locator(`[data-editor-context="${contextName}"]`);
  const editor = paper.getByRole("textbox");
  await typeFifteenLines(editor);

  const atFifteen = await waitForEditorMetrics(
    editor,
    (metrics) =>
      metrics.overflowY === "auto" &&
      Math.round(metrics.scrollTop) === 0 &&
      metrics.scrollHeight === metrics.clientHeight &&
      metrics.caretBottom <= metrics.editorBottom + 1,
    "the first 15 visual lines did not settle fully inside the paper",
  );
  assert.equal(
    atFifteen.overflowY,
    "auto",
    `the 15th line must pre-arm internal overflow before the 16th-line keypress: ${JSON.stringify(atFifteen)}`,
  );
  assert.equal(
    Math.round(atFifteen.scrollTop),
    0,
    "the first 15 visual lines must fit without visible internal scrolling",
  );

  const pageY = atFifteen.pageY;
  await page.evaluate((expectedPageY) => {
    const samples = [window.scrollY];
    const onScroll = () => samples.push(window.scrollY);
    const state = { active: true, expectedPageY, onScroll, samples };
    window.__huiyeOuterScrollProbe = state;
    window.addEventListener("scroll", onScroll);
    const sampleFrame = () => {
      if (!state.active) return;
      samples.push(window.scrollY);
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  }, pageY);
  const scrollSequence = [];
  for (let index = 0; index < 4; index += 1) {
    const before = await editorMetrics(editor);
    await editor.press("Enter");
    await waitForAnimationFrames(page);
    const after = await waitForEditorMetrics(
      editor,
      (metrics) =>
        metrics.childCount > before.childCount &&
        (index > 0 || metrics.scrollTop > 0),
      `line ${16 + index} did not complete internal caret following`,
    );
    scrollSequence.push(after.scrollTop);
  }

  assert.ok(
    scrollSequence[0] > 0,
    `the 16th visual line must start internal scrolling: ${scrollSequence.join(", ")}`,
  );
  assert.ok(
    scrollSequence.every(
      (value, index) => index === 0 || value >= scrollSequence[index - 1] - 1,
    ),
    `internal scroll must never reverse while Enter continues: ${scrollSequence.join(", ")}`,
  );
  const outerScrollSamples = await page.evaluate(() => {
    const state = window.__huiyeOuterScrollProbe;
    state.active = false;
    window.removeEventListener("scroll", state.onScroll);
    return state.samples;
  });
  assert.ok(
    outerScrollSamples.every(
      (sample) => Math.round(sample) === Math.round(pageY),
    ),
    `typing inside a fixed paper must not move the outer page: ${outerScrollSamples.join(", ")}`,
  );

  await editor.evaluate((node) => {
    node.scrollTop = 0;
  });
  assert.equal(
    Math.round((await editorMetrics(editor)).scrollTop),
    0,
    "manual review must keep its chosen scroll position until the next input",
  );

  await editor.type("继续");
  await waitForAnimationFrames(page);
  const settled = await waitForEditorMetrics(
    editor,
    (metrics) => {
      const remaining =
        (metrics.editorBottom - metrics.caretBottom) / lineHeight;
      return metrics.scrollTop > 0 && remaining >= 3 && remaining <= 5;
    },
    "the caret did not return to its lower comfort boundary after input",
  );
  const remainingLines =
    (settled.editorBottom - settled.caretBottom) / lineHeight;
  assert.ok(
    remainingLines >= 3 && remainingLines <= 5,
    `the settled caret must keep about four lines below it, got ${remainingLines}`,
  );
}

test.before(async () => {
  port = await allocateLoopbackPort();
  baseUrl = `http://localhost:${port}`;
  server = spawn(
    process.execPath,
    [vinextCli, "dev", "--host", "localhost", "--port", String(port)],
    {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();

  const launchOptions = {
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : process.platform === "win32"
        ? { channel: "msedge" }
        : {}),
  };
  browser = await chromium.launch(launchOptions);
});

test.after(async () => {
  await browser?.close();
  if (server?.exitCode === null) server.kill();
});

test("counts wrapped text by rendered visual lines", async () => {
  const { context, page } = await openDemoPage();
  try {
    const editor = page
      .locator('[data-editor-context="write"]')
      .getByRole("textbox");
    await editor.fill("回页".repeat(450));

    const metrics = await waitForEditorMetrics(
      editor,
      (current) =>
        current.overflowY === "auto" &&
        current.paddingBottom >= lineHeight * 4,
      "the wrapped paragraph did not cross the rendered-line boundary",
    );
    assert.equal(
      metrics.overflowY,
      "auto",
      `a paragraph taller than 15 rendered lines must enable paper scrolling: ${JSON.stringify(metrics)}`,
    );
    assert.ok(
      metrics.paddingBottom >= lineHeight * 4,
      "a long wrapped paragraph must receive the caret comfort space",
    );
  } finally {
    await context.close();
  }
});

test("keeps repeated Enter stable in the writing editor", async () => {
  const { context, page } = await openDemoPage();
  try {
    await assertStableRepeatedEnter(page, "write");
  } finally {
    await context.close();
  }
});

test("keeps repeated Enter stable in diary-pool editing", async () => {
  const { context, page } = await openDemoPage();
  try {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll(".sidebar nav button")].find(
        (candidate) => candidate.textContent?.includes("日记池"),
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Diary-pool navigation button is missing");
      }
      button.click();
    });
    await page.locator(".pool-page").waitFor();
    await page.locator("article.entry").first().click();
    await page.locator('[data-editor-context="pool"]').waitFor();
    await assertStableRepeatedEnter(page, "pool");
  } finally {
    await context.close();
  }
});
