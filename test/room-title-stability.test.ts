import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessagingStore } from '../src/messaging-store.js';
import { demoMessageAPI, type MessageRoom } from '../src/messaging-api.js';
test('direct titles do not flash back to email fallbacks between REST and SDK metadata refreshes', async () => {
  const api = demoMessageAPI();
  const room: MessageRoom = { id: 'direct', type: 'direct', title: 'person@example.invalid', lastActivity: '' };
  api.rooms = async () => ({ items: [{ ...room }] });
  const store = new MessagingStore(api, 0);
  try {
    await store.loadRooms();
    store.mergeRooms([{ ...room, title: 'Known person' }]);
    await store.loadRooms();
    assert.equal(store.rooms[0]!.title, 'Known person');
    room.title = 'Updated person';
    await store.loadRooms();
    assert.equal(store.rooms[0]!.title, 'Updated person', 'actual name updates are not pinned forever');
    room.type = 'group'; room.title = 'group@example.invalid';
    await store.loadRooms();
    assert.equal(store.rooms[0]!.title, 'group@example.invalid', 'group titles are never guessed from email-like text');
  } finally { store.close(); }
});
