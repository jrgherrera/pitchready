/**
 * Simple A/B / feature flags for auth methods.
 * Email + magic link are currently forced OFF for all users.
 * Flip these later when running an experiment.
 */
export const AUTH_FLAGS = {
  emailPasswordEnabled: false,
  magicLinkEnabled: false,
} as const;

export function isEmailAuthEnabled() {
  return AUTH_FLAGS.emailPasswordEnabled;
}

export function isMagicLinkEnabled() {
  return AUTH_FLAGS.magicLinkEnabled;
}
