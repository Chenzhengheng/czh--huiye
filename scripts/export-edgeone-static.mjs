import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = process.cwd();
const outputDir = path.resolve(
  process.argv[2] ?? path.join(".site-artifacts", "edgeone-public"),
);
const clientDir = path.resolve("dist", "client");
const workerEntry = path.resolve("dist", "server", "index.js");
const publicOrigin = "https://huiye-ai.cn";

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

if (
  outputDir === path.parse(outputDir).root ||
  outputDir === workspaceDir ||
  containsPath(outputDir, workspaceDir)
) {
  throw new Error(`Refusing unsafe output directory: ${outputDir}`);
}

await Promise.all([stat(clientDir), stat(workerEntry)]).catch(() => {
  throw new Error("Missing dist build. Run `pnpm build` before exporting EdgeOne assets.");
});

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const workerUrl = pathToFileURL(workerEntry);
workerUrl.searchParams.set("edgeone-export", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const routes = [
  { pathname: "/", file: "index.html" },
  { pathname: "/portfolio/demo", file: "portfolio/demo/index.html" },
  {
    pathname: "/portfolio/demo/evaluation",
    file: "portfolio/demo/evaluation/index.html",
  },
];

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`${publicOrigin}${route.pathname}`, {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "huiye-ai.cn",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to render ${route.pathname}: ${response.status}`);
  }

  const target = path.join(outputDir, route.file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await response.text(), "utf8");
}

await cp(path.join(clientDir, "assets"), path.join(outputDir, "assets"), {
  recursive: true,
});

for (const publicFile of ["favicon.svg", "file.svg", "globe.svg", "og.png", "window.svg"]) {
  const source = path.join(clientDir, publicFile);
  await stat(source)
    .then(() => cp(source, path.join(outputDir, publicFile)))
    .catch(() => undefined);
}

const edgeOneConfig = {
  redirects: [
    { source: "/portfolio", destination: "/", statusCode: 301 },
    { source: "/portfolio/", destination: "/", statusCode: 301 },
  ],
};
await writeFile(
  path.join(outputDir, "edgeone.json"),
  `${JSON.stringify(edgeOneConfig, null, 2)}\n`,
  "utf8",
);

for (const route of routes) {
  const html = await readFile(path.join(outputDir, route.file), "utf8");
  if (!html.includes("粤ICP备2026122805号")) {
    throw new Error(`Missing ICP filing number in ${route.file}`);
  }
}

console.log(`Exported ${routes.length} public routes to ${outputDir}`);
