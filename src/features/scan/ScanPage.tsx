import clsx from 'clsx';
import { Flashlight, FlashlightOff, Radar, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { GlassButton } from '@/components/ui/GlassButton';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { captureVideoFrame, compressImage } from '@/lib/image';
import { AiScanError, scanFood } from '@/services/ai';
import { markCustomFoodUsed, saveScannedDishes } from '@/services/foods';
import { addMealEntries, photoInUse, updateMeal, uploadMealPhoto } from '@/services/meals';
import { removeImages } from '@/services/storage';
import { MEAL_LABELS, type AiErrorCode, type CustomFood, type MealEntry, type MealType } from '@/types/db';
import { Analysing } from './Analysing';
import { CameraFallback, isCameraUnavailable } from './CameraFallback';
import { buildMealEntries, entryLinks } from './entries';
import { parseDateParam, parseMealParam } from './meal';
import { QuickLogSheet } from './QuickLogSheet';
import { ReviewSheet } from './ReviewSheet';
import { dishTotals, rankSavedFoods, remembers } from './saved';
import { SavedStrip } from './SavedStrip';
import { fromAiDish, isDishValid, totals, type ScanDish } from './scale';
import { ScanDock, type ScanMode } from './ScanDock';
import { ScanErrorPanel } from './ScanErrorPanel';
import { useShots, vibrate, type Shot } from './shot';
import { UploadDropzone } from './UploadDropzone';
import { cameraSupported, useCamera } from './useCamera';
import { useLiveScan } from './useLiveScan';
import { useBackGuard } from './useBackGuard';
import { useFoodPhotoUrls, useSavedFoods } from './useSavedFoods';
import { Viewfinder } from './Viewfinder';
import './scan.css';

type Phase = 'capture' | 'analysing' | 'error' | 'review';

/** Height the "Ăn lại món đã lưu" strip adds to the bottom dock (heading + one row of cards + gap). */
const STRIP_H = 118;

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

/** Delete an uploaded scan photo unless a diary entry or a saved food points at it. */
const dropPhoto = (path: string) =>
  void photoInUse(path)
    .then((used) => (used ? undefined : removeImages([path])))
    .catch(() => {});

export default function ScanPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [meal, setMeal] = useState<MealType>(() => parseMealParam(params.get('meal')));
  const [date, setDate] = useState(() => parseDateParam(params.get('date')));
  const [mode, setMode] = useState<ScanMode>(() => (cameraSupported() ? 'camera' : 'upload'));
  const [phase, setPhase] = useState<Phase>('capture');
  const [shot, setShot] = useState<Shot | null>(null);
  const [dishes, setDishes] = useState<ScanDish[]>([]);
  const [notes, setNotes] = useState<string | undefined>();
  const [error, setError] = useState<{ code: AiErrorCode; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCapture, setBusyCapture] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const cameraActive = phase === 'capture' && (mode === 'camera' || mode === 'live');
  const cam = useCamera(cameraActive);
  const shots = useShots();

  const galleryInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadedPath = useRef<{ blob: Blob; path: string } | null>(null);
  const saved = useRef(false);
  // Synchronous guards: state updates land a render later, a fast double tap would slip through.
  const savingRef = useRef(false);
  const capturingRef = useRef(false);

  const manualHref = `/food/search?meal=${meal}&date=${date}`;
  const savedHref = `${manualHref}&tab=mine`;

  /* ---------- Back button: close the result first, never lose a paid scan silently ---------- */
  const [confirmLeave, setConfirmLeave] = useState(false);
  const guard = useBackGuard(phase === 'review' || dishes.length > 0, () => {
    if (savingRef.current) return;
    if (phase === 'review') setPhase('capture');
    else if (dishes.length) setConfirmLeave(true);
  });

  /* ---------- saved foods ("Món của tôi") ---------- */
  const savedFoods = useSavedFoods();
  const ranked = useMemo(() => rankSavedFoods(savedFoods.foods, meal), [savedFoods.foods, meal]);
  const foodPhotos = useFoodPhotoUrls(ranked);
  const [quickFood, setQuickFood] = useState<CustomFood | null>(null);

  const onQuickLogged = (entry: MealEntry, food: CustomFood, m: MealType, servings: number) => {
    setQuickFood(null);
    vibrate(20);
    notifyDataChanged('meals');
    const portion = servings === 1 ? '' : ` ×${formatNumber(servings, 2)}`;
    toast.success(`Đã thêm ${food.name}${portion} · ${formatNumber(entry.kcal)} kcal vào ${MEAL_LABELS[m].toLowerCase()}`, {
      duration: 5000,
      action: { label: 'Xem nhật ký', onClick: () => navigate(`/diary?date=${entry.eaten_on}`) },
    });
  };

  /* ---------- lifecycle ---------- */
  useEffect(
    () => () => {
      abortRef.current?.abort();
      // Photo uploaded for a save that never completed → don't leave it orphaned.
      if (uploadedPath.current && !saved.current) dropPhoto(uploadedPath.current.path);
    },
    [],
  );

  /* ---------- Live Scan ---------- */
  const onLiveFatal = useCallback((code: AiErrorCode, message: string) => {
    setError({ code, message });
    setShot(null);
    setPhase('error');
  }, []);

  const live = useLiveScan({
    running: mode === 'live' && phase === 'capture' && cam.status === 'ready' && cam.visible,
    videoRef: cam.videoRef,
    makeShot: shots.make,
    onFatal: onLiveFatal,
  });

  // Free the object URLs of photos that are no longer shown anywhere.
  useEffect(() => {
    shots.release([shot, live.result?.shot]);
  }, [shot, live.result, shots]);

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
        if (ctrl.signal.aborted || isAbort(e)) return;
        if (e instanceof AiScanError) {
          setError({ code: e.code, message: e.message });
          setPhase('error');
        } else {
          toast.error(e);
          setPhase('capture');
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [toast],
  );

  const cancelAnalyse = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('capture');
  };

  // Offline failure → retry by itself as soon as the connection comes back.
  useEffect(() => {
    if (phase !== 'error' || error?.code !== 'network' || !shot) return;
    // Several "online" events can arrive together: resend once (each send costs an AI scan).
    let fired = false;
    const again = () => {
      if (fired) return;
      fired = true;
      void analyse(shot);
    };
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [phase, error, shot, analyse]);

  /* ---------- capture sources ---------- */
  const shoot = async () => {
    const video = cam.videoRef.current;
    if (!video || cam.status !== 'ready' || capturingRef.current) return;
    capturingRef.current = true;
    setBusyCapture(true);
    vibrate(15);
    try {
      const img = await captureVideoFrame(video, { maxSide: 1280, quality: 0.82, type: 'image/webp' });
      void analyse(shots.make(img.blob, img.dataUrl));
    } catch (e) {
      toast.error(e);
    } finally {
      capturingRef.current = false;
      setBusyCapture(false);
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file || capturingRef.current) return;
    if (file.type && !file.type.startsWith('image/')) {
      toast.error('Tệp đã chọn không phải là ảnh.');
      return;
    }
    capturingRef.current = true;
    setBusyCapture(true);
    try {
      const img = await compressImage(file, { maxSide: 1280 });
      void analyse(shots.make(img.blob, img.dataUrl));
    } catch (e) {
      toast.error(e);
    } finally {
      capturingRef.current = false;
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
    if (phase !== 'capture') return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const openLiveResult = () => {
    if (!live.result) return;
    setShot(live.result.shot);
    setDishes(live.result.dishes);
    setNotes(live.result.notes);
    setPhase('review');
  };

  const changeMode = (m: ScanMode) => {
    setMode(m);
    if (m === 'live') live.reset();
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
    if (savingRef.current || !dishes.length) return;
    if (dishes.some((d) => !isDishValid(d))) return; // the sheet shows what to fix
    savingRef.current = true;
    setSaving(true);
    let photoPath: string | null = null;
    let photoFailed = false;
    if (shot) {
      if (uploadedPath.current?.blob === shot.blob) photoPath = uploadedPath.current.path;
      else {
        try {
          const prev = uploadedPath.current;
          photoPath = await uploadMealPhoto(shot.blob);
          uploadedPath.current = { blob: shot.blob, path: photoPath };
          // An earlier failed save uploaded a different photo → it would be orphaned.
          if (prev) dropPhoto(prev.path);
        } catch {
          photoFailed = true;
        }
      }
    }

    // 1. The diary rows first: a failed insert must not leave a "remembered" dish behind.
    let inserted: MealEntry[];
    try {
      inserted = await addMealEntries(buildMealEntries(dishes, { date, meal, photoPath }));
    } catch (e) {
      toast.error(e);
      savingRef.current = false;
      setSaving(false);
      return;
    }
    saved.current = true;

    // 2. Remember the confirmed dishes in "Món của tôi" (the save counts as one use) and link
    //    the new rows to them. Best-effort: the meal is already logged.
    let rememberedNow = 0;
    let rememberFailed = false;
    const fresh = dishes.filter((d) => remembers(d) && d.name.trim());
    const foodIds: Record<string, string> = {};
    if (fresh.length) {
      try {
        const rows = await saveScannedDishes(fresh.map(dishTotals), { photoPath, meal });
        rows.forEach((row, i) => (foodIds[fresh[i].key] = row.id));
        rememberedNow = rows.length;
        await Promise.all(entryLinks(dishes, inserted, foodIds).map((l) => updateMeal(l.id, { custom_food_id: l.custom_food_id }).catch(() => undefined)));
      } catch {
        rememberFailed = true;
      }
    }
    // Dishes that use a saved food's numbers without being re-remembered still count as a use.
    const linkedOnly = dishes.filter((d) => !foodIds[d.key] && d.savedFoodId).map((d) => d.savedFoodId as string);
    if (linkedOnly.length) void markCustomFoodUsed(linkedOnly, meal).catch(() => undefined);

    notifyDataChanged('meals');
    if (rememberedNow || linkedOnly.length) notifyDataChanged('foods');
    const kcal = formatNumber(totals(dishes).kcal);
    const memo = rememberedNow ? ` · đã ghi nhớ ${rememberedNow} món` : '';
    toast.success(`Đã thêm ${dishes.length} món · ${kcal} kcal vào ${MEAL_LABELS[meal].toLowerCase()}${memo}`);
    if (photoFailed) toast.info('Không tải được ảnh — món đã được lưu không kèm ảnh.');
    if (rememberFailed) toast.info('Chưa ghi nhớ được món vào Món của tôi — bữa ăn vẫn đã được lưu.');
    await guard.release();
    navigate(`/diary?date=${date}`, { replace: true });
  };

  const leave = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  };

  const close = () => {
    if (dishes.length) setConfirmLeave(true);
    else void guard.release().then(leave);
  };

  const discardAndLeave = async () => {
    setConfirmLeave(false);
    await guard.release();
    setDishes([]);
    leave();
  };

  /* ---------- derived UI ---------- */
  const usesCamera = mode === 'camera' || mode === 'live';
  const camUnavailable = isCameraUnavailable(cam.status);
  const hasPending = phase === 'capture' && !!shot && dishes.length > 0 && mode !== 'live';
  const showLiveCard = mode === 'live' && !!live.result && phase === 'capture';
  const liveTotal = useMemo(() => (live.result ? totals(live.result.dishes).kcal : 0), [live.result]);
  const pendingKcal = useMemo(() => totals(dishes).kcal, [dishes]);
  const showStrip = phase === 'capture' && mode !== 'live' && !hasPending && ranked.length > 0;
  const strip = (title?: string) => <SavedStrip foods={ranked} urls={foodPhotos} onPick={setQuickFood} allHref={savedHref} title={title} />;
  const subtitle = `${MEAL_LABELS[meal]} · ${date === todayISO() ? 'Hôm nay' : formatDayVi(date, 'short')}`;

  return (
    <Page topBar={false} padded={false} className="!bg-black" contentClassName="!pt-0 !pb-0 h-full" label="Quét món ăn bằng AI">
      <div
        className="relative h-full min-h-[560px] w-full overflow-hidden bg-black text-text"
        onDragOver={(e) => {
          if (mode !== 'upload' || phase !== 'capture') return;
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
            disablePictureInPicture
            aria-hidden="true"
            className={clsx(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none',
              cam.status === 'ready' ? 'opacity-100' : 'opacity-0',
              cam.facing === 'user' && '-scale-x-100',
            )}
          />
        )}
        {/* Warm ambient when there is no feed */}
        {(!usesCamera || cam.status !== 'ready') && (
          <div className="app-bg absolute inset-0" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/3 mx-auto h-64 w-64 rounded-full bg-[rgba(225,80,10,0.2)] blur-[80px]" />
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
            <p className="eyebrow !text-gold">Quét món AI</p>
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
        <div
          className="absolute inset-x-0 flex flex-col items-center justify-center px-6"
          style={{ top: 'calc(var(--safe-top) + 64px)', bottom: `calc(var(--safe-bottom) + ${(showLiveCard || hasPending ? 280 : 196) + (showStrip ? STRIP_H : 0)}px)` }}
        >
          {usesCamera && cam.status === 'ready' && (
            <>
              <Viewfinder scanning={mode === 'live' && (live.busy || !live.paused)} tone={mode === 'live' && live.paused && live.result ? 'ok' : 'gold'} />
              <p className="mt-5 max-w-[280px] rounded-full bg-black/45 px-4 py-2 text-center text-[13px] font-semibold text-text/90 backdrop-blur-sm" aria-live="polite">
                {mode === 'live' ? (
                  <span className="inline-flex items-center gap-2">
                    {live.busy ? <Spinner size={14} /> : <Radar className="h-4 w-4 text-gold" aria-hidden="true" />}
                    {live.hint}
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
            <CameraFallback
              status={cam.status}
              onUpload={() => changeMode('upload')}
              onNativeCapture={() => captureInput.current?.click()}
              onRetry={cam.retry}
            />
          )}

          {mode === 'upload' && <UploadDropzone busy={busyCapture} dragOver={dragOver} onPick={() => galleryInput.current?.click()} />}
        </div>

        {/* ---- Bottom dock ---- */}
        <ScanDock
          mode={mode}
          onModeChange={changeMode}
          cameraUnsupported={cam.status === 'unsupported'}
          cameraReady={cam.status === 'ready'}
          canFlip={cam.canFlip}
          onFlip={cam.flip}
          busyCapture={busyCapture}
          onShoot={() => void shoot()}
          onPickGallery={() => galleryInput.current?.click()}
          onNativeCapture={() => captureInput.current?.click()}
          livePaused={live.paused}
          liveResult={showLiveCard ? live.result : null}
          liveTotal={liveTotal}
          onLiveToggle={() => (live.paused ? live.resume() : live.pause())}
          onOpenLiveResult={openLiveResult}
          pending={hasPending && shot ? { photoUrl: shot.url, kcal: pendingKcal } : null}
          onOpenPending={() => setPhase('review')}
          savedStrip={showStrip ? strip() : null}
        />

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
            canRetry={!!shot}
            extra={error.code === 'quota_exceeded' || error.code === 'network' || error.code === 'ai_unavailable' ? strip('Không cần AI — ăn lại món đã lưu') : null}
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
        foods={savedFoods.foods}
        rankedFoods={ranked}
      />

      <ConfirmDialog
        open={confirmLeave}
        danger
        title="Bỏ kết quả quét?"
        message={`${dishes.length} món vừa quét chưa được lưu vào nhật ký. Thoát bây giờ sẽ mất kết quả này.`}
        confirmLabel="Bỏ kết quả"
        cancelLabel="Ở lại"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => void discardAndLeave()}
      />

      <QuickLogSheet
        food={quickFood}
        photoUrl={quickFood?.photo_path ? foodPhotos[quickFood.photo_path] : undefined}
        onClose={() => setQuickFood(null)}
        meal={meal}
        date={date}
        onLogged={onQuickLogged}
      />
    </Page>
  );
}
