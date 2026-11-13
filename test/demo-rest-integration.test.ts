import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import net from 'node:net';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { OAuthSession } from '../src/oauth.js';
import { PublicProblem, type ActionREST, type PublicRequest } from '../src/public-rest.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(t: TestContext, publicRequest: PublicRequest = () => assert.fail('No demo native request')) {
  let forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(net.Socket.prototype, 'connect', function () { forbidden++; throw Error('SOCKET FORBIDDEN'); });
  const calls: { store: number; action: string }[] = [], stores: Store[] = [];
  const plans: { action: string; reason?: 'failed' | 'unknown'; gate?: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> }[] = [];
  class Store extends MessagingStore {
    override async demoConversation(action: string, input: Record<string, unknown>) {
      calls.push({ store: stores.indexOf(this), action });
      const at = plans.findIndex(plan => plan.action === action), plan = at < 0 ? undefined : plans.splice(at, 1)[0];
      plan?.started.resolve(); if (plan?.gate) await plan.gate.promise;
      if (plan?.reason) throw new PublicProblem(plan.reason);
      return super.demoConversation(action, input);
    }
    override async demoMessageAction(...args: Parameters<MessagingStore['demoMessageAction']>) {
      calls.push({ store: stores.indexOf(this), action: 'message-' + args[2] }); return super.demoMessageAction(...args);
    }
  }
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), undefined, undefined, undefined, undefined, undefined,
    { publicRequest, messaging: (api, poll, mode) => { const store = new Store(api, poll, mode); stores.push(store); return store; } });
  const packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  const deliveries: unknown[] = []; engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  let id = 0;
  const call = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(packet => packet.id === request); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  const held: ReturnType<typeof deferred>[] = [];
  t.after(async () => { for (const gate of held) gate.resolve(); engine.stop(); await rpc.close(); });
  await send('hello', { version: 1 });
  return { engine, call, send, calls, stores, deliveries, forbidden: () => forbidden,
    fail(action: string, reason: 'failed' | 'unknown') { plans.push({ action, reason, started: deferred() }); },
    hold(action: string) {
      const gate = deferred(), started = deferred(); plans.push({ action, gate, started }); held.push(gate);
      return { started: started.promise, release: gate.resolve };
    },
  };
}

test('ordinary demo RPC directory/profile/roster/team/query reads use the adapter without changing selected history or delivery', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const before = f.engine.snapshot();
  const directory = await f.send('people.search', { query: 'Demo' });
  assert.equal(directory.items.length, 2);
  const person = await f.send('people.profile', { personId: directory.items[0].personId });
  assert.equal(person.fields.displayName, 'Participant · DEMO');
  assert.equal((await f.send('members.list')).items.length, 2);
  assert.ok((await f.send('teams.joined')).items.length >= 2);
  assert.equal((await f.send('messages.mentions', { roomId: 'demo-general' })).items.length, 1);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.deliveries, []); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter read workflows', independentReads: 5, stateChanges: 0, deliveries: 0, nativeRequests: 0 }));
});

test('ordinary demo RPC create/select/rename/description and invite/remove stay explicit and replay-safe', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' });
  assert.equal((await f.call('rooms.create', { requestId: 'not-confirmed', title: 'Not created' })).error.code, -32602);
  const created = await f.send('rooms.create', { requestId: 'create-one', title: 'Adapter created space', confirmed: true });
  assert.equal(created.status, 'changed'); await f.send('rooms.select', { roomId: created.roomId });
  const before = f.engine.snapshot(), rename = { requestId: 'rename-one', roomId: created.roomId, expectedTitle: before.room!.title, title: 'Adapter renamed space', confirmed: true };
  assert.equal((await f.send('rooms.rename', rename)).status, 'changed');
  const calls = f.calls.length; await f.send('rooms.rename', rename); assert.equal(f.calls.length, calls);
  assert.equal(f.engine.snapshot().room!.title, rename.title); assert.deepEqual(f.engine.snapshot().messages, before.messages);
  const prepared = await f.send('rooms.descriptionPrepare', { roomId: created.roomId });
  const description = 'Exact synthetic description';
  assert.equal((await f.send('rooms.describe', { requestId: 'describe-one', roomId: created.roomId, expectedTitle: prepared.expectedTitle,
    expectedDescription: prepared.expectedDescription, description, confirmed: true })).status, 'changed');
  const current = await f.send('rooms.descriptionPrepare', { roomId: created.roomId });
  assert.equal(current.expectedDescription, description);
  assert.equal((await f.send('rooms.descriptionClear', { requestId: 'clear-one', roomId: created.roomId,
    expectedTitle: current.expectedTitle, expectedDescription: description, confirmed: true })).status, 'changed');
  assert.equal((await f.send('members.action', { requestId: 'invite-one', action: 'invite', roomId: created.roomId, target: 'demo-invited', confirmed: true })).status, 'changed');
  const roster = await f.send('members.list'), invited = roster.items.find((item: any) => item.personId === 'demo-invited');
  assert.ok(invited);
  assert.equal((await f.send('members.action', { requestId: 'remove-no-role', action: 'remove', roomId: created.roomId, target: invited.id, confirmed: true })).status, 'failed');
  assert.equal((await f.send('rooms.lock', { requestId: 'moderate-one', roomId: created.roomId, expectedTitle: rename.title,
    expectedLocked: false, locked: true, confirmed: true })).status, 'changed');
  const freshRoster = await f.send('members.list');
  assert.equal(freshRoster.items.find((item: any) => item.personId === 'demo-self').moderator, true, 'remove needs fresh explicit demo moderator evidence, not creator inference');
  assert.equal((await f.send('members.action', { requestId: 'remove-one', action: 'remove', roomId: created.roomId, target: invited.id, confirmed: true })).status, 'changed');
  assert.equal((await f.send('members.list')).items.some((item: any) => item.id === invited.id), false);
  assert.deepEqual(f.deliveries, []); assert.equal(f.forbidden(), 0);
  assert.equal(f.calls.filter(call => call.action === 'rename').length, 1);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter conversation workflows', explicitMutations: 7, replayedRenameWrites: 0, deliveries: 0, nativeRequests: 0 }));
});

test('ordinary demo RPC own-message edit/delete preserve exact target and do not become a second delivery', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const foreign = f.engine.snapshot().messages[0]!.id;
  assert.equal((await f.call('messages.actionPrepare', { roomId: 'demo-general', messageId: foreign, action: 'edit' })).error.code, -32034);
  await f.send('messages.send', { requestId: 'original-send', roomId: 'demo-general', text: 'Own original adapter text' });
  const original = f.engine.snapshot().messages.at(-1)!, count = f.deliveries.length;
  const prepared = await f.send('messages.actionPrepare', { roomId: 'demo-general', messageId: original.id, action: 'edit' });
  const edit = { contextId: prepared.contextId, requestId: 'edit-one', action: 'edit', revision: 0,
    content: 'Edited adapter text', format: 'plain', conflictAccepted: true };
  assert.equal((await f.send('messages.actionSubmit', edit)).status, 'changed');
  const calls = f.calls.length; await f.send('messages.actionSubmit', edit); assert.equal(f.calls.length, calls);
  const edited = f.engine.snapshot().messages.at(-1)!;
  assert.equal(edited.id, original.id); assert.equal(edited.created, original.created); assert.equal(edited.text, edit.content);
  const removal = await f.send('messages.actionPrepare', { roomId: 'demo-general', messageId: original.id, action: 'delete' });
  assert.equal((await f.send('messages.actionSubmit', { contextId: removal.contextId, requestId: 'delete-one', action: 'delete', revision: 0, conflictAccepted: true })).status, 'changed');
  await f.send('messages.list'); assert.equal(f.engine.snapshot().messages.some(item => item.id === original.id), false);
  assert.equal(f.deliveries.length, count); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter message workflows', exactEdits: 1, exactDeletes: 1, replayedWrites: 0, extraDeliveries: 0, nativeRequests: 0 }));
});

test('ordinary demo RPC read failure leaves history usable and recovers only on an explicit read', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const before = f.engine.snapshot(); f.fail('members', 'failed');
  assert.equal((await f.call('members.list')).error.code, -32034);
  const reads = f.calls.length; await turn(); assert.equal(f.calls.length, reads);
  assert.deepEqual(f.engine.snapshot(), before);
  assert.equal((await f.send('members.list')).items.length, 2);
  await f.send('messages.list'); assert.equal(f.engine.snapshot().ready, true);
  assert.equal(f.forbidden(), 0); assert.deepEqual(f.deliveries, []);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter read failure recovery', automaticRetries: 0, explicitRecoveryReads: 1, historyReady: true, nativeRequests: 0 }));
});

test('ordinary demo RPC unknown rename retains exact-request recovery and never retries through the adapter', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const before = f.engine.snapshot(), rename = { requestId: 'unknown-one', roomId: 'demo-general', expectedTitle: before.room!.title, title: 'Explicit recovered name', confirmed: true };
  f.fail('rename', 'unknown');
  assert.equal((await f.send('rooms.rename', rename)).status, 'unknown');
  const calls = f.calls.length; await turn(); await f.send('rooms.rename', rename); assert.equal(f.calls.length, calls);
  assert.ok((await f.call('rooms.rename', { ...rename, requestId: 'blocked-new' })).error);
  assert.ok((await f.call('conversations.resolve', { action: 'rename', roomId: 'demo-general', requestId: 'wrong-request', checked: true })).error);
  assert.equal(f.calls.length, calls); assert.deepEqual(f.engine.snapshot(), before);
  await f.send('conversations.resolve', { action: 'rename', roomId: 'demo-general', requestId: 'unknown-one', checked: true });
  assert.equal((await f.send('rooms.rename', { ...rename, requestId: 'explicit-recovery' })).status, 'changed');
  assert.equal(f.engine.snapshot().room!.title, rename.title);
  assert.equal(f.calls.filter(call => call.action === 'rename').length, 2); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter unknown write recovery', admittedRenameAttempts: 2, automaticRetries: 0, wrongRequestResolutions: 0, nativeRequests: 0 }));
});

test('ordinary demo RPC held old-store read cannot publish into replacement and explicit new-store reads recover', async t => {
  const f = await fixture(t); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const oldSession = f.engine.snapshot().localContext!.sessionId, held = f.hold('members'), pending = f.call('members.list');
  await held.started;
  await f.send('session.stop'); await f.send('session.start', { mode: 'demo' }); await f.send('rooms.select', { roomId: 'demo-general' });
  const before = f.engine.snapshot(); assert.notEqual(before.localContext!.sessionId, oldSession);
  held.release(); assert.equal((await pending).error.code, -32034);
  assert.deepEqual(f.engine.snapshot(), before);
  assert.equal((await f.send('members.list')).items.length, 2);
  assert.deepEqual(f.calls.filter(call => call.action === 'members').map(call => call.store), [0, 1]);
  assert.equal(f.forbidden(), 0); assert.deepEqual(f.deliveries, []);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo adapter store replacement', lateStateChanges: 0, explicitNewStoreRecovery: true, nativeRequests: 0 }));
});

test('engine composition preserves injected native live REST, busy/settlement and mode switching without demo fallback', async t => {
  const base = await mkdtemp('/tmp/opencode/wbx-demo-rest-live-'), config = join(base, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'PRIVATE', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } }), { mode: 0o600 });
  const consumed = deferred(), close = deferred(); let nativeCalls = 0;
  const native: PublicRequest = (options, listener) => {
    nativeCalls++; assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.path, '/v1/people/live-person');
    const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
      destroy() { response.emit('close'); return response; },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ id: 'live-person', displayName: 'Injected live profile' })); consumed.resolve(); } });
    const client = Object.assign(new EventEmitter(), {
      end() { queueMicrotask(() => listener(response as any)); return client; },
      destroy() { void close.promise.then(() => client.emit('close')); return client; },
    });
    return client as any;
  };
  const f = await fixture(t, native); t.after(async () => { close.resolve(); await rm(base, { recursive: true, force: true }); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'SYNTHETIC-PRIVATE', scope: 'spark:all', expiresAt: Date.now() + 3600_000 }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  await f.send('session.start', { mode: 'live', config });
  const pending = f.send('people.profile', { personId: 'live-person' }); await consumed.promise;
  const rest = (f.engine as unknown as { actionREST: ActionREST }).actionREST;
  assert.equal(rest.busy(), true);
  let settled = false; const settlement = rest.settled!().then(() => { settled = true; });
  await turn(); assert.equal(settled, false);
  assert.ok((await f.call('people.profile', { personId: 'live-person' })).error);
  close.resolve(); const person = await pending; await settlement;
  assert.equal(person.fields.displayName, 'Injected live profile'); assert.equal(rest.busy(), false);
  await f.send('session.stop'); await f.send('session.start', { mode: 'demo' });
  assert.equal((await f.send('people.profile', { personId: 'demo-person' })).fields.displayName, 'Participant · DEMO');
  assert.equal(nativeCalls, 1); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'demo adapter live injection and composition', injectedNativeCalls: 1,
    settlementWaitsForPhysicalClose: true, overlappingNativeCalls: 0, demoNativeCalls: 0 }));
});
