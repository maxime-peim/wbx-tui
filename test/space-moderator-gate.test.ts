/** Provider NO-GO regression checks, NOT moderator-management implementation/permission tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { EditorRPC } from '../src/editor-worker.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers, member } from '../src/room-members.js';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation, EditorProtocolError } from '../src/editor-protocol.js';

const operation = (method: string, params: Record<string, unknown>) =>
  parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
test('MF23/MF24 moderator provider gate has no negotiated finite promote/demote RPC, despite readable role labels', () => {
  for (const isModerator of [true, false]) {
    assert.throws(() => operation('members.moderator', { requestId: 'one', roomId: 'room',
      membershipId: 'target', personId: 'other', expectedModerator: !isModerator, isModerator, confirmed: true }),
    error => error instanceof EditorProtocolError && error.code === -32601);
  }
});
test('MF23/MF24 moderator gate leaves existing member actions finite; role fields and actions cannot hitchhike', () => {
  const params = { requestId: 'one', roomId: 'room', action: 'remove', target: 'membership', confirmed: true };
  assert.deepEqual(operation('members.action', params), { method: 'members.action', params });
  for (const patch of [{ action: 'promote' }, { action: 'demote' }, { action: 'moderator' }, { isModerator: true },
    { isModerator: false }, { isRoomHidden: false }, { body: { isModerator: true } }, { method: 'PUT' }]) {
    assert.throws(() => operation('members.action', { ...params, ...patch }),
      error => error instanceof EditorProtocolError && error.code === -32602);
  }
});
test('MF23/MF24 moderator gate rejects invented resolution evidence without changing existing metadata recovery', () => {
  const params = { roomId: 'room', requestId: 'original', checked: true };
  for (const action of ['moderator', 'promote', 'demote']) {
    assert.throws(() => operation('conversations.resolve', { ...params, action }));
  }
  assert.equal(operation('conversations.resolve', { ...params, action: 'description-clear' }).method, 'conversations.resolve');
});
test('MF23/MF24 moderator gate does not introduce a new writer or infer role authority from helper names', () => {
  for (const [prototype, names] of [
    [ConversationActions.prototype, ['setModerator', 'setMembershipModerator']],
    [EditorEngine.prototype, ['setSpaceModerator', 'setMembershipModerator']],
    [RoomMembers.prototype, ['setModerator', 'updateModerator']],
  ] as const) {
    for (const name of names) assert.equal(Object.hasOwn(prototype, name), false);
  }
});
test('MF23/MF24 moderator gate preserves 32 capabilities and all delivered metadata singletons, with no role assertion', async () => {
  const output: any[] = [], rpc = new EditorRPC(new EditorEngine(), new EditorMeetings(), value => { output.push(value); });
  try {
    await rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { version: 1 } }));
    const hello = output.at(-1).result, caps = hello.capabilities;
    assert.equal(caps.length, 32); assert.equal(new Set(caps).size, 32); assert.ok(caps.includes('memberships-write-v1'));
    assert.equal(caps.includes('space-moderators-v1'), false);
    for (const [field, expected] of Object.entries({ spaceActions: ['rename-v1'], spaceDescriptions: ['replace-v1'],
      spaceLocks: ['lock-unlock-v1'], spaceAnnouncements: ['enable-disable-v1'], spaceDescriptionClears: ['single-space-v1'] }))
      assert.deepEqual(hello[field], expected);
    for (const field of ['spaceModerators', 'memberModerators', 'moderatorActions']) assert.equal(Object.hasOwn(hello, field), false);
  } finally { await rpc.close(); }
});
test('MF23/MF24 moderator gate treats projected isModerator as roster data, not a target hidden preference or writer', () => {
  const projected = member({ id: 'membership', roomId: 'room', personId: 'person', personDisplayName: 'Same name',
    isModerator: true, isRoomHidden: false, roomType: 'group' }, 'room');
  assert.deepEqual(projected, { id: 'membership', personId: 'person', label: 'Same name', moderator: true });
  assert.equal(Object.hasOwn(projected!, 'isRoomHidden'), false, 'no optional hidden preimage is fabricated from a roster projection');
  assert.throws(() => operation('members.action', { requestId: 'one', roomId: 'room', action: 'promote', target: projected!.id, confirmed: true }));
});
test('MF23/MF24 moderator gate exposes no generic REST/update tunnel for role-only or hidden-echo bodies', t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No sockets'); });
  for (const method of ['members.update', 'memberships.update', 'membership.update', 'rest.call', 'public.call']) {
    for (const body of [{ isModerator: true }, { isModerator: false, isRoomHidden: false }]) {
      assert.throws(() => operation(method, { requestId: 'one', membershipId: 'membership', body, confirmed: true }),
        error => error instanceof EditorProtocolError && error.code === -32601);
    }
  }
});
test('MF23/MF24 moderator gate keeps actual demo role-bearing roster reads read-only with no delivery or main state change', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No live service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('No demo sockets'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value)); engine.on('direct.delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-engineering');
    const before = engine.snapshot(), publications: string[] = [];
    for (const event of ['state', 'notice', 'message.event']) engine.on(event, () => publications.push(event));
    const roster = await engine.roomMembers();
    assert.ok(roster.items.some(item => item.moderator)); assert.equal(roster.roomId, before.room!.id);
    assert.deepEqual(engine.snapshot(), before);
    assert.deepEqual(deliveries, []); assert.deepEqual(publications, []);
  } finally { engine.stop(); }
});
