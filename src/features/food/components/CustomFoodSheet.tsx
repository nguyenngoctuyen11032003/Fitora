import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, Input, NumberField, useToast } from '@/components/ui';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { createCustomFood } from '@/services/foods';
import type { CustomFood } from '@/types/db';
import { kcalFromMacros, kcalMismatch, per100FromServing, servingProblem } from '../lib';

export interface CustomFoodSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pre-filled name (e.g. the search query). */
  initialName?: string;
  onCreated: (food: CustomFood) => void;
}

/** "Món của tôi": values are typed per serving (as on a label) and stored per 100 g. */
export function CustomFoodSheet({ open, onClose, initialName, onCreated }: CustomFoodSheetProps) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [label, setLabel] = useState('1 phần');
  const [grams, setGrams] = useState<number | null>(100);
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [fiber, setFiber] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  // Synchronous guard: two taps in the same frame both see saving === false.
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? '');
    setBrand('');
    setLabel('1 phần');
    setGrams(100);
    setKcal(null);
    setP(null);
    setC(null);
    setF(null);
    setFiber(null);
    setTried(false);
    setSaving(false);
    busy.current = false;
  }, [open, initialName]);

  const fromMacros = kcalFromMacros(p ?? 0, c ?? 0, f ?? 0);
  const finalKcal = kcal ?? (fromMacros > 0 ? fromMacros : null);
  const nameErr = tried && !name.trim() ? 'Hãy nhập tên món.' : undefined;
  const gramsErr = tried && !((grams ?? 0) > 0) ? 'Khối lượng một phần phải lớn hơn 0.' : undefined;
  const kcalErr = tried && finalKcal === null ? 'Nhập calo hoặc macro.' : undefined;
  const problem = (grams ?? 0) > 0 ? servingProblem({ kcal: finalKcal ?? 0, protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0, fiber: fiber ?? 0 }, grams!) : null;
  const mismatch = kcalMismatch(kcal, fromMacros);

  const save = async () => {
    setTried(true);
    if (!name.trim() || !((grams ?? 0) > 0) || finalKcal === null || problem || busy.current) return;
    busy.current = true;
    setSaving(true);
    const per100 = per100FromServing({ kcal: finalKcal, protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0, fiber: fiber ?? 0 }, grams!);
    try {
      const food = await createCustomFood({
        name: name.trim(),
        brand: brand.trim() || null,
        serving_label: label.trim() || '1 phần',
        serving_grams: grams!,
        kcal_100g: per100.kcal,
        protein_100g: per100.protein,
        carbs_100g: per100.carbs,
        fat_100g: per100.fat,
        fiber_100g: per100.fiber,
      });
      toast.success(`Đã lưu “${food.name}” vào Món của tôi.`);
      notifyDataChanged('foods');
      onCreated(food);
      onClose();
    } catch (e) {
      toast.error(e);
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Tạo món riêng"
      description="Nhập theo một phần ăn (như trên nhãn) — lần sau chỉ cần tìm là có."
      footer={
        <Button block size="lg" loading={saving} onClick={save}>
          Lưu món
        </Button>
      }
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input label="Tên món" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="VD: Sữa chua Hy Lạp" error={nameErr} autoComplete="off" />
        <Input label="Thương hiệu (tuỳ chọn)" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} autoComplete="off" />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Một phần là" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={22} placeholder="1 hũ" autoComplete="off" />
          <NumberField label="Nặng" value={grams} onChange={setGrams} unit="g" min={1} max={10000} decimals={0} error={gramsErr} />
        </div>
        <NumberField
          label="Năng lượng mỗi phần"
          value={kcal}
          onChange={setKcal}
          unit="kcal"
          min={0}
          max={5000}
          decimals={0}
          size="lg"
          placeholder={fromMacros > 0 ? String(fromMacros) : '0'}
          error={kcalErr ?? (tried && problem ? problem : undefined)}
          hint={
            kcal === null && fromMacros > 0
              ? `Sẽ dùng ${formatNumber(fromMacros)} kcal tính từ macro.`
              : mismatch
                ? `Macro tương đương ${formatNumber(fromMacros)} kcal — kiểm tra lại nhé.`
                : undefined
          }
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 pl-1 text-[13px] font-semibold text-muted">Macro mỗi phần (gam)</legend>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Đạm" value={p} onChange={setP} min={0} max={1000} decimals={1} placeholder="0" />
            <NumberField label="Tinh bột" value={c} onChange={setC} min={0} max={1000} decimals={1} placeholder="0" />
            <NumberField label="Béo" value={f} onChange={setF} min={0} max={1000} decimals={1} placeholder="0" />
            <NumberField label="Chất xơ" value={fiber} onChange={setFiber} min={0} max={1000} decimals={1} placeholder="0" />
          </div>
        </fieldset>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </BottomSheet>
  );
}
