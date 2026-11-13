import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoReactions } from '../src/demo-reactions.js';
import { REACTIONS, validReactionSnapshot, reactionBatchMatches, type Reaction, type ReactionCommand } from '../src/reaction-contracts.js';

const target = { roomId: 'room', messageId: 'message' };
async function summary(owner: DemoReactions, at = target) {
  const value = await owner.reaction({ ...at, action: 'summary' });
  assert.ok(validReactionSnapshot(value)); return value;
}
test('demo reactions start empty and construct fresh exact detached synthetic snapshots without admission state', async () => {
  const owner = new DemoReactions(), start = Date.now(), value = await summary(owner);
  assert.deepEqual({ ...value, observedAt: 0 }, { ...target, observedAt: 0, partial: false, unknown: false, groups: [] });
  assert.ok(value.observedAt >= start && value.observedAt <= Date.now());
  value.groups.push({ reaction: 'heart', label: 'Heart', count: 999 });
  assert.deepEqual((await summary(owner)).groups, [], 'read result cannot seed synthetic state');
});

test('demo reaction catalog uses stable own handles and count-one idempotent adds, never toggles or invented aggregate counts', async () => {
  const owner = new DemoReactions();
  for (const [reaction, label] of Object.entries(REACTIONS) as [Reaction, string][]) {
    assert.deepEqual(await owner.reaction({ ...target, action: 'add', reaction }), { status: 'changed' });
    const first = (await summary(owner)).groups.find(group => group.reaction === reaction)!;
    assert.equal(first.label, label); assert.equal(first.count, 1); assert.match(first.own!, /^[a-f0-9]{32}$/);
    await owner.reaction({ ...target, action: 'add', reaction });
    assert.deepEqual((await summary(owner)).groups.find(group => group.reaction === reaction), first);
  }
  assert.equal((await summary(owner)).groups.length, Object.keys(REACTIONS).length);
});

test('demo removal needs the exact current own handle; failed removal and caller mutations leave groups untouched', async () => {
  const owner = new DemoReactions(); await owner.reaction({ ...target, action: 'add', reaction: 'heart' });
  const before = await summary(owner), own = before.groups[0]!.own!;
  before.groups[0]!.own = 'b'.repeat(32); before.groups[0]!.count = 888;
  for (const handle of [undefined, 'c'.repeat(32)]) {
    assert.deepEqual(await owner.reaction({ ...target, action: 'remove', reaction: 'heart', own: handle }), { status: 'failed' });
  }
  assert.equal((await summary(owner)).groups[0]!.own, own);
  assert.equal((await summary(owner)).groups[0]!.count, 1);
  assert.deepEqual(await owner.reaction({ ...target, action: 'remove', reaction: 'heart', own }), { status: 'changed' });
  assert.deepEqual((await summary(owner)).groups, []);
  await owner.reaction({ ...target, action: 'add', reaction: 'heart' });
  const next = (await summary(owner)).groups[0]!.own!;
  assert.notEqual(next, own);
  assert.deepEqual(await owner.reaction({ ...target, action: 'remove', reaction: 'heart', own }), { status: 'failed' });
  assert.equal((await summary(owner)).groups[0]!.own, next, 'a stale handle cannot remove the replacement');
});

test('demo reaction state is exact room/message keyed, including opaque delimiter-like IDs, and independent across owners', async () => {
  const owner = new DemoReactions();
  const targets = [{ roomId: 'a/b', messageId: 'c' }, { roomId: 'a', messageId: 'b/c' },
    { roomId: 'other', messageId: 'message' }, target];
  for (const [index, at] of targets.entries())
    await owner.reaction({ ...at, action: 'add', reaction: index % 2 ? 'heart' : 'smiley' });
  for (const [index, at] of targets.entries()) {
    const value = await summary(owner, at);
    assert.equal(value.groups.length, 1); assert.equal(value.groups[0]!.reaction, index % 2 ? 'heart' : 'smiley');
  }
  assert.deepEqual((await summary(new DemoReactions())).groups, []);
});

test('demo reaction batches preserve requested room/order, include explicit empty targets and detach every result', async () => {
  const owner = new DemoReactions(), batch = { roomId: 'room', messageIds: ['second', 'message', 'empty'] };
  await owner.reaction({ ...target, action: 'add', reaction: 'heart' });
  const value = await owner.reactions(batch); assert.ok(reactionBatchMatches(value, batch));
  assert.deepEqual(value.items.map(item => item.messageId), batch.messageIds);
  assert.deepEqual(value.items.map(item => 'groups' in item ? item.groups.length : -1), [0, 1, 0]);
  const item = value.items[1]!; assert.ok('groups' in item); item.groups[0]!.label = 'Caller mutation';
  assert.equal((await summary(owner)).groups[0]!.label, 'Heart');
});

test('demo batch provider propagates a rejected synthetic read without converting failure to absence or replaying', async t => {
  const owner = new DemoReactions(), original = owner.reaction, calls: ReactionCommand[] = [];
  const failure = Error('PRIVATE synthetic provider failure');
  const mock = t.mock.method(owner, 'reaction', async function (command: ReactionCommand) {
    calls.push(command); if (command.messageId === 'bad') throw failure; return original.call(owner, command);
  });
  const batch = { roomId: 'room', messageIds: ['message', 'bad', 'last'] };
  await assert.rejects(owner.reactions(batch), error => error === failure);
  await Promise.resolve(); assert.equal(calls.length, 3, 'one pass, not an automatic retry or partial empty result');
  mock.mock.restore();
  assert.ok(reactionBatchMatches(await owner.reactions(batch), batch), 'a later explicit call works normally');
});

test('demo batch reads settle through the existing calls without a competing queue or cancellation lifetime', async t => {
  const owner = new DemoReactions(), original = owner.reaction, calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(owner, 'reaction', async function (command: ReactionCommand) {
    calls.push(command.messageId); if (command.messageId === 'held') await held;
    return original.call(owner, command);
  });
  const batch = { roomId: 'room', messageIds: ['held', 'message'] }, pending = owner.reactions(batch);
  assert.deepEqual(calls, batch.messageIds);
  release(); assert.ok(reactionBatchMatches(await pending, batch)); assert.equal(calls.length, 2);
});
