/** Characterization of firestore.rules — run: npm run check:rules (needs the Firestore emulator) */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setLogLevel, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

setLogLevel('silent'); // assertFails checks the permission-denied code, not the log

const tenIds = Array.from({ length: 10 }, (_, i) => `p${i}`);
const nineIds = tenIds.slice(0, 9);
const elevenIds = [...tenIds, 'over'];
const validPreviewPayload = () => ({
  id: 'm1', title: 'Friday', date: new Date(), capacity: 10, occupiedCount: 1, creatorName: 'H',
});
/** The minimum a create must carry: the rules only read creatorId, the rest is what the app sends. */
const validMatchPayload = (uid: string) => ({
  creatorId: uid, title: 'New', date: new Date(), capacity: 10,
  joinedPlayerIds: [uid], memberIds: [uid], roster: { [uid]: { name: 'N' } },
});
// The weekly cap's window (countMyActiveMatchesInWeek): a creatorId query with a date range.
const weekStart = new Date('2026-11-16T00:00:00Z');
const weekEnd = new Date('2026-11-23T00:00:00Z');

const env = await initializeTestEnvironment({
  projectId: 'pitchready-rules',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/host'), { admin: true });
  await setDoc(doc(db, 'users/player'), { admin: false });
  await setDoc(doc(db, 'users/stranger'), { admin: false });
  await setDoc(doc(db, 'users/over'), { admin: false });
  await setDoc(doc(db, 'matches/m1'), {
    creatorId: 'host', title: 'Friday', capacity: 10, joinedPlayerIds: ['host'], memberIds: ['host'], roster: { host: { name: 'H' } },
  });
  await setDoc(doc(db, 'matches/full'), { creatorId: 'host', capacity: 10, joinedPlayerIds: tenIds });
  await setDoc(doc(db, 'matches/legacy'), { creatorId: 'host', joinedPlayerIds: nineIds });
  await setDoc(doc(db, 'matches/guestfull'), { creatorId: 'host', capacity: 10, joinedPlayerIds: nineIds, guests: [{ name: 'g', addedBy: 'host' }] });
  await setDoc(doc(db, 'matches/guestok'), { creatorId: 'host', capacity: 10, joinedPlayerIds: nineIds.slice(0, 8), guests: [{ name: 'g', addedBy: 'host' }] });
  await setDoc(doc(db, 'matches/joinme'), { creatorId: 'host', capacity: 10, joinedPlayerIds: ['host'], memberIds: ['host'], roster: { host: { name: 'H' } } });
  await setDoc(doc(db, 'matches/over'), { creatorId: 'host', capacity: 10, joinedPlayerIds: elevenIds });
  // Read fixture, kept separate from m1: m1's memberIds are pinned by the write assertions below,
  // which would have to change in step with every extra member seeded into it.
  await setDoc(doc(db, 'matches/private'), {
    creatorId: 'host', capacity: 10, joinedPlayerIds: ['host', 'player'], waitlistPlayerIds: ['waiting'],
    memberIds: ['host', 'player', 'waiting'], roster: { host: { name: 'H' }, player: { name: 'P' } },
  });
  // Dated, so it is the only match the weekly cap's range query can return.
  await setDoc(doc(db, 'matches/capweek'), {
    creatorId: 'host', capacity: 10, date: new Date('2026-11-18T19:00:00Z'),
    joinedPlayerIds: ['host'], memberIds: ['host'],
  });
});

// email_verified rides on every actor that creates a match; the mock token omits it otherwise.
const hostDb = env.authenticatedContext('host', { email_verified: true }).firestore();
const playerDb = env.authenticatedContext('player').firestore();
const strangerDb = env.authenticatedContext('stranger').firestore();
const overDb = env.authenticatedContext('over').firestore();
const waitingDb = env.authenticatedContext('waiting').firestore();
const unauthedDb = env.unauthenticatedContext().firestore();
// An anonymous attendee: joins and reads previews by link, never creates.
const anonDb = env.authenticatedContext('anon', {
  firebase: { sign_in_provider: 'anonymous', identities: {} },
}).firestore();
const verifiedDb = env.authenticatedContext('verified', { email_verified: true }).firestore();
const unverifiedDb = env.authenticatedContext('unverified', { email_verified: false }).firestore();
// Mirrored in firestore.rules (isSuperAdmin) and src/utils/matches.ts (SUPER_ADMIN_EMAIL).
const superDb = env.authenticatedContext('super', {
  email: 'jrgherrera@gmail.com', email_verified: true,
}).firestore();
// A verified account that is simply someone else: the super-admin compare must not reach it.
const outsiderDb = env.authenticatedContext('outsider', {
  email: 'someone.else@gmail.com', email_verified: true,
}).firestore();

// The three leaks the spec exists to close, inverted by Task 6. They were asserted as SUCCEEDING
// until the read rules closed; a regression here reopens the whole collection to every signed-in user.
// matches get: membership, not sign-in — a stranger cannot read a match by id
await assertFails(getDoc(doc(strangerDb, 'matches/m1')));
// matches list: nor enumerate the collection
await assertFails(getDocs(collection(strangerDb, 'matches')));
// users list: nor enumerate the user directory
await assertFails(getDocs(collection(strangerDb, 'users')));

// Today's behavior that must survive Task 6 unchanged.
// matches update: `onlyRosterChanged()` — a non-owner may change roster fields (also proves m1 is seeded)
await assertSucceeds(updateDoc(doc(playerDb, 'matches/m1'), { joinedPlayerIds: ['host', 'player'], updatedAt: 'x' }));
// matches update: non-owner changing a non-roster field fails both isMatchOwner() and onlyRosterChanged()
await assertFails(updateDoc(doc(playerDb, 'matches/m1'), { title: 'hijacked' }));
// Preview writes: the owner manages it, any signed-in user may move the counters.
await assertSucceeds(setDoc(doc(hostDb, 'matchPreviews/m1'), validPreviewPayload()));
await assertFails(updateDoc(doc(playerDb, 'matchPreviews/m1'), { title: 'hijacked' }));
await assertFails(updateDoc(doc(playerDb, 'matchPreviews/m1'), { status: 'cancelled' }));
await assertFails(updateDoc(doc(playerDb, 'matchPreviews/m1'), { occupiedCount: 1, updatedAt: 'x' }));
await assertFails(setDoc(doc(playerDb, 'matchPreviews/m1'), validPreviewPayload()));
// Create is owner-only and needs a match (these ids have no preview yet, so these are creates)
await assertFails(setDoc(doc(playerDb, 'matchPreviews/full'), validPreviewPayload()));
await assertFails(setDoc(doc(playerDb, 'matchPreviews/nomatch'), validPreviewPayload()));
await assertSucceeds(getDoc(doc(unauthedDb, 'matchPreviews/m1')));
await assertFails(getDocs(collection(unauthedDb, 'matchPreviews')));
await assertFails(getDocs(collection(playerDb, 'matchPreviews')));

// A join may now carry memberIds and its own roster key, which the old whitelist refused.
await assertSucceeds(updateDoc(doc(playerDb, 'matches/m1'), {
  joinedPlayerIds: ['host', 'player'], memberIds: ['host', 'player'],
  'roster.player': { name: 'P' }, updatedAt: 'x',
}));
// Counter is pinned to the match: it must equal joined + guests as the batch leaves them.
await assertSucceeds(updateDoc(doc(playerDb, 'matchPreviews/m1'), { occupiedCount: 2 }));
await assertFails(updateDoc(doc(playerDb, 'matchPreviews/m1'), { occupiedCount: 9 }));
// memberIds is the read gate: a non-owner may only add or remove themselves.
await assertFails(updateDoc(doc(strangerDb, 'matches/m1'), { memberIds: ['stranger'], updatedAt: 'x' }));
// Self-admission with the arrays untouched: symdiff is {caller} but memberIds is not derived from them.
await assertFails(updateDoc(doc(strangerDb, 'matches/m1'), { memberIds: ['host', 'player', 'stranger'], updatedAt: 'x' }));
// Roster wipe with a matching memberIds: derived holds, but player is removed by someone else (symdiff).
await assertFails(updateDoc(doc(strangerDb, 'matches/m1'), { joinedPlayerIds: ['stranger'], memberIds: ['host', 'stranger'], updatedAt: 'x' }));
// A legitimate join carrying the array and the matching memberIds.
await assertSucceeds(updateDoc(doc(strangerDb, 'matches/joinme'), { joinedPlayerIds: ['host', 'stranger'], memberIds: ['host', 'stranger'], 'roster.stranger': { name: 'S' }, updatedAt: 'x' }));
await assertFails(updateDoc(doc(strangerDb, 'matches/m1'), { memberIds: ['host', 'player', 'stranger', 'other'], updatedAt: 'x' }));
await assertFails(updateDoc(doc(playerDb, 'matches/m1'), { 'roster.host': { name: 'hijacked' }, updatedAt: 'x' }));
await assertFails(updateDoc(doc(playerDb, 'matches/m1'), { roster: {}, updatedAt: 'x' }));

// Capacity cannot be exceeded, but an over-capacity match can still be left.
await assertFails(updateDoc(doc(playerDb, 'matches/full'), { joinedPlayerIds: [...tenIds, 'player'], updatedAt: 'x' }));
await assertSucceeds(updateDoc(doc(overDb, 'matches/over'), { joinedPlayerIds: tenIds, updatedAt: 'x' }));

await assertFails(updateDoc(doc(playerDb, 'matches/full'), { capacity: 50, joinedPlayerIds: [...tenIds, 'player'], updatedAt: 'x' }));
// Guests count toward capacity.
await assertFails(updateDoc(doc(playerDb, 'matches/guestfull'), { joinedPlayerIds: [...nineIds, 'player'], updatedAt: 'x' }));
await assertSucceeds(updateDoc(doc(playerDb, 'matches/guestok'), { joinedPlayerIds: [...nineIds.slice(0, 8), 'player'], updatedAt: 'x' }));
// No capacity field: counts as the default 10 — a join up to 10 works, past 10 is denied.
await assertSucceeds(updateDoc(doc(playerDb, 'matches/legacy'), { joinedPlayerIds: [...nineIds, 'player'], updatedAt: 'x' }));
await assertFails(updateDoc(doc(overDb, 'matches/legacy'), { joinedPlayerIds: [...nineIds, 'player', 'over'], updatedAt: 'x' }));

// --- Reads are scoped to membership ----------------------------------------------------------
// get: being in memberIds, by any route in — creator, roster or waitlist.
await assertSucceeds(getDoc(doc(hostDb, 'matches/private')));
await assertSucceeds(getDoc(doc(playerDb, 'matches/private')));   // on joinedPlayerIds
await assertSucceeds(getDoc(doc(waitingDb, 'matches/private')));  // on waitlistPlayerIds
await assertFails(getDoc(doc(strangerDb, 'matches/private')));
await assertFails(getDoc(doc(anonDb, 'matches/private')));
await assertFails(getDoc(doc(unauthedDb, 'matches/private')));
// A document with no memberIds at all reads as "nobody is a member", not as an open door — and
// stays reachable by the super admin, the only thing that can still read a legacy document.
await assertFails(getDoc(doc(strangerDb, 'matches/full')));
await assertSucceeds(getDoc(doc(superDb, 'matches/full')));
// The super-admin compare is an exact string: a different verified email is not a way in. Pinned
// so a future loosening to a domain match (or a dropped email_verified) fails here.
await assertFails(getDoc(doc(outsiderDb, 'matches/full')));

// A listing is allowed only when its own filters prove the rule — the documents it would return
// are never consulted — so an unfiltered listing is denied and the membership query is not.
await assertFails(getDocs(collection(playerDb, 'matches')));
await assertFails(getDocs(collection(unauthedDb, 'matches')));
await assertSucceeds(getDocs(query(collection(playerDb, 'matches'), where('memberIds', 'array-contains', 'player'))));
// Substituting someone else's uid is the one query that would hand a stranger a target's whole
// history: the filter proves membership for 'host', which is not the caller.
await assertFails(getDocs(query(collection(playerDb, 'matches'), where('memberIds', 'array-contains', 'host'))));
// The two listeners useMyMatches actually attaches, date range, ordering and cap included: the
// extra constraints must not cost the membership filter its proof.
await assertSucceeds(getDocs(query(collection(playerDb, 'matches'),
  where('memberIds', 'array-contains', 'player'), where('date', '>=', weekStart), orderBy('date', 'asc'))));
await assertSucceeds(getDocs(query(collection(playerDb, 'matches'),
  where('memberIds', 'array-contains', 'player'), where('date', '<', weekStart), orderBy('date', 'desc'), limit(20))));
// The weekly cap (countMyActiveMatchesInWeek) filters on creatorId and a date range and never
// mentions memberIds, so membership is unprovable and this query needs the creator branch on
// `list`. It was denied without it even though the one match it returns holds host in memberIds.
await assertSucceeds(getDocs(query(
  collection(hostDb, 'matches'),
  where('creatorId', '==', 'host'), where('date', '>=', weekStart), where('date', '<', weekEnd),
)));
// That branch is not a way into someone else's matches: it compares creatorId to the caller.
await assertFails(getDocs(query(
  collection(playerDb, 'matches'),
  where('creatorId', '==', 'host'), where('date', '>=', weekStart), where('date', '<', weekEnd),
)));
// The super admin reads one named document, but does NOT enumerate: that would make any browser
// session holding an ID token for that email a credential for the whole collection, where console
// enumeration is gated by Google IAM. A denied listing is a query-level error, not an empty result.
await assertFails(getDocs(collection(superDb, 'matches')));

// The preview stays the public surface, for anonymous and signed-out readers alike.
await assertSucceeds(getDoc(doc(anonDb, 'matchPreviews/m1')));

// The user directory is closed: own document only.
await assertSucceeds(getDoc(doc(playerDb, 'users/player')));
await assertFails(getDoc(doc(playerDb, 'users/host')));
await assertFails(getDocs(collection(playerDb, 'users')));
// Anonymous attendees have no users/{uid} doc — useAuth synthesizes one locally and says so.
await assertFails(setDoc(doc(anonDb, 'users/anon'), { name: 'A' }));
// First-run onboarding, the write isRegistered() newly gates: 'verified' has no users doc yet,
// so this is a create and not the update the seeded actors exercise below.
await assertSucceeds(setDoc(doc(verifiedDb, 'users/verified'), { id: 'verified', name: 'V' }));
await assertFails(setDoc(doc(verifiedDb, 'users/other'), { id: 'other', name: 'X' }));

// Creation is open to any verified, registered user — no admin flag, which no longer exists.
await assertSucceeds(setDoc(doc(verifiedDb, 'matches/new2'), validMatchPayload('verified')));
await assertFails(setDoc(doc(anonDb, 'matches/new1'), validMatchPayload('anon')));
await assertFails(setDoc(doc(unverifiedDb, 'matches/new3'), validMatchPayload('unverified')));
await assertFails(setDoc(doc(verifiedDb, 'matches/new4'), validMatchPayload('host')));
// Anonymous users attend but do not create: joining is still open to them.
await assertSucceeds(updateDoc(doc(anonDb, 'matches/joinme'), {
  joinedPlayerIds: ['host', 'stranger', 'anon'], memberIds: ['host', 'stranger', 'anon'],
  'roster.anon': { name: 'A' }, updatedAt: 'x',
}));
// And having joined, an anonymous attendee reads the match: the guest path this feature exists for.
// What is unique to this actor is the anonymous provider, not an email-less token — every mock
// token here lacks the email claim, so isSuperAdmin() errors for all of them, harmlessly: an
// erroring operand loses to a true one (measured; see the note on `allow get` in firestore.rules).
await assertSucceeds(getDoc(doc(anonDb, 'matches/joinme')));
await assertSucceeds(getDocs(query(collection(anonDb, 'matches'), where('memberIds', 'array-contains', 'anon'))));

// Leaving revokes your own read. This is the cause of the permission-denied that useMyMatches
// swallows on purpose — pinned here so nobody later "fixes" the rule instead of the handler.
await assertSucceeds(updateDoc(doc(playerDb, 'matches/private'), {
  joinedPlayerIds: ['host'], memberIds: ['host', 'waiting'], updatedAt: 'x',
}));
await assertFails(getDoc(doc(playerDb, 'matches/private')));

// matches delete: `allow delete: if isMatchOwner()` — non-creator denied
await assertFails(deleteDoc(doc(playerDb, 'matches/m1')));
// matches delete: isMatchOwner() — creatorId == auth.uid
// NOTE: m1 no longer exists past this line. Anything appended below must seed its own fixtures.
await assertSucceeds(deleteDoc(doc(hostDb, 'matches/m1')));
// Batched create and delete, the way matchWrites.ts does them (the match and its preview land together).
const createBatch = (db: typeof hostDb) => {
  const b = writeBatch(db);
  b.set(doc(db, 'matches/m2'), { creatorId: 'host', title: 'New', capacity: 10, joinedPlayerIds: ['host'] });
  b.set(doc(db, 'matchPreviews/m2'), { ...validPreviewPayload(), id: 'm2' });
  return b.commit();
};
await assertSucceeds(createBatch(hostDb));
const deleteBatch = (db: typeof hostDb) => {
  const b = writeBatch(db);
  b.delete(doc(db, 'matches/m2'));
  b.delete(doc(db, 'matchPreviews/m2'));
  return b.commit();
};
await assertFails(deleteDoc(doc(playerDb, 'matchPreviews/m2')));
await assertFails(deleteBatch(playerDb));
await assertSucceeds(deleteBatch(hostDb));
// users update: own-doc update allowed (positive control: proves users/player is seeded, so the next denial is an update)
await assertSucceeds(setDoc(doc(playerDb, 'users/player'), { displayName: 'x' }, { merge: true }));
// users update: admin flag must stay unchanged (false -> true denied on an existing own doc)
await assertFails(setDoc(doc(playerDb, 'users/player'), { admin: true }, { merge: true }));

await env.cleanup();
console.log('rules.check: ok');
