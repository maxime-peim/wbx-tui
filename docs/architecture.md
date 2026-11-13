# Source and runtime architecture

Current closure status: the [bounded coordinator audit](coordinator-audit.md)
maps remaining state/routines, invalidation and failure traces across engine,
RPC worker and native application. Review completeness is separate from runtime
correctness: C1–C4 are finite offline completion gates; live/device/operator
acceptance is separately unrun. No further decomposition is implied solely by
coordinator line counts.

The primary UI is native Vim/Neovim. The standalone messaging TUI and native
meeting CLI are supported compatibility clients, not dead modules. Keep editor
runtime directories (`plugin/`, `autoload/`, `lua/`, `syntax/`, `doc/`) at the
project root; they form the editor's runtimepath interface.

This map describes the implemented source. The [verification index](verification-index.md)
identifies current isolated-build/editor evidence and unverified live acceptance, with
earlier baselines in [implementation progress](implementation-progress.md) and
[thread/cache/meeting verification](thread-cache-meetings-follow-up.md).
No live activation or installed configuration change follows from implementation.

Cross-device call observations (`joined-meetings.ts`, `joined-meetings-sdk.ts`)
reuse the isolated metadata SDK owner through private read-only IPC and
`ReadSourceLifecycle`. They do not use the schedule provider or meeting/control
owner; native `upcoming.vim` renders them as inert rows. No meeting/media plugin,
new device connection, URL or control authority is introduced.

Message content, names and reactions have independent owners and cache identities:
`SenderNames` resolves known person IDs; reaction observations belong to exact
session/source/room/message content; the native rendered-block key belongs to
layout/syntax. A resolved author name or completed image preview changes only
presentation, not reaction-cache identity or freshness. Reaction self-summary
`mine` is display evidence, never an opaque removal handle or write authority.
The existing bounded asynchronous owners overlap I/O; no general thread pool,
shared freshness/authority cache or new coordinator is introduced.
Explicit [read-by inspection](message-readers.md) uses the same SDK worker's public
member read-through projection, with a separate closed display DTO and a bounded
native session cache. It shares the native footer painter, not reaction ownership,
unread authority or persistent caches. The worker's physical read admission and
server backoff still govern it; no new SDK connection or automatic polling exists.
The authorized [received display cache](received-cache.md) persists positive
names and bounded recent text/reaction DTOs under the same verified account key,
with independent observation times and source-content keys. Its restoration
never enters `MessagingStore.messages`; `historyCached` keeps ready/latest false.
`PrivateCache` shares only private atomic file handling with `SpacesCache`.
Startup unread 429s pause SDK reads for server backoff without destroying the
source; non-throttle unread discovery failure need not disable reaction summaries.
Self-summary presentation is negotiated independently; legacy RPC responses omit
`mine`, and the option cannot be supplied to preparation or mutation requests.

The ongoing [feature-boundary refactor](feature-architecture.md) defines ownership,
how to add/trace a feature and the remaining decomposition. The first extracted
owner, `src/upcoming-agenda.ts`, contains agenda lifecycle/timer/projection state
previously mixed into `EditorEngine`. Cached refreshes no longer broadcast
unchanged application state. `autoload/wbx/rpc_channel.vim` now owns native
correlation, startup FIFO and passive-error policy. `autoload/wbx/connection.vim`
composes it and owns transport negotiation/readiness/assertions behind unchanged
public adapters. Domain session/workspace decomposition remains in progress.
`src/presence-lifecycle.ts` now owns selected/visible presence relevance, refresh
pacing and retained observations. The engine composes detached eligible-room
context and current credentials; original REST providers/shared physical
admission remain independent of the SDK read-status/reaction source.
`src/read-source-lifecycle.ts` separately owns the current SDK source's health,
fresh-room/event evidence and replacement fences. `src/retained-unread.ts` owns
historical SDK observations/actual-message contradictions and eviction.
`src/disk-cache-lifecycle.ts` binds to the shared verified account key and owns
restore/expiry/write admission, not source or retained-SDK state. The existing
`SpacesCache` retains physical file validation/commit/clear safety.
`src/verified-storage-identity.ts` owns the authenticated profile/key and one
shared pending account lookup used by cache binding and explicit live draft
opens. Existing key/provider formats remain unchanged; preferences reuse the
disk binding. OAuth/session abort and physical draft/preference admission remain
separate, so renewal adds no probe and logical reset cannot release physical I/O.
`src/section-preferences-lifecycle.ts` composes the existing local grouping model
and owns automatic restore, explicit load/save/clear, projection visibility and
user-intent/physical-I/O sequencing. It consumes the verified disk binding, not
identity. Safe files/atomic commits remain in `local-sections.ts`; application
session validity remains in the engine. Reset clears grouping, never physical
admission, so retired operations cannot race a replacement account's work.
`src/local-drafts-lifecycle.ts` owns opened-profile and physical open/save
admission, the unchanged demo partition and exact revision-addressed room/reply
patch sequencing. Live opens reuse the shared verified identity; safe files/
content revisions remain in `local-drafts.ts`. Native text and send/delivery
authority stay separate. Reset forgets the opened profile, never pending I/O.
`src/demo-rest.ts` holds stateless demo REST translation formerly in the engine
constructor, using only current-room and existing store demo-operation ports.
The sandbox API keeps synthetic state; domain owners keep mutation/admission/
recovery. Engine composition retains mode dispatch, injected live PublicREST
and its single busy/settlement owner. No new transport or live fallback is added.
`src/demo-reactions.ts` owns exact room/message synthetic reaction groups and
detached single/batch provider responses. Its existing engine-lifetime state is
separate from `MessageReactions` inspection/preparation, physical admission and
retained uncertain-write/request outcomes. Engine dispatch still routes live
calls to the original grant-gated SDK source; restart does not turn retained
demo groups into restored write authority or a live absence inference.
`src/demo-recipient-file.ts` owns the stateless demo staged-stream/submission/
sandbox-post sequence formerly in the constructor. It resolves the current
store only after source consumption and caller admission. Shared `Uploads`
retains immutable snapshots/physical cleanup; `ConversationActions` retains
recipient/ACK/uncertainty guards. Engine mode dispatch and injected live
multipart remain unchanged; no new file, destination or retry owner is added.
`src/backend-providers.ts` now holds finite concrete defaults, lazy feature
construction/option mapping and messaging API/store selection. The engine
retains current credentials, injected factory APIs and application callbacks;
feature/source owners retain handles, renewal/replacement, scheduling and
physical admission. Presence replacement shares its physical owner, agenda
renewal reuses its provider and read-source renewal closes/replaces its source.
No provider registry or new session lifetime is introduced.
`autoload/wbx/workspace.vim` owns managed native projection handles, rename/
collision safety and explicit tab/split open/repair/show. It composes existing
layout/view/draft primitives, separate from transport, rendering and action
authority; session replacement does not discard native text or undo.
`autoload/wbx/render.vim` owns rooms/history assembly, aligned surface metadata,
native presentation effects and redraw signatures. It consumes existing workspace
handles and presentation ports, not request or delivery authority. Shared guarded
writes now live in `view.vim`; annotation/unload and per-window restoration rules
are unchanged, including meeting-status and exact-delivery-clear callers.
`autoload/wbx/selection.vim` owns room-selection intents, duplicate/local-resume
policy and response/origin focus checks. Its fixed request adapter uses the
existing connection/channel; guarded history activation and exact automatic
receipt admission delegate to `autoload/wbx/history_activation.vim`, not selection
authority. That owner rereads state after native hooks/rendering and retains
bounded attempted/known endpoints and pending admission without owning source
freshness or RPC correlation. Transport loss clears pending, not retained
attempts; ACK does not invent authoritative read state.
`autoload/wbx/buffer_setup.vim` owns native initialization/FileType ordering,
default mapping ownership/release, promotion cleanup and draft presentation
setup. Existing buffer/window markers remain the only setup state; workspace,
renderer, feature scheduling and exact action admission stay separate.
`autoload/wbx/send_action.vim` owns the explicit room-composer admission/
rich-consent/recheck/register/dispatch/error-response flow behind `wbx#send()`.
It rereads current quote proof after consent and registers pending evidence
before synchronous transport response. Existing draft/view primitives retain
uncertainty/intent authority; recipient sends, successful-delivery clearing,
bound recovery and connection correlation keep their original owners.
`autoload/wbx/delivery_clear.vim` owns exact successful-ACK native draft clearing
and the existing bounded local-only retry path. It checks current session,
ownership, text/revision, parent/format and attachment on every attempt, marks
confirmed-sent evidence before writing and never sends or resolves uncertainty.
Delivery correlation/publication, upload cleanup and bound recovery remain
separate. `autoload/wbx/render_request.vim` now makes the existing rooms/history
presentation effect E565-safe with one bounded coalesced local redraw request.
ACK processing and events are never replayed. Deferred work reads current state,
is fenced/canceled on lifecycle changes, and invalidates only interrupted render
signatures. View writes restore writability on failure. The archived complete
delivery expression-mapping textlock reproduction now passes in both editors.
`autoload/wbx/delivery_recovery.vim` owns the explicit selected-room resolution
request/callback behind `wbx#resolve_delivery()`. Persistence readiness,
capability and same-room pending checks precede capture; exact native intent,
ACK room/shape and uncertainty evidence guard its response. Drafts retain
uncertainty, persistence owns durable observation and the channel owns duplicate/
retired callback correlation. Resolution never clears native text or retries a
send; physical and messaging-session replacement keep their existing fences.
`autoload/wbx/attachment_open.vim` now owns the cohesive open/download action
and cancellation lifetime, moving the existing busy/serial/generation/intent
fields out of the coordinator. Typed/chunk/legacy routing and response policy
delegate to unchanged protocol/file/sink/image owners. Physical draining remains
physical admission, not logical busy. Public callbacks remain compatible; the
existing state/session transition also revokes attachment actions so same IDs
cannot authorize a retired-session result. Shared preview busy/source stamps
use explicit ports/selectors, not another copied flag/cache.
`autoload/wbx/image_request.vim` owns visible-preview attempts and explicit
image-open orchestration behind the existing public entrypoints. Its one
identity-bound reservation is also used by legacy attachment fallback; retired
callbacks cannot release newer admission. Captured existing generation/room/
message stamps guard replies and history snapshot reuse. Viewer-local clean
snapshots remain memory-only and zero-fetch. Image bytes/rendering/snapshot
storage, external leases, RPC correlation and backend physical admission remain
separate; no new source/session ledger is added.
`autoload/wbx/meeting_action.vim` now owns independent meeting observations,
presentation/detach intent and explicit start/present/control/upcoming/recovery
requests, including the one pane request formerly retained by the menu module.
`meeting.vim` retains bounded menu construction and compact presentation;
`transport.vim` retains terminal jobs, buffers and physical generations. Meeting
owner replacement retires old pane ACK authority without replay; messaging
session changes do not revoke the independent meeting. Same-owner pane-revision
publication before ACK remains valid. Detailed status rendering stays in the
application using detached observations.
`CallPanes.close()` owns physical cleanup of its recorded auxiliary view panes.
It cannot rely on broker loss: viewers intentionally retain unknown media state
on disconnect. Ending cleanup uses a tmux server-format identity condition
(window/PID/owner/source) for each child, never a whole-session kill or the
media-owner pane. A physical split finishing after the bounded queue drain
still passes through that guarded cleanup. `EditorMeetings.leave()` continues
to acknowledge media termination only after verifying the original process
exited; ordinary editor/view detach remains independent.
`autoload/wbx/delivery_ingress.vim` owns accepted room-delivery coordination:
draft-outcome matching, sent-echo suppression, exact local-clear handoff,
upload settlement, badge observation and notice/render/event ordering. It has
ports only, not a pending/outcome/session registry. The application's already
accepted before/after states retire pending sends into the existing draft
uncertainty ledger on messaging-session replacement as well as idle/failure.
Send admission, native clearing/retries, explicit recovery, recipient-composer
delivery and physical RPC/backend upload authority remain separate owners.
`autoload/wbx/space_picker.vim` owns loaded-space labels, captured choice
contexts, the existing latest-picker serial and native/Vim-provider handoff.
The public picker context/select/cancel/open functions remain facades for Lua
and editor callers. `selection.vim` still owns room requests and focus; its
focus request now captures the existing messaging-session ID so a retired ACK
cannot open replacement-session history. Lua optional-provider adapters and
native chooser UI are unchanged. No extra request/session registry, automatic
lookup or picker-triggered receipt is introduced.
`autoload/wbx/meeting_status.vim` projects detailed and compact native meeting
text from the accepted meeting snapshot, observed media events and connection
assertion. It is stateless: no ports, session/event store, native writes or
recovery/control effects. The application retains workspace ensure/write/status
redraw; `meeting#compact()` remains a compatibility facade. `meeting_action`
still owns observations and explicit control/recovery; backend/media owners,
not status text or RPC ACKs, establish transmission/process-exit evidence.
Stale details retain “Last reported” values with an unknown-current-media warning;
compact status hides stale sending/Rx values. See the feature guide for tracing.

## Five build entrypoints

Wire admission now imports dependency-light policy from
`src/action-contracts.ts`, `upload-contracts.ts`, `identity-contracts.ts`,
`local-context-contracts.ts` and `attachment-transfer-contracts.ts`, not mutation,
filesystem or provider owners merely to validate DTOs. Operational modules
re-export compatible names while consuming those same definitions. The wire
dependency graph is checked in `test/pure-contracts.test.ts`; independent native
validators consume `test/policy-contracts.json`, rather than validating metadata
against itself. This does not add a generic provider abstraction or RPC admission.

`src/editor-features.json` is a closed handshake catalogue consumed by backend
advertisement and `autoload/wbx/features.vim` validation/copy/reset. It preserves
the 32-capability ceiling, optional absent/empty metadata, inert unknown capability
strings and existing per-format dependencies. Native support and RPC/provider
admission still check their own current authority. Transport replacement clears
all assertions; messaging failure/account renewal retains the handshake but not
session authority, so the independent meeting owner stays usable. Compatibility
expectations live separately in `test/editor-feature-contract.json` and are
compared to an actual `EditorRPC` hello, not the catalogue against itself.

The native reaction slice (default on, explicit opt-out) uses `reaction-contracts.ts`, `message-reactions.ts`,
`reaction-transport.ts`, `reactions-sdk.ts` and `autoload/wbx/reactions.vim`.
`autoload/wbx/reaction_history.vim` owns only the bounded viewport/read cache and
native virtual-text badges; it neither rewrites message bodies nor stores write
permission/uncertainty. Background summaries yield to explicit reaction sequences
and do not block independent sends or receipts.
Finite reaction IPC reuses the existing read-status worker; no extra SDK/device
or meeting owner is introduced. Inspection locks/replay evidence are distinct
from presentation contexts; source replacement revokes preparations but retains
uncertainty. Known reaction events are filtered before lossy message-deletion
projection. See the [reaction contract](reactions-implementation-plan.md).

`src/operation-slot.ts` factors only the repeated single-operation token mechanics
in message/conversation owners: cancellation does not release admission, and only
the matching settled owner may release it. Epochs, uncertainty, native physical
cleanup and completion evidence stay domain-specific. Meeting initial/recovered
clients also share event binding; no generic orchestrator or additional draft,
message, presence or meeting registry was introduced.

`autoload/wbx/saved_drafts.vim` is only an explicit view over
`draft_persistence.vim`'s existing verified records. List buffers store keys and
fingerprints, not a parallel text registry. Exported user text is deliberately
inert; restore/discard remain with the recovery/native-composer owner.

The [messaging parity work](messaging-parity-implementation.md) extends the native
catalogue with `autoload/wbx/productivity.vim` (local bookmarks/copied quotations,
loaded thread/content lists) and `directory.vim` (explicit bounded prefix query).
Both reuse `lists.vim` ownership/lifecycle and existing draft/delivery/recipient
owners. `src/directory-search.ts` projects identity/labels only through existing
`PublicREST` and the engine's known-grant/session/physical admission. The additive
ephemeral `localContext` is a UI session fence, not an account/storage identity.
No second message/draft registry, generic provider tunnel, internal SDK worker,
durable message store or meeting owner was added.
The subsequent `message-queries.ts` / `queries.vim` slice adds finite explicit
selected-space thread/@me reads through the same engine/PublicREST admission.
It uses pure bounded message parsing, never `projectSent` or file URL registries;
results remain isolated from history/unread/notification/receipt owners.
`view.vim` supplies a shared exact loaded-ID jump without provider requests.
`src/people-profile.ts` / `autoload/wbx/profiles.vim` adds explicit exact-person
text reads through that same session/known-grant/physical owner. It reuses the
bounded display-text sanitizer and `lists.vim` lifecycle; no profile registry,
avatar transfer, automatic presence/name enrichment or write path is added.
Native roster metadata captures the read intent's session so old account rows
cannot silently become new-session profile targets.
`src/card-text.ts` is a pure, bounded Adaptive Cards 1.0–1.3 text projection used
by `message-content.ts` / `parseMessage`. It performs no IO, schema fetch, template
evaluation, form collection or action dispatch. Native loaded-card navigation
reuses `productivity.vim` / `lists.vim`; only count/partial metadata accompanies
the already-rendered text. Query views strip even that metadata and retain inert
body text only. Existing notification, write, receipt and file/image owners are
not repurposed for card actions.
`ServerTeams.joined` / `autoload/wbx/joined_teams.vim` adds one explicit bounded
joined-membership list through the same known-grant/session/PublicREST owner.
Its paged slot is separate from loaded association label caches; no second
Team service, room scan, join, role/membership registry or notification/write
path is introduced. Native Enter reuses existing loaded-space filtering only.
MF14 extends `Uploads.send`, `upload-http.ts` and native Send, not a second
sender/draft or SDK transport. Mention preflight is inside the same reservation;
PublicREST exposes physical settlement so logical cancellation cannot free it
early. Raw ACK validation precedes attachment registry projection. A finite
optional hello assertion avoids a 33rd capability; the common 64-entry delivery
ledger retains write evidence and refuses saturation.
MF15 adds an exclusive room/root-versus-recipient snapshot binding, not a fake
room or parallel file owner. `ConversationActions.sendDirect` reserves before
fresh identity reads; JSON uses PublicREST and files reuse postUpload. Raw peer/
author/content/file ACK and returned-direct-room verification precede registry
projection. Post-ACK GET failures remain unknown. Native recipient drafts reuse
existing Format/Attach/Send helpers, finite hello direct modes and explicit Open,
never normal-draft adoption or meeting ownership.
MF23 reuses the conversation ledger/self/member verifier/PublicREST for selected
standalone-group title-only rename. Its independent finite space-action
assertion does not add a capability, generic settings tunnel or mutation owner.
Three fresh GETs maximum precede one `{title}` PUT; preflight conflict is not
atomic CAS, and post-admission ambiguity requires original-request recovery.
Only exact ACK updates store metadata, with a per-in-flight list fence and
replayed-ACK protection, not a permanent title override or activity/read effect.
The existing optional space cache retains its age/unread evidence.
Native named-only consent/correlated recovery preserves the effective catalogue,
Wnr, focus, native undo, annotations and exact draft/file destinations.
Description replacement extends that same MF23 owner and shared ledger, with
separate finite preparation/submit RPCs and independent description negotiation.
Fresh proof repeats per explicit step; submit sends only
`{title:expectedTitle,description}` because public PUT requires title. Exact old
title/description comparison is not CAS; consent discloses both overwrite races.
Raw ACK validation precedes a bounded result, never room/title/history/cache/
unread/receipt/notification publication. Rename/description unknowns interlock
per room, with exact original-request recovery and physical-settlement fencing.
Native preparation is a private, ephemeral registry (eight active / 120 seconds),
not a backend lease, mutable-buffer authority or durable/message draft store.
Separate named-only edit/submit/cancel preserves native text/full undo and keys.
Lock/unlock also reuse this metadata owner/ledger/physical admission, with one
finite explicit-transition RPC and independent lock negotiation. Strict-role
verification is opt-in at the existing membership verifier, not a second roster
or role writer. Fresh creator-self/nonmoderator lock and moderator unlock require
explicit private/nonannouncement room proof. Only title/isLocked are sent;
title echo and role/moderation races remain. No main metadata/cache/role/message/
receipt/notification publication follows an ACK. Rename/describe/lock unknowns
interlock per room with original-request recovery. Native consent snapshots
preserve source ownership, work, keys and focus; no toggle or meeting locking.
Announcement On/Off extends the same finite metadata owner/ledger, native
consent/source fences and opt-in strict moderator verifier. Independent
negotiation leaves older singletons and the 32-capability ceiling unchanged.
Both directions require fresh explicit locked/private/mode and own moderator
proof; the sole PUT is title/isAnnouncementOnly. No implicit lock/role/private
conversion, post-PUT GET or main state/delivery/receipt/notification publication.
All four metadata unknowns interlock per room. The demo stores announcements
separately, never inventing a system message or alert. Consent distinguishes
Webex's enable notification and bot/integration posting exceptions from local
notification policy, with the residual title/lock/mode/role races disclosed.
Separate description clearing extends this same metadata owner/ledger and
private native description preparation, not blank replacement or a new store.
It sends only checked title/one ASCII-space sentinel; exact explicit-empty raw
ACK confirms, while missing/null/sentinel output remains unknown. Canonical
service clear output is not established. Strict private/nonannouncement/member/
locked-moderator proof and five-way uncertainty/recovery preserve the same
physical/byte/ledger bounds. Independent negotiation leaves older singletons
unchanged. Clear never deletes native text/undo or publishes main state/roles/
history/notification/receipt/delivery evidence.
The independent name-only Team mutation reuses existing
owners: ServerTeams stateless fresh raw-name/complete-page Team-moderator proof,
joined-slot selection fences, and ConversationActions' same 256-request ledger/
deadline/physical/original-request uncertainty. No Room role/creator/cache is
Team authority. Each phase ≤3 GETs, submission one `{name}` PUT; only a narrow
GET-only `/v1/team/memberships?teamId=...&max=100` path is added, not membership
writes/ID paths or a generic tunnel. Exact raw ACK may invalidate existing Team
selection/labels, never main Room/cache/roster/history/receipt/notification
state. Native conversations/joined lists preserve row text/full undo and
source/consent/query/session/age fences. Independent `teamActions` keeps older
assertions and 32-capability ceiling intact. Other Team/role/preference gates
remain blocked.

Team-description replacement opts into the same ServerTeams proof with an
explicit raw string preimage, not a second role/provider registry. The same
ConversationActions read/perform/256-action/physical owners admit three GETs
per phase and one `{name:expectedName,description}` PUT, requiring fresh current
moderator/name/description proof. Two-way rename/description uncertainty and
original-action/Team/request recovery never replay. No new transport path or
credential flow. Native conversations shares its private description/read/
clock owner and eight-active combined Room+Team budget; it does not turn
metadata into a message/draft registry. Scope/immutable preimage/source/age/
consent guards preserve native text/full undo. Description ACK settles edit
status only, not Team cache/joined query/name or main state/receipts/notifications.
Independent `teamDescriptions` leaves older assertions/capability ceiling
unchanged. No clearing/role/preference or atomic-update/live-tenant acceptance.

Own-direct-membership API visibility is a stateless read in existing
RoomMembers, reached through the selected engine feature/grant/PublicREST
owner. Fresh self/direct Room/exact own row require at most three GETs; only
session/room/coverage/time/boolean-or-null is projected. No roster/main state/
cache/role/notification/receipt publication or second preference store. Native
members/lists reuse source/window/tick/session/age fences with named-only r/q
inspection. Independent negotiation keeps five older metadata assertions and
the 32-capability ceiling intact. The API flag does not establish current app
Hidden, Favorites/server mute or any personal/role write contract.

[`scripts/build.ts`](../scripts/build.ts) produces these five bundles. A runtime
role is not necessarily a separate executable: the CLI bundle runs launchers,
media owners and read-only viewers in different processes.
The shared credential worker is lazy: it is created only when a connected native
meeting first borrows the current login. It neither joins nor owns media, and
both consumers retain independent leases/lifetimes. Exact transfer/security and
current verification: [shared meeting authorization](shared-meeting-auth.md).

| Source → artifact | Runtime / owner | Important dependencies and boundary |
| --- | --- | --- |
| [`src/editor-main.ts`](../src/editor-main.ts) → `dist/editor-main.js` | Editor-job Node RPC backend; messaging OAuth/REST owner | `editor-worker.ts` → `editor-protocol.ts`, `editor-output.ts`, `editor-engine.ts`, `editor-meetings.ts`; no standalone input/UI, terminal probe or Chromium host in the dedicated entrypoint |
| [`src/cli.ts`](../src/cli.ts) → `dist/cli.js` | Interactive CLI, tmux `call-worker`, and `view` processes | Meeting owner uses `host.ts`, `call-launch.ts`, `call-panes.ts`, `tmux*.ts`, `viewer.ts`, rendering/input/config; `messages` dispatches to `messaging-cli.ts`; `editor-worker` remains a compatibility dispatch |
| [`src/browser/main.ts`](../src/browser/main.ts) → `dist/browser.js` | Owned Chrome page: one meeting SDK join/audio/media owner, or generated demo media | `browser/webex.ts`, `participants.ts`, `outgoing.ts`, `camera.ts`, `chat.ts`, `auth.ts`; browser wire types in `protocol.ts`, `chat-protocol.ts`, `auth-protocol.ts` |
| [`src/read-status-worker.ts`](../src/read-status-worker.ts) → `dist/read-status-worker.js` | Optional Node child, private IPC | `read-status-sdk.ts`, `read-status-protocol.ts`, optional separately installed Node SDK; room/read and message-created evidence, consented bounded excerpts and explicit receipts, never a meeting/media owner |
| [`src/oauth-worker.ts`](../src/oauth-worker.ts) → `dist/oauth-worker.js` | Detached, memory-only shared grant owner after connected meeting handoff | `oauth-share.ts`, `oauth.ts`; private child bootstrap and protected Unix-socket leases, no editor/viewer/browser/media ownership |

Node bundles leave npm packages external; the browser bundle is an IIFE targeted
at Chrome 120+. The separately fetched `vendor/webex.min.js` is the checksum-pinned
browser SDK, not an application entrypoint and not the optional Node SDK.

## Ownership and data flow

```text
Vim / Neovim
  plugin/wbx.vim + autoload/wbx.vim          native buffers, windows, drafts, focus
  autoload/wbx/{connection,rpc_channel,transport,protocol,history,rooms,drafts,options}.vim
  autoload/wbx/{commands,view,layout,paging,folds,people}.vim
  lua/wbx-tui/                              optional Neovim integrations
       │ private bounded JSON-RPC over editor-job stdio
       ▼
  dist/editor-main.js
    EditorRPC ── EditorEngine ── MessagingStore ── fixed Webex REST API
                     │ OAuth owner
                     ├── UpcomingAgenda ── WebexUpcomingMeetingsProvider (public REST)
                     ├── ReadSourceLifecycle ── private IPC ── dist/read-status-worker.js (optional)
                     ├── PresenceLifecycle ── selected-peer REST providers (native default ON)
                     └── shared sender-name directory (native default ON)
    EditorMeetings
       │ launch/control/attach, not another SDK join
       ▼
  tmux call owner: dist/cli.js call-worker
       ├── MediaHost ── owned Chrome: dist/browser.js + optional browser SDK
       │                 authenticated loopback WebSocket; binary PNG/RGBA
       └── private Unix broker ── dist/cli.js view (one process per native pane)
                                  Kitty pixels / text blocks

Compatibility: dist/cli.js messages ── MessagingApp + same REST/store/OAuth core
                                          optional explicitly trusted --init
```

- **Native request ownership:** `rpc_channel.vim` owns only monotonic request IDs,
  pending callbacks, the bounded startup queue and per-request passive-error
  handling. Its four ports are composed by `connection.vim`, the single
  transport-handshake/readiness/capability/disconnected owner.
  Envelope validation and domain notification routing stay in `wbx#_receive()`.
  Transport reset drops correlation/queued work without ID reuse or replay,
  never domain write uncertainty, physical reservations or native work.
  `:WebexHealth` exposes only pending/queued counts and the last allocated ID.
- **Native connection:** `connection.vim` owns command admission, hello validation/
  acceptance ordering and legacy startup downgrades. Physical jobs/framing/
  generations stay with `transport.vim`; domain/view resets and state application
  are application effects, not mutable state exported to the connection.
  Messaging failure/replacement retains handshake assertions; transport loss
  clears them. Independent meeting controls do not require messaging recovery.
  Public RPC, receive/exit and internal hello facades remain compatible.
- **Editor ownership:** `autoload/wbx.vim` coordinates session authority, transport,
  native writes/hooks and focus. `drafts.vim` owns the one local destination-bound
  draft/reply/send/uncertainty registry; it never starts RPC or decides receipts.
  Disconnect invalidates pending sends, not retained draft text or native undo.
  Stateless ownership/write/message-anchor primitives live in
  `autoload/wbx/view.vim`; `layout.vim` owns window-local size preferences,
  `folds.vim` owns per-window native fold presentation, and `history.vim` owns
  bounded syntax/decorations and the detached display-only projection cache.
  `rooms.vim` projects pure room rows from supplied display hints; neither projection
  is selected-destination, membership or read authority. `paging.vim` gates deliberate edge paging and manual
  error retry. `commands.vim` is the single catalogue for global
  configurable `<leader>W` mappings, effective help/health and optional which-key.
  `options.vim` supplies native defaults/categories/Lua eligibility, not wire
  admission; `people.vim` renders the optional presence header/details.
  No helper duplicates the draft registry. The public `wbx#` API and Lua wrappers
  remain the customization boundary.
  Replies have distinct room/root-bound drafts. Promoted/renamed buffers and
  unrelated reserved-name collisions are not adopted as owned projections.
- **Internal intents and local mechanisms:** named startup/selection intents sit
  behind compatible positional public APIs. Request IDs, destination generations,
  transfer handles, physical content leases and local job serials are distinct.
  `content-admission.ts` permits one revocable typed-open intent behind a preview,
  never a retry queue; see [attachments](attachments.md). `local_job.vim` releases
  supplied exact jobs/stdin; `local_terminal.vim` guards fresh terminal construction.
  Format/save checks and caller-specific generations remain specialized; meeting
  and notifier ownership never enter this local-file helper layer.
- **Messaging core:** `messaging-api.ts` handles bounded REST admission;
  `messaging-store.ts` owns selected-room data, polling, pagination and delivery
  uncertainty. The backend does not own or poll unsent native-editor draft text.
  `messaging-cli.ts`, `messaging-ui.ts` and `extensions.ts` belong to the compatibility
  TUI, not the native editor. `chat-ui.ts` / `browser/chat.ts` implement the
  separate meeting-pane space overlay, not public in-meeting chat.
- **Upcoming agenda:** `upcoming-agenda.ts` owns its provider handle, committed
  URL-free projection/revision and reconciliation timer. `EditorEngine` composes
  its current-session/abort ports; `upcoming-meetings.ts` retains grant checks,
  bounded physical service reads and backoff. Snapshots are pure; only changed
  projection requests publication. Explicit join remains with `EditorMeetings`,
  never the agenda/provider or native render function.
- **Presence lifecycle:** `presence-lifecycle.ts` owns selected/viewport relevance,
  rolling refresh turns, one timer and up to 500 retained loaded-DM observations.
  `EditorEngine` retains connected/listed/live-row admission and passes detached
  eligible-room context plus session credentials/validity. `people-selected.ts`
  and `people-status.ts` retain exact identity/status reads, parsing, TTL/backoff
  and one shared physical `PeopleReadOwner`, preserved across logical replacement.
  Optional presence cannot hold the room-open response. This is public REST, not
  the independent read-status/reaction IPC worker's health/lifetime.
- **Current read source:** `read-source-lifecycle.ts` owns construction/replacement,
  current health/fresh-room membership, bounded pending startup changes and
  validated message-event evidence. The engine consumes observations/effects,
  keeping retained unread, disk-cache age, sender/echo projection and exact
  receipt/reaction domain admission separate. Worker IPC/SDK transport, physical
  reservations and write uncertainty are not recreated in this owner.
- **Retained unread:** `retained-unread.ts` owns historical SDK status and actual
  activity, the 1,000-entry preferred eviction policy and configuration-fingerprint
  isolation. It takes detached timestamps/retention context, never the store.
  Pure projections report contradictions, not freshness. Engine composition keeps
  current-source ready/room evidence and verified always-stale disk fallback
  separate, including the independent disk bound and account-verification reset.
- **Optional people presence:** `people-status.ts` implements the bounded public
  REST provider; `people-selected.ts` resolves only the selected direct peer with
  verified self/membership identity. `EditorEngine`/RPC connect it to the native
  helper only when `people_status` is explicitly enabled with known existing
  grants. This is not another process/build entrypoint, a Node SDK presence
  subscription or an account-wide poller. The approved subset excludes custom
  status text. See [the exact contract and integration gates](people-status.md).
- **Optional sender names:** one `sender-names.ts` directory belongs to
  `EditorEngine`, not render/getter paths or the SDK child. Under independent
  opt-in and known grants, it shares bounded known-person profile GETs across
  loaded history and fresh events. The metadata child can forward independently
  consented IDs, never profiles; engine snapshots strip raw identities and expose
  optional sanitized labels. Directory lifetime, physical admission across reset,
  negative caching and native queued-only enrichment are specified in
  [sender names](sender-names-design.md). Names are not presence/membership/read
  authority; no disk cache or default-session lookup is added.
- **Local grouping:** `local-sections.ts` owns bounded revision-addressed preferences
  and explicit private disk I/O; `sections.vim` projects local groups/filters via
  existing `rooms.vim` row identities. Group headers never become selectable
  room IDs or paging data. Existing verified spaces-cache identity may scope an
  explicit load/save; no second identity lookup, account-wide scan or server
  membership/Team mutation is added. See [F2 contract](local-sections-design.md).
- **Outgoing files:** `uploads.ts` owns bounded anonymous read-only snapshots,
  physical stage/upload admission and exact FD cleanup across session reset.
  `upload-http.ts` owns one fixed-origin multipart request, streamed chunks,
  response/DNS/request cleanup and no redirect/retry/auth replay. The engine
  validates known grants and delegates prepared new-message delivery to the
  existing store ledger. `uploads.vim` holds only draft-bound metadata and uses
  status-only progress redraws; `drafts.vim` fences ACK clearing. Logical upload
  notification holding is bounded independently of physical cleanup and never
  extends SDK freshness or receipt authority. See [F3 contract](uploads-design.md).
- **Message actions/rich text:** `public-rest.ts` owns fixed-origin one-shot public
  metadata/write HTTP and physical cleanup; `message-actions.ts` owns verified
  own-message preparation, conflict fingerprints and a separate bounded outcome
  ledger. `room-members.ts` is the shared explicit selected-room roster/target
  verifier for F4/F5. `rich-messages.ts` validates structured mention markup and
  distinct consent. Native `message_actions.vim`, `rich.vim` and `members.vim`
  preserve editor text/undo, expose explicit commands and validate results. No
  history write hook mutates a server message. See [F4 contract](message-actions-design.md).
- **Conversations/membership/Teams:** `conversation-actions.ts` reuses that public
  transport, authenticated-self proof and `RoomMembers`, owning a separate bounded
  action ledger and recipient contexts. The engine emits exact direct ACKs before
  room publication; native `conversations.vim` owns separate recipient buffers.
  Exact-room revocation fences stale store/history authority and marks only that
  room's staged files stale, retaining native drafts. `server-teams.ts` and
  `teams.vim` lazily label loaded associations; they never mutate Teams or sync
  personal Sections. Existing room IDs/indexed projections handle Team filters.
  See [F5 contract](conversations-design.md).
- **Media ownership:** `call-launch.ts` creates/reuses verified call identities;
  `call-panes.ts` manages native sources/panes. `host.ts` owns Chrome and its
  loopback server; the browser owns tracks/SDK objects. `viewer.ts` and
  `viewer-framing.ts` broker bounded frames/actions/status to viewers. A viewer
  has no independent join or audio owner. `workspace.ts` remains the legacy
  single-terminal rendering bench, not the default native meeting layout.
- **Credentials:** Node OAuth owners retain confidential secrets/refresh grants.
  Access credentials reach the owned browser or optional metadata child only
  through their private boundaries. Editor RPC and native-view sockets do not
  carry them. Messaging and meeting grants are independent; there is no shared
  refresh-token file or imported OpenCode/MCP grant. A configured client secret
  remains plaintext in the original permission-checked file.
- **Lifetime:** disconnecting messaging does not leave a meeting. Closing an
  editor or presentation detaches by default; explicit leave targets the media
  owner. Socket/view closure alone is not proof that capture stopped.

See [editor protocol](editor-protocol.md) for wire admission/ownership contracts,
[meeting engine](meeting.md#architecture) for the media module map and transport,
and [OAuth](oauth.md#security-and-retention) for retention limits.

## Source versus built execution (A1)

The editor defaults to `node dist/editor-main.js`. Tmux launch/view commands
resolve `dist/cli.js` through `src/tmux.ts`; the media host reads
`dist/browser.js` and `src/browser/index.html`; `src/read-status.ts` forks
`dist/read-status-worker.js`. A source controller is therefore **not** proof that
its spawned owner, metadata child or browser worker is running current source.
Rebuilding does not replace already-running processes.

Safe explicit development sequence after source changes:

```sh
npm run build
npm start -- messages --demo
```

Use `:WebexDemo` in an isolated editor for the native path. Preserve memory-only
drafts before any authorized restart; do not reload an active session to test a
build. These are instructions, not commands executed by this documentation pass.

`npm run dev` now uses [`scripts/dev.ts`](../scripts/dev.ts). It awaits
`buildArtifacts()` from `scripts/build.ts` (all five bundles), then launches
`node dist/cli.js` with the supplied arguments; it is **not** a source watcher or
an active-editor reload. Example: `npm run dev -- messages --demo`.
This replaces the old `tsx src/cli.ts` mixed-source launcher. Development build
synchronization and native config projection pass the integrated isolated gate,
including fresh/stale artifact generation and build-before-launch failure checks.
Exact evidence is in [implementation progress](implementation-progress.md).
Running a raw source controller directly still does not synchronize its compiled
children, and verification did not hot-reload the active session.

## Import boundaries and narrow cleanup

The dedicated editor entrypoint excludes standalone UI/input and Chromium
ownership imports. CLI viewers use a type-only host import; dynamic host loading
occurs only on browser-owning paths. A read-only frame viewer therefore does not
need to import Puppeteer merely to display frames. Focused dependency-boundary
checks are separate from final integrated build acceptance.

Native startup uses the shared bounded, permission-checked config document reader
but projects native-relevant settings through `loadEditorConfig` /
`readEditorOAuthClientSecret` in `config.ts`. Compatibility-only key/layout errors
do not block native OAuth; full compatibility validation and private-secret/
expected-profile checks remain strict. These paths are wired and have focused
offline checks; see the current evidence rather than historical suite totals.

Ownership/write/view extraction preserves one session/draft state owner. Native
history stays on per-message-bounded syntax while optional Tree-sitter is
composer-only. Per-window anchors and fold choices survive projection updates;
mixed editor tabs rely on owned fixed-size flags without corrective shared-split
resizing. The unloaded-view and later performance/refactor fixtures remain in
strict gates; use the verification index rather than an earlier pending-gate note.

The optional SDK receipt adapter enforces one-shot native transport below SDK
interceptor/key-rotation/redirect replay, without patching `node_modules` or
replacing the public acknowledgement chain. Deadline admission and fair bounded
metadata reconciliation/publication are implemented in the worker; independent
one-shot review and targeted fairness checks are not full-build acceptance.

The [implementation plan](implementation-plan.md) is the requirement record;
[implementation progress](implementation-progress.md) distinguishes implemented,
focused offline-validated and integrated results. No new public lifecycle API is
implied by internal cleanup helpers. Neither this map nor synthetic verification
establishes [live acceptance](live-acceptance.md).
