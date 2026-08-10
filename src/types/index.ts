export type PlayerRole = 'Captain' | 'Striker' | 'Midfield' | 'Keeper' | 'Defender';

export type AppTab = 'dashboard' | 'matches' | 'players' | 'settings';

export type MatchStatus = 'needs_players' | 'confirmed' | 'cancelled';

export type SignUpStatus = 'idle' | 'processing' | 'confirmed';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  role?: PlayerRole;
  /** Set manually in Firebase Console — only admins can host matches */
  admin?: boolean;
  /** True after the user finishes first-time profile setup */
  onboardingComplete?: boolean;
  createdAt?: string;
}

/** Selected pitch location (map pin + human-readable address) */
export interface MatchLocation {
  lat: number;
  lng: number;
  /** Full formatted address from reverse geocode */
  address: string;
  /** Optional short place / venue name */
  name?: string;
}

export interface MatchGuest {
  id: string;
  /** User who added this +1 */
  addedBy: string;
  createdAt: string;
}

export interface MatchData {
  id: string;
  title: string;
  date: string;
  time: string;
  /** Map-selected location (object). Legacy docs may still store a string. */
  location: MatchLocation | string;
  capacity: number;
  duration?: number;
  price?: number;
  status?: MatchStatus;
  joinedPlayerIds: string[];
  /** Players holding a spot if the main roster is full (max WAITLIST_SLOTS) */
  waitlistPlayerIds?: string[];
  /** Guests (+1s) brought by signed-up players */
  guests?: MatchGuest[];
  creatorId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMatchForm {
  title: string;
  location: MatchLocation | null;
  date: string;
  time: string;
  capacity: number;
  duration: number;
  price: number;
}
