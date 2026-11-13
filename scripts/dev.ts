import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from './build.js';

/** Never mix a source launcher with stale compiled owners/browser workers. */
export async function runDevelopment(args: readonly string[], build = buildArtifacts, launch: typeof spawn = spawn): Promise<number> {
  await build();
  return new Promise<number>((done, reject) => {
    const child = launch(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), ...args], { stdio: 'inherit', shell: false });
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
    const handlers = signals.map(signal => [signal, () => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); }] as const);
    for (const [signal, handler] of handlers) process.on(signal, handler);
    const cleanup = () => { for (const [signal, handler] of handlers) process.off(signal, handler); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); done(code ?? (signal ? 128 + constants.signals[signal] : 1)); });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDevelopment(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => {
    process.stderr.write('Development build or launcher failed.\n'); process.exitCode = 1;
  });
}
