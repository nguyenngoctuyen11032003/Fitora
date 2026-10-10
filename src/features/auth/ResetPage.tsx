import { Check, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { MIN_PASSWORD } from '@/lib/config';
import { updatePassword } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { AuthLayout } from './AuthLayout';

/** Set a new password after opening a recovery link (session already established). */
export default function ResetPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { endRecovery, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      endRecovery();
      toast.success('Đã đổi mật khẩu. Mật khẩu mới dùng cho cả Note_mytasks.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Bảo mật"
      title="Đặt mật khẩu mới"
      subtitle={user?.email ? <>Cho tài khoản <strong className="text-text">{user.email}</strong></> : undefined}
      compact
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          placeholder={`Tối thiểu ${MIN_PASSWORD} ký tự`}
          icon={<Lock />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
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
          error={confirm && confirm !== password ? 'Mật khẩu không khớp.' : undefined}
          required
        />
        {error && (
          <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[var(--danger-text)]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} icon={<Check className="h-5 w-5" />}>
          Lưu mật khẩu
        </Button>
      </form>
    </AuthLayout>
  );
}
