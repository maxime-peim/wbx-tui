import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessagingStore } from '../src/messaging-store.js';
import { demoMessageAPI } from '../src/messaging-api.js';

test('the 500-room cap explains unreachable destinations without advising membership changes or promising more paging', async () => {
  let reads = 0;
  const store = new MessagingStore({ ...demoMessageAPI(), rooms: async () => {
    reads++;
    return { items: Array.from({ length: 500 }, (_, i) => ({ id: `r-${i}`, title: `Room ${i}`, type: 'group' as const, lastActivity: '' })), next: 'next' };
  } }, 0);
  try {
    await store.loadRooms();
    assert.equal(store.rooms.length, 500);
    assert.match(store.notice, /paging cannot bypass/i);
    assert.match(store.notice, /no membership change/i);
    assert.doesNotMatch(store.notice, /narrow your memberships/i);
    await store.loadRooms(true);
    assert.equal(reads, 1, 'guidance cannot start hidden paging past the cap');
    assert.equal(store.room, undefined, 'no destination was inferred or opened');
  } finally { store.close(); }
});
