import { Mail, MailCheck, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { requestPasswordReset } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { AuthLayout } from './AuthLayout';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Khôi phục"
      title={sent ? 'Đã gửi liên kết' : 'Quên mật khẩu'}
      subtitle={sent ? undefined : 'Nhập email của bạn, Fitora sẽ gửi liên kết đặt lại mật khẩu (áp dụng cho cả Note_mytasks).'}
      compact
      footer={
        <Link to="/login" className="inline-flex min-h-[44px] items-center font-bold text-gold hover:underline">
          ← Về đăng nhập
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-[15px] leading-relaxed text-muted">
            Nếu <strong className="text-text">{email.trim()}</strong> có tài khoản, bạn sẽ nhận được email trong vài phút. Mở liên kết trên thiết bị này để
            đặt mật khẩu mới.
          </p>
          <Button variant="secondary" block onClick={() => setSent(false)}>
            Gửi lại
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
