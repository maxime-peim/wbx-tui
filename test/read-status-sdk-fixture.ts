// Real pinned SDK methods, fake conversation boundary; ALL network is forbidden.
import assert from 'node:assert/strict';
import net from 'node:net';
import { createReadStatusSDK } from '../src/read-status-sdk.js';
import { parseRoomReadStatus } from '../src/read-status-protocol.js';
import { readMessageReaders } from '../src/readers-sdk.js';
let network = 0;
(net.Socket.prototype as any).connect = () => { network++; throw new Error('Network forbidden in SDK contract fixture.'); };
const sdk = createReadStatusSDK({ token: 'synthetic-never-live', expiresAt: Date.now() + 3600000, scope: 'spark:all spark:kms' }) as any;
const room = { id: 'room-uuid', url: 'https://conv-a.wbx2.com/conversation/api/v1/conversations/room-uuid', tags: [] as string[], displayName: 'Server unread',
  lastReadableActivityDate: '2026-11-09T12:00:00.000Z', lastSeenActivityDate: '2026-11-09T11:00:00.000Z' };
const direct = { ...room, id: 'direct-uuid', tags: ['ONE_ON_ONE'], displayName: '', computedTitle: 'Alex Example',
  url: 'https://conv-a.wbx2.com/conversation/api/v1/conversations/direct-uuid', privateParticipantData: 'PRIVATE_NEVER_FORWARD' };
const explicit = { ...direct, id: 'explicit-uuid', displayName: 'Explicit DM name', computedTitle: 'Do not override',
  url: 'https://conv-a.wbx2.com/conversation/api/v1/conversations/explicit-uuid' };
const notes = { ...room, id: 'notes-uuid', displayName: '', computedTitle: 'Personal notes',
  url: 'https://conv-a.wbx2.com/conversation/api/v1/conversations/notes-uuid' };
const unnamed = { ...direct, id: 'unnamed-uuid', computedTitle: '',
  url: 'https://conv-a.wbx2.com/conversation/api/v1/conversations/unnamed-uuid' };
const conversations = [room, direct, explicit, notes, unnamed];
sdk.internal.services.waitForCatalog = async () => {};
sdk.internal.services.getClusterId = () => 'urn:TEAM:us-east-1';
// Stub below the adapter, exercising the actual SDK list/get projection plus
// our computed-title preservation, without calling any service.
sdk.internal.conversation._list = async () => conversations;
sdk.internal.conversation.getUrlFromClusterId = ({ id }: { id: string }) => conversations.find(value => value.id === id)!.url;
sdk.internal.conversation.request = async ({ uri }: { uri: string }) => ({ body: conversations.find(value => value.url === uri)! });
const receipts: unknown[] = [];
sdk.internal.conversation.acknowledge = async (conversation: unknown, activity: unknown) => {
  receipts.push({ conversation, activity }); room.lastSeenActivityDate = room.lastReadableActivityDate;
  return { object: { id: 'message-uuid' }, actor: { entryUUID: 'person-uuid', orgId: 'org-uuid' }, target: { id: 'room-uuid', tags: [] }, published: room.lastSeenActivityDate };
};
const page = await sdk.rooms.listWithReadStatus();
const statuses = page.items.map(parseRoomReadStatus);
const status = statuses.find((value: any) => value?.title === 'Server unread')!;
assert.ok(status); assert.ok(status.lastActivity > status.lastSeen);
const named = statuses.find((value: any) => value?.title === 'Alex Example')!;
assert.equal(named.title, 'Alex Example', 'the SDK-only direct space retains its server-computed peer name');
assert.equal(statuses.find((value: any) => value?.title === 'Explicit DM name')!.type, 'direct', 'explicit display names beat computed names');
assert.ok(statuses.some((value: any) => value?.title === 'Personal notes'), 'computed titles are preserved for self/personal spaces too');
assert.ok(statuses.some((value: any) => value?.type === 'direct' && value.title === ''), 'genuinely unavailable names are not invented');
assert.equal(direct.displayName, '', 'title preservation never mutates cached conversation data');
assert.equal(parseRoomReadStatus(await sdk.rooms.getWithReadStatus(named.id))!.title, 'Alex Example', 'per-room event reconciliation also keeps the computed name');
assert.ok(!JSON.stringify(named).includes('PRIVATE_NEVER_FORWARD'), 'only allowlisted read-status metadata crosses IPC');
const single = parseRoomReadStatus(await sdk.rooms.getWithReadStatus(status.id))!;
assert.deepEqual(single, status);
room.tags=['MESSAGE_NOTIFICATIONS_OFF'];
assert.equal(parseRoomReadStatus(await sdk.rooms.getWithReadStatus(status.id))!.notifications,false,'per-user room mute survives the pinned lossy projection');
room.tags=[];
assert.equal(parseRoomReadStatus(await sdk.rooms.getWithReadStatus(status.id))!.notifications,true,'a genuine unmute observation can enable future notifications');
assert.equal(receipts.length, 0, 'reading status does not send a read receipt');
await sdk.memberships.updateLastSeen({ roomId: status.id, id: Buffer.from('ciscospark://us/MESSAGE/message-uuid').toString('base64') });
const read = parseRoomReadStatus(await sdk.rooms.getWithReadStatus(status.id))!;
assert.equal(read.lastSeen, read.lastActivity); assert.equal(receipts.length, 1);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hydra = (kind: string, n: number, cluster = 'us') => Buffer.from(`ciscospark://${cluster}/${kind}/${uuid(n)}`).toString('base64');
let readerTarget = { roomId: hydra('ROOM',1), messageId: hydra('MESSAGE',2) };
sdk.internal.me = { id: hydra('PEOPLE',3) };
sdk.messages.request = async () => ({ body: { id: readerTarget.messageId, roomId: readerTarget.roomId,
  personId: hydra('PEOPLE',3), created: room.lastReadableActivityDate } });
let membershipReads = 0, readerTags: string[] = [];
sdk.internal.conversation.get = async (target: any, options: any) => {
  membershipReads++;
  assert.equal(target.id,uuid(1)); assert.equal(options.participantAckFilter,'all'); assert.equal(options.activitiesLimit,0);
  return { id: uuid(1), tags: readerTags, participants: { items: (readerTags.length ? [3,4] : [3,4,5]).map(n => ({
    entryUUID: uuid(n), orgId: uuid(9), displayName: `Reader ${n}`, entryEmail: 'PRIVATE_EMAIL',
    roomProperties: n === 5 ? {} : { lastSeenActivityUUID: uuid(2), lastSeenActivityDate: room.lastReadableActivityDate },
  })) } };
};
const readers = await readMessageReaders(sdk,readerTarget);
assert.deepEqual(readers.readers,[{personId:hydra('PEOPLE',4).replace(/=+$/,''),name:'Reader 4'}]);
assert.equal(readers.partial,true); assert.equal(membershipReads,1);
readerTags = ['ONE_ON_ONE'];
assert.deepEqual((await readMessageReaders(sdk,readerTarget)).readers,readers.readers,'actual SDK exposes the peer watermark in a person discussion too');
assert.equal(membershipReads,2,'direct inspection uses one membership projection, not a separate provider or scan');
for (const cluster of ['eu-central-1','us-west-2']) {
  readerTarget = {roomId:hydra('ROOM',1,cluster),messageId:hydra('MESSAGE',2,cluster)};
  const regional = await readMessageReaders(sdk,readerTarget);
  assert.deepEqual(regional.readers,readers.readers,'actual SDK padding normalization must not reject a regional membership');
  assert.equal(regional.roomId,readerTarget.roomId,'the response retains the exact requested room ID');
  assert.equal(regional.messageId,readerTarget.messageId,'the response retains the exact requested message ID');
}
assert.equal(membershipReads,4,'regional reads still use one membership projection apiece');
assert.equal(receipts.length,1,'member read-through inspection did not submit another receipt');
assert.ok(!JSON.stringify(readers).includes('PRIVATE_EMAIL'));
assert.equal(sdk.meetings, undefined, 'the metadata worker has no meeting plugin');
assert.equal(network, 0, 'SDK bootstrap and contract calls never contacted any service');
console.log('PASS: actual SDK list/get read-status and explicit receipt, no meeting plugin, no network');
process.exit(0);
