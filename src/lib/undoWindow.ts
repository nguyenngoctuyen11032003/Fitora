// "Hoàn tác" windows: while a toast with an undo action is on screen (it may stay there for
// as long as it is hovered / focused, WCAG 2.2.1), deferred clean-ups that an undo would need
// to reverse (e.g. removing a deleted entry's photo) must wait. The toast opens a window and
// releases it when it goes away; services ask undoWindowOpen() before doing irreversible work.

let open = 0;

/** Opens one undo window; call the returned function (idempotent) when it closes. */
export function openUndoWindow(): () => void {
  open += 1;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open = Math.max(0, open - 1);
  };
}

/** True while at least one undo action is still offered on screen. */
export function undoWindowOpen(): boolean {
  return open > 0;
}
