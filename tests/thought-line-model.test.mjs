import assert from "node:assert/strict";
import test from "node:test";
import {
  assignEntriesToThoughtLine,
  draftThoughtLineSelection,
  materializeThoughtLineSelections,
  mergeThoughtLines,
  removeEntryFromThoughtLine,
  renameThoughtLine,
  setThoughtLineArchived,
} from "../app/thought-line-model.ts";

const now = "2026-08-08T00:00:00.000Z";

test("materializes selected thought lines only when an Entry is saved", () => {
  const result = materializeThoughtLineSelections([], [draftThoughtLineSelection("回页-产品")], now);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].name, "回页-产品");
  assert.deepEqual(result.lineIds, [result.lines[0].id]);
});

test("reuses an existing thought line and supports multiple memberships", () => {
  const first = materializeThoughtLineSelections([], [draftThoughtLineSelection("回页-产品")], now);
  const second = materializeThoughtLineSelections(first.lines, [first.lineIds[0], draftThoughtLineSelection("创业选择")], now);
  assert.equal(second.lines.length, 2);
  assert.equal(second.lineIds.length, 2);
});

test("assigns and removes the same membership through one model seam", () => {
  const entries = [{ id: 1, thoughtLineIds: [] }, { id: 2, thoughtLineIds: [] }];
  const assigned = assignEntriesToThoughtLine(entries, [1, 2], "line-a");
  assert.deepEqual(assigned.map(entry => entry.thoughtLineIds), [["line-a"], ["line-a"]]);
  const removed = removeEntryFromThoughtLine(assigned, 1, "line-a");
  assert.deepEqual(removed.map(entry => entry.thoughtLineIds), [[], ["line-a"]]);
});

test("renames, archives and conservatively merges thought lines", () => {
  const lines = [
    { id: "line-a", name: "回页产品", status: "active", allowEcho: true, createdAt: now, updatedAt: now },
    { id: "line-b", name: "回页-产品", status: "active", allowEcho: false, createdAt: now, updatedAt: now },
  ];
  const renamed = renameThoughtLine(lines, "line-a", "产品判断", now);
  assert.equal(renamed[0].name, "产品判断");
  assert.equal(setThoughtLineArchived(renamed, "line-a", true, now)[0].status, "archived");

  const merged = mergeThoughtLines(lines, [{ id: 1, thoughtLineIds: ["line-a", "line-b"] }], "line-a", "line-b", now);
  assert.equal(merged.lines.find(line => line.id === "line-a").status, "merged");
  assert.equal(merged.lines.find(line => line.id === "line-b").allowEcho, false);
  assert.deepEqual(merged.entries[0].thoughtLineIds, ["line-b"]);
});
