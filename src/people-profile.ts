/** Explicit selected-person textual details, separate from automatic presence. */
import { peopleId, senderName } from './identity-contracts.js';
import { PublicProblem, type ActionREST } from './public-rest.js';

export const PROFILE_LIMITS = Object.freeze({ chars: 120, fieldBytes: 480, dtoBytes: 4096, ageMs: 120_000 });
export const PROFILE_FIELDS = ['displayName', 'firstName', 'lastName', 'department', 'title', 'timezone'] as const;
export interface PersonProfile {
  sessionId: string; personId: string; coverage: 'person-text'; observedAt: number; partial: boolean;
  fields: Partial<Record<typeof PROFILE_FIELDS[number], string>>;
}
export function parsePersonProfile(value: unknown, personId: string, sessionId: string, observedAt: number): PersonProfile | undefined {
  if (!peopleId(personId) || !/^[a-f0-9]{32}$/.test(sessionId) || !Number.isSafeInteger(observedAt) || observedAt < 0
    || !value || typeof value !== 'object' || Array.isArray(value)) return;
  const raw = value as Record<string, unknown>;
  if (raw.id !== personId || 'errors' in raw) return;
  const fields: PersonProfile['fields'] = {};
  let partial = false;
  for (const key of PROFILE_FIELDS) {
    const text = senderName(raw[key]);
    if (text) fields[key] = text;
    if (!text || text !== raw[key]) partial = true;
  }
  const result: PersonProfile = { sessionId, personId, coverage: 'person-text', observedAt, partial, fields };
  return Buffer.byteLength(JSON.stringify(result)) <= PROFILE_LIMITS.dtoBytes ? result : undefined;
}
export async function readPersonProfile(personId: string, sessionId: string, rest: ActionREST, token: () => string,
  signal: AbortSignal, now = Date.now): Promise<PersonProfile> {
  if (!peopleId(personId) || !/^[a-f0-9]{32}$/.test(sessionId) || signal.aborted) throw new PublicProblem('failed');
  const response = await rest.call('/v1/people/' + encodeURIComponent(personId), 'GET', token(), signal);
  token(); // Session/known grant must still belong to the caller after physical completion.
  if (signal.aborted) throw new PublicProblem('failed');
  const value = parsePersonProfile(response.value, personId, sessionId, now());
  if (!value) throw new PublicProblem('failed');
  return value;
}
