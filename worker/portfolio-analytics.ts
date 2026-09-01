const DEVICE_COOKIE = "huiye_portfolio_device";
const ADMIN_COOKIE = "huiye_portfolio_admin";
const THIRTY_MINUTES = 30 * 60;
const NINETY_DAYS = 90 * 24 * 60 * 60;
const CHINA_TIME_OFFSET = 8 * 60 * 60;

export interface PortfolioAnalyticsEnv {
  DB?: D1Database;
  PORTFOLIO_DASHBOARD_TOKEN?: string;
}

type VisitSummaryPeriod = {
  visits: number;
  devices: number;
};

export type PortfolioVisitSummary = {
  source: "overseas";
  generatedAt: number;
  trackingStartedAt: number | null;
  today: VisitSummaryPeriod;
  last7Days: VisitSummaryPeriod;
  last30Days: VisitSummaryPeriod;
  daily: Array<{ day: string; visits: number; devices: number }>;
  latestVisitAt: number | null;
};

const NON_HUMAN_USER_AGENT = /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|slackbot|discordbot|twitterbot|linkedinbot|telegrambot/i;

function isEligiblePortfolioNavigation(request: Request, response: Response) {
  const url = new URL(request.url);
  if (request.method !== "GET" || !response.ok || (url.pathname !== "/" && url.pathname !== "/portfolio")) return false;
  if (NON_HUMAN_USER_AGENT.test(request.headers.get("user-agent") ?? "")) return false;
  if (/prefetch|prerender/i.test(request.headers.get("purpose") ?? "")) return false;
  if (/prefetch|prerender/i.test(request.headers.get("sec-purpose") ?? "")) return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination && destination !== "document") return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode && mode !== "navigate") return false;
  return true;
}

function parseCookies(request: Request) {
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

function appendCookie(headers: Headers, value: string) {
  headers.append("set-cookie", value);
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request: Request, token?: string) {
  if (!token) return false;
  const cookies = parseCookies(request);
  return cookies[ADMIN_COOKIE] === (await sha256(`portfolio-admin:${token}`));
}

function cloneWithHeaders(response: Response, headers: Headers) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function startVisit(db: D1Database, deviceId: string, now: number) {
  const existing = await db
    .prepare(
      `SELECT id FROM portfolio_visit_sessions
       WHERE device_id = ? AND started_at >= ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(deviceId, now - THIRTY_MINUTES)
    .first<{ id: string }>();

  if (existing?.id) {
    await db.prepare("UPDATE portfolio_visit_sessions SET latest_at = ? WHERE id = ?").bind(now, existing.id).run();
    return existing.id;
  }

  const sessionId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO portfolio_visit_sessions (id, device_id, started_at, latest_at, confirmed_at)
       VALUES (?, ?, ?, ?, NULL)`,
    )
    .bind(sessionId, deviceId, now, now)
    .run();
  return sessionId;
}

export async function recordPortfolioPage(
  request: Request,
  response: Response,
  env: PortfolioAnalyticsEnv,
  now = Math.floor(Date.now() / 1000),
) {
  if (!env.DB || !isEligiblePortfolioNavigation(request, response) || (await isAdmin(request, env.PORTFOLIO_DASHBOARD_TOKEN))) {
    return response;
  }

  const cookies = parseCookies(request);
  const rawDeviceId = cookies[DEVICE_COOKIE] || crypto.randomUUID();
  const deviceId = await sha256(rawDeviceId);
  await startVisit(env.DB, deviceId, now);
  await env.DB.prepare("DELETE FROM portfolio_visit_sessions WHERE started_at < ?").bind(now - NINETY_DAYS).run();

  const headers = new Headers(response.headers);
  if (!cookies[DEVICE_COOKIE]) appendCookie(headers, cookie(DEVICE_COOKIE, rawDeviceId, 365 * 24 * 60 * 60));
  return cloneWithHeaders(response, headers);
}

async function periodSummary(db: D1Database, since: number): Promise<VisitSummaryPeriod> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT device_id) AS devices,
              COUNT(*) AS visits
       FROM portfolio_visit_sessions WHERE started_at >= ?`,
    )
    .bind(since)
    .first<{ devices: number | null; visits: number | null }>();
  return {
    visits: Number(row?.visits ?? 0),
    devices: Number(row?.devices ?? 0),
  };
}

async function getSummary(db: D1Database, now: number): Promise<PortfolioVisitSummary> {
  const todayStart = Math.floor((now + CHINA_TIME_OFFSET) / (24 * 60 * 60)) * (24 * 60 * 60) - CHINA_TIME_OFFSET;
  const dailyResult = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', started_at + ${CHINA_TIME_OFFSET}, 'unixepoch') AS day,
              COUNT(DISTINCT device_id) AS devices,
              COUNT(*) AS visits
       FROM portfolio_visit_sessions WHERE started_at >= ?
       GROUP BY day ORDER BY day ASC`,
    )
    .bind(todayStart - 29 * 24 * 60 * 60)
    .all<{ day: string; devices: number; visits: number }>();
  const earliest = await db
    .prepare("SELECT MIN(started_at) AS earliest FROM portfolio_visit_sessions")
    .first<{ earliest: number | null }>();
  const latest = await db
    .prepare("SELECT MAX(latest_at) AS latest FROM portfolio_visit_sessions")
    .first<{ latest: number | null }>();
  return {
    source: "overseas",
    generatedAt: now,
    trackingStartedAt: earliest?.earliest == null ? null : Number(earliest.earliest),
    today: await periodSummary(db, todayStart),
    last7Days: await periodSummary(db, todayStart - 6 * 24 * 60 * 60),
    last30Days: await periodSummary(db, todayStart - 29 * 24 * 60 * 60),
    daily: (dailyResult.results ?? []).map((row: { day: string; devices: number; visits: number }) => ({
      day: String(row.day),
      visits: Number(row.visits),
      devices: Number(row.devices),
    })),
    latestVisitAt: latest?.latest == null ? null : Number(latest.latest),
  };
}

async function authorized(request: Request, token?: string) {
  if (!token) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return provided.length > 0 && (await sha256(provided)) === (await sha256(token));
}

export async function handlePortfolioAnalyticsApi(
  request: Request,
  env: PortfolioAnalyticsEnv,
  now = Math.floor(Date.now() / 1000),
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/portfolio-visits/confirm" && request.method === "POST") {
    return new Response(null, { status: 204 });
  }
  if (url.pathname === "/api/portfolio-visits/summary" && request.method === "GET") {
    if (!env.DB || !(await authorized(request, env.PORTFOLIO_DASHBOARD_TOKEN))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json(await getSummary(env.DB, now), {
      headers: { "cache-control": "no-store" },
    });
  }
  if (url.pathname === "/api/portfolio-visits/admin/enroll" && request.method === "POST") {
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    if (!env.PORTFOLIO_DASHBOARD_TOKEN || (await sha256(token)) !== (await sha256(env.PORTFOLIO_DASHBOARD_TOKEN))) {
      return new Response("Unauthorized", { status: 401 });
    }
    const headers = new Headers({ location: "/" });
    appendCookie(headers, cookie(ADMIN_COOKIE, await sha256(`portfolio-admin:${token}`), 365 * 24 * 60 * 60));
    return new Response(null, { status: 303, headers });
  }
  return null;
}
