import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBackendProviders, createMessagingStore, defaultAuthorization, defaultSpacesCache,
  defaultReadStatusFactory, defaultPeopleFactory, defaultUpcomingFactory } from '../src/backend-providers.js';
import { OAuthSession } from '../src/oauth.js';
import { startSharedOAuth } from '../src/oauth-share.js';
import { ReadStatusWorker, type ReadStatusSource } from '../src/read-status.js';
import { WebexSelectedPeopleProvider } from '../src/people-selected.js';
import { PeopleReadOwner, type PeopleProviderOptions } from '../src/people-status.js';
import { WebexUpcomingMeetingsProvider, type UpcomingMeetingsOptions } from '../src/upcoming-meetings.js';
import { SenderNames } from '../src/sender-names.js';
import { SpacesCache, spacesCacheAccount } from '../src/spaces-cache.js';
import { MessagingStore } from '../src/messaging-store.js';
import { WebexMessagingAPI, demoMessageAPI, type MessagingAPI } from '../src/messaging-api.js';
import { ContentAdmission } from '../src/content-admission.js';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function eventually(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await turn();
  assert.ok(check(), 'bounded synthetic work settled');
}
const unused = (): never => assert.fail('construction must not perform I/O');

test('backend composition is lazy, aliases the read factory and forwards exact presence/agenda identities at call time', t => {
  let tokens = 0;
  const token = () => { tokens++; return 'SYNTHETIC'; }, now = () => 123;
  const peopleOptions: PeopleProviderOptions[] = [], agendaOptions: UpcomingMeetingsOptions[] = [];
  const readStatus = function (this: unknown) { return this as ReadStatusSource; };
  t.mock.method(globalThis, 'fetch', unused);
  const providers = composeBackendProviders(readStatus, options => {
    peopleOptions.push(options); return defaultPeopleFactory(options);
  }, options => { agendaOptions.push(options); return defaultUpcomingFactory(options); }, { now });
  assert.equal(providers.readStatus, readStatus);
  const receiver = {} as ReadStatusSource;
  assert.equal(providers.readStatus.call(receiver), receiver, 'do not wrap/rebind the injected read factory');
  assert.equal(peopleOptions.length, 0); assert.equal(agendaOptions.length, 0);
  const currentFetch = t.mock.method(globalThis, 'fetch', unused);
  const readOwner = new PeopleReadOwner(now), scopes = ['spark:all'];
  const session = { grantedScopes: scopes, token, expiresAt: 999, active: () => true };
  const first = providers.people(session, readOwner), second = providers.people(session, readOwner);
  const agendaSession = { accountId: 'account', grantedScopes: scopes, token };
  const agenda = providers.upcoming(agendaSession);
  t.after(() => { first.close(); second.close(); agenda.close(); });
  assert.deepEqual(peopleOptions[0], { enabled: true, grantedScopes: scopes, token, fetcher: currentFetch, readOwner, now });
  assert.equal(peopleOptions[0]!.grantedScopes, scopes); assert.equal(peopleOptions[1]!.readOwner, readOwner);
  assert.deepEqual(agendaOptions[0], { enabled: true, fetcher: currentFetch, session: agendaSession, now });
  assert.equal(agendaOptions[0]!.session, agendaSession); assert.equal(tokens, 0);
});

test('backend defaults construct concrete inert providers and fresh per-engine OAuth/cache factory objects', t => {
  t.mock.method(globalThis, 'fetch', unused);
  const a = defaultAuthorization(), b = defaultAuthorization(), c = defaultSpacesCache(), d = defaultSpacesCache();
  assert.notEqual(a, b); assert.notEqual(a.create, b.create); assert.equal(a.share, startSharedOAuth);
  assert.notEqual(c, d); assert.notEqual(c.create, d.create); assert.equal(c.account, spacesCacheAccount);
  const oauth = a.create({ clientId: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] }, 'synthetic');
  assert.ok(oauth instanceof OAuthSession);
  assert.ok(c.create() instanceof SpacesCache); assert.notEqual(c.create(), c.create());
  const read = defaultReadStatusFactory(), next = defaultReadStatusFactory();
  assert.ok(read instanceof ReadStatusWorker); assert.notEqual(read, next); read.close(); next.close();
  const people = defaultPeopleFactory({ token: unused, fetcher: unused });
  const agenda = defaultUpcomingFactory({});
  assert.ok(people instanceof WebexSelectedPeopleProvider); assert.ok(agenda instanceof WebexUpcomingMeetingsProvider);
  people.close(); agenda.close();
});

test('backend sender-name fallback resolves global fetch per request and follows caller token/clock without eager I/O', async t => {
  let now = Date.now(), token = 'FIRST', oldCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { oldCalls++; return Response.json({ id: 'old', displayName: 'Wrong fetch' }); });
  const names = composeBackendProviders(unused, unused, unused, { now: () => now }).names();
  t.after(() => names.setSession());
  assert.ok(names instanceof SenderNames); assert.equal(oldCalls, 0);
  const headers: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    headers.push(new Headers(init?.headers).get('Authorization')!);
    return Response.json({ id: String(url).split('/').at(-1), displayName: 'Synthetic Name' });
  });
  names.setSession({ enabled: true, grantedScopes: ['spark:people_read'], token: () => token });
  names.observe(['peer-one']); await eventually(() => names.peek('peer-one') === 'Synthetic Name');
  token = 'SECOND'; now += 2000; names.observe(['peer-two']);
  await eventually(() => names.peek('peer-two') === 'Synthetic Name');
  assert.deepEqual(headers, ['Bearer FIRST', 'Bearer SECOND']); assert.equal(oldCalls, 0);
});

test('backend sender-name injected fetch remains the original transport, not the current global fallback', async t => {
  t.mock.method(globalThis, 'fetch', unused);
  let requests = 0;
  const senderFetch: typeof fetch = async () => { requests++; return Response.json({ id: 'peer', displayName: 'Injected Name' }); };
  const names = composeBackendProviders(unused, unused, unused, { senderFetch }).names();
  t.after(() => names.setSession());
  assert.equal(requests, 0); names.setSession({ enabled: true, grantedScopes: ['spark:all'], token: () => 'SYNTHETIC' });
  names.observe(['peer']); await eventually(() => names.peek('peer') === 'Injected Name'); assert.equal(requests, 1);
});

test('backend messaging construction preserves mode/poll API arguments, injected method receiver and nullish default compatibility', async t => {
  t.mock.method(globalThis, 'fetch', unused);
  let calls = 0;
  const admission = new ContentAdmission(), expected = new MessagingStore(demoMessageAPI('editor'), 4000, 'demo');
  const owners = { messaging(api: MessagingAPI, poll: number, mode: 'demo' | 'live') {
    assert.equal(this, owners); assert.equal(poll, 4000); assert.equal(mode, 'demo');
    assert.equal(api instanceof WebexMessagingAPI, false); calls++; return expected;
  } };
  assert.equal(createMessagingStore('demo', unused, admission, owners), expected); assert.equal(calls, 1);
  const fallback = createMessagingStore('demo', unused, admission, { messaging: (() => undefined) as unknown as typeof owners.messaging });
  const ordinary = createMessagingStore('demo', unused, admission, {});
  t.after(() => { expected.close(); fallback.close(); ordinary.close(); });
  assert.ok(fallback instanceof MessagingStore); assert.ok(ordinary instanceof MessagingStore);
  await fallback.loadRooms(); assert.equal(fallback.rooms.length, 3, 'editor sandbox stays ordinary and account-free');
});

test('backend live messaging keeps lazy current credentials, construction-time fetch and shared content-admission identity', async t => {
  let token = 'FIRST', reads = 0;
  const observed: string[] = [], admission = new ContentAdmission();
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    observed.push(new Headers(init?.headers).get('Authorization')!); return Response.json({ items: [] });
  });
  let api!: WebexMessagingAPI;
  const store = createMessagingStore('live', () => { reads++; return token; }, admission, {
    messaging(value, poll, mode) { assert.ok(value instanceof WebexMessagingAPI); api = value; return new MessagingStore(value, poll, mode); },
  });
  t.after(() => store.close());
  assert.equal(reads, 0); t.mock.method(globalThis, 'fetch', unused);
  await api.rooms(); token = 'SECOND'; await api.rooms();
  assert.deepEqual(observed, ['Bearer FIRST', 'Bearer SECOND']); assert.equal(reads, 2);
  // Identity is passed into the existing API/content primitives, not reconstructed.
  assert.equal((api as unknown as { contentAdmission: ContentAdmission }).contentAdmission, admission);
});

test('backend construction propagates injected factory failure without fallback, retry or lifecycle effects', () => {
  const error = Error('Synthetic factory failure'); let calls = 0;
  const fail = (): never => { calls++; throw error; };
  const providers = composeBackendProviders(fail, fail, fail, {});
  assert.equal(calls, 0);
  assert.throws(() => providers.people({ grantedScopes: [], token: unused, expiresAt: 0, active: () => true }, new PeopleReadOwner(Date.now)), value => value === error);
  assert.throws(() => providers.upcoming({ accountId: 'account', token: unused }), value => value === error);
  assert.throws(() => createMessagingStore('demo', unused, new ContentAdmission(), { messaging: fail }), value => value === error);
  assert.equal(calls, 3);
});
