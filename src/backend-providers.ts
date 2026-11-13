/** Finite provider construction only. Lifecycle owners decide when to create/use/close. */
import { OAuthSession, type OAuthConfig } from './oauth.js';
import { startSharedOAuth } from './oauth-share.js';
import { ReadStatusWorker, type ReadStatusSource } from './read-status.js';
import { WebexSelectedPeopleProvider } from './people-selected.js';
import type { PeopleProviderOptions } from './people-status.js';
import type { PresenceOptions } from './presence-lifecycle.js';
import { WebexUpcomingMeetingsProvider, type UpcomingMeetingsOptions } from './upcoming-meetings.js';
import type { AgendaOptions } from './upcoming-agenda.js';
import { SenderNames } from './sender-names.js';
import { WebexMessagingAPI, demoMessageAPI, type MessagingAPI } from './messaging-api.js';
import { MessagingStore } from './messaging-store.js';
import type { ContentAdmission } from './content-admission.js';
import { SpacesCache, spacesCacheAccount } from './spaces-cache.js';

export const defaultReadStatusFactory = (): ReadStatusSource => new ReadStatusWorker();
export const defaultPeopleFactory = (options: PeopleProviderOptions): WebexSelectedPeopleProvider => new WebexSelectedPeopleProvider(options);
export const defaultUpcomingFactory = (options: UpcomingMeetingsOptions): WebexUpcomingMeetingsProvider => new WebexUpcomingMeetingsProvider(options);
/** Fresh factory objects per engine, not mutable process-wide default bindings. */
export function defaultAuthorization() {
  return { create: (config: OAuthConfig, secret: string) => new OAuthSession(config, secret), share: startSharedOAuth };
}
export function defaultSpacesCache() {
  return { create: () => new SpacesCache(), account: spacesCacheAccount };
}
export function composeBackendProviders(readStatus: () => ReadStatusSource,
  people: (options: PeopleProviderOptions) => WebexSelectedPeopleProvider,
  upcoming: (options: UpcomingMeetingsOptions) => WebexUpcomingMeetingsProvider,
  options: { now?: () => number; senderFetch?: typeof fetch }) {
  const createPeople: PresenceOptions['create'] = (session, readOwner) => people({
    enabled: true, grantedScopes: session.grantedScopes, token: session.token, fetcher: fetch, readOwner, now: options.now,
  });
  const createUpcoming: AgendaOptions['create'] = session => upcoming({ enabled: true, fetcher: fetch, session, now: options.now });
  return { readStatus, people: createPeople, upcoming: createUpcoming,
    names: () => new SenderNames({ fetcher: options.senderFetch ?? ((...args) => fetch(...args)), now: options.now }) };
}
/** The token callback is application-owned; construction does not read credentials. */
export function createMessagingStore(mode: 'demo' | 'live', token: () => string, contentAdmission: ContentAdmission,
  owners: { messaging?: (api: MessagingAPI, pollMs: number, mode: 'demo' | 'live') => MessagingStore }): MessagingStore {
  const api = mode === 'demo' ? demoMessageAPI('editor') : new WebexMessagingAPI(token, fetch, 12_000, contentAdmission);
  return owners.messaging?.(api, 4000, mode) ?? new MessagingStore(api, 4000, mode);
}
