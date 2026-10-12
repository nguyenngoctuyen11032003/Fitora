import clsx from 'clsx';
import { Check, Layers, Search, Sparkles, UtensilsCrossed } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { FoodSheet } from '@/features/food/components/FoodSheet';
import { fromCustomFood, MEAL_SHORT, servingUnit } from '@/features/food/lib';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { logCustomFood, markCustomFoodUsed, unmarkCustomFoodUsed, type CustomFoodUsage } from '@/services/foods';
import { logMealTemplate } from '@/services/mealTemplates';
import { deleteMeal, mealPhotoUrl } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type CustomFood, type MealEntry, type MealTemplate, type MealType } from '@/types/db';
import { loggedFoodIds, loggedMessage, rankQuickItems, stableOrder, type QuickItem } from '../quickRelog';
import { useQuickRelog } from '../useQuickRelog';

interface Props {
  date: string;
  /** Meal suggested for the current time; a tap logs into it. */
  meal: MealType;
  /** Today's entries (to mark foods already logged at this meal). */
  meals: MealEntry[];
  /** Reflect added / removed entries on the dashboard right away. */
  onApplied: (added: MealEntry[], removedIds: string[]) => void;
  className?: string;
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const DONE_MS = 1600;

/** Signed URLs are valid 1 h; cache per path for the session (re-requested after 50 min). */
const photoCache = new Map<string, { at: number; url: Promise<string> }>();
function photoUrl(path: string): Promise<string> {
  const hit = photoCache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.url;
  const url = mealPhotoUrl(path);
  photoCache.set(path, { at: Date.now(), url });
  url.catch(() => photoCache.delete(path));
  return url;
}

function Thumb({ path, template }: { path: string | null; template: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setUrl(null);
    setBroken(false);
    if (!path) return;
    let on = true;
    photoUrl(path).then(
      (u) => on && setUrl(u),
      () => on && setBroken(true),
    );
    return () => {
      on = false;
    };
  }, [path]);
  const Icon = template ? Layers : UtensilsCrossed;
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-gold/10 text-gold" aria-hidden="true">
      {url && !broken ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className="h-[18px] w-[18px]" />
      )}
    </span>
  );
}

type TileState = 'idle' | 'busy' | 'done';

interface TileProps {
  item: QuickItem;
  state: TileState;
  logged: boolean;
  mealLabel: string;
  onTap: (item: QuickItem) => void;
  onMore: (item: QuickItem) => void;
}

/** One tile: tap = log one serving now; long-press / right-click / Shift+Enter = choose portion. */
const Tile = memo(function Tile({ item, state, logged, mealLabel, onTap, onMore }: TileProps) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);
  const name = item.kind === 'food' ? item.food.name : item.template.name;
  const photo = item.kind === 'food' ? item.food.photo_path : null;

  const clear = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    longFired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      start.current = null;
      navigator.vibrate?.(12);
      onMore(item);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const s = start.current;
    if (s && (Math.abs(e.clientX - s.x) > MOVE_TOLERANCE || Math.abs(e.clientY - s.y) > MOVE_TOLERANCE)) clear();
  };
  const onClick = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    onTap(item);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onMore(item);
    }
  };

  const busy = state === 'busy';
  const done = state === 'done';
  const label = `Ghi ${name}, ${item.portion}, ${formatNumber(item.kcal)} kcal vào ${mealLabel.toLowerCase()}`;

  return (
    <li className="w-[152px] shrink-0 snap-start">
      <button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clear}
        onPointerCancel={clear}
        onPointerLeave={clear}
        onContextMenu={(e) => {
          e.preventDefault();
          clear();
          if (!longFired.current) onMore(item);
          longFired.current = true;
        }}
        onKeyDown={onKeyDown}
        disabled={busy}
        aria-label={label}
        aria-describedby="quick-relog-hint"
        className={clsx(
          'glass-card relative flex h-full min-h-[112px] w-full select-none flex-col gap-2 rounded-2xl p-3 text-left transition-transform [-webkit-touch-callout:none] active:scale-[0.97]',
          done && 'ring-1 ring-ok/60',
        )}
      >
        <span className="flex w-full items-start justify-between gap-2">
          <Thumb path={photo} template={item.kind === 'template'} />
          {busy ? (
            <Spinner size={16} className="mt-1 text-gold" label="Đang ghi" />
          ) : done ? (
            <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-ok/20 text-ok" aria-hidden="true">
              <Check className="h-4 w-4" />
            </span>
          ) : logged ? (
            <span className="mt-0.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-muted">Đã ghi</span>
          ) : item.kind === 'template' ? (
            <span className="mt-0.5 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">Bữa mẫu</span>
          ) : null}
        </span>
        <span className="line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-[1.25] text-text">{name}</span>
        <span className="mt-auto flex w-full items-baseline justify-between gap-1.5">
          <span className="min-w-0 truncate text-[11.5px] font-medium text-muted">{item.portion}</span>
          <span className="shrink-0 text-[12.5px] font-bold text-text">
            <span className="tabular">{formatNumber(item.kcal)}</span>
            <span className="ml-0.5 text-[10px] font-semibold text-muted">kcal</span>
          </span>
        </span>
      </button>
    </li>
  );
});

/** Preview of a meal template: its items, the meal to log into, then one button. */
function TemplateSheet({
  template,
  meal: defaultMeal,
  onClose,
  onLog,
}: {
  template: MealTemplate | null;
  meal: MealType;
  onClose: () => void;
  onLog: (t: MealTemplate, meal: MealType) => Promise<boolean>;
}) {
  const last = useRef<MealTemplate | null>(template);
  if (template) last.current = template;
  const t = template ?? last.current;
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (template) {
      setMeal(defaultMeal);
      setSaving(false);
    }
  }, [template, defaultMeal]);
  if (!t) return null;
  const total = Math.round(t.items.reduce((a, it) => a + Math.max(0, Number(it.kcal) || 0), 0));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onLog(t, meal);
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <BottomSheet
      open={!!template}
      onClose={onClose}
      title={t.name}
      description={`Bữa mẫu · ${t.items.length} món · ${formatNumber(total)} kcal`}
      footer={
        <Button block size="lg" loading={saving} onClick={() => void save()}>
          Ghi cả bữa · {formatNumber(total)} kcal
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          ariaLabel="Ghi vào bữa"
          value={meal}
          onChange={setMeal}
          size="sm"
          options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))}
        />
        <ul className="glass-card divide-y divide-white/[0.06] p-0">
          {t.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-text">{it.name}</span>
                <span className="block truncate text-[12px] text-muted">
                  {formatNumber(it.quantity, 2)} {it.unit}
                  {Number(it.grams) > 0 ? ` · ${formatNumber(it.grams)} g` : ''}
                </span>
              </span>
              <span className="tabular shrink-0 text-[14px] font-bold text-text">
                {formatNumber(it.kcal)} <span className="text-[11px] font-semibold text-muted">kcal</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}

/**
 * "Ăn lại nhanh": the saved foods / meal templates the user most likely wants at this
 * meal (usual meal → frequency → recency). One tap logs one default serving with an undo
 * toast; long-press (or right-click / Shift+Enter) opens the portion sheet.
 */
export const QuickRelogStrip = memo(function QuickRelogStrip({ date, meal, meals, onApplied, className }: Props) {
  const toast = useToast();
  const { foods, templates, loading, failed } = useQuickRelog();
  const [states, setStates] = useState<Record<string, TileState>>({});
  const busyKeys = useRef(new Set<string>());
  const doneTimers = useRef(new Map<string, number>());
  const [sheetFood, setSheetFood] = useState<CustomFood | null>(null);
  const [sheetTemplate, setSheetTemplate] = useState<MealTemplate | null>(null);
  const mealLabel = MEAL_LABELS[meal];
  /** Latest saved foods for usage snapshots (taken right before a log, restored by undo). */
  const foodsRef = useRef(foods);
  foodsRef.current = foods;
  const usageOf = useCallback((ids: Array<string | null | undefined>): CustomFoodUsage[] => {
    const want = new Set(ids.filter((x): x is string => !!x));
    return foodsRef.current
      .filter((f) => want.has(f.id))
      .map((f) => ({ id: f.id, last_used_at: f.last_used_at, default_meal: f.default_meal }));
  }, []);

  useEffect(() => {
    const timers = doneTimers.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // Rank once per meal; later refetches (usage counters bumped by a tap) keep positions.
  const order = useRef<{ meal: MealType; keys: string[] }>({ meal, keys: [] });
  const items = useMemo(() => {
    const ranked = rankQuickItems({ foods, templates, meal, date, now: new Date() });
    const prev = order.current.meal === meal ? order.current.keys : [];
    const out = stableOrder(ranked, prev);
    order.current = { meal, keys: out.map((x) => x.key) };
    return out;
  }, [foods, templates, meal, date]);
  const logged = useMemo(() => loggedFoodIds(meals, meal), [meals, meal]);

  const setState = useCallback((key: string, s: TileState) => {
    setStates((m) => ({ ...m, [key]: s }));
  }, []);

  const undo = useCallback(
    async (rows: MealEntry[], name: string, usage: CustomFoodUsage[]) => {
      const res = await Promise.allSettled(rows.map((r) => deleteMeal(r.id)));
      const removed = rows.filter((_, i) => res[i].status === 'fulfilled').map((r) => r.id);
      if (removed.length) onApplied([], removed);
      // Nothing was eaten after all: give the saved foods their usage count / usual meal back
      // (only when every entry is gone, otherwise the log still stands).
      if (usage.length && removed.length === rows.length) {
        await unmarkCustomFoodUsed(usage);
        notifyDataChanged('foods');
      }
      notifyDataChanged('meals');
      const err = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (err) toast.error(err.reason);
      else toast.info(`Đã bỏ ${name} khỏi ${mealLabel.toLowerCase()}`);
    },
    [onApplied, toast, mealLabel],
  );

  /** Shared success path: dashboard + other screens + toast with undo. */
  const afterLog = useCallback(
    (key: string | null, rows: MealEntry[], name: string, kcal: number, at: MealType, usage: CustomFoodUsage[]) => {
      onApplied(rows, []);
      notifyDataChanged('meals');
      if (key) {
        setState(key, 'done');
        window.clearTimeout(doneTimers.current.get(key));
        doneTimers.current.set(
          key,
          window.setTimeout(() => setStates((m) => ({ ...m, [key]: 'idle' })), DONE_MS),
        );
      }
      const id = toast.success(loggedMessage(name, kcal, MEAL_LABELS[at]), {
        duration: 6000,
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            toast.dismiss(id);
            void undo(rows, name, usage);
          },
        },
      });
    },
    [onApplied, setState, toast, undo],
  );

  const logTemplate = useCallback(
    async (t: MealTemplate, at: MealType, key: string | null): Promise<boolean> => {
      try {
        // Foods linked from the template get their usage bumped too; undo restores them.
        const usage = usageOf(t.items.map((i) => i?.custom_food_id));
        const rows = await logMealTemplate(t, date, at);
        afterLog(key, rows, t.name, Math.round(rows.reduce((a, r) => a + (Number(r.kcal) || 0), 0)), at, usage);
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    [afterLog, date, toast, usageOf],
  );

  const onTap = useCallback(
    async (item: QuickItem) => {
      // Synchronous guard: a double tap must not log the dish twice.
      if (busyKeys.current.has(item.key)) return;
      busyKeys.current.add(item.key);
      setState(item.key, 'busy');
      try {
        if (item.kind === 'food') {
          const usage = usageOf([item.food.id]);
          const row = await logCustomFood(item.food, date, meal, 1);
          afterLog(item.key, [row], item.food.name, Math.round(Number(row.kcal) || 0), meal, usage);
        } else if (!(await logTemplate(item.template, meal, item.key))) {
          setState(item.key, 'idle');
        }
      } catch (e) {
        toast.error(e);
        setState(item.key, 'idle');
      } finally {
        busyKeys.current.delete(item.key);
      }
    },
    [afterLog, date, logTemplate, meal, setState, toast, usageOf],
  );

  const tap = useCallback((item: QuickItem) => void onTap(item), [onTap]);

  const onMore = useCallback((item: QuickItem) => {
    if (item.kind === 'food') setSheetFood(item.food);
    else setSheetTemplate(item.template);
  }, []);

  const foodOption = useMemo(() => (sheetFood ? fromCustomFood(sheetFood) : null), [sheetFood]);
  const searchHref = `/food/search?meal=${meal}&date=${date}`;

  if (failed) return null;

  return (
    <section aria-labelledby="quick-relog-title" className={className}>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="quick-relog-title" className="flex items-center gap-1.5 text-[17px] font-bold tracking-[-0.02em] text-text">
            <Sparkles className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <span className="truncate">Ăn lại nhanh</span>
          </h2>
          <p id="quick-relog-hint" className="mt-0.5 text-[12px] leading-snug text-muted">
            {items.length ? `Chạm để ghi vào ${mealLabel.toLowerCase()} · giữ để đổi khẩu phần` : `Cho ${mealLabel.toLowerCase()}`}
          </p>
        </div>
        <Link
          to={searchHref}
          className="-mr-2 -mt-2.5 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-gold transition-opacity hover:opacity-80"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Tìm món
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-2.5 overflow-hidden" role="status" aria-label="Đang tải món đã lưu">
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gold/10 text-gold" aria-hidden="true">
            <UtensilsCrossed className="h-[18px] w-[18px]" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
            Món bạn scan hoặc lưu sẽ hiện ở đây — lần sau chỉ cần <span className="font-semibold text-text">một chạm</span> để ghi lại, không phải scan nữa.
          </p>
        </div>
      ) : (
        <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1">
          {items.map((it) => (
            <Tile
              key={it.key}
              item={it}
              state={states[it.key] ?? 'idle'}
              logged={it.kind === 'food' && logged.has(it.food.id)}
              mealLabel={mealLabel}
              onTap={tap}
              onMore={onMore}
            />
          ))}
        </ul>
      )}

      <FoodSheet
        open={!!sheetFood}
        onClose={() => setSheetFood(null)}
        option={foodOption}
        date={date}
        meal={meal}
        initial={sheetFood ? { quantity: 1, unit: servingUnit(sheetFood.serving_label) } : null}
        onSaved={(entry, mode) => {
          if (mode !== 'add') return;
          onApplied([entry], []);
          if (entry.custom_food_id) void markCustomFoodUsed(entry.custom_food_id, entry.meal);
        }}
      />
      <TemplateSheet
        template={sheetTemplate}
        meal={meal}
        onClose={() => setSheetTemplate(null)}
        onLog={(t, at) => logTemplate(t, at, `template:${t.id}`)}
      />
    </section>
  );
});
