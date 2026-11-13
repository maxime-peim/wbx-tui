# Upcoming meetings: public capability and isolated read-only provider

## Joined elsewhere follow-up (2026-11-20)

The spaces list also has a separate **Already joined elsewhere · read-only**
section for calls the account has already joined on another device, including
ad-hoc space calls exposed by the service. This is not a wider schedule window.
Both existing `upcoming_meetings` and `read_status` options must be enabled.
It reuses the already-running metadata SDK and its known `spark:all` grant;
**`meeting:schedules_read` remains required only for the schedule cards below**.
No option, dependency, SDK/configuration edit or additional registration is added.

- `src/joined-meetings-sdk.ts` uses the pinned 3.13 SDK's
  `getActiveMeetings` read shape: `GET` with `api: locus`, `resource: loci`,
  through the existing SDK request/service-catalog/auth boundary. It does not
  load `plugin-meetings`, register/connect a device, create/join/leave/transfer
  a meeting, acquire media, select a space or acknowledge messages.
- Only an `ACTIVE` locus with `self.state=JOINED` and an explicitly `JOINED`
  different device is shown. Our metadata device, waiting/observing devices,
  ringing, departed and ended calls do not qualify. Participants, presence,
  scheduled start times and meeting-series state never prove participation.
  “Another device” is relative to the metadata SDK's registered device, not a
  claim about which desktop/browser/mobile application owns it.
- Existing Mercury `event:locus` events are invalidation hints only: they
  immediately hide the previous observation and coalesce into a new exact
  account-scoped list read, at most once per 10 seconds. A 60-second read
  reconciles missed/unsupported hints. In-flight hints invalidate older results;
  no pushed raw locus is treated as authoritative.
- One discovery request runs at a time with an 8-second deadline. A native
  deadline permanently retires this discovery instance, not the messaging SDK;
  there is no automatic reconnect or orphaned replacement lookup. Other failures
  clear cards; 429 respects server `Retry-After`. Existing SDK backoff denies
  discovery admission. Source/session loss and expired credentials hide cards.
  Observations older than 90 seconds are not presented as current.
- This is always a **partial SDK view**, not proof that no other call exists.
  At most 200 loci / 64 self devices per locus are inspected and three cards
  shown. The 1 MiB payload limit is checked after the SDK buffers/parses the
  response; it is not a streaming transport byte limit.
  Federated `remoteLocusClusterUrls` currently fail closed as unavailable:
  arbitrary response URLs are never followed or granted credentials.
- Only a bounded inert title, opaque SHA-256 row identity and observation time
  cross IPC. No signaling URL, participant list, password, link or join target
  is published/persisted. Enter on these rows has **no call or room action**.
  `:WebexUpcoming` also requests a throttled refresh of this existing discovery.

Offline parser/clock, production-worker/IPC/engine, native editor and actual
pinned SDK transport tests cover this path. No live discovery or activation
was performed. The original public schedule contract below is unchanged.

Research/implementation date: **2026-11-09**. The bounded provider is now wired
to the engine, RPC and spaces UI; integrated staged verification passed in
[the follow-up record](thread-cache-meetings-follow-up.md). Live acceptance is
**NOT RUN**. The native editor enables discovery by default after explicit
connection, **only with the already-known granted meeting scope**. Set
`upcoming_meetings = false` (Vim: `0`) before connecting to disable it. The lower
level provider and compatibility engine callers remain opt-in by default.

Only official public documentation was fetched during research. No actual Webex API request,
credential/config inspection, auth/OAuth, reconnect, editor/live-view inspection,
message, receipt, join, media/device action, install, meeting creation,
mutation or invitation operation was performed. Tests use injected fetch mocks
and synthetic in-memory `Response` objects/streams only.

## Capability: exact grant and current-user coverage

Public `GET https://webexapis.com/v1/meetings` supports an ordinary integration
with **`meeting:schedules_read`**. The Meetings Overview explicitly lists this
user-level scope for List Meetings. It separately lists
`meeting:admin_schedule_read` for organization/admin access; this provider does
not accept an admin grant as a substitute, impersonate `hostEmail`, select a
different user's site, or enumerate the organization.

**`spark:all` alone is not accepted.** The reviewed current public Meetings scope
table does not establish it as a substitute for `meeting:schedules_read`.
Configured/requested scopes are not proof of granted scopes. Missing/unknown
grants produce `scope-required` without reading a token or probing the service.
No scope, OAuth registration, grant flow or config change is introduced. If the
existing account lacks this grant, present the exact requirement for a separate
explicit authorization decision; do not silently expand scopes.

The official List Meetings description explicitly states that
`meetingType=meetingSeries` lists recurring/non-recurring series where the user
is **host or invitee**. A non-recurring meeting is a series with one occurrence.
This is not a host-only provider; nor is it a complete calendar provider. It
covers only meetings/invitations known and exposed by Webex's supported API.
The guide requires a Webex Meetings subscriber/account backed by Common Identity.
API/organization/site restrictions still apply. No promise is made about
arbitrary external calendar invitations, email-only invites, all Suite products,
ad-hoc room meetings, or the native client's calendar aggregation.

### Chosen query and meeting types

The single query family is:

```text
GET /v1/meetings?meetingType=meetingSeries&current=true&max=100&from=<UTC>&to=<UTC>
timezone: UTC
Accept: application/json
```

- `from` is inclusive and `to` is exclusive. Both are pinned for all pages of a
  query. Defaults proposed for the UI are **now − 5 minutes** through
  **now + 30 minutes**, with at most **3** visible cards sorted by start, then ID.
  The API's omitted series/scheduled range defaults are much broader: both
  omitted means now through seven days ahead; only `to` means `from=to−7 days`;
  only `from` means `to=from+7 days`. This provider always supplies both bounds.
  It never supplies `meetingNumber`, `webLink` or `roomId` query selectors, which
  the reference says override/ignore some range/type/state filters.
- `meetingSeries` is the default API type but is specified explicitly. With
  `current=true`, the documented series `start`/`end` refer to the occurrence
  ready to start/join or the next upcoming occurrence, rather than the original
  first occurrence of the series. The current parameter description also
  describes returning the current scheduled meeting. The parser therefore
  accepts either a current-series object or a scheduled-occurrence object with
  its correct state pairing. It never expands recurrence rules itself.
- Series filtering can return a series merely because its recurrence range
  overlaps `from`/`to`, even when the returned current occurrence is outside the
  interval. **Local start/end filtering is mandatory and implemented.** Only one
  current/upcoming occurrence per returned series is represented; this is not
  a list of every future recurrence.
- The other types are `scheduledMeeting` (one scheduled occurrence) and
  `meeting` (actual ongoing/ended instance). The latter is not queried or
  projected. Its API details can lag around 15 minutes; do not use it as a
  real-time availability/joinability signal.
- The provider projects `meetingSeries` states `active`/`inProgress`, and
  `scheduledMeeting` states `scheduled`/`ready`. It rejects terminal states
  `ended`, `missed`, `expired`, unknown states, and actual-instance `lobby` /
  `inProgress` objects. A series marked `inProgress` is still only an observed
  scheduling snapshot, not confirmed live media state.
- The public `scheduledType` values are `meeting`, `webinar`, and (for scheduled
  occurrences) `personalRoomMeeting`. Returned explicit webinars/unknown types
  are omitted; ordinary meetings, personal-room scheduled objects and omitted
  `scheduledType` can be projected. No webinar-specific registration/secret
  handling is attempted. No Events/complete-personal-calendar coverage is claimed.
- A passed `siteUrl` narrows service coverage, so none is supplied; List Meetings
  documents querying the user's sites when it is omitted. No preference/site
  enumeration API is called.

`max` supports up to 100 results per page (API default 10). Pagination is RFC5988
`Link: <...>; rel="next"`. No result ordering guarantee was found; local sorting
does not prove that the first three globally earliest meetings were retrieved
when the bounded page limit is reached.

## Response fields and safe link contract

The reviewed List Meetings response is `{ items: object[] }` and documents:

| Field | Type / meaning |
| --- | --- |
| `id` | string, identity of the series/scheduled object/actual instance according to type |
| `title` | string, scheduling title; projected as inert single-line text, <= 120 Unicode code points |
| `meetingType` | `meetingSeries`, `scheduledMeeting`, `meeting` |
| `state` | `active`, `scheduled`, `ready`, `lobby`, `inProgress`, `ended`, `missed`, `expired` |
| `start`, `end` | ISO-8601 strings; meaning depends on type/current; this implementation requires real UTC timestamps and `end > start` |
| `webLink` | string, meeting information-page link that launches the client when the meeting is ready to start/join |

**`joinURL` / `joinUrl` are not documented List Meetings response fields.** The
local card's `joinUrl` below is derived only from documented `webLink`, not a
guessed SDK/private endpoint or unrelated returned field. Raw `password`,
`hostKey`, panelist/device passwords, telephony codes, agenda, host identity/email,
registration, links and other profile/meeting attributes are discarded.

`upcomingMeetingURL` first applies the existing `validMeeting` HTTPS Webex-domain
validator, then accepts only this conservative public-link subset:

- `https://<valid Webex domain>/meet/<bounded plain personal-room ID>` with no
  query or fragment;
- `https://<valid Webex domain>/[<site>/]j.php?MTID=m<32 hexadecimal characters>`
  with exactly that one query parameter.

Credentials, non-default ports, controls, whitespace, bidi controls, backslashes,
fragments, non-Webex hosts and unsupported paths are rejected. **All unknown or
additional query parameters are rejected**, including password/token/host-key
parameters and duplicates. Nothing is silently stripped to manufacture a
different join link. Unsupported/secret-bearing links yield a non-actionable
card (`joinable=false`, no `joinUrl`), never a raw URL passed to RPC/logs/UI.
This intentionally omits some potentially legitimate link variants until their
safe public contract is separately established.

`joinable` means only **a validated link action is available**, not a promise of
admission, host privileges, immediate meeting readiness, or live server freshness.
The link itself is never fetched/opened/joined by this provider.

## Exact exported contract: `src/upcoming-meetings.ts`

```ts
interface UpcomingMeetingCard {
  id: string;
  title: string;
  start: string;                   // normalized UTC ISO, 24 characters
  end: string;                     // normalized UTC ISO, 24 characters
  meetingType: 'meetingSeries' | 'scheduledMeeting';
  meetingState: 'active' | 'inProgress' | 'scheduled' | 'ready';
  joinable: boolean;
  joinUrl?: string;                // safe derived webLink only
  joinReason?: 'link-unavailable' | 'stale';
}
interface UpcomingMeetingsSnapshot {
  state: 'off' | 'scope-required' | 'loading' | 'ready' | 'stale' | 'unavailable';
  coverage: 'webex-current-series';
  requiredScope: 'meeting:schedules_read';
  items: UpcomingMeetingCard[];    // at most 3, re-filtered for the current clock
  complete: boolean;              // this bounded read, NOT entire calendar coverage
  observedAt?: number;             // original successful local observation time
  reason?: UpcomingMeetingsReason;
  retryAt?: number;                // local epoch milliseconds; no sleeping/retry
}
interface UpcomingMeetingsSession {
  accountId: string;               // verified current-user/session key, never published/queried
  grantedScopes?: readonly string[];
  token: () => string;             // Node owner only, read after every capability gate
}
interface UpcomingMeetingsWindow { graceMs: number; aheadMs: number; maxCards: number }
interface UpcomingMeetingsOptions {
  enabled?: boolean;              // default false
  fetcher?: typeof fetch;          // no global-fetch fallback
  session?: UpcomingMeetingsSession;
  now?: () => number;
  window?: Partial<UpcomingMeetingsWindow>;
  timeoutMs?: number;              // can shorten the 8-second maximum
}

new WebexUpcomingMeetingsProvider(options?)
provider.setSession(session?): void
provider.snapshot(): UpcomingMeetingsSnapshot
provider.refresh(signal?: AbortSignal): Promise<UpcomingMeetingsSnapshot>
provider.joinTarget(meetingId: unknown): string | undefined
provider.close(): void
```

Other exports: `UPCOMING_MEETINGS_SCOPE`, `UPCOMING_MEETINGS_LIMITS`,
`UPCOMING_MEETINGS_WINDOW`, `UpcomingMeetingState`, all interfaces above,
`UpcomingMeetingsReason`, `upcomingMeetingTime(value)`,
`upcomingMeetingURL(value)`, and `parseUpcomingMeeting(value)`.

`UpcomingMeetingsReason` is the allowlist `off`, `closed`, `scope-required`,
`identity-missing`, `transport-unavailable`, `not-loaded`, `denied`, `failed`,
`invalid-data`, `unsafe-pagination`, `rate-limited`, `timeout`, `canceled`, `busy`,
`expired`, `limit`, `partial-data`. No service/error text or credential data is
published. The caller must validate this bounded schema before introducing it
into the editor protocol; no protocol implementation is added in this slice.

### Bounds, cache, cancellation and state timing

- At most **2 pages × 100 records**, **256 KiB / 1,024 reads per response**, and
  **200 projected cache slots**. Three visible cards are selected from those
  slots; expired/out-of-grace/ended times are re-filtered without fetching.
- One query singleflight, at most **16 total caller attachments** per flight
  (canceled slots are not reused). Returned arrays/cards are copies. Canceling
  one reader does not cancel surviving readers; canceling the last aborts work.
- Whole-query deadline **8 seconds**; at most **2 native query operations**
  remain admitted, including those that ignore abort or have unsettled body
  cancellation. Deadline/session replacement does not prematurely release native
  admission. The bound is retained across `setSession`, not reset for each account.
- Fresh cache **60 seconds**, stale retention **5 minutes**, failures **30 seconds**,
  minimum query-start interval **10 seconds**. No force-refresh bypass, timer
  polling, subscriptions, work queue, automatic retry or automatic auth exists.
  Only an explicit `refresh()` can issue a GET. Constructor, `setSession`,
  `snapshot`, `joinTarget` and `close` never fetch.
- `loading` can carry old observed slots. Failures retain only still-relevant
  cached slots as `stale`, preserving the original `observedAt`. Stale/loading
  slots have **no URL**, `joinable=false`; `joinTarget` refuses them. At retention
  expiry or clock reversal, old slots/observation time are withheld. A successful
  refresh replaces the prior observation atomically; a failed second page cannot
  publish first-page results as a fresh complete query.
- `401`/`403` or invalid credentials purge slots and latch `unavailable/denied`
  until explicit session replacement. Missing transport/identity/grants are inert
  capability states. `429` honors seconds/HTTP-date `Retry-After`, never shortens a
  long delay, and falls back to 30 seconds if missing/invalid. Same-account session
  replacement preserves the cooldown. Old-account responses cannot throttle a
  different current account or publish their cards.
- Next-page URLs must remain at the exact HTTPS origin/path and preserve each
  query filter exactly once. Only bounded `cursor`, `before`, `after`, `offset`
  extras are accepted. No host/site/room/person selector, credentials, fragment,
  repeated cursor or redirect is followed. Unsupported Link syntax fails closed.
- A legitimate remaining page at the page bound sets `complete=false`,
  `reason=limit`; malformed/unsupported records are omitted with `partial-data`.
  This distinguishes a bounded/partial empty result from “you have no meetings”.

Window injection is bounded to 0–15 minutes grace, 1 ms–2 hours ahead, and 1–3
visible cards; invalid values fail before network work. These are local product
defaults/limits, not server readiness rules, rate quotas or a real-time freshness
SLA. Webex documents overlapping dynamic per-user quotas shared across clients.

## Engine, RPC and native integration

1. Gate on **known granted** `meeting:schedules_read`
   and verified current-account ownership. Show missing-scope/unavailable states
   without starting OAuth or editing configuration. Do not treat existing
   `spark:all` messaging/read-sync grants as this grant.
2. Keep one provider owned by the current Node session. Call `setSession` before
   accepting another account/grant owner and `close` on disconnect/shutdown.
   Include an engine generation in pending publication/Enter admission checks.
   Do not create a new provider per room/list row/message, or recreate one to
   bypass cooldown/native admission. Inject only the existing authorized token
   callback and fixed-origin fetch transport; do not inspect credentials here.
3. Start read-only discovery only after the feature and grant are admitted.
   Reuse bounded refresh/caches; no per-message lookup or room/organization
   enumeration. The engine's 15-second local scheduling tick publishes expiry
   and requests a read-only refresh after the 60-second freshness period, respecting
   provider cooldowns/Retry-After and stopping on disconnect. Discovery is not on
   the room-open critical path and never calls join automatically.
4. Spaces UI may place at most three snapshot cards above rooms, visibly separate
   from actual room IDs. Preserve chronological room/history ownership, drafts,
   focus and reader state. Render titles as inert plain text, not Markdown,
   statusline syntax, expressions, commands or mappings. Label API/partial/stale
   coverage honestly; do not claim “all invitations” or live readiness.
5. **Enter is explicit join intent only on a currently displayed meeting card.**
   Send an opaque card/meeting identity back to Node, not an arbitrary client URL.
   Node must re-check selected row, session generation, current visible/fresh
   `joinTarget(id)` and existing meeting ownership/admission policy before using
   the existing explicit join path. Bind a row to ID plus occurrence start and
   the rendered snapshot/revision, so a refreshed recurring series cannot silently
   retarget an older visible row to another occurrence. Never join on refresh, clock movement,
   list reordering, generic room selection, load, state notification or startup.
   `meeting.joinUpcoming({meetingId,revision,display?,fallback?})` resolves only
   the same fresh current projection; expiry/refresh/account changes fail closed.
   It then calls the existing live single-owner path with headed permissions and
   transmission initially off. Tests mock that path; real join/media is not run.
6. Safe URLs remain in Node. State cards omit `joinUrl` entirely and include a
   monotonic projection revision. Never transmit raw API
   responses, secret query parameters, passwords or host keys. This provider
   intentionally cannot offer a link action for unsupported/secret-bearing URLs.
7. Separately authorize any live API/interoperability/join acceptance. Offline
   fixtures do not establish real invitation coverage, policy or admission.

`session.start.upcomingMeetings` requests this integration (default false for
direct engine/RPC callers). The native client negotiates it after `hello` with
the `upcoming-meetings` capability, preserving messaging with older backends.
`meetings.upcoming({})` / `:WebexUpcoming` / `<leader>Wmu` explicitly refresh;
there are no host/person/filter/URL or force-bypass parameters. `:WebexHealth`
reports state, reason and required scope without a network call. Missing grants
are footer guidance, not a new prompt or automatic OAuth flow.

Up to three cards appear above spaces. Times ending in `Z` are **UTC**, not local
time. Room and meeting rows use distinct action identities, even if IDs collide.
Insertions preserve each window's hovered identity; removal moves a selected card
to neutral chrome instead of silently retargeting another action. Cached/loading
cards cannot join. Explicit Enter supplies only rendered ID/revision and standard
presentation options; it does not select a room, send a message or issue a receipt.

## Offline evidence

Linux, Node **v25.2.1**: **27 mocked tests passed**, targeted strict typecheck PASS.
The tests cover default/unknown/exact scopes; missing identity/transport;
current-user query/filter/UTC contract; supported types/states; valid timestamps;
sanitization and secret rejection; link allowlisting; clock/window boundaries;
local sort/three-card bound; pagination/body/count/stream bounds; duplicate and
conflicting identities; fresh/stale/loading/expired states; atomic page failures;
singleflight/caller isolation; cancellation/deadline/uncooperative cleanup;
old-account/grant replacement and native admission; denial; long Retry-After;
and current visible/fresh-only join-target lookup. No network/live acceptance.

Commands actually run (no emit/build/install):

```sh
./node_modules/.bin/tsx --test test/upcoming-meetings.test.ts
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM,DOM.Iterable --strict --noUncheckedIndexedAccess --skipLibCheck --types node src/upcoming-meetings.ts test/upcoming-meetings.test.ts
```

## Official public sources

Some current API pages omit the specification from rendered text and are large.
Their exact API descriptions/parameters/response schema were read from the public
HTML's embedded `window.__INITIAL_STATE__` /
`apiReference.entry.entries[].versions[].spec`, not a private API or login.

1. [List Meetings](https://developer.webex.com/docs/api/v1/meetings/list-meetings):
   host/invitee series coverage, recurrence overlap/current behavior, exact
   query/header parameters, UTC default, pagination, response `webLink`, states,
   site and ad-hoc/product limitations.
2. [Meetings Overview](https://developer.webex.com/meeting/docs/meetings#meetings-api-scopes):
   explicit List Meetings user/admin scope table, CI/subscriber prerequisite,
   series/scheduled/instance modeling, state meanings and available attributes.
3. [Integration Scopes](https://developer.webex.com/docs/integration-scopes):
   known grants, user permission constraints and distinct meeting/user scopes;
   no proof here that `spark:all` substitutes for `meeting:schedules_read`.
4. [REST API Basics](https://developer.webex.com/docs/basics#rate-limiting):
   RFC5988 pagination, fine-grained/shared user rate limits and `429/Retry-After`.
