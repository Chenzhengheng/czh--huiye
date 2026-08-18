const COUNTED_LIFECYCLES = new Set([undefined, "candidate", "evaluation_only"]);

export function buildSourceUsageCounts(records) {
  const counts = {};
  for (const record of records) {
    if (!COUNTED_LIFECYCLES.has(record.lifecycle)) continue;
    for (const entryId of new Set(record.sourceEntryIds)) {
      counts[entryId] = (counts[entryId] || 0) + 1;
    }
  }
  return counts;
}

function canonicalSourceSet(sourceEntryIds) {
  return [...new Set(sourceEntryIds)].sort((left, right) => left - right);
}

function sourceSetKey(sourceEntryIds) {
  return canonicalSourceSet(sourceEntryIds).join(",");
}

function appendExcludedSourceSet(excludedSourceSets, sourceEntryIds) {
  const key = sourceSetKey(sourceEntryIds);
  if (excludedSourceSets.some((set) => sourceSetKey(set) === key)) return excludedSourceSets;
  return [...excludedSourceSets, canonicalSourceSet(sourceEntryIds)];
}

function conditionPasses(condition) {
  return condition?.passed === true && typeof condition.reason === "string" && Boolean(condition.reason.trim());
}

function hasCompleteSourceReuseExceptions(signals, exceptions) {
  if (!Array.isArray(exceptions)) return false;
  return signals.every((signal) => {
    const exception = exceptions.find((item) => item?.entryId === signal.entryId);
    return (
      conditionPasses(exception?.materialChange) &&
      conditionPasses(exception?.indispensableSource) &&
      conditionPasses(exception?.nonRestatement)
    );
  });
}

function sourceReuseSignals(sourceUsageCounts, sourceEntryIds) {
  return canonicalSourceSet(sourceEntryIds)
    .map((entryId) => ({
      entryId,
      sourceUsageCount: sourceUsageCounts[entryId] || 0,
      candidateUsageCount: (sourceUsageCounts[entryId] || 0) + 1,
    }))
    .filter((signal) => signal.candidateUsageCount >= 3);
}

export function evaluateEchoCandidateSourceReuse({
  echoRecords,
  sourceEntryIds,
  sourceReuseExceptions,
}) {
  const signals = sourceReuseSignals(buildSourceUsageCounts(echoRecords), sourceEntryIds);
  return {
    allowed: !signals.length || hasCompleteSourceReuseExceptions(signals, sourceReuseExceptions),
    sourceReuseSignals: signals,
  };
}

export function createEchoCandidateSearch({
  thoughtLineId,
  entries,
  echoRecords,
  maxAttempts = 3,
}) {
  return {
    thoughtLineId,
    entries: structuredClone(entries),
    sourceUsageCounts: buildSourceUsageCounts(echoRecords),
    excluded_source_sets: echoRecords
      .filter((record) => record.lifecycle !== "invalidated")
      .map((record) => canonicalSourceSet(record.sourceEntryIds)),
    attempts: 0,
    maxAttempts,
    status: "searching",
  };
}

export function buildEchoEvaluationInput(state) {
  return {
    main_thought_line: state.thoughtLineId,
    entries: state.entries.map((entry) => ({
      ...structuredClone(entry),
      source_usage_count: state.sourceUsageCounts[entry.id] || 0,
    })),
    excluded_source_sets: structuredClone(state.excluded_source_sets),
  };
}

function rejectCandidate(state, sourceEntryIds, rejection) {
  const attempts = state.attempts + 1;
  const nextState = {
    ...state,
    attempts,
    status: attempts >= state.maxAttempts ? "silent" : "searching",
    excluded_source_sets: appendExcludedSourceSet(state.excluded_source_sets, sourceEntryIds),
  };
  return {
    status: nextState.status === "silent" ? "silent" : "search_again",
    state: nextState,
    rejection,
  };
}

export function advanceEchoCandidateSearch(state, semanticOutput) {
  if (state.status !== "searching") throw new Error("候选搜索已经结束");
  if (semanticOutput?.decision === "silent") {
    return {
      status: "silent",
      state: { ...state, attempts: state.attempts + 1, status: "silent" },
    };
  }
  if (semanticOutput?.decision !== "candidate" || !Array.isArray(semanticOutput.sourceEntryIds)) {
    throw new Error("LLM 输出必须是 candidate 或 silent");
  }

  const proposedSourceEntryIds = semanticOutput.sourceEntryIds;
  const proposedSourceEntryIdSet = new Set(proposedSourceEntryIds);
  const allowedEntryIds = new Set(state.entries.map((entry) => entry.id));
  if (
    proposedSourceEntryIds.length < 2 ||
    proposedSourceEntryIdSet.size !== proposedSourceEntryIds.length ||
    proposedSourceEntryIds.some((entryId) => !allowedEntryIds.has(entryId))
  ) {
    return rejectCandidate(state, proposedSourceEntryIds, {
      stage: "invalid_candidate",
      reason: "候选必须引用主思考线内至少两篇合格 Entry。",
    });
  }
  const sourceEntryIds = state.entries
    .map((entry) => entry.id)
    .filter((entryId) => proposedSourceEntryIdSet.has(entryId));

  if (state.excluded_source_sets.some((set) => sourceSetKey(set) === sourceSetKey(sourceEntryIds))) {
    return rejectCandidate(state, sourceEntryIds, {
      stage: "excluded_source_set",
      reason: "候选来源组合已经使用或在本轮被拒绝。",
    });
  }

  const candidateSourceReuseSignals = sourceReuseSignals(state.sourceUsageCounts, sourceEntryIds);

  if (
    candidateSourceReuseSignals.length &&
    !hasCompleteSourceReuseExceptions(candidateSourceReuseSignals, semanticOutput.sourceReuseExceptions)
  ) {
    return rejectCandidate(state, sourceEntryIds, {
      stage: "source_reuse",
      reason: "候选中的 Entry 本次将达到第三次作为回响来源。",
      sourceReuseSignals: candidateSourceReuseSignals,
    });
  }

  return {
    status: "accepted",
    state: { ...state, attempts: state.attempts + 1, status: "accepted" },
    candidate: { ...semanticOutput, sourceEntryIds, sourceReuseSignals: candidateSourceReuseSignals },
  };
}
