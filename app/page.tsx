"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type View = "write" | "pool" | "echo" | "chat" | "settings";
type Attachment = { name: string; type: string; data: string };
type Entry = {
  id: number;
  title: string;
  content: string;
  originalContent?: string;
  createdAt?: string;
  date?: string;
  tags: string[];
  source: string;
  aiLink: boolean;
  status?: "open" | "echoed";
  attachments?: Attachment[];
  continuesFrom?: number;
};
type Draft = { title: string; content: string; tags: string[]; aiLink: boolean };
type OrganizationExample = { id: number; original: string; title: string; content: string; tags: string[]; prompt: string; createdAt: string; kind?: "good" | "needs_work"; reason?: string };
 type SavedDraft = { text: string; attachments: Attachment[]; organize: boolean; link: boolean; updatedAt: string };
type Echo = { id: string; currentEntryId: number; previousEntryId: number; quote: string; reason: string; createdAt: string; status: "pending" | "opened" | "continued" | "irrelevant" };
 const DRAFT_KEY = "huiye-writing-draft-v1";
 const PROMPT_KEY = "huiye-organization-prompt-v1";
 const EXAMPLES_KEY = "huiye-organization-examples-v1";
 const ECHOES_KEY = "huiye-thought-echoes-v1";
 const ECHO_CHECKS_KEY = "huiye-echo-checked-entries-v1";
 const DEFAULT_ORGANIZE_PROMPT = `你是“回页”的轻量整理助手。

你的职责是降低用户未来回看日记时的管理成本和阅读成本。你不是作者、导师、心理咨询师或总结者；你不替用户思考，不替用户下结论。

用户原文是唯一事实来源。原文优先；整理稿必须尽可能保留用户原本的表达、语气、顺序与思考轨迹。AI 应该尽量隐形。

任务：为未命名或标题过于通用的记录提供建议标题；生成一份最小整理稿；提供 0–3 个标签建议。

不得添加原文中不存在的事实、因果、案例、动机、结论、建议或技术细节；不得删除有信息或思考价值的句子；不得改变原文推理顺序；不得消除犹豫、保留意见、括号、疑问、矛盾、跳跃、未完成句或自我提醒；不得将并列想法强行组织成完整论证；不得进行心理分析、人格判断、价值评判、鼓励式总结或温情化表达。

不得使用“总结”“启示”“核心结论”“建议”“为什么”等自行创造的概念性小标题。仅允许分段与留白、修正明显错别字或标点、把原文明确并列内容变为列表，以及将用户原本已有的转折词、例子提示、拆解词或延伸词单独成行作为轻微阅读锚点。不得自行创造锚点。

如果用户已有明确标题，原样保留；“未命名记录”“快速记录”等通用标题视为无标题。标签必须来自原文明确出现或可直接对应的具体概念；最多 3 个；不确定时宁可少给。`;

const ORGANIZATION_SAMPLE = {
  original: `一句浓缩的话确实能表达出最精华的部分，但是你只读这句话，你是完全用不出来的，第一，不知道其产生的背景，第二，不知道适用的边界条件，第三，不知道做到什么程度。
把书从厚读薄我认为也是这个道理，你看到最精华的部分，脑海里自动会产生与精华相关的背景、流程、边界、延申，而不仅仅是这句话。得先有厚再有薄。
举例，在社交媒体上，大量的人（此处代指发声的人，可能大博主，可能小人物）告诉你做产品要差异化，因为要和别人的产品显得不同。这个并不是深层原因，我认为“不同”深层原因是稀缺性。再往下拆解，稀缺性分对象可以是，真的稀缺&用户认为稀缺/你营销的稀缺。假设真的产品性能一样，用户选谁不是选，那么拼的就是营销，谁的用户心智不一样（这里我瞎说的）。由这个延申出来，背景就是任何人的资源是有限的，需要选他们认为在该场景下最具性价比的一个。`,
  title: "精华为什么不能脱离它的背景与边界？",
  content: `一句浓缩的话确实能表达出最精华的部分，但是你只读这句话，你是完全用不出来的：

- 不知道其产生的背景；
- 不知道适用的边界条件；
- 不知道做到什么程度。

把书从厚读薄，我认为也是这个道理。你看到最精华的部分，脑海里自动会产生与精华相关的背景、流程、边界、延申，而不仅仅是这句话。得先有厚，再有薄。

举例

在社交媒体上，大量的人（此处代指发声的人，可能大博主，可能小人物）告诉你做产品要差异化，因为要和别人的产品显得不同。

这个并不是深层原因。我认为“不同”背后的深层原因是稀缺性。

再往下拆解

稀缺性分对象可以是：真的稀缺、用户认为稀缺、你营销的稀缺。假设真的产品性能一样，用户选谁不是选，那么拼的就是营销，谁的用户心智不一样（这里我瞎说的）。

由这个延申出来，背景就是：任何人的资源是有限的，需要选他们认为在该场景下最具性价比的一个。`,
  tags: ["阅读方法", "产品差异化", "稀缺性"],
};
const seedEntries: Entry[] = [
  { id: 1, date: "4月12日 · 22:18", title: "为什么知道方法，却还是迟迟不开始？", content: "读到“行动会反过来塑造动机”时有点疑惑。如果目标已经足够清楚，为什么我还是会拖延？现在猜测是任务拆得不够小，但还没有真实验证。", tags: ["阅读思考", "待验证"], source: "《行动的勇气》· 手写导入", aiLink: true, status: "open" },
  { id: 2, date: "5月3日 · 19:42", title: "第一次项目复盘：卡住我的不是任务大小", content: "今天复盘才意识到，我迟迟不发第一版，不是因为没拆任务，而是害怕别人看到不成熟的东西。真正有效的是先给同事发一个很粗糙的草稿。", tags: ["工作复盘", "真实反馈"], source: "飞书粘贴", aiLink: true, status: "echoed" },
  { id: 3, date: "今天 · 08:35", title: "先交出一个可以讨论的版本", content: "准备作品集时又想追求完整。提醒自己：先做出可以被讨论的版本，反馈本身也是思考的一部分。", tags: ["作品集", "行动"], source: "快速记录", aiLink: true },
];

const nav: { id: View; icon: string; label: string }[] = [
  { id: "write", icon: "✎", label: "写下" },
  { id: "pool", icon: "□", label: "日记池" },
  { id: "echo", icon: "↗", label: "回响" },
  { id: "chat", icon: "◌", label: "和 AI 聊聊" },
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
  if (created.getFullYear() === current.getFullYear()) return `${created.getMonth() + 1}月${created.getDate()}日`;
  return `${created.getFullYear()}年${created.getMonth() + 1}月${created.getDate()}日`;
}

function visualLineCount(value: string, charactersPerLine = 50) {
  if (!value) return 0;
  return value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint: string }) {
  return <button className="toggle-row" type="button" onClick={onChange} aria-pressed={checked}><span className={`toggle ${checked ? "on" : ""}`}><span /></span><span><strong>{label}</strong><small>{hint}</small></span></button>;
}

function renderInline(value: string): ReactNode[] {
  const tokens = value.split(/(\*\*[^*]+\*\*|~~[^~]+~~|<u>[^<]+<\/u>|`[^`]+`|\[[^\]]+\]\([^\)]+\)|\*[^*]+\*)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("~~") && token.endsWith("~~")) return <del key={index}>{token.slice(2, -2)}</del>;
    if (token.startsWith("<u>") && token.endsWith("</u>")) return <u key={index}>{token.slice(3, -4)}</u>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const href = /^https?:\/\//i.test(link[2]) ? link[2] : "#";
      return <a key={index} href={href} target="_blank" rel="noreferrer">{link[1]}</a>;
    }
    return token;
  });
}

function Markdown({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const code: string[] = []; index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>); continue;
    }
    const alignment = line.match(/^<div align="(left|center|right)">$/);
    if (alignment) {
      const aligned: string[] = []; index += 1;
      while (index < lines.length && lines[index] !== "</div>") aligned.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<div key={`align-${index}`} className={`markdown-align-${alignment[1]}`}><Markdown content={aligned.join("\n")} /></div>); continue;
    }    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length; const text = renderInline(heading[2]);
      blocks.push(level === 1 ? <h1 key={`h-${index}`}>{text}</h1> : level === 2 ? <h2 key={`h-${index}`}>{text}</h2> : level === 3 ? <h3 key={`h-${index}`}>{text}</h3> : <h4 key={`h-${index}`}>{text}</h4>);
      index += 1; continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>); continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(" "))}</blockquote>); continue;
    }
    if (/^(---|\*\*\*|___)$/.test(line.trim())) { blocks.push(<hr key={`rule-${index}`} />); index += 1; continue; }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^\s*[-*+]\s+|^\s*\d+\.\s+|^>\s?|^```|^(---|\*\*\*|___)$/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(" "))}</p>);
  }
  return <div className={`markdown ${className}`}>{blocks}</div>;
}
function titleFromContent(value: string) {
  const heading = value.split("\n").find(line => /^#\s+/.test(line.trim()));
  return heading ? heading.replace(/^#\s+/, "").trim() || "未命名记录" : "未命名记录";
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
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValue] = useState("");
  const add = () => { const tag = value.trim().replace(/^#/, ""); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setValue(""); };
  return <div className="tag-editor">
    {tags.map(tag => <button key={tag} type="button" onClick={() => onChange(tags.filter(item => item !== tag))}>{tag} ×</button>)}
    <span><input value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="添加标签" /><button type="button" onClick={add}>＋</button></span>
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("write");
  const [entries, setEntries] = useState<Entry[]>(seedEntries);
  const [text, setText] = useState("");
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [organizePrompt, setOrganizePrompt] = useState(DEFAULT_ORGANIZE_PROMPT);
  const [promptReady, setPromptReady] = useState(false);
  const [organizationExamples, setOrganizationExamples] = useState<OrganizationExample[]>([]);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [echoesReady, setEchoesReady] = useState(false);
  const [echoCheckedIds, setEchoCheckedIds] = useState<number[]>([]);
  const [echoChecksReady, setEchoChecksReady] = useState(false);
  const [echoLoading, setEchoLoading] = useState(false);
  const [continuingFrom, setContinuingFrom] = useState<number | null>(null);
  const [examplesReady, setExamplesReady] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [issueOptionsOpen, setIssueOptionsOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [organize, setOrganize] = useState(true);
  const [link, setLink] = useState(true);
  const [stage, setStage] = useState<"idle" | "organizing" | "review">("idle");
  const [review, setReview] = useState<Draft>({ title: "", content: "", tags: [], aiLink: true });
  const [reviewOriginal, setReviewOriginal] = useState("");
  const [originalEdit, setOriginalEdit] = useState("");
  const [reviewEntryId, setReviewEntryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [selectionMenu, setSelectionMenu] = useState({ visible: false, left: 20, top: 14 });

  useEffect(() => {
    const saved = localStorage.getItem("ai-diary-entries");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Entry[];
        setEntries(parsed.map(entry => entry.date === "刚刚" && !entry.createdAt ? { ...entry, createdAt: new Date().toISOString() } : entry));
      } catch { /* Ignore a broken local cache. */ }
    }
  }, []);
  useEffect(() => { localStorage.setItem("ai-diary-entries", JSON.stringify(entries)); }, [entries]);
  useEffect(() => {
    try { const saved = localStorage.getItem(DRAFT_KEY); if (saved) { const draft = JSON.parse(saved) as SavedDraft; if (draft.text.trim() || draft.attachments?.length) setPendingDraft(draft); } } catch { /* Ignore a broken draft. */ }
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady || pendingDraft) return;
    try {
      if (text.trim() || attachments.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, attachments, organize, link, updatedAt: new Date().toISOString() }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* Draft storage is best effort when attachments are too large. */ }
  }, [text, attachments, organize, link, draftReady, pendingDraft]);
  useEffect(() => {
    try { const savedPrompt = localStorage.getItem(PROMPT_KEY); if (savedPrompt) setOrganizePrompt(savedPrompt); } catch { /* Keep the default prompt. */ }
    setPromptReady(true);
  }, []);
  useEffect(() => { if (promptReady) localStorage.setItem(PROMPT_KEY, organizePrompt); }, [organizePrompt, promptReady]);  useEffect(() => {
    try { const savedExamples = localStorage.getItem(EXAMPLES_KEY); if (savedExamples) setOrganizationExamples(JSON.parse(savedExamples) as OrganizationExample[]); } catch { /* Ignore a broken local sample library. */ }
    setExamplesReady(true);
  }, []);
  useEffect(() => { if (examplesReady) localStorage.setItem(EXAMPLES_KEY, JSON.stringify(organizationExamples)); }, [organizationExamples, examplesReady]);  useEffect(() => {
    try { const saved = localStorage.getItem(ECHOES_KEY); if (saved) setEchoes(JSON.parse(saved) as Echo[]); } catch { /* Ignore a broken echo cache. */ }
    setEchoesReady(true);
  }, []);
  useEffect(() => { if (echoesReady) localStorage.setItem(ECHOES_KEY, JSON.stringify(echoes)); }, [echoes, echoesReady]);
  useEffect(() => {
    try { const saved = localStorage.getItem(ECHO_CHECKS_KEY); if (saved) setEchoCheckedIds(JSON.parse(saved) as number[]); } catch { /* Ignore a broken recall-check cache. */ }
    setEchoChecksReady(true);
  }, []);
  useEffect(() => { if (echoChecksReady) localStorage.setItem(ECHO_CHECKS_KEY, JSON.stringify(echoCheckedIds)); }, [echoCheckedIds, echoChecksReady]);  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const filtered = useMemo(() => entries.filter(entry => `${entry.title}${entry.content}${entry.tags.join("")}`.toLowerCase().includes(search.toLowerCase())), [entries, search]);
  const selected = entries.find(entry => entry.id === selectedId) ?? null;  const pendingEcho = useMemo(() => echoes.filter(echo => echo.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [echoes]);
  const echoedEntry = pendingEcho ? entries.find(entry => entry.id === pendingEcho.previousEntryId) ?? null : null;
  const echoSourceEntry = pendingEcho ? entries.find(entry => entry.id === pendingEcho.currentEntryId) ?? null : null;
  const continuingEntry = continuingFrom ? entries.find(entry => entry.id === continuingFrom) ?? null : null;
  const writeLines = visualLineCount(text);
  const writeRows = Math.min(15, Math.max(6, writeLines + 3));
  const editLines = visualLineCount(showOriginal ? originalEdit : (edit?.content || ""), 55);
  const editRows = Math.min(15, Math.max(6, editLines + 3));
  const reviewLines = visualLineCount(review.content, 52);
  const reviewRows = Math.min(15, Math.max(5, reviewLines + 3));

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const closeEdit = () => { setSelectedId(null); setEdit(null); setOriginalEdit(""); setShowOriginal(false); setPreviewMarkdown(false); };
  const originalToSave = text.trim() || "今天有一些还没整理好的想法，先把它留在这里。";

  function showSelectionMenu(clientX?: number, clientY?: number) {
    const input = textRef.current;
    const paper = paperRef.current;
    if (!input || input.selectionStart === input.selectionEnd) { setSelectionMenu(current => ({ ...current, visible: false })); return; }
    const bounds = paper?.getBoundingClientRect();
    const left = bounds && clientX ? Math.max(18, Math.min(clientX - bounds.left - 150, bounds.width - 314)) : 20;
    const top = bounds && clientY ? Math.max(10, Math.min(clientY - bounds.top - 54, bounds.height - 48)) : 14;
    setSelectionMenu({ visible: true, left, top });
  }
  function hideSelectionMenu() { setSelectionMenu(current => ({ ...current, visible: false })); }
  function replaceSelection(before: string, after = before, fallback = "文字") {
    const input = textRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || fallback;
    const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`;
    setText(next); hideSelectionMenu();
    window.requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  function prefixSelectedLines(prefix: string, fallback = "文字") {
    const input = textRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || fallback;
    const next = `${text.slice(0, start)}${selected.split("\n").map(line => `${prefix}${line}`).join("\n")}${text.slice(end)}`;
    setText(next); hideSelectionMenu();
    window.requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start, start + prefix.length + selected.length); });
  }
  function alignSelection(alignment: "left" | "center" | "right") {
    replaceSelection(`<div align="${alignment}">\n`, "\n</div>", "把这一段放在这里");
  }
  async function pasteText() {
    try { const clipboard = await navigator.clipboard.readText(); if (!clipboard) return notify("剪贴板里没有文字"); setText(current => current + (current ? "\n" : "") + clipboard); notify("已粘贴剪贴板文字"); }
    catch { notify("请在输入框内使用 Ctrl + V 粘贴"); }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const allowed = Array.from(files).filter(file => file.type.startsWith("image/")).slice(0, Math.max(0, 4 - attachments.length));
    if (!allowed.length) return notify("一篇记录最多添加 4 张图片");
    allowed.forEach(file => {
      if (file.size > 2.5 * 1024 * 1024) return notify(`${file.name} 超过 2.5MB，暂未添加`);
      const reader = new FileReader();
      reader.onload = () => setAttachments(current => [...current, { name: file.name, type: file.type, data: String(reader.result) }].slice(0, 4));
      reader.readAsDataURL(file);
    });
  }

  async function beginReview(entry?: Entry) {
    const original = entry?.originalContent || entry?.content || originalToSave;
    if (entry) closeEdit();
    setStage("organizing");
    try {
      const response = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: entry?.title || "", content: original, systemPrompt: organizePrompt }),
      });
      const result = await response.json() as { title?: string; content?: string; tags?: string[]; error?: string };
      if (!response.ok || !result.content) throw new Error(result.error || "AI 整理暂时没有完成，请稍后再试。");
      setReviewOriginal(original);
      setReviewEntryId(entry?.id ?? null);
      setReview({ title: result.title || "未命名记录", content: result.content, tags: result.tags || [], aiLink: entry?.aiLink ?? link });
      setStage("review");
    } catch (error) {
      setStage("idle");
      notify(error instanceof Error ? error.message : "AI 整理暂时没有完成，请稍后再试。");
    }
  }
  function restoreDraft() {
    if (!pendingDraft) return;
    setText(pendingDraft.text); setAttachments(pendingDraft.attachments || []); setOrganize(pendingDraft.organize); setLink(pendingDraft.link); setPendingDraft(null); notify("已恢复刚才的记录");
  }
  function discardDraft() { localStorage.removeItem(DRAFT_KEY); setPendingDraft(null); notify("已丢弃未保存的记录"); }
  async function prepareEcho(entry: Entry, catalogue: Entry[]) {
    if (!entry.aiLink || echoCheckedIds.includes(entry.id)) return;
    const candidates = catalogue.filter(item => item.id !== entry.id && item.aiLink && (item.originalContent || item.content).trim()).slice(0, 18);
    setEchoCheckedIds(current => current.includes(entry.id) ? current : [...current, entry.id]);
    if (!candidates.length) return;
    setEchoLoading(true);
    try {
      const response = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: { id: entry.id, title: entry.title, content: entry.originalContent || entry.content, createdAt: entry.createdAt, date: entry.date },
          candidates: candidates.map(item => ({ id: item.id, title: item.title, content: item.originalContent || item.content, createdAt: item.createdAt, date: item.date })),
        }),
      });
      const result = await response.json() as { echo?: { candidateId: number; quote: string; reason: string } | null };
      if (!response.ok || !result.echo) return;
      const previous = candidates.find(item => item.id === result.echo?.candidateId);
      if (!previous || !(previous.originalContent || previous.content).includes(result.echo.quote)) return;
      const echo: Echo = { id: `${entry.id}-${previous.id}`, currentEntryId: entry.id, previousEntryId: previous.id, quote: result.echo.quote, reason: result.echo.reason, createdAt: new Date().toISOString(), status: "pending" };
      setEchoes(current => current.some(item => item.id === echo.id) ? current : [echo, ...current]);
    } catch { /* Recall is intentionally silent; the saved diary remains unaffected. */ }
    finally { setEchoLoading(false); }
  }

  useEffect(() => {
    if (view !== "echo" || !echoesReady || !echoChecksReady || echoLoading) return;
    const latestAllowed = entries.find(entry => entry.aiLink);
    if (latestAllowed && !echoCheckedIds.includes(latestAllowed.id)) void prepareEcho(latestAllowed, entries);
  }, [view, entries, echoesReady, echoChecksReady, echoCheckedIds, echoLoading]);

  function saveOrganizationExample(kind: "good" | "needs_work" = "good", reason?: string) {
    if (!reviewOriginal.trim() || !review.content.trim()) return;
    const example: OrganizationExample = { id: Date.now(), original: reviewOriginal, title: review.title, content: review.content, tags: review.tags, prompt: organizePrompt, createdAt: new Date().toISOString(), kind, reason };
    setOrganizationExamples(current => [example, ...current.filter(item => item.original !== example.original || item.content !== example.content)].slice(0, 30));
    setFeedbackOpen(false); setIssueOptionsOpen(false);
    notify(kind === "good" ? "已收为好样例，用于之后校准整理规则" : `已记录：${reason}。它会帮助我们守住边界。`);
  }
  function saveEntry(useAi: boolean, rawText?: string) {
    if (reviewEntryId !== null && rawText === undefined) {
      setEntries(current => current.map(entry => {
        if (entry.id !== reviewEntryId || !useAi) return entry;
        return { ...entry, title: review.title.trim() || entry.title, content: review.content, tags: review.tags, aiLink: review.aiLink, originalContent: entry.originalContent || entry.content };
      }));
      setStage("idle"); setReviewEntryId(null); closeEdit();
      notify(useAi ? "已保存整理稿，原文也被保留" : "已保留原文");
      return;
    }
    const rawContent = (rawText ?? reviewOriginal).trim();
    if (!useAi && !rawContent && !attachments.length) {
      notify("还没有内容可保存");
      return;
    }
    const entry: Entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      title: useAi ? review.title.trim() || "未命名记录" : titleFromContent(rawContent),
      content: useAi ? review.content : rawContent,
      originalContent: useAi ? reviewOriginal : rawContent,
      tags: useAi ? review.tags : [],
      source: attachments.length ? "图片与快速记录" : "快速记录",
      aiLink: useAi ? review.aiLink : link,
      status: useAi ? "open" : undefined,
      attachments,
      continuesFrom: continuingFrom ?? undefined,
    };
    setEntries(current => [entry, ...current]);
    setText(""); setAttachments([]); setStage("idle");
    notify(useAi ? "已保存整理稿，原文也被保留" : "已原样保存");
  }
  function openEntry(entry: Entry) {
    setSelectedId(entry.id);
    setEdit({ title: entry.title, content: entry.content, tags: entry.tags, aiLink: entry.aiLink });
    setOriginalEdit(entry.originalContent || entry.content);
    setShowOriginal(false); setPreviewMarkdown(false);
  }

  function saveEdit() {
    if (!selected || !edit) return;
    setEntries(current => current.map(entry => {
      if (entry.id !== selected.id) return entry;
      if (showOriginal) {
        const preservedOriginal = originalEdit.trim() ? originalEdit : (entry.originalContent || entry.content);
        return { ...entry, title: edit.title, content: entry.originalContent ? entry.content : preservedOriginal, originalContent: preservedOriginal, tags: edit.tags, aiLink: edit.aiLink };
      }
      return { ...entry, ...edit };
    }));
    closeEdit(); notify(showOriginal ? "原文修改已保存" : "修改已保存");
  }
  function download(list: Entry[], name = "我的回页日记") {
    if (!list.length) return notify("请先选择要导出的日记");
    const markdown = list.map(entry => `# ${entry.title}\n\n${formatTimestamp(entry, now)} · ${entry.source}\n\n${entry.content}\n\n${entry.tags.map(tag => `#${tag}`).join(" ")}`).join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name}.md`; anchor.click(); URL.revokeObjectURL(url);
    setExportOpen(false); notify(`已导出 ${list.length} 篇日记`);
  }

  function sendChat(preset?: string) {
    const question = preset || chatInput.trim();
    if (!question) return;
    setMessages(current => [...current, { role: "user", text: question }]); setChatInput("");
    window.setTimeout(() => setMessages(current => [...current, { role: "ai", text: "你在 4 月留下的疑问是：目标已经清楚，为什么仍然拖延？当时你猜测是任务拆得不够小。5 月的项目复盘给了另一种真实反馈——你更在意暴露不成熟。今天写下“先交出可以讨论的版本”，像是在回应那个旧问题。你觉得这次改变的是方法，还是你对“不成熟”的接受程度？" }]), 450);
  }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">回</span><span>回页<small>让思考继续生长</small></span></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i>{item.label}{item.id === "echo" && echoes.filter(echo => echo.status === "pending").length > 0 && <b>{echoes.filter(echo => echo.status === "pending").length}</b>}</button>)}</nav><div className="side-bottom"><button onClick={() => setView("settings")}><i>⚙</i>设置</button><button onClick={() => { setExportIds([]); setExportOpen(true); }}><i>↓</i>导出 Markdown</button><div className="privacy"><span>◉</span><div><strong>内容保存在此设备</strong><small>你始终拥有原文与控制权</small></div></div></div></aside>
    <section className="content">
      <header className="mobile-head"><div className="brand"><span className="brand-mark">回</span><span>回页</span></div><button onClick={() => setView("pool")}>日记池</button></header>
      {view === "write" && <div className="page write-page" style={{ maxWidth: 960, paddingTop: 44, transform: `translateY(-${Math.min(190, Math.max(0, writeLines - 5) * 20)}px)`, transition: "transform .28s ease" }}>
        <div className="eyebrow">2026 年 7 月 17 日 · 星期五</div><h1>此刻，想留下什么？</h1><p className="lead">不用想标题，也不用急着归类。先写下来就好。</p>{continuingEntry && <div className="continuation-hint">沿着《{continuingEntry.title}》继续写</div>}
        <div ref={paperRef} className="paper" style={{ height: writeRows * 41 + (writeLines < 15 ? 58 : 100), overflowY: "hidden", transition: "height .28s ease" }}>
          <textarea ref={textRef} style={{ paddingBottom: writeLines >= 15 ? 72 : 0, overflowY: writeLines >= 15 ? "auto" : "hidden" }} value={text} onChange={event => setText(event.target.value)} onMouseUp={event => showSelectionMenu(event.clientX, event.clientY)} onKeyUp={() => showSelectionMenu()} onBlur={() => window.setTimeout(hideSelectionMenu, 120)} placeholder="一个疑问、一段推理，或只是此刻不想忘记的感受……" autoFocus />
          {selectionMenu.visible && <div className="selection-format-menu" style={{ left: selectionMenu.left, top: selectionMenu.top }} onMouseDown={event => event.preventDefault()}><button type="button" title="标题" onClick={() => prefixSelectedLines("# ", "标题")}>T</button><button type="button" title="小标题" onClick={() => prefixSelectedLines("## ", "小标题")}>T₂</button><i /><button type="button" title="加粗" onClick={() => replaceSelection("**")}>B</button><button type="button" title="斜体" onClick={() => replaceSelection("*")}>I</button><button type="button" title="删除线" onClick={() => replaceSelection("~~")}>S</button><button type="button" title="下划线" onClick={() => replaceSelection("<u>", "</u>")}>U</button><i /><button type="button" title="引用" onClick={() => prefixSelectedLines("> ")}>❝</button><button type="button" title="列表" onClick={() => prefixSelectedLines("- ")}>•</button><button type="button" title="居中" onClick={() => alignSelection("center")}>≡</button></div>}
          <div className="paper-tools"><span>{text.length} 字 · {attachments.length} 张图片 · 支持 Markdown</span><div><button onClick={pasteText}>粘贴</button><button onClick={() => fileRef.current?.click()}>＋ 手写 / 图片</button><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /></div></div>
        </div>
        {attachments.length > 0 && <div className="attachment-row">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`}><img src={attachment.data} alt={attachment.name} /><button onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
        <div className="write-link-control"><Toggle checked={link} onChange={() => setLink(!link)} label="允许 AI 关联" hint="未来回响或对话中，它才可能被带回来" /></div>
        <div className="save-row"><span>{link ? "这篇记录可能在未来回应你" : "这篇记录不会进入回响范围"}</span><button className="primary" onClick={() => saveEntry(false, text)}>保存这篇记录 <b>→</b></button></div>
      </div>}      {view === "pool" && <div className="page pool-page"><div className="page-title"><div><div className="eyebrow">你的思考原野</div><h1>日记池</h1><p className="lead">不用维护文件夹。所有记录都在这里，安静地等待再次被需要。</p></div><button className="primary small" onClick={() => setView("write")}>＋ 写一篇</button></div><div className="search"><span>⌕</span><input placeholder="搜索一个词、一段记忆或一个问题…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="filter-row"><button className="selected">全部 {entries.length}</button><button>未闭合 {entries.filter(entry => entry.status === "open").length}</button><button>已有回响 {entries.filter(entry => entry.status === "echoed").length}</button></div><div className="entry-grid">{filtered.map(entry => <article className="entry" key={entry.id} onClick={() => openEntry(entry)} onKeyDown={event => { if (event.key === "Enter") openEntry(entry); }} role="button" tabIndex={0}><div className="entry-meta"><span>{formatTimestamp(entry, now)}</span><span>{entry.aiLink ? "✦ 可关联" : "○ 私密"}</span></div><h3>{entry.title}</h3><p className="entry-preview">{markdownPreviewText(entry.content)}</p><div className="entry-foot"><span>{entry.source}{entry.attachments?.length ? ` · ${entry.attachments.length} 张图` : ""}</span><div>{entry.tags.map(tag => <b key={tag}>{tag}</b>)}</div></div></article>)}</div></div>}
      {view === "settings" && <div className="page settings-page"><div className="eyebrow">回页如何整理你的文字</div><h1>设置</h1><p className="lead">这条规则只保存在当前设备，并只影响之后你主动发起的 AI 整理。原文和已经接受的整理稿不会被自动改变。</p><section className="prompt-card"><div><h2>AI 整理规则</h2><p>你可以修改它；越具体，AI 越知道该如何克制。</p></div><textarea value={organizePrompt} onChange={event => setOrganizePrompt(event.target.value)} aria-label="AI 整理规则" /><div className="prompt-actions"><small>已自动保存在此设备</small><button type="button" onClick={() => { setOrganizePrompt(DEFAULT_ORGANIZE_PROMPT); notify("已恢复默认整理规则"); }}>恢复默认</button></div></section><section className="prompt-example"><details><summary>整理样例：保留思考，给它留出呼吸</summary><div className="example-grid"><div><small>整理前 · 完整原文</small><pre>{ORGANIZATION_SAMPLE.original}</pre></div><div><small>整理后 · 完整样例</small><h3>{ORGANIZATION_SAMPLE.title}</h3><pre>{ORGANIZATION_SAMPLE.content}</pre><b>标签：{ORGANIZATION_SAMPLE.tags.join("、")}</b></div></div><p className="example-note">它不替你补结论；只识别原文已有的推理转折，并让你日后更容易重新进入。</p></details></section><section className="example-library"><details><summary>样例库 · {organizationExamples.filter(item => item.kind !== "needs_work").length} 个好样例 · {organizationExamples.filter(item => item.kind === "needs_work").length} 个待改</summary><p>当你觉得某次整理真正保留了你的思考，或明确哪里不对，都可以在整理页标题区的「···」里记录。它只保存在当前设备；未来调 prompt 或换模型时，用它们逐篇对照，而不是偷偷混进每一次日记整理。</p>{organizationExamples.length === 0 ? <small>还没有收藏的样例。</small> : <div className="saved-examples">{organizationExamples.map(item => <details className="saved-example" key={item.id}><summary>{item.title || "未命名记录"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</summary><div className="example-grid"><div><small>原文</small><pre>{item.original}</pre></div><div><small>{item.kind === "needs_work" ? `待改：${item.reason || "未说明"}` : "你认可的整理稿"}</small><h3>{item.title}</h3><pre>{item.content}</pre><b>标签：{item.tags.join("、") || "无"}</b></div></div><button type="button" onClick={() => setOrganizationExamples(current => current.filter(example => example.id !== item.id))}>移出样例库</button></details>)}</div>}</details></section></div>}      {view === "echo" && <div className="page echo-page">
        <div className="eyebrow">过去的思考，会在这里安静等待</div>
        <h1>回响</h1>
        <p className="lead">{echoLoading ? "正在安静地看看，过去有没有一段思考值得带回来。" : pendingEcho ? "一段旧思考，或许正值得你再看一眼。" : "这里不追求每天都有答案。没有足够相关的记忆时，回页会保持安静。"}</p>
        {echoLoading ? <div className="echo-empty"><span className="orb pulse">✦</span><p>只会带回一段有证据的旧思考。</p></div> : pendingEcho && echoedEntry ? <div className="echo-card real-echo"><div className="echo-top"><span className="spark large">✦</span><div><small>{formatTimestamp(echoedEntry, now)} · {echoedEntry.source}</small><h2>{echoedEntry.title === "未命名记录" ? "一段旧思考" : echoedEntry.title}</h2></div></div><div className="echo-quote"><Markdown content={pendingEcho.quote} /></div><div className="echo-reason"><span>为什么在这里</span><p>{pendingEcho.reason}</p>{echoSourceEntry && <p className="echo-connection">它是在你写下《{echoSourceEntry.title === "未命名记录" ? "一段新思考" : echoSourceEntry.title}》之后，被带回来的。</p>}</div><div className="echo-actions"><button onClick={() => { setEchoes(current => current.map(echo => echo.id === pendingEcho.id ? { ...echo, status: "opened" } : echo)); openEntry(echoedEntry); }}>打开看看</button><button className="primary" onClick={() => { setEchoes(current => current.map(echo => echo.id === pendingEcho.id ? { ...echo, status: "continued" } : echo)); setContinuingFrom(echoedEntry.id); setText(""); setView("write"); notify("从这段旧思考旁边，继续写下去吧"); }}>沿着它继续写</button><button className="quiet" onClick={() => { setEchoes(current => current.map(echo => echo.id === pendingEcho.id ? { ...echo, status: "irrelevant" } : echo)); notify("记下了：这次不再把它带回来"); }}>这次无关</button></div></div> : <div className="echo-empty"><span className="orb">✦</span><h2>先让思考沉一沉</h2><p>{entries.filter(entry => entry.aiLink).length < 2 ? "至少留下两篇允许关联的记录后，回页才有机会找到它们之间的联系。" : "当新的思考与过去真正相遇时，它会在这里等你。"}</p></div>}
      </div>}
      {view === "chat" && <div className="page chat-page"><div className="eyebrow">带着过去，聊聊现在</div><h1>和 AI 聊聊</h1><p className="lead">AI 只会引用你允许关联的记录，并告诉你它从哪里找到这些内容。</p><div className="chat-box">{messages.length === 0 ? <div className="chat-empty"><span className="orb">✦</span><h2>现在有什么想理一理的吗？</h2><p>不必组织语言。你可以从眼前的困惑开始。</p><div className="prompts"><button onClick={() => sendChat("我以前思考过拖延这件事吗？")}>我以前思考过拖延这件事吗？</button><button onClick={() => sendChat("最近的我，有什么变化？")}>最近的我，有什么变化？</button></div></div> : <div className="messages">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><span>{message.role === "ai" ? "回页" : "我"}</span><p>{message.text}</p>{message.role === "ai" && <div className="sources">引用了 3 篇你允许关联的记录 · 可查看原文</div>}</div>)}</div>}<div className="chat-input"><textarea value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="从一个念头开始…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChat(); } }} /><button onClick={() => sendChat()}>↑</button></div></div></div>}
      <nav className="mobile-nav">{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav>
    </section>
    {pendingDraft && <div className="modal-back"><div className="draft-restore"><span className="orb">✦</span><small>检测到未保存的记录</small><h2>要继续刚才的思考吗？</h2><p>{pendingDraft.text.trim() ? `${pendingDraft.text.slice(0, 66)}${pendingDraft.text.length > 66 ? "…" : ""}` : "你刚才添加了图片附件。"}</p><div><button onClick={discardDraft}>丢弃</button><button className="primary" onClick={restoreDraft}>恢复记录</button></div></div></div>}
    {stage === "organizing" && <div className="modal-back"><div className="organizing"><span className="orb pulse">✦</span><h2>AI 正在轻轻整理你的日记</h2><p>原文已经保存，你现在就可以安心离开。</p><div className="progress"><i /></div></div></div>}
    {stage === "review" && <div className="modal-back"><div className="comparison-modal"><div className="comparison-head"><div><span className="spark">✦</span><div><small>AI 整理完成</small><h2>看看它有没有保留你的原意</h2></div></div><div className="comparison-tools"><div className="feedback-menu"><button type="button" className="feedback-trigger" title="反馈这次整理" aria-label="反馈这次整理" onClick={() => { setFeedbackOpen(!feedbackOpen); setIssueOptionsOpen(false); }}>···</button>{feedbackOpen && <div className="feedback-popover"><button type="button" onClick={() => saveOrganizationExample()}>收为好样例</button><button type="button" onClick={() => setIssueOptionsOpen(!issueOptionsOpen)}>这次不太对</button>{issueOptionsOpen && <div className="issue-options">{["改变了原意", "没有呼吸感", "标题不对", "标签没用", "加了不该加的话"].map(reason => <button type="button" key={reason} onClick={() => saveOrganizationExample("needs_work", reason)}>{reason}</button>)}</div>}</div>}</div><button onClick={() => { setStage("idle"); setReviewEntryId(null); setReviewOriginal(""); setFeedbackOpen(false); setIssueOptionsOpen(false); }}>×</button></div></div><div className="comparison-grid"><section className="comparison-original"><div className="comparison-label"><span>原文</span><small>你的原始记录，不会被改写</small></div><article><Markdown content={reviewOriginal} /></article></section><section className="comparison-suggestion"><div className="comparison-label"><span>整理建议</span><small>可以直接在右侧修改</small></div><label>建议标题</label><input value={review.title} onChange={event => setReview({ ...review, title: event.target.value })} /><label>整理后的正文</label><textarea style={{ height: reviewRows * 31 + (reviewLines < 15 ? 42 : 72), minHeight: 0, overflowY: reviewLines >= 15 ? "auto" : "hidden", paddingBottom: reviewLines >= 15 ? 48 : 12 }} value={review.content} onChange={event => setReview({ ...review, content: event.target.value })} /><label>标签</label><TagEditor tags={review.tags} onChange={tags => setReview({ ...review, tags })} /></section></div><div className="comparison-note">接受整理稿不会覆盖原文；两份内容都会被保留。</div><div className="comparison-actions"><button onClick={() => saveEntry(false)}>保留原文</button><button className="primary" onClick={() => saveEntry(true)}>接受整理稿</button></div></div></div>}
    {selected && edit && <div className="modal-back" onMouseDown={closeEdit}><div className="review edit-modal" onMouseDown={event => event.stopPropagation()}><div className="review-head"><div><span className="spark">□</span><div><small>{formatTimestamp(selected, now)} · {selected.source}</small><h2>查看与编辑日记</h2></div></div><button onClick={closeEdit}>×</button></div><div className="review-body"><label>标题</label><input value={edit.title} onChange={event => setEdit({ ...edit, title: event.target.value })} /><label>{showOriginal ? "原文" : "正文"}</label><div className="markdown-mode"><span>{previewMarkdown ? "Markdown 预览" : "Markdown 编辑"}</span><button type="button" onClick={() => setPreviewMarkdown(!previewMarkdown)}>{previewMarkdown ? "继续编辑" : "预览 Markdown"}</button></div>{previewMarkdown ? <div className="markdown-preview"><Markdown content={showOriginal ? originalEdit : edit.content} /></div> : <textarea style={{ height: editRows * 29 + (editLines < 15 ? 40 : 70), minHeight: 0, overflowY: editLines >= 15 ? "auto" : "hidden", paddingBottom: editLines >= 15 ? 52 : 11 }} value={showOriginal ? originalEdit : edit.content} onChange={event => showOriginal ? setOriginalEdit(event.target.value) : setEdit({ ...edit, content: event.target.value })} />}<div className="edit-tags-row"><div><label>标签</label><TagEditor tags={edit.tags} onChange={tags => setEdit({ ...edit, tags })} /></div>{selected.originalContent && selected.originalContent !== selected.content && <button type="button" className="original-switch" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "返回整理稿" : "查看原文"}</button>}</div><Toggle checked={edit.aiLink} onChange={() => setEdit({ ...edit, aiLink: !edit.aiLink })} label="允许 AI 关联" hint="关闭后，这篇记录不会参与未来召回" /></div><div className="ai-organize-inline"><button type="button" onClick={() => beginReview(selected)}>{selected.originalContent && selected.originalContent !== selected.content ? "重新整理" : "让 AI 整理"}</button><small>原文会一直保留；只在你点击后发送给 AI。</small></div><div className="review-note">{showOriginal ? "你正在查看原文；可直接修改并保存，整理稿会继续保留。" : selected.originalContent && selected.originalContent !== selected.content ? "原文版本被单独保留，可随时切换查看。" : "当前内容就是原始版本。"}</div><div className="review-actions edit-actions"><button onClick={() => { if (window.confirm(`确定删除《${selected.title}》吗？删除后无法恢复。`)) { setEntries(current => current.filter(entry => entry.id !== selected.id)); closeEdit(); notify("日记已删除"); } }} className="danger">删除日记</button><span><button onClick={() => download([selected], selected.title)}>导出本篇</button><button className="primary" onClick={saveEdit}>保存修改</button></span></div></div></div>}
    {exportOpen && <div className="modal-back"><div className="review export-modal"><div className="review-head"><div><span className="spark">↓</span><div><small>Markdown 导出</small><h2>选择你想带走的日记</h2></div></div><button onClick={() => setExportOpen(false)}>×</button></div><div className="export-tools"><button onClick={() => setExportIds(entries.map(entry => entry.id))}>全选</button><button onClick={() => setExportIds([])}>清空</button><span>已选 {exportIds.length} 篇</span></div><div className="export-list">{entries.map(entry => <label key={entry.id}><input type="checkbox" checked={exportIds.includes(entry.id)} onChange={() => setExportIds(ids => ids.includes(entry.id) ? ids.filter(id => id !== entry.id) : [...ids, entry.id])} /><span><strong>{entry.title}</strong><small>{formatTimestamp(entry, now)} · {entry.tags.join("、") || "无标签"}</small></span></label>)}</div><div className="review-actions"><button onClick={() => setExportOpen(false)}>取消</button><button className="primary" disabled={!exportIds.length} onClick={() => download(entries.filter(entry => exportIds.includes(entry.id)))}>导出所选</button></div></div></div>}
    {toast && <div className="toast">✦ {toast}</div>}
  </main>;
}