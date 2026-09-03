import { execFile } from "node:child_process";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const workspaceDir = process.cwd();
const outputDir = path.resolve(
  process.argv[2] ?? path.join(".site-artifacts", "edgeone-public"),
);
const archivePath = path.resolve(
  process.argv[3] ?? path.join(".site-artifacts", "huiye-edgeone.zip"),
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
if (
  archivePath === path.parse(archivePath).root ||
  archivePath === workspaceDir ||
  containsPath(archivePath, workspaceDir) ||
  archivePath === outputDir ||
  containsPath(outputDir, archivePath)
) {
  throw new Error(`Refusing unsafe archive path: ${archivePath}`);
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
const renderedPages = new Map();

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
  const renderedHtml = await response.text();
  const html = route.pathname === "/"
    ? renderedHtml.replace(
        "</body>",
        '<script src="/portfolio-visit.js" defer></script></body>',
      )
    : renderedHtml;
  renderedPages.set(route.file, html);
  await writeFile(target, html, "utf8");
}

const assetNames = new Set();
const pendingContents = [...renderedPages.values()];
for (let index = 0; index < pendingContents.length; index += 1) {
  const content = pendingContents[index];
  const localAssetPattern = /(?<![A-Za-z0-9])\/assets\/([A-Za-z0-9._-]+)/g;
  for (const match of content.matchAll(localAssetPattern)) {
    const assetName = match[1];
    if (assetNames.has(assetName)) continue;
    assetNames.add(assetName);
    const source = path.join(clientDir, "assets", assetName);
    const linkedContent = /\.(?:css|js)$/.test(assetName)
      ? await readFile(source, "utf8").catch(() => null)
      : null;
    if (linkedContent !== null) pendingContents.push(linkedContent);
  }
}

await mkdir(path.join(outputDir, "assets"), { recursive: true });
for (const assetName of assetNames) {
  await copyFile(
    path.join(clientDir, "assets", assetName),
    path.join(outputDir, "assets", assetName),
  );
}

for (const publicFile of ["og.png"]) {
  const source = path.join(clientDir, publicFile);
  await stat(source)
    .then(() => copyFile(source, path.join(outputDir, publicFile)))
    .catch(() => undefined);
}

await copyFile(
  path.join("edgeone", "portfolio-visit.js"),
  path.join(outputDir, "portfolio-visit.js"),
);
await cp(path.join("edgeone", "edge-functions"), path.join(outputDir, "edge-functions"), {
  recursive: true,
});
await cp(path.join("edgeone", "lib"), path.join(outputDir, "lib"), {
  recursive: true,
});

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

await mkdir(path.dirname(archivePath), { recursive: true });
await rm(archivePath, { force: true });
await execFileAsync("tar", ["-a", "-c", "-f", archivePath, "."], {
  cwd: outputDir,
});

console.log(
  `Exported ${routes.length} public routes and ${assetNames.size} assets to ${outputDir}\nCreated ${archivePath}`,
);
