import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readLocalData } from "./local-data-store.mjs";

const STORE_FORMAT = "huiye-thought-line-context";
const STORE_VERSION = 1;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value, label) {
  const result = String(value ?? "");
  if (!result || !/^[\p{L}\p{N}._-]+$/u.test(result)) throw new Error(`${label} 无效：${result}`);
  return result;
}

async function readOptionalText(filePath) {
  try { return await readFile(filePath, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function readOptionalJson(filePath) {
  const text = await readOptionalText(filePath);
  return text === null ? null : JSON.parse(text);
}

async function writeAtomic(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, text, "utf8");
  await rename(temporaryPath, filePath);
}

async function writeJsonAtomic(filePath, value) {
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateAgentOutput(output, eligibleIds) {
  if (!output || typeof output !== "object" || !Array.isArray(output.entryCards)) {
    throw new Error("Context Agent 输出缺少 entryCards");
  }
  if (typeof output.contextMarkdown !== "string" || !output.contextMarkdown.trim()) {
    throw new Error("Context Agent 输出缺少 contextMarkdown");
  }
  const cardsById = new Map();
  for (const card of output.entryCards) {
    if (!card || typeof card !== "object") throw new Error("Context Agent 输出了无效 EntryCard");
    const entryId = String(card.entryId ?? "");
    if (!eligibleIds.has(entryId)) throw new Error(`EntryCard 越过思考线边界：${entryId}`);
    if (cardsById.has(entryId)) throw new Error(`EntryCard 重复：${entryId}`);
    if (typeof card.type !== "string" || !card.type.trim()) throw new Error(`EntryCard 缺少类型：${entryId}`);
    if (typeof card.summary !== "string" || !card.summary.trim()) throw new Error(`EntryCard 缺少概要：${entryId}`);
    if (!Array.isArray(card.topics) || !Array.isArray(card.entities) || !Array.isArray(card.uncertainty)) {
      throw new Error(`EntryCard 列表字段无效：${entryId}`);
    }
    cardsById.set(entryId, card);
  }
  if (cardsById.size !== eligibleIds.size || [...eligibleIds].some((id) => !cardsById.has(id))) {
    throw new Error("Context Agent 必须为每篇合格 Entry 返回一张 EntryCard");
  }
  return { cardsById, contextMarkdown: output.contextMarkdown };
}

function sourceFingerprint(entry) {
  return sha256(stableStringify({
    id: String(entry.id),
    title: entry.title ?? "",
    content: entry.content,
    createdAt: entry.createdAt ?? "",
    updatedAt: entry.updatedAt ?? "",
    tags: entry.tags ?? [],
    thoughtLineIds: entry.thoughtLineIds ?? [],
    aiLink: entry.aiLink,
  }));
}

function normalizeEntryForAgent(entry) {
  return {
    id: entry.id,
    title: entry.title ?? "",
    content: entry.content,
    createdAt: entry.createdAt ?? null,
    updatedAt: entry.updatedAt ?? null,
    tags: entry.tags ?? [],
    thoughtLineIds: entry.thoughtLineIds ?? [],
    sourceFingerprint: sourceFingerprint(entry),
  };
}

const RELATION_TYPES = new Set(["continuation", "revision", "branch", "conflict", "unresolved_question", "other"]);

function normalizeCandidates(output, eligibleIds) {
  if (!output || typeof output !== "object" || !Array.isArray(output.candidates)) throw new Error("Navigation Agent 输出缺少 candidates");
  if (output.candidates.length > 3) throw new Error("Navigation Agent 最多返回 3 个候选组合");
  const seen = new Set();
  return output.candidates.map((candidate, index) => {
    if (!candidate || !Array.isArray(candidate.sourceEntryIds)) throw new Error(`候选 ${index + 1} 缺少来源`);
    const ids = candidate.sourceEntryIds.map((id) => String(id));
    if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error(`候选 ${index + 1} 不是有效的最小来源集`);
    if (ids.some((id) => !eligibleIds.has(id))) throw new Error(`候选 ${index + 1} 越过思考线边界`);
    const key = [...ids].sort().join("\u0000");
    if (seen.has(key)) throw new Error(`Navigation Agent 返回重复来源组合：${ids.join(",")}`);
    seen.add(key);
    if (!RELATION_TYPES.has(candidate.expectedRelationType)) throw new Error(`候选 ${index + 1} 的预期关系类型无效`);
    return { sourceEntryIds: ids, expectedRelationType: candidate.expectedRelationType };
  });
}

function validateVerification(output, candidates, originalEntries) {
  if (!output || typeof output !== "object" || !Array.isArray(output.attempts)) throw new Error("Verification Agent 输出缺少 attempts");
  if (output.attempts.length > candidates.length) throw new Error("Verification Agent 超过 Navigation 候选数");
  let accepted = null;
  for (let index = 0; index < output.attempts.length; index += 1) {
    const attempt = output.attempts[index];
    const expectedIds = candidates[index].sourceEntryIds;
    const actualIds = Array.isArray(attempt?.sourceEntryIds) ? attempt.sourceEntryIds.map(String) : [];
    if (stableStringify(actualIds) !== stableStringify(expectedIds)) throw new Error(`Verification Agent 未按候选顺序核验：${index + 1}`);
    if (!new Set(["rejected", "accepted"]).has(attempt.decision)) throw new Error(`Verification Agent decision 无效：${index + 1}`);
    if (accepted) throw new Error("Verification Agent 接受候选后必须停止");
    if (attempt.decision === "rejected") {
      if (typeof attempt.rejectionStage !== "string" || typeof attempt.reason !== "string") throw new Error(`拒绝记录不完整：${index + 1}`);
      continue;
    }
    if (!RELATION_TYPES.has(attempt.relationType)) throw new Error(`核验关系类型无效：${index + 1}`);
    for (const field of ["reason", "uncertainty", "manifestationGain", "explanationRisk"]) {
      if (typeof attempt[field] !== "string" || !attempt[field].trim()) throw new Error(`接受记录缺少 ${field}`);
    }
    if (!Array.isArray(attempt.evidence) || !Array.isArray(attempt.sourceSummaries)) throw new Error("接受记录缺少证据或来源摘要");
    for (const evidence of attempt.evidence) {
      const entry = originalEntries.get(String(evidence?.entryId));
      if (!entry || typeof evidence.quote !== "string" || !entry.content.includes(evidence.quote)) throw new Error(`证据无法逐字核验：${evidence?.entryId}`);
    }
    accepted = attempt;
  }
  return { attempts: output.attempts, accepted };
}

export function createThoughtLineContextRuntime({
  sourceRoot,
  contextRoot,
  evaluationRoot,
  contextAgent,
  navigationAgent,
  verificationAgent,
  promptVersion,
  navigationPromptVersion,
  verificationPromptVersion,
  model,
  now = () => new Date(),
}) {
  if (!sourceRoot || !contextRoot) throw new Error("ThoughtLineContextRuntime 缺少数据目录");
  if (typeof contextAgent !== "function") throw new Error("ThoughtLineContextRuntime 缺少 Context Agent");
  if (!promptVersion || !model) throw new Error("ThoughtLineContextRuntime 缺少 Prompt 版本或模型");

  return {
    async buildContext(thoughtLineIdValue) {
      const thoughtLineId = safeId(thoughtLineIdValue, "思考线 ID");
      const source = await readLocalData(sourceRoot);
      if (!source) throw new Error("没有可读取的本地数据 generation");
      const thoughtLine = source.data.thoughtLines?.find((line) => line.id === thoughtLineId);
      if (!thoughtLine) throw new Error(`思考线不存在：${thoughtLineId}`);
      if (thoughtLine.status !== "active" || !thoughtLine.allowEcho) throw new Error(`思考线未允许 AI 回响：${thoughtLineId}`);

      const entries = source.data.entries
        .filter((entry) => entry.aiLink && entry.thoughtLineIds?.includes(thoughtLineId))
        .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) || String(left.id).localeCompare(String(right.id)))
        .map(normalizeEntryForAgent);
      if (!entries.length) throw new Error(`思考线没有允许 AI 参与的 Entry：${thoughtLineId}`);

      const lineDir = path.join(contextRoot, "thought-lines", thoughtLineId);
      const contextPath = path.join(lineDir, "context.md");
      const previousContext = await readOptionalText(contextPath);
      const previousCards = [];
      for (const entry of entries) {
        const card = await readOptionalJson(path.join(contextRoot, "entries", safeId(entry.id, "Entry ID"), "card.json"));
        if (card) previousCards.push(card);
      }
      const builtAt = now().toISOString();
      const mode = previousContext === null ? "initial" : "incremental";
      const agentOutput = await contextAgent({
        mode,
        thoughtLine: {
          id: thoughtLine.id,
          name: thoughtLine.name,
          status: thoughtLine.status,
          allowEcho: thoughtLine.allowEcho,
        },
        entries,
        previous: previousContext === null ? null : { contextMarkdown: previousContext, entryCards: previousCards },
        promptVersion,
      });
      const eligibleIds = new Set(entries.map((entry) => String(entry.id)));
      const validated = validateAgentOutput(agentOutput, eligibleIds);

      if (previousContext !== null && previousContext !== validated.contextMarkdown) {
        const historyKey = builtAt.replace(/[:.]/g, "-");
        const historyDir = path.join(lineDir, "history", historyKey);
        await writeAtomic(path.join(historyDir, "context.md"), previousContext);
        await writeJsonAtomic(path.join(historyDir, "change.json"), {
          format: STORE_FORMAT,
          version: STORE_VERSION,
          thoughtLineId,
          changedAt: builtAt,
          previousSha256: sha256(previousContext),
          nextSha256: sha256(validated.contextMarkdown),
        });
      }

      for (const entry of entries) {
        const entryId = String(entry.id);
        const card = validated.cardsById.get(entryId);
        await writeJsonAtomic(path.join(contextRoot, "entries", safeId(entryId, "Entry ID"), "card.json"), {
          format: "huiye-entry-card",
          version: 1,
          ...card,
          entryId: entry.id,
          sourceGenerationId: source.generationId,
          sourceFingerprint: entry.sourceFingerprint,
          source: {
            title: entry.title,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            tags: entry.tags,
            thoughtLineIds: entry.thoughtLineIds,
          },
          promptVersion,
          model,
          updatedAt: builtAt,
        });
      }
      await writeAtomic(contextPath, validated.contextMarkdown);
      await writeJsonAtomic(path.join(lineDir, "record.json"), {
        format: STORE_FORMAT,
        version: STORE_VERSION,
        thoughtLineId,
        thoughtLineName: thoughtLine.name,
        sourceGenerationId: source.generationId,
        entryIds: entries.map((entry) => String(entry.id)),
        contextSha256: sha256(validated.contextMarkdown),
        promptVersion,
        model,
        updatedAt: builtAt,
      });
      await writeJsonAtomic(path.join(contextRoot, "manifest.json"), {
        format: STORE_FORMAT,
        version: STORE_VERSION,
        sourceGenerationId: source.generationId,
        thoughtLines: [thoughtLineId],
        entryIds: entries.map((entry) => String(entry.id)),
        updatedAt: builtAt,
      });

      return {
        thoughtLineId,
        mode,
        sourceGenerationId: source.generationId,
        entryIds: entries.map((entry) => String(entry.id)),
        contextPath,
      };
    },

    async evaluateRelations(thoughtLineIdValue) {
      if (!evaluationRoot) throw new Error("ThoughtLineContextRuntime 缺少评测目录");
      if (typeof navigationAgent !== "function" || typeof verificationAgent !== "function") throw new Error("关系模块缺少 Navigation Agent 或 Verification Agent");
      if (!navigationPromptVersion || !verificationPromptVersion) throw new Error("关系模块缺少 Prompt 版本");
      const thoughtLineId = safeId(thoughtLineIdValue, "思考线 ID");
      const source = await readLocalData(sourceRoot);
      if (!source) throw new Error("没有可读取的本地数据 generation");
      const lineRecord = await readOptionalJson(path.join(contextRoot, "thought-lines", thoughtLineId, "record.json"));
      const contextMarkdown = await readOptionalText(path.join(contextRoot, "thought-lines", thoughtLineId, "context.md"));
      if (!lineRecord || contextMarkdown === null) throw new Error(`请先建立思考线 Context：${thoughtLineId}`);
      if (lineRecord.sourceGenerationId !== source.generationId) throw new Error("Context 对应的源 generation 已过期，请先增量更新");
      const thoughtLine = source.data.thoughtLines?.find((line) => line.id === thoughtLineId);
      if (!thoughtLine || thoughtLine.status !== "active" || !thoughtLine.allowEcho) throw new Error(`思考线未允许 AI 回响：${thoughtLineId}`);

      const originals = source.data.entries
        .filter((entry) => entry.aiLink && entry.thoughtLineIds?.includes(thoughtLineId))
        .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) || String(left.id).localeCompare(String(right.id)));
      const originalEntries = new Map(originals.map((entry) => [String(entry.id), entry]));
      const cards = [];
      for (const entry of originals) {
        const card = await readOptionalJson(path.join(contextRoot, "entries", safeId(entry.id, "Entry ID"), "card.json"));
        if (!card || card.sourceFingerprint !== sourceFingerprint(entry)) throw new Error(`EntryCard 缺失或过期：${entry.id}`);
        cards.push(card);
      }
      const eligibleIds = new Set(originals.map((entry) => String(entry.id)));
      const navigationOutput = await navigationAgent({
        thoughtLine: { id: thoughtLine.id, name: thoughtLine.name },
        contextMarkdown,
        entries: cards,
        promptVersion: navigationPromptVersion,
      });
      const candidates = normalizeCandidates(navigationOutput, eligibleIds);
      const selectedIds = new Set(candidates.flatMap((candidate) => candidate.sourceEntryIds));
      const verificationOutput = candidates.length
        ? await verificationAgent({
          thoughtLine: { id: thoughtLine.id, name: thoughtLine.name },
          candidates,
          entries: originals.filter((entry) => selectedIds.has(String(entry.id))).map(normalizeEntryForAgent),
          promptVersion: verificationPromptVersion,
        })
        : { attempts: [] };
      const verification = validateVerification(verificationOutput, candidates, originalEntries);
      const evaluatedAt = now().toISOString();
      const runId = `${evaluatedAt.replace(/[:.]/g, "-")}-${randomUUID()}`;
      const evaluationPath = path.join(evaluationRoot, "runs", safeId(runId, "评测运行 ID"), "result.json");
      const accepted = verification.accepted;
      const record = {
        format: "huiye-thought-line-relation-evaluation",
        version: 1,
        lifecycle: "evaluation_only",
        runId,
        thoughtLineId,
        sourceGenerationId: source.generationId,
        contextPromptVersion: promptVersion,
        navigationPromptVersion,
        verificationPromptVersion,
        model,
        evaluatedAt,
        candidates,
        attempts: verification.attempts,
        decision: accepted ? "accepted" : "silent",
        ...(accepted ? {
          sourceEntryIds: accepted.sourceEntryIds,
          relationType: accepted.relationType,
          evidence: accepted.evidence,
          sourceSummaries: accepted.sourceSummaries,
          reason: accepted.reason,
          uncertainty: accepted.uncertainty,
          manifestationGain: accepted.manifestationGain,
          explanationRisk: accepted.explanationRisk,
        } : {}),
      };
      await writeJsonAtomic(evaluationPath, record);
      await writeJsonAtomic(path.join(evaluationRoot, "index.json"), {
        format: "huiye-thought-line-relation-evaluation-index",
        version: 1,
        latestRunId: runId,
        runs: [{ runId, thoughtLineId, decision: record.decision, evaluatedAt }],
      });
      return {
        runId,
        thoughtLineId,
        decision: record.decision,
        ...(accepted ? { sourceEntryIds: accepted.sourceEntryIds, relationType: accepted.relationType } : {}),
        evaluationPath,
      };
    },
  };
}
