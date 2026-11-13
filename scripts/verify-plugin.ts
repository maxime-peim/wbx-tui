import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Baseline verification never inherits opt-ins to graphical/media suites. */
export function pluginVerificationEnvironment(inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...inherited };
  for (const key of new Set([...Object.keys(env), 'WBX_BROWSER_TEST', 'WBX_SDK_TEST', 'WBX_KITTY_TEST', 'WBX_EDITOR_MEETING_TEST', 'WBX_MESSAGING_TEST'])) {
    if (/^WBX_.*_TEST$/.test(key)) env[key] = '0';
  }
  // Include the example/guide consistency assertion, not an installed lazy.nvim loader.
  delete env.WBX_LAZY_PATH;
  env.WBX_TEST_SOURCE_BACKEND = '0';
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'ESBUILD_BINARY_PATH', 'TSX_TSCONFIG_PATH', 'TSX_DISABLE_CACHE'])
    delete env[key];
  return env;
}

function runNpm(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  console.log(`\n[verify:plugin] npm ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} failed (${signal ?? code}).`)));
  });
}

export async function verifyPlugin(inherited: NodeJS.ProcessEnv = process.env, run = runNpm): Promise<void> {
  const env = pluginVerificationEnvironment(inherited);
  // The developer entrypoint cannot build the checkout, even with stale dist/.
  await run(['run', 'verify:isolated'], env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPlugin().catch(error => { console.error(`[verify:plugin] ${error instanceof Error ? error.message : 'Verification failed.'}`); process.exitCode = 1; });
}
