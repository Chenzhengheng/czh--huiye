"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
};
type Draft = { title: string; content: string; tags: string[]; aiLink: boolean };
 type SavedDraft = { text: string; attachments: Attachment[]; organize: boolean; link: boolean; updatedAt: string };
 const DRAFT_KEY = "huiye-writing-draft-v1";
 const PROMPT_KEY = "huiye-organization-prompt-v1";
 const DEFAULT_ORGANIZE_PROMPT = `你是“回页”的轻量整理助手。

你的职责是降低用户未来回看日记时的管理成本和阅读成本。你不是作者、导师、心理咨询师或总结者；你不替用户思考，不替用户下结论。

用户原文是唯一事实来源。原文优先；整理稿必须尽可能保留用户原本的表达、语气、顺序与思考轨迹。AI 应该尽量隐形。

任务：为未命名或标题过于通用的记录提供建议标题；生成一份最小整理稿；提供 0–3 个标签建议。

不得添加原文中不存在的事实、因果、案例、动机、结论、建议或技术细节；不得删除有信息或思考价值的句子；不得改变原文推理顺序；不得消除犹豫、保留意见、括号、疑问、矛盾、跳跃、未完成句或自我提醒；不得将并列想法强行组织成完整论证；不得进行心理分析、人格判断、价值评判、鼓励式总结或温情化表达。

不得使用“总结”“启示”“核心结论”“建议”“为什么”等自行创造的概念性小标题。仅允许分段与留白、修正明显错别字或标点、把原文明确并列内容变为列表，以及将用户原本已有的转折词、例子提示、拆解词或延伸词单独成行作为轻微阅读锚点。不得自行创造锚点。

如果用户已有明确标题，原样保留；“未命名记录”“快速记录”等通用标题视为无标题。标签必须来自原文明确出现或可直接对应的具体概念；最多 3 个；不确定时宁可少给。`;

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [organize, setOrganize] = useState(true);
  const [link, setLink] = useState(true);
  const [stage, setStage] = useState<"idle" | "organizing" | "review">("idle");
  const [review, setReview] = useState<Draft>({ title: "", content: "", tags: [], aiLink: true });
  const [reviewOriginal, setReviewOriginal] = useState("");
  const [reviewEntryId, setReviewEntryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

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
  useEffect(() => { if (promptReady) localStorage.setItem(PROMPT_KEY, organizePrompt); }, [organizePrompt, promptReady]);  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const filtered = useMemo(() => entries.filter(entry => `${entry.title}${entry.content}${entry.tags.join("")}`.toLowerCase().includes(search.toLowerCase())), [entries, search]);
  const selected = entries.find(entry => entry.id === selectedId) ?? null;
  const writeLines = visualLineCount(text);
  const writeRows = Math.min(15, Math.max(6, writeLines + 3));
  const editLines = visualLineCount(edit?.content || "", 55);
  const editRows = Math.min(15, Math.max(6, editLines + 3));
  const reviewLines = visualLineCount(review.content, 52);
  const reviewRows = Math.min(15, Math.max(5, reviewLines + 3));

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const closeEdit = () => { setSelectedId(null); setEdit(null); setShowOriginal(false); };
  const originalToSave = text.trim() || "今天有一些还没整理好的想法，先把它留在这里。";

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

  function saveEntry(useAi: boolean) {
    if (reviewEntryId !== null) {
      setEntries(current => current.map(entry => {
        if (entry.id !== reviewEntryId || !useAi) return entry;
        return { ...entry, title: review.title.trim() || entry.title, content: review.content, tags: review.tags, aiLink: review.aiLink, originalContent: entry.originalContent || entry.content };
      }));
      setStage("idle"); setReviewEntryId(null); closeEdit();
      notify(useAi ? "已保存整理稿，原文也被保留" : "已保留原文");
      return;
    }
    const entry: Entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      title: useAi ? review.title.trim() || "未命名记录" : "未命名记录",
      content: useAi ? review.content : (reviewOriginal || originalToSave),
      originalContent: reviewOriginal || originalToSave,
      tags: useAi ? review.tags : [],
      source: attachments.length ? "图片与快速记录" : "快速记录",
      aiLink: useAi ? review.aiLink : link,
      status: useAi ? "open" : undefined,
      attachments,
    };
    setEntries(current => [entry, ...current]);
    setText(""); setAttachments([]); setStage("idle");
    notify(useAi ? "已保存整理稿，原文也被保留" : "已原样保存");
  }
  function openEntry(entry: Entry) {
    setSelectedId(entry.id);
    setEdit({ title: entry.title, content: entry.content, tags: entry.tags, aiLink: entry.aiLink });
    setShowOriginal(false);
  }

  function saveEdit() {
    if (!selected || !edit || showOriginal) return;
    setEntries(current => current.map(entry => entry.id === selected.id ? { ...entry, ...edit } : entry));
    closeEdit(); notify("修改已保存");
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
    <aside className="sidebar"><div className="brand"><span className="brand-mark">回</span><span>回页<small>让思考继续生长</small></span></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i>{item.label}{item.id === "echo" && <b>1</b>}</button>)}</nav><div className="side-bottom"><button onClick={() => setView("settings")}><i>⚙</i>设置</button><button onClick={() => { setExportIds([]); setExportOpen(true); }}><i>↓</i>导出 Markdown</button><div className="privacy"><span>◉</span><div><strong>内容保存在此设备</strong><small>你始终拥有原文与控制权</small></div></div></div></aside>
    <section className="content">
      <header className="mobile-head"><div className="brand"><span className="brand-mark">回</span><span>回页</span></div><button onClick={() => setView("pool")}>日记池</button></header>
      {view === "write" && <div className="page write-page" style={{ maxWidth: 960, paddingTop: 44, transform: `translateY(-${Math.min(190, Math.max(0, writeLines - 5) * 20)}px)`, transition: "transform .28s ease" }}>
        <div className="eyebrow">2026 年 7 月 17 日 · 星期五</div><h1>此刻，想留下什么？</h1><p className="lead">不用想标题，也不用急着归类。先写下来就好。</p>
        <div className="paper" style={{ height: writeRows * 41 + (writeLines < 15 ? 58 : 100), overflowY: "hidden", transition: "height .28s ease" }}><textarea style={{ paddingBottom: writeLines >= 15 ? 72 : 0, overflowY: writeLines >= 15 ? "auto" : "hidden" }} value={text} onChange={event => setText(event.target.value)} placeholder="一个疑问、一段推理，或只是此刻不想忘记的感受……" autoFocus /><div className="paper-tools"><span>{text.length} 字 · {attachments.length} 张图片</span><div><button onClick={pasteText}>粘贴</button><button onClick={() => fileRef.current?.click()}>＋ 手写 / 图片</button><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /></div></div></div>
        {attachments.length > 0 && <div className="attachment-row">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`}><img src={attachment.data} alt={attachment.name} /><button onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
        <div className="ai-controls"><div className="controls-copy"><span className="spark">✦</span><div><strong>让 AI 在你允许的范围内帮忙</strong><small>两个选项彼此独立，也可以随时更改默认偏好。</small></div></div><div className="toggle-list"><Toggle checked={organize} onChange={() => setOrganize(!organize)} label="AI 帮我整理" hint="调整格式、生成标题，原文永远保留" /><Toggle checked={link} onChange={() => setLink(!link)} label="允许 AI 关联" hint="未来对话中，可找回这篇记录" /></div></div>
        <div className="save-row"><span>{link ? "这篇记录可能在未来回应你" : "这篇记录不会进入 AI 的关联范围"}</span><button className="primary" onClick={() => organize ? beginReview() : (setReviewOriginal(originalToSave), saveEntry(false))}>保存这篇记录 <b>→</b></button></div>
      </div>}
      {view === "pool" && <div className="page pool-page"><div className="page-title"><div><div className="eyebrow">你的思考原野</div><h1>日记池</h1><p className="lead">不用维护文件夹。所有记录都在这里，安静地等待再次被需要。</p></div><button className="primary small" onClick={() => setView("write")}>＋ 写一篇</button></div><div className="search"><span>⌕</span><input placeholder="搜索一个词、一段记忆或一个问题…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="filter-row"><button className="selected">全部 {entries.length}</button><button>未闭合 {entries.filter(entry => entry.status === "open").length}</button><button>已有回响 {entries.filter(entry => entry.status === "echoed").length}</button></div><div className="entry-grid">{filtered.map(entry => <article className="entry" key={entry.id} onClick={() => openEntry(entry)} onKeyDown={event => { if (event.key === "Enter") openEntry(entry); }} role="button" tabIndex={0}><div className="entry-meta"><span>{formatTimestamp(entry, now)}</span><span>{entry.aiLink ? "✦ 可关联" : "○ 私密"}</span></div><h3>{entry.title}</h3><p>{entry.content}</p><div className="entry-foot"><span>{entry.source}{entry.attachments?.length ? ` · ${entry.attachments.length} 张图` : ""}</span><div>{entry.tags.map(tag => <b key={tag}>{tag}</b>)}</div></div></article>)}</div></div>}
      {view === "settings" && <div className="page settings-page"><div className="eyebrow">回页如何整理你的文字</div><h1>设置</h1><p className="lead">这条规则只保存在当前设备，并只影响之后你主动发起的 AI 整理。原文和已经接受的整理稿不会被自动改变。</p><section className="prompt-card"><div><h2>AI 整理规则</h2><p>你可以修改它；越具体，AI 越知道该如何克制。</p></div><textarea value={organizePrompt} onChange={event => setOrganizePrompt(event.target.value)} aria-label="AI 整理规则" /><div className="prompt-actions"><small>已自动保存在此设备</small><button type="button" onClick={() => { setOrganizePrompt(DEFAULT_ORGANIZE_PROMPT); notify("已恢复默认整理规则"); }}>恢复默认</button></div></section></div>}      {view === "echo" && <div className="page echo-page"><div className="eyebrow">AI 的一声轻轻提醒</div><h1>一个旧问题，似乎有了新答案</h1><p className="lead">我没有急着替你下结论，只是把三段相隔数月的思考放在了一起。</p><div className="echo-card"><div className="echo-top"><span className="spark large">✦</span><div><small>思考回环 · 跨越 91 天</small><h2>“为什么知道方法，却还是迟迟不开始？”</h2></div></div><div className="timeline"><div><time>4月12日</time><article><b>过去的疑问</b><p>目标已经足够清楚，为什么我还是会拖延？</p><small>来自《行动的勇气》手写笔记</small></article></div><div><time>5月3日</time><article><b>真实反馈</b><p>卡住自己的不是任务大小，而是害怕别人看到不成熟。</p><small>来自工作复盘</small></article></div><div className="now"><time>今天</time><article><b>新的理解</b><p>先做出可以被讨论的版本，反馈本身也是思考的一部分。</p><small>来自作品集记录</small></article></div></div><div className="gentle-question"><span>AI 轻轻问</span><p>这一次真正发生变化的，是你使用的方法，还是你对“不成熟”的接受程度？</p><button onClick={() => { setView("chat"); sendChat("我想继续聊聊这段变化"); }}>沿着它继续想想 →</button></div></div></div>}
      {view === "chat" && <div className="page chat-page"><div className="eyebrow">带着过去，聊聊现在</div><h1>和 AI 聊聊</h1><p className="lead">AI 只会引用你允许关联的记录，并告诉你它从哪里找到这些内容。</p><div className="chat-box">{messages.length === 0 ? <div className="chat-empty"><span className="orb">✦</span><h2>现在有什么想理一理的吗？</h2><p>不必组织语言。你可以从眼前的困惑开始。</p><div className="prompts"><button onClick={() => sendChat("我以前思考过拖延这件事吗？")}>我以前思考过拖延这件事吗？</button><button onClick={() => sendChat("最近的我，有什么变化？")}>最近的我，有什么变化？</button></div></div> : <div className="messages">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><span>{message.role === "ai" ? "回页" : "我"}</span><p>{message.text}</p>{message.role === "ai" && <div className="sources">引用了 3 篇你允许关联的记录 · 可查看原文</div>}</div>)}</div>}<div className="chat-input"><textarea value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="从一个念头开始…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChat(); } }} /><button onClick={() => sendChat()}>↑</button></div></div></div>}
      <nav className="mobile-nav">{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav>
    </section>
    {pendingDraft && <div className="modal-back"><div className="draft-restore"><span className="orb">✦</span><small>检测到未保存的记录</small><h2>要继续刚才的思考吗？</h2><p>{pendingDraft.text.trim() ? `${pendingDraft.text.slice(0, 66)}${pendingDraft.text.length > 66 ? "…" : ""}` : "你刚才添加了图片附件。"}</p><div><button onClick={discardDraft}>丢弃</button><button className="primary" onClick={restoreDraft}>恢复记录</button></div></div></div>}
    {stage === "organizing" && <div className="modal-back"><div className="organizing"><span className="orb pulse">✦</span><h2>AI 正在轻轻整理你的日记</h2><p>原文已经保存，你现在就可以安心离开。</p><div className="progress"><i /></div></div></div>}
    {stage === "review" && <div className="modal-back"><div className="comparison-modal"><div className="comparison-head"><div><span className="spark">✦</span><div><small>AI 整理完成</small><h2>看看它有没有保留你的原意</h2></div></div><button onClick={() => setStage("idle")}>×</button></div><div className="comparison-grid"><section className="comparison-original"><div className="comparison-label"><span>原文</span><small>你的原始记录，不会被改写</small></div><article>{reviewOriginal}</article></section><section className="comparison-suggestion"><div className="comparison-label"><span>整理建议</span><small>可以直接在右侧修改</small></div><label>建议标题</label><input value={review.title} onChange={event => setReview({ ...review, title: event.target.value })} /><label>整理后的正文</label><textarea style={{ height: reviewRows * 31 + (reviewLines < 15 ? 42 : 72), minHeight: 0, overflowY: reviewLines >= 15 ? "auto" : "hidden", paddingBottom: reviewLines >= 15 ? 48 : 12 }} value={review.content} onChange={event => setReview({ ...review, content: event.target.value })} /><label>标签</label><TagEditor tags={review.tags} onChange={tags => setReview({ ...review, tags })} /></section></div><div className="comparison-note">接受整理稿不会覆盖原文；两份内容都会被保留。</div><div className="comparison-actions"><button onClick={() => saveEntry(false)}>保留原文</button><button className="primary" onClick={() => saveEntry(true)}>接受整理稿</button></div></div></div>}
    {selected && edit && <div className="modal-back" onMouseDown={closeEdit}><div className="review edit-modal" onMouseDown={event => event.stopPropagation()}><div className="review-head"><div><span className="spark">□</span><div><small>{formatTimestamp(selected, now)} · {selected.source}</small><h2>查看与编辑日记</h2></div></div><button onClick={closeEdit}>×</button></div><div className="review-body"><label>标题</label><input value={edit.title} disabled={showOriginal} onChange={event => setEdit({ ...edit, title: event.target.value })} /><label>{showOriginal ? "原文（只读）" : "正文"}</label><textarea style={{ height: editRows * 29 + (editLines < 15 ? 40 : 70), minHeight: 0, overflowY: editLines >= 15 ? "auto" : "hidden", paddingBottom: editLines >= 15 ? 52 : 11 }} readOnly={showOriginal} value={showOriginal ? selected.originalContent || selected.content : edit.content} onChange={event => setEdit({ ...edit, content: event.target.value })} /><div className="edit-tags-row"><div><label>标签</label><TagEditor tags={edit.tags} onChange={tags => setEdit({ ...edit, tags })} /></div>{selected.originalContent && selected.originalContent !== selected.content && <button type="button" className="original-switch" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "返回整理稿" : "查看原文"}</button>}</div><Toggle checked={edit.aiLink} onChange={() => setEdit({ ...edit, aiLink: !edit.aiLink })} label="允许 AI 关联" hint="关闭后，这篇记录不会参与未来召回" /></div><div className="ai-organize-inline"><button type="button" onClick={() => beginReview(selected)}>{selected.originalContent && selected.originalContent !== selected.content ? "重新整理" : "让 AI 整理"}</button><small>原文会一直保留；只在你点击后发送给 AI。</small></div><div className="review-note">{showOriginal ? "你正在查看最初写下的版本；切回整理稿后才能继续编辑。" : selected.originalContent && selected.originalContent !== selected.content ? "原文版本被单独保留，可随时切换查看。" : "当前内容就是原始版本。"}</div><div className="review-actions edit-actions"><button onClick={() => { if (window.confirm(`确定删除《${selected.title}》吗？删除后无法恢复。`)) { setEntries(current => current.filter(entry => entry.id !== selected.id)); closeEdit(); notify("日记已删除"); } }} className="danger">删除日记</button><span><button onClick={() => download([selected], selected.title)}>导出本篇</button><button className="primary" disabled={showOriginal} onClick={saveEdit}>保存修改</button></span></div></div></div>}
    {exportOpen && <div className="modal-back"><div className="review export-modal"><div className="review-head"><div><span className="spark">↓</span><div><small>Markdown 导出</small><h2>选择你想带走的日记</h2></div></div><button onClick={() => setExportOpen(false)}>×</button></div><div className="export-tools"><button onClick={() => setExportIds(entries.map(entry => entry.id))}>全选</button><button onClick={() => setExportIds([])}>清空</button><span>已选 {exportIds.length} 篇</span></div><div className="export-list">{entries.map(entry => <label key={entry.id}><input type="checkbox" checked={exportIds.includes(entry.id)} onChange={() => setExportIds(ids => ids.includes(entry.id) ? ids.filter(id => id !== entry.id) : [...ids, entry.id])} /><span><strong>{entry.title}</strong><small>{formatTimestamp(entry, now)} · {entry.tags.join("、") || "无标签"}</small></span></label>)}</div><div className="review-actions"><button onClick={() => setExportOpen(false)}>取消</button><button className="primary" disabled={!exportIds.length} onClick={() => download(entries.filter(entry => exportIds.includes(entry.id)))}>导出所选</button></div></div></div>}
    {toast && <div className="toast">✦ {toast}</div>}
  </main>;
}