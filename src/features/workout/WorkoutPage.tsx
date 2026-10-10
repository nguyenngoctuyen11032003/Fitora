import { CalendarPlus, Dumbbell, Flame, Footprints, Plus, Repeat, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Page } from '@/components/shell/Page';
import { BigNumber } from '@/components/ui/BigNumber';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/context/ProfileContext';
import { addDays, endOfWeek, formatDayVi, startOfWeek, todayISO } from '@/lib/date';
import { metKcal } from '@/lib/energy';
import { notifyDataChanged } from '@/lib/events';
import { formatKg, formatMinutes, formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { latestWeight } from '@/services/body';
import { getDailyLog, setSteps } from '@/services/daily';
import { addWorkout, createTemplate, deleteTemplate, deleteWorkout, listTemplates, listWorkouts, updateWorkout } from '@/services/workouts';
import type { NewWorkout, Workout, WorkoutPatch, WorkoutTemplate } from '@/types/db';
import { dayBurn, dayMarks, defaultStatus, planCopies, recentSessions, resolveWeight, sessionsOn, weekDays, workoutFromTemplate } from './lib';
import { SessionRow } from './SessionRow';
import { StepsCard } from './StepsCard';
import { TemplatesCard } from './TemplatesCard';
import { WeekStrip } from './WeekStrip';
import { WorkoutSheet, type SheetMode, type WorkoutDraft } from './WorkoutSheet';

const byDayTime = (a: Workout, b: Workout) =>
  a.workout_on.localeCompare(b.workout_on) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.created_at.localeCompare(b.created_at);

function toInsert(w: Workout): NewWorkout {
  return {
    workout_on: w.workout_on,
    start_time: w.start_time,
    category: w.category,
    activity: w.activity,
    title: w.title,
    met: Number(w.met),
    duration_min: w.duration_min,
    kcal: Number(w.kcal),
    status: w.status,
    template_id: w.template_id,
    notes: w.notes,
  };
}

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
  const recentQ = useAsync(() => listWorkouts(addDays(today, -45), today), [today]);
  const tpl = useAsync(() => listTemplates(), []);
  const daily = useAsync(() => getDailyLog(selected), [selected]);
  const weightQ = useAsync(() => latestWeight(), []);

  // Surface load errors once each (week has an inline retry as well).
  const loadError = week.error ?? tpl.error ?? daily.error ?? recentQ.error;
  useEffect(() => {
    if (loadError) toast.error(loadError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  const weight = resolveWeight(weightQ.data?.weight_kg, fit?.start_weight_kg);
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
  const burn = dayBurn(workouts, selected, steps ?? 0, weight.kg);
  const recent = useMemo(() => recentSessions(recentQ.data ?? [], 8), [recentQ.data]);
  const weekDone = workouts.filter((w) => w.status === 'done');
  const weekKcal = weekDone.reduce((s, w) => s + Number(w.kcal || 0), 0);

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
    const fields = {
      workout_on: d.workout_on,
      start_time: d.start_time || null,
      category: d.category,
      activity: d.activity,
      title: d.title,
      met: d.met!,
      duration_min: d.duration_min!,
      kcal: d.kcal,
      status: d.status,
      template_id: d.template_id,
      notes: d.notes.trim() || null,
    };
    try {
      const saved = existing ? await updateWorkout(existing.id, fields satisfies WorkoutPatch) : await addWorkout(fields);
      upsertLocal(saved);
      notifyDataChanged('workouts');
      setSheetOpen(false);
      if (saved.workout_on !== selected) setSelected(saved.workout_on);
      toast.success(existing ? 'Đã cập nhật buổi tập.' : saved.status === 'planned' ? `Đã lên lịch cho ${formatDayVi(saved.workout_on).toLowerCase()}.` : 'Đã lưu buổi tập. Tuyệt lắm!');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  const handleDelete = async (w: Workout) => {
    try {
      await deleteWorkout(w.id);
      removeLocal(w.id);
      recentQ.setData((list) => list?.filter((x) => x.id !== w.id));
      notifyDataChanged('workouts');
      setSheetOpen(false);
      toast.show('Đã xóa buổi tập.', {
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            addWorkout(toInsert(w))
              .then((row) => {
                upsertLocal(row);
                notifyDataChanged('workouts');
              })
              .catch((err) => toast.error(err));
          },
        },
      });
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  // ---- toggle done / planned (optimistic) -------------------------------
  const [pending, setPending] = useState<Set<string>>(new Set());
  const toggle = async (w: Workout) => {
    const next = w.status === 'done' ? 'planned' : 'done';
    setPending((s) => new Set(s).add(w.id));
    setWeek((list) => list.map((x) => (x.id === w.id ? { ...x, status: next } : x)));
    try {
      const saved = await updateWorkout(w.id, { status: next });
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

  // ---- templates ----------------------------------------------------------
  const [tplBusy, setTplBusy] = useState<string | null>(null);
  const applyTemplate = async (t: WorkoutTemplate) => {
    setTplBusy(t.id);
    try {
      const row = await addWorkout(workoutFromTemplate(t, selected, defaultStatus(selected, today), weight.kg));
      upsertLocal(row);
      notifyDataChanged('workouts');
      toast.show(`Đã thêm “${t.name}” vào ${formatDayVi(selected).toLowerCase()}.`, {
        kind: 'success',
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            deleteWorkout(row.id)
              .then(() => {
                removeLocal(row.id);
                notifyDataChanged('workouts');
              })
              .catch((err) => toast.error(err));
          },
        },
      });
    } catch (e) {
      toast.error(e);
    } finally {
      setTplBusy(null);
    }
  };
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
    try {
      const t = await createTemplate({ name: d.title, category: d.category, activity: d.activity, met: d.met!, duration_min: d.duration_min!, notes: d.notes.trim() || null });
      tpl.setData((list) => [...(list ?? []), t].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
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
  const repeat = async (scope: 'day' | 'week') => {
    const sources = scope === 'day' ? sessions : workouts;
    if (!sources.length) return;
    setRepeating(scope);
    try {
      const from = scope === 'day' ? addDays(selected, 7) : addDays(weekStart, 7);
      const to = scope === 'day' ? from : addDays(weekEnd, 7);
      const existing = await listWorkouts(from, to);
      const rows = planCopies(sources, existing, 7);
      if (!rows.length) {
        toast.info('Tuần sau đã có đủ các buổi này rồi.');
        setRepeatOpen(false);
        return;
      }
      let ok = 0;
      for (const r of rows) {
        await addWorkout(r);
        ok++;
      }
      notifyDataChanged('workouts');
      setRepeatOpen(false);
      const target = scope === 'day' ? from : addDays(selected, 7);
      toast.show(`Đã lên lịch ${ok} buổi cho tuần sau.`, { kind: 'success', action: { label: 'Xem', onClick: () => setSelected(target) } });
    } catch (e) {
      toast.error(e);
    } finally {
      setRepeating(null);
    }
  };

  const tplEstimate = useCallback((t: WorkoutTemplate) => metKcal(Number(t.met), weight.kg, t.duration_min), [weight.kg]);

  const firstLoad = week.loading && !fresh;
  const dayLabel = formatDayVi(selected);

  return (
    <Page label="Tập luyện">
      {/* Hero ------------------------------------------------------------- */}
      <section aria-labelledby="burn-h" className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-ember/25 blur-3xl" />
        <h1 id="burn-h" className="eyebrow relative flex items-center gap-1.5 text-gold/90">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" /> Tập luyện · Đã đốt {dayLabel.toLowerCase()}
        </h1>
        {firstLoad ? (
          <Skeleton width={220} height={88} className="mt-4" />
        ) : (
          <BigNumber key={selected} value={burn.total} unit="kcal" tone="ember" size="lg" className="relative mt-3" />
        )}
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <Stat icon={<Dumbbell className="h-3.5 w-3.5" />} label="Tập luyện" value={`${formatNumber(burn.workoutKcal)}`} sub={burn.doneCount ? `${burn.doneCount} buổi · ${formatMinutes(burn.doneMinutes)}` : 'Chưa có'} />
          <Stat icon={<Footprints className="h-3.5 w-3.5" />} label="Bước chân" value={`${formatNumber(burn.stepsKcal)}`} sub={`${formatNumber(steps ?? 0)} bước`} />
          <Stat
            icon={<CalendarPlus className="h-3.5 w-3.5" />}
            label="Kế hoạch"
            value={burn.plannedCount ? `${formatNumber(burn.plannedKcal)}` : '—'}
            sub={burn.plannedCount ? `${burn.plannedCount} buổi chờ tập` : 'Không có'}
            dim={!burn.plannedCount}
          />
        </div>
        <p className="relative mt-3 text-[12.5px] text-muted">
          Tuần này: <b className="font-semibold text-text">{weekDone.length} buổi</b> · {formatNumber(weekKcal)} kcal từ tập luyện
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

      {/* Day sessions ----------------------------------------------------- */}
      <section aria-labelledby="day-h" className="mt-7 flex flex-col gap-3">
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
                aria-label="Lặp lại sang tuần sau"
                title="Lặp lại sang tuần sau"
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
        ) : sessions.length === 0 ? (
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
      </section>

      {/* Steps ------------------------------------------------------------ */}
      <div className="mt-7">
        <StepsCard
          date={selected}
          steps={steps}
          target={stepTarget}
          weightKg={weight.kg}
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
      <div className="mt-7">
        <TemplatesCard
          templates={tpl.data}
          loading={tpl.loading}
          date={selected}
          estimate={tplEstimate}
          busyId={tplBusy}
          onApply={(t) => void applyTemplate(t)}
          onCustomize={customizeTemplate}
          onDelete={removeTemplate}
        />
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

      <BottomSheet
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        title="Lặp lại tuần sau"
        description="Sao chép thành các buổi “Lên lịch”. Buổi đã có sẵn ở tuần sau sẽ được bỏ qua."
      >
        <div className="flex flex-col gap-2.5 pb-2">
          <RepeatOption
            title={`Chỉ ${dayLabel.toLowerCase()}`}
            sub={`${sessions.length} buổi → ${formatDayVi(addDays(selected, 7), 'long')}`}
            loading={repeating === 'day'}
            disabled={!!repeating || !sessions.length}
            onClick={() => void repeat('day')}
          />
          <RepeatOption
            title="Cả tuần này"
            sub={`${workouts.length} buổi → tuần ${formatDayVi(addDays(weekStart, 7), 'short')}–${formatDayVi(addDays(weekEnd, 7), 'short')}`}
            loading={repeating === 'week'}
            disabled={!!repeating || !workouts.length}
            onClick={() => void repeat('week')}
          />
        </div>
      </BottomSheet>
    </Page>
  );
}

function Stat({ icon, label, value, sub, dim }: { icon: ReactNode; label: string; value: string; sub: string; dim?: boolean }) {
  return (
    <div className="glass-card min-w-0 !rounded-[18px] px-3 py-3">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
        <span className="text-gold" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p className={dim ? 'num mt-2 text-[24px] text-text/40' : 'num mt-2 text-[24px] text-text'}>{value}</p>
      <p className="mt-1 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
}

function RepeatOption({ title, sub, loading, disabled, onClick }: { title: string; sub: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="glass-card flex min-h-[64px] w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-gold/15 text-gold">
        {loading ? <RotateCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Repeat className="h-5 w-5" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{sub}</span>
      </span>
    </button>
  );
}
