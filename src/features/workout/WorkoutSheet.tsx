import clsx from 'clsx';
import { BookmarkPlus, CalendarClock, Check, History, PenLine, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { metKcal } from '@/lib/energy';
import { formatNumber } from '@/lib/format';
import { WORKOUT_CATEGORIES, WORKOUT_CATEGORY_LABELS, type Workout, type WorkoutCategory, type WorkoutStatus } from '@/types/db';
import { ActivityIcon, CATEGORY_COLOR } from './ActivityIcon';
import { buildTitle, categoryDefaultMet, defaultStatus, defaultVariant, normalizeTime, searchActivities, variantForMet } from './lib';

export interface WorkoutDraft {
  activity: string;
  category: WorkoutCategory;
  title: string;
  met: number | null;
  duration_min: number | null;
  workout_on: string;
  start_time: string;
  status: WorkoutStatus;
  notes: string;
  template_id: string | null;
}

export type SheetMode =
  | { kind: 'new'; date: string; preset?: Partial<WorkoutDraft> }
  | { kind: 'edit'; workout: Workout };

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

function draftFrom(mode: SheetMode, today: string): WorkoutDraft {
  if (mode.kind === 'edit') {
    const w = mode.workout;
    return {
      activity: w.activity,
      category: w.category,
      title: w.title,
      met: Number(w.met),
      duration_min: w.duration_min,
      workout_on: w.workout_on,
      start_time: normalizeTime(w.start_time),
      status: w.status,
      notes: w.notes ?? '',
      template_id: w.template_id,
    };
  }
  return {
    activity: '',
    category: 'gym',
    title: '',
    met: null,
    duration_min: 30,
    workout_on: mode.date,
    start_time: '',
    status: defaultStatus(mode.date, today),
    notes: '',
    template_id: null,
    ...mode.preset,
  };
}

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
    setConfirmDel(false);
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
    setPicking(false);
  };

  const pickCustom = (name: string) => {
    const c: WorkoutCategory = cat === 'all' ? 'other' : cat;
    setDraft((d) => ({ ...d, activity: name.trim().slice(0, 60), category: c, met: categoryDefaultMet(c), title: name.trim().slice(0, 80), template_id: null }));
    setTitleTouched(true);
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
    setPicking(false);
  };

  const chooseVariant = (met: number) => {
    const v = act?.variants.find((x) => x.met === met);
    setDraft((d) => ({ ...d, met, title: !titleTouched && act ? buildTitle(act, v) : d.title }));
  };

  const results = useMemo(() => searchActivities(query, cat), [query, cat]);
  const grouped = useMemo(() => {
    if (query.trim() || cat !== 'all') return null;
    return WORKOUT_CATEGORIES.map((c) => ({ c, items: results.filter((a) => a.category === c) })).filter((g) => g.items.length);
  }, [results, query, cat]);

  // Validation
  const metOk = draft.met !== null && draft.met >= 1 && draft.met <= 25;
  const durOk = draft.duration_min !== null && draft.duration_min >= 1 && draft.duration_min <= 1440;
  const titleOk = draft.title.trim().length > 0;
  const dateOk = isISODate(draft.workout_on);
  const valid = metOk && durOk && titleOk && dateOk && !!draft.activity;

  const computed = metOk && durOk ? metKcal(draft.met!, weightKg, draft.duration_min!) : 0;
  const kcal =
    editing && Number(editing.met) === draft.met && editing.duration_min === draft.duration_min ? Math.round(Number(editing.kcal)) : computed;

  const submit = async () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, title: draft.title.trim(), kcal }, editing);
    } catch {
      /* toast shown by caller; keep the sheet open */
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    setSavingTpl(true);
    try {
      await onSaveTemplate({ ...draft, title: draft.title.trim() });
    } catch {
      /* toast shown by caller */
    } finally {
      setSavingTpl(false);
    }
  };

  const doDelete = async () => {
    if (!editing) return;
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
          disabled={savingTpl}
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
          <div className="flex flex-col gap-4">
            <Input
              type="text"
              placeholder="Tìm: chạy bộ, cầu lông, yoga…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              icon={<Search />}
              aria-label="Tìm hoạt động"
              enterKeyHint="search"
              trailing={
                query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm" className="-mr-2 grid h-11 w-11 place-items-center text-muted">
                    <X className="h-4 w-4" />
                  </button>
                ) : undefined
              }
            />

            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Nhóm hoạt động">
              <Chip selected={cat === 'all'} onClick={() => setCat('all')}>
                Tất cả
              </Chip>
              {WORKOUT_CATEGORIES.map((c) => (
                <Chip key={c} selected={cat === c} onClick={() => setCat(c)} dot={CATEGORY_COLOR[c]}>
                  {WORKOUT_CATEGORY_LABELS[c]}
                </Chip>
              ))}
            </div>

            {!query.trim() && cat === 'all' && recent.length > 0 && (
              <section aria-label="Gần đây">
                <p className="eyebrow mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" aria-hidden="true" /> Ghi lại nhanh
                </p>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                  {recent.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => pickRecent(w)}
                      className="glass-card flex min-h-[56px] w-[188px] shrink-0 items-center gap-2.5 p-2.5 pr-3 text-left transition-transform active:scale-[0.97]"
                    >
                      <ActivityIcon activity={w.activity} category={w.category} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-bold text-text">{w.title}</span>
                        <span className="block text-[12px] text-muted">
                          {w.duration_min} phút · MET {formatNumber(w.met, 1)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {query.trim() && (
              <button
                type="button"
                onClick={() => pickCustom(query)}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-dashed border-gold/40 px-3 text-left text-sm text-text hover:bg-white/[0.04]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold">
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  Dùng “<b className="font-bold">{query.trim()}</b>”
                  <span className="block text-[12px] text-muted">Hoạt động tự nhập · chỉnh MET sau</span>
                </span>
              </button>
            )}

            {grouped ? (
              grouped.map((g) => (
                <section key={g.c} aria-label={WORKOUT_CATEGORY_LABELS[g.c]}>
                  <p className="eyebrow mb-1.5 mt-1">{WORKOUT_CATEGORY_LABELS[g.c]}</p>
                  <ActivityList items={g.items} onPick={pick} selected={draft.activity} />
                </section>
              ))
            ) : results.length ? (
              <ActivityList items={results} onPick={pick} selected={draft.activity} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">Không thấy hoạt động phù hợp — dùng tên bạn vừa nhập ở trên.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 pb-2">
            {/* Selected activity */}
            <div className="glass-card flex items-center gap-3 p-3">
              <ActivityIcon activity={draft.activity} category={draft.category} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold tracking-[-0.02em] text-text">{act?.name ?? draft.activity}</p>
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
                onChange={(duration_min) => set({ duration_min })}
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
                  <Chip key={m} size="md" selected={draft.duration_min === m} onClick={() => set({ duration_min: m })}>
                    {m}′
                  </Chip>
                ))}
              </div>
            </div>

            {/* When */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ngày"
                type="date"
                value={draft.workout_on}
                onChange={(e) => {
                  const v = e.target.value;
                  set({ workout_on: v, ...(mode.kind === 'new' && isISODate(v) ? { status: defaultStatus(v, today) } : {}) });
                }}
                error={showErrors && !dateOk ? 'Ngày không hợp lệ.' : undefined}
              />
              <Input
                label="Giờ bắt đầu"
                type="time"
                value={draft.start_time}
                onChange={(e) => set({ start_time: e.target.value })}
                hint="Không bắt buộc"
              />
            </div>

            <Segmented<WorkoutStatus>
              ariaLabel="Trạng thái"
              value={draft.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'done', label: 'Đã tập', icon: <Check className="h-4 w-4" /> },
                { value: 'planned', label: 'Lên lịch', icon: <CalendarClock className="h-4 w-4" /> },
              ]}
            />

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

function ActivityList({ items, onPick, selected }: { items: ActivityDef[]; onPick: (a: ActivityDef) => void; selected: string }) {
  return (
    <ul className="flex flex-col">
      {items.map((a) => {
        const mets = a.variants.map((v) => v.met);
        const lo = Math.min(...mets);
        const hi = Math.max(...mets);
        const on = a.key === selected;
        return (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => onPick(a)}
              className={clsx(
                'flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]',
                on && 'bg-gold/10',
              )}
            >
              <ActivityIcon activity={a.key} category={a.category} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-text">{a.name}</span>
                <span className="block text-[12px] text-muted">
                  MET {lo === hi ? formatNumber(lo, 1) : `${formatNumber(lo, 1)}–${formatNumber(hi, 1)}`}
                  {a.variants.length > 1 ? ` · ${a.variants.length} mức` : ''}
                </span>
              </span>
              {on ? <Check className="h-5 w-5 text-gold" aria-hidden="true" /> : <Plus className="h-5 w-5 text-muted" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
