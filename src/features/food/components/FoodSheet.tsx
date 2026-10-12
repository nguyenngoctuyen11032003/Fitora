import clsx from 'clsx';
import { BookmarkCheck, BookmarkPlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet, Button, Chip, GlassButton, NumberField, Segmented, useToast } from '@/components/ui';
import { FOOD_CATEGORY_LABELS } from '@/data/foods';
import { notifyDataChanged } from '@/lib/events';
import { formatGrams, formatNumber } from '@/lib/format';
import { saveEntryAsFood } from '@/services/foods';
import { addMealEntries, updateMeal } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type MealEntry, type MealType } from '@/types/db';
import { computePortion, convertQuantity, defaultPortion, MEAL_SHORT, scaleNutrients, toNewEntry, unitOptions, type FoodOption } from '../lib';
import { MacroTiles } from './parts';

export interface FoodSheetProps {
  open: boolean;
  onClose: () => void;
  option: FoodOption | null;
  date: string;
  /** Meal pre-selected in add mode. */
  meal: MealType;
  /** Pre-filled portion (e.g. last portion of a recent food). */
  initial?: { quantity: number; unit: string } | null;
  /** Edit mode: the entry being changed. */
  entry?: MealEntry | null;
  onSaved: (entry: MealEntry, mode: 'add' | 'edit') => void;
  /** Edit mode delete (parent handles undo). */
  onDelete?: (entry: MealEntry) => void;
}

const isWeight = (u: string) => u === 'g' || u === 'ml';

/**
 * Portion picker: quantity stepper + unit chips + meal, with live kcal / macros.
 * Used to add a food (search) and to edit an existing diary entry.
 */
export function FoodSheet({ open, onClose, option, date, meal: defaultMeal, initial, entry, onSaved, onDelete }: FoodSheetProps) {
  const toast = useToast();
  // Keep the last option while the sheet animates out.
  const last = useRef<FoodOption | null>(option);
  if (option) last.current = option;
  const opt = option ?? last.current;

  const [qty, setQty] = useState<number | null>(1);
  const [unit, setUnit] = useState('g');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [saving, setSaving] = useState(false);
  const [remembering, setRemembering] = useState(false);
  // Entry just saved to "Món của tôi" (the parent's `entry` prop is not refreshed while open).
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  // Synchronous guard: two taps (or Enter + tap) in the same frame both see saving === false.
  const busy = useRef(false);

  const extraUnit = useMemo(
    () => (entry && entry.grams > 0 && entry.quantity > 0 ? { unit: entry.unit, grams: entry.grams / entry.quantity } : undefined),
    [entry],
  );
  const units = useMemo(() => (opt ? unitOptions(opt, extraUnit) : []), [opt, extraUnit]);
  // When editing with a unit the food doesn't know, scale with the entry's own grams-per-unit.
  const calcOpt = useMemo(() => (opt ? { ...opt, units } : null), [opt, units]);

  useEffect(() => {
    if (!open || !opt) return;
    if (entry) {
      setQty(entry.quantity);
      setUnit(units.some((u) => u.unit === entry.unit) ? entry.unit : opt.defaultUnit);
      setMeal(entry.meal);
    } else {
      const u = initial && units.some((x) => x.unit === initial.unit) ? initial.unit : opt.defaultUnit;
      setUnit(u);
      setQty(initial && u === initial.unit ? initial.quantity : defaultPortion({ defaultUnit: u, defaultQty: u === opt.defaultUnit ? opt.defaultQty : undefined }).quantity);
      setMeal(defaultMeal);
    }
    setSaving(false);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opt?.key, entry?.id]);

  const portion = useMemo(() => (calcOpt ? computePortion(calcOpt, qty ?? 0, unit) : null), [calcOpt, qty, unit]);
  if (!opt || !calcOpt) return null;

  const weight = isWeight(unit);
  const valid = (qty ?? 0) > 0;
  const per100 = scaleNutrients(opt.per100g, 100);
  const desc = [
    opt.brand,
    opt.origin === 'custom' ? (opt.savedFrom === 'ai' ? 'Món của tôi · từ ảnh quét' : 'Món của tôi') : opt.category ? FOOD_CATEGORY_LABELS[opt.category] : null,
    opt.gramsKnown ? `100 g = ${formatNumber(per100.kcal)} kcal` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const quick = weight ? [50, 100, 150, 200, 300] : [0.5, 1, 1.5, 2, 3];

  const changeUnit = (u: string) => {
    if (u === unit) return;
    setQty((q) => convertQuantity(calcOpt, q ?? 1, unit, u));
    setUnit(u);
  };

  const save = async () => {
    if (!valid || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const row = toNewEntry(calcOpt, qty ?? 1, unit, meal, entry?.eaten_on ?? date);
      if (entry) {
        // Identity (name, source, link, photo) stays as logged; only portion / meal / values change.
        const { eaten_on: _d, source: _s, custom_food_id: _c, name: _n, photo_path: _p, ...patch } = row;
        const saved = await updateMeal(entry.id, patch);
        toast.success('Đã cập nhật món.');
        onSaved(saved, 'edit');
      } else {
        const [saved] = await addMealEntries([row]);
        toast.success(`Đã thêm ${opt.name} vào ${MEAL_LABELS[meal].toLowerCase()}.`);
        onSaved(saved, 'add');
      }
      notifyDataChanged('meals');
      onClose();
    } catch (e) {
      toast.error(e);
      busy.current = false;
      setSaving(false);
    }
  };

  const remember = async () => {
    if (!entry || remembering || busy.current) return;
    setRemembering(true);
    try {
      const food = await saveEntryAsFood(entry);
      setRememberedId(entry.id);
      toast.success(`Đã lưu “${food.name}” vào Món của tôi — lần sau chỉ cần chọn.`);
      notifyDataChanged('foods');
      onSaved({ ...entry, custom_food_id: food.id }, 'edit');
    } catch (e) {
      toast.error(e);
    } finally {
      setRemembering(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-3">
      {entry && onDelete && (
        <GlassButton label="Xóa món này" onClick={() => onDelete(entry)} className="shrink-0 text-[var(--danger-text)]">
          <Trash2 className="h-5 w-5" />
        </GlassButton>
      )}
      <Button block size="lg" loading={saving} disabled={!valid} onClick={save}>
        {entry ? 'Lưu thay đổi' : `Thêm vào ${MEAL_LABELS[meal].toLowerCase()}`}
      </Button>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={opt.name} description={desc || undefined} footer={footer}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* Live result */}
        <section aria-live="polite" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <span className="num text-gradient-gold pb-[0.06em] pr-[0.04em] text-[64px]">{formatNumber(portion?.kcal ?? 0)}</span>
              <span className="mb-2 text-lg font-bold tracking-[-0.02em] text-muted">kcal</span>
            </div>
            {portion && portion.grams > 0 && !weight && (
              <span className="mb-2 rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-muted">
                ≈ {formatGrams(portion.grams)}
              </span>
            )}
          </div>
          <MacroTiles
            protein_g={portion?.protein_g ?? 0}
            carbs_g={portion?.carbs_g ?? 0}
            fat_g={portion?.fat_g ?? 0}
            fiber_g={portion?.fiber_g ?? 0}
          />
        </section>

        {/* Quantity */}
        <section className="flex flex-col gap-3">
          <NumberField
            label="Số lượng"
            value={qty}
            onChange={setQty}
            stepper
            min={weight ? 1 : 0.25}
            max={weight ? 5000 : 50}
            step={weight ? 10 : 0.5}
            decimals={weight ? 0 : 2}
            unit={unit}
            error={qty !== null && qty <= 0 ? 'Số lượng phải lớn hơn 0.' : undefined}
          />
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Chọn nhanh số lượng">
            {quick.map((v) => (
              <Chip key={v} size="md" className="min-w-[48px] justify-center" selected={qty === v} onClick={() => setQty(v)} ariaLabel={`${formatNumber(v, 2)} ${unit}`}>
                {formatNumber(v, 2)}
              </Chip>
            ))}
          </div>
        </section>

        {/* Unit */}
        {units.length > 1 && (
          <section className="flex flex-col gap-2">
            <h3 className="pl-1 text-[13px] font-semibold text-muted">Đơn vị</h3>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Đơn vị">
              {units.map((u) => {
                const on = u.unit === unit;
                return (
                  <button
                    key={u.unit}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => changeUnit(u.unit)}
                    className={clsx(
                      'flex min-h-[52px] min-w-[52px] shrink-0 flex-col items-start justify-center rounded-2xl border px-4 text-left transition-colors active:scale-[0.97]',
                      on ? 'border-gold/60 bg-gold/15 text-gold' : 'border-line bg-white/[0.04] text-text',
                    )}
                  >
                    <span className="text-[15px] font-bold leading-tight">{u.unit}</span>
                    {!isWeight(u.unit) && opt.gramsKnown && (
                      <span className={clsx('text-[11px] font-medium', on ? 'text-gold/80' : 'text-muted')}>{formatGrams(u.grams)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Meal */}
        <section className="flex flex-col gap-2">
          <h3 className="pl-1 text-[13px] font-semibold text-muted">Bữa</h3>
          <Segmented<MealType>
            ariaLabel="Bữa ăn"
            value={meal}
            onChange={setMeal}
            options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))}
          />
        </section>
        {entry && (
          <RememberRow saved={!!entry.custom_food_id || rememberedId === entry.id}busy={remembering} onSave={() => void remember()} />
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </BottomSheet>
  );
}

/** Edit mode: "Lưu vào Món của tôi" for an entry that is not a saved food yet. */
export function RememberRow({ saved, busy, onSave }: { saved: boolean; busy: boolean; onSave: () => void }) {
  if (saved) {
    return (
      <p className="flex items-center gap-2 pl-1 text-[13px] text-muted">
        <BookmarkCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        Món này đã có trong Món của tôi.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={busy}
      aria-busy={busy}
      className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 text-left text-[14px] transition-colors hover:bg-white/[0.04] disabled:opacity-60"
    >
      <BookmarkPlus className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-text">{busy ? 'Đang lưu…' : 'Lưu vào Món của tôi'}</span>
        <span className="block text-[12px] text-muted">Lần sau chọn lại bằng một chạm, không cần scan hay nhập.</span>
      </span>
    </button>
  );
}
