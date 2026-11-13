import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VerifiedStorageIdentity, StorageIdentityError, type StorageIdentityContext } from '../src/verified-storage-identity.js';
import { spacesCacheKey } from '../src/spaces-cache.js';
import type { AccessCredentials } from '../src/auth-protocol.js';

const profile = { clientId: 'identity-unit', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:people_read', 'spark:rooms_read'] };
const config = '/tmp/opencode/synthetic-storage-identity.json';
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const code = (expected: number) => (error: unknown) => error instanceof StorageIdentityError && error.code === expected;
function fixture() {
  let current = true, access: AccessCredentials = { token: 'PRIVATE-ACCESS', scope: 'spark:people_read spark:rooms_read', expiresAt: Date.now() + 3600_000 };
  const abort = new AbortController(), calls: { access: AccessCredentials; signal: AbortSignal; gate: ReturnType<typeof deferred<string>> }[] = [];
  const identity = new VerifiedStorageIdentity(async (access, signal) => {
    const gate = deferred<string>(); calls.push({ access, signal, gate }); return gate.promise;
  });
  const context: StorageIdentityContext = { config, signal: abort.signal, current: () => current, access: () => ({ ...access }) };
  return { identity, context, calls, abort, current(value: boolean) { current = value; },
    access(value: Partial<AccessCredentials>) { access = { ...access, ...value }; } };
}

test('verified storage identity is lazy and shares one lookup and key across concurrent consumers', async () => {
  const f = fixture(); f.identity.configure(profile);
  assert.equal(f.calls.length, 0);
  const readers = Array.from({ length: 12 }, () => f.identity.key(f.context));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.signal, f.abort.signal);
  f.calls[0]!.gate.resolve('account-a');
  assert.deepEqual(await Promise.all(readers), Array(12).fill(spacesCacheKey(config, profile, 'account-a')));
  f.access({ token: 'ROTATED-PRIVATE-ACCESS' });
  assert.equal(await f.identity.key(f.context), spacesCacheKey(config, profile, 'account-a'));
  assert.equal(f.calls.length, 1, 'token renewal does not reverify an unchanged authenticated session');
});
test('fresh metadata self can use the configured partition without identity reads or seeding the storage cache', async () => {
  const f = fixture();
  assert.throws(() => f.identity.partition(config, 'account-a'));
  f.identity.configure(profile);
  assert.equal(f.identity.partition(config, 'account-a'), spacesCacheKey(config, profile, 'account-a'));
  assert.notEqual(f.identity.partition(config, 'account-b'), f.identity.partition(config, 'account-a'));
  assert.equal(f.calls.length, 0, 'metadata proof never initiates optional storage work');
  const stored = f.identity.key(f.context);
  assert.equal(f.calls.length, 1, 'metadata proof does not seed or overwrite storage identity authority');
  f.calls[0]!.gate.resolve('account-b');
  assert.equal(await stored, spacesCacheKey(config, profile, 'account-b'));
  f.identity.reset();
  assert.throws(() => f.identity.partition(config, 'account-a'));
});

test('cached identity and joining a flight both require live requesting-session, grant and expiry evidence', async () => {
  const f = fixture(); f.identity.configure(profile);
  const pending = f.identity.key(f.context);
  f.current(false); await assert.rejects(f.identity.key(f.context), code(-32003));
  f.current(true); f.access({ scope: 'spark:rooms_read' });
  await assert.rejects(f.identity.key(f.context), code(-32003));
  f.access({ scope: 'spark:people_read', expiresAt: Date.now() - 1 });
  await assert.rejects(f.identity.key(f.context), code(-32003));
  assert.equal(f.calls.length, 1);
  f.access({ expiresAt: Date.now() + 3600_000 }); f.calls[0]!.gate.resolve('account-a'); await pending;
  f.current(false); await assert.rejects(f.identity.key(f.context), code(-32003));
  f.current(true); f.access({ scope: 'spark:rooms_read' });
  await assert.rejects(f.identity.key(f.context), code(-32003));
  f.access({ scope: 'spark:all', expiresAt: Date.now() - 1 });
  await assert.rejects(f.identity.key(f.context), code(-32003));
  f.access({ expiresAt: Date.now() + 3600_000 });
  assert.equal(await f.identity.key(f.context), spacesCacheKey(config, profile, 'account-a'));
  assert.equal(f.calls.length, 1);
});

test('identity failure settles every consumer and retries only on a new explicit lookup', async () => {
  const f = fixture(); f.identity.configure(profile);
  const first = f.identity.key(f.context), second = f.identity.key(f.context);
  const failure = new Error('PRIVATE identity failure');
  const outcomes = Promise.allSettled([first, second]);
  f.calls[0]!.gate.reject(failure);
  assert.deepEqual((await outcomes).map(item => item.status === 'rejected' && item.reason), [failure, failure]);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1, 'no timer or automatic retry');
  const retry = f.identity.key(f.context);
  assert.equal(f.calls.length, 2); f.calls[1]!.gate.resolve('account-a');
  assert.equal(await retry, spacesCacheKey(config, profile, 'account-a'));
});

test('reset/rebinding fences old success without clearing a newer pending identity', async () => {
  const f = fixture(); f.identity.configure(profile);
  const old = f.identity.key(f.context), rejected = assert.rejects(old, code(-32004));
  f.identity.reset(); f.identity.configure(profile);
  const next = f.identity.key(f.context);
  f.calls[0]!.gate.resolve('retired-account'); await rejected;
  const joined = f.identity.key(f.context);
  assert.equal(f.calls.length, 2, 'old finally cannot release the replacement flight');
  f.calls[1]!.gate.resolve('account-b');
  assert.deepEqual(await Promise.all([next, joined]), Array(2).fill(spacesCacheKey(config, profile, 'account-b')));
  assert.equal(f.abort.signal.aborted, false, 'identity reset does not own the shared OAuth/session abort');
});

test('old failed lookup cannot evict a completed replacement binding', async () => {
  const f = fixture(); f.identity.configure(profile);
  const old = f.identity.key(f.context), rejected = assert.rejects(old, /Retired failure/);
  f.identity.configure({ ...profile, clientId: 'new-client' });
  const next = f.identity.key(f.context);
  f.calls[1]!.gate.resolve('account-b');
  const key = await next;
  f.calls[0]!.gate.reject(new Error('Retired failure')); await rejected;
  assert.equal(await f.identity.key(f.context), key); assert.equal(f.calls.length, 2);
  assert.equal(key, spacesCacheKey(config, { ...profile, clientId: 'new-client' }, 'account-b'));
});

test('completion rechecks current session and grant before committing account identity', async () => {
  for (const boundary of ['session', 'grant']) {
    const f = fixture(); f.identity.configure(profile);
    const pending = f.identity.key(f.context), rejected = assert.rejects(pending, code(-32004));
    if (boundary === 'session') f.current(false); else f.access({ scope: 'spark:rooms_read' });
    f.calls[0]!.gate.resolve('account-a'); await rejected;
    f.current(true); f.access({ scope: 'spark:people_read' });
    const retry = f.identity.key(f.context); assert.equal(f.calls.length, 2);
    f.calls[1]!.gate.resolve('account-b');
    assert.equal(await retry, spacesCacheKey(config, profile, 'account-b'));
  }
});

test('expiry remains an entry gate, not a new post-lookup policy; later callers still need current access', async () => {
  const f = fixture(); f.identity.configure(profile);
  const pending = f.identity.key(f.context);
  f.access({ expiresAt: Date.now() - 1 });
  f.calls[0]!.gate.resolve('account-a');
  assert.equal(await pending, spacesCacheKey(config, profile, 'account-a'), 'preserve existing completion checks, not another expiry/deadline policy');
  await assert.rejects(f.identity.key(f.context), code(-32003));
  f.access({ expiresAt: Date.now() + 3600_000, token: 'RENEWED-ACCESS' });
  assert.equal(await f.identity.key(f.context), spacesCacheKey(config, profile, 'account-a'));
  assert.equal(f.calls.length, 1, 'renewal can reuse the verified key without another identity probe');
});

test('identity configuration is detached, secret-free and retains the existing private key format', async () => {
  const f = fixture(), supplied = { ...profile, scopes: [...profile.scopes], clientSecret: 'PRIVATE-SECRET' };
  f.identity.configure(supplied);
  const pending = f.identity.key(f.context);
  supplied.clientId = 'mutated'; supplied.redirectUri = 'http://127.0.0.1:1'; supplied.scopes.push('other');
  f.calls[0]!.gate.resolve('account-a');
  assert.equal(await pending, spacesCacheKey(config, profile, 'account-a'));
  assert.doesNotMatch(JSON.stringify(f.identity), /PRIVATE|account-a/);
});

test('missing profile/signal and malformed self identity never yield a verified key', async () => {
  const f = fixture();
  await assert.rejects(f.identity.key(f.context), code(-32003));
  f.identity.configure(profile);
  await assert.rejects(f.identity.key({ ...f.context, signal: undefined }), code(-32003));
  assert.equal(f.calls.length, 0);
  for (const account of ['me', '', 'bad\u0000identity']) {
    const pending = f.identity.key(f.context), rejected = assert.rejects(pending);
    f.calls.at(-1)!.gate.resolve(account); await rejected;
  }
  const pending = f.identity.key(f.context); f.calls.at(-1)!.gate.resolve('account-a');
  assert.equal(await pending, spacesCacheKey(config, profile, 'account-a'));
  assert.equal(f.calls.length, 4);
});
