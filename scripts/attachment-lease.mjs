// Local, explicit materialization only. No network, shell, opener or credentials.
import { mkdtempSync, chmodSync, openSync, writeFileSync, closeSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';

let directory, path, fd, owned = false, input = '', ready = false;
const cleanup = () => {
  if (fd !== undefined) { try { closeSync(fd); } catch {} fd = undefined; }
  if (owned && path) { try { unlinkSync(path); } catch {} owned = false; }
  if (directory) { try { rmdirSync(directory); } catch {} directory = undefined; }
};
const exit = code => { cleanup(); process.exit(code); };
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => exit(0));
process.stdin.on('end', () => exit(ready ? 0 : 1));
process.stdin.on('error', () => exit(1));
process.stdout.on('error', () => exit(1));
let timer = setTimeout(() => exit(1), 10_000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', part => {
  if (ready) return exit(1);
  input += part;
  if (input.length > 8_010_000) return exit(1);
  if (!input.endsWith('\n')) return;
  try {
    const value = JSON.parse(input);
    if (!value || !['lease', 'save'].includes(value.mode) || typeof value.name !== 'string' || value.name.length > 120
      || !/^[A-Za-z0-9_][A-Za-z0-9._ -]*$/.test(value.name) || typeof value.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new Error();
    const bytes = Buffer.from(value.data, 'base64');
    if (bytes.toString('base64') !== value.data || bytes.length > 6_000_000) throw new Error();
    let text = false;
    if (bytes.length <= 1_048_576) {
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        text = !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(decoded) && decoded.split('\n').length <= 20_000;
      } catch { /* Binary data can only be saved or sent to a configured tool. */ }
    }
    if (value.mode === 'save') {
      if (typeof value.path !== 'string' || !isAbsolute(value.path) || value.path.length > 4096 || /[\x00-\x1f\x7f]/.test(value.path)) throw new Error();
      path = value.path;
    } else {
      directory = mkdtempSync(join(tmpdir(), 'wbx-attachment-')); chmodSync(directory, 0o700);
      path = join(directory, value.name);
    }
    // Exclusive creation rejects existing files, symlinks and devices. Never chmod
    // or remove an existing destination, even when a write/open fails.
    fd = openSync(path, 'wx', 0o600); owned = true;
    writeFileSync(fd, bytes); closeSync(fd); fd = undefined;
    ready = true; input = ''; clearTimeout(timer);
    if (value.mode === 'save') {
      owned = false; process.stdout.write(JSON.stringify({ path, text }) + '\n', () => exit(0));
    } else {
      timer = setTimeout(() => exit(0), 30 * 60_000);
      process.stdout.write(JSON.stringify({ path, text }) + '\n');
    }
  } catch { exit(1); }
});
