/** Explicit local-file capability owner. Anonymous snapshots, no URLs/credentials/RPC bytes. */
import { constants, type BigIntStats } from 'node:fs';
import { open, lstat, realpath, mkdtemp, unlink, rmdir, type FileHandle } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { UPLOAD_LIMITS, uploadPath, validSnapshotBinding, snapshotBinding,
  type StagedUpload, type UploadProgress, type UploadSource, type SnapshotBinding } from './upload-contracts.js';
export * from './upload-contracts.js';
export class UploadFailure extends Error {
  constructor(readonly reason: 'failed' | 'unknown', message = reason === 'unknown'
    ? 'Delivery UNKNOWN. Check Webex before resolving/retrying; no upload was replayed.'
    : 'File operation refused or canceled before submission. Nothing was uploaded.', readonly status?: number) { super(message); }
}
const safeName = (v: string): boolean => !!v && Array.from(v).length <= 120 && Buffer.byteLength(v) <= 240
  && !/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff\ud800-\udfff]/u.test(v);
const sameBinding = (a: SnapshotBinding, b: SnapshotBinding) => validSnapshotBinding(b) && a.draftId === b.draftId
  && ('targetId' in a ? 'targetId' in b && a.targetId === b.targetId
    : 'roomId' in b && a.roomId === b.roomId && a.parentId === b.parentId);
const sameFile = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size
  && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
interface Entry extends StagedUpload { epoch: number; binding: SnapshotBinding; file?: FileHandle; revoked: boolean; retired?: boolean; closing?: Promise<void> }
interface Work { epoch: number; binding: SnapshotBinding; entry: Entry; abort: AbortController; submitted: boolean; lastProgress: number;
  retained: FileHandle[]; cleanupFailed: boolean }
export interface UploadOptions { temporaryRoot?: string; now?: () => number; stageMs?: number; sendMs?: number }
export class Uploads {
  onProgress = (_: UploadProgress) => {};
  private epoch = 0;
  private entries = new Map<string, Entry>();
  private staging?: Work;
  private sending?: Work;
  private directory?: string;
  private cleaning?: Promise<void>;
  private now: () => number;
  constructor(private options: UploadOptions = {}) { this.now = options.now ?? Date.now; }
  diagnostics() { return { references: this.entries.size, bytes: [...this.entries.values()].reduce((n, entry) => n + entry.bytes, 0),
    staging: !!this.staging, sending: !!this.sending, cleaning: !!this.cleaning }; }
  private work(entry: Entry): Work {
    return { epoch: this.epoch, binding: { ...entry.binding }, entry, abort: new AbortController(), submitted: false,
      lastProgress: -Infinity, retained: [], cleanupFailed: false };
  }
  private check(work: Work, valid: () => boolean): void {
    if (work.epoch !== this.epoch || work.abort.signal.aborted || work.entry.revoked || !valid()) throw new UploadFailure(work.submitted ? 'unknown' : 'failed');
  }
  private progress(work: Work, phase: UploadProgress['phase'], bytes: number, total: number): void {
    const now = this.now();
    if (work.epoch !== this.epoch || work.abort.signal.aborted || now - work.lastProgress < UPLOAD_LIMITS.progressMs) return;
    work.lastProgress = now;
    try { this.onProgress({ ...work.binding, attachmentId: work.entry.attachmentId, phase, bytes, total }); } catch { /* Progress is not delivery. */ }
  }
  private logical<T>(native: Promise<T>, work: Work, timeout: number): Promise<T> {
    const timer = setTimeout(() => work.abort.abort(), timeout); timer.unref?.();
    let cancel!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      cancel = () => reject(new UploadFailure(work.submitted ? 'unknown' : 'failed'));
      work.abort.signal.addEventListener('abort', cancel, { once: true });
      if (work.abort.signal.aborted) cancel();
    });
    return Promise.race([native, aborted]).finally(() => { clearTimeout(timer); work.abort.signal.removeEventListener('abort', cancel); });
  }
  async stage(path: string, binding: SnapshotBinding, valid = () => true): Promise<StagedUpload> {
    if (this.staging || this.entries.size >= UPLOAD_LIMITS.references || !validSnapshotBinding(binding)
      || !uploadPath(path) || !valid()) throw new UploadFailure('failed');
    const entry: Entry = { attachmentId: randomBytes(16).toString('hex'), name: basename(path), bytes: 0,
      binding: snapshotBinding(binding),
      epoch: this.epoch, revoked: false };
    if (!safeName(entry.name)) throw new UploadFailure('failed', 'File name exceeds the safe 120-character/240-byte display/transport budget.');
    const work = this.staging = this.work(entry); this.entries.set(entry.attachmentId, entry);
    const native = this.copy(resolve(path), work, valid).then(() => {
      this.check(work, valid);
      return { attachmentId: entry.attachmentId, name: entry.name, bytes: entry.bytes };
    }).catch(error => { entry.revoked = true; throw error instanceof UploadFailure ? error : new UploadFailure('failed'); }).finally(async () => {
      if (entry.revoked || work.abort.signal.aborted) { entry.revoked = true; await this.closeEntry(entry); }
      if (this.staging === work && !work.cleanupFailed) this.staging = undefined;
      this.cleanDirectory();
    });
    return this.logical(native, work, Math.min(this.options.stageMs ?? UPLOAD_LIMITS.stageMs, UPLOAD_LIMITS.stageMs));
  }
  private async copy(path: string, work: Work, valid: () => boolean): Promise<void> {
    let input: FileHandle | undefined, output: FileHandle | undefined, temporary: string | undefined;
    let created: BigIntStats | undefined;
    try {
      // One admitted stage may join its owner's empty-directory housekeeping,
      // not another stage/upload queue. Reserve staging before waiting so more
      // selections still fail busy; do not begin source I/O before settlement.
      await this.cleaning;
      this.check(work, valid);
      if (await realpath(path) !== path) throw new UploadFailure('failed', 'Symlink paths are not staged. Choose the actual regular file.');
      const before = await lstat(path, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(UPLOAD_LIMITS.fileBytes)) throw new UploadFailure('failed');
      input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      work.retained.push(input);
      if (!sameFile(before, await input.stat({ bigint: true }))) throw new UploadFailure('failed');
      this.check(work, valid);
      const size = Number(before.size);
      if (this.diagnostics().bytes + size > UPLOAD_LIMITS.totalBytes) throw new UploadFailure('failed', 'Staged snapshots reached their 20 MiB aggregate budget. Remove one explicitly.');
      work.entry.bytes = size;
      if (!this.directory) this.directory = await mkdtemp(join(this.options.temporaryRoot ?? tmpdir(), 'wbx-upload-'));
      this.check(work, valid);
      temporary = join(this.directory, work.entry.attachmentId);
      output = await open(temporary, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      work.retained.push(output);
      created = await output.stat({ bigint: true });
      let offset = 0;
      this.progress(work, 'stage', 0, size);
      while (offset < size) {
        this.check(work, valid);
        const chunk = Buffer.allocUnsafe(Math.min(UPLOAD_LIMITS.chunkBytes, size - offset));
        const read = await input.read(chunk, 0, chunk.length, offset);
        if (!read.bytesRead) throw new UploadFailure('failed');
        let written = 0;
        while (written < read.bytesRead) {
          const result = await output.write(chunk, written, read.bytesRead - written, offset + written);
          if (!result.bytesWritten) throw new UploadFailure('failed');
          written += result.bytesWritten;
        }
        offset += read.bytesRead; this.progress(work, 'stage', offset, size);
      }
      const extra = Buffer.alloc(1);
      if ((await input.read(extra, 0, 1, offset)).bytesRead || !sameFile(before, await input.stat({ bigint: true }))
        || !sameFile(before, await lstat(path, { bigint: true })) || await realpath(path) !== path) throw new UploadFailure('failed', 'The selected file changed during staging. Choose it again explicitly.');
      this.check(work, valid); await output.sync(); await output.close();
      work.retained = work.retained.filter(file => file !== output); output = undefined;
      const snapshot = await open(temporary, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      work.entry.file = snapshot;
      const info = await snapshot.stat({ bigint: true }), current = await lstat(temporary, { bigint: true });
      if (info.dev !== created.dev || info.ino !== created.ino || !sameFile(info, current) || !info.isFile() || info.size !== before.size
        || info.nlink !== 1n || info.uid !== BigInt(process.getuid?.() ?? -1) || info.mode & 0o077n) throw new UploadFailure('failed');
      await unlink(temporary); temporary = undefined;
      if (!sameFile(before, await input.stat({ bigint: true })) || !sameFile(before, await lstat(path, { bigint: true }))) throw new UploadFailure('failed', 'The selected file changed during staging. Choose it again explicitly.');
      this.check(work, valid); this.progress(work, 'stage', size, size);
    } finally {
      const cleanup = await Promise.allSettled(work.retained.map(file => file.close()));
      if (cleanup.some(result => result.status === 'rejected')) work.cleanupFailed = true;
      else work.retained = [];
      if (temporary && created) {
        const info = await lstat(temporary, { bigint: true }).catch(() => undefined);
        if (info?.dev === created.dev && info.ino === created.ino) await unlink(temporary).catch(() => {});
      }
    }
  }
  async send<T>(attachmentId: string, binding: SnapshotBinding, valid: () => boolean,
    run: (source: UploadSource, signal: AbortSignal, submitted: () => void) => Promise<T>, parent?: AbortSignal): Promise<T> {
    const entry = this.entries.get(attachmentId);
    if (this.sending || !entry?.file || entry.revoked || entry.retired || entry.epoch !== this.epoch || !sameBinding(entry.binding, binding) || !valid()) throw new UploadFailure('failed');
    const work = this.sending = this.work(entry);
    const cancel = () => work.abort.abort();
    parent?.addEventListener('abort', cancel, { once: true });
    if (parent?.aborted) cancel();
    const native = (async () => {
      this.check(work, valid);
      const info = await entry.file!.stat();
      if (!info.isFile() || info.nlink !== 0 || info.size !== entry.bytes) throw new UploadFailure('failed');
      this.check(work, valid); this.progress(work, 'send', 0, entry.bytes);
      const source: UploadSource = { attachmentId, name: entry.name, bytes: entry.bytes,
        read: signal => this.read(entry, work, valid, signal) };
      const result = await run(source, work.abort.signal, () => { this.check(work, valid); work.submitted = true; });
      this.check(work, valid);
      entry.revoked = true; return result;
    })().catch(error => { throw error instanceof UploadFailure ? error : new UploadFailure(work.submitted ? 'unknown' : 'failed'); }).finally(async () => {
      parent?.removeEventListener('abort', cancel);
      if (entry.retired) entry.revoked = true;
      if (entry.revoked) await this.closeEntry(entry);
      if (this.sending === work && (!entry.revoked || !this.entries.has(entry.attachmentId))) this.sending = undefined;
      this.cleanDirectory();
    });
    return this.logical(native, work, Math.min(this.options.sendMs ?? UPLOAD_LIMITS.sendMs, UPLOAD_LIMITS.sendMs));
  }
  private async *read(entry: Entry, work: Work, valid: () => boolean, signal: AbortSignal): AsyncGenerator<Uint8Array> {
    let offset = 0;
    while (offset < entry.bytes) {
      this.check(work, valid); if (signal.aborted) throw new UploadFailure(work.submitted ? 'unknown' : 'failed');
      const chunk = Buffer.allocUnsafe(Math.min(UPLOAD_LIMITS.chunkBytes, entry.bytes - offset));
      const result = await entry.file!.read(chunk, 0, chunk.length, offset);
      if (!result.bytesRead) throw new UploadFailure(work.submitted ? 'unknown' : 'failed');
      offset += result.bytesRead; yield chunk.subarray(0, result.bytesRead);
      this.progress(work, 'send', offset, entry.bytes);
    }
    this.check(work, valid); this.progress(work, 'send', offset, entry.bytes);
  }
  remove(attachmentId: string, binding: SnapshotBinding): void {
    const entry = this.entries.get(attachmentId);
    if (!entry || entry.epoch !== this.epoch) return;
    if (!sameBinding(entry.binding, binding)) throw new UploadFailure('failed');
    if (this.sending?.entry === entry) { entry.retired = true; return; } // Removal edits the draft, not an already admitted POST.
    entry.revoked = true;
    if (this.staging?.entry === entry) this.staging.abort.abort(); else void this.closeEntry(entry);
  }
  cancel(draftId: string, phase?: 'stage' | 'send'): void {
    if (phase !== 'send' && this.staging?.binding.draftId === draftId) this.staging.abort.abort();
    if (phase !== 'stage' && this.sending?.binding.draftId === draftId) this.sending.abort.abort();
  }
  reset(): void {
    this.epoch++; this.staging?.abort.abort(); this.sending?.abort.abort();
    for (const entry of this.entries.values()) {
      entry.revoked = true;
      if (entry !== this.staging?.entry && entry !== this.sending?.entry) void this.closeEntry(entry);
    }
    this.cleanDirectory();
  }
  revokeRoom(roomId: string): void {
    this.revoke(binding => 'roomId' in binding && binding.roomId === roomId);
  }
  revokeRecipient(targetId: string): void {
    this.revoke(binding => 'targetId' in binding && binding.targetId === targetId);
  }
  private revoke(matches: (binding: SnapshotBinding) => boolean): void {
    for (const entry of this.entries.values()) {
      if (!matches(entry.binding)) continue;
      entry.revoked = true;
      if (this.staging?.entry === entry) this.staging.abort.abort();
      else if (this.sending?.entry === entry) this.sending.abort.abort();
      else void this.closeEntry(entry);
    }
  }
  private closeEntry(entry: Entry): Promise<void> {
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      try {
        await entry.file?.close();
        this.entries.delete(entry.attachmentId); this.cleanDirectory();
      } catch { /* Unknown FD cleanup keeps its bounded reservation, never admits unlimited replacements. */ }
    })();
    return entry.closing;
  }
  private cleanDirectory(): void {
    if (this.entries.size || this.staging || this.sending || !this.directory || this.cleaning) return;
    const directory = this.directory;
    this.cleaning = rmdir(directory).catch(() => {}).finally(() => { this.directory = undefined; this.cleaning = undefined; });
  }
}
