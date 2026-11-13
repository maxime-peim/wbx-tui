# Editor-native messaging UX review

Review date: 2026-11-17. Four independent, read-only reviews covered history and
reactions, navigation and composition, loading/status, and accessibility/QA.
The user subsequently authorized implementation of this document. The original
findings below remain an evidence checkpoint, not a claim that every item is
already delivered.

## Objective and evidence limits

Webex is a reference for messaging tasks and semantics, **not a UI template**.
Prefer native buffers, motions, folds, splits, Ex completion, contextual help and
quiet status. Missing desktop widgets or Enter-to-send are not defects.

The reviewers inspected source/tests and public official documentation, not an
installed Webex desktop client. Their proposed acceptance checks were not run.
Line references identify the reviewed source checkpoint; the concurrent
first-open reaction correction can move them. Confirmed source behavior is
distinguished below from a source-inferred UX risk.

The earlier authorized eight-target live read took 2,783 ms and returned real
legacy labels. It establishes neither a latency guarantee nor complete counts,
vocabulary, deployment compatibility or live first-open acceptance.

## Implementation ledger

**Later People/UI follow-up:** the requested compact selected-DM float is
restored alongside native `:WebexPeople` details. Same-grant renewal preserves
observations/viewport/timer; stale known icons no longer flash `?`, and meeting,
call and DND use distinct emojis. Reaction pickers share inline-history emojis
and retain explicit text mode. See [current design](people-popup-design.md) and
the [verification index](verification-index.md); earlier popup-removal evidence
below remains historical.

Implementation evidence: `/tmp/opencode/wbx-native-ux-5shpxemk/`. No checkout
bundle replacement, dependency installation, installed configuration edit,
running-editor reload/reconnect or new live operation is part of this work.

| Finding | Current implementation / remaining work |
| --- | --- |
| First-open reactions | Previously corrected and isolated-verified; live opening trigger remains unobserved. |
| Manual completion | Implemented: `completion_policy=manual` preserves native local options and Ctrl-N/Ctrl-P. `user` releases automatic-provider suppression; `off` retains strict legacy behavior. Per-buffer override and promotion restoration are covered. |
| Tab/split-local navigation | Implemented: current-tab-first window selection, preferred originating history window, window-local list/reference return metadata and reference context snapshots. Cross-tab tests cover exact returns and independent native work. |
| Edit submission feedback | Implemented: display-only submitting/error/unknown updates reach all visible edit windows without changing text/undo/focus. State precedes long target IDs; unknown status names explicit resolution. |
| Stalled reaction batch sibling | Implemented: deadline returns detached ordered verified observations plus finite timeout items; physical admission stays held, late completion cannot alter publication, and queued reads do not start after expiry. |
| Passive screen-row anchoring | Implemented for same-view badge-height changes in visible splits: capture the current reading screen row at paint time and compensate each native viewport independently. Exact for representable native positions; an indivisible wrapped top line with `smoothscroll` off, or a buffer boundary, uses the closest legal viewport without changing options or adding fake padding. Dedicated delayed insert/remove tests cover two splits, folds, scroll binding, paging suppression and unrelated unsynced undo. Follow-up evidence: `/tmp/opencode/wbx-reaction-anchors-c3c7rbyz/`. |
| Reaction help | Current README, native help and editor guide reconciled with runtime/default-on opt-out, four commands, five-minute successful freshness, bounded read retries and seven-label partial coverage. Documentation regression added. |
| Same-session degraded-source labels | Implemented: validated presentation-only source lifetime/degradation metadata retains unchanged last-observed labels explicitly as cached through recoverable same-source failures, without unavailable reads or write/receipt authority. Recovery admits one bounded refresh per eligible viewport target, including coalesced failure/recovery and paused pickers. The later return-path correction separates view fencing from source-cache eviction; source/grant loss, revocation, changed/deleted content, session/account replacement and opt-out still evict observations. Evidence: `/tmp/opencode/wbx-reaction-retention-0cr_fesx/settled-results.json` and the return-path follow-up below. |
| Return-to-space reaction recovery | Reported live regression: A loaded reactions, B was selected, then A showed unavailable and recovered after roughly 30 seconds. Cache loss is reproduced and corrected offline: same-source exact loaded observations survive navigation in one global 64-entry cache, independently of pending-read admission. View callbacks remain fenced. Evidence: `/tmp/opencode/wbx-reaction-return-t5s4a2p5/settled-results.json`. The exact live delay cause and post-activation acceptance remain unverified. |
| Quiet passive errors | Implemented: only individually marked passive single/batch reaction reads suppress ordinary RPC error notices. Finite categories and aggregate pending/failed counts remain under `reaction_reads` in `:WebexHealth`; provider bodies/IDs are excluded. Explicit commands retain one sanitized actionable explanation; mutation/receipt/uncertainty errors and fatal protocol checks remain visible. Unready passive requests cannot start/reconnect or queue backend work. Evidence: `/tmp/opencode/wbx-reaction-quiet-cppaavzp/settled-results.json`. |
| Explicit reaction waiting/reading feedback | Implemented: originating-window `[reactions: waiting]` / `[reactions: reading]` statusline prefixes acknowledge explicit reads without text/undo/focus changes. Repeated admitted reads are refused; only the newest waiting intent behind passive work may proceed. Stale intent clears feedback without releasing physical admission; old-session/duplicate callbacks cannot clear newer feedback. User statusline options remain untouched. Evidence: `/tmp/opencode/wbx-reaction-status-ab0awjf_/verified-results.json`. |
| Rediscoverable uncertain reaction writes | Implemented: `:WebexReactionUnresolved` is a read-only native snapshot of existing pending/unknown exact room/message/original request IDs. Available offline and with reactions disabled, across notice dismissal and view/session changes; no provider request, unlock or replay. Records remain editor-memory-only, not verified current-account/server state or restart persistence. Exact-request resolution is unchanged. Evidence: `/tmp/opencode/wbx-reaction-unresolved-4ke1gz55/verified-results.json`. |
| Text/ASCII reaction fallback | Implemented: shared Vim/Lua `reaction_display='text'` renders all seven supported groups as ASCII labels on separate wrapped virtual rows; default/invalid values retain `icons`. Wrapping fits the narrowest visible history text width, including gutters; multiline height changes retain native reading anchors. Missing counts remain absent and incomplete empty observations stay quiet. Evidence: `/tmp/opencode/wbx-reaction-text-rtebaaar/settled-results.json`. |
| Selected-space unread provenance | Implemented: `:WebexUnreadStatus` snapshots the highlighted unchanged Spaces room row, separating published server READ/UNREAD/UNKNOWN and freshness, cached metadata, session-only local override and list emphasis. No open/fetch/receipt or local-read change, even with automatic receipts enabled. Retained offline rows work without reconnect; headers/edited/promoted views are refused. Evidence: `/tmp/opencode/wbx-space-provenance-nj27wrjf/settled-results.json`. |
| Failed catalogue versus verified emptiness | Implemented: cache-independent `roomsStatus` separates unverified/loading/ready/failed catalogue reads. “No spaces found” requires successful exhausted emptiness; failed refreshes retain loaded rows and name explicit recovery. All offline test cells pass. The strict gate retains an observed checkout-artifact preservation exception; see `/tmp/opencode/wbx-catalogue-6w74ih2e/final-results.json` and the follow-up below. |
| Reply-root context | Implemented: bounded sanitized loaded-root excerpt, readable published mentions, explicit missing-parent fallback; raw target/text identity stays unchanged. |
| Collapsed-fold topic | Implemented in plugin-owned default foldtext; excerpts and positive loaded-reply counts retain missing-parent/error context and user foldtext customization. |
| Thread presentation | Implemented: loaded/queried text retains presentation-only boundaries, message-scoped Markdown and native folds across refresh/re-entry. No main-history ownership or automatic fetch/receipt/mutation is added. |
| Timestamp zone | Implemented: normalized timestamps display UTC; offset-bearing native inputs retain explicit offsets, and unknown zones are not silently presented as local. |
| Ex completion / effective bindings | Implemented: finite local arguments, already-loaded safe Section names/exact IDs, native attachment path completion and verified buffer-local aliases in source-context help. Discovery performs no provider action. |
| Navigable People details | Implemented and offline-verified: `:WebexPeople` / `Wp` opens native local snapshot text; `r` regenerates locally and `q` returns to the exact origin. Passive DM header/Spaces presence and opt-outs remain. Provider refresh is separate; callbacks never repaint/focus details. Evidence: `/tmp/opencode/wbx-people-native-ticlfc68/verified-results.json` and the follow-up below. |
| Native confirmation / assistive readout | Unmocked native keyboard confirmation checks pass offline in Vim/Neovim: 50 actual prompt keypresses per editor, default Enter/Escape/Cancel refuse the tested operations, and ordinary Enter/write never sends/submits. Consent helpers and production runtime are unchanged. Evidence: `/tmp/opencode/wbx-native-confirm-jddetc6m/verified-results.json`. Operator-observed terminal/assistive readout remains **NOT RUN**; keyboard automation is not accessibility acceptance. |

Verification is recorded by slice, not inferred from earlier full gates. The
initial `slice2` broad run remains failed: an existing native mention fixture
still expected the superseded empty manual-completion option, and an option
catalogue assertion still expected 27 rather than 28 keys. These expectations
now check the new manual policy and exact shared catalogue. Its 50 affected
backend/SDK checks and all 14 drawn cells passed. Early `slice3` failures also
remain preserved: a Vim tilde-regexp mistake and an over-eager foldexpr guard were
corrected without removing incremental fold-preservation assertions.
`slice3c-native.log` passes all 30 selected native cells in both editors.
The fresh `reading-results.json` run passes on 549 frozen sources: **1,717 core
passes / 15 deliberate opt-in skips**, all **44 selected native + 24 drawn cells**,
**50 affected backend/SDK checks**, TypeScript, copied build and two-build candidate
integrity. Frozen source, all ten checkout artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging were preserved. Only this ledger and the
verification index change afterward to record the result; final lineage is
`reading-handoff-checks.json`. Counts across core and SDK tiers overlap.
This is not yet complete review implementation, full offline acceptance or live
service/terminal-accessibility acceptance.

### Passive reaction anchor follow-up

Evidence: `/tmp/opencode/wbx-reaction-anchors-c3c7rbyz/`. The pre-fix drawn
regression moves the selected text **three screen rows** in each split, in both
editors. `verified-results.json` passes on **550 frozen sources**: 1,717 core
passes / 15 deliberate opt-in skips, all 40 selected native + 22 drawn cells,
50 affected backend/SDK checks, TypeScript, copied build and candidate integrity.
The new fixture is included in the standard and focused verification inventories.

`screen-anchor-observations.json` records, **per editor**, 20 normal/user-enabled
smooth-scroll comparisons with **zero row movement** and eight constrained
wrapped-top comparisons with at most one row of movement in that specific native
layout. This is not a general one-row promise at buffer/native-scroll boundaries.
Six drawn checks per editor verify visible reaction glyphs and intact blank
separators, not just metadata existence. Delayed insertions/removals retain text,
full undo (including an unrelated unsynced foreground block), exact cursors,
independent closed folds, horizontal position, focus and user options. Scroll-bound
unrelated work stays fixed and compensation cannot masquerade as edge paging.
Supplemental drawn Visual-mode probes use the identical production helper and
preserve the active selection; they are not added to the standard fixture counts.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging were preserved. Only this ledger and the verification index change after
the accepted freeze; final preservation is `final-handoff-checks.json` there.
No running-editor activation or live/assistive-technology acceptance is implied.

### Same-source transient reaction retention follow-up

Evidence: `/tmp/opencode/wbx-reaction-retention-0cr_fesx/`. The initial native
fixture had a script-variable lookup mistake; the preserved corrected pre-fix
run reproduces loss of known labels and missing recovery freshness invalidation.
The first broad candidate passed, but a separate paused-picker probe then exposed
a missing `cached` qualifier while passive I/O was suspended. That display-only
gap was fixed without resuming reads or changing the inspection/mutation locks;
the final freeze includes its regression.

**Accepted:** `settled-results.json`, all results zero on **552 frozen sources**:
**1,721 core passes / 15 deliberate opt-in skips**, all **46 selected native +
28 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build and
two-isolated-build candidate integrity. Core and SDK counts overlap. Both editors
cover cached ready→degraded→ready, no unavailable reads, one bounded recovery,
late results, coalesced health cycles, changed/deleted targets without old-key
revival, revocation, room/context/source/session boundaries, terminal loss and
opt-out. The actual accepted-state bridge verifies immediate revocation removal
before the following state packet, not just a stubbed presentation context.
The new fixtures are included in standard and focused verification inventories.

Backend regressions prove degraded presentation cannot enable inspection,
preparation, submission or receipts; summaries cannot restore reset write locks.
Single/batch reads crossing reset are fenced even after fast recovery. Retained
unknown writes still require their exact original request ID; summary/recovery/
replay issues no second mutation. Startup completion cannot override an observed
degraded health state. Existing negative TTL, native screen-anchor and full-undo
regressions remain passing. Empty partial observations remain quiet, not zero.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change after
the accepted freeze; `final-handoff-checks.json` records final preservation.
No new live operation, checkout build/replacement or running-editor reload/
reconnect occurred. Other ledger items and live/accessibility acceptance remain
outstanding.

### Quiet passive reaction errors follow-up

Evidence: `/tmp/opencode/wbx-reaction-quiet-cppaavzp/`. The pre-fix regression
reproduces foreground message/last-notice replacement, provider-text exposure and
an unwanted backend-start attempt after disconnect. The actual RPC admission and
response dispatcher are tested, not a stub of `wbx#rpc`; only transport bytes are
inert. Fifteen injected passive failures per editor cover batch/single reads,
pending busy deferral, cached refreshes, stale views and active Insert-mode typing.
Foreground messages, unrelated/concurrent explicit errors, `v:errmsg`,
`v:statusmsg`, focus, text and complete unsynced undo remain unchanged. No
notification or backend start occurs. Partial empty success clears failure
diagnostics without asserting zero; health snapshots cannot mutate cache state.

The same fixture verifies one sanitized actionable `:WebexReactions` failure,
rejection of quiet policy on mutations/unrelated methods, visible disconnection
on invalid result DTOs, and silent rejection of disconnected/late passive work.
The flag is local per-request metadata, never a new wire parameter or capability.
Existing cooldowns, bounded read-only retries, uncertainty/receipt guards,
retention and screen-row anchoring remain intact.

The first broader run remains failed because an older native contract fixture
still expected 27 options rather than the 28 including the previously delivered
manual completion policy. `baseline-contracts-evidence.json` reproduces that same
assertion in both editors on the preserved pre-quiet source. The corrected fixture
now checks 28 entries **and the exact completion-policy row**; no production
completion policy or assertion boundary was removed.

**Accepted final slice:** `settled-results.json`, all result codes zero on
**553 frozen sources**: **1,721 core passes / 15 deliberate opt-in skips**, all
**66 selected native + 36 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; selected native/drawn cells have no skips. The new fixture is
included in standard and focused verification inventories.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change
after the accepted freeze; `final-handoff-checks.json` records final preservation.
No install, new live operation, checkout build/replacement or running-editor
reload/reconnect occurred. The remaining ledger and live/accessibility acceptance
items are still outstanding.

### Explicit reaction waiting/reading follow-up

Evidence: `/tmp/opencode/wbx-reaction-status-ab0awjf_/`. The initial native
regression reproduces missing waiting/reading feedback and competing explicit
reads. A later `background-red.log` reproduces false cancellation from unrelated
background work in another split. The correction keeps source/buffer invalidation
global, but cursor-intent validation origin-window-only. A separate physical
read reservation outlives canceled display intent and remains held through
revocation and later not-ready/ready presentation resets.

**Accepted:** `verified-results.json`, all result codes zero on **554 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **68 selected
native + 38 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. The new fixture uses the actual
coordinator, passive scheduler, accepted-state bridge and native statuslines;
only transport and chooser interaction are inert. It is in standard and focused
verification inventories.

`statusline-observations.json` records **23 drawn statusline checks per editor**
(13 waiting, 10 reading), 17 scenario checks, zero assertion errors and zero
backend starts. Waiting is immediate behind a held passive read; reading begins
only after that physical read settles. Repeating an admitted explicit command or
UI callback starts no competing read. Newer waiting targets supersede old ones;
target/room/session/source/health-cycle/revocation/opt-out/content and leave/return
boundaries fence old feedback/results. Canceled reads retain admission until
settlement; session replacement releases only its orphan, and old/duplicate
callbacks cannot retire a newer token.

Text, changed ticks, full undo (including unrelated unsynced work), focus, view,
native `breakat` and user-owned statusline options remain intact. Other splits
sharing the same history buffer do not inherit the token. Feedback clears before
details/choices and on error/refused admission; local choices themselves are not
misrepresented as backend reads. Hot-path profiling checks no main-state copies
or provider work. Existing actual-demo reaction and exact-request uncertainty
regressions still pass; this display/read reservation adds no mutation, receipt,
write authority or automatic retry.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change
after the accepted freeze; `final-handoff-checks.json` records final preservation.
No install, new live operation, checkout build/replacement or running-editor
reload/reconnect occurred. Later follow-ups below record unresolved-write
rediscovery, text fallback and unread provenance. Catalogue verification,
People details and confirmation/
operator-observed accessibility acceptance remain outstanding.

### Retained unresolved reaction-write inspection follow-up

Evidence: `/tmp/opencode/wbx-reaction-unresolved-4ke1gz55/`.
`:WebexReactionUnresolved` exposes the **existing** pending/unknown maps in an
explicit native list, not another uncertainty owner or persistence journal.
It shows exact room/message/original request IDs, with state-first `PENDING` or
`UNKNOWN` text and separate recovery guidance. No titles, bodies, own-activity
or preparation handles enter the list. Availability needs no backend/capability,
selected room or enabled reactions. Records may predate the current backend/
account; empty means only no local record. Editor restart does not preserve them.
Restarted targets remain write-locked.

The pre-implementation regression fails because the command does not exist.
Intermediate fixture failures remain preserved: an invalid idle state carrying
ready-only context, stale physical-screen cursor coordinates and an absolute tab
number assumption were corrected with validated state packets, native screen
positions and exact originating-tab identity checks. No production protocol,
target/intent or annotation guard was weakened.

**Accepted:** `verified-results.json`, all result codes zero on **555 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **74 selected
native + 44 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. Standard and focused inventories
include the new real-coordinator fixture. Transport, chooser and confirmation
responses are inert; this is not unmocked-confirmation/live acceptance.

`unresolved-inspection-observations.json` records, per editor, six drawn native
text checks (unknown state, exact room/message/request and offline rediscovery),
seven scenario checks, zero assertion errors and zero backend starts. Each local
inspection asserts **zero RPC delta**, including no mutation, receipt, unlock or
replay. The fixture's four deliberate synthetic submissions create pending,
unknown and settled cases; they are not inspection side effects or live writes.
Dismissed notices and room/session/offline/opt-out round trips retain exact IDs.
Forged row metadata cannot become action authority. Cancel/error/stale resolution
ACKs retain unknowns; only the existing successful exact-request guarded path
retires them. Invalidated pending writes remain unknown despite late old ACKs.

Snapshots do not auto-repaint/focus on callbacks. Native text, full undo
(including unrelated unsynced work), annotations/promoted buffers, independent
tab returns and mapping opt-outs are preserved. `r` only refreshes the local
snapshot; Enter/write have no action; named commands remain available without
default key changes. `source-boundary-audit.json` and `final-handoff-checks.json`
also verify that existing target/read/preparation/resolution/invalidation guard
functions are byte-for-byte unchanged.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change
after the accepted freeze; `final-handoff-checks.json` records final preservation.
No install, new live operation, checkout build/replacement or running-editor
reload/reconnect occurred. Later follow-ups below record text/ASCII fallback and
unread provenance. Catalogue verification, People details and confirmation/
operator-observed accessibility acceptance remain outstanding.

### ASCII reaction presentation follow-up

Evidence: `/tmp/opencode/wbx-reaction-text-rtebaaar/`. The optional shared
Vim/Lua `reaction_display='text'` preference uses the seven verified ASCII labels
on separate virtual rows, with word wrapping sized to the narrowest visible
current-tab history text width, including gutters. Default `icons` preserves
glyph presentation; invalid preference values also use icons. `[cached]` and
unavailable diagnostics are ASCII. The layout signature now includes virtual-row
height so style/count wrapping changes use the existing bounded reading anchors.
No native wrap/breakat/gutter/theme/window setting is overridden.

The pre-implementation test reproduces the missing option and glyph-only output.
Intermediate fixture corrections use exact native split widths, fresh redraws,
proper independent cursor placement and drawn badge-above-cursor assertions,
rather than accepting metadata-only or offscreen anchors. The first broader
`verified-results.json` remains failed: the additional core catalogue assertion
still expected 28 rather than the new 29 options. Both native/core assertions now
require 29 and the exact new option/default/forwarding row; catalogue/documentation
equality and exclusion from private RPC admission remain enforced.

**Accepted:** `settled-results.json`, all result codes zero on **556 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **76 selected
native + 46 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. The new fixture is in standard and
focused verification inventories.

`text-fallback-observations.json` records six drawn text checks per editor:
all seven labels in actual **20- and 32-column splits**, a supplied full
safe-integer count without numeric clipping, cached qualification, **24 columns
with a native gutter**, and syntax-off/monochrome presentation. Both independent
reading anchors stay on **screen row 43** while the changed badge is drawn above
them. These are representable native positions, not a general boundary guarantee.
Seven scenario checks per editor pass with zero RPCs. Text/full undo (including
unrelated unsynced work), focus, blank separators, source DTOs/coverage flags,
option forwarding/invalid-value fallback, opt-out and annotations remain intact.
Missing counts are never fabricated; incomplete empty observations add no footer.

`source-boundary-audit.json` verifies unchanged source ownership, cache freshness,
read admission and callback functions, plus the unchanged explicit-reaction and
backend controller files. Presentation grants no inspection/write/receipt
authority and cannot resolve uncertainty. This is still only the seven supported
legacy groups, not verified complete modern vocabulary/count semantics or
operator-observed assistive-technology acceptance.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change
after the accepted freeze; `final-handoff-checks.json` records final preservation.
No install, new live operation, checkout build/replacement or running-editor
reload/reconnect occurred. The later follow-up below records unread provenance.
Catalogue verification, People details and confirmation/operator-observed
accessibility remain outstanding.

### Highlighted-space unread provenance follow-up

Evidence: `/tmp/opencode/wbx-space-provenance-nj27wrjf/`.
`:WebexUnreadStatus` opens a read-only native snapshot for the exact highlighted
unchanged Spaces room row, not the open destination or a title-derived marker.
It separates published server READ/UNREAD/UNKNOWN and freshness at capture,
unread-source readiness, cached/browse-only metadata, session-only local override
and resulting list emphasis. Missing flags remain unknown, never read; stale/
offline/cache flags remain historical. Freshness is the last published source's
classification, not a new provider lookup or wall-clock guarantee. Titles are
bounded sanitized text; the exact room ID is retained.

The pre-implementation regression reproduces the missing command. The first
fixture compared a still-open scripted renderer undo block with Vim's native
window-leave synchronization. A normal input boundary before simulated command
invocation corrects the fixture; complete undo-tree comparisons remain intact.
The intermediate broader `verified-results.json` remains failed only because
two requested drawn invocations targeted `local-unread-events`, already declared
headless-only by the inventory. `matrix-correction.json` records the invalid
invocations, retains their native model coverage and validates every remaining
drawn cell against the inventory. The fresh gate uses identical source.

**Accepted:** `settled-results.json`, all result codes zero on **557 frozen
sources**: **1,722 core passes / 15 deliberate opt-in skips**, all **86 selected
native + 54 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. The new fixture is in standard and
focused verification inventories.

`unread-provenance-observations.json` records **21 drawn scenarios / 63 textual
server/local/emphasis checks per editor**, plus 24 scenario checks, with zero
assertion errors, RPCs or backend starts. Actual accepted-state rendering and
the real local unread model are used; only transport is inert. Tests distinguish
fresh/stale read/unread, unknown under ready/failed/connecting/off sources,
local-read versus server-unread/unknown, and local-unread ahead of server-read.
Cached and disconnected rows stay inspectable without opening/reconnecting.
With syntax off/monochrome and `mark_read_on_open=1`, inspection/Enter/write
never select, fetch, send or acknowledge. Even a fresh-looking summary is not a
receipt-eligible history endpoint. Raw state, selected destination and local
unread counters remain unchanged.

Snapshots do not auto-repaint/focus on accepted updates. Exact window/tab
returns, full native undo/text, mapping opt-outs and annotation/promotion
protection remain. Duplicate/misleading titles, control/directional characters,
forged row metadata and section/header/footer rows cannot substitute a target.
`source-boundary-audit.json` verifies unchanged open/receipt/local-overlay/render/
list-ownership functions and the unchanged backend engine. No new capability,
config option, unread count, read authority or receipt deduplication reset exists.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. Only this ledger and the verification index change
after the accepted freeze; `final-handoff-checks.json` records final preservation.
No install, new live operation, checkout build/replacement or running-editor
reload/reconnect occurred. Catalogue verification, People details and
confirmation/operator-observed accessibility acceptance remain outstanding.

### Cache-independent catalogue verification follow-up

Evidence: `/tmp/opencode/wbx-catalogue-6w74ih2e/`. The store's optional published
`roomsStatus` tracks the latest admitted catalogue read independently of
`spaces_cache`: unverified, loading, ready or failed. Metadata merges do not
verify discovery; failed/blocked or duplicate no-op reads cannot manufacture
successful emptiness. An empty page with continuation is not an absence claim,
and stalled continuation is failed rather than verified empty.

Only successful exhausted empty discovery says “No spaces found.” Failure
retains existing rows and points to `:WebexRefresh` in Spaces; rendering,
inspection and failure never retry, open or acknowledge. An earlier successful
empty result cannot mask a later failed refresh. Older backends remain accepted
but need explicit evidence before an absence claim; the existing cache verified
bit remains a fallback when the new field is absent.

The pre-implementation failures are retained in `red-results.json`. The first
broader candidate stopped at TypeScript checking: a test's empty-array assertion
narrowed the room list to `never[]` across an async reload. Comparing projected
exact IDs fixes the typing while retaining the complete emptiness assertion.
The next `settled-results.json` passed every test but failed strict source lineage
because this ledger/index were edited during the run. `recording-lineage.json`
proves those were the only deltas; neither failed report is relabeled.

**Source/test result:** `final-results.json`, all test result codes zero on
**558 frozen sources**: **1,728 core passes / 15 deliberate opt-in skips**, all
**88 selected native + 56 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; required native/drawn cells have zero skips. Source lineage,
45 pinned SDK inputs, installed toolchain, HEAD and staging pass preservation.
The fixture is registered in standard and focused inventories.

`catalogue-observations.json` records **16 drawn transitions and 17 scenario
checks per editor**, with syntax off/monochrome. Only two deliberate explicit
`rooms.list` reads occur per fixture; automatic retry/open/receipt/mutation and
backend starts remain zero. Real store/engine/JSON-RPC tests preserve the
discovery transitions through output coalescing and cover failed initial reads,
explicit retry, successful empty/nonempty, subsequent failure, supplemental SDK
rows, cache-disabled operation, cache/legacy gates, pagination stalls and late
old-session completion. Native text/full undo (including unsynced work), focus,
annotations and exact loaded row identities remain intact.

**Preservation exception:** the final strict gate remains failed overall because
six checkout bundle/map files changed during its run: `cli`, `editor-main` and
`read-status-worker`. All ten current artifacts match the independently built
candidate, but six no longer match the starting baseline.
`artifact-change-observation.json` preserves both byte sets and records this
unattributed change. No agent checkout build/replacement was invoked; no current
artifact was restored or overwritten. This is not claimed as an all-artifacts-
unchanged gate. `handoff-status.json` retains that exception; recording was paused
for the reported reaction-return bug. The subsequent return-path slice separately
verifies preservation of the newly observed artifacts, not the original baseline.

The source audit verifies unchanged cache/startup, selection, mutation, receipt,
reaction and native ownership guards. This status grants no authority and adds
no request, capability or option. Only the ledger/index change after the final
source freeze. No install, new live operation or agent running-editor reload/
reconnect occurred; current artifact bytes do not prove running-editor activation.
Navigable People details and confirmation/operator-observed accessibility remain
outstanding.

### Reported A → B → A reaction-return correction

Evidence: `/tmp/opencode/wbx-reaction-return-t5s4a2p5/`. The user's live report
reopens reaction navigation acceptance; the earlier synthetic pass counts did
not establish this ordinary workflow or acceptable latency. The new real-
coordinator/renderer/scheduler fixture reproduces loss of A's successful snapshot
while B's physical read is held. Under recoverable source degradation, the same
loss leads to unavailable presentation rather than useful cached labels.

The correction separates **selected-view callback lifetime** from
**authenticated source-cache lifetime**. Temporary history loading and changing
rooms fence old callbacks without discarding source-valid observations. One
least-recently-used cache holds at most 64 entries across all rooms; every reuse
requires the exact currently loaded room/message/content key. It never retains
read or mutation authority. Source/account/session replacement, revocation,
terminal loss, opt-out and changed/deleted loaded content still evict observations.
Legacy metadata without explicit validated source-lifetime proof stays
view-scoped. This supersedes the earlier room/context cache-eviction policy.

`red-results.json` preserves the failing A → held B → A reproduction.
An independent pre-fix replay in `degraded-red-results.json` makes both editors
show the exact `Reactions unavailable` text after a recoverable health transition,
with A previously observed and B's read still held.
The first correction exposed a fixture-only headless-Vim viewport assumption;
the fixture now positions its loaded target explicitly, rather than weakening
the visible-target assertion. `legacy-red-results.json` then exposed missing
source-metadata proof; the conservative predicate and corresponding regression
are included in the final candidate. No old guard test was removed.

**Accepted offline slice:** `settled-results.json`, all result codes zero on
**559 frozen sources**: **1,728 core passes / 15 deliberate opt-in skips**, all
**90 selected native + 58 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; selected native/drawn cells have zero skips. Standard and focused
inventories include `reaction-return`.

`return-observations.json` records 13 scenarios and two drawn cache-hit checks
per editor. Once returning history is loaded, A's labels reappear locally in
approximately **9–15 ms while B's read is still held**, in both healthy and
recoverably degraded cases. Thirty seconds of logical delay are simulated
without settling B. These are local restoration measurements, not a provider/
history-fetch latency guarantee or a capture of the user's exact live delay.
Tests also cover completed B reads, late callbacks, source recovery, exact-room
collisions, destructive content invalidation, all lifetime-loss boundaries,
legacy fallback, 70-room cache pressure and quiet incomplete emptiness.

Five deliberate inert passive batch reads occur per fixture; no history fetch,
receipt, preparation, inspection, mutation or backend start occurs. Foreground
native text/full unsynced undo, focus and native options are preserved.
`final-source-boundary-audit.json` verifies unchanged explicit reaction,
uncertainty, RPC, receipt and physical-callback guard functions and unchanged
backend/SDK files. Deadlines, bounded retries and mutation guards were not loosened.

All ten **currently observed** checkout artifacts, 45 SDK inputs, installed
toolchain, HEAD and staging are preserved against this slice's starting baseline.
The earlier catalogue artifact exception remains recorded, not erased.
Only this ledger/index change after the accepted freeze;
`final-handoff-checks.json` records isolated documentation/help and preservation
checks. No checkout build/replacement, install, live service call or running-editor
reload/reconnect occurred. At this slice, live post-activation return-path
acceptance, People details and confirmation/operator-observed accessibility were
outstanding; the People implementation follows below.

### Navigable native People details

Evidence: `/tmp/opencode/wbx-people-native-ticlfc68/`. `:WebexPeople` / `Wp` now
opens `wbx://people-details` through the existing native-list helper. It is local,
read-only text for the **selected conversation**, not the highlighted Spaces row.
Native motions, search and copy reach full Unicode names, textual presence,
observation age and available activity/retry times. Local `r` regenerates only
published text; `q` returns to the exact originating window if it still shows the
same buffer. Window-local returns, user mapping conflicts and `mappings=0` remain.
Enter/write never send, look up a person or acknowledge anything.

Passive presence remains automatically visible by default in the DM header and
Spaces cues. `people_status=0` masks retained People fields in newly generated
details and suppresses stale ready header data too. Existing snapshots remain
inert native text, not live indicators. The duplicate popup lifecycle is removed:
**513 → 298 lines** in `autoload/wbx/people.vim`, without a replacement display
state machine. Passive presence/viewport/expiry helpers remain byte-identical.

`:WebexPeopleRefresh` / `WvP` remains the separate explicit provider read. It needs
a ready selected DM, enabled known capability/grant and matching published People
room association. From details it also requires a clean owned snapshot of that
same current room/session. Snapshot metadata can only refuse a read, never choose
its provider target; the request still sends `{}`. An A snapshot cannot refresh B.
State, disconnect and late responses never repaint, close, reopen or focus
details. Annotated/renamed/type-promoted copies and full native undo are preserved.
Shared list admission continues to refuse foreign canonical-name placeholders;
it never reclaims one merely because a native rename left it unloaded.

**Accepted offline slice:** `verified-results.json`, all result codes zero on
**560 frozen sources**: **1,728 core passes / 15 deliberate opt-in skips**,
**106 selected native + 74 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Counts
overlap; selected native/drawn cells have zero skips. Both default and focused
inventories include `people-details` and `people-ownership`.

`red-results.json` retains the pre-implementation failures in both editors.
`test-migration.json` maps the old popup assertions to their native replacements;
the old source/tests remain under `before/`. `people-observations.json` records
13 main scenarios and nine drawn text states per editor, plus all 12 ownership
matrix cases and two additional boundary scenarios. The narrow view draws
`Presence Active` in 24 columns while preserving the entire Unicode field.
Cold/offline, stale/unknown/loading/missing-grant/opt-out states, exact tab returns,
full unsynced foreground undo, mapping conflicts, clean rename/type promotion,
late replies, disconnect and session changes are covered.

Opening details/local `r` admits no `people.lookup`; only four deliberately
explicit inert provider refreshes occur in the main fixture, with zero backend
starts. The separate ownership matrix admits 14 explicit inert reads. The
notification fixture retains drawn endpoint, nested-fold and clipped-wrapped-row
safeguards: focused People details cannot count as focused history or authorize
a receipt. Returning to drawn history restores the original visibility check.
Passive viewport reports retain their unchanged pacing, not a new inspection
lookup path.

`source-boundary-audit.json` and `final-handoff-checks.json` verify unchanged
backend/SDK, passive helpers, list ownership/return functions, RPC/receipt/target
guards and reaction code. All ten currently observed checkout artifacts, 45 SDK
inputs, installed toolchain, HEAD and staging are preserved. Only this ledger and
the verification index change after the accepted freeze; final documentation,
fixture inventory and both-editor help checks run in a preserved isolated copy.
No checkout build/replacement, install, live service operation or running-editor
reload/reconnect occurred. The catalogue artifact exception remains recorded.
Live post-activation People/reaction acceptance, the exact original reaction
delay cause, unmocked native confirmation and operator-observed assistive readout
were outstanding at that slice; confirmation checks follow below.

### Unmocked native keyboard confirmations

Evidence: `/tmp/opencode/wbx-native-confirm-jddetc6m/`. The new
`test/editor/native-confirmations.vim` exercises real `confirm()` calls without
redefining consent helpers or supplying their boolean answers. The drawn driver
waits for the actual prompt and default-Cancel buttons on each child's private
controlling PTY, then sends real Enter, Escape, C or the affirmative mnemonic.
Input is allowlisted to this inert fixture; it never targets the running editor.

`confirmation-observations.json` retains the actual prompt/key/button records.
Each editor completes **52 scenarios / 50 native prompt inputs**:
**14 default Enters, 14 Escapes, 13 explicit Cancels and nine deliberate
affirmative inputs**. Seven affirmative helper controls return true without an
action attached, proving that the UI consumed input rather than always canceling.
The other two affirmative inputs accept only the first mention-policy prompt;
default Enter/Escape at the separate `@all` gate still prevents submission.
All seven helper owners and the inline local-Sections confirmation are covered.

Real send/action/reaction controllers exercise cancellation for mention sends,
`@all`, edit submission, deletion, reaction add, reaction resolution and clearing
local grouping. The preceding reaction menu choice is deterministic; final consent
is not mocked. Ordinary composer/edit/history Enter/write admit no send/submit;
Insert Enter inserts a native newline, and native undo reverses only that edit.
Text/full undo, focus, changedtick and `breakat` remain intact on cancellation.

There are **zero sends, mutations, receipts, resolution requests, preference
writes or backend starts**. Thirteen deliberate inert requests only prepare or
discard local action/reaction contexts: four action preparations, three action
discards, three reaction preparations and three reaction discards. This is not
an actual backend/provider/write or non-atomic-preflight acceptance test.
Headless mode checks Enter/write only and explicitly does **not** claim native
keyboard acceptance; the required drawn cells establish that evidence.

**Accepted offline slice:** `verified-results.json`, all result codes zero on
**561 frozen sources**: **1,729 core passes / 15 deliberate opt-in skips**,
**110 selected native + 78 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Counts
overlap; selected native/drawn cells have zero skips. Standard/focused inventories
include the new fixture; existing consent-stub fault tests are retained.

`first-results.json` retains an invalid fixture state missing Section persistence;
`second-results.json` retains a test-driver plan-file publication race. The fixture
now validates its state before startup and publishes plans atomically. A later
source-test regexp incorrectly matched the transport stub's `confirm_running`
variable; it now checks actual consent overrides. No production guard or behavioral
assertion was weakened. `source-boundary-audit.json` verifies **all 157 production
runtime inputs unchanged**, including every consent/target/mutation/uncertainty/
receipt/provider/cache implementation.

Only this ledger/index change after the accepted freeze.
`final-handoff-checks.json` records isolated final docs/inventory/dialog tests,
both-editor help generation and source/preservation checks. All ten currently
observed checkout artifacts, 45 SDK inputs, installed toolchain, HEAD and staging
remain unchanged. No checkout build/replacement, install, live service operation
or running-editor activation/reload/reconnect occurred. The catalogue artifact
exception remains recorded separately.

**Operator-observed terminal/assistive readout remains NOT RUN.** The exact
original live reaction-delay cause and post-activation People/reaction acceptance
also remain unverified. Automated native keyboard evidence does not close those
acceptance gaps or establish full-review/live acceptance.

## P1 — prioritize native behavior and reliable transitions

| Finding | Evidence and certainty | Smallest safe direction / acceptance |
| --- | --- | --- |
| First-open reactions can show unavailable before recovery. | Reported defect; `autoload/wbx.vim`, `wbx#reaction_context()`; `autoload/wbx/reaction_history.vim`, scheduler/store; engine/worker admission. The precise live trigger is unobserved. | The concurrent first-open patch addresses connecting/pending, old-flight draining, unrelated metadata admission and negative-cache age. See the [verification index](verification-index.md); offline checks are not live acceptance. |
| Composer policy suppresses native manual completion with no policy opt-out. | Source-confirmed: `autoload/wbx/completion.vim:11–22,40–44`; enforced by `test/editor/completion.vim:23–30`. | Separate local/manual completion from automatic external providers. Test Ctrl-N/Ctrl-P, user-local settings and re-entry in normal/reply/edit drafts, with unchanged text/undo and no provider lookup or send. |
| Navigation/return can select another tab's first matching window. | Source-confirmed first-window/shared-return policy; resulting focus failure is inferred: `autoload/wbx/view.vim:82–83`, `autoload/wbx/lists.vim:108–118,166–169`, `autoload/wbx/commands.vim:402–409,469–479`. | Prefer the exact origin, then current-tab windows; keep return metadata window-local. Two-tab tests must preserve the other tab's cursor, viewport and folds, including cancel and `q`. |
| Edit submission banners can remain prepared during dispatch/error. | Source-confirmed display paths: `autoload/wbx/message_actions.vim:59–86`; status follows long IDs at `autoload/wbx/history.vim:494–499`. Internal write protection is not reported broken. | Publish display-only submitting/unknown state on every path, state first in narrow splits. Hold a response, inject transport failure and verify visible resolution guidance with unchanged draft/undo and no second write. |
| One stalled batch target can discard completed siblings. | Source-confirmed whole-batch deadline/`Promise.all` behavior: `src/reactions-sdk.ts:129–154`; viewport impact is inferred. | Consider detached ordered results for completed verified targets at the deadline. Hold one of eight targets: seven observations survive; late completion cannot alter the result, free physical admission early or start queued work. |
| Passive virtual lines may move the text being read on screen. | Source-inferred risk: `autoload/wbx/reaction_history.vim`, `s:paint()`; current native-view assertions do not establish screen-row anchoring. | Test delayed results above the cursor in two independently positioned splits. Preserve message screen anchors, text/undo/focus/folds and the existing blank separators; do not replace virtual metadata with message text. |

## P2 — discovery, context and quiet recovery

| Finding | Evidence and certainty | Native direction / acceptance |
| --- | --- | --- |
| Reaction help contradicts runtime and refresh behavior. | Source-confirmed: `README.md:293–302`, `doc/wbx-tui.txt:1614–1629`, `docs/editor.md:976–977`. | Reconcile runtime/source/build/live claims; document four commands, default-on opt-out, five-minute successful refresh and seven-label partial coverage. No complete-emoji or authoritative-zero claim. |
| Temporary source degradation clears last-known labels. | Source-confirmed availability in presentation ownership: `autoload/wbx/reaction_history.vim`, `s:owner()`/`schedule()`; `src/editor-engine.ts:791–800`. | Explore retaining explicitly cached labels only under the same valid identity/content/session. Test ready→failed→ready separately from revocation/account replacement; cached presentation grants no write/receipt authority. |
| Passive top-level read failures use foreground notifications. | Source-confirmed: `autoload/wbx.vim:178–182`, `s:notify()`; viewport uses the same RPC path. | Add a narrowly scoped quiet passive-read error policy. Repeated failures while composing must not emit foreground notices or replace unrelated errors; sanitized diagnostics stay inspectable. Explicit commands and uncertain writes stay clear. |
| Explicit reaction inspection can wait silently behind passive work. | Source-confirmed serialization without a waiting state: `autoload/wbx/reactions.vim:67–85`, `autoload/wbx/reaction_history.vim`, `suspend()`. | An ephemeral statusline waiting/reading token, not a new panel or loading row. Verify immediate acknowledgement, no competing read and fenced results after room/intent changes. |
| Uncertain reaction writes are difficult to rediscover. | Retention/locking is source-confirmed; discoverability risk inferred: `autoload/wbx/reactions.vim:63–75,122–136`. | Provide durable read-only textual inspection of exact unresolved targets. Dismiss the original notice and switch away/back; status must remain discoverable without attempting another write or replaying it. |
| Glyph-only reaction labels can truncate in narrow splits. | Source-confirmed icon table and one-line rendering: `autoload/wbx/reaction_history.vim`, `s:label()`/`s:paint()`. Terminal assistive readout is unverified. | Offer text/ASCII fallback and inspect all seven groups in narrow windows. Keep quiet empty observations and textual details; missing counts must not become zero. |
| Per-space unread provenance lacks convenient textual inspection. | Source-confirmed separate row metadata and rendition: `autoload/wbx/rooms.vim:42–70,213–217`; accessibility impact inferred. | On-demand selected-row summary distinguishing server state, stale/unknown and local emphasis. Test syntax-off/monochrome without opening a space, fetching or acknowledging it. |
| Failed discovery can say “No spaces found” when caching is off. | Source-confirmed paths: `src/messaging-store.ts:122–148`, `src/editor-engine.ts:491–495`, `autoload/wbx.vim:864–866`. | Track successful catalogue verification independently of caching. Pending→failure→explicit retry→successful empty/nonempty tests must reserve the absence claim for successful emptiness. |
| Reply banners can identify different roots identically. | Source-confirmed sender/minute-only context: `autoload/wbx/history.vim:23–25,501`, `autoload/wbx/drafts.vim:146`. Exact internal binding remains intact. | Add a bounded sanitized loaded-root excerpt, no automatic fetch. Two same-author/minute roots must remain distinguishable after reopening retained reply drafts. |
| Collapsed folds omit the discussion topic. | Source-confirmed: `autoload/wbx/folds.vim:109–117`, `autoload/wbx/history.vim:206–210`. | Improve only plugin-owned default foldtext with a bounded body excerpt and no zero-reply noise. Preserve user foldtext, nested folds, loaded-only counts and missing-parent labels. |
| Focused thread buffers discard presentation metadata. | Source-confirmed: `autoload/wbx/productivity.vim:102–107`, `autoload/wbx/queries.vim:49–52,65`, `autoload/wbx/folds.vim:6–11`. | Reuse presentation-only syntax/fold boundaries without granting authoritative-history ownership. Folding/refresh must not fetch, acknowledge or enable mutations. |
| UTC timestamps lose their zone designation. | Source-confirmed normalization/truncation: `src/messaging-api.ts:46`, `autoload/wbx/history.vim:25,148`. | Keep concise UTC/Z labeling. Test offsets, midnight and DST boundaries without changing ordering or identity. Desktop timezone formatting was not established. |
| Ex argument completion and contextual binding help are incomplete. | Source-confirmed: `plugin/wbx.vim:20,49,60,73,121`; `autoload/wbx/commands.vim:214–215,366–376`; aliases at `autoload/wbx.vim:517–537`. | Local-only enum/path completion and verified buffer-local aliases in contextual help. Test mappings disabled/shadowed, custom localleader and Ctrl-S opt-out; completion/help must not start a backend, stage or send. |

## Lower-priority research and acceptance gaps

- The passive People popup duplicates header context and can obscure reading
  (`autoload/wbx/people.vim:332–360`). Consider explicit navigable native details
  rather than another GUI-like surface; preserve passive presence and opt-outs.
  Implemented offline by the native People follow-up above; these line references
  retain the original review evidence, not the current file layout.
- Synthetic tests are not assistive-technology acceptance. Add operator-observed
  terminal readout and unmocked keyboard confirmation checks; default Cancel and
  Enter/write must perform zero sends/mutations. Existing reaction confirmation
  fixtures stub consent (`test/editor/reactions.vim:10–13`).
  The later native-confirmation slice above adds real private-PTY keyboard checks
  without removing those fault fixtures. Operator-observed readout is still open.

## Preserve, do not clone

Keep native text/full undo, readable published mentions and raw edit/send
identity, annotations/promoted buffers, independent splits, focus/folds/themes,
native `breakat`, default-on features with explicit opt-outs, mapping-conflict
preservation and existing groups—especially **Wnr = Remove Member**.
Retain exact-target drafts and explicit sends/confirmations. No automatic mutation
retries, absence inference from partial data, discarded unresolved outcomes or
weakened exact-request resolution. Team descriptions and gated Team-space
browsing remain outside this implementation scope.

## Documentary references

Official pages are task/semantic references, not a desktop screenshot audit:

- [Reactions](https://help.webex.com/en-us/article/ipw68q): message association;
  broader modern vocabulary does not establish support in this pinned adapter.
- [Keyboard navigation](https://help.webex.com/en-us/article/7wr87q) and
  [accessibility](https://help.webex.com/en-us/article/0ix72j): task discovery and
  contextual information, not requirements to mimic desktop controls.
- [Threads](https://help.webex.com/en-us/article/nsjyarr),
  [collapse threads](https://help.webex.com/en-us/article/w0hrv1) and
  [editing](https://help.webex.com/en-us/article/3bic4j): contextual reading and
  explicit update semantics.
- [Known issues](https://help.webex.com/en-us/article/bsmvpdb),
  [reading](https://help.webex.com/article/xdgabi),
  [notifications](https://help.webex.com/en-us/article/ng7w8cj) and
  [availability](https://help.webex.com/en-us/article/wghlt5): delayed/limited
  observations are not proof of failure, absence or unreadness. No reaction
  latency SLA or required cache TTL was established.
