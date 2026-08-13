import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoot = path.join(projectRoot, "tools", "portfolio-dashboard");
const configPath = path.join(projectRoot, "local-data", "portfolio-dashboard-admin.json");
const configText = await readFile(configPath, "utf8");
const config = JSON.parse(configText.replace(/^\uFEFF/, ""));
const port = Number(config.port || 4321);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/summary") {
      const upstream = await fetch(`${config.siteOrigin}/api/portfolio-visits/summary`, {
        headers: { authorization: `Bearer ${config.token}` },
      });
      response.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }

    if (url.pathname === "/exclude") {
      const escapedToken = config.token.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><meta charset="utf-8"><title>正在排除本机</title><form id="f" method="post" action="${config.siteOrigin}/api/portfolio-visits/admin/enroll"><input type="hidden" name="token" value="${escapedToken}"></form><p>正在将这台浏览器标记为管理员设备…</p><script>document.getElementById('f').submit()</script>`);
      return;
    }

    const fileName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(dashboardRoot, fileName);
    if (!filePath.startsWith(`${dashboardRoot}${path.sep}`)) throw new Error("Invalid path");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`访问看板启动失败：${error.message || error}`);
  }
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`http://127.0.0.1:${port}\n`));
