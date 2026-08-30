import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function safeId(value, label) {
  const result = String(value ?? "");
  if (!result || !/^[\p{L}\p{N}._-]+$/u.test(result)) throw new Error(`${label} 无效：${result}`);
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath) {
  try { return await readJson(filePath); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

const MACRO_SECTION_ORDER = [
  "discusses",
  "majorConcerns",
  "thoughtStages",
  "stableView",
  "currentFocus",
  "tensions",
];

const PROMPT_VERSION_ORDER = [
  "entryCard",
  "thoughtLineContext",
  "contextMaintenance",
  "relationJudgment",
];

function orderedKeys(values, preferredOrder) {
  const keys = new Set(values.flatMap((value) => Object.keys(value ?? {})));
  return [
    ...preferredOrder.filter((key) => keys.delete(key)),
    ...[...keys].sort((left, right) => left.localeCompare(right)),
  ];
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicSnapshotDiff(previousSnapshot, nextSnapshot) {
  const previousContext = previousSnapshot.thoughtLineContext ?? {};
  const nextContext = nextSnapshot.thoughtLineContext ?? {};
  const previousSections = previousContext.macroSections ?? {};
  const nextSections = nextContext.macroSections ?? {};
  const macroSections = orderedKeys([previousSections, nextSections], MACRO_SECTION_ORDER)
    .filter((section) => previousSections[section] !== nextSections[section])
    .map((section) => ({
      section,
      previous: previousSections[section] ?? null,
      next: nextSections[section] ?? null,
    }));

  const previousReferences = new Map((previousContext.entryCardReferences ?? []).map((reference) => [String(reference.entryId), reference]));
  const nextReferences = new Map((nextContext.entryCardReferences ?? []).map((reference) => [String(reference.entryId), reference]));
  const entryIds = [...new Set([...previousReferences.keys(), ...nextReferences.keys()])]
    .sort((left, right) => left.localeCompare(right));
  const added = [];
  const removed = [];
  const changed = [];
  for (const entryId of entryIds) {
    const previous = previousReferences.get(entryId);
    const next = nextReferences.get(entryId);
    if (!previous) added.push(next);
    else if (!next) removed.push(previous);
    else if (stableStringify(previous) !== stableStringify(next)) changed.push({ entryId, previous, next });
  }

  const previousPromptVersions = previousSnapshot.promptVersions ?? {};
  const nextPromptVersions = nextSnapshot.promptVersions ?? {};
  const promptVersions = orderedKeys([previousPromptVersions, nextPromptVersions], PROMPT_VERSION_ORDER)
    .filter((moduleName) => previousPromptVersions[moduleName] !== nextPromptVersions[moduleName])
    .map((moduleName) => ({
      module: moduleName,
      previous: previousPromptVersions[moduleName] ?? null,
      next: nextPromptVersions[moduleName] ?? null,
    }));

  return {
    macroSections,
    entryCardReferences: { added, removed, changed },
    promptVersions,
  };
}

function validateContextSnapshot(snapshot, thoughtLineId) {
  if (snapshot?.format !== "huiye-context-snapshot" || snapshot.version !== 1) {
    throw new Error("ContextSnapshot 无效");
  }
  if (snapshot.thoughtLine?.id !== thoughtLineId) throw new Error("ContextSnapshot 与思考线索引不一致");
  if (!snapshot.snapshotId || !snapshot.sourceGenerationId || !snapshot.createdAt) throw new Error("ContextSnapshot 元数据不完整");
  if (!snapshot.status || !snapshot.trigger?.type || !snapshot.maintenanceMethod) throw new Error("ContextSnapshot 发布信息不完整");
  const references = snapshot.thoughtLineContext?.entryCardReferences;
  if (!snapshot.thoughtLineContext?.macroSections || !Array.isArray(references)) throw new Error("ThoughtLineContext 不完整");
  for (const section of MACRO_SECTION_ORDER) {
    if (typeof snapshot.thoughtLineContext.macroSections[section] !== "string") throw new Error(`ThoughtLineContext 缺少宏观章节：${section}`);
  }
  for (const moduleName of PROMPT_VERSION_ORDER) {
    if (!snapshot.promptVersions?.[moduleName]) throw new Error(`ContextSnapshot 缺少 Prompt 版本：${moduleName}`);
  }
  const seen = new Set();
  for (const reference of references) {
    const entryId = safeId(reference?.entryId, "Entry ID");
    safeId(reference?.cardVersion, "EntryCard 版本");
    if (!reference.sha256 || seen.has(entryId)) throw new Error(`EntryCard 引用无效：${entryId}`);
    seen.add(entryId);
  }
  return snapshot;
}

function renderContextMarkdown(thoughtLineContext) {
  const sections = thoughtLineContext?.macroSections ?? {};
  return orderedKeys([sections], MACRO_SECTION_ORDER)
    .map((section) => `## ${section}\n\n${sections[section]}`)
    .join("\n\n");
}

async function readVersionedHistory(lineRoot, currentSnapshot, thoughtLineId) {
  const historyRoot = path.join(lineRoot, "history");
  let directories;
  try {
    directories = (await readdir(historyRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const snapshots = (await Promise.all(directories.map(async (directory) => {
    const versionRoot = path.join(historyRoot, safeId(directory, "Context 历史版本"));
    const snapshot = await readOptionalJson(path.join(versionRoot, "snapshot.json"));
    if (!snapshot) throw new Error(`Context 历史快照缺失：${directory}`);
    return validateContextSnapshot(snapshot, thoughtLineId);
  })))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.snapshotId.localeCompare(right.snapshotId));

  return snapshots.map((snapshot, index) => ({
    ...snapshot,
    contextMarkdown: renderContextMarkdown(snapshot.thoughtLineContext),
    diff: deterministicSnapshotDiff(snapshot, snapshots[index + 1] ?? currentSnapshot),
  }));
}

async function readVersionedEntryCards(contextRoot, references) {
  const cards = [];
  for (const reference of references) {
    const entryId = safeId(reference.entryId, "Entry ID");
    const cardVersion = safeId(reference.cardVersion, "EntryCard 版本");
    const card = await readJson(path.join(contextRoot, "entries", entryId, "versions", `${cardVersion}.json`));
    if (String(card.entryId) !== entryId) throw new Error(`EntryCard 与引用不一致：${entryId}`);
    cards.push(card);
  }
  return cards;
}

function meaningfulLines(value) {
  return String(value).split(/\r?\n/u).filter((line) => line.trim());
}

function deterministicLineDiff(previousValue, nextValue) {
  const previous = meaningfulLines(previousValue);
  const next = meaningfulLines(nextValue);
  const lengths = Array.from({ length: previous.length + 1 }, () => Array(next.length + 1).fill(0));

  for (let previousIndex = previous.length - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = next.length - 1; nextIndex >= 0; nextIndex -= 1) {
      lengths[previousIndex][nextIndex] = previous[previousIndex] === next[nextIndex]
        ? lengths[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(lengths[previousIndex + 1][nextIndex], lengths[previousIndex][nextIndex + 1]);
    }
  }

  const diff = [];
  let previousIndex = 0;
  let nextIndex = 0;
  while (previousIndex < previous.length || nextIndex < next.length) {
    if (previousIndex < previous.length && nextIndex < next.length && previous[previousIndex] === next[nextIndex]) {
      previousIndex += 1;
      nextIndex += 1;
    } else if (previousIndex < previous.length && (nextIndex === next.length || lengths[previousIndex + 1][nextIndex] >= lengths[previousIndex][nextIndex + 1])) {
      diff.push({ type: "removed", text: previous[previousIndex] });
      previousIndex += 1;
    } else {
      diff.push({ type: "added", text: next[nextIndex] });
      nextIndex += 1;
    }
  }
  return diff;
}

async function readHistory(lineRoot, currentContextMarkdown) {
  const historyRoot = path.join(lineRoot, "history");
  let directories;
  try {
    directories = (await readdir(historyRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const versions = await Promise.all(directories.map(async (directory) => {
    const versionRoot = path.join(historyRoot, safeId(directory, "Context 历史版本"));
    const [contextMarkdown, change] = await Promise.all([
      readFile(path.join(versionRoot, "context.md"), "utf8"),
      readJson(path.join(versionRoot, "change.json")),
    ]);
    return { contextMarkdown, change };
  }));

  return versions.map((version, index) => {
    const nextContextMarkdown = versions[index + 1]?.contextMarkdown ?? currentContextMarkdown;
    return {
      changedAt: version.change.changedAt ?? null,
      previousSha256: version.change.previousSha256 ?? null,
      nextSha256: version.change.nextSha256 ?? null,
      contextMarkdown: version.contextMarkdown,
      diff: deterministicLineDiff(version.contextMarkdown, nextContextMarkdown),
    };
  });
}

async function readLatestEvaluation(evaluationRoot, thoughtLineId) {
  const evaluationIndex = await readOptionalJson(path.join(evaluationRoot, "index.json"));
  if (!evaluationIndex?.latestRunId) return null;
  const runId = safeId(evaluationIndex.latestRunId, "评测运行 ID");
  const latestEvaluation = await readJson(path.join(evaluationRoot, "runs", runId, "result.json"));
  return latestEvaluation.thoughtLineId === thoughtLineId ? latestEvaluation : null;
}

export async function readThoughtLineContextSnapshot({ contextRoot, evaluationRoot, thoughtLineId: requestedThoughtLineId }) {
  if (requestedThoughtLineId !== undefined) safeId(requestedThoughtLineId, "思考线 ID");
  const resolvedContextRoot = path.resolve(contextRoot);
  const resolvedEvaluationRoot = path.resolve(evaluationRoot);
  const manifest = await readOptionalJson(path.join(resolvedContextRoot, "manifest.json"));
  if (!manifest) return null;
  if (manifest.format !== "huiye-thought-line-context" || manifest.version !== 1) throw new Error("ThoughtLineContext manifest 无效");

  const thoughtLineId = safeId(requestedThoughtLineId ?? manifest.thoughtLines?.[0], "思考线 ID");
  if (!manifest.thoughtLines?.includes(thoughtLineId)) throw new Error(`ThoughtLineContext 不包含思考线：${thoughtLineId}`);
  const lineRoot = path.join(resolvedContextRoot, "thought-lines", thoughtLineId);
  const [versionedSnapshot, contextState] = await Promise.all([
    readOptionalJson(path.join(lineRoot, "snapshot.json")),
    readOptionalJson(path.join(lineRoot, "state.json")),
  ]);
  if (versionedSnapshot) {
    const snapshot = validateContextSnapshot(versionedSnapshot, thoughtLineId);
    if (contextState?.status === "ready" && (contextState.thoughtLineId !== thoughtLineId || contextState.snapshotId !== snapshot.snapshotId)) {
      throw new Error("Context 状态与当前快照不一致");
    }
    const effectiveStatus = contextState?.status ?? snapshot.status;
    const [entryCards, history, latestEvaluation] = await Promise.all([
      readVersionedEntryCards(resolvedContextRoot, snapshot.thoughtLineContext.entryCardReferences),
      readVersionedHistory(lineRoot, snapshot, thoughtLineId),
      readLatestEvaluation(resolvedEvaluationRoot, thoughtLineId),
    ]);
    return {
      ...snapshot,
      status: effectiveStatus,
      updatedAt: snapshot.createdAt,
      contextMarkdown: renderContextMarkdown(snapshot.thoughtLineContext),
      entryCards,
      history,
      relationshipEvaluation: latestEvaluation
        ? { status: latestEvaluation.decision, latest: latestEvaluation }
        : { status: "not_run", latest: null },
    };
  }
  const [record, contextMarkdown] = await Promise.all([
    readJson(path.join(lineRoot, "record.json")),
    readFile(path.join(lineRoot, "context.md"), "utf8"),
  ]);
  if (record.thoughtLineId !== thoughtLineId) throw new Error("ThoughtLineContext record 与索引不一致");

  const entryCards = [];
  for (const entryIdValue of record.entryIds ?? []) {
    const entryId = safeId(entryIdValue, "Entry ID");
    const card = await readJson(path.join(resolvedContextRoot, "entries", entryId, "card.json"));
    if (String(card.entryId) !== entryId) throw new Error(`EntryCard 与索引不一致：${entryId}`);
    entryCards.push(card);
  }

  const [history, latestEvaluation] = await Promise.all([
    readHistory(lineRoot, contextMarkdown),
    readLatestEvaluation(resolvedEvaluationRoot, thoughtLineId),
  ]);

  return {
    sourceGenerationId: manifest.sourceGenerationId,
    updatedAt: record.updatedAt ?? manifest.updatedAt ?? null,
    thoughtLine: { id: thoughtLineId, name: record.thoughtLineName ?? thoughtLineId },
    promptVersion: record.promptVersion ?? null,
    model: record.model ?? null,
    contextMarkdown,
    entryCards,
    history,
    relationshipEvaluation: latestEvaluation
      ? { status: latestEvaluation.decision, latest: latestEvaluation }
      : { status: "not_run", latest: null },
  };
}

export async function readAllThoughtLineContextSnapshots({ contextRoot, evaluationRoot }) {
  const manifest = await readOptionalJson(path.join(path.resolve(contextRoot), "manifest.json"));
  if (!manifest) return [];
  if (manifest.format !== "huiye-thought-line-context" || manifest.version !== 1) throw new Error("ThoughtLineContext manifest 无效");
  const thoughtLineIds = [...new Set(manifest.thoughtLines ?? [])]
    .map((thoughtLineId) => safeId(thoughtLineId, "思考线 ID"))
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(thoughtLineIds.map((thoughtLineId) => readThoughtLineContextSnapshot({
    contextRoot,
    evaluationRoot,
    thoughtLineId,
  })));
}
