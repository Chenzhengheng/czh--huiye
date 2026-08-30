import { readFile } from "node:fs/promises";
import path from "node:path";
import { createThoughtLineContextRuntime } from "../build/thought-line-context-runtime.mjs";

const LEGACY_CONTEXT_PROMPT_VERSION = "legacy-thought-line-context-v0.1";

const [thoughtLineId, outputArgument] = process.argv.slice(2);
if (!thoughtLineId || !outputArgument) {
  throw new Error("用法：node --experimental-strip-types scripts/run-manual-context-agent.mjs <思考线 ID> <Context Agent 输出 JSON>");
}

const output = JSON.parse(await readFile(path.resolve(outputArgument), "utf8"));
const runtime = createThoughtLineContextRuntime({
  sourceRoot: path.resolve("local-data"),
  contextRoot: path.resolve("local-context", "thought-line-context"),
  contextAgent: async () => output,
  promptVersion: LEGACY_CONTEXT_PROMPT_VERSION,
  model: "gpt-5",
});

process.stdout.write(`${JSON.stringify(await runtime.buildContext(thoughtLineId), null, 2)}\n`);
