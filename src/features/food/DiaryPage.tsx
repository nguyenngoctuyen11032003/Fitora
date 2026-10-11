import { BookmarkCheck, ChevronLeft, ChevronRight, CopyPlus, Layers, Plus, ScanLine, Utensils } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { BigNumber, Button, EmptyState, GlassButton, GlassCard, MacroBar, ProgressBar, ScreenHeader, Skeleton, useToast } from '@/components/ui';
import { useProfile } from '@/context/ProfileContext';
import { FOODS } from '@/data/foods';
import { addDays, formatDayVi, isISODate, todayISO } from '@/lib/date';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { latestWeight } from '@/services/body';
import { listCustomFoods, markCustomFoodUsed } from '@/services/foods';
import { addMealEntries, deleteMeal, listMeals } from '@/services/meals';
import { getDaySummary } from '@/services/summary';
import { MEAL_LABELS, MEAL_TYPES, type MealEntry, type MealTemplate, type MealType } from '@/types/db';
import { FoodSheet } from './components/FoodSheet';
import { EntryThumb, MacroInline, MEAL_ICONS, portionLabel, useMealPhotoUrls } from './components/parts';
import { MealTemplatesSheet } from './components/MealTemplatesSheet';
import { QuickAddSheet } from './components/QuickAddSheet';
import { SaveTemplateSheet } from './components/SaveTemplateSheet';
import {
  copyEntries,
  diaryBalance,
  entryToInsert,
  groupByMeal,
  guessMeal,
  optionForEdit,
  sameDishes,
  sortByLogged,
  sumNutrients,
  templatesForMeal,
} from './lib';
import { useMealTemplates, type LogCallbacks } from './useSmartLog';

export default function DiaryPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { fit } = useProfile();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  // Future days can't be logged from the diary (the "next day" button stops at today) → clamp.
  const asked = params.get('date');
  const date = isISODate(asked) && asked < today ? asked : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const meals = useAsync(async () => ({ date, rows: await listMeals(date) }), [date]);
  const customs = useAsync(() => listCustomFoods(), []);
  const reloadCustoms = customs.reload;
  useEffect(() => onDataChanged((k) => (k === 'foods' || k === 'any') && void reloadCustoms()), [reloadCustoms]);
  const tpl = useMealTemplates();
  const { reload } = meals;
  useEffect(() => onDataChanged((k) => (k === 'meals' || k === 'any') && void reload()), [reload]);
  // Burn side of the balance (workouts + steps) — same source and formula as Today.
  // Best effort: if it fails the card falls back to "chưa tính tập luyện".
  const burn = useAsync(async () => {
    const [sum, w] = await Promise.all([getDaySummary(date), latestWeight().catch(() => null)]);
    return { date, sum, weightKg: w?.weight_kg ?? null };
  }, [date]);
  const reloadBurn = burn.reload;
  useEffect(
    () => onDataChanged((k) => (k === 'workouts' || k === 'daily' || k === 'body' || k === 'any') && void reloadBurn()),
    [reloadBurn],
  );
  useEffect(() => {
    if (meals.error) toast.error(meals.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals.error]);
  // Previous day, for "Chép từ hôm qua" on empty meals (best effort, never blocks the page).
  const prevDate = addDays(date, -1);
  const prev = useAsync(async () => ({ date: prevDate, rows: await listMeals(prevDate).catch(() => [] as MealEntry[]) }), [prevDate]);
  const prevGroups = useMemo(() => groupByMeal(prev.data?.date === prevDate ? prev.data.rows : []), [prev.data, prevDate]);

  // Refresh when the app comes back to the foreground (other device / tab may have logged,
  // and "today" may have rolled over) — at most every 30 s.
  const lastFocusReload = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastFocusReload.current < 30_000) return;
      lastFocusReload.current = Date.now();
      void reload();
      void reloadBurn();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload, reloadBurn]);

  // Logged order, so an edited entry keeps its place instead of jumping to the end of its meal.
  const rows = useMemo(() => (meals.data?.date === date ? sortByLogged(meals.data.rows) : []), [meals.data, date]);
  const loading = meals.loading && meals.data?.date !== date;
  const groups = useMemo(() => groupByMeal(rows), [rows]);
  const total = useMemo(() => sumNutrients(rows), [rows]);
  const photos = useMealPhotoUrls(rows);

  const burnFor = burn.data?.date === date ? burn.data : null;
  const balance = diaryBalance(fit, total.kcal, burnFor?.sum, burnFor?.weightKg, date);
  const { target, bonus } = balance;
  const left = balance.remaining;
  const targets = fit ? { protein_g: fit.protein_g ?? undefined, carbs_g: fit.carbs_g ?? undefined, fat_g: fit.fat_g ?? undefined } : null;
  const nextMeal = date === today ? guessMeal() : 'snack';

  // ---- edit sheets ----------------------------------------------------------
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const manual = editing?.source === 'manual';
  const option = useMemo(
    () => (editing && !manual ? optionForEdit(editing, FOODS, customs.data ?? []) : null),
    [editing, manual, customs.data],
  );

  const setRows = meals.setData;
  const upsert = useCallback(
    (e: MealEntry) =>
      setRows((d) => (d && d.date === e.eaten_on ? { ...d, rows: [...d.rows.filter((x) => x.id !== e.id), e] } : d && { ...d, rows: d.rows.filter((x) => x.id !== e.id) })),
    [setRows],
  );

  const remove = async (e: MealEntry) => {
    setEditing(null);
    setRows((d) => d && { ...d, rows: d.rows.filter((x) => x.id !== e.id) });
    try {
      await deleteMeal(e.id);
      notifyDataChanged('meals');
      toast.show(`Đã xóa ${e.name}.`, {
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            addMealEntries([entryToInsert(e)])
              .then(([row]) => {
                if (row) upsert(row);
                notifyDataChanged('meals');
              })
              .catch((err) => toast.error(err));
          },
        },
      });
    } catch (err) {
      upsert(e);
      toast.error(err);
    }
  };

  // ---- copy a meal from the previous day ---------------------------------------
  const [copying, setCopying] = useState<MealType | null>(null);
  const copyBusy = useRef(false);
  const copyMeal = async (meal: MealType) => {
    const source = prevGroups[meal];
    if (!source.length || copyBusy.current) return;
    copyBusy.current = true;
    setCopying(meal);
    try {
      const added = await addMealEntries(copyEntries(source, date, meal));
      setRows((d) => (d && d.date === date ? { ...d, rows: [...d.rows, ...added] } : d));
      notifyDataChanged('meals');
      // Saved foods eaten again count as a use (best effort, never throws).
      const ids = added.map((x) => x.custom_food_id).filter((x): x is string => !!x);
      if (ids.length) void markCustomFoodUsed(ids, meal).then((r) => r.length && notifyDataChanged('foods'));
      const label = MEAL_LABELS[meal].toLowerCase();
      toast.show(`Đã chép ${added.length} món vào ${label}.`, {
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            const ids = new Set(added.map((x) => x.id));
            setRows((d) => d && { ...d, rows: d.rows.filter((x) => !ids.has(x.id)) });
            Promise.all(added.map((x) => deleteMeal(x.id)))
              .then(() => notifyDataChanged('meals'))
              .catch((err) => {
                toast.error(err);
                void reload();
              });
          },
        },
      });
    } catch (err) {
      toast.error(err);
    } finally {
      copyBusy.current = false;
      setCopying(null);
    }
  };

  // ---- meal templates ("Bữa mẫu") -------------------------------------------
  const [saveFor, setSaveFor] = useState<MealType | null>(null);
  const [templatesFor, setTemplatesFor] = useState<MealType | null>(null);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const logCb: LogCallbacks = useMemo(
    () => ({
      onAdded: (added) => setRows((d) => (d && d.date === date ? { ...d, rows: [...d.rows, ...added] } : d)),
      onRemoved: (ids) => {
        const gone = new Set(ids);
        setRows((d) => d && { ...d, rows: d.rows.filter((x) => !gone.has(x.id)) });
      },
    }),
    [setRows, date],
  );
  const logTemplate = async (t: MealTemplate, meal: MealType) => {
    if (templateBusy) return false;
    setTemplateBusy(t.id);
    const added = await tpl.log(t, date, meal, logCb);
    setTemplateBusy(null);
    return !!added;
  };

  return (
    <Page label="Nhật ký ăn">
      <ScreenHeader eyebrow="Nhật ký ăn" title={formatDayVi(date)} subtitle={formatDayVi(date, 'long')} />

      {/* Day navigation */}
      <nav aria-label="Chọn ngày" className="mt-4 flex items-center gap-2">
        <GlassButton label="Ngày trước" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </GlassButton>
        <div className="flex flex-1 justify-center">
          {date !== today && (
            <GlassButton variant="pill" onClick={() => setDate(today)}>
              Về hôm nay
            </GlassButton>
          )}
        </div>
        <GlassButton label="Ngày sau" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
          <ChevronRight className="h-5 w-5" />
        </GlassButton>
      </nav>

      {/* Day summary */}
      <GlassCard as="section" padding="lg" className="mt-4" aria-label="Tổng trong ngày">
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <BigNumber value={total.kcal} unit="kcal" label="Đã nạp" size="lg" tone="gold" />
            <div className="mt-3 flex items-baseline justify-between gap-3 whitespace-nowrap">
              <p className="text-[14px] text-muted">
                {left >= 0 ? 'Còn lại ' : 'Vượt '}
                <span className={left >= 0 ? 'tabular text-[20px] font-bold text-text' : 'tabular text-[20px] font-bold text-[var(--danger-text)]'}>
                  {formatNumber(Math.abs(left))}
                </span>{' '}
                kcal
              </p>
              <p className="tabular text-[13px] text-muted">Mục tiêu {formatNumber(target)} kcal</p>
            </div>
            <ProgressBar value={total.kcal} max={burnFor ? balance.budget : target} label="Calo đã nạp so với mục tiêu" className="mt-4" />
            <p className="mt-2 text-[12px] text-muted">
              {!burnFor
                ? 'Còn lại chưa tính tập luyện.'
                : bonus > 0
                  ? `Đã cộng ${formatNumber(bonus)} kcal vận động vượt mức có sẵn trong mục tiêu (giống màn Hôm nay).`
                  : 'Mục tiêu đã gồm vận động hằng ngày (giống màn Hôm nay).'}
            </p>
            <MacroBar protein_g={total.protein_g} carbs_g={total.carbs_g} fat_g={total.fat_g} targets={targets} className="mt-5" />
          </>
        )}
      </GlassCard>

      {/* Meals */}
      <div className="mt-6 flex flex-col gap-4">
        {MEAL_TYPES.map((m) => (
          <MealCard
            key={m}
            meal={m}
            date={date}
            entries={groups[m]}
            loading={loading}
            photos={photos}
            highlight={m === nextMeal && rows.length === 0}
            onEdit={setEditing}
            copyFrom={groups[m].length === 0 ? prevGroups[m] : []}
            copyLabel={date === today ? 'hôm qua' : 'ngày trước'}
            copying={copying === m}
            onCopy={copyMeal}
            templates={templatesForMeal(tpl.templates, m, 2)}
            allTemplates={tpl.templates.length}
            savedAs={groups[m].length ? tpl.templates.find((t) => sameDishes(t.items, groups[m])) : undefined}
            templateBusy={templateBusy}
            onLogTemplate={(t) => void logTemplate(t, m)}
            onOpenTemplates={() => setTemplatesFor(m)}
            onSaveTemplate={() => setSaveFor(m)}
          />
        ))}
      </div>

      {!loading && rows.length === 0 && (
        <EmptyState
          className="mt-6"
          icon={Utensils}
          title={date === today ? 'Hôm nay chưa ghi món nào' : 'Ngày này chưa có món nào'}
          description="Chụp ảnh để AI tính calo, hoặc tìm trong hơn 150 món Việt quen thuộc."
          action={
            <Button icon={<ScanLine className="h-4 w-4" />} onClick={() => navigate(`/scan?meal=${nextMeal}&date=${date}`)}>
              Scan bữa ăn
            </Button>
          }
        />
      )}

      <FoodSheet
        open={!!editing && !manual}
        onClose={() => setEditing(null)}
        option={option}
        date={date}
        meal={editing?.meal ?? 'snack'}
        entry={editing && !manual ? editing : null}
        onSaved={upsert}
        onDelete={remove}
      />
      <QuickAddSheet
        open={!!editing && manual}
        onClose={() => setEditing(null)}
        date={date}
        meal={editing?.meal ?? 'snack'}
        entry={editing && manual ? editing : null}
        onSaved={upsert}
        onDelete={remove}
      />
      <SaveTemplateSheet
        open={!!saveFor}
        onClose={() => setSaveFor(null)}
        meal={saveFor ?? 'breakfast'}
        entries={saveFor ? groups[saveFor] : []}
        existingNames={tpl.templates.map((t) => t.name)}
        onSave={tpl.create}
      />
      <MealTemplatesSheet
        open={!!templatesFor}
        onClose={() => setTemplatesFor(null)}
        templates={tpl.templates}
        meal={templatesFor ?? nextMeal}
        onLog={logTemplate}
        onRename={tpl.rename}
        onDelete={tpl.remove}
      />
    </Page>
  );
}

function MealCard({
  meal,
  date,
  entries,
  loading,
  photos,
  highlight,
  onEdit,
  copyFrom,
  copyLabel,
  copying,
  onCopy,
  templates,
  allTemplates,
  savedAs,
  templateBusy,
  onLogTemplate,
  onOpenTemplates,
  onSaveTemplate,
}: {
  meal: MealType;
  date: string;
  entries: MealEntry[];
  loading: boolean;
  photos: Record<string, string>;
  highlight: boolean;
  onEdit: (e: MealEntry) => void;
  /** Same meal of the previous day, offered when this meal is empty. */
  copyFrom: MealEntry[];
  copyLabel: string;
  copying: boolean;
  onCopy: (meal: MealType) => void;
  /** Templates offered on an empty meal (one tap logs the whole meal). */
  templates: MealTemplate[];
  /** Total number of templates (for "Bữa mẫu khác"). */
  allTemplates: number;
  /** Template with exactly these dishes, if any. */
  savedAs?: MealTemplate;
  templateBusy: string | null;
  onLogTemplate: (t: MealTemplate) => void;
  onOpenTemplates: () => void;
  onSaveTemplate: () => void;
}) {
  const Icon = MEAL_ICONS[meal];
  const sum = useMemo(() => sumNutrients(entries), [entries]);
  const copyKcal = useMemo(() => sumNutrients(copyFrom).kcal, [copyFrom]);
  const headingId = `meal-${meal}`;
  return (
    <GlassCard as="section" padding="md" accent={highlight} aria-labelledby={headingId}>
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-gold" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[17px] font-bold tracking-[-0.02em] text-text">
            {MEAL_LABELS[meal]}
          </h2>
          <p className="tabular text-[13px] text-muted">{entries.length ? `${formatNumber(sum.kcal)} kcal · ${entries.length} món` : 'Chưa có món'}</p>
        </div>
        <Link
          to={`/scan?meal=${meal}&date=${date}`}
          aria-label={`Scan món cho ${MEAL_LABELS[meal].toLowerCase()}`}
          className="glass grid h-11 w-11 place-items-center rounded-full text-text"
        >
          <ScanLine className="h-5 w-5" aria-hidden="true" />
        </Link>
        <Link
          to={`/food/search?meal=${meal}&date=${date}`}
          aria-label={`Thêm món vào ${MEAL_LABELS[meal].toLowerCase()}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-gold text-[#1a0e02] transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>

      {!loading && entries.length === 0 && copyFrom.length > 0 && (
        <button
          type="button"
          onClick={() => onCopy(meal)}
          disabled={copying}
          aria-busy={copying}
          className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-60"
        >
          <CopyPlus className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-text">{copying ? 'Đang chép…' : `Chép từ ${copyLabel}`}</span>
            {' · '}
            {copyFrom.length} món · <span className="tabular">{formatNumber(copyKcal)} kcal</span>
          </span>
        </button>
      )}

      {!loading && entries.length === 0 && templates.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {templates.map((t) => {
            const busy = templateBusy === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onLogTemplate(t)}
                disabled={!!templateBusy}
                aria-busy={busy}
                aria-label={`Ghi bữa mẫu ${t.name} (${t.items.length} món, ${formatNumber(t.total_kcal)} kcal) vào ${MEAL_LABELS[meal].toLowerCase()}`}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-gold/25 bg-gold/[0.06] px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-gold/10 disabled:opacity-60"
              >
                <Layers className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-text">{busy ? 'Đang ghi…' : t.name}</span>
                  {' · '}
                  {t.items.length} món · <span className="tabular">{formatNumber(t.total_kcal)} kcal</span>
                </span>
              </button>
            );
          })}
          {allTemplates > templates.length && (
            <button type="button" onClick={onOpenTemplates} className="min-h-[44px] self-start rounded-full px-1 text-[13px] font-semibold text-gold">
              Bữa mẫu khác…
            </button>
          )}
        </div>
      )}

      {loading ? (
        <Skeleton className="mt-4 h-14 w-full" />
      ) : (
        entries.length > 0 && (
          <ul className="mt-3 flex flex-col">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEdit(e)}
                  className="-mx-2 flex min-h-[64px] w-[calc(100%+16px)] items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                >
                  <EntryThumb entry={e} url={e.photo_path ? photos[e.photo_path] : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">{e.name}</span>
                    <span className="block truncate text-[12px] text-muted">{portionLabel(e.quantity, e.unit, e.grams)}</span>
                    <MacroInline p={e.protein_g} c={e.carbs_g} f={e.fat_g} className="mt-0.5" />
                  </span>
                  <span className="tabular shrink-0 text-right text-[15px] font-bold text-text">
                    {formatNumber(e.kcal)}
                    <span className="ml-0.5 text-[11px] font-semibold text-muted">kcal</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {!loading && entries.length > 0 && (
        <div className="mt-1 flex justify-end">
          {savedAs ? (
            <button
              type="button"
              onClick={onOpenTemplates}
              className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-muted transition-colors hover:text-text"
            >
              <BookmarkCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="truncate">Đã có bữa mẫu “{savedAs.name}”</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSaveTemplate}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-gold transition-opacity hover:opacity-80"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Lưu thành bữa mẫu
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}
