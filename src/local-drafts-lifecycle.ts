/** Private draft open/save sequencing, never native text, verified identity or send authority. */
import { createHash } from 'node:crypto';
import { validLocalDrafts, type LocalDrafts, type LocalDraft } from './local-drafts.js';

export interface LocalDraftSession {
  mode: 'demo' | 'live';
  config: string;
  sessionId: string;
  current(): boolean;
  /** The existing shared verified-storage facade; no independent identity probe. */
  key(): Promise<string>;
  /** Current demo/live grant and expiry evidence for save commit admission. */
  allowed(): boolean;
}
export class LocalDraftError extends Error {
  constructor(readonly code: -32002 | -32003, message: string) { super(message); }
}
export class LocalDraftsLifecycle {
  private profile?: string;
  private io = false; // Physical admission survives logical session reset.
  constructor(private readonly create: () => Pick<LocalDrafts, 'load' | 'save'>) {}
  reset(): void { this.profile = undefined; }
  async open(session: LocalDraftSession) {
    if (this.io) throw new LocalDraftError(-32002, 'Local draft storage is busy; native text retained.');
    const sessionId = session.sessionId;
    this.io = true;
    try {
      const profile = session.mode === 'demo' ? createHash('sha256').update(JSON.stringify(['demo-drafts', session.config])).digest('hex')
        : await session.key();
      const document = await this.create().load(profile);
      if (!session.current()) throw new Error();
      this.profile = profile;
      return { sessionId, profile, ...document };
    } catch { throw new LocalDraftError(-32003, 'Private local drafts unavailable. Native text retained; no unverified account data was loaded.'); }
    finally { this.io = false; }
  }
  async save(profile: string, revision: string, items: LocalDraft[], session: LocalDraftSession) {
    if (profile !== this.profile || !validLocalDrafts(items) || this.io) throw new LocalDraftError(-32002, 'Draft account changed or storage busy; native text retained.');
    const sessionId = session.sessionId;
    const valid = () => session.current() && this.profile === profile && session.allowed();
    this.io = true;
    try {
      const storage = this.create();
      const document = await storage.load(profile);
      if (document.revision !== revision || !valid()) throw new Error();
      const merged = new Map(document.items.map(item => [JSON.stringify([item.roomId, item.parentId ?? '']), item]));
      for (const item of items) {
        const key = JSON.stringify([item.roomId, item.parentId ?? '']);
        if (item.text || item.uncertain) merged.set(key, { ...item }); else merged.delete(key);
      }
      const next = await storage.save(profile, revision, [...merged.values()], valid);
      if (!valid()) throw new Error();
      return { sessionId, profile, revision: next };
    } catch { throw new LocalDraftError(-32003, 'Local drafts were not saved: storage is unsafe, full or changed in another editor. Native text retained.'); }
    finally { this.io = false; }
  }
}
