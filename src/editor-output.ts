import { MAX_EDITOR_EVENT, record } from './editor-protocol.js';
import { BoundedOutput } from './bounded-output.js';
import { editorStateLane } from './state-output.js';

interface Parts { prefix: string; suffix: string }
interface Snapshot { state: Record<string, unknown>; parents: { value: Record<string, unknown>; key: string }[] }
function snapshot(value: unknown): Snapshot | undefined {
  if (!record(value)) return;
  if (record(value.params) && Array.isArray(value.params.messages)) return { state: value.params, parents: [{ value, key: 'params' }] };
  if (!record(value.result)) return;
  if (Array.isArray(value.result.messages)) return { state: value.result, parents: [{ value, key: 'result' }] };
  if (record(value.result.state) && Array.isArray(value.result.state.messages)) return {
    state: value.result.state, parents: [{ value: value.result, key: 'state' }, { value, key: 'result' }],
  };
}
/** Append a known child field last, without serializing that child's contents. */
function wrap(value: Record<string, unknown>, key: string, child: Parts): Parts {
  const fields = { ...value }; delete fields[key];
  const base = JSON.stringify(fields);
  return { prefix: base.slice(0, -1) + (base === '{}' ? '' : ',') + JSON.stringify(key) + ':' + child.prefix, suffix: child.suffix + '}' };
}
function envelope(value: Snapshot, truncated: boolean): Parts {
  const fields = { ...value.state }; delete fields.messages;
  if (truncated) {
    fields.truncated = true;
    // Omitted text cannot carry an exact-target cached reaction projection.
    delete fields.cachedReactions;
  }
  let parts = wrap(fields, 'messages', { prefix: '[', suffix: ']' });
  for (const parent of value.parents) parts = wrap(parent.value, parent.key, parts);
  return parts;
}

/**
 * Serialize a bounded JSON line. Histories are encoded newest-first once per
 * retained message, then emitted as an ordered suffix. No live snapshot or RPC
 * replay object is cloned/mutated; hello's nested state follows the same budget.
 */
export function serializeEditorOutput(value: object, maxBytes = MAX_EDITOR_EVENT): string | undefined {
  const view = snapshot(value);
  if (!view) {
    const line = JSON.stringify(value);
    return Buffer.byteLength(line) <= maxBytes ? line : undefined;
  }
  let parts = envelope(view, false);
  let fixed = Buffer.byteLength(parts.prefix) + Buffer.byteLength(parts.suffix);
  if (fixed > maxBytes) return;
  const messages = view.state.messages as unknown[], selected: { text: string; bytes: number }[] = [];
  let bytes = 0, index = messages.length - 1;
  for (; index >= 0; index--) {
    const text = JSON.stringify(messages[index]) ?? 'null', size = Buffer.byteLength(text);
    if (fixed + bytes + size + selected.length > maxBytes) break;
    selected.push({ text, bytes: size }); bytes += size;
  }
  if (index >= 0) {
    parts = envelope(view, true); fixed = Buffer.byteLength(parts.prefix) + Buffer.byteLength(parts.suffix);
    while (selected.length && fixed + bytes + selected.length - 1 > maxBytes) bytes -= selected.pop()!.bytes;
    if (fixed + bytes + Math.max(0, selected.length - 1) > maxBytes) return;
  }
  return parts.prefix + selected.reverse().map(message => message.text).join(',') + parts.suffix;
}

export interface EditorOutputSink {
  readonly writableLength: number;
  write(line: string, completed: (error?: Error | null) => void): unknown;
  once(event: 'drain', listener: () => void): unknown;
  off(event: 'drain', listener: () => void): unknown;
}
export interface EditorRecordOptions { maxBytes?: number; completed?: (error?: Error) => void }
export type EditorWrite = ((value: object) => void) & { record?: (value: object, options: EditorRecordOptions) => void };
/** One active write plus a latest presentation snapshot between ordered barriers.
 * Keep the existing byte ceiling and fail closed on bounded mandatory overflow. */
export function editorOutput(sink: EditorOutputSink, failed: () => void, maxBytes = MAX_EDITOR_EVENT) {
  let closed = false;
  let cancelActive: (() => void) | undefined;
  const acknowledgements = new Set<(error?: Error) => void>();
  const close = () => {
    closed = true; cancelActive?.(); cancelActive = undefined; output.close();
    const pending = [...acknowledgements]; acknowledgements.clear();
    for (const acknowledge of pending) acknowledge(new Error('Editor output closed.'));
  };
  const fail = () => { if (!closed) { close(); failed(); } };
  const output = new BoundedOutput<{ line: string; acknowledge?: (error?: Error) => void }>((value, completed) => {
    let writing = true, complete = false, drained = false, needsDrain = false, released = false;
    const finish = () => {
      if (closed || released || writing || !complete || needsDrain && !drained) return;
      released = true;
      sink.off('drain', drain); cancelActive = undefined;
      if (value.acknowledge && acknowledgements.delete(value.acknowledge)) value.acknowledge();
      completed();
    };
    const drain = () => { drained = true; finish(); };
    cancelActive = () => { sink.off('drain', drain); };
    sink.once('drain', drain);
    try {
      needsDrain = sink.write(value.line, error => {
        if (closed || released) return;
        if (error) { fail(); return; } complete = true; finish();
      }) === false;
    } catch { fail(); }
    writing = false; finish();
  }, fail, (maxBytes + 1) * 2);
  const writeRecord = (value: object, options: EditorRecordOptions = {}) => {
    if (closed) { options.completed?.(new Error('Editor output closed.')); return; }
    if (options.completed) acknowledgements.add(options.completed);
    if (sink.writableLength > maxBytes * 2) { fail(); return; }
    try {
      const line = serializeEditorOutput(value, Math.min(maxBytes, options.maxBytes ?? maxBytes));
      if (line === undefined) { fail(); return; }
      const lane = record(value) && value.jsonrpc === '2.0' && value.method === 'state'
        && Object.keys(value).every(key => ['jsonrpc', 'method', 'params'].includes(key)) ? editorStateLane(value.params) : undefined;
      output.offer({ line: line + '\n', acknowledge: options.completed }, Buffer.byteLength(line) + 1, options.completed ? undefined : lane);
    } catch { fail(); }
  };
  const write = (value: object) => writeRecord(value);
  return Object.assign(write, { record: writeRecord, close, flush: () => output.flush(), diagnostics: () => output.diagnostics() });
}
