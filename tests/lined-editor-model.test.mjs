import assert from "node:assert/strict";
import test from "node:test";

import {
  caretFollowScrollTop,
  linedEditorRows,
} from "../app/lined-editor-model.ts";

test("the paper grows to fifteen lines and then scrolls internally", () => {
  assert.deepEqual(linedEditorRows(0), { rows: 6, scrollable: false });
  assert.deepEqual(linedEditorRows(9), { rows: 12, scrollable: false });
  assert.deepEqual(linedEditorRows(16), { rows: 15, scrollable: true });
});

test("typing follows the caret by the minimum distance instead of recentering it", () => {
  const viewport = { top: 100, height: 600 };

  assert.equal(
    caretFollowScrollTop({
      currentScrollTop: 0,
      caretTop: 560,
      caretHeight: 41,
      viewport,
      scrollHeight: 1200,
    }),
    69,
  );
  assert.equal(
    caretFollowScrollTop({
      currentScrollTop: 0,
      caretTop: 240,
      caretHeight: 41,
      viewport,
      scrollHeight: 1200,
    }),
    0,
  );
  assert.equal(
    caretFollowScrollTop({
      currentScrollTop: 200,
      caretTop: 175,
      caretHeight: 41,
      viewport,
      scrollHeight: 1200,
    }),
    167,
  );
});
