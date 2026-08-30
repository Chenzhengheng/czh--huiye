import assert from "node:assert/strict";
import test from "node:test";
import {
  HUIYE_PRODUCT_VALUES,
  thoughtLinePromptVersions,
} from "../app/thought-line-context-prompts.ts";
import * as activeThoughtLineModel from "../app/thought-line-context-model.ts";

test("records four independent Prompt modules that begin with Huiye product values", () => {
  assert.deepEqual(
    thoughtLinePromptVersions.map(({ module, version, status }) => ({ module, version, status })),
    [
      { module: "EntryCard", version: "entry-card-v0.1", status: "pending_evaluation" },
      { module: "ThoughtLineContext", version: "thought-line-context-v0.1", status: "pending_evaluation" },
      { module: "ContextMaintenance", version: "context-maintenance-v0.1", status: "pending_evaluation" },
      { module: "RelationJudgment", version: "relation-judgment-v0.1", status: "pending_evaluation" },
    ],
  );
  assert.match(HUIYE_PRODUCT_VALUES, /AI 不替用户建立人生图谱，也不替用户下结论/u);
  assert.match(HUIYE_PRODUCT_VALUES, /显化价值/u);
  for (const record of thoughtLinePromptVersions) {
    assert.equal(record.prompt.startsWith(HUIYE_PRODUCT_VALUES), true, `${record.module} Prompt 必须以产品价值观开头`);
    assert.ok(record.changeSummary);
    assert.ok(record.evaluationMethod);
    assert.ok(record.rollback);
  }

  assert.equal(activeThoughtLineModel.thoughtLinePromptVersions, thoughtLinePromptVersions);
  assert.equal("THOUGHT_LINE_RELATION_NAVIGATION_PROMPT" in activeThoughtLineModel, false);
  assert.equal("THOUGHT_LINE_RELATION_VERIFICATION_PROMPT" in activeThoughtLineModel, false);
});
