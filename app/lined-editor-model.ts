export const LINED_EDITOR_LINE_HEIGHT = 41;
export const LINED_EDITOR_MIN_LINES = 6;
export const LINED_EDITOR_MAX_LINES = 15;

export function linedEditorRows(lineCount: number) {
  return {
    rows: Math.min(
      LINED_EDITOR_MAX_LINES,
      Math.max(LINED_EDITOR_MIN_LINES, lineCount + 3),
    ),
    comfortPadding: lineCount > LINED_EDITOR_MAX_LINES,
    overflowReady: lineCount >= LINED_EDITOR_MAX_LINES,
  };
}

export function caretFollowScrollTop({
  currentScrollTop,
  caretTop,
  caretHeight,
  viewport,
  scrollHeight,
}: {
  currentScrollTop: number;
  caretTop: number;
  caretHeight: number;
  viewport: { top: number; height: number };
  scrollHeight: number;
}) {
  const comfortableTop = viewport.top + viewport.height * 0.18;
  const comfortableBottom = viewport.top + viewport.height * 0.72;
  const caretBottom = caretTop + caretHeight;
  let delta = 0;
  if (caretBottom > comfortableBottom) delta = caretBottom - comfortableBottom;
  else if (caretTop < comfortableTop) delta = caretTop - comfortableTop;
  const next = currentScrollTop + delta;
  const maximum = Math.max(0, scrollHeight - viewport.height);
  return Math.max(0, Math.min(maximum, Math.round(next)));
}
