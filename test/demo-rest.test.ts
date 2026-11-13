import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoREST, type DemoRESTStore } from '../src/demo-rest.js';
import { PublicProblem, type PublicMethod } from '../src/public-rest.js';

function fixture() {
  const calls: { action: string; input: unknown }[] = [];
  const result = { synthetic: true };
  const store: DemoRESTStore = {
    room: { id: 'selected-room', title: 'Synthetic', type: 'group', lastActivity: '' },
    async demoConversation(action, input) { assert.equal(this, store); calls.push({ action, input }); return result; },
    async demoMessageAction(...input) { assert.equal(this, store); calls.push({ action: 'message', input }); return result; },
  };
  const signal = new AbortController().signal;
  return { store, calls, result, signal,
    call: (path: string, method: PublicMethod = 'GET', body?: object) => demoREST(store, path, method, signal, body) };
}
test('demo REST People projections are deterministic detached synthetic data without invoking sandbox mutations', async () => {
  const f = fixture();
  assert.deepEqual(await f.call('/v1/people/me'), { value: { id: 'demo-self' } });
  const directory = await f.call('/v1/people?displayName=DEMO%20PART&max=50');
  assert.deepEqual(directory.value, { items: ['a', 'b'].map(id => ({ id: 'demo-directory-' + id, displayName: 'Demo Participant' })) });
  assert.deepEqual((await f.call('/v1/people?displayName=unmatched')).value, { items: [] });
  const email = 'Person@Example.invalid', response = (await f.call('/v1/people?email=' + encodeURIComponent(email))).value as any;
  assert.equal(response.items[0].id, 'demo-person-' + Buffer.from(email.toLowerCase()).toString('base64url').slice(0, 32));
  assert.deepEqual(response.items[0].emails, [email]);
  const person = (await f.call('/v1/people/person%2Fopaque')).value as any;
  assert.equal(person.id, 'person/opaque'); assert.equal(person.displayName, 'Participant · DEMO');
  person.displayName = 'Caller mutation';
  assert.equal(((await f.call('/v1/people/person%2Fopaque')).value as any).displayName, 'Participant · DEMO');
  assert.deepEqual(f.calls, []);
});

test('demo REST memberships retain exact read filters, invite body and encoded membership addressing', async () => {
  const f = fixture(), body = { roomId: 'room', personId: 'person', syntheticExtra: 'unchanged input' };
  assert.deepEqual(await f.call('/v1/memberships?roomId=room&personId=person'), { value: f.result });
  await f.call('/v1/memberships', 'POST', body);
  await f.call('/v1/memberships/member%2Fopaque');
  await f.call('/v1/memberships/member%2Fopaque', 'DELETE');
  assert.deepEqual(f.calls, [
    { action: 'members', input: { roomId: 'room', personId: 'person' } },
    { action: 'invite', input: body }, { action: 'membership', input: { id: 'member/opaque' } },
    { action: 'remove', input: { id: 'member/opaque' } },
  ]);
  assert.equal(f.calls[1]!.input, body, 'adapter does not replace domain validation or rewrite caller bodies');
});

test('demo REST room routing preserves metadata precedence, false flags and the exact description-clear sentinel', async () => {
  const f = fixture(), created = { title: 'Synthetic created' };
  await f.call('/v1/rooms', 'POST', created); await f.call('/v1/rooms/room%2Fopaque');
  for (const [body, action] of [
    [{ title: 'Title' }, 'rename'],
    [{ title: 'Title', description: 'Details' }, 'describe'],
    [{ title: 'Title', description: '' }, 'describe'],
    [{ title: 'Title', description: ' ' }, 'description-clear'],
    [{ title: 'Title', isLocked: false, description: 'Details' }, 'lock'],
    [{ title: 'Title', isAnnouncementOnly: false, isLocked: true, description: 'Details' }, 'announcement'],
  ] as const) {
    await f.call('/v1/rooms/room%2Fopaque', 'PUT', body);
    assert.deepEqual(f.calls.at(-1), { action, input: { roomId: 'room/opaque', ...body } });
  }
  assert.deepEqual(f.calls.slice(0, 2), [{ action: 'create', input: created }, { action: 'room', input: { roomId: 'room/opaque' } }]);
});

test('demo REST Teams map list, membership, name and description routes without inventing selection or role evidence', async () => {
  const f = fixture();
  await f.call('/v1/teams'); await f.call('/v1/team/memberships?teamId=team%2Fopaque&max=100');
  await f.call('/v1/teams/team%2Fopaque');
  await f.call('/v1/teams/team%2Fopaque', 'PUT', { name: 'New name' });
  await f.call('/v1/teams/team%2Fopaque', 'PUT', { name: 'Exact name', description: '' });
  assert.deepEqual(f.calls, [
    { action: 'teams', input: {} }, { action: 'team-members', input: { id: 'team/opaque' } },
    { action: 'team', input: { id: 'team/opaque' } }, { action: 'team-rename', input: { id: 'team/opaque', name: 'New name' } },
    { action: 'team-describe', input: { id: 'team/opaque', name: 'Exact name', description: '' } },
  ]);
});

test('demo REST message query/direct and selected-message routing preserve exact content, format and target', async () => {
  const f = fixture();
  await f.call('/v1/messages?roomId=room&parentId=root&mentionedPeople=me');
  await f.call('/v1/messages', 'POST', { roomId: 'room', toPersonId: 'peer', text: 'Literal text', markdown: '**Exact**' });
  await f.call('/v1/messages/message%2Fopaque');
  await f.call('/v1/messages/message%2Fopaque', 'PUT', { text: 'Plain' });
  await f.call('/v1/messages/message%2Fopaque', 'PUT', { text: 'Fallback', markdown: '' });
  await f.call('/v1/messages/message%2Fopaque', 'DELETE');
  assert.deepEqual(f.calls, [
    { action: 'query-messages', input: { roomId: 'room', parentId: 'root', mentionsOnly: true } },
    { action: 'direct', input: { roomId: 'room', personId: 'peer', text: 'Literal text', markdown: '**Exact**' } },
    { action: 'message', input: ['selected-room', 'message/opaque', 'get', undefined, 'plain'] },
    { action: 'message', input: ['selected-room', 'message/opaque', 'edit', 'Plain', 'plain'] },
    { action: 'message', input: ['selected-room', 'message/opaque', 'edit', '', 'markdown'] },
    { action: 'message', input: ['selected-room', 'message/opaque', 'delete', undefined, 'plain'] },
  ]);
});

test('demo REST missing store, pre-abort and unsupported/malformed routes fail without another request or mutation', async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  const failed = (error: unknown) => error instanceof PublicProblem && error.reason === 'failed';
  await assert.rejects(demoREST(undefined, '/v1/people/me', 'GET', f.signal), failed);
  await assert.rejects(demoREST(f.store, '/v1/rooms', 'POST', abort.signal, { title: 'Not created' }), failed);
  await assert.rejects(f.call('/v1/unsupported'), failed);
  await assert.rejects(f.call('/v1/rooms/%ZZ'));
  assert.deepEqual(f.calls, []);
});

test('demo REST propagates failed/unknown and held sandbox outcomes without retries or independent cancellation state', async () => {
  const f = fixture(), errors = [new PublicProblem('failed'), new PublicProblem('unknown')];
  let attempts = 0;
  f.store.demoConversation = async () => { const error = errors[attempts++]; if (error) throw error; return f.result; };
  for (const error of errors) await assert.rejects(f.call('/v1/rooms/room'), value => value === error);
  await Promise.resolve(); assert.equal(attempts, 2, 'no automatic replay');
  assert.deepEqual(await f.call('/v1/rooms/room'), { value: f.result });
  let resolve!: (value: unknown) => void;
  f.store.demoConversation = () => new Promise(yes => { resolve = yes; });
  const abort = new AbortController(), pending = demoREST(f.store, '/v1/rooms/room', 'GET', abort.signal);
  abort.abort(); resolve(f.result);
  assert.deepEqual(await pending, { value: f.result }, 'post-entry session/cancellation checks remain with the domain operation');
});
