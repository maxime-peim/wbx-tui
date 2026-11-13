// Synthetic SDK only; actual read-status-worker orchestration, parsing and IPC remain.
import { EventEmitter } from 'node:events';
import { trace, phase, forbidden, forbidNetwork } from './sdk-native-control.mjs';

forbidNetwork();
globalThis.fetch = () => forbidden('sdk-fetch');
trace('sdk-process');
process.once('exit', code => trace('sdk-exit', { code }));
process.on('message', message => trace('ipc-in', { type: message.type,
  ...(message.type === 'readers' ? { roomId: message.roomId, messageId: message.messageId } : {}) }));
const send = process.send;
process.send = function (message, ...args) {
  trace('ipc-out', { type: message.type,
    ...(message.reason ? { reason: message.reason } : {}),
    ...(message.status ? { status: message.status } : {}),
    ...(message.changes ? { changes: message.changes } : {}),
    ...(message.rooms ? { rooms: message.rooms.map(room => room.id) } : {}) });
  return Reflect.apply(send, this, [message, ...args]);
};
export function createReadStatusSDK() {
  trace('sdk-create');
  const self = Buffer.from('ciscospark://us/PEOPLE/self').toString('base64url');
  const emitter = resource => Object.assign(new EventEmitter(), {
    listen: async () => { trace('sdk-listen', { resource }); },
    stopListening: () => trace('sdk-stop-listening', { resource }),
  });
  const rooms = emitter('rooms'), messages = emitter('messages'), memberships = emitter('memberships');
  const items = ['room-a', 'room-b'].map((id, index) => ({
    id, type: 'group', title: ['Synthetic Alpha', 'Synthetic Beta'][index],
    lastActivityDate: '2026-11-01T12:00:01.000Z', lastSeenActivityDate: '2026-11-01T11:00:00.000Z',
  }));
  rooms.listWithReadStatus = async () => { trace('sdk-list'); return { items: structuredClone(items) }; };
  rooms.getWithReadStatus = async id => { trace('sdk-get', { roomId: id }); return structuredClone(items.find(item => item.id === id)); };
  memberships.updateLastSeen = () => forbidden('sdk-receipt');
  const emit = (emitter, resource, data) => {
    trace('sdk-event', { resource, roomId: data.roomId, id: data.id });
    emitter.emit('deleted', { resource, event: 'deleted', createdBy: self, data });
  };
  let previous = phase();
  const timer = setInterval(() => {
    const next = phase();
    if (next === previous) return;
    previous = next; trace('sdk-phase', { phase: next });
    if (next === 'fault') throw new Error('PRIVATE synthetic provider failure C4-PRIVATE-TOKEN');
    if (next === 'mismatch') {
      emit(messages, 'messages', { id: 'message-a', roomId: 'room-b' });
      emit(memberships, 'memberships', { id: 'other-member', roomId: 'room-a', personId: 'not-self' });
    }
    if (next === 'delete') emit(messages, 'messages', { id: 'message-a', roomId: 'room-a' });
    if (next === 'revoke') emit(memberships, 'memberships', { id: 'self-membership', roomId: 'room-a', personId: self });
    if (next === 'stale') {
      items[1].lastActivityDate = '2026-11-01T12:00:02.000Z';
      rooms.emit('updated', { data: { id: 'room-a' } });
      rooms.emit('updated', { data: { id: 'room-b' } });
      messages.emit('created', { data: { id: 'message-a', roomId: 'room-a', personId: 'peer', created: new Date().toISOString() } });
      trace('sdk-stale-event');
    }
  }, 10);
  const sdk = Object.assign(new EventEmitter(), {
    ready: true, rooms, memberships, messages,
    internal: { me: { id: self }, device: {
      register: async () => trace('sdk-register'), unregister: async () => trace('sdk-unregister'),
    } },
    logout: () => forbidden('sdk-logout'),
  });
  sdk.internal.mercury = { disconnect: () => { clearInterval(timer); trace('sdk-disconnect'); } };
  return sdk;
}
