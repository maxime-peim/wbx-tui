import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { configPath, loadConfig, readOAuthClientSecret, resolveOAuthClientSecret, saveMessageLayout, themes, type Config } from './config.js';
import { askSecret, Terminal } from './terminal.js';
import { OAuthSession } from './oauth.js';
import { MessagingError, WebexMessagingAPI, demoMessageAPI } from './messaging-api.js';
import { MessagingStore } from './messaging-store.js';
import { MessagingUI } from './messaging-ui.js';
import { ExtensionHost } from './extensions.js';

const help = `WBX Messaging · Vim-style persistent Webex spaces (not meeting chat)

  npm start -- messages --demo             Local sandbox; no credentials/network/Chrome
  npm start -- messages                    Use OAuth from ~/.config/wbx-tui/config.json
  npm start -- messages --auth oauth       Operator-owned integration; session-only renewal
  npm start -- messages --auth token       Explicit developer-token mode; hidden prompt

Options: --config PATH  --layout NAME  --theme ${Object.keys(themes).join('|')}
         --auth token|oauth  --demo  --print-config  --check-auth  --duration SECONDS
         --init PATH        Explicitly trust/execute a local init.mjs (full Node privileges)

Normal: j/k move, gg/G first/last, Enter open space, i compose, / search, : command
Insert: Enter newline, Ctrl+s SEND, Esc normal. Printable keys never run shortcuts.
Panels: Tab, Ctrl+w h/j/k/l, Ctrl+w +/-/</> resize, Ctrl+w o zoom
Commands: :layout mail|stacked|detailed, :layout.save NAME, :theme forest, :reload
          :history.older, :rooms.refresh, :auth.refresh, :draft.clear, :q / :q!
Config: messaging.keybindings.normal/insert, messaging.layouts, shared leader/theme
Ctrl+C always exits. q refuses to discard drafts. Nothing is saved except explicit layout.save.
`;
export function resolveMessagingAuth(config: Pick<Config, 'oauth'>, requested?: string, demo = false): 'demo' | 'oauth' | 'token' | 'unconfigured' {
  if (requested !== undefined && !['token', 'oauth'].includes(requested)) throw new Error('Use messages --auth token|oauth.');
  if (demo) {
    if (requested === 'oauth') throw new Error('--demo never uses OAuth.');
    return 'demo';
  }
  return (requested as 'token' | 'oauth' | undefined) ?? (config.oauth ? 'oauth' : 'unconfigured');
}
/** Static compatibility only; never reads a grant, signs in, or contacts Webex. */
export function checkMessagingOAuth(config: Pick<Config, 'oauth'>) {
  const scopes = new Set(config.oauth?.scopes ?? []);
  return { configured: !!config.oauth, source: 'standalone app oauth profile (not OpenCode/MCP)',
    missingMessagingScopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'].filter(scope => !scopes.has(scope) && !scopes.has('spark:all')),
    clientSecretEntry: 'local hidden prompt', browser: 'system browser via xdg-open', liveSignInVerified: false };
}
function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('xdg-open', [url], { stdio: 'ignore' });
    child.unref(); // a desktop browser helper must not keep a canceled client alive
    child.once('error', () => reject(new Error('Could not open Webex login. Install/configure xdg-open.')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Could not open Webex login.')));
  });
}
export async function runMessaging(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { help: { type: 'boolean', short: 'h' }, demo: { type: 'boolean' },
    config: { type: 'string' }, layout: { type: 'string' }, theme: { type: 'string' }, auth: { type: 'string' },
    duration: { type: 'string', default: '0' }, 'print-config': { type: 'boolean' }, 'check-auth': { type: 'boolean' }, init: { type: 'string' } } });
  if (values.help) { process.stdout.write(help); return; }
  if (positionals.length) throw new Error('Use messages --help for options.');
  const seconds = Number(values.duration);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) throw new Error('--duration must be 0–86400 seconds.');
  const path = configPath(values.config);
  let config = await loadConfig(path, !!values.config || !!process.env.WBX_CONFIG);
  const auth = resolveMessagingAuth(config, values.auth, !!values.demo);
  if (values['check-auth']) {
    const report = checkMessagingOAuth(config), clientSecretConfigured = !!(config.oauth && await readOAuthClientSecret(path, config.oauth));
    process.stdout.write(JSON.stringify({ ...report, clientSecretEntry: clientSecretConfigured ? 'private config file' : 'local hidden prompt',
      clientSecretConfigured, configPath: path, selectedAuth: auth }, null, 2) + '\n');
    if (!report.configured || report.missingMessagingScopes.length) process.exitCode = 1;
    return;
  }
  if (values.layout) {
    if (!Object.hasOwn(config.messaging.layouts, values.layout)) throw new Error('Unknown messaging layout.');
    config.messaging.layout = values.layout;
  }
  if (values.theme) {
    if (!Object.hasOwn(themes, values.theme)) throw new Error('Unknown theme.');
    config.theme = { ...themes[values.theme]! };
  }
  if (values['print-config']) { process.stdout.write(JSON.stringify(config, null, 2) + '\n'); return; }
  if (auth === 'unconfigured') throw new Error(`No OAuth profile in ${path}. Add public oauth.clientId/redirectUri/scopes, select --config PATH, or explicitly use --auth token. No token was requested.`);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Messaging needs an interactive terminal. Use --demo in a terminal or tmux window.');
  let token = '', expiresAt = Infinity, oauth: OAuthSession | undefined;
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (auth === 'oauth') {
      if (!config.oauth) throw new Error('Configure public oauth.clientId/redirectUri/scopes first. See docs/oauth.md.');
      const secret = await resolveOAuthClientSecret(path, config.oauth,
        () => askSecret(process.stdin, process.stderr, 'Webex integration client secret (hidden; memory only): ', abort.signal));
      oauth = new OAuthSession(config.oauth, secret);
      process.stderr.write('Approve your integration in the local browser. No meeting or media will be started. Ctrl+C cancels.\n');
      const access = await oauth.authorize(openBrowser, abort.signal); token = access.token; expiresAt = access.expiresAt;
    } else if (auth === 'token') token = await askSecret(process.stdin, process.stderr, 'Webex messaging access token (hidden; never saved): ', abort.signal);
    abort.signal.throwIfAborted();
  } catch (error) { oauth?.close(); throw error; }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }

  const api = values.demo ? demoMessageAPI() : new WebexMessagingAPI(() => {
    if (Date.now() >= expiresAt) throw new MessagingError('denied', 'Access expired. Sign in again.');
    return token;
  });
  const store = new MessagingStore(api, 4000, values.demo ? 'demo' : 'live'), ui = new MessagingUI(store, config), terminal = new Terminal();
  ui.auth = auth === 'demo' ? 'DEMO · LOCAL ONLY' : auth;
  let running = true, opened = false, dirty = false, rendering: Promise<void> | undefined;
  let extensions: ExtensionHost | undefined, reloading = false;
  let stop!: () => void;
  const stopped = new Promise<void>(resolve => { stop = () => { running = false; resolve(); }; });
  const render = () => {
    if (!running || !opened) return;
    extensions?.sync();
    dirty = true; if (rendering) return;
    rendering = (async () => {
      while (dirty && running) { dirty = false; await terminal.write(ui.screen(process.stdout.columns || 80, process.stdout.rows || 24).ansi); }
    })().catch(() => { stop(); }).finally(() => { rendering = undefined; if (dirty && running) render(); });
  };
  const loadInit = async () => {
    if (!values.init || !running) return;
    const host = new ExtensionHost(ui, render);
    try { await host.load(values.init); if (!running) { await host.dispose(); return; } return host; }
    catch { ui.notice = 'Trusted init failed; core configuration restored. Fix the module and :reload.'; }
  };
  store.onChange = render;
  let renewal: Promise<void> | undefined;
  const failed = () => { ui.notice = 'OAuth renewal failed/expired. Messaging stopped; sign in again.'; stop(); };
  const renew = (): Promise<void> => {
    if (renewal) return renewal;
    if (!oauth) { ui.notice = 'Renewal needs --auth oauth.'; render(); return Promise.resolve(); }
    ui.auth = 'OAuth refreshing'; render();
    renewal = oauth.refresh().then(access => {
      if (!running) return;
      token = access.token; expiresAt = access.expiresAt; ui.auth = 'OAuth ready';
      oauth!.watch(expiresAt, () => { void renew(); }, failed); render();
    }).catch(failed).finally(() => { renewal = undefined; }); return renewal;
  };
  ui.onExternal = action => {
    const [name, argument] = action.split(' ');
    if (name === 'quit.force') { stop(); return; }
    if (name === 'quit') {
      if (ui.dirty) ui.notice = 'Unsent drafts/pending delivery. :q! explicitly discards; Ctrl+C exits.'; else stop();
      return;
    }
    if (name === 'theme') {
      const palette = argument ? extensions?.theme(argument) ?? (Object.hasOwn(themes, argument) ? themes[argument] : undefined) : undefined;
      if (!palette) ui.notice = 'Unknown theme.';
      else { config = { ...ui.config, theme: { ...palette } }; ui.configure(config); ui.notice = `Theme: ${argument} (session only).`; }
      render(); return;
    }
    if (name === 'auth.refresh') { void renew(); return; }
    if (name === 'layout.save' && argument) {
      const layout = structuredClone(ui.layout);
      void saveMessageLayout(path, argument, layout).then(() => {
        config.messaging.layouts[argument] = layout; ui.layoutName = argument; ui.notice = `Saved messaging layout ${argument}.`;
      }).catch(() => { ui.notice = 'Layout save failed. Existing configuration was not overwritten.'; }).finally(render); return;
    }
    if (name === 'reload') {
      if (reloading) { ui.notice = 'Configuration reload already in progress.'; return; }
      reloading = true;
      void loadConfig(path, !!values.config || !!process.env.WBX_CONFIG).then(async next => {
        await extensions?.dispose('reload'); extensions = undefined;
        config = next; ui.configure(next); ui.action(`layout ${next.messaging.layout}`);
        extensions = await loadInit(); extensions?.start(); extensions?.emit('config.reloaded');
        if (!values.init || extensions) ui.notice = 'Configuration reloaded; drafts and connection retained.';
      }).catch(error => { ui.notice = (error as Error).message; }).finally(() => { reloading = false; render(); });
    }
  };
  terminal.onPaste = text => { ui.paste(text); render(); };
  const quit = () => stop();
  const ended = () => stop();
  let timer: ReturnType<typeof setTimeout> | undefined;
  process.once('SIGINT', quit); process.once('SIGTERM', quit);
  try {
    if (values.init) process.stderr.write('Loading explicitly trusted executable configuration (full local Node privileges).\n');
    extensions = await loadInit();
    if (!running) return;
    opened = true; await terminal.open(key => { ui.key(key); render(); }, true);
    process.stdout.on('resize', render); process.stdin.once('end', ended);
    oauth?.watch(expiresAt, () => { void renew(); }, failed);
    if (seconds) timer = setTimeout(stop, seconds * 1000);
    extensions?.start(); render(); void store.loadRooms(); await stopped;
  } finally {
    running = false; clearTimeout(timer); store.close(); oauth?.close(); token = '';
    await extensions?.dispose();
    process.stdout.off('resize', render); process.off('SIGINT', quit); process.off('SIGTERM', quit); process.stdin.off('end', ended);
    await rendering;
    if (opened) await terminal.close();
  }
  if (ui.notice.startsWith('OAuth renewal')) process.stderr.write(ui.notice + '\n');
}
