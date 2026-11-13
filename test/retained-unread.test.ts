import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RetainedUnread, type UnreadRetention } from '../src/retained-unread.js';
import type { RoomReadStatus } from '../src/read-status-protocol.js';

const at = '2026-11-18T12:00:00.000Z', before = '2026-11-18T11:00:00.000Z', later = '2026-11-18T13:00:00.000Z';
const row = (id: string, unread = false, lastActivity = at): RoomReadStatus => ({
  id, title: 'Synthetic', type: 'direct', lastActivity, lastSeen: unread ? before : lastActivity,
});
const unpinned: UnreadRetention = { freshRooms: [] };

test('retained ledger distinguishes unknown, activity-only, read and unread without claiming source freshness', () => {
  const ledger = new RetainedUnread();
  assert.equal(ledger.peek('unknown'), undefined);
  ledger.observeActivity('room', [later], at, unpinned);
  assert.equal(ledger.size, 1); assert.equal(ledger.peek('room'), undefined, 'actual activity alone is not last-seen authority');
  ledger.observeStatuses([row('room'), row('unread', true)], unpinned);
  assert.deepEqual(ledger.peek('room'), { unread: false, unreadActivity: at, contradicted: true });
  assert.deepEqual(ledger.peek('unread'), { unread: true, unreadActivity: at, contradicted: false });
  ledger.observeStatuses([], unpinned);
  assert.equal(ledger.size, 2, 'empty/partial source input is not a forget instruction');
  assert.deepEqual(Object.keys(ledger.peek('room')!).sort(), ['contradicted', 'unread', 'unreadActivity']);
});

test('retained contradictions use the maximum loaded/withheld endpoint and survive old history or source observations', () => {
  const ledger = new RetainedUnread();
  ledger.observeStatuses([row('room')], unpinned);
  ledger.observeActivity('room', [before, at], later, unpinned);
  assert.equal(ledger.peek('room')!.contradicted, true, 'withheld newest endpoint remains evidence');
  ledger.observeActivity('room', [], undefined, unpinned);
  ledger.observeActivity('room', [before], before, unpinned);
  ledger.observeStatuses([row('room')], unpinned);
  assert.equal(ledger.peek('room')!.contradicted, true);
  ledger.observeStatuses([row('room', false, later)], unpinned);
  assert.equal(ledger.peek('room')!.contradicted, false);
  ledger.observeStatuses([row('other')], unpinned);
  assert.equal(ledger.peek('room')!.unreadActivity, later, 'navigation does not erase an observation');
  ledger.observeActivity('other', [later, before], at, unpinned);
  assert.equal(ledger.peek('other')!.contradicted, true, 'loaded messages can exceed the endpoint too');
});

test('retained observations and projections are detached from caller mutations', () => {
  const ledger = new RetainedUnread(), status = row('room', true);
  ledger.observeStatuses([status], unpinned);
  status.lastSeen = at;
  const projection = ledger.peek('room')!;
  projection.unread = false; projection.contradicted = true;
  assert.deepEqual(ledger.peek('room'), { unread: true, unreadActivity: at, contradicted: false });
});

test('retained ledger evicts historical entries before selected/fresh rows and forgetting stays unknown', () => {
  const ledger = new RetainedUnread(), retention = { selected: 'selected', freshRooms: ['fresh'] };
  ledger.observeStatuses([row('selected'), row('fresh'), ...Array.from({ length: 998 }, (_, i) => row('old-' + i))], retention);
  assert.equal(ledger.size, 1000);
  ledger.observeStatuses([row('new', true)], retention);
  assert.equal(ledger.size, 1000); assert.equal(ledger.peek('old-0'), undefined);
  assert.equal(ledger.peek('selected')!.unread, false); assert.equal(ledger.peek('fresh')!.unread, false);
  ledger.forget('selected'); ledger.forget('fresh'); ledger.forget('absent');
  assert.equal(ledger.size, 998); assert.equal(ledger.peek('selected'), undefined);
});

test('retained projection does not touch eviction order; genuine updates do and pressure still has a hard bound', () => {
  const ledger = new RetainedUnread(), rows = Array.from({ length: 1000 }, (_, i) => row('room-' + i));
  ledger.observeStatuses(rows, unpinned);
  for (let i = 0; i < 20; i++) ledger.peek('room-0');
  ledger.observeStatuses([row('room-1')], unpinned); // genuine update moves this entry to the end
  ledger.observeActivity('room-2', [later], undefined, unpinned);
  ledger.observeActivity('room-0', [before], undefined, unpinned); // first activity is itself an observation
  ledger.observeStatuses([row('new')], unpinned);
  assert.equal(ledger.peek('room-3'), undefined);
  assert.ok(ledger.peek('room-0')); assert.ok(ledger.peek('room-1')); assert.ok(ledger.peek('room-2'));
  const pure = new RetainedUnread();
  pure.observeStatuses(rows, unpinned);
  pure.peek('room-0');
  pure.observeActivity('room-0', [], undefined, unpinned);
  pure.observeStatuses([row('new')], unpinned);
  assert.equal(pure.peek('room-0'), undefined, 'peek and empty activity cannot change insertion order');
  const pinned = new RetainedUnread(), all = [...rows, row('overflow')];
  pinned.observeStatuses(all, { selected: 'room-0', freshRooms: all.map(value => value.id) });
  assert.equal(pinned.size, 1000); assert.equal(pinned.peek('room-0'), undefined, 'all-protected pressure falls back to oldest, never unbounded growth');
});

test('retained profile isolation and explicit reset are separate from clearing entries for pending account verification', () => {
  const ledger = new RetainedUnread();
  ledger.useProfile('profile-a'); ledger.observeStatuses([row('room')], unpinned);
  ledger.useProfile('profile-a'); assert.equal(ledger.size, 1);
  ledger.useProfile('profile-b'); assert.equal(ledger.size, 0);
  ledger.observeStatuses([row('room')], unpinned); ledger.clear();
  assert.equal(ledger.size, 0);
  ledger.observeStatuses([row('other')], unpinned); ledger.useProfile('profile-c');
  assert.equal(ledger.size, 0, 'clear does not erase the configuration-isolation boundary');
  ledger.reset(); ledger.observeStatuses([row('new-session')], unpinned);
  ledger.useProfile('profile-d'); assert.equal(ledger.size, 1, 'reset discards the old profile as well as observations');
});
