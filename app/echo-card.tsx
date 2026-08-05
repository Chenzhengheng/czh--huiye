"use client";

import type { ReactNode } from "react";

export type EchoMode = "relational" | "reflective_revisit";
export type EchoEventType = "presented" | "opened" | "relation_rejected" | "not_now" | "continuation_started" | "continuation_saved";

export type EchoRecordV2 = {
  schemaVersion: 2;
  id: string;
  mode: EchoMode;
  sourceEntryIds: number[];
  triggerEntryId?: number;
  evidence: Array<{ entryId: number; quote: string }>;
  sourceSummaries: Array<{ entryId: number; text: string }>;
  reason: string;
  question?: string;
  discoveredAt: string;
  eligibleAfter: string;
  ruleVersion: string;
  model?: string;
  events: Array<{ type: EchoEventType; createdAt: string; resultEntryId?: number }>;
};

type EchoEntry = {
  id: number;
  title: string;
  content: string;
  createdAt?: string;
  date?: string;
};

function entryTime(entry: EchoEntry) {
  const parsed = new Date(entry.createdAt || entry.date || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayDate(entry: EchoEntry) {
  const parsed = entryTime(entry);
  if (!parsed) return entry.date || "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

function relationalGap(entries: EchoEntry[]) {
  const times = entries.map(entryTime).filter((value): value is Date => value !== null).map(date => date.getTime()).sort((left, right) => left - right);
  if (times.length < 2) return "两篇过去的记录";
  const days = Math.max(1, Math.round((times[times.length - 1] - times[0]) / 86_400_000));
  return `两篇记录，隔了${days}天`;
}

function excerptAround(content: string, quote: string, limit = 360) {
  const normalized = content.replace(/\r\n/g, "\n");
  const paragraph = normalized.split(/\n+/).find(item => item.includes(quote));
  if (paragraph && paragraph.length <= limit) return paragraph;
  const source = paragraph || normalized;
  const quoteIndex = source.indexOf(quote);
  const center = quoteIndex >= 0 ? quoteIndex + Math.floor(quote.length / 2) : 0;
  const start = Math.max(0, center - Math.floor(limit * .42));
  const end = Math.min(source.length, start + limit);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function EchoSource({
  entry,
  quote,
  summary,
  mark,
  label,
  renderContent,
}: {
  entry: EchoEntry;
  quote: string;
  summary: string;
  mark: string;
  label: string;
  renderContent: (content: string) => ReactNode;
}) {
  return <section className="echo-v2-source" aria-label={`${label}：${entry.title}`}>
    <div className="echo-v2-mark" aria-hidden="true">{mark}</div>
    <div className="echo-v2-source-body">
      <div className="echo-v2-source-head"><strong>{label}</strong><time dateTime={entry.createdAt}>{displayDate(entry)}</time></div>
      <p className="echo-v2-quote">“{quote}”</p>
      <details className="echo-v2-preview">
        <summary><span className="echo-v2-book" aria-hidden="true">□</span><span className="echo-v2-preview-open">点击查看原文</span><span className="echo-v2-preview-close">收起原文节选</span></summary>
        <details className="echo-v2-full">
          <summary>
            <span className="echo-v2-original-label">原文节选</span>
            <p>{excerptAround(entry.content, quote)}</p>
            <span className="echo-v2-expand"><span className="echo-v2-expand-open">点击这段，展开整篇思考</span><span className="echo-v2-expand-close">收起整篇思考</span></span>
          </summary>
          <div className="echo-v2-full-content"><span>完整原文 · {entry.title}</span>{renderContent(entry.content)}</div>
        </details>
      </details>
      <div className="echo-v2-summary"><strong>AI 浓缩 · 不是原文</strong><span>{summary}</span></div>
    </div>
  </section>;
}

export function EchoCard({
  record,
  entries,
  renderContent,
  onContinue,
  onNotNow,
}: {
  record: EchoRecordV2;
  entries: EchoEntry[];
  renderContent: (content: string) => ReactNode;
  onContinue: (record: EchoRecordV2) => void;
  onNotNow: (record: EchoRecordV2) => void;
}) {
  const sources = record.sourceEntryIds.map(id => entries.find(entry => entry.id === id)).filter((entry): entry is EchoEntry => Boolean(entry));
  if (sources.length !== record.sourceEntryIds.length) return <div className="echo-empty"><p>这条回响引用的日记暂时无法读取，因此没有展示。</p></div>;
  const isRelational = record.mode === "relational";
  const savedEvent = record.events.find(event => event.type === "continuation_saved");
  return <article className="echo-v2-card">
    <header className="echo-v2-head"><strong>{isRelational ? relationalGap(sources) : "一篇旧记录，回到今天"}</strong><span>{isRelational ? "A + B → C" : "A + 现在 → B"}</span></header>
    <div className="echo-v2-sources">
      {sources.map((entry, index) => <EchoSource
        key={entry.id}
        entry={entry}
        quote={record.evidence.find(item => item.entryId === entry.id)?.quote || "原文证据缺失"}
        summary={record.sourceSummaries.find(item => item.entryId === entry.id)?.text || "尚未生成浓缩"}
        mark={isRelational ? String.fromCharCode(65 + index) : "A"}
        label={isRelational ? (index === 0 ? "过去的你" : "经历之后的你") : "过去留下的一句话"}
        renderContent={renderContent}
      />)}
    </div>
    <section className="echo-v2-observation">
      <strong>{isRelational ? "我看到的变化" : "今天再看"}</strong>
      {!isRelational && <p className="echo-v2-honesty">这篇记录只是从符合时间与回响权限的旧日记中随机带回；回页不声称它今天必然与你有关。</p>}
      <p>{record.reason}</p>
      {record.question && <p className="echo-v2-question">{record.question}</p>}
      {savedEvent ? <div className="echo-v2-complete">已经沿着这次回响保存了新的思考。</div> : <div className="echo-v2-actions"><button className="primary" type="button" onClick={() => onContinue(record)}>{isRelational ? "写下此刻的回应" : "写下此刻的感受"}</button><button type="button" onClick={() => onNotNow(record)}>{isRelational ? "这次没有感觉" : "今天不想回应"}</button></div>}
    </section>
  </article>;
}
