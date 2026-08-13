import assert from "node:assert/strict";
import test from "node:test";

import { handlePortfolioAnalyticsApi, recordPortfolioPage } from "../worker/portfolio-analytics.ts";

class FakeStatement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.values = values;
  }
  bind(...values) { return new FakeStatement(this.db, this.sql, values); }
  async run() {
    const [a, b, c, d] = this.values;
    if (this.sql.startsWith("INSERT INTO")) this.db.rows.push({ id: a, device_id: b, started_at: c, latest_at: d, confirmed_at: null });
    if (this.sql.startsWith("UPDATE portfolio_visit_sessions SET latest_at")) this.db.rows.find((row) => row.id === b).latest_at = a;
    if (this.sql.startsWith("UPDATE portfolio_visit_sessions SET confirmed_at")) {
      const row = this.db.rows.find((item) => item.id === c && item.device_id === d);
      if (row) { row.confirmed_at ??= a; row.latest_at = b; }
    }
    if (this.sql.startsWith("DELETE FROM")) this.db.rows = this.db.rows.filter((row) => row.started_at >= a);
    return { success: true };
  }
  async first() {
    const [since] = this.values;
    if (this.sql.startsWith("SELECT id FROM")) {
      return [...this.db.rows].filter((row) => row.device_id === this.values[0] && row.started_at >= this.values[1]).sort((a, b) => b.started_at - a.started_at)[0] ?? null;
    }
    if (this.sql.includes("COUNT(DISTINCT device_id)")) {
      const rows = this.db.rows.filter((row) => row.started_at >= since);
      return { devices: new Set(rows.map((row) => row.device_id)).size, confirmed: rows.filter((row) => row.confirmed_at != null).length, unconfirmed: rows.filter((row) => row.confirmed_at == null).length };
    }
    if (this.sql.startsWith("SELECT MAX")) return { latest: Math.max(0, ...this.db.rows.map((row) => row.confirmed_at ?? 0)) || null };
    return null;
  }
  async all() {
    const [since] = this.values;
    const days = new Map();
    for (const row of this.db.rows.filter((item) => item.started_at >= since)) {
      const day = new Date(row.started_at * 1000).toISOString().slice(0, 10);
      const value = days.get(day) ?? { day, deviceIds: new Set(), confirmed: 0, unconfirmed: 0 };
      value.deviceIds.add(row.device_id);
      row.confirmed_at == null ? value.unconfirmed++ : value.confirmed++;
      days.set(day, value);
    }
    return { results: [...days.values()].map((value) => ({ day: value.day, devices: value.deviceIds.size, confirmed: value.confirmed, unconfirmed: value.unconfirmed })) };
  }
}

class FakeD1 {
  rows = [];
  prepare(sql) { return new FakeStatement(this, sql); }
}

function cookieHeader(response) {
  return response.headers.get("set-cookie") ?? "";
}

test("tracks only a confirmed portfolio session and deduplicates within 30 minutes", async () => {
  const DB = new FakeD1();
  const env = { DB, PORTFOLIO_DASHBOARD_TOKEN: "secret" };
  const first = await recordPortfolioPage(new Request("https://example.test/portfolio"), new Response("ok"), env, 1_800_000_000);
  const setCookies = cookieHeader(first);
  const device = /huiye_portfolio_device=([^;,]+)/.exec(setCookies)[1];
  const session = /huiye_portfolio_session=([^;,]+)/.exec(setCookies)[1];
  assert.equal(DB.rows.length, 1);

  const headers = { cookie: `huiye_portfolio_device=${device}; huiye_portfolio_session=${session}` };
  await handlePortfolioAnalyticsApi(new Request("https://example.test/api/portfolio-visits/confirm", { method: "POST", headers }), env, 1_800_000_005);
  await recordPortfolioPage(new Request("https://example.test/portfolio", { headers }), new Response("ok"), env, 1_800_000_300);
  assert.equal(DB.rows.length, 1);
  assert.equal(DB.rows[0].confirmed_at, 1_800_000_005);
});

test("protects summaries and excludes an enrolled admin browser", async () => {
  const DB = new FakeD1();
  const env = { DB, PORTFOLIO_DASHBOARD_TOKEN: "secret" };
  const denied = await handlePortfolioAnalyticsApi(new Request("https://example.test/api/portfolio-visits/summary"), env, 1_800_000_000);
  assert.equal(denied.status, 401);

  const allowed = await handlePortfolioAnalyticsApi(new Request("https://example.test/api/portfolio-visits/summary", { headers: { authorization: "Bearer secret" } }), env, 1_800_000_000);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).last30Days.devices, 0);

  const enrolled = await handlePortfolioAnalyticsApi(new Request("https://example.test/api/portfolio-visits/admin/enroll", { method: "POST", body: new URLSearchParams({ token: "secret" }) }), env);
  const adminCookie = /huiye_portfolio_admin=([^;,]+)/.exec(cookieHeader(enrolled))[1];
  await recordPortfolioPage(new Request("https://example.test/portfolio", { headers: { cookie: `huiye_portfolio_admin=${adminCookie}` } }), new Response("ok"), env, 1_800_000_100);
  assert.equal(DB.rows.length, 0);
});
