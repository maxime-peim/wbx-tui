/** Client-local presentation only: never Webex membership, Teams or read authority. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { SECTION_LIMITS, validSectionEdit, validSections, sectionLabelKey as labelKey,
  type LocalSection, type SectionsSnapshot, type SectionEdit } from './local-context-contracts.js';
export { SECTION_LIMITS, validSectionEdit, validSections, sectionId, sectionName,
  type LocalSection, type SectionsSnapshot, type SectionEdit } from './local-context-contracts.js';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
const invalid = () => new Error('Local section preferences unavailable. Current grouping was preserved.');
export class LocalSections {
  private items: LocalSection[] = [];
  private revision = 0;
  private persistence: SectionsSnapshot['persistence'] = 'session';
  snapshot(): SectionsSnapshot { return { revision: this.revision, persistence: this.persistence, items: structuredClone(this.items) }; }
  reset(): void { this.items = []; this.revision = 0; this.persistence = 'session'; }
  clear(revision: number): void {
    if (revision !== this.revision) throw invalid();
    this.items = []; this.revision++; this.persistence = 'session';
  }
  replace(items: LocalSection[], revision: number): void {
    if (revision !== this.revision || !validSections(items)) throw invalid();
    this.items = structuredClone(items); this.revision++; this.persistence = 'saved';
  }
  saved(revision: number): void { if (revision === this.revision) this.persistence = 'saved'; }
  unavailable(): void { this.persistence = 'unavailable'; }
  edit(edit: SectionEdit, revision: number, rooms: readonly string[]): SectionsSnapshot {
    if (revision !== this.revision || !validSectionEdit(edit)) throw new Error('Local section changed. Retry the explicit action.');
    const items = structuredClone(this.items), index = 'id' in edit ? items.findIndex(item => item.id === edit.id) : -1;
    if (edit.action !== 'create' && !(edit.action === 'assign' && edit.id === '') && index < 0) throw invalid();
    if ('name' in edit && items.some(item => item.id !== ('id' in edit ? edit.id : '') && labelKey(item.name) === labelKey(edit.name))) throw new Error('A local section already has that name.');
    if (edit.action === 'create') items.push({ id: randomBytes(12).toString('hex'), name: edit.name, collapsed: false, rooms: [] });
    else if (edit.action === 'rename') items[index]!.name = edit.name;
    else if (edit.action === 'remove') items.splice(index, 1);
    else if (edit.action === 'toggle') items[index]!.collapsed = !items[index]!.collapsed;
    else if (edit.action === 'move') items.splice(Math.min(edit.position, items.length - 1), 0, items.splice(index, 1)[0]!);
    else if (edit.action === 'assign') {
      if (!rooms.includes(edit.roomId)) throw new Error('Choose a currently listed space; grouping does not establish membership.');
      for (const item of items) item.rooms = item.rooms.filter(id => id !== edit.roomId);
      if (edit.id) items[index]!.rooms.push(edit.roomId);
    }
    if (!validSections(items)) throw new Error('Local section budget exceeded (32 sections / 500 assigned spaces).');
    this.items = items; this.revision++; this.persistence = 'session'; return this.snapshot();
  }
}

/** Explicit bounded disk operations. Caller retains one physical admission across reset. */
export class SectionPreferences {
  readonly directory: string;
  private base: string;
  constructor(base = process.env.XDG_STATE_HOME && isAbsolute(process.env.XDG_STATE_HOME) ? process.env.XDG_STATE_HOME : join(homedir(), '.local/state')) {
    this.base = resolve(base); this.directory = join(this.base, 'wbx-tui-sections');
  }
  path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw invalid();
    return join(this.directory, `${parseInt(key.slice(0, 2), 16) % SECTION_LIMITS.slots}.json`);
  }
  private async directories(create: boolean): Promise<void> {
    if (create) await mkdir(this.base, { recursive: true, mode: 0o700 });
    const base = await lstat(this.base);
    if (!base.isDirectory() || base.uid !== process.getuid?.() || base.mode & 0o022) throw invalid();
    if (create) await mkdir(this.directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const dir = await lstat(this.directory);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || dir.mode & 0o077) throw invalid();
  }
  private async document(path: string): Promise<unknown> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077 || info.nlink !== 1 || info.size > SECTION_LIMITS.bytes) throw invalid();
      const buffer = Buffer.alloc(SECTION_LIMITS.bytes + 1); let size = 0;
      while (size < buffer.length) { const read = await file.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
      if (size > SECTION_LIMITS.bytes) throw invalid();
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)));
    } finally { await file.close(); }
  }
  private async locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const path = this.path(key) + '.lock';
    const lock = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let owned: { dev: number; ino: number } | undefined;
    try { owned = await lock.stat(); return await work(); }
    finally {
      try {
        const current = await lstat(path);
        if (owned && current.dev === owned.dev && current.ino === owned.ino) await unlink(path);
      } finally { await lock.close(); }
    }
  }
  async load(key: string): Promise<LocalSection[] | undefined> {
    try {
      await this.directories(false); const doc = await this.document(this.path(key));
      if (!object(doc) || !keys(doc, ['version', 'profile', 'items']) || doc.version !== 1 || typeof doc.profile !== 'string'
        || !/^[a-f0-9]{64}$/.test(doc.profile)) throw invalid();
      if (doc.profile !== key) return;
      if (!validSections(doc.items)) throw invalid();
      return doc.items;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw invalid(); }
  }
  async save(key: string, items: LocalSection[], valid = () => true): Promise<void> {
    if (!validSections(items) || !valid()) throw invalid();
    const document = JSON.stringify({ version: 1, profile: key, items }) + '\n';
    if (Buffer.byteLength(document) > SECTION_LIMITS.bytes) throw invalid();
    await this.directories(true);
    return this.locked(key, async () => {
      let count = 0; for await (const _ of await opendir(this.directory)) if (++count >= SECTION_LIMITS.entries) throw invalid();
      const path = this.path(key);
      try {
        const previous = await this.document(path);
        // Preferences are user work, not disposable cache hints. A collision,
        // unknown version or corrupt document must never be silently overwritten.
        if (!object(previous) || previous.profile !== key || previous.version !== 1
          || !keys(previous, ['version', 'profile', 'items']) || !validSections(previous.items)) throw invalid();
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const temporary = join(this.directory, `.sections-${randomBytes(12).toString('hex')}.tmp`);
      try {
        const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { await file.writeFile(document); await file.sync(); } finally { await file.close(); }
        await this.directories(false); if (!valid()) throw invalid();
        await rename(temporary, path);
      } finally { await unlink(temporary).catch(() => {}); }
    });
  }
  async clear(key: string, valid = () => true): Promise<void> {
    try {
      await this.directories(false);
      await this.locked(key, async () => {
        const doc = await this.document(this.path(key));
        if (object(doc) && doc.profile === key && valid()) await unlink(this.path(key));
      });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw invalid(); }
  }
}
