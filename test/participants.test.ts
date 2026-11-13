import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ParticipantViews, type Member, type ParticipantMedia, type RemoteVideo } from '../src/browser/participants.js';

class Remote extends EventEmitter implements RemoteVideo {
  stream = {} as MediaStream; sourceState = 'live'; csi = 999; memberId = 'wrong-person'; hints = 0;
  setSizeHint() { this.hints++; }
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test('receiver-selected participant views preserve identity, muted people, primary promotion and source safety', async () => {
  let roster: Record<string, Member> = { a: { id: 'a', name: 'Alex', isInMeeting: true }, b: { id: 'b', name: 'Sam', isInMeeting: true } };
  const members = Object.assign(new EventEmitter(), { membersCollection: { getAll: () => roster }, getCsisForMember: (id: string) => [id === 'a' ? 101 : 202] });
  const slots = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`person-${i + 1}`, new Remote()]));
  const emitted: ParticipantMedia[][] = [], requests: unknown[] = []; let layout = 'Single', views!: ParticipantViews;
  const manager = { getLayoutId: () => layout, async setLayout(id: string) { layout = id; views.layout(id === 'People' ? slots : {}); },
    setRemoteVideoCsis: (value: unknown) => requests.push(value) };
  views = new ParticipantViews(members, () => manager, value => emitted.push(value), value => value, () => assert.fail('unexpected fallback'));
  views.start(); await tick();
  assert.equal(layout, 'People'); assert.equal(emitted.at(-1)!.length, 2);
  assert.ok(emitted.at(-1)!.every(peer => peer.stream === null), 'a stale receive slot must never be labeled as a new person');
  const a = slots['person-1']!, b = slots['person-2']!;
  a.csi = 101; a.memberId = 'a'; a.emit('sourceUpdate'); b.csi = 202; b.memberId = 'b'; b.emit('sourceUpdate');
  assert.equal(emitted.at(-1)![0]!.stream, a.stream); assert.equal(emitted.at(-1)![1]!.source, 'remote-2');
  roster.b!.isVideoMuted = true; views.update(roster); await tick();
  assert.equal(emitted.at(-1)!.length, 2); assert.equal(emitted.at(-1)![1]!.stream, null);
  const before = requests.length; views.update(roster); await tick(); assert.equal(requests.length, before, 'unchanged CSIs do not spam media requests');
  roster = { b: { ...roster.b!, isVideoMuted: false } }; views.update(roster); await tick();
  assert.equal(emitted.at(-1)![0]!.source, 'video'); assert.equal(emitted.at(-1)![0]!.label, 'Sam');
  assert.equal(emitted.at(-1)![0]!.stream, null, 'promotion cannot show the previous primary person');
  a.csi = 202; a.memberId = 'b'; a.emit('sourceUpdate'); assert.equal(emitted.at(-1)![0]!.stream, a.stream);
  views.sizeHint('video', 640, 360); views.sizeHint('video', 640, 360); assert.equal(a.hints, 1);
  views.update({}); await tick(); assert.equal(layout, 'Single'); assert.deepEqual(emitted.at(-1), []);
  views.close(); assert.equal(a.listenerCount('sourceUpdate'), 0);
});
test('participant receiver failures degrade to active speaker instead of killing or rejoining the call', async () => {
  const members = Object.assign(new EventEmitter(), { membersCollection: { getAll: () => ({ a: { id: 'a', isInMeeting: true } }) }, getCsisForMember: () => [1] });
  let fallback = 0, layout = 'Single';
  const manager = { getLayoutId: () => layout, async setLayout(id: string) { if (id === 'People') throw new Error('fake policy refusal'); layout = id; }, setRemoteVideoCsis() {} };
  const views = new ParticipantViews(members, () => manager, () => {}, promise => promise, () => { fallback++; });
  views.start(); await tick(); assert.equal(fallback, 1); assert.equal(views.enabled, false); assert.equal(layout, 'Single'); views.close();
});
test('roster changes invalidate immediately during pending layout negotiation and stable people retain their source IDs', async () => {
  let release!: () => void;
  const pending = new Promise<void>(yes => { release = yes; });
  const person = (id: string): Member => ({ id, name: id, isInMeeting: true });
  const members = Object.assign(new EventEmitter(), { getCsisForMember: (id: string) => [id.charCodeAt(0)] });
  const emitted: ParticipantMedia[][] = []; let layout = 'Single', fallback = 0, requests = 0;
  const manager = { getLayoutId: () => layout, async setLayout(id: string) { await pending; layout = id; }, setRemoteVideoCsis() { requests++; } };
  const views = new ParticipantViews(members, () => manager, value => emitted.push(value), promise => promise, () => { fallback++; });
  views.update([person('a'), person('b'), person('c')]); views.start();
  assert.equal(emitted.at(-1)!.find(peer => peer.member === 'b')!.source, 'remote-2');
  views.update([person('a'), person('d'), person('b'), person('c')]);
  assert.equal(emitted.at(-1)!.find(peer => peer.member === 'b')!.source, 'remote-2', 'newcomer cannot steal a retained source');
  assert.equal(emitted.at(-1)!.find(peer => peer.member === 'd')!.source, 'remote-4');
  views.update([]); assert.deepEqual(emitted.at(-1), [], 'departed identities disappear before SDK layout settlement');
  release(); await tick(); assert.equal(layout, 'Single'); assert.equal(fallback, 0); assert.equal(requests, 0);
  views.update([person('b')]); await tick();
  const remote = new Remote(); remote.memberId = 'b'; remote.csi = 'b'.charCodeAt(0);
  views.layout({ 'person-1': remote }); await tick(); assert.equal(requests, 1, 'late/replacement layout slots are pinned without waiting for another roster event');
  assert.equal(emitted.at(-1)![0]!.stream, remote.stream);
  views.close(); views.layout({ 'person-1': remote }); assert.equal(remote.listenerCount('sourceUpdate'), 0);
});
