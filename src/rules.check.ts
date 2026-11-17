/** Characterization of firestore.rules — run: npm run check:rules (needs the Firestore emulator) */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setLogLevel, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

setLogLevel('silent'); // assertFails checks the permission-denied code, not the log

const tenIds = Array.from({ length: 10 }, (_, i) => `p${i}`);
const nineIds = tenIds.slice(0, 9);
const elevenIds = [...tenIds, 'over'];
const validPreviewPayload = () => ({
  id: 'm1', title: 'Friday', date: new Date(), capacity: 10, occupiedCount: 1, creatorName: 'H',
});

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
  await setDoc(doc(db, 'matches/over'), { creatorId: 'host', capacity: 10, joinedPlayerIds: elevenIds });
});

const hostDb = env.authenticatedContext('host').firestore();
const playerDb = env.authenticatedContext('player').firestore();
const strangerDb = env.authenticatedContext('stranger').firestore();
const overDb = env.authenticatedContext('over').firestore();
const unauthedDb = env.unauthenticatedContext().firestore();

// Today's behavior — these three are the leaks the spec exists to close.
// They are asserted as SUCCEEDING here on purpose; Task 6 inverts all three to assertFails.
// matches: `allow read: if isSignedIn()` — any signed-in user reads any match by id
await assertSucceeds(getDoc(doc(strangerDb, 'matches/m1')));
// matches: `allow read: if isSignedIn()` — and lists the whole collection
await assertSucceeds(getDocs(collection(strangerDb, 'matches')));
// users: `allow read: if isSignedIn()` — and lists the whole user directory
await assertSucceeds(getDocs(collection(strangerDb, 'users')));

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
