import type { MatchData, MatchPreview } from '../types';
import { getOccupiedCount } from './matches';

/**
 * Public projection of a match. Built field by field, never by spreading, so a new
 * private field on MatchData cannot leak. Absent optionals are omitted (Firestore rejects undefined).
 */
export function toPreview(match: MatchData): MatchPreview {
  return {
    id: match.id,
    title: match.title,
    date: match.date,
    capacity: match.capacity,
    occupiedCount: getOccupiedCount(match),
    creatorName: match.creatorName ?? '',
    ...(match.duration !== undefined && { duration: match.duration }),
    ...(match.location !== undefined && { location: match.location }),
    ...(match.price !== undefined && { price: match.price }),
    ...(match.status !== undefined && { status: match.status }),
  };
}
