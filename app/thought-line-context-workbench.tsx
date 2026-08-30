"use client";

import { useEffect, useState } from "react";
import { thoughtLinePromptVersions } from "./thought-line-context-prompts";

type EntryCard = {
  entryId: number | string;
  cardVersion?: string;
  occurredAt?: string | null;
  tags?: string[];
  thoughtLineIds?: string[];
  type?: string;
  summary: string;
  topics?: string[];
  entities?: string[];
  uncertainty: string[];
  source?: {
    title?: string;
    createdAt?: string | null;
    tags?: string[];
    thoughtLineIds?: string[];
  };
};

type ContextSnapshot = {
  sourceGenerationId: string;
  updatedAt: string | null;
  thoughtLine: { id: string; name: string };
  snapshotId?: string;
  status?: "ready" | "stale";
  promptVersions?: Record<string, string>;
  promptVersion?: string | null;
  model?: string | null;
  contextMarkdown: string;
  entryCards: EntryCard[];
  history?: Array<{
    snapshotId: string;
    createdAt: string;
    diff: {
      macroSections: Array<{ section: string; previous: string | null; next: string | null }>;
      entryCardReferences: {
        added: Array<{ entryId: string; cardVersion: string }>;
        removed: Array<{ entryId: string; cardVersion: string }>;
        changed: Array<{
          entryId: string;
          previous: { cardVersion: string };
          next: { cardVersion: string };
        }>;
      };
      promptVersions: Array<{ module: string; previous: string | null; next: string | null }>;
    };
  } | {
    changedAt: string | null;
    contextMarkdown: string;
    diff: Array<{ type: "added" | "removed"; text: string }>;
  }>;
  relationshipEvaluation: {
    status: "not_run" | "accepted" | "silent";
    latest: null | {
      runId: string;
      candidates?: Array<{ sourceEntryIds: string[]; expectedRelationType: string }>;
      attempts?: Array<{ sourceEntryIds: string[]; decision: string; rejectionStage?: string; reason?: string }>;
      sourceEntryIds?: string[];
      relationType?: string;
      reason?: string;
      uncertainty?: string;
    };
  };
};

type WorkbenchTab = "context" | "cards" | "history" | "prompts" | "relationship";

export function ThoughtLinePromptCatalog() {
  return (
    <section className="context-prompt-catalog">
      <header>
        <span>Context + Relation 新机制</span>
        <strong>四份独立 Prompt · 当前均待真实评测</strong>
        <p>模块和版本分别记录；这里展示完整正文，但不提供运行入口。</p>
      </header>
      <div className="evaluation-prompt-list">
        {thoughtLinePromptVersions.map((record) => (
          <article className="evaluation-prompt-sheet" key={`${record.module}-${record.version}`}>
            <header>
              <div>
                <span>{record.module}</span>
                <strong>{record.version}</strong>
                <b>待评测</b>
              </div>
              <small>{record.baseline ? `对照 ${record.baseline}` : "新增模块"}</small>
            </header>
            <div className="evaluation-prompt-meta">
              <p><b>变更</b>{record.changeSummary}</p>
              <p><b>评测</b>{record.evaluationMethod}</p>
              <p><b>回滚</b>{record.rollback}</p>
            </div>
            <pre>{record.prompt}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function MarkdownContext({ content }: { content: string }) {
  return (
    <div className="context-markdown">
      {content.split("\n").map((line, index) => {
        const key = `${index}-${line.slice(0, 24)}`;
        if (!line.trim()) return <span className="context-space" key={key} />;
        if (line.startsWith("# ")) return <h2 key={key}>{line.slice(2)}</h2>;
        if (line.startsWith("## ")) return <h3 key={key}>{line.slice(3)}</h3>;
        if (line.startsWith("> ")) return <blockquote key={key}>{line.slice(2)}</blockquote>;
        if (/^\d+\. /.test(line)) return <p className="context-list" key={key}>{line}</p>;
        if (line.startsWith("- ")) return <p className="context-list" key={key}>• {line.slice(2)}</p>;
        return <p key={key}>{line}</p>;
      })}
    </div>
  );
}

export default function ThoughtLineContextWorkbench() {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<WorkbenchTab>("context");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/thought-line-context", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { snapshot?: ContextSnapshot | null; error?: string };
        if (!response.ok) throw new Error(result.error || "无法读取 Context");
        if (!cancelled) setSnapshot(result.snapshot ?? null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法读取 Context");
      });
    return () => { cancelled = true; };
  }, []);

  const relationStatus = snapshot?.relationshipEvaluation.status === "accepted"
    ? "已接受一组候选"
    : snapshot?.relationshipEvaluation.status === "silent"
      ? "已运行，保持沉默"
      : "尚未运行";

  return (
    <div className="page context-workbench-page">
      <header className="context-workbench-head">
        <div>
          <div className="eyebrow">开发评测 · 只读实验</div>
          <h1>Context + 关系模型</h1>
          <p className="lead">先看 AI 如何认识整条思考线，再决定是否让关系模块回看原文。</p>
        </div>
        <span className="context-readonly-badge">只读 · 不生成回响</span>
      </header>

      <div className="context-tabs" role="tablist" aria-label="Context 实验内容">
        <button role="tab" aria-selected={tab === "context"} className={tab === "context" ? "selected" : ""} onClick={() => setTab("context")}>思考线认识</button>
        <button role="tab" aria-selected={tab === "cards"} className={tab === "cards" ? "selected" : ""} onClick={() => setTab("cards")}>EntryCards</button>
        <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "selected" : ""} onClick={() => setTab("history")}>历史 Diff</button>
        <button role="tab" aria-selected={tab === "prompts"} className={tab === "prompts" ? "selected" : ""} onClick={() => setTab("prompts")}>Prompt 版本</button>
        <button role="tab" aria-selected={tab === "relationship"} className={tab === "relationship" ? "selected" : ""} onClick={() => setTab("relationship")}>关系运行</button>
      </div>

      {tab === "prompts" ? (
        <ThoughtLinePromptCatalog />
      ) : error ? (
        <section className="context-empty"><strong>Context 读取失败</strong><p>{error}</p></section>
      ) : !snapshot ? (
        <section className="context-empty"><strong>正在读取开发版 Context…</strong><p>这里只读取独立开发 generation。</p></section>
      ) : (
        <>
          <section className="context-overview">
            <article><span>主思考线</span><strong>{snapshot.thoughtLine.name}</strong><small>{snapshot.thoughtLine.id}</small></article>
            <article><span>EntryCards</span><strong>{snapshot.entryCards.length} 张</strong><small>全部可回到原文</small></article>
            <article><span>关系运行</span><strong>{relationStatus}</strong><small>确认 Context 后才运行</small></article>
            <article><span>Context 状态</span><strong>{snapshot.status ?? "旧版快照"}</strong><small>{snapshot.snapshotId ?? snapshot.model ?? "未记录快照 ID"}</small></article>
          </section>

          {tab === "context" && (
            <section className="context-panel context-reading-panel">
              <header><span>ThoughtLineContext</span><small>更新于 {snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString("zh-CN") : "未知时间"}</small></header>
              <div className="context-snapshot-prompts">
                {snapshot.promptVersions
                  ? Object.entries(snapshot.promptVersions).map(([moduleName, version]) => (
                    <span key={moduleName}><b>{moduleName}</b>{version}</span>
                  ))
                  : <span><b>旧版 Context Prompt</b>{snapshot.promptVersion ?? "未记录"}</span>}
              </div>
              <MarkdownContext content={snapshot.contextMarkdown} />
            </section>
          )}

          {tab === "cards" && (
            <section className="entry-card-grid">
              {snapshot.entryCards.map((card, index) => (
                <article className="context-entry-card" key={card.entryId}>
                  <header><span>#{String(index + 1).padStart(2, "0")}</span><small>{card.source?.createdAt ? new Date(card.source.createdAt).toLocaleDateString("zh-CN") : "日期未知"}</small></header>
                  <h2>{card.source?.title || `Entry ${card.entryId}`}</h2>
                  <code>Entry {card.entryId}</code>
                  {card.cardVersion && <code>{card.cardVersion}</code>}
                  <b>{card.type ?? "EntryCard"}</b>
                  <p>{card.summary}</p>
                  <div>{(card.topics ?? card.tags ?? []).map((topic) => <span key={topic}>{topic}</span>)}</div>
                  {card.uncertainty.length > 0 && <small>边界：{card.uncertainty.join("；")}</small>}
                </article>
              ))}
            </section>
          )}

          {tab === "history" && (
            <section className="context-panel context-history-panel">
              <header><span>ContextSnapshot 历史</span><strong>{snapshot.history?.length ?? 0} 个相邻 diff</strong></header>
              {!snapshot.history?.length ? (
                <div className="relationship-not-run"><strong>尚无历史版本</strong><p>第一次维护后才会出现确定性相邻 diff。</p></div>
              ) : snapshot.history.map((version, historyIndex) => Array.isArray(version.diff) ? (
                <article key={`legacy-${historyIndex}-${version.changedAt ?? "unknown"}`}>
                  <header><strong>旧格式 Context 变化</strong><small>{version.changedAt ? new Date(version.changedAt).toLocaleString("zh-CN") : "时间未知"}</small></header>
                  <div className="context-diff-details context-legacy-diff">
                    {version.diff.map((change, changeIndex) => (
                      <p key={`${change.type}-${changeIndex}`}>
                        <b>{change.type === "added" ? "新增文本" : "移除文本"}</b>
                        {change.type === "removed" ? <del>{change.text}</del> : <span />}
                        {change.type === "added" ? <ins>{change.text}</ins> : <span />}
                      </p>
                    ))}
                  </div>
                </article>
              ) : (
                <article key={version.snapshotId}>
                  <header><strong>{version.snapshotId}</strong><small>{new Date(version.createdAt).toLocaleString("zh-CN")}</small></header>
                  <div className="context-diff-details">
                    {version.diff.macroSections.map((change) => (
                      <p key={`section-${change.section}`}><b>{change.section}</b><del>{change.previous ?? "未记录"}</del><ins>{change.next ?? "未记录"}</ins></p>
                    ))}
                    {version.diff.entryCardReferences.added.map((reference) => (
                      <p key={`added-${reference.entryId}`}><b>EntryCard 新增</b><span>{reference.entryId}</span><ins>{reference.cardVersion}</ins></p>
                    ))}
                    {version.diff.entryCardReferences.removed.map((reference) => (
                      <p key={`removed-${reference.entryId}`}><b>EntryCard 移除</b><span>{reference.entryId}</span><del>{reference.cardVersion}</del></p>
                    ))}
                    {version.diff.entryCardReferences.changed.map((change) => (
                      <p key={`changed-${change.entryId}`}><b>EntryCard 变化 · {change.entryId}</b><del>{change.previous.cardVersion}</del><ins>{change.next.cardVersion}</ins></p>
                    ))}
                    {version.diff.promptVersions.map((change) => (
                      <p key={`prompt-${change.module}`}><b>Prompt · {change.module}</b><del>{change.previous ?? "未记录"}</del><ins>{change.next ?? "未记录"}</ins></p>
                    ))}
                    {!version.diff.macroSections.length
                      && !version.diff.entryCardReferences.added.length
                      && !version.diff.entryCardReferences.removed.length
                      && !version.diff.entryCardReferences.changed.length
                      && !version.diff.promptVersions.length
                      && <p><span>相邻快照没有可见差异。</span></p>}
                  </div>
                </article>
              ))}
            </section>
          )}

          {tab === "relationship" && (
            <section className="context-panel relationship-panel">
              <header><span>RelationJudgment loop</span><strong>{relationStatus}</strong></header>
              {snapshot.relationshipEvaluation.latest ? (
                <div>
                  <p>候选组合：{snapshot.relationshipEvaluation.latest.candidates?.length ?? 0} 组</p>
                  <p>已核验：{snapshot.relationshipEvaluation.latest.attempts?.length ?? 0} 组</p>
                  {snapshot.relationshipEvaluation.latest.reason && <p>{snapshot.relationshipEvaluation.latest.reason}</p>}
                  {snapshot.relationshipEvaluation.latest.uncertainty && <small>{snapshot.relationshipEvaluation.latest.uncertainty}</small>}
                </div>
              ) : (
                <div className="relationship-not-run">
                  <strong>关系模块还没有读取原文</strong>
                  <p>当前页面只展示 Context Agent 的暂时认识。同一个 RelationJudgment Agent 会先从全部 Context 给出最多三组候选，再按顺序读取原文和历史状态逐组判断。</p>
                </div>
              )}
            </section>
          )}

          <footer className="context-source-note">源 generation：{snapshot.sourceGenerationId} · Context 与关系评测均保存在独立私有目录</footer>
        </>
      )}
    </div>
  );
}
