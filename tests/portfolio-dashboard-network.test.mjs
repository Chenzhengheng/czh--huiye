import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../scripts/portfolio-dashboard-server.mjs", import.meta.url), "utf8");
const launcherSource = await readFile(new URL("../scripts/start-portfolio-dashboard.ps1", import.meta.url), "utf8");

test("local dashboard sends summary requests through its private proxy setting", () => {
  assert.match(serverSource, /source\.proxy/);
  assert.match(serverSource, /"--use-env-proxy"/);
  assert.match(serverSource, /HTTPS_PROXY: proxy/);
});

test("launcher migrates the private config to separate mainland and overseas sources", () => {
  assert.match(launcherSource, /127\.0\.0\.1:12000/);
  assert.match(launcherSource, /sources/);
  assert.match(launcherSource, /mainland/);
  assert.match(launcherSource, /overseas/);
  assert.match(launcherSource, /huiye-ai\.cn/);
});

test("dashboard reports an actionable message when the configured proxy is unavailable", () => {
  assert.match(serverSource, /请先开启代理/);
});

test("dashboard exposes separate admin enrollment routes for both deployments", () => {
  assert.match(serverSource, /excludeMatch[\s\S]+mainland\|overseas/);
  assert.match(serverSource, /combinePortfolioSummaries/);
  assert.match(serverSource, /Promise\.allSettled/);
});
