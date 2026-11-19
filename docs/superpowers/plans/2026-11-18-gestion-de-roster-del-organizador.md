# Gestión de roster del organizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a match owner move any player down to the waitlist, up to the roster, or out of the match entirely — plus three unrelated adds the owner of the repo wants in the same PR.

**Architecture:** Entirely client-side. `allow update` on `matches/{matchId}` is `isMatchOwner() || (onlyRosterChanged() && withinCapacity())`, and `isMatchOwner()` is a full bypass of both, so the owner can already write any roster shape and `firestore.rules` is untouched. The new writes go through the existing `commitRosterChange`, which batches `matches` + `matchPreviews` with an **absolute** `occupiedCount` — the drift that PR #7 fixed came from a relative `increment(1)`, and nothing here may reintroduce one. Owner actions never auto-promote; the two existing automatic promotions (a voluntary leave, a removed `+1`) stay exactly as they are.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Firebase 12 (Auth + Firestore), Tailwind 4. There is no test framework and this plan does not add one: pure logic is checked by `node:assert/strict` assertions appended to the existing `src/features/matches/api/matchWrites.check.ts`, run with `npx tsx`. Hooks and components get `npm run lint` plus a stated manual check.

**Spec:** `docs/superpowers/specs/2026-11-18-gestion-de-roster-del-organizador-design.md`

## Global Constraints

- **`npm run lint` is `tsc --noEmit` and must pass at the end of every task.**
- **The payload check command is `NODE_NO_WARNINGS=1 npx tsx src/features/matches/api/matchWrites.check.ts`.** It imports `./matchPayloads`, never `./matchWrites`, which pulls in `src/lib/firebase` and cannot load outside Vite.
- **Every new write goes through `commitRosterChange`.** No new call site may use `increment()` on `matchPreviews.occupiedCount`; the count is always derived from the resulting arrays by `occupied(...)` in `matchPayloads.ts`.
- **Owner actions never promote.** `promoteFromWaitlist` keeps exactly its two current callers: `buildLeavePatch` (default behaviour) and `buildGuestListPatch` (when a removed `+1` frees a spot).
- **`memberIds` is the read gate.** Removing a uid drops it, which revokes that person's read access; moving to the waitlist keeps it.
- **`roster.<uid>` entries are never deleted.** A removed player keeps their display snapshot; clearing someone else's key is not a write worth making.
- **Capacity is the ceiling for everyone, enforced in the client.** `isMatchOwner()` bypasses `withinCapacity()`, so the rules will not catch an over-capacity roster.
- **`WAITLIST_SLOTS` stays 4** (`src/utils/matches.ts`).
- **Every new user-facing string gets a key in both `src/i18n/messages/en.ts` and `src/i18n/messages/es.ts`.**
- **`firestore.rules` and `firestore.indexes.json` are not modified.** `npm run check:rules` should still pass untouched.

## Review Focus

Five things the spec implies that no task's happy path exercises, most likely to bite first. Each one's test is pinned to the task that owns the code.

1. **Demoting the only waitlisted player while a roster spot is free.** A builder that promoted would pull them straight back onto the roster and silently undo the move. *(Task 1)*
2. **Promoting onto a roster that filled up since the UI rendered.** The owner's snapshot can be stale, and the rules will not reject the write — the client guard is the only thing standing between this and an over-capacity roster. *(Task 2)*
3. **Demoting a player who brought a `+1`.** The `+1` must leave the roster with them, or someone on hold still occupies a spot on the pitch. *(Task 1)*
4. **The owner's uncapped `+1` reaching capacity.** The per-person cap is lifted for the owner; the capacity check is not, and only the client applies it. *(Task 5)*
5. **A `+1` document written before this change, with no `name`.** Every existing one. It must render the generic label, never `undefined`. *(Task 4)*

---

### Task 1: Payload builders for the owner's moves

**Files:**
- Modify: `src/features/matches/api/matchPayloads.ts` (`buildLeavePatch`, new `buildRosterMovePatch`)
- Test: `src/features/matches/api/matchWrites.check.ts` (append)

**Interfaces:**
- Consumes: `rosterFields(match, joined, waitlist, guests)`, `occupied(joined, guests)`, both already private to `matchPayloads.ts`.
- Produces:
  - `buildLeavePatch(match, uid, options?: { promote?: boolean })` — `promote` defaults to `true`, so all current callers are unchanged.
  - `buildRosterMovePatch(match: Pick<MatchData, 'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds' | 'guests'>, uid: string, to: 'roster' | 'waitlist'): { matchPatch: MatchRosterPatch; previewPatch: PreviewCountPatch }`

- [ ] **Step 1: Write the failing assertions**

Append to `matchWrites.check.ts`, reusing its existing `match` and `fullMatchWithWaitlist` fixtures:

```ts
// The owner removing someone leaves the spot open: no promotion, the waitlist untouched.
// Removes 'u2' and not 'u1' deliberately: 'u1' is the fixture's creatorId, and
// computeMemberIds keeps a creator who left, which would muddy the memberIds assertion.
{
  const { matchPatch, previewPatch } = buildLeavePatch(fullMatchWithWaitlist, 'u2', { promote: false });
  assert.deepEqual(matchPatch.joinedPlayerIds, ['u1'], 'nobody promoted into the freed spot');
  assert.deepEqual(matchPatch.waitlistPlayerIds, ['w1'], 'the waitlist is left alone');
  assert.deepEqual(matchPatch.memberIds, ['u1', 'w1']);
  assert.equal(previewPatch.occupiedCount, 2, 'u1 plus the guest u1 brought');
  // ...and the default is still the old behaviour: the freed spot promotes w1.
  assert.deepEqual(
    buildLeavePatch(fullMatchWithWaitlist, 'u2').matchPatch.joinedPlayerIds,
    ['u1', 'w1'],
  );
}

// Roster -> waitlist: the spot opens, the +1 leaves, memberIds is unchanged as a set.
{
  const { matchPatch, previewPatch } = buildRosterMovePatch(match, 'u1', 'waitlist');
  assert.deepEqual(matchPatch.joinedPlayerIds, ['u2']);
  assert.deepEqual(matchPatch.waitlistPlayerIds, ['u1'], 'appended to the end of the queue');
  assert.deepEqual(matchPatch.guests, [], 'a player on hold holds no pitch spot for a +1');
  assert.deepEqual([...matchPatch.memberIds].sort(), ['u1', 'u2']);
  assert.equal(previewPatch.occupiedCount, 1);
}

// Waitlist -> roster. This fixture is capacity 3 and the result is 4, on purpose: the
// builder does not guard capacity, Task 2's caller does, and that split is what lets
// this same builder repair a roster that is already over capacity.
{
  const { matchPatch, previewPatch } = buildRosterMovePatch(fullMatchWithWaitlist, 'w1', 'roster');
  assert.deepEqual(matchPatch.joinedPlayerIds, ['u1', 'u2', 'w1']);
  assert.deepEqual(matchPatch.waitlistPlayerIds, []);
  assert.equal(previewPatch.occupiedCount, 4, 'two players, the promoted one, and the guest');
}

// Review Focus 1: the only waitlister, demoted with a roster spot free, must NOT bounce back.
{
  const roomy = { ...match, capacity: 10, waitlistPlayerIds: [] };
  const held = buildRosterMovePatch(roomy, 'u2', 'waitlist');
  assert.deepEqual(held.matchPatch.joinedPlayerIds, ['u1']);
  assert.deepEqual(held.matchPatch.waitlistPlayerIds, ['u2'], 'stays on hold, free spot and all');
}

// Idempotent: moving someone to where they already are changes nothing.
{
  const noop = buildRosterMovePatch(fullMatchWithWaitlist, 'w1', 'waitlist');
  assert.deepEqual(noop.matchPatch.waitlistPlayerIds, ['w1'], 'not duplicated');
}
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `NODE_NO_WARNINGS=1 npx tsx src/features/matches/api/matchWrites.check.ts`
Expected: FAIL — `buildRosterMovePatch is not a function`, and `buildLeavePatch` ignoring the third argument.

- [ ] **Step 3: Add the `options` parameter to `buildLeavePatch`**

Skip the `promoteFromWaitlist(...)` call when `options?.promote === false`. Everything else — dropping the uid from both arrays, filtering the leaver's guests, `rosterFields`, `occupied` — stays as it is. Update its docstring to say who passes `false` and why.

- [ ] **Step 4: Implement `buildRosterMovePatch` in `src/features/matches/api/matchPayloads.ts`**

Both directions end in `rosterFields(match, joined, waitlist, guests)` and `occupied(joined, guests)`, so `memberIds` and the count come out derived. `to: 'waitlist'` removes the uid from `joinedPlayerIds`, appends it to `waitlistPlayerIds` if absent, and filters `guests` by `addedBy !== uid`. `to: 'roster'` removes it from `waitlistPlayerIds`, appends to `joinedPlayerIds` if absent, and leaves `guests` alone. No capacity check here — that is the caller's guard (Task 2), because this builder is also what repairs an already-over-capacity roster.

- [ ] **Step 5: Run the check and lint**

Run: `NODE_NO_WARNINGS=1 npx tsx src/features/matches/api/matchWrites.check.ts && npm run lint`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/matches/api/matchPayloads.ts src/features/matches/api/matchWrites.check.ts
git commit -m "Add payload builders for the owner moving a player between lists"
```

---

### Task 2: Writes and guarded hook actions

**Files:**
- Modify: `src/features/matches/api/matchWrites.ts` (two new exports)
- Modify: `src/features/matches/hooks/useMatchActions.ts` (two new handlers, new parameter)
- Modify: `src/App.tsx` (pass `superAdminMode` through, wire the handlers to `MatchDetailView`)

**Interfaces:**
- Consumes: Task 1's `buildLeavePatch(match, uid, { promote: false })` and `buildRosterMovePatch(match, uid, to)`; the existing private `commitRosterChange(matchId, matchPatch, previewPatch)`.
- Produces:
  - `removeFromMatch(match: MatchData, uid: string): Promise<void>`
  - `moveRosterMember(match: MatchData, uid: string, to: 'roster' | 'waitlist'): Promise<void>`
  - From `useMatchActions`: `removeMember(match: MatchData, uid: string): Promise<void>` and `moveMember(match: MatchData, uid: string, to: 'roster' | 'waitlist'): Promise<void>`

- [ ] **Step 1: Implement the two writes in `src/features/matches/api/matchWrites.ts`**

Both mirror the shape of the existing `leaveMatch`: build the patch, `await commitRosterChange(...)`, and route a failure through `handleFirestoreError(error, OperationType.UPDATE, \`matches/${match.id}\`)`.

- [ ] **Step 2: Add the guarded handlers to `useMatchActions`**

`useMatchActions` currently takes `(profile, onMatchCreated, onMatchDeleted)`. Add a fourth parameter `superAdminMode: boolean` so the hook can call `canManageMatch(match, profile, superAdminMode)` itself rather than trusting the UI. Both handlers return early unless `profile` is set and `canManageMatch(...)` holds, and refuse to act on `profile.id` itself.

`moveMember` additionally:
- `to === 'roster'` and `isMatchFull(match)` → `alert(t('matches.alreadyFull'))` and return. **(Review Focus 2)**
- `to === 'waitlist'` and `isWaitlistFull(match)` → `alert(t('matches.waitlistFull'))` and return.

Both `alert` keys already exist.

- [ ] **Step 3: Pass `superAdminMode` into the hook in `src/App.tsx`**

`superAdminMode` is already state in `App`. The `useMatchActions(...)` call is at `src/App.tsx:99`.

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: PASS. No automated test — these are Firestore calls and the hook cannot load outside Vite. Task 3 verifies the behaviour in a browser.

- [ ] **Step 5: Commit**

```bash
git add src/features/matches/api/matchWrites.ts src/features/matches/hooks/useMatchActions.ts src/App.tsx
git commit -m "Let the match owner remove a player or move them between lists"
```

---

### Task 3: The action sheet on the roster chips

**Files:**
- Modify: `src/features/matches/components/MatchDetailView.tsx`
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`

**Interfaces:**
- Consumes: Task 2's `removeMember` / `moveMember`, passed in as props alongside the existing `onJoinLeave`, `onAddGuest`, `onRemoveGuest`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the i18n keys**

Under `matches` in both locales: `manageMemberTitle`, `onRoster`, `onHold`, `moveToHold`, `moveToRoster`, `removeFromMatch`, `removeFromMatchBody` (says the person loses access to the match and can rejoin through the link), and `cancel` if no shared key exists.

- [ ] **Step 2: Make the player and waitlist chips tappable for the owner**

`MatchDetailView` already branches per chip between a `<button>` and a `<div>` (around `src/features/matches/components/MatchDetailView.tsx:390`). Extend it: when `canManage` and the entry is not `profile.id`, player chips and waitlist chips become buttons that set a `memberToManage` state holding `{ id, name, kind: 'player' | 'waitlist' }`.

- [ ] **Step 3: Render the sheet**

Reuse the structure of the existing `+1` confirmation rather than adding a component, unless that duplicates more than it saves. Actions by `kind`: `player` → move to hold, remove; `waitlist` → move to roster, remove. Hide "move to roster" when `isMatchFull(match)`. Each action awaits its handler, then clears `memberToManage`; a `busy` flag disables the buttons while it is in flight, matching `removingGuest`.

- [ ] **Step 4: Verify in the browser**

Run: `npm run lint`, then drive the emulator the way this session already has — wire `connectFirestoreEmulator` / `connectAuthEmulator` behind `VITE_FIREBASE_EMULATORS`, seed a match with a roster and a waitlist, and sign in as the creator. Confirm: demote a player (spot opens, nobody promoted, their `+1` goes), promote a waitlister, remove a player, and that `matchPreviews.occupiedCount` equals `joinedPlayerIds.length + guests.length` after each. Revert the emulator wiring before committing.

- [ ] **Step 5: Commit**

```bash
git add src/features/matches/components/MatchDetailView.tsx src/i18n/messages/en.ts src/i18n/messages/es.ts
git commit -m "Give the owner hold, promote and remove on the roster chips"
```

---

### Task 4: A name on each `+1`

**Files:**
- Modify: `src/types/index.ts` (`MatchGuest`)
- Modify: `src/features/matches/components/AddPlusOneModal.tsx`
- Modify: `src/utils/matches.ts` (`resolveRoster`)
- Modify: `src/features/matches/hooks/useMatchActions.ts` (`addGuestPlusOne`)
- Modify: `src/features/matches/components/MatchDetailView.tsx` (`confirmPlusOne`)
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`
- Test: `src/utils/matches.check.ts` (append)

**Interfaces:**
- Produces: `MatchGuest` gains `name?: string`; `addGuestPlusOne(match: MatchData, name: string)`; `AddPlusOneModal`'s `onConfirm: (name: string) => void`.

- [ ] **Step 1: Write the failing assertions**

Append to `src/utils/matches.check.ts`, following that file's existing fixture
style — an inline object cast `as unknown as MatchData`, with `t` already
imported at the top of the file:

```ts
// A named +1 shows its name; one written before this change falls back to the generic label.
{
  const match = {
    id: 'm1',
    roster: { u1: { name: 'Jorge' } },
    joinedPlayerIds: ['u1'],
    guests: [
      { id: 'g1', addedBy: 'u1', createdAt: 'x', name: 'Primo Juan' },
      { id: 'g2', addedBy: 'u1', createdAt: 'x' },
    ],
  } as unknown as MatchData;
  const guests = resolveRoster(match).filter((e) => e.kind === 'guest');
  assert.equal(guests[0].name, 'Primo Juan');
  assert.equal(guests[1].name, t('matches.guest'), 'no name, no undefined');  // Review Focus 5
}
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `NODE_NO_WARNINGS=1 npx tsx src/utils/matches.check.ts`
Expected: FAIL — both guests resolve to the generic label.

- [ ] **Step 3: Add `name?: string` to `MatchGuest` and read it in `resolveRoster`**

In `src/utils/matches.ts:179`, the guest branch becomes `name: guest.name?.trim() || t('matches.guest')`. Optional in the type because existing documents have none and will not be migrated.

- [ ] **Step 4: Add the field to the modal and thread it through**

`AddPlusOneModal` holds its own `name` state and a text input shaped like the invite screen's (`required`, `maxLength={60}`, `autoComplete="name"`), with the confirm button disabled while the trimmed value is empty. `onConfirm` takes the trimmed name; `confirmPlusOne` and `addGuestPlusOne` pass it into the `guest` object beside `id`, `addedBy` and `createdAt`. New keys: a label and a placeholder, both locales.

- [ ] **Step 5: Run the checks and lint**

Run: `NODE_NO_WARNINGS=1 npx tsx src/utils/matches.check.ts && npm run lint`
Expected: both PASS. In the browser, add a named `+1` and confirm the chip shows the name.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/matches.ts src/utils/matches.check.ts src/features/matches/components/AddPlusOneModal.tsx src/features/matches/components/MatchDetailView.tsx src/features/matches/hooks/useMatchActions.ts src/i18n/messages/en.ts src/i18n/messages/es.ts
git commit -m "Name a +1 when adding it, so the roster can tell them apart"
```

---

### Task 5: The owner adds `+1`s without a per-person cap

**Files:**
- Modify: `src/features/matches/hooks/useMatchActions.ts` (`addGuestPlusOne`)

- [ ] **Step 1: Lift the per-person cap for the owner**

`addGuestPlusOne` currently refuses with `t('matches.oneGuestOnly')` when `(match.guests ?? []).some((g) => g.addedBy === profile.id)`. Guard that check with `!canManageMatch(match, profile, superAdminMode)`. The hook already has `superAdminMode` from Task 2.

Leave the two checks above it untouched: `match.joinedPlayerIds.includes(profile.id)` and `getOccupiedCount(match) >= match.capacity`. **The capacity check is the only ceiling for the owner (Review Focus 4)** — `isMatchOwner()` bypasses `withinCapacity()`, so the rules will accept an over-capacity write. Say so in a comment.

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS. In the browser, as the owner add two `+1`s in a row, then confirm the third is refused once `occupied` reaches `capacity`.

- [ ] **Step 3: Commit**

```bash
git add src/features/matches/hooks/useMatchActions.ts
git commit -m "Let the match owner add more than one +1, still bounded by capacity"
```

---

### Task 6: A signup button on the anonymous guest's own chip

**Files:**
- Modify: `src/features/matches/components/MatchDetailView.tsx`
- Modify: `src/App.tsx` (pass the handler)
- Modify: `src/i18n/messages/en.ts`, `src/i18n/messages/es.ts`

**Interfaces:**
- Produces: `MatchDetailView` gains `onCreateAccount?: () => void`.

- [ ] **Step 1: Add the key and the prop**

New key under `matches`: `createAccountShort`, short enough for a 72px chip (English "Sign up", Spanish "Crear cuenta"). `App` passes `onCreateAccount={() => { clearMessages(); setShowUpgrade(true); }}` — the same thing `MyMatchesScreen`'s `onCreateAccount` already does at `src/App.tsx:326`.

- [ ] **Step 2: Replace the position label on the guest's own chip**

In the chip's `content`, the third line currently renders `t('roles.short.${entry.role || 'Striker'}')`. When `isGuest && entry.kind === 'player' && entry.id === profile.id`, render a signup button there instead. Only the viewer's own chip: every other chip is untouched, including other anonymous players'.

Note in a comment why the label it replaces was wrong: `resolveRoster` defaults a roleless player to `'Striker'`, and an anonymous guest never did onboarding, so the chip was asserting a position they never chose.

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS. In the browser, join by link as a guest and confirm the own chip shows the button, that it opens the upgrade screen, and that the host's chip and other players' chips still show positions.

- [ ] **Step 4: Commit**

```bash
git add src/features/matches/components/MatchDetailView.tsx src/App.tsx src/i18n/messages/en.ts src/i18n/messages/es.ts
git commit -m "Offer an anonymous guest a signup button where their fake position was"
```
