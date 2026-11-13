import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ViewerBroker, ViewerHost } from '../src/viewer.js';
import { EditorMeetings } from '../src/editor-meetings.js';
import type { WorkerEvent } from '../src/protocol.js';

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) { assert.ok(Date.now() < deadline, 'synthetic transport condition timed out'); await delay(10); }
}

test('socket loss is a replayable local disconnect, never a fabricated meeting-ended event', async () => {
  let capturing = false;
  const broker = await ViewerBroker.open(async () => { capturing = true; return new Promise(() => {}); });
  const viewer = await ViewerHost.open(broker.path), events: WorkerEvent[] = [];
  let disconnected = 0;
  viewer.on('event', event => events.push(event));
  viewer.on('disconnect', () => disconnected++);
  try {
    const pending = assert.rejects(viewer.capture({ source: 'video', width: 1, height: 1, format: 'rgba' }), /disconnected/);
    await until(() => capturing);
    await broker.close(); await pending;
    assert.equal(disconnected, 1);
    assert.equal(viewer.disconnected, true);
    assert.equal(events.length, 0, 'the owner process is still alive; transport is not media evidence');
    viewer.send({ type: 'start', mode: 'demo' });
    assert.equal(disconnected, 2, 'a consumer attaching after loss also observes unavailable control state');
    assert.throws(() => viewer.action('quit', '%42'), /unavailable/);
    assert.equal(process.kill(process.pid, 0), true);
  } finally { await viewer.close(); await broker.close(); }
});

test('verified remote status is retained, and intentional viewer detach emits no transport failure', async () => {
  const broker = await ViewerBroker.open(async () => null), viewer = await ViewerHost.open(broker.path);
  const events: WorkerEvent[] = []; let disconnected = 0;
  viewer.on('event', event => events.push(event)); viewer.on('disconnect', () => disconnected++);
  try {
    broker.publish({ type: 'status', state: 'ended' });
    await until(() => events.length > 0);
    assert.deepEqual(events, [{ type: 'status', state: 'ended' }]);
    await viewer.close(); await broker.close(); await delay(10);
    assert.equal(disconnected, 0);
  } finally { await viewer.close(); await broker.close(); }
});

for (const termination of ['detach', 'owner-exit', 'leave'] as const) {
  test(`native meeting ${termination}: control loss and process termination remain distinct`, async t => {
    // A synthetic child is the ONLY media-owner stand-in. No tmux/browser/SDK.
    const owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const exit = once(owner, 'exit');
    const broker = await ViewerBroker.open(async () => null), meetings = new EditorMeetings();
    const events: WorkerEvent[] = [], notices: string[] = [], actions: string[] = [];
    meetings.on('event', event => events.push(event)); meetings.on('notice', notice => notices.push(notice));
    // Test only the existing connection seam, with deterministic public tmux metadata.
    const internal = meetings as unknown as { active: boolean; session: string; identity: string; ownerPid: number;
      tmux: { run(...args: string[]): Promise<string> }; connect(generation: number): Promise<void> };
    Object.assign(internal, { active: true, session: 'synthetic-call', identity: 'synthetic-identity', ownerPid: owner.pid! });
    t.mock.method(internal.tmux, 'run', async (...args: string[]) => {
      const values: Record<string, string> = { '@wbx_call': 'synthetic-identity', '@wbx_broker': broker.path,
        '@wbx_media_pane': '%42', '@wbx_media_pid': String(owner.pid) };
      return values[args.at(-1)!] ?? '';
    });
    broker.onAction = async action => { actions.push(action); if (action === 'quit') owner.kill('SIGTERM'); };
    try {
      await internal.connect(0);
      assert.equal(meetings.snapshot().ready, true);
      await until(() => actions.includes('renderer.blocks'));
      actions.length = 0;
      if (termination === 'leave') {
        await meetings.leave();
        assert.deepEqual(actions, ['quit']);
        assert.equal(meetings.snapshot().active, false);
        assert.ok(events.some(event => event.type === 'status' && event.state === 'ended'));
      } else {
        await broker.close();
        await until(() => !meetings.snapshot().ready);
        assert.equal(meetings.snapshot().active, true, 'lost controls cannot acknowledge media termination');
        assert.equal(events.length, 0);
        assert.ok(notices.some(notice => /media state is unknown/.test(notice)), 'unavailable control is reported immediately, not as ended');
        await assert.rejects(meetings.action('microphone.toggle'), /initializing|unavailable|disconnected/);
        assert.deepEqual(actions, [], 'no implicit leave, toggle or reconnect');
        if (termination === 'owner-exit') {
          owner.kill('SIGTERM'); await exit;
          await until(() => !meetings.snapshot().active);
          assert.ok(events.some(event => event.type === 'status' && event.state === 'ended'));
        } else {
          await meetings.close();
          assert.equal(owner.exitCode, null, 'editor detach leaves the independent owner alive');
          assert.equal(owner.signalCode, null);
        }
      }
    } finally { await meetings.close(); owner.kill('SIGTERM'); await exit; await broker.close(); }
  });
}
