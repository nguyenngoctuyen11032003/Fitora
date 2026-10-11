import { describe, expect, it } from 'vitest';
import type { PhotoPose } from '@/types/db';
import { suggestPose } from './lib';

const ph = (pose: PhotoPose, taken_on: string, created_at = `${taken_on}T08:00:00Z`) => ({ pose, taken_on, created_at });

describe('suggestPose', () => {
  it('defaults to front without history', () => {
    expect(suggestPose([], '2026-10-12')).toBe('front');
  });

  it('follows the most recent pose on a new day', () => {
    expect(suggestPose([ph('front', '2026-10-01'), ph('side', '2026-10-05')], '2026-10-12')).toBe('side');
  });

  it('moves through the usual routine on the same day', () => {
    const hist = [ph('front', '2026-10-05'), ph('side', '2026-10-05', '2026-10-05T08:01:00Z'), ph('back', '2026-10-05', '2026-10-05T08:02:00Z')];
    expect(suggestPose([...hist, ph('front', '2026-10-12')], '2026-10-12')).toBe('side');
    expect(suggestPose([...hist, ph('front', '2026-10-12'), ph('side', '2026-10-12', '2026-10-12T08:01:00Z')], '2026-10-12')).toBe('back');
  });

  it('skips poses the user never shoots, then falls back to an untaken standard pose', () => {
    const hist = [ph('front', '2026-10-05'), ph('back', '2026-10-05', '2026-10-05T08:01:00Z')];
    expect(suggestPose([...hist, ph('front', '2026-10-12')], '2026-10-12')).toBe('back');
    expect(suggestPose([ph('front', '2026-10-12')], '2026-10-12')).toBe('side');
  });

  it("offers 'other' once the three standard poses are done, then the habit pose", () => {
    const day = [ph('front', '2026-10-12'), ph('side', '2026-10-12', '2026-10-12T08:01:00Z'), ph('back', '2026-10-12', '2026-10-12T08:02:00Z')];
    expect(suggestPose(day, '2026-10-12')).toBe('other');
    expect(suggestPose([...day, ph('other', '2026-10-12', '2026-10-12T08:03:00Z')], '2026-10-12')).toBe('other');
  });

  it('suggests for a back-dated photo using that day', () => {
    const hist = [ph('front', '2026-10-01'), ph('side', '2026-10-12')];
    expect(suggestPose(hist, '2026-10-01')).toBe('side');
  });
});
