import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { type ChildProcess, type spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runDevelopment } from '../scripts/dev.js';
import { buildArtifacts } from '../scripts/build.js';

test('development builds all artifacts before launching the compiled owner and preserves literal arguments', async () => {
  const calls: unknown[] = [];
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }) as unknown as ChildProcess;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const launch = ((...args: unknown[]) => {
    calls.push(args); queueMicrotask(() => child.emit('exit', 7, null)); return child;
  }) as typeof spawn;
  const pending = runDevelopment(['demo', '--layout', 'literal;not-a-shell'], async () => { calls.push('build'); await gate; }, launch);
  assert.deepEqual([...calls], ['build']);
  release();
  assert.equal(await pending, 7);
  assert.equal(calls.length, 2);
  const [binary, args, options] = calls[1] as [string, string[], object];
  assert.equal(binary, process.execPath);
  assert.ok(args[0]!.endsWith('/dist/cli.js'));
  assert.deepEqual(args.slice(1), ['demo', '--layout', 'literal;not-a-shell']);
  assert.deepEqual(options, { stdio: 'inherit', shell: false });
});

test('failed development build cannot launch a stale compiled session', async () => {
  let launches = 0;
  await assert.rejects(runDevelopment(['live'], async () => { throw new Error('Build rejected.'); }, (() => { launches++; }) as unknown as typeof spawn));
  assert.equal(launches, 0);
});

test('development launcher failure releases signal handlers instead of retaining a dead owner', async () => {
  const counts = ['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => process.listenerCount(signal));
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }) as unknown as ChildProcess;
  const launch = (() => { queueMicrotask(() => child.emit('error', new Error('Synthetic spawn failure.'))); return child; }) as typeof spawn;
  await assert.rejects(runDevelopment(['demo'], async () => {}, launch), /Synthetic spawn failure/);
  assert.deepEqual(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => process.listenerCount(signal)), counts);
});

test('complete build supports a fresh private output directory and replaces stale artifacts', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-build-contract-');
  try {
    await writeFile(join(directory, 'cli.js'), 'stale source launcher');
    await buildArtifacts(directory);
    assert.deepEqual((await readdir(directory)).sort(), ['browser.js', 'browser.js.map', 'cli.js', 'cli.js.map', 'editor-main.js', 'editor-main.js.map', 'oauth-worker.js', 'oauth-worker.js.map', 'read-status-worker.js', 'read-status-worker.js.map']);
    for (const name of ['browser', 'cli', 'editor-main', 'read-status-worker', 'oauth-worker']) assert.ok((await readFile(join(directory, `${name}.js`))).length > 0);
    assert.notEqual(await readFile(join(directory, 'cli.js'), 'utf8'), 'stale source launcher');
    const packageJSON = JSON.parse(await readFile('package.json', 'utf8'));
    assert.equal(packageJSON.scripts.dev, 'tsx scripts/dev.ts');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
