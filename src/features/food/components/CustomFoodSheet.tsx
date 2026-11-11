import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/image';
import { BottomSheet, Button, GlassButton, Input, NumberField, useToast } from '@/components/ui';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { createCustomFood, updateCustomFood } from '@/services/foods';
import { schedulePhotoCleanup, uploadMealPhoto } from '@/services/meals';
import { signedUrl } from '@/services/storage';
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
  // Photo: the saved one (path), a newly picked one (blob, uploaded on save) or none.
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
      setPhotoPath(editing.photo_path);
    } else {
      setPhotoPath(null);
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
    setNewPhoto(null);
    setTried(false);
    setSaving(false);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, editing?.id]);

  // Preview of the picked photo (object URL) or of the saved one (signed URL).
  useEffect(() => {
    if (!open) return;
    if (newPhoto) {
      const url = URL.createObjectURL(newPhoto);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (!photoPath) {
      setPhotoUrl(null);
      return;
    }
    let alive = true;
    signedUrl(photoPath)
      .then((u) => alive && setPhotoUrl(u))
      .catch(() => alive && setPhotoUrl(null));
    return () => {
      alive = false;
    };
  }, [open, newPhoto, photoPath]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const c = await compressImage(file, { maxSide: 1024, quality: 0.8 });
      setNewPhoto(c.blob);
    } catch (e) {
      toast.error(e);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const clearPhoto = () => {
    setNewPhoto(null);
    setPhotoPath(null);
  };

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
    let uploaded: string | null = null;
    try {
      if (newPhoto) uploaded = await uploadMealPhoto(newPhoto);
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
        photo_path: uploaded ?? photoPath,
      };
      const food = editing ? await updateCustomFood(editing.id, values) : await createCustomFood(values);
      // A replaced / removed photo is cleaned up unless something else still uses it.
      if (editing?.photo_path && editing.photo_path !== food.photo_path) schedulePhotoCleanup(editing.photo_path);
      toast.success(editing ? `Đã cập nhật “${food.name}”.` : `Đã lưu “${food.name}” vào Món của tôi.`);
      notifyDataChanged('foods');
      onSaved(food, editing ? 'edit' : 'add');
      onClose();
    } catch (e) {
      if (uploaded) schedulePhotoCleanup(uploaded, 0);
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
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="Ảnh món" className="h-20 w-20 shrink-0 rounded-2xl border border-line object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-dashed border-line bg-white/[0.04] text-muted">
              <Camera className="h-6 w-6" />
            </span>
          )}
          <div className="flex min-w-0 flex-col items-start gap-1">
            <GlassButton variant="pill" onClick={() => fileRef.current?.click()} disabled={photoBusy || saving}>
              <ImagePlus className="h-4 w-4 text-gold" aria-hidden="true" />
              {photoBusy ? 'Đang xử lý…' : photoUrl ? 'Đổi ảnh' : 'Thêm ảnh'}
            </GlassButton>
            {photoUrl && (
              <button type="button" onClick={clearPhoto} disabled={saving} className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-muted hover:text-text">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Xóa ảnh
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        </div>
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
