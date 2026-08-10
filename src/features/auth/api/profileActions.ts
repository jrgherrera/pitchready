import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { PlayerRole, UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../utils/avatars';
import type { User } from 'firebase/auth';

export function buildDefaultProfile(user: User, extras?: Partial<UserProfile>): UserProfile {
  return {
    id: user.uid,
    name: extras?.name || user.displayName || user.email?.split('@')[0] || 'Player',
    email: extras?.email || user.email || '',
    photoURL: extras?.photoURL || getAvatarUrl(user.uid, user.photoURL),
    role: extras?.role,
    onboardingComplete: extras?.onboardingComplete,
    createdAt: extras?.createdAt || new Date().toISOString(),
  };
}

/** First-time setup only — returning users (existing Firestore doc) skip this. */
export function needsOnboarding(
  profile: UserProfile | null,
  hasExistingUserDoc: boolean,
): boolean {
  if (!profile) return false;
  if (hasExistingUserDoc) return false;
  return profile.onboardingComplete !== true;
}

/** Firestore rejects `undefined` field values — strip them before writes. */
export function toFirestoreProfile(profile: UserProfile): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
  };
  if (profile.photoURL) payload.photoURL = profile.photoURL;
  if (profile.role) payload.role = profile.role;
  if (profile.createdAt) payload.createdAt = profile.createdAt;
  if (typeof profile.onboardingComplete === 'boolean') {
    payload.onboardingComplete = profile.onboardingComplete;
  }
  // Never write `admin` from the client — set only in Firebase Console.
  return payload;
}

export async function upsertUserProfile(
  userId: string,
  profile: UserProfile,
): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId), toFirestoreProfile(profile), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

export async function saveOnboardingProfile(
  user: User,
  name: string,
  role: PlayerRole,
): Promise<UserProfile> {
  const profile = buildDefaultProfile(user, {
    name: name.trim(),
    role,
    email: user.email || '',
    onboardingComplete: true,
  });
  await upsertUserProfile(user.uid, profile);
  return profile;
}
