// Private, short-lived export of an already normalized preview. No network or shell.
import { mkdtempSync, chmodSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let directory, path, input = '', ready = false;
const cleanup = () => {
  if (path) { try { unlinkSync(path); } catch {} path = undefined; }
  if (directory) { try { rmdirSync(directory); } catch {} directory = undefined; }
};
const exit = code => { cleanup(); process.exit(code); };
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => exit(0));
process.stdin.on('end', () => exit(0));
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
    const png = JSON.parse(input);
    if (typeof png !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(png)) throw new Error();
    const bytes = Buffer.from(png, 'base64');
    if (bytes.toString('base64') !== png || bytes.length > 6_000_000 || bytes.length < 45
      || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(16) > 1600
      || bytes.readUInt32BE(20) < 1 || bytes.readUInt32BE(20) > 1200) throw new Error();
    directory = mkdtempSync(join(tmpdir(), 'wbx-image-'));
    chmodSync(directory, 0o700);
    path = join(directory, 'preview.png');
    writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
    ready = true; input = '';
    clearTimeout(timer);
    timer = setTimeout(() => exit(0), 30 * 60_000);
    process.stdout.write(JSON.stringify({ path }) + '\n');
  } catch { exit(1); }
});
