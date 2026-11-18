import { useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Calendar, Loader2, MapPin, Users } from 'lucide-react';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { useI18n } from '../../../i18n';
import type { UserProfile } from '../../../types';
import { formatMatchShortDate, formatMatchTime, formatMatchWeekday } from '../../../utils/dates';
import { storeGuestName } from '../../../utils/guestName';
import { getLocationLabel } from '../../../utils/location';
import { rosterEntryFor } from '../../../utils/matches';
import { isGuest, signInAsGuest } from '../../auth/api/authActions';
import { AuthLayout, AuthMessage, authInputPlainClass } from '../../auth/components/AuthLayout';
import { joinMatchByLink } from '../api/matchWrites';
import { useMatchPreview } from '../hooks/useMatchPreview';

interface MatchInviteScreenProps {
  matchId: string;
  user: User | null;
  profile: UserProfile | null;
  /** False while a signed-in user's matches are still loading: they may already be a member. */
  membershipKnown: boolean;
  onGuestName: (name: string) => void;
  onExit: () => void;
}

/**
 * What a link recipient sees: the match, never its players. Reads only `matchPreviews/{id}`.
 * No account is created until they press the button (see `submit`).
 */
export function MatchInviteScreen({
  matchId,
  user,
  profile,
  membershipKnown,
  onGuestName,
  onExit,
}: MatchInviteScreenProps) {
  const { t, locale } = useI18n();
  const { preview, loading, notFound } = useMatchPreview(matchId);
  const registered = !!user && !isGuest(user);
  const [name, setName] = useState(() => (user && profile ? profile.name : ''));
  // Stays true after a successful write: the match appears in the member list a moment later and
  // App swaps this screen for the detail view. Re-enabling the button in between invites a double join.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || (!membershipKnown && !busy)) return <LoadingScreen />;

  if (notFound || !preview) {
    return (
      <AuthLayout title={t('matches.invite.notFound')}>
        <button
          type="button"
          onClick={onExit}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base"
        >
          {t('matches.invite.exit')}
        </button>
      </AuthLayout>
    );
  }

  const full = preview.occupiedCount >= preview.capacity;
  const typedName = name.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || (!registered && !typedName)) return;
    setBusy(true);
    setError(null);
    try {
      let uid: string;
      let member: ReturnType<typeof rosterEntryFor>;
      if (registered && user && profile) {
        uid = user.uid;
        member = rosterEntryFor(profile);
      } else {
        // The name goes in first: the guest profile is built from it the moment the session starts.
        storeGuestName(typedName);
        // The only place an account is created, and only because they pressed the button.
        uid = (user ?? (await signInAsGuest())).uid;
        if (user) onGuestName(typedName);
        member = { name: typedName };
      }
      await joinMatchByLink(matchId, { id: uid, ...member }, full ? 'waitlist' : 'roster');
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error && !err.message.startsWith('{') ? err.message : t('auth.errors.generic'));
    }
  };

  const host = preview.creatorName || t('matches.invite.hostFallback');

  return (
    <AuthLayout title={t('matches.invite.title')} subtitle={t('matches.invite.subtitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="bg-[#0a1c17] border border-[#1f453a] rounded-xl p-4 space-y-3">
          <h3 className="font-anton text-xl uppercase tracking-tight">{preview.title}</h3>
          <p className="flex items-center gap-2 text-sm text-gray-300">
            <Calendar className="w-4 h-4 text-[#d4f000] shrink-0" />
            {formatMatchWeekday(preview.date, locale)} {formatMatchShortDate(preview.date, locale)},{' '}
            {formatMatchTime(preview.date, locale)}
          </p>
          <p className="flex items-center gap-2 text-sm text-gray-300">
            <MapPin className="w-4 h-4 text-[#d4f000] shrink-0" />
            {getLocationLabel(preview.location)}
          </p>
          <p className="flex items-center gap-2 text-sm text-gray-300">
            <Users className="w-4 h-4 text-[#d4f000] shrink-0" />
            {t('matches.invite.players', {
              occupied: preview.occupiedCount,
              capacity: preview.capacity,
            })}
          </p>
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            {t('matches.invite.hostedBy', { name: host })}
          </p>
        </div>

        {full && (
          <AuthMessage status={t('matches.invite.fullNotice')} />
        )}
        <AuthMessage error={error} />

        {registered ? (
          <p className="text-sm text-gray-300">{t('matches.invite.joinAs', { name: profile?.name ?? '' })}</p>
        ) : (
          <div className="space-y-1">
            <label className="font-inter font-bold text-xs uppercase tracking-widest text-gray-400 block">
              {t('matches.invite.yourName')}
            </label>
            <input
              className={authInputPlainClass}
              required
              type="text"
              maxLength={60}
              autoComplete="name"
              placeholder={t('matches.invite.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={busy || (!registered && !typedName)}
          className="w-full bg-[#d4f000] text-[#001710] font-anton py-4 uppercase tracking-wider rounded-lg text-base flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> {t('matches.invite.joining')}
            </>
          ) : full ? (
            t('matches.invite.joinWaitlist')
          ) : (
            t('matches.invite.join')
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
