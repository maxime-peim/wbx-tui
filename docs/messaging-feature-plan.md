# Native messaging feature delivery plan

Status: **COMPLETE within authorized scope: F1–F5 implemented and strict
offline-verified; R6 research delivered; final integrated gate passed**.

**Native completion complete:** the later
[existing-feature completion plan](native-feature-completion-plan.md) finishes
keyboard integration, partial workflows, passive indicators and correctness
within already implemented application capabilities. The user subsequently
authorized implementation; fresh phase evidence remains separate from this
historical gate and does not authorize deferred parity features.
The next [remaining messaging parity plan](messaging-parity-plan.md) covers the
new gaps as a planning-only catalogue, not an implementation or live-test grant.

**Subsequent client-defaults/UI request:** [follow-up](people-popup-design.md)
makes supported passive native features default-on and replaces the unbordered
top-left people overlay. That later source boundary is verified separately;
earlier default-off choices/counts below describe the original delivery.
The user subsequently directed completion of this plan. Runtime slices were
implemented in order with conservative contracts frozen before code;
the explicit internal-SDK runtime stop gate remains intact. Requested sequence
recorded on 2026-11-14 against source commit `9aeedd8`. No activation, grant change
or commit is implied. This plan is not a release note.

The [verification index](verification-index.md) records the existing runtime gate.
The completed [responsiveness/refactor plan](remaining-findings-plan.md) remains
historical evidence; its passing tests alone do not establish this later batch.

## Final integrated acceptance

Final copied-project gate `/tmp/opencode/wbx-r6-verification-dl7zik8a/` passed:
**763 core passes / 14 explicit opt-in skips; 101 native passes / zero editor
skips; 75 drawn fixtures; 145 SDK/read-status/cache, 44 messaging, five research
and three browser-control passes**. TypeScript, five copied builds, docs and
both-editor help passed. LazyVim: one pass / one optional installed-loader skip.
Counts overlap and are not a unique-test sum.

All 366 sources matched the copied gate, 359 frozen pre-R6 sources and ten
original bundle/map hashes were checked. R6 left all 114 pre-existing runtime/
dependency-manifest inputs unchanged; research executed with native I/O and
registrations both zero. Only evidence/status documentation changed after the
gate, followed by final docs and integrity checks.

All requested runtime slices and research deliverables are complete. Reaction
runtime and native Sections sync remain outside this authorization under the
reports' explicit stop conditions. No live acceptance, grant/config change,
original build replacement, active-editor reload, commit, push or activation.
New work remains uncommitted/inactive. Exact evidence:
[verification index](verification-index.md).

## Scope and evidence

Primary client: native Vim/Neovim messaging. Preserve the standalone messaging
client and independent meeting owner; do not turn the native coordinator into a
second messaging engine. Shared model changes must remain compatible with both
clients, even when a new UI is native-only.

“Preview” is assumed to mean the editor/desktop **notification preview**. Improve
history author labels through the same identity source, but do not add room-list
message excerpts or multiple-account login in this batch.

| Requested feature | Current boundary | Planned treatment |
| --- | --- | --- |
| Sender name in previews | Implemented, separately opt-in; existing labels/excerpts are the default. | One bounded shared history/event name directory; see [F1 contract](sender-names-design.md). |
| Room sections/clustering | Bounded client-local sections/filters implemented; native personal Sections have no validated approved provider. | Explicit private preferences and distinct Server Team navigation. No native Sections sync claim; [R6b](native-sections-research.md). |
| Person status | Selected-direct-chat REST snapshots already implemented, opt-in/default off. | Improve presentation using that provider, not another account-wide presence subsystem. |
| Outgoing attachment | Implemented with anonymous read-only staging and one-shot multipart. | One explicit local file, optional text, truthful cancellation/unknown outcomes; [F3](uploads-design.md). |
| Edit/delete, Markdown, mentions | Implemented with distinct mutation contexts/outcomes, explicit format and selected-room participant validation. | Per-submit non-atomic conflict confirmation, no mutation on write; [F4](message-actions-design.md). |
| New DMs/spaces, membership, Teams | Implemented and offline-verified. | Separate recipient drafts and create/invite/leave outcomes; lazy Server Team labels/filters; [F5](conversations-design.md). |
| Message reactions | Actual pinned add/delete/HMAC/summary/submit replay characterized offline; no public reaction contract found. | [R6a report](reactions-research.md): technically plausible, runtime NO-GO pending internal-risk/provider/one-shot approval. |

Public documentation and source inspection are capability evidence, not proof of
the current account's grants, policy, service behavior or live acceptance.

## Delivery sequence and dependencies

Deliver one checked slice at a time. A later phase does not justify combining all
new operations into one RPC/configuration rewrite.

| Order | Slices | Dependency / exit |
| --- | --- | --- |
| 1 | F1a sender identity; F1b preview labels | Complete offline under [F1 contract](sender-names-design.md); uncommitted/inactive. |
| 2 | F2a local sections; F2b filters; F2c presence presentation | Complete offline under [F2 contract](local-sections-design.md); uncommitted/inactive. |
| 3 | F3a attachment staging; F3b upload/send; F3c lifetime/cancellation | Complete offline under [F3 contract](uploads-design.md); uncommitted/inactive. |
| 4 | F4a edit/delete; F4b Markdown; F4c mentions | Complete offline under [F4 contract](message-actions-design.md); uncommitted/inactive. |
| 5 | F5a new DM/space; F5b roster/membership; F5c Teams | Complete offline under [F5 contract](conversations-design.md); uncommitted/inactive. |
| 6 | R6a reactions; R6b native Sections import | Research complete; [reactions](reactions-research.md) / [native Sections](native-sections-research.md). Runtime NO-GO; separate approval/provider validation required. |

The phase-6 research outcomes need not block phases 1–5. Reprioritizing an
implementation after a successful research review is a user decision, not an
implicit expansion of this sequence.

## 1. Sender identity and preview names

### F1a — One bounded identity source

- Retain a validated opaque sender person ID separately from its display label.
  Names/emails never establish identity, ownership of a message or a DM peer.
- Prefer already-validated profile/membership information; otherwise use approved
  public People reads for known relevant IDs. Cache/singleflight/coalesce reads,
  including failures, under fixed request/concurrency/size/TTL budgets.
- Resolve names for loaded history and eligible notifications only. No
  organization scan, all-room roster fetch or lookup on every render/keypress.
  Profile batching, if used, must not be mistaken for presence batching.
- Scope state to the authenticated account/profile and clear on account change.
  Missing names remain unavailable; do not manufacture a name from an email.
- Keep the identity cache distinct from presence freshness, recipient selection,
  membership authority and exact successful-plugin-send exclusion.

### F1b — Sender labels with explicit privacy semantics

- With sender labels enabled and a known name, show `Alice: excerpt`. Coalesced
  previews pair the last eligible excerpt with **that same event's** sender.
- Separate `notifications.sender_names` setting: **off by default**, preserving the
  existing default-on, excerpt-only behavior until the user explicitly opts in.
  It also enables shared-cache history labels; it changes no installed configuration.
- `preview=false` hides both the excerpt and sender in this initial design;
  sender names do not independently turn previews on. Existing title controls
  continue to control room titles. Unknown names fall back to the excerpt, not
  an email/person-ID disclosure.
- Do not delay an alert past its freshness window for a lookup, replay it after
  resolution, or emit a second notification just to improve its label.
- Negotiate any author metadata/consent addition through strict worker IPC,
  engine and editor validation. Native configuration is not a wire allowlist.
  Off-space identity must not cross boundaries without the new consent.
- Recheck privacy at dispatch. Turning the setting off protects queued events
  immediately; increasing backend consent requires an explicitly replaced session,
  never an automatic reconnect. Keep names/excerpts out of caches on disk, health
  output and plugin logs.

Implemented seams: `src/sender-names.ts`, `src/messaging-api.ts`, `src/chat-protocol.ts`,
`src/read-status-{protocol,sdk,worker}.ts`, `src/editor-{engine,protocol}.ts`,
`autoload/wbx/protocol.vim`, `autoload/wbx/notifications.vim`, native options.
The engine owns one directory; the metadata worker forwards consented IDs only.

Acceptance:

- Repeated sender IDs cause bounded distinct lookups, not one lookup per message;
  include failures, renamed profiles, account changes and late completions.
- Test default/off/on, old-backend fallback, missing grants/names, private IPC
  rejection, Unicode/bidi/markup sanitization, opt-out while queued and coalescing.
- Same-account messages from another client still notify; only exact acknowledged
  plugin sends are excluded. Names never become receipt or send authority.

F1 completed its strict copied-project gate at
`/tmp/opencode/wbx-f1-verification-bzl8zlyk/`: 634 core passes/14 opt-in skips,
91 native passes/zero editor skips, 65 drawn fixtures, 145 SDK/read-status/cache,
44 messaging and three browser-control checks; TypeScript, five copied builds
and both-editor help passed. Exact evidence and remaining live limits:
[F1 verification](sender-names-design.md#offline-verification).
That historical F1 gate does not establish later features or live acceptance.

## 2. Local sections, filters and clearer presence

### F2a/F2b — Group rooms without changing their identity

- Add explicitly named local sections with create/rename/remove, assign/move,
  ordering and collapse/expand actions. One assigned personal section per room
  initially; “All” and virtual filters are views, not duplicate room identities.
- Initial filters: all, unread, direct, group and a chosen local section.
  Unknown/stale unread state remains visibly distinct; filtered counts are not
  fabricated unread totals or evidence of reading.
- Proposed persistence: an explicit section-edit action may save small local
  preferences in a versioned, private account/profile-scoped store. Until identity
  is verified, remain session-only. Persist section labels/order/room IDs only,
  not message text, sender profiles, unread authority or credentials.
- Do not rewrite installed editor/engine configuration or adopt another account's
  grouping. Specify size limits, atomic writes, corruption/version fallback,
  removal and rename behavior before implementing persistence.
- Unassigned/new rooms remain discoverable. Deleting a section never deletes,
  leaves or renames any Webex room. Local grouping never mutates a server Team.
- Preserve selected room, native cursor/folds/drafts and focus if filters hide the
  selected row; do not automatically select or fetch a replacement room.
- Extend existing `rooms.vim` projections/indexes. Section headers cannot select
  rooms; paging edges still identify actual data rows. Cached rooms remain
  browse-only until membership revalidation regardless of section membership.

### F2c — Present supported presence truthfully

- Reuse `people-status.ts`, `people-selected.ts` and `autoload/wbx/people.vim`.
  Keep presence default off and selected-person focused.
- Show text as well as any colors/icons: active, DND, in a call, in a meeting,
  presenting, inactive, out of office, unknown/unavailable and stale.
- “Active” means recent activity, not guaranteed availability. Do not infer offline,
  a separate busy state, audio-versus-video call type or custom-status text.
- Preserve public API organization/sharing restrictions, aging, cooldowns and
  explicit refresh admission. No roster-wide polling or new subscription.

Acceptance:

- Both editors: section actions, filters, collapse, persistence isolation,
  duplicate names/IDs, partial paging, hidden selection and corrupt preference data.
- Existing cached-space/receipt/failure-memory rules still pass unchanged.
- At 435 rooms, movement uses indexed identity rows, not a grouping scan per key.
  Existing 50/200/500-message redraw/work guards remain intact.
- Presence tests preserve all supported statuses and unknown/stale/denied cases;
  no network is introduced merely by painting a status indicator.

F2 final gate `/tmp/opencode/wbx-f2-verification-lzeuywjp/`: **645 core passes /
14 opt-in skips, 93 native passes / zero editor skips, 67 drawn fixtures,
145 SDK/read-status/cache, 44 messaging and three browser controls**. TypeScript,
five copied builds, docs and both-editor help passed; 329 sources/324 frozen
pre-F2 sources/ten original bundle hashes checked. Exact scope and retained
hardening evidence: [F2 verification](local-sections-design.md#offline-verification).

## 3. Outgoing attachment staging and send

### F3a — Attach to the destination-bound draft

- Provide an explicit local-file selection action, visible file name/size and
  removal action. Keep existing attachment **open/download** commands unchanged;
  new command/key names require conflict review before registration.
- Initially one file per message, with optional plaintext. File-only sends need an
  explicit send action too. Room/reply switching retains the correct staged
  reference without moving it to another destination.
- A new bounded local staging request may convey the explicitly selected path to
  Node; Node validates it and issues an opaque account/session/draft-bound handle.
  No file bytes/base64, arbitrary upload URL, executable command or credentials
  cross editor RPC. A path is not a general-purpose filesystem capability.
- Define regular-file/symlink policy, file-change detection and stable-source
  semantics before POST. Reject directories, devices, FIFOs and unbounded sources.
  Do not rely on a filename/size check alone to prove the selected bytes.

### F3b/F3c — Stream one explicit operation and retain uncertainty

- Use fixed-origin public multipart message creation with literal fields. Initial
  scope excludes remote-URL uploads, directories and automatic clipboard imports.
- Frozen limits ([F3 contract](uploads-design.md)): **10 MiB/file, one active upload, no automatic
  upload queue, 60-second operation deadline**. Freeze bounded staging-reference,
  chunk/buffer and temporary-storage budgets in the contract before code.
- Stream from a stable bounded source; if a private snapshot/spool is needed,
  approve its creation/retention policy, 0700/0600 permissions and exact cleanup.
  No whole-file editor JSON document or unchecked dependency buffering.
- Bind send admission and acknowledgment to account/session, room, reply parent,
  submitted text revision and exact staged handle. Recheck grants and validity
  before dispatch; no silent retargeting after a room/session change.
- Cancellation before transmission differs from cancellation after transmission.
  A timeout/disconnect/abort after possible submission is **unknown**, not “unsent”.
  Retain the draft/staging metadata and never automatically replay the POST.
- Clear only the acknowledged original draft/attachment when still unchanged.
  Editing or replacing either while sending must preserve the newer draft.
- Audit multipart/SDK transports for hidden retries, redirects and auth replay.
  Logical cancellation cannot release admission while physical I/O still runs.
- The published provider attachment ceiling is not our approved upload budget.
  This phase does not raise existing incoming original/PNG/text or RPC limits.
  It cannot attach a file by editing an already-sent message; send a new message
  or explicit thread reply instead.

Candidate seams: messaging API/store, a bounded backend upload owner, editor RPC
and native `drafts.vim`. Do not reuse the incoming download sink as a generic
upload policy or store unsent native draft text in the backend.

Acceptance:

- Synthetic multipart receiver verifies exact bytes/name/text/room/parent and
  zero duplicate POSTs, including empty files, Unicode paths and limit edges.
- Changed/replaced files, symlinks, blocked streams, denial/429, malformed ACK,
  timeout, cancel, disconnect and stubborn cleanup retain truthful outcomes.
- Both editors preserve text/undo, attachment association and changed drafts after
  late ACKs. File selection, Enter, writes and removing an attachment never send.
- Measure upload progress/redraw and event-loop responsiveness without a timing
  CI threshold. Opening/downloading and A2/A3 content-admission tests still pass.

Implemented ownership and notification-lifetime contract:
[destination-bound uploads](uploads-design.md). Focused tests cover the actual
10 MiB multipart receiver edge, anonymous immutable snapshots, literal filenames,
bounded physical cleanup and long-upload same-account notification holding.
Final gate `/tmp/opencode/wbx-f3-verification-mke8fz0y/`: **682 core passes /
14 opt-in skips; 97 native passes / zero editor skips; 71 drawn fixtures;
145 SDK/cache, 44 messaging and three browser-control passes**. TypeScript,
five copied builds, documentation and both-editor help passed. All 337 sources,
329 frozen pre-F3 sources and ten original bundle hashes checked. See
[F3 verification](uploads-design.md#offline-verification). No live upload or
activation is implied.

## 4. Edit/delete, Markdown and mentions

Implementation contract: [F4 own-message actions](message-actions-design.md).
Non-atomic preflight is gated by explicit per-submit/delete confirmation, not
silent optimism. Backend/native focused tests cover exact targeting, no write
mutation, conflict/unknown outcomes, consent and selected-room membership.
Final gate `/tmp/opencode/wbx-f4-verification-h4z89hct/`: **723 core passes /
14 opt-in skips, 99 native passes / zero editor skips, 73 drawn fixtures,
145 SDK/cache, 44 messaging and three browser controls**. TypeScript, five
copied builds, docs and both-editor help passed. All 350 sources, 337 frozen
pre-F4 sources and ten original bundle hashes checked. See
[F4 evidence and retained failures](message-actions-design.md#offline-verification).
No live acceptance or activation.

### F4a — Explicit own-message mutations

- Open edits in a dedicated message-bound editing context, not by treating native
  history annotations or ordinary writes as server edits. Submit explicitly.
- Track message ID/room, verified authenticated author, original server content/
  update marker and local edit revision. Review concurrent-change behavior; do
  not overwrite a detected newer edit from another client. Verify whether the
  provider supports conditional writes. Without them, a preflight comparison
  cannot eliminate races; disclose that limitation and approve the conflict
  policy before enabling edits rather than promising atomic protection.
- Delete only the selected validated message after clear confirmation. Initial
  scope is the user's own messages, not moderator/admin deletion.
- Treat timeout/malformed outcomes as uncertain; no automatic edit/delete replay.
  Use a reviewed mutation-outcome model rather than pretending every operation
  is a new-message delivery ACK.
- Display edited state and reconcile confirmed deletions without overwriting
  annotations, destroying reply drafts or changing canonical receipt endpoints.
  Do not assume a public SDK `messages.updated` event: verify event coverage;
  otherwise use bounded refresh, not fabricated events.
- Recheck documented limits before implementation: currently at most ten edits,
  with edits to file/card-containing messages unsupported.

### F4b/F4c — Explicit rich send and real mentions

- Keep plaintext as the default. A per-draft explicit Markdown mode sends the
  supported Markdown field; native syntax/Tree-sitter is not send authorization.
- Add real mention insertion using validated selected-room participant IDs and
  documented markup. Completion reuses F1 identity data and a bounded, read-only
  selected-room membership source; F5 later reuses that source for the roster UI.
  Partial rosters are labeled, not silently treated as complete.
- Make `@all` a distinct conspicuous action. Literal text that resembles a mention
  must not unexpectedly ping someone in plaintext mode.
- Keep display names separate from structured targets; no executable HTML or
  automatic URL opening. Freeze UTF-8/envelope/message-size accounting; a provider
  text limit does not silently raise our existing composer/RPC limits.

Acceptance: verified own/foreign/unknown authors; concurrent edits and edit limits;
attachments/cards refused; no mutation on write; exact PUT/DELETE/POST counts;
Markdown literal/rich distinctions; Unicode and escaping; member removal/partial
rosters; explicit `@all`; older-backend degradation; preserved folds/annotations/
drafts and no false new-message notifications after an edit/reaction/deletion.

## 5. New conversations, membership and Teams

Implementation contract: [F5 conversations](conversations-design.md).
Recipient preparation never sends a placeholder; only explicit first Send may
create a DM. Exact IDs and separate native drafts/outcome ledgers bind subsequent
actions. Unknown leave conservatively revokes only that room's local authority.
Final copied-project gate `/tmp/opencode/wbx-f5-verification-3kv5qbfm/`:
**762 core passes / 14 opt-in skips, 101 native passes / zero editor skips,
75 drawn fixtures, 145 SDK/cache, 44 messaging and three browser controls**.
TypeScript, five copied builds, docs and both-editor help passed; 359 sources,
350 frozen pre-F5 sources and ten original bundle/map hashes checked.
See [F5 evidence](conversations-design.md#offline-acceptance-boundary).
No live acceptance, commit or activation.

### F5a — New DM and group space

- Resolve an explicitly chosen person, then prepare a destination-bound DM draft.
  The first message can create the DM server-side; never send a placeholder to
  create a visible empty conversation. Show this side effect before explicit Send.
- Create a named group space through a separate confirmed action. Space creation
  and invitations are separate operations with separately reported outcomes:
  partial success must not create duplicate spaces on retry.
- Newly returned IDs, not typed names or stale rows, bind later operations.
  Starting a conversation cannot silently adopt another room's draft.

### F5b — Roster and scoped membership actions

- First deliver read-only, paginated selected-space roster/details with explicit
  partial/failed states. Reuse F4's membership source, not an all-room roster cache.
- Then add explicit invitations, permitted member removal and **leave this space**.
  Verify account/member/room identity and permissions before dispatch; server
  denial remains authoritative. Leaving is not deleting the room for everyone.
- No bulk membership management, admin APIs or inferred moderator powers in the
  first release. Preserve drafts on removal/leave but revoke their send authority.

### F5c — Actual server Teams navigation

- Retain validated `teamId` in room projections; fetch Team labels lazily with a
  bounded cache and public Teams reads. Keep unresolvable/partial Teams visible
  without inventing membership or automatically draining every Team's rooms.
- Present Teams as server-backed grouping, distinct from F2's local sections.
  Do not create/move rooms into Teams or alter Team membership in this slice.
- Read-only room/announcement flags may inform UI, but fresh backend/service
  admission still controls mutations. Cached metadata is not permission.

Acceptance: duplicate names, partial identity, first-DM uncertainty, create/invite
partial success, account/destination changes, role/permission denial, leaving versus
deleting, draft retention after membership loss, partial Teams and lazy-fetch budgets.
All mutations are explicit, request-addressed and non-replayed.

## 6. Research gates: reactions and native Sections

Delivered read-only research on 2026-11-14:

- [R6a reactions report](reactions-research.md): exact source/dist/dependency
  inventory, actual pinned methods with all native I/O blocked, detached replay
  characterization and explicitly synthetic reconciliation simulations.
- [R6b native Sections report](native-sections-research.md): current official UI
  synchronization evidence, bounded 238-file installed-source search and provider/
  export acceptance matrix; Favorites and Teams are not a substitute.
- Portable opt-in fixtures: `test/research/*.test.ts`, five passes / zero skips
  when explicitly enabled, **zero native I/O and registrations**, 45 pinned
  source/package inputs. No runtime capabilities, commands or owner changes.

Both reports separate source/simulation proof from unverified live behavior.
Reaction runtime is NO-GO absent explicit internal-risk approval, validated
summary/own-ID/provider schemas and a dedicated proven one-shot boundary.
Native Sections import/sync is NO-GO absent a validated approved provider.
These are the intended research outcomes, not unfinished authorized runtime work.

### R6a — Pinned-SDK reactions are technically plausible

The 3.13.0 internal conversation source contains `addReaction`, `deleteReaction`
and `getReactionSummaryByParentId`; its activity handling also deals with message/
reply reaction summaries. This corrects the earlier overly broad “SDK unavailable”
conclusion. These internals are not a verified public `webex.messages` contract,
and finding them is not live space-message acceptance.

Research deliverable:

1. Pin exact source/package dependencies and characterize the methods offline.
   Distinguish persistent space reactions from in-meeting-chat or meeting reactions.
2. Establish initial summary retrieval, add/delete event shapes, message/reply/
   reaction-ID mapping, own-reaction state, supported emoji vocabulary and limits.
   Do not promise the entire native client's emoji library from a source comment.
3. Inventory service authorization/device/KMS/encryption requirements and hidden
   retry/refresh/redirect behavior. Derive actor identity from the authenticated
   owner, never from an editor-supplied actor override.
4. Propose a bounded capability/owner boundary. Do not silently turn today's
   metadata/receipt worker into a general mutation worker, borrow a meeting owner,
   export keys/raw activities/conversation URLs over RPC or hand-code private URLs.
5. Demonstrate summary/update reconciliation offline: duplicate/out-of-order events,
   own versus other reactions, remove/undo races, account/room changes, stale counts,
   unknown mutation outcomes and no replay. Reactions must not count as new message
   creations, unread totals or receipt evidence.
6. Produce a go/no-go report separating source proof, simulated compatibility,
   Cisco support/stability expectations and any remaining live acceptance.
   If proceeding is approved, implement display first, then explicit add, then
   removal of the user's exact reaction, each with independent tests.

**Stop gate:** using `webex.internal.*` for this new feature requires an explicit
internal-dependency/risk decision. The earlier public-interface-only constraint
does not vanish because source is available. No live probing, added registration,
grant expansion or implementation is authorized by this research plan.

### R6b — Native personal Sections import/sync remains a separate question

- Recheck public APIs, pinned SDK source and any officially supported export.
  F2 local grouping and F5 Teams are not evidence of native Sections access.
- A useful provider must establish actual section IDs/labels/order/room membership,
  account scope, completeness, updates and permissions—not infer them from titles.
- If an internal source is found, report it as such and return for the same
  compatibility/privacy/risk decision as reactions; read import and write sync
  require separate contracts. No browser-cookie scraping or guessed endpoints.
- Without a validated approved source, retain local sections with honest labeling.

## Common implementation and acceptance gates

Before each runtime slice:

1. Approve its exact UI/consent/defaults, bounds, capability/fallback, permissions
   and side-effect contract. F1–F5 commands now exist in source under those
   contracts; no installed configuration/build/editor was activated.
2. Freeze source and original bundle hashes; add characterization or failing
   regressions. Use known granted metadata, never configured scopes as proof.
3. Test the boundary independently: fake API/service, real pinned SDK with external
   networking blocked where relevant, strict TypeScript/native validators, then
   actual commands in both editors and isolated drawn PTYs.
4. Check drafts/undo/hooks/focus, stale identity/membership, cached browse-only
   rooms, receipt failure memory, exact plugin-send exclusion, transport pressure
   and physical job/I/O settlement. New user mutations never automatically retry.
5. Run the copied-project full offline gate: core, native editors, drawn fixtures,
   SDK, synthetic messaging/browser controls, five builds, docs and both help files.
   Missing editors/dependencies are explicit skips, never evidence of support.
6. Retain deterministic work guards and the optional 435-room / 50/200/500-message
   redraw distributions from [the performance runbook](performance.md#optional-versioned-offline-runbook).
   Add per-feature work/byte budgets; do not claim live latency from synthetic tests.
7. Record results and limitations before moving to the next slice. Preserve public
   positional adapters and compatibility clients; negotiate new wire fields rather
   than silently relaxing allowlists or increasing existing limits.

No root build, installed configuration change, active-editor reload/hot-source,
automatic opener/tool download, reconnect, live OAuth/Webex/receipt/device test,
grant expansion, commit, push or activation follows from approving this plan.
Meeting ownership/transmission defaults, detach behavior and inherited tmux styling
are unchanged.

## Frozen decisions and retained stop conditions

| Decision | Proposed baseline / stop condition |
| --- | --- |
| Preview target and privacy | Confirmed for F1: notification previews; sender names separately opt-in, with `preview=false` suppressing both sender and excerpt. |
| Unknown sender | Keep excerpt without a sender prefix; never disclose an email/opaque ID as a substitute notification name. |
| Sections | Client-local manual sections first; explicit edits may persist only under verified account/profile identity. No native sync claim. |
| Presence | Extend selected-direct-chat presentation only, default off. Wider member presence and status mutation are separate work. |
| Upload budget and files | Frozen F3: one explicit regular local file; 10 MiB / one active physical upload / 60 seconds; anonymous stable read-only snapshot and truthful cancellation/unknown outcome. |
| Message editing and rich sends | Frozen F4: own-message explicit edit/delete, per-submit disclosed non-atomic preflight; plaintext default; Markdown and `@all` require deliberate consent. |
| New grants | Candidate ordinary user scopes are listed below; missing/unknown grants show unavailable. Any OAuth/grant change needs separate approval. |
| Internal SDK | Research delivered with native I/O blocked; reaction runtime still requires explicit internal-interface risk acceptance and the report's provider/one-shot gates. |

Candidate grant review, not an authorization request: `spark:people_read` for
known-person names; `spark:memberships_read` for selected-room participants;
existing `spark:messages_write` for sends/edits/deletes/uploads; `spark:rooms_write`
for group-space creation; `spark:memberships_write` for permitted membership
changes; `spark:teams_read` for Team navigation. Preserve existing room/message
read grants. Known aggregate grants do not bypass feature opt-in or privacy.
Reaction requirements remain a research result, not a guessed scope list.

## Evidence and references

Local implemented boundaries:
[architecture](architecture.md), [native options](native-options.md),
[notification excerpts](notification-previews.md), [notifications](notifications.md),
[presence](people-status.md), [attachments](attachments.md),
[editor protocol](editor-protocol.md) and the
[existing Sections limitation](messaging-media.md#webex-sections).

Public capability references reviewed during planning:

- [Messages API](https://developer.webex.com/docs/api/v1/messages) and
  [creation](https://developer.webex.com/messaging/docs/api/v1/messages/create-a-message):
  text/Markdown, direct recipients, reply parent and one-file constraint.
- [Attachment/formatting guide](https://developer.webex.com/docs/basics#message-attachments):
  local multipart uploads, published provider ceiling and mention syntax.
- [Edit restrictions](https://developer.webex.com/messaging/docs/api/v1/messages/edit-a-message)
  and [message-list filters](https://developer.webex.com/messaging/docs/api/v1/messages/list-messages).
- [People details](https://developer.webex.com/messaging/docs/api/v1/people/get-person-details):
  supported presence states and organization/status-sharing restrictions.
- [Rooms](https://developer.webex.com/docs/api/v1/rooms),
  [Memberships](https://developer.webex.com/docs/api/v1/memberships) and
  [Teams](https://developer.webex.com/docs/api/v1/teams).
- [Pinned public messages plugin](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/@webex/plugin-messages/src/messages.js)
  versus [internal conversation reactions](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/@webex/internal-plugin-conversation/src/conversation.js#L335-L403)
  and [summary retrieval](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/@webex/internal-plugin-conversation/src/conversation.js#L923).
- [Cisco personal Sections discussion](https://community.cisco.com/t5/webex-for-developers/how-can-i-create-a-section-via-api/m-p/4968416)
  is historical supporting context, not proof that no later internal service exists.
- [Official Node SDK distribution](https://developer.webex.com/blog/meet-webex-node-webex-javascript-sdk-built-for-node-js):
  worth a separate dependency evaluation, not an automatic migration or a promise
  that missing public APIs become available.
