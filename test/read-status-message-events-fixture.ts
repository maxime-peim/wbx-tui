// Actual pinned SDK messages.listen/getMessageEvent/get -> worker -> private IPC
// validator -> engine snapshots -> native notification routing. All sockets and
// fetch are forbidden. Only the service/request/device boundaries are synthetic.
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { readStatusOutput } from '../src/state-output.js';
import { transform } from 'esbuild';
import { join } from 'node:path';
import { createReadStatusSDK } from '../src/read-status-sdk.js';
import { ReadStatusWorker } from '../src/read-status.js';
import { SDKReactions } from '../src/reactions-sdk.js';
import { ReactionReadError } from '../src/reaction-contracts.js';
import { readMessageReaders } from '../src/readers-sdk.js';
import { SDKJoinedMeetings } from '../src/joined-meetings-sdk.js';
import { EditorEngine } from '../src/editor-engine.js';
import { chatId } from '../src/chat-protocol.js';
import * as protocol from '../src/read-status-protocol.js';
import { editorAvailable, editorBinaries, editorEnvironment, runEditorFixture } from './editor/helpers.js';

let sockets = 0;
(net.Socket.prototype as any).connect = () => { sockets++; throw new Error('All sockets forbidden in message event fixture.'); };
globalThis.fetch = async () => { sockets++; throw new Error('Fetch forbidden in message event fixture.'); };
const deadline = setTimeout(() => { console.error('Message event fixture deadline.'); process.exit(2); }, 10_000);
const credentials = { token: 'synthetic-never-live', expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' };
const previews = process.argv.includes('--preview');
const senderNames = process.argv.includes('--sender-names');
const nameConsent = previews && senderNames;
const sdk = createReadStatusSDK(credentials) as any;
const hydra = (kind: string, id: string) => Buffer.from(`ciscospark://us/${kind}/${id}`).toString('base64url');
const room = { id: 'other-room', url: 'https://offline.invalid/conversation/api/v1/conversations/other-room', tags: [], displayName: 'Other space',
  lastReadableActivityDate: '2026-11-09T12:00:00.000Z', lastSeenActivityDate: '2026-11-09T12:00:00.000Z' };
const roomId = hydra('ROOM', room.id), self = hydra('PEOPLE', 'self');
const nativeMessages = new Map<string, object>(), requests: string[] = [];
let registers = 0, receipts = 0, lookups = 0;
let lookupObserved: (() => void) | undefined;
sdk.internal.me = { id: self, orgId: 'synthetic-org' };
sdk.internal.services.waitForCatalog = async () => {};
sdk.internal.services.getClusterId = () => 'urn:TEAM:us-east-2_a';
sdk.internal.conversation._list = async () => [{ ...room }];
sdk.internal.conversation.getUrlFromClusterId = () => room.url;
sdk.internal.conversation.request = async () => { lookups++; lookupObserved?.(); return { body: { ...room } }; };
sdk.internal.device.register = async () => { registers++; };
sdk.internal.device.unregister = async () => {};
sdk.internal.mercury.connect = async () => {};
sdk.internal.mercury.disconnect = async () => {};
sdk.memberships.updateLastSeen = async () => { receipts++; throw new Error('Receipts forbidden.'); };
sdk.messages.request = async ({ resource }: { resource: string }) => {
  requests.push(resource);
  assert.ok(resource.startsWith('messages/'), 'the actual public listener fetches its individual message, never history');
  const body = nativeMessages.get(resource.slice('messages/'.length)); assert.ok(body);
  return { body };
};

const packets: any[] = [];
const owner = new ReadStatusWorker();
const adapter = owner as unknown as { receive(value: unknown): void; previews: boolean; senderNames: boolean; startup?: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } };
const workerProcess = Object.assign(new EventEmitter(), { connected: true,
  send(value: object, complete?: () => void) { packets.push(structuredClone(value)); adapter.receive(value); workerProcess.emit('packet'); complete?.(); },
  exit() { workerProcess.connected = false; workerProcess.emit('exit'); },
});
const worker = await transform(await readFile('src/read-status-worker.ts', 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22' });
const modules: Record<string, unknown> = { './chat-protocol.js': { chatId }, './read-status-protocol.js': protocol,
  './joined-meetings-sdk.js': { SDKJoinedMeetings },
  './reactions-sdk.js': { SDKReactions },
  './reaction-contracts.js': { ReactionReadError }, './readers-sdk.js': { readMessageReaders },
  './state-output.js': { readStatusOutput },
  './read-status-sdk.js': { createReadStatusSDK: () => ({ ready: true, on: sdk.on.bind(sdk), rooms: sdk.rooms,
    memberships: sdk.memberships, messages: sdk.messages, internal: sdk.internal }) } };
runInNewContext(worker.code, { process: workerProcess, setTimeout, clearTimeout,
  require(name: string) { assert.ok(name in modules); return modules[name]; } });
owner.start = async (_, preview = false, names = false) => {
  assert.equal(preview, previews, 'explicit session consent reaches the private source');
  assert.equal(names, nameConsent, 'sender identity has independent private consent');
  adapter.previews = preview;
  adapter.senderNames = names;
  const ready = new Promise<void>((resolve, reject) => {
    adapter.startup = { resolve, reject, timer: setTimeout(() => reject(new Error('Synthetic worker startup timeout.')), 2000) };
  });
  workerProcess.emit('message', { type: 'start', credentials, ...(preview ? { preview: true } : {}), ...(names ? { senderNames: true } : {}) });
  return ready;
};
const profileRequests: string[] = [];
const engine = new EditorEngine(undefined, () => owner, undefined, undefined, undefined, undefined, {
  senderFetch: async (url, options) => {
    assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    const id = decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1)!);
    assert.ok([self, hydra('PEOPLE', 'other')].includes(id), 'only public observed sender identities are looked up');
    profileRequests.push(id);
    return Response.json({ id, type: 'person', displayName: id === self ? 'Same-account sender' : 'Other sender',
      emails: ['PRIVATE_EMAIL'], avatar: 'PRIVATE_AVATAR', customStatus: 'PRIVATE_STATUS' });
  },
}), states: ReturnType<EditorEngine['snapshot']>[] = [];
engine.on('state', snapshot => states.push(structuredClone(snapshot)));
const until = async (check: () => boolean) => {
  if (check()) return;
  await new Promise<void>((resolve, reject) => {
    const clear = () => { workerProcess.off('packet', changed); engine.off('state', changed); };
    const timer = setTimeout(() => { clear(); reject(new Error('Message pipeline timeout.')); }, 3000);
    const changed = () => { if (check()) { clearTimeout(timer); clear(); resolve(); } };
    workerProcess.on('packet', changed);
    engine.on('state', changed);
  });
};
const emit = (id: string, own = false, created = new Date().toISOString()) => {
  nativeMessages.set(hydra('MESSAGE', id), { id: hydra('MESSAGE', id), roomId, created, personId: own ? self : hydra('PEOPLE', 'other'),
    text: id === 'local-own' ? 'EXCLUDED_LOCAL_SNIPPET' : 'First words\n\x1b\u202e plain <tag> & literal;$(never-run) ' + '🙂'.repeat(200) + 'PRIVATE_TAIL_NEVER_FORWARD', files: ['PRIVATE_FILE_NEVER_FORWARD'] });
  sdk.internal.mercury.trigger('event:conversation.activity', { data: { activity: { id, verb: 'post', actor: { entryUUID: own ? 'self' : 'other' },
    object: { id }, target: { id: room.id, url: room.url, tags: [] } } } });
};
const directory = await mkdtemp('/tmp/opencode/wbx-global-message-sdk-');
try {
  await engine.start('demo', undefined, true, false, false, false, previews, senderNames);
  const internal = engine as unknown as { generation: number; token: string; expiresAt: number;
    startSenderNames(access: typeof credentials): void; startReadStatus(access: typeof credentials, generation: number): Promise<void> };
  internal.token = credentials.token; internal.expiresAt = credentials.expiresAt;
  internal.startSenderNames(credentials);
  await internal.startReadStatus(credentials, internal.generation);
  await until(() => packets.filter(value => value.type === 'snapshot').length >= 2 && engine.snapshot().messageEvents.state === 'live');
  await engine.select('demo-general');
  const original = engine.snapshot().rooms.find(value => value.id === roomId)!;
  assert.equal(original.unread, false);
  emit('incoming'); emit('incoming'); emit('native-own', true); emit('local-own', true);
  await until(() => engine.snapshot().messageEvents.received === 3 && lookups > 0);
  if (nameConsent) await until(() => engine.snapshot().messageEvents.items.every(item => !!item.senderName));
  const after = engine.snapshot();
  assert.deepEqual(after.rooms.find(value => value.id === roomId), original, 'public message events do not change unchanged server-read metadata');
  assert.equal(after.room!.id, 'demo-general', 'the notified room is never selected');
  assert.equal(after.messageEvents.items.filter(value => !value.self).length, 1);
  assert.equal(after.messageEvents.items.filter(value => value.self).length, 2);
  assert.ok(!JSON.stringify(after).includes('PRIVATE_'), 'bodies/files/identities never cross the worker projection');
  for (const item of after.messageEvents.items) {
    assert.equal('senderName' in item, nameConsent);
    assert.equal('senderId' in item, false);
    if (nameConsent) assert.equal(item.senderName, item.self ? 'Same-account sender' : 'Other sender');
    assert.equal('preview' in item, previews, 'no excerpt is forwarded without explicit consent');
    if (previews && item.id === hydra('MESSAGE', 'local-own')) assert.equal(item.preview, 'EXCLUDED_LOCAL_SNIPPET');
    else if (previews) {
      assert.ok(item.preview!.startsWith('First words plain <tag> & literal;$(never-run) '));
      assert.equal(Array.from(item.preview!).length, 160);
      assert.doesNotMatch(item.preview!, /[\x00-\x1f\x7f-\x9f\u202e]/u);
    }
  }
  const projected = packets.filter(value => value.type === 'messages').flatMap(value => value.messages);
  assert.equal(projected.length, 3);
  assert.ok(projected.every(item => ('senderId' in item) === nameConsent));
  assert.ok(!JSON.stringify(after).includes('"authorId"'));
  assert.deepEqual(profileRequests.sort(), nameConsent ? [self, hydra('PEOPLE', 'other')].sort() : []);
  if (nameConsent) {
    const first = states.find(state => state.messageEvents.received === 3)!;
    assert.deepEqual(after.messageEvents.items.map(({ id, observedAt }) => ({ id, observedAt })),
      first.messageEvents.items.map(({ id, observedAt }) => ({ id, observedAt })), 'name enrichment never refreshes creation evidence');
  }
  assert.equal(receipts, 0); assert.equal(registers, 1); assert.equal(sockets, 0);
  assert.equal(requests.length, 4, 'the pinned SDK itself performs one individual message GET per created event, including its duplicate');
  const path = join(directory, 'states.json');
  await writeFile(path, JSON.stringify({ states, sent: [{ roomId, id: hydra('MESSAGE', 'local-own') }], preview: previews, senderNames: nameConsent }));
  for (const editor of editorBinaries()) {
    const env = editorEnvironment(editor, directory, { WBX_MESSAGE_SNAPSHOTS: path });
    if (!await editorAvailable({ skip: reason => console.log(`SKIP: ${reason}`) }, editor, env)) continue;
    const result = await runEditorFixture(editor, 'global-message-events', env, 5000);
    assert.deepEqual(result.errors, []);
  }
  // Exercise the actual pinned public memberships.listen projection too. The
  // worker must not guess identities from a raw activity actor or fetch people.
  const seenEvents: any[] = [];
  let seenObserved!: () => void;
  const firstSeen = new Promise<void>(resolve => { seenObserved = resolve; });
  sdk.memberships.on('seen', (event: unknown) => { seenEvents.push(event); seenObserved(); });
  const emitSeen = (own: boolean) => sdk.internal.mercury.trigger('event:conversation.activity', { data: { activity: {
    id: 'received-ack', verb: 'acknowledge', published: new Date().toISOString(),
    actor: { entryUUID: own ? 'self' : 'other', orgId: 'synthetic-org' }, object: { id: 'seen-message' },
    target: { id: room.id, url: room.url, tags: [] },
  } } });
  const beforeSeen = lookups;
  for (let i = 0; i < 100; i++) emitSeen(false);
  await firstSeen;
  await new Promise<void>(resolve => setTimeout(resolve, 50));
  assert.equal(seenEvents.length, 100);
  assert.ok(seenEvents.every(event => event.resource === 'memberships' && event.event === 'seen' && event.createdBy === self
    && event.actorId === hydra('PEOPLE', 'other') && event.data.personId === event.actorId));
  assert.equal(lookups, beforeSeen, 'confident public other-member seen events do not reconcile our read state');
  assert.deepEqual(packets.filter(value=>value.type==='changes').flatMap(value=>value.changes),
    [{kind:'readers-changed',roomId}],'the actual public SDK burst publishes one room-only footer invalidation');
  const ownRead = new Promise<void>(resolve => { lookupObserved = resolve; });
  emitSeen(true); await ownRead;
  assert.equal(lookups, beforeSeen + 1, 'our own read from another client still reconciles');
  assert.equal(receipts, 0); assert.equal(registers, 1); assert.equal(sockets, 0);
  const readerHints=packets.filter(value=>value.type==='changes').flatMap(value=>value.changes);
  assert.deepEqual(readerHints,[{kind:'readers-changed',roomId},{kind:'readers-changed',roomId}],
    'a self read from another client also invalidates the footer, without adding reader identities');
  // Real pinned public deleted projections, including a moderator removing US.
  // Actor-is-self with another object member must never revoke our membership.
  const rawChanges: any[] = [];
  sdk.messages.on('deleted', (event: unknown) => rawChanges.push(event));
  sdk.memberships.on('deleted', (event: unknown) => rawChanges.push(event));
  const beforeReaction = packets.length;
  for (const verb of ['add','delete']) sdk.internal.mercury.trigger('event:conversation.activity', { data:{ activity:{
    id:'reaction-event',verb,actor:{ entryUUID:'other' },parent:verb === 'add' ? { type:'reaction',id:'incoming' } : undefined,
    object:{ id:'own-reaction',objectType:verb === 'add' ? 'reaction2' : 'activity',parent:{ type:'reaction',id:'incoming' } },
    target:{ id:room.id,url:room.url,tags:[] },
  } } });
  await new Promise<void>(resolve=>setTimeout(resolve,50));
  assert.equal(rawChanges.length,0,'reaction delete never reaches the lossy public message-deletion projection');
  assert.equal(packets.length,beforeReaction,'reaction add/delete emit no message-created/deleted IPC');
  sdk.internal.mercury.trigger('event:conversation.activity', { data: { activity: {
    id: 'delete-event', verb: 'delete', actor: { entryUUID: 'other' }, object: { id: 'incoming' },
    target: { id: room.id, url: room.url, tags: [] },
  } } });
  await until(() => packets.some(value => value.type === 'changes' && value.changes.some((change: any) => change.kind === 'message-deleted')));
  const deletion = packets.filter(value => value.type === 'changes').flatMap(value => value.changes).filter(change=>change.kind==='message-deleted');
  assert.deepEqual(deletion, [{ kind: 'message-deleted', roomId, id: hydra('MESSAGE', 'incoming') }]);
  assert.equal(requests.length, 4, 'actual deleted SDK events need no message-body GET');
  const leave = (own: boolean) => sdk.internal.mercury.trigger('event:conversation.activity', { data: { activity: {
    id: 'leave-event', verb: 'leave', published: new Date().toISOString(),
    actor: { entryUUID: own ? 'moderator' : 'self', orgId: 'synthetic-org' },
    object: { entryUUID: own ? 'self' : 'other', orgId: 'synthetic-org', displayName: 'PRIVATE_MEMBER', emailAddress: 'PRIVATE_EMAIL' },
    target: { id: room.id, url: room.url, tags: [] },
  } } });
  leave(false);
  assert.equal(engine.snapshot().rooms.some(value => value.id === roomId), true, 'removing another person cannot revoke us');
  leave(true);
  await until(() => !engine.snapshot().rooms.some(value => value.id === roomId));
  assert.equal(engine.snapshot().room!.id, 'demo-general', 'remote removal revokes its original room, not our newer selection');
  assert.equal(engine.snapshot().ready, true);
  const changes = packets.filter(value => value.type === 'changes').flatMap(value => value.changes);
  assert.deepEqual(changes, [...readerHints,deletion[0], { kind: 'room-revoked', roomId }]);
  assert.ok(!JSON.stringify(changes).includes('PRIVATE'));
  assert.ok(rawChanges.some(event => event.resource === 'memberships' && event.data.personId === self && event.actorId !== self));
  const sourceText = await readFile('optional/read-status-sdk/node_modules/@webex/plugin-messages/src/messages.js', 'utf8');
  assert.doesNotMatch(sourceText.split('const verbToType = {')[1]!.split('};')[0]!, /UPDATED|UPDATE/, 'this pinned public adapter has no edited-event mapping; do not invent one');
  assert.equal(receipts, 0); assert.equal(registers, 1); assert.equal(sockets, 0);
  console.log('PASS: actual pinned public delete/self-membership-removal -> bounded private changes -> engine; actor/member distinct; no extra GET/register/receipt/network');
  engine.stop();
  const revision = engine.snapshot().revision;
  owner.onMessages([{ id: 'late', roomId, created: new Date().toISOString(), self: false }]);
  assert.equal(engine.snapshot().revision, revision, 'a replaced/stopped source cannot publish late events');
   console.log(`PASS: actual SDK public created event -> worker -> private IPC -> engine -> native notification with unchanged unread=false, including native same-account sends; preview=${previews}; senderNames=${senderNames}; only exact plugin send excluded; no network/receipts`);
  console.log('PASS: actual SDK public membership seen actor/member/creator proof filters 100 peer reads but reconciles self; no identity probes, registration or receipts added');
} finally {
  engine.stop(); owner.close();
  workerProcess.emit('message', { type: 'stop' });
  await rm(directory, { recursive: true, force: true }); clearTimeout(deadline);
}
process.exit(0);
