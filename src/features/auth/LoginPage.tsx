import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/services/errors';
import { resendConfirmation, signIn } from '@/services/auth';
import { AuthLayout } from './AuthLayout';
import { PasswordToggle, useCooldown } from './PasswordToggle';
import { returnPath } from './redirect';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const inFlight = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return; // Enter pressed twice / double tap
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      await signIn(email, password);
      // Back to the page that required sign-in (e.g. a shared #/diary?date=… link).
      navigate(returnPath(location.state), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      const code = (err as { code?: string })?.code;
      setUnconfirmed(code === 'email_not_confirmed');
      if (code === 'invalid_credentials') passwordRef.current?.select();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending || cooldown) return;
    setResending(true);
    try {
      await resendConfirmation(email);
      toast.success('Đã gửi lại email xác nhận. Hãy kiểm tra hộp thư.');
      startCooldown();
    } catch (err) {
      toast.error(err);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Chào mừng trở lại"
      title="Đăng nhập"
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/register" className="inline-flex min-h-[44px] items-center font-bold text-gold hover:underline">
            Tạo tài khoản
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ban@email.com"
          icon={<Mail />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Mật khẩu"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          icon={<Lock />}
          ref={passwordRef}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          trailing={<PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} />}
        />
        <div className="-mt-1 flex justify-end">
          <Link to="/forgot" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-muted hover:text-gold">
            Quên mật khẩu?
          </Link>
        </div>
        {error && (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[var(--danger-text)]">
            {error}
            {unconfirmed && (
              <button
                type="button"
                onClick={resend}
                disabled={resending || cooldown > 0}
                className="mt-1 block min-h-[36px] font-bold text-gold underline-offset-2 hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {resending ? 'Đang gửi…' : cooldown > 0 ? `Gửi lại email xác nhận (${cooldown}s)` : 'Gửi lại email xác nhận'}
              </button>
            )}
          </div>
        )}
        <Button type="submit" size="lg" block loading={busy} iconRight={<ArrowRight className="h-5 w-5" />}>
          Đăng nhập
        </Button>
      </form>
    </AuthLayout>
  );
}
