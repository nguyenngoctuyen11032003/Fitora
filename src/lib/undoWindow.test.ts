import { describe, expect, it } from 'vitest';
import { openUndoWindow, undoWindowOpen } from './undoWindow';

describe('undo windows', () => {
  it('stays open until every window is released; releasing twice is harmless', () => {
    expect(undoWindowOpen()).toBe(false);
    const a = openUndoWindow();
    const b = openUndoWindow();
    a();
    a();
    expect(undoWindowOpen()).toBe(true);
    b();
    expect(undoWindowOpen()).toBe(false);
  });
});
