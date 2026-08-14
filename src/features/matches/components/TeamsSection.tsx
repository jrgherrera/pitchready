import { useState } from 'react';
import { Loader2, Shuffle } from 'lucide-react';
import { useT } from '../../../i18n';
import { getAvatarUrl } from '../../../utils/avatars';
import type { RosterEntry } from '../../../utils/matches';
import { buildTeams, DEFAULT_TEAM_COUNT } from '../../../utils/teams';

interface TeamsSectionProps {
  roster: RosterEntry[];
  /** Saved draft, roster ids per team */
  savedTeams?: { members: string[] }[];
  /** Only the host draws; everyone else reads the saved draft */
  canManage: boolean;
  onSave: (teams: string[][]) => Promise<void>;
}

export function TeamsSection({ roster, savedTeams, canManage, onSave }: TeamsSectionProps) {
  const t = useT();
  const [teamCount, setTeamCount] = useState(savedTeams?.length || DEFAULT_TEAM_COUNT);
  const [saving, setSaving] = useState(false);

  // Players who left the match since the draw simply drop out of their team.
  const byId = new Map(roster.map((entry) => [entry.id, entry]));
  const teams = (savedTeams ?? []).map((team) =>
    team.members.map((id) => byId.get(id)).filter((entry): entry is RosterEntry => !!entry),
  );

  if (!canManage && teams.length === 0) return null;

  const maxTeams = Math.max(2, Math.min(roster.length, 6));

  const draw = async () => {
    setSaving(true);
    try {
      const drawn = buildTeams(roster, Math.min(Math.max(teamCount, 2), maxTeams));
      await onSave(drawn.map((team) => team.map((entry) => entry.id)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 px-4">
      <h2 className="font-anton text-lg tracking-wide uppercase text-[#d4f000] mb-3">
        {t('matches.teamsTitle')}
      </h2>

      {canManage && (
        <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-4 match-card-shadow space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label
              className="text-xs font-bold uppercase tracking-wider text-gray-300"
              htmlFor="team-count"
            >
              {t('matches.teamsCount')}
            </label>
            <input
              id="team-count"
              type="number"
              min={2}
              max={maxTeams}
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
              className="w-20 bg-[#020f0b] border border-[#1f453a] rounded-lg px-3 py-2 text-white font-anton text-lg text-center"
            />
          </div>

          <p className="text-[11px] text-gray-400">{t('matches.teamsHint')}</p>

          <button
            type="button"
            onClick={() => void draw()}
            disabled={saving || roster.length < 2}
            className="w-full bg-[#d4f000] hover:bg-[#b8d100] text-[#001710] font-anton py-3 rounded-lg uppercase tracking-wider transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            {teams.length > 0 ? t('matches.regenerateTeams') : t('matches.generateTeams')}
          </button>
        </div>
      )}

      {teams.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          {teams.map((team, idx) => (
            <div
              key={`team-${idx}`}
              className="bg-[#0a1c17] border border-[#1f453a] rounded-xl match-card-shadow overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-[#0f2d24]">
                <span className="font-anton uppercase tracking-wider text-[#d4f000]">
                  {t('matches.teamName', { n: idx + 1 })}
                </span>
                <span className="text-[10px] text-gray-300 font-bold uppercase">
                  {t('matches.playersJoined', { count: team.length })}
                </span>
              </div>
              <div className="divide-y divide-[#1f453a]">
                {team.map((entry) => (
                  <div key={`${entry.kind}-${entry.id}`} className="flex items-center gap-3 p-2.5">
                    <img
                      src={getAvatarUrl(entry.photoUserId, entry.photoURL)}
                      alt={entry.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full border border-[#1f453a] bg-[#020f0b] object-cover"
                    />
                    <p className="font-bold text-sm text-white truncate flex-1">{entry.name}</p>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 shrink-0">
                      {entry.kind === 'guest'
                        ? t('matches.guest')
                        : t(`roles.short.${entry.role || 'Striker'}`)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
