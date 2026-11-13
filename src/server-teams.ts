/** Lazy public Team labels for already loaded room teamIds; not personal Sections. */
import { chatId } from './chat-protocol.js';
import { senderName, peopleId } from './identity-contracts.js';
import { PublicProblem, publicURL, type ActionREST } from './public-rest.js';
export const TEAM_LIMITS = Object.freeze({ page: 8, cache: 32, freshMs: 600_000, negativeMs: 30_000 });
export const JOINED_TEAM_LIMITS = Object.freeze({ page: 50, items: 250, pages: 5, bytes: 65536, ageMs: 120_000, cursorBytes: 2048 });
export interface TeamRooms { id: string; teamId?: string; cached?: boolean }
export interface ServerTeam { id: string; label: string; state: 'known' | 'unavailable' | 'not-loaded'; roomIds: string[] }
export interface TeamPage { revision: number; more: boolean; partial: true; items: ServerTeam[] }
export interface JoinedTeamPage { sessionId: string; coverage: 'joined-teams'; revision: number; observedAt: number;
  partial: boolean; more: boolean; limit: 'none' | 'items' | 'pages' | 'bytes' | 'cycle'; items: { teamId: string; label: string }[] }
interface JoinedSlot { value: JoinedTeamPage; next?: string; seen: Set<string>; pages: number; bytes: number }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export interface TeamRenameSnapshot { teamId: string; expectedName: string }
export interface TeamDescriptionSnapshot extends TeamRenameSnapshot { expectedDescription: string }
interface DescriptionProof { safe: (v: unknown) => v is string; expected?: string }
/** Fresh proof only, never label/role retention. A mismatch is returned solely as a conflict preimage. */
export function readTeamRenameProof(rest: ActionREST, teamId: string, self: string, token: () => string,
  signal: AbortSignal, safeName: (v: unknown) => v is string, expectedName: string | undefined,
  description: DescriptionProof): Promise<TeamDescriptionSnapshot>;
export function readTeamRenameProof(rest: ActionREST, teamId: string, self: string, token: () => string,
  signal: AbortSignal, safeName: (v: unknown) => v is string, expectedName?: string): Promise<TeamRenameSnapshot>;
export async function readTeamRenameProof(rest: ActionREST, teamId: string, self: string, token: () => string,
  signal: AbortSignal, safeName: (v: unknown) => v is string, expectedName?: string,
  description?: DescriptionProof): Promise<TeamRenameSnapshot | TeamDescriptionSnapshot> {
  const check = () => { if (signal.aborted) throw new PublicProblem('failed'); return token(); };
  if (!chatId(teamId) || !peopleId(self)) throw new PublicProblem('failed');
  const response = await rest.call('/v1/teams/' + encodeURIComponent(teamId), 'GET', check(), signal);
  check(); const team = response.value;
  if (response.link || !object(team) || 'errors' in team || team.id !== teamId || !safeName(team.name)) throw new PublicProblem('failed');
  if (description && (!Object.hasOwn(team, 'description') || !description.safe(team.description))) throw new PublicProblem('failed');
  const value = { teamId, expectedName: team.name, ...(description ? { expectedDescription: team.description as string } : {}) };
  if (expectedName !== undefined && team.name !== expectedName
    || description?.expected !== undefined && team.description !== description.expected) return value;
  const members = await rest.call('/v1/team/memberships?teamId=' + encodeURIComponent(teamId) + '&max=100', 'GET', check(), signal);
  check(); const raw = members.value;
  if (members.link || !object(raw) || 'errors' in raw || !Array.isArray(raw.items) || raw.items.length > 100) throw new PublicProblem('failed');
  const ids = new Set<string>(), persons = new Set<string>(); let moderator = false;
  for (const row of raw.items) {
    if (!object(row) || 'errors' in row || !chatId(row.id) || !peopleId(row.personId) || row.teamId !== teamId
      || ids.has(row.id) || persons.has(row.personId)) throw new PublicProblem('failed');
    ids.add(row.id); persons.add(row.personId);
    if (row.personId === self) {
      if (row.isModerator !== true) throw new PublicProblem('failed');
      moderator = true;
    }
  }
  if (!moderator) throw new PublicProblem('failed');
  check(); return value;
}
function joinedURL(path: string): string {
  const url = publicURL(path); url.searchParams.sort(); return url.href;
}
function joinedNext(link: string | undefined): string | undefined {
  if (!link) return;
  if (link.length > 8192 || /[\x00-\x1f\x7f-\x9f]/u.test(link)) throw new PublicProblem('failed');
  let next: string | undefined;
  for (const segment of link.split(',')) {
    const match = /^\s*<([^<>]+)>\s*;\s*rel=(?:"([a-z]+)"|([a-z]+))\s*$/.exec(segment);
    if (!match) throw new PublicProblem('failed');
    if ((match[2] ?? match[3]) !== 'next') continue;
    if (next) throw new PublicProblem('failed');
    const url = publicURL(match[1]!);
    if (url.pathname !== '/v1/teams' || url.searchParams.get('max') !== '50'
      || [...url.searchParams.keys()].some(key => !['max', 'before', 'after'].includes(key))
      || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)
      || url.searchParams.has('before') && url.searchParams.has('after')) throw new PublicProblem('failed');
    for (const key of ['before', 'after']) {
      if (!url.searchParams.has(key)) continue;
      const cursor = url.searchParams.get(key)!;
      if (!cursor || Buffer.byteLength(cursor) > JOINED_TEAM_LIMITS.cursorBytes || /[\x00-\x1f\x7f-\x9f]/u.test(cursor)) throw new PublicProblem('failed');
    }
    next = joinedURL(url.href);
  }
  return next;
}
export class ServerTeams {
  private labels = new Map<string, { label: string; until: number; state: ServerTeam['state'] }>();
  private dataset = '';
  private offset = 0;
  private revision = 0;
  private epoch = 0;
  private joinedSlot?: JoinedSlot;
  private joinedEpoch = 0;
  private joinedRevision = 0;
  private joinedPhysical = false;
  constructor(private now = () => Date.now()) {}
  /** Joined rows fence explicit selection only, never role or raw-name authority. */
  renameTarget(sessionId: string, teamId: string, revision: number): boolean {
    const value = this.joinedSlot?.value, age = value ? this.now() - value.observedAt : -1;
    return !!value && chatId(teamId) && Number.isSafeInteger(revision) && revision > 0
      && value.sessionId === sessionId && value.revision === revision && age >= 0 && age < JOINED_TEAM_LIMITS.ageMs
      && value.items.some(item => item.teamId === teamId);
  }
  private resetJoined(): void { this.joinedSlot = undefined; this.joinedEpoch++; this.joinedRevision++; }
  reset(): void {
    this.labels.clear(); this.dataset = ''; this.offset = 0; this.epoch++; this.revision++;
    this.resetJoined(); // Never release unsettled physical joined-list work here.
  }
  async joined(sessionId: string, rest: ActionREST, signal: AbortSignal, token: () => string,
    more = false, revision?: number): Promise<JoinedTeamPage> {
    const previous = this.joinedSlot, age = previous ? this.now() - previous.value.observedAt : -1;
    if (!/^[a-f0-9]{32}$/.test(sessionId) || signal.aborted || this.joinedPhysical
      || more && (!previous || previous.value.sessionId !== sessionId || previous.value.revision !== revision
        || !previous.value.more || !previous.next || age < 0 || age >= JOINED_TEAM_LIMITS.ageMs)) throw new PublicProblem('failed');
    if (!more) this.resetJoined();
    const epoch = this.joinedEpoch, prior = more ? previous : undefined;
    const path = prior?.next ?? joinedURL('/v1/teams?max=50');
    this.joinedPhysical = true;
    try {
      const response = await rest.call(path, 'GET', token(), signal);
      token();
      if (epoch !== this.joinedEpoch || signal.aborted || !object(response.value) || 'errors' in response.value
        || !Array.isArray(response.value.items) || response.value.items.length > JOINED_TEAM_LIMITS.page) throw new PublicProblem('failed');
      const items = [...(prior?.value.items ?? [])], ids = new Set(items.map(item => item.teamId));
      let bytes = prior?.bytes ?? 2, limit: JoinedTeamPage['limit'] = 'none';
      for (const raw of response.value.items) {
        if (!object(raw) || 'errors' in raw || !chatId(raw.id) || ids.has(raw.id)) throw new PublicProblem('failed');
        ids.add(raw.id);
        const item = { teamId: raw.id, label: senderName(raw.name) || 'Unnamed Team' };
        const size = Buffer.byteLength(JSON.stringify(item)) + 1;
        if (limit !== 'none') continue;
        if (items.length >= JOINED_TEAM_LIMITS.items) { limit = 'items'; continue; }
        if (bytes + size > JOINED_TEAM_LIMITS.bytes) { limit = 'bytes'; continue; }
        items.push(item); bytes += size;
      }
      const next = joinedNext(response.link), seen = new Set(prior?.seen);
      seen.add(joinedURL(path));
      const pages = (prior?.pages ?? 0) + 1;
      if (limit === 'none' && next) {
        if (seen.has(next)) limit = 'cycle';
        else if (items.length >= JOINED_TEAM_LIMITS.items) limit = 'items';
        else if (pages >= JOINED_TEAM_LIMITS.pages) limit = 'pages';
      }
      token();
      const finishedAt = this.now(), observedAt = prior?.value.observedAt ?? finishedAt, finishedAge = finishedAt - observedAt;
      if (!Number.isSafeInteger(finishedAt) || finishedAt < 0 || !Number.isSafeInteger(observedAt)
        || finishedAge < 0 || finishedAge >= JOINED_TEAM_LIMITS.ageMs || epoch !== this.joinedEpoch || signal.aborted) throw new PublicProblem('failed');
      const value: JoinedTeamPage = { sessionId, coverage: 'joined-teams', revision: ++this.joinedRevision,
        observedAt, partial: !!next || limit !== 'none', more: !!next && limit === 'none', limit, items };
      this.joinedSlot = { value, next, seen, pages, bytes };
      return structuredClone(value);
    } catch (error) {
      if (epoch === this.joinedEpoch) this.resetJoined();
      throw error;
    } finally { this.joinedPhysical = false; }
  }
  async list(rooms: readonly TeamRooms[], rest: ActionREST, signal: AbortSignal, token: () => string, more = false): Promise<TeamPage> {
    const relevant = new Map<string, string[]>();
    for (const room of rooms.slice(0, 500)) {
      if (room.cached || !chatId(room.teamId) || !chatId(room.id)) continue;
      if (!relevant.has(room.teamId)) relevant.set(room.teamId, []);
      relevant.get(room.teamId)!.push(room.id);
    }
    const ids = [...relevant.keys()].sort(), dataset = JSON.stringify(ids);
    if (more && (!this.offset || this.dataset !== dataset || this.offset >= ids.length)) throw new PublicProblem('failed');
    const start = more ? this.offset : 0, epoch = this.epoch, items: ServerTeam[] = [];
    let stopped = false;
    for (const id of ids.slice(start, start + TEAM_LIMITS.page)) {
      token();
      const cached = this.labels.get(id);
      let value = cached && Date.now() < cached.until ? cached : undefined;
      if (!value) {
        if (stopped) { items.push({ id, label: 'Server Team not loaded', state: 'not-loaded', roomIds: [...relevant.get(id)!] }); continue; }
        let label = 'Unresolved Server Team', state: ServerTeam['state'] = 'unavailable';
        try {
          const response = await rest.call('/v1/teams/' + encodeURIComponent(id), 'GET', token(), signal);
          const raw = response.value as Record<string, unknown>;
          token();
          if (!raw || 'errors' in raw || raw.id !== id || typeof raw.name !== 'string' || !senderName(raw.name)) throw new PublicProblem('failed');
          label = senderName(raw.name); state = 'known';
        } catch (error) {
          token();
          if (rest.busy()) throw new PublicProblem('failed');
          if (error instanceof PublicProblem && [401, 403, 429].includes(error.status ?? 0)) stopped = true;
        }
        if (signal.aborted || epoch !== this.epoch) throw new PublicProblem('failed');
        value = { label, state, until: Date.now() + (state === 'known' ? TEAM_LIMITS.freshMs : TEAM_LIMITS.negativeMs) };
        this.labels.delete(id); this.labels.set(id, value);
        while (this.labels.size > TEAM_LIMITS.cache) this.labels.delete(this.labels.keys().next().value!);
      }
      items.push({ id, label: value.label, state: value.state, roomIds: [...relevant.get(id)!] });
    }
    token();
    if (signal.aborted || epoch !== this.epoch) throw new PublicProblem('failed');
    this.dataset = dataset; this.offset = start + items.length;
    return { revision: ++this.revision, more: this.offset < ids.length, partial: true, items };
  }
  diagnostics() { return { cached: this.labels.size }; }
}
