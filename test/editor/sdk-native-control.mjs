// Private synthetic I/O only. No provider credentials, text, paths or raw errors in traces.
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export const controlFile = join(homedir(), 'c4-control.json');
export const traceFile = join(homedir(), 'c4-trace.jsonl');
export function phase() { return JSON.parse(readFileSync(controlFile, 'utf8')).phase; }
export function trace(kind, fields = {}) {
  appendFileSync(traceFile, JSON.stringify({ kind, pid: process.pid, ppid: process.ppid, ...fields }) + '\n', { mode: 0o600 });
}
export function forbidden(boundary) {
  trace('forbidden', { boundary });
  throw new Error('Forbidden synthetic C4 boundary');
}
export function forbidNetwork() {
  net.Socket.prototype.connect = () => forbidden('socket');
  tls.connect = () => forbidden('tls');
  http.request = https.request = () => forbidden('http');
  // Node's real fork uses its internal spawn; provider/browser subprocesses use
  // the exported entry points. Do not replace fork or any worker lifecycle.
  childProcess.spawn = childProcess.exec = childProcess.execFile = () => forbidden('subprocess');
  syncBuiltinESMExports();
}
