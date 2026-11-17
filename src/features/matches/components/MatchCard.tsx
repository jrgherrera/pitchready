import { MapPin, Share2 } from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { MatchData } from '../../../types';
import { formatMatchShortDate, formatMatchTime } from '../../../utils/dates';
import { getAvatarUrl } from '../../../utils/avatars';
import { getLocationLabel } from '../../../utils/location';
import { getCapacityPercent, getOccupiedCount, isMatchFull, shareMatchLink } from '../../../utils/matches';

interface MatchCardProps {
  match: MatchData;
  /** Creator or active super admin — everyone else only gets to look */
  canManage: boolean;
  onOpen: (matchId: string) => void;
  showShare?: boolean;
}

export function MatchCard({
  match,
  canManage,
  onOpen,
  showShare = true,
}: MatchCardProps) {
  const { t, locale } = useI18n();
  const isFull = isMatchFull(match);
  const fillPercent = getCapacityPercent(match);
  const occupied = getOccupiedCount(match);

  return (
    <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-4 match-card-shadow hover:border-[#d4f000]/40 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div>
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block ${
              isFull ? 'bg-[#0f2d24] text-gray-400' : 'bg-[#d4f000] text-[#001710]'
            }`}
          >
            {isFull ? t('matches.confirmed') : t('matches.needsPlayers')}
          </span>
          <h3 className="font-anton text-lg text-white leading-tight mt-1">{match.title}</h3>
        </div>
        <div className="text-right">
          <p className="font-anton text-xl text-[#d4f000] leading-none">
            {formatMatchTime(match.date, locale)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider">
            {formatMatchShortDate(match.date, locale)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-gray-400 text-xs mb-3">
        <MapPin className="w-3.5 h-3.5 text-[#d4f000] shrink-0" />
        <span className="truncate">{getLocationLabel(match.location)}</span>
      </div>

      <div className="mb-4 bg-[#020f0b] p-3 rounded-lg border border-[#1f453a]/40">
        <div className="flex justify-between text-xs mb-1">
          <span className="font-bold text-gray-300">{t('matches.rosterStatus')}</span>
          <span className="font-semibold text-white">
            {t('matches.playersCount', {
              joined: occupied,
              capacity: match.capacity,
            })}
          </span>
        </div>
        <div className="w-full bg-[#020f0b] h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full ${isFull ? 'bg-emerald-500' : 'bg-[#d4f000]'}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#1f453a] pt-3 mt-1">
        <div className="flex -space-x-1.5 overflow-hidden">
          {match.joinedPlayerIds.slice(0, 4).map((pid, pidx) => {
            const foundPlayer = match.roster?.[pid];
            return (
                <img
                  key={pidx}
                  className="w-7 h-7 rounded-full border border-[#0a1c17] bg-[#020f0b] object-cover"
                  src={getAvatarUrl(pid, foundPlayer?.photoURL)}
                  alt={t('matches.playerAvatar')}
                  referrerPolicy="no-referrer"
                />
            );
          })}
          {match.joinedPlayerIds.length > 4 && (
            <div className="w-7 h-7 rounded-full border border-[#0a1c17] bg-[#0f2d24] text-white flex items-center justify-center text-[10px] font-bold">
              +{match.joinedPlayerIds.length - 4}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {showShare && (
            <button
              onClick={() => shareMatchLink(match.id)}
              className="p-2 rounded-lg bg-[#0f2d24] text-gray-300 hover:text-white hover:bg-[#1f453a] border border-[#1f453a] transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onOpen(match.id)}
            className="px-4 py-1.5 bg-[#d4f000] hover:bg-[#b5cc00] text-[#001710] font-anton rounded-lg text-xs uppercase tracking-wider transition-all"
          >
            {canManage ? t('matches.manage') : t('matches.viewDetails')}
          </button>
        </div>
      </div>
    </div>
  );
}
