import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerTeams } from '../src/server-teams.js';
import { PublicProblem, type ActionREST } from '../src/public-rest.js';
const signal = new AbortController().signal;
test('Team navigation is lazy, bounded, account-local and independent of local Sections or complete membership', async () => {
  const teams = new ServerTeams(), calls: string[] = [];
  const rooms = Array.from({ length: 60 }, (_, i) => ({ id: 'room-' + i, teamId: 'team-' + i }));
  const rest: ActionREST = { busy: () => false, call: async path => {
    calls.push(path); return { value: { id: path.split('/').at(-1), name: 'Same server label' } };
  } };
  assert.equal(calls.length, 0);
  const first = await teams.list(rooms, rest, signal, () => 'SYNTHETIC');
  assert.equal(calls.length, 8); assert.equal(first.items.length, 8); assert.equal(first.partial, true); assert.equal(first.more, true);
  assert.notEqual(first.items[0]!.id, first.items[1]!.id);
  assert.equal(first.items[0]!.label, first.items[1]!.label, 'duplicate labels do not merge Team identity');
  for (let i = 0; i < 7; i++) await teams.list(rooms, rest, signal, () => 'SYNTHETIC', true);
  assert.equal(calls.length, 60); assert.equal(teams.diagnostics().cached, 32);
  await assert.rejects(teams.list(rooms, rest, signal, () => 'SYNTHETIC', true));
  teams.reset(); assert.equal(teams.diagnostics().cached, 0);
  const cached = await teams.list([{ id: 'cached', teamId: 'team', cached: true }], rest, signal, () => 'SYNTHETIC');
  assert.deepEqual(cached.items, []); assert.equal(calls.length, 60, 'browse-only cached rooms never authorize a Team lookup');
});
test('unresolved Team IDs remain visible with bounded negative retention, no automatic retry or synthetic room membership', async t => {
  const teams = new ServerTeams(); let calls = 0;
  const rest: ActionREST = { busy: () => false, call: async () => { calls++; throw new Error('Unavailable'); } };
  const rooms = [{ id: 'room', teamId: 'team' }];
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const value = await teams.list(rooms, rest, signal, () => 'SYNTHETIC');
  assert.equal(value.items[0]!.state, 'unavailable'); assert.deepEqual(value.items[0]!.roomIds, ['room']);
  await teams.list(rooms, rest, signal, () => 'SYNTHETIC'); assert.equal(calls, 1);
  t.mock.timers.tick(30000); assert.equal(calls, 1);
  await teams.list(rooms, rest, signal, () => 'SYNTHETIC'); assert.equal(calls, 2);
});
for (const status of [401, 403, 429]) test(`Team status ${status} stops the explicit page without probing unattempted IDs`, async () => {
  const teams = new ServerTeams(); let calls = 0;
  const rest: ActionREST = { busy: () => false, call: async () => { calls++; throw new PublicProblem('failed', status); } };
  const page = await teams.list(Array.from({ length: 8 }, (_, i) => ({ id: 'room-' + i, teamId: 'team-' + i })), rest, signal, () => 'SYNTHETIC');
  assert.equal(calls, 1); assert.equal(page.items[0]!.state, 'unavailable');
  assert.equal(page.items.filter(item => item.state === 'not-loaded').length, 7);
});
