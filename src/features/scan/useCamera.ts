import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unsupported' | 'error';
export type Facing = 'environment' | 'user';

export const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext !== false);

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

/**
 * getUserMedia wrapper bound to a <video>. Runs only while `active`; stops every
 * track when inactive, on unmount and while the tab is hidden (restarts on return).
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
        setTorchSupported(!!caps.torch);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setCanFlip(false);
        }
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') setStatus('error');
        else setStatus('error');
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
