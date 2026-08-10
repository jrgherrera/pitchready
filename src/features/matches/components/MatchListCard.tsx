import { MapPin } from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { MatchData } from '../../../types';
import { formatMatchShortDate } from '../../../utils/dates';
import { getLocationLabel } from '../../../utils/location';
import { getCapacityPercent, getOccupiedCount, isMatchFull } from '../../../utils/matches';

interface MatchListCardProps {
  match: MatchData;
  onOpen: (matchId: string) => void;
}

export function MatchListCard({ match, onOpen }: MatchListCardProps) {
  const { t, locale } = useI18n();
  const isFull = isMatchFull(match);
  const fillPercent = getCapacityPercent(match);
  const occupied = getOccupiedCount(match);

  return (
    <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-4 match-card-shadow">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isFull ? 'bg-[#0f2d24] text-gray-400' : 'bg-[#d4f000] text-[#001710]'
              }`}
            >
              {isFull ? t('matches.confirmed') : t('matches.needsPlayers')}
            </span>
          </div>
          <h3 className="font-anton text-lg text-white mt-1.5">{match.title}</h3>
        </div>
        <div className="text-right">
          <p className="font-anton text-xl text-[#d4f000] leading-none">{match.time}</p>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">
            {formatMatchShortDate(match.date, locale)}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1 mt-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#d4f000] shrink-0" />
        <span className="truncate">{getLocationLabel(match.location)}</span>
      </p>

      <div className="mt-3.5 bg-[#020f0b] p-3 rounded-lg border border-[#1f453a]/40">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">{t('matches.rosterCapacity')}</span>
          <span className="text-white font-bold">
            {t('matches.playersCount', {
              joined: occupied,
              capacity: match.capacity,
            })}
          </span>
        </div>
        <div className="w-full bg-[#0a1c17] h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full ${isFull ? 'bg-emerald-500' : 'bg-[#d4f000]'}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#1f453a] pt-3 mt-3">
        <span className="text-sm font-anton text-white">
          £{match.price?.toFixed(2) || '2000.00'}
        </span>
        <button
          onClick={() => onOpen(match.id)}
          className="px-5 py-1.5 bg-[#d4f000] hover:bg-[#b0c800] text-[#001710] font-anton rounded-lg text-xs uppercase tracking-wider transition-all"
        >
          {t('matches.viewDetails')}
        </button>
      </div>
    </div>
  );
}
