import { Loader2, Plus } from 'lucide-react';
import { useT } from '../../../i18n';
import type { MatchData } from '../../../types';
import { MatchCard } from './MatchCard';
import { MatchListCard } from './MatchListCard';

interface MyMatchesScreenProps {
  upcoming: MatchData[];
  past: MatchData[];
  loading: boolean;
  /** Guests cannot create matches: the rules need a registered account. */
  isGuest: boolean;
  canManage: (match: MatchData) => boolean;
  onOpenMatch: (matchId: string) => void;
  onCreateMatch: () => void;
  onCreateAccount: () => void;
}

export function MyMatchesScreen({
  upcoming,
  past,
  loading,
  isGuest,
  canManage,
  onOpenMatch,
  onCreateMatch,
  onCreateAccount,
}: MyMatchesScreenProps) {
  const t = useT();

  return (
    <section className="space-y-6 animate-fade-in">
      {isGuest ? (
        <div className="bg-[#0a1c17] border border-[#d4f000]/40 p-5 rounded-xl space-y-3 match-card-shadow">
          <h2 className="font-anton uppercase tracking-wider text-[#d4f000]">
            {t('home.guestTitle')}
          </h2>
          <p className="text-xs text-gray-400">{t('home.guestHint')}</p>
          <button
            onClick={onCreateAccount}
            className="w-full bg-[#d4f000] hover:bg-[#c3dd00] text-[#001710] font-anton py-3 rounded-lg uppercase tracking-wider text-sm"
          >
            {t('home.guestCta')}
          </button>
        </div>
      ) : (
        <button
          onClick={onCreateMatch}
          className="w-full bg-[#d4f000] hover:bg-[#c3dd00] text-[#001710] font-anton py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-[#d4f000]/10 transition-all active:scale-[0.98] uppercase tracking-wider text-sm font-bold"
        >
          <Plus className="w-5 h-5 stroke-[3]" /> {t('home.createMatch')}
        </button>
      )}

      <div>
        <h2 className="font-anton text-xl uppercase tracking-wider text-white mb-4">
          {t('home.upcoming')}
        </h2>
        {loading ? (
          <div className="py-12 flex justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-8 text-center text-sm text-gray-400">
            {t(isGuest ? 'home.emptyUpcomingGuest' : 'home.emptyUpcoming')}
          </div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((match) => (
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

      {/* Past is recessed by muting colours, not opacity, so text keeps its contrast */}
      {!loading && past.length > 0 && (
        <div className="[&_h3]:text-gray-300 [&_.text-\[\#d4f000\]]:text-gray-400 [&_button]:bg-[#0f2d24] [&_button]:text-[#d4f000] [&_button]:border [&_button]:border-[#1f453a]">
          <h2 className="font-anton text-sm uppercase tracking-wider text-gray-400 mb-3">
            {t('home.past')}
          </h2>
          <div className="space-y-3">
            {past.map((match) => (
              <MatchListCard key={match.id} match={match} onOpen={onOpenMatch} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
