import { db } from '@/lib/supabase';
import type { MyPlan, Payment, PlanDef } from '@/types/db';
import { run } from './errors';
import { uploadImage } from './storage';

const PLAN_COLS = 'key, name, daily_scans, price_vnd, duration_days, description, purchasable, active, sort';
const PAY_COLS = 'id, plan_key, amount_vnd, proof_path, note, status, admin_note, created_at, reviewed_at';

/** Effective plan, today's usage and admin flag of the signed-in user (server decides all of it). */
export async function getMyPlan(): Promise<MyPlan> {
  const d = await run(db().rpc('fit_my_plan'), 'Không tải được thông tin gói.');
  const m = (d ?? {}) as Partial<MyPlan>;
  return {
    plan: m.plan ?? 'free',
    name: m.name ?? null,
    daily_limit: Number(m.daily_limit) || 0,
    used: Number(m.used) || 0,
    expires_at: m.expires_at ?? null,
    is_admin: !!m.is_admin,
    pending_payments: Number(m.pending_payments) || 0,
  };
}

export async function listPlanDefs(): Promise<PlanDef[]> {
  const rows = await run(db().from('fit_plan_defs').select(PLAN_COLS).order('sort').returns<PlanDef[]>(), 'Không tải được danh sách gói.');
  return rows ?? [];
}

export async function listMyPayments(): Promise<Payment[]> {
  const rows = await run(
    db().from('fit_payments').select(PAY_COLS).order('created_at', { ascending: false }).limit(20).returns<Payment[]>(),
    'Không tải được lịch sử thanh toán.',
  );
  return rows ?? [];
}

/** Uploads the transfer screenshot and files a payment in "Chờ duyệt" state. */
export async function submitPayment(planKey: string, proof: Blob, note?: string): Promise<Payment> {
  const path = await uploadImage(proof, 'payments');
  return run(db().rpc('fit_submit_payment', { p_plan: planKey, p_proof_path: path, p_note: note?.trim() || null }), 'Không gửi được yêu cầu thanh toán.') as Promise<Payment>;
}
