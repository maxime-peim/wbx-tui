import { record } from './editor-protocol.js';
import { BoundedOutput } from './bounded-output.js';

const without = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
/** A lane is equivalence of control/authority/evidence, NOT equivalence of data.
 * Full validation/serialization still runs. Unknown fields are conservative barriers. */
export function editorStateLane(state: unknown): string | undefined {
  if (!record(state)) return;
  const fields = without(state, ['revision', 'messages', 'rooms', 'room']);
  const rooms = Array.isArray(state.rooms) ? state.rooms.map(room => record(room) ? without(room, ['title', 'lastActivity']) : room) : state.rooms;
  const room = record(state.room) ? without(state.room, ['title', 'lastActivity']) : state.room;
  const endpoint = Array.isArray(state.messages) ? state.messages.at(-1) : undefined;
  return JSON.stringify([fields, rooms, room, record(endpoint) ? [endpoint.id, endpoint.created] : endpoint]);
}

export const READ_STATUS_OUTPUT_LIMITS = Object.freeze({ bytes: 2_097_152, records: 128 });
/** Private IPC: snapshots with unchanged authority may replace adjacent title-only
 * updates. Health, ready, receipts, failures and message batches never replace. */
export function readStatusOutput(send: (value: object, complete: (error?: Error | null) => void) => void, failed: () => void) {
  const output = new BoundedOutput<object>(send, failed, READ_STATUS_OUTPUT_LIMITS.bytes, READ_STATUS_OUTPUT_LIMITS.records);
  const write = (value: object) => {
    if (output.diagnostics().closed) return;
    try {
      const data = structuredClone(value), encoded = JSON.stringify(data);
      const packet = data as { type?: string; rooms?: Record<string, unknown>[] };
      const lane = packet.type === 'snapshot' && Object.keys(packet).every(key => ['type', 'rooms'].includes(key)) && Array.isArray(packet.rooms)
        ? JSON.stringify(packet.rooms.map(room => without(room, ['title']))) : undefined;
      output.offer(data, Buffer.byteLength(encoded), lane);
    } catch { output.close(); failed(); }
  };
  return Object.assign(write, { flush: () => output.flush(), close: () => output.close(), diagnostics: () => output.diagnostics() });
}
