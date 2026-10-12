import clsx from 'clsx';
import { Check, History, PenLine, Plus, Search, X } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import type { ActivityDef } from '@/data/activities';
import { useDebounced } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { WORKOUT_CATEGORIES, WORKOUT_CATEGORY_LABELS, type Workout, type WorkoutCategory } from '@/types/db';
import { ActivityIcon, CATEGORY_COLOR } from './ActivityIcon';
import { recentActivityKeys, searchActivities } from './lib';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  category: WorkoutCategory | 'all';
  onCategory: (c: WorkoutCategory | 'all') => void;
  /** Currently selected activity key (highlighted). */
  selected: string;
  recent: Workout[];
  onPick: (a: ActivityDef) => void;
  onPickCustom: (name: string) => void;
  onPickRecent: (w: Workout) => void;
}

/** Search + category chips + recent quick-log + catalogue list (step 1 of the workout sheet). */
export function ActivityPicker({ query, onQuery, category, onCategory, selected, recent, onPick, onPickCustom, onPickRecent }: Props) {
  // Typing stays instant; filtering the catalogue waits for a short pause.
  const q = useDebounced(query, 120);
  const recentKeys = useMemo(() => recentActivityKeys(recent), [recent]);
  const results = useMemo(() => searchActivities(q, category, undefined, recentKeys), [q, category, recentKeys]);
  const grouped = useMemo(() => {
    if (q.trim() || category !== 'all') return null;
    return WORKOUT_CATEGORIES.map((c) => ({ c, items: results.filter((a) => a.category === c) })).filter((g) => g.items.length);
  }, [results, q, category]);
  const typed = query.trim();

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="text"
        placeholder="Tìm: chạy bộ, cầu lông, yoga…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter picks the best match (or the typed name when nothing matches).
          if (e.key !== 'Enter' || !typed) return;
          e.preventDefault();
          const best = searchActivities(query, category, undefined, recentKeys)[0];
          if (best) onPick(best);
          else onPickCustom(query);
        }}
        icon={<Search />}
        aria-label="Tìm hoạt động"
        enterKeyHint="search"
        autoComplete="off"
        trailing={
          query ? (
            <button type="button" onClick={() => onQuery('')} aria-label="Xóa tìm kiếm" className="-mr-2 grid h-11 w-11 place-items-center text-muted">
              <X className="h-4 w-4" />
            </button>
          ) : undefined
        }
      />

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:flex-wrap lg:overflow-x-visible" role="group" aria-label="Nhóm hoạt động">
        <Chip selected={category === 'all'} onClick={() => onCategory('all')}>
          Tất cả
        </Chip>
        {WORKOUT_CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => onCategory(c)} dot={CATEGORY_COLOR[c]}>
            {WORKOUT_CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      {!typed && category === 'all' && recent.length > 0 && (
        <section aria-label="Gần đây">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Ghi lại nhanh
          </p>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:flex-wrap lg:overflow-x-visible">
            {recent.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onPickRecent(w)}
                aria-label={`Ghi lại ${w.title}, ${w.duration_min} phút`}
                className="glass-card flex min-h-[56px] w-[188px] max-w-[70vw] shrink-0 items-center gap-2.5 p-2.5 pr-3 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none"
              >
                <ActivityIcon activity={w.activity} category={w.category} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-bold text-text">{w.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {w.duration_min} phút · MET {formatNumber(w.met, 1)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {typed && (
        <button
          type="button"
          onClick={() => onPickCustom(query)}
          className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-dashed border-gold/40 px-3 text-left text-sm text-text hover:bg-white/[0.04]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
            <PenLine className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 break-words">
            Dùng “<b className="font-bold">{typed}</b>”
            <span className="block text-[12px] text-muted">Hoạt động tự nhập · chỉnh MET sau</span>
          </span>
        </button>
      )}

      {grouped ? (
        grouped.map((g) => (
          <section key={g.c} aria-label={WORKOUT_CATEGORY_LABELS[g.c]}>
            <p className="eyebrow mb-1.5 mt-1">{WORKOUT_CATEGORY_LABELS[g.c]}</p>
            <ActivityList items={g.items} onPick={onPick} selected={selected} />
          </section>
        ))
      ) : results.length ? (
        <ActivityList items={results} onPick={onPick} selected={selected} />
      ) : (
        <p className="py-6 text-center text-sm text-muted" role="status">
          Không thấy hoạt động phù hợp — dùng tên bạn vừa nhập ở trên.
        </p>
      )}
    </div>
  );
}

const ActivityList = memo(function ActivityList({ items, onPick, selected }: { items: ActivityDef[]; onPick: (a: ActivityDef) => void; selected: string }) {
  return (
    <ul className="flex flex-col">
      {items.map((a) => {
        const mets = a.variants.map((v) => v.met);
        const lo = Math.min(...mets);
        const hi = Math.max(...mets);
        const on = a.key === selected;
        return (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => onPick(a)}
              aria-current={on ? 'true' : undefined}
              className={clsx(
                'flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]',
                on && 'bg-gold/10',
              )}
            >
              <ActivityIcon activity={a.key} category={a.category} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-text">{a.name}</span>
                <span className="block text-[12px] text-muted">
                  MET {lo === hi ? formatNumber(lo, 1) : `${formatNumber(lo, 1)}–${formatNumber(hi, 1)}`}
                  {a.variants.length > 1 ? ` · ${a.variants.length} mức` : ''}
                </span>
              </span>
              {on ? <Check className="h-5 w-5 text-gold" aria-hidden="true" /> : <Plus className="h-5 w-5 text-muted" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
});
