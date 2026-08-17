import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoot = path.join(projectRoot, "tools", "portfolio-dashboard");
const configPath = path.join(projectRoot, "local-data", "portfolio-dashboard-admin.json");
const configText = await readFile(configPath, "utf8");
const config = JSON.parse(configText.replace(/^\uFEFF/, ""));
const port = Number(config.port || 4321);
const proxy = typeof config.proxy === "string" ? config.proxy.trim() : "";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function fetchSummary() {
  return new Promise((resolve, reject) => {
    const requestScript = `
      try {
        const response = await fetch(process.env.HUIYE_SUMMARY_URL, {
          headers: {
            authorization: \`Bearer \${process.env.HUIYE_SUMMARY_TOKEN}\`,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36",
          },
        });
        const body = Buffer.from(await response.arrayBuffer());
        if (!response.ok) {
          process.stderr.write(\`HTTP \${response.status}: \${body.toString("utf8")}\`);
          process.exit(22);
        }
        process.stdout.write(body);
      } catch (error) {
        process.stderr.write(error?.cause?.code || error?.message || String(error));
        process.exit(7);
      }
    `;
    const nodeArguments = proxy ? ["--use-env-proxy", "-e", requestScript] : ["-e", requestScript];
    const upstream = spawn(
      process.execPath,
      nodeArguments,
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : {}),
          HUIYE_SUMMARY_URL: `${config.siteOrigin}/api/portfolio-visits/summary`,
          HUIYE_SUMMARY_TOKEN: config.token,
        },
      },
    );
    const stdout = [];
    const stderr = [];
    upstream.stdout.on("data", (chunk) => stdout.push(chunk));
    upstream.stderr.on("data", (chunk) => stderr.push(chunk));
    upstream.on("error", reject);
    upstream.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        if (proxy && code === 7) {
          reject(new Error(`无法连接本地代理 ${proxy}，请先开启代理后刷新看板。`));
          return;
        }
        reject(new Error(detail || `curl exited with ${code}`));
        return;
      }
      resolve({ status: 200, contentType: "application/json", body: Buffer.concat(stdout) });
    });
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/summary") {
      const upstream = await fetchSummary();
      response.writeHead(upstream.status, {
        "content-type": upstream.contentType,
        "cache-control": "no-store",
      });
      response.end(upstream.body);
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
