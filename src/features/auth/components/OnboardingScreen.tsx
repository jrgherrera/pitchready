import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { RoleSelect } from '../../../components/ui/RoleSelect';
import { useT } from '../../../i18n';
import type { PlayerRole } from '../../../types';
import { AuthLayout, AuthMessage, authInputPlainClass } from './AuthLayout';

interface OnboardingScreenProps {
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (name: string, role: PlayerRole) => Promise<void>;
  onLogout: () => void;
}

export function OnboardingScreen({
  initialName = '',
  busy = false,
  error,
  onSubmit,
  onLogout,
}: OnboardingScreenProps) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<PlayerRole>('Midfield');

  return (
    <AuthLayout
      title={t('auth.onboardingTitle')}
      subtitle={t('auth.onboardingSubtitle')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(name, role);
        }}
        className="flex flex-col gap-4"
      >
        <AuthMessage error={error} />

        <div className="space-y-1">
          <label className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block">
            {t('auth.fullName')}
          </label>
          <input
            className={authInputPlainClass}
            required
            type="text"
            placeholder={t('auth.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block">
            {t('auth.preferredPosition')}
          </label>
          <RoleSelect value={role} onChange={setRole} />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {t('auth.enterTheLeague')} <Zap className="w-4 h-4 fill-current" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-white font-bold uppercase tracking-wider"
        >
          {t('common.signOut')}
        </button>
      </form>
    </AuthLayout>
  );
}
