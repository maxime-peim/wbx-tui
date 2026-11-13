import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpaceChat, type MessagingSDK } from '../src/browser/chat.js';
import { emptyChat, validChatRequest, type ChatRequest, type ChatResult, type ChatSnapshot } from '../src/chat-protocol.js';
import { UI } from '../src/ui.js';
import { defaults } from '../src/config.js';
import { parseCommand, parseEvent } from '../src/protocol.js';

const request = (action: ChatRequest['action'], extras: Record<string, string> = {}): ChatRequest => ({ type: 'chat', requestId: `request-${action}`, action, ...extras } as ChatRequest);
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const states: ChatSnapshot[] = [], results: ChatResult[] = [], calls: unknown[] = [];
  const raw = { id: 'message-one', roomId: 'space-one', personEmail: 'sam@example.test', text: 'Hello', created: '2026-11-06T12:00:00Z' };
  const sdk: MessagingSDK = { rooms: { async list(options) { calls.push(['rooms', options]); return { items: [{ id: 'space-one', title: 'Engineering' }, { id: 'space-two', title: 'Other space' }] }; } },
    messages: { async list(options) { calls.push(['history', options]); return { items: [raw, { ...raw, id: 'wrong-space', roomId: 'space-two' }, raw] }; },
      async create(options) { calls.push(['create', options]); return { ...raw, ...options, id: 'sent-one' }; } } };
  const chat = new SpaceChat(sdk, value => states.push(value), value => results.push(value), promise => promise);
  const open = async () => { await chat.handle(request('rooms')); await chat.handle(request('select', { roomId: 'space-one' })); };
  return { chat, sdk, states, results, calls, raw, open };
}
test('space chat is opt-in, explicitly selected, bounded/deduplicated, and sends plaintext only once per request', async () => {
  const f = fixture();
  try {
    assert.deepEqual(f.calls, [], 'construction/join does not read account spaces');
    await f.chat.handle(request('send', { roomId: 'space-one', text: 'not selected' }));
    assert.deepEqual(f.calls, []); assert.equal(f.results.at(-1)!.status, 'failed');
    await f.open();
    assert.deepEqual(f.calls.slice(0, 2), [['rooms', { max: 30 }], ['history', { roomId: 'space-one', max: 50 }]]);
    assert.equal(f.states.at(-1)!.messages.length, 1, 'other spaces and duplicate IDs are excluded');
    const send = { ...request('send', { roomId: 'space-one', text: 'Hello **plain**' }), requestId: 'new-send' } as ChatRequest;
    await f.chat.handle(send); await f.chat.handle(send);
    assert.equal(f.calls.filter(call => (call as string[])[0] === 'create').length, 1);
    assert.deepEqual(f.calls.at(-1), ['create', { roomId: 'space-one', text: 'Hello **plain**' }]);
    assert.equal(f.results.at(-1)!.status, 'sent'); assert.equal(f.states.at(-1)!.messages.at(-1)!.id, 'sent-one');
    await f.chat.handle(request('select', { roomId: 'space-two' }));
    await f.chat.handle({ ...send, requestId: 'stale-room-send' });
    assert.equal(f.results.at(-1)!.status, 'failed', 'a stale pane cannot send its draft to a newly selected space');
    assert.equal(f.calls.filter(call => (call as string[])[0] === 'create').length, 1);
  } finally { f.chat.close(); }
});
test('messaging read failure, missing scopes and unavailable plugin are nonfatal and do not expose native errors', async () => {
  const f = fixture();
  try {
    f.sdk.rooms!.list = async () => { throw Object.assign(new Error('private access token/device details'), { statusCode: 403 }); };
    await f.chat.handle(request('rooms')); assert.equal(f.states.at(-1)!.problem, 'denied');
    assert.ok(!JSON.stringify(f.states).includes('private'));
  } finally { f.chat.close(); }
  const states: ChatSnapshot[] = [];
  const missing = new SpaceChat({}, value => states.push(value), () => {}, promise => promise);
  await missing.handle(request('rooms')); assert.equal(states.at(-1)!.problem, 'unsupported'); missing.close();
});
test('denied POST keeps chat alive without automatic retry, and an older GET cannot erase acknowledged messages', async () => {
  const f = fixture(), pending = deferred<{ items: unknown[] }>();
  try {
    await f.open();
    f.sdk.messages!.create = async () => { throw Object.assign(new Error('private denial'), { statusCode: 403 }); };
    await f.chat.handle(request('send', { roomId: 'space-one', text: 'Denied' }));
    assert.equal(f.results.at(-1)!.status, 'failed'); assert.equal(f.results.at(-1)!.problem, 'denied');
    assert.equal(f.states.at(-1)!.state, 'ready');
    f.sdk.messages!.list = () => pending.promise;
    const refresh = f.chat.handle(request('refresh', { roomId: 'space-one' }));
    f.sdk.messages!.create = async options => ({ ...f.raw, ...options, id: 'acknowledged' });
    await f.chat.handle({ ...request('send', { roomId: 'space-one', text: 'Successful' }), requestId: 'successful-send' });
    pending.resolve({ items: [f.raw] }); await refresh;
    assert.ok(f.states.at(-1)!.messages.some(item => item.id === 'acknowledged'));
  } finally { f.chat.close(); }
});
test('a read deadline holds native admission, while close suppresses late data and can be requested immediately', async () => {
  const pending = deferred<{ items: unknown[] }>(), deadline = deferred<void>();
  let calls = 0; const states: ChatSnapshot[] = [];
  const chat = new SpaceChat({ rooms: { list: () => { calls++; return pending.promise; } }, messages: { list: async () => ({ items: [] }), create: async () => ({}) } },
    state => states.push(state), () => {}, promise => Promise.race([promise, deadline.promise.then(() => { throw new Error('timeout'); })]));
  try {
    const reading = chat.handle(request('rooms')); deadline.resolve(); await reading;
    for (let i = 0; i < 100; i++) await chat.handle(request('rooms'));
    assert.equal(calls, 1); assert.equal(states.at(-1)!.problem, 'busy');
    await chat.handle(request('close')); assert.equal(states.at(-1)!.state, 'off');
    pending.resolve({ items: [{ id: 'late-space', title: 'Must not appear' }] }); await tick();
    assert.equal(states.at(-1)!.state, 'off'); assert.equal(states.at(-1)!.rooms.length, 0);
  } finally { chat.close(); }
});
test('late history cannot repopulate a closed selection; closing never disconnects the meeting SDK', async () => {
  const f = fixture(), pending = deferred<{ items: unknown[] }>();
  try {
    await f.chat.handle(request('rooms')); f.sdk.messages!.list = () => pending.promise;
    const reading = f.chat.handle(request('select', { roomId: 'space-one' }));
    await f.chat.handle(request('close')); pending.resolve({ items: [f.raw] }); await reading;
    assert.equal(f.states.at(-1)!.state, 'off'); assert.deepEqual(f.states.at(-1)!.messages, []);
    await f.chat.handle(request('rooms')); assert.equal(f.states.at(-1)!.rooms.length, 2, 'explicit reopen is supported');
  } finally { f.chat.close(); }
});
test('timeout/ambiguous delivery never retries POST; native admission stays occupied until the original request settles', async () => {
  const f = fixture(), pending = deferred<unknown>(), deadline = deferred<void>();
  const states: ChatSnapshot[] = [], results: ChatResult[] = []; let posts = 0;
  const chat = new SpaceChat(f.sdk, state => states.push(state), result => results.push(result),
    promise => Promise.race([promise, deadline.promise.then(() => { throw new Error('deadline'); })]));
  try {
    await chat.handle(request('rooms')); await chat.handle(request('select', { roomId: 'space-one' }));
    f.sdk.messages!.create = async () => { posts++; return pending.promise; };
    const send = request('send', { roomId: 'space-one', text: 'Only once' });
    const sending = chat.handle(send); await tick(); deadline.resolve(); await sending;
    assert.equal(results.at(-1)!.status, 'unknown'); assert.equal(posts, 1); assert.equal(states.at(-1)!.sending, true);
    await chat.handle(send); assert.equal(posts, 1, 'same request ID does not retry uncertain delivery');
    await chat.handle({ ...send, requestId: 'another-attempt' }); assert.equal(results.at(-1)!.problem, 'busy'); assert.equal(posts, 1);
    pending.resolve({ ...f.raw, id: 'late-post' }); await tick(); assert.equal(states.at(-1)!.sending, false);
    assert.equal(results.filter(result => result.status === 'sent').length, 0, 'late completion is not falsely reported as a new delivery');
  } finally { chat.close(); f.chat.close(); }
});
test('chat protocol bounds destinations/bodies and accepts bounded history larger than ordinary worker events', () => {
  const send = request('send', { roomId: 'space-one', text: 'Hello 世界' });
  assert.equal(parseCommand(JSON.stringify(send)).type, 'chat');
  for (const bad of [{ ...send, roomId: 'https://evil.test/' }, { ...send, text: '' }, { ...send, text: 'x'.repeat(1001) },
    { ...send, text: '\x1b[2J' }, { ...send, markdown: '<script>' }, { ...send, requestId: '' }]) {
    assert.equal(validChatRequest(bad), false); assert.throws(() => parseCommand(JSON.stringify(bad)));
  }
  const chat = { ...emptyChat(), room: { id: 'space-one', title: 'Test' }, messages: Array.from({ length: 50 }, (_, i) =>
    ({ id: `message-${i}`, author: 'Sam', created: '', text: 'x'.repeat(1000) })) };
  assert.equal(parseEvent(JSON.stringify({ type: 'chat-state', chat })).type, 'chat-state');
  assert.throws(() => parseEvent(JSON.stringify({ type: 'chat-state', chat: { ...chat, messages: [...chat.messages, chat.messages[0]] } })));
});
test('chat compose is modal, explicitly targets a space, retains failed drafts and clears stale-room drafts', () => {
  const effects: string[] = [], requests: ChatRequest[] = [], ui = new UI(defaults(), action => effects.push(action), true);
  ui.chat.onRequest = request => requests.push(request);
  ui.key('x'); assert.equal(ui.overlay, 'chat'); assert.equal(requests[0]!.action, 'rooms');
  ui.key('j'); assert.equal(ui.chat.selected, 0, 'empty/loading space picker cannot select a negative index');
  const room = { id: 'space-one', title: 'Test space' };
  const ready: ChatSnapshot = { ...emptyChat(), state: 'ready', rooms: [room] };
  ui.chat.update(ready, true); ui.key('<Enter>'); assert.equal(requests.at(-1)!.action, 'select');
  ui.chat.update({ ...ready, room }, true);
  for (const key of ['m', 'v', 'd', 'c', 'q', ':', '世', '界', '<', '>']) ui.key(key);
  assert.deepEqual(effects, []); assert.equal(ui.chat.draft, 'mvdcq:世界<>');
  ui.key('<Enter>'); const send = requests.at(-1)!; assert.equal(send.action, 'send');
  ui.key('<Enter>'); assert.equal(requests.at(-1), send, 'double Enter does not send twice');
  ui.chat.result({ type: 'chat-result', requestId: send.requestId, roomId: room.id, status: 'failed', problem: 'denied' });
  assert.equal(ui.chat.draft, 'mvdcq:世界<>');
  ui.key('<Enter>'); const retry = requests.at(-1)!;
  ui.chat.result({ type: 'chat-result', requestId: retry.requestId, roomId: room.id, status: 'sent' }); assert.equal(ui.chat.draft, '');
  ui.key('m'); ui.chat.update({ ...ready, room: { id: 'space-two', title: 'Other' } }, true); assert.equal(ui.chat.draft, '');
  assert.match(ui.chrome('Test', ''), /NOT in-meeting chat/);
  ui.key('<Esc>'); assert.equal(ui.overlay, undefined); ui.key('m'); assert.deepEqual(effects, ['microphone.toggle']);
});
