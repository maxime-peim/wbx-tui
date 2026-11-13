import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { DemoReactions } from '../src/demo-reactions.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';
import { ReactionReadError, type ReactionCommand, type ReactionSnapshot, type ReactionBatch } from '../src/reaction-contracts.js';
import type { ReadStatusSource } from '../src/read-status.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(t: TestContext, source?: ReadStatusSource) {
  let forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { forbidden++; throw Error('NETWORK FORBIDDEN'); });
  t.mock.method(net.Socket.prototype, 'connect', function () { forbidden++; throw Error('SOCKET FORBIDDEN'); });
  const calls: ReactionCommand[] = [], gates: ReturnType<typeof deferred>[] = [];
  type Plan = { action: ReactionCommand['action']; apply?: boolean; fail?: boolean; result?: unknown;
    gate?: ReturnType<typeof deferred>; started: ReturnType<typeof deferred> };
  const plans: Plan[] = [], original = DemoReactions.prototype.reaction;
  t.mock.method(DemoReactions.prototype, 'reaction', async function (this: DemoReactions, command: ReactionCommand) {
    calls.push({ ...command });
    const index = plans.findIndex(plan => plan.action === command.action), plan = index < 0 ? undefined : plans.splice(index, 1)[0];
    const applied = plan?.apply ? await original.call(this, command) : undefined;
    plan?.started.resolve(); if (plan?.gate) await plan.gate.promise;
    if (plan?.fail) throw command.action === 'summary' ? new ReactionReadError('summary:network') : Error('PRIVATE synthetic write failure');
    if (plan && 'result' in plan) return plan.result;
    return plan?.apply ? applied : original.call(this, command);
  });
  const engine = new EditorEngine(async () => assert.fail('BROWSER FORBIDDEN'), source ? () => source : undefined);
  const packets: any[] = [], rpc = new EditorRPC(engine, new EditorMeetings(), value => packets.push(value));
  const deliveries: unknown[] = [], states: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('state', value => states.push(value));
  let id = 0;
  const call = async (method: string, params = {}) => {
    const request = ++id; await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }));
    const reply = packets.find(packet => packet.id === request); assert.ok(reply, method); return reply;
  };
  const send = async (method: string, params = {}) => {
    const reply = await call(method, params); assert.ok(!reply.error, method + ': ' + JSON.stringify(reply.error)); return reply.result;
  };
  t.after(async () => { for (const gate of gates) gate.resolve(); engine.stop(); await rpc.close(); });
  await send('hello', { version: 1 });
  return { engine, calls, call, send, deliveries, states, forbidden: () => forbidden,
    async start() { await send('session.start', { mode: 'demo' }); await send('rooms.select', { roomId: 'demo-general' }); },
    target() { return { roomId: engine.snapshot().room!.id, messageId: engine.snapshot().messages[0]!.id, internalConsent: true }; },
    plan(action: ReactionCommand['action'], options: Omit<Plan, 'action' | 'started'> = {}) {
      plans.push({ action, ...options, started: deferred() });
    },
    hold(action: ReactionCommand['action'], apply = false) {
      const gate = deferred(), started = deferred(); gates.push(gate); plans.push({ action, apply, gate, started });
      return { started: started.promise, release: gate.resolve };
    },
    async prepare(action = 'add', reaction = 'heart') {
      return send('messages.reactionPrepare', { roomId: engine.snapshot().room!.id, messageId: engine.snapshot().messages[0]!.id,
        internalConsent: true, action, reaction });
    },
    writes: () => calls.filter(command => command.action !== 'summary').length,
  };
}
const submit = (target: object, contextId: string, requestId: string) => ({ ...target, contextId, requestId, confirmed: true });

test('ordinary demo reaction RPC summary/batch inspect add replay and own remove preserve history and never publish delivery or read state', async t => {
  const f = await fixture(t); await f.start();
  const target = f.target(), before = f.engine.snapshot(), states = f.states.length;
  assert.equal((await f.call('messages.reactions', { ...target, internalConsent: false })).error.code, -32602);
  const batch = await f.send('messages.reactionsBatch', { roomId: target.roomId,
    messageIds: before.messages.map(item => item.id), internalConsent: true });
  assert.equal(batch.items.length, before.messages.length);
  const prepared = await f.prepare(), params = submit(target, prepared.contextId, 'ordinary-add');
  assert.equal(f.writes(),0,'preparation is read-only and normal Add requires no inspection');
  assert.equal((await f.call('messages.reactionSubmit', { ...params, confirmed: false })).error.code, -32602);
  const other = before.messages[1]!.id;
  assert.equal((await f.call('messages.reactionSubmit', { ...params, messageId: other })).error.code, -32034);
  const outcome = await f.send('messages.reactionSubmit', params); assert.equal(outcome.status, 'changed');
  assert.deepEqual(await f.send('messages.reactionSubmit', params), outcome); assert.equal(f.writes(), 1);
  const summary = await f.send('messages.reactions', target); assert.equal(summary.groups[0].count, 1);
  const removal = await f.prepare('remove');
  assert.equal((await f.send('messages.reactionSubmit', submit(target, removal.contextId, 'ordinary-remove'))).status, 'changed');
  assert.equal(f.calls.at(-1)!.own, summary.groups[0].own, 'fresh exact own handle reaches the synthetic provider');
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []);
  assert.deepEqual(f.engine.snapshot(), before); assert.equal(f.states.length, states);
  assert.deepEqual(f.deliveries, []); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions ordinary add remove', writes: f.writes(), replayedWrites: 0,
    statePublications: 0, deliveries: 0, networkRequests: 0 }));
});

test('ordinary demo reaction RPC read failure preserves history and only a later explicit read recovers', async t => {
  const f = await fixture(t); await f.start(); const before = f.engine.snapshot(), target = f.target();
  f.plan('summary', { fail: true });
  const failure = await f.call('messages.reactions', target); assert.equal(failure.error.code, -32034);
  assert.match(failure.error.message, /summary:network/); assert.doesNotMatch(JSON.stringify(failure), /PRIVATE/);
  await turn(); assert.equal(f.calls.length, 1); assert.deepEqual(f.engine.snapshot(), before);
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []);
  await f.send('messages.reactionResolve', { ...target, checked: true });
  const prepared = await f.prepare();
  assert.equal((await f.send('messages.reactionSubmit', submit(target, prepared.contextId, 'read-recovery'))).status, 'changed');
  assert.equal(f.writes(), 1); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions read recovery', automaticRetries: 0, explicitRecoveryReads: 1, historyUnchanged: true }));
});

test('ordinary demo reaction RPC refused write replays its failed result and a new explicit preparation recovers', async t => {
  const f = await fixture(t); await f.start(); const target = f.target();
  await f.send('messages.reactionResolve', { ...target, checked: true });
  const prepared = await f.prepare(); f.plan('add', { result: { status: 'failed' } });
  const params = submit(target, prepared.contextId, 'refused-write'), failed = await f.send('messages.reactionSubmit', params);
  assert.equal(failed.status, 'failed'); await turn(); assert.equal(f.writes(), 1);
  assert.deepEqual(await f.send('messages.reactionSubmit', params), failed); assert.equal(f.writes(), 1);
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []);
  const retry = await f.prepare();
  assert.equal((await f.send('messages.reactionSubmit', submit(target, retry.contextId, 'explicit-retry'))).status, 'changed');
  assert.equal((await f.send('messages.reactions', target)).groups[0].count, 1);
  assert.equal(f.writes(), 2); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions refused write recovery', admittedWrites: 2, replayedWrites: 0, automaticRetries: 0 }));
});

test('ordinary demo reaction RPC possible write requires exact-request resolution even when a fresh summary shows the own reaction', async t => {
  const f = await fixture(t); await f.start(); const target = f.target();
  await f.send('messages.reactionResolve', { ...target, checked: true });
  const prepared = await f.prepare(); f.plan('add', { apply: true, fail: true });
  const params = submit(target, prepared.contextId, 'possible-write'), result = await f.send('messages.reactionSubmit', params);
  assert.equal(result.status, 'unknown'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  await turn(); assert.equal(f.writes(), 1);
  assert.equal((await f.send('messages.reactions', target)).groups[0].count, 1, 'real synthetic state changed before response loss');
  assert.equal((await f.call('messages.reactionPrepare', { ...target, action: 'remove', reaction: 'heart' })).error.code, -32034);
  for (const requestId of [undefined, 'wrong-request'])
    assert.equal((await f.call('messages.reactionResolve', { ...target, checked: true, ...(requestId ? { requestId } : {}) })).error.code, -32034);
  assert.deepEqual(await f.send('messages.reactionSubmit', params), result); assert.equal(f.writes(), 1);
  await f.send('messages.reactionResolve', { ...target, checked: true, requestId: 'possible-write' });
  const removal = await f.prepare('remove');
  assert.equal((await f.send('messages.reactionSubmit', submit(target, removal.contextId, 'checked-removal'))).status, 'changed');
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []);
  assert.deepEqual(await f.send('messages.reactionSubmit', params), result, 'explicit resolution never rewrites historical unknown outcomes');
  assert.equal(f.writes(), 2); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions unknown write recovery', admittedWrites: 2,
    automaticRetries: 0, summaryUnlocks: 0, wrongRequestResolutions: 0 }));
});

test('ordinary demo reaction RPC session replacement preserves synthetic groups but revokes old preparations', async t => {
  const f = await fixture(t); await f.start(); const target = f.target();
  await f.send('messages.reactionResolve', { ...target, checked: true });
  const prepared = await f.prepare(), original = submit(target, prepared.contextId, 'before-replacement');
  await f.send('messages.reactionSubmit', original);
  const stale = await f.prepare('remove'), session = f.engine.snapshot().localContext!.sessionId;
  await f.send('session.stop'); await f.start();
  assert.notEqual(f.engine.snapshot().localContext!.sessionId, session); assert.deepEqual(f.target(), target);
  assert.equal((await f.send('messages.reactions', target)).groups[0].count, 1, 'preserve the existing engine-lifetime synthetic map, not an invented reset');
  assert.equal((await f.call('messages.reactionSubmit', submit(target, stale.contextId, 'stale-preparation'))).error.code, -32034);
  const writes = f.writes(); assert.equal((await f.send('messages.reactionSubmit', original)).status, 'changed');
  assert.equal(f.writes(), writes, 'retained outcomes replay without restoring preparation authority');
  const removal = await f.prepare('remove'); await f.send('messages.reactionSubmit', submit(target, removal.contextId, 'after-replacement'));
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions session replacement', syntheticGroupsRetained: true,
    oldPreparationWrites: 0, summaryUnlocks: 0, explicitRemovalWorks: true }));
});

test('ordinary demo reaction RPC held read stays physically admitted through replacement and explicit reading recovers after settlement', async t => {
  const f = await fixture(t); await f.start(); const target = f.target(), held = f.hold('summary');
  const pending = f.call('messages.reactions', target); await held.started;
  await f.send('session.stop'); await f.start(); const before = f.engine.snapshot();
  assert.equal((await f.call('messages.reactions', target)).error.code, -32034);
  assert.equal(f.calls.length, 1, 'replacement cannot start a second physical reaction read');
  held.release(); assert.equal((await pending).error.code, -32034);
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual((await f.send('messages.reactions', target)).groups, []);
  assert.equal(f.calls.length, 2); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions held read replacement', oldReadAccepted: false,
    overlappingProviderReads: 0, explicitNewReadWorks: true }));
});

for (const stage of ['before-apply', 'after-apply'] as const) test(`ordinary demo reaction RPC held write ${stage} retains uncertainty/admission across session replacement`, async t => {
  const f = await fixture(t); await f.start(); const target = f.target();
  await f.send('messages.reactionResolve', { ...target, checked: true }); const prepared = await f.prepare();
  const held = f.hold('add', stage === 'after-apply'), params = submit(target, prepared.contextId, 'held-write');
  const pending = f.send('messages.reactionSubmit', params); await held.started;
  await f.send('session.stop'); await f.start(); const before = f.engine.snapshot();
  assert.equal((await f.call('messages.reactions', target)).error.code, -32034);
  assert.equal((await f.call('messages.reactionResolve', { ...target, checked: true, requestId: 'held-write' })).error.code, -32034);
  assert.equal((await f.call('messages.send', { requestId: 'blocked-send', roomId: target.roomId, text: 'Not queued' })).error.code, -32002);
  assert.equal(f.writes(), 1, 'held write owns admission even after logical reset');
  held.release(); const outcome = await pending; assert.equal(outcome.status, 'unknown');
  assert.deepEqual(f.engine.snapshot(), before); assert.deepEqual(f.deliveries, []);
  assert.equal((await f.send('messages.reactions', target)).groups[0].count, 1);
  assert.equal((await f.call('messages.reactionResolve', { ...target, checked: true, requestId: 'wrong-request' })).error.code, -32034);
  assert.deepEqual(await f.send('messages.reactionSubmit', params), outcome); assert.equal(f.writes(), 1);
  await f.send('messages.reactionResolve', { ...target, checked: true, requestId: 'held-write' });
  const removal = await f.prepare('remove');
  assert.equal((await f.send('messages.reactionSubmit', submit(target, removal.contextId, 'new-session-removal'))).status, 'changed');
  assert.deepEqual((await f.send('messages.reactions', target)).groups, []); assert.equal(f.writes(), 2); assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'RPC demo reactions held write replacement ' + stage,
    oldWriteAcceptedAsChanged: false, admittedWrites: 2, overlappingWrites: 0, automaticRetries: 0, exactRequestRecovery: true }));
});

test('reaction composition retains live grant/source dispatch and never falls back to demo state on source failure', async t => {
  const base = await mkdtemp('/tmp/opencode/wbx-demo-reactions-live-'), config = join(base, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'PRIVATE',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } }), { mode: 0o600 });
  let reads = 0, batches = 0, failed = false;
  const snapshot = (roomId: string, messageId: string): ReactionSnapshot => ({
    roomId, messageId, observedAt: Date.now(), partial: false, unknown: false, groups: [],
  });
  const source: ReadStatusSource = { onRooms() {}, onFailure() {}, async start() {}, close() {},
    async markRead() { assert.fail('RECEIPT FORBIDDEN'); },
    async reaction(command) { reads++; if (failed) throw new ReactionReadError('worker:network'); return snapshot(command.roomId, command.messageId); },
    async reactions(batch: ReactionBatch) { batches++; return { roomId: batch.roomId, items: batch.messageIds.map(id => snapshot(batch.roomId, id)) }; } };
  const f = await fixture(t, source); t.after(() => rm(base, { recursive: true, force: true }));
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'SYNTHETIC-PRIVATE', scope: 'spark:all', expiresAt: Date.now() + 3600_000 }));
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'r', title: 'Synthetic live-mode room', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [{ id: 'm', author: 'Synthetic', text: 'Synthetic live-mode history', created: '' }] }));
  await f.send('session.start', { mode: 'live', config, readStatus: true }); await f.send('rooms.select', { roomId: 'r' });
  await f.send('messages.reactions', f.target());
  await f.send('messages.reactionsBatch', { roomId: 'r', messageIds: ['m'], internalConsent: true });
  failed = true; assert.equal((await f.call('messages.reactions', f.target())).error.code, -32034);
  assert.equal(reads, 2); assert.equal(batches, 1); assert.equal(f.calls.length, 0, 'a failed live provider cannot use synthetic empty state');
  await f.send('session.stop'); await f.start();
  assert.deepEqual((await f.send('messages.reactions', f.target())).groups, []); assert.equal(f.calls.length, 1);
  assert.equal(f.forbidden(), 0);
  t.diagnostic(JSON.stringify({ workflow: 'demo reactions live source composition', liveReads: reads, liveBatches: batches,
    demoFallbacks: 0, demoSourceReads: 0, networkRequests: 0 }));
});
