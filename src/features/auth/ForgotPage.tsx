import { Mail, MailCheck, Send } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { requestPasswordReset } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { AuthLayout } from './AuthLayout';
import { useCooldown } from './PasswordToggle';
import { normalizeEmail, readLastEmail } from '@/lib/lastEmail';

export default function ForgotPage() {
  const location = useLocation();
  // Carry over what was typed on the login form, else the last address used on this device.
  const [email, setEmail] = useState(() => normalizeEmail((location.state as { email?: unknown } | null)?.email) ?? readLastEmail());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const inFlight = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || cooldown > 0) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
      startCooldown();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Khôi phục"
      title={sent ? 'Đã gửi liên kết' : 'Quên mật khẩu'}
      subtitle={sent ? undefined : 'Nhập email của bạn, Fitora sẽ gửi liên kết đặt lại mật khẩu.'}
      compact
      footer={
        <Link to="/login" className="inline-flex min-h-[44px] items-center font-bold text-gold hover:underline">
          ← Về đăng nhập
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(237,180,11,0.15)] text-gold">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-[15px] leading-relaxed text-muted">
            Nếu <strong className="text-text">{email.trim()}</strong> có tài khoản, bạn sẽ nhận được email trong vài phút. Mở liên kết trên thiết bị này để
            đặt mật khẩu mới.
          </p>
          <Button variant="secondary" block disabled={cooldown > 0} onClick={() => setSent(false)}>
            {cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại'}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="ban@email.com"
            icon={<Mail />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
            required
          />
          <Button type="submit" size="lg" block loading={busy} icon={<Send className="h-5 w-5" />}>
            Gửi liên kết
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
