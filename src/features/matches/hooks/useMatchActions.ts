import { useState } from 'react';
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useT } from '../../../i18n';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { CreateMatchForm, MatchData, SignUpStatus, UserProfile } from '../../../types';
import {
  getOccupiedCount,
  isMatchFull,
  isWaitlistFull,
  matchToForm,
  promoteFromWaitlist,
} from '../../../utils/matches';
import { INITIAL_CREATE_FORM } from '../constants';

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
    if (!profile?.admin) {
      alert(t('matches.onlyAdmins'));
      return;
    }

    setCreatingMatch(true);
    const newMatchId = `match_${Date.now()}`;
    const matchDocRef = doc(db, 'matches', newMatchId);

    const capacity = Math.max(2, Number(createForm.capacity) || 10);
    const day = createForm.date || new Date().toISOString().split('T')[0];

    const matchPayload: MatchData = {
      id: newMatchId,
      title: createForm.title || t('matches.defaultTitle'),
      // Local kick-off instant; Firestore stores a Date as a Timestamp
      date: new Date(`${day}T${createForm.time || '19:00'}`),
      capacity,
      duration: Number(createForm.duration),
      status: 'needs_players',
      joinedPlayerIds: [profile.id],
      waitlistPlayerIds: [],
      guests: [],
      creatorId: profile.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Both optional — omit rather than write null, the host can add them later
      ...(createForm.location ? { location: createForm.location } : {}),
      ...(createForm.price === '' ? {} : { price: Number(createForm.price) }),
    };

    try {
      await setDoc(matchDocRef, matchPayload);
      setCreateForm(INITIAL_CREATE_FORM);
      onMatchCreated?.(newMatchId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `matches/${newMatchId}`);
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
    const day = createForm.date || new Date().toISOString().split('T')[0];

    try {
      await updateDoc(doc(db, 'matches', editingMatchId), {
        title: createForm.title || t('matches.defaultTitle'),
        date: new Date(`${day}T${createForm.time || '19:00'}`),
        capacity: Math.max(2, Number(createForm.capacity) || 10),
        duration: Number(createForm.duration),
        // Cleared fields are removed outright. A legacy string location reaches the form as
        // null (the picker can't show it), so saving an edit drops it — pick one to replace it.
        price: createForm.price === '' ? deleteField() : Number(createForm.price),
        location: createForm.location ?? deleteField(),
        updatedAt: new Date().toISOString(),
      });
      cancelEditMatch();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${editingMatchId}`);
    } finally {
      setCreatingMatch(false);
    }
  };

  const deleteMatch = async (matchId: string) => {
    if (!window.confirm(t('matches.confirmDelete'))) return;
    try {
      await deleteDoc(doc(db, 'matches', matchId));
      onMatchDeleted?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
    }
  };

  const joinOrLeaveMatch = async (match: MatchData) => {
    if (!profile) return;

    const isJoined = match.joinedPlayerIds.includes(profile.id);
    const isOnWaitlist = (match.waitlistPlayerIds ?? []).includes(profile.id);
    let updatedPlayerIds = [...match.joinedPlayerIds];
    let updatedWaitlist = [...(match.waitlistPlayerIds ?? [])];
    let updatedGuests = [...(match.guests ?? [])];
    let joining = false;

    if (isJoined) {
      updatedPlayerIds = updatedPlayerIds.filter((id) => id !== profile.id);
      updatedGuests = updatedGuests.filter((g) => g.addedBy !== profile.id);
      const promoted = promoteFromWaitlist(
        updatedPlayerIds,
        updatedWaitlist,
        updatedGuests,
        match.capacity,
      );
      updatedPlayerIds = promoted.joinedPlayerIds;
      updatedWaitlist = promoted.waitlistPlayerIds;
    } else if (isOnWaitlist) {
      updatedWaitlist = updatedWaitlist.filter((id) => id !== profile.id);
    } else if (!isMatchFull(match)) {
      updatedPlayerIds.push(profile.id);
      updatedWaitlist = updatedWaitlist.filter((id) => id !== profile.id);
      joining = true;
      setSignUpStatus('processing');
    } else if (!isWaitlistFull(match)) {
      updatedWaitlist.push(profile.id);
      joining = true;
      setSignUpStatus('processing');
    } else {
      alert(t('matches.waitlistFull'));
      return;
    }

    const matchDocRef = doc(db, 'matches', match.id);
    try {
      await updateDoc(matchDocRef, {
        joinedPlayerIds: updatedPlayerIds,
        waitlistPlayerIds: updatedWaitlist,
        guests: updatedGuests,
        updatedAt: new Date().toISOString(),
      });

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
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
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

    try {
      await updateDoc(doc(db, 'matches', match.id), {
        guests: [...(match.guests ?? []), guest],
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
  };

  const removeGuestPlusOne = async (match: MatchData, guestId: string) => {
    if (!profile) return;

    const guest = (match.guests ?? []).find((g) => g.id === guestId);
    if (!guest) return;

    const canRemove =
      guest.addedBy === profile.id ||
      match.creatorId === profile.id ||
      Boolean(profile.admin);

    if (!canRemove) {
      alert(t('matches.cannotRemoveGuest'));
      return;
    }

    const updatedGuests = (match.guests ?? []).filter((g) => g.id !== guestId);
    const promoted = promoteFromWaitlist(
      match.joinedPlayerIds,
      match.waitlistPlayerIds ?? [],
      updatedGuests,
      match.capacity,
    );

    try {
      await updateDoc(doc(db, 'matches', match.id), {
        guests: updatedGuests,
        joinedPlayerIds: promoted.joinedPlayerIds,
        waitlistPlayerIds: promoted.waitlistPlayerIds,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
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
