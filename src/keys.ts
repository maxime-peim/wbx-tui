import type { Config } from './config.js';

/** Tokens separated by spaces; a literal space uses <Space>. Prefixes time out. */
export class Keymap {
  pending: string[] = [];
  private since = 0;
  private bindings = new Map<string, string[]>();
  constructor(config: Pick<Config, 'leader' | 'keybindings'>) {
    for (const [sequence, actions] of Object.entries(config.keybindings)) {
      const normalized = sequence.replaceAll('<leader>', config.leader === ' ' ? '<Space>' : config.leader);
      if (actions !== null) this.bindings.set(normalized, typeof actions === 'string' ? [actions] : actions);
    }
    for (const key of this.bindings.keys()) {
      if ([...this.bindings.keys()].some(other => other.startsWith(key + ' '))) throw new Error(`Ambiguous keybinding prefix: ${key}`);
    }
  }
  feed(key: string, now = Date.now()): string[] {
    if (now - this.since > 1000 || key === '<Esc>') this.pending = [];
    this.since = now;
    const token = key === ' ' ? '<Space>' : key;
    this.pending.push(token);
    let sequence = this.pending.join(' ');
    if (!this.bindings.has(sequence) && ![...this.bindings.keys()].some(k => k.startsWith(sequence + ' '))) {
      this.pending = [token]; sequence = token;
    }
    const actions = this.bindings.get(sequence);
    if (actions) { this.pending = []; return actions; }
    if (![...this.bindings.keys()].some(k => k.startsWith(sequence + ' '))) this.pending = [];
    return [];
  }
  hint(now = Date.now()): string { return now - this.since < 1000 ? this.pending.join(' ') : ''; }
}
