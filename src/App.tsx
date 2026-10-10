import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppFrame } from '@/components/shell/AppFrame';
import { ShellLayout } from '@/components/shell/ShellLayout';
import { Logo } from '@/components/ui/Logo';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProfileProvider, useProfile } from '@/context/ProfileContext';
import { isConfigured } from '@/lib/config';

// Feature pages are lazy chunks (owned by feature agents — PLAN §4).
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPage = lazy(() => import('@/features/auth/ForgotPage'));
const ResetPage = lazy(() => import('@/features/auth/ResetPage'));
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'));
const GoalSettingsPage = lazy(() => import('@/features/onboarding/GoalSettingsPage'));
const TodayPage = lazy(() => import('@/features/today/TodayPage'));
const DiaryPage = lazy(() => import('@/features/food/DiaryPage'));
const FoodSearchPage = lazy(() => import('@/features/food/FoodSearchPage'));
const ScanPage = lazy(() => import('@/features/scan/ScanPage'));
const WorkoutPage = lazy(() => import('@/features/workout/WorkoutPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const BodyPage = lazy(() => import('@/features/body/BodyPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));

/** Full-screen brand splash while the session / profile resolve. */
function Splash() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" role="status" aria-label="Đang tải Fitora">
      <Logo size={64} glow className="animate-scale-in" />
      <span className="display animate-speed-reveal text-[56px] text-gradient">Fitora</span>
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
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (recovery) return <Navigate to="/reset" replace />;
  return children ? <>{children}</> : <Outlet />;
}

/** Signed-in AND onboarded (fit_profiles.onboarded_at not null), else → /onboarding. */
function RequireOnboarded() {
  const { fit, loading, error } = useProfile();
  if (loading) return <Splash />;
  if (!fit?.onboarded_at && !error) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Public auth pages: bounce signed-in users home (except during password recovery). */
function PublicOnly() {
  const { session, loading, recovery } = useAuth();
  if (loading) return <Splash />;
  if (session && !recovery) return <Navigate to="/" replace />;
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        {/* AuthProvider is null-safe when Supabase is not configured (BrandColumn reads it). */}
        <AuthProvider>
          <ProfileProvider>
            <AppFrame>
              {isConfigured ? (
                <Suspense fallback={<PageSkeleton />}>
                  <AppRoutes />
                </Suspense>
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
