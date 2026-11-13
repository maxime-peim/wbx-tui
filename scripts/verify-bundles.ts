import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const BUNDLE_FILES = Object.freeze(['browser', 'cli', 'editor-main', 'oauth-worker', 'read-status-worker']
  .flatMap(name => [`${name}.js`, `${name}.js.map`]).sort());
export type BundleBuild = (project: string) => Promise<void>;
const exec = promisify(execFile);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const manifest = (files: Map<string, Buffer>) => Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)]));
function differences(left: Record<string, string>, right: Record<string, string>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(name => left[name] !== right[name]).sort();
}
async function regularFile(path: string): Promise<Buffer> {
  if (!(await lstat(path)).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFile(path);
}
async function inputs(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const name of ['src', 'scripts']) {
    if (!(await lstat(join(root, name))).isDirectory()) throw new Error(`Unsupported build input directory: ${name}`);
  }
  async function walk(directory: string): Promise<void> {
    for (const entry of (await readdir(join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = join(directory, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.set(name, await regularFile(join(root, name)));
      else throw new Error(`Unsupported build input (not a regular file/directory): ${name}`);
    }
  }
  await walk('src');
  for (const name of ['scripts/build.ts', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    files.set(name, await regularFile(join(root, name)));
  }
  return files;
}
async function artifacts(directory: string): Promise<Record<string, string>> {
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected an artifact directory: ${directory}`);
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify(BUNDLE_FILES)) throw new Error('Expected exactly five bundles and their five source maps.');
  const files = new Map<string, Buffer>();
  for (const name of BUNDLE_FILES) files.set(name, await regularFile(join(directory, name)));
  return manifest(files);
}
const isolatedBuild: BundleBuild = async project => {
  const home = join(project, '.build-home');
  await mkdir(home);
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'),
    XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state') };
  for (const key of Object.keys(env)) if (key.startsWith('WBX_')) delete env[key];
  // Only the frozen build script runs; no npm install, app/worker launch or user config.
  await exec(process.execPath, ['--import', 'tsx', 'scripts/build.ts'], { cwd: project, env, timeout: 120_000, maxBuffer: 1_048_576 });
};

/** Read-only checkout verification. Never overwrite dist or trust a historical output hash. */
export async function verifyBundles(root = resolve('.'), build: BundleBuild = isolatedBuild) {
  root = resolve(root);
  const frozen = await inputs(root), before = manifest(frozen), candidate = await artifacts(join(root, 'dist'));
  const directory = await mkdtemp(join(tmpdir(), 'wbx-bundle-integrity-'));
  try {
    const projects = [join(directory, 'first'), join(directory, 'second')];
    for (const project of projects) {
      await mkdir(project);
      for (const [name, bytes] of frozen) {
        await mkdir(dirname(join(project, name)), { recursive: true });
        await writeFile(join(project, name), bytes);
      }
      await symlink(join(root, 'node_modules'), join(project, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    const builds = await Promise.allSettled(projects.map(build));
    const failed = builds.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const [first, second] = await Promise.all(projects.map(project => artifacts(join(project, 'dist'))));
    const unstable = differences(first!, second!);
    if (unstable.length) throw new Error(`Isolated builds disagree: ${unstable.join(', ')}`);
    const changed = differences(before, manifest(await inputs(root)));
    if (changed.length) throw new Error(`Build inputs changed during verification: ${changed.join(', ')}`);
    if (differences(candidate, await artifacts(join(root, 'dist'))).length) throw new Error('Checkout bundles changed during verification.');
    const mismatch = differences(candidate, first!);
    if (mismatch.length) throw new Error(`Bundles do not match current source: ${mismatch.join(', ')}`);
    return { policy: 'two-isolated-builds' as const, node: process.version, inputs: before, artifacts: first! };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--json')) {
    process.stderr.write('Usage: tsx scripts/verify-bundles.ts [--json]\n'); process.exitCode = 1;
  } else {
    verifyBundles().then(result => {
      process.stdout.write(process.argv.includes('--json') ? JSON.stringify(result, null, 2) + '\n'
        : `Verified ${BUNDLE_FILES.length} bundle/map files against two isolated builds; checkout untouched.\n`);
    }, error => {
      process.stderr.write(`Bundle integrity: ${error instanceof Error ? error.message : 'verification failed'}\n`); process.exitCode = 1;
    });
  }
}
