import clsx from 'clsx';
import { Camera, ChevronRight, ImagePlus, Pause, Play, ScanLine, SwitchCamera, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { GlassButton } from '@/components/ui/GlassButton';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { formatNumber } from '@/lib/format';
import { ConfidenceBadge } from './DishCard';
import type { LiveResult } from './useLiveScan';

export type ScanMode = 'camera' | 'upload' | 'live';

interface Props {
  mode: ScanMode;
  onModeChange: (m: ScanMode) => void;
  cameraUnsupported: boolean;
  cameraReady: boolean;
  canFlip: boolean;
  onFlip: () => void;
  busyCapture: boolean;
  onShoot: () => void;
  onPickGallery: () => void;
  onNativeCapture: () => void;
  /* Live Scan */
  livePaused: boolean;
  liveResult: LiveResult | null;
  liveTotal: number;
  onLiveToggle: () => void;
  onOpenLiveResult: () => void;
  /* A closed, unsaved review */
  pending: { photoUrl: string; kcal: number } | null;
  onOpenPending: () => void;
  /** "Ăn lại món đã lưu" strip (capture phase only). */
  savedStrip?: ReactNode;
}

/** Bottom controls: live/pending result cards, mode switch and the shutter row. */
export function ScanDock({
  mode,
  onModeChange,
  cameraUnsupported,
  cameraReady,
  canFlip,
  onFlip,
  busyCapture,
  onShoot,
  onPickGallery,
  onNativeCapture,
  livePaused,
  liveResult,
  liveTotal,
  onLiveToggle,
  onOpenLiveResult,
  pending,
  onOpenPending,
  savedStrip,
}: Props) {
  const usesCamera = mode !== 'upload';
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-4 px-5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 18px)' }}>
      {/* Live result card */}
      {mode === 'live' && liveResult && (
        <div className="glass-strong animate-fade-slide-up flex items-center gap-3 rounded-[24px] p-2.5 pr-3">
          <img src={liveResult.shot.url} alt="" className="h-14 w-14 shrink-0 rounded-[16px] object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{liveResult.dishes.map((d) => d.name).join(', ')}</p>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span className="tabular font-bold text-gold">{formatNumber(liveTotal)} kcal</span>
              <ConfidenceBadge value={liveResult.confidence} />
            </p>
          </div>
          <Button size="sm" onClick={onOpenLiveResult} iconRight={<ChevronRight className="h-4 w-4" />} aria-label="Xem kết quả nhận diện">
            Xem
          </Button>
        </div>
      )}

      {/* Pending (closed) review */}
      {pending && (
        <button type="button" onClick={onOpenPending} className="glass-strong flex min-h-[56px] items-center gap-3 rounded-[24px] p-2 pr-4 text-left">
          <img src={pending.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[12px] object-cover" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            Kết quả chưa lưu · <span className="text-gold">{formatNumber(pending.kcal)} kcal</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
        </button>
      )}

      {savedStrip}

      <Segmented<ScanMode>
        ariaLabel="Chế độ quét"
        size="sm"
        value={mode}
        onChange={onModeChange}
        className="!bg-black/40 backdrop-blur-md"
        options={[
          { value: 'camera', label: 'Chụp ảnh', disabled: cameraUnsupported },
          { value: 'upload', label: 'Tải ảnh' },
          { value: 'live', label: 'Live Scan', disabled: cameraUnsupported },
        ]}
      />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        {/* left: gallery */}
        <div className="flex justify-start">
          {usesCamera ? (
            <GlassButton variant="square" label="Chọn ảnh từ thư viện" onClick={onPickGallery} className="!h-14 !w-14 bg-black/30">
              <ImagePlus className="h-6 w-6" />
            </GlassButton>
          ) : (
            <GlassButton variant="square" label="Chụp bằng máy ảnh" onClick={onNativeCapture} className="!h-14 !w-14 bg-black/30">
              <Camera className="h-6 w-6" />
            </GlassButton>
          )}
        </div>

        {/* center: primary action */}
        {mode === 'camera' && (
          <button
            type="button"
            onClick={onShoot}
            disabled={!cameraReady || busyCapture}
            aria-label="Chụp ảnh"
            aria-busy={busyCapture || undefined}
            className="group relative grid h-[80px] w-[80px] place-items-center rounded-full border-[3px] border-white/85 transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none"
          >
            <span className="h-[62px] w-[62px] rounded-full bg-gold shadow-[0_0_30px_rgba(237,180,11,0.55),inset_0_2px_0_rgba(255,255,255,0.5)] transition-transform group-active:scale-90 motion-reduce:transition-none" />
            {busyCapture && <Spinner size={22} className="absolute text-[#1a0e02]" />}
          </button>
        )}
        {mode === 'upload' && (
          <button
            type="button"
            onClick={onPickGallery}
            disabled={busyCapture}
            aria-label="Chọn ảnh"
            aria-busy={busyCapture || undefined}
            className="grid h-[80px] w-[80px] place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_0_30px_rgba(237,180,11,0.5),inset_0_2px_0_rgba(255,255,255,0.5)] transition-transform active:scale-95 disabled:opacity-50 motion-reduce:transition-none"
          >
            {busyCapture ? <Spinner size={24} /> : <Upload className="h-8 w-8" strokeWidth={2.4} />}
          </button>
        )}
        {mode === 'live' && (
          <button
            type="button"
            onClick={onLiveToggle}
            disabled={!cameraReady}
            aria-label={livePaused ? 'Tiếp tục quét' : 'Tạm dừng quét'}
            aria-pressed={!livePaused}
            className={clsx(
              'relative grid h-[80px] w-[80px] place-items-center rounded-full border-[3px] transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none',
              livePaused ? 'border-white/85 bg-gold text-[#1a0e02]' : 'animate-pulse-ring border-gold bg-black/40 text-gold motion-reduce:animate-none',
            )}
          >
            {livePaused ? <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" /> : <Pause className="h-8 w-8" fill="currentColor" />}
          </button>
        )}

        {/* right: flip */}
        <div className="flex justify-end">
          {usesCamera && cameraReady && canFlip ? (
            <GlassButton label="Đổi camera trước/sau" onClick={onFlip} className="!h-14 !w-14 bg-black/30">
              <SwitchCamera className="h-6 w-6" />
            </GlassButton>
          ) : mode === 'live' ? (
            <span className="flex h-14 items-center text-right text-[11px] font-semibold leading-tight text-muted">
              Mỗi lần nhận diện
              <br />
              tính 1 lượt AI
            </span>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center text-muted" aria-hidden="true">
              <ScanLine className="h-5 w-5 opacity-40" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
