import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageContent } from '../src/message-content.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';

test('rich messages preserve server Markdown instead of displaying the stripped plain-text alternative', () => {
  const message = messageContent({ text: 'Bold and code', markdown: '**Bold** and `code`', html: '<p><strong>Bold</strong> and <code>code</code></p>' });
  assert.equal(message.text, 'Bold and code'); assert.equal(message.markdown, '**Bold** and `code`');
  assert.equal(message.quoted, undefined);
});
test('HTML-only Webex content becomes native Markdown with quote structure, formatting, lists, links and code', () => {
  const message = messageContent({ text: 'stripped', html: '<h2>Heading</h2><p><strong>Bold</strong> <em>italic</em> <s>old</s></p><blockquote><p>Alice &amp; Bob</p><p>Original text</p></blockquote><ol><li>First</li><li>Second</li></ol><p><a href="https://example.test/path">Link</a><br>Line</p><pre><code>const x = &lt;tag&gt;;\n```</code></pre>' });
  assert.equal(message.quoted, true);
  assert.match(message.markdown!, /## Heading/); assert.match(message.markdown!, /\*\*Bold\*\* \*italic\* ~~old~~/);
  assert.match(message.markdown!, /> Alice & Bob/); assert.match(message.markdown!, /> Original text/);
  assert.match(message.markdown!, /1\. First/); assert.match(message.markdown!, /2\. Second/);
  assert.match(message.markdown!, /\[Link\]\(<https:\/\/example\.test\/path>\)/);
  assert.match(message.markdown!, /````\nconst x = <tag>;\n```\n````/);
  assert.match(messageContent({ html: '<pre>a\n\n\nb</pre>' }).markdown!, /a\n\n\nb/, 'code block whitespace is not compacted like paragraph separators');
});
test('published spark-mention preserves raw Markdown identity and renders HTML-only labels without duplicate @', () => {
  const markup = '<spark-mention data-object-type="person" data-object-id="opaque-person-id">Example person</spark-mention>';
  const prefixed = markup.replace('>Example', '>@Example');
  assert.equal(messageContent({ text: 'Example person', markdown: markup, html: markup }).markdown, markup,
    'exact original Markdown remains native source for history conceal/copying');
  assert.equal(messageContent({ html: markup }).markdown, '@Example person');
  assert.equal(messageContent({ html: prefixed }).markdown, '@Example person');
  assert.equal(messageContent({ html: '<spark-mention data-object-type="all">all</spark-mention>' }).markdown, '@all');
  assert.ok(!messageContent({ html: markup }).markdown!.includes('opaque-person-id'), 'HTML conversion renders labels, not identity attributes');
});
test('forwarding is not guessed from message text, IDs, arbitrary flags or blockquote examples inside fenced code', () => {
  for (const value of [{ text: 'Forwarded: normal text', isForwarded: true, parentId: 'thread' },
    { text: 'code', markdown: '```text\n> not a quote\n```' }, { text: 'escaped', markdown: '\\> not a quote' },
    { text: 'code', html: '<pre>&gt; not a quote</pre>' }]) assert.equal(messageContent(value).quoted, undefined);
  assert.equal(messageContent({ markdown: '> a real quote' }).quoted, true);
});
test('HTML conversion never executes active content or retains active links, resource tags, controls or bidi overrides', () => {
  const message = messageContent({ html: '<!DOCTYPE html><p>Safe</p><script>PRIVATE_SCRIPT</script><style>PRIVATE_STYLE</style><iframe src="https://invalid.test">PRIVATE_FRAME</iframe><img src="https://invalid.test" onerror="PRIVATE_HANDLER"><a href="javascript:PRIVATE_URL">label</a><p>&#27; &#x202e; end</p>' });
  assert.ok(!JSON.stringify(message).includes('PRIVATE_')); assert.ok(!JSON.stringify(message).includes('invalid.test'));
  assert.match(message.markdown!, /Safe/); assert.match(message.markdown!, /\[Image\]/); assert.match(message.markdown!, /label/);
  assert.doesNotMatch(message.markdown!, /[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
});
test('rich input is bounded, handles malformed HTML and deep nesting, and retains the plaintext fallback', () => {
  const huge = messageContent({ markdown: '界'.repeat(20_000), html: '<b>'.repeat(1000) + 'deep' + '</b>'.repeat(1000), text: 'fallback' });
  assert.equal(huge.text, 'fallback'); assert.ok(huge.markdown!.length < 10_100); assert.match(huge.markdown!, /truncated/);
  assert.ok(messageContent({ html: '<p><b>broken', markdown: [] }).markdown?.includes('broken'));
  assert.equal(messageContent({ text: 'fallback', html: {}, markdown: false }).text, 'fallback');
  assert.match(messageContent({ html: '<p>' + 'x'.repeat(50_000) }).markdown!, /safe display limits/);
});
test('REST history and send acknowledgments retain only bounded display metadata; sends remain plaintext', async () => {
  const raw = { id: 'message', roomId: 'space', text: 'literal **text**', created: '2026-11-16T10:00:00Z',
    html: '<blockquote><p>Original <b>text</b></p></blockquote>', markdown: '> Original **text**', private: 'PRIVATE_FIELD' };
  let posted = '';
  const api = new WebexMessagingAPI(() => 'synthetic-token', async (_url, init) => {
    if (init?.method === 'POST') { posted = String(init.body); return Response.json(raw); }
    return Response.json({ items: [raw] });
  });
  try {
    const history = await api.history('space'), sent = await api.send('space', 'literal **text**');
    assert.equal(history.items[0]!.markdown, raw.markdown); assert.equal(history.items[0]!.quoted, true);
    assert.equal(sent.quoted, true); assert.equal(sent.markdown, raw.markdown);
    assert.ok(!JSON.stringify(history).includes('PRIVATE_FIELD'));
    assert.deepEqual(JSON.parse(posted), { roomId: 'space', text: 'literal **text**' });
  } finally { api.close(); }
});
