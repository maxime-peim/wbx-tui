/** MF15 contract-first assertions, now exercised by the recipient/upload owners. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ConversationActions } from '../src/conversation-actions.js';
import { RoomMembers, authenticatedSelf } from '../src/room-members.js';
import { PublicProblem, type ActionREST, type PublicMethod } from '../src/public-rest.js';
import { Uploads } from '../src/uploads.js';
import { multipart } from '../src/upload-http.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import net from 'node:net';

const targetId = 'a'.repeat(32), attachmentId = 'b'.repeat(32);
const recipient = { targetId, draftId: 'recipient-draft' };
const rich = { format: 'markdown' as const };
type DirectOptions = { format?: 'markdown'; attachmentId?: string };
const until = async (check: () => boolean) => {
  const end = Date.now() + 3000;
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'owned physical file cleanup must settle');
};
function fixture(change: { missingEcho?: boolean; wrongEcho?: boolean; roomRefusal?: boolean } = {}) {
  const calls: { path: string; method: PublicMethod; body?: any }[] = [];
  let nextId = 0;
  const rest: ActionREST = { busy: () => false, async call(path, method, _token, signal, body) {
    assert.equal(signal.aborted, false);
    calls.push({ path, method, body });
    if (path === '/v1/people/me') return { value: { id: 'self' } };
    if (path === '/v1/people/peer') return { value: { id: 'peer', displayName: 'Same Name' } };
    if (path === '/v1/rooms/direct') {
      if (change.roomRefusal) throw new PublicProblem('failed', 403);
      return { value: { id: 'direct', type: 'direct', title: 'A label, not identity' } };
    }
    if (path === '/v1/messages' && method === 'POST') {
      const sent = body as Record<string, unknown>;
      return { value: { id: 'message-' + ++nextId, roomId: 'direct', roomType: 'direct', personId: 'self',
        ...(!change.missingEcho ? { toPersonId: change.wrongEcho ? 'foreign' : 'peer' } : {}),
        created: '2026-11-15T10:00:00.000Z',
        ...(sent.markdown !== undefined ? { markdown: sent.markdown } : { text: sent.text }) } };
    }
    assert.fail('No unaccounted REST/SDK/room scan boundary: ' + path);
  } };
  const access = { token: 'INERT', scopes: ['spark:people_read', 'spark:messages_write', 'spark:rooms_read'], expiresAt: Date.now() + 600000 };
  const owner = new ConversationActions(rest, new RoomMembers(), () => access,
    (signal, token) => authenticatedSelf(rest, signal, token));
  const send = (request: string, target: string, draft: string, text: string, options: DirectOptions = {}) =>
    owner.sendDirect(request, target, draft, text, () => true, options);
  return { owner, access, rest, calls, send };
}
test('MF15 finite direct RPC accepts rich/file intent but never caller person/room/root/bytes or missing creation consent', () => {
  const parse = (params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'direct.send', params });
  const base = { ...recipient, requestId: 'one', text: '**Rich**', confirmed: true };
  for (const options of [rich, { attachmentId }, { ...rich, attachmentId }]) {
    assert.deepEqual(parse({ ...base, ...options }), { method: 'direct.send', params: { ...base, ...options } });
  }
  assert.equal(parse({ ...base, text: '', attachmentId }).method, 'direct.send');
  for (const patch of [{ roomId: 'guessed-room' }, { personId: 'foreign' }, { toPersonId: 'foreign' }, { parentId: 'root' },
    { files: [attachmentId] }, { bytes: 'base64' }, { url: 'https://evil.invalid' }, { format: 'html' }, { confirmed: false },
    { attachmentId: 'wrong' }, { mentionsAccepted: true }]) assert.throws(() => parse({ ...base, ...rich, ...patch }));
  assert.throws(() => parse({ ...base, ...rich, attachmentId, text: '' }), 'blank Markdown cannot downgrade to a plain file');
});
test('MF15 upload RPC stages/removes by mutually exclusive opaque recipient identity, never a fabricated room', () => {
  const parse = (method: string, params: Record<string, unknown>) => parseEditorOperation({ jsonrpc: '2.0', id: 1, method, params });
  assert.deepEqual(parse('uploads.stage', { ...recipient, path: '/explicit/local.bin' }),
    { method: 'uploads.stage', params: { ...recipient, path: '/explicit/local.bin' } });
  assert.equal(parse('uploads.remove', { ...recipient, attachmentId }).method, 'uploads.remove');
  for (const extra of [{ roomId: 'fabricated' }, { parentId: 'root' }, { personId: 'peer' }, { token: 'secret' }]) {
    assert.throws(() => parse('uploads.stage', { ...recipient, path: '/explicit/local.bin', ...extra }));
  }
  assert.throws(() => parse('uploads.send', { ...recipient, attachmentId, requestId: 'not-an-alternate-direct-sender', text: 'No' }));
});
test('MF15 first rich send uses one exact toPersonId JSON mutation then verifies the returned room; no plaintext fallback', async () => {
  const f = fixture(), prepared = await f.owner.prepareDirect('peer', () => true), text = '  **résumé 😀**\n`exact`\n';
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  f.calls.length = 0;
  const result = await f.send('first-rich', prepared.targetId, 'recipient-draft', text, rich);
  assert.equal(result.outcome.status, 'changed');
  assert.deepEqual(f.calls.map(call => [call.method, call.path]), [
    ['GET', '/v1/people/me'], ['GET', '/v1/people/peer'], ['POST', '/v1/messages'], ['GET', '/v1/rooms/direct'],
  ]);
  assert.deepEqual(f.calls.find(call => call.method === 'POST')!.body, { toPersonId: 'peer', markdown: text });
  assert.equal(result.outcome.format, 'markdown'); assert.equal(result.outcome.text, text);
  assert.equal(result.outcome.targetId, prepared.targetId); assert.equal(result.outcome.draftId, 'recipient-draft');
});
test('MF15 later rich recipient send is bound only to its confirmed real room, without a second DM creation route', async () => {
  const f = fixture(), prepared = await f.owner.prepareDirect('peer', () => true);
  await f.send('first', prepared.targetId, 'recipient-draft', '**One**', rich);
  const result = await f.send('later', prepared.targetId, 'recipient-draft', '**Two**', rich);
  assert.equal(result.outcome.status, 'changed');
  assert.deepEqual(f.calls.filter(call => call.method === 'POST').at(-1)!.body, { roomId: 'direct', markdown: '**Two**' });
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});
for (const kind of ['missingEcho', 'wrongEcho'] as const) test(`MF15 new-mode ${kind} ACK is unknown, never inferred from a direct room/title`, async () => {
  const f = fixture({ [kind]: true }), prepared = await f.owner.prepareDirect('peer', () => true);
  const result = await f.send('bad-echo', prepared.targetId, 'recipient-draft', '**Exact**', rich);
  assert.equal(result.outcome.status, 'unknown');
  assert.equal(f.owner.recipient(prepared.targetId)!.roomId, undefined);
  await assert.rejects(f.send('different-id', prepared.targetId, 'recipient-draft', '**Exact**', rich));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('MF15 a refused room GET after a successful POST remains unknown, not a failed creation', async () => {
  const f = fixture({ roomRefusal: true }), prepared = await f.owner.prepareDirect('peer', () => true);
  const result = await f.send('room-refused', prepared.targetId, 'recipient-draft', '**Sent before the read failed**', rich);
  assert.equal(result.outcome.status, 'unknown');
  await assert.rejects(f.send('do-not-recreate', prepared.targetId, 'recipient-draft', 'Another', rich));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('MF15 real Markdown mentions cannot be authorized in a 1:1 first send or trigger a placeholder POST', async () => {
  for (const text of ['<@all>', '<@personId:peer|Same Name>', '<@personEmail:x@example.invalid>']) {
    const f = fixture(), prepared = await f.owner.prepareDirect('peer', () => true);
    const result = await f.send('no-mentions', prepared.targetId, 'recipient-draft', text, rich).catch(() => undefined);
    assert.ok(!result || result.outcome.status === 'failed');
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  }
});
test('MF15 shared recipient ledger binds new-mode format and file identity, not just target/draft/text', async () => {
  const f = fixture(), prepared = await f.owner.prepareDirect('peer', () => true);
  await f.send('used', prepared.targetId, 'recipient-draft', 'Same text');
  await assert.rejects(f.send('used', prepared.targetId, 'recipient-draft', 'Same text', rich));
  await assert.rejects(f.send('used', prepared.targetId, 'recipient-draft', 'Same text', { attachmentId }));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('MF15 recipient snapshot is target-bound and shares the same immutable upload source, never the normal-room namespace', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-direct-file-red-'), path = join(directory, 'local.bin'), owner = new Uploads({ temporaryRoot: directory });
  try {
    await writeFile(path, 'Original staged source');
    const staged = await owner.stage(path, recipient as any);
    await writeFile(path, 'Replaced path is not sent');
    let calls = 0;
    await assert.rejects(owner.send(staged.attachmentId, { roomId: targetId, draftId: recipient.draftId }, () => true, async () => { calls++; }));
    await assert.rejects(owner.send(staged.attachmentId, { ...recipient, targetId: 'c'.repeat(32) } as any, () => true, async () => { calls++; }));
    const value = await owner.send(staged.attachmentId, recipient as any, () => true, async (source, signal, submitted) => {
      calls++; submitted(); const chunks: Buffer[] = [];
      for await (const chunk of source.read(signal)) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString();
    });
    assert.equal(value, 'Original staged source'); assert.equal(calls, 1);
  } finally {
    owner.reset(); await until(() => !owner.diagnostics().references && !owner.diagnostics().cleaning);
    await rm(directory, { recursive: true, force: true });
  }
});
test('MF15 normal and recipient snapshots share the eight-reference budget rather than adding a second file owner', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-direct-quota-red-'), path = join(directory, 'local.bin'), owner = new Uploads({ temporaryRoot: directory });
  try {
    await writeFile(path, '');
    for (let i = 0; i < 8; i++) await owner.stage(path, (i % 2
      ? { targetId, draftId: 'direct-' + i } : { roomId: 'room', draftId: 'normal-' + i }) as any);
    assert.equal(owner.diagnostics().references, 8);
    await assert.rejects(owner.stage(path, { ...recipient, draftId: 'overflow' } as any));
    assert.equal(owner.diagnostics().references, 8);
  } finally {
    owner.reset(); await until(() => !owner.diagnostics().references && !owner.diagnostics().cleaning);
    await rm(directory, { recursive: true, force: true });
  }
});
test('MF15 custom multipart supports one private toPersonId/file target with exact Markdown and no room/root/email', () => {
  const bytes = Buffer.from([0, 255, 65]), text = '**résumé 😀**\n';
  const body = multipart({ name: 'local.bin', bytes: bytes.length }, { toPersonId: 'peer', text, ...rich } as any);
  const wire = Buffer.concat([body.prefix, bytes, body.suffix]);
  assert.match(body.prefix.toString(), /name="toPersonId"\r\n\r\npeer\r\n/);
  assert.match(body.prefix.toString(), /name="markdown"\r\n\r\n\*\*résumé 😀\*\*\n\r\n/);
  assert.doesNotMatch(body.prefix.toString(), /name="roomId"|name="parentId"|name="toPersonEmail"|name="text"/);
  assert.equal(body.prefix.toString().match(/name="files"/g)?.length, 1);
  assert.equal(body.length, wire.length);
  assert.throws(() => multipart({ name: 'x', bytes: 0 }, { roomId: 'room', toPersonId: 'peer', text: 'Ambiguous' } as any));
  assert.throws(() => multipart({ name: 'x', bytes: 0 }, { toPersonId: 'peer', parentId: 'root', text: 'No threads' } as any));
});
test('MF15 actual demo engine composes recipient and upload owners without placeholders, adoption or a second delivery', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Demo may not call a service'));
  t.mock.method(net.Socket.prototype, 'connect', function () { assert.fail('Demo sockets forbidden'); });
  const directory = await mkdtemp('/tmp/opencode/wbx-direct-engine-red-'), path = join(directory, 'local.bin');
  const uploads = new Uploads({ temporaryRoot: directory });
  const engine = new EditorEngine(undefined, undefined, undefined, undefined, undefined, undefined, { uploads });
  try {
    await writeFile(path, 'Synthetic first-send bytes');
    await engine.start('demo'); await engine.select('demo-general');
    const before = engine.snapshot(), target = await engine.prepareDirect('mf15-peer');
    const binding = { targetId: target.targetId, draftId: 'recipient-draft' };
    const staged = await engine.stageUpload(path, binding as any);
    assert.deepEqual(engine.snapshot().rooms, before.rooms, 'preparation/staging sends no placeholder');
    const send = () => engine.sendDirect('one', target.targetId, binding.draftId, '**First file DM**',
      { ...rich, attachmentId: staged.attachmentId });
    const outcome = await send();
    assert.equal(outcome.status, 'changed'); assert.equal(outcome.format, 'markdown');
    assert.equal(outcome.attachmentId, staged.attachmentId);
    assert.equal(engine.snapshot().room!.id, 'demo-general');
    assert.deepEqual(engine.snapshot().messages, before.messages, 'recipient ACK cannot adopt selected normal history/draft');
    const rooms = engine.snapshot().rooms;
    await send(); assert.deepEqual(engine.snapshot().rooms, rooms, 'duplicate exact send is not a second creation/submission');
    await engine.select(outcome.roomId!);
    assert.equal(engine.snapshot().messages[0]!.markdown, '**First file DM**');
  } finally {
    engine.stop(); await until(() => !uploads.diagnostics().references && !uploads.diagnostics().cleaning);
    await rm(directory, { recursive: true, force: true });
  }
});
