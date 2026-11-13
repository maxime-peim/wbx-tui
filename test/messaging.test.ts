import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import stringWidth from 'string-width';
import { defaults, parseConfig, saveMessageLayout } from '../src/config.js';
import { messagingDefaults, parseMessaging, validateMessageLayout } from '../src/messaging-config.js';
import { MessagingError, WebexMessagingAPI, demoMessageAPI, type MessagingAPI, type MessageRoom } from '../src/messaging-api.js';
import { MessagingStore } from '../src/messaging-store.js';
import { MessageDraft, MessagingUI, messageGeometry } from '../src/messaging-ui.js';
import type { ChatMessage } from '../src/chat-protocol.js';
import { checkMessagingOAuth, resolveMessagingAuth } from '../src/messaging-cli.js';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const room = (id: string): MessageRoom => ({ id, title: id, type: 'group', lastActivity: '' });
const message = (id: string): ChatMessage => ({ id, author: 'Alex', text: id, created: '2026-01-01T00:00:00.000Z' });
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture(config = defaults()) {
  const store = new MessagingStore(demoMessageAPI(), 0), ui = new MessagingUI(store, config);
  await store.loadRooms(); return { store, ui, close: () => store.close() };
}
test('messaging config merges per-mode shortcuts/macros, rejects ambiguity, unsafe actions and text-stealing insert maps', () => {
  const config = parseConfig({ leader: ',', messaging: { keybindings: { normal: { J: ['focus.rooms', 'move.down', 'open'], q: null }, insert: { '<C-e>': 'send' } } } });
  assert.deepEqual(config.messaging.keybindings.normal.J, ['focus.rooms', 'move.down', 'open']);
  assert.equal(config.messaging.keybindings.normal.q, null); assert.equal(config.messaging.keybindings.insert['<C-s>'], 'send');
  for (const input of [{ keybindings: { normal: { 'g': 'open' } } }, { keybindings: { insert: { q: 'quit' } } },
    { keybindings: { normal: { x: 'shell rm' } } }, { keybindings: { normal: { x: ['send', 'not-a-command'] } } },
    { keybindings: { normal: { '<Space>': 'open' } } }, { layout: 'missing' }, { unknown: true }]) assert.throws(() => parseMessaging(input));
});
test('custom messaging layout validation requires unique destination/composer/history panels and bounded splits', () => {
  const value = messagingDefaults().layouts.mail!; validateMessageLayout(value);
  for (const input of [{ panel: 'rooms' }, { panel: 'shell' }, { ...value, ratio: NaN }, { ...value, ratio: .99 },
    { direction: 'vertical', ratio: .5, children: [{ panel: 'rooms' }, { panel: 'rooms' }] }]) assert.throws(() => validateMessageLayout(input));
});
test('Neovim-style rendering uses buffers, split/status lines, relative gutters and real mode-dependent cursor shapes, not boxed cards', async () => {
  const f = await fixture();
  try {
    f.ui.selectedRoom = 1; f.ui.maximized = true;
    let screen = f.ui.screen(100, 24);
    assert.ok(screen.lines.some(line => line.includes('wbx://spaces'))); assert.ok(!screen.lines.some(line => /[┌└┐┘]/.test(line)));
    assert.match(screen.lines[3]!, /^\s*2 /); assert.match(screen.lines[4]!, /^\s*1 /); assert.ok(screen.ansi.includes('\x1b[2 q'));
    await f.store.select('demo-general'); f.ui.action('insert'); f.ui.paste('first\n界');
    screen = f.ui.screen(100, 24); assert.ok(screen.ansi.includes('\x1b[6 q')); assert.ok(screen.lines.at(-2)!.includes('2:2'));
    f.ui.action('normal'); f.ui.action('command'); f.ui.key('h'); screen = f.ui.screen(100, 24);
    assert.ok(screen.lines.at(-1)!.startsWith(':h')); assert.ok(screen.ansi.includes('\x1b[24;3H'));
    const config = parseConfig({ messaging: { lineNumbers: 'off' } }); f.ui.configure(config); f.ui.mode = 'normal'; f.ui.focus = 'rooms';
    assert.ok(!/^\s*2 /.test(f.ui.screen(100, 24).lines[3]!));
    assert.throws(() => parseMessaging({ lineNumbers: 'anything' }));
  } finally { f.close(); }
});
test('OAuth compatibility check shares the meeting profile, checks messaging scopes and never claims a verified login or exposes client identity', () => {
  const oauth = { clientId: 'private-public-client-id', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] };
  const report = checkMessagingOAuth(parseConfig({ oauth })); assert.equal(report.configured, true); assert.deepEqual(report.missingMessagingScopes, []);
  assert.equal(report.liveSignInVerified, false); assert.ok(!JSON.stringify(report).includes(oauth.clientId));
  assert.deepEqual(checkMessagingOAuth(parseConfig({ oauth: { ...oauth, scopes: ['spark:all'] } })).missingMessagingScopes, []);
  assert.equal(checkMessagingOAuth(parseConfig({ oauth: { ...oauth, scopes: ['meeting:participants_read'] } })).missingMessagingScopes.length, 3);
  assert.equal(checkMessagingOAuth(defaults()).configured, false);
});
test('messages selects configured OAuth automatically; token mode is explicit, demos ignore credentials and missing profiles do not silently prompt for tokens', () => {
  const plain = defaults(), oauth = parseConfig({ oauth: { clientId: 'public', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all'] } });
  assert.equal(resolveMessagingAuth(oauth), 'oauth'); assert.equal(resolveMessagingAuth(oauth, 'token'), 'token');
  assert.equal(resolveMessagingAuth(plain), 'unconfigured'); assert.equal(resolveMessagingAuth(plain, 'token'), 'token');
  assert.equal(resolveMessagingAuth(oauth, undefined, true), 'demo'); assert.equal(resolveMessagingAuth(plain, undefined, true), 'demo');
  assert.throws(() => resolveMessagingAuth(oauth, 'anything')); assert.throws(() => resolveMessagingAuth(oauth, 'oauth', true));
});
test('Normal composer motions and familiar Neovim commands operate on the draft without sending or mutating other buffers', async () => {
  const f = await fixture(), actions: string[] = []; f.ui.onExternal = action => actions.push(action);
  try {
    await f.store.select('demo-general'); f.ui.action('insert'); f.ui.paste('ab\ncd'); f.ui.key('<Esc>');
    f.ui.key('0'); f.ui.key('x'); assert.equal(f.ui.draft?.text, 'ab\nd'); f.ui.key('k'); f.ui.key('l'); assert.equal(f.ui.draft?.cursor, 1);
    f.ui.key('A'); f.ui.key('!'); assert.equal(f.ui.draft?.text, 'ab!\nd'); f.ui.key('<Esc>');
    for (const command of ['colorscheme tokyonight', 'set nonumber', 'bnext']) { f.ui.key(':'); for (const char of command) f.ui.key(char); f.ui.key('<Enter>'); }
    assert.deepEqual(actions, ['theme tokyonight']); assert.equal(f.ui.config.messaging.lineNumbers, 'off'); assert.notEqual(f.ui.focus, 'compose');
    assert.equal(f.store.messages.length, 2);
  } finally { f.close(); }
});
test('messaging layouts tile every terminal cell, and responsive views render bounded Unicode without terminal injection', async () => {
  const f = await fixture();
  try {
    for (const layout of Object.values(f.ui.config.messaging.layouts)) {
      for (const [width, height] of [[140, 40], [81, 21]]) {
        const cells = new Set<string>();
        for (const pane of messageGeometry(layout, width!, height!, 0, 0)) for (let y = pane.y; y < pane.y + pane.height; y++) for (let x = pane.x; x < pane.x + pane.width; x++) {
          const key = `${x},${y}`; assert.ok(!cells.has(key)); cells.add(key);
        }
        assert.equal(cells.size, width! * height!);
      }
    }
    f.store.rooms[0]!.title = '👩🏽‍💻 界界';
    for (const [width, height] of [[140, 42], [40, 12], [8, 4]]) {
      const screen = f.ui.screen(width!, height!); assert.equal(screen.lines.length, height);
      assert.ok(screen.lines.every(line => stringWidth(line) === width));
      assert.match(screen.ansi, /\x1b\[38;2;/);
    }
  } finally { f.close(); }
});
test('Normal/Insert/Command modes isolate text, Escape never quits, Enter is newline, and explicit Ctrl+s sends to one selected space', async () => {
  const f = await fixture(), external: string[] = []; f.ui.onExternal = action => external.push(action);
  try {
    f.ui.key('<Esc>'); assert.equal(external.length, 0);
    f.ui.key('<Enter>'); await tick(); f.ui.key('i'); assert.equal(f.ui.mode, 'insert');
    for (const key of ['q', ':', 'i', '<Enter>', '界', '👩🏽‍💻']) f.ui.key(key);
    assert.equal(f.ui.draft?.text, 'q:i\n界👩🏽‍💻'); assert.equal(external.length, 0);
    assert.equal(f.store.messages.length, 2, 'Enter never sends');
    f.ui.key('<C-s>'); await tick(); assert.equal(f.store.messages.at(-1)?.text, 'q:i\n界👩🏽‍💻'); assert.equal(f.ui.draft?.text, '');
    f.ui.key('<Esc>'); assert.equal(f.ui.mode, 'normal');
    f.ui.key(':'); for (const key of 'theme forest') f.ui.key(key); assert.equal(external.length, 0);
    f.ui.key('<Enter>'); assert.deepEqual(external, ['theme forest']);
    f.ui.key(':'); for (const key of 'layout sta') f.ui.key(key); f.ui.key('<Tab>'); f.ui.key('<Enter>'); assert.equal(f.ui.layoutName, 'stacked');
  } finally { f.close(); }
});
test('custom leader sequences, remaps, macros and insert special-key overrides work without mutating text', async () => {
  const config = parseConfig({ leader: ',', messaging: { keybindings: { normal: { '<leader> e': ['move.down', 'open', 'insert'], q: null }, insert: { '<C-e>': 'send', '<C-s>': null } } } });
  const f = await fixture(config);
  try {
    f.ui.key(','); f.ui.key('e'); await tick(); assert.equal(f.store.room?.id, 'demo-engineering'); assert.equal(f.ui.mode, 'insert');
    f.ui.key('q'); f.ui.key('<C-s>'); assert.equal(f.store.messages.length, 2); assert.equal(f.ui.draft?.text, 'q');
    f.ui.key('<C-e>'); await tick(); assert.equal(f.store.messages.at(-1)?.text, 'q');
  } finally { f.close(); }
});
test('grapheme-aware editor handles multiline cursor/deletion, literal paste, injection filtering and UTF-16 length bounds', () => {
  const draft = new MessageDraft(); draft.insert('a👩🏽‍💻界\nbc');
  draft.edit('home'); draft.edit('up'); assert.equal(draft.cursor, 0); draft.edit('end'); assert.equal(draft.cursor, 3);
  draft.edit('backspace'); assert.equal(String(draft.text), 'a👩🏽‍💻\nbc'); draft.edit('left'); draft.edit('delete'); assert.equal(String(draft.text), 'a\nbc');
  draft.cursor = 0; draft.edit('home'); assert.equal(draft.cursor, 0);
  draft.insert('x\x03\x1b[31m\r\n'); assert.ok(!draft.text.includes('\x1b')); assert.ok(!draft.text.includes('\r'));
  draft.insert('👩🏽‍💻'.repeat(1000)); assert.ok(draft.text.length <= 1000); assert.ok(!/[\ud800-\udbff]$/.test(draft.text));
});
test('combining marks typed separately remain one cursor unit and one Backspace deletion', () => {
  const draft = new MessageDraft(); draft.insert('e'); draft.insert('\u0301'); assert.equal(draft.cursor, 1);
  draft.edit('backspace'); assert.equal(String(draft.text), ''); assert.equal(draft.cursor, 0);
});
test('long received messages remain readable with wrapped-line scrolling, and help exposes effective Insert mappings', async () => {
  const f = await fixture();
  try {
    await f.store.select('demo-general'); f.store.messages = [{ ...message('long'), text: 'BEGIN ' + 'long body '.repeat(300) + ' END' }];
    f.ui.focus = 'messages'; f.ui.maximized = true;
    assert.ok(f.ui.screen(60, 18).lines.join('\n').includes('END'));
    for (let i = 0; i < 30; i++) f.ui.action('scroll.up');
    assert.ok(f.ui.screen(60, 18).lines.join('\n').includes('BEGIN'));
    f.ui.action('help'); for (let i = 0; i < 20; i++) f.ui.key('<C-d>');
    assert.ok(f.ui.screen(100, 24).lines.join('\n').includes('edit.newline')); f.ui.key('<Esc>'); assert.equal(f.ui.help, false);
  } finally { f.close(); }
});
test('a send ACK cannot erase a draft that was cleared and retyped while the POST was pending', async () => {
  const api = demoMessageAPI(), pending = deferred<ChatMessage>(); api.send = () => pending.promise;
  const store = new MessagingStore(api, 0), ui = new MessagingUI(store, defaults());
  try {
    await store.loadRooms(); await store.select('demo-general'); ui.action('insert'); ui.paste('same text'); ui.action('send');
    ui.action('draft.clear'); ui.paste('same text'); pending.resolve({ ...message('ack'), text: 'same text' }); await tick();
    assert.equal(ui.draft?.text, 'same text');
  } finally { store.close(); }
});
test('space switching preserves independent drafts, a late send ACK only clears the original unchanged draft, and paste cannot send', async () => {
  const api = demoMessageAPI(), pending = deferred<ChatMessage>(), original = api.send;
  api.send = () => pending.promise;
  const store = new MessagingStore(api, 0), ui = new MessagingUI(store, defaults());
  try {
    await store.loadRooms(); await store.select('demo-general'); ui.action('insert'); ui.paste('literal q :quit\nsecond line');
    assert.equal(store.messages.length, 2); ui.action('send');
    await store.select('demo-engineering'); ui.paste('different room');
    pending.resolve(await original('demo-general', 'literal q :quit\nsecond line')); await tick();
    assert.equal(ui.draft?.text, 'different room'); assert.equal(store.messages.length, 2);
    await store.select('demo-general'); assert.equal(ui.draft?.text, '');
    ui.action('normal'); ui.paste('do not execute :send'); assert.equal(ui.draft?.text, '');
  } finally { store.close(); }
});
test('space filter and loaded-message search, focus, resize, zoom and layout round trip work independently', async () => {
  const f = await fixture();
  try {
    f.ui.screen(140, 42); f.ui.key('/'); for (const key of 'engineering') f.ui.key(key); f.ui.key('<Enter>');
    assert.equal(f.ui.visibleRooms.length, 1); f.ui.key('<Enter>'); await tick(); assert.equal(f.store.room?.id, 'demo-engineering');
    f.ui.action('search'); for (const key of 'separate') f.ui.key(key); f.ui.key('<Enter>'); assert.equal(f.ui.selectedMessage, 0);
    f.ui.action('focus.compose'); f.ui.action('pane.grow');
    assert.notDeepEqual(f.ui.layout, f.ui.config.messaging.layouts.mail); f.ui.action('pane.maximize'); assert.equal(f.ui.maximized, true);
    f.ui.action('layout detailed'); assert.equal(f.ui.maximized, false); assert.equal(messageGeometry(f.ui.layout, 140, 40).length, 4);
  } finally { f.close(); }
});
test('messaging layout.save is atomic/private and preserves themes, remaps, OAuth public profile and meeting layout', async () => {
  const dir = await mkdtemp('/tmp/opencode/wbx-messaging-config-'), path = join(dir, 'config.json');
  const raw = { theme: { accent: '#abcdef' }, keybindings: { q: null }, messaging: { keybindings: { normal: { J: 'move.down' } } } };
  try {
    await writeFile(path, JSON.stringify(raw)); await saveMessageLayout(path, 'work', messagingDefaults().layouts.detailed!);
    const saved = JSON.parse(await readFile(path, 'utf8')); assert.deepEqual(saved.theme, raw.theme); assert.deepEqual(saved.keybindings, raw.keybindings);
    assert.deepEqual(saved.messaging.keybindings, raw.messaging.keybindings); assert.equal(saved.messaging.layout, 'work'); assert.equal(saved.layout, undefined);
    assert.equal((await stat(path)).mode & 0o777, 0o600); parseConfig(saved);
    await writeFile(path, '{broken'); await assert.rejects(saveMessageLayout(path, 'work', messagingDefaults().layouts.mail!));
    assert.equal(await readFile(path, 'utf8'), '{broken');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('REST transport uses fixed TLS endpoint, current bearer, safe pagination, plaintext JSON and refuses credential leakage/redirects', async () => {
  let token = 'first-token'; const requests: { url: string; init?: RequestInit }[] = [];
  const api = new WebexMessagingAPI(() => token, async (url, init) => {
    requests.push({ url: String(url), init });
    if (init?.method === 'POST') return Response.json({ id: 'sent', roomId: 'space', personEmail: 'you@example.test', text: 'literal **text**', created: '2026-01-01' });
    return Response.json({ items: [{ id: 'space', title: 'Unsafe\x1b[31m title', type: 'group' }] }, { headers: { Link: '<https://webexapis.com/v1/rooms?max=100&cursor=next>; rel="next"' } });
  });
  try {
    const rooms = await api.rooms(); assert.ok(!rooms.items[0]!.title.includes('\x1b')); assert.ok(rooms.next);
    assert.equal(new URL(requests[0]!.url).searchParams.get('sortBy'), 'lastactivity', 'first-page selection requests newest spaces, not arbitrary IDs');
    token = 'rotated-token'; await api.rooms(rooms.next); await api.send('space', 'literal **text**');
    assert.equal(requests[0]!.init?.redirect, 'error'); assert.equal((requests[1]!.init?.headers as any).Authorization, 'Bearer rotated-token');
    assert.deepEqual(JSON.parse(requests[2]!.init!.body as string), { roomId: 'space', text: 'literal **text**' });
    assert.ok(requests.every(request => !request.url.includes('token')));
    for (const next of ['https://evil.test/v1/rooms', 'http://webexapis.com/v1/rooms', 'https://webexapis.com/v1/people', 'https://webexapis.com/v1/rooms#bad']) await assert.rejects(api.rooms(next));
    await assert.rejects(api.history('space', 'https://webexapis.com/v1/messages?roomId=other'));
    assert.equal(requests.length, 3, 'unsafe links never receive bearer credentials');
  } finally { api.close(); }
});
test('REST errors never expose provider bodies; uncertain POSTs, bad acknowledgments and oversized responses are never retried', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const api = new WebexMessagingAPI(() => 'synthetic-token', async () => { calls++; return new Response('private token/body', { status }); });
    try {
      await assert.rejects(api.send('space', 'hello'), error => error instanceof MessagingError && !error.message.includes('private') && (status !== 500 || error.reason === 'unknown'));
      assert.equal(calls, 1);
    } finally { api.close(); }
  }
  for (const value of [{ roomId: 'wrong', id: 'sent' }, { invalid: true }]) {
    const api = new WebexMessagingAPI(() => 'token', async () => Response.json(value));
    try { await assert.rejects(api.send('space', 'hello'), error => error instanceof MessagingError && error.reason === 'unknown'); } finally { api.close(); }
  }
  const api = new WebexMessagingAPI(() => 'token', async () => new Response('x'.repeat(1_048_577)));
  try { await assert.rejects(api.rooms(), /Invalid Webex response/); } finally { api.close(); }
});
test('REST cancellation aborts active HTTP requests, and long incoming messages are not silently cut at the composer limit', async () => {
  const api = new WebexMessagingAPI(() => 'token', async () => Response.json({ items: [
    { id: 'long', roomId: 'space', text: 'x'.repeat(9000), created: '2026-01-01' },
    { id: 'bounded', roomId: 'space', text: 'x'.repeat(11000), created: '2026-01-01' },
  ] }));
  try {
    const page = await api.history('space'); assert.equal(page.items[0]!.text.length, 9000); assert.match(page.items[1]!.text, /truncated/);
  } finally { api.close(); }
  let signal: AbortSignal | undefined;
  const waiting = new WebexMessagingAPI(() => 'token', (_url, init) => new Promise((_resolve, reject) => {
    signal = init?.signal ?? undefined; signal!.addEventListener('abort', () => reject(new Error('private body')));
  }));
  const request = waiting.rooms(); waiting.close(); await assert.rejects(request, error => error instanceof MessagingError && error.reason === 'canceled');
  assert.equal(signal!.aborted, true);
});
test('store rejects stale destinations, deduplicates sends, retains failed drafts and blocks ambiguous delivery until explicit resolution', async () => {
  let posts = 0;
  const api = demoMessageAPI(); api.send = async () => { posts++; throw new MessagingError('unknown', 'Delivery UNKNOWN.'); };
  const store = new MessagingStore(api, 0), ui = new MessagingUI(store, defaults());
  try {
    await store.loadRooms(); await store.select('demo-general'); ui.action('insert'); ui.paste('must retain'); ui.action('send'); await tick();
    assert.equal(ui.draft?.text, 'must retain'); assert.ok(store.uncertain.has('demo-general')); assert.equal(posts, 1);
    ui.action('send'); await tick(); assert.equal(posts, 1); assert.match(ui.notice, /unresolved/);
    await store.send('dedup', 'demo-engineering', 'stale'); assert.equal(posts, 1);
    ui.action('delivery.resolve'); await store.send('again', 'demo-general', 'explicit retry'); await store.send('again', 'demo-general', 'explicit retry');
    assert.equal(posts, 2);
  } finally { store.close(); }
});
test('stale history cannot overwrite a new space, and in-flight polls cannot erase a send acknowledgment', async () => {
  const api = demoMessageAPI(), first = deferred<{ items: ChatMessage[] }>(); let calls = 0;
  api.history = async () => ++calls === 1 ? first.promise : { items: [message('new-room')] };
  const store = new MessagingStore(api, 0);
  try {
    await store.loadRooms(); const stale = store.select('demo-general'); await store.select('demo-engineering');
    first.resolve({ items: [message('stale')] }); await stale;
    assert.equal(store.room?.id, 'demo-engineering'); assert.deepEqual(store.messages.map(item => item.id), ['new-room']);
    const reading = deferred<{ items: ChatMessage[] }>(); api.history = () => reading.promise;
    const poll = store.refresh();
    await store.send('during-poll', 'demo-engineering', 'send while polling');
    assert.ok(store.messages.some(item => item.text === 'send while polling'));
    reading.resolve({ items: [] }); await poll;
    assert.ok(store.messages.some(item => item.text === 'send while polling'), 'stale GET cannot erase a POST acknowledgment');
  } finally { store.close(); }
});
test('message history stays oldest-to-newest across opening, older pages, polling and out-of-order send acknowledgments', async () => {
  const at = (id: string, time: string): ChatMessage => ({ ...message(id), created: `2026-01-01T${time}:00.000Z` });
  let reads = 0;
  const api = demoMessageAPI();
  api.history = async () => ++reads === 1 ? { items: [at('newest', '12:00'), at('tie-b', '11:00'), at('first', '10:00'), at('tie-a', '11:00')], next: 'older' }
    : reads === 2 ? { items: [at('first', '10:00'), at('oldest', '09:00')] }
    : { items: [at('future', '13:00'), at('middle', '11:30'), at('newest', '12:00')] };
  api.send = async () => at('ack', '10:30');
  const store = new MessagingStore(api, 0);
  try {
    await store.loadRooms(); await store.select('demo-general');
    assert.deepEqual(store.messages.map(item => item.id), ['first', 'tie-a', 'tie-b', 'newest']);
    await store.refresh(true);
    assert.deepEqual(store.messages.map(item => item.id), ['oldest', 'first', 'tie-a', 'tie-b', 'newest']);
    await store.refresh();
    assert.deepEqual(store.messages.map(item => item.id), ['oldest', 'first', 'tie-a', 'tie-b', 'middle', 'newest', 'future']);
    await store.send('chronological-ack', 'demo-general', 'Synthetic only');
    assert.deepEqual(store.messages.map(item => item.id), ['oldest', 'first', 'ack', 'tie-a', 'tie-b', 'middle', 'newest', 'future']);
  } finally { store.close(); }
});
test('store space/history pagination is bounded and shutdown cancels polling and suppresses late replies', async () => {
  let rooms = 0, histories = 0, closed = false;
  const api: MessagingAPI = { rooms: async () => ({ items: Array.from({ length: 100 }, (_, i) => room(`room-${rooms * 100 + i}`)), next: String(++rooms) }),
    history: async () => ({ items: Array.from({ length: 100 }, (_, i) => message(`message-${histories * 100 + i}`)), next: String(++histories) }),
    send: async () => message('sent'), close() { closed = true; } };
  const store = new MessagingStore(api, 0);
  await store.loadRooms(); for (let i = 0; i < 10; i++) await store.loadRooms(true);
  assert.equal(store.rooms.length, 500); assert.equal(rooms, 5); assert.equal(store.moreRooms, false);
  await store.select('room-0'); for (let i = 0; i < 10; i++) await store.refresh(true);
  assert.equal(store.messages.length, 500); assert.equal(histories, 5); assert.equal(store.moreHistory, false);
  store.close(); await store.refresh(); assert.equal(histories, 5); assert.equal(closed, true);
});
