import { useT } from '../../../i18n';
import type { UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../utils/avatars';

interface PlayersTabProps {
  players: UserProfile[];
  currentUserId: string;
}

export function PlayersTab({ players, currentUserId }: PlayersTabProps) {
  const t = useT();
  return (
    <section className="space-y-4 animate-fade-in">
      <header>
        <h2 className="font-anton text-2xl uppercase tracking-wider text-[#d4f000]">
          {t('players.title')}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('players.subtitle')}
        </p>
      </header>

      <div className="bg-[#0a1c17] p-3.5 border border-[#1f453a] rounded-xl flex items-center justify-between match-card-shadow">
        <span className="text-xs font-bold text-gray-300">{t('players.activeProfiles')}</span>
        <span className="bg-[#d4f000] text-[#001710] text-[10px] px-2.5 py-0.5 rounded-full font-anton uppercase">
          {t('players.registered', { count: players.length })}
        </span>
      </div>

      <div className="space-y-2.5">
        {players.map((player) => (
          <div
            key={player.id}
            className="bg-[#0a1c17] border border-[#1f453a] p-3 rounded-xl flex items-center justify-between match-card-shadow"
          >
            <div className="flex items-center gap-3">
              <img
                src={getAvatarUrl(player.id, player.photoURL)}
                alt={player.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full border border-[#1f453a] bg-[#020f0b] object-cover"
              />
              <div>
                <p className="font-bold text-sm text-white flex items-center gap-1.5">
                  {player.name}
                  {player.id === currentUserId && (
                    <span className="text-[9px] bg-[#d4f000] text-[#001710] px-1.5 py-0.2 rounded font-inter font-bold uppercase">
                      {t('common.you')}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-gray-400">{player.email}</p>
              </div>
            </div>

            <span
              className={`text-[10px] font-anton tracking-wider px-2.5 py-1 rounded-full uppercase ${
                player.role === 'Captain'
                  ? 'bg-[#d4f000] text-[#001710]'
                  : 'bg-[#0f2d24] text-gray-300'
              }`}
            >
              {t(`roles.short.${player.role || 'Striker'}`)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
