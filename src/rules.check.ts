/** Characterization of firestore.rules — run: npm run check:rules (needs the Firestore emulator) */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setLogLevel, setDoc, updateDoc } from 'firebase/firestore';

setLogLevel('silent'); // assertFails checks the permission-denied code, not the log

const env = await initializeTestEnvironment({
  projectId: 'pitchready-rules',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/host'), { admin: true });
  await setDoc(doc(db, 'users/player'), { admin: false });
  await setDoc(doc(db, 'users/stranger'), { admin: false });
  await setDoc(doc(db, 'matches/m1'), { creatorId: 'host', title: 'Friday', joinedPlayerIds: ['host'] });
});

const hostDb = env.authenticatedContext('host').firestore();
const playerDb = env.authenticatedContext('player').firestore();
const strangerDb = env.authenticatedContext('stranger').firestore();

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
// matches delete: `allow delete: if isMatchOwner()` — non-creator denied
await assertFails(deleteDoc(doc(playerDb, 'matches/m1')));
// matches delete: isMatchOwner() — creatorId == auth.uid
// NOTE: m1 no longer exists past this line. Anything appended below must seed its own fixtures.
await assertSucceeds(deleteDoc(doc(hostDb, 'matches/m1')));
// users update: own-doc update allowed (positive control: proves users/player is seeded, so the next denial is an update)
await assertSucceeds(setDoc(doc(playerDb, 'users/player'), { displayName: 'x' }, { merge: true }));
// users update: admin flag must stay unchanged (false -> true denied on an existing own doc)
await assertFails(setDoc(doc(playerDb, 'users/player'), { admin: true }, { merge: true }));

await env.cleanup();
console.log('rules.check: ok');
