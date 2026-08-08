"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EchoCard,
  echoResponseEntryIds,
  type EchoEventType,
  type EchoFeedback,
  type EchoRecordV2,
} from "./echo-card";
import {
  activeThoughtLines,
  draftThoughtLineSelection,
  materializeThoughtLineSelections,
  mergeThoughtLines,
  removeEntryFromThoughtLine,
  renameThoughtLine,
  setThoughtLineArchived,
  setThoughtLineEchoPermission,
  thoughtLineSelectionName,
  type ThoughtLine,
  type ThoughtLineSelection,
} from "./thought-line-model";

type View = "write" | "pool" | "lines" | "echo" | "evaluation" | "settings";
type Attachment = { name: string; type: string; data: string };
type Entry = {
  id: number;
  title: string;
  content: string;
  createdAt?: string;
  date?: string;
  tags: string[];
  thoughtLineIds?: string[];
  source: string;
  aiLink: boolean;
  status?: "open" | "echoed";
  attachments?: Attachment[];
  continuesFrom?: number;
  originalContent?: string;
};
type Draft = {
  title: string;
  content: string;
  tags: string[];
  thoughtLineSelections: ThoughtLineSelection[];
  aiLink: boolean;
};
type SavedDraft = {
  text: string;
  attachments: Attachment[];
  tags?: string[];
  thoughtLineSelections?: ThoughtLineSelection[];
  link: boolean;
  updatedAt: string;
};
type CaseRecord = {
  id: string;
  echoRecordId: string;
  verdict: "good" | "bad";
  feedback: "clarified" | "already_known" | "not_quite";
  reasonCodes: string[];
  notes?: string;
  createdAt: string;
};
type HuiyeBackup = {
  format: "huiye-backup";
  version: 1;
  exportedAt: string;
  entries: Entry[];
  echoes: Echo[];
  echoCheckedIds: number[];
  thoughtLines?: ThoughtLine[];
  caseRecords?: CaseRecord[];
};
type Echo = {
  id: string;
  currentEntryId: number;
  previousEntryId: number;
  quote: string;
  reason: string;
  createdAt: string;
  status: "pending" | "opened" | "continued" | "irrelevant";
};
type StorageStatus = "loading" | "saving" | "saved" | "error";
const DRAFT_KEY = "huiye-writing-draft-v1";
const WRITE_LINE_HEIGHT = 41;
const WRITE_MIN_LINES = 6;
const WRITE_MAX_LINES = 15;
function createData(
  entries: Entry[],
  echoes: Echo[],
  echoCheckedIds: number[],
  thoughtLines: ThoughtLine[] = [],
  caseRecords: CaseRecord[] = [],
): HuiyeBackup {
  return {
    format: "huiye-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    echoes,
    echoCheckedIds,
    thoughtLines,
    caseRecords,
  };
}

async function savePrivateData(data: HuiyeBackup): Promise<string> {
  const response = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await response.json()) as {
    updatedAt?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error || "保存失败");
  return result.updatedAt || new Date().toISOString();
}

const nav: { id: View; icon: string; label: string }[] = [
  { id: "write", icon: "✎", label: "写下" },
  { id: "pool", icon: "□", label: "日记池" },
  { id: "lines", icon: "⌁", label: "思考线" },
  { id: "echo", icon: "↗", label: "回响" },
];

function weekStart(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - day + 1);
  return result;
}

function formatTimestamp(entry: Entry, now: number) {
  if (!entry.createdAt) return entry.date || "—";
  const created = new Date(entry.createdAt);
  if (Number.isNaN(created.getTime())) return entry.date || "—";
  if (now - created.getTime() < 3 * 60 * 1000) return "刚刚";
  const current = new Date(now);
  if (created >= weekStart(current) && created <= current) {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const hour = created.getHours();
    return `周${weekdays[created.getDay()]} ${hour < 12 ? "上午" : "下午"} ${String(hour).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`;
  }
  if (created.getFullYear() === current.getFullYear())
    return `${created.getMonth() + 1}月${created.getDate()}日`;
  return `${created.getFullYear()}年${created.getMonth() + 1}月${created.getDate()}日`;
}

function entryTimestamp(entry: Entry) {
  const parsed = Date.parse(entry.createdAt || entry.date || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function saveEchoEvent(
  echoRecordId: string,
  event: {
    type: EchoEventType;
    resultEntryId?: number;
    feedback?: EchoFeedback;
    rejectionScope?: "interpretation" | "relationship" | "evidence" | "other";
    reasonCodes?: string[];
  },
): Promise<EchoRecordV2> {
  const response = await fetch("/api/echo-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ echoRecordId, ...event }),
  });
  const result = (await response.json()) as {
    record?: EchoRecordV2;
    error?: string;
  };
  if (!response.ok || !result.record)
    throw new Error(result.error || "回响记录失败");
  return result.record;
}

function selectCurrentEcho(
  records: EchoRecordV2[],
  entries: Entry[],
  lines: ThoughtLine[],
  now: number,
) {
  return (
    records
      .filter(
        (record) =>
          record.lifecycle !== "legacy_evaluation" &&
          record.lifecycle !== "invalidated",
      )
      .filter((record) => Boolean(record.thoughtLineId))
      .filter((record) => {
        const line = lines.find((item) => item.id === record.thoughtLineId);
        if (!line || line.status !== "active" || !line.allowEcho) return false;
        return record.sourceEntryIds.every((id) => {
          const entry = entries.find((item) => item.id === id);
          return Boolean(
            entry?.aiLink && entry.thoughtLineIds?.includes(line.id),
          );
        });
      })
      .filter((record) => Date.parse(record.eligibleAfter) <= now)
      .filter(
        (record) =>
          !record.cooldownUntil || Date.parse(record.cooldownUntil) <= now,
      )
      .filter(
        (record) =>
          !record.events.some(
            (event) =>
              event.type === "feedback_submitted" ||
              event.type === "response_saved" ||
              event.type === "continuation_saved",
          ),
      )
      .sort(
        (left, right) =>
          left.events.length - right.events.length ||
          left.discoveredAt.localeCompare(right.discoveredAt),
      )[0] ?? null
  );
}

function formatWritingDate(now: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(now));
}

function visualLineCount(value: string, charactersPerLine = 50) {
  if (!value) return 0;
  return value
    .split("\n")
    .reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0,
    );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      className="toggle-row"
      type="button"
      onClick={onChange}
      aria-pressed={checked}
    >
      <span className={`toggle ${checked ? "on" : ""}`}>
        <span />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}

function renderInline(value: string): ReactNode[] {
  const tokens = value.split(
    /(\*\*[^*]+\*\*|~~[^~]+~~|<u>[^<]+<\/u>|`[^`]+`|\[[^\]]+\]\([^\)]+\)|\*[^*]+\*)/g,
  );
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("~~") && token.endsWith("~~"))
      return <del key={index}>{token.slice(2, -2)}</del>;
    if (token.startsWith("<u>") && token.endsWith("</u>"))
      return <u key={index}>{token.slice(3, -4)}</u>;
    if (token.startsWith("`") && token.endsWith("`"))
      return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("*") && token.endsWith("*"))
      return <em key={index}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const href = /^https?:\/\//i.test(link[2]) ? link[2] : "#";
      return (
        <a key={index} href={href} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    return token;
  });
}

function Markdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```"))
        code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const alignment = line.match(/^<div align="(left|center|right)">$/);
    if (alignment) {
      const aligned: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== "</div>")
        aligned.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <div
          key={`align-${index}`}
          className={`markdown-align-${alignment[1]}`}
        >
          <Markdown content={aligned.join("\n")} />
        </div>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${index}`}>{text}</h1>
        ) : level === 2 ? (
          <h2 key={`h-${index}`}>{text}</h2>
        ) : level === 3 ? (
          <h3 key={`h-${index}`}>{text}</h3>
        ) : (
          <h4 key={`h-${index}`}>{text}</h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index]))
        items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index]))
        items.push(lines[index++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]))
        quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+|^\s*[-*+]\s+|^\s*\d+\.\s+|^>\s?|^```|^(---|\*\*\*|___)$/.test(
        lines[index],
      )
    )
      paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(" "))}</p>);
  }
  return <div className={`markdown ${className}`}>{blocks}</div>;
}
function titleFromContent(value: string) {
  const firstLine = value.replace(/\r\n/g, "\n").split("\n")[0].trim();
  return (
    Array.from(markdownPreviewText(firstLine)).slice(0, 15).join("") ||
    "未命名记录"
  );
}
function escapeEditorHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function inlineMarkdownToEditorHtml(value: string) {
  return escapeEditorHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/<u>([^<]+)<\/u>/g, "<u>$1</u>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function markdownToEditorHtml(value: string) {
  if (!value.trim()) return "";
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (/^#\s+/.test(line))
        return `<h1>${inlineMarkdownToEditorHtml(line.replace(/^#\s+/, ""))}</h1>`;
      if (/^##\s+/.test(line))
        return `<h2>${inlineMarkdownToEditorHtml(line.replace(/^##\s+/, ""))}</h2>`;
      if (/^>\s?/.test(line))
        return `<blockquote>${inlineMarkdownToEditorHtml(line.replace(/^>\s?/, ""))}</blockquote>`;
      if (/^-\s+/.test(line))
        return `<div>• ${inlineMarkdownToEditorHtml(line.replace(/^-\s+/, ""))}</div>`;
      return line
        ? `<div>${inlineMarkdownToEditorHtml(line)}</div>`
        : "<div><br></div>";
    })
    .join("");
}
function editorElementToMarkdown(element: HTMLElement) {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = (node as HTMLElement).tagName;
    const children = Array.from(node.childNodes).map(read).join("");
    if (tag === "BR") return "\n";
    if (tag === "STRONG" || tag === "B") return `**${children}**`;
    if (tag === "EM" || tag === "I") return `*${children}*`;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL")
      return `~~${children}~~`;
    if (tag === "U") return `<u>${children}</u>`;
    if (tag === "H1") return `# ${children}\n\n`;
    if (tag === "H2") return `## ${children}\n\n`;
    if (tag === "H3") return `### ${children}\n\n`;
    if (tag === "BLOCKQUOTE")
      return `> ${children.trim().replace(/\n/g, "\n> ")}\n\n`;
    if (tag === "LI") return `- ${children.trim()}\n`;
    if (tag === "UL" || tag === "OL") return `${children}\n`;
    if (tag === "DIV" || tag === "P") return `${children}\n`;
    return children;
  };
  return Array.from(element.childNodes)
    .map(read)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function markdownPreviewText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, "代码片段")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^<div align="(left|center|right)">$/gm, "")
    .replace(/^<\/div>$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`_]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}
function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    const tag = value.trim().replace(/^#/, "");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setValue("");
  };
  return (
    <div className="tag-editor">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(tags.filter((item) => item !== tag))}
        >
          {tag} ×
        </button>
      ))}
      <span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="添加标签"
        />
        <button type="button" onClick={add}>
          ＋
        </button>
      </span>
    </div>
  );
}

function ThoughtLinePicker({
  lines,
  selections,
  onChange,
}: {
  lines: ThoughtLine[];
  selections: ThoughtLineSelection[];
  onChange: (selections: ThoughtLineSelection[]) => void;
}) {
  const [value, setValue] = useState("");
  const available = activeThoughtLines(lines).filter(
    (line) => !selections.includes(line.id),
  );
  const add = () => {
    const name = value.trim();
    if (!name) return;
    const existing = available.find((line) => line.name === name);
    const selection = existing?.id ?? draftThoughtLineSelection(name);
    if (selection && !selections.includes(selection))
      onChange([...selections, selection]);
    setValue("");
  };
  return (
    <div className="thought-line-picker">
      <div className="tag-editor thought-line-tag-editor">
        {selections.map((selection) => (
          <button
            key={selection}
            type="button"
            onClick={() =>
              onChange(selections.filter((item) => item !== selection))
            }
          >
            <span>✦</span>
            {thoughtLineSelectionName(selection, lines)} ×
          </button>
        ))}
        <span>
          <input
            list="thought-line-options"
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              const existing = available.find(
                (line) => line.name === nextValue,
              );
              if (existing) {
                onChange([...selections, existing.id]);
                setValue("");
                return;
              }
              setValue(nextValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="添加思考线"
          />
          <button type="button" onClick={add}>
            ＋
          </button>
        </span>
      </div>
      <datalist id="thought-line-options">
        {available.map((line) => (
          <option key={line.id} value={line.name} />
        ))}
      </datalist>
      <small>思考线将你的思考连接</small>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("write");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [echoCheckedIds, setEchoCheckedIds] = useState<number[]>([]);
  const [thoughtLines, setThoughtLines] = useState<ThoughtLine[]>([]);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>([]);
  const [echoRecords, setEchoRecords] = useState<EchoRecordV2[]>([]);
  const [currentEchoId, setCurrentEchoId] = useState<string | null>(null);
  const [echoSeenThisSession, setEchoSeenThisSession] = useState(false);
  const [echoSessionDone, setEchoSessionDone] = useState(false);
  const [echoLoadError, setEchoLoadError] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [storageUpdatedAt, setStorageUpdatedAt] = useState<string | null>(null);
  const [storageKind, setStorageKind] = useState<
    "unknown" | "local-folder" | "cloud"
  >("unknown");
  const [continuingFrom, setContinuingFrom] = useState<number | null>(null);
  const [continuingEchoId, setContinuingEchoId] = useState<string | null>(null);
  const [continuingThoughtLineId, setContinuingThoughtLineId] = useState<
    string | null
  >(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [writeTags, setWriteTags] = useState<string[]>([]);
  const [writeThoughtLineSelections, setWriteThoughtLineSelections] = useState<
    ThoughtLineSelection[]
  >([]);
  const [link, setLink] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [expandedLineEntryIds, setExpandedLineEntryIds] = useState<number[]>(
    [],
  );
  const [evaluationMode, setEvaluationMode] = useState<"private" | "demo">(
    "private",
  );
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const saveQueueRef = useRef<Promise<string>>(Promise.resolve(""));
  const skipInitialSaveRef = useRef(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [editorInitialHtml, setEditorInitialHtml] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const [writeLines, setWriteLines] = useState(0);
  const [selectionMenu, setSelectionMenu] = useState({
    visible: false,
    left: 20,
    top: 14,
  });

  function queuePrivateSave(data: HuiyeBackup): Promise<string> {
    const next = saveQueueRef.current
      .catch(() => "")
      .then(() => savePrivateData(data));
    saveQueueRef.current = next;
    return next;
  }

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = editorInitialHtml;
      window.requestAnimationFrame(measureWritingEditor);
    }
  }, [editorVersion, editorInitialHtml]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureWritingEditor());
    observer.observe(editor);
    measureWritingEditor();
    return () => observer.disconnect();
  }, [editorVersion, view]);
  useEffect(() => {
    let cancelled = false;
    async function loadPrivateData() {
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        const result = (await response.json()) as {
          data?: HuiyeBackup | null;
          updatedAt?: string | null;
          storageKind?: "local-folder" | "cloud";
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "无法读取私人数据");
        const data = result.data ?? createData([], [], []);
        if (!cancelled) setStorageUpdatedAt(result.updatedAt || null);
        if (cancelled) return;
        const loadedEntries = data.entries.map((entry) => ({
          ...entry,
          thoughtLineIds: entry.thoughtLineIds ?? [],
        }));
        const loadedLines = data.thoughtLines ?? [];
        setEntries(loadedEntries);
        setThoughtLines(loadedLines);
        setCaseRecords(data.caseRecords ?? []);
        // Legacy Echo v1 is intentionally retired. Only Entry data is loaded
        // until the reviewed EchoRecord model replaces the old recall flow.
        setEchoes([]);
        setEchoCheckedIds([]);
        if (result.storageKind !== "local-folder")
          throw new Error("当前不是本地数据服务");
        setStorageKind("local-folder");
        setStorageStatus("saved");
        setStorageReady(true);
        try {
          const echoResponse = await fetch("/api/echo-records", {
            cache: "no-store",
          });
          const echoResult = (await echoResponse.json()) as {
            records?: EchoRecordV2[];
            error?: string;
          };
          if (!echoResponse.ok || !Array.isArray(echoResult.records))
            throw new Error(echoResult.error || "无法读取回响记录");
          if (!cancelled) {
            setEchoRecords(echoResult.records);
            setCurrentEchoId(
              selectCurrentEcho(
                echoResult.records,
                loadedEntries,
                loadedLines,
                Date.now(),
              )?.id ?? null,
            );
            setEchoLoadError(false);
          }
        } catch {
          if (!cancelled) {
            setEchoRecords([]);
            setEchoLoadError(true);
          }
        }
      } catch {
        if (cancelled) return;
        setStorageStatus("error");
      }
    }
    void loadPrivateData();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved) as SavedDraft;
          if (draft.text.trim() || draft.attachments?.length)
            setPendingDraft(draft);
        }
      } catch {
        /* Ignore a broken draft. */
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!draftReady || pendingDraft) return;
    try {
      if (
        text.trim() ||
        attachments.length ||
        writeTags.length ||
        writeThoughtLineSelections.length
      )
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            text,
            attachments,
            tags: writeTags,
            thoughtLineSelections: writeThoughtLineSelections,
            link,
            updatedAt: new Date().toISOString(),
          }),
        );
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Draft storage is best effort when attachments are too large. */
    }
  }, [
    text,
    attachments,
    writeTags,
    writeThoughtLineSelections,
    link,
    draftReady,
    pendingDraft,
  ]);
  useEffect(() => {
    if (!storageReady) return;
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    const data = createData(
      entries,
      echoes,
      echoCheckedIds,
      thoughtLines,
      caseRecords,
    );
    const timer = window.setTimeout(() => {
      setStorageStatus("saving");
      void queuePrivateSave(data)
        .then((updatedAt) => {
          setStorageUpdatedAt(updatedAt);
          setStorageStatus("saved");
        })
        .catch(() => setStorageStatus("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    entries,
    echoes,
    echoCheckedIds,
    thoughtLines,
    caseRecords,
    storageReady,
  ]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () =>
      entries.filter((entry) =>
        `${entry.title}${entry.content}${entry.tags.join("")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [entries, search],
  );
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const continuingEntry = continuingFrom
    ? (entries.find((entry) => entry.id === continuingFrom) ?? null)
    : null;
  const currentEchoRecord =
    echoRecords.find((record) => record.id === currentEchoId) ?? null;
  const selectedLine =
    thoughtLines.find((line) => line.id === selectedLineId) ?? null;
  const lineEntries = selectedLine
    ? entries
        .filter((entry) => entry.thoughtLineIds?.includes(selectedLine.id))
        .sort((left, right) => entryTimestamp(right) - entryTimestamp(left))
    : [];
  const lineEchoes = selectedLine
    ? echoRecords.filter(
        (record) =>
          record.thoughtLineId === selectedLine.id &&
          record.lifecycle !== "invalidated",
      )
    : [];
  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    const connectedIds = new Set<number>();
    for (const record of echoRecords) {
      const responseIds = echoResponseEntryIds(record);
      if (record.sourceEntryIds.includes(selected.id))
        responseIds.forEach((id) => connectedIds.add(id));
      if (responseIds.includes(selected.id))
        record.sourceEntryIds.forEach((id) => connectedIds.add(id));
    }
    return entries.filter((entry) => connectedIds.has(entry.id));
  }, [selected, echoRecords, entries]);
  const writeRows = Math.min(
    WRITE_MAX_LINES,
    Math.max(WRITE_MIN_LINES, writeLines + 3),
  );
  const editLines = visualLineCount(edit?.content || "", 55);
  const editRows = Math.min(15, Math.max(6, editLines + 3));

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const closeEdit = () => {
    setSelectedId(null);
    setEdit(null);
    setPreviewMarkdown(false);
  };

  function saveCase(
    record: EchoRecordV2,
    feedback: "clarified" | "already_known" | "not_quite",
  ) {
    const next: CaseRecord = {
      id: `case-${Date.now()}`,
      echoRecordId: record.id,
      verdict: feedback === "not_quite" ? "bad" : "good",
      feedback,
      reasonCodes:
        feedback === "clarified"
          ? ["manifested_change"]
          : feedback === "already_known"
            ? ["already_explicit"]
            : ["interpretation_wrong"],
      createdAt: new Date().toISOString(),
    };
    setCaseRecords((current) => [
      next,
      ...current.filter((item) => item.echoRecordId !== record.id),
    ]);
    notify("已记入回响评测集，不会进入正式回响");
  }

  function updateLineName() {
    if (!selectedLine) return;
    const name = window.prompt("思考线的新名称", selectedLine.name);
    if (name === null) return;
    try {
      setThoughtLines((current) =>
        renameThoughtLine(current, selectedLine.id, name),
      );
      notify("已更新思考线名称");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法重命名");
    }
  }

  function mergeSelectedLine() {
    if (!selectedLine) return;
    const candidates = thoughtLines.filter(
      (line) => line.id !== selectedLine.id && line.status !== "merged",
    );
    const targetName = window.prompt(
      `合并到哪条思考线？\n${candidates.map((line) => line.name).join("、")}`,
    );
    const target = candidates.find((line) => line.name === targetName);
    if (!target) return notify("没有找到这条思考线");
    if (
      !window.confirm(
        `把「${selectedLine.name}」合并到「${target.name}」？原线会保留为已合并状态。`,
      )
    )
      return;
    try {
      const result = mergeThoughtLines(
        thoughtLines,
        entries,
        selectedLine.id,
        target.id,
      );
      setThoughtLines(result.lines);
      setEntries(result.entries);
      setSelectedLineId(target.id);
      notify("已合并；AI 权限按更保守的一侧处理");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法合并");
    }
  }

  function measureWritingEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.textContent && !editor.querySelector("br")) {
      setWriteLines(0);
      return;
    }
    const mirror = editor.cloneNode(true) as HTMLDivElement;
    mirror.removeAttribute("contenteditable");
    mirror.removeAttribute("id");
    Object.assign(mirror.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: `${editor.clientWidth}px`,
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      overflow: "visible",
      visibility: "hidden",
      pointerEvents: "none",
      flex: "none",
      paddingBottom: "0",
    });
    document.body.appendChild(mirror);
    const measuredLines = Math.max(
      1,
      Math.ceil(mirror.scrollHeight / WRITE_LINE_HEIGHT),
    );
    mirror.remove();
    setWriteLines((current) =>
      current === measuredLines ? current : measuredLines,
    );
  }
  function syncEditor() {
    if (!editorRef.current) return;
    setText(editorElementToMarkdown(editorRef.current));
    window.requestAnimationFrame(measureWritingEditor);
  }
  function resetWritingEditor(markdown = "") {
    setText(markdown);
    setEditorInitialHtml(markdownToEditorHtml(markdown));
    setEditorVersion((current) => current + 1);
    hideSelectionMenu();
  }
  function showSelectionMenu() {
    const selection = window.getSelection();
    const paper = paperRef.current;
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !paper
    ) {
      hideSelectionMenu();
      return;
    }
    const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    const bounds = paper.getBoundingClientRect();
    const left = Math.max(
      18,
      Math.min(
        selectionRect.left - bounds.left + selectionRect.width / 2 - 150,
        bounds.width - 314,
      ),
    );
    const top = selectionRect.top - bounds.top - 52;
    setSelectionMenu({ visible: true, left, top });
  }
  function hideSelectionMenu() {
    setSelectionMenu((current) => ({ ...current, visible: false }));
  }
  function applyEditorCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditor();
    hideSelectionMenu();
  }
  async function pasteText() {
    try {
      const clipboard = await navigator.clipboard.readText();
      if (!clipboard) return notify("剪贴板里没有文字");
      editorRef.current?.focus();
      document.execCommand("insertText", false, clipboard);
      syncEditor();
      notify("已粘贴剪贴板文字");
    } catch {
      notify("请在输入框内使用 Ctrl + V 粘贴");
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const allowed = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 4 - attachments.length));
    if (!allowed.length) return notify("一篇记录最多添加 4 张图片");
    allowed.forEach((file) => {
      if (file.size > 2.5 * 1024 * 1024)
        return notify(`${file.name} 超过 2.5MB，暂未添加`);
      const reader = new FileReader();
      reader.onload = () =>
        setAttachments((current) =>
          [
            ...current,
            { name: file.name, type: file.type, data: String(reader.result) },
          ].slice(0, 4),
        );
      reader.readAsDataURL(file);
    });
  }

  function restoreDraft() {
    if (!pendingDraft) return;
    resetWritingEditor(pendingDraft.text);
    setAttachments(pendingDraft.attachments || []);
    setWriteTags(pendingDraft.tags || []);
    setWriteThoughtLineSelections(pendingDraft.thoughtLineSelections || []);
    setLink(pendingDraft.link);
    setPendingDraft(null);
    notify("已恢复刚才的记录");
  }
  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setPendingDraft(null);
    notify("已丢弃未保存的记录");
  }
  async function recordEchoEvent(
    echoRecordId: string,
    event: {
      type: EchoEventType;
      resultEntryId?: number;
      feedback?: EchoFeedback;
      rejectionScope?: "interpretation" | "relationship" | "evidence" | "other";
      reasonCodes?: string[];
    },
  ) {
    const updated = await saveEchoEvent(echoRecordId, event);
    setEchoRecords((current) =>
      current.map((record) => (record.id === updated.id ? updated : record)),
    );
    return updated;
  }
  function openEchoView() {
    setView("echo");
    setEchoSeenThisSession(true);
    if (
      currentEchoRecord &&
      !currentEchoRecord.events.some((event) => event.type === "opened")
    ) {
      void recordEchoEvent(currentEchoRecord.id, { type: "opened" }).catch(
        () => undefined,
      );
    }
  }
  function respondFromEcho(record: EchoRecordV2) {
    setContinuingEchoId(record.id);
    setContinuingFrom(
      record.sourceEntryIds[record.sourceEntryIds.length - 1] ?? null,
    );
    setContinuingThoughtLineId(record.thoughtLineId ?? null);
    setWriteThoughtLineSelections(
      record.thoughtLineId ? [record.thoughtLineId] : [],
    );
    setView("write");
    void recordEchoEvent(record.id, { type: "response_started" }).catch(() =>
      notify("可以写下回应；这次打开暂未记入本地"),
    );
  }
  function submitEchoFeedback(record: EchoRecordV2, feedback: EchoFeedback) {
    const reasonCodes =
      feedback === "clarified"
        ? ["clarified"]
        : feedback === "already_known"
          ? ["already_known"]
          : feedback === "resonated"
            ? ["legacy_reencountered"]
            : feedback === "accurate_no_resonance"
              ? ["legacy_accurate_no_resonance"]
              : ["interpretation_wrong"];
    setEchoSessionDone(true);
    void recordEchoEvent(record.id, {
      type: "feedback_submitted",
      feedback,
      reasonCodes,
      ...(feedback === "not_quite"
        ? { rejectionScope: "interpretation" as const }
        : {}),
    })
      .then(() =>
        notify(
          feedback === "clarified"
            ? "记下了：它让你看清了一点"
            : feedback === "already_known"
              ? "记下了：这件事你已经知道"
              : feedback === "not_quite"
                ? "记下了：这次理解不太对"
                : "已保留这条历史反馈",
        ),
      )
      .catch(() => {
        setEchoSessionDone(false);
        notify("暂时无法记录这次反馈");
      });
  }
  async function saveEntry(rawText?: string) {
    const content = (rawText ?? text).trim();
    if (!content && !attachments.length) {
      notify("还没有内容可保存");
      return;
    }
    const selections =
      continuingThoughtLineId &&
      !writeThoughtLineSelections.includes(continuingThoughtLineId)
        ? [...writeThoughtLineSelections, continuingThoughtLineId]
        : writeThoughtLineSelections;
    const materialized = materializeThoughtLineSelections(
      thoughtLines,
      selections,
    );
    const entry: Entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      title: titleFromContent(content),
      content,
      tags: writeTags,
      thoughtLineIds: materialized.lineIds,
      source: attachments.length ? "图片与快速记录" : "快速记录",
      aiLink: link,
      attachments,
      continuesFrom: continuingFrom ?? undefined,
    };
    const nextEntries = [entry, ...entries];
    const data = createData(
      nextEntries,
      echoes,
      echoCheckedIds,
      materialized.lines,
      caseRecords,
    );
    setStorageStatus("saving");
    notify("正在安全写入本地文件夹…");
    try {
      const updatedAt = await queuePrivateSave(data);
      skipInitialSaveRef.current = true;
      setEntries(nextEntries);
      setThoughtLines(materialized.lines);
      setStorageUpdatedAt(updatedAt);
      setStorageStatus("saved");
      let echoEventFailed = false;
      if (continuingEchoId) {
        try {
          await recordEchoEvent(continuingEchoId, {
            type: "response_saved",
            resultEntryId: entry.id,
          });
          setEchoSessionDone(true);
        } catch {
          echoEventFailed = true;
        }
      }
      resetWritingEditor("");
      setAttachments([]);
      setWriteTags([]);
      setWriteThoughtLineSelections([]);
      setContinuingFrom(null);
      setContinuingEchoId(null);
      setContinuingThoughtLineId(null);
      notify(
        echoEventFailed
          ? "日记已安全保存；回响关系暂未记入，请稍后重试"
          : "已安全保存到本地文件夹",
      );
    } catch {
      setStorageStatus("error");
      notify("保存失败，正文仍保留在编辑区，请不要刷新");
    }
  }
  function openEntry(entry: Entry) {
    setSelectedId(entry.id);
    setEdit({
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      thoughtLineSelections: entry.thoughtLineIds ?? [],
      aiLink: entry.aiLink,
    });
    setPreviewMarkdown(false);
  }

  function saveEdit() {
    if (!selected || !edit) return;
    const materialized = materializeThoughtLineSelections(
      thoughtLines,
      edit.thoughtLineSelections,
    );
    setThoughtLines(materialized.lines);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === selected.id
          ? {
              ...entry,
              title: edit.title,
              content: edit.content,
              tags: edit.tags,
              thoughtLineIds: materialized.lineIds,
              aiLink: edit.aiLink,
            }
          : entry,
      ),
    );
    closeEdit();
    notify("已保存修改");
  }

  function triggerDownload(contents: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function downloadMarkdown(list: Entry[], name = "我的回页日记") {
    if (!list.length) return notify("请先选择要导出的思考");
    const markdown = list
      .map(
        (entry) =>
          "# " +
          entry.title +
          "\n\n" +
          formatTimestamp(entry, now) +
          " · " +
          entry.source +
          "\n\n" +
          entry.content +
          "\n\n" +
          entry.tags.map((tag) => "#" + tag).join(" "),
      )
      .join("\n\n---\n\n");
    triggerDownload(markdown, name + ".md", "text/markdown;charset=utf-8");
    setExportOpen(false);
    notify("已导出 " + list.length + " 篇思考");
  }
  function downloadBackup() {
    const backup = createData(
      entries,
      echoes,
      echoCheckedIds,
      thoughtLines,
      caseRecords,
    );
    triggerDownload(
      JSON.stringify(backup, null, 2),
      "回页-完整备份-" + new Date().toISOString().slice(0, 10) + ".json",
      "application/json;charset=utf-8",
    );
    setExportOpen(false);
    notify("已导出完整备份");
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as HuiyeBackup;
      if (
        parsed.format !== "huiye-backup" ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.entries)
      )
        throw new Error("这不是回页的完整备份文件");
      if (
        !window.confirm(
          "导入 " +
            parsed.entries.length +
            " 篇思考？这会创建一个新的本地数据代次；导入前的数据仍会保留。",
        )
      )
        return;
      const restored = parsed.entries.map(({ originalContent, ...entry }) => {
        void originalContent;
        return { ...entry, thoughtLineIds: entry.thoughtLineIds ?? [] };
      });
      // v1 Echo and echoCheckedIds are deliberately not restored. Their
      // semantics cannot be safely mapped to the reviewed EchoRecord model.
      const restoredEchoes: Echo[] = [];
      const restoredChecks: number[] = [];
      setStorageStatus("saving");
      const restoredLines = parsed.thoughtLines ?? [];
      const restoredCases = parsed.caseRecords ?? [];
      const updatedAt = await queuePrivateSave(
        createData(
          restored,
          restoredEchoes,
          restoredChecks,
          restoredLines,
          restoredCases,
        ),
      );
      setEntries(restored);
      setThoughtLines(restoredLines);
      setCaseRecords(restoredCases);
      setEchoes(restoredEchoes);
      setEchoCheckedIds(restoredChecks);
      setStorageUpdatedAt(updatedAt);
      setStorageStatus("saved");
      notify("已恢复并保存 " + restored.length + " 篇思考");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "导入失败，请选择回页导出的 JSON 备份",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function renderEvaluationCase(record: EchoRecordV2) {
    const line = thoughtLines.find((item) => item.id === record.thoughtLineId);
    const existing = caseRecords.find(
      (item) => item.echoRecordId === record.id,
    );
    const feedbackLabel =
      existing?.feedback === "clarified"
        ? "看清了一点"
        : existing?.feedback === "already_known"
          ? "我已经知道了"
          : existing?.feedback === "not_quite"
            ? "不太对"
            : "尚未评测";
    return (
      <article className="evaluation-case" key={record.id}>
        <header className="evaluation-case-head">
          <div>
            <span>{line ? `✦ ${line.name}` : "历史兼容 case"}</span>
            <strong>
              {record.lifecycle === "legacy_evaluation"
                ? "历史评测候选"
                : "线内回响候选"}
            </strong>
          </div>
          <div>
            <small>{record.relationType ?? record.mode}</small>
            <b
              className={`evaluation-verdict ${existing?.verdict ?? "pending"}`}
            >
              {feedbackLabel}
            </b>
          </div>
        </header>
        <section className="evaluation-sources" aria-label="评测输入原文">
          {record.sourceEntryIds.map((id, index) => {
            const entry = entries.find((item) => item.id === id);
            const evidence = record.evidence.find(
              (item) => item.entryId === id,
            )?.quote;
            return (
              <article key={id}>
                <header>
                  <span>来源 {String.fromCharCode(65 + index)}</span>
                  <time>
                    {entry ? formatTimestamp(entry, now) : "原文缺失"}
                  </time>
                </header>
                <h3>{entry?.title ?? `缺失原文 ${id}`}</h3>
                <p>“{evidence ?? "暂无可核验证据"}”</p>
                {entry && (
                  <button type="button" onClick={() => openEntry(entry)}>
                    查看完整原文
                  </button>
                )}
              </article>
            );
          })}
        </section>
        <section className="evaluation-observation">
          <span>AI 模型输出 · 由你判断</span>
          <p>{record.reason}</p>
          {record.question && <strong>{record.question}</strong>}
        </section>
        <footer className="evaluation-feedback">
          <span>这条观察是否带来了显化价值？</span>
          <div>
            <button onClick={() => saveCase(record, "clarified")}>
              看清了一点
            </button>
            <button onClick={() => saveCase(record, "already_known")}>
              我已经知道了
            </button>
            <button onClick={() => saveCase(record, "not_quite")}>
              不太对
            </button>
          </div>
        </footer>
      </article>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">回</span>
          <span>
            回页<small>让思考继续生长</small>
          </span>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() =>
                item.id === "echo" ? openEchoView() : setView(item.id)
              }
            >
              <i>{item.icon}</i>
              {item.label}
              {item.id === "echo" &&
                currentEchoRecord &&
                !echoSeenThisSession &&
                !echoSessionDone && (
                  <b
                    className="echo-presence-dot"
                    aria-label="有一条线上的回响在等你"
                  />
                )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button
            className={view === "evaluation" ? "active" : ""}
            onClick={() => setView("evaluation")}
          >
            <i>◇</i>回响评测
          </button>
          <button onClick={() => setView("settings")}>
            <i>⚙</i>设置
          </button>
          <button
            onClick={() => {
              setExportIds([]);
              setExportOpen(true);
            }}
          >
            <i>↓</i>导出 / 导入
          </button>
          <div className="privacy">
            <span>◉</span>
            <div>
              <strong>
                {storageKind === "local-folder"
                  ? "内容保存在本地文件夹"
                  : "正在确认数据位置"}
              </strong>
              <small>你始终拥有原文与控制权</small>
            </div>
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="mobile-head">
          <div className="brand">
            <span className="brand-mark">回</span>
            <span>回页</span>
          </div>
          <button onClick={() => setView("pool")}>日记池</button>
        </header>
        {view === "write" && (
          <div
            className="page write-page"
            style={{
              maxWidth: 960,
              paddingTop: 20,
              transform: `translateY(-${Math.min(190, Math.max(0, writeLines - 5) * 20)}px)`,
              transition: "transform .28s ease",
            }}
          >
            <div className="eyebrow" suppressHydrationWarning>
              {formatWritingDate(now)}
            </div>
            <h1>此刻，想留下什么？</h1>
            <p className="lead">不急着下结论，顺着念头再想一点。</p>
            {continuingEntry && (
              <div className="continuation-hint">
                沿着《{continuingEntry.title}》继续写
              </div>
            )}
            <div
              ref={paperRef}
              className="paper rich-paper"
              style={{
                height:
                  writeRows * WRITE_LINE_HEIGHT +
                  (writeLines < WRITE_MAX_LINES ? 58 : 100),
                overflow: "visible",
                transition: "height .28s ease",
              }}
            >
              <div
                key={editorVersion}
                ref={editorRef}
                className="rich-editor"
                style={{
                  paddingBottom: writeLines >= WRITE_MAX_LINES ? 72 : 0,
                  overflowY: writeLines >= WRITE_MAX_LINES ? "auto" : "hidden",
                }}
                contentEditable={true}
                role="textbox"
                aria-multiline="true"
                tabIndex={0}
                autoFocus
                suppressContentEditableWarning
                spellCheck
                onInput={syncEditor}
                onMouseUp={showSelectionMenu}
                onKeyUp={showSelectionMenu}
                onBlur={() => window.setTimeout(hideSelectionMenu, 120)}
                data-placeholder="一段推理、一个疑问，或正在形成的看法……"
              />
              {selectionMenu.visible && (
                <div
                  className="selection-format-menu"
                  style={{ left: selectionMenu.left, top: selectionMenu.top }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <button
                    type="button"
                    title="标题"
                    onClick={() => applyEditorCommand("formatBlock", "H1")}
                  >
                    T
                  </button>
                  <button
                    type="button"
                    title="小标题"
                    onClick={() => applyEditorCommand("formatBlock", "H2")}
                  >
                    T₂
                  </button>
                  <i />
                  <button
                    type="button"
                    title="加粗"
                    onClick={() => applyEditorCommand("bold")}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    title="斜体"
                    onClick={() => applyEditorCommand("italic")}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    title="删除线"
                    onClick={() => applyEditorCommand("strikeThrough")}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    title="下划线"
                    onClick={() => applyEditorCommand("underline")}
                  >
                    U
                  </button>
                  <i />
                  <button
                    type="button"
                    title="引用"
                    onClick={() =>
                      applyEditorCommand("formatBlock", "BLOCKQUOTE")
                    }
                  >
                    ❝
                  </button>
                  <button
                    type="button"
                    title="列表"
                    onClick={() => applyEditorCommand("insertUnorderedList")}
                  >
                    •
                  </button>
                  <button
                    type="button"
                    title="居中"
                    onClick={() => applyEditorCommand("justifyCenter")}
                  >
                    ≡
                  </button>
                </div>
              )}
              <div className="paper-tools">
                <span>
                  {text.length} 字 · {attachments.length} 张图片
                </span>
                <div>
                  <button onClick={pasteText}>粘贴</button>
                  <button onClick={() => fileRef.current?.click()}>
                    ＋ 手写 / 图片
                  </button>
                  <input
                    ref={fileRef}
                    hidden
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>{" "}
            {attachments.length > 0 && (
              <div className="attachment-row">
                {attachments.map((attachment, index) => (
                  <div key={`${attachment.name}-${index}`}>
                    <img src={attachment.data} alt={attachment.name} />
                    <button
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="write-tags">
              <span>普通标签</span>
              <TagEditor tags={writeTags} onChange={setWriteTags} />
            </div>
            <div className="write-tags thought-line-field">
              <span>思考线</span>
              <ThoughtLinePicker
                lines={thoughtLines}
                selections={writeThoughtLineSelections}
                onChange={setWriteThoughtLineSelections}
              />
            </div>
            <div className="write-link-control">
              <Toggle
                checked={link}
                onChange={() => setLink(!link)}
                label="参与未来回响"
                hint="当未来与它产生联系时，回页可能让它再次出现"
              />
            </div>
            <div className="save-row">
              <span>
                {link
                  ? "它会安静留在这里，等待未来的联系"
                  : "它只会被保存，不参与未来回响"}
              </span>
              <button
                className="primary"
                disabled={storageStatus === "saving" || !storageReady}
                onClick={() => void saveEntry(text)}
              >
                {storageStatus === "saving" ? "正在写入本地…" : "保存这篇记录"}{" "}
                <b>→</b>
              </button>
            </div>
          </div>
        )}{" "}
        {view === "pool" && (
          <div className="page pool-page">
            <div className="page-title">
              <div>
                <div className="eyebrow">你留下的一页页思考</div>
                <h1>日记池</h1>
                <p className="lead">
                  先记录，再选择哪些内容值得放进同一条思考线。
                </p>
              </div>
              <button
                className="primary small"
                onClick={() => setView("write")}
              >
                ＋ 写一篇
              </button>
            </div>
            <div className="search">
              <span>⌕</span>
              <input
                placeholder="搜索一个词、一段记忆或一句说过的话…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="filter-row">
              <button className="selected">全部 {entries.length}</button>
              <button>
                未归线{" "}
                {
                  entries.filter((entry) => !entry.thoughtLineIds?.length)
                    .length
                }
              </button>
              <button>
                已归线{" "}
                {entries.filter((entry) => entry.thoughtLineIds?.length).length}
              </button>
            </div>
            <div className="entry-grid">
              {filtered.map((entry) => (
                <article
                  className="entry"
                  key={entry.id}
                  onClick={() => openEntry(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") openEntry(entry);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="entry-meta">
                    <span>{formatTimestamp(entry, now)}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p className="entry-preview">
                    {markdownPreviewText(entry.content)}
                  </p>
                  <div className="entry-foot">
                    <span>
                      {entry.source}
                      {entry.attachments?.length
                        ? ` · ${entry.attachments.length} 张图`
                        : ""}
                    </span>
                    <div>
                      {(entry.thoughtLineIds ?? []).map((id) => {
                        const line = thoughtLines.find(
                          (item) => item.id === id,
                        );
                        return line ? (
                          <b className="thought-line-tag" key={id}>
                            ✦ {line.name}
                          </b>
                        ) : null;
                      })}
                      {entry.tags.map((tag) => (
                        <b key={tag}>{tag}</b>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        {view === "lines" && (
          <div className="page thought-lines-page">
            {!selectedLine ? (
              <>
                <div className="page-title">
                  <div>
                    <div className="eyebrow">由你先划出边界</div>
                    <h1>思考线</h1>
                    <p className="lead">
                      把关于同一件事的笔记放在一起，随时看见它如何延续、修正或分叉。
                    </p>
                  </div>
                </div>
                {thoughtLines.filter((line) => line.status !== "merged")
                  .length ? (
                  <div className="thought-line-grid">
                    {thoughtLines
                      .filter((line) => line.status !== "merged")
                      .map((line) => {
                        const count = entries.filter((entry) =>
                          entry.thoughtLineIds?.includes(line.id),
                        ).length;
                        return (
                          <button
                            key={line.id}
                            className={`thought-line-card ${line.status}`}
                            onClick={() => {
                              setSelectedLineId(line.id);
                              setExpandedLineEntryIds([]);
                            }}
                          >
                            <span>✦</span>
                            <div>
                              <strong>{line.name}</strong>
                              <small>
                                {count} 篇笔记 ·{" "}
                                {line.allowEcho
                                  ? "允许 AI 观察"
                                  : "AI 观察已关闭"}
                              </small>
                            </div>
                            <i>→</i>
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="echo-empty">
                    <span className="orb">✦</span>
                    <h2>还没有思考线</h2>
                    <p>
                      在写下或编辑笔记时输入一个思考线名称，保存后它才会被创建。
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  className="line-back"
                  onClick={() => {
                    setSelectedLineId(null);
                    setLineBatchIds([]);
                    setExpandedLineEntryIds([]);
                  }}
                >
                  ← 全部思考线
                </button>
                <div className="line-detail-head">
                  <div>
                    <div className="eyebrow">✦ 思考线</div>
                    <h1>{selectedLine.name}</h1>
                    <p>{lineEntries.length} 篇笔记，最新在前</p>
                  </div>
                  <div className="line-actions">
                    <button onClick={updateLineName}>重命名</button>
                    <button
                      onClick={() =>
                        setThoughtLines((current) =>
                          setThoughtLineArchived(
                            current,
                            selectedLine.id,
                            selectedLine.status !== "archived",
                          ),
                        )
                      }
                    >
                      {selectedLine.status === "archived" ? "恢复" : "归档"}
                    </button>
                    <button onClick={mergeSelectedLine}>合并</button>
                  </div>
                </div>
                <Toggle
                  checked={selectedLine.allowEcho}
                  onChange={() =>
                    setThoughtLines((current) =>
                      setThoughtLineEchoPermission(
                        current,
                        selectedLine.id,
                        !selectedLine.allowEcho,
                      ),
                    )
                  }
                  label="允许 AI 在线内观察"
                  hint="关闭后，这条线整体不会产生新的正式回响"
                />
                <section className="line-timeline">
                  <h2>这条线上的思考</h2>
                  {lineEntries.map((entry, index) => {
                    const expanded = expandedLineEntryIds.includes(entry.id);
                    const precedingEchoes = lineEchoes.filter(
                      (record) =>
                        record.sourceEntryIds[
                          record.sourceEntryIds.length - 1
                        ] === entry.id,
                    );
                    return (
                      <div className="line-timeline-item" key={entry.id}>
                        {index > 0 &&
                          precedingEchoes.map((record) => {
                            const feedback = record.events.find(
                              (event) => event.type === "feedback_submitted",
                            )?.feedback;
                            const opened = record.events.some(
                              (event) => event.type === "opened",
                            );
                            const state =
                              feedback === "clarified"
                                ? "solid"
                                : feedback === "already_known"
                                  ? "subdued"
                                  : feedback === "not_quite"
                                    ? "faded"
                                    : opened
                                      ? "hollow"
                                      : "new";
                            return (
                              <button
                                key={record.id}
                                className={`line-echo-dot ${state}`}
                                title="打开这条回响"
                                onClick={() => {
                                  setCurrentEchoId(record.id);
                                  setView("echo");
                                  setEchoSeenThisSession(true);
                                  if (!opened)
                                    void recordEchoEvent(record.id, {
                                      type: "opened",
                                    }).catch(() => undefined);
                                }}
                              >
                                ·
                              </button>
                            );
                          })}
                        <article>
                          <time>{formatTimestamp(entry, now)}</time>
                          <div className="line-entry-reading">
                            <button
                              className="line-entry-open"
                              aria-expanded={expanded}
                              onClick={() =>
                                setExpandedLineEntryIds((ids) =>
                                  ids.includes(entry.id)
                                    ? ids.filter((id) => id !== entry.id)
                                    : [...ids, entry.id],
                                )
                              }
                            >
                              <strong>{entry.title}</strong>
                              {!expanded && (
                                <p className="line-entry-preview">
                                  {markdownPreviewText(entry.content)}
                                </p>
                              )}
                              <small>
                                {expanded ? "收起原文" : "展开原文"}
                              </small>
                            </button>
                            {expanded && (
                              <div className="line-entry-full">
                                <Markdown content={entry.content} />
                              </div>
                            )}
                          </div>
                          <button
                            className="line-remove"
                            onClick={() =>
                              setEntries((current) =>
                                removeEntryFromThoughtLine(
                                  current,
                                  entry.id,
                                  selectedLine.id,
                                ),
                              )
                            }
                          >
                            移出此线
                          </button>
                        </article>
                      </div>
                    );
                  })}
                  {!lineEntries.length && (
                    <p className="line-empty">这条线暂时没有可见笔记。</p>
                  )}
                </section>
              </>
            )}
          </div>
        )}
        {view === "evaluation" && (
          <div className="page evaluation-page">
            <div className="page-title">
              <div>
                <div className="eyebrow">只用于校准，不打扰正式体验</div>
                <h1>回响评测</h1>
                <p className="lead">
                  高频检查 AI 的观察是否真的显化了你已经隐约记录的变化。
                </p>
              </div>
            </div>
            <div className="evaluation-switch">
              <button
                className={evaluationMode === "private" ? "selected" : ""}
                onClick={() => setEvaluationMode("private")}
              >
                私人评测
              </button>
              <button
                className={evaluationMode === "demo" ? "selected" : ""}
                onClick={() => setEvaluationMode("demo")}
              >
                展示模式
              </button>
            </div>
            {evaluationMode === "demo" ? (
              <section className="demo-case">
                <span>脱敏示例</span>
                <h2>从“我要替人管理”，到“让人自己看清”</h2>
                <p>
                  两次产品记录共享一条「回页-产品」思考线。AI
                  只指出重心变化，并把判断留给用户。
                </p>
                <strong>展示模式永不读取或展示私人日记。</strong>
              </section>
            ) : (
              <div className="evaluation-workbench">
                <div className="evaluation-stage">
                  <span>GOOD CASE 探索期</span>
                  <strong>{echoRecords.length} 个 case</strong>
                  <small>
                    当前先积累真实输入、模型输出和人工反馈；参考答案将在 good
                    case 稳定后建立。
                  </small>
                </div>
                {!echoRecords.length ? (
                  <div className="echo-empty">
                    <p>还没有可评测的回响记录。</p>
                  </div>
                ) : echoRecords.length <= 15 ? (
                  <div className="evaluation-list">
                    {echoRecords.map(renderEvaluationCase)}
                  </div>
                ) : (
                  <>
                    <div className="evaluation-table-wrap">
                      <table className="evaluation-table">
                        <thead>
                          <tr>
                            <th>Case</th>
                            <th>思考线</th>
                            <th>模型观察</th>
                            <th>关系</th>
                            <th>评测结果</th>
                          </tr>
                        </thead>
                        <tbody>
                          {echoRecords.map((record, index) => {
                            const line = thoughtLines.find(
                              (item) => item.id === record.thoughtLineId,
                            );
                            const existing = caseRecords.find(
                              (item) => item.echoRecordId === record.id,
                            );
                            const result =
                              existing?.feedback === "clarified"
                                ? "看清了一点"
                                : existing?.feedback === "already_known"
                                  ? "我已经知道了"
                                  : existing?.feedback === "not_quite"
                                    ? "不太对"
                                    : "尚未评测";
                            return (
                              <tr
                                key={record.id}
                                className={
                                  selectedEvaluationId === record.id
                                    ? "selected"
                                    : ""
                                }
                              >
                                <td>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedEvaluationId(record.id)
                                    }
                                  >
                                    #{String(index + 1).padStart(2, "0")}
                                  </button>
                                </td>
                                <td>{line ? `✦ ${line.name}` : "历史兼容"}</td>
                                <td>{record.reason}</td>
                                <td>{record.relationType ?? record.mode}</td>
                                <td>{result}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="evaluation-table-detail">
                      {selectedEvaluationId ? (
                        renderEvaluationCase(
                          echoRecords.find(
                            (record) => record.id === selectedEvaluationId,
                          ) ?? echoRecords[0],
                        )
                      ) : (
                        <p>点击一个 case 编号，展开完整原文证据与评测操作。</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {view === "settings" && (
          <div className="page settings-page">
            <div className="eyebrow">你的思考，只属于你</div>
            <h1>数据与迁移</h1>
            <p className="lead">
              日记、图片和回响直接保存在项目的 local-data
              文件夹；应用只读取当前有效的数据代次。
            </p>
            <section className="prompt-card">
              <div>
                <h2>本地数据</h2>
                <p>
                  {storageStatus === "loading"
                    ? "正在读取本地文件夹…"
                    : storageStatus === "saving"
                      ? "正在写入并校验新的数据代次…"
                      : storageStatus === "error"
                        ? "本地文件夹暂时无法写入；当前页面内容未被自动删除，请先不要刷新。"
                        : storageKind === "local-folder"
                          ? "已安全保存到本地文件夹。"
                          : "当前不是本地运行模式，请不要在此写入私人日记。"}
                </p>
                {storageUpdatedAt && storageStatus === "saved" && (
                  <small>
                    最近保存：
                    {new Date(storageUpdatedAt).toLocaleString("zh-CN")}
                  </small>
                )}
              </div>
              <div className="migration-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={downloadBackup}
                >
                  导出一份副本
                </button>
                <button
                  type="button"
                  onClick={() => importRef.current?.click()}
                >
                  从 JSON 导入
                </button>
                <input
                  ref={importRef}
                  hidden
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) =>
                    void importBackup(event.target.files?.[0])
                  }
                />
              </div>
              <small>
                本地文件夹是唯一主数据源。每次写入先创建并校验新代次，旧代次不会自动删除；JSON
                导入同样只会新增代次。
              </small>
            </section>
            <section className="prompt-example">
              <details>
                <summary>导出 Markdown：用于阅读与归档</summary>
                <p className="example-note">
                  Markdown
                  会导出你选中的「我的思考」、时间、来源和标签。它适合自己保存、阅读或交给其他工具，但不能恢复回响关系。
                </p>
                <button
                  className="export-link-button"
                  type="button"
                  onClick={() => {
                    setExportIds(entries.map((entry) => entry.id));
                    setExportOpen(true);
                  }}
                >
                  选择要导出的思考
                </button>
              </details>
            </section>
          </div>
        )}{" "}
        {view === "echo" && (
          <div className="page echo-page">
            <div className="eyebrow">有一页，从另一个时刻回来</div>
            <h1>回响</h1>
            <p className="lead">
              一次只遇见一页。可以停留、回应，也可以什么都不做。
            </p>
            {echoLoadError ? (
              <div className="echo-empty">
                <span className="orb">✦</span>
                <h2>回响暂时无法读取</h2>
                <p>你的日记仍然安全，写作与原文阅读不会受影响。</p>
              </div>
            ) : echoSessionDone ? (
              <div className="echo-empty echo-rest">
                <span className="orb">·</span>
                <h2>这次就到这里</h2>
                <p>回页不会马上补上下一条。让这一页先留一会儿。</p>
              </div>
            ) : currentEchoRecord ? (
              <EchoCard
                record={currentEchoRecord}
                entries={entries}
                lineName={
                  thoughtLines.find(
                    (line) => line.id === currentEchoRecord.thoughtLineId,
                  )?.name
                }
                renderContent={(content) => <Markdown content={content} />}
                onRespond={respondFromEcho}
                onFeedback={submitEchoFeedback}
                onOpenEntry={(entryId) => {
                  const entry = entries.find((item) => item.id === entryId);
                  if (entry) openEntry(entry);
                }}
              />
            ) : (
              <div className="echo-empty">
                <span className="orb">✦</span>
                <h2>今天没有新的回响</h2>
                <p>没有合适的一页时，回页会保持安静。</p>
              </div>
            )}
          </div>
        )}
        <nav className="mobile-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() =>
                item.id === "echo" ? openEchoView() : setView(item.id)
              }
            >
              <i>{item.icon}</i>
              <span>{item.label}</span>
              {item.id === "echo" &&
                currentEchoRecord &&
                !echoSeenThisSession &&
                !echoSessionDone && (
                  <b className="echo-presence-dot" aria-label="有一页在等你" />
                )}
            </button>
          ))}
        </nav>
      </section>
      {pendingDraft && (
        <div className="modal-back">
          <div className="draft-restore">
            <span className="orb">✦</span>
            <small>检测到未保存的记录</small>
            <h2>要继续刚才的思考吗？</h2>
            <p>
              {pendingDraft.text.trim()
                ? `${pendingDraft.text.slice(0, 66)}${pendingDraft.text.length > 66 ? "…" : ""}`
                : "你刚才添加了图片附件。"}
            </p>
            <div>
              <button onClick={discardDraft}>丢弃</button>
              <button className="primary" onClick={restoreDraft}>
                恢复记录
              </button>
            </div>
          </div>
        </div>
      )}
      {selected && edit && (
        <div className="modal-back" onMouseDown={closeEdit}>
          <div
            className="review edit-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="review-head">
              <div>
                <span className="spark">□</span>
                <div>
                  <small>
                    {formatTimestamp(selected, now)} · {selected.source}
                  </small>
                  <h2>查看这页自己</h2>
                </div>
              </div>
              <button onClick={closeEdit}>×</button>
            </div>
            <div className="review-body">
              <label>标题</label>
              <input
                value={edit.title}
                onChange={(event) =>
                  setEdit({ ...edit, title: event.target.value })
                }
              />
              <label>正文</label>
              <div className="markdown-mode">
                <span>
                  {previewMarkdown ? "Markdown 预览" : "Markdown 编辑"}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewMarkdown(!previewMarkdown)}
                >
                  {previewMarkdown ? "继续编辑" : "预览 Markdown"}
                </button>
              </div>
              {previewMarkdown ? (
                <div className="markdown-preview">
                  <Markdown content={edit.content} />
                </div>
              ) : (
                <textarea
                  style={{
                    height: editRows * 29 + (editLines < 15 ? 40 : 70),
                    minHeight: 0,
                    overflowY: editLines >= 15 ? "auto" : "hidden",
                    paddingBottom: editLines >= 15 ? 52 : 11,
                  }}
                  value={edit.content}
                  onChange={(event) =>
                    setEdit({ ...edit, content: event.target.value })
                  }
                />
              )}
              <div className="edit-tags-row">
                <div>
                  <label>普通标签</label>
                  <TagEditor
                    tags={edit.tags}
                    onChange={(tags) => setEdit({ ...edit, tags })}
                  />
                </div>
                <div>
                  <label>思考线</label>
                  <ThoughtLinePicker
                    lines={thoughtLines}
                    selections={edit.thoughtLineSelections}
                    onChange={(thoughtLineSelections) =>
                      setEdit({ ...edit, thoughtLineSelections })
                    }
                  />
                </div>
              </div>
              <Toggle
                checked={edit.aiLink}
                onChange={() => setEdit({ ...edit, aiLink: !edit.aiLink })}
                label="允许本篇参与 AI 回响"
                hint="关闭后，即使它属于思考线，AI 也会跳过这一篇"
              />
              {selectedConnections.length > 0 && (
                <section className="entry-connections">
                  <strong>与这页建立连接的回应</strong>
                  {selectedConnections.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => openEntry(entry)}
                    >
                      <span>{entry.title}</span>
                      <small>{formatTimestamp(entry, now)} →</small>
                    </button>
                  ))}
                </section>
              )}
            </div>
            <div className="review-note">
              这里只适合修正错字或排版。想改变当时的意思时，请另写一篇回应，让两个时刻都保留下来。
            </div>
            <div className="review-actions edit-actions">
              <button
                className="danger"
                type="button"
                disabled
                title="回收站完成后开放"
              >
                删除（回收站待完成）
              </button>
              <span>
                <button
                  onClick={() => downloadMarkdown([selected], selected.title)}
                >
                  导出本篇
                </button>
                <button className="primary" onClick={saveEdit}>
                  保存修改
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
      {exportOpen && (
        <div className="modal-back" onMouseDown={() => setExportOpen(false)}>
          <div
            className="review export-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="review-head">
              <div>
                <span className="spark">↓</span>
                <div>
                  <small>导出思考</small>
                  <h2>带走你的记录</h2>
                </div>
              </div>
              <button onClick={() => setExportOpen(false)}>×</button>
            </div>
            <div className="export-tools">
              <button
                onClick={() => setExportIds(entries.map((entry) => entry.id))}
              >
                全选
              </button>
              <button onClick={() => setExportIds([])}>清空</button>
              <span>已选 {exportIds.length} 篇</span>
            </div>
            <div className="export-list">
              {entries.map((entry) => (
                <label key={entry.id}>
                  <input
                    type="checkbox"
                    checked={exportIds.includes(entry.id)}
                    onChange={() =>
                      setExportIds((ids) =>
                        ids.includes(entry.id)
                          ? ids.filter((id) => id !== entry.id)
                          : [...ids, entry.id],
                      )
                    }
                  />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {formatTimestamp(entry, now)} ·{" "}
                      {entry.tags.join("、") || "无标签"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="backup-note">
              完整备份会保存全部思考、附件、关联许可和回响反馈，可在另一台电脑恢复。
            </div>
            <div className="review-actions">
              <button onClick={downloadBackup}>导出完整备份 JSON</button>
              <button
                className="primary"
                disabled={!exportIds.length}
                onClick={() =>
                  downloadMarkdown(
                    entries.filter((entry) => exportIds.includes(entry.id)),
                  )
                }
              >
                导出所选 Markdown
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">✦ {toast}</div>}
    </main>
  );
}
