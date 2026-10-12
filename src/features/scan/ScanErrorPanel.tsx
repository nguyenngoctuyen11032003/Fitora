import { Camera, CloudOff, LogIn, PencilLine, RefreshCw, Search, TriangleAlert, Utensils, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AI_ERROR_MESSAGES } from '@/services/ai';
import type { AiErrorCode } from '@/types/db';

const META: Record<AiErrorCode, { icon: LucideIcon; title: string }> = {
  not_food: { icon: Utensils, title: 'Chưa thấy món ăn' },
  quota_exceeded: { icon: TriangleAlert, title: 'Hết lượt quét hôm nay' },
  bad_request: { icon: TriangleAlert, title: 'Ảnh chưa dùng được' },
  ai_unavailable: { icon: CloudOff, title: 'AI đang bận' },
  network: { icon: WifiOff, title: 'Mất kết nối' },
  unauthorized: { icon: LogIn, title: 'Phiên đã hết hạn' },
};

interface Props {
  code: AiErrorCode;
  message?: string;
  photoUrl: string | null;
  manualHref: string;
  onRetake: () => void;
  onRetry: () => void;
  onManual: () => void;
  /** False when there is no photo to resend (e.g. a Live Scan session ended). */
  canRetry?: boolean;
  /** Extra way out shown under the actions (e.g. the saved-foods strip). */
  extra?: ReactNode;
}

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Friendly full-screen error after a scan, with the next best action first. */
export function ScanErrorPanel({ code, message, photoUrl, manualHref, onRetake, onRetry, onManual, canRetry = true, extra }: Props) {
  const online = useOnline();
  const rootRef = useRef<HTMLDivElement>(null);
  // Move focus into the dialog so screen readers announce it and keyboard users land on it.
  useEffect(() => rootRef.current?.focus(), []);
  const offline = code === 'network' && !online;
  const { icon: Icon, title } = offline ? { icon: WifiOff, title: 'Bạn đang ngoại tuyến' } : (META[code] ?? META.ai_unavailable);
  const canRetrySame = canRetry && (code === 'ai_unavailable' || code === 'network');
  return (
    <div ref={rootRef} tabIndex={-1} className="absolute inset-0 z-20 flex flex-col overflow-y-auto overscroll-contain bg-black outline-none lg:top-[88px] lg:bg-bg" role="alertdialog" aria-modal="true" aria-labelledby="scan-err-title" aria-describedby="scan-err-msg">
      {/* Laptop: the dimmed photo fills one rounded stage, the message is centred on it */}
      <div className="contents lg:absolute lg:inset-x-6 lg:bottom-6 lg:top-0 lg:block lg:overflow-hidden lg:rounded-[32px] lg:border lg:border-line lg:bg-black">
      {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/90 lg:to-black/70" aria-hidden="true" />
      </div>
      <div className="relative mt-auto px-5 pt-[calc(var(--safe-top)+16px)] lg:mx-auto lg:my-auto lg:w-full lg:max-w-[560px] lg:px-8 lg:pt-10 lg:!pb-12" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        {extra && <div className="mb-3 animate-fade-slide-up">{extra}</div>}
        <div className="glass-strong animate-fade-slide-up rounded-[28px] p-6">
          <div className="relative mb-4 inline-grid">
            <span className="absolute inset-0 rounded-[20px] bg-[rgba(225,80,10,0.4)] blur-xl" aria-hidden="true" />
            <span className="glass relative grid h-14 w-14 place-items-center rounded-[20px] text-gold">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
          </div>
          <h2 id="scan-err-title" className="display text-[30px] text-text">
            {title}
          </h2>
          <p id="scan-err-msg" className="mt-2 text-[15px] leading-relaxed text-muted">
            {offline ? 'Thiết bị đang mất mạng. Ảnh vẫn được giữ — Fitora sẽ tự gửi lại khi có kết nối.' : message || AI_ERROR_MESSAGES[code]}
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            {code === 'unauthorized' ? (
              <Link to="/login" className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full bg-gold font-bold text-[#1a0e02]">
                <LogIn className="h-5 w-5" aria-hidden="true" /> Đăng nhập lại
              </Link>
            ) : code === 'quota_exceeded' ? (
              <Link to={manualHref} className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full bg-gold font-bold text-[#1a0e02]">
                <Search className="h-5 w-5" aria-hidden="true" /> Tìm thủ công
              </Link>
            ) : canRetrySame ? (
              <Button size="lg" block onClick={onRetry} disabled={offline} icon={<RefreshCw className="h-5 w-5" />}>
                {offline ? 'Đang chờ mạng…' : 'Thử lại'}
              </Button>
            ) : (
              <Button size="lg" block onClick={onRetake} icon={<Camera className="h-5 w-5" />}>
                {code === 'bad_request' ? 'Chọn ảnh khác' : 'Chụp lại'}
              </Button>
            )}

            {code !== 'quota_exceeded' && code !== 'unauthorized' && (
              <div className="grid grid-cols-2 gap-2.5">
                {canRetrySame ? (
                  <Button variant="secondary" onClick={onRetake} icon={<Camera className="h-4 w-4" />}>
                    Ảnh khác
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={onManual} icon={<PencilLine className="h-4 w-4" />}>
                    Tự nhập
                  </Button>
                )}
                <Link to={manualHref} className="glass pill text-[15px] font-semibold">
                  <Search className="h-4 w-4" aria-hidden="true" /> Tìm thủ công
                </Link>
              </div>
            )}
            {code === 'quota_exceeded' && (
              <Button variant="ghost" onClick={onManual} icon={<PencilLine className="h-4 w-4" />}>
                Tự nhập món cho ảnh này
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
