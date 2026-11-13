import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext, createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { cleanupAll, deadline } from '../src/lifecycle.js';
import { MediaHost } from '../src/host.js';
import { ViewerBroker, ViewerHost } from '../src/viewer.js';

const never = () => new Promise<never>(() => {});
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
async function lifecycleSource() {
  const text = await readFile(new URL('../src/cli.ts', import.meta.url), 'utf8');
  const file = ts.createSourceFile('cli.ts', text, ts.ScriptTarget.Latest, true);
  let quit = '', cleanup = '', disconnect = '', capture = '';
  const expressions: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'quit') quit = node.initializer!.getText(file);
    if (ts.isVariableDeclaration(node) && ['onEvent', 'sendLabel', 'statusLine'].includes(node.name.getText(file))) expressions[node.name.getText(file)] = ts.transpile(`(${node.initializer!.getText(file)})`);
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'host.on' && node.arguments[0]?.getText(file) === "'disconnect'") disconnect = node.arguments[1]!.getText(file);
    if (ts.isTryStatement(node) && node.catchClause?.getText(file).includes('startupViewer!.disconnected')) capture = node.getText(file);
    if (ts.isTryStatement(node) && node.finallyBlock?.getText(file).includes('quit(); clearTimeout(timer)')) {
      for (const statement of node.finallyBlock.statements) {
        if (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)
          && ts.isCallExpression(statement.expression.expression)
          && statement.expression.expression.expression.getText(file) === 'cleanupAll') cleanup = statement.getText(file);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(quit); assert.ok(cleanup); assert.ok(disconnect); assert.ok(capture);
  // Execute only the real, narrowly extracted lifecycle expressions. No CLI
  // entrypoint, terminal, browser, SDK, filesystem worker or device is started.
  return { quit: ts.transpile(`(${quit})`), cleanup: ts.transpile(`(async () => { ${cleanup} })()`),
    disconnect: ts.transpile(`(${disconnect})`), expressions,
    capture: ts.transpile(`(async () => { let frame; for (const pane of [{source:'video'}]) { ${capture}; throw new Error('Disconnected capture continued rendering'); } return 'unavailable'; })()`) };
}
test('actual CLI quit starts the 4s owner deadline before stalled visibility/presentation queues', async t => {
  const source = await lifecycleSource();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = new MediaHost(); let kills = 0;
  host.browser = { close: never, process: () => ({ kill: () => { kills++; } }) } as unknown as MediaHost['browser'];
  const abort = new AbortController();
  const context = createContext({ running: true, generation: 0, presentationSequence: 1, ownerStopped: undefined,
    host, deadline, oauth: { close() { throw new Error('oauth cleanup failed'); } }, abort,
    transition: never(), presentationQueue: never() });
  const quit = runInContext(source.quit, context) as () => void;
  quit(); quit();
  assert.equal(context.running, false); assert.equal(abort.signal.aborted, true);
  assert.equal(context.presentationSequence, 2);
  await flush(); t.mock.timers.tick(4000); await flush(); await context.ownerStopped;
  assert.equal(kills, 1, 'unsettled presentation/visibility cannot defer the hard stop');
});
test('actual CLI final cleanup restores terminal despite failing or stalled optional branches', async t => {
  const source = await lifecycleSource();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const completion = runInNewContext(source.cleanup, {
    cleanupAll, ownerStopped: never(), transition: never(), presentationQueue: never(),
    callPanes: { close() { calls.push('panes'); throw new Error('failed'); } },
    broker: { close() { calls.push('broker'); return never(); } },
    sharedFrames: { close() { calls.push('frames'); return Promise.reject(new Error('failed')); } },
    opened: true, terminal: { close() { calls.push('terminal'); return Promise.resolve(); } }, clearImages: () => '',
    host: { browser: undefined }, rss: null, metrics: { stop() { calls.push('metrics'); } },
  }) as Promise<void>;
  assert.deepEqual(calls, ['panes', 'broker', 'frames', 'metrics']);
  t.mock.timers.tick(1000); await flush();
  assert.ok(calls.includes('terminal'), 'terminal restoration is not behind owner/server/queue completion');
  t.mock.timers.tick(7000); await completion;
});

test('actual standalone viewer handlers keep lost transport unknown, catch pending capture loss and never leave implicitly', async () => {
  const source = await lifecycleSource();
  let capturing = false, quits = 0;
  const broker = await ViewerBroker.open(async () => { capturing = true; return new Promise(() => {}); });
  const viewer = await ViewerHost.open(broker.path);
  const context = createContext({ ownsMedia: false, running: true, paused: false, state: 'joined', generation: 0,
    authState: 'ready', screenKey: 'old', lastFrames: new Map([[1, 'old']]), lastLabels: 'old', notice: '', ui: { notice: '' },
    startupViewer: viewer, broker: undefined, quit: () => { quits++; },
    sendStates: { microphone: 'on', camera: 'on', screen: 'off' }, callContext: undefined, native: false, command: 'view',
    values: {}, authMethod: 'oauth', mode: 'blocks', cameraLabel: () => 'read-only / no publishing', audio: true,
    capture: viewer.capture, width: 1, height: 1, pixelTransport: 'inline', abort: new AbortController() });
  context.sendLabel = runInContext(source.expressions.sendLabel!, context);
  viewer.on('disconnect', runInContext(source.disconnect, context));
  viewer.on('event', runInContext(source.expressions.onEvent!, context));
  try {
    const capture = runInContext(source.capture, context) as Promise<string>;
    while (!capturing) await new Promise<void>(resolve => setImmediate(resolve));
    await broker.close(); assert.equal(await capture, 'unavailable');
    assert.match(context.state, /unavailable.*unknown/);
    assert.equal(context.paused, true); assert.equal(context.lastFrames.size, 0); assert.equal(context.screenKey, '');
    assert.match(context.ui.notice, /owner may still be active/);
    assert.equal(quits, 0, 'transport loss cannot invoke fatal/ended cleanup or owner leave');
    assert.match(runInContext(source.expressions.statusLine!, context)(), /mic unknown cam unknown share unknown.*Rx audio unknown/);
    viewer.send({ type: 'start', mode: 'demo' }); assert.equal(quits, 0, 'late consumers do not replay a fabricated ended status');
    // The unchanged real owner-status branch still handles verified termination.
    viewer.emit('event', { type: 'status', state: 'ended' }); assert.equal(quits, 1);
  } finally { await viewer.close(); await broker.close(); }
});
