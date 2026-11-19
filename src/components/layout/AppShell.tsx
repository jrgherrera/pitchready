import { useT } from '../../i18n';
import type { UserProfile } from '../../types';
import { getAvatarUrl } from '../../utils/avatars';

interface AppHeaderProps {
  profile: UserProfile;
  onOpenSettings: () => void;
}

export function AppHeader({ profile, onOpenSettings }: AppHeaderProps) {
  const t = useT();
  return (
    <header className="w-full top-0 sticky z-50 bg-[#0a1c17] border-b border-[#1f453a] shadow-lg">
      <div className="flex justify-between items-center px-4 py-3.5 max-w-4xl mx-auto">
        <h1 className="font-anton text-2xl uppercase tracking-tighter text-white">{t('brand')}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-[#0f2d24] border border-[#1f453a] px-2.5 py-1 rounded-full font-bold text-gray-300">
            {profile.role ? t(`roles.short.${profile.role}`) : t('common.player')}
          </span>
          <button
            className="p-1 rounded-full border border-[#1f453a] hover:border-[#d4f000] transition-colors"
            onClick={onOpenSettings}
          >
            <img
              src={getAvatarUrl(profile.id, profile.photoURL)}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover bg-[#020f0b]"
            />
          </button>
        </div>
      </div>
    </header>
  );
}
