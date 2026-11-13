import { randomBytes } from 'node:crypto';
import { open, statfs, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAX_FRAME_BYTES } from './protocol.js';

const exec = promisify(execFile);
const root = '/dev/shm';
export interface SharedFrame { name: string; release(): Promise<void> }
/** Linux POSIX SHM backed by tmpfs only. Never writes pixels to a disk filesystem. */
export class SharedFrames {
  private active?: string;
  private allocating = false;
  private available?: Promise<boolean>;
  static async supported(): Promise<boolean> {
    if (process.platform !== 'linux') return false;
    try { return (await statfs(root)).type === 0x01021994; } catch { return false; }
  }
  async create(bytes: Uint8Array): Promise<SharedFrame> {
    if (this.active || this.allocating) throw new Error('A shared frame is already in flight.');
    if (!bytes.byteLength || bytes.byteLength > MAX_FRAME_BYTES - 32) throw new Error('Invalid shared frame size.');
    this.allocating = true;
    const name = `/wbx-pixel-${randomBytes(16).toString('hex')}`;
    const path = root + name;
    try {
      if (!await (this.available ??= SharedFrames.supported())) throw new Error('RAM-backed shared memory is unavailable.');
      // Exclusive creation prevents following a pre-existing symlink. Restrict
      // access to this user; Kitty must demonstrably share the same SHM namespace.
      const file = await open(path, 'wx', 0o600);
      this.active = path;
      try { await file.writeFile(bytes); } finally { await file.close(); }
      return { name, release: async () => {
        if (this.active !== path) return;
        await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
        this.active = undefined;
      } };
    } catch (error) {
      if (this.active === path) { await unlink(path).catch(() => {}); this.active = undefined; }
      throw error;
    } finally { this.allocating = false; }
  }
  async close(): Promise<void> {
    const path = this.active;
    if (path) {
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      this.active = undefined;
    }
  }
}

/** Kitty unlinks POSIX SHM after reading: broadcasting one name to two clients
 * would race. Unknown/multiple-reader tmux layouts conservatively use inline. */
export async function singleGraphicsReader(env = process.env): Promise<boolean> {
  if (!env.TMUX) return true;
  if (!/^%\d+$/.test(env.TMUX_PANE ?? '')) return false;
  try {
    const options = { env, timeout: 1000, maxBuffer: 16_384 };
    const window = (await exec('tmux', ['display-message', '-p', '-t', env.TMUX_PANE!, '#{window_id}'], options)).stdout.trim();
    const clients = (await exec('tmux', ['list-clients', '-F', '#{client_control_mode} #{window_id}'], options)).stdout;
    return /^@\d+$/.test(window) && clients.trim().split('\n').filter(line => line.trim() === `0 ${window}`).length === 1;
  } catch { return false; }
}
