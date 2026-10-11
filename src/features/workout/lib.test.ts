import { describe, expect, it } from 'vitest';
import { ACTIVITIES, ACTIVITY_BY_KEY, findActivity } from '@/data/activities';
import { WORKOUT_CATEGORIES, type Workout, type WorkoutTemplate } from '@/types/db';
import {
  activityLabel,
  buildTitle,
  canMarkDone,
  hasTemplateNamed,
  nowHHMM,
  distanceForDuration,
  durationForDistance,
  once,
  recentActivityKeys,
  sessionKcal,
  stepsDistanceKm,
  toInsert,
  variantForSpeed,
  dayBurn,
  dayMarks,
  defaultStatus,
  normalizeTime,
  normalizeVi,
  planCopies,
  recentSessions,
  resolveWeight,
  searchActivities,
  sessionsOn,
  stepRatio,
  variantForMet,
  weekDays,
  workoutFromTemplate,
  formatKm,
  isSpeedBased,
  joinDistanceNote,
  paceLabel,
  rankTemplates,
  repeatSession,
  sessionKey,
  splitDistanceNote,
  suggestSessions,
} from './lib';
import { checkDraft, draftFields, draftFrom, draftNotes, modeKey, type WorkoutDraft } from './draft';

const w = (p: Partial<Workout>): Workout => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  user_id: 'u',
  workout_on: '2026-10-05',
  start_time: null,
  category: 'gym',
  activity: 'weight_training',
  title: 'Tập tạ · Vừa',
  met: 3.5,
  duration_min: 45,
  kcal: 200,
  status: 'done',
  template_id: null,
  notes: null,
  created_at: '2026-10-05T01:00:00Z',
  updated_at: '2026-10-05T01:00:00Z',
  ...p,
});

describe('activity catalogue', () => {
  it('has ≥ 40 activities with unique keys and valid METs in every category', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(ACTIVITY_BY_KEY).length).toBe(ACTIVITIES.length);
    for (const a of ACTIVITIES) {
      expect(a.variants.length).toBeGreaterThan(0);
      expect(a.defaultVariant).toBeLessThan(a.variants.length);
      for (const v of a.variants) {
        expect(v.met).toBeGreaterThanOrEqual(1);
        expect(v.met).toBeLessThanOrEqual(25);
      }
      expect(new Set(a.variants.map((v) => v.id)).size).toBe(a.variants.length);
    }
    for (const c of WORKOUT_CATEGORIES) expect(ACTIVITIES.some((a) => a.category === c)).toBe(true);
  });

  it('matches the reference Compendium values', () => {
    expect(variantForMet(findActivity('running'), 8.3)?.label).toBe('8 km/h');
    expect(findActivity('swim_freestyle')?.variants[0].met).toBe(5.8);
    expect(findActivity('yoga_hatha')?.variants[0].met).toBe(2.5);
    expect(findActivity('weight_training')?.variants.map((v) => v.met)).toEqual([3.5, 6.0]);
    expect(findActivity('football')?.variants[0].met).toBe(7.0);
    expect(findActivity('badminton')?.variants[0].met).toBe(5.5);
    expect(variantForMet(findActivity('cycling_road'), 6.8)?.id).toBe('16_19');
  });
});

describe('search', () => {
  it('normalises Vietnamese', () => {
    expect(normalizeVi('  Đạp   Xe ')).toBe('dap xe');
  });
  it('is diacritic-insensitive and uses aliases', () => {
    expect(searchActivities('cau long')[0].key).toBe('badminton');
    expect(searchActivities('bơi').map((a) => a.key)).toContain('swim_freestyle');
    expect(searchActivities('zumba').map((a) => a.key)).toContain('dance');
    expect(searchActivities('chay', 'running').every((a) => a.category === 'running')).toBe(true);
    expect(searchActivities('', 'yoga').length).toBe(ACTIVITIES.filter((a) => a.category === 'yoga').length);
    expect(searchActivities('xyzxyz')).toEqual([]);
  });
  it('ranks name-prefix matches first', () => {
    expect(searchActivities('chạy bộ')[0].key).toBe('running');
  });
});

describe('titles & status', () => {
  it('builds titles', () => {
    const run = findActivity('running')!;
    expect(buildTitle(run, run.variants[1])).toBe('Chạy bộ · 8 km/h');
    const pil = findActivity('pilates')!;
    expect(buildTitle(pil, pil.variants[0])).toBe('Pilates');
  });
  it('defaults status by date', () => {
    expect(defaultStatus('2026-10-10', '2026-10-09')).toBe('planned');
    expect(defaultStatus('2026-10-09', '2026-10-09')).toBe('done');
    expect(defaultStatus('2026-10-01', '2026-10-09')).toBe('done');
  });
  it('resolves weight', () => {
    expect(resolveWeight(70.5, 80)).toEqual({ kg: 70.5, source: 'measured' });
    expect(resolveWeight(null, 80)).toEqual({ kg: 80, source: 'profile' });
    expect(resolveWeight(undefined, null).source).toBe('fallback');
  });
  it('normalises times', () => {
    expect(normalizeTime('07:30:00')).toBe('07:30');
    expect(normalizeTime('7:05')).toBe('07:05');
    expect(normalizeTime('25:00')).toBe('');
    expect(normalizeTime(null)).toBe('');
  });
  it('step ratio', () => {
    expect(stepRatio(4000, 8000)).toBe(0.5);
    expect(stepRatio(4000, 0)).toBe(0);
  });
});

describe('week & day', () => {
  it('lists the 7 days of a week', () => {
    const d = weekDays('2026-10-05');
    expect(d).toHaveLength(7);
    expect(d[0]).toBe('2026-10-05');
    expect(d[6]).toBe('2026-10-11');
  });
  it('marks days', () => {
    const m = dayMarks([w({ status: 'done' }), w({ status: 'planned' }), w({ workout_on: '2026-10-06', status: 'planned' })]);
    expect(m['2026-10-05']).toEqual({ done: 1, planned: 1 });
    expect(m['2026-10-06']).toEqual({ done: 0, planned: 1 });
  });
  it('sorts a day: timed first', () => {
    const list = sessionsOn(
      [
        w({ id: 'a', start_time: null, created_at: '2026-10-05T00:00:00Z' }),
        w({ id: 'b', start_time: '18:00:00' }),
        w({ id: 'c', start_time: '06:30:00' }),
        w({ id: 'd', workout_on: '2026-10-06' }),
      ],
      '2026-10-05',
    );
    expect(list.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('sums burned energy (done + steps), planned separately', () => {
    const b = dayBurn([w({ kcal: 300, duration_min: 40 }), w({ kcal: 150, status: 'planned' }), w({ workout_on: '2026-10-04', kcal: 999 })], '2026-10-05', 7000, 70);
    expect(b.workoutKcal).toBe(300);
    expect(b.stepsKcal).toBe(280);
    expect(b.total).toBe(580);
    expect(b.doneMinutes).toBe(40);
    expect(b.plannedCount).toBe(1);
    expect(b.plannedKcal).toBe(150);
  });
});

describe('templates & copies', () => {
  it('applies a template with recomputed kcal', () => {
    const t: WorkoutTemplate = {
      id: 't1', user_id: 'u', name: 'Chạy sáng', category: 'running', activity: 'running', met: 8.3, duration_min: 30, notes: null,
      created_at: '', updated_at: '',
    };
    const row = workoutFromTemplate(t, '2026-10-09', 'done', 70);
    expect(row).toMatchObject({ workout_on: '2026-10-09', title: 'Chạy sáng', template_id: 't1', status: 'done', kcal: 305 });
  });
  it('copies to next week as planned and skips duplicates', () => {
    const src = [w({ id: '1', start_time: '06:00:00' }), w({ id: '2', title: 'Yoga', activity: 'yoga_hatha', status: 'planned' })];
    const existing = [{ workout_on: '2026-10-12', title: 'tập tạ · vừa', activity: 'weight_training', start_time: '06:00' }];
    const rows = planCopies(src, existing, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workout_on: '2026-10-12', title: 'Yoga', status: 'planned' });
    // the same source twice → only one copy
    expect(planCopies([src[1], src[1]], [], 7)).toHaveLength(1);
  });
  it('dedupes recent sessions', () => {
    const r = recentSessions([
      w({ id: 'a', workout_on: '2026-10-01' }),
      w({ id: 'b', workout_on: '2026-10-03' }),
      w({ id: 'c', workout_on: '2026-10-02', title: 'Yoga', activity: 'yoga_hatha' }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('hardening', () => {
  it('resolves legacy / alias activity keys', () => {
    expect(findActivity('running_8kmh')?.key).toBe('running');
    expect(findActivity('yoga')?.key).toBe('yoga_hatha');
    expect(findActivity('Cầu lông')?.key).toBe('badminton');
    expect(findActivity('Leo cột điện')).toBeUndefined();
    expect(findActivity('')).toBeUndefined();
  });
  it('labels activities without leaking raw keys', () => {
    expect(activityLabel('running_8kmh', 'Chạy bộ 5 km')).toBe('Chạy bộ');
    expect(activityLabel('foo_bar_baz', 'Buổi tự do')).toBe('Buổi tự do');
    expect(activityLabel('Leo cột điện', 'Leo cột')).toBe('Leo cột điện');
  });
  it('searches by category label', () => {
    expect(searchActivities('cardio').map((a) => a.key)).toContain('hiit');
    expect(searchActivities('the thao doi').every((a) => a.category === 'team_sport')).toBe(true);
  });
  it('defaults to planned for a later start time today', () => {
    expect(defaultStatus('2026-10-09', '2026-10-09', '20:00', '08:15')).toBe('planned');
    expect(defaultStatus('2026-10-09', '2026-10-09', '07:00', '08:15')).toBe('done');
    expect(defaultStatus('2026-10-09', '2026-10-09', '', '08:15')).toBe('done');
    expect(defaultStatus('2026-10-08', '2026-10-09', '23:00', '08:15')).toBe('done');
  });
  it('never marks a future session done', () => {
    expect(canMarkDone('2026-10-10', '2026-10-09')).toBe(false);
    expect(canMarkDone('2026-10-09', '2026-10-09')).toBe(true);
  });
  it('formats now as HH:MM', () => {
    expect(nowHHMM(new Date(2026, 9, 9, 7, 5))).toBe('07:05');
  });
  it('copies recompute kcal at current weight and skip past days', () => {
    const src = [w({ id: '1', workout_on: '2026-09-28', met: 8, duration_min: 30, kcal: 999 }), w({ id: '2', workout_on: '2026-10-04', title: 'Yoga', activity: 'yoga_hatha', met: 2.5, duration_min: 60 })];
    const rows = planCopies(src, [], 7, { weightKg: 70, minDate: '2026-10-09' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workout_on: '2026-10-11', kcal: 184, status: 'planned' });
  });
  it('detects duplicate template names', () => {
    expect(hasTemplateNamed([{ name: 'Chạy sáng' }], ' chay  SANG ')).toBe(true);
    expect(hasTemplateNamed([{ name: 'Chạy sáng' }], 'Chạy tối')).toBe(false);
    expect(hasTemplateNamed(undefined, 'x')).toBe(false);
  });
  it('uses MET·3,5·kg/200·min and steps·0,04·kg/70', () => {
    const t: WorkoutTemplate = { id: 't', user_id: 'u', name: 'x', category: 'gym', activity: 'weight_training', met: 5, duration_min: 60, notes: null, created_at: '', updated_at: '' };
    expect(workoutFromTemplate(t, '2026-10-09', 'done', 76.6).kcal).toBe(402);
    expect(dayBurn([], '2026-10-09', 3200, 76.6).stepsKcal).toBe(140);
  });
});

describe('smarter search', () => {
  it('ranks recently logged activities first within a tier', () => {
    const plain = searchActivities('boi').map((a) => a.key);
    const boosted = searchActivities('boi', 'all', undefined, ['swim_butterfly']).map((a) => a.key);
    expect(boosted[0]).toBe('swim_butterfly');
    expect(new Set(boosted)).toEqual(new Set(plain));
  });
  it('ranks an exact alias above loose matches', () => {
    expect(searchActivities('gym')[0].key).toBe('weight_training');
    expect(searchActivities('ĐÁ BÓNG')[0].key).toBe('football');
  });
  it('lists recent catalogue keys newest first, resolving legacy keys', () => {
    const keys = recentActivityKeys([
      w({ activity: 'yoga', workout_on: '2026-10-01' }),
      w({ activity: 'running_8kmh', workout_on: '2026-10-03' }),
      w({ activity: 'Leo cột', workout_on: '2026-10-04' }),
      w({ activity: 'running', workout_on: '2026-10-02' }),
    ]);
    expect(keys).toEqual(['running', 'yoga_hatha']);
  });
});

describe('distance & speed', () => {
  it('speed-based variants carry km/h', () => {
    expect(findActivity('running')!.variants.every((v) => v.kmh)).toBe(true);
    expect(findActivity('walking')!.variants.every((v) => v.kmh)).toBe(true);
    expect(findActivity('cycling_road')!.variants.every((v) => v.kmh)).toBe(true);
    expect(findActivity('yoga_hatha')!.variants[0].kmh).toBeUndefined();
  });
  it('picks the intensity closest to the pace', () => {
    const run = findActivity('running');
    expect(variantForSpeed(run, 10)?.met).toBe(9.8); // 5 km in 30 min
    expect(variantForSpeed(run, 30)?.met).toBe(14.5); // clamps to the fastest
    expect(variantForSpeed(findActivity('yoga_hatha'), 5)).toBeUndefined();
    expect(variantForSpeed(run, 0)).toBeUndefined();
  });
  it('converts distance ↔ duration', () => {
    expect(durationForDistance(5, 10)).toBe(30);
    expect(durationForDistance(0.05, 16)).toBe(1);
    expect(durationForDistance(null, 10)).toBeNull();
    expect(distanceForDuration(45, 8)).toBe(6);
    expect(distanceForDuration(30, undefined)).toBeNull();
  });
  it('estimates step distance from height', () => {
    expect(stepsDistanceKm(10000, 170, 'male')).toBe(7.1);
    expect(stepsDistanceKm(10000, 160, 'female')).toBe(6.6);
    expect(stepsDistanceKm(10000)).toBe(7);
    expect(stepsDistanceKm(0, 170)).toBe(0);
  });
});

describe('kcal & weight', () => {
  it('recomputes kcal unless the session is untouched', () => {
    const ex = w({ met: 8, duration_min: 30, kcal: 250, status: 'done' });
    expect(sessionKcal({ met: 8, duration_min: 30, status: 'done' }, 70, ex)).toBe(250);
    expect(sessionKcal({ met: 8, duration_min: 40, status: 'done' }, 70, ex)).toBe(392);
    // finishing a planned session uses today's weight, like the row toggle
    expect(sessionKcal({ met: 8, duration_min: 30, status: 'done' }, 70, { ...ex, status: 'planned' })).toBe(294);
    expect(sessionKcal({ met: null, duration_min: 30, status: 'done' }, 70)).toBe(0);
  });
  it('MET kcal equals MET × kg × hours × 1,05', () => {
    expect(sessionKcal({ met: 6, duration_min: 60, status: 'done' }, 80)).toBe(Math.round(6 * 80 * 1 * 1.05));
  });
  it('accepts string weights and ignores implausible ones', () => {
    expect(resolveWeight('72.4' as unknown as number, null)).toEqual({ kg: 72.4, source: 'measured' });
    expect(resolveWeight(7, 68)).toEqual({ kg: 68, source: 'profile' });
    expect(resolveWeight(0, 900).source).toBe('fallback');
    // bounds match the body feature's weight range (25–300 kg)
    expect(resolveWeight(320, 70)).toEqual({ kg: 70, source: 'profile' });
    expect(resolveWeight(24, null).source).toBe('fallback');
    expect(resolveWeight(25, null)).toEqual({ kg: 25, source: 'measured' });
  });
});

describe('draft', () => {
  const base = (p: Partial<WorkoutDraft> = {}): WorkoutDraft => ({ ...draftFrom({ kind: 'new', date: '2026-10-09' }, '2026-10-09'), activity: 'running', title: 'Chạy bộ', met: 8.3, ...p });
  it('starts a new draft for the day with an inferred status', () => {
    expect(draftFrom({ kind: 'new', date: '2026-10-12' }, '2026-10-09')).toMatchObject({ status: 'planned', duration_min: 30, activity: '' });
    expect(draftFrom({ kind: 'edit', workout: w({ activity: 'running_8kmh', start_time: '06:30:00' }) }, '2026-10-09')).toMatchObject({ activity: 'running', start_time: '06:30' });
  });
  it('validates fields', () => {
    expect(checkDraft(base(), '2026-10-09').valid).toBe(true);
    expect(checkDraft(base({ met: 0.5 }), '2026-10-09').met).toBe(false);
    expect(checkDraft(base({ duration_min: 12.5 }), '2026-10-09').duration).toBe(false);
    expect(checkDraft(base({ title: '   ' }), '2026-10-09').valid).toBe(false);
    const future = checkDraft(base({ workout_on: '2026-10-10', status: 'done' }), '2026-10-09');
    expect(future.status).toBe(false);
    expect(future.templateValid).toBe(true);
  });
  it('maps a draft to DB fields', () => {
    expect(draftFields({ ...base({ title: '  Chạy  ', notes: '  ', start_time: '' }), kcal: 300 })).toMatchObject({ title: 'Chạy', notes: null, start_time: null, kcal: 300 });
  });
  it('modeKey identifies the sheet target (draft kept only for the same target)', () => {
    // same new day → same key; another day or a preset → different key
    expect(modeKey({ kind: 'new', date: '2026-10-09' })).toBe(modeKey({ kind: 'new', date: '2026-10-09' }));
    expect(modeKey({ kind: 'new', date: '2026-10-09' })).not.toBe(modeKey({ kind: 'new', date: '2026-10-10' }));
    expect(modeKey({ kind: 'new', date: '2026-10-09' })).not.toBe(modeKey({ kind: 'new', date: '2026-10-09', preset: { activity: 'running', title: 'Chạy bộ' } }));
    expect(modeKey({ kind: 'new', date: '2026-10-09', preset: { activity: 'running', title: 'Chạy bộ' } })).toBe(
      modeKey({ kind: 'new', date: '2026-10-09', preset: { activity: 'running', title: 'Chạy bộ' } }),
    );
    // same row and version → same key; a changed row (updated_at) → new key, no stale restore
    const row = w({ id: 'x', updated_at: '2026-10-05T01:00:00Z' });
    expect(modeKey({ kind: 'edit', workout: row })).toBe(modeKey({ kind: 'edit', workout: { ...row } }));
    expect(modeKey({ kind: 'edit', workout: row })).not.toBe(modeKey({ kind: 'edit', workout: { ...row, updated_at: '2026-10-06T01:00:00Z' } }));
    expect(modeKey({ kind: 'edit', workout: row })).not.toBe(modeKey({ kind: 'new', date: '2026-10-05' }));
  });
});

describe('undo helpers', () => {
  it('recreates a deleted row without ids/timestamps', () => {
    const ins = toInsert(w({ id: 'x', met: '8.3' as unknown as number }));
    expect(ins).not.toHaveProperty('id');
    expect(ins).not.toHaveProperty('created_at');
    expect(ins.met).toBe(8.3);
  });
  it('runs undo once', () => {
    let n = 0;
    const f = once(() => n++);
    f();
    f();
    expect(n).toBe(1);
  });
});

describe('distance remembered in notes', () => {
  it('round-trips the distance line and keeps the user text', () => {
    const n = joinDistanceNote(5.24, '  Chạy ven hồ ');
    expect(n).toBe('Quãng đường 5,2 km\nChạy ven hồ');
    expect(splitDistanceNote(n)).toEqual({ km: 5.2, rest: 'Chạy ven hồ' });
    expect(splitDistanceNote('Quãng đường 10 km')).toEqual({ km: 10, rest: '' });
    expect(splitDistanceNote('quãng đường: 3.5 km\nok')).toEqual({ km: 3.5, rest: 'ok' });
  });
  it('ignores notes without the marker and empty input', () => {
    expect(splitDistanceNote('Chạy 5 km rất mệt')).toEqual({ km: null, rest: 'Chạy 5 km rất mệt' });
    expect(splitDistanceNote(null)).toEqual({ km: null, rest: '' });
    expect(joinDistanceNote(null, '  ')).toBeNull();
    expect(joinDistanceNote(0, 'x')).toBe('x');
    expect(joinDistanceNote(3, '')).toBe('Quãng đường 3 km');
  });
  it('caps stored notes at the DB limit', () => {
    expect(joinDistanceNote(5, 'a'.repeat(2000))!.length).toBe(1000);
  });
  it('formats km and pace', () => {
    expect(formatKm(5)).toBe('5');
    expect(formatKm(5.25)).toBe('5,3');
    expect(paceLabel(5, 30)).toBe('6:00/km');
    expect(paceLabel(10, 52.5)).toBe('5:15/km');
    expect(paceLabel(0, 30)).toBe('');
  });
  it('only speed-based activities store a distance', () => {
    expect(isSpeedBased('running')).toBe(true);
    expect(isSpeedBased('running_8kmh')).toBe(true);
    expect(isSpeedBased('walking')).toBe(true);
    expect(isSpeedBased('cycling_road')).toBe(true);
    expect(isSpeedBased('yoga_hatha')).toBe(false);
    expect(isSpeedBased('Đá cầu lông gà')).toBe(false);
    expect(draftNotes({ activity: 'running', notes: 'x', distance_km: 5 })).toBe('Quãng đường 5 km\nx');
    expect(draftNotes({ activity: 'yoga_hatha', notes: 'x', distance_km: 5 })).toBe('x');
  });
  it('the draft splits distance out of stored notes and joins it back on save', () => {
    const d = draftFrom({ kind: 'edit', workout: w({ activity: 'running', notes: 'Quãng đường 7,5 km\nTempo' }) }, '2026-10-09');
    expect(d).toMatchObject({ distance_km: 7.5, notes: 'Tempo' });
    expect(draftFields({ ...d, kcal: 1 }).notes).toBe('Quãng đường 7,5 km\nTempo');
    expect(draftFields({ ...d, distance_km: null, kcal: 1 }).notes).toBe('Tempo');
    // preset notes (template / recent) carry their distance too
    expect(draftFrom({ kind: 'new', date: '2026-10-09', preset: { activity: 'running', notes: 'Quãng đường 5 km' } }, '2026-10-09')).toMatchObject({ distance_km: 5, notes: '' });
  });
});

describe('habits & suggestions', () => {
  // 2026-10-12 is a Monday.
  const mon = '2026-10-12';
  const lift = (on: string, p: Partial<Workout> = {}) => w({ workout_on: on, activity: 'weight_training', title: 'Đẩy ngực', start_time: '18:00:00', created_at: `${on}T11:00:00Z`, ...p });
  const run = (on: string, p: Partial<Workout> = {}) => w({ workout_on: on, activity: 'running_8kmh', category: 'running', title: 'Chạy bộ 5 km', met: 8.3, duration_min: 35, created_at: `${on}T00:00:00Z`, ...p });

  it('suggests what was done on the same weekday, most frequent first', () => {
    const hist = [lift('2026-10-05'), lift('2026-09-28'), lift('2026-09-21'), run('2026-09-28'), run('2026-09-21'), run('2026-10-07')];
    const s = suggestSessions(hist, mon, []);
    expect(s.map((x) => [x.source.title, x.count, x.reason])).toEqual([
      ['Đẩy ngực', 3, 'weekday'],
      ['Chạy bộ 5 km', 2, 'weekday'],
    ]);
    // copies the most recent instance
    expect(s[0].source.workout_on).toBe('2026-10-05');
  });
  it('a single occurrence counts only when it was exactly last week', () => {
    expect(suggestSessions([lift('2026-10-05')], mon, []).map((x) => x.count)).toEqual([1]);
    expect(suggestSessions([lift('2026-09-28'), run('2026-10-10')], mon, []).map((x) => x.reason)).toEqual(['last']);
  });
  it('skips planned rows, the future, other weekdays and sessions already on the day (legacy keys too)', () => {
    const hist = [lift('2026-10-05', { status: 'planned' }), lift('2026-09-28', { status: 'planned' }), lift('2026-10-19'), run('2026-10-06')];
    expect(suggestSessions(hist, mon, []).map((x) => x.reason)).toEqual(['last']);
    const runs = [run('2026-10-05'), run('2026-09-28')];
    expect(suggestSessions(runs, mon, [{ activity: 'running', title: 'chạy bộ 5 KM' }])).toEqual([]);
  });
  it('ignores sessions older than the look-back window', () => {
    expect(suggestSessions([lift('2026-08-10'), lift('2026-08-03')], mon, [], { weeks: 8 }).map((x) => x.reason)).toEqual(['last']);
  });
  it('offers the last session only when the day is empty', () => {
    expect(suggestSessions([run('2026-10-10')], mon, [{ activity: 'yoga_hatha', title: 'Yoga' }])).toEqual([]);
    expect(suggestSessions([], mon, [])).toEqual([]);
  });
  it('limits the list', () => {
    const hist = ['a', 'b', 'c', 'd'].map((t) => lift('2026-10-05', { title: t, id: t }));
    expect(suggestSessions(hist, mon, [], { limit: 2 })).toHaveLength(2);
  });
  it('sessionKey folds legacy keys, case and diacritics', () => {
    expect(sessionKey({ activity: 'running_8kmh', title: 'Chạy Bộ' })).toBe(sessionKey({ activity: 'running', title: 'chay bo' }));
  });
  it('repeatSession resolves the key, recomputes kcal and copies the rest', () => {
    const src = run('2026-10-05', { start_time: '06:00:00', notes: 'Quãng đường 5 km', kcal: 999 });
    const r = repeatSession(src, mon, 'done', 70);
    expect(r).toMatchObject({ workout_on: mon, activity: 'running', status: 'done', start_time: '06:00:00', notes: 'Quãng đường 5 km', duration_min: 35 });
    expect(r.kcal).toBe(Math.round((8.3 * 3.5 * 70) / 200 * 35));
  });
});

describe('template ranking', () => {
  const t = (id: string, name: string): WorkoutTemplate => ({ id, user_id: 'u', name, category: 'gym', activity: 'weight_training', met: 5, duration_min: 60, notes: null, created_at: '', updated_at: '' });
  it('puts the most recently used templates first, the rest by name', () => {
    const list = [t('a', 'Bụng'), t('b', 'Chân'), t('c', 'Ạ tay'), t('d', 'Lưng')];
    const hist = [w({ template_id: 'b', workout_on: '2026-10-01' }), w({ template_id: 'd', workout_on: '2026-10-08' }), w({ template_id: 'b', workout_on: '2026-09-01' })];
    expect(rankTemplates(list, hist).map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});
