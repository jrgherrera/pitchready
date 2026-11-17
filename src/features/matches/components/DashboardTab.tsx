import { Loader2, Plus } from 'lucide-react';
import { useT } from '../../../i18n';
import type { MatchData } from '../../../types';
import { countLiveMatches } from '../../../utils/matches';
import { MatchCard } from './MatchCard';

interface DashboardTabProps {
  matches: MatchData[];
  matchesLoading: boolean;
  canManage: (match: MatchData) => boolean;
  onOpenMatch: (matchId: string) => void;
  onCreateMatch: () => void;
  onViewAllMatches: () => void;
}

export function DashboardTab({
  matches,
  matchesLoading,
  canManage,
  onOpenMatch,
  onCreateMatch,
  onViewAllMatches,
}: DashboardTabProps) {
  const t = useT();
  const liveMatchesCount = countLiveMatches(matches);

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-[#0f2d24] p-5 rounded-xl border border-[#1f453a] relative overflow-hidden match-card-shadow">
          <div className="absolute -right-3 -bottom-3 opacity-10 text-[#d4f000]">
            <span className="material-symbols-outlined text-7xl select-none fill-icon">
              sports_soccer
            </span>
          </div>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-1">
            {t('dashboard.liveMatches')}
          </p>
          <p className="font-anton text-4xl text-[#d4f000]">
            {String(liveMatchesCount).padStart(2, '0')}
          </p>
        </div>

      </div>

      <button
        onClick={onCreateMatch}
        className="w-full bg-[#d4f000] hover:bg-[#c3dd00] text-[#001710] font-anton py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-[#d4f000]/10 transition-all active:scale-[0.98] uppercase tracking-wider text-sm font-bold"
      >
        <Plus className="w-5 h-5 stroke-[3]" /> {t('dashboard.createNewMatch')}
      </button>

      <div>
        <div className="flex justify-between items-end mb-4">
          <h2 className="font-anton text-xl uppercase tracking-wider text-white">
            {t('dashboard.upcomingMatches')}
          </h2>
          <button
            onClick={onViewAllMatches}
            className="text-xs text-[#d4f000] hover:underline font-bold"
          >
            {t('dashboard.viewAll')}
          </button>
        </div>

        {matchesLoading ? (
          <div className="py-12 flex justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-8 text-center text-gray-400 match-card-shadow">
            <p className="mb-4">
              {t('dashboard.emptyAdmin')}
            </p>
            <button
              onClick={onCreateMatch}
              className="bg-[#0f2d24] text-[#d4f000] border border-[#1f453a] px-4 py-2 rounded-lg text-sm font-bold uppercase"
            >
              {t('dashboard.hostMatch')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.slice(0, 3).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                canManage={canManage(match)}
                onOpen={onOpenMatch}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
