import clsx from 'clsx';
import { AlertTriangle, ChevronRight, Sparkles, ThumbsUp } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import type { Insight } from '../insights';

const TONE = {
  good: { icon: ThumbsUp, color: 'var(--ok)', bg: 'from-[rgba(127,209,139,0.14)]' },
  warn: { icon: AlertTriangle, color: 'var(--ember)', bg: 'from-[rgba(225,80,10,0.18)]' },
  info: { icon: Sparkles, color: 'var(--gold)', bg: 'from-[rgba(237,180,11,0.14)]' },
} as const;

/** "Nhận xét" coaching line; tap to cycle through the other insights. */
export const InsightStrip = memo(function InsightStrip({ insights, className }: { insights: Insight[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  const key = insights.map((i) => i.id).join('|');
  useEffect(() => setIdx(0), [key]);
  if (!insights.length) return null;
  const cur = insights[Math.min(idx, insights.length - 1)];
  const t = TONE[cur.tone];
  const multi = insights.length > 1;

  const body = (
    <>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"
        style={{ color: t.color }}
        aria-hidden="true"
      >
        <t.icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="eyebrow flex items-center gap-2 !text-[10px]">
          Nhận xét
          {multi && (
            <span className="tabular tracking-normal text-muted/80">
              {idx + 1}/{insights.length}
            </span>
          )}
        </span>
        <span key={cur.id} className="mt-1 block animate-fade-in text-[14px] font-medium leading-snug text-text" aria-live="polite">
          {cur.text}
        </span>
      </span>
      {multi && <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />}
    </>
  );

  const cls = clsx(
    'glass-card flex w-full items-center gap-3 bg-gradient-to-r to-transparent px-4 py-3.5',
    t.bg,
    multi && 'transition-transform active:scale-[0.985]',
    className,
  );

  return multi ? (
    <button type="button" className={cls} onClick={() => setIdx((i) => (i + 1) % insights.length)} aria-label={`Nhận xét: ${cur.text.replace(/\.\s*$/, '')}. Chạm để xem nhận xét tiếp theo.`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
});
