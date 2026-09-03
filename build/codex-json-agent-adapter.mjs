import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const STRING = { type: "string" };
const ENTRY_ID = { anyOf: [{ type: "integer" }, { type: "string" }] };

const entryCardsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entryCards"],
  properties: {
    entryCards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entryId", "summary", "uncertainty"],
        properties: {
          entryId: ENTRY_ID,
          summary: STRING,
          uncertainty: { type: "array", items: STRING },
        },
      },
    },
  },
};

const macroSchema = {
  type: "object",
  additionalProperties: false,
  required: ["macroSections"],
  properties: {
    macroSections: {
      type: "object",
      additionalProperties: false,
      required: ["discusses", "majorConcerns", "thoughtStages", "stableView", "currentFocus", "tensions"],
      properties: Object.fromEntries(["discusses", "majorConcerns", "thoughtStages", "stableView", "currentFocus", "tensions"].map((key) => [key, STRING])),
    },
  },
};

const maintenanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "affectedEntryIds", "affectedSections", "reason"],
  properties: {
    decision: { type: "string", enum: ["no_context_change", "revise_context", "full_rebuild_needed"] },
    affectedEntryIds: { type: "array", items: ENTRY_ID },
    affectedSections: { type: "array", items: { type: "string", enum: ["discusses", "majorConcerns", "thoughtStages", "stableView", "currentFocus", "tensions"] } },
    reason: STRING,
  },
};

const structuredNavigationBasisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["attentionSignal", "whyTheseEntries", "minimalityBasis", "checkFocus"],
  properties: {
    attentionSignal: STRING,
    whyTheseEntries: STRING,
    minimalityBasis: STRING,
    checkFocus: STRING,
  },
};

const candidatesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["thoughtLineId", "entryIds", "navigationBasis"],
        properties: {
          thoughtLineId: STRING,
          entryIds: { type: "array", minItems: 2, maxItems: 3, items: ENTRY_ID },
          navigationBasis: structuredNavigationBasisSchema,
        },
      },
    },
  },
};

const pairedCandidatesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["thoughtLineId", "entryIds", "navigationBasis"],
        properties: {
          thoughtLineId: STRING,
          entryIds: { type: "array", minItems: 2, maxItems: 3, items: ENTRY_ID },
          navigationBasis: structuredNavigationBasisSchema,
        },
      },
    },
  },
};

const echoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "thoughtLineId", "relationType", "sourceEntryIds", "triggerEntryId", "evidence", "sourceSummaries", "reason", "question", "manifestationGain", "explanationRisk", "uncertainty"],
  properties: {
    mode: { type: "string", const: "relational" },
    thoughtLineId: STRING,
    relationType: { type: "string", enum: ["continuation", "revision", "branch", "conflict", "unresolved_question", "other"] },
    sourceEntryIds: { type: "array", minItems: 2, maxItems: 3, items: { type: "integer" } },
    triggerEntryId: { type: "integer" },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entryId", "quote"],
        properties: { entryId: { type: "integer" }, quote: STRING },
      },
    },
    sourceSummaries: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entryId", "text"],
        properties: { entryId: { type: "integer" }, text: STRING },
      },
    },
    reason: STRING,
    question: { type: ["string", "null"] },
    manifestationGain: STRING,
    explanationRisk: { type: "string", enum: ["low", "medium", "high"] },
    uncertainty: STRING,
  },
};

function pairedJudgmentSchema({ completeness, contextEffects }) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["decision", "assessment", "echo"],
    properties: {
      decision: { type: "string", enum: ["next_candidate", "output"] },
      assessment: {
        type: "object",
        additionalProperties: false,
        required: ["decisionReason", "candidateCompleteness", "indispensableMissingEntryIds", "contextEffect"],
        properties: {
          decisionReason: STRING,
          candidateCompleteness: { type: "string", enum: completeness },
          indispensableMissingEntryIds: { type: "array", items: ENTRY_ID },
          contextEffect: { type: "string", enum: contextEffects },
        },
      },
      echo: { anyOf: [echoSchema, { type: "null" }] },
    },
  };
}

const judgmentBSchema = pairedJudgmentSchema({
  completeness: ["sufficient", "uncertain"],
  contextEffects: ["not_provided"],
});
const judgmentCSchema = pairedJudgmentSchema({
  completeness: ["sufficient", "missing_indispensable_entry", "uncertain"],
  contextEffects: ["no_material_effect", "changed_interpretation", "revealed_gap"],
});
const judgmentSchema = judgmentCSchema;

function promptFor(prompt, promptVersion, step, input) {
  const { prompt: _prompt, promptVersion: _version, ...payload } = input;
  const compatibilityNote = step.startsWith("check_candidate_")
    ? "\n为兼容 Structured Outputs：decision 为 next_candidate 时必须同时返回 echo: null；decision 为 output 时 echo 必须是完整对象。"
    : "";
  return `${prompt}\n\n## 本次 Harness 调用\n\npromptVersion: ${promptVersion}\ncurrentStep: ${step}\n\n不得调用工具，不得读取文件，不得补充输入外的信息。严格按照指定 JSON Schema 返回。${compatibilityNote}\n\n输入 JSON：\n${JSON.stringify(payload)}`;
}

export async function invokeCodexJson({ prompt, schema, model, reasoningEffort = "high", codexPath = "codex" }) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "huiye-codex-json-"));
  const schemaPath = path.join(temporaryRoot, "schema.json");
  const outputPath = path.join(temporaryRoot, "output.json");
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  try {
    const stderr = [];
    const child = spawn(codexPath, [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--model", model,
      "-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
      "--output-schema", schemaPath,
      "--output-last-message", outputPath,
      "-",
    ], { cwd: temporaryRoot, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.end(prompt, "utf8");
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (exitCode !== 0) throw new Error(`Codex JSON Agent 失败（${exitCode}）：${Buffer.concat(stderr).toString("utf8").slice(-4000)}`);
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function createCodexJsonAgentAdapter(options = {}) {
  const invoke = options.invokeJson ?? invokeCodexJson;
  const model = options.model ?? "gpt-5.6-sol";
  const call = (input, step, schema) => invoke({
    prompt: promptFor(input.prompt, input.promptVersion, step, input),
    schema,
    model,
    reasoningEffort: options.reasoningEffort ?? "high",
    codexPath: options.codexPath,
  });
  const normalizePairedJudgment = (output, label) => {
    if (output.decision === "next_candidate") return output;
    if (!output.echo) throw new Error(`Codex JSON Agent 决定 output 时缺少 ${label} echo`);
    if (output.echo.question === null) delete output.echo.question;
    return output;
  };
  return Object.freeze({
    generateEntryCards: async (input) => (await call(input, "generate_entry_cards", entryCardsSchema)).entryCards,
    generateThoughtLineContext: (input) => call(input, "generate_thought_line_context", macroSchema),
    decideMaintenance: (input) => call(input, "decide_maintenance", maintenanceSchema),
    selectCandidates: (input) => call(input, input.step, candidatesSchema),
    judgeCandidate: async (input) => normalizePairedJudgment(await call(input, input.step, judgmentSchema), "C"),
    selectRelationCandidates: (input) => call(input, input.step, pairedCandidatesSchema),
    judgeRelationCandidateB: async (input) => normalizePairedJudgment(await call(input, input.step, judgmentBSchema), "B"),
    judgeRelationCandidateC: async (input) => normalizePairedJudgment(await call(input, input.step, judgmentCSchema), "C"),
  });
}
