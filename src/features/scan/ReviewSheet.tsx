import { CalendarDays, Check, Plus, Search, Utensils } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { MacroBar } from '@/components/ui/MacroBar';
import { Segmented } from '@/components/ui/Segmented';
import { formatDayVi, isISODate } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { MEAL_LABELS, MEAL_TYPES, type MealType } from '@/types/db';
import { AddDishForm } from './AddDishForm';
import { DishCard } from './DishCard';
import { isDishValid, totals, type ScanDish } from './scale';

const MEAL_SHORT: Record<MealType, string> = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối', snack: 'Ăn vặt' };

interface ReviewSheetProps {
  open: boolean;
  onClose: () => void;
  photoUrl: string | null;
  dishes: ScanDish[];
  onDishesChange: (d: ScanDish[]) => void;
  notes?: string;
  meal: MealType;
  onMealChange: (m: MealType) => void;
  date: string;
  onDateChange: (d: string) => void;
  saving: boolean;
  onSave: () => void;
  manualHref: string;
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
}: ReviewSheetProps) {
  const [adding, setAdding] = useState(false);
  const dateId = useId();
  const sum = useMemo(() => totals(dishes), [dishes]);
  const invalid = dishes.some((d) => !isDishValid(d));
  const canSave = dishes.length > 0 && !invalid && !saving;

  const update = (i: number, d: ScanDish) => onDishesChange(dishes.map((x, k) => (k === i ? d : x)));
  const remove = (i: number) => onDishesChange(dishes.filter((_, k) => k !== i));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="full"
      dismissible={!saving}
      title="Kết quả quét"
      description={dishes.length ? `AI nhận ra ${dishes.length} món — kiểm tra lại khẩu phần trước khi lưu.` : undefined}
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
                onChange={(e) => isISODate(e.target.value) && onDateChange(e.target.value)}
                className="scan-date !py-2.5 text-[15px] font-semibold"
              />
            </div>
          </div>
          <p className="pl-1 text-[13px] text-muted">
            Lưu vào <span className="font-semibold text-text">{MEAL_LABELS[meal]}</span> · {formatDayVi(date, 'relative')}
          </p>
        </section>

        {notes && <p className="rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-muted">{notes}</p>}

        {/* Dishes */}
        <section className="flex flex-col gap-3" aria-label="Danh sách món">
          {dishes.map((d, i) => (
            <DishCard key={d.key} dish={d} index={i} onChange={(nd) => update(i, nd)} onRemove={() => remove(i)} />
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
              onCancel={() => setAdding(false)}
              onAdd={(d) => {
                onDishesChange([...dishes, d]);
                setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/20 text-[15px] font-semibold text-muted transition-colors hover:border-gold/50 hover:text-gold"
            >
              <Plus className="h-5 w-5" aria-hidden="true" /> Thêm món AI bỏ sót
            </button>
          )}
        </section>

        {invalid && <p className="text-center text-[13px] font-medium text-[var(--danger-text)]">Mỗi món cần có tên và số lượng lớn hơn 0.</p>}
      </div>
    </BottomSheet>
  );
}
