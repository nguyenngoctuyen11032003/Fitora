import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { initials } from '@/lib/format';

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  /** px (default 40). */
  size?: number;
  className?: string;
}

/** Round avatar from profiles.avatar_url with initials fallback (gold → ember). */
export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  // A new avatar URL (e.g. just uploaded) gets a fresh chance to load.
  useEffect(() => setBroken(false), [src]);
  const showImg = src && !broken;
  return (
    <span
      className={clsx(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-white/15',
        !showImg && 'bg-gradient-to-br from-gold to-ember',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} draggable={false} />
      ) : (
        <span className="font-extrabold tracking-[-0.04em] text-[#1a0e02]" style={{ fontSize: size * 0.4 }} aria-hidden="true">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
