import clsx from 'clsx';
import {
  Camera,
  CameraOff,
  ChevronRight,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Pause,
  Play,
  Radar,
  ScanLine,
  SwitchCamera,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { GlassButton } from '@/components/ui/GlassButton';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { captureVideoFrame, compressImage } from '@/lib/image';
import { AiScanError, scanFood } from '@/services/ai';
import { addMealEntries, uploadMealPhoto } from '@/services/meals';
import { removeImages } from '@/services/storage';
import { MEAL_LABELS, type AiErrorCode, type MealType, type NewMealEntry } from '@/types/db';
import { Analysing } from './Analysing';
import { ConfidenceBadge } from './DishCard';
import { DARK_LUMA, frameDiff, meanLuma, STABLE_DIFF, toLuma } from './frame';
import { parseDateParam, parseMealParam } from './meal';
import { ReviewSheet } from './ReviewSheet';
import { fromAiDish, totals, type ScanDish } from './scale';
import { ScanErrorPanel } from './ScanErrorPanel';
import { cameraSupported, useCamera } from './useCamera';
import { Viewfinder } from './Viewfinder';
import './scan.css';

type Mode = 'camera' | 'upload' | 'live';
type Phase = 'capture' | 'analysing' | 'error' | 'review';

interface Shot {
  blob: Blob;
  dataUrl: string;
  url: string;
}

interface LiveResult {
  shot: Shot;
  dishes: ScanDish[];
  notes?: string;
  confidence: number;
}

/* Live Scan tuning */
const LIVE_INTERVAL = 3500; // min ms between AI calls
const LIVE_TICK = 500; // stability sampling
const LIVE_STABLE_MS = 900; // scene must be still this long
const LIVE_CONFIDENT = 0.6; // pause when the best dish reaches this
const LIVE_MAX_CALLS = 8; // per live session → protects the daily AI quota

const makeShot = (blob: Blob, dataUrl: string): Shot => ({ blob, dataUrl, url: URL.createObjectURL(blob) });
const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

export default function ScanPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [meal, setMeal] = useState<MealType>(() => parseMealParam(params.get('meal')));
  const [date, setDate] = useState(() => parseDateParam(params.get('date')));
  const [mode, setMode] = useState<Mode>(() => (cameraSupported() ? 'camera' : 'upload'));
  const [phase, setPhase] = useState<Phase>('capture');
  const [shot, setShot] = useState<Shot | null>(null);
  const [dishes, setDishes] = useState<ScanDish[]>([]);
  const [notes, setNotes] = useState<string | undefined>();
  const [error, setError] = useState<{ code: AiErrorCode; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCapture, setBusyCapture] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Live Scan state
  const [livePaused, setLivePaused] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveHint, setLiveHint] = useState<string>('Giữ máy ổn định, đưa món vào khung');
  const [liveResult, setLiveResult] = useState<LiveResult | null>(null);

  const cameraActive = phase === 'capture' && (mode === 'camera' || mode === 'live');
  const cam = useCamera(cameraActive);

  const galleryInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadedPath = useRef<{ blob: Blob; path: string } | null>(null);
  const saved = useRef(false);
  const shots = useRef(new Set<string>());

  const manualHref = `/food/search?meal=${meal}&date=${date}`;

  /* ---------- lifecycle ---------- */
  useEffect(() => {
    const urls = shots.current;
    return () => {
      abortRef.current?.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
      // Photo uploaded for a save that never completed → don't leave it orphaned.
      if (uploadedPath.current && !saved.current) void removeImages([uploadedPath.current.path]).catch(() => {});
    };
  }, []);

  const track = useCallback((s: Shot) => {
    shots.current.add(s.url);
    return s;
  }, []);

  /* ---------- analyse a still photo ---------- */
  const analyse = useCallback(
    async (s: Shot) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setShot(s);
      setDishes([]);
      setNotes(undefined);
      setError(null);
      setPhase('analysing');
      try {
        const res = await scanFood(s.dataUrl, { mode: 'photo', signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setDishes(res.dishes.map((d) => fromAiDish(d)));
        setNotes(res.notes);
        vibrate(25);
        setPhase('review');
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') {
          setPhase('capture');
          return;
        }
        if (e instanceof AiScanError) {
          setError({ code: e.code });
          setPhase('error');
        } else {
          toast.error(e);
          setPhase('capture');
        }
      }
    },
    [toast],
  );

  const cancelAnalyse = () => {
    abortRef.current?.abort();
    setPhase('capture');
  };

  /* ---------- capture sources ---------- */
  const shoot = async () => {
    const video = cam.videoRef.current;
    if (!video || cam.status !== 'ready' || busyCapture) return;
    setBusyCapture(true);
    vibrate(15);
    try {
      const img = await captureVideoFrame(video, { maxSide: 1280, quality: 0.82, type: 'image/webp' });
      void analyse(track(makeShot(img.blob, img.dataUrl)));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyCapture(false);
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      toast.error('Tệp đã chọn không phải là ảnh.');
      return;
    }
    setBusyCapture(true);
    try {
      const img = await compressImage(file, { maxSide: 1280 });
      void analyse(track(makeShot(img.blob, img.dataUrl)));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyCapture(false);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    void handleFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  /* ---------- Live Scan loop ---------- */
  const liveRef = useRef({ busy: false, lastSent: 0, stableSince: 0, prev: null as Uint8Array | null, sentThumb: null as Uint8Array | null, calls: 0, needChange: false });
  const thumbCanvas = useRef<HTMLCanvasElement | null>(null);

  const liveRunning = mode === 'live' && phase === 'capture' && cam.status === 'ready' && !livePaused && cam.visible;

  useEffect(() => {
    if (!liveRunning) return;
    const L = liveRef.current;
    L.stableSince = 0;
    L.prev = null;
    let alive = true;
    const ctrl = new AbortController();

    const sample = (): Uint8Array | null => {
      const v = cam.videoRef.current;
      if (!v || !v.videoWidth) return null;
      if (!thumbCanvas.current) {
        thumbCanvas.current = document.createElement('canvas');
        thumbCanvas.current.width = 32;
        thumbCanvas.current.height = 24;
      }
      const ctx = thumbCanvas.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, 32, 24);
      return toLuma(ctx.getImageData(0, 0, 32, 24).data);
    };

    const send = async (thumb: Uint8Array) => {
      const v = cam.videoRef.current;
      if (!v) return;
      L.busy = true;
      L.lastSent = performance.now();
      L.calls += 1;
      L.sentThumb = thumb;
      setLiveBusy(true);
      setLiveHint('Đang nhận diện…');
      try {
        const img = await captureVideoFrame(v, { maxSide: 960, quality: 0.75, type: 'image/jpeg' });
        const res = await scanFood(img.dataUrl, { mode: 'live', signal: ctrl.signal });
        if (!alive) return;
        const list = res.dishes.map((d) => fromAiDish(d));
        const confidence = Math.max(0, ...list.map((d) => d.confidence ?? 0));
        setLiveResult({ shot: track(makeShot(img.blob, img.dataUrl)), dishes: list, notes: res.notes, confidence });
        if (confidence >= LIVE_CONFIDENT) {
          vibrate(30);
          setLivePaused(true);
          setLiveHint('Đã nhận diện — kiểm tra & lưu');
        } else {
          L.needChange = true;
          setLiveHint('Chưa chắc chắn — xoay góc hoặc lại gần hơn');
        }
      } catch (e) {
        if (!alive || (e as Error)?.name === 'AbortError') return;
        const code = e instanceof AiScanError ? e.code : null;
        if (code === 'not_food') {
          L.needChange = true;
          setLiveHint('Chưa thấy món ăn — đưa món vào khung');
        } else if (code === 'quota_exceeded' || code === 'unauthorized') {
          setLivePaused(true);
          setError({ code });
          setShot(null);
          setPhase('error');
        } else {
          setLivePaused(true);
          setLiveHint(code === 'network' ? 'Mất kết nối — đã tạm dừng' : 'AI tạm gián đoạn — đã tạm dừng');
        }
      } finally {
        L.busy = false;
        if (alive) setLiveBusy(false);
        if (alive && L.calls >= LIVE_MAX_CALLS) {
          setLivePaused(true);
          setLiveHint('Đã tạm dừng để tiết kiệm lượt quét');
        }
      }
    };

    const id = window.setInterval(() => {
      if (L.busy) return;
      const t = sample();
      if (!t) return;
      const now = performance.now();
      const diff = frameDiff(L.prev, t);
      L.prev = t;
      if (meanLuma(t) < DARK_LUMA) {
        L.stableSince = 0;
        setLiveHint('Hơi tối — thêm ánh sáng hoặc bật đèn');
        return;
      }
      if (diff > STABLE_DIFF) {
        L.stableSince = 0;
        if (!L.needChange) setLiveHint('Giữ máy ổn định…');
        // Enough movement away from the last sent frame → allow a new attempt.
        if (L.needChange && frameDiff(L.sentThumb, t) > STABLE_DIFF * 1.5) L.needChange = false;
        return;
      }
      if (!L.stableSince) L.stableSince = now;
      const waited = now - L.lastSent;
      const steady = now - L.stableSince >= LIVE_STABLE_MS;
      const freshScene = !L.needChange || waited > LIVE_INTERVAL * 3;
      if (steady && waited >= LIVE_INTERVAL && freshScene) void send(t);
      else if (steady && !L.needChange) setLiveHint('Đã giữ ổn định — chuẩn bị quét');
    }, LIVE_TICK);

    return () => {
      alive = false;
      window.clearInterval(id);
      ctrl.abort();
      L.busy = false;
      setLiveBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRunning]);

  const resumeLive = () => {
    liveRef.current.calls = 0;
    liveRef.current.needChange = !!liveResult;
    setLiveResult(null);
    setLiveHint('Giữ máy ổn định, đưa món vào khung');
    setLivePaused(false);
  };

  const openLiveResult = () => {
    if (!liveResult) return;
    setShot(liveResult.shot);
    setDishes(liveResult.dishes);
    setNotes(liveResult.notes);
    setPhase('review');
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === 'live') {
      liveRef.current.calls = 0;
      liveRef.current.needChange = false;
      setLivePaused(false);
      setLiveResult(null);
      setLiveHint('Giữ máy ổn định, đưa món vào khung');
    }
  };

  /* ---------- review & save ---------- */
  const retake = () => {
    setError(null);
    setPhase('capture');
    if (mode === 'upload') window.setTimeout(() => galleryInput.current?.click(), 50);
  };

  const manualFromPhoto = () => {
    setError(null);
    setDishes([]);
    setNotes(undefined);
    setPhase('review');
  };

  const save = async () => {
    if (saving || !dishes.length) return;
    setSaving(true);
    let photoPath: string | null = null;
    let photoFailed = false;
    if (shot) {
      if (uploadedPath.current?.blob === shot.blob) photoPath = uploadedPath.current.path;
      else {
        try {
          photoPath = await uploadMealPhoto(shot.blob);
          uploadedPath.current = { blob: shot.blob, path: photoPath };
        } catch {
          photoFailed = true;
        }
      }
    }
    const entries: NewMealEntry[] = dishes.map((d) => ({
      eaten_on: date,
      meal,
      name: d.name.trim(),
      quantity: d.quantity,
      unit: d.unit,
      grams: d.grams,
      kcal: d.kcal,
      protein_g: d.protein_g,
      carbs_g: d.carbs_g,
      fat_g: d.fat_g,
      fiber_g: d.fiber_g,
      source: d.original ? 'ai' : 'manual',
      photo_path: photoPath,
      ai_meta: d.original ? { ingredients: d.ingredients, confidence: d.confidence, original: d.original } : null,
    }));
    try {
      await addMealEntries(entries);
      saved.current = true;
      notifyDataChanged('meals');
      const kcal = formatNumber(totals(dishes).kcal);
      toast.success(`Đã thêm ${dishes.length} món · ${kcal} kcal vào ${MEAL_LABELS[meal].toLowerCase()}`);
      if (photoFailed) toast.info('Không tải được ảnh — món đã được lưu không kèm ảnh.');
      navigate(`/diary?date=${date}`, { replace: true });
    } catch (e) {
      toast.error(e);
      setSaving(false);
    }
  };

  const close = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  };

  /* ---------- derived UI ---------- */
  const usesCamera = mode === 'camera' || mode === 'live';
  const camUnavailable = cam.status === 'denied' || cam.status === 'unsupported' || cam.status === 'error';
  const hasPending = phase === 'capture' && !!shot && dishes.length > 0 && mode !== 'live';
  const liveTotal = useMemo(() => (liveResult ? totals(liveResult.dishes).kcal : 0), [liveResult]);
  const subtitle = `${MEAL_LABELS[meal]} · ${date === todayISO() ? 'Hôm nay' : formatDayVi(date, 'short')}`;

  return (
    <Page topBar={false} padded={false} className="!bg-black" contentClassName="!pt-0 !pb-0 h-full" label="Quét món ăn bằng AI">
      <div
        className="relative h-full min-h-[560px] w-full overflow-hidden bg-black text-text"
        onDragOver={(e) => {
          if (mode !== 'upload') return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* ---- Camera feed ---- */}
        {usesCamera && (
          <video
            ref={cam.videoRef}
            playsInline
            muted
            autoPlay
            aria-hidden="true"
            className={clsx(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
              cam.status === 'ready' ? 'opacity-100' : 'opacity-0',
              cam.facing === 'user' && '-scale-x-100',
            )}
          />
        )}
        {/* Warm ambient when there is no feed */}
        {(!usesCamera || cam.status !== 'ready') && (
          <div className="app-bg absolute inset-0" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/3 mx-auto h-64 w-64 rounded-full bg-ember/20 blur-[80px]" />
          </div>
        )}
        {/* Legibility scrims */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black via-black/75 to-transparent" aria-hidden="true" />

        {/* ---- Top bar ---- */}
        <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
          <GlassButton label="Đóng" onClick={close} className="bg-black/30">
            <X className="h-5 w-5" />
          </GlassButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="eyebrow !text-gold">AI Scan</p>
            <p className="mt-0.5 truncate text-[15px] font-bold">{subtitle}</p>
          </div>
          {usesCamera && cam.torchSupported ? (
            <GlassButton label={cam.torchOn ? 'Tắt đèn' : 'Bật đèn'} active={cam.torchOn} onClick={() => void cam.toggleTorch()} className="bg-black/30">
              {cam.torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
            </GlassButton>
          ) : (
            <span className="h-11 w-11 shrink-0" aria-hidden="true" />
          )}
        </header>

        {/* ---- Stage ---- */}
        <div className="absolute inset-x-0 flex flex-col items-center justify-center px-6" style={{ top: 'calc(var(--safe-top) + 64px)', bottom: `calc(var(--safe-bottom) + ${(mode === 'live' && liveResult) || hasPending ? 280 : 196}px)` }}>
          {usesCamera && cam.status === 'ready' && (
            <>
              <Viewfinder scanning={mode === 'live' && (liveBusy || !livePaused)} tone={mode === 'live' && livePaused && liveResult ? 'ok' : 'gold'} />
              <p className="mt-5 max-w-[280px] rounded-full bg-black/45 px-4 py-2 text-center text-[13px] font-semibold text-text/90 backdrop-blur-sm" aria-live="polite">
                {mode === 'live' ? (
                  <span className="inline-flex items-center gap-2">
                    {liveBusy ? <Spinner size={14} /> : <Radar className="h-4 w-4 text-gold" aria-hidden="true" />}
                    {liveHint}
                  </span>
                ) : (
                  'Đưa cả đĩa vào khung, chụp từ trên xuống'
                )}
              </p>
            </>
          )}

          {usesCamera && (cam.status === 'starting' || cam.status === 'idle') && (
            <div className="flex flex-col items-center gap-3 text-muted" role="status">
              <Spinner size={28} />
              <span className="text-sm font-semibold">Đang mở camera…</span>
            </div>
          )}

          {usesCamera && camUnavailable && (
            <div className="glass-card animate-scale-in w-full max-w-[340px] p-6 text-center" role="alert">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] bg-gold/15 text-gold">
                <CameraOff className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="display text-[24px]">
                {cam.status === 'denied' ? 'Chưa có quyền camera' : cam.status === 'unsupported' ? 'Không hỗ trợ camera' : 'Không mở được camera'}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                {cam.status === 'denied'
                  ? 'Hãy cho phép Camera trong cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) rồi thử lại — hoặc dùng ảnh có sẵn.'
                  : cam.status === 'unsupported'
                    ? 'Trình duyệt này không mở camera trực tiếp được. Bạn vẫn có thể chụp bằng máy ảnh của máy hoặc tải ảnh lên.'
                    : 'Camera có thể đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại, hoặc tải ảnh lên.'}
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <Button block icon={<Upload className="h-5 w-5" />} onClick={() => changeMode('upload')}>
                  Tải ảnh lên
                </Button>
                {cam.status === 'unsupported' ? (
                  <Button variant="secondary" block icon={<Camera className="h-5 w-5" />} onClick={() => captureInput.current?.click()}>
                    Chụp bằng máy ảnh
                  </Button>
                ) : (
                  <Button variant="secondary" block onClick={cam.retry}>
                    Thử lại
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              disabled={busyCapture}
              className={clsx(
                'group flex aspect-[4/5] w-full max-w-[300px] flex-col items-center justify-center gap-4 rounded-[32px] border-2 border-dashed p-6 text-center transition-colors',
                dragOver ? 'border-gold bg-gold/10' : 'border-white/20 bg-white/[0.03] hover:border-gold/60',
              )}
            >
              <span className="relative">
                <span className="absolute inset-0 rounded-[24px] bg-ember/40 blur-xl" aria-hidden="true" />
                <span className="glass relative grid h-[72px] w-[72px] place-items-center rounded-[24px] text-gold">
                  {busyCapture ? <Spinner size={28} /> : <ImagePlus className="h-8 w-8" aria-hidden="true" />}
                </span>
              </span>
              <span className="display text-[28px]">{busyCapture ? 'Đang xử lý ảnh' : 'Chọn ảnh món ăn'}</span>
              <span className="max-w-[220px] text-[14px] leading-relaxed text-muted">Ảnh rõ, đủ sáng, thấy trọn món cho kết quả chính xác nhất.</span>
            </button>
          )}
        </div>

        {/* ---- Bottom dock ---- */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-4 px-5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 18px)' }}>
          {/* Live result card */}
          {mode === 'live' && liveResult && phase === 'capture' && (
            <div className="glass-strong animate-fade-slide-up flex items-center gap-3 rounded-[24px] p-2.5 pr-3">
              <img src={liveResult.shot.url} alt="" className="h-14 w-14 shrink-0 rounded-[16px] object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{liveResult.dishes.map((d) => d.name).join(', ')}</p>
                <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <span className="tabular font-bold text-gold">{formatNumber(liveTotal)} kcal</span>
                  <ConfidenceBadge value={liveResult.confidence} />
                </p>
              </div>
              <Button size="sm" onClick={openLiveResult} iconRight={<ChevronRight className="h-4 w-4" />}>
                Xem
              </Button>
            </div>
          )}

          {/* Pending (closed) review */}
          {hasPending && (
            <button type="button" onClick={() => setPhase('review')} className="glass-strong flex min-h-[56px] items-center gap-3 rounded-[24px] p-2 pr-4 text-left">
              <img src={shot!.url} alt="" className="h-10 w-10 shrink-0 rounded-[12px] object-cover" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                Kết quả chưa lưu · <span className="text-gold">{formatNumber(totals(dishes).kcal)} kcal</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
            </button>
          )}

          <Segmented<Mode>
            ariaLabel="Chế độ quét"
            size="sm"
            value={mode}
            onChange={changeMode}
            className="!bg-black/40 backdrop-blur-md"
            options={[
              { value: 'camera', label: 'Chụp ảnh', disabled: cam.status === 'unsupported' },
              { value: 'upload', label: 'Tải ảnh' },
              { value: 'live', label: 'Live Scan', disabled: cam.status === 'unsupported' },
            ]}
          />

          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            {/* left: gallery */}
            <div className="flex justify-start">
              {mode !== 'upload' ? (
                <GlassButton variant="square" label="Chọn ảnh từ thư viện" onClick={() => galleryInput.current?.click()} className="!h-14 !w-14 bg-black/30">
                  <ImagePlus className="h-6 w-6" />
                </GlassButton>
              ) : (
                <GlassButton variant="square" label="Chụp bằng máy ảnh" onClick={() => captureInput.current?.click()} className="!h-14 !w-14 bg-black/30">
                  <Camera className="h-6 w-6" />
                </GlassButton>
              )}
            </div>

            {/* center: primary action */}
            {mode === 'camera' && (
              <button
                type="button"
                onClick={() => void shoot()}
                disabled={cam.status !== 'ready' || busyCapture}
                aria-label="Chụp ảnh"
                className="group relative grid h-[80px] w-[80px] place-items-center rounded-full border-[3px] border-white/85 transition-transform active:scale-95 disabled:opacity-40"
              >
                <span className="h-[62px] w-[62px] rounded-full bg-gold shadow-[0_0_30px_rgba(237,180,11,0.55),inset_0_2px_0_rgba(255,255,255,0.5)] transition-transform group-active:scale-90" />
                {busyCapture && <Spinner size={22} className="absolute text-[#1a0e02]" />}
              </button>
            )}
            {mode === 'upload' && (
              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                disabled={busyCapture}
                aria-label="Chọn ảnh"
                className="grid h-[80px] w-[80px] place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_0_30px_rgba(237,180,11,0.5),inset_0_2px_0_rgba(255,255,255,0.5)] transition-transform active:scale-95 disabled:opacity-50"
              >
                {busyCapture ? <Spinner size={24} /> : <Upload className="h-8 w-8" strokeWidth={2.4} />}
              </button>
            )}
            {mode === 'live' && (
              <button
                type="button"
                onClick={() => (livePaused ? resumeLive() : setLivePaused(true))}
                disabled={cam.status !== 'ready'}
                aria-label={livePaused ? 'Tiếp tục quét' : 'Tạm dừng quét'}
                className={clsx(
                  'relative grid h-[80px] w-[80px] place-items-center rounded-full border-[3px] transition-transform active:scale-95 disabled:opacity-40',
                  livePaused ? 'border-white/85 bg-gold text-[#1a0e02]' : 'animate-pulse-ring border-gold bg-black/40 text-gold',
                )}
              >
                {livePaused ? <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" /> : <Pause className="h-8 w-8" fill="currentColor" />}
              </button>
            )}

            {/* right: flip */}
            <div className="flex justify-end">
              {usesCamera && cam.status === 'ready' && cam.canFlip ? (
                <GlassButton label="Đổi camera trước/sau" onClick={cam.flip} className="!h-14 !w-14 bg-black/30">
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

        <input ref={galleryInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
        <input ref={captureInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />

        {phase === 'analysing' && <Analysing photoUrl={shot?.url ?? null} onCancel={cancelAnalyse} />}

        {phase === 'error' && error && (
          <ScanErrorPanel
            code={error.code}
            message={error.message}
            photoUrl={shot?.url ?? null}
            manualHref={manualHref}
            onRetake={retake}
            onRetry={() => shot && void analyse(shot)}
            onManual={manualFromPhoto}
          />
        )}
      </div>

      <ReviewSheet
        open={phase === 'review'}
        onClose={() => setPhase('capture')}
        photoUrl={shot?.url ?? null}
        dishes={dishes}
        onDishesChange={setDishes}
        notes={notes}
        meal={meal}
        onMealChange={setMeal}
        date={date}
        onDateChange={setDate}
        saving={saving}
        onSave={() => void save()}
        manualHref={manualHref}
      />
    </Page>
  );
}
