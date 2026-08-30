import path from "node:path";

import { createCodexJsonAgentAdapter } from "../build/codex-json-agent-adapter.mjs";
import { runContextRelationEvaluation } from "../build/context-relation-evaluation-runner.mjs";
import {
  CONTEXT_MAINTENANCE_PROMPT,
  CONTEXT_MAINTENANCE_PROMPT_VERSION,
  ENTRY_CARD_PROMPT,
  ENTRY_CARD_PROMPT_VERSION,
  RELATION_JUDGMENT_PROMPT,
  RELATION_JUDGMENT_PROMPT_VERSION,
  THOUGHT_LINE_CONTEXT_PROMPT,
  THOUGHT_LINE_CONTEXT_PROMPT_VERSION,
} from "../app/thought-line-context-prompts.ts";

const [thoughtLineId, model = "gpt-5.6-sol"] = process.argv.slice(2);
if (!thoughtLineId) throw new Error("用法：node scripts/run-context-relation-evaluation.mjs <ThoughtLine ID> [model]");

const sourceRoot = path.resolve("local-data");
const contextRoot = path.resolve("local-context", "thought-line-context");
const evaluationRoot = path.resolve("local-context", "evaluation");
const codexPath = process.env.HUIYE_CODEX_PATH || "codex";
const agentAdapter = createCodexJsonAgentAdapter({ model, reasoningEffort: "high", codexPath });

const result = await runContextRelationEvaluation({
  sourceRoot,
  contextRoot,
  evaluationRoot,
  thoughtLineId,
  prompts: {
    entryCard: ENTRY_CARD_PROMPT,
    thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT,
    contextMaintenance: CONTEXT_MAINTENANCE_PROMPT,
    relationJudgment: RELATION_JUDGMENT_PROMPT,
  },
  promptVersions: {
    entryCard: ENTRY_CARD_PROMPT_VERSION,
    thoughtLineContext: THOUGHT_LINE_CONTEXT_PROMPT_VERSION,
    contextMaintenance: CONTEXT_MAINTENANCE_PROMPT_VERSION,
    relationJudgment: RELATION_JUDGMENT_PROMPT_VERSION,
  },
  agentAdapter,
  model,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
