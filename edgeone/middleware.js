import { recordMainlandPortfolioPage } from "./lib/portfolio-analytics.js";

export async function middleware(context) {
  const response = await context.next();
  try {
    return await recordMainlandPortfolioPage(context.request, response, context.env);
  } catch (error) {
    console.error("Portfolio analytics failed", error);
    return response;
  }
}

export const config = { matcher: "/" };
