import { ChevronLeft, ChevronRight, Plus, ScanLine, Utensils } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { BigNumber, Button, EmptyState, GlassButton, GlassCard, MacroBar, ProgressBar, ScreenHeader, Skeleton, useToast } from '@/components/ui';
import { useProfile } from '@/context/ProfileContext';
import { FOODS } from '@/data/foods';
import { addDays, formatDayVi, isISODate, todayISO } from '@/lib/date';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { listCustomFoods } from '@/services/foods';
import { addMealEntries, deleteMeal, listMeals } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type MealEntry, type MealType, type NewMealEntry } from '@/types/db';
import { FoodSheet } from './components/FoodSheet';
import { EntryThumb, MacroInline, MEAL_ICONS, portionLabel, useMealPhotoUrls } from './components/parts';
import { QuickAddSheet } from './components/QuickAddSheet';
import { groupByMeal, guessMeal, optionForEntry, sumNutrients } from './lib';

function toInsert(e: MealEntry): NewMealEntry {
  const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...rest } = e;
  return rest;
}

export default function DiaryPage() {
  const toast = useToast();
  const { fit } = useProfile();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const date = isISODate(params.get('date')) ? params.get('date')! : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const meals = useAsync(async () => ({ date, rows: await listMeals(date) }), [date]);
  const customs = useAsync(() => listCustomFoods(), []);
  const { reload } = meals;
  useEffect(() => onDataChanged((k) => (k === 'meals' || k === 'any') && void reload()), [reload]);
  useEffect(() => {
    if (meals.error) toast.error(meals.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals.error]);

  const rows = useMemo(() => (meals.data?.date === date ? meals.data.rows : []), [meals.data, date]);
  const loading = meals.loading && meals.data?.date !== date;
  const groups = useMemo(() => groupByMeal(rows), [rows]);
  const total = useMemo(() => sumNutrients(rows), [rows]);
  const photos = useMealPhotoUrls(rows);

  const target = fit?.calorie_target ?? 2000;
  const left = target - total.kcal;
  const targets = fit ? { protein_g: fit.protein_g ?? undefined, carbs_g: fit.carbs_g ?? undefined, fat_g: fit.fat_g ?? undefined } : null;
  const nextMeal = date === today ? guessMeal() : 'snack';

  // ---- edit sheets ----------------------------------------------------------
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const manual = editing?.source === 'manual';
  const option = useMemo(
    () => (editing && !manual ? optionForEntry(editing, FOODS, customs.data ?? []) : null),
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
            addMealEntries([toInsert(e)])
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
            <div className="flex items-end justify-between gap-4">
              <BigNumber value={total.kcal} unit="kcal" label="Đã nạp" size="lg" tone="gold" />
              <div className="pb-1 text-right">
                <p className="text-[13px] font-semibold text-muted">{left >= 0 ? 'Còn lại' : 'Vượt mục tiêu'}</p>
                <p className={left >= 0 ? 'tabular text-[22px] font-bold text-text' : 'tabular text-[22px] font-bold text-[var(--danger-text)]'}>
                  {formatNumber(Math.abs(left))}
                </p>
                <p className="text-[12px] text-muted">/ {formatNumber(target)} kcal</p>
                <p className="text-[11px] text-muted">chưa tính tập luyện</p>
              </div>
            </div>
            <ProgressBar value={total.kcal} max={target} label="Calo đã nạp so với mục tiêu" className="mt-4" />
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
            <Link to={`/scan?meal=${nextMeal}&date=${date}`}>
              <Button icon={<ScanLine className="h-4 w-4" />}>Scan bữa ăn</Button>
            </Link>
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
}: {
  meal: MealType;
  date: string;
  entries: MealEntry[];
  loading: boolean;
  photos: Record<string, string>;
  highlight: boolean;
  onEdit: (e: MealEntry) => void;
}) {
  const Icon = MEAL_ICONS[meal];
  const sum = sumNutrients(entries);
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
    </GlassCard>
  );
}
