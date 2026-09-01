import assert from "node:assert/strict";
import test from "node:test";

import {
  handleMainlandPortfolioAnalyticsApi,
  recordMainlandPortfolioPage,
} from "../edgeone/edge-functions/_shared/portfolio-analytics.js";

class FakeKV {
  values = new Map();

  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = "", cursor } = {}) {
    assert.equal(cursor, undefined);
    return {
      complete: true,
      cursor: undefined,
      keys: [...this.values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
    };
  }
}

function cookieHeader(response) {
  return response.headers.get("set-cookie") ?? "";
}

test("records and summarizes a mainland homepage session through the EdgeOne contract", async () => {
  const analytics = new FakeKV();
  const env = { HUIYE_PORTFOLIO_ANALYTICS: analytics, PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" };
  const first = await recordMainlandPortfolioPage(
    new Request("https://huiye-ai.cn/"),
    new Response("ok"),
    env,
    1_800_000_000,
  );
  const cookies = cookieHeader(first);
  const device = /huiye_portfolio_device=([^;,]+)/.exec(cookies)[1];
  const session = /huiye_portfolio_session=([^;,]+)/.exec(cookies)[1];

  await recordMainlandPortfolioPage(
    new Request("https://huiye-ai.cn/", { headers: { cookie: `huiye_portfolio_device=${device}; huiye_portfolio_session=${session}` } }),
    new Response("ok"),
    env,
    1_800_000_300,
  );

  const response = await handleMainlandPortfolioAnalyticsApi(
    new Request("https://huiye-ai.cn/api/portfolio-visits/summary", { headers: { authorization: "Bearer mainland-secret" } }),
    env,
    1_800_000_600,
  );
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.source, "mainland");
  assert.deepEqual(summary.last30Days, { visits: 1, devices: 1 });
  assert.equal(summary.latestVisitAt, 1_800_000_300);
});

test("excludes mainland admin, non-home, crawler and prefetch requests", async () => {
  const analytics = new FakeKV();
  const env = { HUIYE_PORTFOLIO_ANALYTICS: analytics, PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" };
  const enrolled = await handleMainlandPortfolioAnalyticsApi(
    new Request("https://huiye-ai.cn/api/portfolio-visits/admin/enroll", {
      method: "POST",
      body: new URLSearchParams({ token: "mainland-secret" }),
    }),
    env,
  );
  const admin = /huiye_portfolio_admin=([^;,]+)/.exec(cookieHeader(enrolled))[1];
  await recordMainlandPortfolioPage(new Request("https://huiye-ai.cn/", { headers: { cookie: `huiye_portfolio_admin=${admin}` } }), new Response("ok"), env);
  await recordMainlandPortfolioPage(new Request("https://huiye-ai.cn/portfolio/demo"), new Response("ok"), env);
  await recordMainlandPortfolioPage(new Request("https://huiye-ai.cn/", { headers: { "user-agent": "Googlebot" } }), new Response("ok"), env);
  await recordMainlandPortfolioPage(new Request("https://huiye-ai.cn/", { headers: { purpose: "prefetch" } }), new Response("ok"), env);
  assert.equal((await analytics.list({ prefix: "visit_" })).keys.length, 0);
});
