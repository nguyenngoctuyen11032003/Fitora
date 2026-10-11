import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet, Button, Input, Segmented } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { MAX_TEMPLATE_ITEMS, templateItemsFromEntries } from '@/services/mealTemplates';
import { MEAL_TYPES, type MealEntry, type MealTemplate, type MealTemplateItem, type MealType } from '@/types/db';
import { defaultTemplateName, MEAL_SHORT } from '../lib';
import { portionLabel } from './parts';

export interface SaveTemplateSheetProps {
  open: boolean;
  onClose: () => void;
  meal: MealType;
  /** The meal's entries (logged order). */
  entries: MealEntry[];
  /** Names already used, for the prefilled "Bữa sáng quen thuộc 2". */
  existingNames: string[];
  onSave: (name: string, meal: MealType | null, items: MealTemplateItem[]) => Promise<MealTemplate | null>;
}

/** "Lưu thành bữa mẫu": name (prefilled), meal, which dishes to include. */
export function SaveTemplateSheet({ open, onClose, meal: defaultMeal, entries, existingNames, onSave }: SaveTemplateSheetProps) {
  const [name, setName] = useState('');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // Keep the rows while the sheet animates out.
  const last = useRef(entries);
  if (open) last.current = entries;
  const rows = open ? entries : last.current;

  useEffect(() => {
    if (!open) return;
    setName(defaultTemplateName(defaultMeal, existingNames));
    setMeal(defaultMeal);
    // Beyond the limit, the last dishes start unticked.
    setOff(new Set(entries.slice(MAX_TEMPLATE_ITEMS).map((e) => e.id)));
    setTried(false);
    setSaving(false);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = useMemo(() => rows.filter((e) => !off.has(e.id)), [rows, off]);
  const kcal = chosen.reduce((a, e) => a + (Number(e.kcal) || 0), 0);
  const nameErr = tried && !name.trim() ? 'Hãy đặt tên cho bữa mẫu.' : undefined;
  const tooMany = chosen.length > MAX_TEMPLATE_ITEMS;

  const toggle = (id: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    setTried(true);
    if (!name.trim() || !chosen.length || tooMany || busy.current) return;
    busy.current = true;
    setSaving(true);
    const t = await onSave(name.trim(), meal, templateItemsFromEntries(chosen));
    busy.current = false;
    setSaving(false);
    if (t) onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Lưu thành bữa mẫu"
      description="Lần sau ghi lại cả bữa chỉ với một chạm."
      footer={
        <Button block size="lg" loading={saving} disabled={!chosen.length || tooMany} onClick={() => void save()}>
          {chosen.length ? `Lưu bữa mẫu · ${chosen.length} món · ${formatNumber(kcal)} kcal` : 'Chọn ít nhất 1 món'}
        </Button>
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
        <Input label="Tên bữa mẫu" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={nameErr} autoComplete="off" enterKeyHint="done" />
        <div className="flex flex-col gap-2">
          <span className="pl-1 text-[13px] font-semibold text-muted">Thường ăn vào</span>
          <Segmented<MealType> ariaLabel="Thường ăn vào bữa" value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))} />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 pl-1 text-[13px] font-semibold text-muted">
            Món trong bữa ({chosen.length}/{rows.length})
          </legend>
          {tooMany && <p className="mb-1 pl-1 text-[12px] text-[var(--danger-text)]">Bữa mẫu tối đa {MAX_TEMPLATE_ITEMS} món.</p>}
          {rows.map((e) => {
            const on = !off.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(e.id)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
                    on ? 'border-gold bg-gold text-[#1a0e02]' : 'border-line text-transparent',
                  )}
                >
                  <Check className="h-4 w-4" />
                </span>
                <span className={clsx('min-w-0 flex-1', !on && 'opacity-50')}>
                  <span className="block truncate text-[14px] font-semibold text-text">{e.name}</span>
                  <span className="block truncate text-[12px] text-muted">{portionLabel(e.quantity, e.unit, e.grams)}</span>
                </span>
                <span className={clsx('tabular shrink-0 text-[14px] font-bold text-text', !on && 'opacity-50')}>
                  {formatNumber(e.kcal)}
                  <span className="ml-0.5 text-[11px] font-semibold text-muted">kcal</span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </BottomSheet>
  );
}
