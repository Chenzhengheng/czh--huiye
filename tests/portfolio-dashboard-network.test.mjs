import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../scripts/portfolio-dashboard-server.mjs", import.meta.url), "utf8");
const launcherSource = await readFile(new URL("../scripts/start-portfolio-dashboard.ps1", import.meta.url), "utf8");

test("local dashboard sends summary requests through its private proxy setting", () => {
  assert.match(serverSource, /config\.proxy/);
  assert.match(serverSource, /"--use-env-proxy"/);
  assert.match(serverSource, /HTTPS_PROXY: proxy/);
});

test("launcher upgrades an existing private config with the default local proxy", () => {
  assert.match(launcherSource, /127\.0\.0\.1:12000/);
  assert.match(launcherSource, /Add-Member[^\n]+proxy/);
});

test("dashboard reports an actionable message when the configured proxy is unavailable", () => {
  assert.match(serverSource, /请先开启代理/);
});
