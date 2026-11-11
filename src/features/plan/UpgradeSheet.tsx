import clsx from 'clsx';
import { Check, Clock, Copy, ImagePlus, Mail, Phone, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet, Button, GlassButton, Textarea, useToast } from '@/components/ui';
import { usePlan } from '@/context/PlanContext';
import { notifyDataChanged } from '@/lib/events';
import { compressImage } from '@/lib/image';
import { listMyPayments, listPlanDefs, submitPayment } from '@/services/plan';
import { PAYMENT_STATUS_LABELS, type Payment, type PlanDef } from '@/types/db';
import { BANK, formatVnd, vietQrUrl } from './bank';

export const STATUS_STYLE: Record<Payment['status'], string> = {
  pending: 'bg-gold/15 text-gold',
  approved: 'bg-[rgba(127,209,139,0.16)] text-[var(--fiber)]',
  rejected: 'bg-danger/15 text-[var(--danger-text)]',
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Nâng cấp Pro: QR chuyển khoản → tải ảnh xác nhận → "Chờ duyệt" (admin duyệt thủ công). */
export function UpgradeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { plan, isPro, refresh } = usePlan();
  const [defs, setDefs] = useState<PlanDef[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [proof, setProof] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [d, p] = await Promise.all([listPlanDefs(), listMyPayments()]);
      setDefs(d.filter((x) => x.active && x.purchasable));
      setPayments(p);
    } catch (e) {
      toast.error(e);
    }
  };
  useEffect(() => {
    if (!open) return;
    setProof(null);
    setNote('');
    setQrFailed(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!proof) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(proof);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [proof]);

  const chosen = useMemo(() => defs.find((d) => d.key === pickedKey) ?? defs[0] ?? null, [defs, pickedKey]);
  const pending = payments.find((p) => p.status === 'pending');
  const planNames = useMemo(() => new Map(defs.map((d) => [d.key, d.name])), [defs]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setProof((await compressImage(file, { maxSide: 1600, quality: 0.85 })).blob);
    } catch (e) {
      toast.error(e);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã chép ${what}`);
    } catch {
      toast.info(`${what}: ${text}`);
    }
  };

  const submit = async () => {
    if (!chosen || !proof || busy) return;
    setBusy(true);
    try {
      await submitPayment(chosen.key, proof, note);
      toast.success('Đã gửi xác nhận. Yêu cầu đang chờ duyệt.');
      setProof(null);
      setNote('');
      notifyDataChanged('plan');
      await Promise.all([load(), refresh()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const days = chosen?.duration_days;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="full"
      title={isPro ? 'Gói của bạn' : `Nâng cấp ${chosen?.name ?? 'Pro'}`}
      description={chosen ? `${chosen.description ?? `${chosen.daily_scans} lượt quét AI mỗi ngày`}${days ? ` · ${days} ngày` : ' · không giới hạn thời gian'}` : undefined}
    >
      <div className="flex flex-col gap-5 pb-2">
        {defs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Chọn gói">
            {defs.map((d) => (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={d.key === chosen?.key}
                onClick={() => setPickedKey(d.key)}
                className={clsx('min-h-[44px] shrink-0 rounded-full border px-4 text-[14px] font-bold', d.key === chosen?.key ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted')}
              >
                {d.name} · {formatVnd(d.price_vnd)}
              </button>
            ))}
          </div>
        )}

        {chosen && (
          <div className="glass-card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="eyebrow !text-[10px] text-gold">{chosen.name}</p>
              <p className="num mt-1 text-[34px] text-gradient-gold">{formatVnd(chosen.price_vnd)}</p>
            </div>
            <p className="max-w-[150px] text-right text-[13px] leading-snug text-muted">
              Quét AI <b className="text-text">{chosen.daily_scans} lượt/ngày</b>
              {plan && plan.plan === 'free' ? ` thay vì ${plan.daily_limit}` : ''}.
            </p>
          </div>
        )}

        {pending ? (
          <div className="glass-card flex items-start gap-3 p-4" role="status">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <div className="text-[14px] leading-relaxed">
              <p className="font-bold text-text">Đang chờ duyệt</p>
              <p className="text-muted">
                Đã nhận ảnh chuyển khoản lúc {fmtDateTime(pending.created_at)}. Quản trị viên sẽ kiểm tra và kích hoạt gói cho bạn.
              </p>
            </div>
          </div>
        ) : chosen ? (
          <>
            <section aria-label="Chuyển khoản" className="glass-card p-4">
              <p className="text-[13px] font-semibold text-muted">1 · Quét mã QR hoặc chuyển khoản</p>
              <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {!qrFailed ? (
                  <img
                    src={vietQrUrl(chosen.price_vnd)}
                    alt={`Mã QR chuyển khoản ${formatVnd(chosen.price_vnd)} tới ${BANK.name} ${BANK.account}`}
                    onError={() => setQrFailed(true)}
                    className="h-[220px] w-[220px] shrink-0 rounded-2xl bg-white object-contain p-2"
                  />
                ) : (
                  <p className="grid h-[120px] w-full place-items-center rounded-2xl border border-dashed border-line px-3 text-center text-[13px] text-muted sm:w-[220px]">
                    Không tải được mã QR — hãy chuyển khoản theo thông tin bên cạnh.
                  </p>
                )}
                <dl className="w-full min-w-0 flex-1 text-[14px]">
                  <Row label="Ngân hàng" value={BANK.name} />
                  <Row label="Số tài khoản" value={BANK.account} onCopy={() => void copy(BANK.account, 'số tài khoản')} />
                  <Row label="Số tiền" value={formatVnd(chosen.price_vnd)} onCopy={() => void copy(String(chosen.price_vnd), 'số tiền')} />
                  <Row label="Nội dung" value={BANK.memo} onCopy={() => void copy(BANK.memo, 'nội dung')} />
                </dl>
              </div>
            </section>

            <section aria-label="Tải ảnh xác nhận" className="glass-card p-4">
              <p className="text-[13px] font-semibold text-muted">2 · Tải ảnh chuyển khoản thành công</p>
              <div className="mt-3 flex items-center gap-3">
                {preview ? (
                  <img src={preview} alt="Ảnh chuyển khoản" className="h-24 w-24 shrink-0 rounded-2xl border border-line object-cover" />
                ) : (
                  <span aria-hidden="true" className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl border border-dashed border-line bg-white/[0.04] text-muted">
                    <ImagePlus className="h-6 w-6" />
                  </span>
                )}
                <div className="flex flex-col items-start gap-1">
                  <GlassButton variant="pill" onClick={() => fileRef.current?.click()} disabled={busy}>
                    <ImagePlus className="h-4 w-4 text-gold" aria-hidden="true" />
                    {preview ? 'Đổi ảnh' : 'Chọn ảnh'}
                  </GlassButton>
                  {preview && (
                    <button type="button" onClick={() => setProof(null)} className="inline-flex min-h-[36px] items-center gap-1 px-2 text-[13px] font-semibold text-muted">
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Bỏ ảnh
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
              </div>
              <Textarea className="mt-3" label="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="VD: chuyển lúc 14:30, tên người chuyển…" />
              <Button block size="lg" className="mt-4" loading={busy} disabled={!proof} icon={<Check className="h-5 w-5" />} onClick={() => void submit()}>
                Gửi xác nhận · chờ duyệt
              </Button>
            </section>
          </>
        ) : (
          <p className="glass-card p-4 text-[14px] text-muted">Hiện chưa có gói nào để mua. Vui lòng liên hệ hỗ trợ.</p>
        )}

        <section className="rounded-2xl border border-line p-4 text-[13px] leading-relaxed text-muted" aria-label="Hỗ trợ">
          <p>
            Nếu <b className="text-text">sau 24 giờ</b> kể từ khi chuyển khoản mà chưa lên gói, hãy liên hệ:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={`tel:${BANK.supportPhone}`} className="glass pill text-[14px] font-semibold text-text">
              <Phone className="h-4 w-4 text-gold" aria-hidden="true" /> {BANK.supportPhone}
            </a>
            <a href={`mailto:${BANK.supportEmail}`} className="glass pill min-w-0 text-[14px] font-semibold text-text">
              <Mail className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" /> <span className="truncate">{BANK.supportEmail}</span>
            </a>
          </div>
        </section>

        {payments.length > 0 && (
          <section aria-label="Lịch sử thanh toán">
            <h3 className="mb-2 pl-1 text-[15px] font-bold text-text">Lịch sử thanh toán</h3>
            <ul className="flex flex-col gap-1.5">
              {payments.map((p) => (
                <li key={p.id} className="glass-card flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-text">
                      <Sparkles className="mr-1 inline h-3.5 w-3.5 text-gold" aria-hidden="true" />
                      {planNames.get(p.plan_key) ?? p.plan_key} · {formatVnd(p.amount_vnd)}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {fmtDateTime(p.created_at)}
                      {p.admin_note ? ` · ${p.admin_note}` : ''}
                    </p>
                  </div>
                  <span className={clsx('shrink-0 rounded-full px-3 py-1 text-[12px] font-bold', STATUS_STYLE[p.status])}>{PAYMENT_STATUS_LABELS[p.status]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-white/[0.06] last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 font-bold text-text">
        <span className="tabular truncate">{value}</span>
        {onCopy && (
          <button type="button" onClick={onCopy} aria-label={`Chép ${label.toLowerCase()}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:text-text">
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </dd>
    </div>
  );
}
