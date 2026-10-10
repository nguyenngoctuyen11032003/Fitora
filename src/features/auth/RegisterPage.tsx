import { ArrowRight, Lock, Mail, MailCheck, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { MIN_PASSWORD } from '@/lib/config';
import { resendConfirmation, signUp } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { AuthLayout } from './AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    try {
      const data = await signUp(email, password, name);
      if (data?.session) navigate('/onboarding', { replace: true });
      else setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout eyebrow="Gần xong rồi" title="Kiểm tra email" compact footer={<Link to="/login" className="inline-flex min-h-[44px] items-center font-bold text-gold">Về đăng nhập</Link>}>
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-[15px] leading-relaxed text-muted">
            Fitora đã gửi liên kết xác nhận tới <strong className="text-text">{email.trim()}</strong>. Mở email và bấm liên kết để kích hoạt tài khoản —
            tài khoản này dùng được cho cả Note_mytasks.
          </p>
          <Button
            variant="secondary"
            block
            onClick={async () => {
              try {
                await resendConfirmation(email);
                toast.success('Đã gửi lại email xác nhận.');
              } catch (err) {
                toast.error(err);
              }
            }}
          >
            Gửi lại email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Bắt đầu hành trình"
      title="Tạo tài khoản"
      subtitle="Một tài khoản cho cả Fitora và Note_mytasks."
      compact
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" className="inline-flex min-h-[44px] items-center font-bold text-gold hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label="Tên hiển thị" autoComplete="name" placeholder="Ví dụ: Minh Anh" icon={<User />} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
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
          type="password"
          autoComplete="new-password"
          placeholder={`Tối thiểu ${MIN_PASSWORD} ký tự`}
          icon={<Lock />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={password && password.length < MIN_PASSWORD ? `Còn thiếu ${MIN_PASSWORD - password.length} ký tự` : undefined}
          required
        />
        <Input
          label="Nhập lại mật khẩu"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          icon={<Lock />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Mật khẩu không khớp.' : undefined}
          required
        />
        {error && (
          <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[var(--danger-text)]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} iconRight={<ArrowRight className="h-5 w-5" />}>
          Tạo tài khoản
        </Button>
      </form>
    </AuthLayout>
  );
}
