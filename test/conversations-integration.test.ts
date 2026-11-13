import { test } from 'node:test';
import { handled, until } from './async-test.js';
import assert from 'node:assert/strict';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { PublicProblem } from '../src/public-rest.js';
test('actual engine prepares recipient-only drafts, creates no placeholder, and binds returned direct IDs before later operations', async t => {
  let network = 0; t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK FORBIDDEN'); });
  const engine = new EditorEngine(), events: string[] = [], deliveries: any[] = [];
  engine.on('direct.delivery', value => { deliveries.push(value); events.push('delivery'); });
  engine.on('state', value => events.push(value.directPending ? 'pending' : 'released'));
  try {
    await engine.start('demo');
    const before = engine.snapshot(), recipient = await engine.prepareDirect('new-person');
    assert.equal(engine.snapshot().room, null); assert.deepEqual(engine.snapshot().rooms, before.rooms);
    assert.equal(deliveries.length, 0);
    const outcome = await engine.sendDirect('first-direct', recipient.targetId, 'native-recipient-draft', 'First explicit text');
    assert.equal(outcome.status, 'changed'); assert.ok(outcome.roomId); assert.ok(outcome.messageId);
    assert.equal(outcome.targetId, recipient.targetId); assert.equal(outcome.draftId, 'native-recipient-draft');
    assert.equal(engine.snapshot().room, null, 'ACK never auto-selects/adopts another room draft');
    assert.equal(engine.snapshot().rooms.length, before.rooms.length + 1);
    assert.equal(events[events.indexOf('delivery') - 1], 'pending');
    assert.equal(engine.snapshot().directPending, undefined);
    await engine.select(outcome.roomId!);
    assert.equal(engine.snapshot().messages[0]!.text, 'First explicit text');
    await engine.sendDirect('second-direct', recipient.targetId, 'native-recipient-draft', 'Second explicit text');
    assert.equal(engine.snapshot().messages.length, 2);
    assert.equal(engine.snapshot().messages.at(-1)!.text, 'Second explicit text');
    assert.equal(network, 0);
  } finally { engine.stop(); }
});
test('create/invite/leave remain separate explicit outcomes and stale status/history cannot restore left-room authority', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const engine = new EditorEngine(), revoked: unknown[] = [];
  engine.on('room.revoked', value => revoked.push(value));
  try {
    await engine.start('demo');
    const created = await engine.createSpace('create', 'Duplicate title');
    assert.equal(created.status, 'changed'); assert.ok(created.roomId);
    await engine.select(created.roomId!);
    const room = engine.snapshot().room!;
    assert.deepEqual(engine.snapshot().messages, [], 'space creation sends no placeholder');
    assert.equal((await engine.roomMembers()).items.length, 1, 'creation is not invitation');
    assert.equal((await engine.membershipAction('invite', 'invite', room.id, 'invited-person')).status, 'changed');
    assert.equal((await engine.roomMembers()).items.length, 2);
    const left = await engine.membershipAction('leave', 'leave', room.id);
    assert.equal(left.status, 'changed'); assert.deepEqual(revoked, [{ roomId: room.id }]);
    assert.equal(engine.snapshot().ready, false);
    assert.equal(engine.snapshot().rooms.some(item => item.id === room.id), false);
    const store = (engine as any).store;
    store.mergeRooms([room]); await store.loadRooms(); await engine.history();
    assert.equal(engine.snapshot().ready, false, 'stale SDK/REST and explicit history refresh cannot override session revocation');
    assert.equal(engine.snapshot().rooms.some(item => item.id === room.id), false);
    const deliveries: any[] = []; engine.on('delivery', value => deliveries.push(value));
    await engine.send('blocked', room.id, 'Must not send');
    assert.equal(deliveries[0].status, 'failed');
  } finally { engine.stop(); }
});
test('server Team identity survives metadata merges while lookup is lazy and explicit', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK FORBIDDEN'); });
  const engine = new EditorEngine();
  try {
    await engine.start('demo');
    assert.equal(engine.snapshot().rooms.find(item => item.id === 'demo-engineering')!.teamId, 'demo-team');
    const page = await engine.serverTeams();
    assert.equal(page.items[0]!.id, 'demo-team'); assert.equal(page.items[0]!.state, 'known'); assert.equal(page.partial, true);
    assert.deepEqual(page.items[0]!.roomIds, ['demo-engineering']);
    const store = (engine as any).store;
    store.mergeRooms([{ id: 'demo-engineering', title: 'SDK title', type: 'group', lastActivity: '' }]);
    assert.equal(engine.snapshot().rooms.find(item => item.id === 'demo-engineering')!.teamId, 'demo-team', 'absent SDK metadata cannot erase observed Team identity');
    assert.equal(engine.snapshot().room, null);
  } finally { engine.stop(); }
});
test('conversation RPC has no actor, role, team-write, arbitrary route or implicit confirmation fields', () => {
  const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
  assert.equal(parse('rooms.create', { requestId: 'id', title: 'Title', confirmed: true }).method, 'rooms.create');
  for (const patch of [{ confirmed: false }, { actorId: 'self' }, { teamId: 'team' }, { title: 'Unsafe\nname' }]) assert.throws(() => parse('rooms.create', { requestId: 'id', title: 'Title', confirmed: true, ...patch }));
  assert.throws(() => parse('members.action', { requestId: 'id', roomId: 'room', action: 'invite', target: 'person', confirmed: true, isModerator: true }));
  assert.throws(() => parse('direct.send', { targetId: 'a'.repeat(32), draftId: 'draft', requestId: 'id', text: 'text', confirmed: true, toPersonId: 'override' }));
  assert.throws(() => parse('teams.list', { teamId: 'unobserved' }));
});
test('unknown leave revokes exact room even after selection changes while unrelated authority survives', async () => {
  const engine = new EditorEngine(), revoked: unknown[] = [];
  let complete: (() => void) | undefined;
  engine.on('room.revoked', value => revoked.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const boundary = (engine as any).actionREST, original = boundary.call;
    let deleting = false;
    boundary.call = async (...args: any[]) => {
      if (args[1] === 'DELETE') {
        deleting = true; await new Promise<void>(resolve => { complete = resolve; });
        throw new PublicProblem('unknown');
      }
      return original(...args);
    };
    const leaving = handled(engine.membershipAction('leave-race', 'leave', 'demo-general'));
    await until(() => deleting, 'membership DELETE admission');
    await engine.select('demo-engineering');
    complete!();
    assert.equal((await leaving).status, 'unknown');
    assert.deepEqual(revoked, [{ roomId: 'demo-general' }]);
    assert.equal(engine.snapshot().room!.id, 'demo-engineering');
    assert.equal(engine.snapshot().ready, true);
    (engine as any).store.mergeRooms([{ id: 'demo-general', type: 'group', title: 'Stale', lastActivity: '' }]);
    await engine.rooms(); await assert.rejects(engine.select('demo-general'), /listed space/);
    assert.equal(engine.snapshot().room!.id, 'demo-engineering', 'blocked-room authority is not restored by stale list/selection');
  } finally { complete?.(); engine.stop(); }
});
