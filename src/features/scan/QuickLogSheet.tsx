import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MacroBar } from '@/components/ui/MacroBar';
import { NumberField } from '@/components/ui/NumberField';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { logCustomFood, usualServings } from '@/services/foods';
import { CUSTOM_FOOD_SOURCE_LABELS, MEAL_LABELS, MEAL_TYPES, type CustomFood, type MealEntry, type MealType } from '@/types/db';
import { savedServing, servingNutrients } from './saved';
import { SavedThumb } from './SavedStrip';

const MEAL_SHORT: Record<MealType, string> = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối', snack: 'Ăn vặt' };
const PRESETS = [0.5, 1, 1.5, 2];

interface Props {
  food: CustomFood | null;
  photoUrl?: string;
  onClose: () => void;
  meal: MealType;
  date: string;
  onLogged: (entry: MealEntry, food: CustomFood, meal: MealType, servings: number) => void;
}

/** Re-log a saved food without AI: opens with the amount the user usually eats; pick the portion (and meal) → one insert. */
export function QuickLogSheet({ food, photoUrl, onClose, meal: initialMeal, date, onLogged }: Props) {
  const toast = useToast();
  const [servings, setServings] = useState<number | null>(usualServings(food));
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [saving, setSaving] = useState(false);
  // Keep the last food while the sheet animates out.
  const [shown, setShown] = useState<CustomFood | null>(food);

  useEffect(() => {
    if (!food) return;
    setShown(food);
    setServings(usualServings(food));
    setMeal(initialMeal);
    setSaving(false);
  }, [food, initialMeal]);

  const f = food ?? shown;
  const q = servings && servings > 0 ? servings : 0;
  const n = f ? servingNutrients(f, q) : null;
  const serving = f ? savedServing(f) : null;
  const unitLabel = serving ? (serving.unit === 'g' ? `phần ${Math.round(serving.grams)} g` : serving.unit) : '';

  const submit = async () => {
    if (!food || !q || saving) return;
    setSaving(true);
    try {
      const entry = await logCustomFood(food, date, meal, q);
      onLogged(entry, food, meal, q);
    } catch (e) {
      toast.error(e);
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={!!food}
      onClose={onClose}
      dismissible={!saving}
      title={f?.name ?? 'Món đã lưu'}
      description={f ? `${CUSTOM_FOOD_SOURCE_LABELS[f.source] ?? 'Món của tôi'} · ${f.use_count > 0 ? `đã ăn ${f.use_count} lần` : 'chưa ăn lần nào'}` : undefined}
      footer={
        <Button size="lg" block onClick={() => void submit()} disabled={!q || saving} loading={saving} icon={<Check className="h-5 w-5" />}>
          {saving ? 'Đang lưu…' : `Thêm vào ${MEAL_SHORT[meal].toLowerCase()} · ${formatNumber(n?.kcal ?? 0)} kcal`}
        </Button>
      }
    >
      {f && n && serving && (
        <div className="flex flex-col gap-4">
          <section className="flex items-center gap-4" aria-label="Năng lượng">
            <SavedThumb food={f} url={photoUrl} size={84} />
            <div className="flex min-w-0 flex-col">
              <span className="eyebrow">Năng lượng</span>
              <span className="mt-1 flex items-baseline gap-1.5">
                <span className="num text-[48px] text-gradient-gold">{formatNumber(n.kcal)}</span>
                <span className="text-[15px] font-semibold text-muted">kcal</span>
              </span>
              <span className="text-[13px] text-muted">
                1 {unitLabel} = {formatNumber(servingNutrients(f, 1).kcal)} kcal · {formatNumber(serving.grams)} g
              </span>
            </div>
          </section>

          <MacroBar variant="stacked" protein_g={n.protein_g} carbs_g={n.carbs_g} fat_g={n.fat_g} />

          <section className="glass-card flex flex-col gap-3 p-4" aria-label="Khẩu phần">
            <NumberField
              label={`Số ${unitLabel}`}
              value={servings}
              onChange={setServings}
              min={0.25}
              max={20}
              step={0.5}
              decimals={2}
              stepper
              error={q ? undefined : 'Phải lớn hơn 0'}
            />
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Chọn nhanh khẩu phần">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setServings(p)}
                  aria-pressed={q === p}
                  className={clsx(
                    'min-h-[44px] rounded-full border text-[14px] font-bold tabular transition-colors',
                    q === p ? 'border-[rgba(237,180,11,0.7)] bg-[rgba(237,180,11,0.15)] text-gold' : 'border-line bg-white/[0.03] text-text/85 hover:border-[rgba(237,180,11,0.4)]',
                  )}
                >
                  {p === 0.5 ? '½' : p === 1.5 ? '1½' : p}
                </button>
              ))}
            </div>
          </section>

          <section className="glass-card flex flex-col gap-2.5 p-4" aria-label="Bữa ăn">
            <Segmented<MealType> ariaLabel="Bữa ăn" size="sm" value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))} />
            <p className="pl-1 text-[13px] text-muted">
              Lưu vào <span className="font-semibold text-text">{MEAL_LABELS[meal]}</span> · {formatDayVi(date, 'relative')} · không dùng lượt AI
            </p>
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
