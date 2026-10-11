import { BookmarkPlus, CalendarDays, Check, Plus, Search, Sparkles, Utensils } from 'lucide-react';
import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { MacroBar } from '@/components/ui/MacroBar';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, isISODate, todayISO } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { normalizeFoodName } from '@/services/foods';
import { MEAL_LABELS, MEAL_TYPES, type CustomFood, type MealType } from '@/types/db';
import { AddDishForm } from './AddDishForm';
import { DishCard } from './DishCard';
import { applySavedFood, matchSavedFood, remembers, revertSavedFood } from './saved';
import { insertAt, isDishValid, totals, type ScanDish } from './scale';

const MEAL_SHORT: Record<MealType, string> = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối', snack: 'Ăn vặt' };

interface ReviewSheetProps {
  open: boolean;
  onClose: () => void;
  photoUrl: string | null;
  dishes: ScanDish[];
  /** Accepts a list or an updater (React state setter) so edits never act on a stale list. */
  onDishesChange: Dispatch<SetStateAction<ScanDish[]>>;
  notes?: string;
  meal: MealType;
  onMealChange: (m: MealType) => void;
  date: string;
  onDateChange: (d: string) => void;
  saving: boolean;
  onSave: () => void;
  manualHref: string;
  /** All saved foods ("Món của tôi") — matched by name to offer the user's own numbers. */
  foods?: CustomFood[];
  /** Saved foods ranked for this meal (suggestions when adding a dish). */
  rankedFoods?: CustomFood[];
}

export function ReviewSheet({
  open,
  onClose,
  photoUrl,
  dishes,
  onDishesChange,
  notes,
  meal,
  onMealChange,
  date,
  onDateChange,
  saving,
  onSave,
  manualHref,
  foods = [],
  rankedFoods = [],
}: ReviewSheetProps) {
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const dateId = useId();
  const sum = useMemo(() => totals(dishes), [dishes]);
  const invalid = dishes.some((d) => !isDishValid(d));
  const canSave = dishes.length > 0 && !invalid && !saving;
  const aiCount = dishes.filter((d) => d.original).length;
  const today = todayISO();
  const description = !dishes.length
    ? undefined
    : aiCount === dishes.length
      ? `AI nhận ra ${aiCount} món — kiểm tra lại khẩu phần trước khi lưu.`
      : aiCount > 0
        ? `${aiCount} món do AI nhận ra, ${dishes.length - aiCount} món bạn tự thêm — kiểm tra lại trước khi lưu.`
        : `${dishes.length} món tự nhập — kiểm tra lại trước khi lưu.`;

  const rememberCount = dishes.filter(remembers).length;
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  const update = (next: ScanDish) => {
    let d = next;
    // Renamed to another dish → it no longer uses that saved food's numbers.
    if (d.savedFoodId) {
      const linked = foodById.get(d.savedFoodId);
      if (linked && normalizeFoodName(linked.name) !== normalizeFoodName(d.name)) d = { ...d, savedFoodId: null, aiBackup: null };
    }
    onDishesChange((list) => list.map((x) => (x.key === d.key ? d : x)));
  };
  const applySaved = (d: ScanDish, food: CustomFood) => {
    onDishesChange((list) => list.map((x) => (x.key === d.key ? applySavedFood(x, food) : x)));
  };
  const matchable = useMemo(
    () =>
      dishes.flatMap((dish) => {
        const food = dish.savedFoodId ? null : matchSavedFood(dish.name, foods);
        return food ? [{ dish, food }] : [];
      }),
    [dishes, foods],
  );
  const applyAllSaved = () => {
    const byKey = new Map(matchable.map((m) => [m.dish.key, m.food]));
    onDishesChange((list) => list.map((x) => (byKey.has(x.key) && !x.savedFoodId ? applySavedFood(x, byKey.get(x.key)!) : x)));
  };
  const revertSaved = (d: ScanDish) => onDishesChange((list) => list.map((x) => (x.key === d.key ? revertSavedFood(x) : x)));
  const remove = (d: ScanDish) => {
    const index = dishes.findIndex((x) => x.key === d.key);
    onDishesChange((list) => list.filter((x) => x.key !== d.key));
    toast.show(`Đã xóa ${d.name.trim() || 'món'}`, {
      kind: 'info',
      duration: 5000,
      action: { label: 'Hoàn tác', onClick: () => onDishesChange((list) => (list.some((x) => x.key === d.key) ? list : insertAt(list, index, d))) },
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="full"
      dismissible={!saving}
      title="Kết quả quét"
      description={description}
      footer={
        <Button size="lg" block onClick={onSave} disabled={!canSave} loading={saving} icon={<Check className="h-5 w-5" />}>
          {saving ? 'Đang lưu…' : `Lưu vào nhật ký · ${formatNumber(sum.kcal)} kcal`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Hero: photo + giant total */}
        <section className="flex items-stretch gap-4" aria-label="Tổng cộng">
          {photoUrl && (
            <img
              src={photoUrl}
              alt="Ảnh món ăn vừa quét"
              className="h-[112px] w-[112px] shrink-0 rounded-[22px] object-cover ring-1 ring-white/10 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)]"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="eyebrow">Tổng năng lượng</span>
            <span className="mt-2 flex items-baseline gap-1.5 animate-speed-reveal">
              <span className="num text-[64px] text-gradient-gold">
                <CountUp value={sum.kcal} duration={900} />
              </span>
              <span className="text-[15px] font-semibold text-muted">kcal</span>
            </span>
          </div>
        </section>

        {dishes.length > 0 && <MacroBar variant="stacked" protein_g={sum.protein_g} carbs_g={sum.carbs_g} fat_g={sum.fat_g} />}

        {/* Where it goes */}
        <section className="glass-card flex flex-col gap-3 p-4" aria-label="Bữa và ngày">
          <Segmented<MealType>
            ariaLabel="Bữa ăn"
            size="sm"
            value={meal}
            onChange={onMealChange}
            options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))}
          />
          <div className="flex items-center gap-3">
            <label htmlFor={dateId} className="flex shrink-0 items-center gap-2 pl-1 text-[13px] font-semibold text-muted">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Ngày
            </label>
            <div className="field min-h-[48px] flex-1">
              <input
                id={dateId}
                type="date"
                value={date}
                max={today}
                onChange={(e) => isISODate(e.target.value) && e.target.value <= today && onDateChange(e.target.value)}
                className="scan-date !py-2.5 text-[15px] font-semibold"
              />
            </div>
          </div>
          <p className="pl-1 text-[13px] text-muted">
            Lưu vào <span className="font-semibold text-text">{MEAL_LABELS[meal]}</span> · {formatDayVi(date, 'relative')}
          </p>
        </section>

        {notes && <p className="rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-muted">{notes}</p>}

        {matchable.length > 0 && (
          <section className="flex items-center gap-3 rounded-2xl border border-[rgba(237,180,11,0.35)] bg-[rgba(237,180,11,0.08)] p-3" aria-label="Món đã lưu">
            <Sparkles className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-text/90">
              {matchable.length === 1
                ? `${matchable[0].dish.name.trim()} đã có trong Món của tôi.`
                : `${matchable.length} món đã có trong Món của tôi.`}
            </p>
            <button
              type="button"
              onClick={applyAllSaved}
              className="min-h-[44px] shrink-0 rounded-full bg-gold px-4 text-[13px] font-bold text-[#1a0e02] active:scale-[0.98]"
            >
              Dùng số liệu đã lưu
            </button>
          </section>
        )}

        {/* Dishes */}
        <section className="flex flex-col gap-3" aria-label="Danh sách món">
          {dishes.map((d, i) => (
            <DishCard
              key={d.key}
              dish={d}
              index={i}
              onChange={update}
              onRemove={() => remove(d)}
              saved={d.savedFoodId ? null : matchSavedFood(d.name, foods)}
              onApplySaved={(f) => applySaved(d, f)}
              onRevertSaved={() => revertSaved(d)}
            />
          ))}

          {!dishes.length && !adding && (
            <EmptyState
              compact
              icon={Utensils}
              title="Chưa có món nào"
              description="Thêm món thủ công hoặc tìm trong danh sách món."
              action={
                <Link to={manualHref} className="glass pill text-sm font-semibold">
                  <Search className="h-4 w-4" aria-hidden="true" /> Tìm thủ công
                </Link>
              }
            />
          )}

          {adding ? (
            <AddDishForm
              foods={rankedFoods}
              onCancel={() => setAdding(false)}
              onAdd={(d) => {
                onDishesChange((list) => [...list, d]);
                setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/20 text-[15px] font-semibold text-muted transition-colors hover:border-[rgba(237,180,11,0.5)] hover:text-gold"
            >
              <Plus className="h-5 w-5" aria-hidden="true" /> Thêm món AI bỏ sót
            </button>
          )}
        </section>

        {rememberCount > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
            <BookmarkPlus className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            Sẽ ghi nhớ {rememberCount} món vào Món của tôi để lần sau chọn lại nhanh
          </p>
        )}

        {invalid && <p role="alert" className="text-center text-[13px] font-medium text-[var(--danger-text)]">Mỗi món cần có tên, số lượng và khối lượng lớn hơn 0.</p>}
      </div>
    </BottomSheet>
  );
}
