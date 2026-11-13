import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import { PublicREST, PublicProblem, publicURL } from '../src/public-rest.js';
for (const status of [200, 201, 204, 302, 401, 403, 429, 500]) test(`public one-shot boundary status ${status} never redirects, refreshes or replays`, async () => {
  let calls = 0, payload = '';
  const server = createServer(async (req, res) => {
    calls++; const chunks = []; for await (const chunk of req) chunks.push(chunk);
    payload = Buffer.concat(chunks).toString();
    res.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://untrusted.invalid/replay' });
    res.end(status === 204 ? undefined : JSON.stringify({ id: 'synthetic' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port, method = status === 204 ? 'DELETE' : 'PUT';
  const rest = new PublicREST((options, listener) => {
    assert.equal(options.hostname, 'webexapis.com'); assert.equal(options.agent, false); assert.equal(options.path, '/v1/messages/id');
    return request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port }, listener);
  });
  try {
    const operation = rest.call('/v1/messages/id', method, 'SYNTHETIC', new AbortController().signal, method === 'DELETE' ? undefined : { roomId: 'room', text: 'Literal 😀' });
    if (status < 300) assert.deepEqual((await operation).value, status === 204 ? undefined : { id: 'synthetic' });
    else await assert.rejects(operation, (error: PublicProblem) => error.reason === ([401, 403, 429].includes(status) ? 'failed' : 'unknown'));
    assert.equal(calls, 1); assert.equal(rest.busy(), false);
    assert.equal(payload, method === 'DELETE' ? '' : JSON.stringify({ roomId: 'room', text: 'Literal 😀' }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('public URL boundary rejects private origins, fragments, credentials, traversal and unknown resources before I/O', () => {
  for (const path of ['https://untrusted.invalid/v1/messages', 'https://u:p@webexapis.com/v1/messages', '/v1/messages/id#x', '/v1/admin', '/v1/messages/../admin', '/v1/messages/%00', '/v1/messages/%2E%2E']) assert.throws(() => publicURL(path));
  assert.equal(publicURL('/v1/messages/abc%2Fdef').pathname, '/v1/messages/abc%2Fdef', 'encoded opaque ID is one inert segment, not a service path');
});
for (const variant of ['bytes', 'reads', 'utf8', 'cleanup'] as const) test(`public response ${variant} is bounded and physical cleanup cannot be bypassed`, async () => {
  let calls = 0, consumed = 0;
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {},
    destroy() { response.emit('close'); return response; },
    async *[Symbol.asyncIterator]() {
      const chunks = variant === 'bytes' ? [Buffer.alloc(262145)] : variant === 'reads' ? Array.from({ length: 5000 }, () => Buffer.from(' '))
        : [Buffer.from([0xc3, 0x28])];
      for (const chunk of chunks) { consumed++; yield chunk; }
    },
  });
  const client = Object.assign(new EventEmitter(), {
    end() { queueMicrotask(() => listener(response as any)); return client; },
    destroy() { if (variant !== 'cleanup') client.emit('close'); return client; },
  });
  let listener!: (response: any) => void;
  const rest = new PublicREST((_, received) => { calls++; listener = received; return client as any; });
  const abort = new AbortController(), pending = rest.call('/v1/messages/id', 'PUT', 'SYNTHETIC', abort.signal, { roomId: 'room', text: 'Text' });
  if (variant === 'cleanup') {
    while (!consumed) await new Promise<void>(resolve => setImmediate(resolve));
    abort.abort(); await assert.rejects(pending, (error: PublicProblem) => error.reason === 'unknown');
    assert.equal(rest.busy(), true);
    await assert.rejects(rest.call('/v1/messages/id', 'PUT', 'SYNTHETIC', new AbortController().signal, { text: 'No overlap' }));
    assert.equal(calls, 1);
    client.emit('close');
    for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(rest.busy(), false);
  } else {
    await assert.rejects(pending, (error: PublicProblem) => error.reason === 'unknown');
    assert.equal(rest.busy(), false); assert.equal(calls, 1); assert.ok(consumed <= 1025);
  }
});
