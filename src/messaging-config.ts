import { Keymap } from './keys.js';

export const PANELS = ['rooms', 'messages', 'compose', 'info'] as const;
export type Panel = typeof PANELS[number] | `user.${string}`;
export const userName = (value: unknown): value is `user.${string}` => typeof value === 'string' && /^user\.[A-Za-z0-9_-][A-Za-z0-9_.-]{0,62}$/.test(value);
export type MessageLayout = { panel: Panel } | { direction: 'vertical' | 'horizontal'; ratio: number; children: [MessageLayout, MessageLayout] };
export interface MessagingConfig {
  layout: string; layouts: Record<string, MessageLayout>;
  lineNumbers: 'relative' | 'absolute' | 'off';
  keybindings: { normal: Record<string, string | string[] | null>; insert: Record<string, string | string[] | null> };
}
export const MESSAGE_ACTIONS = ['quit', 'quit.force', 'help', 'command', 'search', 'search.next', 'search.previous', 'insert', 'normal',
  'focus.next', 'focus.previous', 'focus.left', 'focus.right', 'focus.up', 'focus.down', 'focus.rooms', 'focus.messages', 'focus.compose',
  'move.down', 'move.up', 'move.first', 'move.last', 'page.down', 'page.up', 'scroll.up', 'scroll.down', 'open', 'send', 'refresh', 'rooms.refresh', 'history.older',
  'layout', 'layout.save', 'pane.grow', 'pane.shrink', 'pane.widen', 'pane.narrow', 'pane.maximize', 'theme', 'reload', 'auth.refresh',
  'draft.clear', 'delivery.resolve', 'edit.left', 'edit.right', 'edit.up', 'edit.down', 'edit.home', 'edit.end', 'edit.backspace', 'edit.delete', 'edit.newline'] as const;
export function validMessageAction(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 160) return false;
  const [name, ...args] = value.trim().split(/\s+/);
  if (userName(name)) return !/[\x00-\x1f\x7f-\x9f]/.test(value);
  if (!(MESSAGE_ACTIONS as readonly string[]).includes(name!)) return false;
  return ['layout', 'layout.save', 'theme'].includes(name!) ? args.length === 1 && /^[A-Za-z0-9_-]{1,40}$/.test(args[0]!) : !args.length;
}
export function messagingDefaults(): MessagingConfig {
  const panel = (panel: Panel): MessageLayout => ({ panel });
  return {
    layout: 'mail', lineNumbers: 'relative', layouts: {
      mail: { direction: 'vertical', ratio: .26, children: [panel('rooms'), { direction: 'horizontal', ratio: .73, children: [panel('messages'), panel('compose')] }] },
      stacked: { direction: 'horizontal', ratio: .28, children: [panel('rooms'), { direction: 'horizontal', ratio: .7, children: [panel('messages'), panel('compose')] }] },
      detailed: { direction: 'vertical', ratio: .23, children: [panel('rooms'), { direction: 'vertical', ratio: .75, children: [
        { direction: 'horizontal', ratio: .73, children: [panel('messages'), panel('compose')] }, panel('info')] }] },
    },
    keybindings: {
      normal: {
        q: 'quit', ':': 'command', '?': 'help', '/': 'search', n: 'search.next', N: 'search.previous', i: 'insert', a: ['edit.right', 'insert'],
        h: 'edit.left', l: 'edit.right', '0': 'edit.home', '$': 'edit.end', x: 'edit.delete',
        I: ['focus.compose', 'edit.home', 'insert'], A: ['focus.compose', 'edit.end', 'insert'],
        j: 'move.down', k: 'move.up', '<Down>': 'move.down', '<Up>': 'move.up', 'g g': 'move.first', G: 'move.last',
        '<C-d>': 'page.down', '<C-u>': 'page.up', '<Enter>': 'open', '<C-s>': 'send', '<C-r>': 'refresh',
        '<C-y>': 'scroll.up', '<C-e>': 'scroll.down', '<PageUp>': 'scroll.up', '<PageDown>': 'scroll.down',
        '<Tab>': 'focus.next', '<S-Tab>': 'focus.previous',
        '<C-w> h': 'focus.left', '<C-w> j': 'focus.down', '<C-w> k': 'focus.up', '<C-w> l': 'focus.right', '<C-w> w': 'focus.next',
        '<C-w> +': 'pane.grow', '<C-w> -': 'pane.shrink', '<C-w> >': 'pane.widen', '<C-w> <': 'pane.narrow', '<C-w> o': 'pane.maximize',
        '<leader> r': 'reload', '<leader> s': 'focus.rooms', '<leader> m': 'focus.messages', '<leader> c': 'focus.compose',
        '<leader> 1': 'layout mail', '<leader> 2': 'layout stacked', '<leader> 3': 'layout detailed',
      },
      insert: { '<Esc>': 'normal', '<C-s>': 'send', '<BS>': 'edit.backspace', '<Del>': 'edit.delete', '<Enter>': 'edit.newline',
        '<Left>': 'edit.left', '<Right>': 'edit.right', '<Up>': 'edit.up', '<Down>': 'edit.down', '<Home>': 'edit.home', '<End>': 'edit.end' },
    },
  };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function only(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown messaging configuration key.');
}
export function validateMessageLayout(value: unknown, depth = 0, seen = new Set<string>()): asserts value is MessageLayout {
  if (!object(value) || depth > 4) throw new Error('Invalid messaging layout.');
  if ('panel' in value) {
    only(value, ['panel']);
    if ((!(PANELS as readonly unknown[]).includes(value.panel) && !userName(value.panel)) || seen.has(String(value.panel))) throw new Error('Messaging panels must be known and unique.');
    seen.add(String(value.panel));
  } else {
    only(value, ['direction', 'ratio', 'children']);
    if (!['vertical', 'horizontal'].includes(String(value.direction)) || typeof value.ratio !== 'number' || !Number.isFinite(value.ratio)
      || value.ratio < .1 || value.ratio > .9 || !Array.isArray(value.children) || value.children.length !== 2) throw new Error('Invalid messaging split.');
    for (const child of value.children) validateMessageLayout(child, depth + 1, seen);
  }
  if (!depth && !['rooms', 'messages', 'compose'].every(panel => seen.has(panel))) throw new Error('Messaging layouts need rooms, messages and compose panels.');
}
export function parseMessaging(input: unknown = {}, leader = ' '): MessagingConfig {
  if (!object(input)) throw new Error('Messaging configuration must be an object.');
  only(input, ['layout', 'layouts', 'keybindings', 'lineNumbers']);
  const base = messagingDefaults();
  if (input.lineNumbers !== undefined) {
    if (!['relative', 'absolute', 'off'].includes(String(input.lineNumbers))) throw new Error('Messaging lineNumbers must be relative, absolute or off.');
    base.lineNumbers = input.lineNumbers as MessagingConfig['lineNumbers'];
  }
  if (input.layouts !== undefined) {
    if (!object(input.layouts) || Object.keys(input.layouts).length > 32) throw new Error('Invalid messaging layouts.');
    for (const [name, layout] of Object.entries(input.layouts)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new Error('Invalid messaging layout name.');
      validateMessageLayout(layout); base.layouts[name] = layout;
    }
  }
  if (input.layout !== undefined) {
    if (typeof input.layout !== 'string' || !Object.hasOwn(base.layouts, input.layout)) throw new Error('Unknown messaging layout.');
    base.layout = input.layout;
  }
  if (input.keybindings !== undefined) {
    if (!object(input.keybindings)) throw new Error('Messaging keybindings must be mode-specific.');
    only(input.keybindings, ['normal', 'insert']);
    for (const mode of ['normal', 'insert'] as const) {
      const bindings = input.keybindings[mode]; if (bindings === undefined) continue;
      if (!object(bindings) || Object.keys(bindings).length > 200) throw new Error('Invalid messaging keybindings.');
      for (const [key, action] of Object.entries(bindings)) {
        if (!key || key.length > 100 || /[\x00-\x1f\x7f]/.test(key) || key.trim() !== key) throw new Error('Invalid messaging key sequence; use <Space>.');
        if (mode === 'insert' && !/^<[^<>]+>$/.test(key)) throw new Error('Insert mappings must be single special keys; printable text is always literal.');
        if (action !== null && !(Array.isArray(action) ? action.length > 0 && action.length <= 16 && action.every(validMessageAction) : validMessageAction(action))) throw new Error('Invalid messaging action.');
      }
      Object.assign(base.keybindings[mode], bindings);
    }
  }
  for (const mode of ['normal', 'insert'] as const) new Keymap({ leader, keybindings: base.keybindings[mode] });
  return base;
}
