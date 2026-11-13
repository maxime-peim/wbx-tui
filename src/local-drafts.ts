/** Account-bound local text only. Restoring a draft never restores send authority. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, rename, unlink } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { DRAFT_LIMITS, validLocalDrafts, type LocalDraft, type DraftDocument } from './local-context-contracts.js';
export { DRAFT_LIMITS, validLocalDrafts, type LocalDraft, type DraftDocument } from './local-context-contracts.js';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const invalid = () => new Error('Private draft storage unavailable or changed. Native text was retained; no draft was overwritten.');
export class LocalDrafts {
  readonly directory: string;
  private base: string;
  constructor(base = process.env.XDG_STATE_HOME && isAbsolute(process.env.XDG_STATE_HOME) ? process.env.XDG_STATE_HOME : join(homedir(), '.local/state')) {
    this.base = resolve(base); this.directory = join(this.base, 'wbx-tui-drafts');
  }
  private path(profile: string): string {
    if (!/^[a-f0-9]{64}$/.test(profile)) throw invalid();
    return join(this.directory, `${profile}.json`);
  }
  private async directories(create: boolean): Promise<void> {
    if (create) await mkdir(this.base, { recursive: true, mode: 0o700 });
    const base = await lstat(this.base);
    if (!base.isDirectory() || base.uid !== process.getuid?.() || base.mode & 0o022) throw invalid();
    if (create) await mkdir(this.directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const dir = await lstat(this.directory);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || dir.mode & 0o077) throw invalid();
  }
  private async document(profile: string): Promise<DraftDocument> {
    try {
      const file = await open(this.path(profile), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077 || info.nlink !== 1 || info.size > DRAFT_LIMITS.bytes) throw invalid();
        const bytes = Buffer.alloc(DRAFT_LIMITS.bytes + 1); let size = 0;
        while (size < bytes.length) { const part = await file.read(bytes, size, bytes.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
        if (size > DRAFT_LIMITS.bytes) throw invalid();
        const doc: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
        if (!object(doc) || !exact(doc, ['version', 'profile', 'items']) || doc.version !== 1 || doc.profile !== profile || !validLocalDrafts(doc.items)) throw invalid();
        return { revision: hash(doc.items), items: doc.items };
      } finally { await file.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: hash([]), items: [] }; throw error; }
  }
  async load(profile: string): Promise<DraftDocument> {
    this.path(profile);
    try { await this.directories(false); return await this.document(profile); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: hash([]), items: [] }; throw invalid(); }
  }
  async save(profile: string, revision: string, items: LocalDraft[], valid = () => true): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(revision) || !validLocalDrafts(items) || !valid()) throw invalid();
    await this.directories(true);
    const path = this.path(profile), lockpath = path + '.lock';
    const lock = await open(lockpath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let owned: { dev: number; ino: number } | undefined;
    let temporary: string | undefined;
    try {
      owned = await lock.stat();
      let entries = 0; for await (const _ of await opendir(this.directory)) if (++entries > DRAFT_LIMITS.files) throw invalid();
      const previous = await this.document(profile);
      if (previous.revision !== revision || !valid()) throw invalid();
      temporary = join(this.directory, `.draft-${randomBytes(12).toString('hex')}.tmp`);
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify({ version: 1, profile, items }) + '\n'); await file.sync(); }
      finally { await file.close(); }
      await this.directories(false); if (!valid()) throw invalid();
      await rename(temporary, path);
      return hash(items);
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      try { const current = await lstat(lockpath); if (owned && current.dev === owned.dev && current.ino === owned.ino) await unlink(lockpath); }
      finally { await lock.close(); }
    }
  }
}
