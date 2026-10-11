import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'notfound' | 'unsupported' | 'error';
export type Facing = 'environment' | 'user';

export const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext !== false);

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

/**
 * Constraint ladder, most specific first. Some devices reject the resolution hints
 * (OverconstrainedError) or a facing mode they don't have — fall back instead of failing.
 * 1920×1440 is plenty: stills are downscaled to 1280 px before upload.
 */
export function constraintLadder(facing: Facing): MediaStreamConstraints[] {
  return [
    { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } } },
    { audio: false, video: { facingMode: { ideal: facing } } },
    { audio: false, video: true },
  ];
}

/** getUserMedia error name → screen status. */
export function statusForError(name: string | undefined): CameraStatus {
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'notfound';
  return 'error';
}

const RETRYABLE = new Set(['OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError']);

async function openStream(facing: Facing): Promise<MediaStream> {
  let last: unknown;
  for (const c of constraintLadder(facing)) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      last = e;
      if (!RETRYABLE.has((e as DOMException)?.name)) throw e;
    }
  }
  throw last;
}

/**
 * getUserMedia wrapper bound to a <video>. Runs only while `active`; stops every
 * track when inactive, on unmount and while the tab is hidden (restarts on return).
 * Rear camera preferred; iOS needs muted + playsInline for inline autoplay.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>(() => (cameraSupported() ? 'idle' : 'unsupported'));
  const [facing, setFacing] = useState<Facing>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    // pagehide covers iOS Safari back-forward cache, where visibilitychange may not fire.
    const hide = () => setVisible(false);
    document.addEventListener('visibilitychange', on);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', on);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', on);
    };
  }, []);

  useEffect(() => {
    if (!active || !visible) {
      stop();
      setStatus((s) => (s === 'ready' || s === 'starting' ? 'idle' : s));
      return;
    }
    if (!cameraSupported()) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    setStatus('starting');
    (async () => {
      try {
        const stream = await openStream(facing);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.muted = true;
          video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        if (track) {
          // Camera taken by another app / permission revoked mid-session.
          track.onended = () => {
            if (cancelled || streamRef.current !== stream) return;
            stop();
            setStatus('error');
          };
        }
        const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
        setTorchSupported(!!caps.torch);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          if (!cancelled) setCanFlip(false);
        }
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus(statusForError((e as DOMException)?.name));
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, visible, facing, attempt, stop]);

  // Re-attach if the <video> element was (re)mounted after the stream started.
  useEffect(() => {
    const v = videoRef.current;
    if (status === 'ready' && v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      void v.play().catch(() => {});
    }
  });

  const flip = useCallback(() => setFacing((f) => (f === 'environment' ? 'user' : 'environment')), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  return { videoRef, status, facing, flip, canFlip, torchSupported, torchOn, toggleTorch, retry, visible };
}
