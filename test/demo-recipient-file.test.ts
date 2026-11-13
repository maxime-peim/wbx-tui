import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postDemoRecipientFile } from '../src/demo-recipient-file.js';
import type { UploadSource } from '../src/uploads.js';
import type { DirectFiles } from '../src/conversation-actions.js';
import type { MessagingStore } from '../src/messaging-store.js';

function fixture(chunks: Uint8Array[] = [Uint8Array.of(0, 255), Uint8Array.of(13, 10, 65)]) {
  const events: string[] = [], calls: Record<string, unknown>[] = [], signal = new AbortController().signal;
  const ack = { id: 'synthetic-ack' };
  const source: UploadSource = { attachmentId: 'a'.repeat(32), name: 'synthetic.bin', bytes: chunks.reduce((n, b) => n + b.length, 0),
    async *read(active) {
      assert.equal(active, signal); events.push('read');
      for (const bytes of chunks) { events.push('chunk'); yield bytes; }
      events.push('consumed');
    } };
  const store: Pick<MessagingStore, 'demoConversation'> = { async demoConversation(action, input) {
    assert.equal(this, store); assert.equal(action, 'direct'); events.push('post'); calls.push(input); return ack;
  } };
  return { source, signal, ack, store, events, calls,
    current: () => { events.push('store'); return store; }, submitted: () => { events.push('submitted'); } };
}
test('demo recipient-file posting consumes the staged stream before submission/current-store lookup and never forwards raw bytes or paths', async () => {
  const f = fixture(), result = await postDemoRecipientFile(f.current, f.source, { toPersonId: 'peer' }, 'Exact text', {}, f.signal, f.submitted);
  assert.equal(result, f.ack);
  assert.deepEqual(f.events, ['read', 'chunk', 'chunk', 'consumed', 'submitted', 'store', 'post']);
  assert.deepEqual(f.calls, [{ toPersonId: 'peer', personId: 'peer', text: 'Exact text', markdown: undefined, file: true }]);
  assert.doesNotMatch(JSON.stringify(f.calls), /synthetic\.bin|attachmentId|bytes|path|token/);
});

test('demo recipient-file plain Markdown and bound-room targets retain exact literal fields without inferring a recipient or fallback', async () => {
  for (const target of [{ toPersonId: 'opaque-peer' }, { roomId: 'confirmed-direct' }] as Parameters<DirectFiles['post']>[1][]) {
    for (const format of [undefined, 'markdown'] as const) {
      const f = fixture(), text = '  **résumé 😀**\n`exact`\n';
      await postDemoRecipientFile(f.current, f.source, target, text, format ? { format } : {}, f.signal, f.submitted);
      assert.deepEqual(f.calls[0], { ...target, personId: 'toPersonId' in target ? target.toPersonId : undefined,
        text: format ? undefined : text, markdown: format ? text : undefined, file: true });
    }
  }
});

test('demo recipient-file posting accepts an already-admitted zero-byte file with empty plain text', async () => {
  const f = fixture([]);
  await postDemoRecipientFile(f.current, f.source, { toPersonId: 'peer' }, '', {}, f.signal, f.submitted);
  assert.deepEqual(f.events, ['read', 'consumed', 'submitted', 'store', 'post']);
  assert.equal(f.calls[0]!.text, ''); assert.equal(f.calls[0]!.file, true);
});

test('demo recipient-file read failure propagates before submission and does not fetch a store or replay', async () => {
  const f = fixture(), error = Error('Synthetic snapshot failure');
  f.source.read = async function* () { f.events.push('read'); yield Uint8Array.of(1); throw error; };
  await assert.rejects(postDemoRecipientFile(f.current, f.source, { toPersonId: 'peer' }, 'Text', {}, f.signal, f.submitted), value => value === error);
  await Promise.resolve(); assert.deepEqual(f.events, ['read']); assert.deepEqual(f.calls, []);
});

test('demo recipient-file submission callback can refuse stale authority before current-store lookup or synthetic mutation', async () => {
  const f = fixture(), error = Error('Synthetic stale session');
  await assert.rejects(postDemoRecipientFile(f.current, f.source, { toPersonId: 'peer' }, 'Text', {}, f.signal,
    () => { f.events.push('refused'); throw error; }), value => value === error);
  assert.deepEqual(f.events, ['read', 'chunk', 'chunk', 'consumed', 'refused']); assert.deepEqual(f.calls, []);
});

test('demo recipient-file current-store resolution stays after streaming and submitted rather than capturing an earlier store', async () => {
  const f = fixture(), old = f.store, next = fixture().store;
  let current = old, release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  f.source.read = async function* (signal) { assert.equal(signal, f.signal); entered(); await held; yield Uint8Array.of(1); };
  const pending = postDemoRecipientFile(() => { f.events.push('store'); return current; }, f.source, { roomId: 'real-room' }, 'Text', {},
    f.signal, () => { f.events.push('submitted'); current = next; });
  await started; assert.deepEqual(f.events, []); release(); await pending;
  assert.deepEqual(f.events, ['submitted', 'store']); assert.deepEqual(f.calls, []);
});

test('demo recipient-file sandbox rejection is unchanged possible-write evidence for its caller, never an internal retry', async () => {
  const f = fixture(), error = Error('Synthetic lost ACK');
  f.store.demoConversation = async () => { f.events.push('post'); throw error; };
  await assert.rejects(postDemoRecipientFile(f.current, f.source, { toPersonId: 'peer' }, 'Text', {}, f.signal, f.submitted), value => value === error);
  await Promise.resolve(); assert.equal(f.events.filter(event => event === 'post').length, 1);
  assert.equal(f.events.filter(event => event === 'submitted').length, 1);
});
