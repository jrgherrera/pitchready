import { Loader2 } from 'lucide-react';
import { useT } from '../../../i18n';
import type { MatchData } from '../../../types';
import { MatchListCard } from './MatchListCard';

interface MatchesTabProps {
  matches: MatchData[];
  matchesLoading: boolean;
  onOpenMatch: (matchId: string) => void;
  onCreateMatch: () => void;
}

export function MatchesTab({
  matches,
  matchesLoading,
  onOpenMatch,
  onCreateMatch,
}: MatchesTabProps) {
  const t = useT();
  return (
    <section className="space-y-4 animate-fade-in">
      <header className="flex justify-between items-center">
        <h2 className="font-anton text-2xl uppercase tracking-wider text-[#d4f000]">
          {t('matches.allScheduled')}
        </h2>
        <button
          onClick={onCreateMatch}
          className="bg-[#0f2d24] border border-[#1f453a] hover:border-[#d4f000] px-3 py-1.5 rounded-lg text-xs font-anton uppercase text-[#d4f000]"
        >
          {t('matches.newMatch')}
        </button>
      </header>

      <div className="bg-[#0a1c17] p-3 rounded-lg border border-[#1f453a] flex justify-between text-xs text-gray-400">
        <span>{t('matches.totalAvailable', { count: matches.length })}</span>
        <span className="text-[#d4f000] font-bold">{t('matches.cloudSync')}</span>
      </div>

      {matchesLoading ? (
        <div className="py-12 flex justify-center text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {t('matches.emptyAdmin')}
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <MatchListCard key={match.id} match={match} onOpen={onOpenMatch} />
          ))}
        </div>
      )}
    </section>
  );
}
