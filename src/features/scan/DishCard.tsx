import clsx from 'clsx';
import { AlertTriangle, BookmarkCheck, ChevronDown, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Chip } from '@/components/ui/Chip';
import { GlassButton } from '@/components/ui/GlassButton';
import { MACROS } from '@/components/ui/MacroBar';
import { NumberField } from '@/components/ui/NumberField';
import { formatGrams, formatNumber } from '@/lib/format';
import type { CustomFood } from '@/types/db';
import { remembers, servingNutrients, servingText } from './saved';
import { confidenceLevel, dishIssues, dishWarning, macroShares, quantityBounds, SCAN_UNITS, setGrams, setQuantity, setUnit, unitOptions, type ScanDish } from './scale';

const CONF = {
  high: { label: 'Chắc chắn', cls: 'border-[rgba(127,209,139,0.4)] bg-[rgba(127,209,139,0.1)] text-ok' },
  medium: { label: 'Khá chắc', cls: 'border-[rgba(237,180,11,0.4)] bg-[rgba(237,180,11,0.1)] text-gold' },
  low: { label: 'Cần kiểm tra', cls: 'border-[rgba(255,107,94,0.4)] bg-[rgba(225,6,0,0.1)] text-[var(--danger-text)]' },
} as const;

export function ConfidenceBadge({ value }: { value: number | null }) {
  const lvl = confidenceLevel(value);
  if (!lvl || value === null) {
    return <span className="inline-flex min-h-[24px] items-center rounded-full border border-line bg-white/[0.04] px-2.5 text-[11px] font-bold text-muted">Tự nhập</span>;
  }
  const c = CONF[lvl];
  return (
    <span
      className={clsx('inline-flex min-h-[24px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-bold', c.cls)}
      title={`Độ tin cậy ${Math.round(value * 100)}%`}
    >
      <span className="tabular">{Math.round(value * 100)}%</span>
      <span className="opacity-80">· {c.label}</span>
    </span>
  );
}

/** Three thin bars: grams + share of this dish's energy per macro. */
export function MacroMini({ dish }: { dish: Pick<ScanDish, 'protein_g' | 'carbs_g' | 'fat_g'> }) {
  const s = macroShares(dish);
  const share = { protein_g: s.protein, carbs_g: s.carbs, fat_g: s.fat };
  return (
    <div className="grid grid-cols-3 gap-3">
      {MACROS.map((m) => (
        <div key={m.key} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-1 text-[12px]">
            <span className="truncate font-semibold text-muted">{m.label}</span>
            <span className="tabular font-bold text-text">{formatGrams(dish[m.key])}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="img" aria-label={`${m.label} ${formatNumber(share[m.key] * 100)}% năng lượng`}>
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${share[m.key] * 100}%`, background: m.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UnitSelect({ value, onChange, id, label = 'Đơn vị', units }: { value: string; onChange: (u: string) => void; id?: string; label?: string; units?: readonly string[] }) {
  const auto = useId();
  const fid = id ?? auto;
  const base = units ?? SCAN_UNITS;
  const options = base.includes(value) ? base : [value, ...base];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="pl-1 text-[13px] font-semibold text-muted">
        {label}
      </label>
      <div className="field relative !pr-3">
        <select id={fid} value={value} onChange={(e) => onChange(e.target.value)} className="scan-select">
          {options.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" aria-hidden="true" />
      </div>
    </div>
  );
}

interface DishCardProps {
  dish: ScanDish;
  index: number;
  onChange: (d: ScanDish) => void;
  onRemove: () => void;
  /** Saved food with the same name ("Món của tôi"), if any. */
  saved?: CustomFood | null;
  onApplySaved?: (food: CustomFood) => void;
  onRevertSaved?: () => void;
}

/** On/off switch row (44px+ target). */
export function RememberSwitch({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-1 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-bold text-text">{title}</span>
        <span className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={clsx(
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none',
          checked ? 'border-[rgba(237,180,11,0.7)] bg-gold' : 'border-line bg-white/[0.08]',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-[22px] w-[22px] rounded-full shadow transition-transform duration-200 motion-reduce:transition-none',
            checked ? 'translate-x-[22px] bg-[#1a0e02]' : 'translate-x-0.5 bg-text/80',
          )}
        />
      </span>
    </button>
  );
}

export function DishCard({ dish, index, onChange, onRemove, saved, onApplySaved, onRevertSaved }: DishCardProps) {
  const nameId = useId();
  const isGrams = dish.unit === 'g';
  const bounds = quantityBounds(dish);
  const issues = dishIssues(dish);
  const warning = dishWarning(dish);
  const nameMissing = !!issues.name;
  const kcalMsgId = useId();
  // In grams mode the count IS the weight: show a weight error on the one field there is.
  const qtyError = isGrams ? (issues.quantity ?? issues.grams) : issues.quantity;
  const gramsError = issues.quantity ? undefined : issues.grams;
  const extra = dish.ingredients.length - 6;

  return (
    <article
      data-dish-key={dish.key}
      className="glass-card animate-fade-slide-up p-4"
      style={{ animationDelay: `${Math.min(index, 5) * 80}ms` }}
      aria-label={dish.name || `Món ${index + 1}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="eyebrow !text-[10px]">Món {index + 1}</span>
            <ConfidenceBadge value={dish.confidence} />
          </div>
          <label htmlFor={nameId} className="sr-only">
            Tên món
          </label>
          <div
            className={clsx(
              'group flex items-center gap-2 rounded-xl border border-transparent px-1 transition-colors focus-within:border-[rgba(237,180,11,0.6)] focus-within:bg-white/[0.05]',
              nameMissing && '!border-[rgba(255,107,94,0.7)]',
            )}
          >
            <input
              id={nameId}
              value={dish.name}
              maxLength={120}
              placeholder="Tên món"
              aria-invalid={nameMissing || undefined}
              onChange={(e) => onChange({ ...dish, name: e.target.value })}
              className="min-h-[44px] w-full min-w-0 bg-transparent text-[20px] font-extrabold tracking-[-0.03em] text-text outline-none placeholder:text-muted"
            />
            <Pencil className="h-4 w-4 shrink-0 text-muted group-focus-within:text-gold" aria-hidden="true" />
          </div>
        </div>
        <GlassButton label={`Xóa ${dish.name || 'món này'}`} onClick={onRemove} className="mt-6 shrink-0 text-muted hover:text-[var(--danger-text)]">
          <Trash2 className="h-[18px] w-[18px]" />
        </GlassButton>
      </div>

      {dish.ingredients.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Thành phần">
          {dish.ingredients.slice(0, 6).map((ing, i) => (
            <Chip key={`${ing}-${i}`} size="sm">
              {ing}
            </Chip>
          ))}
          {extra > 0 && <Chip size="sm">+{extra}</Chip>}
        </div>
      )}

      {dish.savedFoodId ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[rgba(127,209,139,0.3)] bg-ok/[0.07] px-3 py-2">
          <BookmarkCheck className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-text/90">Đang dùng số liệu đã lưu của bạn</span>
          {dish.aiBackup && onRevertSaved && (
            <button type="button" onClick={onRevertSaved} className="min-h-[44px] shrink-0 text-[13px] font-bold text-gold">
              Dùng ước tính AI
            </button>
          )}
        </div>
      ) : saved && onApplySaved ? (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[rgba(237,180,11,0.3)] bg-gold/[0.07] p-3">
          <p className="flex items-start gap-2 text-[13px] leading-snug text-text/90">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <span className="min-w-0">
              Bạn đã lưu <span className="font-bold">{saved.name}</span>: <span className="tabular font-bold text-gold">{formatNumber(servingNutrients(saved).kcal)} kcal</span> / <span className="whitespace-nowrap">{servingText(saved)}</span>
            </span>
          </p>
          <button
            type="button"
            onClick={() => onApplySaved(saved)}
            className="min-h-[44px] rounded-full bg-[rgba(237,180,11,0.9)] px-4 text-[14px] font-bold text-[#1a0e02] transition-transform active:scale-[0.98]"
          >
            Dùng số liệu đã lưu
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-[1fr_112px] gap-2.5">
        <NumberField
          label={isGrams ? 'Khối lượng' : 'Số lượng'}
          value={dish.quantity}
          onChange={(v) => onChange(setQuantity(dish, v ?? 0))}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          decimals={bounds.decimals}
          stepper
          error={qtyError}
        />
        <UnitSelect value={dish.unit} units={unitOptions(dish)} onChange={(u) => onChange(setUnit(dish, u))} />
      </div>

      <div className="mt-3 flex items-end gap-3">
        {!isGrams ? (
          <NumberField
            label="Tổng khối lượng"
            value={dish.grams}
            onChange={(v) => onChange(setGrams(dish, v ?? 0))}
            min={0}
            max={5000}
            decimals={0}
            unit="g"
            error={gramsError}
            wrapperClassName="w-[132px] shrink-0"
          />
        ) : (
          <span className="flex-1" />
        )}
        <div className="ml-auto flex min-w-0 flex-col items-end pb-1" aria-live="polite">
          <span className="eyebrow !text-[10px]">Năng lượng</span>
          <span className="mt-1 flex items-baseline gap-1">
            <span className={clsx('num text-[40px]', issues.kcal ? 'text-[var(--danger-text)]' : 'text-gradient-gold')} aria-describedby={issues.kcal || warning ? kcalMsgId : undefined}>
              {formatNumber(dish.kcal)}
            </span>
            <span className="text-sm font-semibold text-muted">kcal</span>
          </span>
        </div>
      </div>

      {(issues.kcal || warning) && (
        <p
          id={kcalMsgId}
          role={issues.kcal ? 'alert' : 'status'}
          className={clsx(
            'mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold leading-snug',
            issues.kcal ? 'bg-[rgba(225,6,0,0.12)] text-[var(--danger-text)]' : 'bg-[rgba(237,180,11,0.1)] text-gold',
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{issues.kcal ?? warning}</span>
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3.5">
        <MacroMini dish={dish} />
        {issues.macros && (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-[var(--danger-text)]">
            {issues.macros}
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <RememberSwitch
          checked={remembers(dish)}
          onChange={(v) => onChange({ ...dish, remember: v })}
          title="Ghi nhớ món này"
          hint={
            saved || dish.savedFoodId
              ? 'Cập nhật trong Món của tôi với số liệu này'
              : 'Lưu vào Món của tôi — lần sau chọn lại, không cần quét'
          }
        />
      </div>
    </article>
  );
}
