import { describe, expect, it } from 'vitest';
import { memorySummary, namesHint } from './lib';

const food = (name: string, source: 'manual' | 'ai' | 'meal', use_count: number) => ({ name, source, use_count });

describe('memorySummary', () => {
  it('handles empty / missing lists', () => {
    expect(memorySummary(undefined, null)).toEqual({
      foodCount: 0,
      aiCount: 0,
      reuses: 0,
      topFoods: [],
      templateCount: 0,
      topTemplates: [],
    });
  });

  it('counts foods, AI-scanned dishes, templates and total re-uses', () => {
    const s = memorySummary(
      [food('Sữa chua', 'manual', 7), food('Bún bò Huế', 'ai', 3), food('Cơm tấm', 'ai', 0), food('Bánh mì', 'meal', 1)],
      [{ name: 'Sáng quen thuộc', use_count: 2 }],
    );
    expect(s.foodCount).toBe(4);
    expect(s.aiCount).toBe(2);
    expect(s.templateCount).toBe(1);
    // manual 7 + ai (3-1) + ai 0 + meal (1-1) + template 2
    expect(s.reuses).toBe(11);
    expect(s.topFoods).toEqual(['Sữa chua', 'Bún bò Huế', 'Cơm tấm']);
    expect(s.topTemplates).toEqual(['Sáng quen thuộc']);
  });

  it('does not count the scan / "Lưu món này" that created a saved food as a re-log', () => {
    const s = memorySummary([food('Phở', 'ai', 1), food('Bún', 'ai', 1), food('Bánh mì', 'meal', 1)], []);
    expect(s.reuses).toBe(0);
    expect(memorySummary([food('Phở', 'ai', 3)], []).reuses).toBe(2);
  });

  it('keeps service order, skips blank and duplicate names, honours top', () => {
    const s = memorySummary([food(' Phở ', 'ai', 1), food('phở', 'manual', 9), food('', 'manual', 0), food('Xôi', 'manual', 0)], [], 2);
    expect(s.topFoods).toEqual(['Phở', 'Xôi']);
  });

  it('ignores bad use_count values (string numerics from PostgREST are accepted)', () => {
    const s = memorySummary([{ name: 'A', source: 'manual', use_count: '4' as unknown as number }, { name: 'B', source: 'manual', use_count: -2 }], [
      { name: 'T', use_count: NaN },
    ]);
    expect(s.reuses).toBe(4);
  });
});

describe('namesHint', () => {
  it('joins names and shows the remainder', () => {
    expect(namesHint([], 0)).toBe('');
    expect(namesHint(['A', 'B'], 2)).toBe('A, B');
    expect(namesHint(['A', 'B', 'C'], 7)).toBe('A, B, C +4');
  });
});
