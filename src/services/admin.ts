import { db } from '@/lib/supabase';
import type { AdminPayment, AdminUser, PaymentStatus, PlanDef } from '@/types/db';
import { run } from './errors';

// Every call is authorised on the SERVER (fit_is_admin()); the UI only hides the entry points.

export async function adminListUsers(): Promise<AdminUser[]> {
  return (await run(db().rpc('fit_admin_list_users'), 'Không tải được danh sách tài khoản.')) as AdminUser[];
}

export async function adminSetPlan(userId: string, plan: string, days?: number | null): Promise<void> {
  await run(db().rpc('fit_admin_set_plan', { p_user: userId, p_plan: plan, p_days: days ?? null }), 'Không đổi được gói.');
}

export async function adminSetBanned(userId: string, banned: boolean): Promise<void> {
  await run(db().rpc('fit_admin_set_banned', { p_user: userId, p_banned: banned }), banned ? 'Không khóa được tài khoản.' : 'Không mở khóa được tài khoản.');
}

export async function adminSetPassword(userId: string, password: string): Promise<void> {
  await run(db().rpc('fit_admin_set_password', { p_user: userId, p_password: password }), 'Không đặt lại được mật khẩu.');
}

/** Sends the standard "reset password" e-mail (same flow as Quên mật khẩu). */
export async function adminSendResetEmail(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}?flow=recovery`;
  await run(db().auth.resetPasswordForEmail(email, { redirectTo }), 'Không gửi được email đặt lại mật khẩu.');
}

export async function adminListPayments(status?: PaymentStatus): Promise<AdminPayment[]> {
  return (await run(db().rpc('fit_admin_list_payments', { p_status: status ?? null }), 'Không tải được danh sách thanh toán.')) as AdminPayment[];
}

export async function adminReviewPayment(id: string, approve: boolean, note?: string): Promise<void> {
  await run(db().rpc('fit_admin_review_payment', { p_id: id, p_approve: approve, p_note: note?.trim() || null }), 'Không xử lý được giao dịch.');
}

export async function adminSavePlan(p: PlanDef): Promise<void> {
  await run(
    db().rpc('fit_admin_save_plan', {
      p_key: p.key,
      p_name: p.name,
      p_daily_scans: p.daily_scans,
      p_price_vnd: p.price_vnd,
      p_duration_days: p.duration_days,
      p_description: p.description,
      p_purchasable: p.purchasable,
      p_active: p.active,
      p_sort: p.sort,
    }),
    'Không lưu được gói.',
  );
}

export async function adminDeletePlan(key: string): Promise<void> {
  await run(db().rpc('fit_admin_delete_plan', { p_key: key }), 'Không xóa được gói (gói đã có giao dịch thì hãy tắt thay vì xóa).');
}
