import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Award,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Pencil,
  Share2,
  Trash2,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { useI18n } from '../../../i18n';
import { refreshOwnRosterEntry } from '../api/matchWrites';
import type { MatchData, MatchLocation, SignUpStatus, UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../utils/avatars';
import {
  formatMatchShortDate,
  formatMatchTime,
  formatMatchWeekday,
} from '../../../utils/dates';
import {
  getLocationAddress,
  getLocationCoords,
  getLocationLabel,
  openMapsDirections,
} from '../../../utils/location';
import {
  getCapacityPercent,
  getOccupiedCount,
  getSpotsLeft,
  getWaitlistSpotsLeft,
  isMatchFull,
  isWaitlistFull,
  resolveRoster,
  resolveWaitlist,
  shareMatchLink,
} from '../../../utils/matches';
import { MATCH_HERO_IMAGE } from '../constants';
import { AddPlusOneModal } from './AddPlusOneModal';
import { ConfirmDeleteMatchModal } from './ConfirmDeleteMatchModal';
import { MatchLocationMap } from './MatchLocationMap';
import { RemoveGuestModal } from './RemoveGuestModal';
import { TeamsSection } from './TeamsSection';

interface MatchDetailViewProps {
  match: MatchData;
  profile: UserProfile;
  /** Guests keep their name only in localStorage; the roster is the other copy. */
  isGuest: boolean;
  onGuestName: (name: string) => void;
  signUpStatus: SignUpStatus;
  canManage: boolean;
  onBack: () => void;
  onJoinLeave: (match: MatchData) => void;
  onAddGuest: (match: MatchData) => Promise<void>;
  onRemoveGuest: (match: MatchData, guestId: string) => Promise<void>;
  onRemoveMember: (match: MatchData, uid: string) => Promise<void>;
  onMoveMember: (match: MatchData, uid: string, to: 'roster' | 'waitlist') => Promise<void>;
  onSaveTeams: (match: MatchData, teams: string[][]) => Promise<void>;
  onEdit: (match: MatchData) => void;
  onDelete: (matchId: string) => void;
}

export function MatchDetailView({
  match,
  profile,
  isGuest,
  onGuestName,
  signUpStatus,
  canManage,
  onBack,
  onJoinLeave,
  onAddGuest,
  onRemoveGuest,
  onRemoveMember,
  onMoveMember,
  onSaveTeams,
  onEdit,
  onDelete,
}: MatchDetailViewProps) {
  const { t, locale } = useI18n();
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [showPlusOneModal, setShowPlusOneModal] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestToRemove, setGuestToRemove] = useState<{
    id: string;
    addedBy: string;
    photoUserId: string;
    photoURL?: string;
  } | null>(null);
  const [removingGuest, setRemovingGuest] = useState(false);
  const [memberToManage, setMemberToManage] = useState<{
    id: string;
    name: string;
    kind: 'player' | 'waitlist';
  } | null>(null);
  const [managingMember, setManagingMember] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingMatch, setDeletingMatch] = useState(false);


  // Names age: let a renamed member's own roster entry catch up when they open the match
  useEffect(() => {
    if (!match.memberIds?.includes(profile.id)) return;
    // Cleared site data leaves a guest signed in but nameless: take the name back from the roster
    // rather than let the refresh below overwrite it.
    const rosterName = match.roster?.[profile.id]?.name;
    if (isGuest && !profile.name.trim() && rosterName) onGuestName(rosterName);
    void refreshOwnRosterEntry(match, profile);
  // Deliberately keyed on match.id only: run once per opened match, not on every snapshot or profile change.
  }, [match.id]);

  const isPlayerInRoster = match.joinedPlayerIds.includes(profile.id);
  const isOnWaitlist = (match.waitlistPlayerIds ?? []).includes(profile.id);
  const occupied = getOccupiedCount(match);
  const capacityPercentage = getCapacityPercent(match);
  const spotsLeft = getSpotsLeft(match);
  const waitlistSpotsLeft = getWaitlistSpotsLeft(match);
  const roster = resolveRoster(match);
  const waitlist = resolveWaitlist(match);
  const heroImage = MATCH_HERO_IMAGE;
  const locationLabel = getLocationLabel(match.location);
  const locationAddress = getLocationAddress(match.location);
  const locationCoords = getLocationCoords(match.location);
  const mapLocation =
    locationCoords && typeof match.location === 'object'
      ? (match.location as MatchLocation)
      : null;

  const openPlusOneModal = () => {
    if (!isPlayerInRoster) {
      alert(t('matches.signUpToAddGuest'));
      return;
    }
    if ((match.guests ?? []).some((g) => g.addedBy === profile.id)) {
      alert(t('matches.oneGuestOnly'));
      return;
    }
    if (spotsLeft <= 0) {
      alert(t('matches.alreadyFull'));
      return;
    }
    setShowPlusOneModal(true);
  };

  const confirmPlusOne = async () => {
    setAddingGuest(true);
    try {
      await onAddGuest(match);
      setShowPlusOneModal(false);
    } finally {
      setAddingGuest(false);
    }
  };

  const canManageGuest = (addedBy: string) =>
    addedBy === profile.id || match.creatorId === profile.id;

  const openRemoveGuest = (entry: {
    id: string;
    addedBy: string;
    photoUserId: string;
    photoURL?: string;
  }) => {
    if (!canManageGuest(entry.addedBy)) {
      alert(t('matches.cannotRemoveGuest'));
      return;
    }
    setGuestToRemove(entry);
  };

  const confirmRemoveGuest = async () => {
    if (!guestToRemove) return;
    setRemovingGuest(true);
    try {
      await onRemoveGuest(match, guestToRemove.id);
      setGuestToRemove(null);
    } finally {
      setRemovingGuest(false);
    }
  };

  /** The owner can manage anyone but themselves; useMatchActions re-checks both. */
  const canManageMember = (uid: string) => canManage && uid !== profile.id;

  const runMemberAction = async (action: (uid: string) => Promise<void>) => {
    if (!memberToManage) return;
    setManagingMember(true);
    try {
      await action(memberToManage.id);
      setMemberToManage(null);
    } finally {
      setManagingMember(false);
    }
  };

  const confirmDeleteMatch = async () => {
    setDeletingMatch(true);
    try {
      await onDelete(match.id);
      setConfirmingDelete(false);
    } finally {
      setDeletingMatch(false);
    }
  };

  const removeHost =
    guestToRemove &&
    ((match.roster?.[guestToRemove.addedBy] && { id: guestToRemove.addedBy, ...match.roster[guestToRemove.addedBy] }) || {
      id: guestToRemove.addedBy,
      name: t('common.player'),
      photoURL: guestToRemove.photoURL,
    });

  return (
    <div className="bg-[#020f0b] text-white min-h-screen pb-24 font-archivo">
      <header className="w-full top-0 sticky z-50 bg-[#0a1c17] border-b border-[#1f453a] shadow-lg">
        <div className="flex justify-between items-center px-4 py-3.5 max-w-4xl mx-auto">
          <button
            className="p-2 -ml-2 rounded-full hover:bg-[#0f2d24] transition-all active:scale-95 text-[#d4f000]"
            onClick={onBack}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <span className="font-anton text-2xl uppercase tracking-tighter text-white">
            {t('brand')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => shareMatchLink(match.id)}
              aria-label={t('matches.share')}
              className="p-2 rounded-lg bg-[#0f2d24] text-gray-300 hover:text-white hover:bg-[#1f453a] border border-[#1f453a] transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <img
              src={getAvatarUrl(profile.id, profile.photoURL)}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-[#d4f000] object-cover bg-[#020f0b]"
            />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto">
        <div className="relative w-full h-[280px] overflow-hidden">
          <div className="absolute inset-0 z-0 bg-[#0f2d24]">
            <div
              className="absolute inset-0 opacity-60 mix-blend-overlay bg-cover bg-center"
              style={{ backgroundImage: `url('${heroImage}')` }}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#020f0b] via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-5 w-full z-10">
            <h1 className="font-anton text-3xl text-white uppercase leading-none tracking-tight">
              {match.title}
            </h1>
          </div>
        </div>

        <div className="px-4 -mt-4 relative z-20 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a1c17] p-4 border border-[#1f453a] rounded-xl col-span-2 flex justify-between items-center match-card-shadow">
              <div>
                <p className="text-gray-400 text-[10px] uppercase tracking-widest mb-1">
                  {t('matches.kickOff')}
                </p>
                <p className="font-anton text-2xl text-white">
                  {formatMatchTime(match.date, locale)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[#d4f000] font-inter font-bold text-xs uppercase tracking-wider mb-1">
                  {formatMatchWeekday(match.date, locale)}
                </p>
                <p className="font-archivo text-base font-bold text-white uppercase">
                  {formatMatchShortDate(match.date, locale)}
                </p>
              </div>
            </div>

            <div className="bg-[#0a1c17] p-4 border border-[#1f453a] rounded-xl match-card-shadow">
              <p className="text-gray-400 text-[10px] uppercase tracking-widest mb-1">
                {t('matches.availability')}
              </p>
              <p className="font-anton text-2xl text-[#d4f000]">
                {occupied}/{match.capacity}
              </p>
              <div className="w-full bg-[#020f0b] h-2 mt-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#d4f000] h-full transition-all duration-500"
                  style={{ width: `${capacityPercentage}%` }}
                />
              </div>
              <p className="text-xs text-[#779689] mt-1.5 font-semibold">
                {spotsLeft > 0
                  ? t('matches.spotsLeft', { count: spotsLeft })
                  : t('matches.matchFull')}
              </p>
            </div>

            <div className="bg-[#0a1c17] p-4 border border-[#1f453a] rounded-xl match-card-shadow">
              <p className="text-gray-400 text-[10px] uppercase tracking-widest mb-1">
                {t('matches.duration')}
              </p>
              <p className="font-anton text-2xl text-white">
                {match.duration || 60}{' '}
                <span className="font-archivo text-lg">{t('matches.mins')}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1.5 font-semibold">
                {t('matches.fullMatchPlay')}
              </p>
            </div>
          </div>
        </div>

        <section className="mt-6 px-4">
          <h2 className="font-anton text-lg tracking-wide uppercase text-[#d4f000] mb-3">
            {t('matches.locationMap')}
          </h2>
          <div className="bg-[#0a1c17] overflow-hidden border border-[#1f453a] rounded-xl match-card-shadow">
            {/* No pin, no map frame — the label below already says it's pending */}
            {mapLocation && (
              <button
                type="button"
                className="w-full text-left"
                onClick={() => openMapsDirections(mapLocation)}
              >
                <MatchLocationMap location={mapLocation} />
              </button>
            )}
            <div className="p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#d4f000] text-3xl select-none">
                location_on
              </span>
              <div className="min-w-0">
                <p className="font-bold text-white text-base">{locationLabel}</p>
                {locationAddress && locationAddress !== locationLabel && (
                  <p className="text-xs text-gray-400 mt-0.5">{locationAddress}</p>
                )}
                {mapLocation && (
                  <button
                    type="button"
                    onClick={() => openMapsDirections(mapLocation)}
                    className="text-[11px] font-bold uppercase tracking-wider text-[#d4f000] mt-2"
                  >
                    {t('matches.openInMaps')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 px-4">
          <div className="flex justify-between items-end mb-3">
            <h2 className="font-anton text-lg tracking-wide uppercase text-[#d4f000]">
              {t('matches.currentRoster')}
            </h2>
            <span className="text-xs text-gray-400 font-semibold">
              {t('matches.playersJoined', { count: occupied })}
            </span>
          </div>

          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-3 pt-1">
            {roster.map((entry, idx) => {
              const content = (
                <>
                  <div
                    className={`w-14 h-14 rounded-full border-2 ${
                      entry.kind === 'player' && entry.role === 'Captain'
                        ? 'border-[#d4f000]'
                        : 'border-[#1f453a]'
                    } p-0.5 mb-1 bg-[#0a1c17] relative`}
                  >
                    <img
                      className="w-full h-full rounded-full object-cover"
                      src={getAvatarUrl(entry.photoUserId, entry.photoURL)}
                      alt={entry.name}
                      referrerPolicy="no-referrer"
                    />
                    {entry.kind === 'guest' && (
                      <div className="absolute -top-1 -right-1 bg-[#d4f000] text-[#001710] rounded-full min-w-6 h-6 px-1 flex items-center justify-center shadow font-anton text-[10px] leading-none">
                        +1
                      </div>
                    )}
                    {entry.kind === 'player' && entry.role === 'Captain' && (
                      <div className="absolute -top-1 -right-1 bg-[#d4f000] text-[#001710] rounded-full p-0.5 shadow">
                        <Award className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-bold text-center text-white max-w-[72px] truncate">
                    {entry.name}
                  </p>
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider ${
                      entry.kind === 'player' && entry.role === 'Captain'
                        ? 'text-[#d4f000]'
                        : 'text-gray-400'
                    }`}
                  >
                    {entry.kind === 'guest'
                      ? t('matches.guest')
                      : t(`roles.short.${entry.role || 'Striker'}`)}
                  </span>
                </>
              );

              const onTap =
                entry.kind === 'guest'
                  ? () =>
                      openRemoveGuest({
                        id: entry.id,
                        addedBy: entry.addedBy,
                        photoUserId: entry.photoUserId,
                        photoURL: entry.photoURL,
                      })
                  : canManageMember(entry.id)
                    ? () => setMemberToManage({ id: entry.id, name: entry.name, kind: 'player' })
                    : null;

              if (onTap) {
                return (
                  <button
                    key={`${entry.kind}-${entry.id}-${idx}`}
                    type="button"
                    onClick={onTap}
                    className="flex flex-col items-center min-w-[72px] shrink-0 active:scale-95 transition-transform"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={`${entry.kind}-${entry.id}-${idx}`}
                  className="flex flex-col items-center min-w-[72px] shrink-0"
                >
                  {content}
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, spotsLeft) }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={openPlusOneModal}
                className="flex flex-col items-center min-w-[72px] shrink-0 opacity-40 hover:opacity-80 transition-opacity"
              >
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#1f453a] flex items-center justify-center mb-1 bg-[#0a1c17]/30">
                  <UserPlus className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-xs font-bold text-gray-400">{t('matches.openSlot')}</p>
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#d4f000]">
                  {t('matches.joinNow')}
                </span>
              </button>
            ))}

            {/* Hold / waitlist slots — always at the end, visually distinct */}
            <div className="flex items-center self-stretch px-1 shrink-0">
              <div className="w-px h-16 bg-amber-700/50" aria-hidden />
            </div>

            {waitlist.map((entry) => {
              const content = (
                <>
                  <div className="w-14 h-14 rounded-full border-2 border-dashed border-amber-500/70 p-0.5 mb-1 bg-amber-950/40 relative">
                    <img
                      className="w-full h-full rounded-full object-cover opacity-90"
                      src={getAvatarUrl(entry.photoUserId, entry.photoURL)}
                      alt={entry.name}
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -top-1 -right-1 bg-amber-400 text-[#001710] rounded-full p-0.5 shadow">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-center text-amber-100 max-w-[72px] truncate">
                    {entry.name}
                  </p>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400">
                    {t('matches.onHold')}
                  </span>
                </>
              );

              if (canManageMember(entry.id)) {
                return (
                  <button
                    key={`waitlist-${entry.id}`}
                    type="button"
                    onClick={() =>
                      setMemberToManage({ id: entry.id, name: entry.name, kind: 'waitlist' })
                    }
                    className="flex flex-col items-center min-w-[72px] shrink-0 active:scale-95 transition-transform"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={`waitlist-${entry.id}`}
                  className="flex flex-col items-center min-w-[72px] shrink-0"
                >
                  {content}
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, waitlistSpotsLeft) }).map((_, i) => (
              <button
                key={`hold-empty-${i}`}
                type="button"
                onClick={() => onJoinLeave(match)}
                disabled={isPlayerInRoster || isOnWaitlist}
                className="flex flex-col items-center min-w-[72px] shrink-0 opacity-55 hover:opacity-90 transition-opacity disabled:opacity-30 disabled:pointer-events-none"
              >
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-amber-600/60 flex items-center justify-center mb-1 bg-amber-950/25">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-xs font-bold text-amber-200/80">{t('matches.holdSlot')}</p>
                <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400">
                  {t('matches.holdNow')}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setRosterExpanded(!rosterExpanded)}
            className="w-full bg-[#0a1c17] p-3 border border-[#1f453a] hover:bg-[#0f2d24] rounded-lg flex justify-center items-center mt-2 cursor-pointer transition-transform duration-150 active:scale-[0.99] match-card-shadow"
          >
            <span className="font-bold text-[#d4f000] uppercase text-xs">
              {rosterExpanded
                ? t('matches.hideFullSquad')
                : t('matches.viewFullSquad', {
                    count: occupied + waitlist.length,
                  })}
            </span>
            <ChevronDown
              className={`w-4 h-4 ml-1 transition-transform ${rosterExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {rosterExpanded && (
            <div className="mt-3 bg-[#0a1c17] border border-[#1f453a] rounded-lg divide-y divide-[#1f453a] match-card-shadow animate-fade-in">
              {roster.map((entry, idx) => {
                const row = (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={getAvatarUrl(entry.photoUserId, entry.photoURL)}
                          alt={entry.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full border border-[#1f453a] bg-[#020f0b] object-cover"
                        />
                        {entry.kind === 'guest' && (
                          <div className="absolute -top-1 -right-1 bg-[#d4f000] text-[#001710] rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow font-anton text-[9px] leading-none">
                            +1
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">{entry.name}</p>
                        <p className="text-xs text-gray-400">
                          {entry.kind === 'guest'
                            ? t('matches.plusOneFor', {
                                name:
                                  match.roster?.[entry.addedBy]?.name ||
                                  t('common.player'),
                              })
                            : t('matches.privateEmail')}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider font-bold ${
                        entry.kind === 'player' && entry.role === 'Captain'
                          ? 'bg-[#d4f000] text-[#001710]'
                          : 'bg-[#0f2d24] text-gray-300'
                      }`}
                    >
                      {entry.kind === 'guest'
                        ? t('matches.guest')
                        : t(`roles.short.${entry.role || 'Striker'}`)}
                    </span>
                  </>
                );

                if (entry.kind === 'guest') {
                  return (
                    <button
                      key={`expanded-${entry.kind}-${entry.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        openRemoveGuest({
                          id: entry.id,
                          addedBy: entry.addedBy,
                          photoUserId: entry.photoUserId,
                          photoURL: entry.photoURL,
                        })
                      }
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-[#0f2d24] transition-colors"
                    >
                      {row}
                    </button>
                  );
                }

                return (
                  <div
                    key={`expanded-${entry.kind}-${entry.id}-${idx}`}
                    className="flex items-center justify-between p-3"
                  >
                    {row}
                  </div>
                );
              })}

              {waitlist.length > 0 && (
                <div className="px-3 py-2 bg-amber-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    {t('matches.holdSlot')}
                  </p>
                </div>
              )}

              {waitlist.map((entry) => (
                <div
                  key={`expanded-waitlist-${entry.id}`}
                  className="flex items-center justify-between p-3 bg-amber-950/15"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={getAvatarUrl(entry.photoUserId, entry.photoURL)}
                        alt={entry.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full border border-dashed border-amber-600/60 bg-[#020f0b] object-cover"
                      />
                      <div className="absolute -top-1 -right-1 bg-amber-400 text-[#001710] rounded-full p-0.5 shadow">
                        <Clock className="w-3 h-3" />
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-amber-50">{entry.name}</p>
                      <p className="text-xs text-amber-200/60">
                        {t('matches.privateEmail')}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider font-bold bg-amber-950/50 text-amber-300 border border-amber-700/40">
                    {t('matches.onHold')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <TeamsSection
          roster={roster}
          savedTeams={match.teams}
          canManage={canManage}
          onSave={(teams) => onSaveTeams(match, teams)}
        />

        <section className="mt-6 px-4 mb-8">
          <h2 className="font-anton text-lg tracking-wide uppercase text-[#d4f000] mb-3">
            {t('matches.quickRules')}
          </h2>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-[#d4f000] shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">{t('matches.rule1')}</p>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-[#d4f000] shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">{t('matches.rule2')}</p>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-[#d4f000] shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">{t('matches.rule3')}</p>
            </li>
          </ul>
        </section>

        {canManage && (
          <div className="px-4 mb-12 space-y-3">
            <button
              onClick={() => onEdit(match)}
              className="w-full bg-[#0f2d24] hover:bg-[#1f453a] text-[#d4f000] border border-[#1f453a] font-anton py-3.5 rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <Pencil className="w-4 h-4" /> {t('matches.editMatch')}
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-900/60 font-anton py-3.5 rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> {t('matches.cancelDelete')}
            </button>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 w-full bg-[#0a1c17] border-t-4 border-[#d4f000] p-4 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-gray-400 text-[10px] uppercase tracking-widest">
              {t('matches.playerFee')}
            </p>
            {/* The fallback wording is far longer than a price — let it shrink instead of shoving the CTA */}
            <p
              className={`font-anton text-white ${
                match.price == null ? 'text-[clamp(0.75rem,3.5vw,1.5rem)] leading-tight' : 'text-2xl'
              }`}
            >
              {match.price == null
                ? t('matches.priceUndefined')
                : `₡${match.price.toLocaleString('en-US')}`}
            </p>
          </div>

          <button
            onClick={() => onJoinLeave(match)}
            disabled={
              signUpStatus === 'processing' ||
              (!isPlayerInRoster && !isOnWaitlist && isMatchFull(match) && waitlistSpotsLeft <= 0)
            }
            className={`font-anton text-base px-8 py-3 rounded uppercase active:scale-95 transition-all text-glow-neon flex items-center gap-2 ${
              isPlayerInRoster
                ? 'bg-[#0f2d24] text-white border border-[#1f453a]'
                : isOnWaitlist
                  ? 'bg-amber-950/60 text-amber-200 border border-amber-700/60'
                  : 'bg-[#d4f000] text-[#001710] hover:bg-[#b8d100]'
            }`}
          >
            {signUpStatus === 'processing' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('matches.processing')}
              </>
            )}
            {signUpStatus === 'confirmed' && (
              <>
                {t('matches.confirmedStatus')} <Check className="w-4 h-4" />
              </>
            )}
            {signUpStatus === 'idle' &&
              (isPlayerInRoster ? (
                <>
                  {t('matches.leaveMatch')} <Check className="w-4 h-4 text-[#d4f000]" />
                </>
              ) : isOnWaitlist ? (
                <>
                  {t('matches.leaveHold')} <Clock className="w-4 h-4 text-amber-400" />
                </>
              ) : isMatchFull(match) ? (
                <>
                  {t('matches.holdSpotCta')} <Clock className="w-4 h-4" />
                </>
              ) : (
                <>
                  {t('matches.signUpNow')} <Zap className="w-4 h-4 fill-current" />
                </>
              ))}
          </button>
        </div>
      </footer>

      {showPlusOneModal && (
        <AddPlusOneModal
          hostId={profile.id}
          hostName={profile.name}
          hostPhotoURL={profile.photoURL}
          busy={addingGuest}
          onClose={() => setShowPlusOneModal(false)}
          onConfirm={() => {
            void confirmPlusOne();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDeleteMatchModal
          matchTitle={match.title}
          busy={deletingMatch}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => {
            void confirmDeleteMatch();
          }}
        />
      )}

      {guestToRemove && removeHost && (
        <RemoveGuestModal
          hostId={removeHost.id}
          hostName={removeHost.name}
          hostPhotoURL={removeHost.photoURL}
          busy={removingGuest}
          onClose={() => setGuestToRemove(null)}
          onConfirm={() => {
            void confirmRemoveGuest();
          }}
        />
      )}

      {/* Same bottom-sheet shell as RemoveGuestModal; kept inline since it only lives here. */}
      {memberToManage && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-end justify-center">
          <div
            className="absolute inset-0"
            onClick={managingMember ? undefined : () => setMemberToManage(null)}
          />
          <div className="w-full max-w-md bg-[#0a1c17] border-t border-[#1f453a] rounded-t-2xl z-10 px-6 pb-8 pt-4 space-y-5 animate-slide-up">
            <div className="flex justify-center mb-1">
              <div className="w-12 h-1.5 bg-[#1f453a] rounded-full" />
            </div>

            <div className="flex justify-between items-start">
              <h2 className="font-anton text-2xl text-[#d4f000] uppercase tracking-wider">
                {t('matches.manageMemberTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setMemberToManage(null)}
                disabled={managingMember}
                className="p-1 rounded-full text-gray-400 hover:text-white disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center py-2">
              <div
                className={`w-20 h-20 rounded-full border-2 p-0.5 mb-3 ${
                  memberToManage.kind === 'waitlist'
                    ? 'border-dashed border-amber-500/70 bg-amber-950/40'
                    : 'border-[#1f453a] bg-[#0a1c17]'
                }`}
              >
                <img
                  src={getAvatarUrl(memberToManage.id, match.roster?.[memberToManage.id]?.photoURL)}
                  alt={memberToManage.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <p className="font-bold text-white text-base">{memberToManage.name}</p>
              <p
                className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 ${
                  memberToManage.kind === 'waitlist' ? 'text-amber-400' : 'text-gray-400'
                }`}
              >
                {memberToManage.kind === 'waitlist' ? t('matches.onHold') : t('matches.onRoster')}
              </p>
            </div>

            <div className="space-y-3">
              {memberToManage.kind === 'player' && !isWaitlistFull(match) && (
                <button
                  type="button"
                  disabled={managingMember}
                  onClick={() => {
                    void runMemberAction((uid) => onMoveMember(match, uid, 'waitlist'));
                  }}
                  className="w-full py-3.5 rounded-xl border border-amber-700/60 bg-amber-950/40 text-amber-300 font-anton uppercase tracking-wider text-sm hover:bg-amber-900/40 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  {t('matches.moveToHold')}
                </button>
              )}
              {memberToManage.kind === 'waitlist' && !isMatchFull(match) && (
                <button
                  type="button"
                  disabled={managingMember}
                  onClick={() => {
                    void runMemberAction((uid) => onMoveMember(match, uid, 'roster'));
                  }}
                  className="w-full py-3.5 rounded-xl border border-[#1f453a] bg-[#0f2d24] text-[#d4f000] font-anton uppercase tracking-wider text-sm hover:bg-[#1f453a] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowUp className="w-4 h-4" />
                  {t('matches.moveToRoster')}
                </button>
              )}
              <div>
                <button
                  type="button"
                  disabled={managingMember}
                  onClick={() => {
                    void runMemberAction((uid) => onRemoveMember(match, uid));
                  }}
                  className="w-full py-3.5 rounded-xl bg-red-950/50 text-red-400 border border-red-900/60 font-anton uppercase tracking-wider text-sm hover:bg-red-900/50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('matches.removeFromMatch')}
                </button>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {t('matches.removeFromMatchBody')}
                </p>
              </div>
              <button
                type="button"
                disabled={managingMember}
                onClick={() => setMemberToManage(null)}
                className="w-full py-3.5 rounded-xl border border-[#1f453a] text-gray-300 font-anton uppercase tracking-wider text-sm hover:bg-[#0f2d24] disabled:opacity-50"
              >
                {t('matches.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
