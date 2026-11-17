import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useT } from '../../../i18n';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { CreateMatchForm, MatchData, SignUpStatus, UserProfile } from '../../../types';
import {
  getOccupiedCount,
  isMatchFull,
  isWaitlistFull,
  matchToForm,
  rosterEntryFor,
} from '../../../utils/matches';
import {
  createMatch as createMatchDoc,
  deleteMatchEverywhere,
  joinMatch,
  leaveMatch,
  setGuestList,
  updateMatchDetails,
} from '../api/matchWrites';
import { INITIAL_CREATE_FORM } from '../constants';

/**
 * Form state, confirmation prompts and the sign-up animation. Every write itself lives in
 * `../api/matchWrites`, which keeps `matches/{id}` and `matchPreviews/{id}` in step.
 * `saveTeams` stays here: `teams` is never a preview field, so it needs no batch.
 */
export function useMatchActions(
  profile: UserProfile | null,
  onMatchCreated?: (matchId: string) => void,
  onMatchDeleted?: () => void,
) {
  const t = useT();
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [signUpStatus, setSignUpStatus] = useState<SignUpStatus>('idle');
  const [createForm, setCreateForm] = useState<CreateMatchForm>(INITIAL_CREATE_FORM);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setCreatingMatch(true);
    try {
      const matchId = await createMatchDoc(createForm, profile, t('matches.defaultTitle'));
      setCreateForm(INITIAL_CREATE_FORM);
      onMatchCreated?.(matchId);
    } finally {
      setCreatingMatch(false);
    }
  };

  const startEditMatch = (match: MatchData) => {
    setCreateForm(matchToForm(match));
    setEditingMatchId(match.id);
  };

  const cancelEditMatch = () => {
    setEditingMatchId(null);
    setCreateForm(INITIAL_CREATE_FORM);
  };

  /** Only the details — roster, creator and timestamps are left alone. */
  const updateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatchId) return;

    setCreatingMatch(true);
    try {
      await updateMatchDetails(editingMatchId, createForm, t('matches.defaultTitle'));
      cancelEditMatch();
    } finally {
      setCreatingMatch(false);
    }
  };

  const deleteMatch = async (matchId: string) => {
    if (!window.confirm(t('matches.confirmDelete'))) return;
    await deleteMatchEverywhere(matchId);
    onMatchDeleted?.();
  };

  const joinOrLeaveMatch = async (match: MatchData) => {
    if (!profile) return;

    const isJoined = match.joinedPlayerIds.includes(profile.id);
    const isOnWaitlist = (match.waitlistPlayerIds ?? []).includes(profile.id);

    let action: 'leave' | 'roster' | 'waitlist';
    if (isJoined || isOnWaitlist) {
      action = 'leave';
    } else if (!isMatchFull(match)) {
      action = 'roster';
    } else if (!isWaitlistFull(match)) {
      action = 'waitlist';
    } else {
      alert(t('matches.waitlistFull'));
      return;
    }

    const joining = action !== 'leave';
    if (joining) setSignUpStatus('processing');

    try {
      if (action === 'leave') {
        await leaveMatch(match, profile.id);
      } else {
        const result = await joinMatch(
          match,
          { id: profile.id, ...rosterEntryFor(profile) },
          action,
        );
        // Lost the race for the last spot and the waitlist had filled up too. Same message as
        // the up-front guard above — the counts we decided from were simply stale.
        if (result === 'waitlist-full') {
          setSignUpStatus('idle');
          alert(t('matches.waitlistFull'));
          return;
        }
      }

      if (joining) {
        setTimeout(() => {
          setSignUpStatus('confirmed');
          setTimeout(() => {
            setSignUpStatus('idle');
          }, 2000);
        }, 1500);
      }
    } catch (error) {
      setSignUpStatus('idle');
      throw error;
    }
  };

  const addGuestPlusOne = async (match: MatchData) => {
    if (!profile) return;

    if (!match.joinedPlayerIds.includes(profile.id)) {
      alert(t('matches.signUpToAddGuest'));
      return;
    }

    if (getOccupiedCount(match) >= match.capacity) {
      alert(t('matches.alreadyFull'));
      return;
    }

    if ((match.guests ?? []).some((g) => g.addedBy === profile.id)) {
      alert(t('matches.oneGuestOnly'));
      return;
    }

    const guest = {
      id: `guest_${profile.id}_${Date.now()}`,
      addedBy: profile.id,
      createdAt: new Date().toISOString(),
    };

    await setGuestList(match, [...(match.guests ?? []), guest]);
  };

  const removeGuestPlusOne = async (match: MatchData, guestId: string) => {
    if (!profile) return;

    const guest = (match.guests ?? []).find((g) => g.id === guestId);
    if (!guest) return;

    const canRemove =
      guest.addedBy === profile.id ||
      match.creatorId === profile.id;

    if (!canRemove) {
      alert(t('matches.cannotRemoveGuest'));
      return;
    }

    await setGuestList(
      match,
      (match.guests ?? []).filter((g) => g.id !== guestId),
    );
  };

  /** Host-only — firestore.rules rejects this write for anyone but the match owner. */
  const saveTeams = async (match: MatchData, teams: string[][]) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        teams: teams.map((members) => ({ members })),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  return {
    createForm,
    setCreateForm,
    creatingMatch,
    signUpStatus,
    createMatch,
    editingMatchId,
    startEditMatch,
    cancelEditMatch,
    updateMatch,
    deleteMatch,
    joinOrLeaveMatch,
    addGuestPlusOne,
    removeGuestPlusOne,
    saveTeams,
  };
}
