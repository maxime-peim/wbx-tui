# USER5: people presence/custom-status capability gate

**Current native default:** selected-peer presence now defaults **on**, following
the user's later client-defaults request. Explicit `people_status=false` remains
an opt-out; known-grant/identity/privacy checks are unchanged. See the
[defaults and popup follow-up](people-popup-design.md). The dated original
decision/evidence below records the earlier default-off boundary.

**Current UI-review follow-up:** visible direct chats load presence without being
opened. The engine refreshes the selected/visible bounded peer set every
**60 seconds**, respecting existing cache/admission, grants and Retry-After.
This is not roster-wide polling or a real-time subscription. Spaces show distinct
status icons for all actually visible direct rows (up to 128), plus the selected peer; stale,
unknown and unobserved peers are neutral. Groups/cached rows have no icons.
The display-only cues are 🟢 active, 📞 call, 📹 meeting, ⛔ DND, 🖥️ presenting,
🌙 inactive (not offline), 🏖️ out of office, ⏳ pending and `?` unknown/undisclosed.
The meeting cue does not claim that Webex disclosed whether the camera is on.
During a refresh the last-known icon remains, with neutral stale styling; only
expired/unobserved values become `?`. Full status/freshness text remains readable
in the header and native details without emoji support. Neovim 0.10+ reserves a
two-cell **statuscolumn slot after the line numbers**, outside the buffer text
area. It delegates the original gutter, including click regions, and restores it
on leaving Spaces. Later explicit local overrides win. Vim/older Neovim use their
native sign gutter because they cannot append a statuscolumn slot.
No inline virtual text or text properties enter the space-name area. Other signs,
numbering, highlights, buffer text and undo remain intact.
Passive presence is automatically visible in a compact selected-DM float, the
DM header and Spaces cues. The float consumes existing published observations,
not another lookup/polling owner. It preserves focus/full native undo, follows
the clean history pane, respects dismissal and blocks receipts for covered rows.
`:WebexPeople` now opens a navigable native **read-only local snapshot**, not a
popup or provider lookup. Local `r` refreshes published text; `q` returns to the
exact originating window. Native search/motions/copy work without syntax/color.
Enter/write never send or acknowledge. `:WebexPeopleRefresh` is the separate
explicit provider read; opt-out, known capability/grant and current selected-DM
guards apply, plus clean matching room/session context when invoked from details.
Callbacks never repaint/focus/reopen snapshots; annotations/promoted buffers and
full undo are retained. Newly generated opted-out views mask retained People
fields. Opening native details dismisses the compact float for that selection.
The historical research/verification below is not acceptance of this
later follow-up; see the [verification index](verification-index.md).

**Presence/picker correction:** native cues are rebound after buffer text changes,
even when row metadata is unchanged; text replacement must not move a person's
cue onto a title tail or another room. Verified `bot`/`appuser`/unsupported peers
have no person cue or automatic presence popup/header. A title such as “South
Team Communications” is never used to guess whether a peer is a person.
Unknown/unavailable details give a concise allowlisted reason (not loaded,
undisclosed, timeout, target refusal, etc.), not an invented Active/Busy/Offline.
The later read-only check of a peer's already-published snapshot found a resolved
identity, `unknown-status`, and a last-activity timestamp. That does not establish
Busy, offline, a privacy restriction, or an identity failure.

**Whole-viewport follow-up:** new hello submode `peopleViewport: ['paged-v1']`
and `people.viewport {roomIds}` carry up to 128 unique live visible direct rows,
not arbitrary people/rooms. The engine retains their sanitized observations as
the viewport changes, without adding another provider or pool.
Refresh becomes due after 60 seconds; completing a large viewport may take longer
under paced admission or provider cooldown. Verified visible peers use the documented
[`GET /people?id=...` batch endpoint](https://developer.webex.com/messaging/docs/api/v1/people/list-people),
with at most **85 exact IDs per request**. Results are matched by ID, never order;
omitted/unknown statuses stay honest, and unsolicited/duplicate identities are rejected.
One batch spends one status-request start, not one start per person.
Cold peers still require exact complete two-member rosters. Two continuous HTTP
readers resolve the entire reported batch, sharing one cancellable self bootstrap,
then one People GET retrieves all resolved statuses. There is no two-person
display turn or artificial two-second pause between roster pairs. The work list
is bounded to 85 reported rows; cancellation/deadlines also cancel queued work.
Queue time has a finite wave-based budget, separate from each physical request's
eight-second deadline; healthy queued peers do not all time out before the batch GET.
There is no documented roster batch here, so actual network latency still limits
cold completion; a one-second SLA is not claimed.
Legacy non-viewport reads retain their single-start policy. Status batches retain
the rolling two-start/two-second ceiling and service Retry-After.
Identity and status stages within this owner share two physical slots, including
HTTP/body cleanup that continues after cancellation; the logical deadline does
not admit replacement HTTP while both native slots are still occupied.
Observed status is retained separately for up to **500 loaded live direct rows**
in this account/session. Offscreen does not mean forgotten: returning within the
60-second freshness window shows the cached badge immediately and does not
refetch it. Verified peer mappings are also retained for up to five minutes across
scrolling (at most 500, session-local, revoked/unloaded rows pruned).
A relevance cache miss cannot overwrite that known
observation. Older values remain truthfully stale/expired; only visible due rows
get background HTTP turns. Unloaded/retyped/revoked rows, denied capability and
session replacement clear the applicable observations. No presence is persisted
to disk and no cached label/observation becomes membership or send authority.
Same-application/account token renewal with unchanged grants now keeps the
provider, viewport, observations and existing minute timer. It does not issue a
lookup or depend on an unchanged editor viewport report being sent again.
Grant changes, true session/account replacement, denial and expiry keep their
separate invalidation/admission guards.
The legacy eight-row submode below
remains compatible. Hiding/annotating a list removes relevance, and unknown/Busy
limitations remain truthful.

## Manual Busy provider limitation

The documented REST `status` enum does not include manually selected **Busy**.
Cisco's [developer support response, May 25, 2025](https://community.cisco.com/t5/webex-for-developers/retrieve-new-quot-busy-quot-status-via-rest-api/m-p/5293565)
confirms that this can be returned as `unknown` and that `/people` improvement
was not planned at that time. A documentation/search recheck on 2026-11-16 found
no new REST Busy contract; the commercial reference pages returned an app shell,
so this is not a live response verification or proof about every deployment.
Do not turn all unknown/missing statuses into Busy or conflate Busy with DND.
The UI's busy-colored category covers only documented call/meeting/presenting/DND.
  Mobile SDK presence lists Busy, but that is not an approved compatible Node
provider. No alternate SDK/service, scope or device registration is activated here.

The user reported a peer as Busy in the Webex client. An explicitly
authorized one-off read-only query of the public JS SDK presence service's
`POST compositions` lookup, through the existing registered SDK worker and
the peer's already-verified unexpired identity, also returned **HTTP 200, `unknown`**
in **480 ms**. Both temporary loopback debuggers were closed. No raw payload,
credential, subscription, setting/status write, install or extra SDK session.
That query did not recover Busy, so no second provider or unknown→Busy mapping
was added. This result applies to that read, not a claim about every client/token.
A separately authorized passive capture of the peer's next normal People REST
response also confirmed literal **`unknown`**, not a filtered `busy` value.
It issued no extra API request; the backend debugger was closed afterward.

Research date: **2026-11-09**. User decision: **Presence opt-in (Recommended)** —
implement presence only, disabled by default, with existing-grant checks and no
scope/configuration changes. Delivery includes the bounded provider, selected-room
identity adapter, backend/RPC integration, protocol validation and a read-only
details helper. The native owner wires `WebexPeople`, the header and option forwarding.
No live Webex request, private credential/config inspection, actual OAuth flow,
active-editor inspection/reload, device/media action, status mutation, installed
configuration change, dependency change, install or build was performed. Tests use
synthetic fixtures and fresh isolated editor processes only.

## Supported contract and precise blocker

An ordinary authorized user integration can read the public People REST API for
**presence snapshots**, within the API's organization/status-sharing restrictions.
No administrator role is required for a known person's details with
`spark:people_read`. This does not guarantee that presence will be disclosed.

`GET https://webexapis.com/v1/people/{personId}` documents:

| Field | Public type | Meaning / treatment |
| --- | --- | --- |
| `id` | string | Opaque person ID; must exactly match the requested ID. |
| `displayName` | string | Optional plain display text; sanitized to one line, 120 Unicode code points. Never used as identity. |
| `status` | string enum | `active`, `call`, `DoNotDisturb`, `inactive`, `meeting`, `OutOfOffice`, `pending`, `presenting`, `unknown`. |
| `lastActivity` | string | Optional last Webex activity timestamp, **not** a presence-change timestamp or observation timestamp. |
| `type` | string enum | `person`, `bot`, `appuser`; non-person/invalid types produce unknown presence in this provider. |

`active` means active within the last 10 minutes. `inactive` means last activity
more than 10 minutes ago: **it does not mean offline**. `pending` means never
logged in, not offline. Unknown, omitted, null, invalid, and future/novel statuses
are never converted to offline, active, or an inferred status from activity dates.

Presence properties (`status`, `lastActivity`) are returned only for people in
the requester's organization or an organization they manage. The API explicitly
says these properties are not shown if the authenticated user has disabled
status sharing. The linked help article confirms that disabling one's own
status-sharing also prevents seeing others' statuses. Organization/privacy
restrictions are not bypassed; omission cannot identify a specific policy cause.
Do not promise cross-organization presence even if identity/profile details load.

**Custom-status text remains blocked for this Node/REST implementation.** The
reviewed People REST response schema has no `customStatus`, custom-status emoji,
expiration, or equivalent text field. Incoming undocumented fields of that name
are deliberately discarded; absence is **unsupported**, not “no custom status”.
Do not repurpose profile `title`, room title, `lastModified`, or message text.

There is a public **iOS Messaging SDK** Monitor Presence guide (SDK 3.10.0+), with
`startWatchingPresences` / `stopWatchingPresences`, `getCustomStatus(): String`,
`getLastActiveTime(): Long`, and `getExpiresTime(): Long`. That is evidence of a
different supported SDK surface, **not** evidence of a public Node/REST endpoint,
approved dependency, compatible identity, or authorized transport here. It is
not implemented or bridged via undocumented/private presence services. Complete
USER5 custom text therefore still needs a separately agreed, public supported
provider for this runtime. The user explicitly chose this REST-only presence
subset. Do not mark custom-status text complete or any part live accepted.

## Grants, approval, and identity mapping

The user approved implementing **disabled-by-default opt-in presence**. A session
must still explicitly enable it; existing `spark:all` alone never activates it.
The backend uses already-returned grant metadata, never probes credentials to
discover scopes, and never changes registered/requested grants or configuration.

Minimum ordinary user grants, if not already granted:

- `spark:people_read`: read known person's details, including `/people/me` if a
  verified self identity is not already available from the authorized session.
- `spark:memberships_read`: list people in rooms the user belongs to, if resolving
  a direct room's other person using `GET /v1/memberships?roomId=<id>&max=3`.
- Existing room discovery uses `spark:rooms_read`; it is not an identity or
  presence grant. No new room API is added here.

`spark:all` is documented as full user-account access; Webex's aggregate-scope
announcement explicitly includes user scopes such as `spark:people_read` and
excludes admin privileges. The provider accepts **known existing** `spark:all`
grant metadata, but still requires `enabled: true`. Do not silently append narrow
user scopes to `spark:all`, reauthorize, or assume a configured/requested scope was
actually granted. Unknown grants mean `scope-required`, with no API probe.
No admin/compliance, `identity:*`, write, or SDK-specific grants are requested.

Room details document that a direct room's `title` is the other person's display
name, not their person ID; `creatorId` is only the creator. Public Rooms responses
do not supply a guaranteed peer-ID field. Message sender/email/activity does not
resolve the peer reliably, especially with one-sided/empty history.

For direct headers, resolve using a **room-filtered**, authorized memberships
response plus a verified self person ID. Membership fields `roomId`, `personId`,
`personDisplayName`, `personEmail`, and `roomType` are documented. Use `personId`
only. Require a complete response, exactly two distinct person IDs, the expected
room ID, no item errors, no conflicting `roomType`, and membership of self.
Missing/incomplete/ambiguous/denied identity stays unknown. Never list all rooms'
memberships, search by title/email, enumerate the organization, or fetch people
for every message. The base `WebexPeopleProvider` does not resolve identities;
the selected-room adapter performs only the authorized self/room-filtered reads.

The memberships API requires belonging to the room. It documents partial
moderator-only lists for some moderated team spaces: a list is not automatically
complete. Follow no pagination in a direct-pair lookup: if any next-page link is
present, report incomplete rather than silently draining more pages. Do not pass
`complete: true` based merely on item count.

Do not use `GET /people?id=<ids>` for presence batching: its documented `id`
parameter explicitly **omits** `status` and `lastActivity`. Email lookups are
same/managed-organization restricted. The API discourages frequent large-set
presence polling because it leads to throttling.

## Exported boundary: `src/people-status.ts`

Values/functions:

- `PEOPLE_LIMITS`: fixed safety bounds, below.
- `WEBEX_PRESENCE`: the nine documented REST string values.
- `peopleId(value: unknown): value is string`: bounded opaque-ID syntax; rejects
  traversal, URL/query/control characters, and the contextual `me` alias. Opaque
  base64 characters/padding are allowed and path encoded, never decoded/guessed.
- `parsePeopleStatus(value: unknown, personId: string, observedAt: number):
  PeopleStatus | undefined`: validates matching identity/object/error state,
  sanitizes display text, and projects only supported fields. Activity timestamps
  must be real UTC ISO timestamps, non-future, and are normalized to ISO. Invalid
  optional timestamps are omitted, not used as status evidence.
- `directPersonFromMemberships(room: unknown, selfPersonId: unknown, page: unknown,
  complete = false): DirectPerson`: pure identity resolver, no networking.
- `peopleStatusLabel(status: PeopleStatus): string`: text labels including
  `Unknown`, `Presence unavailable`, `Presence off`, `Stale: …`, and
  `Inactive (not necessarily offline)`.
- `WebexPeopleProvider(options: PeopleProviderOptions)`: see methods below.

Types:

- `WebexPresence`: the documented literal-string union.
- `PeopleStatus`: `{ personId?: string; state: 'fresh' | 'stale' | 'unknown' |
  'unavailable'; presence: WebexPresence; customStatus: 'unsupported';
  observedAt?: number; displayName?: string; lastActivity?: string;
  reason?: PeopleReason; retryAt?: number }`.
- `PeopleReason`: allowlisted problem/state codes only: `off`, `scope-required`,
  `closed`, `denied`, `identity-missing`, `not-relevant`, `not-loaded`,
  `missing-status`, `unknown-status`, `pending`, `unsupported-person`, `aged`,
  `expired`, `invalid-data`, `not-found`, `not-shared`, `failed`, `rate-limited`, `busy`,
  `canceled`, `timeout`.
- `PeopleCapability`: `{ state: 'off' | 'scope-required' | 'ready' | 'denied' |
  'closed'; presence: 'rest-snapshot'; customStatus: 'unsupported';
  requiredScope: 'spark:people_read' }`. `ready` means local admission is enabled
  with known grants, **not** that live service/presence disclosure was verified.
- `DirectPerson`: `{ state: 'resolved'; personId: string }` or `{ state: 'unknown';
  reason: 'not-direct' | 'identity-missing' | 'incomplete-memberships' |
  'invalid-memberships' }`.
- `PeopleProviderOptions`: `{ enabled?: boolean; grantedScopes?: readonly string[];
  token: () => string; fetcher: typeof fetch; now?: () => number;
  timeoutMs?: number }`. Fetch is mandatory injection, never defaulted to global
  networking. `now` is a local millisecond clock; `timeoutMs` can shorten, never
  enlarge, the eight-second maximum.

Methods:

```ts
capability(): PeopleCapability
setRelevantPeople(ids: readonly unknown[]): boolean
peek(personId: unknown): PeopleStatus                    // never fetches
get(personId: unknown, signal?: AbortSignal): Promise<PeopleStatus>
getMany(ids: readonly string[], signal?: AbortSignal): Promise<PeopleStatus[]>
close(): void                                          // idempotent; permanent
```

An invalid/oversized relevance replacement fails atomically. Removed people lose
cached profile/status and their pending work is aborted. There is no automatic
fetch on constructing the provider, changing relevance, importing it, or peeking.
`get` is an explicit read, not a refresh bypass for freshness/cooldown limits.
Results are copied so one consumer cannot change another's cached observation.

### Bounds and freshness semantics

- At most **129 relevant people / cache entries**, **85 exact IDs per status batch**,
  **2 actual native operations**, **16 caller attachments per person/request**,
  **64 KiB** for a single response / **1 MiB** for a batch, and **1,024 body reads**.
  No work queue, subscriptions, event listener registry, retry loop, or polling
  timer. Canceled caller slots are not reused until that singleflight finishes,
  bounding retained Promise reactions too. Over-capacity returns `busy`; callers
  must not spin-retry it.
- One singleflight request per person. One canceled reader does not abort others;
  canceling the last reader cancels that peer; shared batch transport is aborted
  only when no peers survive. Relevance change/close abort all
  affected readers. Deadlines return within eight seconds, but an injected fetch
  or response-body cancellation that ignores abort **continues occupying native
  admission until it actually settles**. Late results cannot populate cache.
- At least **1 second between request starts** across this provider. This local
  budget is not a claim about Webex quota. Webex documents overlapping dynamic
  policies and quotas shared by user; `/people` has a dynamically adjusted quota.
  `429` sets a provider-wide cooldown honoring seconds/HTTP-date `Retry-After`,
  without truncating a long delay or retrying automatically. Missing/invalid
  retry delay falls back to 30 seconds. Other REST clients sharing this account
  still need coordinator-level budget coordination; this class cannot police them.
- Positive/unknown snapshots cache for **60 seconds**. Older observations are
  explicitly **stale**, not current; at **5 minutes**, or clock reversal, they
  become unknown and their old presence/profile fields are withheld. `observedAt`
  is the local observation time. These are conservative client retention bounds,
  not a server freshness SLA or real-time subscription.
- Failure responses are negatively cached for **30 seconds** (or longer server
  cooldown). A prior unexpired observation may remain visibly stale on refresh
  error, preserving its original observation timestamp. A new successful response
  omitting status clears earlier certainty. Cancellation/deadline returns unknown
  unavailable state without inventing a fresh observation.
- `401`, self-identity `/people/me` `403`, or unavailable credentials latch denial
  for the provider instance, clear its cache, and stop new requests. A `403` on an
  exact person or room-membership target instead produces `not-shared`, removes
  that target's prior certainty and respects the 30-second negative cache without
  disabling other authorized targets. It does not establish a specific privacy
  policy cause or permit alternate-route probing. Resume from session denial
  requires a separately authorized new instance; no automatic refresh/OAuth.
  `404`/`410` mean unavailable/not-found,
  never offline. Raw response/error/provider text and unrelated profile fields
  are never published, logged, or persisted by this boundary.

All implemented transport paths are fixed-origin public GETs: known person
details, bounded `/people?id=<exact-ids>&max=<count>`, `/people/me`, and
`/memberships?roomId=<encoded-id>&max=3`. Redirects are
refused, browser cookies/cache/referrer are omitted. No avatar URLs, pagination
links, undocumented services or mutation endpoints are followed. The shared
bounded decoder is `readPeopleJSON`; it and the allowlisted `PeopleRequestError`
are also exported for the selected-room adapter, not exposed over RPC.
Target-local refusal is an explicit presence-owner decoder option. Sender-name
and other shared-decoder callers retain their existing default denial semantics.

## Selected-room backend/RPC and native contract

`src/people-selected.ts` exports `WebexSelectedPeopleProvider`,
`SelectedPeopleStatus`, `SelectedPeopleReason`, `SELECTED_PEOPLE_REASONS`,
`emptyPeopleStatus()` and `validSelectedPeopleStatus()`. Its methods are
`selectRoom(room?)`, `setVisibleRooms(rooms)`, `snapshot()`, `roomSnapshots()`,
`visibleSnapshots()`, `lookup()`, relevant-only `lookupRoom(id)`, `lookupRooms(ids)`,
`retainRooms(ids)`, `nextStartAt()`
and idempotent `close()`.

The adapter requires both known user grants **before any identity request**. It
verifies self using public `/people/me`, caches only that ID for five minutes,
and caches verified room-peer identities for five minutes. Selection or
viewport changes discard/abort status work outside the combined 129-room set; still
visible peers remain relevant without becoming the selected destination.
Late results cannot recreate removed entries. Selected/visible reads of the
same room share one flight. The adapter admits at most two
native operations shared by identity and presence; unresolved canceled
transports/body cleanup retain their admission slots. There is no second pool.

Standalone/legacy reads retain their identity start pacing; modern viewport
reads use two continuous physical readers, without a per-person delay. `/people/me`
and each room's membership validation remain ordered. Identity failures use
a 30-second negative retry deadline; `429` delay applies across selection changes.
The entire selected lookup has an eight-second deadline. No queue or retry timer
is added for standalone reads. Viewport work has one bounded cancellable list,
not one worker per person. Membership/self requests reuse the same 64 KiB/1,024-read decoder and
no-redirect/cancel-cleanup safeguards. Long server delays are never shortened.

The editor protocol remains version 1 with an additive `people-status` hello
capability. Request contract:

```ts
// Omitted flag means false; non-boolean values are rejected.
session.start({ mode, config?, readStatus?, peopleStatus?: boolean })
// Engine entry point is backward compatible:
engine.start(mode, path?, readStatus = false, peopleStatus = false)
// No parameters are accepted. In particular there are no personId/roomId fields.
people.lookup({})  // returns SelectedPeopleStatus
```

Explicit `rooms.select` / room-open and `people.lookup` trigger optional reads.
Native `peopleSpaces: ['visible-v1']` negotiation enables `people.spaces {roomIds}`
(unique, at most eight already-loaded noncached direct-room IDs). It changes
read relevance only, never selection/history/draft/receipt authority. A debounced
180ms native viewport/cursor report follows a small visible set around the list
cursor, not every loaded room. The selected peer has priority within the combined
eight-peer identity/status budget. Hidden/annotated spaces views report an empty
set; absent submode support sends no new RPC and preserves old-client compatibility.

One engine timer refreshes selected/visible peers at 60-second intervals
(or the later Retry-After deadline), with at least one second between lookups.
It reuses the same lookup, singleflight and bounded identity/presence owners.
No timer is owned by the base provider itself. Group selection, disconnect,
provider replacement, missing grants, denial and expired credentials stop the
engine timer; auth renewal alone does not restart reads. Selecting a group stops
only selected-peer reads, not the independently requested visible direct peers.
Connecting, snapshots, history polling/paging, room-list refresh, messages,
and background token renewal do not trigger people requests. Reopening/details
honor TTLs instead of bypassing caches. Room-open/focus responses do not wait for
the optional people service: the lookup runs separately and publishes loading /
final state with the same generation guards. Demo reports unavailable/demo without a
provider or network. Missing grants report exactly which scope is required, with
no dependency installation or network probe. `401` or self `403` is session
denial; target `403` is unavailable/not-shared, never offline. A new authorization ownership object is established on the existing
auth-refresh path, but it does not read people automatically or add grants.

Every engine snapshot includes the following **flat**, bounded `peopleStatus`:

```ts
interface SelectedPeopleStatus {
  capability: 'off' | 'scope-required' | 'ready' | 'unavailable';
  state: 'fresh' | 'stale' | 'unknown' | 'unavailable' | 'loading';
  presence: WebexPresence;  // exact nine documented REST enum strings above
  customStatus: 'unsupported';
  roomId?: string;         // selected room only; never a person ID
  reason?: SelectedPeopleReason;
  requiredScope?: 'spark:people_read' | 'spark:memberships_read';
  observedAt?: number;     // safe integer local epoch milliseconds
  retryAt?: number;        // safe integer local epoch milliseconds
  displayName?: string;    // inert single line, <= 120 Unicode code points
  lastActivity?: string;   // normalized UTC ISO string, exactly 24 characters
}
```

`SelectedPeopleReason` is the base reason allowlist plus `not-direct`,
`not-selected`, `incomplete-memberships`, `invalid-memberships`, `demo` and
`not-connected`. `ready` is local capability admission, not live acceptance or a
promise that presence is disclosed. Fresh/stale observations require a matching
selected direct room and observation time. Unknown is not offline; expired data
withholds prior display/profile fields. Unknown extra properties, credentials,
raw errors/custom text, controls, bidi characters, malformed times and incorrect
types are rejected by both TS projection validation and the Vim protocol validator.
The Vim state validator also rejects a status for a different selected room.

`autoload/wbx/people.vim` exports these native helper APIs:

- `wbx#people#line(peopleStatus)`: plain header text; no RPC or fetching.
- `wbx#people#lines(peopleStatus)`: inert detail lines with available observation,
  last-activity and retry times; no command tutorial or custom-text disclaimer.
- `wbx#people#observe(state)` / `badge(room)`: an eight-entry, session-bound native
  presentation cache of already-verified selected peers. No fetch or identity
  inference; stale/unknown data uses `WbxPresenceUnknown`. A local expiry timer
  recolors only unchanged owned spaces views without touching text/undo.
- `wbx#people#show()`: opens/regenerates `wbx://people-details` through the shared
  native-list helper, using only validated, selected-room-associated local data.
  Returns the buffer number, or `0` on ownership refusal. No provider request.
  Disabled, missing-grant, group and disconnected views stay local too.
- `wbx#people#refresh()`: separate explicit `people.lookup {}` using the current
  selected-DM owner, never an ID from snapshot text. Opt-out, ready state and known
  capability/grant/room association are checked before RPC. A details buffer adds
  a clean owned snapshot and matching current room/session refusal guard.
- `wbx#people#_state()` / `sync(state)`: observe passive state and schedule the
  unchanged viewport reporting. Never create, update, close or focus details.
- `wbx#people#obscures(window,row)`: zero-return compatibility hook for the
  unchanged history endpoint guard; native splits do not overlay history.
- `wbx#protocol#people(value)`: fail-closed public validator for the result object.

Shared native-list ownership uses the canonical buffer name, `nofile` type, kind
and rendered `changedtick`, not merely `modified`. `r` and `q` preserve user mapping
conflicts/opt-outs. Edited/renamed/type-promoted text is never rewritten or closed;
refresh callbacks only validate their inert result and passive state.
Exact returns are window-local. A subsequent explicit command may generate a
separate view only if the canonical name is free/clean; foreign placeholders
(including native alternate-name buffers left by a rename) are not reclaimed.

The native owner should register `:WebexPeople` → `wbx#people#show()`, forward
`people_status` (native default **1**, explicit false opts out) as the session's JSON boolean `peopleStatus`, and
use `wbx#people#line(snapshot.peopleStatus)` in the selected direct header. Never
fetch presence for every message/room row or evaluate a display name as statusline syntax,
commands, expressions, Markdown, HTML or mappings. Background state/people reads
must not move focus, change drafts/undo, send messages or acknowledge receipts.

Disconnect/shutdown closes the optional source and resets the snapshot to OFF;
room/session generations prevent stale publication. The existing shutdown
admission barrier also rejects `people.lookup` while an explicit meeting leave
waits, retaining read-only `state.get` and the final shutdown response. Existing
native config imports, `historyLatest` snapshot and known-newest receipt guard
remain preserved. No private API, provider dependency, OAuth scope/config write,
automatic reconnect, profile/status mutation or roster-wide presence polling is
introduced. Live interoperability/freshness remains a separate approval gate.

## Offline verification

Linux, Node **v25.2.1**. Earlier integration validation:
`test/people-status.test.ts`: **32 passed**; `test/people-integration.test.ts`:
**17 passed**; nine focused existing RPC/shutdown/read-status/receipt fixtures
also passed. The final native-helper review reran `test/people-editor.test.ts`
with a known full Vim binary: **Neovim PASS, Vim PASS, zero skips**, plus its
targeted strict typecheck. That review changed only the helper, its editor fixture
and this document; backend/snapshot schema was unchanged. These are separate
fixture results, not a claim that the full suite or backend fixtures were rerun
for the helper-only review.
Every provider transport is injected mock `Response` objects or controlled
promises/streams. Integration tests mock OAuth methods and messaging REST,
explicitly forbid global fetch, and use only synthetic private config documents.
Editor fixtures launch fresh clean processes with a fake RPC/autoload, never the
application worker, active editor or installed configuration. No network socket,
real OAuth flow, browser, SDK, reconnect, message, receipt or media path is used.

Commands actually run (no emit, no build/install):

```sh
./node_modules/.bin/tsx --test test/people-status.test.ts test/people-integration.test.ts
WBX_VIM=/tmp/opencode/wbx-vim-0h_87kwo/vim-88d96a15f99851faca0cacbbbdcede3f8c25149b/src/vim WBX_STRICT_EDITORS=1 ./node_modules/.bin/tsx --test test/people-editor.test.ts
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM,DOM.Iterable --strict --noUncheckedIndexedAccess --skipLibCheck --types node test/people-editor.test.ts
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM,DOM.Iterable --strict --noUncheckedIndexedAccess --skipLibCheck --types node src/editor-engine.ts src/editor-protocol.ts src/editor-worker.ts src/people-status.ts src/people-selected.ts test/people-integration.test.ts test/people-status.test.ts test/people-editor.test.ts
./node_modules/.bin/tsx --test --test-name-pattern 'typed RPC|typed shutdown|demo editor engine|shutdown admission|engine uses server unread dates|REST-only startup|first visible live spaces|disconnect during initial unread' test/editor.test.ts test/read-status.test.ts
```

Coverage includes all documented statuses; unknown/missing/novel/bot status;
custom-text rejection; bounded sanitized Unicode names; strict identity/timestamp
validation; missing/incomplete/ambiguous/mismatched room memberships; default-off
and scope gates; fixed-origin GET/path encoding; bounded cache, TTL/stale/expiry;
singleflight/waiter saturation; independent/last-reader cancellation;
uncooperative transport/body cleanup; body deadline, byte/read bounds; denial;
negative caching; network errors; `Retry-After` seconds/dates/long cooldowns;
malformed JSON/UTF-8; disconnect/relevance replacement; late-result suppression;
and credential validation without contacting a service.
Both real editor fixtures additionally exercise the keyboard open/dismiss/reopen
path, dismissal while lookup is pending, old-reply/state suppression, external
window dismissal, local-only OFF/default/missing-grant details, and preservation
of focus, draft text, viewport and undo. Each runs all three ownership changes
(changedtick edits with `nomodified`/`nomodifiable`, rename, `buftype` promotion)
through state redraw, disconnect/close, pending-reply and direct command-repeat
paths. Released user copies remain intact through later explicit popup
opens/dismissals.

| Gate | Result |
| --- | --- |
| Public documented ordinary-user presence subset | Supported with grants and organization/privacy restrictions |
| Public REST custom-text support | **Blocked: no documented field/provider for this runtime** |
| Isolated implementation / mocked fixtures / targeted typecheck | PASS |
| Backend/selected identity/RPC/protocol/details helper | Implemented; focused offline tests PASS |
| Neovim / full Vim helper toggle and ownership fixtures | PASS / PASS, strict admission, zero skips |
| Native command/header/option wiring | Owned by native/coordinator agent; not edited by this slice |
| Presence-only opt-in implementation | APPROVED; default OFF; no installed configuration change |
| New scopes/configuration, dependencies, custom-status text | Not added / not silently authorized |
| Live freshness, policy behavior, cross-client interoperability | **NOT RUN** |

## Official public sources

All accessed read-only; no authenticated service access. The current developer
portal leaves some API details out of its rendered text; those details were read
from its public HTML's embedded `window.__INITIAL_STATE__` API specification
(`apiReference.entry.entries[].versions[].spec`), not a private API or token.

1. [People overview](https://developer.webex.com/messaging/docs/api/v1/people):
   ordinary `spark:people_read`, admin-only full directory/mutation distinction.
2. [Get Person Details](https://developer.webex.com/docs/api/v1/people/get-person-details):
   GET contract, exact fields/enums, organization/status-sharing restrictions.
3. [List People](https://developer.webex.com/docs/api/v1/people/list-people):
   polling warning, email restriction, `id` batching omits presence.
4. [Get Room Details](https://developer.webex.com/docs/api/v1/rooms/get-room-details):
   direct title is display name; membership API recommended for other-person identity.
5. [List Memberships](https://developer.webex.com/docs/api/v1/memberships/list-memberships):
   room/person filters, identity fields, pagination, moderator-only-list caveat;
   [Memberships overview](https://developer.webex.com/docs/api/v1/memberships):
   room membership/access restriction.
6. [Integration Scopes](https://developer.webex.com/docs/integration-scopes):
   `spark:people_read`, `spark:memberships_read`, `spark:rooms_read`, `spark:all`,
   scope selection and user-role constraints.
7. [There is a New Integration Scope in Town!](https://developer.webex.com/blog/there-is-a-new-integration-scope-in-town-)
   (2017): official aggregate `spark:all` explanation, user scopes only, no admin
   privilege, do not append additional user scopes to the aggregate.
8. [REST API Basics — Rate Limiting](https://developer.webex.com/docs/basics#rate-limiting):
   overlapping dynamic rate limits, shared user quota, `429` / `Retry-After`.
9. [iOS SDK Monitor Presence](https://developer.webex.com/messaging/docs/sdks/ios-messaging-sdk-monitor-presence):
   public SDK custom-text/expiry surface; **not used as a REST/Node contract**.
10. [Webex App — Stop Sharing Your Status](https://help.webex.com/nkzs6wl/)
    (updated March 7, 2026): status-sharing reciprocity/privacy restriction.
