import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardText, CARD_TEXT_LIMITS } from '../src/card-text.js';
import { messageContent } from '../src/message-content.js';
import { parseMessage, WebexMessagingAPI } from '../src/messaging-api.js';
import { EditorEngine } from '../src/editor-engine.js';
import { MessageQueries } from '../src/message-queries.js';
const envelope = (body: unknown, extra: object = {}, version = '1.3') => ({
  contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', version, body, ...extra },
});
const raw = { id: 'card-message', roomId: 'room', personId: 'sender', created: '2026-11-15T10:00:00.000Z',
  text: 'Fallback', markdown: '**Fallback**', attachments: [envelope([
    { type: 'TextBlock', text: 'Visible card <@all> ${notEvaluated}' },
    { type: 'FactSet', facts: [{ title: 'Owner', value: 'Same Name' }] },
    { type: 'ColumnSet', columns: [{ type: 'Column', items: [{ type: 'Container', items: [{ type: 'TextBlock', text: 'Nested' }] }] }] },
  ])] };
test('versioned card text projects only the finite readable schema, preserving source order and inert literals', () => {
  const value = cardText(raw.attachments);
  assert.equal(value.count, 1); assert.equal(value.partial, false);
  assert.match(value.text, /Adaptive Card 1\.3.*read-only/);
  assert.match(value.text, /Visible card <@all> \$\{notEvaluated\}[\s\S]*Owner: Same Name[\s\S]*Nested/);
  for (const version of ['1.0', '1.1', '1.2', '1.3']) {
    assert.match(cardText([envelope([{ type: 'TextBlock', text: 'Visible' }], {}, version)]).text, /Visible/);
  }
});
test('hidden subtrees, input defaults, action data/URLs and nested ShowCards are never projected or traversed', () => {
  const hidden = Object.defineProperty({ type: 'Container', isVisible: false }, 'items', { get() { assert.fail('Hidden subtree traversal'); } });
  const value = cardText([envelope([
    hidden, { type: 'TextBlock', isVisible: 'true', text: 'PRIVATE_VISIBILITY' },
    { type: 'Container', requires: { PRIVATE: '1.0' }, items: [{ type: 'TextBlock', text: 'PRIVATE_REQUIRES' }] },
    { type: 'Input.Text', label: 'PRIVATE_LABEL', value: 'PRIVATE_DEFAULT', id: 'PRIVATE_ID' },
    { type: 'Image', altText: 'PRIVATE_ALT', url: 'https://evil.invalid/PRIVATE_IMAGE' },
    { type: 'ActionSet', actions: [{ type: 'Action.Submit', data: 'PRIVATE_ACTION' }] },
    { type: 'TextBlock', text: 'Visible', selectAction: { url: 'https://evil.invalid/PRIVATE_SELECT' } },
  ], { actions: [{ type: 'Action.ShowCard', title: 'PRIVATE_TITLE', card: { body: [{ type: 'TextBlock', text: 'PRIVATE_SHOW' }] } }],
    refresh: { token: 'PRIVATE_REFRESH' }, authentication: { token: 'PRIVATE_AUTH' }, fallbackText: 'PRIVATE_FALLBACK' })]);
  assert.doesNotMatch(value.text, /PRIVATE|evil\.invalid/); assert.match(value.text, /Visible/);
  assert.equal(value.partial, true);
});
test('unknown/malformed cards stay inert, never schema-downgraded or dumped as raw JSON', () => {
  for (const value of [envelope([{ type: 'TextBlock', text: 'PRIVATE' }], {}, '1.4'),
    envelope([{ type: 'TextBlock', text: 'PRIVATE' }], {}, '2.0'), envelope([{ type: 'TextBlock', text: 'PRIVATE' }], {}, '1.3.0'),
    { contentType: 'unknown/PRIVATE', content: { type: 'TextBlock', text: 'PRIVATE' } },
    { contentType: 'application/vnd.microsoft.card.adaptive', content: 'PRIVATE' },
    envelope([{ type: 'Unknown', nested: { text: 'PRIVATE' } }]), envelope([{ type: 'TextBlock', text: { PRIVATE: true } }])]) {
    const result = cardText([value]); assert.equal(result.partial, true);
    assert.doesNotMatch(result.text, /PRIVATE/); assert.match(result.text, /omitted|unsupported/i);
  }
  const version = { toString() { assert.fail('No card schema coercion/evaluation'); } };
  assert.equal(cardText([{ contentType: 'application/vnd.microsoft.card.adaptive',
    content: { type: 'AdaptiveCard', version } }]).partial, true);
  assert.deepEqual(cardText(undefined), { text: '', count: 0, partial: false });
  assert.deepEqual(cardText([]), { text: '', count: 0, partial: false });
});
test('card sanitizer strips terminal/bidi controls and cannot promote strings into executable rich markup', () => {
  const value = messageContent({ text: 'Fallback', markdown: '**Fallback**',
    attachments: [envelope([{ type: 'TextBlock', text: '\x1b]52;SECRET\x07\u202e\n> quote\n# title\n<script>not executed</script>' }])] });
  assert.doesNotMatch(value.text, /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
  assert.match(value.markdown!, /\\> quote/); assert.match(value.markdown!, /\\# title/);
  assert.equal(value.quoted, undefined, 'card strings cannot fabricate a message quotation');
  assert.deepEqual(value.cards, { count: 1, partial: false });
});
test('attachment, child, node, depth and output saturation remain explicitly partial and bounded', () => {
  const cases = [
    Array.from({ length: 11 }, () => envelope([{ type: 'TextBlock', text: 'visible' }])),
    [envelope(Array.from({ length: 33 }, (_, i) => ({ type: 'TextBlock', text: 'item ' + i })))],
    Array.from({ length: 10 }, () => envelope(Array.from({ length: 32 }, () => ({ type: 'FactSet', facts: [{ title: 'a', value: 'b' }] })))),
    [envelope(Array.from({ length: 32 }, () => ({ type: 'TextBlock', text: '😀'.repeat(3000) })))],
  ];
  let deep: object = { type: 'TextBlock', text: 'PRIVATE_TOO_DEEP' };
  for (let i = 0; i < 100; i++) deep = { type: 'Container', items: [deep] };
  cases.push([envelope([deep])]);
  for (const input of cases) {
    const value = cardText(input); assert.equal(value.partial, true);
    assert.ok(value.count <= 10); assert.ok(value.text.length <= CARD_TEXT_LIMITS.textUnits);
    assert.ok(Buffer.byteLength(value.text) <= CARD_TEXT_LIMITS.textBytes);
    assert.match(value.text, /omitted|truncated/i); assert.doesNotMatch(value.text, /PRIVATE_TOO_DEEP/);
  }
  const cycle: { type: string; items: object[] } = { type: 'Container', items: [] }; cycle.items.push(cycle);
  assert.equal(cardText([envelope([cycle])]).partial, true, 'local cyclic fixtures cannot recurse unboundedly');
});
test('ordinary messages are unchanged; plain/rich fallback remains before bounded card additions', () => {
  assert.deepEqual(messageContent({ text: 'ordinary', markdown: '**ordinary**' }), { text: 'ordinary', markdown: '**ordinary**' });
  const parsed = parseMessage(raw, 'room')!;
  assert.match(parsed.text, /^Fallback\n\n/); assert.match(parsed.text, /Visible card/);
  assert.match(parsed.markdown!, /^\*\*Fallback\*\*\n\n/); assert.match(parsed.markdown!, /Visible card/);
  assert.deepEqual(parsed.cards, { count: 1, partial: false });
  const huge = messageContent({ ...raw, text: 'x'.repeat(20000), markdown: 'y'.repeat(20000) });
  assert.ok(huge.text.length <= 10100); assert.ok(huge.markdown!.length <= 10100);
  assert.match(huge.text, /truncated/); assert.equal(huge.cards!.partial, true);
});
test('REST and explicit queries render only inert card text, with no new physical requests or raw card DTOs', async () => {
  let calls = 0;
  const api = new WebexMessagingAPI(() => 'INERT', async (_url, init) => {
    calls++; assert.equal(init?.method ?? 'GET', 'GET'); return Response.json({ items: [raw] });
  });
  try {
    const history = await api.history('room'); assert.equal(calls, 1);
    assert.match(history.items[0]!.text, /Visible card/);
    assert.doesNotMatch(JSON.stringify(history), /contentType|selectAction|AdaptiveCard/);
    const queries = new MessageQueries();
    const value = await queries.mentions({ sessionId: 'a'.repeat(32), roomId: 'room' }, {
      busy: () => false, async call(_path, method) { calls++; assert.equal(method, 'GET'); return { value: { items: [raw] } }; },
    }, () => 'INERT', new AbortController().signal);
    assert.equal(calls, 2); assert.match(value.items[0]!.text, /Visible card/);
    assert.equal(value.items[0]!.contentPartial, true);
    assert.equal('cards' in value.items[0]!, false, 'strict query DTO stays inert text only');
  } finally { api.close(); }
});
test('main-history snapshot card metadata is defensively copied, not a raw card/action registry', async () => {
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const events = engine.snapshot().messageEvents;
    const store = (engine as unknown as { store: { messages: unknown[] } }).store;
    store.messages = [parseMessage(raw, 'room')!];
    const first = engine.snapshot(); first.messages[0]!.cards!.count = 10;
    assert.deepEqual(engine.snapshot().messages[0]!.cards, { count: 1, partial: false });
    assert.doesNotMatch(JSON.stringify(engine.snapshot().messages), /contentType|AdaptiveCard|actions|inputs/);
    assert.deepEqual(engine.snapshot().messageEvents, events, 'card rendering is not a new-message notification');
  } finally { engine.stop(); }
});
