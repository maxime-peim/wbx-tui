import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { EditorEngine } from '../src/editor-engine.js';
import { ReadStatusWorker } from '../src/read-status.js';
import type { JoinedMeetingsSnapshot } from '../src/joined-meetings.js';

test('production worker -> private IPC -> engine discovers and removes another-device call without schedule scope or call actions', { timeout: 20_000 }, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-joined-pipeline-'), worker = join(directory, 'worker.mjs'), audit = join(directory, 'audit.json');
  const fake = `
    import {EventEmitter} from 'node:events';
    import {writeFileSync} from 'node:fs';
    import net from 'node:net';
    import assert from 'node:assert/strict';
    globalThis.fetch = () => { throw new Error('Network forbidden'); };
    net.Socket.prototype.connect = () => { throw new Error('Sockets forbidden'); };
    export function createReadStatusSDK() {
      let registrations = 0, receipts = 0, lookups = 0;
      const requests = [];
      const events = () => Object.assign(new EventEmitter(), {listen:async()=>{},stopListening(){}});
      const mercury = Object.assign(new EventEmitter(), {disconnect:async()=>{}});
      const sdk = Object.assign(new EventEmitter(), {ready:true,
        rooms:Object.assign(events(),{listWithReadStatus:async()=>({items:[]})}),
        memberships:Object.assign(events(),{updateLastSeen:async()=>{receipts++;throw new Error('Receipt forbidden')}}),
        messages:events(),
        internal:{mercury,device:{url:'https://wdm.offline.invalid/devices/metadata',
          register:async()=>{registrations++},
          unregister:async()=>writeFileSync(${JSON.stringify(audit)},JSON.stringify({registrations,receipts,lookups,requests}))},
          conversation:{request:async options=>{
            requests.push(options);lookups++;
            assert.equal(options.method,'GET');assert.equal(options.api,'locus');assert.equal(options.resource,'loci');
            if(lookups > 1)return {statusCode:200,body:{loci:[]}};
            setTimeout(()=>mercury.emit('event:locus',{data:{PRIVATE:'never projected'}}),80);
            return {statusCode:200,body:{loci:[{url:'https://locus.offline.invalid/locus/api/v1/loci/ad-hoc',
              fullState:{state:'ACTIVE'},info:{topic:'Synthetic desktop ad-hoc call',password:'PRIVATE'},
              self:{state:'JOINED',devices:[{url:'https://wdm.offline.invalid/devices/desktop',state:'JOINED'}]}}]}};
          }}
        }});
      Object.defineProperty(sdk,'meetings',{get(){throw new Error('Meetings plugin forbidden')}});
      return sdk;
    }`;
  await build({ entryPoints: ['src/read-status-worker.ts'], outfile: worker, bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'offline-sdk', setup(build) { build.onLoad({ filter: /\/read-status-sdk\.ts$/ }, () => ({ contents: fake, loader: 'js' })); } }] });
  const source = new ReadStatusWorker(worker, 2000), engine = new EditorEngine(undefined, () => source);
  const states: JoinedMeetingsSnapshot[] = [];
  engine.on('state', state => states.push(structuredClone(state.joinedMeetings)));
  const child = () => (source as unknown as { child?: ChildProcess }).child;
  const stop = async () => {
    const process = child(), exit = process && process.exitCode === null && process.signalCode === null ? once(process, 'exit') : undefined;
    engine.stop(); await exit;
  };
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  await engine.start('demo', undefined, true, false, true);
  await engine.select('demo-general');
  const internal = engine as unknown as { generation: number; startReadStatus(access: unknown, generation: number): Promise<void> };
  await internal.startReadStatus({ token: 'synthetic', scope: 'spark:all spark:kms', expiresAt: Date.now() + 3600_000 }, internal.generation);
  const removed = () => {
    const index = states.findIndex(value => value.state === 'ready' && value.items.length === 1);
    return index >= 0 && states.slice(index + 1).some(value => value.state === 'ready' && !value.items.length);
  };
  if (!removed()) await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { engine.off('state', changed); reject(new Error('Cross-device pipeline deadline: ' + JSON.stringify(states))); }, 15_000);
    const changed = () => { if (removed()) { clearTimeout(timer); engine.off('state', changed); resolve(); } };
    engine.on('state', changed);
  });
  assert.equal(states.find(value => value.items.length)!.items[0]!.title, 'Synthetic desktop ad-hoc call');
  assert.ok(!JSON.stringify(states).includes('PRIVATE')); assert.ok(!JSON.stringify(states).includes('https:'));
  assert.equal(engine.snapshot().room!.id, 'demo-general');
  assert.equal(engine.snapshot().upcomingMeetings.state, 'off', 'no meeting schedule grant or schedule query was needed');
  assert.equal(engine.snapshot().readStatus, 'ready');
  await stop();
  const report = JSON.parse(await readFile(audit, 'utf8'));
  assert.equal(report.registrations, 1, 'only the existing metadata device is registered');
  assert.equal(report.receipts, 0); assert.equal(report.lookups, 2);
  assert.equal(engine.snapshot().joinedMeetings.state, 'off');
});

test('private IPC admits only requested, normalized joined-meeting observations', () => {
  for (const mode of ['unsolicited', 'extra', 'valid']) {
    const source = new ReadStatusWorker(), failures: unknown[] = [], received: JoinedMeetingsSnapshot[] = [];
    const internal = source as unknown as { ready: boolean; joinedMeetingsEnabled: boolean; receive(value: unknown): void };
    internal.ready = true; internal.joinedMeetingsEnabled = mode !== 'unsolicited';
    source.onFailure = value => failures.push(value);
    source.onJoinedMeetings = value => received.push(value);
    internal.receive({ type: 'joined-meetings', snapshot: { state: 'ready', partial: true, observedAt: Date.now(),
      items: [{ id: 'a'.repeat(64), title: 'Observed', ...(mode === 'extra' ? { url: 'PRIVATE' } : {}) }] } });
    assert.equal(received.length, mode === 'valid' ? 1 : 0);
    assert.deepEqual(failures, mode === 'valid' ? [] : ['invalid-data']);
    source.close();
  }
});
