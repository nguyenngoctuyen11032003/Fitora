import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet, Button, ConfirmDialog, GlassButton, Input, NumberField, PlanPill, Skeleton, Textarea, useToast } from '@/components/ui';
import { formatVnd } from '@/features/plan/bank';
import { useAsync } from '@/lib/hooks';
import { adminDeletePlan, adminSavePlan } from '@/services/admin';
import { listPlanDefs } from '@/services/plan';
import type { PlanDef } from '@/types/db';

const BLANK: PlanDef = { key: '', name: '', daily_scans: 20, price_vnd: 50000, duration_days: null, description: null, purchasable: true, active: true, sort: 10 };

/** The plan catalogue: scan quota, price, duration, whether it can be bought. */
export function PlansTab() {
  const toast = useToast();
  const plans = useAsync(() => listPlanDefs(), []);
  const [edit, setEdit] = useState<{ plan: PlanDef; isNew: boolean } | null>(null);

  useEffect(() => {
    if (plans.error) toast.error(plans.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.error]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="pl-1 text-[13px] text-muted">Gói “Thường” là gói mặc định cho mọi tài khoản mới.</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ plan: BLANK, isNew: true })}>
          Thêm gói
        </Button>
      </div>
      <div className="mt-4">
        {plans.loading && !plans.data ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
            {(plans.data ?? []).map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => setEdit({ plan: p, isNew: false })} className={clsx('glass-card w-full p-4 text-left transition-colors hover:bg-white/[0.06]', !p.active && 'opacity-60')}>
                  <span className="flex items-center justify-between gap-3">
                    <PlanPill pro={p.key !== 'free'} label={p.name} />
                    <span className="num text-[22px] text-text">{p.price_vnd ? formatVnd(p.price_vnd) : 'Miễn phí'}</span>
                  </span>
                  <span className="mt-3 block text-[14px] text-text">
                    <b>{p.daily_scans}</b> lượt quét AI / ngày · {p.duration_days ? `${p.duration_days} ngày` : 'không hết hạn'}
                  </span>
                  <span className="mt-1 block text-[12px] text-muted">
                    {p.active ? 'Đang bật' : 'Đã tắt'} · {p.purchasable ? 'Khách tự mua được' : 'Không bán'} · mã “{p.key}”
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PlanSheet edit={edit} onClose={() => setEdit(null)} onSaved={() => void plans.reload()} />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex min-h-[52px] w-full items-center justify-between gap-3 text-left disabled:opacity-50">
      <span>
        <span className="block text-[15px] font-semibold text-text">{label}</span>
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
      <span className={clsx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-gold' : 'bg-white/15')} aria-hidden="true">
        <span className={clsx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left]', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

function PlanSheet({ edit, onClose, onSaved }: { edit: { plan: PlanDef; isNew: boolean } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<PlanDef>(BLANK);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (edit) setP(edit.plan);
    setBusy(false);
    setConfirmDel(false);
    setTried(false);
  }, [edit]);

  const isNew = edit?.isNew ?? false;
  const isFree = p.key === 'free';
  const keyErr = tried && !/^[a-z0-9_]{2,20}$/.test(p.key) ? 'Mã gói: 2–20 ký tự a–z, 0–9, _.' : undefined;
  const nameErr = tried && !p.name.trim() ? 'Hãy nhập tên gói.' : undefined;
  const set = <K extends keyof PlanDef>(k: K, v: PlanDef[K]) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setTried(true);
    if (!/^[a-z0-9_]{2,20}$/.test(p.key) || !p.name.trim() || busy) return;
    setBusy(true);
    try {
      await adminSavePlan({ ...p, name: p.name.trim(), description: p.description?.trim() || null });
      toast.success('Đã lưu gói.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      await adminDeletePlan(p.key);
      toast.success('Đã xóa gói. Người dùng gói này chuyển về gói Thường.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return (
    <>
      <BottomSheet
        open={!!edit}
        onClose={onClose}
        height="full"
        title={isNew ? 'Thêm gói' : `Sửa gói ${p.name}`}
        footer={
          <div className="flex items-center gap-3">
            {!isNew && !isFree && (
              <GlassButton label="Xóa gói" onClick={() => setConfirmDel(true)} className="shrink-0 text-[var(--danger-text)]">
                <Trash2 className="h-5 w-5" />
              </GlassButton>
            )}
            <Button block size="lg" loading={busy} onClick={() => void save()}>
              Lưu gói
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 pb-2">
          <Input label="Mã gói" value={p.key} onChange={(e) => set('key', e.target.value.toLowerCase())} disabled={!isNew} maxLength={20} placeholder="vd: pro_year" error={keyErr} autoComplete="off" />
          <Input label="Tên hiển thị" value={p.name} onChange={(e) => set('name', e.target.value)} maxLength={40} placeholder="vd: Pro" error={nameErr} autoComplete="off" />
          <NumberField label="Lượt quét AI mỗi ngày" unit="lượt" value={p.daily_scans} onChange={(v) => set('daily_scans', v ?? 0)} min={0} max={1000} decimals={0} />
          <NumberField label="Giá" unit="đ" value={p.price_vnd} onChange={(v) => set('price_vnd', v ?? 0)} min={0} max={100000000} decimals={0} />
          <NumberField
            label="Thời hạn"
            unit="ngày"
            value={p.duration_days}
            onChange={(v) => set('duration_days', v && v > 0 ? v : null)}
            min={1}
            max={3650}
            decimals={0}
            placeholder="∞"
            hint="Để trống = không hết hạn."
          />
          <Textarea label="Mô tả (hiện cho khách)" value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={300} rows={2} />
          <div className="divide-y divide-white/[0.08] rounded-2xl border border-line px-4">
            <Toggle label="Đang bật" hint="Gói tắt không còn hiệu lực với người đang dùng." checked={p.active} onChange={(v) => set('active', v)} disabled={isFree} />
            <Toggle label="Khách tự mua được" hint="Hiện trong màn Nâng cấp." checked={p.purchasable} onChange={(v) => set('purchasable', v)} disabled={isFree} />
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDel}
        danger
        title="Xóa gói?"
        message={`Người đang dùng gói “${p.name}” sẽ chuyển về gói Thường. Gói đã có giao dịch thì không xóa được — hãy tắt thay vì xóa.`}
        confirmLabel="Xóa gói"
        loading={busy}
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => void del()}
      />
    </>
  );
}
