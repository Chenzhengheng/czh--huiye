import { handleMainlandPortfolioAnalyticsApi } from "../../../../lib/portfolio-analytics.js";

export function onRequest(context) {
  return handleMainlandPortfolioAnalyticsApi(context.request, null, context.env);
}
