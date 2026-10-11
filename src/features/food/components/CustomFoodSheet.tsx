import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, GlassButton, Input, NumberField, useToast } from '@/components/ui';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { createCustomFood, updateCustomFood } from '@/services/foods';
import { CUSTOM_FOOD_SOURCE_LABELS, type CustomFood } from '@/types/db';
import { kcalFromMacros, kcalMismatch, per100FromServing, perServingFromPer100, servingProblem, usageLabel } from '../lib';

export interface CustomFoodSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pre-filled name (e.g. the search query). */
  initialName?: string;
  /** Edit mode: the saved food being changed. */
  food?: CustomFood | null;
  onSaved: (food: CustomFood, mode: 'add' | 'edit') => void;
  /** Edit mode delete (parent hides it and offers undo). */
  onDelete?: (food: CustomFood) => void;
}

/** One decimal, null for 0 so empty macro fields stay empty. */
const v1 = (n: number, keepZero = false) => {
  const r = Math.round((Number(n) || 0) * 10) / 10;
  return r || keepZero ? r : null;
};

/** "Món của tôi": values are typed per serving (as on a label) and stored per 100 g. */
export function CustomFoodSheet({ open, onClose, initialName, food: editing, onSaved, onDelete }: CustomFoodSheetProps) {
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
    if (editing) {
      // Shown per serving, as it was typed (stored per 100 g).
      const per = perServingFromPer100(
        { kcal: editing.kcal_100g, protein: editing.protein_100g, carbs: editing.carbs_100g, fat: editing.fat_100g, fiber: editing.fiber_100g },
        editing.serving_grams,
      );
      setName(editing.name);
      setBrand(editing.brand ?? '');
      setLabel(editing.serving_label || '1 phần');
      setGrams(editing.serving_grams);
      setKcal(Math.round(per.kcal));
      setP(v1(per.protein));
      setC(v1(per.carbs));
      setF(v1(per.fat));
      setFiber(v1(per.fiber));
    } else {
      setName(initialName ?? '');
      setBrand('');
      setLabel('1 phần');
      setGrams(100);
      setKcal(null);
      setP(null);
      setC(null);
      setF(null);
      setFiber(null);
    }
    setTried(false);
    setSaving(false);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, editing?.id]);

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
      const values = {
        name: name.trim(),
        brand: brand.trim() || null,
        serving_label: label.trim() || '1 phần',
        serving_grams: grams!,
        kcal_100g: per100.kcal,
        protein_100g: per100.protein,
        carbs_100g: per100.carbs,
        fat_100g: per100.fat,
        fiber_100g: per100.fiber,
      };
      const food = editing ? await updateCustomFood(editing.id, values) : await createCustomFood(values);
      toast.success(editing ? `Đã cập nhật “${food.name}”.` : `Đã lưu “${food.name}” vào Món của tôi.`);
      notifyDataChanged('foods');
      onSaved(food, editing ? 'edit' : 'add');
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
      title={editing ? 'Sửa món đã lưu' : 'Tạo món riêng'}
      description={
        editing
          ? `${CUSTOM_FOOD_SOURCE_LABELS[editing.source] ?? 'Món của tôi'} · ${usageLabel(editing.use_count, editing.last_used_at)}. Món đã ghi trong nhật ký giữ nguyên số liệu cũ.`
          : 'Nhập theo một phần ăn (như trên nhãn) — lần sau chỉ cần tìm là có.'
      }
      footer={
        <div className="flex items-center gap-3">
          {editing && onDelete && (
            <GlassButton label="Xóa món đã lưu" onClick={() => onDelete(editing)} className="shrink-0 text-[var(--danger-text)]">
              <Trash2 className="h-5 w-5" />
            </GlassButton>
          )}
          <Button block size="lg" loading={saving} onClick={save}>
            {editing ? 'Lưu thay đổi' : 'Lưu món'}
          </Button>
        </div>
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
