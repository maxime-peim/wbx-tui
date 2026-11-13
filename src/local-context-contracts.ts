/** Private local grouping/draft DTOs only; importing cannot inspect storage. */
import { chatId } from './chat-protocol.js';
export const SECTION_LIMITS = Object.freeze({ sections: 32, rooms: 500, chars: 60, bytes: 307_200, slots: 8, entries: 64 });
export interface LocalSection { id: string; name: string; collapsed: boolean; rooms: string[] }
export interface SectionsSnapshot { revision: number; persistence: 'session' | 'saved' | 'unavailable'; items: LocalSection[] }
export type SectionEdit = { action: 'create'; name: string } | { action: 'rename'; id: string; name: string }
  | { action: 'remove' | 'toggle'; id: string } | { action: 'move'; id: string; position: number }
  | { action: 'assign'; id: string; roomId: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
// Same locale-independent key in Node/Vim; do not normalize Unicode labels.
export const sectionLabelKey = (name: string): string => name.replace(/[A-Z]/g, character => character.toLowerCase());
export const sectionId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
export const sectionName = (v: unknown): v is string => typeof v === 'string' && !!v && v.trim() === v
  && Array.from(v).length <= SECTION_LIMITS.chars && Buffer.byteLength(v) <= 240
  && !/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff\ud800-\udfff]/u.test(v);
export function validSectionEdit(v: unknown): v is SectionEdit {
  if (!object(v)) return false;
  if (v.action === 'create') return keys(v, ['action', 'name']) && sectionName(v.name);
  if (!sectionId(v.id) && !(v.action === 'assign' && v.id === '')) return false;
  if (v.action === 'rename') return keys(v, ['action', 'id', 'name']) && sectionName(v.name);
  if (v.action === 'remove' || v.action === 'toggle') return keys(v, ['action', 'id']);
  if (v.action === 'move') return keys(v, ['action', 'id', 'position']) && Number.isInteger(v.position) && (v.position as number) >= 0 && (v.position as number) < 32;
  return v.action === 'assign' && keys(v, ['action', 'id', 'roomId']) && chatId(v.roomId);
}
export function validSections(v: unknown): v is LocalSection[] {
  if (!Array.isArray(v) || v.length > SECTION_LIMITS.sections) return false;
  const ids = new Set<string>(), labels = new Set<string>(), rooms = new Set<string>();
  for (const item of v) {
    if (!object(item) || !keys(item, ['id', 'name', 'collapsed', 'rooms']) || !sectionId(item.id) || !sectionName(item.name)
      || typeof item.collapsed !== 'boolean' || !Array.isArray(item.rooms) || item.rooms.length > SECTION_LIMITS.rooms
      || ids.has(item.id) || labels.has(sectionLabelKey(item.name))) return false;
    ids.add(item.id); labels.add(sectionLabelKey(item.name));
    for (const room of item.rooms) { if (!chatId(room) || rooms.has(room)) return false; rooms.add(room); }
    if (rooms.size > SECTION_LIMITS.rooms) return false;
  }
  return true;
}
export const DRAFT_LIMITS = Object.freeze({ entries: 64, text: 65_536, bytes: 1_048_576, files: 128 });
export interface LocalDraft { roomId: string; parentId?: string; text: string; format: 'plain' | 'markdown'; uncertain: boolean }
export interface DraftDocument { revision: string; items: LocalDraft[] }
export function validLocalDrafts(value: unknown): value is LocalDraft[] {
  if (!Array.isArray(value) || value.length > DRAFT_LIMITS.entries) return false;
  const seen = new Set<string>();
  for (const draft of value) {
    if (!object(draft) || !keys(draft, ['roomId', 'parentId', 'text', 'format', 'uncertain']) || !chatId(draft.roomId)
      || draft.parentId !== undefined && !chatId(draft.parentId) || typeof draft.text !== 'string' || draft.text.length > DRAFT_LIMITS.text
      || draft.text.includes('\0') || !['plain', 'markdown'].includes(String(draft.format)) || typeof draft.uncertain !== 'boolean') return false;
    const key = JSON.stringify([draft.roomId, draft.parentId ?? '']);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return Buffer.byteLength(JSON.stringify(value)) <= DRAFT_LIMITS.bytes - 1024;
}
