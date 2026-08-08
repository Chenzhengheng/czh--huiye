"use client";

import { useState, type ReactNode } from "react";

export type EchoMode = "relational" | "reflective_revisit";
export type EchoFeedback =
  | "clarified"
  | "already_known"
  | "not_quite"
  | "resonated"
  | "accurate_no_resonance";
export type EchoRelationType =
  | "continuation"
  | "revision"
  | "branch"
  | "conflict"
  | "unresolved_question"
  | "other";
export type EchoEventType =
  | "presented"
  | "opened"
  | "feedback_submitted"
  | "response_started"
  | "response_saved"
  | "relation_rejected"
  | "not_now"
  | "continuation_started"
  | "continuation_saved";

export type EchoEventV2 = {
  id?: string;
  type: EchoEventType;
  createdAt: string;
  presentationId?: string;
  feedback?: EchoFeedback;
  rejectionScope?: "interpretation" | "relationship" | "evidence" | "other";
  reasonCodes?: string[];
  resultEntryId?: number;
};

export type EchoRecordV2 = {
  schemaVersion: 2;
  id: string;
  mode: EchoMode;
  thoughtLineId?: string;
  relationType?: EchoRelationType;
  lifecycle?:
    | "candidate"
    | "evaluation_only"
    | "legacy_evaluation"
    | "invalidated";
  sourceEntryIds: number[];
  triggerEntryId?: number;
  evidence: Array<{ entryId: number; quote: string }>;
  sourceSummaries: Array<{ entryId: number; text: string }>;
  reason: string;
  question?: string;
  discoveredAt: string;
  eligibleAfter: string;
  cooldownUntil?: string;
  ruleVersion: string;
  model?: string;
  events: EchoEventV2[];
};

export type EchoEntry = {
  id: number;
  createdAt?: string;
  date?: string;
  title: string;
  content: string;
};

export type EchoReply = {
  id: string;
  echoRecordId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export function echoResponseEntryIds(record: EchoRecordV2) {
  return record.events
    .filter(
      (event) =>
        (event.type === "response_saved" ||
          event.type === "continuation_saved") &&
        event.resultEntryId !== undefined,
    )
    .map((event) => event.resultEntryId as number);
}

function entryTime(entry: EchoEntry) {
  if (!entry.createdAt) return null;
  const parsed = Date.parse(entry.createdAt);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function displayDate(entry: EchoEntry) {
  const parsed = entryTime(entry);
  if (!parsed) return entry.date || "时间未知";
  return parsed.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function relationalGap(entries: EchoEntry[]) {
  const times = entries
    .map(entryTime)
    .filter((value): value is Date => value !== null)
    .map((date) => date.getTime())
    .sort((left, right) => left - right);
  if (times.length < 2) return "两页过去，重新相遇";
  const days = Math.max(
    1,
    Math.round((times[times.length - 1] - times[0]) / 86_400_000),
  );
  return `两页过去，隔了${days}天`;
}

function excerptAround(content: string, quote: string, limit = 360) {
  const normalized = content.replace(/\r\n/g, "\n");
  const paragraph = normalized
    .split(/\n+/)
    .find((item) => item.includes(quote));
  if (paragraph && paragraph.length <= limit) return paragraph;
  const source = paragraph || normalized;
  const quoteIndex = source.indexOf(quote);
  const center =
    quoteIndex >= 0 ? quoteIndex + Math.floor(quote.length / 2) : 0;
  const start = Math.max(0, center - Math.floor(limit * 0.42));
  const end = Math.min(source.length, start + limit);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function EchoSource({
  entry,
  quote,
  label,
  renderContent,
}: {
  entry: EchoEntry;
  quote: string;
  label: string;
  renderContent: (content: string) => ReactNode;
}) {
  return (
    <section className="echo-v2-source" aria-label={`${label}：${entry.title}`}>
      <div className="echo-v2-source-body">
        <div className="echo-v2-source-head">
          <strong>{label}</strong>
          <time dateTime={entry.createdAt}>{displayDate(entry)}</time>
        </div>
        <p className="echo-v2-quote">“{quote}”</p>
        <details className="echo-v2-preview">
          <summary>
            <span className="echo-v2-book" aria-hidden="true">
              □
            </span>
            <span className="echo-v2-preview-open">查看原文</span>
            <span className="echo-v2-preview-close">收起原文节选</span>
          </summary>
          <details className="echo-v2-full">
            <summary>
              <span className="echo-v2-original-label">原文节选</span>
              <p>{excerptAround(entry.content, quote)}</p>
              <span className="echo-v2-expand">
                <span className="echo-v2-expand-open">展开整篇</span>
                <span className="echo-v2-expand-close">收起整篇</span>
              </span>
            </summary>
            <div className="echo-v2-full-content">
              <span>完整原文 · {entry.title}</span>
              {renderContent(entry.content)}
            </div>
          </details>
        </details>
      </div>
    </section>
  );
}

const feedbackLabels: Array<{ value: EchoFeedback; label: string }> = [
  { value: "clarified", label: "看清了一点" },
  { value: "already_known", label: "我已经知道了" },
  { value: "not_quite", label: "不太对" },
];

export function EchoCard({
  record,
  entries,
  lineName,
  renderContent,
  reply,
  selectedFeedback,
  onSaveReply,
  onDeleteReply,
  onFeedback,
  onOpenEntry,
}: {
  record: EchoRecordV2;
  entries: EchoEntry[];
  lineName?: string;
  renderContent: (content: string) => ReactNode;
  reply?: EchoReply;
  selectedFeedback?: EchoFeedback;
  onSaveReply: (record: EchoRecordV2, content: string) => void;
  onDeleteReply: (record: EchoRecordV2) => void;
  onFeedback: (record: EchoRecordV2, feedback: EchoFeedback) => void;
  onOpenEntry: (entryId: number) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(Boolean(reply));
  const [replyDraft, setReplyDraft] = useState(reply?.content ?? "");
  const sources = record.sourceEntryIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is EchoEntry => Boolean(entry));
  if (sources.length !== record.sourceEntryIds.length)
    return (
      <div className="echo-empty">
        <p>这条回响引用的日记暂时无法读取，因此没有展示。</p>
      </div>
    );
  const isRelational = record.mode === "relational";
  const responseEntries = echoResponseEntryIds(record)
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is EchoEntry => Boolean(entry));
  return (
    <article className="echo-v2-card">
      <header className="echo-v2-head">
        <strong>
          {lineName
            ? `✦ ${lineName}`
            : isRelational
              ? relationalGap(sources)
              : "一页过去，回到现在"}
        </strong>
        <span>
          {lineName
            ? "AI 在线内看见"
            : isRelational
              ? "历史联系 case"
              : "历史回看 case"}
        </span>
      </header>
      <div className="echo-v2-sources">
        {sources.map((entry, index) => (
          <EchoSource
            key={entry.id}
            entry={entry}
            quote={
              record.evidence.find((item) => item.entryId === entry.id)
                ?.quote || "原文证据缺失"
            }
            label={
              isRelational
                ? `过去的一页 ${String.fromCharCode(65 + index)}`
                : "过去留下的一页"
            }
            renderContent={renderContent}
          />
        ))}
      </div>
      <section className="echo-v2-ai" aria-label="AI 的初步理解">
        <strong>AI 暂时看见 · 由你判断</strong>
        <div className="echo-v2-summaries">
          {sources.map((entry) => (
            <p key={entry.id}>
              <span>{displayDate(entry)}</span>
              {record.sourceSummaries.find((item) => item.entryId === entry.id)
                ?.text || "尚未生成浓缩"}
            </p>
          ))}
        </div>
        {!isRelational && (
          <p className="echo-v2-honesty">
            这页只是从符合时间与回响权限的旧记录中受约束地带回；回页不声称它今天必然与你有关。
          </p>
        )}
        <p className="echo-v2-hypothesis">{record.reason}</p>
        {record.question && (
          <p className="echo-v2-question">{record.question}</p>
        )}
      </section>
      {responseEntries.length > 0 && (
        <section className="echo-v2-responses">
          <strong>过去以日记保存的回应</strong>
          {responseEntries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              onClick={() => onOpenEntry(entry.id)}
            >
              {entry.title}
              <span>{displayDate(entry)}</span>
            </button>
          ))}
        </section>
      )}
      {replyOpen && (
        <section className="echo-reply" aria-label="回响回应">
          <label htmlFor={`echo-reply-${record.id}`}>
            {reply ? "你留在这条回响下的话" : "此刻想回应什么？"}
          </label>
          <textarea
            id={`echo-reply-${record.id}`}
            value={replyDraft}
            onChange={(event) => setReplyDraft(event.target.value)}
            placeholder="可以是一句话，也可以慢慢写。"
            rows={Math.min(10, Math.max(3, replyDraft.split("\n").length + 1))}
          />
          <div>
            {reply && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  onDeleteReply(record);
                  setReplyDraft("");
                  setReplyOpen(false);
                }}
              >
                删除回应
              </button>
            )}
            <button
              type="button"
              disabled={!replyDraft.trim()}
              onClick={() => onSaveReply(record, replyDraft)}
            >
              {reply ? "保存修改" : "留下回应"}
            </button>
          </div>
        </section>
      )}
      <section className="echo-v2-end">
        <button
          className="echo-response-action"
          type="button"
          onClick={() => setReplyOpen((open) => !open)}
        >
          {replyOpen ? "先收起回应" : "回一句，或写下此刻"}
        </button>
        <div className="echo-v2-feedback">
          <span>它有没有让你更清楚？可不选</span>
          <div>
            {feedbackLabels.map((item) => (
              <button
                type="button"
                key={item.value}
                className={selectedFeedback === item.value ? "selected" : ""}
                aria-pressed={selectedFeedback === item.value}
                onClick={() => onFeedback(record, item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
