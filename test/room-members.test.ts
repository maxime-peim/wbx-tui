import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomMembers } from '../src/room-members.js';
import type { ActionREST } from '../src/public-rest.js';
const signal = new AbortController().signal;
const person = (id = 'membership', personId = 'person') => ({ id, personId, roomId: 'room', personDisplayName: 'Same name', isModerator: false });
test('explicit selected-room pagination labels partial coverage, retains duplicate names by ID and never auto-drains', async () => {
  let calls = 0;
  const rest: ActionREST = { busy: () => false, call: async path => {
    calls++;
    assert.match(path, /roomId=room/);
    return calls === 1 ? { value: { items: [person()] }, link: '<https://webexapis.com/v1/memberships?roomId=room&max=100&cursor=next>; rel="next"' }
      : { value: { items: [person('second', 'other')] } };
  } };
  const members = new RoomMembers();
  const first = await members.load(rest, 'room', 'SYNTHETIC', signal);
  assert.equal(first.partial, true); assert.equal(first.more, true); assert.equal(calls, 1);
  const second = await members.load(rest, 'room', 'SYNTHETIC', signal, true);
  assert.equal(second.partial, false); assert.equal(second.items.length, 2); assert.equal(calls, 2);
  second.items[0]!.label = 'mutated';
  assert.equal(members.snapshot().items[0]!.label, 'Same name');
  members.select('other-room'); assert.equal(members.snapshot().items.length, 0);
  await assert.rejects(members.load(rest, 'other-room', 'SYNTHETIC', signal, true));
});
for (const kind of ['foreign-origin', 'wrong-room', 'missing-identity', 'oversize', 'extra-query'] as const) test(`roster refuses ${kind} without treating it as complete membership proof`, async () => {
  const rest: ActionREST = { busy: () => false, call: async () => ({
    value: { items: kind === 'missing-identity' ? [{ ...person(), personId: undefined }] : kind === 'oversize' ? Array(101).fill(person()) : [person()] },
    ...(kind === 'foreign-origin' ? { link: '<https://untrusted.invalid/v1/memberships?roomId=room>; rel="next"' }
      : kind === 'wrong-room' ? { link: '<https://webexapis.com/v1/memberships?roomId=other>; rel="next"' }
      : kind === 'extra-query' ? { link: '<https://webexapis.com/v1/memberships?roomId=room&token=private>; rel="next"' } : {}),
  }) };
  const members = new RoomMembers();
  await assert.rejects(members.load(rest, 'room', 'SYNTHETIC', signal));
  assert.equal(members.snapshot().state, 'failed'); assert.equal(members.snapshot().partial, true);
});
test('room changes fence a late roster response; repeated cursors stop without infinite reads', async () => {
  const members = new RoomMembers();
  let complete!: (value: any) => void;
  const pending = members.load({ busy: () => false, call: async () => new Promise(resolve => { complete = resolve; }) }, 'room', 'SYNTHETIC', signal);
  members.select('other'); complete({ value: { items: [person()] } });
  await assert.rejects(pending); assert.equal(members.snapshot().roomId, 'other'); assert.deepEqual(members.snapshot().items, []);
  const link = '<https://webexapis.com/v1/memberships?roomId=room&cursor=same>; rel="next"';
  const rest: ActionREST = { busy: () => false, call: async () => ({ value: { items: [person()] }, link }) };
  await members.load(rest, 'room', 'SYNTHETIC', signal);
  assert.equal((await members.load(rest, 'room', 'SYNTHETIC', signal, true)).more, false);
  assert.equal(members.snapshot().partial, true);
});
test('MF23 explicit-role membership verification is opt-in; missing role stays legacy nonmoderator but cannot authorize lock', async () => {
  const members = new RoomMembers();
  for (const isModerator of [undefined, false, true]) {
    const rest: ActionREST = { busy: () => false, call: async () => ({ value: { items: [{ ...person(), isModerator }] } }) };
    assert.equal((await members.verify(rest, 'room', 'person', 'INERT', signal)).moderator, isModerator === true);
    if (isModerator === undefined) await assert.rejects(members.verify(rest, 'room', 'person', 'INERT', signal, true));
    else assert.equal((await members.verify(rest, 'room', 'person', 'INERT', signal, true)).moderator, isModerator);
  }
  assert.equal(members.snapshot().state, 'empty', 'fresh proof is not a roster publication');
});
