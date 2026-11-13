import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Source } from './protocol.js';

const exec = promisify(execFile);
export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const cliPath = () => fileURLToPath(new URL('../dist/cli.js', import.meta.url));
export class Tmux {
  constructor(readonly socket = process.env.WBX_TMUX_SOCKET) {}
  args(args: string[]): string[] { return this.socket ? ['-S', this.socket, ...args] : args; }
  private async raw(args: string[]): Promise<string> {
    try { return (await exec('tmux', this.args(args), { timeout: 5000, maxBuffer: 128_000 })).stdout.trim(); }
    catch (error) { throw new Error(`tmux ${args[0]}: ${String((error as { stderr?: string }).stderr || 'command failed').trim().slice(0, 300)}`); }
  }
  async sessionId(name: string): Promise<string> {
    const entries = await this.raw(['list-sessions', '-F', '#{session_name}|#{session_id}']);
    const entry = entries.split('\n').map(line => [line.slice(0, line.lastIndexOf('|')), line.slice(line.lastIndexOf('|') + 1)])
      .find(([session, id]) => session === name && /^\$\d+$/.test(id!));
    if (!entry?.[1]) throw new Error(`No such call session: ${name}`);
    return entry[1];
  }
  async run(...args: string[]): Promise<string> {
    // Not all installed tmux versions support '=name' for option targets. Resolve
    // our exact-name notation to an immutable session ID; never prefix-match.
    for (let i = 1; i < args.length; i++) if (args[i - 1] === '-t' && args[i]!.startsWith('=')) {
      const [name, ...rest] = args[i]!.slice(1).split(':');
      args[i] = await this.sessionId(name!) + (rest.length ? ':' + rest.join(':') : '');
    }
    return this.raw(args);
  }
  async exists(name: string): Promise<boolean> { return this.sessionId(name).then(() => true, () => false); }
  async attach(name: string): Promise<void> {
    const target = await this.sessionId(name);
    if (process.env.TMUX) { await this.run('switch-client', '-t', target); return; }
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tmux', this.args(['attach-session', '-t', target]), { stdio: 'inherit' });
      child.once('error', () => reject(new Error('Cannot attach tmux.')));
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('tmux attach failed.')));
    });
  }
}
/** Only create a new pane on explicit command. Never rearrange or kill user panes. */
export async function openTmuxViewer(socket: string, source: Source, config: string, renderer: 'kitty' | 'blocks'): Promise<void> {
  if (!process.env.TMUX || !process.env.TMUX_PANE) throw new Error('tmux.open needs an attached tmux pane.');
  const args = [process.execPath, cliPath(), 'view', '--session', socket, '--source', source,
    '--renderer', renderer];
  if (await access(config).then(() => true, () => false)) args.push('--config', resolve(config));
  const command = args.map(quote).join(' ');
  await exec('tmux', ['split-window', '-h', '-t', process.env.TMUX_PANE, command], { timeout: 5000 });
}
