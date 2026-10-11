import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, GlassButton, Input, NumberField, Segmented, useToast } from '@/components/ui';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { addMealEntries, updateMeal } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type MealEntry, type MealType } from '@/types/db';
import { kcalFromMacros, kcalMismatch, MEAL_SHORT } from '../lib';

export interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  date: string;
  meal: MealType;
  /** Edit an existing manual entry. */
  entry?: MealEntry | null;
  /** Pre-filled name (e.g. the search query). */
  initialName?: string;
  onSaved: (entry: MealEntry, mode: 'add' | 'edit') => void;
  onDelete?: (entry: MealEntry) => void;
}

/** "Nhập nhanh": just a name + kcal (macros optional). Saved as source 'manual', 1 phần, 0 g. */
export function QuickAddSheet({ open, onClose, date, meal: defaultMeal, entry, initialName, onSaved, onDelete }: QuickAddSheetProps) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [saving, setSaving] = useState(false);
  // Synchronous guard: two taps in the same frame both see saving === false.
  const busy = useRef(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? initialName ?? '');
    setKcal(entry ? entry.kcal : null);
    setP(entry?.protein_g || null);
    setC(entry?.carbs_g || null);
    setF(entry?.fat_g || null);
    setMeal(entry?.meal ?? defaultMeal);
    setSaving(false);
    busy.current = false;
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const fromMacros = kcalFromMacros(p ?? 0, c ?? 0, f ?? 0);
  const finalKcal = kcal ?? (fromMacros > 0 ? fromMacros : null);
  const nameErr = tried && !name.trim() ? 'Hãy nhập tên món.' : undefined;
  const kcalErr = tried && !(finalKcal !== null && finalKcal >= 0) ? 'Nhập calo hoặc macro.' : undefined;
  const mismatch = kcalMismatch(kcal, fromMacros);

  const save = async () => {
    setTried(true);
    if (!name.trim() || finalKcal === null || busy.current) return;
    busy.current = true;
    setSaving(true);
    const values = {
      name: name.trim(),
      meal,
      quantity: entry?.quantity ?? 1,
      unit: entry?.unit ?? 'phần',
      grams: entry?.grams ?? 0,
      kcal: finalKcal,
      protein_g: p ?? 0,
      carbs_g: c ?? 0,
      fat_g: f ?? 0,
    };
    try {
      if (entry) {
        const saved = await updateMeal(entry.id, values);
        toast.success('Đã cập nhật món.');
        onSaved(saved, 'edit');
      } else {
        const [saved] = await addMealEntries([{ ...values, eaten_on: date, source: 'manual', fiber_g: 0 }]);
        toast.success(`Đã thêm ${formatNumber(finalKcal)} kcal vào ${MEAL_LABELS[meal].toLowerCase()}.`);
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

  const footer = (
    <div className="flex items-center gap-3">
      {entry && onDelete && (
        <GlassButton label="Xóa món này" onClick={() => onDelete(entry)} className="shrink-0 text-[var(--danger-text)]">
          <Trash2 className="h-5 w-5" />
        </GlassButton>
      )}
      <Button block size="lg" loading={saving} onClick={save}>
        {entry ? 'Lưu thay đổi' : 'Thêm vào nhật ký'}
      </Button>
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={entry ? 'Sửa món' : 'Nhập nhanh'}
      description={entry ? undefined : 'Biết calo rồi? Ghi thẳng, macro là tuỳ chọn.'}
      footer={footer}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input label="Tên món" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="VD: Bánh sinh nhật" error={nameErr} autoComplete="off" enterKeyHint="next" />
        <NumberField
          label="Năng lượng"
          value={kcal}
          onChange={setKcal}
          unit="kcal"
          min={0}
          max={5000}
          decimals={0}
          size="lg"
          placeholder={fromMacros > 0 ? String(fromMacros) : '0'}
          error={kcalErr}
          hint={
            kcal === null && fromMacros > 0
              ? `Sẽ dùng ${formatNumber(fromMacros)} kcal tính từ macro.`
              : mismatch
                ? `Macro tương đương ${formatNumber(fromMacros)} kcal — kiểm tra lại nhé.`
                : undefined
          }
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 pl-1 text-[13px] font-semibold text-muted">Macro (tuỳ chọn, gam)</legend>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Đạm" value={p} onChange={setP} min={0} max={1000} decimals={1} placeholder="0" />
            <NumberField label="Tinh bột" value={c} onChange={setC} min={0} max={1000} decimals={1} placeholder="0" />
            <NumberField label="Béo" value={f} onChange={setF} min={0} max={1000} decimals={1} placeholder="0" />
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="pl-1 text-[13px] font-semibold text-muted">Bữa</span>
          <Segmented<MealType> ariaLabel="Bữa ăn" value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))} />
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </BottomSheet>
  );
}
