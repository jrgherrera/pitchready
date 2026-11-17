import { LogOut } from 'lucide-react';
import { RoleSelect } from '../../../components/ui/RoleSelect';
import { useI18n, type LocalePreference } from '../../../i18n';
import type { PlayerRole, UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../utils/avatars';
import { isSuperAdmin } from '../../../utils/matches';

interface SettingsTabProps {
  profile: UserProfile;
  superAdminMode: boolean;
  onProfileChange: (profile: UserProfile) => void;
  onSuperAdminModeChange: (enabled: boolean) => void;
  onSave: (e: React.FormEvent) => void;
  onLogout: () => void;
  /** Set only for guests. */
  onUpgrade?: () => void;
}

export function SettingsTab({
  profile,
  superAdminMode,
  onProfileChange,
  onSuperAdminModeChange,
  onSave,
  onLogout,
  onUpgrade,
}: SettingsTabProps) {
  const { t, localePreference, setLocalePreference } = useI18n();

  return (
    <section className="space-y-6 animate-fade-in">
      <header>
        <h2 className="font-anton text-2xl uppercase tracking-wider text-[#d4f000]">
          {t('settings.title')}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('settings.subtitle')}
        </p>
      </header>

      {onUpgrade && (
        <div className="bg-[#0a1c17] border border-[#d4f000]/40 p-5 rounded-xl space-y-3 match-card-shadow">
          <h3 className="font-anton uppercase tracking-wider text-[#d4f000]">
            {t('settings.upgradeTitle')}
          </h3>
          <p className="text-xs text-gray-400">{t('settings.upgradeHint')}</p>
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full bg-[#d4f000] hover:bg-[#c3dd00] text-[#001710] font-anton py-3 rounded-lg uppercase tracking-wider text-sm"
          >
            {t('settings.upgradeButton')}
          </button>
        </div>
      )}

      <form
        onSubmit={onSave}
        className="bg-[#0a1c17] border border-[#1f453a] p-5 rounded-xl space-y-4 match-card-shadow"
      >
        <div className="flex flex-col items-center py-2">
          <img
            src={getAvatarUrl(profile.id, profile.photoURL)}
            alt={profile.name}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full border-2 border-[#d4f000] mb-3 bg-[#020f0b] object-cover"
          />
          <p className="text-xs text-gray-400 font-bold uppercase">{profile.email}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-gray-400 block">{t('settings.name')}</label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => onProfileChange({ ...profile, name: e.target.value })}
            className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-gray-400 block">{t('settings.preferredRole')}</label>
          <RoleSelect
            value={profile.role || 'Midfield'}
            onChange={(role: PlayerRole) => onProfileChange({ ...profile, role })}
            includeCaptainFirst
            className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="app-language"
            className="text-xs font-bold uppercase text-gray-400 block"
          >
            {t('settings.language')}
          </label>
          <select
            id="app-language"
            value={localePreference}
            onChange={(e) => setLocalePreference(e.target.value as LocalePreference)}
            className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
          >
            <option value="system">{t('settings.languageSystem')}</option>
            <option value="en">{t('settings.languageEn')}</option>
            <option value="es">{t('settings.languageEs')}</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-[#d4f000] hover:bg-[#c3dd00] text-[#001710] font-anton py-3.5 rounded-lg uppercase tracking-wider text-sm transition-all active:scale-[0.98]"
        >
          {t('settings.saveChanges')}
        </button>
      </form>

      {isSuperAdmin(profile) && (
        <label className="bg-[#0a1c17] border border-[#1f453a] p-5 rounded-xl flex items-center justify-between gap-4 cursor-pointer match-card-shadow">
          <span className="min-w-0">
            <span className="text-xs font-bold uppercase text-gray-400 block">
              {t('settings.superAdminMode')}
            </span>
            <span className="text-xs text-gray-500 mt-0.5 block">
              {t('settings.superAdminModeHint')}
            </span>
          </span>
          <input
            type="checkbox"
            checked={superAdminMode}
            onChange={(e) => onSuperAdminModeChange(e.target.checked)}
            className="w-5 h-5 shrink-0 accent-[#d4f000]"
          />
        </label>
      )}

      <div className="space-y-3">
        <button
          onClick={onLogout}
          className="w-full bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/40 font-anton py-3 rounded-lg uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> {t('settings.logOut')}
        </button>
      </div>
    </section>
  );
}
