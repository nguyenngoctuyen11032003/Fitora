import clsx from 'clsx';
import type { CircKey } from './lib';

// Abstract front silhouette (no realism needed) with the 5 tape lines numbered like the form fields.
const MARKS: { key: CircKey; n: number; x1: number; x2: number; y: number; lx: number }[] = [
  { key: 'chest_cm', n: 1, x1: 31, x2: 69, y: 50, lx: 84 },
  { key: 'waist_cm', n: 2, x1: 30, x2: 70, y: 74, lx: 84 },
  { key: 'hip_cm', n: 3, x1: 28, x2: 72, y: 95, lx: 84 },
  { key: 'thigh_cm', n: 4, x1: 52, x2: 70, y: 122, lx: 84 },
  { key: 'arm_cm', n: 5, x1: 13, x2: 27, y: 62, lx: 7 },
];

export function BodyDiagram({ active, className }: { active?: CircKey | null; className?: string }) {
  return (
    <svg viewBox="0 0 96 196" className={clsx('h-auto', className)} role="img" aria-label="Sơ đồ vị trí đo: 1 ngực, 2 eo, 3 hông, 4 đùi, 5 bắp tay">
      <g fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" strokeLinejoin="round">
        <circle cx="50" cy="17" r="10.5" />
        <path d="M45 27 h10 v7 h-10z" />
        <path d="M31 37 Q50 31 69 37 Q73 40 73 46 L71 72 Q70 84 73 98 L27 98 Q30 84 29 72 L27 46 Q27 40 31 37Z" />
        <path d="M27 40 Q19 44 18 60 L14 98 Q14 102 18 102 Q21 102 21 98 L27 66" />
        <path d="M73 40 Q81 44 82 60 L86 98 Q86 102 82 102 Q79 102 79 98 L73 66" />
        <path d="M28 97 L48 97 L47 186 Q47 190 42 190 L38 190 Q34 190 34 186 Z" />
        <path d="M52 97 L72 97 L66 186 Q66 190 62 190 L58 190 Q53 190 53 186 Z" />
      </g>
      {MARKS.map((m) => {
        const on = active === m.key;
        const dim = active && !on;
        return (
          <g key={m.key} opacity={dim ? 0.35 : 1} className="transition-opacity duration-200">
            <line x1={m.x1} x2={m.x2} y1={m.y} y2={m.y} stroke="var(--gold)" strokeWidth={on ? 2.2 : 1.4} strokeDasharray="3 2.2" strokeLinecap="round" />
            <circle cx={m.lx} cy={m.y} r={on ? 6.5 : 5.5} fill={on ? 'var(--gold)' : 'rgba(237,180,11,0.18)'} stroke="var(--gold)" strokeWidth="1" />
            <text x={m.lx} y={m.y + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="800" fill={on ? '#1a0e02' : 'var(--gold)'}>
              {m.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
