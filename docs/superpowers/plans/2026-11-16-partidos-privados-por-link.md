# Partidos privados por link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PitchReady from a shared directory into an app that is private by membership, where attendees join by link without an account.

**Architecture:** The match splits into a private document for members (`matches/{id}`) and a public preview for the link (`matchPreviews/{id}`), because Firestore has no field-level read security. Attendees become Firebase anonymous users, so rules still verify them and `linkWithCredential` later keeps their history on the same uid. Every mutation that touches a preview field writes both documents in one `writeBatch`, concentrated in a single module. Reads go from global queries to one `memberIds array-contains` query.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Firebase 12 (Auth + Firestore), Tailwind 4. Tests are `*.check.ts` files using `node:assert/strict`, run with `npx tsx` — the pattern `src/utils/teams.check.ts` already establishes. There is no test framework and this plan does not add one. Rules get `@firebase/rules-unit-testing` and the Firestore emulator, which is new.

**Spec:** `docs/superpowers/specs/2026-11-16-partidos-privados-por-link-design.md`

## Global Constraints

- **Pure logic goes in `src/utils/` with a `*.check.ts` beside it.** Anything with a branch, a boundary or an arithmetic decision belongs in a pure function so it can be checked. Hooks and components get no automated test; their verification step is `npm run lint` plus the stated manual check.
- **`npm run lint` is `tsc --noEmit` and must pass at the end of every task.**
- **Weekly limit: 2 active matches created by the signed-in user, in the Monday–Sunday week of the match's own kick-off date, browser-local time.** Active is `status` in `needs_players` or `confirmed`.
- **Past matches limit: 10.**
- **`WAITLIST_SLOTS` stays 4** (`src/utils/matches.ts`).
- **The super admin is `SUPER_ADMIN_EMAIL = 'jrgherrera@gmail.com'`, mirrored by hand in `src/utils/matches.ts` and `firestore.rules`.** Both sides change together or neither.
- **Anonymous users may do everything an attendee does except create a match.** They have no `users/{uid}` document.
- **The preview never contains `roster`, `memberIds`, `joinedPlayerIds`, `waitlistPlayerIds`, `guests` or `teams`.** A task that adds a field to the preview must justify it against this line.
- **`roster` writes are scoped to the caller's own key, by dotted path (`roster.<uid>`), never the whole map.**
- **No Cloud Functions.** The project has no `functions/` and this plan does not add one.

## Review Focus

Five things the spec implies, that no task's happy path exercises, ordered by how likely they are to bite someone. Each one's test is pinned to the task that owns the code.

1. **Two people take the last spot at once.** The joiner is blind — it cannot read the match — so it decides from a preview count that may be stale. The capacity rule rejects the loser. That must land them on the waitlist, not as a silent failure. *(Task 3)*
2. **A match with no `memberIds` disappears for everyone.** Legacy documents, or one the backfill misses, match no query and become invisible to their own creator. *(Task 4)*
3. **An anonymous user whose stored name is gone.** Cleared site data leaves a valid anonymous session with no name. The app must recover the name from the roster of a match they open, not render blank or re-prompt over their own identity. *(Task 7)*
4. **Leaving a match revokes your own read access mid-listener.** The open `onSnapshot` fires a permission error the instant you remove yourself from `memberIds`. That is expected, not a fault, and must not surface as an error. *(Task 6 pins the cause in the rules check — a former member's `get` must fail; Task 5 handles it, verified manually, because a listener needs a React test framework this project does not have)*
5. **A kick-off at the edge of the week.** Sunday 23:00 and Monday 00:30 local fall in different weeks, and the limit is counted in local time against a `date` stored as a UTC instant. *(Task 1)*

---

### Task 1: Pure logic — week windows, membership, preview projection

Everything with a boundary or a branch, extracted first so it is testable before anything depends on it. Nothing in this task is wired up; it ships unused.

**Files:**
- Create: `src/utils/weeks.ts`
- Create: `src/utils/weeks.check.ts`
- Create: `src/utils/matchPreview.ts`
- Create: `src/utils/matchPreview.check.ts`
- Modify: `src/utils/matches.ts` (add `computeMemberIds`, `rosterEntryFor`)
- Create: `src/utils/matches.check.ts`
- Modify: `src/types/index.ts` (add `MatchPreview`, `RosterMember`; add `roster`, `memberIds`, `creatorName` to `MatchData`)

**Interfaces:**
- Consumes: `MatchData`, `UserProfile`, `PlayerRole` from `src/types`.
- Produces:
  - `WEEKLY_MATCH_LIMIT = 2`, `PAST_MATCH_LIMIT = 10` (`weeks.ts`)
  - `weekBounds(date: Date): { start: Date; end: Date }` — Monday 00:00:00.000 local through the next Monday 00:00:00.000 local, `end` exclusive.
  - `isSameLocalWeek(a: Date, b: Date): boolean`
  - `toPreview(match: MatchData): MatchPreview`
  - `computeMemberIds(match: Pick<MatchData, 'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds'>): string[]` — creator first, then joined, then waitlist, de-duplicated.
  - `rosterEntryFor(profile: Pick<UserProfile, 'id' | 'name' | 'role' | 'photoURL'>): RosterMember`
  - `interface RosterMember { name: string; role?: PlayerRole; photoURL?: string }`
  - `interface MatchPreview { id, title, date, duration?, location?, price?, capacity, occupiedCount, status?, creatorName }`

- [ ] **Step 1: Write the failing checks**

`src/utils/weeks.check.ts`:

```ts
/** Self-check for week math — run: npx tsx src/utils/weeks.check.ts */
import assert from 'node:assert/strict';
import { weekBounds, isSameLocalWeek } from './weeks';

// Monday is the first day; the window is half-open.
{
  const { start, end } = weekBounds(new Date('2026-11-18T15:00:00'));
  assert.equal(start.getDay(), 1, 'starts Monday');
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end.getTime() - start.getTime(), 7 * 24 * 60 * 60 * 1000);
}

// Review Focus 5: the two sides of the Sunday/Monday midnight edge are different weeks.
{
  const sundayLate = new Date('2026-11-22T23:00:00');
  const mondayEarly = new Date('2026-11-23T00:30:00');
  assert.equal(isSameLocalWeek(sundayLate, mondayEarly), false, 'week flips at local midnight Monday');
  assert.equal(isSameLocalWeek(new Date('2026-11-16T12:00:00'), sundayLate), true, 'Mon..Sun is one week');
}

// A Monday kick-off at 00:00 belongs to the week it opens, not the one before.
{
  const monday = new Date('2026-11-23T00:00:00');
  assert.equal(weekBounds(monday).start.getTime(), monday.getTime());
}

console.log('weeks.check: ok');
```

`src/utils/matches.check.ts`:

```ts
/** Self-check for membership + roster helpers — run: npx tsx src/utils/matches.check.ts */
import assert from 'node:assert/strict';
import { computeMemberIds, rosterEntryFor } from './matches';

// Creator, roster and waitlist in one array, creator first, no duplicates.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: ['u1', 'u2'], waitlistPlayerIds: ['u3'] }),
  ['u1', 'u2', 'u3'],
);

// A creator who left their own match stays a member.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: ['u2'], waitlistPlayerIds: [] }),
  ['u1', 'u2'],
);

// Missing waitlist is the same as empty.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: [], waitlistPlayerIds: undefined }),
  ['u1'],
);

// Roster entries carry no undefined keys — Firestore rejects undefined values.
{
  const entry = rosterEntryFor({ id: 'u1', name: 'Jorge', role: undefined, photoURL: undefined });
  assert.deepEqual(Object.keys(entry), ['name']);
  assert.equal(entry.name, 'Jorge');
}

console.log('matches.check: ok');
```

`src/utils/matchPreview.check.ts`:

```ts
/** Self-check for the preview projection — run: npx tsx src/utils/matchPreview.check.ts */
import assert from 'node:assert/strict';
import { toPreview } from './matchPreview';
import type { MatchData } from '../types';

const match: MatchData = {
  id: 'm1', title: 'Jueves', date: new Date('2026-11-19T19:00:00'),
  capacity: 10, duration: 60, status: 'needs_players',
  joinedPlayerIds: ['u1', 'u2'], waitlistPlayerIds: ['u3'],
  guests: [{ id: 'g1', addedBy: 'u1', createdAt: 'x' }],
  roster: { u1: { name: 'Jorge' } }, memberIds: ['u1', 'u2', 'u3'],
  creatorId: 'u1', creatorName: 'Jorge',
};

// The private fields must never reach the preview. This is the whole point of the split.
{
  const preview = toPreview(match);
  for (const leaked of ['roster', 'memberIds', 'joinedPlayerIds', 'waitlistPlayerIds', 'guests', 'teams']) {
    assert.ok(!(leaked in preview), `${leaked} must not reach the preview`);
  }
  assert.equal(preview.occupiedCount, 3, 'players plus guests');
  assert.equal(preview.capacity, 10);
  assert.equal(preview.creatorName, 'Jorge');
  assert.equal(preview.title, 'Jueves');
}

// Absent optionals are omitted, not written as undefined.
{
  const bare = toPreview({ ...match, location: undefined, price: undefined, duration: undefined });
  for (const key of Object.keys(bare)) {
    assert.notEqual((bare as Record<string, unknown>)[key], undefined, `${key} is undefined`);
  }
}

console.log('matchPreview.check: ok');
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npx tsx src/utils/weeks.check.ts`
Expected: FAIL — cannot find module `./weeks`.

- [ ] **Step 3: Add the types**

In `src/types/index.ts`: add `RosterMember` and `MatchPreview` as specified in Interfaces, and add to `MatchData`: `roster?: Record<string, RosterMember>`, `memberIds?: string[]`, `creatorName?: string`. All three optional, because legacy documents lack them and Task 4 is what fills them in.

- [ ] **Step 4: Implement the pure functions**

`weekBounds` and `isSameLocalWeek` in `src/utils/weeks.ts`, plus the two limit constants. `toPreview` in `src/utils/matchPreview.ts`. `computeMemberIds` and `rosterEntryFor` in `src/utils/matches.ts`.

`rosterEntryFor` and `toPreview` must omit absent optional keys rather than set them to `undefined` — Firestore rejects `undefined` values, and both results go straight into a write.

- [ ] **Step 5: Run the checks to verify they pass**

Run each of the three check files with `npx tsx`, then `npm run lint`.
Expected: `weeks.check: ok`, `matches.check: ok`, `matchPreview.check: ok`, and lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/weeks.ts src/utils/weeks.check.ts src/utils/matchPreview.ts src/utils/matchPreview.check.ts src/utils/matches.ts src/utils/matches.check.ts src/types/index.ts
git commit -m "Add week, membership and preview helpers"
```

---

### Task 2: Rules test harness, pinning today's behavior

A rule that is too permissive does not throw — it leaks. Before changing any rule, build the harness and pin what the rules do today, including the two leaks the spec names, so Task 6 can prove it closed them.

**Files:**
- Create: `src/rules.check.ts`
- Modify: `firebase.json` (emulator block)
- Modify: `package.json` (devDependency + script)

**Interfaces:**
- Produces: `npm run check:rules` — runs the Firestore emulator and executes `src/rules.check.ts` against `firestore.rules`.

- [ ] **Step 1: Add the harness dependency and script**

```bash
npm install --save-dev @firebase/rules-unit-testing
```

In `firebase.json`, add an `emulators.firestore` block on port 8080 with `"singleProjectMode": true`. In `package.json` scripts, add:
`"check:rules": "firebase emulators:exec --only firestore \"npx tsx src/rules.check.ts\""`

- [ ] **Step 2: Write the characterization check**

`src/rules.check.ts`, using `initializeTestEnvironment` with `projectId: 'pitchready-rules'` and the contents of `firestore.rules`. Seed with `withSecurityRulesDisabled`: users `host` (admin true), `player`, `stranger`; one match `m1` created by `host` with `joinedPlayerIds: ['host']`.

Assert, with `assertSucceeds` / `assertFails`:

```ts
// Today's behavior — these two are the leaks the spec exists to close.
// They are asserted as SUCCEEDING here on purpose; Task 6 flips both.
assertSucceeds(getDoc(doc(strangerDb, 'matches/m1')));        // any signed-in user reads any match
assertSucceeds(getDocs(collection(strangerDb, 'matches')));   // ...and lists the whole collection
assertSucceeds(getDocs(collection(strangerDb, 'users')));     // ...and the whole user directory

// Today's behavior that must survive Task 6 unchanged.
assertSucceeds(updateDoc(doc(playerDb, 'matches/m1'), { joinedPlayerIds: ['host', 'player'], updatedAt: 'x' }));
assertFails(updateDoc(doc(playerDb, 'matches/m1'), { title: 'hijacked' }));
assertFails(deleteDoc(doc(playerDb, 'matches/m1')));
assertSucceeds(deleteDoc(doc(hostDb, 'matches/m1')));
assertFails(setDoc(doc(playerDb, 'users/player'), { admin: true }, { merge: true }));
```

Each assertion gets a one-line comment saying which rule it pins. End with `console.log('rules.check: ok')`.

- [ ] **Step 3: Run it to verify it passes against the current rules**

Run: `npm run check:rules`
Expected: `rules.check: ok`. If an assertion fails here, the harness is wrong, not the rules — this step characterizes what already exists.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json firebase.json src/rules.check.ts
git commit -m "Pin current Firestore rules behavior under the emulator"
```

---

### Task 3: One module for every match write, dual-writing the preview

All mutation moves out of `useMatchActions` into a module that writes the match and its preview in one batch. Rules are untouched, so this ships behind the old permissive rules and nothing breaks while the new fields appear.

**Files:**
- Create: `src/features/matches/api/matchWrites.ts`
- Modify: `src/features/matches/hooks/useMatchActions.ts` (delegate; keep the hook's return shape)
- Create: `src/features/matches/api/matchWrites.check.ts`

**Interfaces:**
- Consumes: `toPreview`, `computeMemberIds`, `rosterEntryFor` (Task 1); `promoteFromWaitlist`, `isMatchFull`, `isWaitlistFull`, `getOccupiedCount` from `src/utils/matches.ts`.
- Produces, all returning `Promise<void>` unless stated:
  - `newMatchId(): string` — `doc(collection(db, 'matches')).id`. Replaces `match_${Date.now()}`, which is a guessable timestamp.
  - `createMatch(form: CreateMatchForm, profile: UserProfile, defaultTitle: string): Promise<string>` — returns the new id.
  - `updateMatchDetails(matchId: string, form: CreateMatchForm, defaultTitle: string)`
  - `deleteMatchEverywhere(matchId: string)` — match and preview.
  - `joinMatch(match: MatchData, member: { id: string } & RosterMember, target: 'roster' | 'waitlist')`
  - `leaveMatch(match: MatchData, uid: string)`
  - `setGuestList(match: MatchData, guests: MatchGuest[])`
  - `refreshOwnRosterEntry(match: MatchData, profile: UserProfile)` — rewrites only `roster.<uid>` when it differs from the profile.

Every function that changes `joinedPlayerIds`, `waitlistPlayerIds`, `guests`, `capacity`, `status`, `date`, `title`, `location`, `price` or `duration` writes `memberIds` and the preview in the same `writeBatch`. `joinMatch` writes its roster entry by dotted path `roster.<uid>`, never the whole map.

- [ ] **Step 1: Write the failing check**

`matchWrites.check.ts` checks the payload builders, not Firestore. Extract the payload construction as exported pure helpers (`buildCreatePayload`, `buildJoinPatch`, `buildLeavePatch`) and assert on them:

```ts
// memberIds and the preview move together with the roster, every time.
{
  const { matchPatch, previewPatch } = buildJoinPatch(match, { id: 'u9', name: 'Ana' }, 'roster');
  assert.ok('memberIds' in matchPatch, 'join updates memberIds');
  assert.ok(matchPatch.memberIds.includes('u9'));
  assert.equal(previewPatch.occupiedCount, 4, 'preview count follows the roster');
  assert.deepEqual(Object.keys(matchPatch).filter((k) => k.startsWith('roster')), ['roster.u9'],
    'writes only its own roster key, by dotted path');
}

// Leaving promotes from the waitlist and drops you from memberIds.
{
  const { matchPatch } = buildLeavePatch(fullMatchWithWaitlist, 'u2');
  assert.ok(!matchPatch.memberIds.includes('u2'));
  assert.ok(matchPatch.joinedPlayerIds.includes('w1'), 'waitlist promoted into the free spot');
  assert.ok(!('roster.u2' in matchPatch), 'the leaver keeps their roster entry');
}

// Review Focus 1: a blind join that loses the capacity race retries as waitlist.
{
  const patch = buildJoinPatch(full, { id: 'u9', name: 'Ana' }, 'waitlist');
  assert.ok(patch.matchPatch.waitlistPlayerIds.includes('u9'));
  assert.ok(!patch.matchPatch.joinedPlayerIds.includes('u9'));
}

// A new id is not derived from the clock.
assert.ok(!/^match_\d+$/.test(newMatchId()), 'ids are not guessable timestamps');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/features/matches/api/matchWrites.check.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Write `matchWrites.ts` with the signatures above. Move the bodies of `createMatch`, `updateMatch`, `deleteMatch`, `joinOrLeaveMatch`, `addGuestPlusOne` and `removeGuestPlusOne` out of `useMatchActions.ts` (lines 26–246), keeping their current behavior — including `promoteFromWaitlist` on leave and on guest removal, the one-guest-per-host rule, and `handleFirestoreError` with the right `OperationType`.

`joinMatch` must catch a capacity rejection and retry once with `target: 'waitlist'` before surfacing an error (Review Focus 1).

- [ ] **Step 4: Rewire the hook**

`useMatchActions` keeps its exact return shape — `App.tsx` destructures thirteen names from it and must not change in this task. It keeps the `useState` for `creatingMatch`, `signUpStatus`, `createForm` and `editingMatchId`, the `signUpStatus` timing, the `window.confirm` on delete and the `alert` messages, and delegates the writes.

- [ ] **Step 5: Verify**

Run: `npx tsx src/features/matches/api/matchWrites.check.ts && npm run lint && npm run check:rules`
Expected: all pass — the rules are unchanged, so Task 2's checks must still be green.

Manual: create a match, join with a second account, add a +1, leave, delete. In the Firestore console confirm `matchPreviews/{id}` tracks `occupiedCount` and that the match carries `memberIds`, `roster` and `creatorName`.

- [ ] **Step 6: Commit**

```bash
git add src/features/matches/api/ src/features/matches/hooks/useMatchActions.ts
git commit -m "Write every match mutation and its preview in one batch"
```

---

### Task 4: Backfill the matches that already exist

New documents are correct from Task 3 on. The ones already in Firestore have no `memberIds`, no `roster`, no `creatorName` and no preview — and Task 6 makes `memberIds` the only way anything is visible, so an un-backfilled match vanishes for its own creator.

**Files:**
- Create: `scripts/backfill-matches.ts`
- Modify: `src/features/matches/hooks/useMyMatches.ts` — not yet; see Step 4.

**Interfaces:**
- Consumes: `computeMemberIds`, `toPreview` (Task 1).
- Produces: a script, run once per environment with `npx tsx scripts/backfill-matches.ts`, idempotent.

- [ ] **Step 1: Write the script**

Using the client SDK and the super admin's credentials — the rules already grant them every match, and this avoids a service-account key. For each document in `matches`: fill `memberIds` via `computeMemberIds`, fill `creatorName` from `users/{creatorId}`, fill `roster` from the `users` documents of `joinedPlayerIds` and `waitlistPlayerIds`, and create `matchPreviews/{id}` via `toPreview`. Skip a document that already has `memberIds` so a second run is a no-op. Print one line per match and a total.

- [ ] **Step 2: Decide and record what happens to the old ids**

The existing ids are `match_<timestamp>` and a document id cannot be changed in place, so those matches keep guessable links. Do not recreate them: it would break anyone's saved link and reset their roster. Add a comment at the top of the script saying so, and that they age out as they become past matches. Any match created from Task 3 on has an unguessable id.

- [ ] **Step 3: Run it**

Run: `npx tsx scripts/backfill-matches.ts`
Expected: every match reports filled, previews exist in the console, and a second run reports every match skipped.

- [ ] **Step 4: Add the invisible-match guard (Review Focus 2)**

In `src/utils/matches.check.ts`, add the case that a match missing `memberIds` is not silently invisible:

```ts
// Review Focus 2: a legacy match must not be invisible to its own creator.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: [], waitlistPlayerIds: [] }),
  ['u1'],
  'the creator is always a member, so a backfilled match always matches their query',
);
```

Run: `npx tsx src/utils/matches.check.ts`
Expected: `matches.check: ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-matches.ts src/utils/matches.check.ts
git commit -m "Backfill memberIds, roster and previews for existing matches"
```

---

### Task 5: Read by membership, and delete the global directory

Swap the two global queries for one membership query, take roster names from the match document, and delete the players directory. The rules are still permissive, so this is a client-only change — and it must land before Task 6, so that when the rules close, the client is already asking the right questions.

**Files:**
- Create: `src/features/matches/hooks/useMyMatches.ts`
- Delete: `src/features/matches/hooks/useMatches.ts`
- Delete: `src/features/players/hooks/usePlayers.ts`
- Delete: `src/features/players/components/PlayersTab.tsx`
- Modify: `src/utils/matches.ts` — `resolveRoster`, `resolveWaitlist`, `resolveJoinedPlayers` read `match.roster`
- Modify: `src/App.tsx`, `src/features/matches/components/DashboardTab.tsx`, `MatchCard.tsx`, `MatchDetailView.tsx`, `TeamsSection.tsx` — drop the `players` prop
- Modify: `src/utils/matches.check.ts`

**Interfaces:**
- Consumes: `PAST_MATCH_LIMIT` (Task 1), `refreshOwnRosterEntry` (Task 3).
- Produces: `useMyMatches(user: User | null): { upcoming: MatchData[]; past: MatchData[]; loading: boolean }`. Two `onSnapshot` listeners: `memberIds array-contains uid` with `date >= now` ascending, and the same with `date < now` descending and `limit(PAST_MATCH_LIMIT)`.
- `resolveRoster(match: MatchData): RosterEntry[]` — the `allPlayers` parameter is gone from all three resolvers. This is a breaking signature change; every caller is listed above.

- [ ] **Step 1: Write the failing check**

In `src/utils/matches.check.ts`:

```ts
// Names come from the match itself — there is no global user list to fall back on.
{
  const entries = resolveRoster({ ...match, roster: { u1: { name: 'Jorge', role: 'Keeper' } },
    joinedPlayerIds: ['u1', 'u2'], guests: [] });
  assert.equal(entries[0].name, 'Jorge');
  assert.equal(entries[0].role, 'Keeper');
  assert.equal(entries[1].name, t('matches.guestPlayer'), 'a member with no roster entry still renders');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/utils/matches.check.ts`
Expected: FAIL — `resolveRoster` still expects two arguments.

- [ ] **Step 3: Implement**

Write `useMyMatches`. Rewrite the three resolvers to read `match.roster`, keeping the existing `t('matches.guestPlayer')` fallback for a member with no entry. Delete the four files listed. Remove the `players` prop from the five components, and remove the "Total players" stat from `DashboardTab` — with no global user list it has no source.

Call `refreshOwnRosterEntry` when a match detail view opens, so a renamed user's own entry catches up (spec: *Nombres que envejecen*).

- [ ] **Step 4: Swallow the expected permission error (Review Focus 4)**

The instant a user removes themselves from `memberIds`, their open listener loses read access and fires `permission-denied`. In `useMyMatches`, treat that specific code on a listener whose query no longer matches as expected: drop the document, do not route it to `handleFirestoreError`. Add a comment saying why, because it looks exactly like a bug worth "fixing" later.

- [ ] **Step 5: Verify**

Run: `npx tsx src/utils/matches.check.ts && npm run lint`
Manual: as a user in two matches, confirm both appear and a third user's match does not. Leave a match and confirm it disappears with no error toast. Firestore will reject the two new queries until their composite indexes exist — follow the index link in the console error and create them.

- [ ] **Step 6: Commit**

```bash
git add -A src/features src/App.tsx src/utils/matches.ts src/utils/matches.check.ts
git commit -m "Query matches by membership and drop the global player directory"
```

---

### Task 6: Close the rules

The breaking change, landing last among the data changes and verified by the harness from Task 2. Flip its three leak assertions and prove the roster write is scoped.

**Files:**
- Modify: `firestore.rules`
- Modify: `src/rules.check.ts`

**Interfaces:**
- Produces: `isRegistered()` in `firestore.rules`.

- [ ] **Step 1: Flip the characterization checks into the target behavior**

In `src/rules.check.ts`, change the three `assertSucceeds` leaks from Task 2 into `assertFails`, and add:

```ts
// Reads are membership-scoped: get by id and list both.
assertFails(getDoc(doc(strangerDb, 'matches/m1')));
assertSucceeds(getDoc(doc(playerDb, 'matches/m1')));            // on joinedPlayerIds
assertSucceeds(getDoc(doc(waitingDb, 'matches/m1')));           // on waitlistPlayerIds
assertFails(getDocs(collection(playerDb, 'matches')));          // unfiltered list
assertSucceeds(getDocs(query(collection(playerDb, 'matches'), where('memberIds', 'array-contains', 'player'))));

// The preview is the public surface: readable by id, never enumerable, never signed in.
assertSucceeds(getDoc(doc(anonDb, 'matchPreviews/m1')));
assertSucceeds(getDoc(doc(unauthedDb, 'matchPreviews/m1')));
assertFails(getDocs(collection(unauthedDb, 'matchPreviews')));

// A member may write only their own roster key.
assertSucceeds(updateDoc(doc(playerDb, 'matches/m1'), { 'roster.player': { name: 'P' }, updatedAt: 'x' }));
assertFails(updateDoc(doc(playerDb, 'matches/m1'), { 'roster.host': { name: 'hijacked' }, updatedAt: 'x' }));
assertFails(updateDoc(doc(playerDb, 'matches/m1'), { roster: {}, updatedAt: 'x' }));

// Anonymous users attend but do not create.
assertFails(setDoc(doc(anonDb, 'matches/new1'), validMatchPayload('anon')));
assertSucceeds(setDoc(doc(verifiedDb, 'matches/new2'), validMatchPayload('verified')));
assertFails(setDoc(doc(unverifiedDb, 'matches/new3'), validMatchPayload('unverified')));

// Capacity cannot be exceeded, but an over-capacity match can still be left.
assertFails(updateDoc(doc(playerDb, 'matches/full'), { joinedPlayerIds: [...tenIds, 'player'], updatedAt: 'x' }));
assertSucceeds(updateDoc(doc(overCapacityDb, 'matches/over'), { joinedPlayerIds: nineOfTheEleven, updatedAt: 'x' }));

// The user directory is closed.
assertSucceeds(getDoc(doc(playerDb, 'users/player')));
assertFails(getDoc(doc(playerDb, 'users/host')));
assertFails(getDocs(collection(playerDb, 'users')));

// Review Focus 4: leaving revokes your own read. This is the cause of the listener error
// Task 5 swallows — pinned here so nobody later "fixes" the rule instead of the handler.
assertSucceeds(updateDoc(doc(playerDb, 'matches/m1'), { joinedPlayerIds: ['host'], memberIds: ['host'], updatedAt: 'x' }));
assertFails(getDoc(doc(playerDb, 'matches/m1')));
```

Seed the new actors (`waiting`, `anon` via `unauthenticatedContext`/`authenticatedContext` with `firebase.sign_in_provider`, `verified` with `email_verified: true`) and the `full` and `over` matches. `validMatchPayload(uid)` is a local helper in this file returning a minimal valid create payload.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run check:rules`
Expected: FAIL — the current rules still allow the reads these now forbid.

- [ ] **Step 3: Rewrite the rules**

In `firestore.rules`:
- Add `isRegistered()`: signed in and `request.auth.token.firebase.sign_in_provider != 'anonymous'`.
- Audit every existing use of `isSignedIn()`. It now includes anonymous users, which it did not before; each site decides explicitly.
- `matches/{matchId}`: `get` and `list` require `request.auth.uid in resource.data.memberIds` or `isSuperAdmin()`. `create` requires `isRegistered()`, `email_verified`, `creatorId == request.auth.uid`, `isValidId(matchId)`. `delete` unchanged.
- `onlyRosterChanged()` gains `roster` and `memberIds` in `hasOnly`, and constrains the roster diff to `[request.auth.uid]`.
- Capacity: allow any change that does not increase `joinedPlayerIds.size() + guests.size()`; require the cap only when it increases.
- `matchPreviews/{matchId}`: `get: if true`, `list: if false`, `create`/`delete` for the match owner, `update` for the owner or any signed-in user changing only `occupiedCount`, `status`, `updatedAt`.
- `users/{userId}`: `get` only own document, `list: if false`, `create`/`update` as today plus `isRegistered()`.
- Remove `isAdmin()`.
- No super-admin branch on `list` — no query exercises it (spec).

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run check:rules`
Expected: `rules.check: ok`.

- [ ] **Step 5: Deploy and verify against the real app**

Run: `firebase deploy --only firestore:rules --project pitchready-soccer`
Manual: as a non-member, open another user's match URL and confirm the detail view is denied while the preview still loads. As a member, confirm joining and leaving still work.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules src/rules.check.ts
git commit -m "Close reads to match members and open creation to registered users"
```

---

### Task 7: Anonymous identity

**Files:**
- Modify: `src/features/auth/api/authActions.ts`
- Modify: `src/features/auth/hooks/useAuth.ts`
- Create: `src/utils/guestName.ts`
- Create: `src/utils/guestName.check.ts`

**Interfaces:**
- Produces:
  - `signInAsGuest(): Promise<User>` — `signInAnonymously(auth)`.
  - `isGuest(user: User): boolean` — true when the only provider is anonymous.
  - `getStoredGuestName(): string`, `storeGuestName(name: string): void` — key `pitchready.guestName`, the same `localStorage` idiom as `SUPER_ADMIN_MODE_KEY`.
  - `useAuth` gains `isGuest: boolean` and returns gate `'ready'` for anonymous users.

- [ ] **Step 1: Write the failing check**

`src/utils/guestName.check.ts`:

`fakeStorage(map)` is a local helper in this file implementing the three `localStorage` methods over a `Map`, since `tsx` runs under Node where `localStorage` does not exist.

```ts
// Review Focus 3: cleared storage must not break the identity; the name is a cache, not the id.
{
  const store = new Map<string, string>();
  globalThis.localStorage = fakeStorage(store);
  assert.equal(getStoredGuestName(), '', 'missing name reads as empty, never throws');
  storeGuestName('Ana');
  assert.equal(getStoredGuestName(), 'Ana');
  store.clear();
  assert.equal(getStoredGuestName(), '', 'cleared storage degrades, it does not fail');
}

// A blank or whitespace name is not storable — joining requires a real one.
storeGuestName('   ');
assert.equal(getStoredGuestName(), '', 'whitespace is not a name');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/utils/guestName.check.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `guestName.ts` with reads wrapped so a throwing or absent `localStorage` returns `''`. Add `signInAsGuest` and `isGuest` to `authActions.ts`.

In `useAuth`, when `onAuthStateChanged` delivers an anonymous user: skip the `users/{uid}` snapshot entirely, skip `needsEmailVerification`, skip onboarding, and set gate `'ready'` with a locally synthesized profile — `{ id: uid, name: getStoredGuestName(), email: '', photoURL: getAvatarUrl(uid) }`. Do not write a `users` document.

Recover a missing name from the roster of the match being opened (Review Focus 3): when a guest's synthesized name is empty and they open a match whose `roster[uid]` has one, use it and store it.

- [ ] **Step 4: Verify**

Run: `npx tsx src/utils/guestName.check.ts && npm run lint`
Manual: in a private window, trigger `signInAsGuest`, reload, and confirm the same uid returns without a prompt. Clear site data and confirm the app still loads rather than hanging on a gate.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/utils/guestName.ts src/utils/guestName.check.ts
git commit -m "Let attendees sign in as anonymous guests"
```

---

### Task 8: The invitation screen

**Files:**
- Create: `src/features/matches/components/MatchInviteScreen.tsx`
- Create: `src/features/matches/hooks/useMatchPreview.ts`
- Modify: `src/App.tsx` (route `/match/<id>` for a non-member)
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`

**Interfaces:**
- Consumes: `signInAsGuest`, `storeGuestName` (Task 7); `joinMatch` (Task 3); `MatchPreview` (Task 1).
- Produces: `useMatchPreview(matchId: string | null): { preview: MatchPreview | null; loading: boolean; notFound: boolean }` — a single `onSnapshot` on `matchPreviews/{id}`, no auth required.

- [ ] **Step 1: Build the screen**

Shows title, date and time, location, `occupiedCount`/`capacity`, host name, a name field and one button. **No roster** — that is the spec's anti-objective made visible.

When the preview is full, the button offers the waitlist instead of refusing; when the waitlist is also full, it says so. On submit: `storeGuestName`, `signInAsGuest` if not signed in, then `joinMatch` with `target` chosen from `occupiedCount` — `joinMatch` already retries as waitlist if the count was stale.

A signed-in user who is not a member sees the same screen with their name prefilled and no name field.

- [ ] **Step 2: Route it**

In `App.tsx`, `activeMatchId` is set from `matchIdFromPath` before auth resolves. When there is an `activeMatchId` and it is not among the user's matches, render `MatchInviteScreen` instead of the login gate — this is the whole point: the link must not demand an account. `notFound` renders a plain "this match no longer exists".

- [ ] **Step 3: Add the strings**

Add a `matches.invite.*` group to `en.ts` and the matching Spanish to `es.ts`. `Messages` is typed from `en`, so a missing Spanish key fails `npm run lint`.

- [ ] **Step 4: Verify**

Run: `npm run lint`
Manual: open a match link in a private window with no session. Confirm the preview renders without sign-in, no player names appear anywhere in it or in the network response, joining by name works, and the roster appears only afterwards. Then open a link for a full match and confirm it offers the waitlist. Finally, as that same guest, add a +1 and remove it — the spec grants anonymous attendees everything but creation, and nothing in the rules or the client should be stopping them.

- [ ] **Step 5: Commit**

```bash
git add src/features/matches src/App.tsx src/i18n
git commit -m "Let a link recipient join by name without an account"
```

---

### Task 9: Upgrade a guest to a real account

**Files:**
- Modify: `src/features/auth/api/authActions.ts`
- Create: `src/features/auth/components/UpgradeAccountScreen.tsx`
- Modify: `src/features/settings/components/SettingsTab.tsx`
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`

**Interfaces:**
- Produces:
  - `upgradeWithGoogle(): Promise<User | null>` — `linkWithPopup`, falling back to `linkWithRedirect` on the same `POPUP_FALLBACK_CODES` that `signInWithGoogle` already handles.
  - `upgradeWithPassword(email: string, password: string): Promise<User>` — `linkWithCredential` with `EmailAuthProvider.credential`, then `sendEmailVerification`.

- [ ] **Step 1: Implement the two upgrade paths**

Both operate on `auth.currentUser`, preserving the uid — that is the point, and the spec's anti-objective. Handle `auth/credential-already-in-use` with a message sending them to sign in with that account; do not merge.

**Magic link is deliberately not an upgrade path.** `completeMagicLinkIfPresent` runs on cold load and `signInWithEmailLink` would replace the anonymous user, discarding their history silently. Leave that function untouched for fresh sign-ups and add a comment in `authActions.ts` saying why it must not be reused here.

- [ ] **Step 2: Build the screen**

Two buttons — Google and email with password — and nothing else. After `upgradeWithGoogle` the user is verified and lands in onboarding. After `upgradeWithPassword` they hit the existing `verify-email` gate before they can create a match, because `allow create` requires a verified email. Say so on the screen rather than letting it surprise them.

Reachable from Settings while `isGuest`.

- [ ] **Step 3: Verify**

Run: `npm run lint`
Manual: as a guest in two matches, upgrade with Google. Confirm the uid is unchanged in the Auth console and both matches are still listed. Repeat with email and password and confirm the verification gate appears and the matches survive it.

- [ ] **Step 4: Commit**

```bash
git add src/features/auth src/features/settings src/i18n
git commit -m "Upgrade a guest account without losing their matches"
```

---

### Task 10: Open creation, capped at two active per week

**Files:**
- Create: `src/features/matches/api/weeklyLimit.ts`
- Create: `src/features/matches/api/weeklyLimit.check.ts`
- Modify: `src/features/matches/components/CreateMatchModal.tsx`
- Modify: `src/features/matches/hooks/useMatchActions.ts`
- Modify: `src/types/index.ts` (remove `UserProfile.admin`)
- Modify: `src/utils/matches.ts`, `src/features/settings/components/SettingsTab.tsx`, `src/i18n/messages/*`

**Interfaces:**
- Consumes: `weekBounds`, `WEEKLY_MATCH_LIMIT` (Task 1).
- Produces:
  - `countCreatedActive(matches: MatchData[], uid: string): number` — the pure predicate: created by `uid` and status active. Exported so it is checkable without Firestore.
  - `countMyActiveMatchesInWeek(uid: string, kickoff: Date): Promise<number>` — the thin query around it: `creatorId == uid`, `date` within `weekBounds(kickoff)`, status active. Deliberately not derived from `useMyMatches`, whose past list is capped at 10 and would undercount.
  - `isWeekAtLimit(count: number): boolean`

- [ ] **Step 1: Write the failing check**

```ts
// Only matches I created count. Joining friends' games never blocks hosting my own.
{
  const mine = [created('u1', 'needs_players'), created('u1', 'confirmed'), joined('u1')];
  assert.equal(countCreatedActive(mine, 'u1'), 2);
}

// Cancelled and deleted free the slot — it is a question about now, not a tally.
assert.equal(countCreatedActive([created('u1', 'cancelled'), created('u1', 'needs_players')], 'u1'), 1);
assert.equal(isWeekAtLimit(1), false);
assert.equal(isWeekAtLimit(2), true);
```

Extract the counting predicate as a pure `countCreatedActive(matches, uid)` so it is checkable without Firestore; `countMyActiveMatchesInWeek` is the thin query around it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/features/matches/api/weeklyLimit.check.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement and wire the warning to the date field**

The limit depends on the chosen date, so the check runs when the date changes, and the message appears on the date field — not as a dead create button, which could not explain itself. Keep the button enabled until a date is chosen.

- [ ] **Step 4: Remove the admin flag**

Delete `admin` from `UserProfile`, the `profile?.admin` guard in `createMatch`, the `Boolean(profile.admin)` branch in `removeGuestPlusOne` (the creator check already covers the host), the `canHostMatches` prop threading, and the `common.admin` string if nothing else uses it. `SUPER_ADMIN_EMAIL`, `isSuperAdmin` and `superAdminMode` all stay — your privileges come from those, not from the flag.

- [ ] **Step 5: Verify**

Run: `npx tsx src/features/matches/api/weeklyLimit.check.ts && npm run lint && npm run check:rules`
Manual: as a plain registered user with no `admin` field, create a match. Create a second in the same week. Attempt a third and confirm the date field explains the limit. Delete one and confirm the slot frees. Pick a date next week and confirm it is allowed.

- [ ] **Step 6: Commit**

```bash
git add src/features/matches src/types/index.ts src/utils/matches.ts src/features/settings src/i18n
git commit -m "Open match creation to registered users, two active per week"
```

---

### Task 11: One screen, no tabs

**Files:**
- Create: `src/features/matches/components/MyMatchesScreen.tsx`
- Delete: `src/features/matches/components/MatchesTab.tsx`
- Delete: `src/features/matches/components/DashboardTab.tsx`
- Modify: `src/components/layout/AppShell.tsx` (delete `BottomNav`)
- Modify: `src/App.tsx`
- Modify: `src/types/index.ts` (delete `AppTab`)
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`

- [ ] **Step 1: Build the single screen**

A create button at the top for registered users, then an upcoming section, then a past section — visually recessed and capped at `PAST_MATCH_LIMIT`. Reuse `MatchCard` for upcoming and `MatchListCard` for past rather than writing a third card.

- [ ] **Step 2: Delete the tab machinery**

Remove `BottomNav` from `AppShell.tsx`, the `AppTab` type, `activeTab` and `changeTab` from `App.tsx`, and the `nav.*` strings. Settings opens from the header avatar, which `AppHeader` already supports via `onOpenSettings`, and needs a back affordance since the bottom bar is gone.

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsx src/utils/weeks.check.ts && npx tsx src/utils/matches.check.ts && npx tsx src/utils/matchPreview.check.ts && npx tsx src/utils/guestName.check.ts && npm run check:rules`
Manual: at 375px wide, confirm the single screen scrolls with both sections, Settings opens from the avatar and returns, and a guest sees no create button. Confirm no dead `nav.*` key remains.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "Collapse the app to a single matches screen"
```
