/** Local grouping projection and preference I/O lifetime, not identity or filesystem authority. */
import { LocalSections, type SectionPreferences, type SectionEdit } from './local-sections.js';

export interface SectionPreferenceSession {
  /** Existing verified disk binding; this owner never requests identity. */
  key(): string | undefined;
  current(): boolean;
  /** Automatic restore only: cache opt-in and the current existing People grant. */
  restoreAllowed(): boolean;
}
export interface SectionPreferencesOptions {
  create(): Pick<SectionPreferences, 'load' | 'save' | 'clear'>;
  rooms(): readonly string[];
  changed(): void;
}
export class SectionPreferenceError extends Error {
  constructor(readonly code: -32002 | -32032, message: string) { super(message); }
}
export class SectionPreferencesLifecycle {
  private readonly sections = new LocalSections();
  private active = false;
  private io = false; // Physical admission survives session invalidation.
  private automatic = false;
  private intentValue = 0;
  constructor(private readonly options: SectionPreferencesOptions) {}
  snapshot() { return this.active ? this.sections.snapshot() : undefined; }
  intent(): number { return this.intentValue; }
  reset(): void { this.sections.reset(); this.active = false; }
  edit(edit: SectionEdit, revision: number) {
    this.intentValue++;
    if (this.io && !this.automatic) throw new SectionPreferenceError(-32002, 'Local preference I/O is active. Retry explicitly after settlement.');
    try {
      const value = this.sections.edit(edit, revision, this.options.rooms());
      this.active = true; this.options.changed(); return value;
    } catch (error) { throw new SectionPreferenceError(-32032, error instanceof Error ? error.message : 'Local grouping unavailable.'); }
  }
  async operate(action: 'load' | 'save' | 'clear', revision: number, session: SectionPreferenceSession) {
    this.intentValue++;
    if (this.io) throw new SectionPreferenceError(-32002, 'Local preference I/O is active. No write was queued.');
    const key = session.key();
    if (!key) throw new SectionPreferenceError(-32032, 'Sections are session-only until account/profile identity is verified (opt-in spaces_cache). No preference file was read or written.');
    const snapshot = this.sections.snapshot();
    if (snapshot.revision !== revision) throw new SectionPreferenceError(-32032, 'Local sections changed. Retry the explicit action.');
    const prefs = this.options.create();
    const valid = () => session.current() && session.key() === key;
    this.io = true;
    try {
      if (action === 'save') {
        await prefs.save(key, snapshot.items, valid);
        if (valid()) this.sections.saved(revision);
      } else if (action === 'clear') {
        await prefs.clear(key, valid);
        if (valid()) this.sections.clear(revision);
      } else {
        const items = await prefs.load(key);
        if (valid() && items) this.sections.replace(items, revision);
        if (valid() && !items) throw new Error('No saved grouping for this account/profile.');
      }
      if (!valid()) throw new Error('Preference operation invalidated by session change.');
      this.active = true; this.options.changed(); return this.sections.snapshot();
    } catch {
      if (valid()) { this.sections.unavailable(); this.active = true; this.options.changed(); }
      throw new SectionPreferenceError(-32032, 'Local preferences unavailable or invalidated. Current grouping was preserved; no server change occurred.');
    } finally { this.io = false; }
  }
  async restore(key: string, session: SectionPreferenceSession, intent: number): Promise<void> {
    const valid = () => session.current() && session.key() === key && session.restoreAllowed() && this.intentValue === intent
      && this.sections.snapshot().revision === 0 && this.sections.snapshot().items.length === 0;
    if (this.io || !valid()) return;
    const prefs = this.options.create();
    this.io = true; this.automatic = true;
    try {
      const items = await prefs.load(key);
      if (!valid()) return;
      if (items) this.sections.replace(items, 0);
      this.active = true; this.options.changed();
    } catch {
      if (valid()) { this.sections.unavailable(); this.active = true; this.options.changed(); }
    } finally { this.automatic = false; this.io = false; }
  }
}
