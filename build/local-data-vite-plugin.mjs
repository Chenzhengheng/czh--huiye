import path from "node:path";
import { readLocalData, writeLocalData } from "./local-data-store.mjs";

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

async function readBody(request, limit = 30 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("数据超过 30MB，已拒绝写入");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function isLocalDataRequestAllowed(request) {
  const host = String(request.headers.host || "").toLowerCase();
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return false;
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function localDataPlugin(options = {}) {
  const rootDir = path.resolve(options.rootDir || "local-data");
  let dataOperation = Promise.resolve();
  const serialize = task => {
    const next = dataOperation.then(task, task);
    dataOperation = next.catch(() => undefined);
    return next;
  };
  return {
    name: "huiye-local-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
        if (pathname !== "/api/data") return next();
        try {
          if (!isLocalDataRequestAllowed(request)) return sendJson(response, 403, { error: "拒绝非本地同源的数据请求" });
          if (request.method === "GET") {
            const stored = await serialize(() => readLocalData(rootDir));
            return sendJson(response, 200, {
              data: stored?.data ?? null,
              updatedAt: stored?.generation.updatedAt ?? null,
              storageKind: "local-folder",
              generationId: stored?.generationId ?? null,
            });
          }
          if (request.method === "PUT") {
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              return sendJson(response, 415, { error: "本地数据写入只接受 JSON" });
            }
            const data = JSON.parse(await readBody(request));
            const saved = await serialize(() => writeLocalData(rootDir, data, { source: "local-app" }));
            return sendJson(response, 200, { saved: true, storageKind: "local-folder", ...saved });
          }
          response.setHeader("allow", "GET, PUT");
          return sendJson(response, 405, { error: "Method Not Allowed" });
        } catch (error) {
          return sendJson(response, 400, { error: error instanceof Error ? error.message : "本地数据读写失败" });
        }
      });
    },
  };
}
