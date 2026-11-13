import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallPanes } from '../src/call-panes.js';
import { defaults } from '../src/config.js';

const marker = 'a'.repeat(32);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
};
interface Pane { window: string; pid: string; marker: string; source: string }
class CleanupTmux {
  calls: string[][] = [];
  panes = new Map<string, Pane>([
    ['%1', { window: '@1', pid: '101', marker, source: 'video' }],
    ['%2', { window: '@1', pid: '102', marker, source: 'share' }],
    ['%3', { window: '@1', pid: '103', marker, source: 'mock-2' }],
    ['%99', { window: '@1', pid: '999', marker: 'foreign', source: '' }],
  ]);
  entered = deferred();
  gate?: ReturnType<typeof deferred>;
  fail = '';
  split?: ReturnType<typeof deferred>;
  splitEntered = deferred();
  async run(...args: string[]): Promise<string> {
    this.calls.push(args);
    const target = args[args.indexOf('-t') + 1]!;
    if (args[0] === 'display-message') {
      const p = this.panes.get(target);
      if (args.at(-1) === '#{window_id} #{pane_pid} #{session_name}') return '@1 101 wbx-cleanup';
      return p ? `${p.window}|${p.pid}|${p.marker}|${p.source}` : '';
    }
    if (args[0] === 'list-panes')
      return [...this.panes].filter(([, p]) => p.window === target)
        .map(([id, p]) => `${id}|${p.pid}|${p.marker}|${p.source}`).join('\n');
    if (args[0] === 'set-option') {
      const p = this.panes.get(target);
      if (p && args.at(-2) === '@wbx_owner') p.marker = args.at(-1)!;
      if (p && args.at(-2) === '@wbx_source') p.source = args.at(-1)!;
    }
    if (args[0] === 'split-window') {
      this.panes.set('%4', { window: '@1', pid: '104', marker: '', source: '' });
      this.splitEntered.resolve();
      await this.split?.promise;
      return '%4 104';
    }
    if (args[0] === 'if-shell') {
      assert.deepEqual(args.slice(0, 3), ['if-shell', '-F', '-t'], 'server-format guard, never a shell subprocess');
      this.entered.resolve();
      await this.gate?.promise;
      if (target === this.fail) throw new Error('Synthetic tmux cleanup failure');
      const p = this.panes.get(target);
      const expected = p && `#{==:#{window_id}|#{pane_pid}|#{@wbx_owner}|#{@wbx_source},${p.window}|${p.pid}|${p.marker}|${p.source}}`;
      if (args[4] === expected) {
        assert.equal(args[5], `kill-pane -t ${target}`, 'kill only the proven exact pane');
        this.panes.delete(target);
      }
    }
    assert.ok(!['kill-session', 'kill-server', 'send-keys'].includes(args[0]!), 'no broad cleanup or owner control tunnel');
    assert.ok(args[0] !== 'kill-pane', 'no unconditional check-then-kill mutation');
    return '';
  }
}
function fixture(tmux = new CleanupTmux()) {
  const panes = new CallPanes({ context: { name: 'wbx-cleanup', identity: 'b'.repeat(64), marker },
    socket: '/unused', configPath: '/unused', config: defaults(), pixelTransport: 'inline', tmux,
    control: () => assert.fail('cleanup must not send another leave/control') });
  Object.assign(panes, { owner: '%1', window: '@1', views: new Map(
    [...tmux.panes].filter(([id]) => id !== '%99').map(([pane, p]) =>
      [pane, { pane, pid: p.pid, source: p.source, owner: pane === '%1' }])) });
  return { panes, tmux };
}
test('owner close retires only its recorded auxiliary panes and is idempotent with foreign neighbours retained', async () => {
  const { panes, tmux } = fixture();
  await panes.close();
  assert.deepEqual([...tmux.panes.keys()], ['%1', '%99']);
  assert.deepEqual(tmux.calls.filter(a => a[0] === 'if-shell').map(a => a[3]).sort(), ['%2', '%3']);
  const commands = tmux.calls.length;
  await panes.close();
  assert.equal(tmux.calls.length, commands, 'one physical cleanup, not repeated destructive attempts');
});
for (const change of ['pid', 'marker', 'source', 'window', 'missing'] as const) {
  test(`cleanup's server-side proof retains a ${change}-changed/replaced pane`, async () => {
    const { panes, tmux } = fixture(); tmux.gate = deferred();
    const closing = panes.close();
    // A replacement happens after asynchronous dispatch, before the server evaluates ownership.
    await Promise.race([tmux.entered.promise, closing.then(() => assert.fail('No server-side cleanup was dispatched'))]);
    if (change === 'missing') tmux.panes.delete('%2');
    else tmux.panes.get('%2')![change] = change === 'pid' ? '222' : 'replacement';
    tmux.gate.resolve(); await closing;
    assert.equal(tmux.panes.has('%3'), false, 'independent proven child still closes');
    assert.equal(tmux.panes.has('%2'), change !== 'missing', 'changed identity is not cleanup authority');
    assert.equal(tmux.panes.has('%1'), true);
    assert.equal(tmux.panes.has('%99'), true);
  });
}
test('one failing child cleanup cannot skip other exact children or ended-state publication', async () => {
  const { panes, tmux } = fixture(); tmux.fail = '%2';
  await panes.close();
  assert.equal(tmux.panes.has('%2'), true);
  assert.equal(tmux.panes.has('%3'), false);
  assert.ok(tmux.calls.some(a => a[0] === 'set-option' && a.at(-2) === '@wbx_state' && a.at(-1) === 'ended'));
});
test('a split completing after the bounded queue drain cleans its own newly tagged child without late geometry', { timeout: 3000 }, async () => {
  const tmux = new CleanupTmux(); tmux.panes.delete('%2'); tmux.panes.delete('%3'); tmux.panes.delete('%99');
  tmux.split = deferred();
  const { panes } = fixture(tmux);
  const syncing = panes.sync([{ id: 'video', kind: 'video', label: 'Owner', available: true },
    { id: 'share', kind: 'share', label: 'Share', available: true }]);
  await tmux.splitEntered.promise;
  await panes.close();
  const checkpoint = tmux.calls.length;
  tmux.split.resolve(); await syncing;
  assert.deepEqual([...tmux.panes.keys()], ['%1'], 'late physical creation is not lost by logical close');
  assert.ok(!tmux.calls.slice(checkpoint).some(a => ['select-layout', 'resize-pane', 'swap-pane', 'split-window'].includes(a[0]!)));
});
