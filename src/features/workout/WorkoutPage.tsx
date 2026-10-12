import { CalendarPlus, Dumbbell, Flame, Footprints, Plus, Repeat, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Page } from '@/components/shell/Page';
import { BigNumber } from '@/components/ui/BigNumber';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/context/ProfileContext';
import { addDays, endOfWeek, formatDayVi, startOfWeek, todayISO } from '@/lib/date';
import { metKcal } from '@/lib/energy';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatKg, formatMinutes, formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { latestWeight } from '@/services/body';
import { getDailyLog, setSteps } from '@/services/daily';
import { addWorkout, createTemplate, deleteTemplate, deleteWorkout, listTemplates, listWorkouts, updateWorkout } from '@/services/workouts';
import type { Workout, WorkoutPatch, WorkoutTemplate } from '@/types/db';
import { draftFields, draftNotes } from './draft';
import {
  canMarkDone,
  dayBurn,
  dayMarks,
  defaultStatus,
  hasTemplateNamed,
  once,
  nowHHMM,
  planCopies,
  rankTemplates,
  recentSessions,
  repeatSession,
  resolveWeight,
  sessionsOn,
  suggestSessions,
  toInsert,
  toPatch,
  weekDays,
  weekRangeLabel,
  workoutFromTemplate,
} from './lib';
import { RepeatSheet } from './RepeatSheet';
import { SessionRow } from './SessionRow';
import { StepsCard } from './StepsCard';
import { SuggestionsCard } from './SuggestionsCard';
import { TemplatesCard } from './TemplatesCard';
import { WeekStrip } from './WeekStrip';
import { WorkoutSheet, type SheetMode, type WorkoutDraft } from './WorkoutSheet';

const HISTORY_DAYS = 56;

const byDayTime = (a: Workout, b: Workout) =>
  a.workout_on.localeCompare(b.workout_on) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.created_at.localeCompare(b.created_at);

export default function WorkoutPage() {
  const toast = useToast();
  const { fit } = useProfile();
  const today = todayISO();
  const [selected, setSelected] = useState(today);
  const weekStart = startOfWeek(selected);
  const weekEnd = endOfWeek(selected);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  // ---- data -------------------------------------------------------------
  const week = useAsync(async () => ({ from: weekStart, rows: await listWorkouts(weekStart, weekEnd) }), [weekStart, weekEnd]);
  // 8 weeks of history: quick re-log, weekday habits and template ranking.
  const recentQ = useAsync(() => listWorkouts(addDays(today, -HISTORY_DAYS), today), [today]);
  const tpl = useAsync(() => listTemplates(), []);
  const daily = useAsync(() => getDailyLog(selected), [selected]);
  const weightQ = useAsync(() => latestWeight(), []);

  // Surface load errors once each (week has an inline retry as well).
  const loadError = week.error ?? tpl.error ?? daily.error ?? recentQ.error;
  useEffect(() => {
    if (loadError) toast.error(loadError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  // A new weigh-in elsewhere (Cơ thể) changes the kcal maths here.
  const reloadWeight = weightQ.reload;
  useEffect(() => onDataChanged((kind) => (kind === 'body' || kind === 'any' ? void reloadWeight() : undefined)), [reloadWeight]);

  const weightKgRaw = weightQ.data?.weight_kg;
  const weight = useMemo(() => resolveWeight(weightKgRaw, fit?.start_weight_kg), [weightKgRaw, fit?.start_weight_kg]);
  const weightNote =
    weight.source === 'measured'
      ? `Tính theo cân nặng gần nhất ${formatKg(weight.kg)}.`
      : weight.source === 'profile'
        ? `Tính theo cân nặng ban đầu ${formatKg(weight.kg)} — cập nhật ở mục Cơ thể để chính xác hơn.`
        : `Chưa có cân nặng — tạm tính theo ${formatKg(weight.kg)}.`;
  const stepTarget = fit?.step_target ?? 8000;

  const fresh = week.data?.from === weekStart;
  const workouts = useMemo(() => (week.data?.from === weekStart ? week.data.rows : []), [week.data, weekStart]);
  const marks = useMemo(() => dayMarks(workouts), [workouts]);
  const sessions = useMemo(() => sessionsOn(workouts, selected), [workouts, selected]);
  const steps = daily.data?.log_date === selected ? daily.data.steps : undefined;
  const burn = useMemo(() => dayBurn(workouts, selected, steps ?? 0, weight.kg), [workouts, selected, steps, weight.kg]);
  const recent = useMemo(() => recentSessions(recentQ.data ?? [], 8), [recentQ.data]);
  // History up to the selected day: the loaded 8 weeks plus the visible week (it may lie before them).
  const history = useMemo(() => {
    const byId = new Map<string, Workout>();
    for (const w of recentQ.data ?? []) byId.set(w.id, w);
    for (const w of workouts) byId.set(w.id, w);
    return [...byId.values()];
  }, [recentQ.data, workouts]);
  const suggestions = useMemo(
    // Re-log help for the recent past (forgotten sessions) and the coming two weeks.
    () => (fresh && recentQ.data && selected >= addDays(today, -2) && selected <= addDays(today, 13) ? suggestSessions(history, selected, sessions) : []),
    [fresh, recentQ.data, history, selected, sessions, today],
  );
  const templates = useMemo(() => (tpl.data ? rankTemplates(tpl.data, history) : undefined), [tpl.data, history]);
  const { weekDoneCount, weekKcal } = useMemo(() => {
    const done = workouts.filter((w) => w.status === 'done');
    return { weekDoneCount: done.length, weekKcal: Math.round(done.reduce((s, w) => s + (Number(w.kcal) || 0), 0)) };
  }, [workouts]);

  // ---- local list helpers -------------------------------------------------
  const setWeekData = week.setData;
  /** Update the loaded week's rows (`from` = its Monday). */
  const setWeek = useCallback(
    (fn: (rows: Workout[], from: string) => Workout[]) => setWeekData((d) => (d ? { ...d, rows: fn(d.rows, d.from) } : d)),
    [setWeekData],
  );
  const setRecent = recentQ.setData;
  const upsertLocal = useCallback(
    (w: Workout) => {
      setWeek((list, from) => {
        const rest = list.filter((x) => x.id !== w.id);
        return w.workout_on >= from && w.workout_on <= addDays(from, 6) ? [...rest, w].sort(byDayTime) : rest;
      });
      setRecent((list) => (list ? [w, ...list.filter((x) => x.id !== w.id)] : list));
    },
    [setWeek, setRecent],
  );
  const removeLocal = useCallback((id: string) => setWeek((list) => list.filter((x) => x.id !== id)), [setWeek]);

  // ---- sheet --------------------------------------------------------------
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<SheetMode>({ kind: 'new', date: today });
  const openNew = (preset?: Partial<WorkoutDraft>) => {
    setMode({ kind: 'new', date: selected, preset });
    setSheetOpen(true);
  };
  const openEdit = (w: Workout) => {
    setMode({ kind: 'edit', workout: w });
    setSheetOpen(true);
  };

  const handleSave = async (d: WorkoutDraft & { kcal: number }, existing?: Workout) => {
    const fields = draftFields(d);
    try {
      const saved = existing ? await updateWorkout(existing.id, fields satisfies WorkoutPatch) : await addWorkout(fields);
      upsertLocal(saved);
      notifyDataChanged('workouts');
      setSheetOpen(false);
      if (saved.workout_on !== selected) setSelected(saved.workout_on);
      if (existing) {
        toast.show('Đã cập nhật buổi tập.', {
          kind: 'success',
          action: {
            label: 'Hoàn tác',
            onClick: once(() => {
              upsertLocal(existing);
              updateWorkout(existing.id, toPatch(existing))
                .then((row) => {
                  upsertLocal(row);
                  notifyDataChanged('workouts');
                })
                .catch((err) => {
                  upsertLocal(saved);
                  toast.error(err);
                });
            }),
          },
        });
      } else {
        toast.success(saved.status === 'planned' ? `Đã lên lịch cho ${formatDayVi(saved.workout_on).toLowerCase()}.` : 'Đã lưu buổi tập. Tuyệt lắm!');
      }
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  /** Optimistic: the row disappears at once and comes back if the server refuses. */
  const handleDelete = async (w: Workout) => {
    removeLocal(w.id);
    setRecent((list) => list?.filter((x) => x.id !== w.id));
    setSheetOpen(false);
    try {
      await deleteWorkout(w.id);
      notifyDataChanged('workouts');
      toast.show('Đã xóa buổi tập.', {
        action: {
          label: 'Hoàn tác',
          onClick: once(() => {
            addWorkout(toInsert(w))
              .then((row) => {
                upsertLocal(row);
                notifyDataChanged('workouts');
              })
              .catch((err) => toast.error(err));
          }),
        },
      });
    } catch (e) {
      upsertLocal(w);
      toast.error(e);
    }
  };

  // ---- toggle done / planned (optimistic) -------------------------------
  const [pending, setPending] = useState<Set<string>>(new Set());
  const toggle = async (w: Workout) => {
    const next = w.status === 'done' ? 'planned' : 'done';
    if (next === 'done' && !canMarkDone(w.workout_on, today)) {
      toast.info(`Buổi này lên lịch cho ${formatDayVi(w.workout_on).toLowerCase()} — đánh dấu “Đã tập” khi đến ngày nhé.`);
      return;
    }
    // Planned kcal was estimated earlier; finishing it uses today's weight.
    const patch: WorkoutPatch = next === 'done' ? { status: next, kcal: metKcal(Number(w.met), weight.kg, w.duration_min) } : { status: next };
    setPending((s) => new Set(s).add(w.id));
    setWeek((list) => list.map((x) => (x.id === w.id ? { ...x, ...patch } : x)));
    try {
      const saved = await updateWorkout(w.id, patch);
      upsertLocal(saved);
      notifyDataChanged('workouts');
      if (next === 'done') toast.success(`+${formatNumber(saved.kcal)} kcal — hoàn thành “${saved.title}”.`);
    } catch (e) {
      setWeek((list) => list.map((x) => (x.id === w.id ? w : x)));
      toast.error(e);
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(w.id);
        return n;
      });
    }
  };

  /** Undo of a one-tap add (template / suggestion). */
  const undoAdd = (row: Workout) => {
    removeLocal(row.id);
    setRecent((list) => list?.filter((x) => x.id !== row.id));
    deleteWorkout(row.id)
      .then(() => notifyDataChanged('workouts'))
      .catch((err) => {
        upsertLocal(row);
        toast.error(err);
      });
  };

  // ---- templates ----------------------------------------------------------
  const [tplBusy, setTplBusy] = useState<string | null>(null);
  const tplLock = useRef(false);
  const applyTemplate = async (t: WorkoutTemplate) => {
    if (tplLock.current) return;
    tplLock.current = true;
    setTplBusy(t.id);
    try {
      const row = await addWorkout(workoutFromTemplate(t, selected, defaultStatus(selected, today), weight.kg));
      upsertLocal(row);
      notifyDataChanged('workouts');
      toast.show(`Đã thêm “${t.name}” vào ${formatDayVi(selected).toLowerCase()}.`, {
        kind: 'success',
        action: { label: 'Hoàn tác', onClick: once(() => undoAdd(row)) },
      });
    } catch (e) {
      toast.error(e);
    } finally {
      tplLock.current = false;
      setTplBusy(null);
    }
  };
  const applySuggestion = async (src: Workout) => {
    if (tplLock.current) return;
    tplLock.current = true;
    setTplBusy(src.id);
    try {
      const status = defaultStatus(selected, today, src.start_time ?? undefined, nowHHMM());
      const row = await addWorkout(repeatSession(src, selected, status, weight.kg));
      upsertLocal(row);
      notifyDataChanged('workouts');
      toast.show(
        status === 'planned' ? `Đã lên lịch “${row.title}” cho ${formatDayVi(selected).toLowerCase()}.` : `+${formatNumber(row.kcal)} kcal — đã ghi “${row.title}”.`,
        { kind: 'success', action: { label: 'Hoàn tác', onClick: once(() => undoAdd(row)) } },
      );
    } catch (e) {
      toast.error(e);
    } finally {
      tplLock.current = false;
      setTplBusy(null);
    }
  };
  const customizeSuggestion = (w: Workout) =>
    openNew({
      activity: w.activity,
      category: w.category,
      title: w.title,
      met: Number(w.met),
      duration_min: w.duration_min,
      start_time: (w.start_time ?? '').slice(0, 5),
      status: defaultStatus(selected, today, w.start_time ?? undefined, nowHHMM()),
      notes: w.notes ?? '',
      template_id: w.template_id,
    });
  const customizeTemplate = (t: WorkoutTemplate) =>
    openNew({
      activity: t.activity,
      category: t.category,
      title: t.name,
      met: Number(t.met),
      duration_min: t.duration_min,
      notes: t.notes ?? '',
      template_id: t.id,
    });
  const saveTemplate = async (d: WorkoutDraft) => {
    if (hasTemplateNamed(tpl.data, d.title)) {
      toast.info(`Đã có mẫu “${d.title.trim()}”. Đổi tên buổi tập nếu muốn lưu thêm một mẫu khác.`);
      return;
    }
    try {
      const t = await createTemplate({ name: d.title, category: d.category, activity: d.activity, met: d.met!, duration_min: d.duration_min!, notes: draftNotes(d) });
      tpl.setData((list) => [...(list ?? []), t]);
      toast.success(`Đã lưu mẫu “${t.name}”.`);
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };
  const removeTemplate = async (t: WorkoutTemplate) => {
    try {
      await deleteTemplate(t.id);
      tpl.setData((list) => list?.filter((x) => x.id !== t.id));
      toast.success('Đã xóa mẫu.');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  // ---- repeat to next week ------------------------------------------------
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeating, setRepeating] = useState<'day' | 'week' | null>(null);
  // Sessions that would really be copied: days already past are skipped.
  const repeatableDay = useMemo(() => planCopies(sessions, [], 7, { minDate: today }).length, [sessions, today]);
  const repeatableWeek = useMemo(() => planCopies(workouts, [], 7, { minDate: today }).length, [workouts, today]);
  const repeat = async (scope: 'day' | 'week') => {
    const sources = scope === 'day' ? sessions : workouts;
    if (!sources.length) return;
    setRepeating(scope);
    try {
      const from = scope === 'day' ? addDays(selected, 7) : addDays(weekStart, 7);
      const to = scope === 'day' ? from : addDays(weekEnd, 7);
      if (to < today) {
        toast.info('Những ngày đó đã qua — chỉ lên lịch được cho hôm nay trở đi.');
        setRepeatOpen(false);
        return;
      }
      const existing = await listWorkouts(from, to);
      const rows = planCopies(sources, existing, 7, { weightKg: weight.kg, minDate: today });
      if (!rows.length) {
        toast.info(planCopies(sources, existing, 7).length ? 'Các ngày còn lại đã qua — không có gì để lên lịch.' : scope === 'day' ? 'Ngày đó đã có đủ các buổi này rồi.' : 'Tuần đó đã có đủ các buổi này rồi.');
        setRepeatOpen(false);
        return;
      }
      let ok = 0;
      let failure: unknown = null;
      for (const r of rows) {
        try {
          await addWorkout(r);
          ok++;
        } catch (err) {
          failure = err;
          break;
        }
      }
      if (ok) notifyDataChanged('workouts');
      setRepeatOpen(false);
      const target = addDays(selected, 7);
      if (failure) {
        toast.error(ok ? `Mới lên lịch được ${ok}/${rows.length} buổi — thử lại để thêm phần còn lại.` : failure);
        return;
      }
      toast.show(`Đã lên lịch ${ok} buổi cho ${scope === 'day' ? formatDayVi(from).toLowerCase() : weekRangeLabel(from, today)}.`, { kind: 'success', action: { label: 'Xem', onClick: () => setSelected(target) } });
    } catch (e) {
      toast.error(e);
    } finally {
      setRepeating(null);
    }
  };

  const sessionEstimate = useCallback((w: Workout) => metKcal(Number(w.met), weight.kg, w.duration_min), [weight.kg]);
  const tplEstimate = useCallback((t: WorkoutTemplate) => metKcal(Number(t.met), weight.kg, t.duration_min), [weight.kg]);

  const firstLoad = week.loading && !fresh;
  const dayLabel = formatDayVi(selected);
  const isFuture = selected > today;
  const isThisWeek = today >= weekStart && today <= weekEnd;
  const weekLabel = isThisWeek ? 'Tuần này' : `Tuần ${formatDayVi(weekStart, 'short')}–${formatDayVi(weekEnd, 'short')}`;

  return (
    <Page label="Tập luyện">
      {/* Hero ------------------------------------------------------------- */}
      <section aria-labelledby="burn-h" className="relative lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-14">
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-ember/25 blur-3xl" />
        <h1 id="burn-h" className="eyebrow relative flex items-center gap-1.5 text-gold/90 lg:col-start-1 lg:row-start-1">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" /> Tập luyện · {isFuture ? 'Dự kiến đốt' : 'Đã đốt'} {dayLabel.toLowerCase()}
        </h1>
        {firstLoad ? (
          <Skeleton width={220} height={88} className="mt-4 lg:col-start-1 lg:row-start-2" />
        ) : (
          <BigNumber key={selected} value={isFuture ? burn.plannedKcal : burn.total} unit="kcal" tone="ember" size="lg" className="relative mt-3 lg:col-start-1 lg:row-start-2" />
        )}
        {/* Size container: Stat sizing follows the card width (phone frame), not the browser viewport. */}
        <div className="relative mt-5 [container-type:inline-size] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-end lg:pb-1">
        <div className="grid grid-cols-3 gap-2 lg:gap-3">
          <Stat icon={<Dumbbell className="h-3.5 w-3.5" />} label="Tập luyện" value={`${formatNumber(burn.workoutKcal)}`} sub={burn.doneCount ? `${burn.doneCount} buổi · ${burn.doneMinutes}′` : 'Chưa có'}
            title={burn.doneCount ? `${burn.doneCount} buổi · ${formatMinutes(burn.doneMinutes)}` : undefined} />
          <Stat icon={<Footprints className="h-3.5 w-3.5" />} label="Bước chân" value={`${formatNumber(burn.stepsKcal)}`} sub={`${formatNumber(steps ?? 0)} bước`} />
          <Stat
            icon={<CalendarPlus className="h-3.5 w-3.5" />}
            label="Kế hoạch"
            value={burn.plannedCount ? `${formatNumber(burn.plannedKcal)}` : '—'}
            sub={burn.plannedCount ? `${burn.plannedCount} buổi chờ tập` : 'Không có'}
            dim={!burn.plannedCount}
          />
        </div>
        </div>
        <p className="relative mt-3 text-[12.5px] text-muted lg:col-span-2 lg:mt-4 lg:text-[13.5px]">
          {weekLabel}: <b className="font-semibold text-text">{weekDoneCount} buổi đã tập</b> · {formatNumber(weekKcal)} kcal từ tập luyện
        </p>
      </section>

      {/* Week ------------------------------------------------------------- */}
      <div className="mt-7">
        <WeekStrip
          days={days}
          selected={selected}
          today={today}
          marks={marks}
          loading={firstLoad}
          onSelect={setSelected}
          onShiftWeek={(dir) => setSelected((d) => addDays(d, dir * 7))}
          onToday={() => setSelected(today)}
        />
      </div>

      {/* Laptop: day sessions + templates (main) · sticky steps card (side). Box-less on phone. */}
      <div className="contents lg:mt-9 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-8">
      {/* Day sessions ----------------------------------------------------- */}
      <section aria-labelledby="day-h" className="mt-7 flex flex-col gap-3 lg:col-start-1 lg:row-start-1 lg:mt-0">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{sessions.length ? `${sessions.length} buổi` : 'Lịch ngày'}</p>
            <h2 id="day-h" className="display mt-1.5 truncate text-[26px] text-text">
              {dayLabel}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setRepeatOpen(true)}
                aria-label="Lặp lại sang tuần kế tiếp"
                title="Lặp lại sang tuần kế tiếp"
                className="glass circle text-text"
              >
                <Repeat className="h-[18px] w-[18px]" />
              </button>
            )}
            <Button size="sm" icon={<Plus className="h-4 w-4" strokeWidth={2.6} />} onClick={() => openNew()}>
              Thêm
            </Button>
          </div>
        </div>

        {firstLoad ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Đang tải lịch tập">
            <Skeleton height={72} rounded="card" />
            <Skeleton height={72} rounded="card" />
          </div>
        ) : week.error && !fresh ? (
          <EmptyState
            compact
            icon={RotateCw}
            title="Không tải được lịch tập"
            description="Kiểm tra kết nối mạng rồi thử lại."
            action={
              <Button size="sm" variant="secondary" onClick={() => void week.reload()}>
                Thử lại
              </Button>
            }
          />
        ) : sessions.length === 0 && suggestions.length > 0 ? null : sessions.length === 0 ? (
          <div className="glass-card">
            <EmptyState
              compact
              icon={Dumbbell}
              title={selected > today ? 'Chưa có kế hoạch' : 'Chưa có buổi tập'}
              description={selected > today ? 'Lên lịch trước để giữ nhịp tập đều mỗi tuần.' : 'Ghi lại buổi tập để tính năng lượng đã đốt.'}
              action={
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openNew()}>
                  {selected > today ? 'Lên lịch tập' : 'Ghi buổi tập'}
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((w, i) => (
              <SessionRow key={w.id} workout={w} index={i} pending={pending.has(w.id)} onToggle={() => void toggle(w)} onOpen={() => openEdit(w)} />
            ))}
          </ul>
        )}

        {!firstLoad && (
          <SuggestionsCard
            date={selected}
            suggestions={suggestions}
            estimate={sessionEstimate}
            busyId={tplBusy}
            emptyDay={sessions.length === 0}
            onApply={(w) => void applySuggestion(w)}
            onCustomize={customizeSuggestion}
          />
        )}
      </section>

      {/* Steps ------------------------------------------------------------ */}
      <div className="mt-7 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
        <StepsCard
          date={selected}
          steps={steps}
          target={stepTarget}
          weightKg={weight.kg}
          heightCm={fit?.height_cm}
          sex={fit?.sex}
          future={isFuture}
          loading={daily.loading && steps === undefined}
          onSave={async (n) => {
            try {
              const row = await setSteps(selected, n);
              daily.setData(row);
              notifyDataChanged('daily');
              toast.success(`Đã lưu ${formatNumber(row.steps)} bước.`);
            } catch (e) {
              toast.error(e);
              throw e;
            }
          }}
        />
      </div>

      {/* Templates -------------------------------------------------------- */}
      <div className="mt-7 lg:col-start-1 lg:row-start-2 lg:mt-0">
        <TemplatesCard
          templates={templates}
          loading={tpl.loading}
          date={selected}
          estimate={tplEstimate}
          busyId={tplBusy}
          onApply={(t) => void applyTemplate(t)}
          onCustomize={customizeTemplate}
          onDelete={removeTemplate}
        />
      </div>
      </div>

      <WorkoutSheet
        open={sheetOpen}
        mode={mode}
        today={today}
        weightKg={weight.kg}
        weightNote={weightNote}
        recent={recent}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        onSaveTemplate={saveTemplate}
      />

      <RepeatSheet
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        selected={selected}
        today={today}
        weekStart={weekStart}
        weekEnd={weekEnd}
        dayCount={repeatableDay}
        weekCount={repeatableWeek}
        repeating={repeating}
        onRepeat={(scope) => void repeat(scope)}
      />
    </Page>
  );
}

function Stat({ icon, label, value, sub, dim, title }: { icon: ReactNode; label: string; value: string; sub: string; dim?: boolean; title?: string }) {
  return (
    <div className="glass-card min-w-0 !rounded-[18px] px-2.5 py-3 [@container(min-width:340px)]:px-3 lg:!rounded-[22px] lg:!px-4 lg:py-4" title={title}>
      <p className="flex items-center gap-1 whitespace-nowrap text-[11.5px] font-semibold leading-tight text-muted [@container(min-width:340px)]:text-[12px]">
        <span className="shrink-0 text-gold" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0">{label}</span>
      </p>
      <p className={dim ? 'num mt-2 text-[24px] text-text/40 lg:mt-3 lg:text-[30px]' : 'num mt-2 text-[24px] text-text lg:mt-3 lg:text-[30px]'}>{value}</p>
      <p className="mt-1 truncate text-[11.5px] text-muted lg:text-[12.5px]">{sub}</p>
    </div>
  );
}

