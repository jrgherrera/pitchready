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
 * It is swallowed only when this listener has already delivered a snapshot (so the query was
 * allowed a moment ago). A `permission-denied` on a listener that never succeeded, or that fails
 * again straight after resubscribing, is a real rules/query fault and is reported.
 */
function listen(
  constraints: QueryConstraint[],
  onData: (matches: MatchData[]) => void,
): () => void {
  let unsubscribe = () => {};
  let hadSnapshot = false;
  let stopped = false;

  const attach = () => {
    unsubscribe = onSnapshot(
      query(collection(db, 'matches'), ...constraints),
      (snapshot) => {
        hadSnapshot = true;
        onData(snapshot.docs.map(toMatch));
      },
      (error: FirestoreError) => {
        if (error.code === 'permission-denied' && hadSnapshot && !stopped) {
          hadSnapshot = false; // a second denial before any snapshot is reported below
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
