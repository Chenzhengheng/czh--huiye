import assert from "node:assert/strict";
import test from "node:test";

import {
  handleMainlandPortfolioAnalyticsApi,
  recordMainlandPortfolioVisit,
} from "../edgeone/lib/portfolio-analytics.js";
import { onRequest as onVisitRequest } from "../edgeone/edge-functions/api/portfolio-visits/visit.js";
import { onRequest as onSummaryRequest } from "../edgeone/edge-functions/api/portfolio-visits/summary.js";

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
  const env = { PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" };
  const first = await recordMainlandPortfolioVisit(
    new Request("https://huiye-ai.cn/api/portfolio-visits/visit", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    }),
    analytics,
    env,
    1_800_000_000,
  );
  const cookies = cookieHeader(first);
  const device = /huiye_portfolio_device=([^;,]+)/.exec(cookies)[1];
  const session = /huiye_portfolio_session=([^;,]+)/.exec(cookies)[1];

  await recordMainlandPortfolioVisit(
    new Request("https://huiye-ai.cn/api/portfolio-visits/visit", {
      method: "POST",
      headers: {
        cookie: `huiye_portfolio_device=${device}; huiye_portfolio_session=${session}`,
        "sec-fetch-site": "same-origin",
      },
    }),
    analytics,
    env,
    1_800_000_300,
  );

  const response = await handleMainlandPortfolioAnalyticsApi(
    new Request("https://huiye-ai.cn/api/portfolio-visits/summary", { headers: { authorization: "Bearer mainland-secret" } }),
    analytics,
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
  const env = { PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" };
  const enrolled = await handleMainlandPortfolioAnalyticsApi(
    new Request("https://huiye-ai.cn/api/portfolio-visits/admin/enroll", {
      method: "POST",
      body: new URLSearchParams({ token: "mainland-secret" }),
    }),
    analytics,
    env,
  );
  const admin = /huiye_portfolio_admin=([^;,]+)/.exec(cookieHeader(enrolled))[1];
  const visitUrl = "https://huiye-ai.cn/api/portfolio-visits/visit";
  await recordMainlandPortfolioVisit(new Request(visitUrl, { method: "POST", headers: { cookie: `huiye_portfolio_admin=${admin}`, "sec-fetch-site": "same-origin" } }), analytics, env);
  await recordMainlandPortfolioVisit(new Request(visitUrl, { method: "GET", headers: { "sec-fetch-site": "same-origin" } }), analytics, env);
  await recordMainlandPortfolioVisit(new Request(visitUrl, { method: "POST", headers: { "user-agent": "Googlebot", "sec-fetch-site": "same-origin" } }), analytics, env);
  await recordMainlandPortfolioVisit(new Request(visitUrl, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }), analytics, env);
  assert.equal((await analytics.list({ prefix: "visit_" })).keys.length, 0);
});

test("uses the EdgeOne-bound KV variable and returns a diagnostic response when it is absent", async (t) => {
  const analytics = new FakeKV();
  globalThis.HUIYE_PORTFOLIO_ANALYTICS = analytics;
  try {
    const visit = await onVisitRequest({
      request: new Request("https://huiye-ai.cn/api/portfolio-visits/visit", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      }),
      env: { PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" },
    });
    assert.equal(visit.status, 204);

    const summary = await onSummaryRequest({
      request: new Request("https://huiye-ai.cn/api/portfolio-visits/summary", {
        headers: { authorization: "Bearer mainland-secret" },
      }),
      env: { PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" },
    });
    assert.equal(summary.status, 200);
  } finally {
    delete globalThis.HUIYE_PORTFOLIO_ANALYTICS;
  }

  t.mock.method(console, "error", () => undefined);
  const unavailable = await onSummaryRequest({
    request: new Request("https://huiye-ai.cn/api/portfolio-visits/summary"),
    env: { PORTFOLIO_DASHBOARD_TOKEN: "mainland-secret" },
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "storage_unavailable" });
});
