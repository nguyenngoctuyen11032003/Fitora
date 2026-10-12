import { describe, expect, it } from 'vitest';
import { parseListTab, templateDuplicates } from './lib';

describe('parseListTab (?tab= deep links)', () => {
  it('maps tab ids and aliases', () => {
    expect(parseListTab('mine')).toBe('mine');
    expect(parseListTab('saved')).toBe('mine');
    expect(parseListTab('templates')).toBe('mine');
    expect(parseListTab('popular')).toBe('popular');
    expect(parseListTab('suggest')).toBe('suggest');
    expect(parseListTab('recent')).toBe('suggest');
    expect(parseListTab(' MINE ')).toBe('mine');
  });
  it('returns null for missing / unknown values', () => {
    expect(parseListTab(null)).toBeNull();
    expect(parseListTab(undefined)).toBeNull();
    expect(parseListTab('')).toBeNull();
    expect(parseListTab('foo')).toBeNull();
  });
});

describe('templateDuplicates', () => {
  const entries = [
    { name: 'Cơm gà xối mỡ', meal: 'lunch' as const },
    { name: 'Trà đá', meal: 'lunch' as const },
    { name: 'Phở bò', meal: 'breakfast' as const },
  ];
  it('finds items already logged in the same meal, ignoring accents and case', () => {
    const items = [{ name: 'com ga xoi mo' }, { name: 'Canh chua' }, { name: 'TRÀ ĐÁ' }];
    expect(templateDuplicates(items, entries, 'lunch')).toEqual(['com ga xoi mo', 'TRÀ ĐÁ']);
  });
  it('ignores other meals', () => {
    expect(templateDuplicates([{ name: 'Phở bò' }], entries, 'lunch')).toEqual([]);
    expect(templateDuplicates([{ name: 'Phở bò' }], entries, 'breakfast')).toEqual(['Phở bò']);
  });
  it('does not repeat a name listed twice in the template, and skips blank names', () => {
    expect(templateDuplicates([{ name: 'Trà đá' }, { name: 'tra da' }, { name: '' }], entries, 'lunch')).toEqual(['Trà đá']);
  });
  it('empty day → no duplicates', () => {
    expect(templateDuplicates([{ name: 'Trà đá' }], [], 'lunch')).toEqual([]);
  });
});
