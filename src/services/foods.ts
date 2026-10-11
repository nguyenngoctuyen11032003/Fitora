import { db } from '@/lib/supabase';
import type { CustomFood, CustomFoodPatch, NewCustomFood } from '@/types/db';
import { invalid, run, runRead } from './errors';

const COLS =
  'id, user_id, name, brand, serving_label, serving_grams, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, created_at, updated_at';

function clean<T extends CustomFoodPatch>(f: T): T {
  const out: Record<string, unknown> = { ...f };
  if ('name' in f) {
    const name = String(f.name ?? '').trim().slice(0, 120);
    if (!name) invalid('Hãy nhập tên món.');
    out.name = name;
  }
  if ('brand' in f) out.brand = String(f.brand ?? '').trim().slice(0, 80) || null;
  if ('serving_label' in f) out.serving_label = String(f.serving_label ?? '').trim().slice(0, 40) || '1 phần';
  if ('serving_grams' in f) {
    const g = Number(f.serving_grams);
    if (!(g > 0) || !Number.isFinite(g)) invalid('Khối lượng một phần phải lớn hơn 0.');
  }
  for (const k of ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'fiber_100g'] as const) {
    if (k in f) {
      const v = Number(f[k]);
      if (!(v >= 0) || !Number.isFinite(v)) invalid('Giá trị dinh dưỡng không được âm.');
      out[k] = Math.round(v * 10) / 10;
    }
  }
  return out as T;
}

export async function listCustomFoods(): Promise<CustomFood[]> {
  const rows = await runRead(
    (signal) => db().from('fit_custom_foods').select(COLS).order('name', { ascending: true }).abortSignal(signal).returns<CustomFood[]>(),
    'Không tải được món tùy chỉnh.',
  );
  return rows ?? [];
}

export async function createCustomFood(food: NewCustomFood): Promise<CustomFood> {
  return run(db().from('fit_custom_foods').insert(clean(food)).select(COLS).single<CustomFood>(), 'Không tạo được món tùy chỉnh.');
}

export async function updateCustomFood(id: string, patch: CustomFoodPatch): Promise<CustomFood> {
  return run(db().from('fit_custom_foods').update(clean(patch)).eq('id', id).select(COLS).single<CustomFood>(), 'Không cập nhật được món.');
}

export async function deleteCustomFood(id: string): Promise<void> {
  await run(db().from('fit_custom_foods').delete().eq('id', id), 'Không xóa được món.');
}
