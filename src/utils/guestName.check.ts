/** Self-check for the guest name cache — run: npx tsx src/utils/guestName.check.ts */
import assert from 'node:assert/strict';
import { getStoredGuestName, storeGuestName } from './guestName';

const fakeStorage = (map: Map<string, string>) =>
  ({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }) as unknown as Storage;

const setStorage = (s: Storage | undefined) =>
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });

// Cleared storage must not break the identity; the name is a cache, not the id.
{
  const store = new Map<string, string>();
  setStorage(fakeStorage(store));
  assert.equal(getStoredGuestName(), '', 'missing name reads as empty, never throws');
  storeGuestName('Ana');
  assert.equal(getStoredGuestName(), 'Ana');
  store.clear();
  assert.equal(getStoredGuestName(), '', 'cleared storage degrades, it does not fail');
}

// A padded value already in storage reads back trimmed.
{
  const store = new Map<string, string>([['pitchready.guestName', '  Ana  ']]);
  setStorage(fakeStorage(store));
  assert.equal(getStoredGuestName(), 'Ana', 'padded stored name is trimmed on read');
}

// A blank or whitespace name is not storable — joining requires a real one.
{
  const store = new Map<string, string>();
  setStorage(fakeStorage(store));
  storeGuestName('   ');
  assert.equal(getStoredGuestName(), '', 'whitespace is not a name');
  assert.equal(store.size, 0);
}

// Absent or throwing storage degrades to '' and never propagates.
{
  setStorage(undefined);
  assert.equal(getStoredGuestName(), '', 'absent storage reads as empty');
  assert.doesNotThrow(() => storeGuestName('Ana'));
  const boom = () => {
    throw new Error('denied');
  };
  setStorage({ getItem: boom, setItem: boom } as unknown as Storage);
  assert.equal(getStoredGuestName(), '', 'throwing read reads as empty');
  assert.doesNotThrow(() => storeGuestName('Ana'), 'throwing write is swallowed');
}

console.log('guestName.check: ok');
