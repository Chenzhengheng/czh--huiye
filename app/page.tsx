"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "write" | "pool" | "echo" | "chat";
type Attachment = { name: string; type: string; data: string };
type Entry = {
  id: number; date: string; title: string; content: string; originalContent?: string;
  tags: string[]; source: string; aiLink: boolean; status?: "open" | "echoed";
  attachments?: Attachment[];
};
type Draft = { title: string; content: string; tags: string[]; aiLink: boolean };

const seedEntries: Entry[] = [
  { id:1,date:"4月12日 · 22:18",title:"为什么知道方法，却还是迟迟不开始？",content:"读到“行动会反过来塑造动机”时有点疑惑。如果目标已经足够清楚，为什么我还是会拖延？现在猜测是任务拆得不够小，但还没有真实验证。",tags:["阅读思考","待验证"],source:"《行动的勇气》· 手写导入",aiLink:true,status:"open" },
  { id:2,date:"5月3日 · 19:42",title:"第一次项目复盘：卡住我的不是任务大小",content:"今天复盘才意识到，我迟迟不发第一版，不是因为没拆任务，而是害怕别人看到不成熟的东西。真正有效的是先给同事发一个很粗糙的草稿。",tags:["工作复盘","真实反馈"],source:"飞书粘贴",aiLink:true,status:"echoed" },
  { id:3,date:"今天 · 08:35",title:"先交出一个可以讨论的版本",content:"准备作品集时又想追求完整。提醒自己：先做出可以被讨论的版本，反馈本身也是思考的一部分。",tags:["作品集","行动"],source:"快速记录",aiLink:true },
];

const nav = [
  { id:"write" as View,icon:"✎",label:"写下" },{ id:"pool" as View,icon:"□",label:"日记池" },
  { id:"echo" as View,icon:"↗",label:"回响" },{ id:"chat" as View,icon:"◌",label:"和 AI 聊聊" },
];

function Toggle({checked,onChange,label,hint}:{checked:boolean;onChange:()=>void;label:string;hint:string}) {
  return <button className="toggle-row" onClick={onChange} type="button" aria-pressed={checked}><span className={`toggle ${checked?"on":""}`}><span /></span><span><strong>{label}</strong><small>{hint}</small></span></button>;
}

function TagEditor({tags,onChange}:{tags:string[];onChange:(tags:string[])=>void}) {
  const [value,setValue]=useState("");
  const add=()=>{ const tag=value.trim().replace(/^#/,"");if(tag&&!tags.includes(tag))onChange([...tags,tag]);setValue(""); };
  return <div style={{display:"flex",flexWrap:"wrap",gap:7,alignItems:"center",marginTop:8}}>
    {tags.map(tag=><button key={tag} type="button" onClick={()=>onChange(tags.filter(t=>t!==tag))} title="点击删除标签" style={{border:0,background:"#eeeee8",padding:"6px 9px",borderRadius:5,fontSize:10,cursor:"pointer"}}>{tag} ×</button>)}
    <span style={{display:"flex",border:"1px solid #dfddd3",borderRadius:6,overflow:"hidden",background:"white"}}><input aria-label="新标签" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}} placeholder="添加标签" style={{width:90,border:0,outline:0,padding:"6px 8px",fontSize:10}}/><button type="button" onClick={add} style={{border:0,borderLeft:"1px solid #eee",background:"#f5f4ef",cursor:"pointer",fontSize:10}}>＋</button></span>
  </div>;
}

function visualLineCount(value:string,charactersPerLine=50){
  if(!value)return 0;
  return value.split(String.fromCharCode(10)).reduce((total,line)=>total+Math.max(1,Math.ceil(line.length/charactersPerLine)),0);
}

export default function Home(){
  const [view,setView]=useState<View>("write");
  const [entries,setEntries]=useState<Entry[]>(seedEntries);
  const [text,setText]=useState(""),[attachments,setAttachments]=useState<Attachment[]>([]);
  const [organize,setOrganize]=useState(true),[link,setLink]=useState(true);
  const [stage,setStage]=useState<"idle"|"organizing"|"review">("idle");
  const [review,setReview]=useState<Draft>({title:"",content:"",tags:[],aiLink:true});
  const [search,setSearch]=useState(""),[toast,setToast]=useState("");
  const [selectedId,setSelectedId]=useState<number|null>(null),[edit,setEdit]=useState<Draft|null>(null);
  const [exportOpen,setExportOpen]=useState(false),[exportIds,setExportIds]=useState<number[]>([]);
  const [chatInput,setChatInput]=useState("");
  const [messages,setMessages]=useState<{role:"user"|"ai";text:string}[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{const saved=localStorage.getItem("ai-diary-entries");if(saved){try{setEntries(JSON.parse(saved));}catch{}}},[]);
  useEffect(()=>{localStorage.setItem("ai-diary-entries",JSON.stringify(entries));},[entries]);
  const filtered=useMemo(()=>entries.filter(e=>`${e.title}${e.content}${e.tags.join("")}`.toLowerCase().includes(search.toLowerCase())),[entries,search]);
  const selected=entries.find(e=>e.id===selectedId)??null;
  const writeRows=Math.min(15,Math.max(6,visualLineCount(text)+3));
  const editRows=Math.min(15,Math.max(6,visualLineCount(edit?.content||"",55)+3));
  const cleaned=text.trim()?text.trim().replace(/。\s*/g,"。\n\n"):"今天在准备作品集时，我又开始追求完整，迟迟没有交出第一版。\n\n我想验证一个问题：是不是先把不成熟的版本交出去，反而更容易继续思考？";
  const notify=(message:string)=>{setToast(message);setTimeout(()=>setToast(""),2600);};

  async function pasteText(){
    try{const value=await navigator.clipboard.readText();if(!value){notify("剪贴板里没有文字");return;}setText(current=>current+(current?"\n":"")+value);notify("已粘贴剪贴板文字");}
    catch{notify("浏览器未允许读取剪贴板，请在输入框内使用 Ctrl + V");}
  }
  function addFiles(files:FileList|null){
    if(!files)return;const available=Math.max(0,4-attachments.length);const chosen=Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,available);
    if(!chosen.length){notify(available?"请选择图片文件":"一篇记录最多附加 4 张图片");return;}
    chosen.forEach(file=>{if(file.size>2.5*1024*1024){notify(`${file.name} 超过 2.5MB，暂未添加`);return;}const reader=new FileReader();reader.onload=()=>setAttachments(prev=>[...prev,{name:file.name,type:file.type,data:String(reader.result)}].slice(0,4));reader.readAsDataURL(file);});
  }
  function beginReview(){setStage("organizing");setTimeout(()=>{setReview({title:"先交出不成熟的第一版",content:cleaned,tags:["当下思考","待验证"],aiLink:link});setStage("review");},1100);}
  function saveEntry(useAi:boolean){
    const original=text.trim()||"今天在准备作品集时，我又开始追求完整，迟迟没有交出第一版。我想验证：是不是先把不成熟的版本交出去，反而更容易继续思考？";
    const entry:Entry={id:Date.now(),date:"刚刚",title:useAi?review.title:"未命名记录",content:useAi?review.content:original,originalContent:original,tags:useAi?review.tags:[],source:attachments.length?"图片与快速记录":"快速记录",aiLink:useAi?review.aiLink:link,status:useAi?"open":undefined,attachments};
    setEntries(prev=>[entry,...prev]);setText("");setAttachments([]);setStage("idle");notify(useAi?"已保存整理稿，原文也为你保留":"已原样保存");
  }
  function openEntry(entry:Entry){setSelectedId(entry.id);setEdit({title:entry.title,content:entry.content,tags:entry.tags||[],aiLink:entry.aiLink});}
  function saveEdit(){if(!selected||!edit)return;setEntries(prev=>prev.map(e=>e.id===selected.id?{...e,...edit}:e));setSelectedId(null);setEdit(null);notify("修改已保存");}
  function download(list:Entry[],name="我的AI日记"){
    if(!list.length){notify("请先选择要导出的日记");return;}
    const md=list.map(e=>`# ${e.title}\n\n${e.date} · ${e.source}\n\n${e.content}\n\n${e.tags.map(t=>`#${t}`).join(" ")}`).join("\n\n---\n\n");
    const url=URL.createObjectURL(new Blob([md],{type:"text/markdown;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${name}.md`;a.click();URL.revokeObjectURL(url);setExportOpen(false);notify(`已导出 ${list.length} 篇日记`);
  }
  function sendChat(preset?:string){const q=preset||chatInput.trim();if(!q)return;setMessages(prev=>[...prev,{role:"user",text:q}]);setChatInput("");setTimeout(()=>setMessages(prev=>[...prev,{role:"ai",text:"你在 4 月留下的疑问是：目标已经清楚，为什么仍然拖延？当时你猜测是任务拆得不够小。5 月的项目复盘给了另一种真实反馈——你更在意暴露不成熟。今天你写下“先交出可以讨论的版本”，像是在回应这个旧问题。你觉得这次真正发生变化的是方法，还是你对‘不成熟’的接受程度？"}]),450);}

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">回</span><span>回页<small>让思考继续生长</small></span></div><nav>{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.icon}</i>{n.label}{n.id==="echo"&&<b>1</b>}</button>)}</nav><div className="side-bottom"><button onClick={()=>{setExportIds([]);setExportOpen(true);}}><i>↓</i>导出 Markdown</button><div className="privacy"><span>◉</span><div><strong>内容保存在此设备</strong><small>你始终拥有原文与控制权</small></div></div></div></aside>
    <section className="content"><header className="mobile-head"><div className="brand"><span className="brand-mark">回</span><span>回页</span></div><button onClick={()=>setView("pool")}>日记池</button></header>
      {view==="write"&&<div className="page write-page" style={{maxWidth:960,paddingTop:Math.max(20,44-(writeRows-6)*3),transition:"padding-top .28s ease"}}><div className="eyebrow">2026 年 7 月 12 日 · 星期日</div><h1>此刻，想留下什么？</h1><p className="lead">不用想标题，也不用急着归类。先写下来就好。</p><div className="paper" style={{height:writeRows*41+58,transition:"height .28s ease"}}><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="一个疑问、一段推理，或只是此刻不想忘记的感受……" autoFocus/><div className="paper-tools"><span>{text.length} 字 · {attachments.length} 张图片</span><div><button onClick={pasteText}>粘贴</button><button onClick={()=>fileRef.current?.click()}>＋ 手写 / 图片</button><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={e=>{addFiles(e.target.files);e.target.value="";}}/></div></div></div>
        {attachments.length>0&&<div style={{display:"flex",gap:10,marginTop:12,overflowX:"auto"}}>{attachments.map((a,i)=><div key={`${a.name}-${i}`} style={{position:"relative",flex:"0 0 auto"}}><img src={a.data} alt={a.name} style={{width:92,height:68,objectFit:"cover",borderRadius:7,border:"1px solid #dfddd3"}}/><button onClick={()=>setAttachments(prev=>prev.filter((_,index)=>index!==i))} aria-label={`删除 ${a.name}`} style={{position:"absolute",right:-5,top:-6,border:0,borderRadius:"50%",width:20,height:20,background:"#555b51",color:"white",cursor:"pointer"}}>×</button></div>)}</div>}
        <div className="ai-controls"><div className="controls-copy"><span className="spark">✦</span><div><strong>让 AI 在你允许的范围内帮忙</strong><small>两个选项彼此独立，也可以随时更改默认偏好。</small></div></div><div className="toggle-list"><Toggle checked={organize} onChange={()=>setOrganize(!organize)} label="AI 帮我整理" hint="调整格式、生成标题，原文永远保留"/><Toggle checked={link} onChange={()=>setLink(!link)} label="允许 AI 关联" hint="未来对话中，可找回这篇记录"/></div></div><div className="save-row"><span>{link?"这篇记录可能在未来回应你":"这篇记录不会进入 AI 的关联范围"}</span><button className="primary" onClick={()=>organize?beginReview():saveEntry(false)}>保存这篇记录 <b>→</b></button></div></div>}

      {view==="pool"&&<div className="page pool-page"><div className="page-title"><div><div className="eyebrow">你的思考原野</div><h1>日记池</h1><p className="lead">不用维护文件夹。所有记录都在这里，安静地等待再次被需要。</p></div><button className="primary small" onClick={()=>setView("write")}>＋ 写一篇</button></div><div className="search"><span>⌕</span><input placeholder="搜索一个词、一段记忆或一个问题…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="filter-row"><button className="selected">全部 {entries.length}</button><button>未闭合 {entries.filter(e=>e.status==="open").length}</button><button>已有回响 {entries.filter(e=>e.status==="echoed").length}</button></div><div className="entry-grid">{filtered.map(e=><article className="entry" key={e.id} onClick={()=>openEntry(e)} onKeyDown={event=>{if(event.key==="Enter")openEntry(e);}} role="button" tabIndex={0} style={{cursor:"pointer"}}><div className="entry-meta"><span>{e.date}</span><span>{e.aiLink?"✦ 可关联":"○ 私密"}</span></div><h3>{e.title}</h3><p>{e.content}</p><div className="entry-foot"><span>{e.source}{e.attachments?.length?` · ${e.attachments.length} 张图`:""}</span><div>{(e.tags||[]).map(t=><b key={t}>{t}</b>)}</div></div></article>)}</div></div>}

      {view==="echo"&&<div className="page echo-page"><div className="eyebrow">AI 的一声轻轻提醒</div><h1>一个旧问题，似乎有了新答案</h1><p className="lead">我没有急着替你下结论，只是把三段相隔数月的思考放到了一起。</p><div className="echo-card"><div className="echo-top"><span className="spark large">✦</span><div><small>思考回环 · 跨越 91 天</small><h2>“为什么知道方法，却还是迟迟不开始？”</h2></div></div><div className="timeline"><div><time>4月12日</time><article><b>过去的疑问</b><p>目标已经足够清楚，为什么我还是会拖延？当时你猜测：任务拆得不够小。</p><small>来自《行动的勇气》手写笔记</small></article></div><div><time>5月3日</time><article><b>真实反馈</b><p>第一次项目复盘后，你发现卡住自己的不是任务大小，而是害怕别人看到不成熟的东西。</p><small>来自工作复盘</small></article></div><div className="now"><time>今天</time><article><b>新的理解</b><p>“先做出可以被讨论的版本，反馈本身也是思考的一部分。”</p><small>来自作品集记录</small></article></div></div><div className="gentle-question"><span>AI 轻轻问</span><p>这一次真正发生变化的，是你使用的方法，还是你对“不成熟”的接受程度？</p><button onClick={()=>{setView("chat");sendChat("我想继续聊聊这段变化");}}>沿着它继续想想 →</button></div></div></div>}

      {view==="chat"&&<div className="page chat-page"><div className="eyebrow">带着过去，聊聊现在</div><h1>和 AI 聊聊</h1><p className="lead">AI 只会引用你允许关联的记录，并告诉你它从哪里找到这些内容。</p><div className="chat-box">{messages.length===0?<div className="chat-empty"><span className="orb">✦</span><h2>现在有什么想理一理的吗？</h2><p>不必组织语言。你可以从眼前的困惑开始。</p><div className="prompts"><button onClick={()=>sendChat("我以前思考过拖延这件事吗？")}>我以前思考过拖延这件事吗？</button><button onClick={()=>sendChat("最近的我，有什么变化？")}>最近的我，有什么变化？</button></div></div>:<div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}><span>{m.role==="ai"?"回页":"我"}</span><p>{m.text}</p>{m.role==="ai"&&<div className="sources">引用了 3 篇你允许关联的记录 · 可查看原文</div>}</div>)}</div>}<div className="chat-input"><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="从一个念头开始…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}/><button onClick={()=>sendChat()}>↑</button></div></div></div>}
      <nav className="mobile-nav">{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.icon}</i><span>{n.label}</span></button>)}</nav>
    </section>

    {stage==="organizing"&&<div className="modal-back"><div className="organizing"><span className="orb pulse">✦</span><h2>AI 正在轻轻整理你的日记</h2><p>原文已经保存，你现在就可以安心离开。</p><div className="progress"><i/></div></div></div>}
    {stage==="review"&&<div className="modal-back"><div className="review"><div className="review-head"><div><span className="spark">✦</span><div><small>AI 整理完成</small><h2>看看它有没有保留你的原意</h2></div></div><button onClick={()=>setStage("idle")}>×</button></div><div className="review-body"><label>建议标题</label><input value={review.title} onChange={e=>setReview({...review,title:e.target.value})}/><label>整理后的正文</label><textarea value={review.content} onChange={e=>setReview({...review,content:e.target.value})}/><label>标签</label><TagEditor tags={review.tags} onChange={tags=>setReview({...review,tags})}/></div><div className="review-note">原文已单独保留，接受整理不会覆盖它。</div><div className="review-actions"><button onClick={()=>saveEntry(false)}>保留原文</button><button className="primary" onClick={()=>saveEntry(true)}>接受整理稿</button></div></div></div>}

    {selected&&edit&&<div className="modal-back"><div className="review" style={{width:"min(920px,96vw)",maxHeight:"94vh",overflow:"auto"}}><div className="review-head"><div><span className="spark">□</span><div><small>{selected.date} · {selected.source}</small><h2>查看与编辑日记</h2></div></div><button onClick={()=>{setSelectedId(null);setEdit(null);}}>×</button></div><div className="review-body"><label>标题</label><input value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/><label>正文</label><textarea style={{height:editRows*29+18,minHeight:0,fontSize:15,lineHeight:1.9,transition:"height .28s ease"}} value={edit.content} onChange={e=>setEdit({...edit,content:e.target.value})}/><label>标签</label><TagEditor tags={edit.tags} onChange={tags=>setEdit({...edit,tags})}/><Toggle checked={edit.aiLink} onChange={()=>setEdit({...edit,aiLink:!edit.aiLink})} label="允许 AI 关联" hint="关闭后，这篇记录不会参与未来召回"/>{selected.attachments?.length?<div style={{display:"flex",gap:10,overflowX:"auto",marginTop:10}}>{selected.attachments.map((a,i)=><img key={i} src={a.data} alt={a.name} style={{width:120,height:90,objectFit:"cover",borderRadius:7}}/>)}</div>:null}</div><div className="review-note">{selected.originalContent&&selected.originalContent!==selected.content?"原文版本仍被单独保留。":"当前内容就是原始版本。"}</div><div className="review-actions" style={{justifyContent:"space-between",alignItems:"center"}}><button onClick={()=>{if(window.confirm(`确定删除《${selected.title}》吗？删除后无法恢复。`)){setEntries(prev=>prev.filter(e=>e.id!==selected.id));setExportIds(ids=>ids.filter(id=>id!==selected.id));setSelectedId(null);setEdit(null);notify("日记已删除");}}} style={{borderColor:"#c9a9a1",color:"#9a4f43"}}>删除日记</button><span style={{display:"flex",gap:9}}><button onClick={()=>download([selected],selected.title)}>导出本篇</button><button className="primary" onClick={saveEdit}>保存修改</button></span></div></div></div>}

    {exportOpen&&<div className="modal-back"><div className="review" style={{width:"min(600px,100%)",maxHeight:"90vh",overflow:"auto"}}><div className="review-head"><div><span className="spark">↓</span><div><small>Markdown 导出</small><h2>选择你想带走的日记</h2></div></div><button onClick={()=>setExportOpen(false)}>×</button></div><div style={{padding:"18px 25px 4px",display:"flex",gap:8}}><button onClick={()=>setExportIds(entries.map(e=>e.id))} style={{border:"1px solid #dfddd3",background:"white",borderRadius:7,padding:"7px 11px",cursor:"pointer"}}>全选</button><button onClick={()=>setExportIds([])} style={{border:"1px solid #dfddd3",background:"white",borderRadius:7,padding:"7px 11px",cursor:"pointer"}}>清空</button><span style={{marginLeft:"auto",fontSize:11,color:"#77756b",alignSelf:"center"}}>已选 {exportIds.length} 篇</span></div><div style={{padding:"12px 25px",display:"grid",gap:8}}>{entries.map(e=><label key={e.id} style={{display:"grid",gridTemplateColumns:"22px 1fr",gap:8,padding:"11px",border:"1px solid #e5e1d7",borderRadius:7,cursor:"pointer",background:exportIds.includes(e.id)?"#f0f2ed":"#fffefa"}}><input type="checkbox" checked={exportIds.includes(e.id)} onChange={()=>setExportIds(ids=>ids.includes(e.id)?ids.filter(id=>id!==e.id):[...ids,e.id])}/><span><strong style={{display:"block",fontSize:13}}>{e.title}</strong><small style={{color:"#99958b"}}>{e.date} · {e.tags.join("、")||"无标签"}</small></span></label>)}</div><div className="review-actions"><button onClick={()=>setExportOpen(false)}>取消</button><button className="primary" disabled={!exportIds.length} style={{opacity:exportIds.length?1:.45}} onClick={()=>download(entries.filter(e=>exportIds.includes(e.id)))}>导出所选 {exportIds.length||""} 篇</button></div></div></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
