import clsx from 'clsx';
import { BookmarkPlus, CalendarClock, Check, Route, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CountUp } from '@/components/ui/CountUp';
import { Input, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Modal';
import { NumberField } from '@/components/ui/NumberField';
import { Segmented } from '@/components/ui/Segmented';
import { findActivity, type ActivityDef } from '@/data/activities';
import { formatDayVi, isISODate } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { WORKOUT_CATEGORIES, WORKOUT_CATEGORY_LABELS, type Workout, type WorkoutCategory, type WorkoutStatus } from '@/types/db';
import { ActivityIcon, CATEGORY_COLOR } from './ActivityIcon';
import { ActivityPicker } from './ActivityPicker';
import { checkDraft, draftFrom, type SheetMode, type WorkoutDraft } from './draft';
import {
  activityLabel,
  buildTitle,
  categoryDefaultMet,
  defaultStatus,
  defaultVariant,
  distanceForDuration,
  durationForDistance,
  normalizeTime,
  nowHHMM,
  sessionKcal,
  variantForMet,
  variantForSpeed,
} from './lib';

export type { SheetMode, WorkoutDraft } from './draft';

interface Props {
  open: boolean;
  mode: SheetMode;
  today: string;
  weightKg: number;
  weightNote: string;
  recent: Workout[];
  onClose: () => void;
  /** Resolves when saved (sheet closes); rejects to keep the sheet open. */
  onSave: (draft: WorkoutDraft & { kcal: number }, existing?: Workout) => Promise<void>;
  onDelete: (w: Workout) => Promise<void>;
  onSaveTemplate: (draft: WorkoutDraft) => Promise<void>;
}

const DURATIONS = [15, 30, 45, 60, 90];

export function WorkoutSheet({ open, mode, today, weightKg, weightNote, recent, onClose, onSave, onDelete, onSaveTemplate }: Props) {
  const [draft, setDraft] = useState<WorkoutDraft>(() => draftFrom(mode, today));
  const [titleTouched, setTitleTouched] = useState(false);
  const [picking, setPicking] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<WorkoutCategory | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  /** The user picked a status explicitly — stop inferring it from date/time. */
  const [statusTouched, setStatusTouched] = useState(false);
  /** Optional distance helper (not stored): with a speed-based activity it sets the intensity or the duration. */
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  /** Synchronous guard against double taps (state updates land a frame later). */
  const inFlight = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  /** Show validation errors and bring the first one into view (the form scrolls inside the sheet). */
  const revealErrors = () => {
    setShowErrors(true);
    requestAnimationFrame(() => formRef.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  // Reset whenever the sheet (re)opens.
  useEffect(() => {
    if (!open) return;
    const d = draftFrom(mode, today);
    setDraft(d);
    setTitleTouched(mode.kind === 'edit' || !!mode.preset?.title);
    setPicking(!d.activity);
    setQuery('');
    setCat('all');
    setShowErrors(false);
    setStatusTouched(false);
    setConfirmDel(false);
    setDistanceKm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const editing = mode.kind === 'edit' ? mode.workout : undefined;
  const act = findActivity(draft.activity);
  const curVariant = variantForMet(act, draft.met ?? 0);

  const set = (patch: Partial<WorkoutDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const pick = (a: ActivityDef) => {
    const v = defaultVariant(a);
    setDraft((d) => ({ ...d, activity: a.key, category: a.category, met: v.met, title: titleTouched && d.title ? d.title : buildTitle(a, v), template_id: null }));
    setTitleTouched(false);
    setDistanceKm(null);
    setPicking(false);
  };

  const pickCustom = (name: string) => {
    const c: WorkoutCategory = cat === 'all' ? 'other' : cat;
    setDraft((d) => ({ ...d, activity: name.trim().slice(0, 60), category: c, met: categoryDefaultMet(c), title: name.trim().slice(0, 80), template_id: null }));
    setTitleTouched(true);
    setDistanceKm(null);
    setPicking(false);
  };

  const pickRecent = (w: Workout) => {
    setDraft((d) => ({
      ...d,
      activity: w.activity,
      category: w.category,
      title: w.title,
      met: Number(w.met),
      duration_min: w.duration_min,
      start_time: d.start_time || normalizeTime(w.start_time),
      notes: w.notes ?? '',
      template_id: w.template_id,
    }));
    setTitleTouched(true);
    setDistanceKm(null);
    setPicking(false);
  };

  const chooseVariant = (met: number) => {
    const v = act?.variants.find((x) => x.met === met);
    // With a distance entered, a different pace means a different duration.
    const dur = distanceKm ? durationForDistance(distanceKm, v?.kmh) : null;
    setDraft((d) => ({ ...d, met, title: !titleTouched && act ? buildTitle(act, v) : d.title, ...(dur ? { duration_min: Math.min(1440, dur) } : {}) }));
  };

  /** Distance + duration → speed → closest intensity (keeps a hand-typed title). */
  const intensityFor = (km: number | null, minutes: number | null): Partial<WorkoutDraft> => {
    if (!act || !km || !minutes) return {};
    const v = variantForSpeed(act, km / (minutes / 60));
    return v ? { met: v.met, title: !titleTouched ? buildTitle(act, v) : draft.title } : {};
  };

  const changeDistance = (km: number | null) => {
    setDistanceKm(km);
    if (!km) return;
    if (draft.duration_min) set(intensityFor(km, draft.duration_min));
    else {
      const dur = durationForDistance(km, curVariant?.kmh);
      if (dur) set({ duration_min: Math.min(1440, dur) });
    }
  };

  const changeDuration = (duration_min: number | null) => set({ duration_min, ...intensityFor(distanceKm, duration_min) });

  // Validation
  const check = checkDraft(draft, today);
  const { met: metOk, duration: durOk, title: titleOk, date: dateOk, status: statusOk, valid } = check;
  const speedBased = !!act?.variants.some((v) => v.kmh);
  const estDistance = speedBased && !distanceKm ? distanceForDuration(draft.duration_min, curVariant?.kmh) : null;

  const kcal = metOk && durOk ? sessionKcal(draft, weightKg, editing) : 0;

  const submit = async () => {
    if (inFlight.current) return;
    if (!valid) {
      revealErrors();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await onSave({ ...draft, title: draft.title.trim(), kcal }, editing);
    } catch {
      /* toast shown by caller; keep the sheet open */
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    // A template has no date/status — only the activity fields must be valid.
    if (inFlight.current) return;
    if (!check.templateValid) {
      revealErrors();
      return;
    }
    inFlight.current = true;
    setSavingTpl(true);
    try {
      await onSaveTemplate({ ...draft, title: draft.title.trim() });
    } catch {
      /* toast shown by caller */
    } finally {
      inFlight.current = false;
      setSavingTpl(false);
    }
  };

  const doDelete = async () => {
    if (!editing || deleting) return;
    setDeleting(true);
    try {
      await onDelete(editing);
      setConfirmDel(false);
    } catch {
      /* toast shown by caller */
    } finally {
      setDeleting(false);
    }
  };

  const planned = draft.status === 'planned';
  const title = editing ? 'Sửa buổi tập' : picking ? 'Chọn hoạt động' : planned ? 'Lên lịch tập' : 'Ghi buổi tập';
  const description = picking ? `Cho ${formatDayVi(draft.workout_on).toLowerCase()}` : undefined;

  const footer = picking ? undefined : (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <p className="eyebrow">{planned ? 'Dự kiến đốt' : 'Năng lượng đốt'}</p>
          <p className="mt-1.5 flex items-end gap-1.5">
            <span className="num text-[44px] text-gradient-ember">
              <CountUp value={kcal} duration={600} />
            </span>
            <span className="mb-1 text-sm font-bold text-muted">kcal</span>
          </p>
        </div>
        <button
          type="button"
          onClick={saveTemplate}
          disabled={savingTpl || saving}
          className="glass pill mb-1 inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-text disabled:opacity-50"
        >
          <BookmarkPlus className="h-4 w-4 text-gold" aria-hidden="true" />
          {savingTpl ? 'Đang lưu…' : 'Lưu làm mẫu'}
        </button>
      </div>
      <Button block size="lg" loading={saving} onClick={submit} icon={planned ? <CalendarClock className="h-5 w-5" /> : <Check className="h-5 w-5" />}>
        {editing ? 'Lưu thay đổi' : planned ? 'Lên lịch' : 'Lưu buổi tập'}
      </Button>
    </div>
  );

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={title} description={description} height="full" footer={footer}>
        {picking ? (
          <ActivityPicker
            query={query}
            onQuery={setQuery}
            category={cat}
            onCategory={setCat}
            selected={draft.activity}
            recent={recent}
            onPick={pick}
            onPickCustom={pickCustom}
            onPickRecent={pickRecent}
          />
        ) : (
          <div ref={formRef} className="flex flex-col gap-5 pb-2">
            {/* Selected activity */}
            <div className="glass-card flex items-center gap-3 p-3">
              <ActivityIcon activity={draft.activity} category={draft.category} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold tracking-[-0.02em] text-text">{activityLabel(draft.activity, draft.title)}</p>
                <p className="text-[12.5px] text-muted">{WORKOUT_CATEGORY_LABELS[draft.category]}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
                Đổi
              </Button>
            </div>

            {/* Custom activity: category */}
            {!act && (
              <div className="flex flex-col gap-2">
                <p className="pl-1 text-[13px] font-semibold text-muted">Nhóm</p>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                  {WORKOUT_CATEGORIES.map((c) => (
                    <Chip key={c} size="md" selected={draft.category === c} dot={CATEGORY_COLOR[c]} onClick={() => set({ category: c })}>
                      {WORKOUT_CATEGORY_LABELS[c]}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Intensity */}
            <div className="flex flex-col gap-2">
              {act && act.variants.length > 1 && (
                <>
                  <p className="pl-1 text-[13px] font-semibold text-muted">Cường độ</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Cường độ">
                    {act.variants.map((v) => (
                      <Chip key={v.id} selected={curVariant?.id === v.id} onClick={() => chooseVariant(v.met)}>
                        {v.label}
                        <span className={clsx('tabular text-[12px] font-bold', curVariant?.id === v.id ? 'text-gold/80' : 'text-muted')}>
                          {formatNumber(v.met, 1)}
                        </span>
                      </Chip>
                    ))}
                  </div>
                </>
              )}
              <NumberField
                label="Chỉ số MET"
                value={draft.met}
                onChange={(met) => set({ met })}
                min={1}
                max={25}
                step={0.5}
                decimals={1}
                stepper
                error={showErrors && !metOk ? 'MET phải từ 1 đến 25.' : undefined}
                hint={act ? (curVariant ? 'Theo Compendium of Physical Activities' : 'MET tùy chỉnh') : 'Ước lượng: nhẹ 2–3 · vừa 4–6 · mạnh 7+'}
              />
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-2">
              <NumberField
                label="Thời lượng"
                value={draft.duration_min}
                onChange={changeDuration}
                min={1}
                max={1440}
                step={5}
                decimals={0}
                stepper
                unit="phút"
                error={showErrors && !durOk ? 'Thời lượng từ 1 đến 1440 phút.' : undefined}
              />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn nhanh thời lượng">
                {DURATIONS.map((m) => (
                  <Chip key={m} size="md" selected={draft.duration_min === m} onClick={() => changeDuration(m)} ariaLabel={`${m} phút`}>
                    {m}′
                  </Chip>
                ))}
              </div>
              {speedBased && (
                <NumberField
                  label="Quãng đường"
                  value={distanceKm}
                  onChange={changeDistance}
                  min={0.1}
                  max={300}
                  step={0.5}
                  decimals={1}
                  unit="km"
                  icon={<Route className="h-4 w-4" />}
                  placeholder={estDistance ? `≈ ${formatNumber(estDistance, 1)}` : 'Không bắt buộc'}
                  hint={
                    distanceKm && draft.duration_min
                      ? `Tốc độ ≈ ${formatNumber(distanceKm / (draft.duration_min / 60), 1)} km/h — cường độ chọn theo tốc độ.`
                      : 'Nhập km để tự chọn cường độ theo tốc độ (hoặc tính thời lượng).'
                  }
                />
              )}
            </div>

            {/* When */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ngày"
                type="date"
                value={draft.workout_on}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!isISODate(v)) return set({ workout_on: v });
                  // A future day can only be planned; otherwise infer (new) unless the user chose a status.
                  const status =
                    v > today ? 'planned' : mode.kind === 'new' && !statusTouched ? defaultStatus(v, today, draft.start_time, nowHHMM()) : draft.status;
                  set({ workout_on: v, status });
                }}
                error={showErrors && !dateOk ? 'Ngày không hợp lệ.' : undefined}
              />
              <Input
                label="Giờ bắt đầu"
                type="time"
                value={draft.start_time}
                onChange={(e) => {
                  const t = e.target.value;
                  set({
                    start_time: t,
                    ...(mode.kind === 'new' && !statusTouched && isISODate(draft.workout_on) ? { status: defaultStatus(draft.workout_on, today, t, nowHHMM()) } : {}),
                  });
                }}
                hint="Không bắt buộc"
              />
            </div>

            <Segmented<WorkoutStatus>
              ariaLabel="Trạng thái"
              value={draft.status}
              onChange={(status) => {
                setStatusTouched(true);
                set({ status });
              }}
              options={[
                { value: 'done', label: 'Đã tập', icon: <Check className="h-4 w-4" /> },
                { value: 'planned', label: 'Lên lịch', icon: <CalendarClock className="h-4 w-4" /> },
              ]}
            />
            {!statusOk && (
              <p role="alert" className="-mt-3 pl-1 text-[12.5px] font-semibold text-[var(--danger-text)]">
                Ngày này chưa tới — chỉ có thể lên lịch. Đánh dấu “Đã tập” khi bạn tập xong.
              </p>
            )}

            <Input
              label="Tên buổi tập"
              value={draft.title}
              maxLength={80}
              onChange={(e) => {
                setTitleTouched(true);
                set({ title: e.target.value });
              }}
              error={showErrors && !titleOk ? 'Hãy nhập tên buổi tập.' : undefined}
            />

            <Textarea label="Ghi chú" rows={2} maxLength={500} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Bài tập, cảm nhận…" />

            <p className="text-[12.5px] leading-relaxed text-muted">
              Năng lượng = MET × 3,5 × cân nặng ÷ 200 × phút. {weightNote}
            </p>

            {editing && (
              <Button variant="ghost" block onClick={() => setConfirmDel(true)} icon={<Trash2 className="h-4 w-4" />} className="!text-[var(--danger-text)]">
                Xóa buổi tập
              </Button>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirmDel}
        title="Xóa buổi tập này?"
        message={editing ? `“${editing.title}” sẽ bị xóa khỏi ${formatDayVi(editing.workout_on).toLowerCase()}.` : undefined}
        confirmLabel="Xóa"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}
