const DEVICE_COOKIE = "huiye_portfolio_device";
const SESSION_COOKIE = "huiye_portfolio_session";
const ADMIN_COOKIE = "huiye_portfolio_admin";
const THIRTY_MINUTES = 30 * 60;
const NINETY_DAYS = 90 * 24 * 60 * 60;
const CHINA_TIME_OFFSET = 8 * 60 * 60;
const NON_HUMAN_USER_AGENT = /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|slackbot|discordbot|twitterbot|linkedinbot|telegrambot/i;

function analyticsStore(env) {
  return env?.HUIYE_PORTFOLIO_ANALYTICS ?? globalThis.HUIYE_PORTFOLIO_ANALYTICS;
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator < 0
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request, token) {
  if (!token) return false;
  return parseCookies(request)[ADMIN_COOKIE] === (await sha256(`portfolio-admin:${token}`));
}

function isEligibleNavigation(request, response) {
  const url = new URL(request.url);
  if (request.method !== "GET" || !response.ok || url.pathname !== "/") return false;
  if (NON_HUMAN_USER_AGENT.test(request.headers.get("user-agent") ?? "")) return false;
  if (/prefetch|prerender/i.test(request.headers.get("purpose") ?? "")) return false;
  if (/prefetch|prerender/i.test(request.headers.get("sec-purpose") ?? "")) return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination && destination !== "document") return false;
  const mode = request.headers.get("sec-fetch-mode");
  return !mode || mode === "navigate";
}

function cloneWithHeaders(response, headers) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function listAll(store, prefix) {
  const keys = [];
  let cursor;
  do {
    const result = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    keys.push(...(result.keys ?? []));
    cursor = result.complete ? undefined : result.cursor;
  } while (cursor);
  return keys;
}

async function readSessions(store) {
  const keys = await listAll(store, "visit_");
  const sessions = await Promise.all(
    keys.map(async ({ key }) => {
      const value = await store.get(key);
      if (!value) return null;
      try { return JSON.parse(value); } catch { return null; }
    }),
  );
  return sessions.filter(Boolean);
}

async function pruneSessions(store, now) {
  const keys = await listAll(store, "visit_");
  await Promise.all(keys.map(async ({ key }) => {
    const startedAt = Number(key.slice(key.lastIndexOf("_") + 1));
    if (Number.isFinite(startedAt) && startedAt < now - NINETY_DAYS) await store.delete(key);
  }));
}

export async function recordMainlandPortfolioPage(request, response, env, now = Math.floor(Date.now() / 1000)) {
  const store = analyticsStore(env);
  if (!store || !isEligibleNavigation(request, response) || (await isAdmin(request, env.PORTFOLIO_DASHBOARD_TOKEN))) return response;

  const cookies = parseCookies(request);
  const rawDeviceId = cookies[DEVICE_COOKIE] || crypto.randomUUID();
  const deviceId = await sha256(rawDeviceId);
  const cookieStartedAt = Number(cookies[SESSION_COOKIE]);
  const reusesSession = Number.isFinite(cookieStartedAt) && cookieStartedAt <= now && cookieStartedAt >= now - THIRTY_MINUTES;
  const startedAt = reusesSession ? cookieStartedAt : now;
  const key = `visit_${deviceId}_${startedAt}`;
  const existing = reusesSession ? await store.get(key) : null;
  const session = existing
    ? { ...JSON.parse(existing), latestAt: now }
    : { deviceId, startedAt, latestAt: now };
  await store.put(key, JSON.stringify(session));
  if (!(await store.get("tracking_started_at"))) await store.put("tracking_started_at", String(now));
  await pruneSessions(store, now);

  const headers = new Headers(response.headers);
  if (!cookies[DEVICE_COOKIE]) headers.append("set-cookie", cookie(DEVICE_COOKIE, rawDeviceId, 365 * 24 * 60 * 60));
  headers.append("set-cookie", cookie(SESSION_COOKIE, String(startedAt), THIRTY_MINUTES));
  return cloneWithHeaders(response, headers);
}

function period(sessions, since) {
  const rows = sessions.filter((session) => session.startedAt >= since);
  return { visits: rows.length, devices: new Set(rows.map((session) => session.deviceId)).size };
}

async function summary(store, now) {
  const todayStart = Math.floor((now + CHINA_TIME_OFFSET) / (24 * 60 * 60)) * (24 * 60 * 60) - CHINA_TIME_OFFSET;
  const sessions = (await readSessions(store)).filter((session) => session.startedAt >= now - NINETY_DAYS);
  const daily = new Map();
  for (const session of sessions.filter((item) => item.startedAt >= todayStart - 29 * 24 * 60 * 60)) {
    const day = new Date((session.startedAt + CHINA_TIME_OFFSET) * 1000).toISOString().slice(0, 10);
    const value = daily.get(day) ?? { day, visits: 0, deviceIds: new Set() };
    value.visits += 1;
    value.deviceIds.add(session.deviceId);
    daily.set(day, value);
  }
  const trackingStartedAt = Number(await store.get("tracking_started_at"));
  return {
    source: "mainland",
    generatedAt: now,
    trackingStartedAt: Number.isFinite(trackingStartedAt) && trackingStartedAt > 0 ? trackingStartedAt : null,
    today: period(sessions, todayStart),
    last7Days: period(sessions, todayStart - 6 * 24 * 60 * 60),
    last30Days: period(sessions, todayStart - 29 * 24 * 60 * 60),
    daily: [...daily.values()].sort((left, right) => left.day.localeCompare(right.day)).map((value) => ({
      day: value.day,
      visits: value.visits,
      devices: value.deviceIds.size,
    })),
    latestVisitAt: sessions.length ? Math.max(...sessions.map((session) => session.latestAt)) : null,
  };
}

async function authorized(request, token) {
  if (!token) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return provided.length > 0 && (await sha256(provided)) === (await sha256(token));
}

export async function handleMainlandPortfolioAnalyticsApi(request, env, now = Math.floor(Date.now() / 1000)) {
  const url = new URL(request.url);
  const store = analyticsStore(env);
  if (url.pathname === "/api/portfolio-visits/summary" && request.method === "GET") {
    if (!store || !(await authorized(request, env.PORTFOLIO_DASHBOARD_TOKEN))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json(await summary(store, now), { headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/portfolio-visits/admin/enroll" && request.method === "POST") {
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    if (!env.PORTFOLIO_DASHBOARD_TOKEN || (await sha256(token)) !== (await sha256(env.PORTFOLIO_DASHBOARD_TOKEN))) {
      return new Response("Unauthorized", { status: 401 });
    }
    const headers = new Headers({ location: "/" });
    headers.append("set-cookie", cookie(ADMIN_COOKIE, await sha256(`portfolio-admin:${token}`), 365 * 24 * 60 * 60));
    return new Response(null, { status: 303, headers });
  }
  return null;
}
