# Feature boundaries and incremental simplification

The bounded offline architecture refactor/checklist is **complete**, not a
whole-application rewrite or live-service/device/operator acceptance claim.
Examples are the upcoming agenda, presence/read-source lifecycles and composed native connection/request
owners. Evidence is indexed in
[verification](verification-index.md). Existing wire/native APIs and safety
guards remain compatibility boundaries; checkout bundles are not replaced.

The [bounded coordinator audit](coordinator-audit.md) inventories every remaining
field/routine in the application, native and bridging RPC coordinators. That
review is complete: its finite **C1–C4** offline checklist replaces an open-ended
“broader review” milestone. It separates two reproduced defects from two
coverage gaps and lists live/operator acceptance independently. Backend
message/conversation reset does **not** uniformly retain unknown ledgers;
native retained evidence and physical admission are separate facts.
**C2 is fixed:** the existing conversation owner moves dispatch-bound metadata
evidence to a disjoint, jointly bounded retired request section on reset.
Explicit wire recovery freshly proves the same authenticated account/config/
OAuth-profile partition; it never adopts old results or retries mutations.
Synchronous same-session APIs and legacy nonmetadata reset rules are unchanged.
Normal metadata proof supplies self without a duplicate identity lookup; the
configured identity owner only computes the partition and does not seed storage
identity. Process loss is not durable recovery.
**C1 is fixed:** header syntax owns timestamp/text colors; block decorations
retain rails rather than painting over the complete header. The original UI,
metadata-bucket and Markdown fixtures pass headless/drawn in both editors; UI
is included in focused acceptance with a regression against omission.
**C3 is closed:** a 36-case controlled held-I/O matrix drives actual engine/RPC,
draft/content/metadata/upload owners together. It proves failed-state cleanup
before a generation change, explicit stop/replacement fencing, physical GET/
socket/snapshot-FD admission and successful fresh storage/content/write work.
No runtime defect was reproduced or new coordinator/state registry added.
**C4 is closed:** actual editor entry/framing/output and default SDK-worker
fork/IPC drive Vim/Neovim headless/drawn through source failure, stale/unknown
Health, explicit refresh, exact invalidation and successful new native work.
Only private synthetic I/O/SDK boundaries are substituted; no production test
commands, retries or additional state owners were added. L1–L3 remain NOT RUN.

### Tracing a failure across layers

Follow **request → owner → observation → projection**, not every reset counter:

1. `auth.refresh` enters `EditorLines`/`EditorRPC`; the engine renews credentials
   and explicitly starts a fresh `ReadSourceLifecycle` owner.
2. `ReadStatusWorker` forks the real worker; SDK events are normalized and
   validated over private IPC. Terminal failure retires this source epoch,
   not the application/UI session. Historical unread belongs to
   `RetainedUnread`; never-observed rooms remain unknown.
3. Exact message deletion/self-membership loss reaches the current
   `MessagingStore` and native `room.revoked`; incomplete/wrong-room evidence
   cannot infer absence. Stale SDK/REST responses cannot restore authority.
4. `editorOutput` preserves ordered responses/state lanes; native ingress admits
   revisions. `WebexHealth` separates backend/protocol readiness from source
   health/cached unread; native buffers/focus/undo remain native work.

For a new cross-layer feature, keep its domain/lifetime/physical-admission owner
in the ownership table below, add only the finite RPC/native adapters, and pair
its guard tests with an explicit successful recovery/new-work path.
`test/editor/sdk-native-recovery.vim` demonstrates that pattern with a private
two-entry build and whitelisted Health/request/process traces. It is not an
installed-SDK or live integration replacement.

## Ownership, not just smaller files

| Layer | Owns | Must not own |
| --- | --- | --- |
| Application composition: `editor-engine.ts` | Login/session validity, shared owner construction, application snapshot/event assembly | Feature timers, feature projection caches or feature-local refresh rules |
| Backend provider construction: `backend-providers.ts` | Concrete default factories, lazy read/presence/agenda/name construction ports, exact option mapping and messaging API/store selection | Provider handles, OAuth credentials, validity/expiry policy, feature/source/session lifetimes, timers, state publication or a service registry |
| Demo REST adapter: `demo-rest.ts` | Stateless translation of existing REST-shaped demo People/member/room/Team/message calls into synthetic responses or narrow sandbox operations | Live transport, OAuth, admission/roles, mutation ledgers, retries, timers, sandbox data or publication |
| Demo reaction provider: `demo-reactions.ts` | Engine-lifetime exact room/message synthetic groups, detached complete summaries/batches, own-handle add/remove responses | Inspection/consent, loaded-target admission, preparation/request ledgers, uncertainty, source/session validity, live SDK or publication |
| Demo recipient-file posting: `demo-recipient-file.ts` | Stateless staged-stream consumption, caller submission callback and exact synthetic recipient/bound-room post fields with late store lookup | File acquisition/snapshots/cleanup, upload admission, recipient verification, outcome/uncertainty ledgers, live multipart or state publication |
| Demo sandbox: `messaging-api.ts` via `MessagingStore` | Existing per-session synthetic rooms/history/memberships/Teams and demo mutation semantics | Engine composition, native focus, live-service authority or a second REST routing table |
| Feature lifecycle: `upcoming-agenda.ts` | One provider handle, one reconciliation timer, committed URL-free projection/revision, refresh/change notification | OAuth, messaging selection, RPC routing, native focus, starting/joining meetings |
| Provider: `upcoming-meetings.ts` | Fixed service query, grant gate, parsing, bounded reads, physical admission, TTL/backoff | Application broadcasts, native rows or user action dispatch |
| Presence lifecycle: `presence-lifecycle.ts` | Selected/viewport relevance, one refresh timer, rolling turns and retained session observations | Messaging store, OAuth, wire decoding, peer inference, HTTP implementation or SDK source health |
| Presence providers: `people-selected.ts` / `people-status.ts` | Exact self/membership/peer verification, bounded identity/status queries, TTL/Retry-After and shared physical admission | Application/session composition, viewport-report admission, native rendering or write authority |
| Current read source: `read-source-lifecycle.ts` | Source construction/replacement fences, health/diagnostics, fresh-room set, bounded startup changes and message-event evidence | Retained unread ledger, disk flags/cache age, messaging/store selection, OAuth, receipts inferred from events |
| Historical unread: `retained-unread.ts` | Last-confirmed SDK status, maximum actual activity, bounded eviction and configuration-fingerprint reset | Current-source health/freshness, disk booleans/age/account identity, fetching, publication or receipt admission |
| Disk hints: `disk-cache-lifecycle.ts` | Verified cache binding, restored display hints/flag ages, expiry and coalesced write admission | OAuth/identity probing, live membership/unread authority, draft/preference I/O or physical filesystem serialization |
| Verified storage identity: `verified-storage-identity.ts` | Detached authenticated profile binding, verified storage key and one shared pending lookup with session/grant fences | OAuth/abort ownership, file I/O, cache/preference binding, physical consumer admission, publication or mutation authority |
| Local preference lifecycle: `section-preferences-lifecycle.ts` | Local grouping projection/visibility, revisioned edits, monotonic user intent, automatic restore and explicit load/save/clear with one physical I/O reservation | Identity probing, disk binding/cache state, OAuth, private-file validation, messaging selection or server mutation |
| Local preference model/storage: `local-sections.ts` | Bounded semantic edits/detached snapshots and private versioned preference files/locks/atomic commit validation | Application session/publication, automatic restore policy or physical admission shared across session reset |
| Local draft lifecycle: `local-drafts-lifecycle.ts` | Successfully opened profile, one physical open/save reservation, demo partition and revision-addressed room/reply patch sequencing | Identity probing/caching, safe-file implementation, native draft text/undo, state publication, send consent or delivery uncertainty |
| Local draft storage: `local-drafts.ts` | Private bounded/versioned draft files, content revisions, locks, safe paths/modes and commit checks | Session/profile-open admission, patch orchestration, native text, identity or service requests |
| Disk storage: `spaces-cache.ts` | Bounded private-file validation, fixed account-keyed slots, atomic writes and physical commit/clear serialization | Application publication, session composition, source freshness or timers for display expiry |
| Wire: `editor-protocol.ts` / `editor-worker.ts` | Closed input validation, correlation/replay bounds, finite routing, output scheduling | Duplicated provider/cache state or a generic arbitrary-provider tunnel |
| Native feature: `upcoming.vim` | Local text/row projection | URLs, credentials, fetching while rendering, join authority |
| Native request channel: `rpc_channel.vim` | Monotonic request IDs, pending callbacks, bounded startup FIFO, per-request passive-error policy | Jobs, buffers, focus, domain state, feature caches or write uncertainty |
| Native connection: `connection.vim` | Command admission, handshake readiness/assertions, transport-loss bookkeeping and one composed request channel | Domain session authority, view/cache state, physical job generations, mutation replay |
| Native workspace: `workspace.vim` | Managed projection handles, collision-safe initialization/rename, explicit tab/split open/repair/show and temporary statusline ownership | Domain sessions, draft text/delivery, rendering, request-focus/receipt/write admission or physical media jobs |
| Native renderer: `render.vim` | Rooms/history assembly, guarded surface/metadata commits, syntax/image placement coordination, visible composer synchronization and redraw signatures | Workspace construction, domain/session state, request/receipt authority, delivery uncertainty ownership or feature read scheduling |
| Native render request: `render_request.vim` | Synchronous presentation attempt, E565-only cache interruption and one coalesced bounded redraw timer fenced by current lifetime/request identity | ACK payloads/events, application snapshots, sends, delivery outcomes/clears, uncertainty, RPC or a new session-generation registry |
| Native view primitives: `view.vim` | Exact buffer ownership, guarded sparse writes, annotation/unload protection and per-window identity/view restoration | Deciding whether a delivery may clear a draft, fetching or application state transitions |
| Native room selection: `selection.vim` | Selection intent serial, pending focus, duplicate/loading/local-resume policy, response/origin checks and cancellation | RPC ID/callback registry, accepted domain state, physical transport, history projection, receipts or delivery state |
| Native history activation: `history_activation.vim` | Guarded ensure/show/setup/local-open sequencing, fresh newest endpoint checks, one pending receipt and bounded attempted/known endpoints | Selection origin/intent serial, RPC correlation/transport, backend source freshness, authoritative unread, delivery or native buffer text |
| Native composer send action: `send_action.vim` | Explicit composer admission, rich consent, post-consent exact-intent rechecks, pending registration, finite wire route and correlated RPC error handling | Draft text/undo, pending/uncertainty storage, recipient sends, successful-delivery clear/retry, session policy or RPC callback registry |
| Native successful-delivery clear: `delivery_clear.vim` | Exact acknowledged composer/session/text/revision/format/attachment admission, confirmed-sent marker and bounded local-write retry/observations | Sending, delivery correlation/outcomes, uncertain-state resolution, upload retirement, application state or a second pending/timer registry |
| Native bound delivery recovery: `delivery_recovery.vim` | Explicit selected-room request, captured native intent/uncertainty evidence, exact ACK validation and guarded persistence observation | Uncertainty storage, send/clear/outcome processing, RPC correlation, automatic retries or a new pending/session registry |
| Native attachment action: `attachment_open.vim` | Explicit open/download selection, the existing busy/serial/generation/intent lifetime, typed/chunk/legacy dispatch, response checks, handoff and cancellation | Physical sink/file/handler jobs, bytes/integrity/credit, image snapshots, RPC correlation, application sessions or a second state registry |
| Native image requests: `image_request.vim` | Visible-preview attempt budget, one shared identity-bound read reservation, explicit open and source-qualified history reuse | Image bytes/snapshot storage/rendering, external viewer/private-file leases, physical backend admission, RPC correlation or another session/source registry |
| Native meeting action: `meeting_action.vim` | Existing independent meeting/event/epoch/view intent and sole pane request; explicit start/present/control/upcoming/recovery dispatch | Messaging readiness/session, menu construction, terminal job/buffer generations, tmux/media owner, transmission or RPC correlation |
| Native delivery ingress: `delivery_ingress.vim` | Accepted room-delivery outcome/effect ordering and retirement on accepted messaging-session changes | Pending/uncertain draft evidence, sends/retries, native write policy, recipient delivery, RPC correlation or another session/outcome ledger |
| Native space-picker: `space_picker.vim` | Detached loaded-space choice labels/context, latest-picker serial, exact choice admission, native/Vim-provider handoff | Room-request correlation/focus, history activation, receipts, provider internals, another session counter or remote search/cache authority |
| Native meeting-status: `meeting_status.vim` | Stateless detailed/compact text from accepted meeting/event/connection inputs | Event/session storage, command admission, media transmission/process truth, recovery, terminal jobs or native write/focus policy |
| Call pane physical lifetime: `call-panes.ts` | Tracked tmux source panes, geometry/source controls and exact auxiliary-pane cleanup when the owning call ends | Treating broker loss as call end, killing the media-owner/foreign panes or entire sessions, native editor client generations or service-send recovery |
| Native buffer setup: `buffer_setup.vim` | Per-buffer initialization, native FileType ordering/defaults, exact default-map install/release, promotion cleanup and draft presentation setup | Workspace handles, accepted domain state, request/receipt/send authority, feature scheduling or a parallel mapping registry |
| Native application: `autoload/wbx.vim` | Workspace/feature composition, validated domain-state application/cleanup and exact user-action boundary | Workspace handle/rename registries, projection signatures, buffer setup/mapping policy, transport readiness/assertions or request correlation; action decomposition remains |

These are responsibility rules, not a new service/plugin framework. Existing
features do not become implementations of a generic base class.

### Agenda example

`UpcomingAgenda` takes two ports: `create(session)` and `changed()`. Its provider
port exposes only snapshot/refresh/session replacement/join-target lookup/close.
The engine supplies a session's abort signal and a derived `active()` predicate;
the feature never reaches into the engine's private fields.

The engine keeps the existing constructor-injection compatibility and six small
integration operations: start, stop, snapshot, refresh, join-target lookup and
explicit publication reconciliation. Five agenda state fields and all agenda
timer/projection logic leave the engine. One owner handle replaces independent
source/generation comparisons inside the feature; no extra global epoch or
parallel registry is added. Renewal reuses the provider's physical admission
owner but replaces callback ownership.

`snapshot()` returns detached committed data and performs no reads, expiry
reconciliation or revision changes. Explicit refresh, timer/action boundaries
and application publication reconcile time deliberately. The application still
calls `agenda.reconcile()` before publication to preserve existing clock-expiry
semantics; this is an explicit composition hook, not hidden getter work.
`changed()` fires only when the projection changes. A successful cached refresh
returns its result without broadcasting the entire application again.

Action URLs stay inside the provider. The native row carries meeting ID and
agenda revision, not a URL. Join-target resolution rechecks freshness/revision,
does not fetch/join, and returns only to the existing explicit meeting owner.

### Shared verified-storage identity

`VerifiedStorageIdentity` owns the configured profile binding, verified key and
one pending account lookup. The engine composes the **existing**
`spacesCache.account(access, signal)` provider exactly once and retains
`verifiedStorageKey(generation)` as the compatibility/error-translation facade.
Disk binding and explicit live `drafts.open` share that facade, so concurrent
cache/draft consumers do not issue separate identity requests. Preferences
reuse the disk owner's verified binding; they do not probe identity themselves.

`configure(profile)` runs only after successful authentication. It performs no
lookup or storage work and retains only `clientId`, `redirectUri` and a detached
`scopes` array, never the client secret or token. `key(context)` receives the
configuration path, existing session signal, exact current-session/ready
predicate and a live access getter. It retains neither a second application
session counter nor an independent OAuth/grant cache. `reset()` retires its
binding/key/pending reference, but does **not** abort the engine's shared signal
or release any consumer's physical I/O admission.

| Boundary | Identity rule / other owner |
| --- | --- |
| Entry, including cached return or joining pending work | Require the requesting session still current/ready, existing People grant and unexpired access. Losing grant cannot expose a cached key or silently join an old lookup. No grant is added. |
| First eligible request | Use the existing bounded account provider, then unchanged `spacesCacheKey(config, profile, account)` derivation. Provider identity validation, deadlines and file formats are not replaced. |
| Completion | Recheck the captured profile binding, current session/ready predicate and **current** People grant before committing the key. Preserve the original distinction: expiry is an entry gate, not a new post-lookup deadline policy. Provider and physical consumer checks remain separate. |
| Concurrent consumers | One pending promise owns the lookup. A completion clears it only if still current; an old success/failure/finally cannot replace a new account key or evict a replacement flight. |
| Failure | Settle callers and retire that pending reference. No timer, backoff pool or automatic retry. A later explicit draft-open request can retry identity; it does not implicitly restart failed disk/preference binding. |
| Token renewal / grant loss and regain | Read live credentials/grant without reconfiguring identity or starting another probe. A previously verified key remains gated; disk scope-loss/binding and physical storage validity retain their own stricter rules. |
| Stop/reconnect/account replacement | Engine aborts the old session and resets identity at its existing stop boundary, then configures the new authenticated profile. Captured binding/session checks fence late results even if a provider ignores abort. |
| Application failure | Existing failed-state admission makes identity inert. Normal stop/reconnect resets it; identity does not own recovery or start/reconnect OAuth. |
| Demo / cache opt-out | Demo draft hashing remains unchanged and bypasses live identity. Cache opt-out does no cache/preference work or identity probing merely on start; an explicit live draft open may still request identity. Native default-on features and explicit opt-outs are unchanged. |

The key is a private account/profile storage partition, **not** local UI
`sessionId`, selected-room authority, membership, source freshness, read
evidence or consent to send. `openLocalDrafts`/`saveLocalDrafts` delegate physical
admission and exact profile/revision/session checks to the draft owner; preference
load/save/clear retain their owner's physical admission/intent/revision and
disk-binding checks.
Logical identity reset never releases a pending physical draft operation.
There is no cross-account restore, automatic mutation replay or public
credential/account-ID diagnostic.

To add another account-bound storage consumer, explicitly choose whether it may
request the shared identity or must reuse an established disk binding. Keep its
physical admission, safe-file validation, commit/revision fences and error
translation with that consumer. Do not infer identity from a path, room title,
OAuth client fingerprint or display session ID; do not create another probe,
timer or identity registry in the engine.

### Draft open/save and physical I/O

`LocalDraftsLifecycle` owns only a successfully opened profile and one physical
I/O reservation. Its storage factory supplies the existing `LocalDrafts`
implementation. The engine retains connected/error-translation facades and
supplies a captured `LocalDraftSession`: mode, config path, local UI session ID,
the original generation/ready predicate, shared verified-key facade and current
demo/live save-grant/expiry predicate. There is no copied OAuth credential,
second identity cache, extra session generation or pending-operation queue.

| Operation / boundary | Rule |
| --- | --- |
| Construction / session start | No draft identity lookup, storage construction or file work merely on start. Existing native persistence default/opt-out and explicit RPC routing remain unchanged. |
| Open | Reserve physical admission **before** live identity lookup and hold it through file load. Live open uses the same `verifiedStorageKey()` facade as cache binding; demo uses the unchanged SHA-256 of `['demo-drafts', config]`. Busy open does not probe identity. |
| Open completion | Require the captured session still current/ready before establishing the opened profile or returning `{sessionId, profile, revision, items}`. Preserve the existing post-file-load policy: grant/expiry admission belongs to the shared identity facade, not a new post-load gate. |
| Save admission | Require the exact previously opened profile, valid bounded draft patch and free physical admission. Reload the current document and compare the exact content revision before any write. |
| Patch | Merge by `[roomId, parentId ?? '']`. Retain unopened destinations. Empty text removes only its exact destination **unless** that patch still carries uncertainty; root and reply records are distinct. Restored uncertainty is local recovery evidence, not new delivery/send authority. |
| Save commit/result | Recheck current session/ready, opened profile and live existing People grant/expiry (or demo) before write, through the storage commit predicate and after settlement. A late result cannot be accepted by a replacement session. |
| Stop/reconnect/replacement | Reset only opened-profile admission, never the physical reservation. Old identity/load/reload/commit must settle before new draft I/O is admitted. Native text remains with native owners. |
| Failure / recovery | Sanitize the existing open/save errors, retain native text and release admission only in `finally`. No timer, implicit retry or queued replay. Revision conflicts need explicit reopen and user reconciliation before saving again. A failed reopen does not add a new binding-revocation policy; normal stop resets it. |

`LocalDrafts` still owns bounded reads, exact file/profile/version validation,
content hashes, private directory/mode/link checks, process locks and atomic
commit validity. Corrupt/unsafe files are not treated as empty or silently
overwritten. Physical reset cannot be inferred from a session change or abort.
The draft lifecycle never retains text as an application projection, emits a
state change, selects a room, sends, acknowledges, resolves delivery or binds
preferences/cache.

To extend draft records, update the finite draft contracts and safe-file
validation first, then exact patch semantics here and native persistence where
needed. Verify root/reply and unopened records, empty/uncertain patches, concurrent
editor revisions, identity failure, grant loss and each held-I/O replacement
stage. Do not make restoration or ordinary native Enter/write into send consent,
or clear native buffers merely because local storage is unavailable.

### Preference restore, edits and physical I/O

`SectionPreferencesLifecycle` composes the existing `LocalSections` model and
owns projection visibility, physical I/O admission, automatic-read status and
monotonic user intent. Those five fields leave the engine; there is no second
grouping model, session generation or queued-operation registry. `snapshot()`
returns a detached projection only when active; it never probes identity, reads
files, retries or publishes. `reset()` clears grouping/visibility only:
**physical I/O, automatic-read status and intent are not reset**.

Three ports keep application effects explicit: `create()` supplies the existing
preference storage, `rooms()` supplies currently projected room IDs for semantic
assignment, and `changed()` publishes accepted projection changes. The engine
retains its public `editSections()` and `sectionPreferences()` adapters, including
the connected check and existing error codes/messages. `preferenceSession()`
supplies only `key()` from `disk.boundKey()`, a captured generation/ready
predicate, and `restoreAllowed()` for cache opt-in/current People grant. The
owner cannot bind disk storage or call the identity provider.

| Operation / boundary | Rule |
| --- | --- |
| Automatic restore | Capture `intent()` at session start, before optional identity work. On verified disk binding, restore only if the captured session/key, cache opt-in/grant, original intent and empty revision-zero model still match. Busy physical I/O skips restore; it is not queued or retried. |
| Edit | Increment intent even for a refused/stale attempt. Permit edits during an automatic read; their intent/revision prevents its late result from overwriting new work. During explicit load/save/clear, reject edits as busy. Assignment still requires a currently listed room; grouping is not membership. |
| Explicit load/save/clear | Increment intent before admission, require free physical I/O, verified disk key and exact model revision. Use current-session/key checks before applying results and at physical save/clear commit. Do not add another OAuth/expiry policy; existing disk scope-loss invalidates binding separately. |
| Successful save | Mark the same revision saved; do not create a semantic edit or change live rooms/messages. |
| Successful load/clear | Load replaces only at the requested revision; clear increments revision and returns empty session-only grouping. An explicit missing load is unavailable, not permission to erase current work. |
| Missing automatic document | Publish empty session-only grouping without autosave. Malformed/unreadable documents mark unavailable without importing private bytes or replacing current grouping. |
| Failure / recovery | Retain grouping/revision, sanitize the public error and release admission only at settlement. No automatic replay. Deliberate clear and explicit edit/save/load can recover; safe-file collision/corruption rules remain with storage. |
| Stop/failure/account replacement | Reset projection, not physical admission. Old result/failure cannot populate or mark the replacement unavailable. New automatic restore may be skipped while old I/O settles; later explicit load recovers without another identity probe. |

Intent cancels **automatic publication**, not an admitted explicit physical
operation. A rejected action during automatic reading still supersedes that
restore. A logical reset is not proof that a file read/write ended; even across
sessions there is at most one admitted preference operation. The unchanged
`SectionPreferences` owns symlink/mode/version/profile checks, process locks,
bounded reads, fsync/atomic rename and commit validity. No native text, draft
storage, receipt or server mutation state belongs to this lifecycle.

To extend preference behavior, put bounded data semantics in `LocalSections`,
file safety in `SectionPreferences`, and automatic/explicit intent and I/O
sequencing in this lifecycle. Keep new publication effects finite and test
ordinary edit/save/reopen, missing/corrupt files, held automatic versus explicit
I/O, revision mismatch and old-session settlement. Do not infer an empty file
from failure, silently overwrite corrupt user preferences, or reuse this
projection as selected-destination authority.

### Demo REST translation and constructor composition

`demo-rest.ts` contains the former constructor routing branch as a stateless
`demoREST(store, path, method, signal, body?)` function. Its narrow store port is
only `room`, `demoConversation()` and `demoMessageAction()`. It returns the
existing `PublicResponse` shape; it neither constructs a `MessagingStore` nor
keeps another copy of sandbox data, selected state, mutation results or request
IDs. Synthetic People data is created per call, not retained as account proof.
The function accepts no credential/token argument.

The engine retains the single `ActionREST` composition object and its current
mode dispatch. Live calls still go directly to the existing
`PublicREST(owners.publicRequest)` instance with the original token/signal/body.
Both modes retain that same owner's `busy()`/`settled()` delegation; the
extraction adds no parallel physical admission or cleanup pool and no demo
fallback on live failure. Existing positional constructor arguments and
`owners.messaging`/`owners.publicRequest` seams remain compatible.

| Concern | Owner / preservation rule |
| --- | --- |
| Demo request entry | Refuse pre-aborted signals or absent store before routing. Preserve existing URL decoding, method and field precedence; this is not a replacement URL-policy layer or public REST tunnel. |
| People | Return the same self ID, finite prefix-search results and textual/email projections. These are sandbox fixtures, not live identity or presence evidence. |
| Memberships / rooms / Teams | Translate exact existing read/create/invite/remove/metadata operations. False flags, opaque IDs, title/name echoes and the single-space description-clear sentinel remain unchanged. |
| Messages | Translate query/direct and selected-message get/edit/delete, preserving exact plain/Markdown fields. Existing domain/store owners still validate selected target, authorship, consent, freshness and mutation outcomes. |
| Sandbox state | The existing API behind `MessagingStore` owns synthetic mutation/state. No new room/member/message/Team registry is created by the adapter. |
| Busy / abort / session change | Live transport keeps physical request/DNS/socket settlement. Domain operations keep logical operation/session fences, including post-await checks; the adapter adds no independent post-dispatch abort/result policy. |
| Error / unknown / replay | Pass failures and uncertain outcomes unchanged to the original domain owners. They retain exact-request resolution, physical admission and result replay; the adapter never retries a read or mutation. |

To add an existing feature's demo REST shape, define its finite validated
operation and domain admission first, then the translation here and bounded
sandbox semantics in the existing API. Test ordinary reads and explicit writes,
including the exact route/body/format, pre-abort, provider failure, replay and
session replacement. Do not bypass confirmation/moderator/own-message guards
because it is demo mode, add a configurable REST gateway, or silently send a
demo request to a live provider.

Provider construction now lives in `backend-providers.ts`; the engine retains
application/session admission and lifecycle composition. Demo reaction state/
response construction and recipient-file posting have separate boundaries below.
Native general action integration remains separate debt; history activation and
endpoint receipt admission have their own owner.

### Backend provider construction versus lifecycle ownership

`backend-providers.ts` is a finite construction boundary, **not a new
service/plugin framework**. `composeBackendProviders()` returns only creation
ports for the current read source, presence, agenda and presentation names. It
does not retain providers or credential/session state. `createMessagingStore()`
chooses the editor sandbox versus live messaging API and invokes the original
messaging-store injection with its existing receiver and nullish fallback.

The public engine constructor keeps the same positional factory types/order
and named `EditorEngineOwners`. Defaults now come from this module. OAuth/cache
default factory objects remain fresh per engine; the shared-OAuth/account
function identities remain unchanged. Caller-supplied authorization/cache
objects stay engine-owned and retain their original method receivers.

| Construction port | Lifecycle/authority that does **not** move |
| --- | --- |
| `readStatus` | Exact alias of the injected factory, not a wrapper/rebind or eager worker. `ReadSourceLifecycle` decides when to create/start, installs callbacks and closes/replaces sources. Its health, fresh evidence, reaction invalidation and generation fences remain there. |
| `people(session, readOwner)` | Forward enabled/scopes/token, invocation-time global fetch, optional presentation clock and the exact supplied physical owner. `PresenceLifecycle` owns relevance, scheduling, handles and observations. It replaces the provider on renewal while retaining the engine-lifetime `PeopleReadOwner`. |
| `upcoming(session)` | Forward the exact session plus enabled/invocation-time fetch/clock. `UpcomingAgenda` reuses its provider via `setSession()` on renewal, schedules/projections and fences abandoned results. The provider retains physical admission/TTL/backoff. |
| `names()` | Construct a fresh `SenderNames`, with injected fetch or the existing per-request dynamic global-fetch wrapper and optional clock. The engine still supplies current guarded credentials, observes accepted authors and avoids a reset for token-only same-grant renewal. Names stay presentation, never identity/access authority. |
| `defaultAuthorization()` / `defaultSpacesCache()` | Return fresh default factory objects only. Engine and existing storage/identity owners still decide authorization, delegate sharing, verified profile binding, persistence and stop/close. Construction does not discover credentials or read disk. |
| `createMessagingStore(mode, token, admission, owners)` | Preserve `demoMessageAPI('editor')`, live fetch/12-second deadline/shared content-admission identity, original `(api, 4000, mode)` injection and nullish fallback. The engine supplies the same call-time token/expiry guard and owns publication, store callbacks, load ordering and closure. |

Creating composition ports causes no service work. Disabled/demo optional
features remain gated by the existing lifecycles; constructing the name owner
does not read a profile. Construction failures propagate to the original engine
startup/failure cleanup rather than selecting a fallback provider or retry.
Presentation-clock injection is not an OAuth expiry-policy override.

To add a provider, first define its narrow feature contract and determine which
existing feature/application owner decides creation, renewal, stop and physical
settlement. Put concrete defaults and option translation here, with its original
injection seam. Put relevance/projection/scheduling in the feature owner and
cross-feature credential/admission rules in composition. Avoid retaining a
second source handle/epoch in this module, duplicating a registry or making
construction silently fetch. Test exact option/reference/receiver forwarding
and ordinary startup, failure, renewal and replacement through public RPC.

### Demo reaction state, response construction and authority

`DemoReactions` owns one synthetic `Map` keyed by the exact JSON tuple
`[roomId, messageId]`, plus `reaction(command)` and `reactions(batch)` provider
responses. It constructs complete, detached synthetic snapshots with the
existing labels, clock and random own handles. Batch reads preserve requested
order and explicit empty targets through the existing `Promise.all` semantics;
they do not convert a failed item into absence or a fabricated partial result.
No credentials, application snapshots, timers, source epochs, queues, validation
framework or second mutation ledger are retained.

The engine constructs one owner and keeps demo/live dispatch in its existing
single/batch provider facades. **Live grant checks and `ReadSourceLifecycle`
dispatch remain unchanged**, with no synthetic fallback on failure. The
constructor signature, read-source injection and `MessageReactions` composition
remain compatible. Synthetic batch construction no longer re-enters the engine
per item; all its items already belong to the admitted demo batch.

| Concern | Owner / unchanged rule |
| --- | --- |
| Demo add | A missing reaction creates one count-one group and random own handle. Adding the same existing group is idempotent, not a toggle or invented aggregate increment. |
| Demo remove | Require the exact current own handle. Missing/stale/foreign handles return `failed` without changing the group; re-add produces a new handle. This provider check is not a replacement for fresh preparation admission. |
| Summary / batch | Deep-clone groups on each snapshot. Reading synthetic state does not inspect/unlock a target, infer live absence, mark read, publish ordinary application state or send a message. |
| Synthetic lifetime | Preserve the **engine lifetime**, including stop/start and demo/live/demo switches. There is no new reset, expiry or eviction policy. A separate engine starts with an independent empty synthetic map. This is not an authenticated account store. |
| Inspection / preparation | `MessageReactions` keeps checked targets, context/expiry/own-handle requirements and source epoch; the engine keeps exact loaded selected-room/message, current session and grant admission. A fresh summary alone grants no write authority. |
| Unknown / replay | `MessageReactions` keeps retained outcomes and exact target/request unknown locks. Possible-write loss can occur after the synthetic group changed. Matching historical result replay makes no provider call; only explicit exact-request inspection resolves the write lock. |
| Session/source replacement | Existing invalidation clears checked/prepared contexts, not synthetic groups or retained outcomes/unknowns. A late read is rejected; an admitted late write remains unknown rather than accepted as changed. Physical reaction admission stays occupied until settlement. |
| Failure / recovery | No automatic retries. Later explicit read can recover read failure; explicit new preparation can recover a confirmed refusal. Unknown writes require exact-request inspection even if the summary visibly contains an own reaction. |

To add a demo reaction shape, extend the finite reaction contracts and synthetic
provider semantics here, not the engine's target/admission code. Test label/
count/handle fidelity, tuple isolation, detached batches and explicit add/remove.
Keep production controller tests for initial locking, fresh own handles,
uncertainty, original request correlation and session replacement. Never put a
demo shortcut in the controller, trust a synthetic result as live SDK evidence,
or clear unknown writes merely because the demo provider was extracted.

### Demo recipient-file posting and live multipart composition

`postDemoRecipientFile()` owns the former constructor's finite demo posting
sequence: consume the already staged `UploadSource` using the caller's signal,
invoke `submitted()`, then call the **current** store's existing
`demoConversation('direct', ...)`. Its only store port is a late getter exposing
that one existing operation. It constructs the same exact target/plain/
Markdown/`file: true` fields and returns the original raw ACK or rejection.
It does not create a store, retain bytes, acquire files, validate recipients,
grant authority, publish results or interpret uncertainty.

The engine keeps the existing `DirectFiles.post` callback and mode dispatch.
The live branch still calls the original `postUpload` with unchanged fields,
token/signal/submission callback and `owners.uploadRequest` injection. Demo
never falls through to live multipart; the helper has no token argument,
transport, filesystem import, session counter, queue or state registry.

| Boundary | Owner / unchanged rule |
| --- | --- |
| Stage / snapshot | `Uploads` safely acquires and copies the explicit file into an immutable private snapshot; original-path replacement cannot change transmitted bytes. Recipient and normal-room bindings share its bounded budget and physical reservation. |
| Recipient/target | `ConversationActions` verifies exact person/self/returned room, prepares opaque recipient context and chooses first-send `toPersonId` versus confirmed later `roomId`. Labels/titles never choose a destination. |
| Demo stream | Consume the same staged source in order with its existing abort signal, including zero bytes. Do not reopen the path, buffer/forward bytes to a service or infer a new cancellation policy. Source errors propagate before submission. |
| Submission boundary | Only after complete consumption, invoke the caller's `submitted()` callback. It rechecks credentials/session/recipient and records dispatch/upload submission. If it refuses, no store lookup/post follows. |
| Late store lookup | Resolve `() => this.store` **after** the submission callback, not before streaming. A captured old store would change ordering/failure semantics. The caller's current-authority callback prevents old streams from posting through a replacement session. |
| Text / file | Plain text, literal Markdown and first/bound targets keep their original fields without fallback. File-only plain sends and zero-byte sources retain existing admission; blank Markdown remains refused by finite protocol/domain validation. |
| ACK / replay / unknown | The caller validates exact recipient/room/author/content/single-file evidence. Lost or malformed post-submission ACKs stay unknown and lock the recipient operation until explicit recovery; exact result replay performs no additional stream/post. The helper does not convert a thrown error to absence or retry. |
| Replacement / cleanup | Application/session invalidation and `Uploads` retain cancellation/physical cleanup fences. A reset cannot release a held source/post; old results cannot emit a replacement delivery or populate its state. Existing recipient/outcome reset rules are not changed. |

To add recipient-file behavior, put DTO/consent policy in finite contracts,
recipient/ACK/recovery rules in `ConversationActions`, physical snapshot
admission/cleanup in `Uploads`, and demo stream-to-sandbox translation here.
Keep live multipart transport separate. Test first and confirmed-room sends,
exact format/bytes/bindings, pre-submission read failures, post-submission
uncertainty and both held-stream/held-post replacement. Do not let ordinary
Enter/write send, interpret a vanished snapshot as a failed service write, or
release physical admission merely because a logical session changed.

### Native request channel

`wbx#rpc()` remains the public compatibility adapter; correlation state is now
held only by `rpc_channel.vim`, composed by `connection.vim`, not duplicated in the coordinator. The channel
takes four ports: `Ensure`, `Status`, `Send`, `Notify`. They are effects/current
transport evidence, not application/store getters. The channel cannot start a
job, interpret domain state, move focus or inspect a draft itself.

| Data / transition | Owner and lifetime |
| --- | --- |
| Next request ID | Channel instance lifetime; never reset on transport replacement |
| Startup FIFO / pending callbacks | Current transport; reset drops them without replay |
| Protocol-ready / disconnected / capabilities | Connection's handshake state, supplied as derived status; no second ready flag in the channel or coordinator |
| Selected room/session, view intents, caches | Existing domain/presentation owners; not invalidated or retained by correlation itself |
| Uncertain writes and physical read reservations | Existing outcome/read owners; forgetting a callback is not proof of cancellation or settlement |

Allocate request IDs **after** `Ensure`, because starting a backend can issue a
nested hello. Only hello bypasses the bounded 32-entry startup queue. A valid
handshake applies application state before flushing the FIFO. Reset during a
flush retires the remaining queue through current pending-ID ownership; no new
epoch is needed. Responses retire correlation before invoking callbacks, so a
duplicate old response cannot retire work issued by a reentrant callback.

Wire validation remains in `wbx#_receive()` before the channel sees a response.
The exact existing passive-reaction policy is attached per request; it cannot
start/reconnect, queue startup work, silence unrelated explicit errors or add a
wire field. Request cleanup never retries/replays a mutation. Native work and
feature-specific session/source/view guards remain outside this module.

`:WebexHealth` exposes constant-size `rpc_requests`: pending callback count,
queued startup count and `lastRequest` (last allocated ID, not a delivery/authority
claim). There are no target, body, URL or callback dumps. This distinguishes
handshake/startup waiting from outstanding responses without another trace store.

### Native connection lifecycle

`connection.vim` is the single owner of negotiated transport readiness, feature
assertions and disconnected status. It composes the existing request channel,
not another counter, queue or callback table. `wbx#rpc()`, `wbx#_receive()`,
`wbx#_exit()` and the existing internal `s:hello()` facade remain compatible.
The native coordinator consumes detached feature lists and boolean status only.

The connection has physical `Running/Start/Stop/Write` ports, a narrow `Backend`
argv supplier, and four application effects: `Prepare`, `Started`, `Accept`,
`Notify`. Prepare/Accept do not return application state for the connection to
own. Command validation precedes retirement/reset; Prepare clears domain/view
projections, Started resumes notifications, and Accept applies meeting/messaging
snapshots before queued requests drain. The connection validates hello and
negotiates legacy startup flag downgrades with the same notices as before.

| Boundary | What changes / what remains |
| --- | --- |
| Messaging `failed`, `idle`, new local session | Existing domain owners invalidate relevant operations; connection assertions **retain** per the feature catalogue. Independent meeting controls remain usable. |
| Physical transport loss / replacement | Connection clears readiness/assertions and resets channel callbacks/FIFO, retaining monotonic IDs. Coordinator performs synchronous domain cleanup. |
| Invalid hello | Stop physical transport before acceptance or queue drain. No queued request is replayed on a later explicit start. |
| Explicit reconnect | New hello, then current requests only; no action inference or automatic mutation retry. |
| Passive reaction work | Cannot start/reconnect or queue startup work; existing domain/source guards still apply. |

The physical transport remains the sole owner of job generations, framing and
stale-output/exit fencing. No competing connection generation was introduced.
`Stop` preserves its synchronous exit callback, including pending-delivery cleanup.
Readiness is transport negotiation, **not** messaging authentication or write
authority: `wbx#supports()` retains messaging-state/running guards, while
`wbx#meeting_supports()` intentionally uses independent meeting readiness.
Existing weaker reaction handshake admission remains unchanged; downstream domain
guards still apply. Feature-list copies cannot mutate negotiated state.

To trace a startup failure, follow `wbx#rpc` → connection command admission →
channel hello ID → transport framing/envelope validation → connection hello
validation/Accept → FIFO flush. Check `protocol_ready`, `backend_running` and
`rpc_requests` in health first, then the relevant domain state/reason. A messaging
failure with `protocol_ready=1` is not transport loss and must not demand a meeting
reconnect. No token/provider-body logging or parallel event registry is needed.

### Native workspace lifetime

`workspace.vim` owns the rooms/history/meeting-status buffer handles and owned
rename bookkeeping. Its five ports are synchronous, narrow application effects:
`Setup`, `Render`, `Draft(blank)`, `Geometry` (two preferred dimensions) and
`Statusline` (enabled boolean). There is no mutable application-state getter,
request channel, feature registry, session generation or second draft-text map.
The workspace requests a draft from the existing draft owner at the original
point in opening; it cannot decide its send destination/authority.

`wbx#buffers()`, public open/compose/rooms/meeting commands and plugin lifecycle
hooks remain compatible facades. `wbx#workspace#buffers()` returns detached
handles; it cannot transfer ownership of a promoted buffer. `wbx#view#owned()`
still checks exact URI/kind/buftype, while the workspace supplies collision-safe
allocation and only reclaims the empty alternate-name entry created by an owned
rename. Name collisions, promotion and annotated views never authorize adopting,
clearing or rewriting foreign work.

| Responsibility | Existing single owner / invariant |
| --- | --- |
| Workspace open/repair/show | Workspace chooses the existing marked tab and repairs missing projections/composer without replacing unrelated buffers. Same-tab reopen restores the origin; explicit show prefers the current tab, then existing other-tab view, then a split, as before. |
| Per-window geometry | `layout.vim` retains busy/resize admission, preferences and native fixed-size baselines. Workspace brackets structural edits in the same balanced begin/end transaction. Mixed foreign tabs retain the existing conservative resize policy. |
| View content/cursor/folds | Existing renderer plus `view.vim`/history primitives retain edited/unloaded annotations, identity-based view restoration and independent split folds. Workspace never writes lines or changes undo settings. |
| Native FileType/mappings/setup | Workspace's Setup effect delegates to `buffer_setup.vim`; it preserves hooks, conflicts, user overrides and promotion cleanup in their original order, separate from action admission. |
| Draft buffers/text/uncertainty | `drafts.vim` owns these; the workspace requests/locates a composer only. No native Enter/write becomes a send or submit action. |
| Temporary statusline | Workspace installs/restores only its owned window-local expression, including inherited split baselines; later user changes win. |
| Transport/session failure or replacement | Connection/domain owners invalidate authority. Workspace has no reset-on-disconnect: text, full native undo, annotations and independent splits survive; reopening is explicit. |
| Selection-response focus | `selection.vim` owns exact intent/origin checks; `history_activation.vim` owns the subsequent history/receipt guards. Neither is workspace authority. An old response cannot focus history after the user left/returned or navigated elsewhere. |
| Meeting terminal | Existing physical transport owns job/buffer generations; workspace owns only the meeting-status projection handle, not attach/detach/leave policy. |

Rendering still consumes buffer IDs and calls the same guarded write/view
primitives. This extraction does not make a buffer handle into permission to
rewrite it, freshen a source, fetch data, acknowledge a message or retry an
uncertain delivery. Global `breakat`, themes, user mappings and independent
window settings are not managed by the workspace owner.

### Rooms/history rendering

`render.vim` owns assembly and commit coordination for the two primary native
surfaces, plus status/draft revision signatures. `apply(owner, state, buffers,
connection)` takes the accepted state, detached workspace handles and a tiny
display context (`disconnected`, `hint`). These inputs are not retained or
mutated. The renderer does not look up application state, create projections,
open windows or start requests. There is no second room/message/session cache:
the existing `history.projection()` keeps its detached display-only cache.

Its six ports are `Status`, `Destination`, `Compose`, `Notify`, `Uncertain` and
`Pending`. The last two read the existing destination-bound delivery owner;
they never create competing uncertainty/pending state. `Compose(room)` reuses
the application's existing collision-safe draft allocation, returning zero on
the existing occupied-name refusal. The renderer then skips completion effects,
as before. Composer synchronization only replaces **owned visible composers**
in marked workspace tabs; it never adopts an ordinary/promoted buffer.
`Status`/`Destination` are presentation getters, not action/receipt grants.

The application `s:render()` facade invokes the owner, then retains existing
People/reaction feature scheduling **only after successful render completion**.
The renderer calls `people.observe(state)` before room assembly for presentation
consistency, not `people.sync()`/viewport reads. Feature-owned presence expiry
and image-placement visibility hooks remain in their existing modules. No
second timer/request pool is added to the renderer.

| Concern | Owner / preservation rule |
| --- | --- |
| Rooms | Renderer composes local draft/unread/section/agenda/presence hints and discovery/cache notices; commits aligned row metadata only after the guarded write succeeds. Empty/failed discovery is not inferred membership revocation. |
| History | Renderer composes title/context/banners and uses existing detached history projection keyed by room, header offset and display options. Accepted authority changes cannot be replaced by cached display completeness. |
| Native write | `view.write(buffer, lines, Notify, ...)` preserves the original exact ownership, unloaded/annotation checks, unchanged-text fast path, sparse replacement and independent window restoration. Metadata does not advance when a write is refused. |
| Meeting status / confirmed delivery clear | Existing application `s:write()` facade forwards every original argument to the same view primitive. `delivery_clear.vim` owns exact native clear admission/local retry outside that primitive; application/drafts retain outcome correlation and publication. |
| Quiet/status redraw | Owner signatures avoid native repaint when unchanged. A changed draft revision uses the full render path so local room badges catch up; status getters remain scan-free as before. |
| Failure/recovery | Clean views show/remove failure banners; annotated/unloaded views retain text and metadata together. Passive redraw cannot discard an annotation; explicit `Refresh!` remains the original opt-in discard boundary. |
| Native cursor/folds/undo | Existing view/history primitives own independent identity-based restoration. Neither renderer nor view writer changes global `breakat`, theme, mappings or native undo settings. |

To add a new **display hint**, add its finite DTO/feature owner and row/history
projection integration here, with exact metadata and quiet-invalidation tests.
Do not add a send, fetch, receipt or uncertainty transition to rendering. A new
user operation still needs its own existing admission/dispatch path; a provider
read still needs a feature-owned scheduler. Native setup/mapping policy and
general action orchestration are not hidden parts of this rendering extraction;
buffer lifecycle policy now has its own setup owner.

### Room-selection request and focus lifetime

`selection.vim` owns one pending focus intent and a monotonic local intent
serial. The serial is **not** an RPC ID, session generation, membership grant
or another request queue. The existing connection/request channel still owns
wire correlation, readiness and pending callback settlement.

Five narrow ports keep the boundary explicit: `Context`, `Request`,
`Attachments(changed)`, `Open(request)` and `Notify`. `Context()` supplies only
the selected room ID (or null), loaded room metadata and ready/loading/
disconnected/reload-capability evidence. It is read at admission and again at
completion, not retained as another application state. Null selection is not
an empty-ID local resume. The owner copies/scans the bounded loaded rows only;
titles never resolve a target.

`Request(params, callback?)` is closed to the existing `rooms.select` RPC by its
application adapter. `Attachments(changed)` preserves the original cancellation/
serial effects at their original selection boundaries, not physical attachment
admission. `Open(request)` delegates to the guarded history activation owner:
workspace ensure/show, native setup, selected history identity/annotation
rechecks, reader placement, local unread observation and the **unchanged**
automatic-receipt conditions. Keeping this explicit leaf avoids granting the
selection owner direct receipt or delivery authority.

| Event | Selection lifetime / invariant |
| --- | --- |
| Cached target | Refuse browse-only selection before canceling an already-admitted focus intent. No identity or absence inference. |
| Duplicate Enter while selected history is loading/not ready | Keep the original intent/callback, without another RPC or attachment cancellation. |
| Ready same-room return | Local resume without a select/refetch. Explicit focus may open the existing history, but cannot jump the reader or grant an automatic receipt; programmatic resume stays focus-neutral. |
| A → held B → ready A | A returns locally without waiting for B. The newer intent retires B's focus, not the physical request/channel reservation; late success/error cannot consume a newer intent. |
| New explicit focused target | Capture the exact room ID, origin window/buffer, whether it was an owned rooms surface, unread-at-intent evidence and explicit receipt consent. The response is not itself selected-room authority. |
| Completion | Consume only the matching current intent. Require the original focused window/buffer, unchanged owned rooms origin where applicable, exact current selected ID, loaded-row membership, readiness and connection. Loading is allowed only for the existing local-resume path. Then invoke activation. |
| Leaving / background window work | Actual departure from the requesting origin cancels focus, even after returning. An unrelated background `win_execute()` event must not cancel the foreground origin's request. |
| Error / refused request | No activation or receipt. An explicit retry creates a new intent/request; no automatic replay. |
| Disconnect / shutdown / transport loss / meeting-row dispatch | Existing application boundaries cancel the focus intent. Serial uniqueness survives cancellation; native text and views belong to other owners. |

`wbx#select(id, focus?, allow_read?, reload?)`, Enter and cancellation hooks
remain compatible. Loaded-row and meeting dispatch in `select_current()` stay
with their existing action admission. After activation, FileType/BufEnter hooks
can still redirect/promote a buffer: the existing history and endpoint checks
must run before any automatic receipt. Full fresh newest-endpoint/staleness,
display-completeness, deduplication and exact receipt request guards live in
`history_activation.vim`; local resume is never new receipt consent.

History activation and native setup/mappings have separate owners, not a generic
selection controller. Paging,
latest/reload, picker/query targets, notification navigation and media lifetimes
continue through their existing explicit APIs and guards.

### Native history activation and endpoint receipts

`history_activation.vim` owns the explicit post-selection activation sequence
and the three related receipt fields: pending exact `{roomId, messageId}`,
attempted endpoint per room and known-latest endpoint per room. Both retained
maps preserve their 500-entry bounds and existing lifetimes; this extraction
adds no source/session epoch, selection serial or RPC callback registry.

The owner composes the existing workspace, view, paging and local-unread
primitives. Six synchronous ports supply `State`, `Options`, `Setup`, `Render`,
`Notify` and `Request`. `State()` returns current application evidence when
needed: it is read **after setup and again after rendering**, not held as a
stale application snapshot across hooks. Workspace allocation/handles and
buffer setup still belong to their existing owners; the activation owner
cannot create a second native buffer registry or render text itself.

| Boundary | Preserved activation / receipt rule |
| --- | --- |
| Selection completion | The unchanged selection owner must first admit the exact request, unchanged origin window/buffer, owned/unannotated rooms surface, current selected room, loaded membership and ready connection. Activation is not an alternative selection API. |
| Ensure / show / setup | Ensure and render absent history, refuse retained annotations, show history and run native setup in the original order. Catch only the existing reserved-name collision; unrelated errors are not swallowed. |
| After native hooks | Recheck actual current buffer, workspace handle, ownership, annotation and history-room identity. BufEnter/FileType redirection or promotion cannot position/read another buffer or authorize a receipt. |
| Accepted open | Position latest only on non-resume, without opening folds; establish paging baseline, clear local emphasis and render. Local emphasis is presentation, not server-read evidence. |
| Automatic consent | Require allow-read intent, both enabled options, unread-at-intent or current unread evidence, ready source, exact selected room, ready/not-loading, nonempty complete history and loaded row not explicitly read. Resume's selection request always disables automatic consent. |
| Exact newest endpoint | Require latest-history mode, selected/listed non-stale evidence, retained known-latest identity and the real view endpoint's full physical visibility. No folded, offscreen, partial or old-history endpoint is inferred as read. |
| Receipt dispatch | Suppress overlapping receipt admission and repeated automatic attempts at the same endpoint. Record attempts before request, including manual attempts. Dispatch only `rooms.read` with the exact room/message pair through the existing RPC port. |
| ACK / failure / refusal | Matching completion releases pending admission only. ACK does not rewrite authoritative unread or clear attempts. Failed/unknown or refused dispatch retains the attempt; a later **explicit manual** request may retry, not an automatic reopen/timer. |
| Fresh authoritative read | Only accepted ready-source, non-stale `unread: false` ends that room's attempted unread interval. Missing/null/stale/failed-source flags cannot do so. Latest identity is observed only from nonempty latest history. |
| Transport loss | Clear pending receipt admission only at the existing transport-exit boundary. Retained attempt/latest maps survive; idle/failed/session changes do not add new reset policy. Selection cancellation and physical RPC lifetime remain separate. |

Manual `WebexMarkRead` retains its public local-action guards, local-open/render
ordering and explicit retry policy, then uses the same receipt-admission leaf.
This does not broaden Enter/write into send or mutation consent. No reaction,
delivery uncertainty, backend read-source or automatic fetching authority moves
into activation.

To extend activation behavior, choose whether it is a selection intent rule,
native setup/view effect, endpoint-admission rule or backend read-source rule
before editing code. Keep synchronous effect order and post-hook **current**
evidence checks; do not turn renderer metadata, local emphasis or a receipt ACK
into read authority. Add ordinary Enter/resume, hooks, late completion and
explicit recovery cases in both editors, including drawn endpoint evidence.

### Native buffer setup and mapping lifetime

`buffer_setup.vim` owns setup policy in the **actual current native buffer and
window**. Existing `b:wbx_initialized`, `b:wbx_default_maps` and per-window fold
preparation remain the only lifetime markers. There is no new buffer registry,
controller epoch or disconnect reset. `apply(effects)` receives five synchronous
effects: `Render`, `EnterWindow`, `LeaveWindow`, `Draft` and `Event`. The
application holds only those callbacks; it does not keep another copy of setup
state.

The existing `s:local_setup()`, `wbx#_setup_buffer()` and `wbx#_draft_setup()`
facades preserve all call sites and plugin hooks. The latter delegates to
`buffer_setup.draft()`, which composes existing completion, draft observation/
recovery and draft-chrome owners without taking their state. The separate
reaction scheduling after public setup remains outside this owner. Workspace
owns allocation/rename/statusline lifetime, renderer owns surface projection,
and each feature retains its own timers, native decoration and action admission.

| Setup stage | Invariant / extension rule |
| --- | --- |
| Exact ownership first | Ordinary/promoted buffers release only owned defaults and stale main-view metadata. Native text, full undo and user mappings are not cleared. Clean thread/query presentations retain their independent message boundaries and never acquire main-history actions. |
| Reload / first history window | Existing view primitives distinguish clean reload from unloaded annotation. First-window fold defaults are prepared before FileType; setup does not invent a new reload/cache policy. |
| Initial native options | History wrap/linebreak/conceal and literal-composer conceal defaults precede FileType hooks. Later hooks/native `setlocal` overrides win; ordinary re-entry does not reapply those defaults. Global `breakat` and global native option baselines remain untouched. |
| FileType | Set the local option in the actual window so native hooks/ftplugins see the correct buffer. The initialization marker is already set, preserving existing re-entry behavior. Then recheck current buffer and exact ownership: promotion/redirection cannot install send defaults or emit a false owned-buffer event. |
| Default maps | Install only when mappings are enabled and no buffer-local mapping already exists. Keep exact `maparg()` snapshots, including the expanded localleader and mode. This is lifecycle policy, not another action catalogue; finite `<Plug>` targets/commands still own invocation/admission. |
| Re-entry | Reconcile current presentation/window state, but do not reinstall default maps, repeat FileType, overwrite user option changes or manufacture another `WbxBuffer` event. Existing explicit opt-outs remain in force. |
| Promotion cleanup | Unmap only an exact currently installed owned default. Later user replacements, FileType-provided maps and native global mappings survive; changing localleader cannot redirect cleanup to unrelated keys. Completion/geometry/decoration owners retain their existing cleanup responsibilities. |
| Buffer event | Emit the existing `WbxBuffer` after successful owned setup/mapping installation, never after a hook released ownership or redirected to foreign work. |

To add an owned native buffer kind, first extend exact ownership/allocation,
then its finite initial defaults/mappings here and its renderer/feature owner.
Test initial FileType order, same-window unsynced undo, re-entry/user overrides,
promotion and opt-out paths. Do not dispatch a service command while setting up
a buffer, install mappings on a similarly named foreign buffer, or convert
ordinary Enter/write into send/submit. `Wnr = Remove Member` and the effective
command catalogue remain unchanged.

### Presence lifecycle

`PresenceLifecycle` takes a provider factory, a change notification and the
existing optional admission-clock seam. A source/session handle replaces engine
source/generation comparisons inside scheduling; there is no extra global epoch.
The engine passes a detached context containing only the selected room's ID/type
and eligible live direct-room IDs. It retains wire/list/cache/revocation admission,
the application session intent, and a derived session-validity predicate, not the
refresh timer, relevance windows, cursors, flight registry or observation map.

The source port is limited to local snapshots/relevance, explicit lookup, pacing
deadlines/capacity and close. It cannot reach the engine/store. The original
positional provider-factory seam and public `lookupPeople`/viewport/spaces APIs
remain compatible. Startup/renewal creates a source but performs no presence
read; room selection starts optional work only after history selection returns.
Publication/history/list reads reconcile local relevance without fetching.
The lifecycle itself refuses source creation for opt-out/demo modes.

| Lifetime | Presence owner / invariant |
| --- | --- |
| Selected room | Provider relevance follows current selection; a late old-room result cannot republish as current selection. Optional presence cannot hold a room-open RPC response. |
| Viewport / legacy eight-room report | One refresh timer; paced two-peer viewport batches or existing legacy cadence, never another polling pool. Repeated identical reports are inert. |
| Observed text | At most 500 loaded live direct-room observations, independent of the provider's eight-peer identity window. Hidden rows are not polled; a return can reuse still-fresh data synchronously. |
| Source/session data | Renewal, application authentication failure, stop and replacement close the source and clear relevance/retained observations. Late old-source completion cannot refill or publish. |
| Physical admission | One lazily created `PeopleReadOwner` for the lifecycle/engine lifetime. It survives logical source replacement, preserving occupied HTTP slots, spent start budgets and service backoff. |

Observation retention is presentation, not permission to read or evidence of a
fresh service result. Existing stale/expiry, denied/target-refusal, negative-cache
and Retry-After semantics remain provider-owned. The scheduler retains its
existing `Date.now`/credential-expiry checks; provider/admission clock injection
does not weaken real credential expiry. Snapshots age observational text locally,
without fetching, publishing, changing timers or inventing revisions.
The selected, non-revoked DM is independent of a bounded loaded-row report:
absence from a partial/capped room list is not revocation and must not stop
its selected-peer refresh. Loaded-row eligibility instead governs viewport
admission and retained row observations, as before.

This extraction does not merge public-REST presence health with read-status/
reaction SDK source health. A transient presence 503 may recover after its bounded
backoff while message history stays ready; a denial remains latched per existing
provider rules, not an instruction to reauthorize/retry.

### Read-source lifecycle versus retained unread

`ReadSourceLifecycle` composes the existing injected `ReadStatusSource` factory.
It owns source identity and health, source-scoped fresh rooms, bounded pending
startup invalidations, event evidence/deduplication and presentation epoch/revision.
The worker still owns IPC validation, heartbeat/deadlines and physical receipt/
reaction admission. There is no second SDK instance, queue or competing watchdog.

The engine supplies derived session-validity/phase callbacks and narrow effects:
revocation lookup, genuine-room observation, startup settlement, domain changes,
reaction invalidation, event-change publication and fail-closed startup overflow.
It never passes the mutable store or a bag of application fields. Existing
constructor injection, `startReadStatus` composition facade and public wire APIs
remain compatible.

| Evidence / lifetime | Owner and boundary |
| --- | --- |
| Fresh SDK room membership and health | Read-source lifecycle; clears on dropout/terminal loss/replacement. Empty or partial fresh snapshots never imply membership revocation. |
| Last-confirmed read/unread and contradictory actual activity | `RetainedUnread`; source failure leaves observations intact. The engine combines them with current-source freshness; the ledger cannot declare them fresh. |
| Persisted unread booleans, file age and account/profile isolation | `DiskCacheLifecycle` binds only the existing verified key; `SpacesCache` enforces private files/account slots. Restored bits never enter fresh-source rooms or authoritative SDK observations. |
| Exact startup deletion/self-removal evidence | Lifecycle queues a bounded set until the store is ready; engine applies it before normal publication. Terminal source failure cannot discard already-verified pending invalidations. Overflow fails closed. |
| New-message notification evidence | Lifecycle bounds, dates, validates consent and deduplicates it; engine retains pending-self-echo ordering, sender-name projection and publication. It is not unread/receipt authority. |

`readRoomsObserved()` is the integration boundary, not another source cache:
every genuine room observation may update the existing retained/disk ledgers,
including unchanged values with a genuine observation time. Only changed fresh
room sets merge into messaging. Empty invalidation snapshots cannot renew disk
cache age. A health transition alone does not create an observation or freshen
omitted rooms. Snapshots and health getters have no refresh/persistence effects.

Reaction presentation carries the same-source degradation counter even if
failed → ready publications coalesce. Source replacement uses an opaque lease;
domain target/session guards and `MessageReactions.reset()` still fence work
across degradation. A healthy snapshot cannot restore inspected/prepared writes
or resolve uncertainty. Receipt/reaction forwarding uses only the current ready
source, once, without retry or automatic source startup; actual exact-target and
fresh-unread checks remain with the engine/domain owners.

### Retained unread ledger

`RetainedUnread` is a synchronous owner depending only on the read-status DTO.
`observeStatuses()` keeps detached SDK observations; `observeActivity()` takes
detached loaded timestamps **and** the actual newest endpoint, which can be
withheld by the display cap. It keeps their maximum even after navigation or an
older SDK/history response. REST metadata activity and notification events do not
enter this ledger as actual-message evidence. Activity alone cannot manufacture
last-seen state or an unread/read flag.

The engine supplies `UnreadRetention` (selected ID and fresh-source IDs) only
when observations are inserted. The 1,000-entry hard bound preferentially evicts
entries outside both sets, falling back to insertion order if all are protected.
Protection is a preference, not an unbounded pin: the former selection can be
evicted after navigation. Re-observation refreshes insertion order; `peek()` does
not. The owner has no timers, subscriptions, source handle or store reference.

`peek()` returns only retained unread/activity and whether actual activity
contradicts it. `roomReadStatus()` still composes freshness from current-source
ready/room evidence plus that contradiction. With no retained SDK status, only
the existing verified disk path can supply an age-bounded **always-stale** flag.
Disk restore/retention keeps its separate 1,000-entry bound; it cannot populate
the SDK ledger. Projections never scan messages, reconcile observations, change
insertion order, fetch, persist or manufacture revisions.

| Boundary | Retained observation policy |
| --- | --- |
| Source dropout/terminal failure/renewal | Preserve SDK history/activity; source owner clears its own fresh evidence. Health recovery alone cannot refresh historical flags. |
| Whole application failure | Retain history for the existing same-mode/config/profile reconnect policy. |
| Explicit stop or mode/config change | Reset both observations and the configuration fingerprint. |
| Changed OAuth client/redirect fingerprint at the same path | Clear observations; this fingerprint is **not verified account identity**. |
| New cached authenticated session | Clear in-memory observations before disk account verification; never expose another account's flags while identity is pending. |
| Exact room revocation | Forget the ledger entry; engine separately forgets source evidence and disk flags. |

The engine retains session-transition admission and fingerprint construction;
the ledger owns comparison/reset of its private history. Do not use its eviction
context, size or projected unread as permission to send a receipt. Explicit
receipt admission still reconciles actual activity immediately before checking
the exact loaded newest endpoint and current source. No receipt acknowledgement
edits retained/disk flags or retries a write.

### Disk-cache lifecycle

`DiskCacheLifecycle` owns one cache handle/binding, cached metadata/boolean hints,
two display-expiry timers and the five-second coalesced write scheduler. Its
three constructor ports are `create`, `metadata` (detached, bounded/sanitized live
room metadata only) and `changed`. It never receives `MessagingStore`, raw source
handles, OAuth credentials, native state or a bag of application fields.

The binding session supplies `key()` from the existing shared verified identity
service, current-session/grant checks, and a `verified(key)` integration effect.
The engine's `verifiedStorageKey()` facade delegates to `VerifiedStorageIdentity`
for one shared bounded account request across cache and explicit drafts; section
preferences reuse the disk binding rather than requesting identity. The cache owner does not
create another identity pool/probe. It binds only after key verification and load
settlement, then invokes the existing section-restore effect. `boundKey()` is an
internal preference fence, never a new wire/account identifier. Draft/preference
physical I/O and their user-intent rules stay with their existing owners.

| Boundary | Disk owner behavior |
| --- | --- |
| Disabled/demo | No identity, cache construction, file load/save or timer work. Native default/opt-out policy and public positional APIs remain unchanged. |
| Identity/load pending | Cannot publish old-account hints. Fresh REST discovery/history need not wait for the cache identity/load. |
| Warm restore before REST | Projects labeled browse-only rows and age-bounded always-stale flags, never restores a selection or action authority. |
| Successful REST, including empty | Retires restored metadata, releases browse-only gating and captures a genuine document observation; old SDK flag timestamps do not advance. |
| REST failure | Keeps labeled browse-only hints when available; explicit successful refresh reconciles them. Not a messaging disconnect. |
| Nonempty SDK observation | Captures document observation time and genuine boolean flag times. Empty invalidation/health/receipt ACK cannot renew either. |
| Scope loss/stop/replacement | Closes storage admission, cancels pending/timed work and hints; late identity/load/save/clear completion cannot publish against the replacement. |
| Explicit clear | Immediately forgets binding/hints and latest pending work, then awaits the storage owner's serialized clear. No automatic repopulation in that session. |

`spacesCache.verified` retains its existing **live REST discovery** meaning:
it is independent of whether cache identity is still pending. Neither that
presentation flag nor a restored disk flag proves SDK read freshness.
`roomReadStatus()` still prefers the separate retained SDK ledger and source
freshness; disk fallback is always stale and cannot admit a receipt.

The scheduler holds at most one active save and one latest pending snapshot,
deduplicates unchanged captured documents, and spaces starts by five seconds
using the monotonic clock. Document/flag ages instead retain actual wall-clock
observation times, never completion/admission times. A failed save publishes its
failure and may drain newer pending evidence; it never automatically retries
the failed document. Snapshots cannot enqueue writes, extend ages or read files.
The 1,000-flag memory bound is separate from the SDK ledger's bound.

Logical invalidation does not claim a physical fsync/rename was canceled.
`SpacesCache` remains the sole owner of its commit queue, private-file checks,
atomic rename and clear-behind-commit serialization; it is unchanged. No generic
cache registry, additional storage pool or replacement file format is introduced.

## Adding a feature

1. **Write its ownership/lifetime contract first.** List authoritative state,
   presentation-only state, shared physical reservations, cancellation, expiry
   and what survives room/source/session replacement. Do not reuse one epoch for
   unrelated lifetimes or copy another owner's uncertainty ledger.
2. **Keep the wire contract closed and dependency-light.** Put bounded DTO/policy
   checks in the contract/protocol layer, without importing SDK/process/provider
   implementation just to validate a value. Extend the handshake catalogue only
   where negotiation is necessary; metadata is not authorization.
3. **Implement the smallest domain owner.** Inject narrow provider/lifecycle
   ports, not `EditorEngine`, a bag of engine getters or the entire mutable store.
   A feature's normal-path test should not require constructing unrelated OAuth,
   messaging, media and editor owners.
4. **Use existing shared authorities.** New sends, receipts, uploads or mutations
   belong to the existing exact-target/physical/outcome owners, not another
   feature cache. Cancellation never proves a write unsent or frees a physical
   reservation before settlement.
5. **Compose and route once.** The engine supplies current session validity and
   creates/stops the feature. `EditorRPC` validates/routes a finite operation.
   Keep old public adapters compatible; do not move substantial feature
   implementation back into those adapters.
6. **Use a native feature module.** Reuse list ownership, view/intent primitives
   and the command catalogue; preserve mapping conflicts and existing meanings
   such as **Wnr = Remove Member**. Rendering/getters cannot fetch, send, clear
   native text/undo or turn presentation metadata into authority.
7. **Verify a complete ordinary workflow.** Alongside guard tests, prove first
   useful result, repeat/cache hit, unrelated navigation while a provider is
   delayed, recovery, stop/restart and quiet unchanged results. Assert causal
   ordering (response before releasing a held service), not a fragile wall-clock
   threshold. Record local timings as observations, not service SLAs.

## Tracing an agenda operation

| Step | Entry / observation |
| --- | --- |
| Explicit refresh | `:WebexUpcoming` → `wbx#upcoming()` → `meetings.upcoming {}` |
| Correlation/admission | Native `connection.vim` → `rpc_channel.vim` request ID → transport → `EditorRPC.receive` → `parseEditorOperation` |
| Connected-session check | `EditorEngine.refreshUpcoming()`; no feature code starts OAuth |
| Lifecycle | `UpcomingAgenda.refresh()`; current owner + active session/abort signal |
| Service/cache | `WebexUpcomingMeetingsProvider.refresh()`; state/reason/retryAt, bounded GET/singleflight |
| Return | URL-free agenda snapshot/revision; changed projection alone requests an application publication |
| Native display | `upcoming.vim` rows, with exact ID/revision; no provider work from projection |

For a failure, follow the same request ID, agenda revision and finite
state/reason/retryAt evidence. `:WebexHealth` already exposes agenda
state/reason/scope. Do not add raw token, account, action URL or provider-body
logging to make a request traceable. No optional SDK child is involved in this
feature; the read-status/reaction worker has a separate ownership chain.

## Tracing presence during navigation

`rooms.select` → engine's existing connected/listed/live-room checks →
`MessagingStore.select` publishes local selection → lifecycle `sync` reconciles
eligible relevance → history selection completes → optional lifecycle `lookup`.
Presence returns via a separate application state publication; it cannot delay
the selected-room response or move native focus. `people.viewport` instead passes
bounded loaded-DM validation before `setViewport` schedules paced first starts.

For delayed/failed presence, inspect `peopleStatus` or exact viewport row
state/reason/observedAt/retryAt, then follow lifecycle selected/visible relevance
and the selected-peer provider. Do not debug a public REST failure by reconnecting
the independent SDK worker or resetting shared physical admission. Ordinary
workflow tests in `people-integration.test.ts` exercise RPC navigation with held
HTTP, transient source recovery and session replacement; `presence-lifecycle.test.ts`
exercises the owner without engine/OAuth/store/worker construction. Local timings
are observations, not Webex latency guarantees.

## Tracing read-status failure and recovery

`session.start` / explicit `auth.refresh` → engine's current credentials →
`ReadSourceLifecycle.start` → `ReadStatusWorker.start` → private IPC →
`read-status-sdk.ts` / `read-status-session.ts`. A source observation returns to
the lifecycle's fresh set, then `readRoomsObserved()` and the retained/disk paths.
Health/events have separate callbacks; they cannot manufacture last-seen dates.

Inspect existing `readStatus`, finite `readStatusNotice`, `reactionSource`
epoch/revision/degraded and each room's unread/unreadStale/unreadActivity. Distinguish
connecting, same-source refresh failure, terminal loss and explicit replacement.
Recovery health with an empty room set intentionally leaves old flags stale;
never-observed rooms remain unknown. Do not reconnect unrelated REST presence or
discard native buffers to debug a worker-source failure. Internal lifecycle
diagnostics expose counts only, not credentials, identities, bodies or callbacks.

For a stale flag specifically, follow `roomReadStatus()` → `RetainedUnread.peek()`
and current-source membership separately. Trace actual contradictions via
store transition → `observeReadActivity()` → ledger `observeActivity()`;
fresh SDK status goes via `readRoomsObserved()` → `observeStatuses()`.
If neither SDK observation exists, trace the separate verified/aged disk flag.
Eviction means unknown, not read or revoked. `retained-unread.test.ts` exercises
this owner without engine/SDK/disk setup; RPC navigation/eviction and account
replacement evidence lives in the read-status-cache and persistent-unread suites.

## Tracing disk restore and refresh

`session.start` → shared `verifiedStorageKey()` → lifecycle `bind()` →
`SpacesCache.load()`. In parallel, REST room discovery reports `roomsLoaded()`;
genuine SDK observations report `observe()` before retained SDK/store publication,
then `persist()` captures the current sanitized live metadata. Write completion
publishes status only; it cannot change current-source or retained SDK freshness.

For an ordinary stale/missing list, inspect `spacesCache.state/reason/verified`
and REST `roomsStatus` separately from `readStatus` and per-room `unreadStale`.
`identity-unavailable`, `cache-unavailable`, `refresh-failed`, `expired` and
`cleared` have different owners/recovery paths. A slow or broken cache must not
force SDK reconnect or prevent loading fresh history. Native clear remains
`spaces.cacheClear` through the existing action; there is no generic file/key RPC.
Standalone tests use the storage port without engine/OAuth; integration RPC tests
exercise warm restore, held SDK/history, failure/recovery, clear and delayed
old-account identity. Real private-file commit/clear race tests remain in
`cache-persistence.test.ts`.

## Tracing account-bound storage and recovery

Authentication success → identity `configure()` (no probe) → disk `bind()` or
explicit live `drafts.open` → engine `verifiedStorageKey()` → identity `key()` →
existing bounded account provider → unchanged key derivation. Disk load/binding
then invokes automatic section restore; later preference operations use
`disk.boundKey()`, not `key()`. Fresh room discovery/history run independently
while optional identity/storage waits.

For unavailable local storage, separate identity from file and intent failures:
check current application session/ready state, current People grant and access
expiry, then the disk status/binding, private-file safety/revisions and the
consumer's physical busy/intent fences. A failed identity means zero storage
reads for that attempted binding, not an empty file or permission to clear it.
An explicit draft-open retry may recover drafts while cache/preferences remain
unbound until an explicit new authenticated session; `auth.refresh` alone is
neither an identity probe nor cache recovery.

For wrong-account or late-result concerns, follow stop's identity reset and
session abort, the captured identity binding/current predicate, disk binding
fences and the consumer's physical operation **separately**. Never clear
the draft or preference owner's physical I/O flag on a logical reset to make
a busy error disappear. Neither
cached metadata nor a storage key proves a target exists or permits a mutation.

`verified-storage-identity.test.ts` exercises single-flight, live entry and
completion gates, detached configuration, reset/rebinding and late-finally
behavior without engine/OAuth/files. `storage-identity-integration.test.ts`
uses ordinary RPC calls and real private cache/draft/preference files with
controlled identity promises: shared restore/save/renewal, explicit failure/
recovery, account/session replacement and opt-out/grant loss/regain. Network,
browser and send effects are forbidden; diagnostics contain workflow counts
only, not keys, account IDs, tokens or native text.

## Tracing private draft restore, patch saves and replacement

`drafts.open` → engine connected/error facade → `drafts.open(session)` →
physical reservation → existing demo partition or shared verified identity →
`LocalDrafts.load()` → current-session recheck → exact draft document result.
Native edit/explicit persistence → `drafts.save` → opened-profile/patch admission
→ current document/revision → exact room/reply merge → safe-file save with
current commit predicate → current-session result. Draft text never enters the
ordinary state snapshot or feature diagnostics.

For busy storage, distinguish held identity, file load, save reload and commit;
logical disconnect does not release any of them. For stale revisions, reopen
explicitly and reconcile the newly loaded text rather than replaying the old
patch. For wrong-account concerns, inspect shared identity/session fences and
the draft owner's opened-profile/physical fences separately. Invalid profile,
missing grant or unsafe/corrupt files are not evidence that no draft exists.

`local-drafts-lifecycle.test.ts` uses inert storage/session ports for exact
sequencing, errors, patch semantics and old-session settlement.
`local-drafts-lifecycle-integration.test.ts` exercises ordinary RPC calls and
real private files: cache identity reuse, restore/edit/save/reconnect, concurrent
editor conflict and explicit recovery, identity/grant loss and replacement
during open-load, save-load and save-commit. It requires maximum physical draft
I/O of one and unchanged retired-account bytes, while history remains usable.
Native persistence, undo, promotion and recovery workflows remain independent
selected editor fixtures; the backend owner never becomes a native text owner.

## Tracing grouping restore, edits and explicit preference recovery

Verified disk binding → `preferences.restore(key, session, capturedIntent)` →
physical `SectionPreferences.load()` → current binding/session/intent/revision
recheck → detached grouping publication. Explicit `sections.edit` →
`preferences.edit()` changes local semantics only; `sections.preferences` →
`preferences.operate(load|save|clear)` requires the existing binding, revision
and physical admission. Neither path requests identity or changes a live room.

For a missing restore, distinguish cache opt-out/unbound identity, a superseding
edit/action, occupied physical I/O, no document and malformed data. A skipped
automatic restore is not queued: after old I/O settles, explicitly load if
desired. For busy errors, trace physical settlement rather than clearing flags
or reconnecting again. For a failed save, preserve current grouping and inspect
safe-file version/profile/mode/collision checks; only an explicit clear may
discard an addressed document. A successful save retains revision, while
load/clear advances it; stale actions cannot overwrite more recent edits.

`section-preferences-lifecycle.test.ts` exercises these rules with an inert
storage port, including delayed automatic/explicit operations and reset.
`section-preferences-integration.test.ts` uses ordinary RPC calls and real private
files: restore/edit/save/load/clear, history progress while restore waits,
corrupt-file recovery, and account replacement during **each** physical action.
The tests require max concurrent preference I/O of one and forbid network/
browser/send effects; this is offline workflow evidence, not live latency.

## Tracing demo operations and live-injection failures

Validated RPC → engine exact action/session admission → existing domain owner
→ composed `actionREST.call()` → current mode → `demoREST()` → narrow store
demo operation → existing per-session sandbox API. Read results still pass
through domain validators; writes still pass preimage/role/author/consent and
retained-outcome logic. The adapter alone does not publish state or delivery.
For live mode, the same composition branch goes to `PublicREST` and its injected
native request/physical settlement, never through synthetic demo projections.

If a demo operation is refused, check RPC `confirmed`/`checked` intent,
selected-room/preimage and fresh moderator/own-message evidence before changing
translation. A creator label is not moderator proof. A failed read permits a
later explicit read; an unknown mutation needs its original exact request and
explicit resolution, not a new adapter retry. For a late result after restart,
trace domain generation/operation fences and the old store, not a new adapter
epoch. For native busy/cleanup, inspect the existing PublicREST reservation and
settlement rather than releasing it at logical cancellation.

`demo-rest.test.ts` uses an inert store port for the full route/field mapping,
detached People results and unchanged failed/unknown/held outcomes.
`demo-rest-integration.test.ts` uses ordinary RPC calls with the real sandbox:
directory/profile/roster/Team/query reads, confirmed create/rename/description/
moderation/invite/remove, own-message edit/delete, failure/unknown recovery and
store replacement. It also exercises a synthetic live session with an injected
native response: busy/settled waits for physical close, and switching to demo
makes no native request. Network/browser/socket effects are forbidden. These
are offline positive workflows, not live-service latency acceptance.

## Tracing demo reaction reads, writes and recovery

Validated consent-bearing RPC → exact loaded target/session/source admission →
`MessageReactions.summary/summaries/prepare/submit` → engine mode dispatch →
`DemoReactions.reaction/reactions`. Synthetic responses still pass through
controller DTO, freshness and post-await ownership checks. Live dispatch goes
to the original SDK read-source owner, not this synthetic map.

For refused preparation, separate uninspected target, stale context/own handle,
changed selection/session/source, busy physical operation and missing grant
before changing the provider. For unknown writes, distinguish a failed ACK from
proof of non-submission: a group may already exist. Inspect the exact original
request explicitly, then prepare the desired add/remove anew. Replaying the
old request returns its original result; it neither retries nor rewrites it.
After stop/start, retained demo groups do not retain inspection or preparation
authority. A held old operation must settle before new reaction I/O can enter.

`demo-reactions.test.ts` exercises the synthetic provider without engine/worker/
transport setup. `demo-reactions-integration.test.ts` uses ordinary RPC, the real
demo owner and controller, and controlled failure/held-operation seams:
summary/batch → inspect → add/replay/remove, read/refused/unknown recovery,
completed and held session replacement, and synthetic live-source composition.
Network/socket/browser effects are forbidden. State/delivery invariance and
exact-request recovery are asserted, not inferred from an empty summary.
Native reaction fixtures in both editors remain separate acceptance evidence;
none of these offline workflows certifies live reaction latency.

## Tracing recipient files, stream failure and uncertain ACK recovery

Explicit `direct.prepare` → verified opaque recipient context → `uploads.stage`
→ shared immutable `Uploads` snapshot → consent-bearing `direct.send` →
conversation/upload physical admission → fresh self/person/optional bound-room
proof → composed `DirectFiles.post` → mode dispatch. Demo consumes the source,
calls caller admission and posts exact sandbox fields; live uses unchanged
one-submission multipart. Domain ACK validation and selected-state/delivery
projection happen only after their existing current-session checks.

For a refused send, distinguish wrong recipient/draft/file binding, expired
recipient, missing confirmation/grant and occupied physical work before
touching transport. A read failure before submission retains its snapshot and
failed result; a new explicit request can recover without replaying the old
one. Once submitted, lost/malformed evidence is uncertain even if the sandbox
already has a message. Explicitly check/resolve the original recipient context
before deliberately choosing a new send; do not silently recreate a direct
room or downgrade to plaintext. The existing direct recovery API is unchanged,
not replaced by a new helper-specific ledger.

`demo-recipient-file.test.ts` verifies stream/submission/getter ordering, exact
fields, zero bytes, callback refusal, late store lookup and error propagation
without engine/filesystem/transport setup. `demo-recipient-file-integration.test.ts`
uses ordinary RPC, real private staged snapshots and sandbox/controller owners
with controlled read/post faults. It verifies immutable bytes, first/bound/
Markdown/file-only sends, exact binding, replay, explicit failed/unknown recovery
and session replacement during both stream and post. No live/network/socket/
browser effect is allowed. Existing multipart/injection and both-editor
recipient-file/upload workflows remain independent gates, not live latency
or installed-editor acceptance.

## Tracing provider startup, renewal and failure

`session.start` → finite intent → engine credential/config admission →
authorization → existing feature lifecycles → construction ports → concrete
providers. Messaging construction then installs unchanged store callbacks and
performs its normal initial room load; read-status startup keeps its existing
initial evidence gate. Optional agenda I/O does not become a messaging-startup
dependency. Presence remains relevance/explicit-lookup driven.

On renewal, trace new access → current engine generation → source replacement,
presence replacement/shared physical owner, agenda `setSession()` and unchanged
sender grant. These are deliberately different lifetimes, not a unified
“restart all providers” policy. A feature failure should remain feature health:
ready history still works, and incomplete/failed source evidence is not fresh
unread or absence. Authorization/construction failure follows engine cleanup;
explicit restart may recover, but construction never retries a mutation.
For retired results, inspect the owning lifecycle and store-generation fence,
not a new composition-module cache.

`backend-providers.test.ts` checks lazy/reference-compatible construction,
exact options, physical-owner identity, fresh defaults, dynamic fetch/clock,
messaging receiver/nullish fallback and transparent factory failure.
`backend-providers-integration.test.ts` uses ordinary RPC with actual REST
providers/messaging store and synthetic OAuth/read-source/GET responses:
demo/opt-outs, normal history/presence/agenda, token renewal, feature failures,
authorization/construction cleanup and held-source/agenda replacement. Socket,
browser, receipt and mutation effects are forbidden. Existing feature and
native workflows remain independent gates; synthetic response timing is not
live-service latency or operator acceptance.

## Tracing workspace opening and recovery

`:Webex` → command setup → `workspace.open()` → ensure owned projections →
existing layout transaction → draft/setup/render effects → existing session RPC.
For explicit `Enter`, follow loaded-row/action admission → correlated selection
response/origin checks → `workspace.show()` → setup/view jump and existing
receipt guards. Passive state publication renders existing surfaces; it does not
open or replace windows. A failed backend does not invalidate native text.

For a missing view, distinguish a wiped/closed projection from a promoted buffer
or reserved-name collision before explicitly reopening. Check `wbx#buffers()`
and exact ownership, then `workspace.ensure/open/show`, not the SDK or OAuth
source. `workspace-owner.vim` tests the boundary with inert effects;
`workspace-workflows.vim` tests actual public commands, independent split views,
held navigation, failure/recovery and transport/session replacement with only
transport bytes made inert. Native promotion, mappings, geometry, syntax and
media-lifetime regressions remain separate fixtures.

## Tracing redraw and retained annotations

Accepted state → existing domain/draft/unread/paging observation → application
render facade → `render.apply()` → rooms/history projection → `view.write()` →
aligned metadata/syntax/folds/image placement → composer/status → existing
feature scheduling. `wbx#redraw()` uses the same route; `wbx#redraw_status()` asks
the owner whether draft revision requires full assembly first.

If text is stale, check exact ownership, load/annotation state and render tick
**before** investigating history projection keys. A refused write must also keep
its old message/row metadata; a changed header height must invalidate offsets.
For a focus jump, trace the existing selection request/origin guard or explicit
workspace operation, not the display cache. For a missing receipt, inspect
current source/newest endpoint and exact action guards, never cached completeness.
`render-owner.vim` runs real presentation/view primitives with inert application
effects; `render-workflows.vim` exercises public Enter/redraw/status/Refresh! with
only transport bytes made inert. Projection/structural/status performance
fixtures remain separate regression gates, not latency claims.

## Tracing Enter, returning navigation and late responses

Enter → unchanged loaded row/meeting/section dispatch → `wbx#select()` →
`selection.select()` → duplicate/local-resume decision or fixed `rooms.select`
adapter → existing connection/channel. An accepted response calls the selection
owner, which checks its current intent and **current** context before invoking
`history_activation.open()`. A response does not publish state.

If a response does not focus history, inspect: a newer intent, an actual origin
leave, explicit cancellation, an error, a changed/not-ready current room or
loaded-row membership, then annotation/promotion/native setup guards. Do not
force a redraw, retry a mutation, clear a draft or infer revocation to fix a
canceled navigation. For a ready same-space return, absence of an RPC and of an
automatic receipt is expected.

`selection-owner.vim` exercises the lifecycle with inert context/request/
activation effects and real native origin windows. `selection-workflows.vim`
uses public Enter/select/disconnect commands with only transport bytes inert:
normal open, duplicate loading, local returns, held/late replies, focus-neutral
programmatic selection and explicit failure/recovery are positive workflows.
Exact positive receipt targets require actual viewport evidence: drawn Vim and
Neovim checks cover them; plain Vim ex-mode correctly sends zero receipts.

For a missing receipt, follow accepted state → activation `observe()` separately
from focus/selection → activation `open()` → post-setup ownership → local
open/render → **reread current state** → `newest()` physical endpoint → `read()`.
Then distinguish pending overlap, retained failed attempt, stale/unknown flags,
old or incomplete history and hidden/folded endpoint. ACK only releases pending;
the next authoritative read observation ends an attempt interval. Never clear
attempts or retry a mutation just to make an automatic receipt appear.

`activation-owner.vim` tests sequencing and application-state replacement with
inert effects and real native ownership/visibility, plus independent receipt
admission/settlement/bounds. `activation-workflows.vim` exercises public
Enter/reload/manual-read, real BufEnter/FileType redirection/promotion/annotation,
failed receipt deduplication, explicit recovery and late selection responses.
The existing selection/reading/ownership/navigation/media fixtures remain
independent regressions. Positive receipt counts require drawn Vim or Neovim's
virtual/drawn UI; undrawn Vim must issue zero.

## Tracing buffer setup, re-entry and promotion

Workspace open/explicit navigation or native BufEnter → existing setup facade →
`buffer_setup.apply()` → exact ownership → reload/first-window preparation →
current presentation/window effects → initial native defaults → actual FileType
hooks → current-buffer/ownership recheck → default maps → `WbxBuffer`.
Repeated entry stops at the existing initialization guard before defaults/hooks/
mapping installation. A renderer-requested draft refresh instead uses the
existing draft facade → `buffer_setup.draft()` and its feature-owned effects.

For a missing/custom key, inspect the current buffer-local mapping and the
recorded `b:wbx_default_maps` snapshots, explicit mapping/read/Ctrl-S opt-outs,
FileType hooks and later user overrides before changing dispatch. Native global
maps are not owned defaults. For stale setup after renaming/changing buftype,
check exact ownership and promotion cleanup, not source/session freshness.
For a FileType hook that redirects or promotes, no later default send map or
owned-buffer event is expected. Clean thread/query lists deliberately keep their
independent presentation metadata.

`setup-owner.vim` exercises native hooks, ownership, option/mapping lifetimes,
localleader changes, promotion/redirection and clean thread re-entry with inert
application effects. `setup-workflows.vim` exercises public opening, Enter/
compose, native editing/write, re-entry, failure/recovery and fresh compose after
promotion with only physical transport inert. Existing UX/ownership, completion,
workspace, renderer and selection fixtures remain separate regression gates.

## Composer send: one consent-to-dispatch action

`send_action.vim` owns the finite flow behind unchanged public `wbx#send()` /
`:WebexSend`. Its object contains **ports only**, not another session, pending
request or uncertainty registry. It composes existing draft/view/productivity/
persistence primitives and delegates recipient-composer sends to the existing
`conversations.vim` owner before entering normal room-composer policy.

Ten synchronous ports provide current `State`, `Destination`, `Supports`,
`SupportsUpload`, raw negotiated `Capabilities`, `NextId`, `Consent`, `Request`,
`Notify` and `Render`. The connection retains ID allocation/correlation;
`Capabilities` preserves the original reply check rather than silently replacing
it with a different current-state policy. `Consent` is the existing real
`rich#consent()` helper, including independent mention and `@all` gates.
Constructing the owner performs no action.

| Stage | Preserved rule / independent owner |
| --- | --- |
| Entry | Require an owned destination-bound composer; original quote/profile recovery, already-sent, destination-ready, length, empty-content, uncertainty/pending, reply and format/file capability checks keep their original ordering. Ordinary Enter/write remain native, not send consent. |
| Capture / consent | Capture native view intent, draft ID, text, staged file, format and parent. `rich.vim` decides mention consent; labels never grant recipient authority. Canceled consent allocates no request and does not edit text. |
| After consent | Recheck actual intent (including leave-and-return, buffer/name/tick, selected room, format/parent, session/epoch), exact staged file/draft ID/text, pending and uncertain state. Reread **current** application state for quote proof; a pre-dialog snapshot cannot stand in for post-dialog evidence. |
| Register / dispatch | Allocate the original editor request ID, register exact pending evidence with `drafts.vim` **before** transport may answer synchronously, then dispatch exactly one of `messages.send`, `messages.sendRich` or `uploads.send`. Rich-only wire format remains implicit; combined-file format/draft/attachment fields stay explicit. No fallback, downgrade or queue is added. |
| RPC response | Success alone is not a delivery and does not clear pending/text. An error releases only that request through `drafts#failed`; `-32004` retains uncertain submission. Refused local dispatch preserves the original known-failure behavior. No automatic retry occurs. |
| Delivery / recovery | `drafts.vim` retains exact outcome matching, uncertainty evidence and disconnect behavior. `delivery_clear.vim` performs exact session/text/revision/format/attachment clearing and local-only retries, invoked by application delivery ingress. `delivery_recovery.vim` owns the bound acknowledged recovery request behind `resolve_delivery`. None of those lifetimes moves into the send action. |
| Replacement | Existing connection reset retires callbacks; draft disconnect retains uncertainty and profile/session guards retain old user work. A retired callback cannot release newer pending admission. A new explicit action after appropriate recovery is independent, never an automatic replay. |

To extend send behavior, first locate its authority: finite DTO/capability
policy, local draft evidence, native consent/intent orchestration, backend
admission or transport. Keep exact capture/rechecks around any synchronous
prompt/hook, and registration before potentially synchronous callbacks. Do not
put successful-delivery clearing, a second uncertain ledger or a generic action
registry here. Recipient sends, uploads and backend mutations retain their own
contracts and physical admission.

Trace a missing send as public command → recipient handoff or entry guards →
captured intent → consent → exact current rechecks → pending registration →
finite RPC route → RPC response **separately from** delivery. For retained text,
distinguish known refusal, possible submission, matching delivery of older text,
changed account/session and local clear failure. Never retry a service write to
repair a local clear or treat an RPC success as permission to erase native work.

`send-owner.vim` tests the action with inert application/consent/request ports
and real draft ledger, native intent/undo and quote checks. It covers positive
plain/reply/rich/file-only/combined routes, cancellation/races, synchronous
response/refusal and retired callbacks. `send-workflows.vim` uses public commands
with real rich consent and only transport made inert: ordinary success, explicit
failed/unknown recovery, late delivery preserving newer work and transport/
session replacement. Its drawn mode types actual keys into three real native
prompts on the child's private PTY: default Cancel, mention acceptance and
separate `@all` acceptance. Headless mode does not claim keyboard acceptance.
The existing 50-dialog native-confirmations fixture remains an independent gate;
the drawn runner's explicit keyboard allowlist adds only this inert workflow.

## Successful-delivery clear and local-only retry lifetime

`delivery_clear.vim` owns the former `s:clear_delivery` operation and its timer
continuations. Four synchronous ports supply current `State`, guarded native
`Write`, `Render` and `Notify`. The owner object holds **ports only**; a scheduled
callback retains the same acknowledged pending evidence, captured session and
remaining attempt budget. No new session counter, pending/outcome ledger,
timer-handle registry or shutdown/replay policy is introduced.

The application still admits a known, exact `sent` delivery through the existing
draft ledger, updates unread/notification evidence and passes the captured
current session plus the original budget of three deferred attempts. Failed/
unknown outcomes never enter the successful-clear path. Correlation and delivery
events, upload retirement and bound uncertainty resolution stay unchanged.

| Boundary | Preserved clear rule |
| --- | --- |
| Every attempt | Require current application session equal to the captured session and ready state; exact owned composer, room, parent, format, attachment/non-stale source, native changedtick and full text must all match. No selected-window/focus requirement is invented: a matching background composer may clear without disturbing foreground work. |
| Before native write | Install the existing confirmed-sent marker with exact text revision/destination/parent/format and current attachment revision. This prevents accidental resend if the already-confirmed text cannot be removed. It is not uncertainty or permission to erase newer work. |
| Write result | Use the original guarded native writer, preserving native undo. Both a truthy write result **and** actual buffer contents `['']` are needed before cleanup. Catch only the original `Vim` exceptions; unrelated exceptions retain their propagation contract. |
| Success | Remove copied-quote guards and notify existing draft/persistence observation owners. Immediate success leaves redraw ordering to the delivery caller; deferred success additionally redraws once through its original timer-callback argument policy. |
| Retry | At most three 10 ms deferred writes after the initial attempt, only when there is **no attachment key**. Each attempt repeats all current evidence checks. The callback has no send/RPC/resolve port; it cannot replay a service write. |
| File / exhaustion | A blocked attachment clear is not deferred across upload retirement. Exhaustion retains native text and confirmed-sent evidence and warns; it does not call delivery resolution, clear unknown outcomes or resend. |
| New work / replacement | New text/revision/format/attachment/parent, promotion or changed session/readiness simply retires that local attempt before writing. The existing timers may settle, but cannot regain authority from a new session or erase newer native work. |

To extend clearing, keep outcome matching in `drafts.vim`, byte/attachment
retirement in upload owners, native writes in view primitives and only exact
admission/retry here. Do not make the initial write or each retry fetch an ACK,
retry a send, adopt a different account session or reconstruct a new pending
record from current text. Local clear failure after confirmed delivery is
different from unknown service delivery: the unchanged confirmed copy is blocked;
the user may deliberately edit new work, not silently resend it.

Trace retained text as delivery ingress → exact ledger match → `sent` branch →
clear current-session/owned-buffer/text/revision/attachment checks → native
write/result → local observations or bounded local retry. Separately inspect
the application renderer, upload cleanup and delivery event. A successful RPC
alone still cannot clear text, and resolving an uncertain request is not a
local-editor repair action.

`delivery-clear-owner.vim` exercises immediate/background clears, independent
guard failures, transient and exhausted local writes, actual native
expression-mapping textlock, deferred current-state changes, exact attachment
behavior and error propagation. `delivery-clear-workflows.vim` uses public
send/delivery ingress with real native buffers/timers and controlled write
faults: ordinary ACK clear, newer-edit retention, no-resend recovery, upload
retirement and session replacement/late duplicate ACK. Existing persistence,
send, upload, full-undo and real-confirmation fixtures remain independent gates.

The earlier full delivery/render expression-mapping `E565` reproduction is now
fixed by the separate presentation-request boundary below. The archived failing
fixture passes unchanged in both editors. Clear-only textlock tests and public
controlled-write-fault tests remain unchanged as independent checks; they are
no longer the only textlock acceptance.

## Textlock-safe presentation, not delivery replay

`render_request.vim` surrounds the existing rooms/history rendering effect.
Normal requests remain synchronous. Only native **E565** queues a 10 ms local
presentation retry; ordinary/native non-E565 errors still propagate. A pending
request coalesces later redraws for the same lifetime, retaining a small context
key and attempt budget—not rendered text, application state, ACKs or mutations.
Deferred rendering calls the original effect with **current** state.

The application supplies four ports: `Context`, `Render`, `Interrupted`,
`Notify`. `Context` reads existing session/state/disconnect evidence rather than
adding a new epoch. Request dictionary identity plus timer identity prevents
retired/reentrant callbacks from replacing newer work. Application session
transitions, transport preparation/loss, disconnect and shutdown cancel pending
presentation. A changed selection within the same session renders the current
selection, never a captured pre-lock projection.

| Boundary | Rule |
| --- | --- |
| ACK handling | Existing exact draft correlation, uncertainty, sent evidence, local clear, upload retirement, notice and `WbxDelivery` event run once. No ACK processing is in the redraw callback. Duplicate ACKs still cannot release another request. |
| Rendering | Normal unlocked ordering is unchanged. If native textlock interrupts presentation, the caller continues, including its one delivery event; only presentation is deferred. Under lock, that event may precede the eventual surface update. |
| Interrupted projection | Native view writes restore their previous `modifiable` option on failure, without suppressing the exception or committing new render metadata. Managed projections cannot be left editable by E565. |
| Cache recovery | `render#interrupted()` invalidates only status/draft signatures that might have been committed before interrupted effects. History projection caching and exact authority remain independent. |
| Retry | One timer/work record, at most three deferred presentation attempts after the initial one. Each validates current lifetime and request identity. Reentrant hooks cannot strand/overwrite a newer timer. No send, delivery-clear or uncertainty-resolution port exists. |
| Continued lock | Exhaustion warns and releases presentation work; it does not change acknowledged delivery state. After leaving the callback, `:call wbx#redraw()` explicitly retries local presentation without fetching or resending. |
| Replacement | Current-state redraws can render a new session only through its own request. Old timers/clear attempts remain fenced; pending new text and outcome/event counts do not change. |

To add presentation effects, keep them in the existing renderer/view owners and
route application rooms/history rendering through this boundary. Do not defer
whole service callbacks, hide non-textlock errors, capture old snapshots or
turn redraw into delivery/uncertainty authority. Delivery observers should read
accepted state rather than infer action completion from buffer repaint timing.

`render-request-owner.vim` uses real expression-mapping E565/native projection
writes to verify coalescing, option restoration, latest-state rendering,
invalidation, stale/reentrant callback fencing, bounded exhaustion/explicit
recovery and error propagation. `delivery-render-workflows.vim` executes the
complete real ACK callback under native textlock with inert physical transport:
sent/unknown/failed outcomes, duplicate ACKs, exactly-once events, newer native
edits, explicit checked recovery and session replacement. It does not stub the
renderer or catch/ignore the former E565. The exact archived full-ingress
failure also passes unchanged. Headless and drawn results in both editors are
offline native behavior evidence, not live-service latency or assistive readout.

## Destination-bound delivery recovery request

`delivery_recovery.vim` owns the former public resolution orchestration and
private response callback. `wbx#resolve_delivery()` / `:WebexResolveDelivery`
remain unchanged entrypoints. The owner holds **ports only**, while the existing
RPC callback retains the captured room ID, native view intent and uncertainty
evidence. There is no new session epoch, pending registry, request queue, timer
or single-flight rule. Multiple deliberate recovery requests keep their
independent evidence/intent checks; connection/channel still correlate and
retire each callback.

Six synchronous ports provide current `State`, capability `Supports`, fixed
`Request`, `ProtocolError`, `Render` and `Notify`. Draft/persistence/view
primitives remain the same concrete owners. Construction performs no action.

| Stage | Exact preserved rule |
| --- | --- |
| Explicit admission | Require existing account-verified persistence readiness first, a selected room dictionary, current `delivery-resolution-v1` support and no pending send **for that room**. Another room's pending send does not become a global recovery block. |
| Request | Capture `view#intent()`, exact selected room and `drafts#evidence(room)`. Dispatch only `delivery.resolveBound` with `{roomId}`. No legacy unbound reset, target inference, auto-check, resend or receipt is introduced. Dispatch/refusal alone never resolves native uncertainty. |
| Error/stale callback | An RPC error or changed native intent returns without resolution, persistence update or redraw. Real intent covers text/tick, buffer/window/name/type, selection, format/parent, state/readiness, session/epoch and leave-and-return. Reject stale output before interpreting its body. |
| ACK shape | Require a dictionary with **only** `roomId`, equal to the captured room. Wrong room, missing/wrong type or extra fields use the existing protocol-error/disconnect path; they never count as successful checking. |
| Evidence compare | `drafts#resolve(room, capturedEvidence)` owns the compare-and-resolve. New uncertainty for the same room defeats an older ACK even if native intent is unchanged. Only a successful comparison notifies `draft_persistence#resolved(room)`; the original current-intent redraw still follows a well-shaped ACK, including a failed evidence comparison. |
| Scope | Resolution checks one room's uncertainty, not one attachment/message ACK or local clear. It never changes native draft text/undo, emits a delivery event, clears a confirmed-sent copy or sends a message. Preserve explicit backend recovery when local evidence is zero; don't invent an extra uncertainty prerequisite. |
| Replacement/correlation | A messaging-session change invalidates captured intent. Physical transport replacement drops callbacks in the existing channel while keeping IDs monotonic. Duplicate RPC replies cannot invoke retired callbacks. A fresh explicit request may recover current evidence; old requests are never replayed. |

To extend recovery, put uncertainty transitions in `drafts.vim`, durable profile
updates in `draft_persistence.vim`, protocol schemas/admission in their wire/
backend owners, and only request admission plus guarded callback orchestration
here. Do not replace the evidence comparison with a blind reset, add a second
uncertainty ledger or treat a local clear failure as an unknown service send.
The user's deliberate check is still required; this feature does not determine
remote absence from incomplete history.

Trace `:WebexResolveDelivery` → persistence readiness → selected room/support/
same-room pending admission → captured intent/evidence → fixed bound request →
channel correlation → error/intent/shape/evidence checks → persistence
observation → presentation. Distinguish a rejected request from a rejected
response, and stale native intent from newer uncertainty evidence. None is
permission to retry a send. Error notices remain channel/application-owned;
malformed current ACKs still disconnect through the original protocol handler.

`delivery-recovery-owner.vim` tests the moved policy with real view-intent and
draft-evidence primitives, inert application ports, and controlled persistence
readiness/observation. It covers positive/synchronous success, refusal/errors,
independent admission, malformed results, intent changes and newer evidence.
`delivery-recovery-workflows.vim` uses public sends/recovery and real native
RPC/intent/evidence/render/protocol owners with inert physical transport:
normal ACK recovery followed by a deliberate successful send, errors, changed
room/new text, newer evidence/duplicate RPC replies, messaging and transport
replacement, protocol disconnect and explicit reconnect/recovery. A controlled
newer uncertainty observation isolates the evidence guard without changing
native intent. Existing delivery-resolution, persistence, ACK/textlock and
confirmation fixtures remain independent regressions in both editors.

## Attachment-open/cancellation lifetime and physical ownership

`attachment_open.vim` owns the former native coordinator's cohesive attachment
action, including typed inline/chunked dispatch and legacy original/image
fallback. Its object contains the **same four moved state fields**: logical
busy, action serial, owner generation and current intent, plus ports. No second
pending registry, session epoch, file cache or physical transfer owner is added.
All public `wbx#attachment_*` and stream callbacks remain thin compatible
facades; native cursor/leave autocommands still use the original public check.

| Boundary | Ownership / interaction |
| --- | --- |
| Current source | `Message` is the existing guarded current-history selector: exact selected room/message, owned unchanged projection, connection and readiness. The action additionally checks exact window/buffer/row/attachment, serial, generation, revocation and captured settings. |
| Application/connection ports | `State`, `Options`, `Capabilities`, `Disconnected`, `CanCancel`, `Request`, `ProtocolError`, `Notify` read current composition/effects. The action retains no application snapshot or transport handle. Wire validation and RPC correlation remain unchanged. |
| Shared images | `ImageBusy` / `SetImageBusy` forward the coordinator's existing preview-read flag, not a copied second flag. `ImageOpen` delegates the existing image-only action. Narrow generation/preview-block selectors preserve source-bound snapshot stamps and preview admission. |
| Typed read | Capture settings/policy, bind exact IDs/action/selectors and enforce the existing byte limit. Inline and chunk payload modes and original-versus-PNG policy must match the negotiated action. Invalid identity/metadata still follows protocol-disconnect, never a fallback/downgrade. |
| Chunk handoff | `attachment_stream.vim` owns real sink preflight, one physical job, credit/pulls, completion/integrity, commit and draining admission. The action passes the **same context dictionary** through preflight/resolve/result, never aggregates/reconstructs bytes or interprets revocation as helper exit. |
| File/image effects | `attachments.vim` still validates final metadata/handler policy, download prompts/new-file paths, private leases, UTF-8/native view and external/terminal jobs. `images.vim` / snapshots retain image data/placement. Successful handoff retires action intent before native focus changes can cancel it. |
| Cancel | Clear current intent, mark its shared context revoked and advance serial before stopping local handlers/sinks. Only an already-connected live transport with a positive original request ID gets exact `messages.attachmentCancel`. Repeated cancel is inert; it never connects, retries a read or cancels a guessed target. |
| Busy/failure | Logical busy cannot override file or sink busy, including stubborn draining helpers. Read refusal/error and local materialization failure keep their original cleanup/notice contracts; only a new explicit action retries. Old serial responses/failures/handoffs cannot release newer action admission. |
| Lifecycle | Preparation, transport loss, explicit stop and selection retain their original distinct cleanup/fence ordering, not a generic reset. Existing application state/session transitions now also stop this lifetime, fixing the same-ID session gap described below. |

The same-ID replacement probe exposed a pre-existing gap: with unchanged ready
state, room/message/attachment IDs and source row, a held typed result could
still open after the accepted messaging session changed. This reproduced on
both preserved baseline and pure extraction, in both editors. The existing
state/session-transition branch now invokes the moved stop operation before
accepting replacement state. It revokes the old action and advances its
existing generation/serial; **no extra session counter** is added. The unchanged
probe now refuses that result, while a fresh explicit replacement-session read
opens normally. This strengthens session admission without weakening physical
sink/file admission.

To add attachment behavior, put only exact selection/request/response/handoff
orchestration here. Put byte limits/integrity/remote admission in backend
content/transfer owners, physical sink credit/draining in `attachment_stream`,
file/handler materialization in `attachments`/local-job owners and image cache/
placement in image owners. Do not re-fetch on a handler error, downgrade selected
policy, copy the shared context, or release physical admission on logical
cancellation. Preserve legacy routes deliberately until their public
compatibility contract changes.

Trace an ordinary open as explicit command → current guarded message → exact
attachment/chooser intent → capabilities/settings → inline RPC or sink preflight
→ validated metadata/body → file/image handoff → actual helper settlement.
For a canceled open, distinguish action serial/generation/revocation from
request correlation and physical sink draining. For missing output, inspect
protocol failure, selected handler policy and native hooks separately; never
resolve send uncertainty or infer absence from attachment read failure.

`attachment-open-owner.vim` uses real native view/policy/protocol primitives
with controlled application and physical-effect ports to test exact routing,
context identity, error/refusal recovery, cancellation, draining admission,
settings/source checks, chunk handoff, legacy dispatch and chooser staleness.
`attachment-open-workflows.vim` uses public commands, real private lease/chunk
helpers and native buffers with inert transport only: exact inline/chunk text,
annotation/full-undo retention, errors and explicit recovery, late canceled
responses/new busy admission, settings and same-ID session replacement,
physical reconnect and malformed metadata recovery. Existing typed/download/
image, chunk fault and stubborn-sink fixtures remain unchanged independent
gates. No live service or operator-observed acceptance is claimed.

## Image preview/open request lifetime

`image_request.vim` owns the three moved preview fields: room, attempted
messages and shared busy admission. Busy is now a **request identity dictionary**
rather than an unqualified boolean; no parallel flag, serial or session counter
is added. Public `wbx#_images_visible()` / `wbx#image_open()` remain facades.
Images/snapshots/rendering and physical external leases remain unchanged owners.

| Boundary | Preserved behavior and deliberate correctness changes |
| --- | --- |
| Automatic preview | Default-on; explicit `images=0`/`false` disables it. Require connection/capability/readiness, unchanged owned selected-room history, no open attachment intent, unfolded visible pending row and at most 16 attempted messages per room. Mark before dispatch; failure/refusal does not silently retry that message. A new room resets attempts; accepted state/session replacement now resets the retired request/attempt lifetime as well. |
| Explicit open | Existing guarded `Message` selector supplies exact current history, indices 1–4 and placement-derived selection. Mode/external-viewer validation, response schema/ID checks and captured window/buffer/message checks remain. Failed preview/open can be recovered by a new deliberate open; never send, mark read or automatically retry. |
| Shared attachment admission | `ImageBusy` / `SetImageBusy` bridge to this single owner. Acquisition returns the actual reservation dictionary; completion/refusal releases only that identical dictionary, not an equal copy or a newer read. Legacy attachment fallback captures the token; its late callback cannot release a replacement image request. Typed attachments retain their own logical intent and physical backend/sink admission. |
| Source identity | Capture the **existing attachment generation**, exact room and message before dispatch; never stamp a reply with whatever generation happens to be current. Existing state/session stop advances that generation. A retired reservation/generation cannot authorize bytes or a protocol failure in replacement work. No second source/session ledger is created. |
| History reuse | Require exact `{owner, room, message}` source stamp, image ID/width, clean owned image buffer. Another message/session sharing an image ID must fetch its own image explicitly. Legacy fallback uses this same predicate and now stamps its accepted image. The typed path retains its existing equivalent source/ownership checks. |
| Local conflict | A matching same-source buffer snapshot that holds annotations is rejected locally for buffer-mode reopening, without fetching bytes that cannot be displayed. This preserves the original six-read regression contract; a deliberate rename/promotion permits a new open. Different uncached images and external-mode policy retain their existing routes. |
| Viewer-local reuse | A clean current image viewer is a memory-only snapshot, not a history target. It remains usable locally after source-session replacement and makes no read/reselection. Edited/promoted views keep their native text/undo; neither reuse nor fresh materialization may overwrite them. |
| Settlement | Callback identity fences release **before** scheduling more visibility work or interpreting a stale body. Accepted-state preview publication/rendering still belongs to backend ingress/renderer, not the response callback. RPC correlation, duplicate replies and physical content admission remain existing owners. Reset invalidates logical authority, not evidence of physical helper exit. |

Ports provide current state/options/message/capabilities/readiness/disconnection,
attachment preview blocking/generation, request dispatch, protocol error and
notice. Rendering/scheduling delegates directly to image owners. Source-qualified
reuse is a read-only predicate over their existing buffer metadata, not a cache.

Two correctness gaps were reproduced on the preserved baseline in **both
editors**, using the unchanged source probe: same-ID session replacement could
open a held retired reply, and another message with the same image ID reused an
unrelated snapshot without fetching. The probe now rejects both. Identity-bound
settlement additionally closes unconditional busy release by old image/preview/
legacy-fallback callbacks; standalone and public workflows prove that a newer
read stays reserved. These changes are separate from mechanical extraction.

To extend: put request selection/admission/callback orchestration here, image
data/annotations/placements in `images`/snapshots, private exports/viewer jobs in
`image_external`/local owners, physical content admission/conversion in backend
owners and typed file/sink handling in attachment owners. Do not make a viewer
snapshot authority to reselect a room, key history reuse on image ID alone,
clear shared admission without the captured token, or release physical sinks on
logical reset.

Trace loading as visible pending history → opt-out/source/budget/admission →
`messages.images` → backend accepted state → history render. Trace explicit
opening as guarded current image selection → same-source reuse or one
`messages.imageOpen` → reservation/schema/source checks → image materialization.
For a missing open, distinguish retained annotation, stale source, busy
admission, RPC error and malformed current response. Recovery is explicit;
incomplete history is never proof of remote absence.

`image-request-owner.vim` controls request/image effects with real view/protocol
primitives and the actual legacy attachment fallback. Both drawn editors
exercise the full 16-attempt budget; headless Vim can invalidate its viewport
after a callback, where the fixture instead verifies no invisible auto-read.
`image-request-workflows.vim` uses public commands and real
RPC/state/view/render/snapshot owners with inert physical transport only. It
covers default preview loading, zero-fetch same-source reuse, cross-message
fetch, annotations/full undo, explicit recovery, late preview/open replies,
session replacement, shared legacy fallback and protocol disconnect/reconnect.
The existing six-read image-opening, external/terminal hooks, renderer, typed
attachment and draining-sink fixtures remain independent regressions.

## Independent native meeting action/request lifetime

`meeting_action.vim` owns the existing meeting observation, event evidence,
meeting epoch, local detached intent and recorded terminal-session stamp moved
from `wbx.vim`, plus the existing pane pending/serial fields moved from
`meeting.vim`. There is one logical owner, not another pending registry,
application-session epoch or physical terminal manager. Public commands/getters
and native view-open/closed callbacks remain compatible. Internal pane/recovery
facades connect the existing menu to the owner.

| Boundary | Ownership / rules |
| --- | --- |
| Messaging versus meeting | Connection negotiation supplies readiness/capabilities, but meeting controls use **independent active/ready meeting state**, not selected-room or messaging readiness. Messaging idle/failure/session replacement cannot retire an already-dispatched meeting request. An open modal choice still requires unchanged native picker context, including its original messaging context; that is not permission to invalidate a dispatched meeting ACK. |
| Observations | Protocol-valid meeting snapshots update the existing meeting epoch when changed. Owner/session/active changes clear old media observations; readiness-only changes retain last observations as stale. Detached public getters prevent outside mutation; compact status reads current owner evidence without copying it on every status redraw. Media-event keys remain `send-state:<kind>` or event type; no native source/session identity is invented for unbound media events. |
| Explicit actions | Start retains demo/live/link/config/headless policy and prompt cancellation. Present-editor still focuses the physical client before dispatch; detach/close changes only local view intent. Controls and upcoming rows retain exact existing finite wire routes. Guarded upcoming selection still cancels room-focus intent before exact ID/revision dispatch. Upcoming refresh cannot start a connection. |
| Pane menu versus request | `meeting.vim` builds bounded revision-paired source/layout choices and obtains native picker intent. The action owner rechecks index, epoch, exact meeting/panes snapshot, capability/readiness and native intent, then captures the exact session/revision/action. Source choices come from the capability envelope, not separately arriving media observations. Unavailable slots make no request. The moved serial remains monotonic; only one pending pane request is admitted. |
| ACK / recovery | Exact session, revision, action and finite status shape remain mandatory. Applied/refused/unknown are **presentation outcomes**, never transmission confirmation. Error/refusal/unknown releases local admission under the existing contract and never queues a mutation retry. Recovery is a new deliberate action. Dispatch refusal releases only its own serial, including synchronous/reentrant response safety. |
| Replacement | A new meeting owner or inactive transition retires old logical pending authority before new explicit work can be admitted. Late old ACKs cannot report replacement success, validate a stale malformed body or release a newer request. Do **not** fence ACKs on every meeting epoch: the same owner's normal pane-revision publication can arrive before its valid ACK. Transport loss retires the pending callback/epoch early, then marks meeting readiness false at the original later point in application cleanup. |
| Reconnect / auth | Explicit reconnect binds the last active original meeting session and permits unready controls only for the negotiated recovery capability. It cannot join/rejoin or replay toggles/auth. Explicit auth refresh remains `meeting.control {action: auth.refresh}`, not messaging auth. Missing capabilities/readiness never broaden admission. |
| Terminal ownership | Validated tmux attach argv passes through a `Terminal` port; the recorded session stamp is existing logical bookkeeping, **not a process handle**. `transport.vim` owns the actual job/buffer/client generation, duplicate-client suppression, hidden-tab/focus behavior, exited-client replacement and stale exit callbacks. Detach stops only this editor's tmux client, never sends keys/Ctrl-C to the media owner. |
| Presentation / shutdown | Meeting ingress preserves detach → render → optional terminal attach → event ordering. Closing or locally detached intent suppresses automatic attach. Hello acceptance updates observations/status but does not silently attach. Existing shutdown policy still chooses detach versus explicit leave-on-exit; editor/view closure alone never proves the meeting ended or media stopped. Native status rendering/workspace handles stay in their current owners and retain stale/unknown/NOT SENT wording. |

Ports supply current options/input, connection assertions, closing state, RPC/
notice/protocol effects, native rendering/events/selection cancellation and the
three physical terminal operations. Construction is inert. No tmux execution,
terminal buffers, media/device handles, service grants or RPC callback map moves
into this owner.

The unchanged meeting-session probe found a baseline gap in both editors: a
held old-owner pane request blocked a fresh replacement-owner request, then its
late ACK still reported “applied.” The moved owner now retires pending logical
authority on the **existing owner/active transition**, retaining the existing
serial to reject late callbacks. The same probe now admits fresh replacement
work and ignores the retired ACK. This is the declared correctness fix, separate
from extraction; it does not retry, cancel or infer absence of the old remote
operation.

To extend: add bounded menu construction in `meeting.vim`, exact action/
request/response policy here, wire validation in protocol owners and native
status projection in the existing renderer. Put actual tmux client lifetime in
`transport.vim` and media/session/device ownership in backend meeting owners.
Do not add another session counter, equate room/session failure with call loss,
infer stopped sending from an unavailable status, or auto-replay a pane/control
request after reconnect.

Trace a normal pane operation as native choice → captured context/meeting
envelope → exact session/revision dispatch → channel correlation → serial/body
checks → bounded result notice. For a missing result, distinguish stale modal
choice, logical pending admission, RPC error/unknown outcome and retired owner.
Trace presentation as explicit display request → accepted meeting notification
→ local detach/closing gate → existing physical client attach/focus; request
dispatch alone is not terminal readiness or confirmed transmission.

`meeting-action-owner.vim` tests the logical policy with real native intent and
inert request/terminal effects. `meeting-action-workflows.vim` uses public
commands and real native RPC/observation/status owners with inert transport/
terminal effects, covering ordinary start/pane success, same-owner pre-ACK
revision publication, explicit error recovery, local detach, owner replacement,
independent messaging replacement and transport loss/recovery. Existing real
native chooser/upcoming fixtures remain regressions; the chooser fixture adapts
only its application seam to the moved owner, retaining its prior assertions.
`meeting-terminal-owner.vim` separately exercises the **unchanged actual
terminal/tmux client implementation**: attach/reuse/focus, explicit detach/
reattach, stale client-exit generation, meeting-owner replacement and manual
view closure. It uses two isolated sleep-only owner panes and positive
session/PID/attached-count evidence, not service/device/media processes or
inferred absence. Closing/shutdown must leave both owner processes intact.

The original extraction also attempted the broader opt-in media/demo
`meeting.test.ts` suite and did **not** accept it as passing: that candidate
failed six final leave/cleanup checks and its baseline failed four of six.
Those historical failures remain in refactor 26's evidence. The subsequent
owner-scoped cleanup fix below resolves the unchanged six-case offline suite;
it does not certify live media latency or graphical Kitty acceptance.

## Explicit-leave auxiliary-pane cleanup authority

The leak was a policy mismatch, not a reason to weaken disconnect handling:
`CallPanes.close()` assumed broker closure made view processes exit, while
viewers intentionally remain open on broker loss because an unavailable
transport is **not proof that media stopped**. Some viewers received an ended
event before disconnection and exited; others retained unknown state and kept
their panes/session alive. The ending owner must clean up its recorded
auxiliary views independently of that packet ordering.

The fix stays in `CallPanes`, which already records each pane's window, PID,
source and owner marker. Close is idempotent, invalidates future roster work,
retains the existing one-second bounded queue drain, then starts independent
bounded cleanup for recorded **non-owner** panes. A tmux `if-shell -F` condition
compares all four identity fields in the server immediately before the scoped
`kill-pane`. It does not launch a shell, signal the media-owner process, send
terminal keys or kill a window/session/server. Foreign neighbours and changed,
retagged, moved, respawned or missing pane identities are not cleanup authority.
A failed child cleanup cannot skip its siblings.

A split already dispatched before close can physically finish after the queue
drain deadline. Its exact creation receipt is retained, tagged and passed
through the same guarded cleanup instead of being lost after logical closing.
No late geometry or replacement work is admitted. Bounds are not interpreted
as cancellation or proof of absence.

`ViewerHost`/viewer CLI disconnect behavior, `EditorMeetings.leave()`'s exact
process-exit confirmation, the media host hard stop and native editor detach
policy remain unchanged. Media leave and view cleanup have different
authorities: a disconnect cannot declare a call ended, and ending a call cannot
claim unrelated panes. Ordinary client detach still leaves the independent
media owner alive.

`call-panes-cleanup.test.ts` fails on the preserved baseline and passes after
the fix: normal/idempotent cleanup, changed PID/marker/source/window/missing
identities evaluated at server execution, independent child failures, and a
physical split finishing after the drain bound. The existing six-case
`test/editor/meeting.test.ts` suite passes **without changes to its runner,
assertions or timeouts**: meeting/presentation/reattach/leave, fallback and
shutdown in Vim and Neovim, with actual isolated tmux/demo processes and an
unrelated session retained. Passing the headless demo suite is not a claim of
live Webex, device permissions, graphical Kitty or assistive-readout acceptance.

Trace leave as explicit control → exact backend owner/PID verification →
owner quit/media hard-stop → independent `CallPanes` auxiliary cleanup →
verified owner process exit → native ended observation. Diagnose lingering
views from their recorded identities and pending physical creation; never
“fix” it by fabricating ended status on broker loss, broad session cleanup,
longer assertion waits or automatic leave retries.

## Native room-delivery ingress and authority

`delivery_ingress.vim` is the finite coordinator for a validated `delivery`
notification, not another write owner. Its instance contains **ports only**.
The existing public protocol ingress validates the envelope, then hands the
outcome to it; `direct.delivery` still belongs to the independent recipient
composer owner. Neither route substitutes the current selected room for the
original destination.

| Authority / order | Owner and contract |
| --- | --- |
| Admission / acceptance | `send_action` registers the exact request/room/parent/text/format/file/draft with `drafts` before dispatch. The channel owns correlation and monotonic request IDs. RPC acceptance is not delivery and cannot clear text. |
| Matching | `drafts#delivery` alone matches pending evidence. Unknown/duplicate/retired request IDs do nothing, even if another request is active. A known mismatch is a protocol failure before effects; invalid matches do not consume the pending record. A valid match settles the record once and retains `unknown` as existing room-wide possible-write uncertainty. |
| Sent echo | Only a valid `sent` result reaches unread/notification sent-echo suppression, before clear or render. Those owners retain bounded echo tracking and opt-out/display policy. This never sends a receipt or makes delivery evidence from history absence. |
| Local clear | A partial port binds the existing `delivery_clear` instance. It receives matched pending evidence, current accepted session and the unchanged three-local-retry budget. That owner rechecks exact native ownership/text/tick/destination/parent/format/file/session, marks confirmed-sent before writing and retries only a local textlock/refused write. Newer edits, annotations, promotion, independent split focus and undo remain native. |
| Upload / presentation | After clear handoff, `uploads#delivered` owns staged-file release/retention and any existing cleanup request policy. Then draft badge observation, bounded notice, current-state render and one detached `WbxDelivery` event occur in their original order. Delivery ingress never takes over file bytes, snapshots, upload admission or a second notification tracker. |
| Session replacement | Application revision admission still happens first. The accepted before/after state pair is passed to stateless `observe(previous,next)` **before committing/rendering the new state**. A changed existing `localContext.sessionId`, including entering/leaving session-aware operation, retires all pending sends through `drafts#disconnect`: old IDs lose settlement authority while possible-write evidence is retained. No synthetic epoch/session map is added. |
| Ordinary continuity | Same-session room selection, history changes, revisions or readiness changes do not retire sends. A delivery for a background room clears only its exact registered native buffer, not the selected room. Entering idle/failed retains the existing disconnect policy; physical transport loss keeps its existing direct draft-disconnect path and notice. |
| Uncertainty / recovery | Unknown results, possible-submission errors and disconnects never imply remote absence. No automatic resend, resolve, legacy reset or queued mutation is introduced. Existing bound recovery checks exact-room acknowledged response plus captured native intent/evidence before resolution. A new deliberate send is a separate request; session-bound retained drafts still require deliberate promotion/copy rather than silent account adoption. |

Ports are `State`, `Clear`, `ProtocolError`, `Notify`, `Render` and `Event`.
The owner does not fetch global application state directly. Public state/session
admission, source construction, SDK/IPC, send policy, pending evidence, physical
helpers, local clear/retry and explicit recovery are unchanged owners. Accepted
state retirement needs no stored owner instance at all.

The unchanged synthetic session probe reproduces a baseline gap in **both
editors**: accepted ready-to-ready messaging-session replacement left the old
send pending; its late “sent” result then cleared the retained native draft and
emitted delivery under replacement-session state. Only idle/failed transitions
previously called draft disconnect. Stateless accepted-session retirement now
uses that same evidence-preserving path for session replacement. It is a
declared correctness fix beyond moving the existing delivery function; it does
not claim the old submission failed, cancel it remotely or adopt it into a new
account.

To extend: add finite room-delivery side-effect ordering here, exact outcome/
uncertainty evidence in `drafts`, native write guards in `delivery_clear`,
recipient outcomes in `conversations`, and physical transfer admission in
upload/backend owners. Keep protocol DTO validation at ingress and ensure
accepted-state retirement precedes new-session effects. Do not key outcomes on
selected room alone, clear on RPC success, let late settled/old IDs reinterpret
uncertainty, or put another pending/seen/session cache here.

Trace normal success as explicit send → exact draft register → channel dispatch
→ RPC acceptance (still pending) → validated delivery → exact draft match →
echo suppression → guarded local clear → upload/badge/notice/render → detached
event. For “sent but draft retained,” distinguish newer native work, wrong
session/target, textlock-local retry and confirmed-sent duplicate protection;
never retry the remote send to repair presentation. For a lost outcome, trace
the actual pending/evidence ledger and accepted session transition, not a
missing history row or callback notice.

`delivery-ingress-owner.vim` uses actual draft matching/uncertainty with controlled
downstream effects to prove once-only ordering, known mismatches, unknown/
failed policy and stateless session retirement. `delivery-ingress-workflows.vim`
uses public send/reply/format/recovery commands and actual native RPC/draft/
clear/render owners with only physical transport inert: normal and rich/reply
success, background destinations, newer edits/full undo/focus, uncertainty,
explicit recovery, ready-session replacement and transport recovery. The
unchanged real-textlock delivery-render, clear/recovery, disk-draft, staged-file
and native-confirmation fixtures remain independent regressions.

## Native loaded-space picker coordination

`space_picker.vim` owns the code moved from the native coordinator: detached
choice construction, duplicate-label disambiguation, the **existing picker
serial**, admission/cancellation, and provider-to-choice handoff. Its instance
contains only ports and that moved serial. The public `wbx#picker_context()`,
`wbx#pick_select()`, `wbx#picker_cancel()` and `wbx#pick()` APIs retain their
existing shapes, including `{serial, origin, rooms}` returned to Lua adapters.

| Boundary | Ownership / rules |
| --- | --- |
| Capture | Copy only already-loaded rooms. Labels use title/type/team/cache metadata; identical labels gain ordinal choice suffixes without appending internal IDs. Capture existing native intent, including window/buffer/name/type/tick/selected room/readiness/messaging session/context epoch. Capture does not fetch, select, mark read or mutate application rooms. |
| Choice | The latest picker serial, native picker-context check, connection assertion and ready messaging state must match. The exact ID must be in **both** captured and current loaded sets. Reordering/renaming cannot reinterpret a captured row. An unlisted row is unavailable locally, not proof of remote deletion/revocation. Cached browse-only refusal remains selection policy; the picker does not refresh a cached room automatically. |
| Cancellation | New capture supersedes the previous menu. Successful admission or an invalid loaded-ID choice consumes that picker lifetime. Cancel revokes only its matching serial; an old callback/cancel cannot consume newer work. The native picker check deliberately tolerates temporary provider focus/leave bookkeeping, but not changed native text/target/session state. |
| Provider handoff | Neovim delegates to unchanged `lua/wbx-tui/init.lua` adapters for builtin/Telescope/fzf-lua. Vim retains optional fzf wrap/run with fresh-context native fallback on failure, then `chooser` popup/input UI. Optional plugins are not installed or configured. Lua `vim.schedule` and the existing zero-delay Vim fzf timer allow provider UI to close, then recheck the same captured context. They are UI deferral, **not a request retry queue**. |
| Dispatch | One `Select(id, 1, 0)` port invokes the existing selection owner: focus requested, receipt consent explicitly false. The focus-neutral public selection API remains separate. Picker selection is not send/read consent; even automatic mark-on-open enabled cannot turn it into a receipt. |
| Request / focus | `selection.vim` owns its own existing request serial/focus intent and the channel owns correlation/IDs. That distinct serial is not duplicate picker state: the menu is consumed before a potentially asynchronous room request completes. Existing matching request/window/buffer/rooms-annotation/current-ready-room/membership guards remain. The request now also captures the existing messaging-session ID and rejects a different session before history activation. |
| Ordinary success | Selection state may legitimately move loading → ready and change selected room before its ACK. Do not bind completion to the whole pre-choice context/epoch: that would reject normal successful picks. Same-session ready same-space return remains local/zero-fetch and receipt-disabled; an RPC failure stays at origin and only a new deliberate pick retries. |
| Activation / services | History ownership, local resume/cursor/folds, setup hooks, annotations and final focus belong to `history_activation`/workspace/view. Backend listing/history/cache/source policy, IPC/SDK, native chooser UI and Lua provider UI remain unchanged. A late UI/ACK failure cannot create a replacement target, send, mark read, reconnect or silently replay a request. |

Ports are `State`, `Options`, `Disconnected`, `Select` and `Notify`; construction
is inert. No pending RPC map, copied application session, provider registry or
new cache is added. The recorded session on a selection request is immutable
evidence for that request, not authority to replace the application session.
Legacy contexts without a session field retain empty-session compatibility.

The unchanged session probe demonstrates the boundary gap on the preserved
baseline in **both editors**: pre-choice session replacement was already
rejected, but replacement **after dispatch** could let an old ACK focus
replacement-session history when the exact room ID was still loaded/ready.
Capturing/comparing the existing session in the selection request fixes this
in the responsible request owner; picker extraction alone is not credited as
the fix. Normal same-session loading/ready success and explicit fresh-session
pick-to-open still work. The probe continues to issue no receipt.

To extend: add loaded-choice presentation/admission here, request/focus policy
in `selection`, native menu mechanics in `chooser`, optional-provider UI
translation in Lua/Vim adapters, and history presentation in activation/view
owners. Do not add raw room IDs to labels/search text, key callbacks on a
current ordinal rather than captured ID, store another session epoch, fetch
unlisted destinations, or infer receipts from an interactive picker.

Trace pick-to-open as public picker → detached loaded snapshot/context → UI
provider → scheduled context recheck → exact-ID selection with `allow_read=0`
→ channel correlation → matching session/current-ready-room ACK → native
activation. For missing focus, distinguish canceled/edited/stale picker context,
unlisted/browse-only destination, request error, newer focus intent, replaced
session and retained annotated history. Recovery is a new deliberate pick, not
target substitution, forced redraw or mutation retry.

`space-picker-owner.vim` exercises actual native context with inert selection/
provider effects: detached metadata, exact IDs under reorder, serial/cancel
rules, stale origins and deferred numeric-index handoff. Public
`space-picker-workflows.vim` uses actual selection/activation/RPC/view owners
with inert physical transport, real Vim popup UI and a temporary Neovim
`vim.ui.select` provider window. It proves normal open, zero-fetch same-space
return, explicit failure recovery, loaded-list refresh, native edits,
pre-choice/post-dispatch session replacement and fresh fallback after optional
provider failure. Optional fzf contracts use doubles, not installed-plugin
acceptance claims. The original picker-safety, native chooser and Lua integration
fixtures remain independent gates, including existing optional-provider
fallback and ID-hiding contracts.

## Native meeting-status presentation: observations, not transmission authority

`meeting_status.vim` is a pure presentation owner with two functions:
`lines(meeting, events, connected)` and `compact(meeting, events, connected)`.
It receives already-accepted values and returns detached text. There is no
constructor, port object, cache, pending request, clock, session counter or
event registry. `wbx#meeting#compact()` keeps its public signature as a facade;
the action owner still supplies compact inputs. Detailed application rendering
still ensures the workspace buffer, handles name collisions, obtains snapshots,
uses the existing guarded native write and redraws status. Formatting does not
create a second renderer or bypass native view ownership.

| Boundary | Authority / trace |
| --- | --- |
| Wire admission | `protocol.vim` validates existing `meeting`/`meeting.event` DTOs before application dispatch. Presentation does not expand schemas or reinterpret provider output. |
| Observation storage | `meeting_action` keeps the accepted meeting snapshot and latest event per type (per kind for send-state). Owner/active changes clear the existing event store; physical disconnect retains reports but makes readiness false. No presentation-owned freshness/session ledger is added. |
| Detailed projection | Existing line wording/order is preserved: heading, presentation/session, control availability/recovery guidance, close/start reminders, call/send states, preview, received audio, bounded sources/fixed geometry, authentication and notice. Optional source labels/notices sanitize control characters into spaces without mutating evidence. |
| Evidence versus command | An explicit microphone/camera/share control request or successful RPC ACK is not a send-state observation. “Sending starts OFF” is the existing startup reminder, not an assertion of current sending. `on` means reported confirmed sending; `awaiting` and `starting` explicitly are **not confirmed**; missing evidence remains unknown. Only actual accepted reports change displayed sending values. |
| Preview / receive | Local camera preview always says `NOT SENT`, even when on. Received audio playback enabled/disabled is not microphone transmission. A source slot's available/present flags do not establish microphone/camera/screen sending. |
| Sources / geometry | Read source observations from the media `sources` event, not a fallback to pane-menu metadata. No report means unknown; an observed empty list means none reported, **not** no attendees. The existing max-16 source slots are not complete attendee/self/lobby coverage. Special self/presenting/local roles remain meeting camera/screen/unsent preview; speaker layout is fixed geometry, not active-speaker following. |
| Stale observations | Disconnected, unready/inactive meeting or call status failed/ended adds the unknown-current-media warning and “Last reported” prefixes. Retained `on` is not current certainty and is never synthesized to `off`. Active compact status hides stale sending/Rx values as unknown; inactive compact remains empty. No elapsed-time freshness guarantee or new timeout is invented. |
| Availability versus stale summary | The detailed `Controls` line retains its transport + meeting-ready assertion. Compact's conservative unavailable summary also follows failed/ended reports. Neither string grants control authority; actual command admission remains with action/backend owners. These pre-existing predicates/wording are preserved, not silently unified. |
| Explicit recovery | Status inspection, redraw, refresh, Enter/write or stale text never sends or reconnects. When transport is available and the original owner is known, `:WebexMeetingReconnect` requests verification of that same session, no rejoin/replay. RPC failure does not retry; ACK alone does not establish readiness/transmission. Accepted owner readiness and subsequent media reports restore display through the ordinary path. Restoring the editor/backend transport is a separate explicit handshake, not meeting recovery. |
| Media / physical termination | Viewer loss means media unknown; local view detach, owned auxiliary cleanup and explicit media leave remain distinct. `transport` owns physical editor terminal jobs; backend/media owners establish sending and actual original-process exit. Formatting cannot end a call, signal a process, replay a toggle or infer stopped sending from missing/disconnected data. |
| Native text | Workspace/view own annotations, promotion, read-only generated text, full undo, focus, independent splits/folds and native options. An annotated detail buffer may deliberately retain old text while compact status reflects current observations; the existing retained-view notice explains refresh is paused. Only explicit `WebexRefresh!` discards those edits. Promotion never turns the copied text into control/observation authority. |

To extend: add detailed/compact wording here using accepted inputs. Put new
event validation in the existing protocol/backend DTO owners, retention and
owner replacement in `meeting_action`, explicit command/recovery policy in
action/media owners, and native write/focus policy in workspace/view. Do not
store another session/event cache, infer sending from a preview or source,
make a read render perform recovery, or weaken protocol admission to accept a
convenient fixture.

Trace ordinary status as media owner → backend/IPC `meeting.event` →
protocol admission → `meeting_action#media` event storage → application render
→ pure lines → guarded native write/status redraw; compact reads the same
observation owner through the compatibility facade. For “toggle succeeded but
status unknown,” inspect accepted send-state evidence, not just the RPC ACK.
For stale status, distinguish transport loss, owner unready/ended/failed,
replacement-cleared events and retained native annotations. For recovery,
trace the explicit same-session request and owner publication, not forced
redraw or a new join. Messaging-session failure/replacement alone is not an
independent meeting-ended report.

`meeting-status-owner.vim` checks exact default text, all send states, missing
evidence, preview/Rx distinctions, source coverage/sanitization, stale predicates
and deterministic nonmutating projection without application state or effects.
`meeting-status-workflows.vim` uses public commands and actual protocol,
observation, RPC/connection, workspace/view owners with inert physical
transport only: normal synchronous updates, disconnected/stale text, explicit
failed-then-successful same-owner recovery, replacement-cleared observations
and retained annotations/promoted native work. Headless/drawn editor fixtures
are offline evidence, not live device or operator acceptance. Original meeting
action/client fixtures and all six tmux/demo lifecycle assertions/timeouts
remain independent regression gates.

## Remaining decomposition

| Slice | Status / boundary |
| --- | --- |
| Agenda lifecycle | Implemented: independently testable owner and quiet cache hits; full evidence in verification index |
| Native RPC request channel | Implemented: isolated correlation/startup/passive-error owner; public adapters retained, no view/cache/uncertainty ownership |
| Native transport/handshake lifecycle | Implemented: one connection owner composes the request channel, separate from domain sessions and physical job generations |
| Native workspace lifecycle | Implemented: managed handles, rename/collision safety, opening and temporary window options have one owner, separate from geometry/view/draft primitives |
| Native rooms/history renderer | Implemented: surface assembly/metadata/effects and redraw signatures have one owner, sharing guarded native writes with existing view primitives |
| Native room-selection lifecycle | Implemented: one selection intent/focus owner for request/local-resume/cancel/completion, separate from wire correlation and history/receipt activation |
| Native buffer setup/mapping lifecycle | Implemented: native initialization/FileType order, default mapping ownership, promotion cleanup and draft setup have one owner, with no new registry |
| Native history activation/receipt lifecycle | Implemented: guarded activation, current endpoint checks and bounded receipt-attempt lifetime have one owner; selection/origin, workspace/view, source and RPC transport remain separate |
| Native composer send action | Implemented: one admission/consent/recheck/register/dispatch/error-response flow, separate from pending/uncertainty storage, successful delivery and recipient sends |
| Native successful-delivery clear | Implemented: exact confirmed local clear/marker and bounded local-only retries are separate from outcome correlation, sending, upload retirement and uncertainty resolution |
| Native textlock presentation | Implemented: E565-only coalesced current-state redraw is separate from ACK/mutation replay; original full-ingress reproduction now passes in both editors |
| Native bound delivery recovery | Implemented: explicit selected-room request and intent/evidence-guarded ACK lifetime are separate from uncertainty storage, native clearing and channel correlation |
| Native attachment-open lifetime | Implemented: existing logical open/cancel state and typed/chunk/legacy orchestration have one owner; physical file/sink/image/RPC owners remain independent, and same-ID session replacement revokes retired actions |
| Native image request lifetime | Implemented: preview/open share one identity-bound logical admission, existing generation/source stamps fence results and history reuse, and image data/rendering/physical viewer owners remain independent |
| Native meeting action lifetime | Implemented: independent meeting observations/view policy and the sole pane request have one owner; menu construction and physical terminal/media owners remain separate |
| Native delivery ingress | Implemented: accepted room outcomes and session retirement compose existing draft/echo/clear/upload/presentation owners without another ledger |
| Native space-picker | Implemented: detached loaded choices/context, latest-picker serial and provider handoff have one owner; selection requests/focus capture the existing session and remain separate from UI/activation/receipts |
| Native meeting-status presentation | Implemented: pure detailed/compact observation-to-text projection; event storage, command/recovery and native/media authority remain separate |
| Coordinator review | Bounded audit complete: all remaining coordinator bindings/routines and snapshot fields mapped; finite C1–C4 offline defects/coverage checklist remains in coordinator-audit.md, with external acceptance separate |
| Backend presence lifecycle | Implemented: selected/viewport relevance, refresh pacing and observation retention behind one owner; existing shared physical read owner/providers retained |
| Backend read-source lifecycle | Implemented: current source health/events/fresh evidence and startup invalidations have one owner, distinct from retained unread and disk paths |
| Retained unread ledger | Implemented: historical SDK status/activity, eviction and profile comparison owned separately from source freshness and disk flags |
| Disk cache ownership | Implemented: verified binding, restore/expiry/write admission has one owner; shared identity and physical file safety remain separate |
| Backend verified-storage identity | Implemented: authenticated profile/key/single-flight lifetime and current-session/grant fences have one owner; OAuth, disk binding and physical I/O remain separate |
| Backend preference lifecycle | Implemented: grouping/visibility, user intent, automatic restore and explicit load/save/clear own one physical reservation across resets, separate from identity/disk binding and safe-file storage |
| Backend draft lifecycle | Implemented: opened-profile/physical open-save admission and exact revision/room/reply patch sequencing have one owner, separate from shared identity, safe files, native text and delivery |
| Demo REST routing adapter | Implemented: stateless translation is outside engine construction; live injection/busy/settlement and domain mutation/admission owners remain unchanged |
| Demo reaction construction/state | Implemented: exact synthetic groups and single/batch response construction have one engine-lifetime owner; controller admission/uncertainty, session/source validity and live dispatch remain separate |
| Demo recipient-file posting | Implemented: stateless stream/submission/late-store translation is outside constructor composition; shared upload, exact recipient/ACK and uncertain-write owners remain unchanged |
| Backend provider composition | Implemented: finite concrete defaults/option mapping and messaging API/store selection are separate from application credentials and feature/source/session lifecycles; original injections retained |

At the first extraction, `editor-engine.ts` is still 1,875 lines (from 1,916),
and `autoload/wbx.vim` is still 2,445 lines. The new agenda owner is 121 lines.
The point is independent ownership/testability and fewer unnecessary broadcasts,
not a claim that moving 41 lines fixes the monoliths or reduces total code size.
Continue by extracting responsibilities with workflow evidence, not by merely
splitting a class across files or hiding its state behind forwarding methods.
After the request-channel extraction, the native coordinator is 2,404 lines and
the request owner is 70 lines. Its request table/queue/counter are gone from the
coordinator, but handshake, workspace/rendering and action orchestration are not.
The subsequent connection extraction removes readiness/assertion/disconnected
globals and transport policy from the coordinator. Domain session cleanup and
meeting-vs-messaging action admission deliberately stay with the application;
workspace/rendering/action decomposition and backend lifecycle work remain.
The native coordinator is now 2,350 lines (from 2,404); the connection owner is
114 lines, composing the unchanged 70-line request owner. This removes three
connection globals and centralized negotiation policy, not the remaining
domain/view/action responsibilities or overall architectural debt.
After presence extraction, `editor-engine.ts` is 1,698 lines (from 1,875);
`presence-lifecycle.ts` is 250 lines. Nine presence fields and their refresh/
observation logic leave the engine, replaced by one owner. No total-code-size
reduction or whole-objective completion is claimed: backend read-source/cache
and construction, plus native workspace/render/action responsibilities remain.
After read-source extraction, `editor-engine.ts` is 1,597 lines (from 1,698);
the source lifecycle is 174 lines. Fourteen source/health/event fields leave the
engine, replaced by one owner. Retained unread, disk ownership and feature
construction remain coordinator debt, not hidden parts of this extraction.
After ledger extraction, `editor-engine.ts` is 1,587 lines (from 1,597);
`retained-unread.ts` is 48 lines. This small reduction replaces the map/profile
and history algorithms with an independently testable owner, not a claim of
total-code-size reduction. Disk lifecycle, feature construction and native
workspace/render/action responsibilities remain open.
After disk-cache extraction, `editor-engine.ts` is 1,437 lines (from 1,587);
`disk-cache-lifecycle.ts` is 210 lines. Seventeen cache fields and their lifecycle
algorithms leave the engine. Shared identity/application admission, feature
construction, preference/draft composition and native workspace/render/action
responsibilities remain; this does not complete the overall architecture goal.
After native workspace extraction, `autoload/wbx.vim` is 2,193 lines (from
2,350); `workspace.vim` is 205 lines. Four handle/rename globals leave the
coordinator, replaced by one workspace owner. Backend composition remains
1,437 lines. Rendering, action/setup orchestration and backend construction/
identity/preference composition remain open; this is not a completed rewrite.
After native rendering extraction, `autoload/wbx.vim` is 1,909 lines (from
2,193); `render.vim` is 259 lines. The unchanged 51-line guarded writer moves to
the existing view primitive owner, shared by meeting status and delivery clear.
Two redraw-signature globals leave the coordinator. Backend composition remains
1,437 lines. Action/setup and backend construction/identity/preference debt
remain explicit; this slice does not complete the architecture goal.
After room-selection extraction, `autoload/wbx.vim` is 1,861 lines (from 1,909);
`selection.vim` is 79 lines. Two intent/focus globals leave the coordinator.
The smaller reduction reflects the deliberate unchanged activation/receipt leaf
and narrow context/request/attachment adapters, not hidden duplicated state.
General action/setup and backend construction/identity/preference composition
remain open; this is another bounded slice, not completion of the goal.
After buffer-setup extraction, `autoload/wbx.vim` is 1,714 lines (from 1,861);
`buffer_setup.vim` is 160 lines. Per-buffer initialization/mapping policy and
draft presentation setup leave the coordinator, without adding state alongside
the existing buffer/window markers. History activation/receipt integration,
general native action and backend construction/identity/preference composition
remain open; the architecture goal is not complete.
After verified-storage identity extraction, `editor-engine.ts` is 1,430 lines
(from 1,437); the identity owner is 46 lines. Three profile/key/pending fields
are replaced by one owner. The deliberately small coordinator reduction keeps
the public constructor and error-translation facade plus consumer I/O/admission
unchanged; the gain is explicit independently tested lifetime ownership, not
total-code-size reduction. Native coordination remains 1,714 lines. Feature/
demo construction, draft/preference orchestration and general native action/
history-activation/receipt integration remain open.
After preference-lifecycle extraction, `editor-engine.ts` is 1,399 lines (from
1,430); `section-preferences-lifecycle.ts` is 81 lines. Five grouping/lifecycle
fields leave the engine, replaced by one owner. Public adapters retain
connection/error translation and a narrow disk/session context. Native
coordination stays at 1,714 lines. Feature/demo construction, draft orchestration
and general native action/history activation/receipt integration remain open;
this slice does not complete the architecture objective.
After draft-lifecycle extraction, `editor-engine.ts` is 1,387 lines (from 1,399);
`local-drafts-lifecycle.ts` is 57 lines. Two draft profile/I/O fields leave the
engine, replaced by one owner and a narrow session context. The modest line
reduction preserves public connection/error facades and consumer contracts.
Feature/demo construction and general native action/history activation/receipt
integration remain pending; native coordination stays at 1,714 lines and the
architecture objective remains in progress.
After demo REST extraction, `editor-engine.ts` is 1,351 lines (from 1,387);
`demo-rest.ts` is 47 lines. The constructor keeps live/demo selection and one
existing REST owner, not routing branches or a second transport registry.
All engine methods outside constructor composition remain unchanged.
Feature/provider construction, remaining demo reaction/file composition and
native action/history activation/receipt integration are still pending; native
coordination remains 1,714 lines and the architecture goal is not complete.
After history-activation extraction, `autoload/wbx.vim` is 1,636 lines (from
1,714); `history_activation.vim` is 104 lines. Three receipt fields leave
composition for one cohesive owner. Selection intent, workspace handles, native
setup, renderer, transport and backend source epochs are not duplicated.
`editor-engine.ts` stays 1,351 lines. Remaining provider/demo reaction/file
construction and general native action orchestration are still pending; this
slice is not completion of the architecture objective.
After demo reaction extraction, `editor-engine.ts` is 1,336 lines (from 1,351);
`demo-reactions.ts` is 25 lines. The synthetic state/response construction is no
longer mixed into provider dispatch, without adding a controller or a new
lifetime registry. Native coordination stays at 1,636 lines. Remaining provider
factories, demo recipient-file composition and general native action
orchestration are still pending; the architecture objective is not complete.
After demo recipient-file extraction, `editor-engine.ts` is 1,334 lines (from
1,336); the stateless helper is 14 lines. The small line change deliberately
retains the public constructor/injection and live/demo branch while making its
demo effect sequence independently testable. No parallel upload, target or
uncertainty owner is added. Native coordination stays at 1,636 lines. Remaining
provider factories and general native action orchestration are still open;
this slice is not completion of the architecture objective.
After backend provider extraction, `editor-engine.ts` is 1,331 lines (from
1,334); `backend-providers.ts` is 42 lines. This small net reduction reflects
explicit construction ports rather than a generic service framework or moving
lifecycle code wholesale. Native coordination stays at 1,636 lines. General
native action orchestration and broader application-level feature/action
integration remain coordinator debt; the architecture objective is not complete.
After composer-send extraction, `autoload/wbx.vim` is 1,566 lines (from 1,636);
`send_action.vim` is 88 lines with no retained state beyond ports.
`editor-engine.ts` stays 1,331 lines. The original pending/uncertain, view-intent,
transport/session and native text lifetimes are not duplicated. Successful
delivery clearing/recovery and other native action integration remain explicit
coordinator debt; the architecture objective is not complete.
After successful-delivery clear extraction, `autoload/wbx.vim` is 1,541 lines
(from 1,566); `delivery_clear.vim` is 38 lines. `editor-engine.ts` stays 1,331
lines. The local retry lifetime is independently testable without duplicating
draft outcomes, session state or physical action authority. Delivery ingress/
bound recovery, renderer textlock reentrancy and other native/application action
integration remain open; the architecture objective is not complete.
After textlock-safe presentation, `autoload/wbx.vim` is 1,555 lines (from 1,541);
the 54-line render-request owner adds a bounded presentation lifetime rather
than hiding action replay in a coordinator. Existing renderer projection and
view algorithms stay intact apart from signature invalidation and interrupted
option restoration. `editor-engine.ts` remains 1,331 lines. Full delivery
textlock E565 is fixed; remaining native/application action integration is not
complete.
After bound-delivery recovery extraction, `autoload/wbx.vim` is 1,539 lines
(from 1,555); `delivery_recovery.vim` is 32 lines. `editor-engine.ts` stays
1,331 lines. The callback uses existing intent and uncertainty evidence rather
than another state registry. Delivery ingress and remaining native/application
action integration remain coordinator debt; the architecture goal is not
complete.
After attachment-open extraction and session revocation, `autoload/wbx.vim` is
1,303 lines (from 1,539); `attachment_open.vim` is 299 lines.
`editor-engine.ts` stays 1,331 lines. The four attachment lifetime fields have
one owner, and physical file/sink admission has not moved into another
coordinator. Remaining image/meeting/picker and delivery ingress/application
integration are still open; the architecture objective is not complete.
