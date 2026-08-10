import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { UserProfile } from '../../../types';

export function usePlayers(user: User | null) {
  const [allPlayers, setAllPlayers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!user) {
      setAllPlayers([]);
      return;
    }

    const usersQuery = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const fetchedPlayers: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          fetchedPlayers.push(docSnap.data() as UserProfile);
        });
        setAllPlayers(fetchedPlayers);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      },
    );

    return () => unsubscribe();
  }, [user]);

  return { allPlayers };
}
