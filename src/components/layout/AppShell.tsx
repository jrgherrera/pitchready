import { useT } from '../../i18n';
import type { AppTab, UserProfile } from '../../types';
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

interface BottomNavProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
}

export function BottomNav({ activeTab, onChangeTab }: BottomNavProps) {
  const t = useT();
  const itemClass = (tab: AppTab) =>
    `flex flex-col items-center gap-1 px-5 py-1.5 rounded-full transition-all ${
      activeTab === tab
        ? 'bg-[#d4f000] text-[#001710] font-bold'
        : 'text-gray-400 hover:text-white'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[#0a1c17] flex justify-around items-center py-3 z-50 border-t border-[#1f453a]">
      <button onClick={() => onChangeTab('dashboard')} className={itemClass('dashboard')}>
        <span
          className="material-symbols-outlined text-xl select-none"
          style={{
            fontVariationSettings: activeTab === 'dashboard' ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          dashboard
        </span>
        <span className="font-inter font-bold text-[10px]">{t('nav.dashboard')}</span>
      </button>

      <button onClick={() => onChangeTab('matches')} className={itemClass('matches')}>
        <span className="material-symbols-outlined text-xl select-none">sports_soccer</span>
        <span className="font-inter font-bold text-[10px]">{t('nav.matches')}</span>
      </button>

      <button onClick={() => onChangeTab('settings')} className={itemClass('settings')}>
        <span className="material-symbols-outlined text-xl select-none">settings</span>
        <span className="font-inter font-bold text-[10px]">{t('nav.settings')}</span>
      </button>
    </nav>
  );
}
