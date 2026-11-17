const GUEST_NAME_KEY = 'pitchready.guestName';

/**
 * Display-name cache for anonymous guests. The identity is the Firebase anonymous
 * uid, never this value: missing, cleared or blocked storage just reads as ''.
 */
export function getStoredGuestName(): string {
  try {
    return localStorage.getItem(GUEST_NAME_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function storeGuestName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(GUEST_NAME_KEY, trimmed);
  } catch {
    // Storage unavailable — the name is only a cache.
  }
}

/** Once an upgraded user's real name is saved on users/{uid}, the cache has done its job. */
export function clearGuestName(): void {
  try {
    localStorage.removeItem(GUEST_NAME_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
