import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { UpcomingAgenda, type AgendaSession } from '../src/upcoming-agenda.js';
import { WebexUpcomingMeetingsProvider } from '../src/upcoming-meetings.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const card = (title = 'Current agenda') => ({
  id: 'meeting', title, meetingType: 'meetingSeries', state: 'active',
  start: new Date(NOW + 120_000).toISOString(), end: new Date(NOW + 3600_000).toISOString(),
  webLink: 'https://example.webex.com/meet/synthetic',
});
const response = (title?: string) => new Response(JSON.stringify({ items: [card(title)] }));
const session = (id: string, active = () => true): AgendaSession => ({
  credentials: { accountId: id, grantedScopes: ['meeting:schedules_read'], token: () => 'SYNTHETIC' },
  signal: new AbortController().signal, active,
});
async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await setImmediate();
  assert.ok(predicate(), 'bounded feature work settled');
}
function fixture(t: TestContext) {
  let now = NOW, calls = 0, created = 0;
  let reply = async () => response();
  const changes: ReturnType<UpcomingAgenda['snapshot']>[] = [];
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const agenda = new UpcomingAgenda({
    create: credentials => {
      created++;
      return new WebexUpcomingMeetingsProvider({
        enabled: true, session: credentials, now: () => now,
        fetcher: async (url, options) => {
          assert.equal(new URL(String(url)).origin, 'https://webexapis.com');
          assert.equal(options?.method, 'GET'); calls++;
          return reply();
        },
      });
    },
    changed: () => changes.push(agenda.snapshot()),
  });
  t.after(() => agenda.stop());
  return { agenda, changes, calls: () => calls, created: () => created,
    clock: (value: number) => { now = value; }, reply: (value: typeof reply) => { reply = value; } };
}

test('agenda lifecycle works without an editor engine, OAuth object, messaging store or RPC', async t => {
  const f = fixture(t);
  assert.equal(f.created(), 0); assert.equal(f.agenda.snapshot().state, 'off');
  f.agenda.start(session('one'));
  await f.agenda.refresh();
  const ready = f.agenda.snapshot();
  assert.equal(ready.state, 'ready'); assert.equal(ready.items[0]!.title, 'Current agenda');
  assert.deepEqual(f.changes.map(value => value.state), ['loading', 'ready']);
  assert.equal(f.calls(), 1); assert.equal(f.created(), 1);
  assert.ok(!JSON.stringify(ready).includes('webex.com'), 'published rows never carry action URLs');
  assert.equal(f.agenda.joinTarget('meeting', ready.revision), card().webLink);
  const count = f.changes.length;
  for (let i = 0; i < 20; i++) await f.agenda.refresh();
  assert.equal(f.calls(), 1); assert.equal(f.changes.length, count, 'successful cache hits cause no redraws');
  const edited = f.agenda.snapshot(); edited.items[0]!.title = 'Foreign'; edited.items.length = 0;
  assert.deepEqual(f.agenda.snapshot(), ready, 'snapshots are detached, pure committed data');
});

test('credential renewal reuses physical provider admission but replaces callback ownership', async t => {
  const f = fixture(t);
  let release!: (response: Response) => void;
  f.reply(() => new Promise(resolve => { release = resolve; }));
  f.agenda.start(session('one'));
  const old = f.agenda.refresh();
  await eventually(() => !!release);
  const loading = f.agenda.snapshot();
  f.agenda.start(session('renewed'));
  f.reply(async () => response('Renewed owner'));
  await f.agenda.refresh();
  const current = f.agenda.snapshot(), events = f.changes.length;
  release(response('Abandoned owner')); await old; await setImmediate();
  assert.equal(f.created(), 1, 'session updates do not create a second provider/physical queue');
  assert.equal(f.calls(), 2); assert.equal(current.items[0]!.title, 'Renewed owner');
  assert.deepEqual(f.agenda.snapshot(), current); assert.equal(f.changes.length, events);
  assert.equal(f.agenda.joinTarget('meeting', loading.revision), undefined);
});

test('session replacement cannot refill or publish an old-session agenda', async t => {
  const f = fixture(t);
  let release!: (response: Response) => void;
  f.reply(() => new Promise(resolve => { release = resolve; }));
  f.agenda.start(session('one')); const old = f.agenda.refresh();
  await eventually(() => !!release);
  f.agenda.stop();
  assert.equal(f.agenda.snapshot().state, 'off');
  f.agenda.start(session('two')); f.reply(async () => response('New account'));
  await f.agenda.refresh();
  const current = f.agenda.snapshot(), events = f.changes.length;
  release(response('Old account')); await old; await setImmediate();
  assert.equal(f.created(), 2); assert.deepEqual(f.agenda.snapshot(), current);
  assert.equal(current.items[0]!.title, 'New account'); assert.equal(f.changes.length, events);
});

test('one local clock commits expiry while snapshot remains pure and stop removes scheduled work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t); let active = false;
  f.agenda.start(session('one', () => active));
  await f.agenda.refresh(); assert.equal(f.calls(), 0, 'connecting is not active read authority');
  active = true; await f.agenda.refresh();
  const ready = f.agenda.snapshot();
  f.clock(NOW + 61_000);
  assert.deepEqual(f.agenda.snapshot(), ready, 'snapshot cannot secretly advance a feature revision');
  t.mock.timers.tick(15_000);
  assert.ok(f.changes.some(value => value.state === 'stale' && !value.items[0]!.joinable));
  await eventually(() => f.agenda.snapshot().state === 'ready');
  f.clock(NOW + 5 * 60_000 + 120_001);
  assert.equal(f.agenda.joinTarget('meeting', ready.revision), undefined);
  assert.equal(f.agenda.snapshot().items.length, 0, 'action-time reconciliation removes expired rows');
  f.agenda.stop(); const stopped = f.agenda.snapshot(), calls = f.calls(), events = f.changes.length;
  t.mock.timers.tick(600_000); await setImmediate();
  assert.equal(f.calls(), calls); assert.equal(f.changes.length, events);
  assert.deepEqual(f.agenda.snapshot(), stopped);
});
