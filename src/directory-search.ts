/** Explicit org-policy-limited prefix queries. No presence, enumeration or writes. */
import { peopleId, senderName, DIRECTORY_LIMITS, validDirectoryQuery } from './identity-contracts.js';
export { DIRECTORY_LIMITS, validDirectoryQuery } from './identity-contracts.js';
import { publicURL, PublicProblem, type ActionREST } from './public-rest.js';

export interface DirectoryPerson { personId: string; label: string }
export interface DirectoryPage {
  sessionId: string; query: string; revision: number; coverage: 'directory-prefix'; observedAt: number;
  partial: boolean; more: boolean; items: DirectoryPerson[];
}
function normalized(path: string): string {
  const url = publicURL(path); url.searchParams.sort(); return url.href;
}
function nextPage(link: string | undefined, query: string): string | undefined {
  if (!link) return;
  const matches = [...link.matchAll(/<([^>]+)>;\s*rel="next"/g)];
  if (matches.length !== 1) { if (/\bnext\b/.test(link)) throw new PublicProblem('failed'); return; }
  const url = publicURL(matches[0]![1]!);
  if (url.pathname !== '/v1/people' || url.searchParams.get('displayName') !== query
    || url.searchParams.get('max') !== '50'
    || url.searchParams.has('excludeStatus') && url.searchParams.get('excludeStatus') !== 'true'
    || [...url.searchParams.keys()].some(key => !['displayName', 'max', 'excludeStatus', 'before', 'after'].includes(key))
    || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)
    || ['before', 'after'].some(key => (url.searchParams.get(key)?.length ?? 0) > 2048)) throw new PublicProblem('failed');
  url.searchParams.set('excludeStatus', 'true');
  return normalized(url.href);
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export class DirectorySearch {
  private value?: DirectoryPage;
  private next?: string;
  private seen = new Set<string>();
  private pages = 0;
  private epoch = 0;
  private revision = 0;
  private physical = false;
  constructor(private now = Date.now) {}
  reset(): void {
    this.value = undefined; this.next = undefined; this.seen.clear(); this.pages = 0;
    this.epoch++; this.revision++;
    // Cancellation/reset cannot admit another physical read before completion.
  }
  async search(query: string, sessionId: string, rest: ActionREST, token: () => string, signal: AbortSignal,
    more = false, revision?: number): Promise<DirectoryPage> {
    const age = this.value ? this.now() - this.value.observedAt : -1;
    if (!validDirectoryQuery(query) || !/^[a-f0-9]{32}$/.test(sessionId) || signal.aborted || this.physical
      || more && (!this.value || this.value.query !== query || this.value.sessionId !== sessionId
        || this.value.revision !== revision || !this.value.more || !this.next || age < 0 || age >= DIRECTORY_LIMITS.ageMs)) throw new PublicProblem('failed');
    if (!more) this.reset();
    const epoch = this.epoch, previous = this.value, pages = this.pages;
    const path = more ? this.next! : normalized('/v1/people?displayName=' + encodeURIComponent(query) + '&max=50&excludeStatus=true');
    this.physical = true;
    try {
      const response = await rest.call(path, 'GET', token(), signal);
      token();
      if (signal.aborted || epoch !== this.epoch || !object(response.value) || 'errors' in response.value
        || !Array.isArray(response.value.items) || response.value.items.length > DIRECTORY_LIMITS.page) throw new PublicProblem('failed');
      const items = [...(previous?.items ?? [])], ids = new Set(items.map(item => item.personId));
      for (const raw of response.value.items) {
        if (!object(raw) || 'errors' in raw || !peopleId(raw.id) || ids.has(raw.id)) throw new PublicProblem('failed');
        ids.add(raw.id);
        items.push({ personId: raw.id, label: senderName(raw.displayName) || 'Unnamed person' });
      }
      const next = nextPage(response.link, query), seen = new Set(this.seen);
      seen.add(normalized(path));
      const bounded = pages + 1 >= DIRECTORY_LIMITS.pages || items.length >= DIRECTORY_LIMITS.retained || !!next && seen.has(next);
      this.value = { sessionId, query, revision: ++this.revision, coverage: 'directory-prefix', observedAt: previous?.observedAt ?? this.now(),
        partial: !!next, more: !!next && !bounded, items };
      this.next = next; this.seen = seen; this.pages = pages + 1;
      return structuredClone(this.value);
    } catch (error) {
      if (epoch === this.epoch) this.reset();
      throw error;
    } finally { this.physical = false; }
  }
}
