import { Droplet, Footprints, ScanLine } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { MEAL_LABELS, type MealType } from '@/types/db';

interface Props {
  date: string;
  suggestedMeal: MealType;
  /** +250 ml water (optimistic; the page shows an undo toast). */
  onAddWater: () => void;
  /** Opens the steps sheet. */
  onLogSteps: () => void;
  className?: string;
}

const ITEM =
  'glass-card flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 text-center transition-transform active:scale-[0.96]';
const LABEL = 'max-w-full truncate text-[12.5px] font-semibold text-text';

/** One-tap actions right under the hero: scan a meal, drink a glass, log steps. */
export const QuickActions = memo(function QuickActions({ date, suggestedMeal, onAddWater, onLogSteps, className }: Props) {
  return (
    <section aria-label="Thao tác nhanh" className={className}>
      <ul className="grid grid-cols-3 gap-2.5">
        <li className="min-w-0">
          <Link
            to={`/scan?meal=${suggestedMeal}&date=${date}`}
            className={ITEM}
            aria-label={`Quét ${MEAL_LABELS[suggestedMeal].toLowerCase()}`}
          >
            <ScanLine className="h-5 w-5 text-gold" aria-hidden="true" />
            <span className={LABEL}>Quét món</span>
          </Link>
        </li>
        <li className="min-w-0">
          <button type="button" onClick={onAddWater} className={`${ITEM} w-full`} aria-label="Thêm 250 ml nước">
            <Droplet className="h-5 w-5 text-water" aria-hidden="true" />
            <span className={LABEL}>+250 ml</span>
          </button>
        </li>
        <li className="min-w-0">
          <button type="button" onClick={onLogSteps} className={`${ITEM} w-full`} aria-label="Ghi số bước chân">
            <Footprints className="h-5 w-5 text-burn" aria-hidden="true" />
            <span className={LABEL}>Bước chân</span>
          </button>
        </li>
      </ul>
    </section>
  );
});
