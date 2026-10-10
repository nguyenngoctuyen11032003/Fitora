import { CalendarDays, Info, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, isISODate, todayISO } from '@/lib/date';
import { formatKg, formatNumber } from '@/lib/format';
import { deleteMeasurement, upsertMeasurement } from '@/services/body';
import type { BodyMeasurement } from '@/types/db';
import { BodyDiagram } from './BodyDiagram';
import { CIRCUMFERENCES, hasAnyMetric, num, type CircKey, type MetricKey } from './lib';

type Values = Record<MetricKey, number | null>;
const EMPTY: Values = { weight_kg: null, body_fat_pct: null, chest_cm: null, waist_cm: null, hip_cm: null, thigh_cm: null, arm_cm: null };
const RANGES: Record<MetricKey, [number, number]> = {
  weight_kg: [20, 400],
  body_fat_pct: [1, 75],
  chest_cm: [20, 300],
  waist_cm: [20, 300],
  hip_cm: [20, 300],
  thigh_cm: [10, 200],
  arm_cm: [5, 150],
};

const fromRow = (r: BodyMeasurement | null | undefined): Values =>
  r
    ? {
        weight_kg: num(r.weight_kg),
        body_fat_pct: num(r.body_fat_pct),
        chest_cm: num(r.chest_cm),
        waist_cm: num(r.waist_cm),
        hip_cm: num(r.hip_cm),
        thigh_cm: num(r.thigh_cm),
        arm_cm: num(r.arm_cm),
      }
    : { ...EMPTY };

export interface MeasurementSheetProps {
  open: boolean;
  /** Row being edited; null = new entry. */
  editing: BodyMeasurement | null;
  /** All rows — used to load an existing entry when the chosen date already has one. */
  rows: BodyMeasurement[];
  /** Latest known weight (quick-fill chip). */
  lastWeight: number | null;
  onClose: () => void;
  /** `replacedId`: the edited row was moved to another day and its old row deleted. */
  onSaved: (row: BodyMeasurement, replacedId?: string) => void;
  onDelete: (row: BodyMeasurement) => void;
}

/** Add / edit one day's measurements (unique per day → upsert). */
export function MeasurementSheet({ open, editing, rows, lastWeight, onClose, onSaved, onDelete }: MeasurementSheetProps) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState<Values>(EMPTY);
  const [note, setNote] = useState('');
  const [active, setActive] = useState<CircKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const byDate = useMemo(() => new Map(rows.map((r) => [r.measured_on, r])), [rows]);
  const existing = byDate.get(date) ?? null;

  // Reset when (re)opened.
  useEffect(() => {
    if (!open) return;
    const d = editing?.measured_on ?? todayISO();
    const base = editing ?? byDate.get(d) ?? null;
    setDate(d);
    setVals(fromRow(base));
    setNote(base?.note ?? '');
    setTried(false);
    setActive(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const changeDate = (d: string) => {
    setDate(d);
    // Same day already measured → load it so saving updates rather than silently overwrites.
    const row = byDate.get(d);
    if (row) {
      setVals(fromRow(row));
      setNote(row.note ?? '');
    }
    // Moving an entry to an empty day keeps the typed values.
  };

  const set = (k: MetricKey) => (v: number | null) => setVals((p) => ({ ...p, [k]: v }));
  const errOf = (k: MetricKey) => {
    const v = vals[k];
    if (v === null) return undefined;
    const [lo, hi] = RANGES[k];
    return v < lo || v > hi ? `Từ ${lo} đến ${hi}` : undefined;
  };
  const invalid = (Object.keys(RANGES) as MetricKey[]).some((k) => errOf(k));
  const dateOk = isISODate(date) && date <= todayISO();
  const empty = !hasAnyMetric(vals);

  const save = async () => {
    setTried(true);
    if (!dateOk || invalid || empty) {
      if (empty) toast.error('Hãy nhập ít nhất một chỉ số.');
      return;
    }
    setSaving(true);
    try {
      // Moving an edited entry to another day: delete the old day afterwards.
      const row = await upsertMeasurement({ measured_on: date, ...vals, note: note.trim() || null });
      let replacedId: string | undefined;
      if (editing && editing.measured_on !== date && editing.id !== row.id) {
        await deleteMeasurement(editing.id).catch(() => {});
        replacedId = editing.id;
      }
      onSaved(row, replacedId);
      toast.success(existing || editing ? 'Đã cập nhật số đo' : 'Đã lưu số đo');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updatingOther = existing && existing.id !== editing?.id;
  const target = updatingOther ? existing : editing;

  return (
    <BottomSheet
      open={open}
      onClose={() => !saving && onClose()}
      height="full"
      title={editing ? 'Sửa số đo' : 'Thêm số đo'}
      description="Mỗi ngày một bản ghi · để trống ô nào không đo."
      footer={
        <div className="flex items-center gap-2.5">
          {target && (
            <Button variant="secondary" aria-label="Xóa số đo này" onClick={() => onDelete(target)} disabled={saving} className="!px-4" icon={<Trash2 className="h-5 w-5 text-[var(--danger-text)]" />} />
          )}
          <Button block onClick={save} loading={saving} disabled={tried && (invalid || !dateOk)}>
            {target ? 'Cập nhật' : 'Lưu số đo'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-2">
          <Input
            type="date"
            label="Ngày đo"
            icon={<CalendarDays />}
            value={date}
            max={todayISO()}
            onChange={(e) => changeDate(e.target.value)}
            error={tried && !dateOk ? 'Chọn một ngày hợp lệ, không ở tương lai.' : undefined}
            hint={dateOk ? formatDayVi(date, 'long') : undefined}
          />
          {updatingOther && (
            <p className="flex items-start gap-2 rounded-2xl border border-[rgba(237,180,11,0.3)] bg-[rgba(237,180,11,0.08)] px-3 py-2.5 text-[13px] text-text/90">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              Ngày này đã có số đo — đã nạp lại để bạn cập nhật.
            </p>
          )}
        </div>

        {/* Weight — the main number */}
        <section className="flex flex-col gap-2" aria-label="Cân nặng và mỡ">
          <div className="grid grid-cols-[1.25fr_1fr] gap-3">
            <NumberField label="Cân nặng" unit="kg" value={vals.weight_kg} onChange={set('weight_kg')} decimals={1} min={20} max={400} placeholder={lastWeight ? formatNumber(lastWeight, 1) : '—'} error={errOf('weight_kg')} />
            <NumberField label="Mỡ cơ thể" unit="%" value={vals.body_fat_pct} onChange={set('body_fat_pct')} decimals={1} min={1} max={75} placeholder="—" error={errOf('body_fat_pct')} />
          </div>
          {lastWeight !== null && vals.weight_kg === null && (
            <div>
              <Chip size="sm" onClick={() => set('weight_kg')(lastWeight)} className="!min-h-[36px] !px-3">
                Như lần trước: {formatKg(lastWeight)}
              </Chip>
            </div>
          )}
        </section>

        {/* Circumferences with diagram legend */}
        <section aria-label="Vòng đo" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="eyebrow !text-[11px]">Vòng đo (cm)</h3>
            <span className="text-[12px] text-muted">Đo sát da, thước không siết</span>
          </div>
          <div className="flex gap-3">
            <div className="glass-card flex w-[92px] shrink-0 items-center justify-center !rounded-[20px] px-1 py-3">
              <BodyDiagram active={active} className="w-[76px]" />
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2.5 gap-y-3">
              {CIRCUMFERENCES.map((c) => (
                <div key={c.key} onFocus={() => setActive(c.key)} onBlur={() => setActive(null)} className={c.n === 5 ? 'col-span-2' : undefined}>
                  <NumberField
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-gold text-[10px] font-extrabold text-[#1a0e02]">{c.n}</span>
                        {c.label}
                      </span>
                    }
                    value={vals[c.key]}
                    onChange={set(c.key)}
                    decimals={1}
                    min={c.min}
                    max={c.max}
                    placeholder="—"
                    error={errOf(c.key)}
                  />
                </div>
              ))}
            </div>
          </div>
          <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-muted">
            <li><b className="text-text/80">Eo:</b> ngang rốn, thở ra nhẹ. <b className="text-text/80">Hông:</b> chỗ mông nở nhất.</li>
            <li><b className="text-text/80">Đùi, bắp tay:</b> chỗ to nhất, đo cùng một bên mỗi lần.</li>
          </ul>
        </section>

        <Input label="Ghi chú" placeholder="VD: sau khi ngủ dậy, trước ăn sáng" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
    </BottomSheet>
  );
}
