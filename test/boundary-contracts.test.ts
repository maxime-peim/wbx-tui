import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_EDITOR_EVENT, MAX_EDITOR_REQUEST, parseEditorRequest } from '../src/editor-protocol.js';
import { ATTACHMENT_LIMITS } from '../src/message-attachments.js';
import { IMAGE_LIMITS, OPEN_IMAGE_LIMITS } from '../src/message-images.js';
import { ATTACHMENT_POLICY_LIMITS } from '../src/attachment-policy.js';
import { ATTACHMENT_TRANSFER, AttachmentTransfer } from '../src/attachment-transfer.js';
test('independent TS limits and bounded transfer agree with versioned cross-language fixtures', async () => {
  const fixture = JSON.parse(await readFile('test/contract-boundaries.json', 'utf8')), l = fixture.limits;
  assert.equal(fixture.version, 1);
  assert.equal(MAX_EDITOR_REQUEST, l.requestBytes); assert.equal(MAX_EDITOR_EVENT, l.eventBytes);
  assert.equal(ATTACHMENT_LIMITS.bytes, l.originalBytes); assert.equal(ATTACHMENT_LIMITS.textBytes, l.textBytes);
  assert.equal(ATTACHMENT_LIMITS.textLines, l.textLines); assert.equal(IMAGE_LIMITS.bytes, l.rasterBytes);
  assert.equal(OPEN_IMAGE_LIMITS.bytes, l.pngBytes); assert.equal(ATTACHMENT_TRANSFER.chunkBytes, l.chunkBytes);
  assert.equal(ATTACHMENT_TRANSFER.recordBytes, l.chunkRecordBytes); assert.equal(ATTACHMENT_TRANSFER.controlBytes, l.controlBytes);
  assert.equal(ATTACHMENT_POLICY_LIMITS.entries, l.selectorEntries); assert.equal(ATTACHMENT_POLICY_LIMITS.bytes, l.selectorBytes);
  for (const row of fixture.utf8) {
    assert.equal(Buffer.byteLength(row.text), row.bytes);
    assert.equal([...row.text].length, row.codePoints);
    const prefix = '{"jsonrpc":"2.0","id":1,"method":"state.get","params":{"padding":"', suffix = '"}}';
    for (const delta of [-1, 0, 1]) {
      const remaining = l.requestBytes + delta - Buffer.byteLength(prefix + suffix);
      const payload = row.text.repeat(Math.floor(remaining / row.bytes)) + 'a'.repeat(remaining % row.bytes);
      const wire = prefix + payload + suffix;
      assert.equal(Buffer.byteLength(wire), l.requestBytes + delta);
      if (delta <= 0) assert.equal(parseEditorRequest(wire).id, 1);
      else assert.throws(() => parseEditorRequest(wire), /Oversized/);
    }
  }
  for (const row of fixture.encoded) {
    assert.equal(4 * Math.ceil(row.bytes / 3), row.base64Bytes);
    assert.equal(Math.ceil(row.bytes / ATTACHMENT_TRANSFER.chunkBytes), row.chunks);
  }
  for (const row of fixture.canonical) {
    const create = AttachmentTransfer.create(1, { meta: { id: 'a'.repeat(64), name: 'data', mime: 'application/octet-stream', sourceBytes: row.bytes },
      body: { kind: 'original', decodedBytes: row.bytes, text: false, payload: { mode: 'inline', encoding: 'base64', data: row.data } } }, () => true, () => {});
    if (row.valid) (await create).close(); else await assert.rejects(create);
  }
});
test('native catalogue drives Lua forwarding and current documentation; wire admission is separate', async () => {
  const [catalogue, lua, docs, protocol] = await Promise.all([
    readFile('autoload/wbx/options.vim', 'utf8'), readFile('lua/wbx-tui/init.lua', 'utf8'),
    readFile('docs/native-options.md', 'utf8'), readFile('src/editor-protocol.ts', 'utf8')]);
  const keys = [...catalogue.matchAll(/\['([a-z_]+)',/g)].map(match => match[1]!);
  const documented = [...docs.matchAll(/^\| `([a-z_]+)` \|/gm)].map(match => match[1]!);
  assert.equal(keys.length, 29); assert.deepEqual(new Set(keys), new Set(documented));
  assert.ok(keys.includes('persist_drafts'));
  assert.match(catalogue, /\['reactions', 1, 1, 'consent', 1\]/, 'native reactions default on; explicit opt-outs remain supported');
  assert.match(catalogue, /\['completion_policy', 'manual', 0, 'editing', 1\]/, 'manual completion is shared across native/Lua clients, not a provider activation flag');
  assert.match(catalogue, /\['reaction_display', 'icons', 0, 'display', 1\]/, 'ASCII fallback is shared optional presentation, with icons as the default');
  assert.match(lua, /wbx#options#forward_keys/);
  assert.doesNotMatch(protocol, /options#|attachment_handlers|attachment_download_dir|reaction_display/);
});
