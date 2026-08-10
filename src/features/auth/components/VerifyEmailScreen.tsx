import { Loader2, LogOut, MailCheck, RefreshCw } from 'lucide-react';
import { useT } from '../../../i18n';
import { AuthLayout, AuthMessage } from './AuthLayout';

interface VerifyEmailScreenProps {
  email?: string | null;
  busy?: boolean;
  error?: string | null;
  status?: string | null;
  onResend: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}

export function VerifyEmailScreen({
  email,
  busy = false,
  error,
  status,
  onResend,
  onRefresh,
  onLogout,
}: VerifyEmailScreenProps) {
  const t = useT();
  return (
    <AuthLayout
      title={t('auth.verifyTitle')}
      subtitle={t('auth.verifySubtitle')}
    >
      <div className="flex flex-col gap-4">
        <AuthMessage error={error} status={status} />

        <div className="p-4 bg-[#0f2d24]/60 border-l-4 border-[#d4f000] rounded-r-lg flex gap-3 text-sm text-gray-300">
          <MailCheck className="w-5 h-5 text-[#d4f000] shrink-0" />
          <p>
            {t('auth.verifyHintPrefix')}{' '}
            <span className="text-white font-bold">{email || t('auth.yourEmail')}</span>{' '}
            {t('auth.verifyHintSuffix')}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onRefresh()}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {t('auth.iVerified')} <RefreshCw className="w-4 h-4" />
            </>
          )}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onResend()}
          className="w-full border border-[#1f453a] hover:bg-[#0a1c17] text-white font-anton py-3 uppercase tracking-wider rounded-lg text-sm disabled:opacity-60"
        >
          {t('auth.resendVerification')}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center justify-center gap-2 text-xs text-red-400 hover:text-red-300 font-bold uppercase tracking-wider mt-2"
        >
          <LogOut className="w-4 h-4" /> {t('common.signOut')}
        </button>
      </div>
    </AuthLayout>
  );
}
