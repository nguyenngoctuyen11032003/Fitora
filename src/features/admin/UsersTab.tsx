import clsx from 'clsx';
import { KeyRound, Lock, LockOpen, Mail, Search, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, BottomSheet, Button, ConfirmDialog, EmptyState, Input, NumberField, PlanPill, Skeleton, useToast } from '@/components/ui';
import { fmtDateTime } from '@/features/plan/UpgradeSheet';
import { useAsync } from '@/lib/hooks';
import { adminListUsers, adminSendResetEmail, adminSetBanned, adminSetPassword, adminSetPlan } from '@/services/admin';
import { listPlanDefs } from '@/services/plan';
import type { AdminUser, PlanDef } from '@/types/db';

const isBanned = (u: AdminUser) => !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();

/** Every account in the database: plan, activity, lock, password reset. */
export function UsersTab() {
  const toast = useToast();
  const users = useAsync(() => adminListUsers(), []);
  const plans = useAsync(() => listPlanDefs(), []);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (users.error) toast.error(users.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.error]);

  const all = useMemo(() => users.data ?? [], [users.data]);
  const planName = useMemo(() => new Map((plans.data ?? []).map((p) => [p.key, p.name])), [plans.data]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? all.filter((u) => u.email.toLowerCase().includes(k) || (u.display_name ?? '').toLowerCase().includes(k)) : all;
  }, [all, q]);
  const open = all.find((u) => u.user_id === openId) ?? null;
  const paid = all.filter((u) => u.plan !== 'free').length;

  return (
    <div>
      <Input type="search" aria-label="Tìm tài khoản" placeholder="Tìm theo tên hoặc email…" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="h-5 w-5" />} autoComplete="off" />
      <p className="mt-3 pl-1 text-[13px] text-muted">
        {all.length} tài khoản · {paid} gói trả phí · {all.filter(isBanned).length} bị khóa
      </p>
      <div className="mt-3">
        {users.loading && !users.data ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState compact icon={Users} title="Không thấy tài khoản" description="Thử từ khóa khác." />
        ) : (
          <ul className="flex flex-col gap-1.5 lg:grid lg:grid-cols-2">
            {shown.map((u) => (
              <li key={u.user_id}>
                <button type="button" onClick={() => setOpenId(u.user_id)} className="glass-card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.06]">
                  <Avatar name={u.display_name || u.email} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-[15px] font-bold text-text">
                      <span className="truncate">{u.display_name || u.email.split('@')[0]}</span>
                      {u.is_admin && <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-label="Quản trị viên" />}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{u.email}</span>
                    <span className="block truncate text-[12px] text-muted">Quét hôm nay: {u.scans_today}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <PlanPill pro={u.plan !== 'free'} label={planName.get(u.plan) ?? u.plan} className="!min-h-[26px] !px-3 !text-[12px]" />
                    {isBanned(u) && <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-bold text-[var(--danger-text)]">Đã khóa</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <UserSheet user={open} plans={plans.data ?? []} onClose={() => setOpenId(null)} onChanged={() => void users.reload()} />
    </div>
  );
}

function UserSheet({ user: u, plans, onClose, onChanged }: { user: AdminUser | null; plans: PlanDef[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState('free');
  const [days, setDays] = useState<number | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);

  useEffect(() => {
    setPlan(u?.plan ?? 'free');
    setDays(null);
    setPw('');
    setBusy(null);
    setConfirmBan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u?.user_id]);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  if (!u) return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;
  const banned = isBanned(u);
  const chosen = plans.find((p) => p.key === plan);
  return (
    <>
      <BottomSheet open onClose={onClose} height="full" title={u.display_name || u.email.split('@')[0]} description={u.email}>
        <div className="flex flex-col gap-5 pb-2">
          <dl className="glass-card grid grid-cols-2 gap-3 p-4 text-[13px]">
            <Info label="Gói hiện tại" value={plans.find((p) => p.key === u.plan)?.name ?? u.plan} />
            <Info label="Hết hạn" value={u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString('vi-VN') : 'Không'} />
            <Info label="Quét hôm nay" value={String(u.scans_today)} />
            <Info label="Trạng thái" value={banned ? 'Đã khóa' : 'Hoạt động'} />
            <Info label="Tạo lúc" value={fmtDateTime(u.created_at)} />
            <Info label="Đăng nhập gần nhất" value={u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : '—'} />
          </dl>

          <section aria-label="Đổi gói" className="glass-card p-4">
            <h3 className="text-[15px] font-bold text-text">Chuyển gói</h3>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn gói">
              {plans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={plan === p.key}
                  onClick={() => setPlan(p.key)}
                  className={clsx('min-h-[44px] rounded-full border px-4 text-[14px] font-bold', plan === p.key ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted')}
                >
                  {p.name}
                  {!p.active && ' (tắt)'}
                </button>
              ))}
            </div>
            {plan !== 'free' && (
              <div className="mt-3">
              <NumberField
                label="Số ngày hiệu lực"
                unit="ngày"
                value={days}
                onChange={setDays}
                min={1}
                max={3650}
                decimals={0}
                placeholder={chosen?.duration_days ? String(chosen.duration_days) : '∞'}
                hint={`Để trống = theo gói (${chosen?.duration_days ? `${chosen.duration_days} ngày` : 'không hết hạn'}).`}
              />
              </div>
            )}
            <Button
              block
              className="mt-4"
              loading={busy === 'plan'}
              disabled={plan === u.plan && days === null}
              onClick={() => void run('plan', () => adminSetPlan(u.user_id, plan, plan === 'free' ? null : days), 'Đã cập nhật gói.')}
            >
              Lưu gói
            </Button>
          </section>

          <section aria-label="Mật khẩu" className="glass-card p-4">
            <h3 className="text-[15px] font-bold text-text">Mật khẩu</h3>
            <Button
              block
              variant="secondary"
              className="mt-3"
              loading={busy === 'mail'}
              icon={<Mail className="h-4 w-4" />}
              onClick={() => void run('mail', () => adminSendResetEmail(u.email), `Đã gửi email đặt lại mật khẩu tới ${u.email}.`)}
            >
              Gửi email đặt lại mật khẩu
            </Button>
            <Input className="mt-3" label="Hoặc đặt mật khẩu mới trực tiếp" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" placeholder="Tối thiểu 8 ký tự" icon={<KeyRound className="h-5 w-5" />} />
            <Button
              block
              variant="secondary"
              className="mt-3"
              loading={busy === 'pw'}
              disabled={pw.length < 8}
              onClick={() =>
                void run(
                  'pw',
                  async () => {
                    await adminSetPassword(u.user_id, pw);
                    setPw('');
                  },
                  'Đã đặt mật khẩu mới và đăng xuất các thiết bị của người dùng.',
                )
              }
            >
              Đặt mật khẩu
            </Button>
            <p className="mt-2 text-[12px] text-muted">Hãy gửi mật khẩu mới cho người dùng qua kênh riêng và nhắc họ đổi lại.</p>
          </section>

          <Button
            block
            variant={banned ? 'secondary' : 'danger'}
            loading={busy === 'ban'}
            icon={banned ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            onClick={() => (banned ? void run('ban', () => adminSetBanned(u.user_id, false), 'Đã mở khóa tài khoản.') : setConfirmBan(true))}
          >
            {banned ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
          </Button>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmBan}
        danger
        title="Khóa tài khoản?"
        message={`${u.email} sẽ bị đăng xuất và không đăng nhập lại được cho tới khi bạn mở khóa.`}
        confirmLabel="Khóa"
        loading={busy === 'ban'}
        onCancel={() => setConfirmBan(false)}
        onConfirm={() => {
          setConfirmBan(false);
          void run('ban', () => adminSetBanned(u.user_id, true), 'Đã khóa tài khoản.');
        }}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-bold text-text">{value}</dd>
    </div>
  );
}

