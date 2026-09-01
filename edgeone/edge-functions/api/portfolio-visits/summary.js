import { handleMainlandPortfolioAnalyticsApi } from "../../_shared/portfolio-analytics.js";

export function onRequest(context) {
  return handleMainlandPortfolioAnalyticsApi(context.request, context.env);
}
