import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceEchoCandidateSearch,
  buildEchoEvaluationInput,
  buildSourceUsageCounts,
  createEchoCandidateSearch,
} from "../build/echo-candidate-controller.mjs";

test("counts only formal and evaluation-only EchoRecord sources", () => {
  const counts = buildSourceUsageCounts([
    { lifecycle: "candidate", sourceEntryIds: [101, 102] },
    { sourceEntryIds: [101, 103] },
    { lifecycle: "evaluation_only", sourceEntryIds: [101, 104] },
    { lifecycle: "invalidated", sourceEntryIds: [101, 105] },
    { lifecycle: "legacy_evaluation", sourceEntryIds: [101] },
  ]);

  assert.deepEqual(counts, {
    101: 3,
    102: 1,
    103: 1,
    104: 1,
  });
});

test("rejects a candidate when one source would be used for the third time", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }, { id: 103 }],
    echoRecords: [
      { lifecycle: "evaluation_only", sourceEntryIds: [101, 201] },
      { lifecycle: "candidate", sourceEntryIds: [101, 202] },
    ],
  });

  const result = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [101, 102],
  });

  assert.equal(result.status, "search_again");
  assert.equal(result.state.attempts, 1);
  assert.deepEqual(result.state.excluded_source_sets.at(-1), [101, 102]);
  assert.deepEqual(result.rejection.sourceReuseSignals, [
    { entryId: 101, sourceUsageCount: 2, candidateUsageCount: 3 },
  ]);
});

test("accepts third use only when every strong-change exception condition passes", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }],
    echoRecords: [
      { lifecycle: "evaluation_only", sourceEntryIds: [101, 201] },
      { lifecycle: "candidate", sourceEntryIds: [101, 202] },
    ],
  });

  const result = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [101, 102],
    sourceReuseExceptions: [
      {
        entryId: 101,
        materialChange: { passed: true, reason: "新的行动结果修正了早期判断。" },
        indispensableSource: { passed: true, reason: "删除早期来源后无法看到修正。" },
        nonRestatement: { passed: true, reason: "结果显化了跨篇变化。" },
      },
    ],
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.candidate.sourceReuseSignals[0].candidateUsageCount, 3);
});

test("builds deterministic Prompt input with usage counts and excluded source sets", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101, title: "早期判断" }, { id: 102, title: "新的反馈" }],
    echoRecords: [
      { lifecycle: "evaluation_only", sourceEntryIds: [101, 201] },
      { lifecycle: "invalidated", sourceEntryIds: [102, 202] },
    ],
  });

  assert.deepEqual(buildEchoEvaluationInput(state), {
    main_thought_line: "line-product",
    entries: [
      { id: 101, title: "早期判断", source_usage_count: 1 },
      { id: 102, title: "新的反馈", source_usage_count: 0 },
    ],
    excluded_source_sets: [[101, 201]],
  });
});

test("rejects an excluded source set before accepting a replacement candidate", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }, { id: 103 }],
    echoRecords: [{ lifecycle: "evaluation_only", sourceEntryIds: [101, 102] }],
  });

  const rejected = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [102, 101],
  });
  assert.equal(rejected.status, "search_again");
  assert.equal(rejected.rejection.stage, "excluded_source_set");

  const accepted = advanceEchoCandidateSearch(rejected.state, {
    decision: "candidate",
    sourceEntryIds: [102, 103],
  });
  assert.equal(accepted.status, "accepted");
  assert.deepEqual(accepted.candidate.sourceEntryIds, [102, 103]);
});

test("keeps the hard gate closed when a strong-change exception is incomplete", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }],
    echoRecords: [
      { lifecycle: "candidate", sourceEntryIds: [101, 201] },
      { lifecycle: "evaluation_only", sourceEntryIds: [101, 202] },
    ],
  });

  const result = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [101, 102],
    sourceReuseExceptions: [
      {
        entryId: 101,
        materialChange: { passed: true, reason: "有新的行动结果。" },
        indispensableSource: { passed: true, reason: "旧来源不可替代。" },
      },
    ],
  });

  assert.equal(result.status, "search_again");
  assert.equal(result.rejection.stage, "source_reuse");
});

test("stops one ThoughtLine after three rejected candidate attempts", () => {
  let state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }],
    echoRecords: [
      { lifecycle: "candidate", sourceEntryIds: [101, 201] },
      { lifecycle: "evaluation_only", sourceEntryIds: [101, 202] },
    ],
  });

  for (const partnerId of [102, 103]) {
    const result = advanceEchoCandidateSearch(state, {
      decision: "candidate",
      sourceEntryIds: [101, partnerId],
    });
    assert.equal(result.status, "search_again");
    state = result.state;
  }

  const exhausted = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [101, 104],
  });
  assert.equal(exhausted.status, "silent");
  assert.equal(exhausted.state.attempts, 3);
});

test("orders accepted source ids by Entry time instead of numeric id", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 900 }, { id: 120 }],
    echoRecords: [],
  });

  const result = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [120, 900],
  });

  assert.equal(result.status, "accepted");
  assert.deepEqual(result.candidate.sourceEntryIds, [900, 120]);
});

test("rejects duplicate source ids as an invalid candidate", () => {
  const state = createEchoCandidateSearch({
    thoughtLineId: "line-product",
    entries: [{ id: 101 }, { id: 102 }],
    echoRecords: [],
  });

  const result = advanceEchoCandidateSearch(state, {
    decision: "candidate",
    sourceEntryIds: [101, 101],
  });

  assert.equal(result.status, "search_again");
  assert.equal(result.rejection.stage, "invalid_candidate");
});
