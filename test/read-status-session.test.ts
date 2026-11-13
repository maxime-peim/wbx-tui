import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { ReadStatusWorker } from '../src/read-status.js';
import type { RoomReadStatus } from '../src/read-status-protocol.js';
import type { ReadStatusHealth, ReadStatusFailure } from '../src/read-status-protocol.js';

const fake = `
import { EventEmitter } from 'node:events';
export function createReadStatusSDK() {
  const emitter = () => Object.assign(new EventEmitter(), { listen: async () => {}, stopListening() {} });
  const rooms = emitter(), memberships = emitter(), messages = emitter();
  const item = { id: 'event-room', type: 'group', title: 'Event room', lastActivityDate: '2026-11-09T12:00:00.000Z', lastSeenActivityDate: '2026-11-09T11:00:00.000Z' };
  rooms.listWithReadStatus = async () => {
    setTimeout(() => { item.lastSeenActivityDate = item.lastActivityDate; memberships.emit('seen', { data: { roomId: item.id } }); }, 80);
    setTimeout(() => { item.lastActivityDate = '2026-11-09T13:00:00.000Z'; messages.emit('created', { data: { roomId: item.id } }); }, 160);
    return { items: [{ ...item }] };
  };
  rooms.getWithReadStatus = async () => ({ ...item });
  memberships.updateLastSeen = async () => { item.lastSeenActivityDate = item.lastActivityDate; };
  return Object.assign(new EventEmitter(), { ready: true, rooms, memberships, messages,
    internal: { device: { register: async () => {}, unregister: async () => {} }, mercury: { disconnect: async () => {} } } });
}
`;
const steady = `
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
export function createReadStatusSDK() {
  const emitter = () => Object.assign(new EventEmitter(), { listen: async () => {}, stopListening() {} });
  const rooms = emitter(), memberships = emitter(), messages = emitter();
  const item = { id: 'healthy-room', type: 'group', title: 'Healthy', lastActivityDate: '2026-11-09T12:00:00.000Z', lastSeenActivityDate: '2026-11-09T11:00:00.000Z' };
  let registrations = 0, receipts = 0, lists = 0;
  rooms.listWithReadStatus = async () => { assert.equal(registrations, 1); assert.equal(receipts, 0); lists++; return { items: [{ ...item }] }; };
  rooms.getWithReadStatus = async () => ({ ...item });
  memberships.updateLastSeen = async () => { receipts++; throw new Error('Receipts forbidden.'); };
  REPLACE
  return Object.assign(new EventEmitter(), { ready: true, rooms, memberships, messages,
    internal: { device: { register: async () => { registrations++; }, unregister: async () => {} }, mercury: { disconnect: async () => {} } } });
}
`;
async function coordinator(t: TestContext, contents: string, fastRefresh = false, options: { failure?: ReadStatusFailure; fastDeadline?: boolean } = {}) {
  const directory = await mkdtemp('/tmp/opencode/wbx-read-recovery-'), file = join(directory, 'worker.mjs');
  // Accelerate selected periodic refresh/SDK deadlines only in this isolated
  // child. Event/publication timing and all production defaults stay unchanged.
  const banner = fastRefresh || options.fastDeadline ? { js: `const timeout = globalThis.setTimeout; globalThis.setTimeout = (fn, ms, ...args) => timeout(fn, (ms === 60000 && ${fastRefresh} || ms === 30000 && ${!!options.fastDeadline}) ? 40 : ms, ...args);` } : undefined;
  await build({ entryPoints: ['src/read-status-worker.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', banner,
    plugins: [{ name: 'recovery-sdk', setup(build) { build.onLoad({ filter: /\/read-status-sdk\.ts$/ }, () => ({ contents: contents.replaceAll('REPORT_PATH', JSON.stringify(join(directory, 'native.json'))), loader: 'js' })); } }] });
  const source = new ReadStatusWorker(file, 2000), snapshots: RoomReadStatus[][] = [], health: ReadStatusHealth[] = [], failures: (ReadStatusFailure | undefined)[] = [];
  const messages: unknown[] = [], changes: unknown[] = [];
  let changed = () => {};
  source.onRooms = rooms => { snapshots.push(rooms); changed(); };
  source.onHealth = value => { health.push(value); changed(); };
  source.onFailure = reason => { failures.push(reason); changed(); };
  source.onMessages = values => { messages.push(...values); changed(); };
  source.onChanges = values => { changes.push(...values); changed(); };
  t.after(async () => {
    const child = (source as unknown as { child?: ChildProcess }).child;
    const exited = child && child.exitCode === null && child.signalCode === null ? once(child, 'exit') : undefined;
    source.close(); await exited; await rm(directory, { recursive: true, force: true });
  });
  const starting = source.start({ token: 'synthetic', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' });
  const child = (source as unknown as { child: ChildProcess }).child;
  const packets: { value: any; time: number }[] = [];
  child.on('message', value => packets.push({ value, time: Date.now() }));
  if (options.failure) { await assert.rejects(starting); assert.deepEqual(failures, [options.failure]); }
  else await starting;
  const until = async (check: () => boolean) => {
    while (!check()) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Recovery fixture deadline.')), 2000);
      changed = () => { clearTimeout(timer); resolve(); };
    });
  };
  return { source, snapshots, health, failures, messages, changes, until, child, packets,
    report: async () => JSON.parse(await readFile(join(directory, 'native.json'), 'utf8')) };
}
test('forked coordinator flushes startup invalidations before the first snapshot or ready, even with immediate native results', { timeout: 10_000 }, async t => {
  const self = Buffer.from('ciscospark://us/PEOPLE/self').toString('base64url');
  const contents = steady.replace('REPLACE', `
    memberships.listen = async () => {
      memberships.emit('deleted', { resource: 'memberships', event: 'deleted', createdBy: '${self}',
        data: { id: 'membership', roomId: item.id, personId: '${self}' } });
      messages.emit('deleted', { resource: 'messages', event: 'deleted', createdBy: '${self}',
        data: { id: 'deleted', roomId: item.id } });
    };
  `).replace('internal: { device:', `internal: { me: { id: '${self}' }, device:`);
  const f = await coordinator(t, contents);
  await f.until(() => f.changes.length === 2);
  assert.deepEqual(f.changes, [{ kind: 'room-revoked', roomId: 'healthy-room' },
    { kind: 'message-deleted', roomId: 'healthy-room', id: 'deleted' }]);
  assert.equal(f.packets[0]!.value.type, 'changes', 'a metadata or ready packet cannot overtake observed startup invalidations');
  assert.ok(f.packets.findIndex(packet => packet.value.type === 'ready') > 0);
  assert.deepEqual(f.failures, []);
});
for (const scenario of [
  { name: 'SDK construction', reason: 'sdk-load:failed', contents: steady.replace('REPLACE', '').replace('const emitter =', 'throw new Error("PRIVATE construction"); const emitter =') },
  { name: 'SDK readiness deadline', reason: 'sdk-ready:deadline', contents: steady.replace('REPLACE', '').replace('ready: true', 'ready: false'), fastDeadline: true },
  { name: 'device registration denial', reason: 'device-register:denied', contents: steady.replace('REPLACE', '').replace('register: async () => { registrations++; }', 'register: async () => { throw Object.assign(new Error("PRIVATE registration"), { statusCode: 403 }); }') },
  { name: 'initial snapshot network error', reason: 'initial-snapshot:network', contents: steady.replace('REPLACE', 'rooms.listWithReadStatus = async () => { throw Object.assign(new Error("PRIVATE host/token"), { code: "ECONNRESET" }); };') },
] as const) test(`${scenario.name} has a precise sanitized startup diagnostic`, { timeout: 10_000 }, async t => {
  const f = await coordinator(t, scenario.contents, false, { failure: scenario.reason, fastDeadline: 'fastDeadline' in scenario });
  assert.deepEqual(f.snapshots, []); assert.ok(!JSON.stringify(f.failures).includes('PRIVATE'));
});
test('confirmed message batches bypass a pending metadata lookup without overlapping native metadata operations', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    rooms.getWithReadStatus = () => new Promise(() => {});
    messages.listen = async () => setTimeout(() => {
      const data = { id: 'created', roomId: item.id, created: new Date().toISOString(), text: 'PRIVATE', personId: 'other' };
      messages.emit('created', { data }); messages.emit('created', { data });
    }, 60);
  `);
  const f = await coordinator(t, contents);
  await f.until(() => f.messages.length === 1);
  assert.deepEqual(f.messages, [{ id: 'created', roomId: 'healthy-room', created: (f.messages[0] as any).created, self: false }]);
  assert.equal(f.snapshots.length, 2, 'no completed metadata lookup was needed to deliver creation evidence');
  assert.deepEqual(f.failures, []);
  assert.ok(!JSON.stringify(f.messages).includes('PRIVATE'));
});
test('inaccessible, missing-date and mismatched room updates do not kill unread sync for other spaces', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    const original = rooms.listWithReadStatus;
    rooms.listWithReadStatus = async () => { const page = await original(); return { items: [...page.items, ...['removed', 'missing', 'mismatched'].map(id => ({ ...item, id }))] }; };
    rooms.getWithReadStatus = async id => {
      if (id === 'removed') throw new Error('PRIVATE inaccessible room');
      if (id === 'missing') return { ...item, id, lastSeenActivityDate: undefined };
      if (id === 'mismatched') return { ...item };
      return { ...item };
    };
    memberships.listen = async () => {
      for (const [index, id] of ['removed', 'missing', 'mismatched'].entries()) setTimeout(() => memberships.emit('seen', { data: { roomId: id } }), 30 + index * 20);
      setTimeout(() => { item.lastSeenActivityDate = item.lastActivityDate; memberships.emit('seen', { data: { roomId: item.id } }); }, 150);
    };
  `);
  const f = await coordinator(t, contents);
  await f.until(() => f.snapshots.some(rooms => rooms.length === 1 && rooms[0]!.lastSeen < rooms[0]!.lastActivity));
  assert.ok(f.health.includes('room-unavailable'));
  assert.ok(f.snapshots.every(rooms => rooms.some(room => room.id === 'healthy-room')), 'unrelated confirmed status is never discarded');
  await f.until(() => f.snapshots.at(-1)?.[0]?.lastSeen === f.snapshots.at(-1)?.[0]?.lastActivity);
  assert.deepEqual(f.failures, [], 'valid later events still update the healthy space');
  assert.ok(!JSON.stringify({ health: f.health, snapshots: f.snapshots, failures: f.failures }).includes('PRIVATE'));
});
for (const failure of ['listener rejection', 'listener throw', 'SDK error event']) test(`${failure} falls back to repeated authoritative status fetches without device registration or receipts`, { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    ${failure === 'listener rejection' ? "memberships.listen = async () => { throw new Error('PRIVATE event stream failure'); };" : failure === 'listener throw' ? "memberships.listen = () => { throw new Error('PRIVATE event stream throw'); };" : ''}
    const original = rooms.listWithReadStatus;
    rooms.listWithReadStatus = async () => { const page = await original(); if (lists >= 3) page.items[0].lastSeenActivityDate = item.lastActivityDate; return page; };
  `).replace('return Object.assign(new EventEmitter(),', failure === 'SDK error event'
    ? "const sdk = new EventEmitter(); setTimeout(() => sdk.emit('error', new Error('PRIVATE SDK event')), 20); return Object.assign(sdk,"
    : 'return Object.assign(new EventEmitter(),');
  const f = await coordinator(t, contents, true);
  await f.until(() => f.snapshots.some(rooms => rooms[0]?.lastSeen === itemTime));
  assert.ok(f.health.includes('polling')); assert.deepEqual(f.failures, []);
  assert.ok(f.snapshots[0]![0]!.lastSeen < f.snapshots[0]![0]!.lastActivity);
});
const itemTime = '2026-11-09T12:00:00.000Z';
test('temporary periodic status failure becomes unknown and then recovers without replaying writes', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    const original = rooms.listWithReadStatus;
    rooms.listWithReadStatus = async () => {
      const page = await original();
      if (lists === 3) throw new Error('PRIVATE temporary status failure');
      if (lists > 3) page.items[0].lastSeenActivityDate = item.lastActivityDate;
      return page;
    };
  `);
  const f = await coordinator(t, contents, true);
  await f.until(() => f.health.includes('refresh-unavailable'));
  assert.ok(f.snapshots.some(rooms => rooms.length === 0), 'failed refresh does not leave stale status looking current');
  await f.until(() => f.snapshots.at(-1)?.[0]?.lastSeen === itemTime);
  await f.until(() => f.health.at(-1) === 'live');
  assert.deepEqual(f.failures, []);
  assert.ok(!JSON.stringify({ health: f.health, snapshots: f.snapshots }).includes('PRIVATE'));
});
test('initial read status is available before slow event-listener setup completes', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-first-sdk-status-'), file = join(directory, 'worker.mjs');
  let source: ReadStatusWorker | undefined;
  try {
    const slowListeners = fake.replace('listen: async () => {}', 'listen: () => new Promise(() => {})');
    await build({ entryPoints: ['src/read-status-worker.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm',
      plugins: [{ name: 'slow-event-sdk', setup(build) { build.onLoad({ filter: /\/read-status-sdk\.ts$/ }, () => ({ contents: slowListeners, loader: 'js' })); } }] });
    source = new ReadStatusWorker(file, 2000);
    const snapshots: RoomReadStatus[][] = [];
    source.onRooms = rooms => snapshots.push(rooms);
    await source.start({ token: 'synthetic', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' });
    assert.ok(snapshots[0]![0]!.lastActivity > snapshots[0]![0]!.lastSeen, 'initial unread data does not wait for the event streams');
    const child = (source as unknown as { child: ChildProcess }).child, exited = once(child, 'exit');
    source.close(); await exited;
  } finally { source?.close(); await rm(directory, { recursive: true, force: true }); }
});
test('real isolated coordinator reacts to another client read and new-message events using authoritative SDK status', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-read-coordinator-'), file = join(directory, 'worker.mjs');
  let source: ReadStatusWorker | undefined;
  try {
    await build({ entryPoints: ['src/read-status-worker.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm',
      plugins: [{ name: 'fake-sdk-only', setup(build) { build.onLoad({ filter: /\/read-status-sdk\.ts$/ }, () => ({ contents: fake, loader: 'js' })); } }] });
    source = new ReadStatusWorker(file, 2000);
    const snapshots: RoomReadStatus[][] = [];
    let changed!: () => void;
    source.onRooms = rooms => { snapshots.push(rooms); changed?.(); };
    const until = async (check: () => boolean) => {
      while (!check()) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SDK metadata event deadline.')), 2000);
        changed = () => { clearTimeout(timer); resolve(); };
      });
    };
    await source.start({ token: 'synthetic', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' });
    assert.ok(snapshots[0]![0]!.lastActivity > snapshots[0]![0]!.lastSeen);
    await until(() => snapshots.some(rooms => rooms[0]!.lastSeen === rooms[0]!.lastActivity));
    await until(() => snapshots.at(-1)![0]!.lastActivity === '2026-11-09T13:00:00.000Z');
    assert.ok(snapshots.at(-1)![0]!.lastActivity > snapshots.at(-1)![0]!.lastSeen, 'new incoming activity restores unread');
    await source.markRead('event-room', 'last-message');
    await until(() => snapshots.at(-1)![0]!.lastSeen === snapshots.at(-1)![0]!.lastActivity);
    const child = (source as unknown as { child: ChildProcess }).child, exited = once(child, 'exit');
    source.close(); await exited;
  } finally { source?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('64-room metadata bursts deduplicate native reads and publish one bounded full snapshot, health only on change', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    const items = Array.from({ length: 64 }, (_, i) => ({ ...item, id: 'burst-' + i }));
    let gets = 0;
    const report = () => writeFileSync(REPORT_PATH, JSON.stringify({ gets, lists }));
    const original = rooms.listWithReadStatus;
    rooms.listWithReadStatus = async () => { await original(); report(); return { items: items.map(value => ({ ...value })) }; };
    rooms.getWithReadStatus = async id => { gets++; report(); return { ...items.find(value => value.id === id) }; };
    memberships.listen = async () => setTimeout(() => {
      items.forEach(value => value.lastSeenActivityDate = value.lastActivityDate);
      for (let repeat = 0; repeat < 32; repeat++) for (const value of items) {
        memberships.emit('seen', { data: { roomId: value.id } });
        rooms.emit('updated', { data: { id: value.id } });
      }
    }, 80);
  `).replace("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict'; import { writeFileSync } from 'node:fs';");
  const f = await coordinator(t, contents);
  await f.until(() => f.snapshots.length >= 2);
  const initial = f.snapshots.length, initialHealth = [...f.health];
  const ready = f.packets.findIndex(packet => packet.value.type === 'ready');
  assert.equal(f.packets[0]!.value.type, 'snapshot'); assert.ok(ready > 0, 'ready follows a coherent initial snapshot');
  await f.until(() => f.snapshots.at(-1)?.length === 64 && f.snapshots.at(-1)!.every(room => room.lastSeen === room.lastActivity));
  assert.equal(f.snapshots.length - initial, 1, '4096 metadata events do not emit 64 full-history-triggering snapshots');
  assert.equal(f.health.at(-1), 'live'); assert.deepEqual(f.health, initialHealth); assert.deepEqual(f.failures, []);
  assert.deepEqual(await f.report(), { gets: 64, lists: 2 });
  const bytes = Buffer.byteLength(JSON.stringify(f.snapshots.at(-1)));
  t.diagnostic(`Synthetic 64-room/4096-event burst: 64 native room reads, 1 full snapshot (${bytes} bytes), no repeated health; former per-room publication would emit ~${bytes * 64} bytes.`);
});

test('continuous metadata events cannot postpone the fixed publication deadline', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    memberships.listen = async () => {
      for (let i = 1; i <= 16; i++) setTimeout(() => {
        item.lastSeenActivityDate = new Date(Date.parse(item.lastSeenActivityDate) + 1000).toISOString();
        memberships.emit('seen', { data: { roomId: item.id } });
      }, 60 + i * 10);
    };
  `);
  const f = await coordinator(t, contents);
  await f.until(() => f.snapshots.length >= 2);
  const initialHealth = [...f.health];
  const final = '2026-11-09T11:00:16.000Z';
  await f.until(() => f.snapshots.at(-1)?.[0]?.lastSeen === final);
  const changed = f.snapshots.filter(rooms => rooms[0]?.lastSeen !== '2026-11-09T11:00:00.000Z');
  assert.ok(changed.length >= 2 && changed.length <= 8, 'a continuous stream publishes bounded intermediate states, not just a trailing debounce');
  assert.notEqual(changed[0]![0]!.lastSeen, final);
  assert.equal(f.health.at(-1), 'live'); assert.deepEqual(f.health, initialHealth);
});

test('repeated SDK errors and unchanged periodic refreshes publish health only at real transitions', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', '').replace('return Object.assign(new EventEmitter(),', `
    const sdk = new EventEmitter();
    setTimeout(() => { for (let i = 0; i < 128; i++) sdk.emit('error', new Error('PRIVATE duplicate event')); }, 60);
    return Object.assign(sdk,`);
  const f = await coordinator(t, contents, true);
  await f.until(() => f.snapshots.length >= 5 && f.health.at(-1) === 'polling');
  assert.deepEqual(f.health.slice(-2), ['live', 'polling']);
  assert.ok(f.health.length <= 3 && f.health.every((value, index) => index === 0 || value !== f.health[index - 1]));
  assert.deepEqual(f.failures, []);
});

test('unchanged healthy periodic full snapshots keep the parent watchdog alive without repeated health', { timeout: 10_000 }, async t => {
  const timeout = globalThis.setTimeout;
  // Scale the parent's 100-second watchdog to 100ms, and the isolated worker's
  // 60-second reconciliation to 40ms. All SDK calls are settled local fakes.
  t.mock.method(globalThis, 'setTimeout', ((fn: (...args: any[]) => void, ms?: number, ...args: any[]) => timeout(fn, ms === 100_000 ? 100 : ms, ...args)) as typeof setTimeout);
  const f = await coordinator(t, steady.replace('REPLACE', ''), true);
  await f.until(() => f.snapshots.length >= 10 || f.failures.length > 0);
  assert.deepEqual(f.failures, [], 'snapshot batching/dedup must not turn a healthy unchanged session into heartbeat-timeout');
  assert.ok(f.snapshots.length >= 10);
  assert.ok(f.snapshots.every(rooms => JSON.stringify(rooms) === JSON.stringify(f.snapshots[0])));
  const snapshots = f.packets.filter(packet => packet.value.type === 'snapshot');
  assert.ok(snapshots.at(-1)!.time - snapshots[0]!.time >= 200, 'exercise multiple complete watchdog windows');
  assert.equal(f.health.at(-1), 'live');
  assert.ok(f.health.length <= 2 && new Set(f.health).size === f.health.length, 'unchanged health is not used as a hidden heartbeat');
});

test('successful receipt completion immediately flushes already-observed metadata before its read response', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    let complete;
    memberships.updateLastSeen = () => new Promise(resolve => { complete = resolve; });
    memberships.listen = async () => setTimeout(() => memberships.emit('seen', { data: { roomId: item.id } }), 80);
    rooms.getWithReadStatus = async () => {
      item.lastSeenActivityDate = item.lastActivityDate;
      setImmediate(() => complete());
      return { ...item };
    };
  `);
  const f = await coordinator(t, contents);
  await f.until(() => f.snapshots.length >= 2);
  await f.source.markRead('healthy-room', 'synthetic-message');
  assert.equal(f.snapshots.at(-1)![0]!.lastSeen, itemTime, 'the metadata timer does not leave completion behind an older snapshot');
  const read = f.packets.findIndex(packet => packet.value.type === 'read');
  assert.equal(f.packets[read - 1]!.value.type, 'snapshot'); assert.equal(f.packets[read]!.value.ok, true);
  assert.deepEqual(f.failures, []);
});

const nativeReporting = (contents: string) => contents.replace("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict'; import { writeFileSync } from 'node:fs';");
for (const operation of ['room', 'full'] as const) test(`never-settling native ${operation} lookup stops the worker rather than admitting orphaned replacements`, { timeout: 10_000 }, async t => {
  const contents = nativeReporting(steady.replace('REPLACE', `
    let gets = 0, active = 0, maxActive = 0;
    const report = () => writeFileSync(REPORT_PATH, JSON.stringify({ gets, lists, active, maxActive }));
    const hung = () => { active++; maxActive = Math.max(active, maxActive); report(); return new Promise(() => {}); };
    ${operation === 'room' ? `
      rooms.getWithReadStatus = () => { gets++; return hung(); };
      memberships.listen = async () => { for (let i = 0; i < 20; i++) setTimeout(() => memberships.emit('seen', { data: { roomId: item.id } }), 10 + i * 10); };
    ` : `
      const original = rooms.listWithReadStatus;
      rooms.listWithReadStatus = async () => { const result = await original(); report(); return lists >= 3 ? hung() : result; };
    `}
  `));
  const f = await coordinator(t, contents, true, { fastDeadline: true });
  await f.until(() => f.failures.length > 0);
  const exited = f.child.exitCode === null && f.child.signalCode === null ? once(f.child, 'exit') : undefined;
  await assert.rejects(f.source.markRead('healthy-room', 'synthetic-message'), /unavailable/);
  await exited;
  const report = await f.report();
  assert.equal(report.active, 1); assert.equal(report.maxActive, 1);
  assert.equal(report.gets, operation === 'room' ? 1 : 0);
  if (operation === 'full') assert.equal(report.lists, 3, 'no second full lookup while the original native promise is still pending');
  assert.deepEqual(f.failures, ['sdk-error']);
  assert.ok(!f.health.includes('room-unavailable') && !f.health.includes('refresh-unavailable'), 'a deadline is fatal, not evidence of a settled inaccessible room');
});

test('never-settling listener setup preserves initial readiness but then closes native admission at its deadline', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', '').replace('listen: async () => {}', 'listen: () => new Promise(() => {})');
  const f = await coordinator(t, contents, false, { fastDeadline: true });
  assert.equal(f.snapshots.length, 1, 'the initial snapshot does not wait for event listeners');
  await f.until(() => f.failures.length > 0);
  assert.deepEqual(f.failures, ['initial-snapshot:deadline']);
  assert.equal(f.snapshots.length, 1, 'no gap-closing fetch is admitted after the listener deadline');
  await assert.rejects(f.source.markRead('healthy-room', 'synthetic-message'), /unavailable/);
});

test('an early listener rejection cannot orphan another never-settling native listener', { timeout: 10_000 }, async t => {
  const contents = steady.replace('REPLACE', `
    rooms.listen = async () => { throw new Error('PRIVATE listener rejection'); };
    memberships.listen = () => new Promise(() => {});
  `);
  const f = await coordinator(t, contents, true, { fastDeadline: true });
  await f.until(() => f.failures.length > 0);
  assert.deepEqual(f.failures, ['initial-snapshot:deadline']);
  assert.equal(f.snapshots.length, 1, 'the early rejection does not release new polling admission before all native listeners settle');
});

test('never-settling real-coordinator receipt has one admission, immediate uncertainty and bounded worker teardown', { timeout: 10_000 }, async t => {
  const contents = nativeReporting(steady.replace('REPLACE', `
    memberships.updateLastSeen = () => { receipts++; writeFileSync(REPORT_PATH, JSON.stringify({ receipts })); return new Promise(() => {}); };
  `).replace('mercury: { disconnect: async () => {} }', 'mercury: { disconnect: () => new Promise(() => {}) }'));
  const f = await coordinator(t, contents, false, { fastDeadline: true });
  const pending = f.source.markRead('healthy-room', 'synthetic-message');
  await assert.rejects(f.source.markRead('healthy-room', 'second-message'), /pending/);
  await assert.rejects(pending, /nothing was retried/);
  assert.equal(f.child.exitCode, null, 'uncertainty is reported before a hung SDK cleanup can finish');
  const exited = f.child.exitCode === null && f.child.signalCode === null ? once(f.child, 'exit') : undefined;
  await exited;
  assert.equal(f.child.exitCode, 0, 'the worker hard-stop bounds hung native I/O/cleanup without needing the parent SIGKILL fallback');
  assert.deepEqual(await f.report(), { receipts: 1 }); assert.deepEqual(f.failures, ['receipt']);
  assert.equal(f.packets.filter(packet => packet.value.type === 'read').length, 1);
  assert.equal(f.packets.find(packet => packet.value.type === 'read')!.value.ok, false);
});

test('a native result settling after its deadline cannot publish stale metadata or admit pending room updates', { timeout: 10_000 }, async t => {
  const contents = nativeReporting(steady.replace('REPLACE', `
    let gets = 0;
    rooms.getWithReadStatus = () => {
      gets++; writeFileSync(REPORT_PATH, JSON.stringify({ gets }));
      return new Promise(resolve => setTimeout(() => resolve({ ...item, title: 'LATE forbidden metadata' }), 120));
    };
    memberships.listen = async () => setTimeout(() => {
      memberships.emit('seen', { data: { roomId: item.id } });
      memberships.emit('seen', { data: { roomId: 'queued-room' } });
    }, 10);
  `).replace('mercury: { disconnect: async () => {} }', 'mercury: { disconnect: () => new Promise(resolve => setTimeout(resolve, 200)) }'));
  const f = await coordinator(t, contents, false, { fastDeadline: true });
  await f.until(() => f.failures.length > 0);
  const before = f.packets.length;
  if (f.child.exitCode === null && f.child.signalCode === null) await once(f.child, 'exit');
  assert.equal(f.packets.length, before, 'no worker IPC is emitted after failure, including late native resolutions');
  assert.deepEqual(await f.report(), { gets: 1 });
  assert.ok(!JSON.stringify(f.snapshots).includes('LATE')); assert.deepEqual(f.failures, ['sdk-error']);
});
