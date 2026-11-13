import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebexSession, type Factory, type SDK, type Meeting, type MediaSink } from '../src/browser/webex.js';
import type { LocalStream } from '../src/browser/outgoing.js';
import type { AccessCredentials } from '../src/auth-protocol.js';

function fixture(renew?: () => Promise<AccessCredentials>) {
  const states: string[] = [], media: unknown[] = [], auth: unknown[] = [];
  let registrations = 0, unregisters = 0, leaves = 0, joins = 0;
  let mediaOptions: any;
  let initOptions: any;
  const meeting = Object.assign(new EventEmitter(), {
    async join() { joins++; }, async addMedia(options: unknown) { mediaOptions = options; }, async leave() { leaves++; },
  });
  const sdk = Object.assign(new EventEmitter(), { ready: true, meetings: Object.assign(new EventEmitter(), {
    async register() { registrations++; }, async unregister() { unregisters++; }, async create() { return meeting; },
  }) });
  const sink: MediaSink = { status: value => states.push(value), video: value => media.push(value),
    share: value => media.push(value), audio: value => media.push(value), auth: value => auth.push(value) };
  const factory: Factory = { init: options => { initOptions = options; return sdk as SDK; } };
  const session = new WebexSession(factory, sink, renew);
  return { session, sdk, meeting, states, media, auth, get registrations() { return registrations; }, get unregisters() { return unregisters; },
    get leaves() { return leaves; }, get joins() { return joins; }, get mediaOptions() { return mediaOptions; },
    get initOptions() { return initOptions; } };
}
test('live adapter joins once with sending off and never implicitly requests local streams', async () => {
  const f = fixture();
  await f.session.start('test-token', 'https://example.webex.com/meet/test');
  assert.equal(f.registrations, 1); assert.equal(f.joins, 1);
  assert.equal(f.initOptions.config.meetings.autoUploadLogs, false);
  assert.equal(f.initOptions.config.logger.bufferLogLevel, 'silent');
  assert.deepEqual(f.mediaOptions.localStreams, {});
  assert.equal(f.mediaOptions.shareAudioEnabled, true);
  assert.equal(f.mediaOptions.remoteMediaManagerConfig.audio.numOfScreenShareStreams, 1);
  assert.deepEqual(f.mediaOptions.additionalMediaOptions, { sendAudio: false, sendVideo: false, receiveAudio: true, receiveVideo: true });
  assert.deepEqual(f.states, ['registering', 'joining', 'negotiating', 'connected']);
  f.meeting.emit('meeting:self:lobbyWaiting'); assert.equal(f.states.at(-1), 'lobby');
  await assert.rejects(f.session.start('again', 'https://example.webex.com'));
  await f.session.stop(); await f.session.stop();
  assert.equal(f.leaves, 1); assert.equal(f.unregisters, 1);
  assert.equal(f.meeting.listenerCount('media:remoteVideo:layoutChanged'), 0);
});
test('OAuth acknowledgment requires actual SDK token adoption; public refresh keeps one join and failed adoption closes the call', async () => {
  let grants = 0, installed = 'initial', drop = false;
  const f = fixture(async () => ({ token: `renewed-${++grants}`, expiresAt: Date.now() + 3600_000, scope: 'spark:all' }));
  const credentials = Object.assign(new EventEmitter(), {
    async getUserToken() { return { toString: () => `Bearer ${installed}` }; },
    async refresh() {
      const next = await f.initOptions.config.credentials.refreshCallback();
      if (!drop) installed = next.access_token;
      credentials.emit('change:supertoken');
    },
  });
  Object.assign(f.sdk, { credentials });
  await f.session.start('initial', 'https://example.webex.com/meet/test', { clientId: 'public-client', scope: 'spark:all', expiresAt: Date.now() + 366 * 86400_000 });
  assert.ok(f.initOptions.credentials.expires <= Date.now() + 2_000_000_000, 'SDK timer cannot overflow on unusually long grants');
  assert.equal(f.initOptions.credentials.refresh_token, 'owner-managed');
  assert.equal(f.initOptions.config.credentials.client_id, 'public-client');
  await f.session.renewCredentials(); assert.equal(installed, 'renewed-1'); assert.equal(f.joins, 1);
  assert.ok(!f.states.includes('ended')); assert.equal((f.auth.at(-1) as { state: string }).state, 'ready');
  drop = true; await f.session.renewCredentials();
  assert.ok(f.states.includes('ended')); assert.equal((f.auth.at(-1) as { state: string }).state, 'failed');
  await f.session.stop(); assert.equal(f.leaves, 1); assert.equal(f.joins, 1);
});
test('received screen-share audio joins main audio, stops with the share, and never acquires local media', async () => {
  const f = fixture(); await f.session.start('test', 'https://example.webex.com');
  const main = {} as MediaStream, shared = {} as MediaStream;
  f.meeting.emit('media:remoteAudio:created', { getRemoteMedia: () => [{ stream: main }] });
  assert.deepEqual(f.media.at(-1), [main]);
  f.meeting.emit('media:remoteScreenShareAudio:created', { getRemoteMedia: () => [{ stream: shared }] });
  assert.deepEqual(f.media.at(-1), [main, shared]);
  f.meeting.emit('meeting:stoppedSharingRemote'); assert.deepEqual(f.media.at(-1), [main]);
  await f.session.stop(); assert.equal(f.meeting.listenerCount('media:remoteScreenShareAudio:created'), 0);
});
test('multistream source changes and replacement layouts do not leak listeners', async () => {
  const f = fixture(); await f.session.start('test', 'https://example.webex.com');
  const stream = {} as MediaStream;
  const remote = Object.assign(new EventEmitter(), { sourceState: 'live', stream });
  const layout = { activeSpeakerVideoPanes: { main: { getRemoteMedia: () => [remote] } } };
  f.meeting.emit('media:remoteVideo:layoutChanged', layout);
  assert.ok(f.media.includes(stream)); assert.equal(remote.listenerCount('sourceUpdate'), 1);
  f.meeting.emit('media:remoteVideo:layoutChanged', layout);
  assert.equal(remote.listenerCount('sourceUpdate'), 1);
  remote.sourceState = 'no source'; remote.emit('sourceUpdate'); assert.equal(f.media.at(-2), null);
  await f.session.stop(); assert.equal(remote.listenerCount('sourceUpdate'), 0);
});
test('cancel during SDK registration suppresses later work and unregisters on late completion', async () => {
  const f = fixture(); let complete!: () => void;
  f.sdk.meetings.register = () => new Promise<void>(resolve => { complete = resolve; });
  const start = f.session.start('test', 'https://example.webex.com');
  await Promise.resolve();
  await f.session.stop(); await assert.rejects(start, /canceled/);
  complete(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.joins, 0); assert.ok(f.unregisters >= 1);
});
test('cancel during native join leaves again if the join completes late', async () => {
  const f = fixture(); let complete!: () => void;
  f.meeting.join = () => new Promise<void>(resolve => { complete = resolve; });
  const start = f.session.start('test', 'https://example.webex.com');
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  await f.session.stop(); await assert.rejects(start, /canceled/);
  complete(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.leaves, 2); assert.equal(f.mediaOptions, undefined);
});
test('SDK rejection reaches the caller without claiming a connected meeting', async () => {
  const f = fixture(); f.meeting.addMedia = async () => { throw new Error('fake negotiation failure'); };
  await assert.rejects(f.session.start('test', 'https://example.webex.com'), /negotiation/);
  assert.ok(!f.states.includes('connected')); await f.session.stop();
});
test('cancel during media negotiation cleans up a late native success', async () => {
  const f = fixture(); let complete!: () => void;
  f.meeting.addMedia = () => new Promise<void>(resolve => { complete = resolve; });
  const start = f.session.start('test', 'https://example.webex.com');
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  await f.session.stop(); await assert.rejects(start, /canceled/);
  complete(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.leaves, 2); assert.ok(!f.states.includes('connected'));
});
test('explicit local media uses pinned SDK helper/publish APIs without rejoining or publishing preview', async () => {
  const f = fixture(), acquired: string[] = [], updates: unknown[] = [], published: unknown[] = [], unpublished: unknown[] = [];
  const track = { readyState: 'live', enabled: true, stop() { this.readyState = 'ended'; } };
  const value: LocalStream = { outputStream: { getTracks: () => [track] } as unknown as MediaStream, stop() { track.stop(); } };
  Object.assign(f.sdk.meetings, { mediaHelpers: {
    async createMicrophoneStream() { acquired.push('mic'); return value; },
    async createCameraStream() { acquired.push('camera'); return value; },
    async createDisplayStream() { acquired.push('screen-video-only'); return value; },
  } });
  Object.assign(f.meeting, { async updateMedia(options: unknown) { updates.push(options); },
    async publishStreams(options: unknown) { published.push(options); }, async unpublishStreams(streams: unknown) { unpublished.push(streams); } });
  await assert.rejects(f.session.acquireLocal('microphone'));
  await f.session.start('fake', 'https://example.webex.com/meet/test'); assert.deepEqual(acquired, []);
  await f.session.acquireLocal('microphone'); await f.session.publishLocal('microphone', value);
  await f.session.acquireLocal('camera'); await f.session.publishLocal('camera', value);
  await f.session.acquireLocal('screen'); await f.session.publishLocal('screen', value);
  assert.deepEqual(acquired, ['mic', 'camera', 'screen-video-only']);
  assert.deepEqual(updates, [{ audioEnabled: true }, { videoEnabled: true }]);
  assert.deepEqual(published, [{ microphone: value }, { camera: value }, { screenShare: { video: value } }]);
  await f.session.unpublishLocal(value); assert.deepEqual(unpublished, [[value]]); assert.equal(f.joins, 1);
  track.stop(); await f.session.publishLocal('camera', value); assert.equal(published.length, 3);
  await f.session.stop(); await assert.rejects(f.session.acquireLocal('camera'));
});
