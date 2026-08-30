import path from "node:path";
import { readLocalData, writeLocalData } from "../build/local-data-store.mjs";

const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) {
  throw new Error("用法：node scripts/create-isolated-context-generation.mjs <源 local-data> <开发版 local-data>");
}

const sourceRoot = path.resolve(sourceArgument);
const destinationRoot = path.resolve(destinationArgument);
if (sourceRoot.toLowerCase() === destinationRoot.toLowerCase()) {
  throw new Error("源目录与开发版目录不能相同");
}

const source = await readLocalData(sourceRoot);
if (!source) throw new Error(`源目录没有有效 generation：${sourceRoot}`);
const written = await writeLocalData(destinationRoot, source.data, {
  source: `isolated-context-copy:${source.generationId}`,
});

process.stdout.write(`${JSON.stringify({
  sourceGenerationId: source.generationId,
  destinationGenerationId: written.generationId,
  destinationRoot,
}, null, 2)}\n`);
