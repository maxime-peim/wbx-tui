// Prepended ONLY to a private bundle of the actual editor-main entry.
import { OAuthSession } from '../../src/oauth.ts';
import { EditorLines } from '../../src/editor-protocol.ts';
import { trace, phase, forbidden, forbidNetwork } from './sdk-native-control.mjs';

forbidNetwork();
const credentials = () => ({ token: 'C4-PRIVATE-TOKEN', scope: 'spark:all', expiresAt: Date.now() + 3600_000 });
OAuthSession.prototype.authorize = async () => { trace('auth', { operation: 'authorize' }); return credentials(); };
OAuthSession.prototype.refresh = async () => { trace('auth', { operation: 'refresh' }); return credentials(); };
OAuthSession.prototype.watch = () => {};
const rooms = ['room-a', 'room-b', 'room-u'].map((id, index) => ({
  id, type: 'group', title: ['Synthetic Alpha', 'Synthetic Beta', 'Never observed'][index],
  lastActivity: '2026-11-01T12:00:01.000Z',
}));
const messages = roomId => (roomId === 'room-a' ? ['message-a', 'keep-a'] : ['message-b']).map((id, index) => ({
  id, roomId, personId: 'peer', text: id === 'message-a' ? 'Remote body before exact deletion' : 'Independent retained history',
  created: `2026-11-01T12:00:0${index}.000Z`,
}));
globalThis.fetch = async (target, init) => {
  const url = new URL(String(target)), method = init?.method || 'GET';
  if (url.origin !== 'https://webexapis.com' || method !== 'GET') return forbidden('fetch-write-or-origin');
  // Deliberately stale REST always lists A, even after the exact SDK revocation.
  if (url.pathname === '/v1/rooms') {
    trace('rest', { method, resource: 'rooms', phase: phase() });
    return Response.json({ items: rooms });
  }
  if (url.pathname === '/v1/messages' && ['room-a', 'room-b'].includes(url.searchParams.get('roomId'))) {
    const roomId = url.searchParams.get('roomId');
    trace('rest', { method, resource: 'messages', roomId, phase: phase() });
    return Response.json({ items: messages(roomId) });
  }
  const id = url.pathname.split('/')[3];
  if (url.pathname.startsWith('/v1/messages/') && ['message-a', 'keep-a', 'message-b'].includes(id)) {
    const roomId = id === 'message-b' ? 'room-b' : 'room-a';
    trace('rest', { method, resource: 'message', roomId, messageId: id, phase: phase() });
    return Response.json(messages(roomId).find(message => message.id === id));
  }
  return forbidden('fetch-resource');
};

trace('editor-start');
process.once('exit', code => trace('editor-exit', { code }));
// Read-only observers forward every original byte/callback/return value unchanged.
// The actual worker still owns EditorLines, EditorRPC, editorOutput and EOF/signals.
const allowed = new Set(['hello', 'session.start', 'auth.refresh', 'state.get', 'rooms.list', 'rooms.select', 'messages.list', 'shutdown']);
const input = new EditorLines(line => {
  const request = JSON.parse(line);
  const readers = request.method === 'messages.readBy';
  const params = request.params || {};
  trace('request', { id: request.id, method: request.method,
    ...(['rooms.select'].includes(request.method) || readers ? { roomId: params.roomId } : {}),
    ...(readers ? { messageId: params.messageId, phase: phase() } : {}) });
  const openingRead = readers && phase() === 'initial' && params.roomId === 'room-a' && params.messageId === 'keep-a'
    && params.watch === true && Object.keys(params).sort().join(',') === 'messageId,roomId,watch';
  if (!allowed.has(request.method) && !openingRead) trace('forbidden', { boundary: 'rpc-method' });
});
process.stdin.on('data', bytes => input.push(bytes));
let pending = '';
const write = process.stdout.write;
process.stdout.write = function (...args) {
  pending += args[0].toString();
  let end;
  while ((end = pending.indexOf('\n')) >= 0) {
    const packet = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1);
    if (packet.id) trace('response', { id: packet.id, ...(packet.error ? { code: packet.error.code } : {}) });
    if (packet.method === 'room.revoked') trace('revoked', { roomId: packet.params.roomId });
    if (packet.method === 'state') {
      const state = packet.params;
      trace('state', { revision: state.revision, state: state.state, ready: state.ready, readStatus: state.readStatus,
        sourceEpoch: state.reactionSource?.epoch, selected: state.room?.id || '',
        rooms: state.rooms.map(room => ({ id: room.id, ...(room.unread !== undefined ? { unread: room.unread } : {}),
          ...(room.unreadStale !== undefined ? { stale: room.unreadStale } : {}) })),
        messages: state.messages.map(message => message.id) });
    }
  }
  return Reflect.apply(write, this, args);
};
