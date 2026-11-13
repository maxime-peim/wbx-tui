import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { ViewerBroker, ViewerHost } from '../src/viewer.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import { CallPanes } from '../src/call-panes.js';
import { defaults } from '../src/config.js';
import { nativePaneIntent, paneAction, type NativePaneIntent } from '../src/native-panes.js';
import { parseEditorOperation } from '../src/editor-protocol.js';
import { EditorEngine } from '../src/editor-engine.js';
import { handled, until } from './async-test.js';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function capability(viewer: ViewerHost) {
  if (!viewer.paneSnapshot()) await once(viewer, 'pane-capability');
  return viewer.paneSnapshot()!;
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
};
for (const change of ['none', 'pid', 'pane', 'marker', 'session', 'socket'] as const) {
  test(`explicit control recovery verifies the same living owner (${change}) without joining or replay`, async t => {
    const broker = await ViewerBroker.open(async () => null); broker.configure(defaults());
    let actions = 0;
    broker.onAction = async () => { actions++; };
    const viewer = await ViewerHost.open(broker.path), meetings = new EditorMeetings(), internal = meetings as any;
    const marker = 'a'.repeat(32);
    Object.assign(internal, { active: true, controlsReady: true, viewer, pane: '%42', session: 'wbx-one',
      identity: 'original', ownerPid: process.pid });
    let changed = false;
    const calls: string[][] = [];
    t.mock.method(internal.tmux, 'run', async (...args: string[]) => {
      calls.push(args);
      assert.ok(['show-options', 'display-message'].includes(args[0]!), 'recovery never launches a call or mutates tmux');
      if (args[0] === 'display-message')
        return `wbx-one|${process.pid}|${changed && change === 'marker' ? 'b'.repeat(32) : marker}`;
      return ({
        '@wbx_call': 'original', '@wbx_media_pid': String(process.pid + (changed && change === 'pid' ? 1 : 0)),
        '@wbx_media_pane': changed && change === 'pane' ? '%43' : '%42',
        '@wbx_owner': marker, '@wbx_broker': changed && change === 'socket' ? broker.path + '.missing' : broker.path,
      } as Record<string, string>)[args.at(-1)!] ?? '';
    });
    try {
      (viewer as any).socket.destroy();
      await until(() => viewer.disconnected, 'control transport disconnect');
      changed = true;
      if (change === 'session') internal.session = 'wbx-two';
      const recovered = handled(meetings.reconnect('wbx-one'));
      if (change === 'none') {
        assert.equal((await recovered).ready, true);
        assert.equal(internal.viewer.disconnected, false);
        assert.equal(internal.ownerPid, process.pid);
      } else {
        await assert.rejects(recovered, /owner|session|socket|broker/i);
        assert.equal(meetings.snapshot().ready, false);
      }
      assert.equal(meetings.snapshot().active, true, 'transport loss is not media termination');
      assert.equal(actions, 0, 'reconnection never replays toggles, auth or presentation actions');
    } finally { await meetings.close(); await broker.close(); }
  });
}
test('native adapter is finite, strictly typed, credential-free and presentation-only', () => {
  for (const intent of [{ revision: 1, action: 'focus.next' }, { revision: 1, action: 'source.set', source: 'remote-2' },
    { revision: 1, action: 'layout', layout: 'speaker' }]) {
    assert.ok(nativePaneIntent(intent));
    assert.deepEqual(parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'meeting.pane',
      params: { session: 'wbx-synthetic', intent } }).params, { session: 'wbx-synthetic', intent });
  }
  for (const intent of [{ revision: 1, action: 'quit' }, { revision: 1, action: 'auth.refresh' }, { revision: 1, action: 'video.toggle' },
    { revision: 1, action: 'command' }, { revision: 1, action: 'layout.save', layout: 'private' }, { revision: 1, action: 'layout', layout: 'x;quit' },
    { revision: 1, action: 'source.set', source: 'remote-99' }, { revision: 0, action: 'focus.next' },
    { revision: 1, action: 'focus.next', token: 'PRIVATE' }, { revision: 1, action: 'pane.close', source: 'video' }]) {
    assert.equal(nativePaneIntent(intent), false);
    assert.throws(() => paneAction(intent as NativePaneIntent));
    assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'meeting.pane',
      params: { session: 'wbx-synthetic', intent } }));
  }
});
test('old owners remain connected and unsupported native actions send nothing', async () => {
  const broker = await ViewerBroker.open(async () => null); broker.configure(defaults());
  const viewer = await ViewerHost.open(broker.path);
  try {
    await turn();
    assert.equal(viewer.paneSnapshot(), undefined);
    assert.throws(() => viewer.nativePane({ revision: 1, action: 'focus.next' }, '%42'), /unavailable/);
    assert.equal(viewer.disconnected, false);
  } finally { await viewer.close(); await broker.close(); }
});
test('owner completion is ACKed, not inferred from dispatch; changed slots fence queued choices and failures stay unknown', async () => {
  const gate = deferred(), dispatched: string[] = [];
  const broker = await ViewerBroker.open(async () => null);
  broker.onNativePane = async (intent, pane, valid) => {
    assert.equal(pane, '%42'); await gate.promise;
    if (!valid()) throw new Error('PRIVATE stale source');
    dispatched.push(paneAction(intent));
  };
  broker.configure(defaults());
  broker.publish({ type: 'sources', sources: [{ id: 'video', label: 'Original', kind: 'video', available: true, generation: 1 }] });
  const viewer = await ViewerHost.open(broker.path);
  try {
    const cap = await capability(viewer);
    assert.equal(cap.sources[0]!.label, 'Original', 'revision and roster are paired in one capability envelope');
    let done = false;
    const pending = viewer.nativePane({ revision: cap.revision, action: 'layout', layout: 'speaker' }, '%42').then(result => { done = true; return result; });
    await turn(); assert.equal(done, false, 'fire-and-forget dispatch is not completion');
    gate.resolve(); assert.equal((await pending).status, 'applied');
    assert.deepEqual(dispatched, ['layout speaker']);
    const block = deferred(); let waiting = false;
    broker.onNativePane = async (_intent, _pane, valid) => { waiting = true; await block.promise; if (!valid()) throw new Error('Changed slot'); };
    const choice = viewer.nativePane({ revision: cap.revision, action: 'source.set', source: 'video' }, '%42');
    while (!waiting) await turn();
    const changed = once(viewer, 'pane-capability');
    broker.publish({ type: 'sources', sources: [{ id: 'video', label: 'Replacement', kind: 'video', available: true, generation: 2 }] });
    await changed; block.resolve();
    assert.equal((await choice).status, 'unknown');
    assert.throws(() => viewer.nativePane({ revision: cap.revision, action: 'source.set', source: 'video' }, '%42'), /unavailable/);
    assert.deepEqual(dispatched, ['layout speaker'], 'no action on replacement slot and no replay');
    broker.onNativePane = async () => { throw new Error('PRIVATE tmux detail'); };
    const result = await viewer.nativePane({ revision: viewer.paneSnapshot()!.revision, action: 'pane.close' }, '%42');
    assert.equal(result.status, 'unknown'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  } finally { gate.resolve(); await viewer.close(); await broker.close(); }
});
test('disconnect with a pending pane action reports unknown once and never ends the independent meeting', async () => {
  const broker = await ViewerBroker.open(async () => null), started = deferred(), release = deferred();
  broker.onNativePane = async () => { started.resolve(); await release.promise; }; broker.configure(defaults());
  const viewer = await ViewerHost.open(broker.path);
  try {
    const cap = await capability(viewer), pending = viewer.nativePane({ revision: cap.revision, action: 'focus.next' }, '%42');
    await started.promise; await broker.close();
    assert.equal((await pending).status, 'unknown'); assert.equal(viewer.disconnected, true);
    assert.throws(() => viewer.nativePane({ revision: cap.revision, action: 'focus.next' }, '%42'), /unavailable/);
  } finally { release.resolve(); await viewer.close(); await broker.close(); }
});
test('managed-pane authorization and queued source revision fence precede any native tmux mutation', async () => {
  const calls: string[][] = [], config = defaults();
  let hijack = false, foreign = false;
  const panes = new CallPanes({ context: { name: 'wbx-synthetic', marker: 'marker' } as any,
    socket: '/unused', configPath: '/unused', config, pixelTransport: 'auto', control: () => assert.fail('No media/control tunnel'),
    tmux: { run: async (...args: string[]) => {
      calls.push(args);
      if (args[0] === 'list-panes') return '%42|100|marker|video\n%43|101|marker|remote-2';
      if (args.at(-1) === '#{pane_id}') { foreign = hijack; return '%43'; }
      if (args.at(-1) === '#{window_id}|#{pane_pid}|#{@wbx_owner}|#{@wbx_source}')
        return args.includes('%42') ? '@1|100|marker|video' : '@1|101|' + (foreign ? 'foreign' : 'marker') + '|remote-2';
      return '';
    } } });
  Object.assign(panes, { owner: '%42', window: '@1', views: new Map([
    ['%42', { pane: '%42', pid: '100', source: 'video', owner: true }],
    ['%43', { pane: '%43', pid: '101', source: 'remote-2', owner: false }]]) });
  await assert.rejects(panes.nativeAction({ revision: 1, action: 'pane.close' }, '%99', () => true), /managed/);
  await assert.rejects(panes.nativeAction({ revision: 1, action: 'pane.close' }, '%42', () => false), /changed/);
  assert.ok(!calls.some(call => call[0] === 'kill-pane'));
  await panes.nativeAction({ revision: 1, action: 'focus.next' }, '%42', () => true);
  assert.ok(calls.some(call => call[0] === 'select-pane' && call.at(-1) === '%42'));
  assert.ok(!calls.some(call => call[0] === 'set-option'), 'no inherited tmux appearance changed');
  hijack = true;
  await assert.rejects(panes.nativeAction({ revision: 1, action: 'pane.close' }, '%42', () => true), /identity changed/);
  assert.ok(!calls.some(call => call[0] === 'kill-pane'), 'pane identity is rechecked after asynchronous focus observation');
});
test('EditorMeetings rechecks exact session after asynchronous owner verification and supports messaging-independent control', async t => {
  const broker = await ViewerBroker.open(async () => null); let actions = 0;
  broker.onNativePane = async () => { actions++; }; broker.onAction = async () => {}; broker.configure(defaults());
  const viewer = await ViewerHost.open(broker.path), meetings = new EditorMeetings(), gate = deferred();
  const internal = meetings as any;
  Object.assign(internal, { active: true, controlsReady: true, viewer, pane: '%42', session: 'wbx-one' });
  try {
    const cap = await capability(viewer);
    t.mock.method(internal, 'owned', async () => { await gate.promise; return true; });
    internal.paneRevision = cap.revision;
    const pending = meetings.paneAction('wbx-one', { revision: cap.revision, action: 'focus.next' });
    internal.session = 'wbx-two'; gate.resolve();
    await assert.rejects(pending, /changed/); assert.equal(actions, 0);
    t.mock.method(internal, 'owned', async () => true);
    const result = await meetings.paneAction('wbx-two', { revision: cap.revision, action: 'layout', layout: 'gallery' });
    assert.equal(result.status, 'applied'); assert.equal(actions, 1);
    assert.equal(meetings.snapshot().active, true);
  } finally { gate.resolve(); await meetings.close(); await broker.close(); }
});
test('bound delivery resolution refuses replacement/pending destinations and can never clear a different room', async () => {
  const engine = new EditorEngine();
  try {
    await engine.start('demo'); await engine.select('demo-general');
    const store = (engine as any).store;
    store.uncertain.add('demo-general'); store.uncertain.add('demo-engineering');
    assert.throws(() => engine.resolveBoundDelivery('demo-engineering'), /changed/);
    assert.equal(store.uncertain.size, 2);
    store.sending = true;
    assert.throws(() => engine.resolveBoundDelivery('demo-general'), /pending/);
    assert.equal(store.uncertain.size, 2); store.sending = false;
    assert.deepEqual(engine.resolveBoundDelivery('demo-general'), { roomId: 'demo-general' });
    assert.deepEqual([...store.uncertain], ['demo-engineering']);
    for (const params of [{}, { roomId: 'demo-general', token: 'PRIVATE' }, { roomId: [] }]) {
      assert.throws(() => parseEditorOperation({ jsonrpc: '2.0', id: 1, method: 'delivery.resolveBound', params }));
    }
  } finally { engine.stop(); }
});
