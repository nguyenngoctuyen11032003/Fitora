import { History, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { GlassButton } from '@/components/ui/GlassButton';
import { Input } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { formatNumber } from '@/lib/format';
import type { CustomFood } from '@/types/db';
import { dishFromSavedFood, searchSavedFoods, servingNutrients, servingText } from './saved';
import { manualDish, type ScanDish } from './scale';

/** Inline card to add a dish the AI missed: name + weight + kcal (macros optional). */
export function AddDishForm({ onAdd, onCancel, foods = [] }: { onAdd: (d: ScanDish) => void; onCancel: () => void; /** Saved foods, best first. */ foods?: CustomFood[] }) {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState<number | null>(100);
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  const nameErr = touched && !name.trim() ? 'Hãy nhập tên món' : undefined;
  const gramsErr = touched && !(grams && grams > 0) ? 'Nhập khối lượng' : undefined;
  const kcalErr = touched && kcal === null ? 'Nhập calo (có thể là 0)' : undefined;

  const suggestions = name.trim() ? searchSavedFoods(name, foods, 4) : foods.slice(0, 4);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !(grams && grams > 0) || kcal === null) return;
    onAdd(manualDish({ name, grams, kcal, protein_g: p ?? 0, carbs_g: c ?? 0, fat_g: f ?? 0, unit: 'phần', quantity: 1 }));
  };

  return (
    <form onSubmit={submit} className="glass-card animate-scale-in flex flex-col gap-3 border-[rgba(237,180,11,0.3)] p-4" aria-label="Thêm món thủ công" noValidate>
      <div className="flex items-center justify-between">
        <p className="display text-[20px]">Thêm món</p>
        <GlassButton label="Hủy thêm món" onClick={onCancel}>
          <X className="h-5 w-5" />
        </GlassButton>
      </div>
      <Input label="Tên món" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="VD: Trứng ốp la" error={nameErr} autoFocus />
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5" role="group" aria-label="Chọn từ món đã lưu">
          <p className="flex items-center gap-1.5 pl-1 text-[12px] font-semibold text-muted">
            <History className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> {name.trim() ? 'Món đã lưu trùng tên' : 'Hoặc chọn món đã lưu'}
          </p>
          {suggestions.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onAdd(dishFromSavedFood(f))}
              className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-3 text-left transition-colors hover:border-[rgba(237,180,11,0.5)]"
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{f.name}</span>
              <span className="shrink-0 text-[12px] text-muted">
                <span className="tabular font-bold text-gold">{formatNumber(servingNutrients(f).kcal)}</span> kcal · {servingText(f)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Khối lượng" unit="g" value={grams} onChange={setGrams} min={1} max={5000} decimals={0} error={gramsErr} />
        <NumberField label="Năng lượng" unit="kcal" value={kcal} onChange={setKcal} min={0} max={5000} decimals={0} error={kcalErr} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Đạm" unit="g" value={p} onChange={setP} min={0} max={500} placeholder="0" />
        <NumberField label="Tinh bột" unit="g" value={c} onChange={setC} min={0} max={1000} placeholder="0" />
        <NumberField label="Béo" unit="g" value={f} onChange={setF} min={0} max={500} placeholder="0" />
      </div>
      <Button type="submit" variant="secondary" icon={<Plus className="h-5 w-5" />} block>
        Thêm vào danh sách
      </Button>
    </form>
  );
}
