import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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
          fetchedMatches.push({ id: docSnap.id, ...docSnap.data() } as MatchData);
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
