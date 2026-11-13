# Persistent message reactions — implementation contract and release gates

Status (2026-11-17): the user explicitly approved **implementation and offline
tests against the pinned internal SDK**, accepting compatibility risk. Source
now connects the controller, typed IPC/RPC and native commands; isolated full
acceptance is tracked in the [verification index](verification-index.md).
Native reactions default **on**, as requested; explicit opt-out remains available.
Nothing has been reloaded or reconnected in the running editor. The later
user-approved follow-up may edit the local Neovim wbx-tui spec and rebuild the
checkout bundles after offline checks, for the next deliberate restart. That
approval does not cover live calls, a new device/grant, dependency installation
or installed SDK/configuration outside that plugin spec.

Scope: persistent reactions to already-loaded messages and replies in direct or
group spaces, subject to verified provider support. Not meeting reactions or
direct in-meeting chat; no recipient overrides, organization scan or emoji-as-text
message fallback. Display, add and exact-own removal release independently.

## Current implementation (supersedes the historical proposal below)

- Native option `reactions=1` / Lua `reactions=true` by default; explicit
  `reactions=0` / `reactions=false` disables it. Message-action keys are listed below.
  `Wa/Wu/Wn/Wv/Wm` and `Wnr` keep their meanings.
- Reactions appear **inline beneath messages in history** by default. Neovim
  extmarks / Vim virtual text properties do not enter message text, copy ranges,
  Markdown, edit/send identity or undo. `:WebexReactions` remains an explicit
  details/refresh command, not the only way to see reactions.
  Only verified nonempty reaction groups get an ordinary badge. Empty complete
  or incomplete observations stay cached but add no “No reactions” / “Unknown”
  footer and make no absence claim. Coverage/count caveats remain in details,
  not a repeated “partial” suffix on every message.
  Default `reaction_display='icons'` badges use a separate virtual line below
  message content, preserving the existing blank separator and icon spacing.
  Optional `reaction_display='text'` (shared Vim/Lua catalogue) uses the verified
  ASCII labels, a separate group per virtual row, and bounded wrapping to the
  narrowest visible current-tab history text width, including gutters. Long
  known values continue on virtual rows instead of silent numeric truncation.
  Missing counts stay absent; complete/incomplete empty observations stay quiet.
  Retained stale observations are muted with no `cached` suffix in either mode.
  Unavailable diagnostics are ASCII in text mode. Invalid option
  values retain default icons. Resize recomputes presentation; it does not
  invalidate source ownership, reset freshness or grant inspection/write/receipt
  authority. Native wrapping/breakat/gutter/theme choices remain user-owned.
  The layout signature includes virtual-row height so switching styles or
  wrapping counts uses the same bounded screen-anchor preservation below.
  When badge height changes within the same view, each visible current-tab
  history split retains its reading screen row using bounded native viewport
  scrolling, not cursor/text changes or window activation. Capture occurs at
  paint time, so reading can continue during an outstanding request. Text, full
  undo, folds, horizontal position and user options stay intact; scroll/cursor
  binding cannot move other windows, and compensation consumes no paging gesture.
  No intermediate repaint is needed. Exact sub-line positioning follows the
  user's native `smoothscroll` choice: with it off, an indivisible wrapped top
  line or a buffer boundary may require the closest legal viewport instead.
  No option is forced on and no fake padding is introduced. Hidden tabs are not
  activated, and annotated/promoted buffers remain excluded.
   Counts start with safe nonnegative aggregate-summary integers; every group
   shows its count, including one, only when supplied. Unknown totals add no
   placeholder in badges; details still identify unknown counts. When your own
   participation is confirmed without a total, `1 (you)` shows that contribution
   without adding a fabricated aggregate count to the snapshot.
  Self-summary counts never override aggregate counts, and repeated labels are
  not counted. Self-summary `mine:true` is presentation-only, distinct from the
   freshly verified opaque `own` removal handle. Own-activity supplementation
   preserves aggregate counts. Your chips use `WbxHistoryReactionsOwn`.
   If the parent omits a valid self summary, the passive reader checks one bounded
   ten-activity page for matching self participation. It does not resolve people,
   paginate, mint removal handles or count activities as totals. A supplied valid
   self summary avoids that extra read. Denial/missing evidence never proves self.
  Neovim can style separate chunks on one virtual row; Vim groups own chips
   separately because each native virtual-text property has one highlight.
   The default own style now links to normal reactions, without an orange
   background; `(you)` remains the ownership marker.
- A read-only viewport scheduler considers at most eight visible messages near
  each history split's cursor, with one outstanding batch and one least-recently-
  used cache of at most 64 presentation entries across rooms (not per room).
  Returning A → B → A reuses A's unchanged exact loaded room/message/content
  observation without waiting for B's outstanding physical read. Cache ownership
  follows the authenticated session/source, not the current selected-room epoch.
  Temporary history loading clears decorations and read eligibility, not that
  cache. Separate view epochs still fence callbacks; physical admission remains
  held until settlement. A small local selector explicitly proves retention;
  legacy contexts without it remain view-scoped. This adds no backend capability
  or authority. Evicted/never-observed messages still require a read, not a latency
  guarantee. A separate source-content key excludes author/name and image-preview
  presentation, so those enrichment updates cannot evict reaction observations.
  The rendered-body key remains independent for syntax/layout updates.
  Negotiated batches contain at most eight exact loaded
  targets, read through at most three concurrent chains in the existing worker.
  They share conversation metadata and skip own-activity lookups; ownership is
  still freshly checked by explicit commands. With `progressive-v1` negotiation,
  `progressive:true` on the existing batch request publishes each verified summary
  immediately as `messages.reactionProgress {requestId,snapshot}`. A slow sibling
  no longer delays completed badges. This adds no requests, chains or early
  admission release. The final ordered batch response still settles the request;
  old clients/backends retain whole-batch compatibility. Private IPC also opts in,
  so a legacy parent receives no new progress packet type.
  Progress is bounded to one observation per requested target, contains no opaque
  `own` handle and is fenced by RPC ID, source/session, view and unchanged source
  content. Name/preview enrichment does not change that identity.
  At the read deadline, completed verified
  observations survive in a detached ordered result; unfinished/not-started
  targets carry `summary:timeout`. Late completions cannot alter that result,
  release physical admission early or start queued reads. Older backends retain single-read
  compatibility without sending an unadvertised batch method.
  It refreshes last-observed visible snapshots quietly after five minutes, uses a
  60-second negative-cache TTL/wakeup for settled failures, and never fetches
  another room/history page. Only `worker:busy`, `context:unverified` and
  `admission:busy` get up to three one-second read-only retries; pending initial
  reads do not draw an unavailable badge. Persistent failures back off rather
  than spinning, and successful siblings keep their five-minute freshness.
  Time alone does not replace a label with `STALE`, `?` or a loading footer.
  A failed refresh retains verified labels with muted styling, not cached text; it does not
  claim they are current or infer their removal. These presentation lifetimes
  do not extend the separate 30-second write-preparation freshness requirement.
  Same-session `refresh-unavailable` health retains those last-observed snapshots
  only while the same authenticated source survives and a returning exact loaded
  room/message still has matching content.
  They remain muted without a suffix; no new reads are made while unavailable.
  Recovery invalidates freshness and admits a bounded viewport refresh, even
  if the failed/ready notifications coalesce. Optional validated `reactionSource`
  epoch/revision/degraded metadata distinguishes this case from terminal failure;
  it is not a grant or capability. Source/grant replacement, terminal loss,
  revocation, opt-out and session/account replacement still evict observations.
  Room/context changes fence callbacks rather than discarding same-source cache.
  Changed/deleted loaded targets are evicted, not merely hidden;
  returning to an earlier content key cannot revive them or an old pending read.
  Last-observed timestamps and partial/unknown flags are never freshened by health
  alone. Cached partial empty snapshots stay quiet and make no absence claim.
  Passive read RPC errors are quiet only for those individual presentation
  requests. They do not append foreground messages, replace unrelated errors or
  emit notifications; finite failure categories and aggregate pending/failed
  target counts remain inspectable in `:WebexHealth` under `reaction_reads`.
  Unknown provider messages become the fixed `summary:unavailable` category.
  Existing failure cooldowns, read-only retry budgets and cached labels remain
  unchanged. Disconnected/unready passive requests cannot start/reconnect or queue
  backend work. Explicit reaction reads retain one sanitized actionable message;
  mutation/receipt/uncertainty handling and fatal protocol checks are never muted.
  Read callbacks crossing reset/degradation are fenced at controller and native
  boundaries. Write preparations/inspections are still reset, unavailable sources
  cannot mark a target inspected, and unknown writes/replay records remain retained.
  For eight already-loaded targets the passive adapter now performs nine
  lookups (one conversation + eight exact parents), not 17. The duplicate public
  message GET is omitted only for this loaded-target viewport path; canonical
  IDs, actor, conversation and decrypted parent ID/room/verb/key checks remain.
  Explicit details/preparation/mutation paths retain their independent public
  message lookup and all ownership/write checks.
  Disabled, hidden, annotated, promoted, stale-session and unavailable-SDK views
  do not initiate reads. Failures remain unavailable; incomplete empty results
  remain unknown in details, not zero. Picker/preparation/confirmation sequences
  suspend background reads.
  Explicit commands acknowledge the wait immediately with a state-first
  `reactions: waiting` token in their originating history window, then
  `reactions: reading` only after admission of a read-only summary, preparation or
  inspection RPC. No loading rows or automatic panel/focus changes are introduced;
  native statusline options are not replaced. Other windows sharing that buffer
  do not inherit the token. Hot status access reads fixed local data, never copies
  main state, scans targets or performs I/O.
  A physical explicit-read reservation outlives canceled display intent and
  drains before passive/new explicit admission. Repeated commands cannot compete
  with it; the latest waiting intent behind passive work may supersede an older
  waiting choice. Read results/phase clearing are fenced by request/command and
  exact view/source lifetime, including leave/return, changed content, revocation,
  opt-out and room/session replacement. A replacement backend session releases
  only its old orphan; late callbacks cannot clear newer feedback. Display state
  clears before pickers/confirmations and on failure/refused admission, without
  weakening exact preparation, write locks or retained uncertainty.
  SDK connecting is pending, not a cached failure; readiness schedules the first
  eligible viewport read without waiting for periodic refresh. View invalidation
  drains an outstanding same-session read before admitting the next space's
  read; a new backend session releases the old native callback's orphaned flight.
  A confirmed own change updates the exact native cache immediately, without an
  immediate read-back that could cache a propagation-lagged empty summary for
  five minutes. Add supplies `mine:true`, never an opaque removal handle. The
   confirmed new own Add increments a known counter once; an already-owned Add
   keeps the counter, while missing/overflowing counts stay unknown. Other
   observations retain their timestamps. An own-only removal drops that label;
  an explicitly shared label remains without a guessed new count. All such
  snapshots are partial/unknown, not absence or complete coverage claims.
  The engine caches the confirmed observation using the fresh preparation
  snapshot and its original timestamp. Replayed historical ACKs cannot mutate or
  renew it; unknown writes still invalidate it. No cache failure changes an
  already verified write result. Background results cannot resolve writes.
  The existing SDK Mercury feed exposes `event:conversation.activity`; public
  `messages` events only project post/share/delete, not reaction additions.
  `src/read-status-sdk.ts` intentionally excludes reaction activities before that
  lossy projection to protect message-deletion semantics. This follow-up does
  not add a reaction subscription or connection. Cross-client push invalidation
  remains unwired; bounded periodic reads and explicit details still reconcile.
- `:WebexReactionAdd` offers seven legacy presets (`thumbsup`,
  `heart`, `celebrate`, `smiley`, `haha`, `confused`, `sad`) plus **Other emoji...**
  to paste one Unicode emoji (including skin tones, flags and joined sequences).
  The backend validates one Unicode emoji or RGI sequence, bounded at 64 UTF-16 units, not
  arbitrary names/text. Existing Unicode labels are also read and drawn; text
  fallback uses ASCII `Emoji U+...` codepoints. No emoji database/install is needed.
  The explicit emoji
  choice prepares read-only, then submits on the unchanged exact target, without
  another confirmation or a first-use/restart inspection gate.
  It is not a toggle; a verified existing own reaction refuses add.
  Its local picker opens immediately, even behind a held passive read. Only the
  chosen preparation waits for physical settlement. Canceling the picker does
  nothing. Inspection is separate recovery for retained unknown previous writes;
  normal Add never opens that confirmation or retries a reaction automatically.
  Preparation keeps error code `-32034`, but read failures retain their fixed
  phase/problem and missing ownership is no longer mislabeled as inspection.
  Keys under Message actions: `<leader>Wal` List reactions/people, `<leader>Waa` Add, `<leader>War` Remove own,
  `<leader>WaI` Resolve uncertain outcome. Existing mapping conflicts/opt-outs take precedence.
- `:WebexReactionRemove` offers only freshly verified own-reaction handles;
  the worker rechecks actor, parent, room, activity ID and label before removal.
  With one verified own type it submits directly; with multiple types the picker
  remains. Choosing that own reaction submits it without another confirmation.
  Ownership of the *message* is neither required nor inferred.
- Only a retained unknown previous write locks a target for recovery. Check that
  exact message in Webex, then explicitly acknowledge with `:WebexReactionResolve`.
  This is not automatic reconciliation or proof that a prior write was applied/absent.
- Unknown requests remain retained across view/session/source resets. Resolution
  of a retained unknown requires its exact original request ID. It never retries
  or changes the historical outcome. Preparations bind the original selected
  conversation and read-source lifetime; returning to a room cannot revive them.
  No durable uncertainty store was added, and restart does not replay anything.
  `:WebexReactionUnresolved` projects the existing native pending/unknown maps into
  a read-only native list, with full exact room/message/original request IDs.
  This is a local editor-memory snapshot, not a second uncertainty owner,
  persistence journal or verified current-account/server catalogue. It remains
  available offline, after room/session changes, with reactions disabled or
  without backend feature metadata. Editor restart does not preserve these
  records; check a previous unknown outcome before explicitly choosing another
  reaction after restart. Empty means only no locally retained records, not server absence.
  Explicit local refresh/search/copy and exact-window return are provided; result
  callbacks do not repaint/focus this snapshot. Annotations/promotions are retained.
  No row/Enter/write action grants inspection, resolution, receipt or mutation
  authority. Existing exact-request/confirmation/intent/result resolution remains
  unchanged; failed/stale resolution retains the local unknown.
- Closed methods: `messages.reactions`, `messages.reactionsBatch`, `messages.reactionPrepare`,
  `messages.reactionSubmit`, `messages.reactionResolve`, and
  `messages.reactionDiscard`. All provider/inspection operations require
  `internalConsent:true`; submit also requires `confirmed:true`, resolution
  `checked:true`. The chooser supplies submit intent; `confirmed:true` does not
  require a second native dialog. Callers cannot supply actors, SDK activities, endpoints, keys,
  recipients or raw own-reaction IDs.
- Negotiation adds `messageReactions:["pinned-internal-v1","viewport-batch-v1","self-summary-v1","progressive-v1","actor-details-v1"]` under existing
  capability dependencies, not a 33rd capability. Missing metadata disables the
  provider-backed native commands; the local unresolved-write inspection needs
  no negotiation. There is no fallback into edit/delete or text-message sending.
  `selfSummary:true` is requested only after `self-summary-v1` negotiation.
  Without that read-only opt-in, RPC responses omit the new `mine` field and
  retain the existing closed reaction-group shape for legacy clients.
  `details:true` on a single explicit summary instead returns
  `{snapshot,actors,partial:true}`. Actor lists are bounded to one 10-activity
  parent page, deduplicated by reaction/person, never inferred from counts,
  and never placed in automatic or persistent caches. Safe disclosed names or
  relevant known names are reused; at most eight exact-person GETs may start in
   eight seconds, with the normal final physical timeout. The ordinary native list
   shows reaction groups and names only, using “Name unavailable” rather than IDs.
   Clean generated lists close on space/session changes; annotations/promotions
   remain untouched. Uncertain-write recovery keeps its separate exact IDs/warnings.
   No directory scan, paging or new SDK session is used.
  Display activities must be add/reaction2/person with a UUID identity and no
  contradictory parent/room binding. The exact collection can bind omitted
  fields only for presentation; own-removal validation is not relaxed.
- Live mode reuses only the existing ready read-status worker and known
  `spark:all` grant. It does not start/register another SDK or borrow the meeting
  owner. Reaction **writes** and receipt admission exclude each other at both IPC
  ends. Read-only summaries have no mutation fence and do not block receipts or
   ordinary sends.
   Exact summaries do not require unrelated explicit metadata admission or an
   entry in the bounded unread/date cache. Loaded-target/source ownership and
   canonical SDK verification remain mandatory; mutation/send/receipt guards
   and explicit uncertainty resolution are unchanged.
  Identified reaction events are excluded before the SDK's lossy public message
  deletion projection; they do not enter message notification/deletion IPC.
- The separate reaction fence allows existing background metadata GETs but admits
  at most one exact mutation below SDK interceptors. Redirects, refresh, replay
  and reused-agent paths are disabled; SDK rotation error bodies are sanitized.
  A 20-second logical deadline does not free physically unsettled work.
- Local budgets: 64 inspected/prepared targets, 16 groups, 256 retained outcomes.
  Saturation refuses; unresolved outcomes/replay records are never evicted.
- Live summary DTOs remain **partial**, explained in `:WebexReactions` rather
  than repeated in normal badges. Known labels, supplied safe aggregate counts,
  display-only self-summary evidence and separately verified own handles are
  exposed. No authoritative zero, complete list or modern arbitrary emoji support
  is inferred; live availability/semantics of count fields remain unverified.
- Summary reads explicitly request `activityType:reactionSummary` and
  `includeChildren:true`, matching the pinned SDK's callers. Summary wrappers
  contain `child.activity.object`, matching the actual SDK's recursive inbound
  decryption traversal; the old direct `child.object` test fixture was incorrect.
  An offline test now exercises actual inbound transforms over a synthetic
  encrypted nested summary from another person. Failure to retrieve
  the own-activity supplement preserves verified aggregate labels but provides no
  own handle. Conversation write-encryption fields are required only for writes,
  not display. Unknown/mismatched parent or actor identity still fails closed.
- Passive loading/failures never add unavailable footers. A bounded local
  phase/problem remains in `:WebexHealth`, propagated through closed IPC and the
  engine. It never exposes raw SDK errors or authorizes a retry/write.
  Local grant/input admission, stale context, busy/unavailable IPC and rejected
  snapshots also have fixed categories (`admission`, `context`, `worker`,
  `summary`); an unexpected summary failure is `summary:unavailable`, not an
  unqualified generic error. These are diagnostics, not relaxed guards.
- Every known group shows a supplied counter (including `1`) when known, without
  a placeholder for missing totals; details still identify unknown counts. Own evidence
  always adds `(you)` in icons and text. Muted styling means retained/stale data,
  not a reaction change. Cached startup snapshots are not replaced by temporary
  unavailability. Partial own activity rows may select a bounded exact GET;
  only its full, strictly validated actor/room/parent/reaction can mint a handle.
  Remove revalidates that exact activity again before the one-shot deletion.
   The pinned SDK's person `entryUUID` and `id` forms are accepted in self-summary
   display evidence as well as own activities, only when consistent. This keeps
   the inline `(you)` marker without minting a removal handle; conflicting
   identities never prove self. Details expose only an
  optional fixed `activityReadFailure`, never raw payloads, for live diagnosis.
  The service rejects child-page limits above 10 with HTTP 400; this limit is
  independent of the 64-target presentation cache. The offline fixture exercises
  the real SDK helper and HTTP-status/decryption chain, including the rejected
  old limit, rather than mocking away this boundary.

Offline production checks include `test/message-reactions.test.ts`,
`test/reaction-ipc.test.ts`, and the native `reactions` / `reaction-boundaries` / `reaction-history`
fixtures. Opt-in `WBX_READ_STATUS_SDK_TEST=1` runs `test/reactions-sdk.test.ts`:
actual pinned mutation methods/interceptors/http-core, synthetic metadata/KMS
text transforms and a stubbed final Node request primitive. It verifies 24
failure/redirect/replay/ACK cases, root/reply binding, own-handle rejection and a
held timeout, with zero native I/O, registration and credential refresh.
This is **not** cryptographic, deployment-schema or live service acceptance.
Missing/unrecognized parent/own/ack fields fail closed or return unknown.
Service reaction notifications/limits and full deployment variations remain
unverified. Live validation, copied-bundle replacement and activation remain
separately gated.

Prior inline full offline acceptance: `/tmp/opencode/wbx-isolated-wg9joptr/` passes on 545
frozen sources: 1,706 core passes / 15 deliberate skips, 116 Neovim + 115 Vim
native checks, all 209 drawn cells, 224 SDK/cache checks, both research dimensions,
compatibility, restarts, copied build/bundle integrity and preservation checks.
There are no required native/drawn skips. This establishes the source/offline
boundary, not live Webex service or deployment-schema acceptance. User-rebuilt
checkout bundles remain unchanged by the agent. That gate predates the subsequent
read-query/failure-diagnostic correction; its synthetic metadata fixture did not
catch missing child-query parameters. Current follow-up evidence is tracked in
the verification index; the user's actual failing provider phase is not yet known.
The first read-fix focused gate, `/tmp/opencode/wbx-isolated-semqsyzb/`, remains
failed in drawn Vim's reaction fixture. Its test-origin summary raced an admitted
mutation. The fixture now waits for native confirmation and suspends passive
reads before asserting one successful snapshot; the busy/refuse/no-replay guard
is unchanged and has a held-mutation regression. Corrected isolated repetitions
pass. Fresh **focused offline acceptance** at
`/tmp/opencode/wbx-isolated-z6eqb7e3/` passes on 545 frozen sources: 1,710 core
passes / 15 deliberate skips, 35 native cells per editor, all 46 drawn cells,
224 SDK/cache checks, both research dimensions, compatibility, restarts, copied
build/integrity and preservation checks. Required native/drawn checks have no
skips. This is not a new full or live gate; the failing live phase still needs
the bounded category from the user's deliberately rebuilt/restarted client.
The user subsequently rebuilt/restarted with those exact files and still received
the generic error. The newer local-admission diagnostic correction is covered by
targeted isolated tests at `/tmp/opencode/wbx-reactions-admission-u9dvsaau/`,
not by that preceding integrated gate. The actual live cause remains unknown.

Current viewport/parser **focused offline acceptance**:
`/tmp/opencode/wbx-isolated-5dsyijlg/`, all results zero on 545 frozen sources.
It passes 1,714 core checks / 15 deliberate skips, 35 native cells per editor,
all 46 drawn cells, 224 SDK/cache checks, both research dimensions, compatibility,
restarts, copied build/integrity and all preservation checks. Drawn tests exercise
eight-target atomic presentation and a controlled five-minute cache lifetime;
the SDK fixture runs actual inbound decryption of a nested reaction summary.
This supersedes earlier source acceptance for this slice, but does not establish
live response/deployment-schema or cryptographic acceptance.

The subsequent first-open correction has **targeted offline verification** at
`/tmp/opencode/wbx-reactions-first-open-y7h9_1ps/`: the accepted
`verified-targeted-results.json` passes TypeScript, copied build, 50 affected
backend/SDK checks, all six native and six drawn reaction cells, documentation
and candidate integrity on 546 frozen sources. It covers initial readiness,
same-session flight draining, replaced-session recovery, timer-driven bounded
retries and separate one-minute failure/five-minute success eligibility. Earlier
failed intermediate evidence remains preserved. All checkout artifacts, pinned
SDK/toolchain inputs and HEAD/staging were preserved. This correction is not
activated by the agent and has no live first-open acceptance; the user's exact
live trigger remains unobserved.

## Historical research-stage proposal and evidence

The numbered sections below preserve the pre-approval design/evidence boundary,
including then-pending gates. Their provisional RPC names and “not approved”
statements describe that earlier milestone, not the current source contract above.

## 1. Provider decision and current evidence

Prefer a documented supported public provider. If none is established, the
internal SDK route needs an explicit compatibility/privacy/risk decision before
even read-only runtime integration. The original
[R6a findings](reactions-research.md) remain applicable.

Read-only public-document recheck on 2026-11-17:

- Official [Messages reference](https://developer.webex.com/messaging/docs/api/v1/messages)
  describes list/create/update/delete and membership requirements; it does not
  establish a reaction contract.
- The official [OpenAPI repository](https://github.com/webex/webex-openapi-specs)
  supplies the actual JSON path (not the illustrative YAML layout from a search
  result). Reviewed immutable
  [Messaging spec](https://raw.githubusercontent.com/webex/webex-openapi-specs/bd17baa1f21b70bd1bd32f6362bbfb0e4afa3b77/public-spec/webex-messaging.json):
  revision `bd17baa1f21b70bd1bd32f6362bbfb0e4afa3b77`, **849,177 bytes**, SHA-256
  `34fb9c280f17732ba01926c3569bef4156d9eafe65acd2c26f31617792071ec7`.
  Its **36 paths** contain no reaction path, key or string reference. Message
  paths are `/messages` (GET/POST), `/messages/direct` (GET), and
  `/messages/{messageId}` (GET/PUT/DELETE).
- Exact bytes, repository page and machine-readable inspection are preserved in
  `/tmp/opencode/wbx-reactions-contract-q2ses7pm/public-docs/`. The upstream
  specification is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
  this report records derived observations, not an edited upstream specification.

This establishes absence **in that exact reviewed specification**, not global
absence of every API, SDK or newer deployment. No guessed service endpoint,
authenticated request, account lookup or Webex mutation was used in the review.

### Provider contract still required

For each proposed release, record actual evidence rather than inferring:

| Contract | Required evidence |
| --- | --- |
| Runtime/support | Supported public contract, or explicit approval of exact pinned internal inputs and upgrade/disable policy |
| Auth/device | Actual approved grants, authenticated actor derivation, independent messaging device/KMS lifecycle; never borrow the meeting owner |
| Target mapping | Verified public message → conversation/activity mapping, with root and reply IDs distinct; no editor-side ID decoding guess |
| Summaries | Count fields, exact own-reaction identity/ownership, completeness, pagination, missing-versus-zero, duplicate entries and expiry |
| Vocabulary | Accepted reaction identifiers, Unicode/variation behavior, per-person/message limits and duplicate-add semantics |
| Events | Parent/reaction mapping, ordering/completeness, reconnect invalidation and deletion classification |
| Mutation result | Actual add/remove acknowledgment and explicit refusal semantics; transport completion alone is not success |
| Product side effects | Whether the service emits reaction alerts/changes activity; no promise that another Webex client will stay silent |

## 2. Proposed normalized contracts — not Webex wire schemas

These are design shapes only. No parser, RPC or capability currently admits them.
Do not extend the own-message edit/delete enum or assume that message authorship
is required to add a reaction. Removal requires verified **reaction ownership**.

### Read snapshot

Bind every snapshot to `{sessionId, roomId, messageId}` plus a provider observation
time and a local generation. Groups contain a validated reaction identifier,
sanitized label, optional count, and `mine: present | absent | unknown`.
An opaque own-reaction handle may be present only after verified ownership.
Keys, private activity IDs/URLs, HMACs, raw events and credentials stay in Node.

States: `loading`, `fresh`, `stale`, `unavailable`; completeness is independent.
Only a complete validated response may establish zero reactions or `mine=absent`.
Missing children/fields, denied access or an unknown self summary cannot.

Replace counts from accepted summaries. Duplicate/out-of-order events only mark
the exact target dirty; never increment/decrement counts using raw activity hints.
A response admitted before a later hint cannot overwrite it as fresh. Overflow
invalidates/refuses; it does not turn partial information into zero.

### Mutation preparation and result

Provisional operations, all still closed in the actual RPC parser:

1. `reactions.summary {roomId, messageId}` — exact loaded target only.
2. `reactions.prepare {roomId, messageId, action, reaction/ownHandle}` — read-only
   preparation; backend resolves actor, target, freshness and authority. Return an
   expiring opaque context plus a safe exact-target preview.
3. `reactions.submit {contextId, requestId, confirmed:true}` — frozen prepared
   intent, not caller-supplied actors, endpoints, activities, keys or recipients.
4. `reactions.resolve {originalRequestId, checked:true}` — exact retained context
   correlation and explicit inspection, never a retry or fabricated success.

Results correlate account/session, original request/context, exact target and
action: `confirmed`, `refused`, or `unknown`. These are proposed local outcomes,
not a claim about service response fields.

Same request/same intent returns retained outcome without another attempt.
Conflicting reuse refuses. A new request ID cannot bypass target uncertainty.
Unknown add blocks add/remove on that target until explicitly correlated
resolution. Resolution records **checked uncertainty**, not confirmed application.

### Uncertainty lifetime

Presentation invalidation is not mutation retirement. Retain unresolved evidence
across room close/reopen, account switching, worker replacement and disconnect.
Never evict an unresolved record to make budget space; refuse new writes instead.

The strengthened simulation demonstrates this only while its ledger remains
alive. **Crash/editor restart durability is not implemented or established.**
Before writes release, approve either an appropriately protected pre-dispatch
uncertainty journal/recovery design, or a specific fail-closed reconciliation
policy that cannot forget admitted writes. No new plaintext store or implicit
“fresh session means no prior write” assumption is authorized here.

## 3. Transport candidate and evidence boundary

Research-only files:

- `test/research/reaction-boundary-candidate.ts`
- `test/research/reaction-transport-fixture.ts`
- `test/research/reaction-transport.test.ts`

The candidate is installed only in a disposable test process. It does not patch
installed packages or `src/read-status-sdk.ts`, widen the receipt-only fence, or
become part of any application build/import graph.

The fixture runs actual pinned SDK add/delete, prepare/submit, request
interceptors and `http-core` Node transport. Catalog and key lookup are synthetic;
encrypt/decrypt text operations and the final `request` primitive are stubbed.
Actual reaction encryption transform dispatch and HMAC construction remain
exercised; this is **not real cryptography, KMS or service acceptance**.

Candidate rules:

- Bind an immutable exact actor/conversation/root-or-reply/operation tuple; reject
  actor, in-meeting recipient and unrelated-reaction overrides.
- Admit at most one matching POST below SDK interceptors. A consumed closure
  remains consumed across shallow/deep cloned replay options and restoration.
- Disable native redirects, refresh and pooled/reused-agent paths. Strip response
  and error bodies capable of triggering detached SDK key-rotation follow-ups.
- Treat malformed/error-like/redirected responses conservatively. The fixture's
  synthetic echo validation is **not** the pending real acknowledgment schema.
- Logical cancellation returns without freeing an unfinished physical slot.
  Replacement operations remain refused until its native callback settles.

The test matrix covers add/remove, root/reply binding, all three observed
rotation codes, five HTTP redirects, case-varied Location and cisco-location,
Locus/App API redirects, 401/403/429/503, reset, malformed/error-like success,
real SDK auth/redirect replay methods, repeated operations, forged actor/
recipient/target, preparation failures, pre-abort and held-request replacement.

Counts mean **stubbed final Node request-primitive admissions**, not network
packets or service writes. The vendored `request` library is replaced at that
primitive, so its socket behavior is not dynamically proven; unpooled options
and pinned source characterization address its known reused-socket path.
Socket/TLS/HTTP/HTTPS/DNS/UDP/fetch and device registration are forbidden and
independently counted. No account config or real credentials/keys are read.
Failures in earlier preparation still need an outer owner that sanitizes every
stage; transport fencing alone is not the future provider's complete API.
Structured refusal/Retry-After extraction is also pending: this test candidate
deliberately returns a generic unconfirmed error, not a production backoff policy.

## 4. Runtime integration after the gates

Proposed files, not added to `src/` now: `reaction-contracts.ts`,
`message-reactions.ts` and one narrow provider adapter. Decide worker placement
and device ownership explicitly; neither a duplicate messaging engine nor a
general mutation tunnel through the metadata/receipt worker is approved.

Use separate negotiated summary/add/remove-own submodes in the existing feature
catalogue. Preserve the **32-capability ceiling**, strict backend/native
validators, independent handshake expectations and old-client behavior.
Advertisement is not RPC permission.

Initial proposed budgets (client policy, not established server limits): 64 loaded
targets, 16 groups/target, at most eight targets per explicit read batch, one
physical request, 8-second request/20-second logical sequence deadlines,
30-second display freshness and 256 retained outcomes. Deadline does not free
hanging native work. Revisit against actual provider limits and shared cooldowns.

Read-only release comes first: no account scan or implicit catch-up on reconnect.
Automatic visible-row refresh is a separately reviewed policy, not the initial
implementation default.

## 5. Native UI contract

Provisional commands: `WebexReactions` (read view, `r` explicit refresh),
`WebexReact`, `WebexReactionRemove`, `WebexReactionResolve`.

Display summary/footer metadata separately from the message's actual body,
Markdown, edit/send identity and copy ranges. Show your participation, stale/
unknown state and text-label fallbacks. Add is native chooser → exact-message
confirmation → one attempt; remove offers only fresh verified own handles.
No generic toggle based on stale counts. Picker Enter is not message-send
consent and must not bypass separate mutation confirmation.

Use `wbx#chooser#select` (`vim.ui.select` / Vim `popup_menu`), hidden exact IDs,
latest/cancel/text/window/session/target guards and existing theme behavior.
Preserve full native undo, annotations/promoted buffers, independent splits,
receipt endpoints and mapping opt-outs/shadows. Audit unused catalogue keys
before binding anything; existing `Wa/Wu/Wn/Wv/Wm` groups and `Wnr` stay unchanged.

Reaction events must never enter the local message-created/unread/receipt
pipeline. A reaction deletion must not delete a message. This local invariant
does not promise the Webex service sends no reaction notification to others.

## 6. Milestones and decisions

| Milestone | Current disposition / release condition |
| --- | --- |
| P0 public-provider recheck | Complete for exact reviewed spec; no supported reaction provider established |
| P1 normalized contract and test-only uncertainty model | Draft specified; room/account reset regression corrected; crash durability remains gated |
| P2 pinned one-shot transport candidate | Offline research candidate; actual wire/crypto/native-network acceptance still missing |
| R0 internal-interface/privacy/device decision | **Not approved**; explicit decision required if choosing the internal SDK route |
| R1 read-only display | Blocked on provider approval and summary/parent/completeness schemas |
| R2 add | R1 plus supported vocabulary, acknowledgment/authority, full replay containment and uncertainty lifetime |
| R3 exact-own removal | R2 plus verified fresh own-reaction identity and remove-result semantics |
| R4 integration/activation | Fresh copied full gate, then separately authorized service acceptance and bundle refresh/editor activation |

Any live acceptance needs separate consent covering a disposable space, exact
reads/add/remove operations, actual device/KMS ownership and cleanup. No live
probe, new grant, dependency install/upgrade, registration, active-editor action,
artifact replacement, commit/push or Atlassian publication follows from this work.

## 7. Verification ledger

Baseline: `/tmp/opencode/wbx-reactions-contract-q2ses7pm/` preserves 527 sources,
all ten checkout artifacts and HEAD/staging before this milestone.
`red/transport-unfenced.log` retains a fixture aliasing/process-exit correction;
`red/transport-unfenced-corrected-fixture.log` reproduces the actual missing
reaction transport protections. `red/uncertainty-view-reset.log` reproduces the
old simulation's loss of uncertain admission on view reset. No old evidence was
rewritten.

Run offline, with installed optional dependencies left unchanged:

```sh
WBX_REACTIONS_RESEARCH_TEST=1 node --import tsx --test test/research/*.test.ts
node --import tsx --test test/research-gates.test.ts
npm run check
```

Missing optional packages fail the opted-in tier; they do not authorize install.
The candidate stays opt-in and isolated; normal application startup never imports
it. The preserved-copy verifier now records an explicit `research-reactions`
tier requiring nine passes/zero skips and a `research-reactions-default` tier
requiring six passes/three named optional skips. Missing execution is a gate
failure, not acceptance from unrelated messaging/native tests.
`focused-3/` passes both dimensions, 14 gate/documentation/infrastructure checks
and TypeScript, and reconfirms 151 unchanged runtime/dependency inputs and all ten
checkout artifacts. Integrated acceptance is pending; candidate proof is not
runtime approval.
