import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type FirestoreError,
  type QueryConstraint,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { MatchData } from '../../../types';
import { PAST_MATCH_LIMIT } from '../../../utils/matches';

function toMatch(docSnap: { id: string; data: () => Record<string, unknown> }): MatchData {
  const data = docSnap.data();
  return {
    ...data,
    id: docSnap.id,
    // Timestamp since the switch; legacy docs still hold a 'YYYY-MM-DD' string
    date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date as string),
  } as MatchData;
}

/**
 * Listens to one membership query and returns its unsubscribe.
 *
 * EXPECTED ERROR, NOT A BUG — do not "fix" by routing it to handleFirestoreError:
 * the instant a user removes themselves from `memberIds` (leaving a match), the rules stop
 * letting them read that document, so this open listener is terminated with `permission-denied`
 * even though the query itself is legitimate. That is the normal way a left match disappears.
 * We resubscribe, and the fresh query simply no longer returns it.
 *
 * Swallowing is bounded by a retry allowance (`retriesLeft`, max 1) that ONLY a server-confirmed
 * snapshot (`!snapshot.metadata.fromCache`) can grant. Cached snapshots must not count: the app
 * uses persistentLocalCache, so a freshly attached listener delivers cached data first, before the
 * server has said anything about access. If that counted, every resubscribe would re-arm itself,
 * the server would deny again, and a genuine fault (bad rules, revoked user, expired token) would
 * loop forever, silently, showing stale cached matches. A cache snapshot proves nothing about
 * current access; a server snapshot does. So: one resubscribe per server-confirmed success, and
 * any other `permission-denied` (never succeeded, or denied again right after the retry) is
 * reported as the real fault it is.
 */
function listen(
  constraints: QueryConstraint[],
  onData: (matches: MatchData[]) => void,
): () => void {
  let unsubscribe = () => {};
  let retriesLeft = 0;
  let stopped = false;

  const attach = () => {
    unsubscribe = onSnapshot(
      query(collection(db, 'matches'), ...constraints),
      (snapshot) => {
        if (!snapshot.metadata.fromCache) retriesLeft = 1;
        onData(snapshot.docs.map(toMatch));
      },
      (error: FirestoreError) => {
        if (error.code === 'permission-denied' && retriesLeft > 0 && !stopped) {
          retriesLeft -= 1;
          attach();
          return;
        }
        handleFirestoreError(error, OperationType.LIST, 'matches');
      },
    );
  };
  attach();

  return () => {
    stopped = true;
    unsubscribe();
  };
}

/** Matches the user belongs to (creator, roster or waitlist): upcoming ascending, recent past descending. */
export function useMyMatches(user: User | null) {
  const [upcoming, setUpcoming] = useState<MatchData[]>([]);
  const [past, setPast] = useState<MatchData[]>([]);
  const [loaded, setLoaded] = useState({ upcoming: false, past: false });

  useEffect(() => {
    if (!user) return;

    const now = Timestamp.now();
    const mine = where('memberIds', 'array-contains', user.uid);

    const stopUpcoming = listen([mine, where('date', '>=', now), orderBy('date', 'asc')], (m) => {
      setUpcoming(m);
      setLoaded((l) => ({ ...l, upcoming: true }));
    });
    const stopPast = listen(
      [mine, where('date', '<', now), orderBy('date', 'desc'), limit(PAST_MATCH_LIMIT)],
      (m) => {
        setPast(m);
        setLoaded((l) => ({ ...l, past: true }));
      },
    );

    return () => {
      stopUpcoming();
      stopPast();
    };
  }, [user]);

  return { upcoming, past, loading: !loaded.upcoming || !loaded.past };
}
