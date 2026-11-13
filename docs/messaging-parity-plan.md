# Plan: remaining messaging features

Status: **IMPLEMENTATION IN PROGRESS — offline, uncommitted and inactive.**
The subsequent user directive authorizes implementation and native integration,
not release of provider/security gates. See the
[implementation ledger](messaging-parity-implementation.md) for exact slice status.

This is the follow-on to the completed
[native feature completion plan](native-feature-completion-plan.md) and its
[offline acceptance](native-completion-acceptance.md). It covers all messaging
gaps identified in the recent inventory, including related people, personal
organization, space and Team workflows. Calling, meeting chat, captions,
recording, calendars and meeting/device controls are a separate roadmap.

“All” means the finite feature catalogue below, plus an explicit gap audit before
implementation. It is not a promise that every Webex desktop feature has a
supported third-party API. Unsupported/provider-blocked items stay visible in
the plan; research or a local approximation does not count as server parity.

## Baseline and evidence

- Existing native messaging, sender labels, replies/grouped history, read status,
  local sections, one-file uploads, own-message actions, Markdown/mentions,
  exact-recipient DMs, group creation, selected-room membership and partial Team
  navigation are already implemented. Do not rebuild them as parallel engines.
- NC6's frozen application passes TypeScript, five isolated builds, 801 core
  tests / 14 deliberate opt-in skips, 123 native and 103 drawn checks, with SDK/
  cache and synthetic integration evidence. Those results do **not** verify any
  new feature in this plan.
- The standalone messaging TUI remains a compatibility client. Shared model,
  delivery and authorization changes must not break it; it need not immediately
  acquire every native UI. Document the client support matrix per slice.
- This plan uses repository evidence, not fresh API/service verification.
  Existing [reaction research](reactions-research.md) and
  [personal Sections research](native-sections-research.md) are bounded
  2026-11-14 findings, not permanent statements about service availability.
- Planning baseline: `/tmp/opencode/wbx-messaging-parity-plan-aqycoat2/` freezes
  390 existing source inputs, ten checkout bundle/map hashes, HEAD and staging.
  The earlier NC0 bundle-drift exception remains untouched.

## Feature catalogue

**L** = local implementation/design possible without inventing a service.
**V** = exact provider, permissions and semantics need validation.
**B** = an explicit existing runtime NO-GO remains.
These are planning classifications, not implementation or grant approvals.

| ID | Feature and intended outcome | Evidence gate / dependencies |
| --- | --- | --- |
| MF01 | **Reactions:** display summaries on roots/replies, explicit add, exact-own removal and unknown-outcome recovery | **B.** Approved provider, parent-ID mapping, summary/own-ID/events, vocabulary and genuinely one-shot transport; read → add → remove separately |
| MF02 | **Space pins:** view/navigate, pin/unpin exact messages with current role checks | **V.** Establish shared-space versus personal semantics; no local bookmark disguised as a pin |
| MF03 | **Personal Flags/bookmarks:** add/remove and an on-demand saved-message list | **L/V.** Local bookmarks may ship first with an explicit local label; cross-client Flags require their own provider |
| MF04 | **Quote creation:** insert an attributed, non-executable quotation into a destination-bound draft | **L/V.** Distinguish quoted text from a native service quote; check source accessibility, provenance and destination at submit |
| MF05 | **Forwarding:** preview the exact source and explicit destination, then submit once | **V.** Confirm copy/native-forward semantics, attribution, attachments and cross-space policy; no silent downgrade or source/destination/account substitution |
| MF06 | **Typing indicators:** selected-conversation receive state and independently consented outbound activity | **V.** Validate provider/event lifecycle and expiry; metadata only, bounded/coalesced, never content/keystrokes or account-wide polling |
| MF07 | **Incoming mentions inbox:** exact @me/@all targets with jump-to-message and coverage/freshness labels | **V.** Validated mention identity and inbox/query/event coverage; loaded-only fallback must say loaded-only |
| MF08 | **Seen-by details:** explicit bounded reader lookup for an exact message/space | **V.** Establish privacy, grants, paging and what an absent/partial result means; never infer all readers from a room timestamp |
| MF09 | **Server mark-unread:** explicit action and reconciled cross-client state | **V.** Distinguish server state from existing local unread emphasis; retain failed receipt and unknown-write evidence |
| MF10 | **Server-indexed search:** messages across permitted spaces, useful filters, paging and exact result navigation | **V.** Supported query/index semantics and authorization; retain native `/` as loaded-buffer search, not a fake global search |
| MF11 | **Complete-thread retrieval and on-demand thread view:** stable root/reply identities, explicit pagination and an isolated view/draft | **L/V.** Loaded-thread view can precede provider retrieval; report partial/budget-limited results rather than claiming completeness |
| MF12 | **File/link/media galleries:** on-demand content navigation for a selected space | **L/V.** Separate loaded-content projection from verified remote discovery; no bulk download, URL crawl or automatic external opener |
| MF13 | **Adaptive cards:** safe readable rendering, followed by individually supported explicit actions | **V.** Versioned card/action schemas, submission contract and input privacy; unknown cards/actions stay inert |
| MF14 | **Multiple attachments and Markdown-plus-file sends:** ordered staging, limits, removal and one explicit submission | **V.** Validate public multipart/rich combinations and ACK semantics; extend current snapshot/one-shot owner, not N hidden sends |
| MF15 | **Rich/file first-send DMs:** extend recipient-first delivery beyond plaintext | **V.** Reuse exact recipient/returned-room binding and MF14; no placeholder message or duplicate DM creation |
| MF16 | **Persistent drafts:** optional secure save/restore of normal, reply, recipient and edit work | **L.** Approved sensitive-storage/key design, exact account/profile/target binding and inert restoration; never persist an actionable queue |
| MF17 | **Durable offline message history:** optional bounded local browsing/search with provenance and retention controls | **L/V.** Secure storage and deletion/access-loss policy; cached data never restores membership, write or receipt authority |
| MF18 | **Multi-account switching:** explicit account/profile selection and isolated workspaces, drafts, notifications and credentials | **L/V.** Verified account identity, resource budgets and credential/meeting-lease isolation before any account-aware persistence is enabled |
| MF19 | **Profiles, avatars and custom status:** selected-person details and separately authorized self-status/DND changes | **V.** Validate each readable/writable field; missing policy-restricted status stays unknown; no inferred busy/offline/call type |
| MF20 | **Name/organization directory search:** explicit bounded queries, disambiguation and exact-person selection | **V.** Supported directory scope/privacy/pagination; no organization enumeration or name-as-identity |
| MF21 | **Native personal Sections:** supported read/import preview, then separately reviewed bidirectional synchronization | **B.** Stable native IDs/order/membership/account/completeness and conflict semantics; no Team/Favorites substitution |
| MF22 | **Favorites, Hidden and server mute:** independently validated cross-client personal space preferences | **V.** Separate providers/semantics; local grouping, local alert mute and account DND remain different features |
| MF23 | **Space lifecycle/settings:** supported rename/description/avatar/settings, exact space deletion and permitted Team moves | **V.** Operation-by-operation provider/role review; Leave is not Delete; observed locks/read-only flags are not write permission |
| MF24 | **Team management and messaging roles:** Team lifecycle, membership and supported moderator-role changes | **V.** Fresh actor/target roles and least privilege; no inferred organization-admin/compliance rights |
| MF25 | **Space/Team discovery and joining:** finish permitted discovery beyond loaded-room associations | **V.** Audit actual product/provider support for listing, public discovery and join; never probe arbitrary inaccessible IDs |
| MF26 | **Bulk invitations/membership operations:** preview exact targets and retain per-target outcomes | **V.** Build on MF23/MF24; verified atomic batch or explicit item-by-item admission, stopping on uncertainty; no unattended retry queue |

MF23–MF26 include the space/Team audit needed to avoid calling the current
loaded-label/selected-roster subset “complete management.” Discovery, metadata
editing, deletion, joining, role changes and bulk writes are distinct capabilities.
An operation absent from the validated provider is blocked, not implemented by
guessing a URL or assigning a stronger role.

## Non-negotiable design rules

### Native UX and compatibility

- Prefer ordinary buffers, native editing/search, finite choices and on-demand
  lists over Webex-style buttons or permanent panes. A thread view is optional
  and explicitly opened, not another mandatory sidebar.
- Continue the single command catalogue for mappings, help and optional
  which-key. Audit collisions before assigning new keys; keep existing
  `Wa`, `Wu`, `Wn`, `Wv` and `Wm` meanings and all user mappings/opt-outs.
  Named rare/destructive actions must still be discoverable.
- Preserve draft text, full native undo, annotations, promoted buffers, focus,
  colorschemes, folds, navigation and explicit destination binding.
  Enter in a composer and writing a buffer never sends.
- Supported read-only projections fitting existing consent may appear by default;
  respect every explicit opt-out. New privacy exposures—outbound typing, disk
  message/draft storage, cross-account activity and card input submission—need
  independent explicit consent, not an inherited “all features” switch.
- Help, rendering, scrolling and status queries do not perform provider lookups,
  publish typing, send receipts, execute card actions or launch tools.

### Identity, permission and freshness

- Bind every read/result/choice/write to authenticated account **and** profile,
  session generation, room and exact message/root/member/Team/recipient identity
  as applicable. Native choice revision and provider revision are not synonyms.
- Names, labels, avatars, cached metadata and search hits never confer ownership,
  role, membership or read-receipt authority. Check policy/role immediately before
  each protected write. Service changes between preflight and write remain a
  disclosed race unless conditional-write support is actually verified.
- Declare coverage and provenance: loaded/local, cached/stale, provider partial,
  complete for a particular query, or unavailable. Exhausting a local budget is
  not proof of service completeness; list absence is not deletion/access-loss proof.
- Search/inbox/gallery/thread openings do not independently authorize receipts.
  Preserve current explicit-selection, fresh endpoint, display and one-shot
  receipt guards. Server mark-unread cannot reset failed automatic read attempts.
- Preserve same-account other-client notifications and exclude only exact
  acknowledged local sends. `preview=false` hides sender/excerpt at queued
  delivery too. Enrichment, typing, reactions and seen-by changes are not new
  message creation or invented unread counts.

### One-shot writes and bounded ownership

- Extend existing narrowly typed owners and RPC capabilities. No arbitrary
  REST/action/Ex/shell tunnel, caller actor override, raw activity key or
  credentials in editor state. Missing capabilities explain unavailability.
- For each operation specify byte/item/page/concurrency/rate/retention/deadline
  budgets before coding. Existing limits remain until a separate measured and
  approved budget change; neither silently raise ceilings nor truncate into
  false completeness.
- Writes/receipts never replay automatically after auth refresh, redirect,
  transport failure, reconnect, event recovery, restart or unknown ACK.
  One logical operation may require reads, but every possible service mutation
  needs its own accounted physical admission.
- Retain exact `confirmed` / `refused` / `conflict` / `unknown` results. Never
  “roll back” an ambiguous remote action into asserted failure. Resolution binds
  original target/evidence and waits for an exact successful ACK; an older ACK
  cannot clear newer uncertainty. Budget saturation fails closed, not by
  evicting old evidence into retry eligibility.
- Multiple files are one deliberately reviewed submission shape. If a provider
  requires multiple writes, disclose and confirm the sequence and per-item
  outcomes; never silently fan one Send into several messages.
- Reuse the current messaging OAuth and transport boundaries. Do not borrow a
  meeting SDK/device or create a media owner for messaging. Account switching
  cannot retarget an independent meeting or its existing credential lease.

### Persistence and privacy

- MF16/MF17 are off until the user enables an approved secure store. Define key
  ownership, protected paths, private permissions, symlink/atomic-write handling,
  schemas/migrations, retention/quota and corruption/export/clear behavior first.
  If the approved key backend is unavailable, report unavailable—not plaintext
  fallback. Do not bundle tokens, grants, SDK keys or decrypted logs into caches.
- The editor continues to own live draft text and undo. Persistence serializes
  bounded explicit/consented snapshots; it does not introduce backend polling of
  every draft or a second live draft registry. Edit preparations restore as inert
  work requiring fresh preparation. File drafts restore inert metadata only:
  no automatic path reread, FD resurrection, upload or send.
- Couple restored possibly-submitted drafts to a conservative, account-scoped
  uncertainty journal. Restart never makes an old unknown attempt sendable.
  Offline history is browse-only; no offline mutation queue.
- Define access-revocation, deletion/retention, sign-out and account-removal
  suppression/purge before storing message bodies or indexing them. Old results
  cannot refill a cleared store. Do not promise physical secure erasure on SSDs.
- Cross-account forwarding/export, sensitive card input and profile/status writes
  require separate policy/consent checks. Galleries and avatar/card URLs use
  approved bounded transfer/open policies, never arbitrary URL fetching or JS.

## Provider decision gates

### Gate P — every new service capability

Before a runtime slice, record:

1. Exact supported documentation/provider version, operation, response/event
   schema and date; distinguish inspected source, offline execution and service
   acceptance. SDK method names alone are insufficient.
2. Account/device/crypto ownership, least-privilege grants, tenant restrictions
   and fresh actor/target permission proof. Configured scopes are not granted
   scopes; planning does not expand either.
3. Stable identities, complete/partial/paging semantics, ordering/revision and
   missing/deleted/revoked behavior. Establish root/reply and cross-cluster ID
   mappings rather than converting opaque IDs in the editor.
4. Cancellation, rate limits, redirects, auth/key-rotation replay, partial
   success, conditional-write support and physically one-shot mutation admission.
5. Privacy/storage/defaults, quotas, exact native UX/outcome/recovery, synthetic
   fixtures, and separately authorized live acceptance needed to validate policy
   or wire assumptions.

Outcome: **approved contract**, **local-only alternative**, **blocked pending
decision/evidence**, or **not exposed by reviewed provider**. Do not quietly mark
a blocked row complete or route around it through browser cookies/app databases.

### Gate R — reactions

The [existing NO-GO](reactions-research.md#decision-gates-and-remaining-acceptance)
stands. Explicit internal-interface risk approval, schema/own-ID/parent mapping,
accepted vocabulary/limits and replay containment are missing.
The pinned SDK's detached key-rotation follow-up writes must be accounted for
below interceptors; the receipt-only fence must not simply be widened.
Only after approval: bounded read-only display, then explicit add, then exact-own
removal. Reaction deletes must never be misclassified as message deletions.

### Gate S — native personal organization

The [Sections provider gate](native-sections-research.md#provider-acceptance-matrix)
stands. First prove a supported account-scoped read/export provider, stable IDs,
ordering/membership/completeness and update/conflict semantics. Preview read/import
without overwriting local grouping; assess the native-versus-local capacity
mismatch explicitly. Bidirectional writes are a separate decision after read
acceptance. Favorites/Hidden/mute need their own validations and are not evidence
of a custom-Sections provider.

### Gate D — sensitive storage and accounts

Before MF16–MF18 ship, approve the key/storage/retention design and account
namespace/credential isolation. Establish tested sign-out, clear, revocation,
restart, corruption and old-result fencing. Multiple configured accounts do not
authorize auto-login to all of them or receipt/send replay in any of them.

## Delivery sequence

Research gates start in MP0 and may proceed alongside unrelated approved work.
“Alongside” is a dependency/scheduling recommendation, not authorization to
delegate, start background agents or run live probes.

| Phase | Work | Exit condition |
| --- | --- | --- |
| **MP0 — Freeze and audit** | Freeze current sources/bundles/HEAD/staging; reproduce gaps; map MF01–MF26 against actual commands/owners and reviewed public providers. Open R/S/D decisions early. Audit additional product gaps and record them explicitly rather than silently enlarging scope. | Every feature/sub-operation has a status, provider/evidence level, dependencies, budgets-to-design and acceptance owner; no speculative runtime capability |
| **MP1 — Shared contracts** | Account/profile/session/target namespaces, provider capability/provenance DTOs, paged query/result navigation and reusable one-shot outcome handling through existing owners. Design secure-store/account boundaries without auto-enabling them. | Strict protocol/old-client compatibility and stale/cancel/unknown tests; no general-purpose service tunnel or duplicate messaging engine |
| **MP2 — Native productivity** | MF03 local bookmarks, MF04 quoted-text draft workflow, MF11 loaded-thread view and MF12 loaded-content lists. MF05 text forwarding only if its source/destination semantics pass Gate P. | Native exact navigation and full undo; local/loaded/copied-text labels; no new server parity claim, receipt or implicit send |
| **MP3 — Read-side discovery** | Approved MF07/MF08/MF10/MF11/MF12/MF19/MF20/MF25 reads: mentions/readers/search/threads/galleries/profiles/avatars/directory/permitted spaces and Teams. Keep each independently capability-gated. | Explicit bounded reads/pages, cancellation and revoked-access tests; exact result jumps; partial/unknown/coverage disclosure; no account scan |
| **MP4 — Rich delivery** | MF14 multiple files and Markdown+files, MF15 first-send rich/file DMs, MF05 permitted file forwarding; MF13 readable cards before separately approved explicit card actions. | One-shot physical submission and matching ACK; staged-file/mention/recipient consent survives races; unsupported combinations refuse rather than downgrade |
| **MP5 — Collaboration state** | Approved MF02/MF03 remote pins/Flags, MF06 typing, MF09 mark-unread, MF19 self-status/DND and MF22 personal preferences. Read/display and mutation releases are separate where necessary. | Policy/privacy/role preflights, correct expiries and explicit outcomes; typing/receipts/notifications never fabricate one another's evidence |
| **MP6 — Secure continuity** | Gate-D-approved MF18 explicit account switching, then MF16 draft persistence and MF17 durable browse-only history/search; add concurrent-account activity only under a reviewed resource/privacy budget. | Two-account isolation, restart uncertainty, encrypted storage, clear/revocation and retention tests; no automatic resume/send or plaintext fallback |
| **MP7 — Space and Team management** | Gate-P-approved MF23/MF24 lifecycle/settings/roles and MF26 explicit bulk operations, extending existing create/invite/remove/leave rather than replacing their policy. | Fresh authority for each operation; clear shared/personal/destructive scope; per-target outcomes, stop-on-unknown, no blind deletion/move/batch retry |
| **MP8 — Provider-gated parity** | MF01 reactions and MF21 native Sections only if R/S are released; finish independently blocked service sub-operations from other phases as contracts become approved. | Read → explicit write acceptance with exact identity/provenance and proven replay containment; otherwise keep a visible blocked entry |
| **MP9 — Integrated acceptance** | Current-source check/build/core/native/drawn, compatibility TUI, SDK/cache/research nonactivation, storage/account security, documentation/help/loader and integrity gates. Prepare optional live scenarios separately. | Fresh evidence for every delivered slice, exact blocked/deferred list, source/client coverage and post-gate documentation delta; no unearned “full Webex parity” claim |

Do not hold independently validated public/local improvements hostage to
reaction/Sections blockers. Conversely, reaching MP9 does not waive them.
No calendar estimate is credible until MP0 establishes provider and security
work; schedule approved slices, not an assumed API-complete big-bang release.

## Implementation seams

Prefer extending the existing boundaries; these are planning candidates, not
new modules/APIs already available:

- `src/editor-engine.ts`, `editor-worker.ts`, `editor-protocol.ts`: account-bound
  feature owners, strict individual capabilities and typed results.
- `src/messaging-api.ts`, `messaging-store.ts`, `public-rest.ts`: approved public
  reads, exact targets, invalidation and physical one-shot writes.
- `src/message-actions.ts`, `rich-messages.ts`, `uploads.ts`, `upload-http.ts`,
  `conversation-actions.ts`: quote/forward/delivery extensions, rich files,
  recipient-first delivery and retained uncertainty.
- `src/room-members.ts`, `server-teams.ts`, `people-selected.ts`, `people-status.ts`,
  `sender-names.ts`, `local-sections.ts`, `spaces-cache.ts`: reuse identity and
  selected/paged metadata, not authorization by cached display.
- `autoload/wbx/{commands,lists,view,drafts,history,rooms,sections}.vim` and the
  existing feature helpers: native references, on-demand results and bound drafts.
- The existing read-status worker remains scoped to its approved metadata/
  receipt contract. Any approved new event/internal provider needs a separately
  reviewed ownership/admission boundary; do not smuggle it into that worker or
  the meeting/browser owner.

## Acceptance for every slice

1. **Contract before code:** exact feature IDs/sub-operations, provider decision,
   source freeze, risks, budgets, fallback/coverage and any new consent.
2. **Backend/protocol:** deterministic fixtures for success/refusal/conflict/
   unknown, malformed data, missing capabilities/grants, role changes, rate limits,
   pagination/overflow, wrong account/room/root/recipient and late/duplicate events.
   Prove physical writes cannot replay through auth/redirect/key recovery.
3. **Both editors:** actual Vim and Neovim keys, no optional UI dependencies,
   contextual help, custom prefixes/conflicts, repeated setup, explicit opt-outs,
   mixed tabs, tiny/resized windows, promoted/annotated views, full undo and
   away-and-return/selection/session races. No rendering-driven request growth.
4. **Privacy/security:** preview and typing opt-outs during queued activity;
   inaccessible search/reader/mention results; unsafe card/avatar/link content;
   cross-account persistence/notifications; symlink/corrupt/oversized storage,
   key unavailability, deletion/clear/revocation and restart uncertainty.
5. **Integration:** fresh copied-project TypeScript/five builds, complete
   applicable core/native/drawn suites, synthetic messaging/browser and relevant
   network-blocked SDK/cache/research gates, help/docs and available loader checks.
   Keep failures and exact follow-up lineage; report skips and overlapping counts.
6. **Integrity:** no original bundles, installed configuration, dependencies,
   unrelated work, HEAD or staging changes. Record source hashes and any
   documentation-only delta; retain the earlier bundle-drift exception.
7. **Separate live decision:** where service behavior is unproven, list exact
   consented space/account/peer/grant scenarios and sanitized evidence required.
   No live OAuth/device/receipt/mutation test follows from an offline pass.

## Completion and authorization

Track each feature as **planned**, **contract-approved**, **implemented-offline**,
**service-accepted**, or **blocked**, with client support and exact evidence.
A local fallback, SDK research fixture or successful test suite cannot promote
an unvalidated provider into an implemented server feature.

The plan is functionally complete only when every catalogue row is implemented
to its accepted semantics or the user explicitly revises scope. If provider
limitations remain, report “approved subset delivered; MFxx blocked,” not “all
messaging features complete.” Offline and live acceptance remain separate.

The original request authorized planning only; the subsequent directive
authorizes offline implementation. It does not authorize dependency installation,
grant expansion, credentials access, internal-API risk acceptance, live probes,
automatic reconnects/openers/downloads, installed configuration edits, hot-source,
commits, pushes or Atlassian work. Implementation still respects the per-feature
provider/security stop gates and existing user work.
