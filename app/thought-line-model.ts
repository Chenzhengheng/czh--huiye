export type ThoughtLineStatus = "active" | "archived" | "merged";

export type ThoughtLine = {
  id: string;
  name: string;
  status: ThoughtLineStatus;
  allowEcho: boolean;
  createdAt: string;
  updatedAt: string;
  mergedIntoId?: string;
};

export type LineAwareEntry = {
  id: number;
  thoughtLineIds?: string[];
};

export type ThoughtLineSelection = string;

const DRAFT_PREFIX = "draft:";

export function normalizeThoughtLineName(value: string) {
  return value.trim().replace(/^✦\s*/, "").replace(/\s+/g, " ").slice(0, 80);
}

export function draftThoughtLineSelection(name: string) {
  const normalized = normalizeThoughtLineName(name);
  return normalized ? `${DRAFT_PREFIX}${normalized}` : "";
}

export function thoughtLineSelectionName(
  selection: ThoughtLineSelection,
  lines: ThoughtLine[],
) {
  if (selection.startsWith(DRAFT_PREFIX))
    return selection.slice(DRAFT_PREFIX.length);
  return lines.find((line) => line.id === selection)?.name ?? "已失效的思考线";
}

export function materializeThoughtLineSelections(
  lines: ThoughtLine[],
  selections: ThoughtLineSelection[],
  now = new Date().toISOString(),
) {
  const nextLines = [...lines];
  const lineIds: string[] = [];
  let created = 0;

  for (const selection of selections) {
    if (!selection.startsWith(DRAFT_PREFIX)) {
      if (
        nextLines.some(
          (line) => line.id === selection && line.status !== "merged",
        ) &&
        !lineIds.includes(selection)
      )
        lineIds.push(selection);
      continue;
    }
    const name = normalizeThoughtLineName(selection.slice(DRAFT_PREFIX.length));
    if (!name) continue;
    const existing = nextLines.find(
      (line) =>
        line.status !== "merged" &&
        line.name.localeCompare(name, "zh-CN", { sensitivity: "accent" }) === 0,
    );
    if (existing) {
      if (!lineIds.includes(existing.id)) lineIds.push(existing.id);
      continue;
    }
    let id: string;
    do {
      created += 1;
      id = `line-${Date.parse(now) || Date.now()}-${created}`;
    } while (nextLines.some((line) => line.id === id));
    nextLines.push({
      id,
      name,
      status: "active",
      allowEcho: true,
      createdAt: now,
      updatedAt: now,
    });
    lineIds.push(id);
  }

  return { lines: nextLines, lineIds: [...new Set(lineIds)] };
}

export function assignEntriesToThoughtLine<T extends LineAwareEntry>(
  entries: T[],
  entryIds: number[],
  lineId: string,
) {
  const selected = new Set(entryIds);
  return entries.map((entry) =>
    selected.has(entry.id)
      ? {
          ...entry,
          thoughtLineIds: [
            ...new Set([...(entry.thoughtLineIds ?? []), lineId]),
          ],
        }
      : entry,
  );
}

export function removeEntryFromThoughtLine<T extends LineAwareEntry>(
  entries: T[],
  entryId: number,
  lineId: string,
) {
  return entries.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          thoughtLineIds: (entry.thoughtLineIds ?? []).filter(
            (id) => id !== lineId,
          ),
        }
      : entry,
  );
}

export function renameThoughtLine(
  lines: ThoughtLine[],
  lineId: string,
  name: string,
  now = new Date().toISOString(),
) {
  const normalized = normalizeThoughtLineName(name);
  if (!normalized) throw new Error("思考线名称不能为空");
  if (
    lines.some(
      (line) =>
        line.id !== lineId &&
        line.status !== "merged" &&
        line.name === normalized,
    )
  )
    throw new Error("已经存在同名思考线");
  return lines.map((line) =>
    line.id === lineId ? { ...line, name: normalized, updatedAt: now } : line,
  );
}

export function setThoughtLineArchived(
  lines: ThoughtLine[],
  lineId: string,
  archived: boolean,
  now = new Date().toISOString(),
) {
  return lines.map((line) =>
    line.id === lineId
      ? {
          ...line,
          status: archived ? ("archived" as const) : ("active" as const),
          updatedAt: now,
        }
      : line,
  );
}

export function setThoughtLineEchoPermission(
  lines: ThoughtLine[],
  lineId: string,
  allowEcho: boolean,
  now = new Date().toISOString(),
) {
  return lines.map((line) =>
    line.id === lineId ? { ...line, allowEcho, updatedAt: now } : line,
  );
}

export function mergeThoughtLines<T extends LineAwareEntry>(
  lines: ThoughtLine[],
  entries: T[],
  sourceId: string,
  targetId: string,
  now = new Date().toISOString(),
) {
  if (sourceId === targetId) throw new Error("不能合并同一条思考线");
  const source = lines.find(
    (line) => line.id === sourceId && line.status !== "merged",
  );
  const target = lines.find(
    (line) => line.id === targetId && line.status !== "merged",
  );
  if (!source || !target) throw new Error("找不到可合并的思考线");
  const allowEcho = source.allowEcho && target.allowEcho;
  return {
    lines: lines.map((line) =>
      line.id === sourceId
        ? {
            ...line,
            status: "merged" as const,
            mergedIntoId: targetId,
            allowEcho: false,
            updatedAt: now,
          }
        : line.id === targetId
          ? { ...line, allowEcho, updatedAt: now }
          : line,
    ),
    entries: entries.map((entry) => {
      if (!(entry.thoughtLineIds ?? []).includes(sourceId)) return entry;
      return {
        ...entry,
        thoughtLineIds: [
          ...new Set(
            (entry.thoughtLineIds ?? []).map((id) =>
              id === sourceId ? targetId : id,
            ),
          ),
        ],
      };
    }),
  };
}

export function activeThoughtLines(lines: ThoughtLine[]) {
  return lines.filter((line) => line.status === "active");
}
