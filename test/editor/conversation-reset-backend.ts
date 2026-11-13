/** Real demo engine/RPC over stdio; only the first PUT per target is synthetically ambiguous. */
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import net from 'node:net';
import { EditorEngine } from '../../src/editor-engine.js';
import { EditorRPC } from '../../src/editor-worker.js';
import { EditorMeetings } from '../../src/editor-meetings.js';
import { PublicProblem } from '../../src/public-rest.js';

globalThis.fetch = async () => { throw new Error('Network forbidden in C2 fixture'); };
net.Socket.prototype.connect = function () { throw new Error('Sockets forbidden in C2 fixture'); };
const journal = (value: unknown) => appendFileSync(process.env.WBX_EDITOR_AUDIT!, JSON.stringify(value) + '\n');
const engine = new EditorEngine(async () => { throw new Error('Browser forbidden'); });
const rest = (engine as any).actionREST, original = rest.call.bind(rest), submitted = new Set<string>();
rest.call = async (path: string, method: string, ...args: any[]) => {
  journal({ kind: 'rest', path, method });
  if (method === 'PUT' && !submitted.has(path)) {
    submitted.add(path);
    throw new PublicProblem('unknown', undefined, 'possible-write');
  }
  return original(path, method, ...args);
};
const rpc = new EditorRPC(engine, new EditorMeetings(), value => {
  journal({ kind: 'output', value });
  process.stdout.write(JSON.stringify(value) + '\n');
});
const lines = createInterface({ input: process.stdin });
lines.on('line', line => { journal({ kind: 'request', value: JSON.parse(line) }); void rpc.receive(line); });
lines.on('close', () => { void rpc.close(); });
rpc.once('closed', () => { lines.close(); process.stdin.destroy(); });
