import { WifiOff } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppFrame } from '@/components/shell/AppFrame';
import { prefetchOnIdle, ROUTE_LOADERS } from '@/components/shell/routes';
import { ShellLayout } from '@/components/shell/ShellLayout';
import { Logo } from '@/components/ui/Logo';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProfileProvider, useProfile } from '@/context/ProfileContext';
import { Button } from '@/components/ui/Button';
import { returnPath } from '@/features/auth/redirect';
import { isConfigured } from '@/lib/config';
import { errorMessage } from '@/services/errors';

// Feature pages are lazy chunks (owned by feature agents — PLAN §4). Loaders live in
// shell/routes.ts so BottomNav / MenuOverlay can prefetch the exact same chunks.
const LoginPage = lazy(ROUTE_LOADERS['/login']);
const RegisterPage = lazy(ROUTE_LOADERS['/register']);
const ForgotPage = lazy(ROUTE_LOADERS['/forgot']);
const ResetPage = lazy(ROUTE_LOADERS['/reset']);
const OnboardingPage = lazy(ROUTE_LOADERS['/onboarding']);
const GoalSettingsPage = lazy(ROUTE_LOADERS['/goals']);
const TodayPage = lazy(ROUTE_LOADERS['/']);
const DiaryPage = lazy(ROUTE_LOADERS['/diary']);
const FoodSearchPage = lazy(ROUTE_LOADERS['/food/search']);
const ScanPage = lazy(ROUTE_LOADERS['/scan']);
const WorkoutPage = lazy(ROUTE_LOADERS['/workout']);
const ReportsPage = lazy(ROUTE_LOADERS['/progress']);
const BodyPage = lazy(ROUTE_LOADERS['/body']);
const ProfilePage = lazy(ROUTE_LOADERS['/profile']);

/** Main tabs first (most likely next taps), then the focused flows. */
const APP_PREFETCH = ['/', '/diary', '/scan', '/workout', '/progress', '/food/search'];

// The splash is rendered by several guards in a row (auth → profile → lazy chunk). Each is a new
// mount, so only the first one plays the entrance animation; later ones look identical but static
// instead of replaying the reveal (a visible "blink" on cold start).
let splashFirstShownAt = 0;

/** Full-screen brand splash while the session / profile resolve (logo only before login). */
function Splash({ logo = true }: { logo?: boolean } = {}) {
  const [animate] = useState(() => {
    const now = Date.now();
    if (!splashFirstShownAt) splashFirstShownAt = now;
    return now - splashFirstShownAt < 100;
  });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" role="status" aria-label="Đang tải Fitora">
      {logo && <Logo size={64} glow className={animate ? 'animate-scale-in' : undefined} />}
      <span className={`display text-[56px] text-gradient${animate ? ' animate-speed-reveal' : ''}`}>Fitora</span>
      <span className="h-[3px] w-24 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-gold to-transparent bg-[length:200%_100%]" />
      </span>
    </div>
  );
}

/** Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing ("chưa cấu hình"). */
function NotConfigured() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-7" style={{ paddingTop: 'var(--safe-top)' }}>
      <Logo size={48} glow />
      <p className="eyebrow mt-4 text-gold">Cấu hình thiếu</p>
      <h1 className="display text-[40px] text-text">Ứng dụng chưa được cấu hình</h1>
      <p className="text-[15px] leading-relaxed text-muted">
        Tạo file <code className="rounded bg-white/10 px-1.5 py-0.5 text-text">.env</code> ở thư mục gốc (xem <code className="rounded bg-white/10 px-1.5 py-0.5 text-text">.env.example</code>) với hai
        biến dưới đây — dùng chung project Supabase với Note_mytasks — rồi chạy lại <code className="rounded bg-white/10 px-1.5 py-0.5 text-text">npm run dev</code>.
      </p>
      <pre className="glass-card overflow-x-auto p-4 text-[13px] leading-relaxed text-text">VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…</pre>
    </div>
  );
}

/** Signed-in only. */
function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading, recovery } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (recovery) return <Navigate to="/reset" replace />;
  return children ? <>{children}</> : <Outlet />;
}

/** Signed-in AND onboarded (fit_profiles.onboarded_at not null), else → /onboarding. */
function RequireOnboarded() {
  const { fit, loading, error } = useProfile();
  const ready = !loading && Boolean(fit?.onboarded_at);
  // Once inside the app, warm the other tabs' chunks while idle so tab switches are instant.
  useEffect(() => (ready ? prefetchOnIdle(APP_PREFETCH) : undefined), [ready]);
  if (loading) return <Splash logo={false} />; // signed in already: no logo inside the app
  // Profile could not be loaded (offline, server down) and nothing cached: don't send an
  // onboarded user back to onboarding, and don't render pages that need the targets.
  if (!fit && error) return <ProfileLoadError error={error} />;
  if (!fit?.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function ProfileLoadError({ error }: { error: unknown }) {
  const { refresh } = useProfile();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-7" role="alert" style={{ paddingTop: 'var(--safe-top)' }}>
      <WifiOff className="h-10 w-10 text-gold" aria-hidden="true" />
      <h1 className="display mt-2 text-[34px] text-text">Chưa kết nối được</h1>
      <p className="text-[15px] leading-relaxed text-muted">{errorMessage(error)} Kiểm tra kết nối mạng rồi bấm Thử lại.</p>
      <Button
        size="lg"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        Thử lại
      </Button>
      <Button variant="ghost" block onClick={() => void signOut().catch(() => {})}>
        Đăng xuất
      </Button>
    </div>
  );
}

/** Public auth pages: bounce signed-in users home (except during password recovery). */
function PublicOnly() {
  const { session, loading, recovery } = useAuth();
  const location = useLocation();
  const signedOut = !loading && !session;
  // On the auth screens, the next screens are almost always Today (after sign-in) or Register.
  useEffect(() => (signedOut ? prefetchOnIdle(['/', '/register', '/onboarding'], 2500) : undefined), [signedOut]);
  if (loading) return <Splash />;
  if (session && !recovery) return <Navigate to={returnPath(location.state)} replace />;
  return (
    <Suspense fallback={<Splash />}>
      <Outlet />
    </Suspense>
  );
}

/** /reset needs the recovery session. */
function ResetGuard() {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/forgot" replace />;
  return (
    <Suspense fallback={<Splash />}>
      <ResetPage />
    </Suspense>
  );
}

/** Unknown hash route (old bookmark, typo): explain instead of silently jumping home. */
function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-7" role="alert" style={{ paddingTop: 'var(--safe-top)' }}>
      <p className="eyebrow text-gold">Lỗi 404</p>
      <span className="num text-[96px] text-gradient" aria-hidden="true">
        404
      </span>
      <h1 className="display text-[34px] text-text">Không tìm thấy trang</h1>
      <p className="break-words text-[15px] leading-relaxed text-muted">
        Đường dẫn <code className="rounded bg-white/10 px-1.5 py-0.5 text-text">#{pathname}</code> không tồn tại hoặc đã được đổi.
      </p>
      <Link
        to="/"
        replace
        className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-full bg-gold px-6 text-[15px] font-bold text-[#1a0e02] transition active:scale-[0.97]"
      >
        Về Hôm nay
      </Link>
    </div>
  );
}

/** A crash in one screen keeps the frame and clears when the user navigates. */
function ScreenBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
      </Route>
      <Route path="/reset" element={<ResetGuard />} />

      <Route element={<RequireAuth />}>
        {/* Onboarding: signed-in, no bottom nav */}
        <Route element={<ShellLayout bottomNav={false} />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        <Route element={<RequireOnboarded />}>
          {/* Main tabs + menu pages, with the bottom nav */}
          <Route element={<ShellLayout />}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/progress" element={<ReportsPage />} />
            <Route path="/body" element={<BodyPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/goals" element={<GoalSettingsPage />} />
          </Route>
          {/* Focused flows: full screen, no bottom nav */}
          <Route element={<ShellLayout bottomNav={false} />}>
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/food/search" element={<FoodSearchPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    // v7_startTransition: navigations run in a transition, so switching to a tab whose chunk is still
    // downloading keeps the current screen visible instead of flashing the skeleton fallback.
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        {/* AuthProvider is null-safe when Supabase is not configured (BrandColumn reads it). */}
        <AuthProvider>
          <ProfileProvider>
            <AppFrame>
              {isConfigured ? (
                <ScreenBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <AppRoutes />
                  </Suspense>
                </ScreenBoundary>
              ) : (
                <NotConfigured />
              )}
            </AppFrame>
          </ProfileProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
