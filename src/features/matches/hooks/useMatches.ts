import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { MatchData } from '../../../types';

export function useMatches(user: User | null) {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const matchesQuery = query(collection(db, 'matches'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const fetchedMatches: MatchData[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedMatches.push({
            ...data,
            id: docSnap.id,
            // Timestamp since the switch; legacy docs still hold a 'YYYY-MM-DD' string
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
          } as MatchData);
        });
        setMatches(fetchedMatches);
        setMatchesLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'matches');
      },
    );

    return () => unsubscribe();
  }, [user]);

  return { matches, matchesLoading };
}
