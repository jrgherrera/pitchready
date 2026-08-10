import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { useT } from '../../../i18n';
import { isEmailAuthEnabled, isMagicLinkEnabled } from '../config/authFlags';
import {
  AuthLayout,
  AuthMessage,
  authInputClass,
  authInputPlainClass,
} from './AuthLayout';

type AuthMode = 'signin' | 'signup';

interface LoginScreenProps {
  busy?: boolean;
  error?: string | null;
  status?: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onForgotPassword: () => void;
}

export function LoginScreen({
  busy = false,
  error,
  status,
  onSignIn,
  onSignUp,
  onMagicLink,
  onGoogleLogin,
  onForgotPassword,
}: LoginScreenProps) {
  const t = useT();
  const emailEnabled = isEmailAuthEnabled();
  const magicLinkEnabled = isMagicLinkEnabled();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailEnabled) return;
    setLocalError(null);

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setLocalError(t('auth.passwordsDoNotMatch'));
        return;
      }
      if (password.length < 6) {
        setLocalError(t('auth.passwordTooShort'));
        return;
      }
      await onSignUp(email, password);
      return;
    }

    await onSignIn(email, password);
  };

  const handleMagicLink = async () => {
    setLocalError(null);
    if (!email.trim()) {
      setLocalError(t('auth.magicLinkNeedEmail'));
      return;
    }
    await onMagicLink(email);
  };

  // A/B: email + magic link off → Google-only login
  if (!emailEnabled && !magicLinkEnabled) {
    return (
      <AuthLayout
        title={t('auth.welcomeBack')}
        subtitle={t('auth.googleOnlySubtitle')}
      >
        <div className="flex flex-col gap-4">
          <AuthMessage error={localError || error} status={status} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGoogleLogin()}
            className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider active:scale-[0.98] transition-all rounded-lg text-base shadow-lg shadow-[#d4f000]/10 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">account_circle</span>
                {t('auth.signInWithGoogle')} <Zap className="w-4 h-4 fill-current" />
              </>
            )}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={mode === 'signin' ? t('auth.welcomeBack') : t('auth.createAccountTitle')}
      subtitle={
        mode === 'signin'
          ? t('auth.emailSignInSubtitle')
          : t('auth.emailSignUpSubtitle')
      }
    >
      {emailEnabled && (
        <div className="flex gap-2 mb-6 bg-[#0a1c17] p-1 rounded-lg border border-[#1f453a]">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setLocalError(null);
            }}
            className={`flex-1 py-2 rounded-md text-xs font-anton uppercase tracking-wider transition-colors ${
              mode === 'signin'
                ? 'bg-[#d4f000] text-[#001710]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('auth.signIn')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setLocalError(null);
            }}
            className={`flex-1 py-2 rounded-md text-xs font-anton uppercase tracking-wider transition-colors ${
              mode === 'signup'
                ? 'bg-[#d4f000] text-[#001710]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t('auth.signUp')}
          </button>
        </div>
      )}

      {emailEnabled && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <AuthMessage error={localError || error} status={status} />

          <div className="space-y-1">
            <label
              className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block"
              htmlFor="email"
            >
              {t('auth.emailAddress')}
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                mail
              </span>
              <input
                className={authInputClass}
                id="email"
                placeholder={t('auth.emailPlaceholder')}
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block"
              htmlFor="password"
            >
              {t('auth.password')}
            </label>
            <input
              className={authInputPlainClass}
              id="password"
              placeholder="••••••••"
              required
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </div>

          {mode === 'signup' && (
            <div className="space-y-1">
              <label
                className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block"
                htmlFor="confirmPassword"
              >
                {t('auth.confirmPassword')}
              </label>
              <input
                className={authInputPlainClass}
                id="confirmPassword"
                placeholder="••••••••"
                required
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
              />
            </div>
          )}

          {mode === 'signin' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs text-[#d4f000] hover:underline font-bold"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider active:scale-[0.98] transition-all rounded-lg text-base shadow-lg shadow-[#d4f000]/10 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : mode === 'signin' ? (
              <>
                {t('auth.signIn')} <Zap className="w-4 h-4 fill-current" />
              </>
            ) : (
              <>
                {t('auth.createAccount')} <Zap className="w-4 h-4 fill-current" />
              </>
            )}
          </button>
        </form>
      )}

      {mode === 'signin' && (
        <>
          <div className="flex items-center gap-4 py-5">
            <div className="flex-grow h-[1px] bg-[#1f453a]" />
            <span className="text-xs font-bold text-gray-500 uppercase">{t('common.or')}</span>
            <div className="flex-grow h-[1px] bg-[#1f453a]" />
          </div>

          <div className="flex flex-col gap-3">
            {magicLinkEnabled && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleMagicLink()}
                className="w-full flex items-center justify-center gap-3 border border-[#1f453a] bg-transparent hover:bg-[#0a1c17] text-white font-inter font-bold py-3.5 rounded-lg uppercase tracking-tighter text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-lg">link</span>
                {t('auth.sendMagicLink')}
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void onGoogleLogin()}
              className="w-full flex items-center justify-center gap-3 border border-[#1f453a] bg-transparent hover:bg-[#0a1c17] text-white font-inter font-bold py-3.5 rounded-lg uppercase tracking-tighter text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">account_circle</span>
              {t('auth.signInWithGoogle')}
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
