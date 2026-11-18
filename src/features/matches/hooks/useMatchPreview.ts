import { useEffect, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { MatchPreview } from '../../../types';

/**
 * One listener on `matchPreviews/{id}`, world-readable by design: no auth needed, so a link opened
 * only to check the kick-off time creates no account. A read error is reported as `notFound` too;
 * from the visitor's side both mean "this link does not lead to a match".
 */
export function useMatchPreview(matchId: string | null) {
  const [state, setState] = useState<{
    id: string | null;
    preview: MatchPreview | null;
    notFound: boolean;
  }>({ id: null, preview: null, notFound: false });

  useEffect(() => {
    if (!matchId) return;
    return onSnapshot(
      doc(db, 'matchPreviews', matchId),
      (snap) => {
        const data = snap.data();
        setState({
          id: matchId,
          notFound: !data,
          preview: data
            ? ({
                ...data,
                id: snap.id,
                date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
              } as MatchPreview)
            : null,
        });
      },
      (error) => {
        console.error('matchPreviews read failed', error);
        setState({ id: matchId, preview: null, notFound: true });
      },
    );
  }, [matchId]);

  // A different id than the one last answered means the new listener has not reported yet
  const loading = !!matchId && state.id !== matchId;
  return {
    preview: loading ? null : state.preview,
    loading,
    notFound: !loading && state.notFound,
  };
}
