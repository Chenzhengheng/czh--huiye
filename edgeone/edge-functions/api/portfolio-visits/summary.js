import { handleMainlandPortfolioAnalyticsApi } from "../../../lib/portfolio-analytics.js";

export async function onRequest(context) {
  try {
    return await handleMainlandPortfolioAnalyticsApi(
      context.request,
      HUIYE_PORTFOLIO_ANALYTICS,
      context.env,
    );
  } catch (error) {
    console.error("Portfolio summary failed", error);
    return new Response(JSON.stringify({ error: "storage_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
