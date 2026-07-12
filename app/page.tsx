"use client";

import { useEffect, useMemo, useState } from "react";

type View = "write" | "pool" | "echo" | "chat";
type Entry = { id:number; date:string; title:string; content:string; tags:string[]; source:string; aiLink:boolean; status?:"open"|"echoed" };

const seedEntries: Entry[] = [
  { id:1, date:"4月12日 · 22:18", title:"为什么知道方法，却还是迟迟不开始？", content:"读到“行动会反过来塑造动机”时有点疑惑。如果目标已经足够清楚，为什么我还是会拖延？现在猜测是任务拆得不够小，但还没有真实验证。", tags:["阅读思考","待验证"], source:"《行动的勇气》· 手写导入", aiLink:true, status:"open" },
  { id:2, date:"5月3日 · 19:42", title:"第一次项目复盘：卡住我的不是任务大小", content:"今天复盘才意识到，我迟迟不发第一版，不是因为没拆任务，而是害怕别人看到不成熟的东西。真正有效的是先给同事发一个很粗糙的草稿。", tags:["工作复盘","真实反馈"], source:"飞书粘贴", aiLink:true, status:"echoed" },
  { id:3, date:"今天 · 08:35", title:"先交出一个可以讨论的版本", content:"准备作品集时又想追求完整。提醒自己：先做出可以被讨论的版本，反馈本身也是思考的一部分。", tags:["作品集","行动"], source:"快速记录", aiLink:true },
];

const nav = [
  { id:"write" as View, icon:"✎", label:"写下" }, { id:"pool" as View, icon:"□", label:"日记池" },
  { id:"echo" as View, icon:"↗", label:"回响" }, { id:"chat" as View, icon:"◌", label:"和 AI 聊聊" },
];

function Toggle({checked,onChange,label,hint}:{checked:boolean;onChange:()=>void;label:string;hint:string}) {
  return <button className="toggle-row" onClick={onChange} type="button" aria-pressed={checked}><span className={`toggle ${checked?"on":""}`}><span /></span><span><strong>{label}</strong><small>{hint}</small></span></button>;
}

export default function Home() {
  const [view,setView]=useState<View>("write"), [entries,setEntries]=useState<Entry[]>(seedEntries), [text,setText]=useState("");
  const [organize,setOrganize]=useState(true), [link,setLink]=useState(true), [stage,setStage]=useState<"idle"|"organizing"|"review">("idle");
  const [search,setSearch]=useState(""), [toast,setToast]=useState(""), [chatInput,setChatInput]=useState("");
  const [messages,setMessages]=useState<{role:"user"|"ai";text:string}[]>([]);

  useEffect(()=>{ const saved=localStorage.getItem("ai-diary-entries"); if(saved) setEntries(JSON.parse(saved)); },[]);
  useEffect(()=>{ localStorage.setItem("ai-diary-entries",JSON.stringify(entries)); },[entries]);
  const filtered=useMemo(()=>entries.filter(e=>`${e.title}${e.content}${e.tags.join("")}`.toLowerCase().includes(search.toLowerCase())),[entries,search]);
  const cleaned=text.trim()?text.trim().replace(/。\s*/g,"。\n\n"):"今天在准备作品集时，我又开始追求完整，迟迟没有交出第一版。\n\n我想验证一个问题：是不是先把不成熟的版本交出去，反而更容易继续思考？";

  function saveEntry(useAi:boolean){ const content=text.trim()||"今天在准备作品集时，我又开始追求完整，迟迟没有交出第一版。我想验证：是不是先把不成熟的版本交出去，反而更容易继续思考？"; setEntries(prev=>[{id:Date.now(),date:"刚刚",title:useAi?"先交出不成熟的第一版":"未命名记录",content:useAi?cleaned:content,tags:useAi?["当下思考","待验证"]:[],source:"快速记录",aiLink:link,status:useAi?"open":undefined},...prev]); setText("");setStage("idle");setToast(useAi?"已保存整理稿，原文也为你保留":"已原样保存");setTimeout(()=>setToast(""),2600); }
  function submit(){ if(!organize)return saveEntry(false);setStage("organizing");setTimeout(()=>setStage("review"),1300); }
  function sendChat(preset?:string){ const q=preset||chatInput.trim();if(!q)return;setMessages(prev=>[...prev,{role:"user",text:q}]);setChatInput("");setTimeout(()=>setMessages(prev=>[...prev,{role:"ai",text:"你在 4 月留下的疑问是：目标已经清楚，为什么仍然拖延？当时你猜测是任务拆得不够小。5 月的项目复盘给了另一种真实反馈——你更在意暴露不成熟。今天你写下“先交出可以讨论的版本”，像是在回应这个旧问题。你觉得这次真正发生变化的是方法，还是你对‘不成熟’的接受程度？"}]),500); }
  function exportMarkdown(){ const md=entries.map(e=>`# ${e.title}\n\n${e.date} · ${e.source}\n\n${e.content}\n\n${e.tags.map(t=>`#${t}`).join(" ")}`).join("\n\n---\n\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([md],{type:"text/markdown"}));a.download="我的AI日记.md";a.click();setToast("Markdown 已导出");setTimeout(()=>setToast(""),2200); }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">回</span><span>回页<small>让思考继续生长</small></span></div><nav>{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.icon}</i>{n.label}{n.id==="echo"&&<b>1</b>}</button>)}</nav><div className="side-bottom"><button onClick={exportMarkdown}><i>↓</i>导出 Markdown</button><div className="privacy"><span>◉</span><div><strong>内容保存在此设备</strong><small>你始终拥有原文与控制权</small></div></div></div></aside>
    <section className="content"><header className="mobile-head"><div className="brand"><span className="brand-mark">回</span><span>回页</span></div><button onClick={()=>setView("pool")}>日记池</button></header>
      {view==="write"&&<div className="page write-page"><div className="eyebrow">2026 年 7 月 12 日 · 星期日</div><h1>此刻，想留下什么？</h1><p className="lead">不用想标题，也不用急着归类。先写下来就好。</p><div className="paper"><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="一个疑问、一段推理，或只是此刻不想忘记的感受……" autoFocus/><div className="paper-tools"><span>{text.length} 字</span><div><button>粘贴</button><button>＋ 手写 / 图片</button></div></div></div><div className="ai-controls"><div className="controls-copy"><span className="spark">✦</span><div><strong>让 AI 在你允许的范围内帮忙</strong><small>两个选项彼此独立，也可以随时更改默认偏好。</small></div></div><div className="toggle-list"><Toggle checked={organize} onChange={()=>setOrganize(!organize)} label="AI 帮我整理" hint="调整格式、生成标题，原文永远保留"/><Toggle checked={link} onChange={()=>setLink(!link)} label="允许 AI 关联" hint="未来对话中，可找回这篇记录"/></div></div><div className="save-row"><span>{link?"这篇记录可能在未来回应你":"这篇记录不会进入 AI 的关联范围"}</span><button className="primary" onClick={submit}>保存这篇记录 <b>→</b></button></div></div>}
      {view==="pool"&&<div className="page pool-page"><div className="page-title"><div><div className="eyebrow">你的思考原野</div><h1>日记池</h1><p className="lead">不用维护文件夹。所有记录都在这里，安静地等待再次被需要。</p></div><button className="primary small" onClick={()=>setView("write")}>＋ 写一篇</button></div><div className="search"><span>⌕</span><input placeholder="搜索一个词、一段记忆或一个问题…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="filter-row"><button className="selected">全部 {entries.length}</button><button>未闭合 {entries.filter(e=>e.status==="open").length}</button><button>已有回响 {entries.filter(e=>e.status==="echoed").length}</button></div><div className="entry-grid">{filtered.map(e=><article className="entry" key={e.id}><div className="entry-meta"><span>{e.date}</span><span>{e.aiLink?"✦ 可关联":"○ 私密"}</span></div><h3>{e.title}</h3><p>{e.content}</p><div className="entry-foot"><span>{e.source}</span><div>{e.tags.map(t=><b key={t}>{t}</b>)}</div></div></article>)}</div></div>}
      {view==="echo"&&<div className="page echo-page"><div className="eyebrow">AI 的一声轻轻提醒</div><h1>一个旧问题，似乎有了新答案</h1><p className="lead">我没有急着替你下结论，只是把三段相隔数月的思考放到了一起。</p><div className="echo-card"><div className="echo-top"><span className="spark large">✦</span><div><small>思考回环 · 跨越 91 天</small><h2>“为什么知道方法，却还是迟迟不开始？”</h2></div></div><div className="timeline"><div><time>4月12日</time><article><b>过去的疑问</b><p>目标已经足够清楚，为什么我还是会拖延？当时你猜测：任务拆得不够小。</p><small>来自《行动的勇气》手写笔记</small></article></div><div><time>5月3日</time><article><b>真实反馈</b><p>第一次项目复盘后，你发现卡住自己的不是任务大小，而是害怕别人看到不成熟的东西。</p><small>来自工作复盘</small></article></div><div className="now"><time>今天</time><article><b>新的理解</b><p>“先做出可以被讨论的版本，反馈本身也是思考的一部分。”</p><small>来自作品集记录</small></article></div></div><div className="gentle-question"><span>AI 轻轻问</span><p>这一次真正发生变化的，是你使用的方法，还是你对“不成熟”的接受程度？</p><button onClick={()=>{setView("chat");sendChat("我想继续聊聊这段变化");}}>沿着它继续想想 →</button></div></div></div>}
      {view==="chat"&&<div className="page chat-page"><div className="eyebrow">带着过去，聊聊现在</div><h1>和 AI 聊聊</h1><p className="lead">AI 只会引用你允许关联的记录，并告诉你它从哪里找到这些内容。</p><div className="chat-box">{messages.length===0?<div className="chat-empty"><span className="orb">✦</span><h2>现在有什么想理一理的吗？</h2><p>不必组织语言。你可以从眼前的困惑开始。</p><div className="prompts"><button onClick={()=>sendChat("我以前思考过拖延这件事吗？")}>我以前思考过拖延这件事吗？</button><button onClick={()=>sendChat("最近的我，有什么变化？")}>最近的我，有什么变化？</button></div></div>:<div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}><span>{m.role==="ai"?"回页":"我"}</span><p>{m.text}</p>{m.role==="ai"&&<div className="sources">引用了 3 篇你允许关联的记录 · 可查看原文</div>}</div>)}</div>}<div className="chat-input"><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="从一个念头开始…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}/><button onClick={()=>sendChat()}>↑</button></div></div></div>}
      <nav className="mobile-nav">{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.icon}</i><span>{n.label}</span></button>)}</nav>
    </section>
    {stage==="organizing"&&<div className="modal-back"><div className="organizing"><span className="orb pulse">✦</span><h2>AI 正在轻轻整理你的日记</h2><p>原文已经保存，你现在就可以安心离开。</p><div className="progress"><i/></div></div></div>}
    {stage==="review"&&<div className="modal-back"><div className="review"><div className="review-head"><div><span className="spark">✦</span><div><small>AI 整理完成</small><h2>看看它有没有保留你的原意</h2></div></div><button onClick={()=>setStage("idle")}>×</button></div><div className="review-body"><label>建议标题</label><input defaultValue="先交出不成熟的第一版"/><label>整理后的正文</label><textarea defaultValue={cleaned}/><div className="tag-line"><span>当下思考</span><span>待验证</span><button>＋ 标签</button></div></div><div className="review-note">原文已单独保留，接受整理不会覆盖它。</div><div className="review-actions"><button onClick={()=>saveEntry(false)}>保留原文</button><button className="primary" onClick={()=>saveEntry(true)}>接受整理稿</button></div></div></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
