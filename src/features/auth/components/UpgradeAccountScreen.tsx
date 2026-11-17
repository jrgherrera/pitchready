import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useT } from '../../../i18n';
import { AuthLayout, AuthMessage, authInputClass } from './AuthLayout';

interface UpgradeAccountScreenProps {
  busy?: boolean;
  error?: string | null;
  onGoogle: () => Promise<void>;
  onPassword: (email: string, password: string) => Promise<void>;
  onBack: () => void;
}

// Two paths only. The magic link is deliberately absent: see completeMagicLinkIfPresent.
export function UpgradeAccountScreen({
  busy = false,
  error,
  onGoogle,
  onPassword,
  onBack,
}: UpgradeAccountScreenProps) {
  const t = useT();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState<'google' | 'email' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <AuthLayout title={t('auth.upgradeTitle')} subtitle={t('auth.upgradeSubtitle')}>
      <div className="flex flex-col gap-4">
        <AuthMessage error={localError || error} />

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPending('google');
            void onGoogle();
          }}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && pending === 'google' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span className="material-symbols-outlined text-xl">account_circle</span>
              {t('auth.upgradeWithGoogle')}
            </>
          )}
        </button>

        {!showEmail ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowEmail(true)}
            className="w-full border border-[#1f453a] hover:bg-[#0a1c17] text-white font-anton py-3 uppercase tracking-wider rounded-lg text-sm disabled:opacity-60"
          >
            {t('auth.upgradeWithEmail')}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password !== confirmPassword) {
                setLocalError(t('auth.passwordsDoNotMatch'));
                return;
              }
              setLocalError(null);
              setPending('email');
              void onPassword(email, password);
            }}
            className="flex flex-col gap-3"
          >
            <input
              className={authInputClass}
              type="email"
              required
              autoComplete="email"
              aria-label={t('auth.emailAddress')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={authInputClass}
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              aria-label={t('auth.password')}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className={authInputClass}
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              aria-label={t('auth.confirmPassword')}
              placeholder={t('auth.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full border border-[#1f453a] hover:bg-[#0a1c17] text-white font-anton py-3 uppercase tracking-wider rounded-lg text-sm disabled:opacity-60"
            >
              {busy && pending === 'email' ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                t('auth.upgradeWithEmail')
              )}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-400">{t('auth.upgradeVerifyNote')}</p>

        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-white font-bold uppercase tracking-wider mt-2"
        >
          <ArrowLeft className="w-4 h-4" /> {t('auth.upgradeBack')}
        </button>
      </div>
    </AuthLayout>
  );
}
