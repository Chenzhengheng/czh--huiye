"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EchoCard, type EchoEntry, type EchoRecordV2 } from "./echo-card";
import PairedRelationExperiment, { type PairedRelationRun } from "./paired-relation-experiment";
import { RELATION_JUDGMENT_PROMPT_VERSION } from "./thought-line-context-prompts";
import type { Entry } from "./huiye-app";

type AgentTraceStep = { step: string; input: unknown; output?: unknown; error?: { name: string; message: string } };
type EvaluationRun = {
  runId: string;
  thoughtLineId: string;
  sourceGenerationId: string;
  promptVersions?: Record<string, string>;
  model?: string;
  evaluatedAt: string;
  decision: "accepted" | "silent" | "failed";
  echoCard?: EchoRecordV2;
  sourceEntries?: EchoEntry[];
  error?: { name: string; message: string };
  agentTrace?: AgentTraceStep[];
  ruleTrace?: unknown[];
};
type EvaluationWorkbench = {
  currentScheme: "C";
  runs: EvaluationRun[];
  historicalExperiments: PairedRelationRun[];
};

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="evaluation-trace-json">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export default function RelationEvaluationRuns({
  entries,
  thoughtLineName,
  renderContent,
}: {
  entries: Entry[];
  thoughtLineName: (thoughtLineId: string) => string;
  renderContent: (content: string) => ReactNode;
}) {
  const [workbench, setWorkbench] = useState<EvaluationWorkbench | null>(null);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/evaluation-workbench", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { workbench?: EvaluationWorkbench; error?: string };
        if (!response.ok || !result.workbench) throw new Error(result.error || "无法读取评测运行");
        if (!cancelled) setWorkbench(result.workbench);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "无法读取评测运行");
      });
    return () => { cancelled = true; };
  }, []);

  const selectedRun = useMemo(() => {
    if (!workbench?.runs.length) return null;
    return workbench.runs.find((run) => run.runId === selectedRunId) ?? workbench.runs[0];
  }, [selectedRunId, workbench]);

  if (error) return <section className="context-empty"><strong>评测运行读取失败</strong><p>{error}</p></section>;
  if (!workbench) return <section className="context-empty"><strong>正在读取评测运行…</strong></section>;

  return (
    <div className="relation-evaluation-runs">
      <section className="paired-relation-experiment">
        <header>
          <div><span>当前方案 · {workbench.currentScheme}</span><h2>RelationJudgment 共享宏观 Context</h2></div>
          <small>{RELATION_JUDGMENT_PROMPT_VERSION}</small>
        </header>
        <p className="paired-relation-context-note">
          候选判断继续携带宏观 Context，用于检查是否遗漏不可省略的中间 Entry；关系和证据仍只由候选原文支持。
        </p>
      </section>

      <section className="evaluation-run-browser">
        <header><span>当前 C 评测运行</span><strong>{workbench.runs.length} 次</strong></header>
        {!workbench.runs.length ? <p>尚无 C 方案运行。</p> : (
          <div className="evaluation-run-layout">
            <nav aria-label="C 方案评测运行">
              {workbench.runs.map((run) => (
                <button key={run.runId} className={selectedRun?.runId === run.runId ? "selected" : ""} onClick={() => setSelectedRunId(run.runId)}>
                  <strong>{run.decision === "accepted" ? "已形成测试回响" : run.decision === "failed" ? "运行失败" : "保持沉默"}</strong>
                  <small>{new Date(run.evaluatedAt).toLocaleString("zh-CN")}</small>
                  <code>{thoughtLineName(run.thoughtLineId)}</code>
                </button>
              ))}
            </nav>
            {selectedRun && (
              <article className="evaluation-run-detail">
                <header>
                  <div><strong>{selectedRun.runId}</strong><small>generation {selectedRun.sourceGenerationId}</small></div>
                  <div><code>{selectedRun.model ?? "模型未记录"}</code><code>{selectedRun.promptVersions?.relationJudgment ?? RELATION_JUDGMENT_PROMPT_VERSION}</code></div>
                </header>
                {selectedRun.echoCard ? (
                  <EchoCard record={selectedRun.echoCard} entries={selectedRun.sourceEntries ?? []} lineNames={[thoughtLineName(selectedRun.thoughtLineId)]} renderContent={renderContent} readOnly sourcesInitiallyOpen={false} />
                ) : selectedRun.decision === "failed" ? (
                  <div className="paired-relation-silent"><strong>运行失败</strong><p>{selectedRun.error?.message ?? "未记录失败原因"}</p></div>
                ) : <div className="paired-relation-silent">本次没有候选通过门槛，评测保持沉默。</div>}
                <section className="evaluation-agent-trace">
                  <header><strong>Agent 完整过程</strong><small>{selectedRun.agentTrace?.length ?? 0} 步</small></header>
                  {(selectedRun.agentTrace ?? []).map((step, index) => (
                    <details key={`${step.step}-${index}`}>
                      <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.step}</strong></summary>
                      <JsonDetails label="输入" value={step.input} />
                      {step.error ? <JsonDetails label="失败" value={step.error} /> : <JsonDetails label="结构化输出" value={step.output} />}
                    </details>
                  ))}
                  {!!selectedRun.ruleTrace?.length && <JsonDetails label="规则门禁与候选顺序" value={selectedRun.ruleTrace} />}
                </section>
              </article>
            )}
          </div>
        )}
      </section>

      <section className="evaluation-history-experiments">
        <header><span>历史实验</span><strong>B/C 配对 · {workbench.historicalExperiments.length} 次</strong></header>
        {workbench.historicalExperiments.map((run) => (
          <PairedRelationExperiment
            key={run.runId}
            run={run}
            entries={entries}
            thoughtLineName={thoughtLineName(run.thoughtLineId)}
            renderContent={renderContent}
          />
        ))}
      </section>
    </div>
  );
}
