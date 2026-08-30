import type { ReactNode } from "react";
import { EchoCard, type EchoRecordV2, type EchoRelationType } from "./echo-card";

type NavigationBasis = {
  attentionSignal: string;
  whyTheseEntries: string;
  minimalityBasis: string;
  checkFocus: string;
};

type Assessment = {
  decisionReason: string;
  candidateCompleteness: string;
  indispensableMissingEntryIds: string[];
  contextEffect: string;
};

type EchoDraft = {
  sourceEntryIds: number[];
  evidence: Array<{ entryId: number; quote: string }>;
  sourceSummaries: Array<{ entryId: number; text: string }>;
  relationType: string;
  reason: string;
  question?: string;
  manifestationGain: string;
  explanationRisk: string;
  uncertainty: string;
};

type VariantResult = {
  decision: "accepted" | "silent";
  attempts: Array<{
    step: number;
    candidate: { thoughtLineId: string; entryIds: string[]; navigationBasis: NavigationBasis };
    decision: "output" | "next_candidate";
    assessment: Assessment;
  }>;
  draft: EchoDraft | null;
};

export type PairedRelationRun = {
  runId: string;
  thoughtLineId: string;
  sourceGenerationId: string;
  evaluatedAt: string;
  model: string;
  reasoningEffort: string;
  contextSnapshots: Array<{ thoughtLineId: string; snapshotId: string }>;
  frozenHistoryIdentity: { sha256: string; echoCount: number; caseRecordCount: number };
  promptVersions: { candidateSelection: string; judgmentB: string; judgmentC: string };
  sharedSelection: {
    candidates: Array<{ thoughtLineId: string; entryIds: string[]; navigationBasis: NavigationBasis }>;
  };
  variants: { B: VariantResult; C: VariantResult };
};

type Entry = { id: number; title: string; content: string; createdAt?: string; date?: string };

const completenessLabels: Record<string, string> = {
  sufficient: "候选充分",
  uncertain: "仍不确定",
  missing_indispensable_entry: "缺少不可替代来源",
};

const contextEffectLabels: Record<string, string> = {
  not_provided: "B 未提供 Context",
  no_material_effect: "Context 未改变判断",
  changed_interpretation: "Context 改变了解读",
  revealed_gap: "Context 揭示了来源缺口",
};

function ReadOnlyDraft({ draft, entries, lineName, run, variant, renderContent }: {
  draft: EchoDraft;
  entries: Entry[];
  lineName: string;
  run: PairedRelationRun;
  variant: "B" | "C";
  renderContent: (content: string) => ReactNode;
}) {
  const record: EchoRecordV2 = {
    schemaVersion: 2,
    id: `${run.runId}-${variant}`,
    mode: "relational",
    thoughtLineId: run.thoughtLineId,
    relationType: draft.relationType as EchoRelationType,
    lifecycle: "evaluation_only",
    sourceEntryIds: draft.sourceEntryIds,
    evidence: draft.evidence,
    sourceSummaries: draft.sourceSummaries,
    reason: draft.reason,
    ...(draft.question ? { question: draft.question } : {}),
    discoveredAt: run.evaluatedAt,
    eligibleAfter: run.evaluatedAt,
    ruleVersion: run.promptVersions[variant === "B" ? "judgmentB" : "judgmentC"],
    model: run.model,
    events: [],
  };
  return (
    <section className="paired-relation-draft">
      <strong>只读草稿预览</strong>
      <EchoCard record={record} entries={entries} lineNames={[lineName]} renderContent={renderContent} readOnly />
      <dl>
        <div><dt>显化增量</dt><dd>{draft.manifestationGain}</dd></div>
        <div><dt>解释风险</dt><dd>{draft.explanationRisk}</dd></div>
        <div><dt>不确定性</dt><dd>{draft.uncertainty}</dd></div>
      </dl>
      <div className="paired-relation-sources">
        {draft.sourceEntryIds.map((entryId) => {
          const entry = entries.find((item) => item.id === entryId);
          const evidence = draft.evidence.find((item) => item.entryId === entryId);
          const summary = draft.sourceSummaries.find((item) => item.entryId === entryId);
          return (
            <details key={entryId}>
              <summary>{entry?.title ?? `Entry ${entryId}`}</summary>
              <p>{summary?.text}</p>
              <blockquote>{evidence?.quote}</blockquote>
              {entry && <div>{renderContent(entry.content)}</div>}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function Variant({ name, result, entries, lineName, run, renderContent }: {
  name: "B" | "C";
  result: VariantResult;
  entries: Entry[];
  lineName: string;
  run: PairedRelationRun;
  renderContent: (content: string) => ReactNode;
}) {
  return (
    <article className="paired-relation-variant">
      <header>
        <div><span>方案 {name}</span><strong>{name === "B" ? "增强 navigationBasis" : "共享宏观 Context"}</strong></div>
        <b className={result.decision}>{result.decision === "accepted" ? "形成草稿" : "保持沉默"}</b>
      </header>
      {name === "C" && <p className="paired-relation-context-note">宏观 Context 仅供参考，不能作为事实或证据；原文始终是判断依据。</p>}
      <div className="paired-relation-attempts">
        {result.attempts.map((attempt, index) => (
          <section key={`${attempt.step}-${index}`}>
            <strong>候选 {attempt.step} · {attempt.candidate.entryIds.join(" + ")}</strong>
            <p>{attempt.assessment.decisionReason}</p>
            <div>
              <span>{completenessLabels[attempt.assessment.candidateCompleteness] ?? attempt.assessment.candidateCompleteness}</span>
              <span>{contextEffectLabels[attempt.assessment.contextEffect] ?? attempt.assessment.contextEffect}</span>
              {!!attempt.assessment.indispensableMissingEntryIds.length && (
                <span>缺少 {attempt.assessment.indispensableMissingEntryIds.join("、")}</span>
              )}
            </div>
          </section>
        ))}
      </div>
      {result.draft ? <ReadOnlyDraft draft={result.draft} entries={entries} lineName={lineName} run={run} variant={name} renderContent={renderContent} /> : (
        <div className="paired-relation-silent"><strong>没有形成回响</strong><p>该分支遍历冻结候选后选择保持沉默。</p></div>
      )}
    </article>
  );
}

export default function PairedRelationExperiment({ run, entries, thoughtLineName, renderContent }: {
  run: PairedRelationRun | null;
  entries: Entry[];
  thoughtLineName?: string;
  renderContent: (content: string) => ReactNode;
}) {
  return (
    <section className="paired-relation-experiment">
      <header>
        <div><span>evaluation_only · 独立实验区</span><h2>B/C 单次对照</h2></div>
        {run && <small>{run.model} · {run.reasoningEffort} · {new Date(run.evaluatedAt).toLocaleString("zh-CN")}</small>}
      </header>
      {!run ? <div className="paired-relation-empty">还没有可展示的配对评测结果。</div> : (
        <>
          <div className="paired-relation-identity">
            <span>Snapshot {run.contextSnapshots.map((item) => item.snapshotId).join(" · ")}</span>
            <span>Source {run.sourceGenerationId}</span>
            <span>History {run.frozenHistoryIdentity.sha256.slice(0, 12)} · {run.frozenHistoryIdentity.echoCount} Echo / {run.frozenHistoryIdentity.caseRecordCount} Case</span>
          </div>
          <section className="paired-relation-shared">
            <strong>两分支共享并冻结的候选</strong>
            {run.sharedSelection.candidates.map((candidate, index) => (
              <article key={`${candidate.thoughtLineId}-${index}`}>
                <b>{index + 1}. Entry {candidate.entryIds.join(" + ")}</b>
                <p>{candidate.navigationBasis.attentionSignal}</p>
                <p>{candidate.navigationBasis.whyTheseEntries}</p>
                <small>{candidate.navigationBasis.minimalityBasis} · {candidate.navigationBasis.checkFocus}</small>
              </article>
            ))}
          </section>
          <div className="paired-relation-grid">
            <Variant name="B" result={run.variants.B} entries={entries} lineName={thoughtLineName ?? run.thoughtLineId} run={run} renderContent={renderContent} />
            <Variant name="C" result={run.variants.C} entries={entries} lineName={thoughtLineName ?? run.thoughtLineId} run={run} renderContent={renderContent} />
          </div>
        </>
      )}
    </section>
  );
}
