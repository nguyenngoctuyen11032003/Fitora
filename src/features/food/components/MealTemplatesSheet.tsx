import { Layers, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, EmptyState, GlassButton, Input, Modal, Segmented } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { MEAL_LABELS, MEAL_TYPES, type MealTemplate, type MealType } from '@/types/db';
import { dishesSummary, MEAL_SHORT, usageLabel } from '../lib';
import type { TemplateDupPrompt } from '../useSmartLog';

export interface MealTemplatesSheetProps {
  open: boolean;
  onClose: () => void;
  templates: MealTemplate[];
  /** Meal pre-selected for logging. */
  meal: MealType;
  onLog: (t: MealTemplate, meal: MealType) => Promise<boolean>;
  onRename: (t: MealTemplate, patch: { name: string; meal: MealType | null }) => Promise<boolean>;
  onDelete: (t: MealTemplate) => void;
}

/** "Sáng · Đã ghi 2 lần · hôm qua" (own line, so it is not cut off beside the buttons on a 360 px phone). */
function templateUsage(t: MealTemplate): string {
  const use = usageLabel(t.use_count, t.last_used_at).replace('Đã ăn', 'Đã ghi').replace('Chưa ăn lần nào', 'Chưa ghi');
  return [t.meal ? MEAL_SHORT[t.meal] : null, use].filter(Boolean).join(' · ');
}

/** "Bữa mẫu": log a whole meal with one tap, rename, delete (with undo). */
export function MealTemplatesSheet({ open, onClose, templates, meal: defaultMeal, onLog, onRename, onDelete }: MealTemplatesSheetProps) {
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    setMeal(defaultMeal);
    setEditing(null);
    setBusyId(null);
    busy.current = false;
  }, [open, defaultMeal]);

  const log = async (t: MealTemplate) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(t.id);
    const ok = await onLog(t, meal);
    busy.current = false;
    setBusyId(null);
    if (ok) onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Bữa mẫu" description="Ghi lại cả bữa quen thuộc chỉ với một chạm." height={templates.length > 3 ? 'full' : 'auto'}>
      <div className="flex flex-col gap-4">
        {templates.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="pl-1 text-[13px] font-semibold text-muted">Ghi vào</span>
            <Segmented<MealType> ariaLabel="Ghi bữa mẫu vào bữa" size="sm" value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))} />
          </div>
        )}
        {templates.length === 0 ? (
          <EmptyState
            compact
            icon={Layers}
            title="Chưa có bữa mẫu"
            description="Trong Nhật ký, chọn “Lưu thành bữa mẫu” ở một bữa đã ghi — lần sau ghi lại cả bữa bằng một chạm."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) =>
              editing === t.id ? (
                <TemplateEditor
                  key={t.id}
                  template={t}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    if (await onRename(t, patch)) setEditing(null);
                  }}
                  onDelete={() => {
                    setEditing(null);
                    onDelete(t);
                  }}
                />
              ) : (
                <li key={t.id} className="glass-card flex items-center gap-2 rounded-2xl p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-text">{t.name}</p>
                    <p className="line-clamp-2 break-words text-[12px] text-muted">{dishesSummary(t.items, 3)}</p>
                    <p className="tabular text-[12px] text-muted">
                      {t.items.length} món · <span className="font-semibold text-text">{formatNumber(t.total_kcal)} kcal</span>
                    </p>
                    <p className="text-[12px] text-muted">{templateUsage(t)}</p>
                  </div>
                  <GlassButton label={`Sửa bữa mẫu ${t.name}`} onClick={() => setEditing(t.id)} className="shrink-0 text-muted">
                    <Pencil className="h-4 w-4" />
                  </GlassButton>
                  <Button size="sm" className="shrink-0" loading={busyId === t.id} disabled={!!busyId && busyId !== t.id} onClick={() => void log(t)} aria-label={`Ghi ${t.name} vào ${MEAL_LABELS[meal].toLowerCase()}`}>
                    Ghi
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

function TemplateEditor({
  template,
  onCancel,
  onSave,
  onDelete,
}: {
  template: MealTemplate;
  onCancel: () => void;
  onSave: (patch: { name: string; meal: MealType | null }) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [meal, setMeal] = useState<MealType | 'any'>(template.meal ?? 'any');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave({ name: name.trim(), meal: meal === 'any' ? null : meal });
    setSaving(false);
  };
  return (
    <li className="glass-card flex flex-col gap-3 rounded-2xl p-3">
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input label="Tên bữa mẫu" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" autoFocus error={!name.trim() ? 'Hãy đặt tên cho bữa mẫu.' : undefined} />
        <Segmented<MealType | 'any'>
          ariaLabel="Thường ăn vào bữa"
          size="sm"
          value={meal}
          onChange={setMeal}
          options={[...MEAL_TYPES.map((m) => ({ value: m as MealType | 'any', label: MEAL_SHORT[m] })), { value: 'any', label: 'Bất kỳ' }]}
        />
        <div className="flex items-center gap-2">
          <GlassButton label={`Xóa bữa mẫu ${template.name}`} onClick={onDelete} className="shrink-0 text-[var(--danger-text)]">
            <Trash2 className="h-5 w-5" />
          </GlassButton>
          <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
            Hủy
          </Button>
          <Button type="submit" size="sm" className="flex-1" loading={saving} disabled={!name.trim()}>
            Lưu
          </Button>
        </div>
      </form>
    </li>
  );
}

/** "Bữa trưa đã có Cơm gà xối mỡ — ghi thêm?" before a template doubles dishes already logged. */
export function TemplateDupDialog({ prompt }: { prompt: TemplateDupPrompt | null }) {
  // Keep the last prompt while the dialog animates out.
  const last = useRef<TemplateDupPrompt | null>(null);
  if (prompt) last.current = prompt;
  const p = prompt ?? last.current;
  if (!p) return null;
  const { missing } = p;
  const shown = p.names.slice(0, 2).map((n) => `“${n}”`).join(', ') + (p.names.length > 2 ? ` và ${p.names.length - 2} món khác` : '');
  const mealLabel = MEAL_LABELS[p.meal];
  return (
    <Modal
      open={!!prompt}
      onClose={() => p.resolve('cancel')}
      title="Món đã có trong bữa"
      footer={
        // One stacked column (the footer would otherwise go 3-across on wide screens).
        <div className="flex w-full flex-col-reverse gap-2.5">
          <Button variant="ghost" onClick={() => p.resolve('cancel')} block>
            Hủy
          </Button>
          <Button variant="secondary" onClick={() => p.resolve('all')} block data-autofocus={missing > 0 ? undefined : true}>
            {missing > 0 ? `Ghi cả bữa (${p.total} món)` : 'Vẫn ghi thêm'}
          </Button>
          {missing > 0 && (
            <Button onClick={() => p.resolve('missing')} block data-autofocus>
              Chỉ ghi {missing} món còn thiếu
            </Button>
          )}
        </div>
      }
    >
      {mealLabel} đã có {shown}.{' '}
      {missing > 0 ? `Ghi bữa mẫu “${p.template.name}” sẽ thêm trùng các món này.` : `Ghi “${p.template.name}” sẽ thêm lần nữa toàn bộ món.`}
    </Modal>
  );
}
