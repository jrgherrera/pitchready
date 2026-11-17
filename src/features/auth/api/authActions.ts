import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type ActionCodeSettings,
  type UserCredential,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { t } from '../../../i18n';
import { auth } from '../../../lib/firebase';

const MAGIC_LINK_EMAIL_KEY = 'pitchready.emailForSignIn';

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    if (error instanceof Error) {
      // Surface Firestore permission issues clearly after a successful Google login.
      if (error.message.includes('permission') || error.message.includes('PERMISSION_DENIED')) {
        return t('auth.errors.firestorePermission');
      }
      try {
        const parsed = JSON.parse(error.message) as { error?: string };
        if (parsed.error) {
          if (parsed.error.includes('permission') || parsed.error.includes('PERMISSION_DENIED')) {
            return t('auth.errors.firestorePermission');
          }
          if (parsed.error.includes('undefined')) {
            return t('auth.errors.profileSaveFailed');
          }
          return parsed.error;
        }
      } catch {
        // not JSON
      }
      return error.message;
    }
    return t('auth.errors.generic');
  }

  switch (error.code) {
    case 'auth/credential-already-in-use':
      return t('auth.errors.credentialInUse');
    case 'auth/email-already-in-use':
      return t('auth.errors.emailInUse');
    case 'auth/invalid-email':
      return t('auth.errors.invalidEmail');
    case 'auth/weak-password':
      return t('auth.errors.weakPassword');
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t('auth.errors.wrongCredentials');
    case 'auth/too-many-requests':
      return t('auth.errors.tooManyRequests');
    case 'auth/popup-closed-by-user':
      return t('auth.errors.popupClosed');
    case 'auth/popup-blocked':
      return t('auth.errors.popupBlocked');
    case 'auth/cancelled-popup-request':
      return t('auth.errors.popupInterrupted');
    case 'auth/unauthorized-domain':
      return t('auth.errors.unauthorizedDomain');
    case 'auth/operation-not-allowed':
      return t('auth.errors.googleDisabled');
    case 'auth/account-exists-with-different-credential':
      return t('auth.errors.accountExistsDifferent');
    case 'auth/network-request-failed':
      return t('auth.errors.network');
    case 'auth/invalid-action-code':
      return t('auth.errors.invalidActionCode');
    case 'auth/missing-email':
      return t('auth.errors.missingEmail');
    default:
      return error.message || t('auth.errors.authFailed');
  }
}

function magicLinkSettings(): ActionCodeSettings {
  return {
    url: window.location.origin,
    handleCodeInApp: true,
  };
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function sendMagicLink(email: string): Promise<void> {
  const normalized = email.trim();
  await sendSignInLinkToEmail(auth, normalized, magicLinkSettings());
  window.localStorage.setItem(MAGIC_LINK_EMAIL_KEY, normalized);
}

// Deliberately NOT a guest-upgrade path. This runs on cold page load and calls
// signInWithEmailLink, which signs in a *different* user and discards the anonymous uid,
// silently losing the guest's rosters and history. Keeping it would need
// EmailAuthProvider.credentialWithLink plus certainty that the anonymous session was
// restored before this runs, which the effect ordering in useAuth does not guarantee.
// Guests upgrade only via upgradeWithGoogle / upgradeWithPassword below.
export async function completeMagicLinkIfPresent(): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return null;
  }

  let email = window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY);
  if (!email) {
    email = window.prompt(t('auth.confirmEmailPrompt')) ?? '';
  }
  if (!email.trim()) {
    throw new FirebaseError('auth/missing-email', t('auth.errors.magicLinkEmailRequired'));
  }

  const credential = await signInWithEmailLink(auth, email.trim(), window.location.href);
  window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY);

  // Clean the action code from the URL without a full reload.
  window.history.replaceState({}, document.title, window.location.pathname);

  return credential.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signInWithGoogle(): Promise<User | null> {
  const provider = createGoogleProvider();

  try {
    const credential = await signInWithPopup(auth, provider);
    return credential.user;
  } catch (error) {
    if (error instanceof FirebaseError && POPUP_FALLBACK_CODES.has(error.code)) {
      // Popup environments (embedded browsers, strict blockers) — use full-page redirect.
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

/** Complete Google redirect sign-in when returning to the app. */
export async function completeGoogleRedirectIfPresent(): Promise<UserCredential | null> {
  return getRedirectResult(auth);
}

export async function resendEmailVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function isEmailProviderUser(user: User): boolean {
  return user.providerData.some(
    (p) => p.providerId === 'password' || p.providerId === 'emailLink',
  );
}

export function needsEmailVerification(user: User): boolean {
  if (user.emailVerified) return false;
  // Google accounts are treated as verified.
  if (user.providerData.some((p) => p.providerId === 'google.com')) return false;
  // Password / email-link accounts must verify.
  return isEmailProviderUser(user);
}

/** Call on a visitor's action (e.g. submitting an invitation), never on mere page view. */
export async function signInAsGuest(): Promise<User> {
  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    // Anonymous provider switched off: say so, not the Google message the shared mapping gives.
    if (error instanceof FirebaseError && error.code === 'auth/operation-not-allowed') {
      throw new Error(t('auth.errors.guestDisabled'));
    }
    throw error;
  }
}

export function isGuest(user: User): boolean {
  return user.isAnonymous;
}

function requireGuestUser(): User {
  const user = auth.currentUser;
  if (!user || !isGuest(user)) throw new Error(t('auth.errors.generic'));
  return user;
}

/** Upgrade the current guest in place (same uid, so rosters and history follow). */
export async function upgradeWithGoogle(): Promise<User | null> {
  const guest = requireGuestUser();
  const provider = createGoogleProvider();

  try {
    const credential = await linkWithPopup(guest, provider);
    return credential.user;
  } catch (error) {
    if (error instanceof FirebaseError && POPUP_FALLBACK_CODES.has(error.code)) {
      // Same fallback as signInWithGoogle; the result is picked up by getRedirectResult.
      await linkWithRedirect(guest, provider);
      return null;
    }
    throw error;
  }
}

/** Email upgrade needs a verified email before creating matches, so send the link now. */
export async function upgradeWithPassword(email: string, password: string): Promise<User> {
  const guest = requireGuestUser();
  const credential = await linkWithCredential(
    guest,
    EmailAuthProvider.credential(email.trim(), password),
  );
  await sendEmailVerification(credential.user);
  return credential.user;
}
