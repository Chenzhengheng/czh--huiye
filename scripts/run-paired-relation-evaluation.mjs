import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import { createCodexJsonAgentAdapter } from "../build/codex-json-agent-adapter.mjs";
import { runPairedRelationEvaluation } from "../build/paired-relation-evaluation.mjs";
import {
  RELATION_CANDIDATE_SELECTION_PROMPT,
  RELATION_CANDIDATE_SELECTION_PROMPT_VERSION,
  RELATION_JUDGMENT_B_PROMPT,
  RELATION_JUDGMENT_B_PROMPT_VERSION,
  RELATION_JUDGMENT_C_PROMPT,
  RELATION_JUDGMENT_C_PROMPT_VERSION,
} from "../app/thought-line-context-prompts.ts";

const [thoughtLineId, model = "gpt-5.6-sol"] = process.argv.slice(2);
if (!thoughtLineId) {
  throw new Error("用法：node scripts/run-paired-relation-evaluation.mjs <ThoughtLine ID> [model]");
}

const sourceRoot = path.resolve("local-data");
const contextRoot = path.resolve("local-context", "thought-line-context");
const evaluationRoot = path.resolve("local-context", "evaluation");
const reasoningEffort = "high";
const stableDataRoot = process.env.HUIYE_STABLE_DATA_ROOT
  ? path.resolve(process.env.HUIYE_STABLE_DATA_ROOT)
  : null;

async function dataProtectionSnapshot(root) {
  const current = await readFile(path.join(root, "current.json"));
  const echoNames = (await readdir(path.join(root, "echoes"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return {
    currentSha256: createHash("sha256").update(current).digest("hex"),
    echoNames,
  };
}

const protectionBefore = {
  isolatedSource: await dataProtectionSnapshot(sourceRoot),
  ...(stableDataRoot ? { stablePrivate: await dataProtectionSnapshot(stableDataRoot) } : {}),
};
const agentAdapter = createCodexJsonAgentAdapter({
  model,
  reasoningEffort,
  codexPath: process.env.HUIYE_CODEX_PATH || "codex",
});

const result = await runPairedRelationEvaluation({
  sourceRoot,
  contextRoot,
  evaluationRoot,
  thoughtLineId,
  prompts: {
    candidateSelection: RELATION_CANDIDATE_SELECTION_PROMPT,
    judgmentB: RELATION_JUDGMENT_B_PROMPT,
    judgmentC: RELATION_JUDGMENT_C_PROMPT,
  },
  promptVersions: {
    candidateSelection: RELATION_CANDIDATE_SELECTION_PROMPT_VERSION,
    judgmentB: RELATION_JUDGMENT_B_PROMPT_VERSION,
    judgmentC: RELATION_JUDGMENT_C_PROMPT_VERSION,
  },
  agentAdapter,
  model,
  reasoningEffort,
});

const protectionAfter = {
  isolatedSource: await dataProtectionSnapshot(sourceRoot),
  ...(stableDataRoot ? { stablePrivate: await dataProtectionSnapshot(stableDataRoot) } : {}),
};
if (!isDeepStrictEqual(protectionBefore, protectionAfter)) {
  throw new Error("配对评测改变了受保护的 local-data 指针或 Echo 文件集合");
}
const verificationPath = path.join(path.dirname(result.evaluationPath), "data-protection.json");
await writeFile(verificationPath, `${JSON.stringify({
  format: "huiye-paired-relation-data-protection",
  version: 1,
  verifiedAt: new Date().toISOString(),
  unchanged: true,
  before: protectionBefore,
  after: protectionAfter,
}, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  runId: result.runId,
  thoughtLineId: result.thoughtLineId,
  sourceGenerationId: result.sourceGenerationId,
  promptVersions: result.promptVersions,
  model: result.model,
  reasoningEffort: result.reasoningEffort,
  decisions: { B: result.variants.B.decision, C: result.variants.C.decision },
  attemptCounts: { B: result.variants.B.attempts.length, C: result.variants.C.attempts.length },
  evaluationPath: result.evaluationPath,
  verificationPath,
}, null, 2)}\n`);
