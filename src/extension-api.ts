import type { Theme } from './config.js';
import type { MessageLayout, MessagingConfig, Panel } from './messaging-config.js';
import type { ChatMessage } from './chat-protocol.js';

export type ExtensionEvent = 'ready' | 'room.changed' | 'messages.changed' | 'mode.changed' | 'draft.changed' | 'focus.changed' | 'config.reloaded' | 'unload' | 'quit';
/** Snapshots contain no credentials, OAuth profile, SDK object or transport. */
export interface ExtensionContext {
  readonly mode: 'normal' | 'insert' | 'command' | 'search';
  readonly focus: Panel;
  readonly layout: string;
  readonly room?: Readonly<{ id: string; title: string; type: 'direct' | 'group' }>;
  readonly messages: readonly Readonly<ChatMessage>[];
  readonly draft: Readonly<{ text: string; cursor: number }>;
}
export type ExtensionHandler = (context: ExtensionContext, args: string) => void | Promise<void>;
export interface ExtensionOptions {
  leader?: string;
  theme?: Partial<Theme>;
  messaging?: Partial<Omit<MessagingConfig, 'keybindings'>> & { keybindings?: Partial<MessagingConfig['keybindings']> };
}
/** v1 trusted, local user configuration API. Node modules are NOT sandboxed. */
export interface ExtensionAPI {
  readonly version: 1;
  context(): ExtensionContext;
  configure(options: ExtensionOptions): void;
  keymap: { set(mode: 'normal' | 'insert', sequence: string, action: string | string[] | ExtensionHandler | null): void };
  commands: { add(name: `user.${string}`, handler: ExtensionHandler): void };
  events: { on(event: ExtensionEvent, handler: ExtensionHandler): () => void };
  panels: { add(name: `user.${string}`, render: (context: ExtensionContext, width: number, height: number) => string[]): void };
  layouts: { add(name: string, layout: MessageLayout): void; use(name: string): void };
  themes: { add(name: string, colors: Partial<Theme>): void; use(name: string): void };
  ui: {
    statusline(render: (context: ExtensionContext) => { left: string; right?: string }): void;
    tabline(render: (context: ExtensionContext) => string): void;
  };
  action(action: string): void;
  focus(panel: Panel): void;
  notify(message: string): void;
  onCleanup(cleanup: () => void | Promise<void>): void;
}
