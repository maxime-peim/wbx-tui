// Deliberately untrusted output / delivery-failure fixture. Never calls Webex.
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
let revision = 0;
let pendingSend;
const room = { id: 'fixture-room', title: 'Unicode 世界 👩🏽‍💻 | let g:wbx_injected = 1', type: 'group' };
let state = { revision: 0, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false };
let output = Promise.resolve();
function write(value) {
  output = output.then(async () => {
    const bytes = Buffer.from(JSON.stringify(value) + '\n');
    // Force arbitrary byte boundaries, including UTF-8 continuation bytes.
    for (let i = 0; i < bytes.length; i += 7) {
      process.stdout.write(bytes.subarray(i, i + 7));
      await new Promise(resolve => setImmediate(resolve));
    }
  });
}
function publish() { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: structuredClone(state) }); }
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line), p = request.params ?? {};
  const result = value => write({ jsonrpc: '2.0', id: request.id, result: value });
  if (process.argv[2] === 'malformed') {
    process.stdout.write('let g:wbx_injected = 1\n');
    return;
  }
  switch (request.method) {
    case 'hello': result(process.argv[2] === 'bad-hello' ? { version: 1, state: [], meeting: null }
      : { version: 1, capabilities: ['delivery-resolution-v1'], state, meeting: { active: false, ready: false } }); break;
    case 'session.start': state = { ...state, state: 'ready', rooms: [room] }; publish(); result(null); break;
    case 'rooms.select': {
      const selected = () => { state = { ...state, room, ready: true }; publish(); result(null); };
      if (process.argv[2] === 'slow-select') setTimeout(selected, 100);
      else selected();
      break;
    }
    case 'session.stop':
      state = { ...state, state: 'idle', ready: false }; publish();
      if (pendingSend) {
        write({ jsonrpc: '2.0', id: pendingSend.id, error: { code: -32004, message: 'Synthetic session stopped during delivery.' } });
        pendingSend = undefined;
      }
      result(null); break;
    case 'delivery.resolve': result(null); break;
    case 'delivery.resolveBound': result({ roomId: p.roomId }); break;
    case 'rooms.read': appendFileSync(process.env.WBX_EDITOR_AUDIT, `read:${p.roomId}:${p.messageId}\n`); result(null); break;
    case 'messages.send': {
      appendFileSync(process.env.WBX_EDITOR_AUDIT, 'send\n');
      if (process.argv[2]?.startsWith('bad-ack-')) {
        const delivery = { requestId: p.requestId, roomId: p.roomId, status: 'sent', message: 'Synthetic untrusted ACK' };
        if (process.argv[2] === 'bad-ack-missing') delete delivery.status;
        else if (process.argv[2] === 'bad-ack-type') delivery.status = ['sent'];
        else if (process.argv[2] === 'bad-ack-room') delivery.roomId = 'wrong-room';
        else delivery.status = 'invalid';
        write({ jsonrpc: '2.0', method: 'delivery', params: delivery });
        // These otherwise valid late bytes must not clear or unblock the draft
        // after invalid output has closed admission, even in one callback.
        write({ jsonrpc: '2.0', method: 'delivery', params: { ...delivery, status: 'sent', roomId: p.roomId } });
        result(null); break;
      }
      if (p.text === 'crash') { process.exit(2); }
      if (p.text === 'disconnect') { pendingSend = request; break; }
      const status = p.text === 'unknown' ? 'unknown' : 'sent';
      if (status === 'sent') { state.messages.push({ id: String(revision), text: p.text, author: 'Fixture', created: '2026-01-01T00:00:00Z' }); publish(); }
      write({ jsonrpc: '2.0', method: 'delivery', params: { requestId: p.requestId, roomId: p.roomId, status, message: 'Synthetic delivery ' + status } });
      result(null); break;
    }
    case 'shutdown': result(null); output.then(() => { process.exit(0); }); break;
    default: result(null);
  }
});
