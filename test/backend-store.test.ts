import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessagingStore, type Delivery } from '../src/messaging-store.js';
import { MessagingError, type MessageRoom, type MessagingAPI, type MessagePage } from '../src/messaging-api.js';
import type { ChatMessage } from '../src/chat-protocol.js';
import { MessagingUI } from '../src/messaging-ui.js';
import { defaults } from '../src/config.js';

const room = (id: string, title = '', lastActivity = ''): MessageRoom => ({ id, title, type: 'direct', lastActivity });
const message = (n: number, patch: Partial<ChatMessage> = {}): ChatMessage => ({ id: `m-${n}`, author: 'Synthetic',
  created: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), text: `message ${n}`, ...patch });
function fixture(overrides: Partial<MessagingAPI> = {}) {
  let posts = 0;
  const api: MessagingAPI = { rooms: async () => ({ items: [room('selected', 'Selected'), room('other', 'Other')] }),
    history: async () => ({ items: [message(100)] }), send: async (_room, text, parentId) => {
      posts++; return message(101, { text, ...(parentId ? { parentId } : {}) });
    }, close() {}, ...overrides };
  const store = new MessagingStore(api, 0);
  return { api, store, posts: () => posts };
}

test('room discovery tracks pending/failure/verified emptiness independently of merged rows and never retries itself', async () => {
  let reads = 0, settle!: (page: { items: MessageRoom[]; next?: string }) => void, reject!: (error: Error) => void;
  const { store, posts } = fixture({ rooms: () => {
    reads++;
    return new Promise((resolve, fail) => { settle = resolve; reject = fail; });
  } });
  const states: string[] = []; store.onChange = () => states.push(store.roomsStatus);
  try {
    assert.equal(store.roomsStatus, 'unverified');
    store.mergeRooms([room('sdk', 'SDK metadata')]);
    assert.equal(store.roomsStatus, 'unverified', 'supplemental rows cannot prove catalogue discovery');
    const pending = store.loadRooms();
    assert.equal(store.roomsStatus, 'loading'); assert.equal(store.loadingRooms, true);
    assert.equal(await store.loadRooms(), false, 'a duplicate request cannot replace the physical read');
    assert.equal(store.roomsStatus, 'loading'); assert.equal(reads, 1);
    reject(new MessagingError('failed', 'Synthetic discovery failure.'));
    assert.equal(await pending, false); assert.equal(store.roomsStatus, 'failed');
    assert.deepEqual(store.rooms.map(item => item.id), ['sdk'], 'failed discovery retains existing rows, not an empty replacement');
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(reads, 1, 'failure never schedules another catalogue read');
    const retry = store.loadRooms(); assert.equal(store.roomsStatus, 'loading');
    settle({ items: [] }); assert.equal(await retry, true);
    assert.equal(store.roomsStatus, 'ready'); assert.deepEqual(store.rooms.map(item => item.id), []);
    assert.equal(await store.loadRooms(true), false, 'absent next cursor is a no-op, not discovery failure');
    assert.equal(store.roomsStatus, 'ready'); assert.equal(reads, 2);
    const refresh = store.loadRooms(); reject(new Error('PRIVATE provider body'));
    assert.equal(await refresh, false); assert.equal(store.roomsStatus, 'failed', 'an earlier empty success cannot verify a later failed refresh');
    assert.doesNotMatch(store.notice, /PRIVATE/);
    const recovery = store.loadRooms(); settle({ items: [room('rest', 'Verified row')] });
    assert.equal(await recovery, true); assert.equal(store.roomsStatus, 'ready');
    assert.deepEqual(store.rooms.map(item => item.id), ['rest']);
    assert.deepEqual(states, ['unverified', 'loading', 'failed', 'loading', 'ready', 'loading', 'failed', 'loading', 'ready']);
    assert.equal(store.room, undefined); assert.deepEqual(store.messages, []); assert.equal(posts(), 0);
  } finally { store.close(); }
});

test('empty paginated discovery is not complete absence and stalled continuation is not verified emptiness', async () => {
  let reads = 0;
  const { store } = fixture({ rooms: async () => { reads++; return { items: [], next: 'pending-page' }; } });
  try {
    await store.loadRooms();
    assert.equal(store.roomsStatus, 'ready'); assert.equal(store.moreRooms, true);
    await store.loadRooms(true);
    assert.equal(store.roomsStatus, 'failed'); assert.equal(store.moreRooms, false);
    assert.match(store.notice, /pagination stopped/);
    await store.loadRooms(true); assert.equal(reads, 2, 'no-progress pagination never automatically resumes');
  } finally { store.close(); }
});

test('closed room discovery cannot publish a late success as new verification', async () => {
  let settle!: (page: { items: MessageRoom[] }) => void, notifications = 0;
  const { store } = fixture({ rooms: () => new Promise(resolve => { settle = resolve; }) });
  store.onChange = () => { notifications++; };
  const pending = store.loadRooms(); store.close(); const count = notifications;
  settle({ items: [] }); assert.equal(await pending, false);
  assert.notEqual(store.roomsStatus, 'ready'); assert.equal(notifications, count);
});

test('off-page authoritative titles and activity survive REST replacement, blank SDK reintroduction and later pagination', async () => {
  let calls = 0;
  const { store, posts } = fixture({ rooms: async next => {
    calls++;
    return next ? { items: [room('peer')] } : { items: [room('selected')], next: 'older' };
  } });
  try {
    store.mergeRooms([room('selected', 'Selected'), room('peer', 'Resolved peer', '2026-11-09T12:00:00.000Z')]);
    await store.select('peer');
    await store.loadRooms();
    assert.equal(store.rooms.some(item => item.id === 'peer'), false, 'first-page replacement really removes the off-page room');
    store.mergeRooms([room('peer', ' ', '2026-01-01T00:00:00.000Z')]);
    assert.equal(store.room?.title, 'Resolved peer');
    assert.equal(store.rooms.find(item => item.id === 'peer')?.lastActivity, '2026-11-09T12:00:00.000Z');
    await store.loadRooms(); await store.loadRooms(true);
    assert.equal(store.rooms.find(item => item.id === 'peer')?.title, 'Resolved peer');
    assert.equal(store.room?.id, 'peer'); assert.equal(store.room?.title, 'Resolved peer');
    assert.equal(calls, 3); assert.equal(posts(), 0);
  } finally { store.close(); }
});

test('metadata cache is bounded independently of visible rooms and pins selected metadata', async () => {
  const { store } = fixture({ rooms: async () => ({ items: [room('selected')] }) });
  try {
    store.mergeRooms([room('peer', 'Pinned peer', '2026-11-09T12:00:00.000Z')]); await store.select('peer');
    await store.loadRooms();
    for (let batch = 0; batch < 30; batch++) store.mergeRooms(Array.from({ length: 100 }, (_, i) => room(`r-${batch}-${i}`, `Peer ${batch}-${i}`)));
    const cache = (store as unknown as { roomMetadataCache: Map<string, MessageRoom> }).roomMetadataCache;
    assert.ok(cache.size <= 1000); assert.ok(store.rooms.length <= 500);
    assert.equal(cache.get('peer')?.title, 'Pinned peer');
    store.mergeRooms([room('peer')]); assert.equal(store.room?.title, 'Pinned peer');
    store.close(); assert.equal(cache.size, 0);
  } finally { store.close(); }
});

test('history exhaustion is distinct from initialization and cannot be revived by latest polls', async () => {
  const cursors: (string | undefined)[] = [];
  const { store, posts } = fixture({ history: async (_room, next) => {
    cursors.push(next);
    return next ? { items: [message(1)] } : { items: [message(100)], next: 'older' };
  } });
  try {
    await store.loadRooms(); await store.select('selected'); assert.equal(store.moreHistory, true);
    await store.refresh(true); assert.equal(store.moreHistory, false);
    for (let i = 0; i < 3; i++) { await store.refresh(); await store.refresh(true); }
    assert.deepEqual(cursors, [undefined, 'older', undefined, undefined, undefined]);
    assert.equal(store.moreHistory, false); assert.equal(store.latestMessageId, 'm-100'); assert.equal(posts(), 0);
    assert.equal(store.notice, '', 'a consumed first-page cursor in a latest poll is normal, not a pagination error');
    await store.select('other'); assert.equal(store.moreHistory, true, 'a new selection initializes its own cursor');
  } finally { store.close(); }
});

test('a failed initial history load can initialize later, while an initially exhausted page stays exhausted', async () => {
  let reads = 0;
  const { store } = fixture({ history: async () => {
    reads++; if (reads === 1) throw new MessagingError('failed', 'Synthetic read failure.');
    return { items: [message(reads)], ...(reads > 2 ? { next: 'must-not-revive' } : {}) };
  } });
  try {
    await store.loadRooms(); await store.select('selected'); assert.equal(store.ready, false);
    await store.refresh(); assert.equal(store.ready, true); assert.equal(store.moreHistory, false);
    await store.refresh(); await store.refresh(true); assert.equal(reads, 3); assert.equal(store.moreHistory, false);
  } finally { store.close(); }
});

test('500-message limit retains anchors on re-entry and refetches only on explicit latest reload', async () => {
  let latest = 1000, olderReads = 0;
  const { store, posts } = fixture({ history: async (_room, next) => {
    if (!next) return { items: Array.from({ length: 100 }, (_, i) => message(latest - i)), next: 'page-1' };
    olderReads++; const page = Number(next.slice(5));
    // An overlapping boundary page must admit only available older rows.
    return { items: Array.from({ length: 130 }, (_, i) => message(901 - page * 100 - i)), next: `page-${page + 1}` };
  } });
  try {
    await store.loadRooms(); await store.select('selected'); const anchor = store.messages.at(-1)!;
    for (let i = 0; i < 20; i++) await store.refresh(true);
    assert.equal(store.messages.length, 500); assert.equal(store.historyAtLimit, true); assert.equal(store.moreHistory, false);
    assert.equal(olderReads, 4); assert.equal(store.messages.at(-1), anchor);
    const retained = store.messages;
    latest = 1100; await store.refresh(); await store.refresh(true);
    assert.equal(store.messages, retained, 'polling at capacity cannot evict a loaded anchor');
    assert.equal(store.latestMessageId, 'm-1100'); assert.equal(store.messages.at(-1)?.id, 'm-1000');
    assert.match(store.notice, /History limit: 500/); assert.equal(olderReads, 4); assert.equal(posts(), 0);
    await store.select('selected');
    assert.equal(store.messages, retained, 're-entering the selected space is not an implicit reset');
    await store.select('selected', true);
    assert.equal(store.messages.length, 100); assert.equal(store.messages.at(-1)?.id, 'm-1100'); assert.equal(store.historyAtLimit, false);
    assert.equal(store.moreHistory, true);
  } finally { store.close(); }
});

test('repeated/cyclic cursors and non-progressing pages stop both datasets without request storms', async () => {
  for (const cycle of [false, true]) {
    let histories = 0, rooms = 0;
    const { store } = fixture({ rooms: async next => {
      rooms++; return { items: [room(next && cycle ? `room-${rooms}` : 'selected')], next: next === 'b' ? 'a' : next ? 'b' : 'a' };
    }, history: async (_room, next) => {
      histories++; return { items: [message(next && cycle ? histories : 100)], next: next === 'b' ? 'a' : next ? 'b' : 'a' };
    } });
    try {
      await store.loadRooms(); await store.select('selected');
      for (let i = 0; i < 20; i++) { await store.loadRooms(true); await store.refresh(true); }
      assert.equal(rooms, cycle ? 3 : 2); assert.equal(histories, cycle ? 3 : 2);
      assert.equal(store.moreRooms, false); assert.equal(store.moreHistory, false);
      assert.match(store.notice, /pagination stopped/);
      await store.refresh(); await store.refresh(true); assert.equal(histories, cycle ? 4 : 3, 'latest poll cannot revive stalled pagination');
      assert.match(store.notice, /History pagination stopped/, 'polling retains the explicit no-progress explanation');
    } finally { store.close(); }
  }
});

test('a send ACK at capacity remains successful without displacing loaded history or masquerading as a displayed endpoint', async () => {
  let posts = 0;
  const { store } = fixture({ history: async () => ({ items: Array.from({ length: 500 }, (_, i) => message(i)), next: 'not-admitted' }),
    send: async (_room, text) => { posts++; return message(501, { text }); } });
  const deliveries: Delivery[] = []; store.onDelivery = delivery => deliveries.push(delivery);
  try {
    await store.loadRooms(); await store.select('selected'); const retained = store.messages;
    await store.send('at-capacity', 'selected', 'explicit new message');
    assert.equal(posts, 1); assert.equal(deliveries.at(-1)?.status, 'sent');
    assert.equal(deliveries.at(-1)?.messageId, 'm-501', 'exact delivery identity remains available even when history is clipped');
    assert.equal(store.messages, retained); assert.equal(store.messages.at(-1)?.id, 'm-499');
    assert.equal(store.latestMessageId, 'm-501'); assert.equal(store.moreHistory, false);
    assert.equal(store.uncertain.has('selected'), false); assert.match(store.notice, /History limit: 500/);
    await store.send('at-capacity', 'selected', 'explicit new message'); assert.equal(posts, 1, 'a clipped ACK is still replay-deduplicated');
  } finally { store.close(); }
});

test('unchanged polls preserve message and wrapping-cache identity; every display field invalidates changed content', async () => {
  let page = [message(1), message(2)];
  const { store } = fixture({ history: async () => ({ items: structuredClone(page) }) });
  const ui = new MessagingUI(store, defaults());
  try {
    await store.loadRooms(); await store.select('selected'); ui.screen(100, 30);
    const messages = store.messages, unchanged = messages[0];
    const cache = () => (ui as unknown as { cachedHistory: unknown }).cachedHistory;
    const wrapped = cache(); assert.ok(wrapped);
    await store.refresh(); ui.screen(100, 30);
    assert.equal(store.messages, messages); assert.equal(cache(), wrapped);
    store.mergeRooms([room('selected', 'Renamed')]); ui.screen(100, 30);
    assert.equal(store.messages, messages); assert.equal(cache(), wrapped);
    for (const patch of [{ text: 'edited' }, { author: 'Renamed author' }, { markdown: '**bold**' }, { quoted: true }, { parentId: 'm-1' }, { created: message(3).created }]) {
      const before = store.messages, previousCache = cache();
      page = [page[0]!, { ...page[1]!, ...patch }]; await store.refresh(); ui.screen(100, 30);
      assert.notEqual(store.messages, before); assert.notEqual(cache(), previousCache); assert.equal(store.messages[0], unchanged);
      const changed = store.messages; await store.refresh(); assert.equal(store.messages, changed);
    }
  } finally { store.close(); }
});

test('paging and metadata cannot send drafts or erase a concurrent reply ACK; uncertain delivery blocks explicit repeats', async () => {
  let release!: (page: MessagePage<ChatMessage>) => void;
  const { api, store, posts } = fixture(); const deliveries: Delivery[] = [];
  const ui = new MessagingUI(store, defaults());
  const delivered = store.onDelivery;
  store.onDelivery = delivery => { deliveries.push(delivery); delivered(delivery); };
  try {
    await store.loadRooms(); await store.select('selected'); ui.action('insert'); ui.paste('retained normal draft');
    api.history = () => new Promise(resolve => { release = resolve; });
    const poll = store.refresh(); store.mergeRooms([room('selected', 'New label')]);
    assert.equal(posts(), 0); assert.equal(ui.draft?.text, 'retained normal draft');
    await store.send('reply-1', 'selected', 'explicit reply', 'm-100');
    release({ items: [message(101, { text: 'stale GET', parentId: 'm-100' })] }); await poll;
    assert.equal(store.messages.find(item => item.id === 'm-101')?.text, 'explicit reply');
    await store.send('reply-1', 'selected', 'explicit reply', 'm-100'); assert.equal(posts(), 1);
    assert.equal(deliveries.at(-1)?.parentId, 'm-100'); assert.equal(ui.draft?.text, 'retained normal draft');
    api.send = async () => { throw new MessagingError('unknown', 'Synthetic uncertain delivery.'); };
    await store.send('unknown', 'selected', 'keep destination-bound'); assert.equal(store.uncertain.has('selected'), true);
    api.send = async () => assert.fail('unresolved delivery must block the transport');
    await store.send('blocked', 'selected', 'must remain unsent'); assert.equal(deliveries.at(-1)?.status, 'failed');
    assert.equal(ui.draft?.text, 'retained normal draft');
  } finally { store.close(); }
});
