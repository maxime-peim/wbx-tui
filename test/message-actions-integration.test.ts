import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorEngine } from '../src/editor-engine.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
test('actual demo engine edits/deletes only own selected messages without new-message delivery or invented receipt endpoints', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('LIVE NETWORK FORBIDDEN'); });
  const engine = new EditorEngine(), deliveries: unknown[] = [];
  engine.on('delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    await assert.rejects(engine.prepareMessageAction('demo-general', engine.snapshot().messages[0]!.id, 'edit'), /Own-message/);
    await engine.send('plain', 'demo-general', 'Own original');
    const id = engine.snapshot().messages.at(-1)!.id, deliveryCount = deliveries.length, created = engine.snapshot().messages.at(-1)!.created;
    const context = await engine.prepareMessageAction('demo-general', id, 'edit');
    assert.equal(context.content, 'Own original');
    const outcome = await engine.mutateMessage({ contextId: context.contextId, requestId: 'edit', action: 'edit', revision: 8,
      content: 'Edited text', format: 'plain', conflictAccepted: true });
    assert.equal(outcome.status, 'changed'); assert.equal(engine.snapshot().messages.at(-1)!.text, 'Edited text');
    assert.equal(engine.snapshot().messages.at(-1)!.created, created); assert.equal(engine.snapshot().messages.at(-1)!.edited, true);
    assert.equal(deliveries.length, deliveryCount, 'a mutation is not a new-message ACK/creation');
    const removal = await engine.prepareMessageAction('demo-general', id, 'delete');
    assert.equal((await engine.mutateMessage({ contextId: removal.contextId, requestId: 'delete', action: 'delete', revision: 0, conflictAccepted: true })).status, 'changed');
    assert.ok(!engine.snapshot().messages.some(item => item.id === id));
    assert.equal(engine.snapshot().historyLatest, false, 'deletion cannot authorize an invented earlier receipt endpoint');
    await engine.history(); assert.ok(!engine.snapshot().messages.some(item => item.id === id), 'confirmed tombstone survives a poll');
    assert.equal(deliveries.length, deliveryCount);
  } finally { engine.stop(); }
});
test('actual engine rich sends preserve literal plaintext, validate mention targets and bind format/draft identity to delivery', async t => {
  let network = 0; t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK FORBIDDEN'); });
  const engine = new EditorEngine(), deliveries: any[] = [];
  engine.on('delivery', value => deliveries.push(value));
  try {
    await engine.start('demo'); await engine.select('demo-general');
    await engine.send('literal', 'demo-general', '<@all> is literal plaintext');
    assert.equal(engine.snapshot().messages.at(-1)!.markdown, undefined);
    const binding = { roomId: 'demo-general', draftId: 'native-draft' }, text = '**Rich** <@personId:demo-other|Person>';
    await engine.sendRich('unconsented', text, binding, {});
    assert.equal(deliveries.at(-1).status, 'failed');
    await engine.sendRich('rich', text, binding, { mentionsAccepted: true });
    assert.equal(deliveries.at(-1).status, 'sent'); assert.equal(deliveries.at(-1).format, 'markdown');
    assert.equal(deliveries.at(-1).draftId, binding.draftId); assert.equal(deliveries.at(-1).attachmentId, undefined);
    const count = engine.snapshot().messages.length;
    await engine.sendRich('rich', text, binding, { mentionsAccepted: true });
    assert.equal(engine.snapshot().messages.length, count);
    await assert.rejects(engine.sendRich('rich', text, { ...binding, draftId: 'other' }, { mentionsAccepted: true }));
    await engine.sendRich('all-no', '<@all>', binding, { mentionsAccepted: true });
    assert.equal(deliveries.at(-1).status, 'failed');
    await engine.sendRich('all-yes', '<@all>', binding, { mentionsAccepted: true, allAccepted: true });
    assert.equal(deliveries.at(-1).status, 'sent');
    const roster = await engine.roomMembers();
    assert.equal(roster.roomId, binding.roomId); assert.equal(roster.items.length, 2); assert.equal(roster.partial, false);
    assert.equal(network, 0);
  } finally { engine.stop(); }
});
test('message action wire admission never accepts caller authors, raw update fingerprints, arbitrary targets or implicit consent', () => {
  const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
  const intent = { contextId: 'a'.repeat(32), requestId: 'edit', action: 'edit', content: 'Text', format: 'plain', revision: 0, conflictAccepted: true };
  assert.equal(parse('messages.actionSubmit', intent).method, 'messages.actionSubmit');
  for (const patch of [{ authorId: 'self' }, { fingerprint: 'forged' }, { conflictAccepted: false }, { content: 'a'.repeat(1001) }, { revision: -1 }]) assert.throws(() => parse('messages.actionSubmit', { ...intent, ...patch }));
  assert.throws(() => parse('members.list', { roomId: 'arbitrary-other-room' }));
  assert.throws(() => parse('messages.sendRich', { roomId: 'room', draftId: 'draft', requestId: 'id', text: 'Text', html: '<script>' }));
});
