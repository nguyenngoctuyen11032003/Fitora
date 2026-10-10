import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { GlassButton } from '@/components/ui/GlassButton';
import { Input } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { manualDish, type ScanDish } from './scale';

/** Inline card to add a dish the AI missed: name + weight + kcal (macros optional). */
export function AddDishForm({ onAdd, onCancel }: { onAdd: (d: ScanDish) => void; onCancel: () => void }) {
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !(grams && grams > 0) || kcal === null) return;
    onAdd(manualDish({ name, grams, kcal, protein_g: p ?? 0, carbs_g: c ?? 0, fat_g: f ?? 0, unit: 'phần', quantity: 1 }));
  };

  return (
    <form onSubmit={submit} className="glass-card animate-scale-in flex flex-col gap-3 border-gold/30 p-4" aria-label="Thêm món thủ công" noValidate>
      <div className="flex items-center justify-between">
        <p className="display text-[20px]">Thêm món</p>
        <GlassButton label="Hủy thêm món" onClick={onCancel}>
          <X className="h-5 w-5" />
        </GlassButton>
      </div>
      <Input label="Tên món" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="VD: Trứng ốp la" error={nameErr} autoFocus />
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
