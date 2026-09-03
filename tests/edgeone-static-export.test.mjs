import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("exports an EdgeOne-ready PublicPortfolioDeployment", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "huiye-edgeone-"));
  const archivePath = `${outputDir}.zip`;
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  t.after(() => rm(archivePath, { force: true }));

  await execFileAsync(
    process.execPath,
    ["scripts/export-edgeone-static.mjs", outputDir, archivePath],
    { cwd: process.cwd() },
  );

  assert.equal((await stat(archivePath)).isFile(), true);
  const { stdout: archiveListing } = await execFileAsync(
    "tar",
    ["-tf", archivePath],
  );
  const archiveEntries = archiveListing
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ""));
  assert.equal(archiveEntries.includes("index.html"), true);

  const requiredFiles = [
    "index.html",
    "portfolio/demo/index.html",
    "portfolio/demo/evaluation/index.html",
    "edgeone.json",
    "lib/portfolio-analytics.js",
    "portfolio-visit.js",
    "edge-functions/api/portfolio-visits/visit.js",
    "edge-functions/api/portfolio-visits/summary.js",
    "edge-functions/api/portfolio-visits/admin/enroll.js",
  ];
  for (const relativePath of requiredFiles) {
    assert.equal((await stat(path.join(outputDir, relativePath))).isFile(), true);
  }

  await assert.rejects(stat(path.join(outputDir, "app/index.html")));
  await assert.rejects(stat(path.join(outputDir, "local-data")));
  await assert.rejects(stat(path.join(outputDir, "middleware.js")));
  const assets = await readdir(path.join(outputDir, "assets"));
  assert.equal(assets.some((name) => name.includes("portfolio-visit-beacon")), false);
  assert.equal(
    assets.some(
      (name) =>
        name.startsWith("huiye-user-path-bpmn") && name.endsWith(".svg"),
    ),
    true,
  );
  for (const unusedStarterAsset of ["file.svg", "globe.svg", "window.svg"]) {
    await assert.rejects(stat(path.join(outputDir, unusedStarterAsset)));
  }

  for (const relativePath of requiredFiles.slice(0, 3)) {
    const html = await readFile(path.join(outputDir, relativePath), "utf8");
    assert.match(html, /粤ICP备2026122805号/);
    assert.match(html, /https:\/\/beian\.miit\.gov\.cn\//);
  }
  assert.match(
    await readFile(path.join(outputDir, "index.html"), "utf8"),
    /<script src="\/portfolio-visit\.js" defer><\/script>/,
  );

  const config = JSON.parse(
    await readFile(path.join(outputDir, "edgeone.json"), "utf8"),
  );
  assert.deepEqual(config.redirects, [
    { source: "/portfolio", destination: "/", statusCode: 301 },
    { source: "/portfolio/", destination: "/", statusCode: 301 },
  ]);
  for (const runtimeFile of requiredFiles.slice(4)) {
    assert.equal(archiveEntries.includes(runtimeFile), true);
  }

  const edgeFunctionFiles = requiredFiles.filter((relativePath) =>
    relativePath.startsWith("edge-functions/"),
  );
  for (const relativePath of edgeFunctionFiles) {
    const source = await readFile(path.join(outputDir, relativePath), "utf8");
    assert.match(source, /export\s+(?:async\s+)?function\s+onRequest/);
  }

  const edgeRuntimeSource = await readFile(
    path.join(outputDir, "lib/portfolio-analytics.js"),
    "utf8",
  );
  assert.doesNotMatch(edgeRuntimeSource, /Response\.json\(/);
});
