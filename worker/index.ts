/** Cloudflare Worker entry point for 回页. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handlePortfolioAnalyticsApi, recordPortfolioPage } from "./portfolio-analytics";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PORTFOLIO_DASHBOARD_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const analyticsResponse = await handlePortfolioAnalyticsApi(request, env);
    if (analyticsResponse) return analyticsResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (request.method === "GET" && url.pathname === "/portfolio") {
      try {
        return await recordPortfolioPage(request, response, env);
      } catch (error) {
        console.error("Portfolio analytics failed", error);
        return response;
      }
    }
    return response;
  },
};

export default worker;
