/** Fixed-slot private atomic documents. Codecs and authenticated identity belong to callers. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

interface CacheWrite {
  key: string; document: string; promise: Promise<void>; resolve(): void; reject(error: Error): void;
}
const invalid = () => new Error('Private local cache unavailable.');
export class PrivateCache {
  private closed = false;
  private activeWrite?: CacheWrite;
  private pendingWrite?: CacheWrite;
  private clearing?: { key: string; promise: Promise<void> };
  readonly directory: string;
  private readonly base: string;
  constructor(namespace: string, private bytes: number,
    base = process.env.XDG_CACHE_HOME && isAbsolute(process.env.XDG_CACHE_HOME) ? process.env.XDG_CACHE_HOME : join(homedir(), '.cache'),
    private versions: readonly number[] = [1, 2]) {
    this.base = resolve(base); this.directory = join(this.base, namespace);
  }
  private path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw invalid();
    return join(this.directory, `${parseInt(key.slice(0, 2), 16) % 8}.json`);
  }
  private check(): void { if (this.closed) throw invalid(); }
  private async directories(create = false, clearing = false): Promise<void> {
    if (!clearing) this.check();
    if (create) await mkdir(this.base, { recursive: true, mode: 0o700 });
    const base = await lstat(this.base);
    if (!base.isDirectory() || base.uid !== process.getuid?.() || base.mode & 0o022) throw invalid();
    if (create) await mkdir(this.directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const directory = await lstat(this.directory);
    if (!directory.isDirectory() || directory.uid !== process.getuid?.() || directory.mode & 0o077) throw invalid();
    if (!clearing) this.check();
  }
  private async document(path: string): Promise<unknown> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077 || info.nlink !== 1 || info.size > this.bytes) throw invalid();
      const buffer = Buffer.alloc(this.bytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(buffer, size, buffer.length - size, null);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > this.bytes) throw invalid();
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)));
    } finally { await file.close(); }
  }
  protected async readDocument(key: string): Promise<unknown> {
    try { await this.directories(); const value = await this.document(this.path(key)); this.check(); return value; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw invalid(); }
  }
  protected saveDocument(key: string, value: object): Promise<void> {
    this.check(); this.path(key);
    const document = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(document) > this.bytes) throw invalid();
    if (this.pendingWrite) {
      if (this.pendingWrite.key !== key) throw invalid();
      this.pendingWrite.document = document; return this.pendingWrite.promise;
    }
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    void promise.catch(() => {});
    const work: CacheWrite = { key, document, promise, resolve, reject };
    if (this.activeWrite) this.pendingWrite = work;
    else { this.activeWrite = work; void this.write(work); }
    return promise;
  }
  private async write(work: CacheWrite): Promise<void> {
    let failed = false;
    try { await this.commit(work); } catch { failed = true; }
    this.activeWrite = undefined;
    const next = this.pendingWrite; this.pendingWrite = undefined;
    if (next && !this.closed) { this.activeWrite = next; void this.write(next); }
    else next?.reject(invalid());
    if (failed) work.reject(invalid()); else work.resolve();
  }
  private async commit(work: CacheWrite): Promise<void> {
    await this.directories(true);
    let count = 0;
    for await (const _entry of await opendir(this.directory)) if (++count >= 64) throw invalid();
    const path = this.path(work.key);
    try { await this.document(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temporary = join(this.directory, `.cache-${randomBytes(12).toString('hex')}.tmp`);
    try {
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(work.document); await file.sync(); } finally { await file.close(); }
      await this.directories(); this.check();
      await rename(temporary, path);
      this.check();
    } finally { await unlink(temporary).catch(() => {}); }
  }
  /** Wait for an admitted commit before unlinking; it cannot resurrect cleared data. */
  clear(key: string): Promise<void> {
    if (this.clearing) return this.clearing.key === key ? this.clearing.promise : Promise.reject(invalid());
    const active = this.activeWrite?.promise;
    this.close();
    const promise = (async () => {
      await active?.catch(() => {});
      try {
        await this.directories(false, true);
        const path = this.path(key), value = await this.document(path);
        if (value && typeof value === 'object' && 'profile' in value && value.profile === key
          && 'version' in value && this.versions.includes(value.version as number)) await unlink(path);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw invalid(); }
    })();
    this.clearing = { key, promise }; return promise;
  }
  close(): void {
    this.closed = true;
    this.pendingWrite?.reject(invalid()); this.pendingWrite = undefined;
  }
  diagnostics() { return { active: this.activeWrite ? 1 : 0, pending: this.pendingWrite ? 1 : 0, closed: this.closed }; }
}
