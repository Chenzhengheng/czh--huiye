# Editor Scroll Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Huiye writing surfaces keep a stable caret and page position when content crosses fifteen visual lines and the user continues pressing Enter.

**Architecture:** Preserve the shared `LinedMarkdownEditor` and fix the two proven boundaries inside it: rendered-line measurement and collapsed-caret geometry. Lock the behavior at the highest available seam with a real Chromium test against PortfolioMode, while retaining fast pure-model tests for the fifteen/sixteen-line boundary and minimum-distance calculation.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, Node test runner, Playwright Chromium, PowerShell/Windows launch compatibility.

## Global Constraints

- The first 15 rendered visual lines fit without user-visible internal scrolling; the 16th visual line starts internal scrolling.
- Wrapped text counts by rendered visual lines, not paragraph or Enter count.
- Input-triggered caret following is immediate. The diary pool moves only its paper scroller; the writing page also advances the outer page naturally as long-form input continues.
- Once following begins, the caret settles near the 72% lower comfort boundary with about four visible lines below it.
- Manual review scrolling is not overridden until the next input.
- Writing and diary-pool editing keep one shared implementation.
- PortfolioMode browser tests use only fixed redacted demo data and never access `local-data/`.
- Markdown persistence, storage schemas, formatting controls, and responsive redesign are out of scope.

**Approved amendment (2026-08-18):** The original outer-page invariant was too broad. Writing-page input must let the motto leave the viewport naturally and must return to the caret only after input resumes following manual review. Diary-pool editing continues to keep its background page fixed.

---

### Task 1: Add the browser-level regression harness

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/lined-editor-browser.test.mjs`

**Interfaces:**
- Consumes: PortfolioMode at `/portfolio/demo`; existing `data-editor-context` attributes; Vinext CLI.
- Produces: `npm run test:lined-editor-browser`, a self-contained Node test that starts a local server and drives Chromium.

- [x] **Step 1: Declare the real-browser dependency and script**

Add `playwright` as a development dependency and add:

```json
"test:lined-editor-browser": "node --test tests/lined-editor-browser.test.mjs"
```

The test file launches the installed Chromium on non-Windows systems and the installed Edge channel on Windows, starts Vinext on a dedicated loopback port, and always closes browser/server resources.

- [x] **Step 2: Write the failing shared behavior test**

Use literal 15-line and wrapped-line fixtures. For each editor context, drive actual keyboard events and record paper height, editor `scrollTop`, caret geometry, and `window.scrollY`:

```js
async function assertStableLongForm(page, context) {
  const paper = page.locator(`[data-editor-context="${context}"]`);
  const editor = paper.getByRole("textbox");
  const pageY = await page.evaluate(() => window.scrollY);

  await typeRenderedLines(editor, 15);
  assert.equal(await editor.evaluate((node) => getComputedStyle(node).overflowY), "auto");
  assert.equal(await editor.evaluate((node) => node.scrollTop), 0);

  await editor.press("Enter");
  const scrollSequence = await pressEnterAndSample(editor, 3);
  assert.ok(scrollSequence.every((value, index) => index === 0 || value >= scrollSequence[index - 1]));
  assert.equal(await page.evaluate(() => window.scrollY), pageY);
}
```

The write case uses the initial page. The pool case clicks `日记池`, opens the first diary card, and exercises the modal editor. A separate fixture types one long wrapping paragraph and asserts it crosses the same rendered-line boundary.

- [x] **Step 3: Run the browser test and verify RED**

Run:

```powershell
node --test tests/lined-editor-browser.test.mjs
```

Expected: FAIL against current code because 20 rendered lines can remain `overflow-y: hidden`, Enter on an empty line produces an invalid caret rectangle, internal scroll reverses, or outer `scrollY` changes.

---

### Task 2: Correct visual-line and caret-follow behavior

**Files:**
- Modify: `app/lined-editor-model.ts`
- Modify: `app/huiye-app.tsx`
- Modify: `tests/lined-editor-model.test.mjs`

**Interfaces:**
- Consumes: `LINED_EDITOR_LINE_HEIGHT`, `LINED_EDITOR_MAX_LINES`, current Selection/Range, actual paper/editor layout.
- Produces: `linedEditorRows(lineCount)` with a strict visible-scroll boundary; a valid caret anchor for empty blocks; immediate minimum-distance following.

- [x] **Step 1: Add the failing pure boundary test**

Extend the model test with literal expectations:

```js
assert.deepEqual(linedEditorRows(15), {
  rows: 15,
  scrollable: false,
  overflowReady: true,
});
assert.deepEqual(linedEditorRows(16), {
  rows: 15,
  scrollable: true,
  overflowReady: true,
});
```

Run:

```powershell
node --experimental-strip-types --test tests/lined-editor-model.test.mjs
```

Expected: FAIL because the existing model marks line 15 scrollable and has no pre-armed overflow state.

- [x] **Step 2: Implement the strict fifteen/sixteen-line model**

Return three independent facts:

```ts
return {
  rows,
  scrollable: lineCount > LINED_EDITOR_MAX_LINES,
  overflowReady: lineCount >= LINED_EDITOR_MAX_LINES,
};
```

`overflowReady` prevents the browser from escalating the 16th-line default action to the outer page; `scrollable` controls comfort padding and user-visible internal scrolling.

- [x] **Step 3: Measure inside the real paper formatting context**

Append the fixed-position mirror to the paper container, not `document.body`, so it inherits the same custom line-height, parent selectors, font, width, and block spacing:

```ts
const paper = paperRef.current;
if (!paper) return;
paper.appendChild(mirror);
const measuredLines = Math.max(1, Math.ceil(mirror.scrollHeight / WRITE_LINE_HEIGHT));
mirror.remove();
```

Keep the mirror out of flex flow and remove its bottom comfort padding while measuring.

- [x] **Step 4: Resolve empty-line caret geometry before calculating scroll**

Treat a zero-size range at `(0, 0)` as invalid. Resolve its anchor element from `selection.anchorNode`, prefer the nearest block inside the editor, and use that block's rectangle plus the 41px line height:

```ts
const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
const caret = validCaretRect(rangeRect)
  ? rangeRect
  : caretRectFromSelectionAnchor(selection, editor, WRITE_LINE_HEIGHT);
if (!caret) return;
```

Do not insert persistent DOM, change Markdown, or move the selection.

- [x] **Step 5: Make input following immediate and internal-only**

Use `overflowReady` for `overflowY`, use `scrollable` for bottom comfort padding, and remove smooth behavior:

```ts
editor.scrollTo({ top: nextScrollTop, behavior: "auto" });
```

Capture the outer page position before applying the internal correction and preserve it if Chromium's contenteditable default action attempted to move the page during the same input frame.

- [x] **Step 6: Verify GREEN at both seams**

Run:

```powershell
node --experimental-strip-types --test tests/lined-editor-model.test.mjs
node --test tests/lined-editor-browser.test.mjs
```

Expected: both suites PASS; the browser test proves both editor contexts, wrapping, repeated Enter, nondecreasing internal scroll, stable page position, and the four-line comfort zone.

---

### Task 3: Synchronize documentation and run full verification

**Files:**
- Modify: `docs/03_PROJECT_ALIGNMENT.md`
- Modify: `docs/06_TECHNICAL_GUIDE.md`
- Modify: `docs/07_ROADMAP.md`

**Interfaces:**
- Consumes: the verified user-visible behavior from Tasks 1 and 2.
- Produces: product acceptance language, truthful current implementation notes, and a roadmap item that remains complete only with browser coverage.

- [x] **Step 1: Update product acceptance**

Record the agreed contract: rendered visual lines, strict 15/16 boundary, immediate minimum internal following, about four lines below the caret, no automatic outer-page movement, manual-review behavior, and shared write/pool semantics.

- [x] **Step 2: Update current technical behavior**

Replace “平滑跟随” with the implemented immediate behavior. Describe same-context mirror measurement, empty-block caret anchoring, overflow pre-arming at line 15, and the PortfolioMode browser regression seam. Do not describe target behavior until tests prove it.

- [x] **Step 3: Keep roadmap status truthful**

Clarify that the completed editor item includes stable repeated Enter behavior and browser regression coverage. Do not add a domain term or ADR.

- [x] **Step 4: Run full verification**

Run:

```powershell
vinext build
node --experimental-strip-types --test tests/rendered-html.test.mjs tests/local-data-store.test.mjs tests/thought-line-model.test.mjs tests/portfolio-analytics.test.mjs tests/echo-candidate-controller.test.mjs tests/portfolio-dashboard-network.test.mjs tests/lined-editor-model.test.mjs
node --test tests/lined-editor-browser.test.mjs
eslint . --ignore-pattern dist --ignore-pattern .next
git diff --check
```

Result: build, 62 non-browser tests, 3 browser regressions, changed-file lint, and `git diff --check` pass. Repository-wide lint still reports two pre-existing `react-hooks/purity` errors at unchanged `Date.now()` calls plus existing warnings; no browser/server process, debug instrumentation, or private data remains in the diff.

- [x] **Step 5: Review the final diff against Issue #52**

Confirm every user story and testing decision in #52 maps to code, browser assertions, or documentation; confirm out-of-scope areas are unchanged.
