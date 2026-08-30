import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const MACRO_SECTIONS = [
  "discusses",
  "majorConcerns",
  "thoughtStages",
  "stableView",
  "currentFocus",
  "tensions",
];

const PROMPT_MODULES = [
  "entryCard",
  "thoughtLineContext",
  "contextMaintenance",
  "relationJudgment",
];

const MAINTENANCE_DECISIONS = new Set([
  "no_context_change",
  "revise_context",
  "full_rebuild_needed",
]);

function safeId(value, label) {
  const result = String(value ?? "");
  if (!result || !/^[\p{L}\p{N}._-]+$/u.test(result)) throw new Error(`${label} 无效：${result}`);
  return result;
}

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

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function entrySourceFingerprint(entry) {
  return sha256(stableStringify({
    id: String(entry.id),
    title: entry.title ?? "",
    content: entry.content,
    createdAt: entry.createdAt ?? null,
    updatedAt: entry.updatedAt ?? null,
    tags: entry.tags ?? [],
    thoughtLineIds: entry.thoughtLineIds ?? [],
    aiLink: entry.aiLink,
  }));
}

function validatePromptVersions(promptVersions) {
  for (const moduleName of PROMPT_MODULES) {
    if (!promptVersions?.[moduleName]) throw new Error(`ContextModule 缺少 Prompt 版本：${moduleName}`);
  }
}

function validatePromptTexts(prompts) {
  for (const moduleName of ["entryCard", "thoughtLineContext", "contextMaintenance"]) {
    if (typeof prompts?.[moduleName] !== "string" || !prompts[moduleName].trim()) {
      throw new Error(`ContextModule 缺少 Prompt 正文：${moduleName}`);
    }
  }
}

function validateEntryCardOutputs(outputs, eligibleEntries) {
  if (!Array.isArray(outputs)) throw new Error("EntryCard Agent 输出无效");
  const eligibleIds = new Set(eligibleEntries.map((entry) => String(entry.id)));
  const cardsById = new Map();
  for (const output of outputs) {
    const entryId = String(output?.entryId ?? "");
    if (!eligibleIds.has(entryId) || cardsById.has(entryId)) throw new Error(`EntryCard 输出越界或重复：${entryId}`);
    if (typeof output.summary !== "string" || !output.summary.trim() || !Array.isArray(output.uncertainty)) {
      throw new Error(`EntryCard 输出不完整：${entryId}`);
    }
    cardsById.set(entryId, output);
  }
  if (cardsById.size !== eligibleEntries.length) throw new Error("每篇合格 Entry 必须恰好生成一张 EntryCard");
  return cardsById;
}

function validateMacroSections(output) {
  const sections = output?.macroSections;
  if (!sections || typeof sections !== "object") throw new Error("ThoughtLineContext Agent 输出无效");
  for (const section of MACRO_SECTIONS) {
    if (typeof sections[section] !== "string") throw new Error(`ThoughtLineContext 缺少宏观章节：${section}`);
  }
  return Object.fromEntries(MACRO_SECTIONS.map((section) => [section, sections[section]]));
}

function validateMaintenanceDecision(output, eligibleEntryIds) {
  if (!MAINTENANCE_DECISIONS.has(output?.decision)) throw new Error("ContextMaintenance Agent 输出无效");
  if (!Array.isArray(output.affectedEntryIds) || !Array.isArray(output.affectedSections) || typeof output.reason !== "string" || !output.reason.trim()) {
    throw new Error("ContextMaintenance Agent 输出不完整");
  }
  const eligibleIds = new Set(eligibleEntryIds.map(String));
  for (const entryId of output.affectedEntryIds.map(String)) {
    if (!eligibleIds.has(entryId)) throw new Error(`ContextMaintenance 输出越界 Entry：${entryId}`);
  }
  for (const section of output.affectedSections) {
    if (!MACRO_SECTIONS.includes(section)) throw new Error(`ContextMaintenance 输出未知章节：${section}`);
  }
  return {
    decision: output.decision,
    affectedEntryIds: output.affectedEntryIds.map(String),
    affectedSections: [...output.affectedSections],
    reason: output.reason,
  };
}

export async function maintainContext({
  signal,
  contextRoot,
  sourceReader,
  agentAdapter,
  promptVersions,
  prompts,
  now,
}) {
  if (!new Set(["initial_build", "entry_increment", "prompt_change", "feedback_not_quite"]).has(signal?.type)) {
    throw new Error(`ContextMaintenance 暂不支持信号：${signal?.type ?? ""}`);
  }
  if (typeof sourceReader !== "function") throw new Error("ContextModule 缺少来源读取 Adapter");
  if (typeof agentAdapter?.generateEntryCards !== "function" || typeof agentAdapter?.generateThoughtLineContext !== "function") {
    throw new Error("ContextModule 缺少 Fake Agent Adapter");
  }
  validatePromptVersions(promptVersions);
  validatePromptTexts(prompts);

  const thoughtLineId = safeId(signal.thoughtLineId, "思考线 ID");
  const source = await sourceReader();
  if (!source?.generationId || !source.data) throw new Error("ContextModule 没有可读取的来源 generation");
  const thoughtLine = source.data.thoughtLines?.find((line) => line.id === thoughtLineId);
  if (!thoughtLine) throw new Error(`思考线不存在：${thoughtLineId}`);
  if (thoughtLine.status !== "active" || !thoughtLine.allowEcho) throw new Error(`思考线未允许 AI 使用：${thoughtLineId}`);

  const entries = (source.data.entries ?? [])
    .filter((entry) => entry.aiLink && entry.thoughtLineIds?.includes(thoughtLineId))
    .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) || String(left.id).localeCompare(String(right.id)));
  if (!entries.length) throw new Error(`思考线没有允许 AI 使用的 Entry：${thoughtLineId}`);

  const createdAt = now().toISOString();
  const lineRoot = path.join(contextRoot, "thought-lines", thoughtLineId);
  const previousSnapshot = await readOptionalJson(path.join(lineRoot, "snapshot.json"));
  if (signal.type === "initial_build" && previousSnapshot) throw new Error(`ThoughtLineContext 已存在：${thoughtLineId}`);
  if (signal.type !== "initial_build" && !previousSnapshot) throw new Error(`ThoughtLineContext 尚未建立：${thoughtLineId}`);
  const affectedThoughtLineIds = signal.type === "prompt_change"
    ? [...new Set([
      ...(signal.thoughtLineIds ?? []),
      ...(source.data.thoughtLines ?? []).map((line) => line.id),
      thoughtLineId,
    ])]
    : signal.type === "entry_increment"
      ? [...new Set([
      ...(signal.thoughtLineIds ?? []),
      ...(source.data.entries ?? [])
        .filter((entry) => (signal.entryIds ?? []).map(String).includes(String(entry.id)))
        .flatMap((entry) => entry.thoughtLineIds ?? []),
      thoughtLineId,
      ])]
      : [thoughtLineId];
  const markAffectedContextsStale = async () => {
    for (const affectedThoughtLineIdValue of affectedThoughtLineIds) {
      const affectedThoughtLineId = safeId(affectedThoughtLineIdValue, "受影响思考线 ID");
      const affectedLineRoot = path.join(contextRoot, "thought-lines", affectedThoughtLineId);
      const affectedSnapshot = affectedThoughtLineId === thoughtLineId
        ? previousSnapshot
        : await readOptionalJson(path.join(affectedLineRoot, "snapshot.json"));
      if (!affectedSnapshot) continue;
      await writeJsonAtomic(path.join(affectedLineRoot, "state.json"), {
        format: "huiye-context-state",
        version: 1,
        thoughtLineId: affectedThoughtLineId,
        snapshotId: affectedSnapshot.snapshotId,
        status: "stale",
        updatedAt: createdAt,
      });
    }
  };
  if (signal.type === "entry_increment" || signal.type === "prompt_change") {
    await markAffectedContextsStale();
  }
  let maintenanceDecision = null;
  if (signal.type !== "initial_build") {
    if (typeof agentAdapter.decideMaintenance !== "function") throw new Error("ContextModule 缺少 ContextMaintenance Agent Adapter");
    if (!prompts?.contextMaintenance) throw new Error("ContextModule 缺少 ContextMaintenance Prompt");
    const relatedEntryIds = signal.type === "feedback_not_quite"
      ? (signal.feedback?.sourceEntryIds ?? []).map(String)
      : signal.type === "entry_increment"
        ? (signal.entryIds ?? []).map(String)
        : entries.map((entry) => String(entry.id));
    if (signal.type === "feedback_not_quite" && (relatedEntryIds.length < 2 || relatedEntryIds.length > 3 || new Set(relatedEntryIds).size !== relatedEntryIds.length)) {
      throw new Error("not_quite 反馈必须引用原回响的 2–3 篇来源");
    }
    const relatedEntries = entries.filter((entry) => relatedEntryIds.includes(String(entry.id)));
    if (relatedEntries.length !== new Set(relatedEntryIds).size) throw new Error("ContextMaintenance 信号包含不可用来源");
    const referencesByEntryId = new Map(previousSnapshot.thoughtLineContext.entryCardReferences
      .map((reference) => [String(reference.entryId), reference]));
    const relatedEntryCards = [];
    for (const entry of relatedEntries) {
      const entryId = String(entry.id);
      const reference = referencesByEntryId.get(entryId);
      const card = reference
        ? await readOptionalJson(path.join(contextRoot, "entries", entryId, "versions", `${safeId(reference.cardVersion, "EntryCard 版本")}.json`))
        : null;
      if (!card && signal.type === "feedback_not_quite") throw new Error(`not_quite 反馈缺少 EntryCard：${entryId}`);
      if (card) relatedEntryCards.push(card);
    }
    maintenanceDecision = validateMaintenanceDecision(await agentAdapter.decideMaintenance({
      maintenanceSignal: signal,
      currentContext: previousSnapshot.thoughtLineContext,
      relatedEntries,
      relatedEntryCards,
      changedEntries: signal.type === "entry_increment" ? relatedEntries : [],
      prompt: prompts.contextMaintenance,
      promptVersion: promptVersions.contextMaintenance,
    }), entries.map((entry) => entry.id));
    if (signal.type === "prompt_change" && maintenanceDecision.decision !== "full_rebuild_needed") {
      throw new Error("Prompt 变化必须全量重建 Context");
    }
    if (signal.type === "feedback_not_quite" && maintenanceDecision.decision === "no_context_change") {
      return {
        thoughtLineId,
        status: "ready",
        maintenanceDecision: maintenanceDecision.decision,
        snapshotId: previousSnapshot.snapshotId,
      };
    }
    if (signal.type === "feedback_not_quite") await markAffectedContextsStale();
  }
  const reusableCards = new Map();
  const entriesNeedingCards = [];
  for (const entry of entries) {
    const entryId = String(entry.id);
    const pointer = await readOptionalJson(path.join(contextRoot, "entries", entryId, "current.json"));
    const card = pointer?.cardVersion
      ? await readOptionalJson(path.join(contextRoot, "entries", entryId, "versions", `${safeId(pointer.cardVersion, "EntryCard 版本")}.json`))
      : null;
    if (card?.sourceFingerprint === entrySourceFingerprint(entry) && card.promptVersion === promptVersions.entryCard) {
      reusableCards.set(entryId, card);
    } else {
      entriesNeedingCards.push(entry);
    }
  }
  const cardOutputs = entriesNeedingCards.length
    ? validateEntryCardOutputs(await agentAdapter.generateEntryCards({
      entries: entriesNeedingCards,
      prompt: prompts?.entryCard,
      promptVersion: promptVersions.entryCard,
    }), entriesNeedingCards)
    : new Map();
  const entryCards = entries.map((entry) => {
    const reusableCard = reusableCards.get(String(entry.id));
    if (reusableCard) return reusableCard;
    const output = cardOutputs.get(String(entry.id));
    const cardBody = {
      format: "huiye-entry-card-version",
      version: 1,
      entryId: entry.id,
      occurredAt: entry.createdAt ?? null,
      tags: entry.tags ?? [],
      thoughtLineIds: entry.thoughtLineIds ?? [],
      aiLink: entry.aiLink,
      sourceRef: { entryId: String(entry.id) },
      sourceFingerprint: entrySourceFingerprint(entry),
      summary: output.summary,
      uncertainty: output.uncertainty,
      promptVersion: promptVersions.entryCard,
      createdAt,
    };
    const cardVersion = `card-${sha256(stableStringify(cardBody)).slice(0, 24)}`;
    return { ...cardBody, cardVersion };
  });

  const macroSections = maintenanceDecision?.decision === "no_context_change"
    ? previousSnapshot.thoughtLineContext.macroSections
    : validateMacroSections(await agentAdapter.generateThoughtLineContext({
      thoughtLine: { id: thoughtLine.id, name: thoughtLine.name },
      entryCards,
      prompt: prompts?.thoughtLineContext,
      promptVersion: promptVersions.thoughtLineContext,
      maintenanceDecision,
      previousContext: previousSnapshot?.thoughtLineContext ?? null,
    }));
  const entryCardReferences = entryCards.map((card) => ({
    entryId: String(card.entryId),
    cardVersion: card.cardVersion,
    sha256: sha256(stableStringify(card)),
  }));
  const snapshotBody = {
    format: "huiye-context-snapshot",
    version: 1,
    status: "ready",
    sourceGenerationId: source.generationId,
    thoughtLine: { id: thoughtLine.id, name: thoughtLine.name },
    thoughtLineContext: { macroSections, entryCardReferences },
    promptVersions,
    trigger: signal,
    maintenanceMethod: maintenanceDecision?.decision === "full_rebuild_needed" || signal.type === "prompt_change" || signal.type === "initial_build"
      ? "full_rebuild"
      : "incremental",
    createdAt,
  };
  const snapshot = {
    ...snapshotBody,
    snapshotId: `snapshot-${sha256(stableStringify(snapshotBody)).slice(0, 24)}`,
  };

  for (const card of entryCards) {
    const entryRoot = path.join(contextRoot, "entries", String(card.entryId));
    await writeJsonAtomic(path.join(entryRoot, "versions", `${card.cardVersion}.json`), card);
    await writeJsonAtomic(path.join(entryRoot, "current.json"), {
      format: "huiye-entry-card-current",
      version: 1,
      entryId: String(card.entryId),
      cardVersion: card.cardVersion,
      sha256: sha256(stableStringify(card)),
      updatedAt: createdAt,
    });
  }
  if (previousSnapshot) {
    await writeJsonAtomic(path.join(lineRoot, "history", previousSnapshot.snapshotId, "snapshot.json"), previousSnapshot);
  }
  await writeJsonAtomic(path.join(lineRoot, "snapshot.json"), snapshot);
  const previousManifest = await readOptionalJson(path.join(contextRoot, "manifest.json"));
  const canExtendManifest = previousManifest?.format === "huiye-thought-line-context" && previousManifest.version === 1;
  const thoughtLines = [...new Set([...(canExtendManifest ? previousManifest.thoughtLines ?? [] : []), thoughtLineId])]
    .sort((left, right) => left.localeCompare(right));
  const entryIds = [...new Set([...(canExtendManifest ? previousManifest.entryIds ?? [] : []), ...entries.map((entry) => String(entry.id))])]
    .sort((left, right) => left.localeCompare(right));
  await writeJsonAtomic(path.join(contextRoot, "manifest.json"), {
    format: "huiye-thought-line-context",
    version: 1,
    sourceGenerationId: source.generationId,
    thoughtLines,
    entryIds,
    updatedAt: createdAt,
  });
  await writeJsonAtomic(path.join(lineRoot, "state.json"), {
    format: "huiye-context-state",
    version: 1,
    thoughtLineId,
    snapshotId: snapshot.snapshotId,
    status: "ready",
    updatedAt: createdAt,
  });

  return {
    thoughtLineId,
    status: "ready",
    ...(maintenanceDecision ? { maintenanceDecision: maintenanceDecision.decision } : {}),
    maintenanceMethod: snapshot.maintenanceMethod,
    snapshotId: snapshot.snapshotId,
  };
}
