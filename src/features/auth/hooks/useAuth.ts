import { useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  reload,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useT } from '../../../i18n';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../../../lib/firebase';
import type { PlayerRole, UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../utils/avatars';
import {
  completeGoogleRedirectIfPresent,
  completeMagicLinkIfPresent,
  getAuthErrorMessage,
  isGuest,
  logoutUser,
  needsEmailVerification,
  resendEmailVerification,
  sendMagicLink,
  sendPasswordReset,
  signInAsGuest as signInAsGuestAction,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  upgradeWithGoogle,
  upgradeWithPassword,
} from '../api/authActions';
import { getStoredGuestName, storeGuestName } from '../../../utils/guestName';
import {
  buildDefaultProfile,
  needsOnboarding,
  saveOnboardingProfile,
} from '../api/profileActions';

export type AuthGate = 'loading' | 'unauthenticated' | 'verify-email' | 'onboarding' | 'ready';

export function useAuth() {
  const t = useT();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hasExistingUserDoc, setHasExistingUserDoc] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // Lets a link, which fires no onAuthStateChanged, re-run the same per-user setup.
  const applyUserRef = useRef<((u: FirebaseUser) => void) | null>(null);

  // A link keeps the uid, so the "keep own profile on same uid" rule below would keep the
  // synthesized guest profile. Clear it explicitly first, then load the real one.
  const reapplyAfterLink = () => {
    const current = auth.currentUser;
    if (!current || !applyUserRef.current) return;
    setProfile(null);
    setUser(current);
    applyUserRef.current(current);
  };

  useEffect(() => {
    let cancelled = false;

    async function completePendingAuth() {
      try {
        const redirect = await completeGoogleRedirectIfPresent();
        if (!cancelled && redirect?.operationType === 'link') reapplyAfterLink();
        await completeMagicLinkIfPresent();
      } catch (error) {
        if (!cancelled) {
          setAuthError(getAuthErrorMessage(error));
        }
      }
    }

    void completePendingAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const applyUser = (firebaseUser: FirebaseUser) => {
      unsubProfile?.();
      unsubProfile = undefined;

      if (isGuest(firebaseUser)) {
        // Anonymous attendees have no users/{uid} doc (rules forbid it): synthesize locally.
        setHasExistingUserDoc(false);
        setProfile({
          id: firebaseUser.uid,
          name: getStoredGuestName(),
          email: '',
          photoURL: getAvatarUrl(firebaseUser.uid),
        });
        setProfileLoading(false);
        setAuthLoading(false);
        return;
      }

      // Drop a previous user's profile (e.g. a guest's synthesized one) so it cannot
      // stand in for this user and flash onboarding; keep our own across repeat events.
      setProfile((prev) => (prev?.id === firebaseUser.uid ? prev : null));
      setProfileLoading(true);
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      unsubProfile = onSnapshot(
        userDocRef,
        { includeMetadataChanges: false },
        (docSnap) => {
          if (docSnap.exists()) {
            // Returning user — go straight to the app (no onboarding).
            const data = docSnap.data() as UserProfile;
            setHasExistingUserDoc(true);
            setProfile({
              ...data,
              name: data.name?.trim() || firebaseUser.displayName || 'Player',
              role: data.role || 'Midfield',
              photoURL: data.photoURL || getAvatarUrl(firebaseUser.uid, firebaseUser.photoURL),
              onboardingComplete: true,
            });
            setProfileLoading(false);
            setAuthLoading(false);
            return;
          }

          // First registration only — keep profile local until onboarding is submitted.
          setHasExistingUserDoc(false);
          setProfile({
            ...buildDefaultProfile(firebaseUser),
            role: undefined,
            name: firebaseUser.displayName || '',
            onboardingComplete: false,
          });
          setProfileLoading(false);
          setAuthLoading(false);
        },
        (err) => {
          setProfileLoading(false);
          setAuthLoading(false);
          console.error('Firestore Error: ', err);
          setAuthError(getAuthErrorMessage(err));
        },
      );
    };
    applyUserRef.current = applyUser;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        unsubProfile?.();
        unsubProfile = undefined;
        setProfile(null);
        setHasExistingUserDoc(false);
        setProfileLoading(false);
        setAuthLoading(false);
        return;
      }
      applyUser(firebaseUser);
    });

    return () => {
      applyUserRef.current = null;
      unsubProfile?.();
      unsubscribe();
    };
  }, []);

  const clearMessages = () => {
    setAuthError(null);
    setStatusMessage(null);
  };

  const runAuthAction = async (action: () => Promise<void>) => {
    clearMessages();
    setAuthBusy(true);
    try {
      await action();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    await runAuthAction(async () => {
      await signUpWithEmail(email, password);
      setStatusMessage(t('auth.accountCreated'));
    });
  };

  const signIn = async (email: string, password: string) => {
    await runAuthAction(async () => {
      await signInWithEmail(email, password);
    });
  };

  const signInAsGuest = async () => {
    await runAuthAction(async () => {
      await signInAsGuestAction();
    });
  };

  const upgradeGuest = async (action: () => Promise<unknown>) => {
    await runAuthAction(async () => {
      try {
        await action();
      } finally {
        // The link may succeed and a later step (the verification email) fail: still switch over.
        if (auth.currentUser && !isGuest(auth.currentUser)) reapplyAfterLink();
      }
    });
  };

  const upgradeGuestWithGoogle = () => upgradeGuest(upgradeWithGoogle);

  const upgradeGuestWithPassword = (email: string, password: string) =>
    upgradeGuest(() => upgradeWithPassword(email, password));

  const requestMagicLink = async (email: string) => {
    await runAuthAction(async () => {
      await sendMagicLink(email);
      setStatusMessage(t('auth.magicLinkSent'));
    });
  };

  const resetPassword = async (email: string) => {
    await runAuthAction(async () => {
      await sendPasswordReset(email);
      setStatusMessage(t('auth.resetSent'));
    });
  };

  const loginWithGoogle = async () => {
    await runAuthAction(async () => {
      await signInWithGoogle();
    });
  };

  const logout = async () => {
    clearMessages();
    try {
      await logoutUser();
      setUser(null);
      setProfile(null);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    }
  };

  const resendVerification = async () => {
    if (!user) return;
    await runAuthAction(async () => {
      await resendEmailVerification(user);
      setStatusMessage(t('auth.verificationResent'));
    });
  };

  const refreshUser = async () => {
    if (!user) return;
    await reload(user);
    setUser(auth.currentUser);
  };

  const completeOnboarding = async (name: string, role: PlayerRole) => {
    if (!user || isGuest(user)) return; // guests have no users/{uid} doc
    await runAuthAction(async () => {
      await updateProfile(user, {
        displayName: name.trim(),
        photoURL: getAvatarUrl(user.uid, user.photoURL),
      });
      const next = await saveOnboardingProfile(user, name, role);
      setHasExistingUserDoc(true);
      setProfile(next);
    });
  };

  const updateUserProfile = async (nextProfile: UserProfile) => {
    if (!user || isGuest(user)) return; // rules forbid users/{uid} for anonymous users
    const userDocRef = doc(db, 'users', nextProfile.id);
    try {
      await updateDoc(userDocRef, {
        name: nextProfile.name,
        role: nextProfile.role,
      });
      setStatusMessage(t('auth.profileUpdated'));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${nextProfile.id}`);
    }
  };

  /** Guests only: cache a name (typed, or recovered from a match roster) and show it. */
  const setGuestName = (name: string) => {
    const trimmed = name.trim();
    if (!user || !isGuest(user) || !trimmed) return;
    storeGuestName(trimmed);
    setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
  };

  const gate: AuthGate = (() => {
    if (authLoading || (user && profileLoading && !profile)) return 'loading';
    if (!user) return 'unauthenticated';
    if (isGuest(user)) return 'ready';
    if (needsEmailVerification(user)) return 'verify-email';
    if (needsOnboarding(profile, hasExistingUserDoc)) return 'onboarding';
    return 'ready';
  })();

  return {
    user,
    profile,
    setProfile,
    authLoading: gate === 'loading',
    gate,
    isGuest: !!user && isGuest(user),
    setGuestName,
    authError,
    statusMessage,
    authBusy,
    clearMessages,
    signUp,
    signIn,
    signInAsGuest,
    upgradeGuestWithGoogle,
    upgradeGuestWithPassword,
    requestMagicLink,
    resetPassword,
    loginWithGoogle,
    logout,
    resendVerification,
    refreshUser,
    completeOnboarding,
    updateUserProfile,
  };
}
