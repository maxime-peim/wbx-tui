import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { validSource, type Source, type RendererMode } from './protocol.js';
import { validateOAuth, type OAuthConfig } from './oauth.js';
import { messagingDefaults, parseMessaging, validateMessageLayout, type MessagingConfig, type MessageLayout } from './messaging-config.js';
import { validToken } from './auth-protocol.js';

export type Layout = { source: Source; title?: string } | {
  direction: 'vertical' | 'horizontal'; ratio: number; children: [Layout, Layout];
};
export interface Theme { background: string; foreground: string; muted: string; accent: string; border: string; focus: string; warning: string }
/** Native messaging has no dependency on compatibility layouts, maps or colors. */
export interface EditorConfig { version: 1; oauth?: OAuthConfig }
export interface Config {
  version: 1; leader: string; layout: string; layouts: Record<string, Layout>;
  keybindings: Record<string, string | string[] | null>; theme: Theme;
  renderer: RendererMode; fallback: 'blocks' | 'browser'; fps: number; width: number; height: number; demoParticipants: number;
  oauth?: OAuthConfig;
  messaging: MessagingConfig;
  tmux: { appearance: 'inherit' | 'theme' };
}
export const ACTIONS = [
  'quit', 'pause', 'renderer.kitty', 'renderer.blocks', 'renderer.browser', 'audio.toggle', 'camera.toggle',
  'microphone.toggle', 'video.toggle', 'screen.toggle', 'chat', 'chat.close', 'auth.refresh',
  'source.next', 'source.set', 'focus.next', 'focus.previous', 'focus.left', 'focus.right', 'focus.up', 'focus.down',
  'pane.split.vertical', 'pane.split.horizontal', 'pane.close', 'pane.only', 'pane.maximize', 'pane.grow', 'pane.shrink',
  'layout', 'layout.save', 'theme', 'tmux.open', 'reload', 'help', 'command', 'participants', 'mock.add', 'mock.remove', 'mock.share',
] as const;
export function validAction(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 160) return false;
  const [name, ...args] = value.trim().split(/\s+/);
  if (!(ACTIONS as readonly string[]).includes(name!)) return false;
  if (name === 'source.set') return args.length === 1 && validSource(args[0]);
  if (name === 'tmux.open') return args.length <= 1 && (!args.length || validSource(args[0]));
  if (name === 'layout.save') return args.length === 1 && /^[a-zA-Z0-9_-]{1,40}$/.test(args[0]!);
  if (name === 'layout' || name === 'theme') return args.length <= 1 && (!args.length || /^[a-zA-Z0-9_-]{1,40}$/.test(args[0]!));
  return !args.length;
}
const leaf = (source: Source): Layout => ({ source });
export function galleryLayout(count: number): Layout {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Gallery requires 1–12 mock participants.');
  const combine = (nodes: Layout[], direction: 'vertical' | 'horizontal'): Layout => {
    if (nodes.length === 1) return nodes[0]!;
    const middle = Math.floor(nodes.length / 2);
    return { direction, ratio: middle / nodes.length, children: [combine(nodes.slice(0, middle), direction), combine(nodes.slice(middle), direction)] };
  };
  const columns = Math.ceil(Math.sqrt(count)), rows: Layout[] = [];
  for (let start = 0; start < count; start += columns) {
    rows.push(combine(Array.from({ length: Math.min(columns, count - start) }, (_, column) =>
      leaf(start + column === 0 ? 'video' : `mock-${start + column + 1}`)), 'vertical'));
  }
  return combine(rows, 'horizontal');
}
export const themes: Record<string, Theme> = {
  midnight: { background: '#10141c', foreground: '#d8e2f0', muted: '#8192aa', accent: '#72c7cf', border: '#344153', focus: '#72c7cf', warning: '#f2bf71' },
  light: { background: '#f4f1e8', foreground: '#263341', muted: '#586778', accent: '#006b80', border: '#97a2ad', focus: '#006b80', warning: '#945000' },
  forest: { background: '#101c18', foreground: '#d6e9da', muted: '#8aa697', accent: '#a5d78d', border: '#375446', focus: '#a5d78d', warning: '#ecc17d' },
  tokyonight: { background: '#1a1b26', foreground: '#c0caf5', muted: '#8991b5', accent: '#7aa2f7', border: '#292e42', focus: '#bb9af7', warning: '#e0af68' },
  gruvbox: { background: '#282828', foreground: '#ebdbb2', muted: '#a89984', accent: '#83a598', border: '#504945', focus: '#b8bb26', warning: '#fabd2f' },
};
export function defaults(): Config {
  return {
    version: 1, leader: ' ', layout: 'gallery', renderer: 'auto', fallback: 'blocks', fps: 15, width: 1280, height: 720, demoParticipants: 4,
    theme: { ...themes.midnight! },
    messaging: messagingDefaults(),
    tmux: { appearance: 'inherit' },
    layouts: {
      single: leaf('video'),
      gallery: galleryLayout(4),
      speaker: { direction: 'vertical', ratio: .7, children: [leaf('video'), {
        direction: 'horizontal', ratio: .5, children: [leaf('mock-2'), leaf('mock-3')],
      }] },
      presentation: { direction: 'vertical', ratio: .75, children: [leaf('share'), leaf('video')] },
    },
    keybindings: {
      q: 'quit', '<Esc>': 'quit', p: 'pause', g: 'renderer.kitty', t: 'renderer.blocks', b: 'renderer.browser',
      a: 'audio.toggle', c: 'camera.toggle', s: 'source.next', '?': 'help', ':': 'command',
      m: 'microphone.toggle', v: 'video.toggle', d: 'screen.toggle',
      u: 'participants', x: 'chat',
      '<Tab>': 'focus.next', '<S-Tab>': 'focus.previous', h: 'focus.left', j: 'focus.down', k: 'focus.up', l: 'focus.right',
      '<C-w> v': 'pane.split.vertical', '<C-w> s': 'pane.split.horizontal', '<C-w> c': 'pane.close',
      '<C-w> o': 'pane.only', '<C-w> =': 'layout gallery', '<C-w> h': 'focus.left', '<C-w> j': 'focus.down',
      '<C-w> k': 'focus.up', '<C-w> l': 'focus.right', '<C-w> w': 'focus.next',
      '<leader> m': 'pane.maximize', '<leader> r': 'reload', '<leader> 1': 'layout single',
      '<leader> 2': 'layout speaker', '<leader> 3': 'layout gallery', '+': 'pane.grow', '-': 'pane.shrink',
    },
  };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${where} key: ${key}`);
}
export function validateLayout(value: unknown, depth = 0, count = { leaves: 0 }): asserts value is Layout {
  if (!object(value) || depth > 8) throw new Error('Invalid layout or nesting deeper than 8.');
  if ('source' in value) {
    keys(value, ['source', 'title'], 'pane');
    if (!validSource(value.source) || (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 80))
      || ++count.leaves > 16) throw new Error('Invalid pane source/title or more than 16 panes.');
  } else {
    keys(value, ['direction', 'ratio', 'children'], 'split');
    if (!['vertical', 'horizontal'].includes(String(value.direction)) || typeof value.ratio !== 'number'
      || !Number.isFinite(value.ratio) || value.ratio < .1 || value.ratio > .9 || !Array.isArray(value.children) || value.children.length !== 2) {
      throw new Error('Splits need a direction, ratio (0.1–0.9), and two children.');
    }
    value.children.forEach(child => validateLayout(child, depth + 1, count));
  }
}
export function parseConfig(input: unknown, initialLayout = 'gallery'): Config {
  if (!object(input)) throw new Error('Configuration must be a JSON object.');
  const base = defaults();
  base.layout = initialLayout;
  keys(input, [...Object.keys(base), 'oauth'], 'configuration');
  const publicOAuth = parsePublicOAuth(input.oauth);
  if (input.version !== undefined && input.version !== 1) throw new Error('Unsupported configuration version.');
  for (const [key, min, max] of [['fps', 1, 30], ['width', 1, 1920], ['height', 1, 1080], ['demoParticipants', 1, 12]] as const) {
    const value = input[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)) throw new Error(`Invalid ${key}: expected ${min}–${max}.`);
  }
  if (input.renderer !== undefined && !['auto', 'kitty', 'blocks', 'browser'].includes(String(input.renderer))) throw new Error('Invalid renderer.');
  if (input.fallback !== undefined && !['blocks', 'browser'].includes(String(input.fallback))) throw new Error('Invalid fallback.');
  if (input.leader !== undefined && (typeof input.leader !== 'string' || !/^[\x20-\x7e]$/.test(input.leader))) throw new Error('Leader must be one printable ASCII character.');
  const result = { ...base, ...input } as Config;
  // The returned/shared configuration is always public, even if the file is not.
  if (publicOAuth) result.oauth = publicOAuth;
  result.messaging = parseMessaging(input.messaging, result.leader);
  if (input.tmux !== undefined) {
    if (!object(input.tmux)) throw new Error('tmux must be an object.');
    keys(input.tmux, ['appearance'], 'tmux');
    if (input.tmux.appearance !== undefined && !['inherit', 'theme'].includes(String(input.tmux.appearance))) throw new Error('tmux.appearance must be inherit or theme.');
    result.tmux = { ...base.tmux, ...input.tmux } as Config['tmux'];
  }
  if (input.theme !== undefined) {
    if (!object(input.theme)) throw new Error('Theme must be an object.');
    keys(input.theme, Object.keys(base.theme), 'theme');
    if (Object.values(input.theme).some(value => typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error('Theme colors must be #RRGGBB.');
    result.theme = { ...base.theme, ...input.theme };
  }
  if (input.layouts !== undefined) {
    if (!object(input.layouts) || Object.keys(input.layouts).length > 32) throw new Error('Invalid layouts.');
    for (const [name, layout] of Object.entries(input.layouts)) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw new Error('Invalid layout name.');
      validateLayout(layout);
    }
    result.layouts = { ...base.layouts, ...input.layouts } as Record<string, Layout>;
  }
  if (typeof result.layout !== 'string' || !Object.hasOwn(result.layouts, result.layout)) throw new Error('Unknown initial layout.');
  if (input.keybindings !== undefined) {
    if (!object(input.keybindings) || Object.keys(input.keybindings).length > 200) throw new Error('Invalid keybindings.');
    for (const [key, action] of Object.entries(input.keybindings)) {
      if (!key || key.length > 100 || /[\x00-\x1f\x7f]/.test(key)) throw new Error('Invalid key sequence.');
      if (action !== null && !(Array.isArray(action) ? action.length > 0 && action.length <= 16 && action.every(validAction) : validAction(action))) throw new Error(`Invalid action for ${key}.`);
    }
    result.keybindings = { ...base.keybindings, ...input.keybindings } as Config['keybindings'];
  }
  return result;
}
function parsePublicOAuth(input: unknown): OAuthConfig | undefined {
  if (input === undefined) return;
  if (!object(input)) throw new Error('OAuth configuration must be an object.');
  const { clientSecret, ...profile } = input;
  if (Object.hasOwn(input, 'clientSecret') && !validToken(clientSecret)) throw new Error('OAuth clientSecret must be a nonempty printable secret.');
  validateOAuth(profile);
  return { clientId: profile.clientId, redirectUri: profile.redirectUri, scopes: [...profile.scopes] };
}
/** Validate only native-runtime settings; compatibility validation stays in parseConfig. */
export function parseEditorConfig(input: unknown): EditorConfig {
  if (!object(input)) throw new Error('Configuration must be a JSON object.');
  if (input.version !== undefined && input.version !== 1) throw new Error('Unsupported configuration version.');
  const oauth = parsePublicOAuth(input.oauth);
  return { version: 1, ...(oauth ? { oauth } : {}) };
}
export function configPath(explicit?: string): string {
  return explicit ?? process.env.WBX_CONFIG ?? join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wbx-tui', 'config.json');
}
class ConfigFileError extends Error {}
/** Read one bounded file descriptor; never include JSON/provider contents in errors. */
async function readConfigDocument(path: string): Promise<unknown> {
  const file = await open(path, 'r');
  try {
    const initial = await file.stat();
    if (!initial.isFile()) throw new ConfigFileError('Configuration must be a regular file.');
    if (initial.size > 128_000) throw new ConfigFileError('Configuration exceeds 128 KB.');
    const bytes = await file.readFile();
    if (bytes.length > 128_000) throw new ConfigFileError('Configuration exceeds 128 KB.');
    let raw: unknown;
    try { raw = JSON.parse(bytes.toString('utf8')); } catch { throw new ConfigFileError('Configuration must contain valid JSON.'); }
    if (object(raw) && object(raw.oauth) && Object.hasOwn(raw.oauth, 'clientSecret')) {
      const info = await file.stat();
      if (!process.getuid || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
        throw new ConfigFileError('OAuth clientSecret requires a config owned by your user with owner-only permissions (chmod 600).');
      }
    }
    return raw;
  } finally { await file.close(); }
}
export async function loadConfig(path: string, required = false, initialLayout = 'gallery'): Promise<Config> {
  return loadProjection(path, required, raw => parseConfig(raw, initialLayout));
}
export async function loadEditorConfig(path: string, required = false): Promise<EditorConfig> {
  return loadProjection(path, required, parseEditorConfig);
}
async function loadProjection<T>(path: string, required: boolean, project: (raw: unknown) => T): Promise<T> {
  let raw: unknown;
  try { raw = await readConfigDocument(path); }
  catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') return project({});
    if (error instanceof ConfigFileError) throw new Error(`Invalid config ${path}: ${error.message}`);
    throw new Error(`Cannot read config: ${path}`);
  }
  try { return project(raw); }
  catch (error) { throw new Error(`Invalid config ${path}: ${(error as Error).message}`); }
}
/** Node-owner-only lookup. Never attach this result to Config or viewer/extension IPC. */
export async function readOAuthClientSecret(path: string, expected: OAuthConfig): Promise<string | undefined> {
  return readProjectedSecret(path, expected, parseConfig);
}
/** Native Node-owner-only lookup, with the same private-file and profile checks. */
export async function readEditorOAuthClientSecret(path: string, expected: OAuthConfig): Promise<string | undefined> {
  return readProjectedSecret(path, expected, parseEditorConfig);
}
async function readProjectedSecret(path: string, expected: OAuthConfig, project: (raw: unknown) => { oauth?: OAuthConfig }): Promise<string | undefined> {
  const raw = await readConfigDocument(path);
  const profile = project(raw).oauth;
  if (!profile || profile.clientId !== expected.clientId || profile.redirectUri !== expected.redirectUri
    || profile.scopes.join(' ') !== expected.scopes.join(' ')) throw new Error('OAuth profile changed during startup. Restart with the intended configuration.');
  return (raw as { oauth: { clientSecret?: string } }).oauth.clientSecret;
}
export async function resolveOAuthClientSecret(path: string, expected: OAuthConfig, prompt: () => Promise<string>): Promise<string> {
  return await readOAuthClientSecret(path, expected) ?? await prompt();
}
/** Explicit :layout.save only. Preserve an existing private secret; never export it. */
export async function saveLayout(path: string, name: string, layout: Layout): Promise<void> {
  let raw: Record<string, unknown> = {};
  try { raw = await readConfigDocument(path) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot save over an unreadable/invalid config.'); }
  parseConfig(raw); validateLayout(layout);
  const next = { ...raw, layout: name, layouts: { ...(raw.layouts as Record<string, Layout> | undefined), [name]: layout } };
  parseConfig(next);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}
/** Save only messaging geometry; preserve meeting layouts and other user settings. */
export async function saveMessageLayout(path: string, name: string, layout: MessageLayout): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new Error('Invalid layout name.');
  validateMessageLayout(layout);
  let raw: Record<string, unknown> = {};
  try { raw = await readConfigDocument(path) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot save over an unreadable/invalid config.'); }
  parseConfig(raw);
  const messaging = (raw.messaging ?? {}) as Record<string, unknown>;
  const next = { ...raw, messaging: { ...messaging, layout: name, layouts: { ...(messaging.layouts as object), [name]: layout } } };
  parseConfig(next);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try { await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
