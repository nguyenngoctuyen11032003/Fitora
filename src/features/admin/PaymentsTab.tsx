import clsx from 'clsx';
import { Check, ImageOff, Receipt, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet, Button, EmptyState, Segmented, Skeleton, Textarea, useToast } from '@/components/ui';
import { formatVnd } from '@/features/plan/bank';
import { fmtDateTime, STATUS_STYLE } from '@/features/plan/UpgradeSheet';
import { useAsync } from '@/lib/hooks';
import { adminListPayments, adminReviewPayment } from '@/services/admin';
import { signedUrls } from '@/services/storage';
import { PAYMENT_STATUS_LABELS, type AdminPayment, type PaymentStatus } from '@/types/db';

type Filter = PaymentStatus | 'all';

/** Customer payments: name · email · plan · transfer screenshot; admin approves or rejects. */
export function PaymentsTab() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const list = useAsync(() => adminListPayments(filter === 'all' ? undefined : filter), [filter]);
  const [open, setOpen] = useState<AdminPayment | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const rows = useMemo(() => list.data ?? [], [list.data]);

  useEffect(() => {
    if (list.error) toast.error(list.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.error]);

  useEffect(() => {
    const paths = rows.map((r) => r.proof_path);
    if (!paths.length) return;
    let alive = true;
    signedUrls(paths)
      .then((m) => alive && setUrls((u) => ({ ...u, ...m })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rows]);

  return (
    <div>
      <Segmented<Filter>
        ariaLabel="Lọc thanh toán"
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'pending', label: 'Chờ duyệt' },
          { value: 'approved', label: 'Đã duyệt' },
          { value: 'rejected', label: 'Từ chối' },
          { value: 'all', label: 'Tất cả' },
        ]}
      />
      <div className="mt-4">
        {list.loading && !list.data ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon={Receipt} title="Chưa có giao dịch" description={filter === 'pending' ? 'Không có yêu cầu nào đang chờ duyệt.' : 'Không có giao dịch phù hợp bộ lọc.'} />
        ) : (
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p)} className="glass-card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.06]">
                  <Proof url={urls[p.proof_path]} size={72} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-text">{p.display_name || p.email.split('@')[0]}</span>
                    <span className="block truncate text-[12px] text-muted">{p.email}</span>
                    <span className="mt-1 block truncate text-[13px] text-text">
                      Mua gói <b>{p.plan_name}</b> · {formatVnd(p.amount_vnd)}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{fmtDateTime(p.created_at)}</span>
                  </span>
                  <span className={clsx('shrink-0 self-start rounded-full px-3 py-1 text-[12px] font-bold', STATUS_STYLE[p.status])}>{PAYMENT_STATUS_LABELS[p.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ReviewSheet
        payment={open}
        url={open ? urls[open.proof_path] : undefined}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          void list.reload();
        }}
      />
    </div>
  );
}

function Proof({ url, size }: { url?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt="Ảnh chuyển khoản" loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-xl border border-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-xl border border-line bg-white/[0.04] text-muted" style={{ width: size, height: size }}>
      <ImageOff className="h-5 w-5" />
    </span>
  );
}

function ReviewSheet({ payment: p, url, onClose, onDone }: { payment: AdminPayment | null; url?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  useEffect(() => {
    setNote('');
    setBusy(null);
  }, [p?.id]);

  const act = async (approve: boolean) => {
    if (!p || busy) return;
    setBusy(approve ? 'approve' : 'reject');
    try {
      await adminReviewPayment(p.id, approve, note);
      toast.success(approve ? `Đã duyệt — ${p.email} lên gói ${p.plan_name}.` : 'Đã từ chối giao dịch.');
      onDone();
    } catch (e) {
      toast.error(e);
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      open={!!p}
      onClose={onClose}
      height="full"
      title={p ? `${p.display_name || p.email.split('@')[0]} · ${p.plan_name}` : ''}
      description={p ? `${p.email} · ${formatVnd(p.amount_vnd)} · ${fmtDateTime(p.created_at)}` : undefined}
      footer={
        p?.status === 'pending' ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" loading={busy === 'reject'} disabled={!!busy} icon={<X className="h-5 w-5" />} onClick={() => void act(false)}>
              Từ chối
            </Button>
            <Button size="lg" loading={busy === 'approve'} disabled={!!busy} icon={<Check className="h-5 w-5" />} onClick={() => void act(true)}>
              Duyệt
            </Button>
          </div>
        ) : undefined
      }
    >
      {p && (
        <div className="flex flex-col gap-4 pb-2">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" aria-label="Mở ảnh chuyển khoản kích thước đầy đủ">
              <img src={url} alt="Ảnh chuyển khoản của khách" className="max-h-[56vh] w-full rounded-2xl border border-line bg-black object-contain" />
            </a>
          ) : (
            <p className="grid h-40 place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted">Không tải được ảnh chứng từ.</p>
          )}
          <dl className="glass-card grid grid-cols-2 gap-3 p-4 text-[13px]">
            <Info label="Khách hàng" value={p.display_name || '—'} />
            <Info label="Email" value={p.email} />
            <Info label="Gói" value={p.plan_name} />
            <Info label="Số tiền" value={formatVnd(p.amount_vnd)} />
            <Info label="Trạng thái" value={PAYMENT_STATUS_LABELS[p.status]} />
            <Info label="Gửi lúc" value={fmtDateTime(p.created_at)} />
          </dl>
          {p.note && (
            <p className="glass-card p-4 text-[14px] text-text">
              <span className="block text-[12px] font-semibold text-muted">Ghi chú của khách</span>
              {p.note}
            </p>
          )}
          {p.status === 'pending' ? (
            <Textarea label="Ghi chú gửi lại khách (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="VD: Không thấy giao dịch trong sao kê." />
          ) : (
            p.admin_note && <p className="text-[13px] text-muted">Ghi chú quản trị: {p.admin_note}</p>
          )}
        </div>
      )}
    </BottomSheet>
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
