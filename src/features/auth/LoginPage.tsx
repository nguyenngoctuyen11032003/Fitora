import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/services/errors';
import { resendConfirmation, signIn } from '@/services/auth';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setUnconfirmed((err as { code?: string })?.code === 'email_not_confirmed');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await resendConfirmation(email);
      toast.success('Đã gửi lại email xác nhận. Hãy kiểm tra hộp thư.');
    } catch (err) {
      toast.error(err);
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-muted hover:text-text"
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          }
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
              <button type="button" onClick={resend} className="mt-1 block min-h-[36px] font-bold text-gold underline-offset-2 hover:underline">
                Gửi lại email xác nhận
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
