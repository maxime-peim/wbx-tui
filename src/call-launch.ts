import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Tmux, cliPath, quote } from './tmux.js';
import { validMeeting } from './protocol.js';

export interface CallContext { name: string; identity: string; marker: string }
interface LaunchFile { context: CallContext; args: string[] }
export function callIdentity(mode: 'demo' | 'live', meeting?: string, callId?: string): { name: string; identity: string } {
  if (callId !== undefined && !/^[a-zA-Z0-9_-]{1,48}$/.test(callId)) throw new Error('--call-id must contain 1–48 letters, digits, _ or -.');
  let key: string = mode;
  if (mode === 'live') {
    if (!meeting || !validMeeting(meeting)) throw new Error('A valid Webex meeting link is required to identify the call.');
    const url = new URL(meeting); url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    key = `${mode}:${url.href}`;
  }
  const identity = createHash('sha256').update(key).digest('hex');
  return { name: `wbx-${callId ?? (mode === 'demo' ? 'demo' : identity.slice(0, 16))}`, identity };
}
export async function readCallLaunch(path: string): Promise<LaunchFile> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 32_768 || (info.mode & 0o077) || info.uid !== process.getuid?.()) throw new Error('Unsafe call launch file.');
  let data: LaunchFile;
  try { data = JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('Invalid call launch file.'); }
  if (!data?.context || !/^wbx-[a-zA-Z0-9_-]{1,48}$/.test(data.context.name) || !/^[a-f0-9]{64}$/.test(data.context.identity)
    || !/^[a-f0-9]{32}$/.test(data.context.marker) || !Array.isArray(data.args) || data.args.length > 80
    || !['demo', 'live'].includes(data.args[0]!) || data.args.some(arg => typeof arg !== 'string' || arg.length > 4096)) throw new Error('Invalid call launch data.');
  if (basename(path) !== 'launch.json' || !/^wbx-launch-[a-zA-Z0-9]+$/.test(basename(dirname(path)))) throw new Error('Invalid launch directory.');
  const tmux = new Tmux();
  try {
    await tmux.run('wait-for', data.context.marker);
    const marker = await tmux.run('show-options', '-qv', '-t', `=${data.context.name}`, '@wbx_owner');
    if (marker !== data.context.marker) throw new Error('Call session ownership mismatch.');
  } finally {
    // Remove only the consumed file and an EMPTY launch directory; never
    // recursively delete a directory supplied to an internal worker command.
    await unlink(path).catch(() => {}); await rmdir(dirname(path)).catch(() => {});
  }
  return data;
}
export interface LaunchOptions {
  mode: 'demo' | 'live'; meeting?: string; callId?: string; args: string[]; detached: boolean;
  columns?: number; rows?: number;
}
/** Frontend creates/attaches a real call-named session; only its worker joins. */
export async function launchCall(options: LaunchOptions): Promise<string> {
  const tmux = new Tmux();
  await tmux.run('-V');
  const id = callIdentity(options.mode, options.meeting, options.callId);
  const attachExisting = async () => {
    let identity = '', state = '';
    for (let i = 0; i < 40; i++) {
      identity = await tmux.run('show-options', '-qv', '-t', `=${id.name}`, '@wbx_call');
      state = await tmux.run('show-options', '-qv', '-t', `=${id.name}`, '@wbx_state');
      if (identity && state) break;
      await delay(25); // concurrent creator may still be publishing metadata
    }
    if (identity !== id.identity || !['starting', 'running'].includes(state)) throw new Error(`Session ${id.name} already exists and is not this active call; it was left untouched.`);
    const [pane, pid, marker] = await Promise.all(['@wbx_media_pane', '@wbx_media_pid', '@wbx_owner'].map(option =>
      tmux.run('show-options', '-qv', '-t', `=${id.name}`, option)));
    const owner = /^%\d+$/.test(pane!) && /^\d+$/.test(pid!) && /^[a-f0-9]{32}$/.test(marker!)
      ? await tmux.run('display-message', '-p', '-t', pane!, '#{session_name}|#{pane_pid}|#{@wbx_owner}|#{pane_dead}').catch(() => '') : '';
    if (owner !== `${id.name}|${pid}|${marker}|0`) throw new Error(`Session ${id.name} has no verified call owner; it was left untouched.`);
    process.stderr.write(`Using existing call session: ${id.name}\n`);
    if (!options.detached) await tmux.attach(id.name);
    return id.name;
  };
  if (await tmux.exists(id.name)) return attachExisting();
  const directory = await mkdtemp(join(process.env.WBX_TEMP_DIR || tmpdir(), 'wbx-launch-'));
  await chmod(directory, 0o700);
  const path = join(directory, 'launch.json'), marker = randomBytes(16).toString('hex');
  const context: CallContext = { ...id, marker };
  await writeFile(path, JSON.stringify({ context, args: options.args }), { mode: 0o600, flag: 'wx' });
  let created = false, released = false, createdId = '';
  let mediaPane = '', mediaPid = '';
  try {
    const command = 'exec ' + [process.execPath, cliPath(), 'call-worker', '--launch', path].map(quote).join(' ');
    try {
      const environment = ['WBX_TMUX_SOCKET', 'WBX_TEMP_DIR', 'WBX_BROWSER', 'WBX_CONFIG', 'XDG_CONFIG_HOME', 'DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS']
        .flatMap(key => process.env[key] === undefined ? [] : ['-e', `${key}=${process.env[key]}`]);
      const createdInfo = await tmux.run('new-session', '-d', '-P', '-F', '#{session_id}|#{pane_id}|#{pane_pid}', '-s', id.name, '-n', 'call', '-x', String(options.columns || 160), '-y', String(options.rows || 48),
        '-c', resolve('.'), ...environment, command);
      [createdId, mediaPane, mediaPid] = createdInfo.split('|') as [string, string, string];
      created = true;
      if (!/^\$\d+$/.test(createdId) || !/^%\d+$/.test(mediaPane) || !/^\d+$/.test(mediaPid)) throw new Error('Invalid initial call owner identity.');
    } catch (error) {
      // Another launcher may have won the same deterministic name. Never -A:
      // that would obscure whether we own the new process/session.
      if (await tmux.exists(id.name)) {
        for (let i = 0; i < 20; i++) {
          if (await tmux.run('show-options', '-qv', '-t', `=${id.name}`, '@wbx_call')) return await attachExisting();
          await delay(25);
        }
      }
      throw error;
    }
    await tmux.run('set-option', '-t', `=${id.name}`, '@wbx_call', id.identity);
    await tmux.run('set-option', '-t', `=${id.name}`, '@wbx_owner', marker);
    // Publish the exact bootstrap/exec owner before it can wait for a terminal,
    // OAuth or browser permission. Cancel must never guess "the first pane".
    await tmux.run('set-option', '-t', `=${id.name}`, '@wbx_media_pane', mediaPane);
    await tmux.run('set-option', '-t', `=${id.name}`, '@wbx_media_pid', mediaPid);
    await tmux.run('set-option', '-p', '-t', mediaPane, '@wbx_owner', marker);
    await tmux.run('set-option', '-t', `=${id.name}`, '@wbx_state', 'starting');
    await tmux.run('set-option', '-w', '-t', `=${id.name}:call`, 'remain-on-exit', 'off');
    await tmux.run('set-option', '-w', '-t', `=${id.name}:call`, 'allow-passthrough', 'on');
    await tmux.run('wait-for', '-S', marker);
    released = true;
    process.stderr.write(`Call session: ${id.name}${options.detached ? ' (detached)' : ''}\n`);
    if (!options.detached) await tmux.attach(id.name);
    return id.name;
  } catch (error) {
    if (created && !released && /^\$\d+$/.test(createdId)) await tmux.run('kill-session', '-t', createdId).catch(() => {});
    throw error;
  } finally {
    // Worker normally consumes this first; failed/racing launches clean only
    // their own mkdtemp directory. Successful detached workers may not read yet.
    if (!released) await rm(directory, { recursive: true, force: true });
  }
}
