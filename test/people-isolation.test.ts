import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebexPeopleProvider, readPeopleJSON, PeopleRequestError } from '../src/people-status.js';
import { WebexSelectedPeopleProvider, validSelectedPeopleStatus } from '../src/people-selected.js';

test('one person declining a status read does not disable other authorized people', async () => {
  let now = 10_000;
  const reads: string[] = [];
  const provider = new WebexPeopleProvider({ enabled: true, grantedScopes: ['spark:people_read'],
    token: () => 'SYNTHETIC', now: () => now, fetcher: async input => {
      const id = new URL(String(input)).pathname.split('/').at(-1)!; reads.push(id);
      return id === 'restricted' ? Response.json({}, { status: 403 }) : Response.json({ id, type: 'person', status: 'active' });
    } });
  provider.setRelevantPeople(['restricted', 'allowed']);
  try {
    assert.equal((await provider.get('restricted')).reason, 'not-shared');
    assert.equal(provider.capability().state, 'ready', 'known grants are not disproved by one target-specific refusal');
    now += 2000;
    assert.equal((await provider.get('allowed')).presence, 'active');
    assert.deepEqual(reads, ['restricted', 'allowed']);
    assert.equal((await provider.get('restricted')).presence, 'unknown', 'refusal never becomes invented presence or an immediate retry');
    assert.deepEqual(reads, ['restricted', 'allowed']);
  } finally { provider.close(); }
});

for (const refused of ['memberships', 'person']) test(`selected ${refused} refusal is target-local, bounded, validated and never stale certainty`, async () => {
  let now = 10_000, restrict = false;
  const reads: string[] = [];
  const provider = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:people_read', 'spark:memberships_read'],
    token: () => 'SYNTHETIC', now: () => now, fetcher: async input => {
      const url = new URL(String(input)), room = url.searchParams.get('roomId');
      reads.push(url.pathname + url.search);
      if (url.pathname === '/v1/people/me') return Response.json({ id: 'self', type: 'person' });
      if (restrict && (refused === 'memberships' ? room === 'restricted' : url.pathname === '/v1/people/peer-restricted'))
        return Response.json({ secret: 'PRIVATE-BODY' }, { status: 403 });
      return room ? Response.json({ items: [{ roomId: room, personId: 'self' }, { roomId: room, personId: `peer-${room}` }] })
        : Response.json({ id: url.pathname.split('/').at(-1), type: 'person', status: 'active' });
    } });
  try {
    provider.selectRoom({ id: 'restricted', type: 'direct' });
    assert.equal((await provider.lookup()).presence, 'active');
    now += refused === 'memberships' ? 300_000 : 61_000; restrict = true;
    const value = await provider.lookup();
    assert.equal(value.reason, 'not-shared');
    assert.equal(value.presence, 'unknown'); assert.equal(value.observedAt, undefined);
    assert.ok(validSelectedPeopleStatus(value)); assert.ok(!JSON.stringify(value).includes('PRIVATE'));
    const count = reads.length;
    await provider.lookup(); assert.equal(reads.length, count, 'no immediate retry or alternate endpoint');
    now += 2000;
    provider.selectRoom({ id: 'allowed', type: 'direct' });
    const allowed = await provider.lookup();
    assert.equal(allowed.presence, 'active'); assert.equal(allowed.capability, 'ready');
    assert.ok(validSelectedPeopleStatus(allowed));
    assert.equal(reads.filter(path => path === '/v1/people/me').length, refused === 'memberships' ? 2 : 1);
  } finally { provider.close(); }
});

for (const status of [401, 403]) test(`self ${status} still closes session-wide presence admission`, async () => {
  let now = 10_000, reads = 0;
  const provider = new WebexSelectedPeopleProvider({ enabled: true, grantedScopes: ['spark:all'],
    token: () => 'SYNTHETIC', now: () => now, fetcher: async () => { reads++; return Response.json({}, { status }); } });
  try {
    provider.selectRoom({ id: 'one', type: 'direct' });
    assert.equal((await provider.lookup()).reason, 'denied');
    now += 60_000; provider.selectRoom({ id: 'two', type: 'direct' });
    assert.equal((await provider.lookup()).reason, 'denied');
    assert.equal(reads, 1);
  } finally { provider.close(); }
});

test('target-local 403 classification is explicit presence policy, never a change to other shared-decoder owners', async () => {
  const cleanup: Promise<unknown>[] = [];
  try {
    for (const target of [{ personId: 'person' }, { roomId: 'room' }, { self: true as const }]) {
      for (const targetRefusal of [false, true]) for (const status of [401, 403]) {
        await assert.rejects(readPeopleJSON(target, 'SYNTHETIC', async () => Response.json({}, { status }),
          new AbortController().signal, Date.now, pending => cleanup.push(pending), { targetRefusal }), (error: unknown) =>
          error instanceof PeopleRequestError && error.reason === (targetRefusal && status === 403 && !('self' in target) ? 'not-shared' : 'denied'));
      }
      await assert.rejects(readPeopleJSON(target, 'SYNTHETIC', async () => Response.json({}, { status: 403 }),
        new AbortController().signal, Date.now, pending => cleanup.push(pending)),
      (error: unknown) => error instanceof PeopleRequestError && error.reason === 'denied', 'omitted policy preserves the default denial boundary');
    }
  } finally { await Promise.allSettled(cleanup); }
});
