import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Section title (display type) with an optional "see all" link (44px target). */
export function SectionHeader({ id, title, to, linkLabel }: { id: string; title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id={id} className="display text-[26px] text-text">
        {title}
      </h2>
      {to && linkLabel && (
        <Link
          to={to}
          className="-mr-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-full px-2 text-[13px] font-semibold text-gold transition-opacity hover:opacity-80"
        >
          {linkLabel}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
