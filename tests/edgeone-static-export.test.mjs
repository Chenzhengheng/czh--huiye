import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("exports an EdgeOne-ready PublicPortfolioDeployment", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "huiye-edgeone-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));

  await execFileAsync(
    process.execPath,
    ["scripts/export-edgeone-static.mjs", outputDir],
    { cwd: process.cwd() },
  );

  const requiredFiles = [
    "index.html",
    "portfolio/demo/index.html",
    "portfolio/demo/evaluation/index.html",
    "edgeone.json",
  ];
  for (const relativePath of requiredFiles) {
    assert.equal((await stat(path.join(outputDir, relativePath))).isFile(), true);
  }

  await assert.rejects(stat(path.join(outputDir, "app/index.html")));
  await assert.rejects(stat(path.join(outputDir, "local-data")));

  for (const relativePath of requiredFiles.slice(0, 3)) {
    const html = await readFile(path.join(outputDir, relativePath), "utf8");
    assert.match(html, /粤ICP备2026122805号/);
    assert.match(html, /https:\/\/beian\.miit\.gov\.cn\//);
  }

  const config = JSON.parse(
    await readFile(path.join(outputDir, "edgeone.json"), "utf8"),
  );
  assert.deepEqual(config.redirects, [
    { source: "/portfolio", destination: "/", statusCode: 301 },
    { source: "/portfolio/", destination: "/", statusCode: 301 },
  ]);
});
