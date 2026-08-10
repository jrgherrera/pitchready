import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useT } from '../../../i18n';
import { AuthLayout, AuthMessage, authInputClass } from './AuthLayout';

interface ForgotPasswordFormProps {
  busy?: boolean;
  error?: string | null;
  status?: string | null;
  onSubmit: (email: string) => Promise<void>;
  onBack: () => void;
}

export function ForgotPasswordForm({
  busy = false,
  error,
  status,
  onSubmit,
  onBack,
}: ForgotPasswordFormProps) {
  const t = useT();
  const [email, setEmail] = useState('');

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(email);
        }}
        className="flex flex-col gap-4"
      >
        <AuthMessage error={error} status={status} />

        <div className="space-y-1">
          <label
            className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block"
            htmlFor="reset-email"
          >
            {t('auth.emailAddress')}
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              mail
            </span>
            <input
              className={authInputClass}
              id="reset-email"
              placeholder={t('auth.emailPlaceholder')}
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : t('auth.sendResetEmail')}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-white font-bold uppercase tracking-wider"
        >
          <ArrowLeft className="w-4 h-4" /> {t('auth.backToSignIn')}
        </button>
      </form>
    </AuthLayout>
  );
}
