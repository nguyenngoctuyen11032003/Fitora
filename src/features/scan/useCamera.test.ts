import { describe, expect, it } from 'vitest';
import { constraintLadder, statusForError } from './useCamera';

describe('camera helpers', () => {
  it('prefers the requested facing with a sane resolution, then relaxes', () => {
    const [first, second, last] = constraintLadder('environment');
    expect(first.video).toMatchObject({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 } });
    expect(second.video).toEqual({ facingMode: { ideal: 'environment' } });
    expect(last.video).toBe(true);
    expect(constraintLadder('user')[0].audio).toBe(false);
  });

  it('maps getUserMedia errors to screen states', () => {
    expect(statusForError('NotAllowedError')).toBe('denied');
    expect(statusForError('SecurityError')).toBe('denied');
    expect(statusForError('NotFoundError')).toBe('notfound');
    expect(statusForError('NotReadableError')).toBe('error');
    expect(statusForError(undefined)).toBe('error');
  });
});
