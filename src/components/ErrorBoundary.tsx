import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'fitora.chunk-reload';

/** A lazy route chunk that no longer exists (new deploy replaced the hashed files) or failed to download. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Reload once per minute at most, so a genuinely missing chunk cannot loop. Never reloads while
 * offline (that would replace the app with the browser's offline page). Also used by main.tsx
 * for Vite's `vite:preloadError`.
 */
export function reloadOnce(): boolean {
  if (isOffline()) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Changing this value clears the error (e.g. the route path). */
  resetKey?: string;
  /** 'screen' fills the phone frame; 'root' is the last-resort full page. */
  variant?: 'screen' | 'root';
}

interface State {
  error: unknown;
}

/** Catches render errors so one broken screen never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce()) return;
    console.error('Fitora render error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props, prevState: State) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
    // React.lazy caches a failed import, so a chunk error needs a real reload: do it as soon as
    // the connection comes back.
    const chunkNow = Boolean(this.state.error) && isChunkLoadError(this.state.error);
    const chunkBefore = Boolean(prevState.error) && isChunkLoadError(prevState.error);
    if (chunkNow && !chunkBefore) window.addEventListener('online', this.onOnline);
    else if (!chunkNow && chunkBefore) window.removeEventListener('online', this.onOnline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.onOnline);
  }

  private onOnline = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    // A chunk that failed because the network dropped is not a new version: say so.
    const offline = chunk && isOffline();
    const root = this.props.variant === 'root';
    return (
      <div
        role="alert"
        className={root ? 'flex min-h-[100dvh] flex-col justify-center gap-4 bg-[#120906] px-7 text-[#ede4d8]' : 'absolute inset-0 flex flex-col justify-center gap-4 px-7'}
        style={root ? undefined : { paddingTop: 'var(--safe-top)' }}
      >
        <p className="eyebrow text-gold">{offline ? 'Mất kết nối' : chunk ? 'Có phiên bản mới' : 'Đã có lỗi'}</p>
        <h1 className="display text-[36px] text-text">
          {offline ? 'Không tải được màn hình' : chunk ? 'Fitora vừa được cập nhật' : 'Màn hình này gặp sự cố'}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          {offline
            ? 'Bạn đang ngoại tuyến. Kết nối mạng lại, Fitora sẽ tự tải lại. Dữ liệu của bạn vẫn an toàn.'
            : chunk
              ? 'Tải lại trang để dùng phiên bản mới nhất. Dữ liệu của bạn vẫn an toàn.'
              : 'Dữ liệu của bạn không bị ảnh hưởng. Hãy thử lại, nếu vẫn lỗi hãy về màn Hôm nay.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => (chunk || root ? window.location.reload() : this.setState({ error: null }))}
            className="min-h-[48px] rounded-full bg-gold px-6 text-[15px] font-bold text-[#1a0e02] active:scale-[0.97]"
          >
            {chunk || root ? 'Tải lại' : 'Thử lại'}
          </button>
          {!chunk && (
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#/';
                if (root) window.location.reload();
                else this.setState({ error: null });
              }}
              className="min-h-[48px] rounded-full border border-white/15 px-6 text-[15px] font-semibold text-text active:scale-[0.97]"
            >
              Về Hôm nay
            </button>
          )}
        </div>
      </div>
    );
  }
}
