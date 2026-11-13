/** Finite presentation-only adapter. Never accepts Ex, shell or media commands. */
import { parseEvent, validSource, type Source, type SourceInfo } from './protocol.js';
export const PANE_ACTIONS = ['focus.next', 'focus.previous', 'focus.left', 'focus.right', 'focus.up', 'focus.down',
  'pane.split.vertical', 'pane.split.horizontal', 'pane.close', 'pane.maximize', 'pane.grow', 'pane.shrink', 'source.set', 'layout'] as const;
export interface NativePaneIntent { revision: number; action: typeof PANE_ACTIONS[number]; source?: Source; layout?: string }
export interface NativePaneCapability { version: 1; revision: number; layouts: string[]; sources: SourceInfo[] }
export interface NativePaneResult { requestId: number; status: 'applied' | 'refused' | 'unknown' }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const paneNumber = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
export const paneName = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
export function nativePaneIntent(v: unknown): v is NativePaneIntent {
  return object(v) && paneNumber(v.revision) && (PANE_ACTIONS as readonly unknown[]).includes(v.action)
    && Object.keys(v).every(key => ['revision', 'action', 'source', 'layout'].includes(key))
    && (v.action === 'source.set' ? validSource(v.source) : v.source === undefined)
    && (v.action === 'layout' ? paneName(v.layout) : v.layout === undefined);
}
export function nativePaneCapability(v: unknown): v is NativePaneCapability {
  return object(v) && v.version === 1 && paneNumber(v.revision) && Array.isArray(v.layouts) && v.layouts.length <= 32
    && v.layouts.every(paneName) && new Set(v.layouts).size === v.layouts.length
    && validSources(v.sources) && Object.keys(v).every(key => ['version', 'revision', 'layouts', 'sources'].includes(key));
}
function validSources(v: unknown): v is SourceInfo[] {
  if (!Array.isArray(v) || v.length > 16) return false;
  try { parseEvent(JSON.stringify({ type: 'sources', sources: v })); }
  catch { return false; }
  return new Set(v.map(source => source.id)).size === v.length;
}
export function nativePaneResult(v: unknown): v is NativePaneResult {
  return object(v) && paneNumber(v.requestId) && ['applied', 'refused', 'unknown'].includes(v.status as string)
    && Object.keys(v).every(key => ['requestId', 'status'].includes(key));
}
export function paneAction(v: NativePaneIntent): string {
  if (!nativePaneIntent(v)) throw new Error('Unsupported pane operation.');
  return v.action + (v.action === 'layout' ? ' ' + v.layout : v.action === 'source.set' ? ' ' + v.source : '');
}
