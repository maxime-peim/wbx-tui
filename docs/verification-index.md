# Verification index

## Read-only meetings already joined elsewhere

The new spaces section uses the existing pinned metadata SDK's account-scoped
Locus read, not schedule times, presence or a new meeting registration. Only an
active `self=JOINED` observation on another joined device is projected, with
bounded inert title/hash rows and no join/transfer/leave/room/receipt action.
The public schedule query and its grant/window remain unchanged.

Preservation baseline and focused evidence:
`/tmp/opencode/wbx-joined-elsewhere-m3gl10q0/`.
Parser/virtual-clock, private IPC, production-worker-to-engine and both native
editors' upcoming-meeting fixtures pass. The network-blocked actual pinned SDK
test exercises its service/auth/Node transport with only the HTTP primitive and
catalog synthetic; it does not register/connect a device or load meetings.
Matching final frozen source:
`/tmp/opencode/wbx-isolated-evxp_saf/`. Typecheck/build and bundle integrity pass;
**2,085 core passes / 16 opt-in skips / 0 failures**, **262 SDK/cache passes**,
44 messaging compatibility checks, 3 synthetic browser checks, both editor
restart checks, documentation checks and both editors' helptags pass. Each
editor has **74/75 headless** and **64/65 drawn** passes, including the new
meeting section, Read By, reactions, drafts, folds and mark-on-open coverage.

The overall broad gate is **NOT green**: `sdk-native-recovery` fails in both
editors/headless/drawn because its older allowlists reject the existing
read-only `messages.readBy` / `readers` request. The same failures reproduce on
the saved pre-meeting baseline (`baseline-recovery.log` under the preservation
directory); its production behavior and fixture are deliberately unchanged.
The backend-origin checks also flag this fixture's intentional private
`c4-build/dist/editor-main.js` as a foreign bundle. No source backend was used.
The final frozen-copy, checkout-source/inventory, generated-bundle, installed
toolchain, HEAD and staging preservation checks all pass.

The earlier interrupted run and superseded frozen run
`/tmp/opencode/wbx-isolated-iqfs4xeb/` remain retained, including its since-fixed
snapshot inventory mismatch. A separate backoff burst reproduction found and
fixed duplicate discovery status publications; 1,000 hints during admission
loss now produce no extra IPC records.

Coverage remains partial; federation URLs fail closed, and the SDK buffers the
response before the parser's byte check. A native discovery deadline retires
only discovery; no reconnect is automatic. No live read/write, join/leave,
reconnect, editor reload, install or checkout-bundle rebuild was performed.
See [the contract and limits](upcoming-meetings.md#joined-elsewhere-follow-up-2026-11-20).

## Own contribution count and mark-on-open / Read By admission

A confirmed own reaction without an aggregate total now shows `1 (you)` in icon
and ASCII text badges. The snapshot's total remains absent/unknown; known totals
still display normally and details retain their coverage limitations.

An automatic Read By lookup could occupy the SDK while an independently
admitted mark-on-open receipt was refused, consuming its no-retry attempt.
The single receipt slot now waits for that physical read to settle and rechecks
session/source, selected room, newest loaded endpoint and fresh status before its
only submission. A context change, backoff, terminal source loss or deadline
cancels it; no POST retry, extra SDK connection or receipt from Read By is added.

Evidence: `/tmp/opencode/wbx-own-count-open-receipt-qpu78jfb/`. The pre-fix frozen
candidate reproduces the refused receipt with a valid exact endpoint and fresh
room status (`red2-*`; the initial fixture omitted the explicit read-status
opt-in). Matching frozen inputs in `final/` pass typecheck/build, **2,082 core
tests / 8 optional skips**, **52 native headless checks**, **28 drawn cells**,
bundle verification and both editors' helptags. Earlier reproduction, fixture
and typecheck failures are retained rather than overwritten.

Regression coverage includes one receipt after the read settles, no overlapping
or second pending receipt, cancellation on room/endpoint/source/freshness/grant/
expiry/backoff changes and deadlines, and rejection of an unsolicited ACK before
the reserved receipt is sent. Own-count tests cover actual demo Add drawing,
ASCII fallback and unchanged unknown aggregate metadata. Visibility/completeness,
manual-only opt-out, failed-attempt deduplication, drafts/undo/focus/folds and
current/legacy Read By remain covered.

SDK pins/configuration, checkout bundles, HEAD, staging and unrelated sources
remain unchanged. Builds stayed isolated; no live receipt/reaction, reconnect or
editor reload was performed. Previously failed receipts are not automatically
retried or cleared by this source fix.

## Reaction badges without unknown-count placeholders

History badges show supplied counts but omit `?` when no total is known, in both
icon and ASCII text modes. A confirmed own Add displays `♥️ (you)` rather than
`♥️ ? (you)` or an invented `1`. Explicit reaction details still identify unknown
counts. Count adjustment, ownership/removal checks, uncertain-write recovery,
source lifetimes and native text/undo/focus/folds are unchanged.
Pre-submission SDK-owner refusals now capture their SDK state and existing
sanitized health notice; a later ready health report does not diagnose an earlier
refusal. Admission is not relaxed and no refused reaction is queued/retried.

Evidence: `/tmp/opencode/wbx-reaction-placeholder-2dqv126q/accepted/`. Matching
frozen inputs pass typecheck/build, **2,072 core tests / 8 optional skips**,
**34 native headless checks**, **18 drawn cells**, bundle verification and both
editors' helptags. Coverage includes an actual offline demo Add drawn without
`?`, known/unknown/overflow counters, text-mode wrapping, source retention,
reading anchors, drafts/undo/focus and current/legacy Read By. The failed initial
drawn check used the first rather than last wrapped body row; its evidence is
retained separately. `accepted/` contains the final passing candidate.

Protocol, SDK pins/configuration, checkout bundles, HEAD, staging and unrelated
sources remain unchanged. Builds stayed isolated; no live write, reconnect or
editor reload was performed. The reported live SDK refusal has not been
reproduced or claimed fixed; only its ambiguous diagnostic was improved.

## Regional Read By identity normalization

Read By compares validated room/message identities rather than raw Base64
strings. The pinned public SDK strips padding while projecting memberships;
regional IDs that require padding previously produced false unavailable results.
The requested IDs are retained in responses. Resource type, cluster, UUID,
sender exclusion, read-through evidence and admission bounds remain enforced.
No fallback reader inference, receipt, polling, retry or reconnect is added.

Evidence: `/tmp/opencode/wbx-readers-availability-2q7y_nlc/`. The pre-fix candidate
reproduces both message-ID and actual pinned SDK membership-ID failures with all
network blocked. Identical frozen inputs now pass typecheck/build, **2,072 core
tests / 8 optional skips**, **14 native headless checks**, **4 drawn cells**
(Vim/Neovim with current/legacy backends) and bundle verification. Regional
padded/unpadded IDs work in either direction; foreign room/message UUIDs, clusters
and resource types still fail closed. `proof-*` contains the passing core/native
candidate; the failing reproduction is retained.

SDK pins/configuration, checkout bundles, HEAD, staging and unrelated sources
remain unchanged. Builds stayed isolated; no live write, reconnect or editor
reload was performed. This fixes a reproduced false-unavailable cause, not a
claim that genuine SDK/network/backoff failures are resolved.

## Compact Read By footer and folded group readers

The footer no longer repeats message text. Personal discussions show
`Read by <person name>`; groups show `Read by <n> [+]`, collapsed by default.
`:WebexReadByToggle` / `<leader>WaV` expands/collapses cached group names locally
without touching native message folds or sending a read/receipt. Expanded group
details retain partial coverage and the snapshot check time. Live results keep
the newest disclosure choice, including changes made while a read is pending.
Exact message/source guards, stale labels, drafts, undo, focus and mapping
opt-outs/conflicts remain separate from presentation.

Evidence: `/tmp/opencode/wbx-reader-folds-7p70ouu3/`. Frozen candidates with the
same production code and fixtures pass typecheck/build, **2,071 core tests /
8 optional skips**, **52 native headless checks**, **2 legacy headless checks**,
**26 drawn cells**, bundle verification and both editors' helptags. Coverage
includes collapsed/expanded drawing, personal-name and missing-name footers,
pending-live-read disclosure changes, exact targets, draft/undo/focus retention,
native message folds, mapping prefixes and opt-outs. `final-*` contains the
passing core/native candidate; earlier failed runs are retained.

Backend sources/protocol, checkout bundles, SDK pins/configuration, HEAD, staging
and unrelated sources remain unchanged from this follow-up's baseline.
Verification builds stayed isolated; no live write, reconnect or editor reload
was performed.

## Event-driven live Read By footer

Existing SDK membership `seen` events now produce bounded room-only invalidation
hints through the current IPC/source lifecycle. Opt-in `watch:true` reads enable
`seen-events-v1` notifications; legacy clients receive no unknown notifications.
Native footer refreshes coalesce over one second, keep the exact displayed
message and serialize behind existing read/reaction admission. No presence
inference, polling, receipt, extra SDK connection or retry loop is introduced.
Source/session/room changes, annotations, opt-out and server backoff fence work;
fresh names still require the normal exact-message/member read.

Evidence: `/tmp/opencode/wbx-live-readers-looc4j93/`. Matching frozen inputs pass
typecheck/build, **2,071 core tests / 8 optional skips**, **46 native headless
checks**, **20 drawn cells** (including legacy backends), bundle verification and
both editors' helptags. The actual pinned public `seen` projection is exercised
with all network blocked, including burst coalescing, unchanged unread lookups,
safe hint IPC and self-read events. Native coverage includes serialized dirty
follow-ups, stale failure/no-retry behavior, foreign scopes, newer explicit
targets, direct discussions, draft/undo/focus retention and source cancellation.
`proof-*` is the final passing candidate; earlier failed fixtures are retained.

SDK pins, configuration, HEAD, staging and unrelated sources remain unchanged.
Checkout bundles changed concurrently from the initial hashes and were left
untouched; their observed versions are backed up separately. Verification
builds stayed isolated. No live write, reconnect or editor reload was performed.

## Automatic Read By snapshot and broader reaction emoji

Opening/reopening a group or personal discussion loads one read-through snapshot
for its latest loaded message, without a command, receipt or focus/cursor change.
Explicit `:WebexReadBy` remains message-bound. Ordinary redraw/cursor/expiry
events do not fetch; no polling, reconnect or live reader subscription is added.
SDK `memberships:seen` events exist but other people's events remain unwired.

Reaction Add retains presets and adds **Other emoji...** for one pasted Unicode
emoji. Unicode labels cross read/details/preparation/transport boundaries instead
of being dropped by the seven-name allowlist. ASCII fallback uses codepoints.
One freshly verified own reaction type skips the removal chooser; multiple types
still require a choice. No display cache or `mine` marker grants removal authority.

Evidence: `/tmp/opencode/wbx-readers-emoji-d40z8z99/`. Matching frozen inputs pass
typecheck/build, **2,067 core tests / 8 optional skips**, **46 native headless
checks**, **24 drawn cells**, bundle verification and both editors' helptags.
Coverage includes automatic group/direct loading, quick room switches, no fetch
on repeated redraw/cursor motion, retained drafts/undo/focus, Unicode emoji through
the actual pinned SDK with all native I/O blocked, input cancellation, and
single/multiple/unverified-own removal. Earlier failed fixture runs are retained;
`proof-*` contains the final passing candidate. No live send/reaction, reload,
checkout-bundle rebuild or SDK/configuration edit was performed.

## Individual tags without an extra dialog

Explicit Send/Submit now includes individual person mentions without a separate
confirmation. The shared native consent function covers ordinary/reply sends,
rich-file sends and own-message edits; it no longer builds a person-target
disclosure dialog. Backend syntax/ID bounds, selected-group scope and fresh
membership checks are unchanged, as are edit/delete confirmations and
unknown-delivery locks. `@all` keeps one default-Cancel broadcast prompt per
submission and its separate deliberate insertion warning.

Evidence: `/tmp/opencode/wbx-mention-consent-57bskffi/`. Identical frozen inputs
pass typecheck/build, **2,066 core tests / 8 optional skips**, **26 native
headless checks**, **18 drawn cells**, bundle verification and both editors'
helptags, including an ordinary explicit person-tag send with no prompt,
mixed person/`@all` content, broadcast cancellation, native text/undo retention
and real private-PTY confirmation keys. Existing live sessions and checkout
bundles are not activated or changed; no live message is sent.

## Composer mentions and Markdown create acknowledgments

Composer conceal now emits `@` at the label delimiter, rather than before the
hidden recipient ID. This fixes the reproduced detached `@` in both editors
without changing native draft bytes, undo, membership/send validation, mappings
or global wrapping options. Legacy conceal can still reserve hidden-ID blank
rows; that editor-layout limit is not claimed fixed.

Ordinary Markdown create responses accept bounded, typed server Markdown/HTML
renditions instead of demanding an exact source echo. Positive POST response,
exact room/root, creation metadata, no unexpected files/errors, fresh identity
and existing request/session/draft correlation remain required. Plaintext ACK
equality, recipient-first/file/edit validators and unknown-write recovery remain
unchanged. A message observed during a pending send is an echo, not an identity
known before send admission; the shared store checks that boundary once.

Evidence: `/tmp/opencode/wbx-markdown-fix-fih04mja/`. Synthetic composer wrapping
reproduced the fault in Vim and Neovim, including opaque IDs longer than a split;
the syntax-only fix passes every composer width from 20–120 columns in both
editors. Identical frozen inputs pass typecheck/build, **2,066 core tests /
8 optional skips**, **42 native headless checks** and **16 drawn cells**, plus
bundle verification and both editors' helptags. No live POST, receipt, recovery,
SDK reconnect, editor reload, install or checkout bundle rebuild is authorized.
An already UNKNOWN live delivery still needs explicit inspection and resolution;
the source fix never turns old uncertainty into permission to resend.

## Reader placement, own styling and confirmed Add counters

The follow-up replaces the separate reader list with centered names at the end
of the native feed, for groups and person discussions. The most recently
explicitly inspected loaded message supplies the footer and identifying excerpt;
no latest-message/whole-conversation read inference or automatic refresh is added.
Wrapping/padding follows the existing narrowest-visible-split convention.

Own reactions keep `(you)` but default to normal reaction styling, without the
orange background. A confirmed new own Add increments a known counter once;
already-owned totals and unknown counts are retained, overflow becomes unknown.
The adjusted count is partial display evidence, never removal ownership or a way
to clear uncertain-write locks. Removal and write-admission rules are unchanged.

Follow-up evidence is in `/tmp/opencode/wbx-feed-polish-my9h8zit/`. Identical frozen
inputs pass typecheck/build, **2,062 core tests / 8 optional skips**, **40 native
headless checks**, **14 drawn cells**, bundle verification and both editors'
helptags. Regressions include direct discussions
through the actual pinned SDK projection, engine and native UI; duplicate ACKs,
already-owned/unknown/overflow counters, empty/partial/stale/unavailable readers,
Unicode/narrow layouts, exact targets, native drafts/undo/folds/focus, cache bounds
and zero reader-triggered sends, receipts or person lookups.

No live inspection/mutation, SDK reconnect, editor reload, checkout bundle build,
install, configuration/pin change, commit/push or Atlassian operation is included.
Activation remains deliberate; live availability and coverage remain unverified.

## Explicit “who has read this message” inspection

The prior candidate's `:WebexReadBy` / `<leader>Wav` opened a searchable native reader list for the
exact loaded message. `r` explicitly refreshes that message and `q` returns.
A bounded session/source snapshot added a shared history footer, preserving
reaction `(you)` markers and using another virtual row when width/native styling
requires it. No presence-gutter or message-text change is involved.
See [read-by evidence and UX](message-readers.md).

The pinned public `memberships.listWithReadStatus()` supplies last-seen message
and activity-date watermarks, not an exact individual read time. The adapter
verifies the original message/room/sender, excludes that sender, rejects
contradictory identities and admits only supported read-through evidence.
Live coverage always remains partial; an empty/failed observation never becomes
“nobody read it” or an unread-person list. Limits: 500 admitted memberships,
128 returned readers and 32 native snapshots across rooms. Stale-label expiry
does not fetch, and cursor movement/composer typing/status redraw add no reads.

Evidence: `/tmp/opencode/wbx-read-by-3okjlzpz/`. The final frozen candidate passes
typecheck/build, **2,060 core tests / 8 optional skips**, **40 focused native
headless tests** and **14 drawn cells**. The actual pinned SDK's public member
projection is exercised with all network blocked, including sender exclusion,
name sanitization and no additional receipt. SDK admission/deadline, 429 backoff,
foreign/malformed IPC, exact loaded-target/source leases and stale-result fences
have offline regressions.

The read-by fixture passes Vim/Neovim × headless/drawn, checking visible names and
footers, partial/empty/unavailable/stale states, narrow splits, own reaction
markers, native text/undo/return position, zero receipt/name-lookup/send requests,
changed-source cleanup, annotation retention, bounded cache and A → B → A reuse
through loading placeholders without refetching. Shared reaction anchor/status/
return/text/source regressions also pass. Bundle verification and native helptags
pass; the final verification-document follow-up is checked separately.

No live ReadBy request, SDK reconnect/registration, editor reload, checkout
build, install, configuration/SDK-pin change, commit/push or Atlassian operation
was performed. Built checkout artifacts and prior unrelated work remain
preserved. Activation requires a deliberate backend rebuild and draft-safe
restart. Live service availability/read-through coverage, the earlier SDK exit's
cause, manual Busy and the broader native/media acceptance remain unverified.

## Long-running reaction recovery and presence-processing cost

Ordinary messaging remained ready after the optional SDK worker exited with
`sdk-error`. Local diagnostics found no SDK owner, pending/uncertain reaction
writes, active reaction operation or RPC backlog. The generic failure category
does not establish the exit's cause; no speculative SDK fix or automatic reconnect
was added.

The user approved one 15-second local timing profile, non-sensitive backend
inspection and one SDK-only reconnect with the existing login. Recovery preserved
the messaging store, selected room, local session and generation. The temporary
inspector was closed and profiling stopped. The replacement SDK subsequently
reported server rate limiting; its existing backoff was respected without another
reconnect. The later read-only check found the same replacement process ready,
eight passive reaction cache entries, zero failed targets and no pending writes
or RPCs. Add/Remove were not live-tested; no reaction was sent or replayed.

The instrumented profile saw 17 full states with 437 rooms: 1.79 seconds in
protocol validation and 0.755 seconds across 53 presence observations, versus
0.0615 seconds in the gutter. This identifies a hot path, not a memory leak.
Native validation now reuses its validated, duplicate-checked room index for
presence-list association; presentation reuses its existing live-direct index.
Malformed, duplicate, cached/group, unlisted, selected-room and session checks
remain. Observation/render ordering is unchanged; no cross-revision validation
cache, new dependency or configuration was introduced.

Synthetic five-sample medians in Neovim (milliseconds, before → after):

| Rooms / peers | State validation | One presence observation |
| --- | --- | --- |
| 437 / 32 | 50.6 → 17.9 | 22.9 → 3.7 |
| 500 / 128 | 113.4 → 26.8 | 83.1 → 15.2 |

These are offline component timings, not a live end-to-end speed claim. Both Vim
and Neovim also made identical before/after validation decisions on 1,061 bounded
synthetic states, including 992 rejections.

Evidence: `/tmp/opencode/wbx-session-stall-tyz_c7fm/`. The frozen candidate passes
typecheck/build, **2,046 core tests / 8 optional skips** (including seven executed
offline SDK cases), **80 focused headless native tests** and **20 drawn cells**.
The new bounded catalogue fixture covers 32/437/500 rooms and 8/32/128 peers,
wire-state immutability, selected presence outside the catalogue, legacy lists
and refusal boundaries. Bundle verification passes.

No checkout build, editor reload, install, configuration/SDK pin change,
commit/push or Atlassian operation was performed. The Vimscript performance patch
is not loaded in the live editor; activation is deliberately left to the user.
The original SDK exit remains unexplained. The broader native/media/C4 sweep and
live Add/Remove remain unverified; manual Busy remains unsupported as previously
recorded.

## Inline reaction ownership: omitted self summaries and canonical actor IDs

Own inline chips retain both `(you)` and `WbxHistoryReactionsOwn`, independent of
color; ordinary chips remain unmarked. The renderer already supported these
markers, but counts without self evidence could not produce them.

The user approved a temporary local debugger probe of ownership-related field
shapes from the next normal reaction refresh. The completed capture observed
one aggregate-summary child and **no self-summary child**, with **zero extra API
requests**. This single response does not establish whether the user participated
in that message. No message text, person/message IDs, payloads or credentials
were logged. The inspector is confirmed closed; the original backend/worker
remain alive, with no reload, write or new live SDK session.

Passive summaries now supplement an omitted valid self summary with one
ten-activity page from the existing exact parent collection. Matching canonical
self activity supplies only `mine:true`, not totals or removal handles. No people
lookup, pagination or actor details cross the passive boundary. A valid supplied
self summary avoids this extra read. Denied/oversized/unverified pages cannot
fabricate participation. Explicit removal still requires its separately minted
handle and fresh strict full-activity validation.
Self-summary actor parsing also recognizes the SDK's consistent `entryUUID`/`id`
forms, retaining legacy omitted-type compatibility while rejecting contradictions.

Evidence: `/tmp/opencode/wbx-own-reactions-bdnbsez5/`. Both defects have red/green
offline regressions against the actual pinned SDK with all native I/O blocked.
The focused backend/IPC/feature tier passes **39 tests**, and all **20 native
cells** pass (reaction history/text/actions/status/return × Vim/Neovim ×
headless/drawn). Drawn assertions check `(you)` next to your chip and its absence
on another chip, not merely a highlight group or a people-list label.
The full core run passes **2,046 tests / 8 optional skips**, including all seven
opted-in offline SDK cases. The final formatting/documentation follow-up is
checked separately.
Live post-fix ownership remains unverified: the running editor was not reloaded.

## Corrected presence placement: a real gutter slot

The preceding inline-text and spacing changes did **not** satisfy the requested
layout. Presence now occupies a dedicated two-cell Neovim 0.10+ statuscolumn slot
after the original number/sign/fold gutter, entirely outside the buffer text area.
The existing gutter adapter delegates custom formats/click regions, restores
native options on leaving Spaces, handles copied splits and respects later local
overrides. Group rows and wrapped continuations have blank slots. No inline
presence extmarks or name-area text properties remain. Vim/older Neovim use native
signs, since they cannot append a statuscolumn slot.

Evidence: `/tmp/opencode/wbx-presence-gutter-bz75tx2u/`. Typecheck/build and
**45 focused tests** pass. All **20 native cells** pass: ui-review,
presence-repaint, people-spaces, people-viewport and the shared history-gutter
fixture × Vim/Neovim × headless/drawn. Drawn assertions place the icon strictly
left of buffer column one, not merely outside the title's literal bytes. Coverage
includes selected/unselected and wrapped names, numbering, custom/click formats,
splits, foreign buffers, explicit overrides, unchanged text/undo and idle expiry.
The shared history-gutter regression also passes unchanged.
No live editor reload, backend/configuration/SDK change or full-suite rerun was
performed for this Vimscript-only correction.

## Presence placement, reaction people lists, and attachment labels

Presence now uses Vim text properties / Neovim inline virtual text immediately
after the line-number gutter, without changing buffer text/undo, numbering,
custom statuscolumns, unrelated signs or highlight overrides.

The ordinary reaction list contains reaction groups and human names, not IDs or
instructional paragraphs. It has no inherited Team actions. Clean generated
buffers are wiped when their originating space/session changes; annotations and
promotions are retained. Late reads cannot reopen departed lists. Separate
uncertain-write recovery retains its exact IDs/warnings and mutation guards.

Visible unfolded attachment rows and pickers show sanitized filenames and MIME
types. Negotiated header-only HEAD reads work with images disabled, share native
content admission, retain it through abandoned transport/cleanup, and cancel on
destination/session changes. Limits: ten files per message, sixteen automatic
message attempts / 64 files per selected-space visit, ten seconds per batch.
There is no redirect, GET fallback, body download or automatic retry for labels.
Successful labels remain in the bounded session reference cache. Older backends
and failed reads retain an explicit unknown label, not a fabricated filename.
Count-only and redundant unsupported-preview lines are removed for file references.

Evidence: `/tmp/opencode/wbx-ui-polish-tpl2cnqu/`. The final frozen candidate passes
typecheck/build, **2,039 core tests / 15 optional skips**, **7 opted-in offline SDK
tests**, bundle verification and an independent matching ten-artifact build.
All **36 native cells** pass: nine affected fixtures × Vim/Neovim × headless/drawn.
Tests cover actual absolute/relative/custom gutters, narrow splits and idle expiry;
clean/annotated list lifetime and stale callbacks; image-disabled labels and picker
text; header sanitization, cache reuse, refused HEADs, bounded attempts, polling
preservation, A→B→A cancellation and physical cleanup admission.
Reports/manifests: `final-*`, `independent-*`, `prebuild-integrity.json`.
The plugin wrapper was also attempted from the plain frozen copy; it cannot run
there because its isolated-copy launcher requires Git metadata. This is not
acceptance of the broader native/media/C4 sweep.

Configuration, SDK pins, HEAD, staging, `.gitignore` and unrelated sources remain
preserved. No live attachment-header request, Webex write, extra live SDK session,
install, commit/push or editor reload was performed. Live header availability and
the earlier manual-Busy limitation remain unverified/unchanged. Activation is left
to the user's deliberate draft-safe restart.

## Cold viewport correction and actual Busy-service probe

The preceding warm-peer batching change did **not** fix cold loading: it still
selected only two cold rooms per scheduler turn, then waited for another turn.
That was a real gap, not an activation issue.

`lookupRooms()` now resolves the complete reported batch through two continuous
native HTTP readers and one shared self bootstrap, then submits one exact-ID
People status GET. There is no artificial gap between roster pairs and no
per-person worker. Actual service Retry-After, shared physical admission through
abandoned body cleanup, grants, exact complete-roster checks, per-room
singleflight, cancellation, deadlines, freshness and session fences remain.
Queued/removed rooms settle canceled and cannot start more HTTP.
The finite queue budget is separate from eight-second physical-read deadlines:
slow but healthy queues can finish, while hanging HTTP retains both its native
deadline and physical admission until actual cleanup.
The genuinely cold sixteen-row regression uses 60 ms synthetic HTTP responses:
**660 ms completion, peak HTTP 2, sixteen roster reads, one self read, one status
batch**, with no two-person status publications. This is not live-latency proof.

For Busy, the user separately authorized loopback-only debugger inspection of
the existing backend's one cached unexpired peer mapping and one read-only
`POST compositions` query in the existing SDK worker. The actual result was
**HTTP 200, `unknown`, 480 ms**. Only those normalized fields were recorded;
both inspectors were closed and the existing processes remained alive.
No raw payload/credential logging, registration/session, subscription, status or
settings write, SDK/dependency change, or unknown→Busy inference. The alternate
route did not recover Busy and was not added as a provider. Manual Busy remains
unsupported rather than falsely presented as fixed.
A separately approved passive enum-only capture of the next normal People REST
refresh also returned literal **`unknown`**, with **zero extra API requests**.
This rules out filtering of a literal `busy` for that response; the prior
normalized `unknown-status` alone could not establish that. Its debugger was
closed too. No Busy value is inferred from last activity or the user's report.

Probe evidence: `/tmp/opencode/wbx-cold-presence-9j671udj/` (`baseline.json`,
`busy-result.json`, `probe-cleanup.json`, `rest-enum-result.json`). Offline reports use the
`cold-viewport-*` prefix under `/tmp/opencode/wbx-reaction-ux-7d0qait_/`.
The final frozen cold-loading candidate passes typecheck/build, **2,032 core
tests / 15 optional skips**, **7 opted-in offline SDK tests**, bundle verification,
and an independent ten-artifact reproducibility build. Its **32 native cells**
(eight People fixtures × Vim/Neovim × headless/drawn) also pass.
Final reports and manifests are `final-*` / `independent-build.json` in the probe
directory; the matrix is `cold-viewport-final-matrix.json` in the older evidence
directory. This does not accept live cold latency, manual Busy, or the broader
native/media/C4 sweep.
The ten checkout bundles were rebuilt and match the independent candidate;
`checkout-integrity.json` records preserved configuration, SDK pins, HEAD,
staging, `.gitignore`, runtime sources and closed inspectors. The final
documentation/contract follow-up passes 51 checks. No editor/backend reload was
performed; activation requires the user's deliberate restart.
The following warm-only acceptance record is historical, not acceptance of this
correction.

## Reaction page limit, presence batching, and Spaces margin follow-up

The read-only, user-authorized debugger probe established the reaction failure:
the child-activity service accepts `limit:10` and rejects `limit:11`/`64` with
**HTTP 400 BadRequest**. The inspector was closed afterward, with the original
worker still alive. The shared request/response/native bounds now use ten,
independently of the 64-target presentation cache; no automatic pagination.
The offline regression exercises the real pinned SDK child helper,
HTTP-status interceptor and inbound decryption, reproduces rejection of 64,
and verifies actor details/own handles with ten. The frozen root-fix baseline
passes typecheck/build, **2,019 core tests / 15 optional skips**, and six
read-status SDK tests; the direct production-reaction fixture also passes
with zero native I/O, registrations or refreshes.
Live actor disclosure and Remove remain **unverified**.
No removal or automatic editor restart/reload was performed.

Presence now batches verified peers through documented `/people?id=<exact IDs>`
requests (85 IDs maximum), retains verified peer mappings for five minutes
across scrolling (500 maximum), and keeps the complete bounded viewport relevant
instead of rotating a seven-room window. Identity/status HTTP still share only
two physical slots, including abandoned transport/body cleanup. Cold roster
discovery remains paced and does not have a one-second SLA.
A peer's existing normalized snapshot showed a resolved identity,
`unknown-status`, and last activity; that is not evidence of Busy/offline or a
failed peer lookup. No new identity-by-name lookup or conversation opening occurred.

Both editors now render presence using the owned `wbx-presence` native sign
group in the Spaces margin, leaving titles literal, other sign groups intact,
and later local `signcolumn` settings authoritative. The initial affected matrix
passes **12 cells** (ui-review, presence-repaint and people-popup × Vim/Neovim ×
headless/drawn). Batch contract tests cover exact-ID order, omitted/unknown
statuses, malformed/unsolicited identities, cancellation, native admission,
negative cache, byte bounds and Retry-After. The viewport regression measures
eight previously verified aged peers refreshing via one request in 1 ms of
synthetic time, with no repeated rosters; **this is not live-latency evidence**.

Final frozen acceptance passes typecheck, build, **2,025 core tests / 15 optional
skips**, **7 explicitly opted-in offline SDK tests**, bundle verification and
**48 native cells** (12 fixtures × Vim/Neovim × headless/drawn).
All ten artifacts match an independent frozen rebuild. The checkout artifacts
changed independently while the live editor session changed; all ten already
matched the final candidate, so the agent verified them **without overwriting**.
Configuration, SDK pins, HEAD, staging and `.gitignore` match the preservation
baseline. No install, SDK edit, commit, push or Atlassian operation.
The new live editor was ready but did not have the private diagnostic room/target
selected/loaded; no reaction request, navigation or removal was sent there.
The loopback inspector remains closed. This is not a full native/media sweep or
closure of earlier C4 provenance findings.

Evidence: `/tmp/opencode/wbx-reaction-root-3fwds03v/` and the
`reaction-root-full-*`, `presence-margin-first-*`, `presence-batch-contract-*`
and `presence-final-*`, `presence-independent-*`, `presence-checkout-integrity.json`
records under `/tmp/opencode/wbx-reaction-ux-7d0qait_/`.
The dated deployment below describes the preceding running build, not acceptance
of this follow-up.

## Reaction people view, quiet counters, and notification suppression

**Implemented, offline-verified and rebuilt; activated by the user's deliberate
restart. Live reactor identities and Remove remain blocked, not accepted.**

- `:WebexReactions` / `<leader>Wal` uses the shared action catalogue and an owned,
  searchable read-only list; `q` returns. Conflicts/opt-outs win; Wnr stays Remove
  Member. Actor details are explicit opt-in (`actor-details-v1`, `details:true`),
  one bounded page (now corrected to ten), no scan/paging/new SDK. Names reuse disclosed or
  relevant known evidence, then at most eight exact-person lookups. The closed
  summary may refresh its usual cache, but actor relationships/name reads never
  warm automatic/disk caches or become removal authority. Older clients keep
  unchanged summary/batch/progress DTOs and the legacy summary chooser.
- Every group displays a supplied count, including `1`, or `?` for unknown.
  Own evidence always adds `(you)`, not color alone. Muted colors retain stale
  presentation semantics. Cold/cached loading and passive failures never add
  unavailable footers; fixed passive failure reasons remain in health.
- Remove accepts consistent pinned-SDK person `id`/`entryUUID` forms. Partial
  own collection rows can select a bounded exact GET, never authorize removal;
  only fully validated actor/room/parent/reaction evidence mints an opaque handle.
  Submit revalidates that exact activity. Cached `mine`, counts, actor lists,
  missing fields and contradictory identities cannot authorize deletion.
- The later user instruction supersedes historical other-client self-alert
  eligibility: all self-authored creations are consumed without notification.
  Canonical SDK device identity works without the optional `me` plugin. Modern
  selected-space alerts use actor-aware creations, not REST-history echoes.
  Known per-user room mute tags survive the pinned SDK projection as a boolean;
  unknown live preferences fail closed. Mute consumes queued/held alerts, even
  if unmuted before the delivery timer. No server preference is changed.
  Mention-only rooms conservatively suppress generic alerts; no mention
  eligibility is inferred.

On **668 frozen sources**, typecheck, build, **2,019 core passes / 15 optional
skips**, **161 focused checks**, and **7 explicitly opted-in offline SDK tests**
pass. Relevant native coverage is **54 cells**: 32 reaction cells, 20 notification
headless/drawn cells, plus two headless-only event-policy cells. The preview
negotiation fixture now supplies an incoming, not self-authored, message; all
other runtime/native sources match the passing frozen matrix. The ten checkout
artifacts match the frozen candidate and two independent isolated builds.
This is not a new full isolated/native/media sweep or closure of earlier C4
provenance findings.

The agent did not restart/reload the editor. The user deliberately restarted,
reconnected and selected the authorized diagnostic space after the rebuild.
The existing labeled diagnostic message was revalidated by exact room/message/text
prefix.
Both pre/post-restart live reads returned supplied count 1 for Heart/Celebrate
but **no verified own handles**. The new explicit details read reports
**`activityReadFailure:"summary:unavailable"`**, zero disclosed actors/names.
This was an unresolved SDK individual-activity-read failure at that checkpoint;
the later page-limit probe above establishes its cause. No deletion, mutation retry, new diagnostic message or
raw payload/credential logging was performed. The read-only probe preserved
focus. Per-room notification preferences were respected; actual
desktop/message delivery and live Remove remain unverified.

Evidence: `/tmp/opencode/wbx-reaction-details-hsbz6u7j/` (baselines,
`handoff-results.json`, `live-remove-read.json`, `live-after-restart.json`,
build/integrity and preservation reports) and the `reaction-handoff-*` /
`reaction-followup-ready-*` reports under
`/tmp/opencode/wbx-reaction-ux-7d0qait_/`.
SDK pins, configuration/mode, unrelated sources, HEAD, staging and `.gitignore`
remain preserved; no dependency install, SDK edit, commit or push.

## Confirmed own reactions paint and cache immediately

**Implemented, offline-verified, narrowly live-tested and rebuilt; the user's
running editor was not reloaded.** The user explicitly authorized the current
session and diagnostic space for this follow-up's live checks.

The live reproduction confirmed Add but showed no badge. An immediate summary
read had cached a propagation-lagged empty result for the five-minute interval;
a later exact read returned the saved reaction. Confirmed own Add/Remove now
updates the native cache synchronously in the ACK callback, rather than clearing
freshness and immediately reading that stale summary. Add supplies display-only
`mine`, not a removal handle; affected counts are omitted, never incremented or
decremented. Other observations keep their timestamps. Failed/unknown outcomes,
stale source/content callbacks and replayed historical ACKs cannot manufacture a
successful cache change. The engine also stores the confirmed observation in
the existing private received-data cache; an actual cache-owner restart test
verifies it survives without persisting contexts, handles or write authority.

The live fixed-renderer probe used a separate native frontend bridged only to
the already-running editor backend/SDK. Its allowlist bound every forwarded
operation to the single newly created diagnostic message in the authorized
space; no new device, token, SDK registration, reconnect or original-editor hot reload was used.
Its only reaction operations were one preparation and one Add submission:
**🎉 appeared in that same ACK callback, before any read-back**. A later service
read returned both test reaction labels with supplied count 1. Original draft
hashes/changedticks, focus, buffer, selected space and backend/SDK PIDs remained
unchanged. One clearly labeled diagnostic message remains for inspection.
The bridge initially refused a local teardown `shutdown` rather than forwarding
it to the user's backend; the corrected cleanup-only run passes with zero RPCs.

On **667 frozen sources**, typecheck/build and all core tests pass:
**2,011 passes / 15 optional skips**, plus **132/132 affected checks** and
**24/24 source-backed Vim/Neovim headless/drawn cells**. The complete ten-artifact
checkout rebuild matches the frozen candidate and two fresh isolated builds.
Only this verification entry changes after that source freeze. This is not a
new full native/drawn/optional-SDK sweep or closure of the earlier C4 findings.

SDK subscription finding: the existing Mercury socket emits
`event:conversation.activity`; public message events do not expose reaction Add.
The local adapter filters reaction activities before the lossy public deletion
projection. Cross-client reaction push invalidation is **not yet wired**; existing
periodic/details reads still apply. Live Remove, replies and other spaces were
not tested. No mutation was automatically replayed.

Evidence: `/tmp/opencode/wbx-reaction-refresh-ee2fsqc2/` (`live-before.json`,
`live-fixed.json`, `live-reads.json`, `live-cleanup.json`, `core-results.json`,
build/integrity and final preservation reports), and
`/tmp/opencode/wbx-reaction-ux-7d0qait_/reaction-refresh-candidate-matrix.json`.
No credentials were logged, dependencies/SDK/configuration changed, unrelated
messages mutated, editor reconnected, or commit/push performed. Preserve drafts
and deliberately restart Neovim to load the matching rebuilt code.

## Reaction choice is the write intent

**Implemented, offline-verified and rebuilt; not hot-reloaded.** The user's later
request supersedes the first-use/restart inspection locks and separate normal
Add/Remove confirmations described in earlier entries.

- `<leader>Waa` / `:WebexReactionAdd`: choose an emoji to send it. The picker opens
  immediately; exact-target, source, freshness and physical-admission checks still
  run internally. No Webex inspection, unlock step or second dialog is required.
- `<leader>War` / `:WebexReactionRemove`: explicitly choose a freshly verified own
  reaction to remove it, without another dialog. Canceling either picker does
  nothing. Preparation, foreign/stale targets, changed text, expiry and duplicate
  callbacks cannot silently submit or replay an action.
- Only a retained **unknown previous write** needs Webex inspection and explicit
  exact-request recovery. That confirmation remains default-Cancel. Normal Add
  never opens it automatically. Unknown evidence remains memory-only across full
  editor restarts; no durable journal or automatic replay was added.
- Ordinary history/composer Enter/write remain inert. Cached observations still
  grant no authority; fresh provider checks, verified own-removal handles, the
  closed RPC schema and internal reaction transport fence are unchanged.

On **667 frozen sources**, typecheck/build and the complete core suite pass:
**2,009 passes / 15 optional skips**. The affected tier passes **126/126**; the
final source-backed Vim/Neovim headless/drawn matrix passes **24/24**, including
**47 real confirmation inputs per editor** for the remaining consent/recovery
paths. An initial core-only copy lacked bundles, failing its two backend-harness
checks; building that same unchanged copy makes both pass. No production check
or assertion was bypassed.

The approved complete ten-artifact checkout rebuild passes. All ten files match
the frozen candidate and two fresh isolated builds. This is not a new full
native/drawn/optional-SDK acceptance sweep or closure of the earlier C4 provenance
findings. No dependency, SDK or Neovim configuration edit, live Webex/Atlassian
operation, hot reload, reconnect, commit or push occurred for this follow-up.

Evidence: `/tmp/opencode/wbx-simple-reactions-h2nmfvgr/` (baseline,
`built-core-results.json`, `candidate-lineage.json`, checkout build/integrity and
final preservation report), plus
`/tmp/opencode/wbx-reaction-ux-7d0qait_/simple-reactions-final-matrix.json`.
Only this verification entry changes after the accepted source freeze.
Preserve drafts/notes and deliberately restart Neovim to load the simpler flow.
Live service delivery remains **NOT RUN**.

## Progressive reactions, first-use Add guidance and restart-ready bundles

**Implemented, offline-verified and rebuilt; uncommitted, not reloaded.** This
follow-up includes the persistent-cache work below in the refreshed checkout
bundles and the explicitly approved local Neovim plugin-spec update.

- Negotiated `progressive-v1` / `progressive:true` paints each completed reaction
  summary before slow siblings, using the existing eight-target batch and three
  read chains. Private IPC separately opts in; final-only parents reject
  unsolicited progress. Final settlement and physical-admission guards remain.
  Exact request/source/session/view/content fences, bounded duplicate handling
  and display-only ownership rules remain; no mutation or receipt is replayed.
- Message actions now include `<leader>Waa` Add, `<leader>War` Remove own and
  `<leader>WaI` Inspect/unlock. Existing mapping conflicts/opt-outs win, and
  Wnr remains Remove Member. A genuine first-use inspection error offers the
  existing explicit confirmation, then stops without writing: choose Add again.
  Read failures retain finite diagnostics instead of falsely demanding inspection.
- Meeting presence uses **📹**, not 📅; the label remains “In a meeting.”
  Generic presence does not disclose whether the peer's camera is on.
- `~/.config/nvim/lua/plugins/wbx-tui.lua` retains `spaces_cache=true`
  and explicitly enables reactions and notification sender names. An isolated
  Lua self-check verifies all other settings and original `0664` mode, without
  loading the plugin/backend. Received text remains private **plaintext** on disk;
  [expiry, clear and best-effort durability limits](received-cache.md) still apply.

On **667 frozen sources**, typecheck, isolated build and candidate integrity pass:
**2,009 core passes / 15 optional skips**, **148 native passes / zero skips**,
**128 drawn-screen passes**, **246 SDK/cache passes**, two restart passes,
44 messaging-compatibility passes, three synthetic-browser passes and both help
checks. Research opt-in/default dimensions pass with their explicit skip counts.
An additional **40/40 source-backed cells pass**, including **53 real native
confirmation inputs per editor**. Their runtime/fixtures match the final freeze;
only the source-boundary forwarding assertion changed afterward.

The raw final runner still exits **1**: three existing C4 provenance checks plus
`checkout-artifacts-preserved`. During that run the checkout's six changed
bundle/map contents became byte-identical to the final candidate; the origin of
that concurrent refresh is not established. The mismatch is retained, not waived.
After all functional checks, the approved complete ten-artifact build ran
successfully using existing dependencies. All ten outputs match the frozen
candidate and two fresh isolated builds. No guard was loosened and this is not
a claim of overall green acceptance. Earlier candidates exposed outdated
50-dialog totals in the fixture/PTY driver and an old callback-free source
assertion; those expectations were corrected without changing production safety.

Evidence: `/tmp/opencode/wbx-isolated-fe9x1au2/summary.json`,
`/tmp/opencode/wbx-reaction-ux-7d0qait_/handoff-settled-matrix.json` and
`/tmp/opencode/wbx-progressive-b9knudi4/` (`artifact-change-reconciliation.json`,
`approved-build.log`, `checkout-bundle-integrity.json`, `final-handoff-checks.json`).
The latter verifies unchanged unrelated prior sources, all 45 SDK pins,
`.gitignore`, HEAD/staging and only the authorized configuration edits. After the
freeze, only this entry and the received-cache activation note changed.
No installation, installed-SDK edit, editor reload/reconnect, live-service or
Atlassian operation, commit or push occurred. Live add/remove, service recovery
and camera-state acceptance remain **NOT RUN**. Preserve drafts/notes and
deliberately restart Neovim to load matching frontend/backend versions.

## Startup discovery throttling and persistent received display caches

**Implemented and focused offline-verified; uncommitted, not activated.** The
user authorized decrypted received text in private disk files across restarts.
This extends the prior room/unread cache; it does not restore write authority.

- A startup unread-discovery 429 no longer destroys the SDK owner. New SDK reads
  pause for at least 60 seconds or the longer supplied `Retry-After` (seconds or
  HTTP date); long pauses retain heartbeats. Recovery reuses one registration,
  without reconnecting, reauthorizing or replaying any mutation.
- Unread readiness and independently verified reaction-summary readiness are
  separate. Non-throttle unread refresh failure can leave summary reads usable;
  inspection, writes and receipts keep the original ready-source guards.
- `spaces_cache=1` enables a separate verified account/config-profile received
  display cache. Ephemeral editor session IDs fence callbacks, not disk keys.
  Names, message content and reactions retain independent observation times/keys.
  Existing explicit opt-outs and default-on native behavior remain.
- Bounds: 256 names (six-hour refresh, 24-hour maximum age), 16 rooms × 32 recent
  text messages/reaction observations (independent six-hour ages), eight fixed
  slots and 4 MiB per received-data document. The existing room/unread metadata
  file retains its separate 500-room / 1 MiB / six-hour bounds.
- Private plaintext files use shared owner/mode/link/type checks, bounded reads,
  atomic replacement and clear-after-commit ordering. No credentials, SDK objects,
  attachment URLs/pixels, opaque `own` removal handles, preparations, inspection
  locks, pagination cursors or replay contexts persist. Positive names reuse
  successful observation times; failed refreshes cannot renew evidence.
- Restored text is a separate engine projection, never `MessagingStore.messages`.
  `historyCached` requires not-ready/not-latest presentation; fresh history,
  including an empty result, replaces it. Cached reactions are muted and cannot
  grant receipt, send, removal or inspection authority. Old restore DTOs are
  revoked synchronously on room revocation and explicit reaction invalidation.
  Expiry/clear removes restored-only decorations; names/previews do not evict
  unchanged reaction observations.
- `:WebexCacheClear` covers both current-profile files and disables their writes
  for the session. Late loads/completions cannot undo clear or scope loss. The
  existing slow-fsync/rename tests still execute the actual shared file code,
  not a substitute storage implementation. Drafts, native undo/focus/splits,
  annotation/promotion rules, themes, mappings and ordinary Enter/write safety
  remain unchanged. Wnr = Remove Member.

Final frozen focused gate: typecheck, copied build, bundle integrity and
preservation checks pass; **1,999 core passes / 15 optional skips**, **148 native
passes / zero skips**, **128 drawn-screen passes**, **244 SDK/cache passes**,
two restart passes, 44 messaging-compatibility passes, three synthetic-browser
passes and both help checks pass. Optional LazyVim/research skips remain explicit.
An additional **56/56 source-backed cells pass**: 14 affected fixtures ×
Vim/Neovim × headless/drawn. An inert-clock negative control proves the original
worker fails the new startup-429 regression before the fix.

The maintained runner still exits **1**, solely for the three existing C4
provenance checks classifying its four intentional private bundles as foreign.
The guard is unchanged; this is not a claim of overall green acceptance.
Live-service recovery, count disclosure and add/remove acceptance remain **NOT RUN**.

Evidence: `/tmp/opencode/wbx-isolated-0vg7xi0w/summary.json` and
`/tmp/opencode/wbx-persistent-zyfm97ks/` (fresh user-rebuilt baseline,
`source-matrix.json`, `startup-429-negative.json`, `final-handoff-checks.json`).
All ten user-rebuilt bundles, 45 SDK pins, HEAD/staging, `.gitignore` and unrelated
prior uncommitted work are preserved. No dependency/config/installed-SDK change,
checkout build, editor reload/reconnect, live-service/Atlassian operation, commit
or push occurred. [Privacy, lifetimes and clear rules](received-cache.md) describe
the plaintext and best-effort-write limitations.

## Reaction presentation, independent cache identity and paired name reads

**Implemented and offline-verified; uncommitted/inactive.** This supersedes the
earlier inline `cached`/`(you)` presentation, not the explicit inspection,
uncertainty/replay, physical-admission or native-editing safeguards.

- Message rendering, resolved names and reaction observations keep separate
  identities/lifetimes. Reaction reuse uses a source-content key excluding
  author/name and image-preview presentation, not the combined rendered-block
  hash. Name resolution no longer evicts reactions on a loaded message or on
  A → B → A return. Changed/deleted content and true source/session/account loss
  retain their existing invalidation rules.
- Neither icon nor text mode appends `cached`; retained stale observations are
  muted without freshening timestamps or partial/unknown flags. Icon counts
  greater than one appear as `♥️ 3 | 👍 4`; missing counts are never inferred.
  Only explicitly supplied safe aggregate counts are accepted; self-summary
  counts and repeated labels cannot manufacture totals.
- Own chips use `WbxHistoryReactionsOwn`. Display-only self-summary `mine`
  evidence is distinct from a fresh verified opaque `own` removal handle.
  Neovim styles individual chunks; Vim groups own chips on a separate native
  virtual row because a text property has one highlight. Text mode keeps its
  ASCII labels, wrapping and `(you)` accessibility marker.
- `self-summary-v1` negotiates optional read-only `selfSummary:true`. Legacy
  RPC responses omit `mine`; the closed mutation schema cannot accept this
  display flag or use it as removal authority. No new top-level capability is
  added, and first-use/restart locks remain.
- Add opens its local emoji picker immediately, even behind a physically held
  passive batch. Only preparation waits. Its explicit inspect/unlock choice
  asks for exact-target confirmation and sends no reaction; Add must be chosen
  again afterward. Final native confirmations retain their experimental warning,
  default Cancel, Enter/Escape refusal and no-write behavior.
- Name reads start in pairs using their own two-slot/budget state: at most two
  starts per rolling two seconds, with unchanged sustained rate, denial,
  Retry-After and physical-cleanup guards. Presence already uses bounded pairs;
  reactions retain eight-target batches, shared room metadata and three read
  chains. No general thread pool, extra SDK/device or cross-feature cache is added.

**Final frozen focused gate:** typecheck, copied build and bundle integrity pass;
**1,981 core passes / 15 optional skips**, **148 native passes / zero skips**,
**128 drawn-screen passes**, **242 SDK/cache passes**, two restart passes,
44 messaging-compatibility passes, three synthetic-browser passes and both help
tag checks pass. Optional LazyVim/research skips remain explicit. An additional
**60/60 source-backed cells pass**: 15 affected fixtures × Vim/Neovim ×
headless/drawn, including real native confirmation dialogs.

The overall maintained runner still exits **1**, solely for the existing three
provenance checks classifying C4's four intentional private bundles as foreign.
That guard was not loosened; this is not a claim that overall acceptance is green.

Evidence: `/tmp/opencode/wbx-isolated-m3ql56mz/summary.json` and
`/tmp/opencode/wbx-reaction-ux-7d0qait_/`. The latter retains the original
uncommitted baseline/hashes, `red-names.log`, `red-return-matrix.json` (all four
author-change cells fail before the fix), `final-matrix.json` (60 passing cells)
and `final-handoff-checks.json`. Actual pinned-SDK offline tests block all native
I/O, registration and credential refresh; live count-field availability and
actual add/remove service behavior remain **NOT RUN**.

Ten existing artifacts, 45 pinned SDK inputs, the prior `.gitignore` and unrelated
People/recovery work, HEAD and staging are preserved. No installation/config
change, checkout build, running-editor reload/reconnect, live-service/Atlassian
operation, commit or push occurred. Live/operator L1–L3 acceptance remains separate.

## People/UI follow-up — quiet renewal, restored float and emoji cues

**Implemented and offline-verified; uncommitted and not activated.** This
supersedes the historical popup-removal presentation below, not C1–C4 closure
or the separate L1–L3 live/operator acceptance requirements.

- Same-application/account token renewal with unchanged grants retains the
  People provider, viewport, observations and existing refresh timer. It starts
  no lookup and no longer depends on an unchanged viewport being resent.
  Actual grant/session/account changes still invalidate; denial is not retried.
- A held periodic lookup retains stale known status instead of publishing
  loading/unknown. Spaces distinguish 🟢 active, 📞 call, 📅 meeting, ⛔ DND,
  🖥️ presenting, 🌙 inactive, 🏖️ out of office and ⏳ pending. Known stale icons
  remain neutrally styled; five-minute expiry, never-observed and undisclosed
  statuses remain unknown. Manual Busy is not inferred.
- The automatic compact selected-DM float consumes existing published data,
  without a provider request or polling loop. `:WebexPeople` remains the
  navigable native local snapshot and dismisses the float for that selection.
  Focus/full native undo, annotations/promoted text, opt-outs and covered-row
  receipt refusal are preserved. Geometry-only receipt protection survives an
  annotated float's dismissal/session replacement without reclaiming its text.
- Reaction pickers and inline history share emojis. Explicit
  `reaction_display='text'` still applies, including to pickers. Exact-target,
  physical-admission, uncertainty/recovery and ordinary Enter/write guards
  remain unchanged. `:WebexCancelReply` / default `\WR` returns to the main draft,
  preserving the thread draft and undo.

**Final frozen focused gate:** typecheck, copied build and bundle integrity pass;
**1,979 core passes / 15 optional skips**, **148 native passes / zero skips**,
**128 drawn-screen passes**, **242 SDK/cache passes**, two restart passes,
44 messaging-compatibility passes, three synthetic-browser passes and both
native help-tag checks pass. Optional LazyVim/research skips remain explicitly
reported. An additional **64/64 source-backed matrix cells pass**: 16 affected
People/reaction/thread fixtures × Vim/Neovim × headless/drawn. `people-popup` is
registered in the shared inventory and both focused selections.

The maintained runner still exits **1**, solely for its existing three backend
provenance checks: C4's four intentional `c4-build/dist/editor-main.js` bundles
are classified as foreign. Every test command passes; this is **not** a claim
that the overall acceptance command is green. The guard was not relaxed.

Evidence:

- `/tmp/opencode/wbx-isolated-o3jgx_kj/summary.json`: final focused commands,
  counts, backend traces and frozen-copy/toolchain/artifact preservation.
- `/tmp/opencode/wbx-people-ux-lxb2eyi2/`: original `baseline.json`,
  `red-presence.log` (both reproduced backend defects),
  `red-promoted-popup-matrix.json` (four expected receipt-safety failures),
  `settled-matrix.json` (64 passing final cells), and
  `final-handoff-checks.json` (final lineage/preservation reconciliation).

Initial broad-run failures were old provider-replacement/heart-glyph
expectations, corrected without weakening the negative safety checks. The
apparent Vim emoji corruption was independently reproduced as failed-assertion
formatting; actual chooser text/codepoints are intact (`vim-assert-unicode.json`).
Ten user-built artifacts, 45 pinned SDK inputs, the prior `.gitignore` edit,
unrelated work, HEAD and staging are preserved. No installation/configuration
change, running-editor reload/reconnect, live-service/Atlassian operation,
commit or push occurred. Live disclosure/timing, graphical/device/media and
assistive-readout acceptance remain **NOT RUN**; withheld statuses cannot be
manufactured. This is a focused gate, not a new all-fixture/six-case meeting run.

## C4 closed — complete forked SDK → worker stdio → Vim/Neovim recovery

**Current bounded offline status: C1–C4 closed. L1–L3 external acceptance
remains NOT RUN.** Historical open-item entries below describe their original
gates, not the current checklist.

`test/editor/sdk-native-recovery.vim` drives the real default composition:
actual `src/editor-main.ts` → `runEditorWorker`/`EditorLines`/`EditorRPC`/
`editorOutput` → actual `ReadStatusWorker` fork/private IPC → actual
`src/read-status-worker.ts` with only its SDK boundary replaced. Native
transport, protocol/revision admission, Health, selection and buffer owners are
real. The private two-entry build prepends synthetic OAuth/GET responses and
read-only I/O observation; it does not replace dispatch/framing/output, inject
engine/source callbacks, add test RPCs or change production defaults.

The finite workflow proves:

1. A/B fresh unread, never-observed U unknown, selected A's ready history.
2. A real asynchronous synthetic SDK exception enters the actual terminal
   failure handler. A/B become stale, U stays unknown; backend/protocol/history
   remain ready. Source epoch retires; the native UI session does not change.
3. Removing the fault does not retry. Explicit `:WebexAuthRefresh` forks exactly
   one fresh source, advances its epoch and restores fresh observations.
4. Wrong-room deletion/nonself membership events cannot invalidate A. Exact
   deletion removes only its message; exact self-removal emits native
   `room.revoked`. Stale REST/SDK deliberately keep returning A but cannot
   resurrect deleted content or revoked authority.
5. Explicit B selection/history and fresh unsent native work succeed.
   Background stages retain annotations/draft text, full undo, focus, independent
   split folds, theme, `breakat` and Wnr. Ordinary Enter/write never sends.

**Final preserved-copy gate:** typecheck/build/audit pass; **1,977 core passes /
15 optional skips**; **four C4 cells pass** (Vim/Neovim × headless/drawn), plus
**eight selected native regressions pass**, zero native skips. The latter use
the maintained client runner for C4, source reaction, unread-provenance and
C2 reset recovery. C4 is registered in the shared inventory and both maintained
focused gates; the omission regression now protects it too.

Sanitized traces record seven Health checkpoints per cell, source epochs,
fixed synthetic IDs, request/response metadata and real process/IPC lifecycles.
They prove one editor worker with two distinct SDK children, one stdout ACK per
actual stdin request, one explicit refresh, clean exits and **zero business
mutations, receipts, mutation replay or unexpected network/browser calls**.
Credentials, provider error strings, message/draft bodies and full native
configuration/binding paths are not logged. Private build proofs hash original
runtime sources and bundled outputs.

Evidence: `/tmp/opencode/wbx-c4-native-source-s4hegr8s/`.

- `verified-matrix.json`: complete headless/drawn results with whitelisted
  Health/request/process/IPC traces and build proofs.
- `trace-checks.json`: reconciles every cell's process/epoch/ACK/no-write and
  sanitized-trace contracts against preserved runtime hashes.
- `negative-controls.json`: isolated-copy missing failure-epoch retirement and
  broken exact-deletion routing each fail at the intended native assertion.
  They are test faults, not checkout defects or product passes.
- `verified-results.json`: final commands/counts and preservation results.
- `final-handoff-checks.json`: final documentation/audit/inventory/boundary
  contracts, unchanged-input lineage and C1–C4 closure.

**No production defect was reproduced; runtime code is unchanged in C4.**
The first private-fixture iterations corrected setup assumptions about public
Health/destination fields, buffer focus and ACK barriers; no production guard,
original assertion or timeout was weakened. Every original native fixture and
the original six meeting lifecycle assertion/timeout inputs remain unchanged.
Ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, unrelated
work, HEAD and staging are preserved. No dependencies/configuration were
installed/changed, no checkout artifacts replaced, no running editor
reload/reconnect, live-service/Atlassian action, commit or push occurred.

This closes the **finite offline checklist**, not a new all-fixture native/
drawn, installed-SDK-specific or six-case meeting lifecycle gate. Historical
C1/C2/C3 evidence remains separate. Actual People/reaction service timing,
graphical/device/media behavior and operator assistive readout remain L1–L3.

## C3 closed — combined held-I/O failure, stop and replacement

**Current offline status: C1/C2 fixed, C3 verified; C4 remains open.
L1–L3 external acceptance remains NOT RUN.**

`test/mixed-cleanup-integration.test.ts` adds **36 controlled integration cases**
through real engine/RPC and existing storage/content/write owners:

| Axis | Values |
| --- | --- |
| Invalidation | OAuth-refresh failure invoking application `failed()`, explicit stop, explicit account replacement |
| Draft port held | Open-load, save's revision-load, save/commit |
| Submitted writer | Exact metadata PUT, actual staged-file multipart upload |
| Settlement order | Storage first, network first |

Every case holds **three consumers concurrently**: draft I/O, a typed content
GET and an admitted write. Failure/stop cases settle one side while still
failed/idle, before restart; failed-state checks therefore do not merely rely
on the next generation fence. Replacement cases retain all three holds until
account B is ready. A released side can do fresh deliberate work while another
side remains physically held.

The cases distinguish late headers from body-cancel settlement and valid ACKs
from ClientRequest close. Upload cases retain an actual anonymous snapshot FD
until the native write drains. Each case proves no premature admission,
late state/delivery/progress publication, queued work or mutation replay; exact
private reply uncertainty survives stale saves, and original write uncertainty
does not become replacement-account authority.

These are positive workflows as well as refusal tests: each saves/restores
current drafts, pulls/completes current attachment bytes and confirms exactly
one new deliberate metadata/upload write. Late sibling cleanup cannot clear a
fresh descriptor or overwrite current work. Account replacement also returns
to A to verify retained private work and exact original metadata recovery.
Sanitized traces name invalidation, settlement and successful fresh-work steps.

**No production defect was reproduced; all runtime inputs are byte-identical.**
No extraction, new coordinator/state registry, retry mechanism or public API
change was required. Holds are at existing load/save/fetch/request boundaries,
backed by real private draft files and actual content/PublicREST/Uploads
admission. This is lifetime/commit-admission evidence, not kernel DNS/socket
behavior or OS crash/fsync fault injection. Browser, SDK, People and optional
cache construction are forbidden in this fixture.

Evidence: `/tmp/opencode/wbx-c3-held-io-3shr47ah/`.
`refined-mixed.log` records 36/36 passing cases, zero skips. Three isolated-copy
negative controls each produce the expected single failure:
early draft-I/O release, early content-lease release and stale storage acceptance
while failed (`negative-controls.json`). Those are deliberate test faults,
**not checkout runtime defects or passing product tests**. Initial typecheck
issues in the new fixture were corrected without changing original assertions,
timeouts or runtime guards.

Final typecheck/build/audit, core counts and complete matrix/trace reconciliation
are in `verified-results.json` and `matrix-evidence.json`; final documentation,
preservation and immutable-copy lineage are in `final-handoff-checks.json`.
**Final isolated gate: typecheck/build/audit pass; 1,977 core passes / 15 optional
skips, including all 36/36 C3 cases with zero matrix skips.** Every expected
axis combination and sanitized trace is reconciled, including inactive
settlement before restart and all three holds into ready account replacement.
No full native/drawn or SDK-specific gate is claimed for this test-only slice:
all those runtime/fixture inputs, including C1/C2 workflows and the original
six meeting lifecycle assertions/timeouts, remain byte-identical. Their prior
acceptance evidence is retained, not relabeled as a fresh C3 run.

Ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD, staging
and unrelated work are preserved. No installed dependencies/configuration were
changed, no checkout bundles replaced, and no running-editor reload/reconnect,
live-service/Atlassian action, commit or push occurred.

C4 is still the separate forked synthetic SDK → actual worker stdio →
Vim/Neovim recovery/diagnostic walkthrough. This in-memory RPC matrix is not that
vertical proof and does not close the whole architecture goal.

## C1 closed — timestamp syntax and actual painted-header colors

**Current offline status: C1/C2 closed; C3/C4 open. L1–L3 remain NOT RUN.**

The original timestamp assertion in `test/editor/ui.vim` is unchanged, as is
the entire fixture. The contained time rule required a zone while the fallback
header accepted the original zone-less text. Header and contained-time patterns
now accept the same bounded zone-less/UTC/offset/edited suffix grammar.

The new drawn regression also exposed whole-header text properties/extmarks
painting over otherwise correct metadata timestamp syntax. `history.vim` now
leaves header text colors to native syntax, retaining block rails and independent
reply/mention decorations. This removes competing presentation ownership; it
adds no application/source/view/cache state or coordinator.

**Final isolated gate: typecheck/build/audit pass; 1,941 core passes / 15 optional
skips; 28/28 native cells pass, with no native skips.** The native matrix is
seven fixtures × Vim/Neovim × headless/drawn: `ui`, `history-timestamps`,
`history-syntax-buckets`, `history-features`, `reading`, `replies` and
`thread-subtrees`. Both drawn timestamp cells compare seven actual glyph colors
against a Comment reference, rather than merely inspecting syntax-group names.
The matrix also preserves exact text/full undo, theme links, per-message
Markdown/fence boundaries and native independent folding.

UI and these syntax/Markdown fixtures are now included in **both maintained
focused gates** in `scripts/verify-isolated.py`. The full shared inventory
already required UI. A new regression parses the real focused selections and
rejects UI/timestamp/bucket/Markdown omissions, headless-only downgrades and
inventory exclusions. Historical bespoke runs that omitted/fail UI remain
failure evidence, not rewritten passes.

Evidence: `/tmp/opencode/wbx-c1-timestamps-0qrieu7_/`.

- `red-matrix.json` and drawn output logs: preserved baseline fails zone-less/
  zoned fallback and actual metadata paint checks in both editors.
- `red-gate.log`: the old focused selection fails the new omission regression.
- `built-matrix.json`: initial complete 28/28 candidate matrix. The earlier
  source-only matrix's compiled-reply round trip lacked a private bundle;
  building the preserved copy fixed its setup without changing any assertion
  or timeout.
- `verified-results.json`, `verified-matrix.json`: final core/build/audit and
  full C1 headless/drawn matrix, including original UI and Markdown fixtures.
- `final-handoff-checks.json`: final documentation/fixture/audit contracts,
  immutable-copy lineage and preservation checks.

All original UI, metadata-bucket, Markdown/folding fixture inputs are
byte-identical. All backend TypeScript and the native coordinator are unchanged,
as are the ten checkout artifacts, 45 pinned SDK inputs, installed toolchain,
HEAD and staging. Original six meeting lifecycle assertion/timeout inputs are
preserved; their last six passes remain the C2 gate, not a newly claimed C1 run.
No dependencies/configuration were installed/changed, no checkout bundles were
replaced, and no running editor reload/reconnect, live-service/Atlassian action,
commit or push occurred.

This bounded gate is **not** a new all-fixture native/drawn or SDK-specific
acceptance claim. C3's mixed failure/stop cleanup and C4's complete synthetic
SDK-to-native recovery trace still require their own finite closure evidence.

## C2 closed — original metadata recovery across application-session reset

`ConversationActions` remains the mutation/recovery owner. At metadata dispatch
it binds the existing fresh self proof to the real config/OAuth-profile/account
partition, without another identity request or storage-cache adoption. Reset
clears active session maps, moving only possible-write metadata evidence into a
**disjoint retired section under the same request limit**. Late old ACKs cannot
fill active state or alter that evidence. No new service registry, timer,
persistence or mutation retry was added.

The unchanged `conversations.resolve` wire method now awaits checked recovery.
Retired evidence requires fresh authenticated self and exact partition/action/
target/original-request matching; changed account, config path, OAuth client,
redirect URI or configured scopes refuses without consuming the original
evidence. Normal metadata proof remains three GETs/one PUT. Synchronous
same-session engine/owner APIs and legacy nonmetadata recovery/reset remain
compatible. Native Team recovery uses the current checked session while
retaining the original request; late recovery callbacks remain fenced.

New regressions cover all seven metadata actions, same-partition repeated reset,
wrong request/target, token renewal, account/partition refusal, no automatic
replay, held submitted PUT and identity proof, auth failure/stop, original
active-ledger isolation, grant/expiry/physical settlement, bounded admission,
lost recovery ACK and successful subsequent deliberate work.

The native regression runs the real engine and RPC worker over stdio in both
editors. Only the first PUT per target is synthetically ambiguous. It proves
space **and** Team disconnect/reconnect → original-request resolution → one
new deliberate rename, retaining native text/full undo, themes, `breakat` and
Wnr. It forbids network/browser work and observes no message send.

Evidence: `/tmp/opencode/wbx-c2-recovery-dd7lvsul/`.
`red-owner.log`, `red-engine.log` and `red-native.json` retain baseline failures.
`candidate-tests.log` records the initial 647 scoped passes; the new native
workflow and unchanged recovery/Team boundaries pass all eight initial
headless cells in `candidate-native.json`. Final validation commands/counts and
preservation are recorded in `accepted-results.json` and
`final-handoff-checks.json`; private builds are never copied to checkout.

**Final isolated gate: typecheck/build/audit pass; 1,940 core passes / 15 optional
skips; 40 selected native cases pass (20 in each editor), zero native skips;
all six original meeting lifecycle cases pass with unchanged assertions and
timeouts.** Final-index documentation/audit/boundary checks are separately
recorded by the handoff. No graphical/device/live-media acceptance is claimed.
The first expanded typecheck caught a misnamed test helper; it was corrected
without altering production guards or any original assertion/timeout.

The audit now maps **90 bindings, 250 routines and 31 snapshot members** across
the same 30 responsibilities. **C2 alone is closed. C1, C3 and C4 remain open;
L1–L3 remain NOT RUN.** This process-local recovery lifetime covers application
session reset/reconnect, not loss/replacement of the worker process. The C2
stdio trace does not include a forked synthetic SDK, and its held-write cases
do not replace C3's mixed storage/consumer matrix.

No installed dependencies/configuration, pinned SDK inputs, checkout bundles,
original six meeting lifecycle assertions/timeouts, staging or HEAD are
replaced. No running editor reload/reconnect, live-service/Atlassian action,
commit or push is part of this fix.

## Bounded coordinator audit — exhaustive inventory and finite closure gates

The source/ownership review requested after refactor 30 is complete for
`EditorEngine`, native `autoload/wbx.vim` and bridging `EditorRPC`. It inventories
**90 declared/script/global bindings, 249 routines and 31 projected snapshot
members**, mapped exactly once to **30 responsibilities**. Immutable injected
handles and load-time scratch are explicitly distinguished from mutable
feature state; these counts are not a complexity or branch-coverage score.

See [the review and finite checklist](coordinator-audit.md) and
[per-symbol audit data](coordinator-audit.json). Each responsibility records its
owner, field lifetime, invalidation triggers, cross-layer failure trace,
positive/recovery test pointers, limitations and checklist references.
The new checker rejects missing/duplicate/stale symbols, missing evidence
anchors and snapshot-member drift, including optional spread members and
constructor-injected fields. Parser negative controls also cover hidden native
callback state and newly introduced/unmapped symbols. It is offline audit
tooling, not another runtime state registry or feature framework.

Evidence: `/tmp/opencode/wbx-coordinator-audit-itu7ko_5/`.
**`verified-results.json`: audit/typecheck zero, 46 audit/documentation/boundary
tests and 108 selected existing integration tests passing, zero skips.**
The integration selection covers startup/renewal, source failure/recovery,
revocation, output evidence barriers, shutdown, verified storage, ordinary
demo read/write/recovery routing, conversations, attachment transfer and upload
settlement. It is a bounded selection, not another full runtime rebuild or
claim that all referenced branches were executed.

### Findings, not another indefinite review

| ID | Classification | Concrete remaining exit |
| --- | --- | --- |
| C1 | Confirmed native syntax defect | Fix fallback-header timestamp highlighting; unchanged UI/metadata/Markdown assertions pass in both editors; remove UI exclusion |
| C2 | Confirmed metadata recovery-lifetime defect/limitation | Original checked request remains recoverable after same-partition backend reset/reconnect, without old-account adoption, generic reset, replay or weakening exact-request matching |
| C3 | Coverage gap, not a proven runtime defect | Controlled mixed-consumer application-failure/stop/replacement matrix proves physical settlement, retained uncertainty and successful later explicit work |
| C4 | Cross-layer coverage/diagnostic gap, not a proven runtime defect | One forked synthetic SDK → actual worker stdio → Vim/Neovim trace proves normal history, source failure/stale diagnostics, exact invalidation and explicit recovery |

Prioritize C2 recovery correctness, then C1 and the bounded C3/C4 evidence.
There is no implied further extraction programme or remaining line-count target.
Live People/reaction-return/delay attribution (L1), graphical/device/media (L2)
and operator-observed assistive readout (L3) remain **NOT RUN**, separately from
the now-complete offline inventory review. They require separate external
authorization/observations, not another implementation pass merely to leave
the audit open.

`known-ui-native.json` freshly reproduces C1 in both private headless editors:
expected `WbxMessageTime`, received `WbxMessageHeader`. These are retained
**failures**, not passing UI acceptance.

`unknown-reset-probe.json` reproduces C2 using the actual engine and
ConversationActions in the same account-free demo partition/exact room:
one injected possible-write rename is `unknown`, backend retained request/
unknown counts are **1/1**, explicit stop/start resets them to **0/0**, then
original-request recovery returns **-32035**. It makes **one simulated write
attempt, zero network requests, zero retries**. Source inspection confirms the
native owner retains unknown intents and refuses to clear them on that error.
This is not live account verification or proof of a remote outcome.

The audit corrects a broad retention assumption: backend MessageActions and
ConversationActions reset their request/uncertainty maps, while reactions and
native unknown evidence have different retention rules. Physical admission
surviving logical cancellation is yet another fact; it does not mean backend
recovery evidence survived. Existing session-isolation tests must remain intact
when C2 is fixed. C3/C4 are explicit unproven interactions, not inferred bugs.

The initial checker run exposed incomplete inventory/evidence:
the native cache-clear facade, optional `peopleViewport` snapshot member,
several reference anchors and the expected responsibility count. Those records
were corrected; the original copied failure remains. No production behavior or
original behavioral assertion changed to make the inventory check pass.

Only this index changes after validation freeze.
`final-handoff-checks.json` records final inventory/docs checks, repeatable C2
defect observation and runtime/preservation lineage. **All prior runtime inputs
are byte-identical**; all ten checkout artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging are preserved. No build/install,
live-service/Atlassian operation, running-editor reload/reconnect, commit or
push occurred. Private probe/editor processes are isolated only.

The last full runtime gate remains refactor 30's
`/tmp/opencode/wbx-architecture-meeting-status-p4tdb4z1/final-handoff-checks.json`:
**1,913 core passes / 15 skips, 216 native, 206 drawn, 71 SDK and six original
meeting lifecycle cases**. Those are historical runtime counts, not newly
rerun audit counts. The broader architecture objective is **not declared
complete**: its remaining offline closure is now the finite C1–C4 checklist,
with externally authorized acceptance listed independently.

## Architecture refactor 30 — stateless native meeting-status presentation

`autoload/wbx/meeting_status.vim` now owns detailed and compact observation-to-text
projection. It has **no state, constructor, ports, cache or session/event
registry**. Existing `wbx#meeting#compact()` remains compatible. The application
retains workspace ensure/collision handling, snapshot acquisition, guarded
native write and status redraw. Observation storage, command/recovery admission,
physical terminals and backend/media truth stay with their existing owners.

Evidence: `/tmp/opencode/wbx-architecture-meeting-status-p4tdb4z1/`.
**`verified-results.json`: all selected result codes zero on 647 frozen inputs**
— **1,913 core passes / 15 deliberate opt-in skips**, **216 selected native +
206 drawn cells**, **71 backend/SDK checks**, **38 targeted cleanup checks**
and **all six unchanged real meeting lifecycle cases**, plus TypeScript, copied
build and two-isolated-build integrity. Counts overlap; native/drawn/SDK/
cleanup/lifecycle cells have zero skips.

`focused-results.json` passes **175 native**, **154 drawn**, **382 backend
passes / six deliberate opt-in skips**, **35 boundary/performance/inventory
checks**, **38 cleanup checks** and **6/6 lifecycle cases**. Focused/full
manifests are identical. Two new fixtures use standard headless/drawn inventory
discovery; no original workflow assertion or timeout was relaxed.

### Observation versus transmission authority

- Detailed projection takes the accepted meeting snapshot, observed events and
  connection assertion. Its line wording/order, source-label/notice control
  sanitization and missing-evidence defaults are preserved. Compact projection
  moves intact behind its existing facade.
- `meeting_action` still stores latest reports, clears them on owner/active
  replacement and marks readiness false on disconnect. There is no new
  presentation-owned session/freshness policy or elapsed-time guarantee.
- A control request or RPC ACK is not transmission evidence. Missing values
  stay unknown; `awaiting`/`starting` are not confirmed sending. Preview remains
  `NOT SENT`, received audio is not microphone sending, source availability/
  presence is not sending, and bounded slots are not complete attendee/self/
  lobby coverage. Speaker layout remains fixed geometry.
- Disconnected/unready/inactive/failed/ended details retain “Last reported”
  values with explicit unknown-current-media wording, **not proof of stopped
  sending**. Active compact status hides stale sending/Rx values as unknown;
  inactive compact remains empty. Detailed control availability still follows
  transport/meeting readiness, while compact conservatively also summarizes
  failed/ended reports as unavailable. Neither string grants control authority.
- Status/refresh/Enter/write cannot recover, reconnect, rejoin or replay.
  Explicit same-owner recovery and transport rehandshake remain separate.
  Error does not retry; ACK alone does not establish readiness or transmission.
  Authoritative owner/event publications restore the ordinary projection.
- Native annotations, promotion, full undo, focus, independent windows/folds
  and options remain workspace/view responsibilities. Retained annotated detail
  may differ from current compact observations by deliberate native-edit
  policy; only explicit `WebexRefresh!` discards those edits.

The [feature guide](feature-architecture.md) documents accepted-event →
observation-owner → pure projection → guarded write tracing, extension placement,
stale/annotated versus missing-event diagnostics, and the distinct viewer-loss,
explicit media-leave and physical original-process-exit authorities.

### Positive workflows, baseline compatibility and repetitions

`meeting-status-owner.vim` records **five groups**: exact default ordering/
wording and missing evidence; every microphone/camera/screen send state; preview/
Rx separation; bounded source roles/presence/sanitization/authentication/notices;
and stale predicates/nonmutating deterministic output. It uses no application
state, transport or native write effects.

`meeting-status-workflows.vim` records **six public-workflow groups**, passing
headless and drawn in Vim and Neovim:

1. Accepted media events synchronously update detailed/compact status. Control
   ACK alone does not. Normal status/refresh/Enter/write make no extra request.
2. Preview/Rx/source/authentication/notice reports display normally and repeated
   identical redraws preserve native changedtick.
3. Backend loss retains last on-values under stale/unknown wording, hides them
   in compact status, and preserves independent native text/full undo/focus/
   folds. Unavailable recovery cannot reconnect implicitly.
4. Explicit rehandshake plus failed-then-new-deliberate same-owner recovery
   restores status only after authoritative readiness/events. No automatic
   retry, join or old-toggle replay occurs.
5. Failed/ended call reports become stale, not fabricated stopped sending.
   Messaging failure stays independent; replacement meeting ownership clears
   old observations before a new report.
6. Native annotations/promoted text and full undo survive new observations.
   Compact reflects current reports independently; explicit refresh! rebuilds
   only generated detail.

The **same unchanged public workflow fixture** also passes the preserved
baseline in both editors (`baseline-workflows-native.json`), with identical
six groups and requests: one `meeting.control`, one hello/session-start pair
and two deliberate `meeting.reconnect` attempts. This is behavior-preserving
extraction, **not a claimed new media/status correctness fix**. Workflow SHA-256:
`705be29b92bf9e05efd99e6b439c3e4a96fc5c6dce4a63f8e3de34bd8270905f`.
Physical transport/terminal effects are inert; protocol, observation, RPC/
connection and native view/write owners are real. This is not live-device,
operator-readout or service-latency acceptance.

`native-stability.json` adds **12 repeated frozen executions / 66 group passes**,
zero errors. Original meeting status/action/terminal, native chooser, picker,
delivery/textlock and consent fixtures remain separate passing gates. The first
behavioral unit gate passed; after the guide marked this slice implemented, one
static guide assertion still expected its old “Pending” row. That assertion
now requires the explicit remaining coordinator-review debt instead. The
original failed copied run is retained; no behavioral assertion was weakened.

### Audit, preservation and remaining work

`source-boundary-audit.json` matches the **whole** production delta: detailed
formatting moves with explicit input/return substitution; compact formatting
changes only namespace; its old API becomes a facade. All **133 other
coordinator functions and 183 other runtime inputs are byte-identical**.
Observation/control/recovery, protocol, native write/workspace, terminal/media,
backend/SDK and the six original lifecycle fixtures/assertions/timeouts are
unchanged. Inventory adds only the two standard fixtures.

Only this index changes after the successful final freeze.
`final-handoff-checks.json` records final headless/drawn owner/public workflows,
baseline compatibility, original regression checks, docs/inventory/boundary/
help and lineage/preservation. All ten checkout artifacts, 45 pinned SDK
inputs, installed toolchain, HEAD and staging are preserved. No dependency
install, live-service/Atlassian operation, checkout build/artifact replacement,
running-editor reload/reconnect, commit or push occurred. Private fixture
handshakes are inert-transport acceptance. The older catalogue artifact
exception and refactor 29's initial SDK startup failure remain separately
documented; this slice's full SDK gate passes 71/71.

The unrelated syntax-only UI failure remains **unfixed/excluded**, not counted
as passing: expected `WbxMessageTime`, received `WbxMessageHeader`.
Live People/reaction-return acceptance, original live-delay attribution,
graphical Kitty/device/live-media acceptance and operator-observed assistive
readout remain **NOT RUN/unverified**.

Native coordination is **1,053 lines**, down from 1,094; presentation is
61 lines, menu/compatibility shrinks **71 → 63**, and `EditorEngine` stays
1,331. This completes the concrete presentation slice, **not the whole
architecture objective**. Application composition/domain invalidation/status
selectors and broader backend coordination still need evidence-led review;
live/operator acceptance gaps remain.

## Architecture refactor 29 — native loaded-space picker coordination

`autoload/wbx/space_picker.vim` now owns detached loaded-space choice labels/
contexts, the existing latest-picker serial, exact choice admission/cancellation
and native/Vim-provider handoff. The public picker APIs and their context shape
remain compatible. Selection requests/focus, history activation, native intent/
chooser UI, Lua provider adapters and RPC correlation retain their existing
owners. No second session/request/provider registry is introduced.

Evidence: `/tmp/opencode/wbx-architecture-space-picker-_07vf8j6/`.
**`final-results.json`: all selected result codes zero on 644 frozen inputs**
— **1,912 core passes / 15 deliberate opt-in skips**, **212 selected native +
202 drawn cells**, **71 backend/SDK checks**, **38 targeted cleanup checks**
and **all six unchanged meeting lifecycle cases**, plus TypeScript, copied
build and two-isolated-build integrity. Counts overlap; native/drawn/SDK/
cleanup/lifecycle cells have zero skips. An initial full SDK startup failure
is retained separately below, not counted as a pass.

`focused-results.json` passes **171 native**, **150 drawn**, **382 backend
passes / six deliberate opt-in skips**, **34 boundary/performance/inventory
checks**, **38 cleanup checks** and **6/6 lifecycle cases**. Focused, initial
full and final full manifests are identical. Two new fixtures use ordinary
headless/drawn discovery. Original picker-safety, selection, native chooser
and Lua integration fixtures also pass unchanged.

### Context, session and request boundaries

- Capture copies already-loaded room metadata, adds type/team/cache labels and
  ordinal suffixes for truly identical labels, without appending internal IDs.
  It captures the existing native view intent; no service lookup, selection,
  receipt or application-room mutation occurs.
- A choice needs the latest picker serial, matching native context, ready
  messaging state/connection and exact membership in both captured and current
  loaded sets. Reordering/renaming cannot reinterpret a captured ID. Missing
  loaded rows are not evidence of remote deletion or permission loss.
- New capture/cancel/admission consume only their matching picker lifetime.
  Older callbacks/cancels cannot consume a newer menu. Native provider focus
  can temporarily change, but source buffer/text/target/session cannot be
  silently reinterpreted.
- Lua builtin/Telescope/fzf-lua adapters remain byte-identical. Vim optional
  fzf fallback creates a fresh context before native chooser UI. Existing
  scheduled/zero-delay callbacks allow provider UI to close, then recheck
  captured authority; they are **UI deferral, not request retry queues**.
- The port dispatches exactly `Select(id, 1, 0)`: interactive focus, receipt
  consent false. The selection owner retains its distinct asynchronous
  request/focus lifetime and channel correlation. Programmatic selection
  remains focus-neutral; ready same-space return is local and receipt-disabled.
- A focus request now captures the **existing** messaging-session ID and
  compares it before activation. This belongs in `selection.vim`, not a new
  picker session ledger. Normal loading → ready and selected-room changes
  before ACK remain valid; binding completion to the whole pre-choice context
  would incorrectly reject ordinary success.
- Existing request/window/buffer/rooms-annotation/current-ready-room/membership
  guards and history ownership/cursor/folds/setup/activation remain. RPC failure
  stays at origin; only a new deliberate pick retries. No picker choice sends,
  consents to read receipts, fetches an unlisted target or reconnects.

### Positive workflows and session-gap reproduction

`space-picker-owner.vim` records **five groups** with actual native intent and
inert application selection/provider effects: detached labels/context, exact ID
under reordering, serial/cancel rules, stale native origins and deferred numeric
fzf-row mapping. It contains only ports plus the moved picker serial.

`space-picker-workflows.vim` records **six public-workflow groups**, passing
headless and drawn in Vim and Neovim:

1. A normal public native pick opens the exact duplicate-title destination
   through one correlated selection and actual history activation, with no
   receipt even when automatic mark-on-open is enabled.
2. A ready same-space pick returns locally without fetch/receipt. Removed
   loaded identities are not guessed; after authoritative list refresh a new
   deliberate pick succeeds.
3. Selection failure leaves origin unchanged with no automatic retry. A fresh
   explicit picker recovers; duplicate old errors cannot consume its handoff.
4. Newer/canceled choices, native edits and removed IDs cannot replay or
   substitute targets; independent native text/full undo/focus remain intact.
5. Existing context guards reject session replacement before choice. The
   selection request now also rejects it after dispatch; a new-session explicit
   pick-to-open succeeds and old results cannot consume newer work.
6. Optional-provider failure falls back to a fresh native picker. A late
   callback from the failed provider cannot race/duplicate fallback success.

Each workflow records **seven `rooms.select` requests**, no receipts or other
requests; headless/drawn traces agree. Tests use actual selection/activation/
RPC/view owners with inert physical transport, real Vim popup UI and a temporary
Neovim `vim.ui.select` provider window. Optional fzf integrations use contract
doubles, **not installed third-party plugin acceptance**.

The unchanged `session-probe.vim` reproduces the baseline gap in **both
editors**: stale pre-choice contexts were already rejected, but a selection
dispatched before ready-session replacement could still open replacement
history when the same exact room ID was loaded/ready.
`baseline-session-native.json` records that behavior.
`fixed-session-native.json` and final handoff reruns reject the retired ACK,
still without receipts. All use SHA-256
`ad3781b066155dc2493a220cbcfa6556d93ea682ae1adc4f41c9adc16bcde2d2`.
Capturing/comparing the existing session in the request is the declared
correctness fix beyond mechanical extraction.

`native-stability.json` adds **12 repeated frozen executions / 66 group
passes**, zero errors. Original selection/activation/receipt, picker-safety,
native chooser, optional Lua integration, delivery/textlock and meeting/client
fixtures remain separate passing gates. The initial new workflow fixture
incorrectly mixed cached and fresh rooms; the existing protocol correctly
rejected it. The corrected fixture uses valid loaded-room eviction/refresh;
no production protocol or browse-only guard was weakened.

### Preserved initial SDK failure and unchanged full rerun

The initial full run (`verified-results.json`) passed core/native/drawn/
lifecycle checks but failed **one of 71 SDK checks**:
`private reaction IPC fails closed on reaction-hang without exposing provider data`.
The stack points to the existing **150 ms startup timer** at
`src/read-status.ts:47`, before `await start()` completed—not the intended
held-reaction rejection. The test, synthetic worker, parent and backend sources
are byte-identical to baseline. No SDK/worker source, timeout or assertion
changed, and the underlying cause of the missed startup deadline is not claimed
to have been fixed by picker work.

`sdk-startup-diagnostic.json` records three baseline and three candidate
unchanged whole-file reruns, each **8/8 passing**, no skips. The initial failure
remains preserved, not relabeled as passing. The subsequent **complete** full
gate uses exactly the same frozen inputs and passes **71/71 SDK checks** along
with all other required gates (`final-results.json`).

### Audit, preservation and remaining work

`source-boundary-audit.json` matches all **seven moved picker algorithms** and
the whole production delta: moved serial/choice/provider coordination, compatible
facades, the selection-context session scalar and captured-request comparison.
All **129 other coordinator functions and 182 other runtime inputs are
byte-identical**. Other selection functions, Lua adapters, chooser/native view,
workspace/activation, RPC, backend/SDK and all original fixtures are unchanged.
Inventory adds only the two standard fixtures.

Only this index changes after the successful final freeze.
`final-handoff-checks.json` records final headless/drawn owner/public workflows,
the unchanged session probe, original integration regression checks, docs/
inventory/boundary/help and lineage/preservation. Earlier delivery-ingress and
six-case meeting cleanup successes remain passing. All ten checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No dependency install, live-service/Atlassian operation, checkout build/artifact
replacement, running-editor reload/reconnect, commit or push occurred. The
older catalogue artifact exception remains separately documented.

The unrelated syntax-only UI failure remains **unfixed/excluded**, not counted
as passing: expected `WbxMessageTime`, received `WbxMessageHeader`.
Live People/reaction-return acceptance, original live-delay attribution,
graphical Kitty/device/live-media acceptance and operator-observed assistive
readout remain **NOT RUN/unverified**.

Native coordination is **1,094 lines**, down from 1,147; the picker owner is
75 lines, selection grows **79 → 80**, and `EditorEngine` stays 1,331.
This completes the concrete picker slice, **not the whole architecture
objective**: detailed meeting-status presentation and broader coordinator
review remain open. The [feature guide](feature-architecture.md) documents
context/session/request authority, extension boundaries and normal/failing
pick-to-open traces.

## Architecture refactor 28 — native delivery ingress and accepted-session retirement

`autoload/wbx/delivery_ingress.vim` now coordinates validated room-delivery
outcomes, echo suppression, local-clear handoff, upload/badge settlement and
notice/render/event ordering. Its object holds **ports only**. Pending and
possible-write evidence remain in `drafts`; clear/retry, send admission, bound
recovery, recipient delivery, notification tracking and RPC/backend transfer
authority remain their existing owners. No new outcome/session/request ledger
is introduced.

Evidence: `/tmp/opencode/wbx-architecture-delivery-ingress-hywodtes/`.
**`verified-results.json`: all selected result codes zero on 641 frozen inputs**
— **1,911 core passes / 15 deliberate opt-in skips**, **206 selected native +
196 drawn cells**, **71 backend/SDK checks**, **38 targeted cleanup checks** and
**all six unchanged real meeting lifecycle cases**, plus TypeScript, copied
build and two-isolated-build integrity. Counts overlap; native/drawn/lifecycle
and targeted cleanup cells have zero skips.

`focused-results.json` passes **163 native**, **144 drawn**, **382 backend
passes / six deliberate opt-in skips**, **33 boundary/performance/inventory
checks**, **38 cleanup checks** and **6/6 lifecycle cases**. Focused/full input
manifests are identical. Two new fixtures use ordinary headless/drawn inventory
discovery. No earlier delivery/consent/textlock assertion was removed or relaxed.

### Session, draft and outcome authority

The original delivery algorithm moves intact after six application ports:
`State`, `Clear`, `ProtocolError`, `Notify`, `Render` and `Event`. Draft evidence
matches request/room/parent/text/file/draft/format before any effects.
Unknown, duplicate or retired IDs do nothing; a known mismatch follows the
existing protocol-failure path without consuming pending evidence. Valid
`unknown` retains uncertainty; `failed` does not invent it. Only exact `sent`
results invoke echo suppression and guarded local clearing.

Accepted before/after state pairs now pass through stateless
`observe(previous,next)` before new-session state is committed/rendered.
Idle/failure keeps the original draft-disconnect policy. A change to the
**existing** messaging `localContext.sessionId` now also retires pending sends
through that same path, including entering/leaving session-aware operation.
Old request IDs lose settlement authority, but their possible-write evidence
is preserved. Rejected stale state cannot retire current work.

Same-session room selection, history/revision changes or readiness transitions
do not retire requests. The matched registered buffer—not current selected room
or focus—remains the local-clear target. Physical transport loss and room
revocation keep their existing draft-evidence paths. No RPC acceptance,
incomplete history or absence of a response is treated as delivery or remote
absence. No mutation retry or automatic uncertainty resolution is added.

### Positive workflows and baseline reproduction

`delivery-ingress-owner.vim` records **five groups** with actual draft matching/
uncertainty and controlled downstream effects: inert ports-only construction,
once-only ordered settlement, independent exact-match failures, unknown/failed
policy and accepted session retirement. Detached event payloads cannot mutate
the received result.

`delivery-ingress-workflows.vim` records **six public-workflow groups**, passing
headless and drawn in Vim and Neovim:

- Ordinary Enter/write remain native. Explicit plain send registers once;
  RPC success leaves text/pending intact. A matching sent delivery synchronously
  clears unchanged text and emits once. Duplicate delivery does not clear again.
- Public reply and Markdown sends preserve exact parent/format/draft matching
  and clear normally without target substitution or format downgrade.
- Same-session selection of another room preserves pending delivery. A
  background target clears only its registered buffer, leaving an independent
  foreground's native text/full undo/focus intact. Newer native edits beat an
  older valid success.
- Unknown delivery retains native text and room-wide uncertainty. A later
  duplicate cannot reinterpret that settled unknown as sent. Redraw/wait/send
  cannot auto-retry; exact-room acknowledged recovery plus a new deliberate send
  succeeds. Confirmed failure retains text and permits a new explicit attempt.
- Rejected stale replacement state leaves current pending authority untouched.
  Accepted ready-to-ready session replacement retires it into uncertainty;
  its late sent/failed outcomes cannot clear old text, emit success under the
  replacement session or release newer work. Bound recovery does not silently
  adopt an old-account draft: deliberate promotion/copy and a fresh composer
  enable a new successful send.
- Physical transport loss retains possible-write evidence and monotonic request
  identity. Explicit rehandshake, recovery and a fresh composer/send succeed;
  old outcomes cannot settle replacement work and no lost send is replayed.

Each public workflow records **12 plain sends, one Markdown send, three bound
resolution requests and one hello/session-start pair**, with **11 delivery
events**. Headless/drawn traces agree. These exercise actual native RPC/draft/
clear/recovery/presentation owners with inert physical transport only; they
are not live-service latency or notification/operator acceptance claims.

The unchanged `session-probe.vim` reproduces a baseline gap in **both editors**:
accepted ready-to-ready session replacement left an old send pending, retained
no possible-write uncertainty, then its late sent event cleared the old native
draft and emitted delivery under replacement-session state.
`baseline-session-native.json` records that behavior.
`fixed-session-native.json` and final handoff reruns retain the draft and
uncertainty while ignoring the retired outcome. All use fixture SHA-256
`672af71fc1fa812f6d1c4d024f866aee47c7a6c7566ad8ad653cfd0f2b8b5818`.
This accepted-session retirement is the declared correctness fix beyond
mechanical extraction; it does not cancel or classify the remote old write.

`native-stability.json` adds **12 repeated frozen executions / 66 group
passes**, zero errors. Existing complete native-textlock ACK, exact local-clear/
retry, bound recovery, disk-draft, rich/staged-file and native-confirmation
fixtures pass unchanged. The first copied new-fixture run already passed all
new behavioral cells; two static ownership assertions initially still pointed
at the old coordinator function. They now verify the equivalent moved
partial-port composition and clear invocation, not a weaker behavior contract.

### Audit, preservation and remaining work

`source-boundary-audit.json` matches the whole production delta: notification
dispatch relocation, the unchanged ported delivery algorithm, accepted-state
retirement and composition. All **135 other native functions and 182 other
runtime inputs are byte-identical**. Draft matching/uncertainty, send, local
clear/retry, recovery, persistence, echo tracking, recipient delivery, protocol,
RPC, uploads, backend/SDK and the previous pane-cleanup fix are unchanged.
Inventory adds only the two standard fixtures.

Only this index changes after the successful final freeze.
`final-handoff-checks.json` records final headless/drawn owner/public workflows,
the unchanged session probe, docs/inventory/boundary/help and lineage/
preservation. The six original tmux/demo lifecycle cases remain passing, so
refactor 27's cleanup resolution is retained rather than excluded again.
All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD
and staging are preserved. No install, live-service/Atlassian operation,
checkout build/artifact replacement, running-editor reload/reconnect, commit
or push occurred. Private fixture reconnects are inert transport acceptance.
The older catalogue artifact exception remains separately documented.

The unrelated syntax-only UI failure remains **unfixed/excluded**, not counted
as passing: expected `WbxMessageTime`, received `WbxMessageHeader`.
Live People/reaction-return acceptance, original live-delay attribution,
graphical Kitty/device/live-media acceptance and operator-observed assistive
readout remain **NOT RUN/unverified**.

Native coordination is **1,147 lines**, down from 1,167; the ingress owner is
39 lines and `EditorEngine` stays 1,331. This completes the concrete ingress
slice, **not the whole architecture objective**: space-picker and detailed
meeting-status presentation coordination remain open. The
[feature guide](feature-architecture.md) documents session/draft/outcome
authority, extension boundaries and normal/failing delivery traces.

## Architecture refactor 27 — owner-scoped explicit-leave pane cleanup

The full media/demo cleanup gap recorded in refactor 26 is **resolved for the
unchanged six-case isolated suite**. `CallPanes.close()` now retires its recorded
auxiliary panes when their owning call ends, rather than assuming a broker
disconnect makes viewers exit. Viewer disconnect still means **media unknown**,
not meeting ended. No native coordinator, meeting-session authority, media hard
stop or physical editor-client lifetime moved.

Evidence: `/tmp/opencode/wbx-meeting-leave-cleanup-4fnsbnkg/`.
**`verified-results.json`: all selected result codes zero on 638 frozen inputs**
— **1,910 core passes / 15 deliberate opt-in skips**, **202 native + 192 drawn
cells**, **71 backend/SDK checks**, **38 targeted cleanup/native-control checks**
and **all six real meeting lifecycle cases**, plus TypeScript, copied build and
two-isolated-build integrity. Counts overlap. Selected native, drawn, cleanup
and lifecycle cases have **zero skips**.

`focused-results.json` also passes **159 native**, **140 drawn**, **382 affected
backend checks / six deliberate opt-in skips**, **32 boundary/performance/
inventory checks**, **38 targeted cleanup checks** and **6/6 lifecycle cases**.
Focused/full manifests are identical. The full gate now explicitly requires
`WBX_EDITOR_MEETING_TEST=1`; the previously failing opt-in suite is no longer
excluded from these passing claims.

### Root cause, authority and positive workflows

- `CallPanes.close()` relied on broker closure to end its viewers. Viewer CLI
  deliberately retains its terminal on broker loss because connection failure
  cannot establish that the independent meeting/media owner stopped. Depending
  on ended-event/disconnect ordering, auxiliary view processes could remain and
  keep a call's tmux session alive.
- Cleanup stays with the owner of the existing pane records. An idempotent
  close promise retains the one-second queue-drain bound, then starts independent
  bounded cleanup of recorded **non-owner** panes. A tmux server-side
  `if-shell -F` condition verifies recorded window, PID, owner marker and source
  before scoped `kill-pane`. Tokens are format-safe. No shell command, media
  owner signal, terminal keys or whole-window/session/server kill is introduced.
- Changed, moved, retagged, respawned or missing pane identities cannot authorize
  cleanup. A child failure cannot skip its siblings. View records remain last
  observations; a failed proof or cleanup deadline is not evidence of absence.
  A physical split finishing after the drain bound hands its tagged receipt to
  the same guarded cleanup and admits no late geometry.
- `EditorMeetings.leave()` still verifies the original owner/PID and confirms
  actual process exit before acknowledging leave. Media hard-stop deadlines and
  ordinary native editor/client detach are unchanged. Cleanup does not retry
  the leave mutation or fabricate a meeting-ended event on transport loss.

`lifecycle-results.json` first passes all **six original cases**, unchanged:
meeting/presentation/reattach/leave, graphical-failure fallback, and shutdown,
each in Vim and Neovim. These use actual private tmux/demo owner/participant/share
processes, not mocked pane exits. Existing checks include control readiness,
no second owner, leave-on-exit process confirmation, pending launch cancellation,
view cleanup and unrelated-session retention. **No original assertion, runner
or timeout changed.**

`lifecycle-stability.json` adds **three independent frozen-copy runs: 18/18
lifecycle passes and 114 targeted cleanup passes**, no skips. All 18 cells
positively confirm the unrelated session survives. Focused/full gates and final
handoff separately rerun the same six cases; these overlapping counts are not
claimed as independent feature coverage.

### Baseline evidence and identity protection

`call-panes-cleanup.test.ts` adds eight deterministic regressions. All **eight
fail on preserved production baseline** with zero cancellations/skips
(`red-cleanup.log`); the identical tests pass after the fix. They cover normal
and idempotent cleanup, PID/marker/source/window/missing identity changes between
dispatch and server evaluation, independent child failure, and a physical split
finishing after the queue-drain deadline.

`real-tmux-ownership.json` runs the **same unchanged probe against baseline and
fixed production** on private sleep-backed tmux servers. Baseline leaves the
recorded owned child alive; fixed cleanup removes it. Both retain the excluded
media-owner pane, retagged recorded user work, an unrecorded foreign neighbour
in the **same window**, and an unrelated session. The final handoff repeats the
fixed probe. Probe hashes and exact before/after pane/PID/marker/source evidence
are retained; this is not merely a mock of tmux format evaluation.

Refactor 26's **six candidate failures / four baseline failures and two passes**
remain historical evidence, with copied logs/hashes. One later standalone
baseline demo probe happened to clean successfully after 2.2 seconds
(`baseline-leave-probe.json`); it is **not** claimed as a failing reproduction.
Deterministic red tests, the real ownership probe and earlier lifecycle failures
establish the gap. `meeting-cleanup-resolution.json` links that provenance to the
new unchanged-suite successes rather than relabeling earlier failures.

### Scope and preservation

`source-boundary-audit.json` matches the complete production delta: one close
promise, guarded auxiliary cleanup and the late-split handoff. All **14 other
`CallPanes` methods and 182 other runtime inputs are byte-identical**. Native
coordination stays **1,167 lines** and `EditorEngine` **1,331**; `call-panes.ts`
grows **325 → 345** to implement the missing physical responsibility. No second
pane/session registry is added. The feature guide documents separate media/
view cleanup authorities, extension boundaries and leave-failure tracing.

Only this acceptance index changes after the final freeze.
`final-handoff-checks.json` records final isolated cleanup/lifecycle, native/
drawn meeting/client workflows, real ownership probe, docs/inventory/boundary/
help and lineage/preservation checks. All ten current checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No dependency install, live-service/Atlassian operation, checkout build or
artifact replacement, running-editor reload/reconnect, commit or push occurred.
The older catalogue artifact exception remains separately documented.

The known unrelated syntax-only UI failure remains **unfixed/excluded**, not
counted as passing: expected `WbxMessageTime`, received `WbxMessageHeader`.
Live People/reaction-return acceptance, original live reaction-delay
attribution, graphical Kitty/device/live-media acceptance and operator-observed
assistive readout remain **NOT RUN/unverified**. Private headless tmux/demo
success is not live-media acceptance.

This completes the concrete cleanup slice, **not the architecture objective**:
space-picker, delivery-ingress/application and detailed meeting-status
presentation coordination remain open.

## Architecture refactor 26 — independent native meeting action/request lifetime

`autoload/wbx/meeting_action.vim` now owns independent meeting observations,
explicit start/present/control/upcoming/recovery actions, local view intent and
the single pane request. Five existing coordinator fields and the menu's
existing pending/serial fields move into that owner; no parallel registry or
messaging/session counter is introduced. `meeting.vim` retains bounded menu
construction/compact presentation; `transport.vim` retains physical terminal
jobs/buffers/generations. Public commands/getters/view callbacks stay compatible.

Evidence: `/tmp/opencode/wbx-architecture-meeting-actions-tzxg744z/`.
**`verified-results.json`: all selected result codes zero on 637 frozen
sources** — **1,901 core passes / 15 deliberate opt-in skips**, **202 selected
native + 192 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. `focused-results.json` passes **159 native**, **140
drawn**, **345 affected backend checks / six deliberate opt-in skips** and
**31 boundary/performance/inventory checks**. Focused/full input manifests are
identical. Three new fixtures use ordinary headless/drawn inventory discovery.
The broader opt-in media/demo cleanup suite is **not included in these passing
claims**; its failures are recorded below.

`meeting-action-observations.json` records **seven owner groups**, **six
public-workflow groups** and **three real-terminal-client groups**, passing
headless and drawn in Vim and Neovim:

- Construction is inert. Explicit start keeps live/demo/link/config/headless
  and prompt-cancellation policy. Dispatch alone is not authoritative meeting
  readiness. A subsequent accepted meeting publication enables ordinary
  presentation and pane success without requiring messaging readiness.
- Observation changes retain the existing meeting epoch and event-key rules.
  Owner/active replacement clears stale media evidence; readiness-only changes
  keep last observations as stale. Public getters are detached copies. A
  control request is not confirmed transmission: only accepted observations
  update reported microphone/camera/share state.
- Meeting ingress preserves detach → render → optional terminal attach → event
  ordering. Local detach/manual close and shutdown closing intent suppress
  automatic attach; explicit editor presentation focuses the physical client
  first. Neither view closure nor editor exit implies the call ended.
- Exact native picker intent, captured meeting epoch and revision-paired
  source/layout envelope still guard pane dispatch. Unavailable/stale slots
  cannot be reinterpreted as another target. A normal same-owner pane-revision
  publication before its ACK remains valid; fencing on every epoch would
  incorrectly reject ordinary success.
- Exact session/revision/action/status response checks and applied/refused/
  unknown notices remain. Errors, refusal and unconfirmed outcomes do not
  automatically retry mutations. A fresh deliberate request recovers.
  Synchronous replies settle correctly; dispatch refusal releases only its
  captured serial.
- Meeting owner replacement retires the old logical pane request before fresh
  explicit replacement work is admitted. Its late ACK cannot report replacement
  success, validate a retired malformed body or release a newer pending request.
  Messaging idle/failure/session replacement remains **independent** and cannot
  retire a dispatched meeting ACK.
- Transport loss retires request authority and marks meeting controls unready
  while retaining the last active owner as unverified. Explicit rehandshake and
  exact-session reconnect recover without rejoin, toggle or auth replay.
  Malformed current ACKs still use the original protocol-disconnect path.
- Native independent text, full undo, focus and options survive meeting-only
  actions. The fixture explicitly restores that native view after its deliberate
  messaging workspace reconnect command before checking later meeting-only
  effects. Detailed status retains stale/unknown/NOT SENT semantics.

Each public workflow records **one explicit synthetic meeting start, 12 pane
requests, two presentation requests, one control, one bound reconnect and two
hello/session-start pairs**. Headless/drawn traces agree. It uses real native
RPC/observation/intent/view/status owners with inert backend/terminal effects,
not a live meeting.

### Real terminal boundary and baseline pane-result gap

`meeting-terminal-owner.vim` retains the **actual unchanged terminal/tmux client
implementation**, replacing only backend I/O in a private runtime. Two isolated
sleep-only owner panes provide positive session/PID/attached-count evidence:
one client attaches/reuses without focus theft, explicit detach/reattach changes
only client generation, an explicitly invoked retired exit callback cannot close
the newer client, and meeting replacement switches clients. Closing/shutdown
leave both owner processes alive. The same fixture also passes on the preserved
baseline in both editors (`baseline-terminal-native.json`). It certifies scoped
client behavior, not media/device or full media-owner teardown.

The unchanged `session-probe.vim` reproduces a baseline gap in both editors:
after meeting-owner replacement, the old pending pane request blocked a new
owner's request, then its late ACK still reported “applied.”
`baseline-session-native.json` records it; `fixed-session-native.json` and final
handoff reruns admit a fresh replacement request and ignore the retired ACK.
The probe SHA-256 remains
`f083a3d5c276d5b4ad3edd9f67441f25587c38d67edb7edb07d8c59a2bd56324`.
Retirement uses the **existing owner/active transition and monotonic serial**;
it does not replay/cancel the old remote operation or infer its absence. This
is the declared correctness change beyond extraction.

`native-stability.json` adds **18 repeated frozen executions / 96 check-group
passes**, including real client jobs, with zero errors. Existing meeting menu/
upcoming/native chooser, textlock ACK, image and draining-sink fixtures pass.
The native chooser fixture only adapts its application seam to the moved owner;
all its prior assertions remain. Initial new-fixture failures used an aliased
test snapshot and an invalid idle-state local-context envelope; another fixture
assumed an explicit workspace reconnect could not change focus. Corrected
fixtures keep protocol/intent/focus guards intact; no production guard was
relaxed.

### Unresolved optional full media/demo cleanup acceptance

Historical status at refactor 26; subsequently resolved for the unchanged
offline suite by refactor 27 above. The original failures below remain intact.

The existing opt-in `test/editor/meeting.test.ts` suite was also attempted with
actual isolated tmux/demo media-owner/client processes. **It did not pass.**
`physical-reviewed.log` records **six candidate failures**, all at final
leave/session-cleanup waits. `physical-baseline.log` records **four baseline
failures / two passes**, including the same both-editor main meeting cleanup
wait and a lingering view-pane cleanup assertion. The cause is **not
established**; not every individual candidate failure is claimed to have an
identical baseline reproduction.

`physical-media-cleanup-gap.json` preserves counts, hashes and scope. No
backend, physical transport or existing media-suite assertion was changed.
These failures remain **unresolved, excluded and not relabeled as passing**.
Passing synthetic/native-client tests do not certify full media teardown,
live media latency, graphical Kitty acceptance or operator-observed readout.

`source-boundary-audit.json` matches **all 15 moved algorithms**, the whole
coordinator/menu deltas and the unchanged status projection after getter
composition. **114 other coordinator functions and 180 other runtime inputs
are unchanged**. Native terminal jobs/generations, protocol/RPC/connection,
backend/SDK implementations and existing meeting/upcoming/media-suite fixtures
are byte-identical. Inventory adds only the three standard fixtures.

The unrelated syntax-only `test/editor/ui.vim` failure also remains **unfixed
and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its prior both-editor provenance and unchanged inputs are
carried forward.

Only this index changes after the successful final freeze.
`final-handoff-checks.json` records isolated owner/public/real-client reruns,
the unchanged session probe, docs/inventory/boundary/help and lineage/preservation.
All ten observed checkout artifacts, 45 pinned SDK inputs, installed toolchain,
HEAD and staging are preserved. No install, live-service operation, checkout
build/replacement or running-editor reload/reconnect occurred. Private fixture
reconnects and isolated tmux processes are synthetic acceptance only. The
earlier catalogue artifact exception remains separate. Live People/reaction
acceptance, original live-delay attribution and assistive readout remain
**NOT RUN/unverified**.

Native coordination is **1,167 lines**, down from 1,209; the action owner is
166 lines and `meeting.vim` shrinks **108 → 71**. `EditorEngine` stays 1,331.
This is **not completion of the architecture goal**: space-picker,
delivery-ingress/application and detailed meeting-status presentation
composition remain, alongside the unresolved full media-cleanup gap. The
[feature guide](feature-architecture.md) documents extension, independent
meeting/session authority, logical versus physical ownership and failure traces.

## Architecture refactor 25 — image preview/open request lifetime

`autoload/wbx/image_request.vim` owns visible-preview attempts and explicit
image-open orchestration behind the unchanged public entrypoints. The three
existing fields—attempts, room and shared busy admission—move out of the
coordinator. Busy now holds one **identity-bound reservation**, not a second
flag/registry. Legacy attachment fallback acquires/releases the same reservation.
Image bytes, rendering, snapshots, external/private-file leases, backend
physical admission and RPC correlation keep their existing owners.

Evidence: `/tmp/opencode/wbx-architecture-image-requests-p68m0zi_/`.
**`verified-results.json`: all selected result codes zero on 633 frozen
sources** — **1,900 core passes / 15 deliberate opt-in skips**, **194 selected
native + 184 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. `focused-final-results.json` passes **150 native**,
**130 drawn**, **280 affected backend checks / six deliberate opt-in skips**
and **30 boundary/performance/inventory checks**. Focused/full checkout input
manifests are identical. Both new fixtures use ordinary inventory discovery in
headless/drawn modes.

`image-request-observations.json` records **five standalone owner groups** and
**six public-workflow groups**, passing in Vim and Neovim:

- Default-on visible previews dispatch one read, accept backend-published state
  and render ordinary history images. Explicit `images=0`/`false` keeps automatic
  reads at zero. Connection, source, attachment intent, viewport/fold and
  16-attempt room limits remain independent. Failed/refused previews do not
  silently retry the same message; explicit high-resolution opening can recover.
- Ordinary explicit opening materializes a native viewer and captures the
  existing generation/room/message stamp. Clean same-source history reuse and
  viewer-local reuse perform **zero fetches**. Another message or generation
  sharing the same image ID requires a new deliberate read.
- Viewer-local clean snapshots remain usable after their source session ends;
  they cannot reselect a destination. History reuse requires exact source
  identity and clean ownership. Native annotations and full undo are preserved.
  A matching same-source annotation conflict is rejected locally without a
  needless buffer-mode refetch. Deliberate rename/promotion and a fresh explicit
  open recover normally.
- Read dictionary identity fences callback settlement before scheduling or
  interpreting stale output. Equal dictionary contents are not release
  authority. Old explicit/preview/legacy-fallback callbacks cannot release a
  newer image read or authorize a protocol failure in replacement work.
- Captured generation, exact current source and existing window/buffer/message
  guards reject retired data. A same-ID accepted session replacement resets the
  old request/attempt lifetime, using the existing attachment generation rather
  than a new session counter. A fresh current-session open succeeds.
- Unified legacy attachment fallback shares image admission and now stamps its
  accepted snapshot. Same-source fallback reuse performs no second fetch;
  simultaneous explicit opens remain blocked. Typed attachment intent, physical
  sink draining and backend content admission remain separate.
- RPC refusal/error and wrong image identity preserve existing notification/
  protocol-disconnect contracts. No send, mark-read or automatic open retry is
  introduced. Explicit reconnect/open succeeds; independent annotations remain.

Each public workflow records **two preview requests and 11 explicit image-open
requests**, plus one synthetic hello/session-start pair. Headless/drawn traces
agree. Public workflows use real RPC/state/view/render/protocol/image owners
with inert physical transport only. Standalone tests control request/image
effects and exercise the actual legacy attachment fallback.

Both drawn editors prove all **16** preview attempts. Vim's headless Ex mode
can invalidate its native viewport after a callback (`line('w$') == 0`); that
case verifies no further invisible auto-read instead of fabricating visibility.
Normal positive loading/open/recovery still runs headless in both editors.

### Reproduced source gaps and declared fixes

The unchanged synthetic `source-probe.vim` reproduces two baseline gaps in both
editors: held bytes opened after a same-ID messaging-session replacement, and
another message sharing an image ID reused an unrelated history snapshot.
`baseline-source-final-native.json` records both; `fixed-source-final-native.json`
and final handoff reruns reject both. All record the same fixture SHA-256:
`6e39d0a0f830ce1d97811f8171ea1e48176bde28aca49c8e8b764fd3f0703204`.
Existing source metadata/generation is captured and compared, not duplicated.
Identity-bound busy settlement additionally replaces unconditional shared-flag
release; owner/public tests prove newer admission survives late callbacks.

`native-stability.json` adds **12 repeated frozen executions / 66 check-group
passes**, with zero errors. The original **six-read** image-opening regression,
external/terminal native-hook safeguards, renderer, typed/chunked attachments,
stubborn draining sink, delivery textlock and native-confirmation fixtures pass.
The original image-opening fixture changes only its private callback-settlement
inspection to the moved owner; all six-read/zero-auto-read assertions remain.
The existing attachment-owner fixture only adapts its shared-port signature/
return value; no prior assertion is removed.

Initial fixture viewport assumptions and an initial extra seventh Vim image
read were not accepted. The latter traced to refetching a matching edited
snapshot; local conflict preflight restored the original six-read contract
without weakening source/annotation guards. One initial drawn Vim reading
assertion also failed. `reading-diagnostic.json` records two unchanged baseline
and two candidate reruns passing; final focused/full gates pass that fixture.
The initial failures remain preserved, not counted as passes.

`source-boundary-audit.json` matches the complete moved preview/open/response
algorithms after ports and the declared identity/source/local-conflict changes.
The whole coordinator diff is the state relocation, compatible facades,
lifecycle fencing, shared attachment bridges and composition. **124 other
native functions and the other 179 runtime inputs are unchanged**. Attachment
changes are confined to legacy image fallback token/source/reuse handling.
Image data/rendering/snapshot/lease/file/sink/protocol/RPC implementations and
all backend/SDK implementations are byte-identical. Inventory adds only the two
fixtures; the drawn driver is unchanged.

The unrelated syntax-only `test/editor/ui.vim` failure remains **unfixed and
not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its prior both-editor baseline/candidate provenance and
unchanged fixture/history inputs are carried forward.

Only this index changes after the successful final freeze.
`final-handoff-checks.json` records isolated owner/public headless/drawn reruns,
the unchanged source probe, docs/inventory/boundary/help and lineage/preservation.
All ten observed checkout artifacts, 45 pinned SDK inputs, installed toolchain,
HEAD and staging are preserved. No install, live service operation, checkout
build/replacement or running-editor reload/reconnect occurred. The earlier
catalogue artifact exception remains separate. Live People/reaction-return
acceptance, original live-delay attribution and operator-observed assistive
readout remain **NOT RUN/unverified**.

Native coordination is **1,209 lines**, down from 1,303; the image request owner
is 150 lines. `attachment_open.vim` is 300 lines; `EditorEngine` stays 1,331.
This is **not completion of the architecture goal**: meeting/picker and
delivery-ingress/application integration remain open. The
[feature guide](feature-architecture.md) documents extension boundaries, shared
logical versus physical admission, source-qualified reuse and failure tracing.

## Architecture refactor 24 — attachment-open/cancellation lifetime

`autoload/wbx/attachment_open.vim` now owns the cohesive explicit attachment
action: exact source/chooser selection, typed inline/chunked and legacy/image
dispatch, response validation/handoff, cancellation and lifecycle fencing. Its
four state fields are the existing logical busy, serial, owner generation and
intent moved from the coordinator—not a new registry. Physical sinks, private
files/leases, handler jobs, image snapshots and RPC correlation keep their
existing owners. All public attachment and stream callbacks remain compatible.

Evidence: `/tmp/opencode/wbx-architecture-attachment-open-90solajk/`.
**`verified-results.json`: all selected result codes zero on 630 frozen
sources** — **1,899 core passes / 15 deliberate opt-in skips**, **186 selected
native + 176 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The focused gate passes **144 native**, **122
drawn**, **280 affected backend checks / six deliberate opt-in skips** and
**29 boundary/performance/inventory checks**. Both new fixtures use ordinary
native inventory discovery in headless/drawn modes.

`attachment-open-observations.json` records **eight standalone owner groups**
and **six public-workflow groups**, passing in Vim and Neovim:

- Ordinary typed inline resolution passes exact original bytes and the same
  context dictionary to file materialization. Public inline and chunked reads
  use real bundled private helpers, produce exact native text, preserve native
  file safety options and release their physical helpers normally. Earlier
  user annotations and their full native undo remain intact.
- Typed/chunk selection retains exact room/message/attachment/action/settings,
  selectors, request bounds and original-versus-PNG policy. Chunk sink preflight
  still precedes remote resolution; completion passes metadata/context to the
  physical owner without reconstructing aggregate bytes in the action.
- Read errors, refused dispatch and local handler/materialization failures
  release logical admission through their existing paths without automatic
  retry or policy downgrade. A later explicit open succeeds.
- Movement/settings cancellation revokes shared context before local cleanup
  and sends at most one cancel for the original request ID when already
  connected. Offline cancellation never starts RPC. A late old response,
  failure or handoff cannot release newer attachment admission or steal focus.
- Physical file/sink busy—including draining—continues to block replacement
  independently of logical busy. Terminal validity deliberately does not
  require current focus, but keeps generation, revocation, selected room,
  settings and source ownership/edit checks. Existing legacy validity remains
  compatible.
- Legacy original dispatch still works; wrong typed identity remains a
  protocol failure, not fallback. Chooser callbacks retain exact ordered file
  identity and native intent; changed rows/files cannot reinterpret a choice.
- Physical transport replacement preserves monotonic RPC identity and
  generation fencing. Malformed metadata follows the original protocol
  disconnect; managed history truthfully repaints disconnect state, while
  independent user annotations remain unchanged. Explicit reconnect/open
  recovers normally.

Each public workflow records **14 explicit resolve requests, seven successful
materialized native views, one chunk pull and one chunk completion** across
its scenarios. Headless/drawn traces agree. The public fixture uses real
protocol/view/RPC/action and file/chunk helpers with inert transport only.
Standalone tests keep policy/protocol/view primitives real while controlling
physical effects and application ports. No remote service or external handler
is launched by the new fixtures.

### Baseline same-ID session gap, now fixed

The targeted session probe found a pre-existing admission gap: after accepted
messaging-session replacement, a held typed attachment result could still open
if ready state, room/message/attachment IDs and source row remained unchanged.
`session-replacement-baseline.json` reproduces it on **both preserved baseline
and pure extraction, in both editors**, using synthetic bytes and real local
materialization. The extraction itself first passed the existing legacy/typed/
chunk/draining/image smoke gates without changing those algorithms.

The existing application state/session-transition branch now calls the moved
stop operation before accepting replacement state. It revokes the old intent
and advances its existing generation/serial, without adding session state or
relaxing physical admission. `session-replacement-fixed.json` and final handoff
reruns use the **unchanged probe**: the retired result no longer opens in either
editor. The public workflow separately proves that a fresh explicit read in the
replacement session succeeds. This is the declared correctness change beyond
the mechanical ownership extraction, not a baseline failure relabeled as pass.

`native-stability.json` adds **12 repeated frozen executions / 84 check-group
passes**, with zero errors. Existing `attachments`, `typed-attachments`,
`chunked-attachments`, `chunked-faults`, `chunked-lifetime` and `image-opening`
fixtures run unchanged in both editors. They retain real download/handler/image
and single-fetch checks, chunk integrity/credit/completion checks and stubborn
sink admission across cancellation/disconnect/replacement until actual helper
exit. Complete-ACK textlock, persistence, delivery recovery and native
confirmation regressions also pass unchanged.

Initial new-fixture failures used a lowercase Funcref variable and expected
generated history to remain byte-identical after a protocol disconnect. The
fixture now uses a valid Funcref name, asserts truthful disconnect presentation
and independently checks user annotation/full-undo preservation. Those logs are
retained; no production admission guard was relaxed.

`source-boundary-audit.json` matches **all 14 moved algorithms** after explicit
ports/state relocation and matches the original distinct prepare/lost/stop/
selection cleanup order. The whole coordinator diff is declared state/algorithm
relocation, compatible facades, narrow shared-image bridges/selectors,
composition and the explicit session-revocation hook. **114 other native
functions and the other 179 runtime inputs are unchanged**. File/sink/local-job/
terminal/image/snapshot/protocol/RPC implementations, all backend/SDK inputs
and existing attachment fixtures are byte-identical. Native inventory adds only
the two fixtures; the drawn driver is unchanged.

The unrelated syntax-only `test/editor/ui.vim` failure remains **unfixed and
not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Both-editor baseline/candidate provenance is carried
forward; fixture/history syntax/implementation inputs are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated headless/drawn owner/public reruns,
the unchanged session probe, docs/inventory/boundary/help, source-lineage and
preservation checks. All ten observed checkout artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging are preserved. No install, live service
operation, checkout build/replacement or running-editor reload/reconnect
occurred. The earlier catalogue artifact exception remains separate. Live
People/reaction-return acceptance, the original live delay attribution and
operator-observed assistive readout remain **NOT RUN/unverified**.

Native coordination is **1,303 lines**, down from 1,539; the attachment action
owner is 299 lines. `EditorEngine` stays 1,331 lines. This is **not completion of
the architecture goal**: image preview/open, meeting/picker and delivery ingress/
application integration remain open. The [feature guide](feature-architecture.md)
documents feature extension, action-versus-physical ownership, session
revocation and ordinary open/failure/cancellation tracing.

## Architecture refactor 23 — destination-bound delivery recovery request

`autoload/wbx/delivery_recovery.vim` now owns the explicit selected-room
resolution request and its guarded response callback behind unchanged
`wbx#resolve_delivery()` / `:WebexResolveDelivery`. Six ports supply current
state, support, request dispatch, protocol failure, redraw and notice. The
owner stores **ports only**; callback-local room/intent/evidence remains the
request lifetime. Draft uncertainty, durable persistence, RPC correlation,
delivery ingress, sending and native clearing retain their existing owners.
No pending/session registry, timer, single-flight rule or retry policy is added.

Evidence: `/tmp/opencode/wbx-architecture-delivery-recovery-rrohbxa0/`.
**`verified-results.json`: all selected result codes zero on 627 frozen
sources** — **1,898 core passes / 15 deliberate opt-in skips**, **170 selected
native + 160 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The focused gate passes **128 native**, **106
drawn**, **170 backend/send-related checks / six deliberate opt-in skips** and
**28 boundary/performance/inventory checks**. Both new fixtures run through
ordinary native inventory discovery, headless and drawn in both editors.

`delivery-recovery-observations.json` records **six standalone owner groups**
and **six public-workflow groups**, passing in Vim and Neovim:

- Normal explicit recovery dispatches exactly `delivery.resolveBound` with the
  captured selected room. Dispatch alone does not resolve uncertainty. A
  well-shaped, exact-room ACK with unchanged native intent/evidence resolves
  only that room and observes persistence, preserving native text/full undo,
  attachment, format, focus and options. A later deliberate send succeeds and
  clears only on its normal matching delivery.
- Persistence readiness, selected-room presence, negotiated support and
  same-room pending admission stay independent and in their original order.
  Another room's pending send does not become a global recovery block. Explicit
  backend recovery with zero local evidence remains compatible; missing local
  uncertainty is not interpreted as proof of remote absence.
- Refused dispatch and RPC errors retain uncertainty without redraw/persistence
  cleanup or automatic retry. A later explicit request and a synchronous valid
  response both recover normally. Channel error notification/correlation is
  not duplicated in the feature owner.
- Null/list/missing/wrong-type results, a wrong room or extra ACK keys report
  protocol failure without resolving. The public wrong-room ACK follows the
  actual protocol-disconnect path; explicit reconnect/recovery and a fresh
  deliberate send work afterward.
- Changed native text/revision, format, parent, selected room, session, epoch,
  readiness, ownership/name or leave-and-return rejects the old callback before
  interpreting its result. Stale ACKs cannot clear another room or newer native
  work. A current explicit request succeeds without overwriting the retained
  draft.
- New uncertainty evidence for the same room defeats an older ACK even with
  identical native intent. Persistence is notified only after successful
  `drafts#resolve(room, evidence)`; the existing redraw-after-valid-ACK behavior
  remains intact even when that comparison refuses. A controlled newer
  uncertainty observation isolates this guard rather than accidentally relying
  on a text/intent change.
- Duplicate RPC replies cannot invoke retired callbacks or erase later
  uncertainty. Messaging-session replacement rejects old intent; physical
  transport replacement retires old correlation and keeps IDs monotonic.
  Neither replacement replays resolution. Fresh explicit current-session
  recovery succeeds.

Each public workflow records **16 explicit bound-resolution requests and 10
explicit inert send records** across its six scenarios. Headless/drawn traces
agree. Resolution itself never sends, clears text, marks read, invokes legacy
unbound reset or automatically retries. All transport/service effects are
synthetic, not live delivery checks.

`public-baseline-compatibility.json` runs the **same unchanged additive public
fixture on the preserved pre-extraction baseline in both editors**, with the
same six successful groups and method trace. `native-stability.json` adds
**12 repeated frozen candidate executions / 72 check-group passes**, with zero
errors. Standalone tests use real native intent and draft evidence with
controlled persistence readiness/observation; public workflows use real
RPC/intent/draft/persistence/render/protocol owners and inert physical transport.
Initial Vim fixture failures used the read-only name `count`; corrected fixture
locals use `request_count`, with no production guard changes.

`source-boundary-audit.json` proves **134 other native coordinator functions
and the other 178 runtime inputs unchanged**. The whole coordinator diff is
the public facade, current-state getter and explicit owner composition. Both
complete request and callback algorithms match the baseline after delegation:
readiness/admission, intent/evidence capture, fixed bound wire request,
error/stale-intent precedence, exact ACK schema/room, evidence comparison,
persistence observation and redraw. Existing delivery ingress, send/clear,
uncertainty/view/persistence primitives, RPC/transport/session lifecycles,
textlock-safe presentation and all backend implementations are byte-identical.
The inventory adds only the two fixtures; the drawn driver is unchanged.

Existing delivery-resolution, local-clear, persistence, send, complete-ACK
textlock and 50-dialog native-confirmation regressions pass unchanged in both
editors. Refactor 22's renderer E565 fix remains intact; its original failure
provenance and unchanged archived reproduction evidence remain in the preceding
acceptance record.

The unrelated syntax-only `test/editor/ui.vim` failure remains **unfixed and
not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate provenance is carried
forward; fixture/history syntax/implementation inputs are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated headless/drawn owner/public reruns,
baseline compatibility, docs/inventory/boundary/help, source-lineage and
preservation checks. All ten observed checkout artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging are preserved. No install, live service
operation, checkout build/replacement or running-editor reload/reconnect
occurred. The earlier catalogue artifact exception remains separate. Live
People/reaction-return acceptance, the original live delay attribution and
operator-observed assistive readout remain **NOT RUN/unverified**.

Native coordination is **1,539 lines**, down from 1,555; the recovery owner is
32 lines. `EditorEngine` stays 1,331 lines. This is **not completion of the
architecture goal**: delivery ingress and broader native/application action
integration remain open. The [feature guide](feature-architecture.md) documents
recovery extension boundaries and tracing through admission, intent, exact ACK,
uncertainty evidence, durable observation and presentation.

## Architecture refactor 22 — textlock-safe presentation without ACK replay

`autoload/wbx/render_request.vim` now owns a single coalesced presentation
request around the original rooms/history render effect. Unlocked rendering
remains synchronous; native **E565 only** defers presentation. Deferred work
reads current state, never a captured snapshot or ACK. Delivery correlation,
uncertainty, existing local-clear/retry rules, upload retirement and event
publication keep their original owners and are not replayed.

Evidence: `/tmp/opencode/wbx-architecture-render-textlock-uarn2vew/`.
**`verified-results.json`: all selected result codes zero on 624 frozen
sources** — **1,897 core passes / 15 deliberate opt-in skips**, **166 selected
native + 156 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The focused gate passes **124 native**, **102
drawn**, **170 backend/send-related checks / six deliberate opt-in skips** and
**27 boundary/performance/inventory checks**. Both new fixtures use ordinary
native inventory discovery in headless/drawn modes.

`delivery-render-observations.json` records **six standalone request-owner
groups** and **five complete-ACK workflow groups**, passing in both editors,
headless and drawn:

- Normal rendering stays synchronous with no retained work/timer. Real native
  expression-mapping E565 coalesces repeated requests into one timer. On release,
  the latest projection renders rather than pre-lock captured text; foreground
  text/full undo/focus/options remain intact.
- Interrupted native writes restore prior `modifiable` instead of leaving a
  managed projection editable. Only renderer status/draft signatures are
  invalidated; projection authority and successful-write metadata stay with the
  existing renderer/view owners.
- Request dictionary identity, timer identity and existing session/state/
  disconnect context fence deferred work. Cancellation and reentrant replacement
  cannot release or overwrite a newer request. A session transition cancels
  retired work; replacement rendering reads only its current state.
- Continued lock exhausts the initial attempt plus three deferred 10 ms
  presentation attempts, warns and releases work. A later explicit local redraw
  recovers without fetching or resending. Custom errors and native non-E565
  `E121` still propagate without stranding a reservation.
- Complete `sent` ACK callbacks now return under real native textlock, retire
  pending admission and publish one delivery event. Existing local-clear timers
  and the new presentation timer settle without another send. Deferred rendering
  removes stale sending presentation; duplicate ACKs publish nothing further.
- Native text returned by the expression mapping after ACK beats deferred
  clearing. Current native text, full undo and focus survive the later redraw.
- Complete `unknown`/`failed` ACKs under textlock retain native work and original
  uncertainty policy. Unknown delivery still blocks resend until explicit
  exact-room acknowledged bound recovery; a later deliberate new send succeeds.
  No automatic resolution, retry or duplicate event is introduced.
- Replacement while a redraw is pending cancels retired rendering/clear
  authority. Even an explicitly invoked stale timer callback cannot affect new
  work. Old-account draft guards remain intact; deliberate native promotion and
  a fresh public composer allow new-session success. Late duplicate ACKs do not
  release replacement pending admission.

Each complete-ACK workflow records **eight explicit inert sends, eight delivery
events and one explicit bound resolution**. Duplicate ACKs remain ignored.
These are synthetic transport records, not service operations. Under textlock,
the synchronous delivery event can precede the eventual repaint; accepted
state, not buffer timing, remains authoritative.

**The renderer E565 limitation recorded in refactor 21 is fixed.** The exact
unchanged archived full-ingress fixture now passes in both editors: **six
workflow groups, 11 inert sends, 13 local write attempts, real native textlock
observed and zero errors**. Its SHA-256 remains
`45417d8ed7555296fadbff407905bcff3f095318b193f372668e43864445c1db`.
`original-reentrant-regression.json` retains the first passing candidate proof;
`resolved-renderer-textlock.json` records final frozen-candidate reruns and the
historical both-editor baseline failure provenance. Earlier failure logs and
the refactor-21 acceptance record remain intact, not relabeled as passes.

`native-stability.json` adds **12 repeated frozen headless executions / 66
check-group passes**, with zero errors. Existing local-clear, persistence, send,
upload, renderer/view and 50-dialog native-confirmation fixtures also pass
unchanged. The initial owner report flag was overwritten by a later intentional
reentrancy scenario despite the textlock assertion passing; the final fixture
retains the separately verified real-textlock observation. No production guard
was relaxed.

`source-boundary-audit.json` proves **128 other native functions and the other
175 runtime inputs unchanged**. The original render effect is byte-identical
after its private rename. The coordinator diff adds only its request wrapper,
current-context port, composition and lifecycle cancellation. ACK ingress,
delivery events, send, bound recovery and local clear are unchanged. Renderer
changes only add signature invalidation; view changes only restore writability
on interrupted replacement. All backend, SDK, draft, upload and transport
implementations remain unchanged. No second outcome/session registry is added.

The unrelated syntax-only `test/editor/ui.vim` failure remains **unfixed and
not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Both-editor baseline/candidate provenance is carried
forward; its fixture/history syntax/implementation inputs are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated headless/drawn owner and complete
ACK reruns, unchanged archived reproduction, docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue artifact exception remains
separate. Live People/reaction-return acceptance and operator-observed
assistive readout remain **NOT RUN/unverified**; offline native tests do not
certify live latency or the original live reaction-delay cause.

Native coordination is **1,555 lines**, from 1,541; the presentation-request
owner is 54 lines. `EditorEngine` stays 1,331 lines. This correctness slice adds
a bounded presentation lifetime rather than deferring a whole delivery action.
It is **not completion of the architecture goal**: delivery ingress/bound
recovery and broader native/application action integration remain open.
The [feature guide](feature-architecture.md) documents presentation extension,
current-state tracing, bounded explicit recovery and event/repaint ordering.

## Architecture refactor 21 — successful-delivery local clear and retry

`autoload/wbx/delivery_clear.vim` now owns the exact successful-delivery native
draft clear and its bounded local-only timer continuations. Four ports supply
current state, guarded native write, redraw and notice. The owner stores ports
only; each continuation retains the original acknowledged evidence, captured
session and remaining budget. It cannot send, correlate deliveries, retire
uploads or resolve uncertainty.

Evidence: `/tmp/opencode/wbx-architecture-delivery-clear-s70uu1v9/`.
**`verified-results.json`: all selected result codes zero on 621 frozen
sources** — **1,896 core passes / 15 deliberate opt-in skips**, **162 selected
native + 152 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The final focused gate passes **120 native**,
**98 drawn**, **170 backend/send-related checks / six deliberate opt-in skips**
and **26 boundary/performance/inventory checks**. Both new fixtures use the
ordinary native fixture inventory in headless/drawn modes. Existing persistence
and 50-dialog native-confirmation fixtures pass unchanged in both editors.

`delivery-clear-observations.json` records **eight standalone owner check
groups** and **six public-workflow groups**, passing in both editors,
headless and drawn:

- Ordinary matching `sent` ACK clears exact unchanged text once; confirmed
  failed delivery never enters this owner. Immediate success keeps redraw
  ordering with its caller, removes quote proof and observes existing
  draft/persistence owners. A background matching composer clears without
  moving focus or touching independent foreground text/full undo/options.
- Every attempt requires the captured session to remain current and ready,
  exact owned composer/room/parent/format, matching non-stale attachment,
  native changedtick and full text. Independent entry guards refuse before
  marking/writing; deferred attempts reread current state and stop silently
  when new work, format, parent, attachment, session or readiness changes.
- Confirmed-sent revision/destination/parent/format/attachment-revision evidence
  is installed **before** writing. Both a truthy result and actual empty native
  text are needed for success. False success cannot discard quote proof or
  claim cleanup. Only original native `Vim` errors are caught; custom write
  exceptions keep their propagation contract.
- Real expression-mapping textlock at the isolated clear-owner boundary causes
  one blocked native write, then one deferred successful local write after
  release. Transient controlled refusal/native exceptions likewise recover
  using real timers. No send/RPC/resolve callback is available to the owner.
- Public send/delivery tests use controlled local write faults to verify
  recovery after ACK. Newer native text/full undo survives both a late matching
  ACK and edits before a deferred attempt. Each retry changes no send count.
- The original budget is preserved: immediate attempt plus at most three
  deferred 10 ms writes. Exhaustion warns and retains confirmed-sent text;
  repeated explicit send of that unchanged copy is blocked. Only deliberate
  new edited work creates a new request, which then clears normally.
- Exact attachment/format can clear immediately, but an attachment key forbids
  deferred clear. A blocked file clear retains confirmed-sent attachment
  revision even after the independent upload owner retires the staged file,
  preventing accidental resend. Explicit new plain work is a separate action.
- Session replacement before retry prevents another native write. A duplicate
  retired ACK cannot affect new pending/text. Old unverified account drafts
  remain refused; deliberate native promotion plus a fresh public composer
  permits new-session success without changing authority metadata.

In each public workflow, **11 explicit inert send records and 13 local write
attempts** cover the six scenarios; local retry never adds a send. Headless and
drawn results agree. These are synthetic transport records, not service writes.
Existing persistence tests also verify that an uncleared confirmed copy is not
resurrected from disk and that the local retry never repeats the backend send.

**A separate baseline renderer limitation remains unfixed and is not counted
as passing.** Injecting the *entire* delivery/render callback reentrantly from
an expression mapping raises renderer `E565` after the clear boundary defers.
The same failure was reproduced on preserved pre-extraction baseline and
candidate in both editors; rendering/view inputs are byte-identical.
`preexisting-reentrant-render-textlock.json` and the `textlock-*` logs retain
that evidence. An expression register initially did not impose textlock; the
correct mapping exposed the renderer boundary. The final owner test asserts
real native textlock directly, while public ingress uses explicit controlled
write refusal and does **not** claim full reentrant-render safety. No production
guard or assertion at the clear boundary was relaxed to conceal the limitation.

`source-boundary-audit.json` proves **132 other native functions and the other
176 runtime inputs unchanged**. The whole coordinator diff is a current-state
getter, clear delegation and owner composition. The complete session/ownership/
text/tick/format/attachment, marker/write/error/observation and retry algorithm
matches the baseline after delegation. Evidence is not rebuilt/cloned between
attempts; timer delay, budget and no-file-retry policy are unchanged. Caller
delivery admission/order, notification effects, upload retirement, event
publication, send, bound uncertainty recovery, state application, disconnect
and shutdown remain separate and unchanged. All backend inputs, draft/view/
profile/attachment/send/RPC implementations, drawn driver and pre-existing
native persistence/confirmation fixtures are byte-identical.

The older syntax-only `test/editor/ui.vim` failure also remains **unfixed and
not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Both-editor baseline/candidate logs and provenance are
carried forward; fixture/history syntax/implementation inputs are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated owner/public headless reruns,
docs/inventory/boundary/help, source-lineage and preservation checks. All ten
observed checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD
and staging are preserved. No install, live service operation, checkout
build/replacement or running-editor reload/reconnect occurred. The earlier
catalogue artifact exception and live/operator acceptance gaps remain separate.
Offline native/timer evidence does not certify live delivery latency or
operator-observed assistive readout.

Native coordination is **1,541 lines**, down from 1,566; the clear owner is
38 lines. `EditorEngine` stays 1,331 lines. This is **not completion of the
architecture goal**: delivery ingress/bound recovery, renderer textlock
reentrancy and other native/application action integration remain open.
The [feature guide](feature-architecture.md) documents local-clear extension
boundaries, exact attempt guards and separation from service-write recovery.

## Architecture refactor 20 — native composer send consent-to-dispatch

`autoload/wbx/send_action.vim` now owns one finite action behind unchanged
`wbx#send()` / `:WebexSend`: entry admission, rich consent, exact post-consent
rechecks, pending registration, plain/rich/file dispatch and RPC error response.
The object retains **ports only**. Draft text/undo, pending/uncertainty evidence,
recipient sends, successful-delivery clearing/recovery and RPC correlation stay
with their existing owners. No session counter, outcome registry, retry queue
or generic action framework is added.

Evidence: `/tmp/opencode/wbx-architecture-send-action-2y71ls7u/`.
**`verified-results.json`: all selected result codes zero on 618 frozen
sources** — **1,895 core passes / 15 deliberate opt-in skips**, **156 selected
native + 146 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The final focused gate passes **114 native**,
**92 drawn**, **170 backend/send-related checks / six deliberate opt-in skips**
and **25 boundary/performance/inventory checks**. Both new fixtures use the
ordinary native fixture inventory/runner in headless and drawn modes.

`send-action-observations.json` records **six standalone owner check groups**
and **six drawn public-workflow groups** in both editors. Headless mode runs
the five noninteractive public groups and does not claim keyboard acceptance:

- Ordinary plain dispatch registers exact pending evidence **before** a request
  can answer synchronously, and preserves full native text/undo/focus/options.
  RPC success alone neither clears text nor releases pending; only the original
  matching delivery path clears the unchanged draft.
- Positive reply, rich-only, plain file-only and combined Markdown/file routes
  keep exact room/parent/draft/attachment/consent fields. Rich-only wire format
  remains implicit; combined format stays explicit. No file drop, downgrade or
  destination inference is introduced.
- Default Cancel retains native work and allocates no send. Consent-time text,
  format, file, draft ID, parent, leave-and-return, session and uncertainty
  changes refuse dispatch. The quote check rereads **current application
  state after consent**, including dictionary replacement, rather than trusting
  captured pre-dialog proof.
- Destination readiness, empty text, length, pending, uncertainty, already-sent,
  combined-format, stale-file and reply-support gates retain their independent
  admission rules. Refused dispatch and synchronous RPC error preserve original
  registration/error/render order and never automatically retry.
- Confirmed refusal retains full native work. Redraw makes no retry; a new
  deliberate request succeeds. Possible submission remains uncertain and blocks
  resend until explicit exact-room acknowledged recovery, after which a new
  explicit send works normally.
- A late matching successful delivery releases its request without clearing
  newer native text/full undo/focus. After transport/session replacement,
  retired errors/deliveries cannot release replacement pending work or clear its
  text. Old unverified account drafts remain refused. The workflow deliberately
  promotes old text to ordinary native work, opens a fresh public composer and
  completes a new send without changing private authority metadata.
- Ordinary Enter/write remain native and dispatch nothing. Recipient handoff,
  upload admission, uncertainty storage, successful-delivery matching/clear and
  bound recovery implementations remain separate regression gates.

The public drawn workflow uses the **real `rich#consent()` / native `confirm()`**
and actual keys on the child's private controlling PTY: **default Enter/Cancel,
mention acceptance, separate `@all` acceptance**. Both editors consume all
three prompts and record one deliberate rich send after the two acceptances.
The standalone owner instead uses inert consent/application/request ports for
deterministic race checks. No production confirmation function or boolean
result is replaced in the public workflow.

The drawn runner adds only `send-workflows` to its explicit inert keyboard
allowlist and checks its exact three-dialog contract. The original
`native-confirmations.vim` remains byte-identical; all **50 real native dialogs
and seven positive helper controls** still pass independently in each drawn
editor. Private synthetic PTY acceptance is **not** operator-observed assistive
readout, live-service send acceptance or a live latency measurement.

Initial public-workflow fixture failures bypassed reconnect admission after
simulated transport loss and assumed a drawn text row. The fixture now uses
public reconnect/hello negotiation and checks the actual current window. These
failures and corrected runs are retained; no production guard was relaxed.
The new workflows use inert transport only and perform no service operation.

`source-boundary-audit.json` proves **132 other native coordinator functions
and the other 175 runtime inputs unchanged**. The entire coordinator diff is
the public send facade, current-state adapter and explicit owner composition.
The full entry/consent/recheck/register/wire/dispatch and matching error/
uncertainty/render algorithms match the baseline after delegation. Current
state is reread after consent and registration still precedes synchronous
response. Existing draft/view/consent/profile/quote/recipient/upload/connection/
channel/transport implementations and all backend inputs remain byte-identical.
Successful delivery clear/local-only retry, bound recovery, state application,
disconnect and shutdown functions are unchanged. The native inventory adds only
the two fixtures; the drawn runner's limited allowlist/count edit is AST-audited.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Both-editor baseline/candidate logs and provenance are
carried forward; fixture/history syntax/implementation inputs are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated owner/public headless reruns,
docs/inventory/boundary/help, source-lineage and preservation checks. All ten
observed checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD
and staging are preserved. No install, live service operation, checkout
build/replacement or running-editor reload/reconnect occurred. The earlier
catalogue artifact exception and live/operator acceptance gaps remain
separately recorded.

Native coordination is **1,566 lines**, down from 1,636; the action owner is
88 lines. `EditorEngine` stays 1,331 lines. This is **not completion of the
architecture goal**: successful-delivery clearing/recovery, other native action
orchestration and broader application feature/action integration remain open.
The [feature guide](feature-architecture.md) documents extension boundaries,
consent/current-intent tracing and the independent pending/delivery lifetimes.

## Architecture refactor 19 — backend provider construction boundary

`src/backend-providers.ts` now owns concrete defaults, lazy feature-construction
ports and exact presence/agenda/name option mapping, plus messaging API/store
selection. The engine retains its public positional factory types/order,
named owner injections, credentials/session validity, callbacks and lifecycle
ordering. No provider handles, credentials, epochs, timers, publication state
or parallel registry move into the construction module.

Evidence: `/tmp/opencode/wbx-architecture-providers-q2yiini3/`.
**`verified-results.json`: all selected result codes zero on 615 frozen
sources** — **1,894 core passes / 15 deliberate opt-in skips**, **152 selected
native + 142 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **185
provider-related checks**, **108 native**, **86 drawn** and **24 boundary/
performance/inventory checks**. Both new test files run through ordinary core
discovery, not a special acceptance-only runner.

`provider-observations.json` records **seven construction tests** and **six
ordinary RPC workflows**, passing in focused/full/final isolated reruns:

- Composition is lazy and keeps the injected read-source factory as an exact
  alias, preserving reference/receiver semantics. Presence forwards the exact
  supplied physical owner, scope/token references and optional clock. Agenda
  forwards the exact session. Both resolve global fetch at factory invocation.
- OAuth/cache defaults remain fresh per-engine factory objects, with the same
  concrete providers and shared-OAuth/account functions. Concrete construction
  itself performs no service work. Sender names retain injected transport or
  the per-request dynamic global-fetch wrapper and caller token/clock seams.
- Messaging retains editor sandbox versus live API selection, the existing
  12-second live deadline and shared content-admission identity. The injected
  messaging method keeps its original receiver and `(api, 4000, mode)` arguments;
  nullish results retain the default store fallback. Credentials remain lazy
  and application guarded, not copied into construction state.
- Ordinary demo startup/history and explicit live opt-outs construct no optional
  sources or live demo transport. Normal live history, selected presence, agenda
  and sender presentation work through the composed ports.
- Token renewal closes/replaces the read source, replaces presence while
  retaining its physical `PeopleReadOwner`, reuses the agenda via `setSession()`,
  retains the same messaging store and does not reset sender-name state for an
  unchanged grant. Messaging/presence/agenda requests use renewed credentials.
- Feature/source failures leave ready history usable. Later explicit presence/
  agenda reads and authorization renewal recover without a second store/agenda
  owner or an immediate application retry. Existing feature-specific read
  scheduling/backoff remains separate and unchanged.
- Authorization and injected store-construction failures use the existing
  startup error/cleanup contract, close constructed feature sources and recover
  only on explicit restart. Private exception text is not published.
- A held initial read source and held optional agenda response can outlive
  stop/start, but retired completions/callbacks cannot publish into the new
  session. Old providers close, replacement history/presence work normally and
  the engine-lifetime physical People owner remains shared.

`provider-stability.json` adds **six repeated frozen runs / 78 passes**, including
**36 RPC workflow passes**, with zero failures. Tests use real concrete
presence/agenda/messaging providers with private configuration and synthetic
OAuth/SDK/GET responses; socket, browser, receipt and mutation effects are
forbidden. This is offline workflow/settlement evidence, **not** live-service
latency, live People/reaction-return or operator-observed assistive readout.
Initial mock typing/assertion-narrowing fixture errors are retained in
`second-check.log`; no production validation or admission guard was relaxed.

`source-boundary-audit.json` proves **107 other engine methods and the other
174 runtime inputs unchanged**. The entire engine diff consists of declared
imports/defaults, creation-port composition and messaging construction
delegation. Method/field inventory, constructor factory types/order and injected
authorization/cache objects remain compatible. The exact current-token/expiry
guard, store callbacks/load ordering, renewal/failure/stop logic, source and
feature lifecycles, physical admission, uncertainty/domain owners, wire
protocol and all native inputs remain unchanged. Presentation clocks do not
replace real authorization expiry policy.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Both-editor baseline/candidate logs and provenance are
carried forward; fixture/history syntax/implementation inputs are unchanged.
The earlier storage-fixture collision repair also remains unchanged, with its
baseline reproduction and stability evidence retained in prior records.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated construction/RPC, docs/inventory/
boundary/help, source-lineage and preservation checks. All ten observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No install, live service operation, checkout build/replacement or
running-editor reload/reconnect occurred. The earlier catalogue artifact
exception and live/operator acceptance gaps remain separately recorded.

`EditorEngine` is **1,331 lines**, down from 1,334; the finite construction module
is 42 lines. Native coordination remains 1,636 lines. The small net reduction
keeps lifecycle composition explicit rather than moving it wholesale behind
another controller. This is **not completion of the architecture goal**:
general native action orchestration and broader application feature/action
integration remain coordinator debt. The
[feature guide](feature-architecture.md) documents provider extension points,
distinct renewal lifetimes and ordinary startup/failure tracing.

## Architecture refactor 18 — demo recipient-file posting

`src/demo-recipient-file.ts` now owns the former constructor's finite demo
recipient-file posting sequence: consume the staged snapshot with the existing
signal, invoke caller submission/admission, then resolve the current store and
post exact synthetic target/plain/Markdown/file fields. It is stateless and
returns the original raw ACK/rejection. No upload owner, destination registry,
file buffer, epoch, queue, timer or uncertainty ledger is added.

The engine retains the existing `DirectFiles.post` callback, constructor
injection and live/demo dispatch. Live multipart fields, token, signal,
submission callback and `owners.uploadRequest` remain unchanged. `Uploads`
still owns immutable snapshots, exact recipient/draft bindings and physical
cleanup; `ConversationActions` still owns fresh recipient/self/room proof,
dispatch, ACK validation, outcome replay and uncertain-write recovery.
The store lookup remains **after streaming and submitted()**, not a captured
pre-stream store or a new helper-level session policy.

Evidence: `/tmp/opencode/wbx-architecture-demo-recipient-file-n_nwz093/`.
**`verified-results.json`: all selected result codes zero on 612 frozen
sources** — **1,880 core passes / 15 deliberate opt-in skips**, **152 selected
native + 142 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The final focused gate passes **171 file/
conversation checks**, **108 native**, **86 drawn** and **23 boundary/
performance/inventory checks**. Both new test files run through ordinary core
discovery. Positive recipient-file/rich-upload/draft workflows are included in
both editors, alongside the existing boundary/recovery fixtures.

`demo-file-observations.json` records **seven standalone helper tests** and
**eight ordinary RPC workflows**, all also passing in the full gate and final
isolated helper/workflow rerun:

- Helper tests verify complete chunk consumption before submission/store lookup,
  exact literal target/plain/Markdown fields, zero-byte file-only posting,
  pre-submission read failure, refusal by the caller admission callback, late
  current-store selection and unchanged sandbox error propagation. No read/
  submission/post is retried; raw bytes, filenames, paths or tokens are not
  forwarded to the sandbox operation.
- Ordinary first plain-file send uses exact `toPersonId`; a later Markdown-file
  send uses only its confirmed real room. Exact Unicode/newline/Markdown text
  survives. A third zero-byte file-only send succeeds. Replacing the original
  path after staging cannot change the consumed immutable snapshot.
  Preparation/staging creates no placeholder or send.
- Exact replay performs no second stream or post. Recipient ACKs do not adopt
  selected normal history or emit normal-message delivery. Explicit navigation
  to the confirmed direct room shows all three deliberate messages.
- Unconfirmed RPC and wrong recipient/draft snapshot bindings stream/post
  nothing. The original exact binding can then send normally; an opaque target
  is not interchangeable with a guessed room/draft namespace.
- Pre-submission stream failure retains the snapshot and failed result.
  Replaying that result does not read again. A new explicit request can recover
  using the same immutable snapshot, with zero failed-read posts.
- Separate **lost ACK and malformed single-file ACK** workflows remain unknown,
  even after the sandbox accepted a message. Reopening/replaying adds no post;
  a new request stays blocked until explicit recipient-context recovery.
  Wrong-target resolution is refused. Deliberate resolve/new-send recovers
  without guessing/adopting an uncertain returned room or downgrading format.
- A held stream reserves the shared upload/action path. No post occurs before
  release, unrelated sends/recipient preparation are refused rather than queued,
  and exactly one explicit post completes after release.
- Separate replacement workflows hold **streaming and sandbox posting** across
  stop/start. Logical invalidation returns the existing error, but physical
  upload admission stays occupied until actual settlement. Old work cannot post
  through the replacement store, emit a late delivery or alter replacement
  history. A fresh explicit recipient/stage/send succeeds only after settlement.

RPC tests use real private staged snapshots and the real sandbox/upload/
recipient owners with controlled read/post faults. Network, sockets, browser
and live upload transport are forbidden. Existing multipart/injected transport
tests remain independent compatibility gates. This is positive offline
workflow/held-operation evidence, **not** live upload latency, installed-editor
activation or permission to send to a service. All new tests passed without
relaxing production guards.

`source-boundary-audit.json` proves **108 non-constructor engine methods and
the other 173 runtime inputs unchanged**. The entire engine diff is one helper
import and constructor delegation. Stream/submission/late-store order, exact
target/format fields and ACK/error behavior match the baseline after delegation.
Method/field inventory, constructor signature, live multipart injection,
known-message proof and the single shared upload owner remain unchanged.
Upload contracts/snapshot/cleanup, operation slots, conversation target/
uncertainty/replay, sandbox/store, wire routing and all native inputs remain
byte-identical. The previous storage-fixture collision repair is preserved
unchanged, with its baseline reproduction/stability evidence retained in the
preceding acceptance record.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and provenance are
carried forward; the fixture, history syntax and implementation are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated helper/RPC, docs/inventory/boundary/
help, source-lineage and preservation checks. All ten observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No install, live service operation, checkout build/replacement or
running-editor reload/reconnect occurred. The earlier catalogue artifact
exception and live/operator acceptance gaps remain separately recorded.

`EditorEngine` is **1,334 lines**, down from 1,336; the stateless helper is
14 lines. Native coordination remains 1,636 lines. The deliberately small
reduction preserves composition/injection while exposing one ordered effect
boundary for independent testing, not another generic framework. This is
**not completion of the architecture goal**: remaining provider factories
and general native action orchestration remain open. The
[feature guide](feature-architecture.md) documents recipient-file extension
points, late store lookup, physical admission and failed/unknown recovery.

## Architecture refactor 17 — demo reaction construction and synthetic state

`src/demo-reactions.ts` now owns exact room/message synthetic reaction groups,
own-handle add/remove behavior and detached single/batch response construction.
The engine composes one `DemoReactions` owner and retains demo/live provider
dispatch. `MessageReactions` still owns inspection/preparation, physical
admission, historical outcomes and exact-request uncertainty; application
session/source/loaded-target and live grant checks remain separate.

The existing synthetic map has **engine lifetime**, not authenticated-session
lifetime. Stop/start preserves groups but revokes inspected/prepared authority
through the existing source/controller invalidation. A separate engine starts
empty. No reset/eviction policy, identity cache, epoch, request ledger, timer,
transport or public configuration is added.

Evidence: `/tmp/opencode/wbx-architecture-demo-reactions-qnjctm5c/`.
**`reverified-results.json`: all selected result codes zero on 609 frozen
sources** — **1,864 core passes / 15 deliberate opt-in skips**, **144 selected
native + 124 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. The final `repaired-focused-results.json` passes
**83 reaction/source/storage checks / one opt-in SDK skip**, **88 native**,
**66 drawn** and **22 boundary/performance/inventory checks**. Both new test
files run through ordinary core discovery.

`demo-reaction-observations.json` records **seven standalone owner tests**
and **nine RPC/composition workflows**, all passing in the full gate and final
isolated owner/workflow rerun:

- Synthetic snapshots are exact, complete, current-clock and detached. All
  seven catalog reactions retain their existing label, count-one and random
  own-handle behavior. Repeated add is idempotent, not toggle/increment. Missing/
  stale/foreign own handles cannot remove a group; re-add makes a new handle.
- Exact room/message tuples and independent owners remain isolated. Batches
  preserve request order and explicit empty targets, detach every result and
  propagate failures without replay or converting an error to absence.
- Ordinary consent-bearing RPC batch/summary → explicit inspection → add →
  exact-result replay → fresh own-handle remove succeeds. Inspection makes no
  provider call. Wrong targets/unconfirmed submissions remain refused; reads
  alone do not unlock writes. Replaying the result performs zero extra writes.
  History, ordinary state publication, delivery and read state remain unchanged.
- Read failure preserves usable history and recovers on a later explicit read.
  A confirmed refused write replays its failed outcome without I/O; a new
  explicit preparation/request can recover normally. No automatic retry occurs.
- A write that changes synthetic state before losing its response remains
  **unknown**, even when a fresh summary shows the own reaction. Missing/wrong
  request resolution stays blocked. Exact checked inspection permits a fresh
  explicit removal; replay of the original request remains its historical
  unknown result rather than becoming a new write or revised success.
- Completed session replacement preserves synthetic groups but revokes old
  preparation/inspection authority. A fresh summary cannot restore that
  authority; explicit inspection/removal recovers. Historical result replay
  remains read-only.
- Held read and **before-apply / after-apply held write** replacement workflows
  retain physical reaction admission until settlement. A late read is rejected;
  a late admitted write cannot be accepted as changed in the new session and
  remains uncertain. The synthetic group may already exist; it is never treated
  as proof of absence/non-submission. Explicit exact-request recovery succeeds
  after settlement, with zero overlapping writes or automatic retries.
- Synthetic live-mode composition reaches the injected SDK source for two
  single reads and one batch, including a typed source failure. No failure
  falls back to demo state; switching to demo does no live-source read.

RPC tests use the real synthetic provider/controller with controlled
failure/held-operation seams. The live-mode case uses synthetic OAuth,
messaging and read-source implementations, **not a live service**. Network,
socket and browser effects are forbidden. Offline workflow/settlement evidence
does not certify live reaction latency, People/reaction-return acceptance or
operator-observed assistive readout.

The first full gate, `verified-results.json`, is retained as **failed**, not
counted as passing: an unchanged storage-identity fixture randomly placed two
saved accounts in the same private preference slot. The real storage guard
correctly refused the second seed before engine startup. The identical failure
was reproduced on preserved baseline and candidate; every reproduction attempt
is retained in `preexisting-storage-fixture-collision.json`.

The test-only correction chooses a configuration path whose two unchanged
account/key derivations use distinct slots. No workflow assertion, account
identity, key format or production storage check changed. Dedicated collision
refusal and concurrent-collision tests remain byte-identical and pass.
`storage-fixture-stability.json` records **16 runs / 64 original workflow
passes / zero failures** with fresh private temp paths. The corrected inputs
were frozen anew for the complete accepted `reverified` gate; the original
failure was not hidden by a skip or counted as a pass. Earlier new-test mock
typing/invalid-ID fixture failures and the incomplete 120-second foreground
gate are also retained; no production guard was relaxed.

`source-boundary-audit.json` proves **107 other engine methods and the other
172 runtime inputs unchanged**. The entire engine diff is the owner import/
field construction and two demo-dispatch delegations. Single summary/add/
remove/handle/state and batch order/response algorithms match the baseline.
Constructor and positional/named injection, live source/grant errors, exact
target/consent/session/source guards, controller physical admission and
uncertain outcomes, storage implementations and all native inputs remain
unchanged. The additional fixture diff is audited as input-layout selection
only, with all original assertions retained.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and provenance are
carried forward; the fixture, history syntax and implementation are unchanged.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated owner/RPC, docs/inventory/boundary/
help, source-lineage and preservation checks. All ten observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No install, live service operation, checkout build/replacement or
running-editor reload/reconnect occurred. The earlier catalogue artifact
exception and live/operator acceptance gaps remain separately recorded.

`EditorEngine` is **1,336 lines**, down from 1,351; the demo reaction owner is
25 lines. Native coordination remains 1,636 lines. This is **not completion
of the architecture goal**: remaining provider factories, demo recipient-file
composition and general native action orchestration remain open. The
[feature guide](feature-architecture.md) documents extension points, synthetic
state versus write authority, lifetime and ordinary failure/recovery tracing.

## Architecture refactor 16 — native history activation/receipt lifecycle

`autoload/wbx/history_activation.vim` now owns explicit post-selection history
activation, newest-endpoint checks and three related receipt fields: pending
exact room/message admission, attempted endpoints and known-latest endpoints.
The two retained maps keep their 500-entry bounds and original lifetimes.
Selection intent/origin, workspace handles, native setup/view, rendering,
backend source freshness and RPC correlation/transport remain separate owners.
No session/source epoch, request registry, text store or retry pool is added.

The unchanged selection owner admits the exact request/current context before
its activation effect. Activation preserves ensure/render, annotation refusal,
show/setup, actual ownership/history-room rechecks, reader placement, paging
baseline, local unread observation, render and receipt-admission order. Current
application state is read after setup and **again after rendering**; a stale
captured dictionary cannot authorize a receipt after hooks replace state.
Local resume neither jumps nor grants new automatic receipt consent.

Evidence: `/tmp/opencode/wbx-architecture-activation-wa78vof8/`.
**`verified-results.json`: all selected result codes zero on 606 frozen
sources** — **1,847 core passes / 15 deliberate opt-in skips**, **144 selected
native + 124 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **66 native
checks**, **44 drawn cells**, **871 existing demo/action/transport checks** and
**21 boundary/performance/inventory checks**. Both new native fixtures use the
ordinary fixture inventory/runner in headless and drawn modes.

`activation-observations.json` records **six standalone owner check groups**
and **four public-command workflow groups**, passing in both editors:

- Ordinary activation ensures/renders absent history before show/setup, then
  positions the newest message without unfolding it. Ready Enter/resume retains
  the reader's cursor and issues neither selection RPC nor receipt.
- Real **BufEnter redirection and FileType redirection, promotion and annotation**
  run in each editor. They cannot acknowledge unseen history or overwrite the
  foreground's text/full undo/view. After hooks are removed, a fresh explicit
  activation recovers normally and admits the exact complete newest endpoint.
- An unknown/failed automatic receipt remains deduplicated across reopening.
  Explicit manual mark-read can recover; ACK alone leaves authoritative unread
  and attempted endpoints unchanged. Only ready-source, non-stale authoritative
  `unread: false` ends the attempt interval.
- Late selection success/error cannot revive a canceled intent or take focus.
  Failed selection stays in place; a new matching explicit request recovers.
  Existing independent selection workflows also retain A-held-B-A, origin
  leave-and-return and disconnect/session-replacement coverage.
- Setup effects and a render that **replaces the application dictionary** are
  rechecked rather than trusting pre-hook evidence. Consent/options, unread
  evidence, selected/listed freshness, source/readiness/loading, latest-history,
  completeness, known-latest identity and closed-fold visibility gates remain
  independent. Promoted reserved-name collisions preserve native work; unrelated
  errors keep their original propagation contract.
- Independent receipt checks retain one pending admission, failed/refused
  attempts, explicit manual recovery and matching completion. A late
  different-endpoint callback cannot release replacement pending admission.
  Filling both retained maps through ordinary owner operations verifies the
  500-entry bound; automatic overflow is refused without evicting another
  attempt, while explicit manual admission remains possible.

In each drawn public workflow the exact receipts are **A/A-3, A/A-3, B/B-3 and
D/D-3**: the second A is deliberate manual recovery, not an automatic replay.
Both drawn editors execute all four native hooks. Neovim's virtual/drawn UI
certifies positive endpoint visibility; plain Vim ex-mode must issue **zero**
positive receipts. Final isolated headless reruns retain that distinction.
Enter/navigation/setup never sends or performs unrelated mutations.

The tests use inert application effects or a controlled protocol transport
with real native buffers, hooks, view primitives and public commands. There is
no service operation. These positive workflow/held-response checks are **not**
live-service latency, assistive-readout or live People/reaction acceptance.
Initial fixture failures exposed Vim's reserved `count` name, native undo
synchronization on deliberate departure and ownership metadata removed during
promotion. The fixtures were corrected to capture the post-navigation baseline
and restore only their own test metadata; no production guard was relaxed.

`source-boundary-audit.json` proves **128 unrelated native coordinator
functions and the other 171 runtime inputs unchanged**. Activation ordering,
conditions/collision/error behavior, exact newest-endpoint checks, receipt
pending/dedup/bounds/dispatch/refusal and matching completion algorithms match
the baseline after delegation. Accepted-state receipt observation and scalar
room counts now use separate bounded pure loops before rendering, with no
intervening hook/effect and no change to application unread flags. Only the
existing transport-loss boundary clears pending receipt admission; retained
attempt/latest maps survive. Selection, workspace, view, renderer, setup,
local-unread, connection/channel/transport and all backend inputs remain
byte-identical. Manual mark-read retains its existing public guards and
local-open/render-before-dispatch order.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and implementation
remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated owner/public headless reruns,
docs/inventory/boundary/help, source-lineage and preservation checks. All ten
observed checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD
and staging are preserved. No install, live service operation, checkout
build/replacement or running-editor reload/reconnect occurred. The earlier
catalogue preservation exception and operator-observed/live acceptance gaps
remain separately recorded.

Native coordination is **1,636 lines**, down from 1,714; the activation owner
is 104 lines. `EditorEngine` stays 1,351 lines. This is **not completion of
the architecture goal**: provider/demo reaction/file construction and general
native action orchestration remain open. The
[feature guide](feature-architecture.md) documents extension boundaries,
post-hook current-state checks and ordinary activation/receipt failure tracing.

## Architecture refactor 15 — constructor demo REST adapter

`src/demo-rest.ts` now owns the former constructor's stateless REST-shaped demo
routing and synthetic People projections. Its narrow store port exposes only
current room, `demoConversation()` and `demoMessageAction()`. The existing
sandbox API keeps all synthetic state and mutation semantics; the adapter
adds no store, identity cache, mutation ledger, request queue or transport.

The engine retains mode dispatch, one `PublicREST(owners.publicRequest)`
instance and its unchanged `busy()`/`settled()` delegation. Live calls preserve
their original token/signal/body and never fall back to demo. Positional
constructor arguments and `owners.messaging`/`owners.publicRequest` injection
remain compatible. Domain and wire owners retain exact target, role, author,
consent, physical admission, retained uncertain writes and exact-request
recovery. The adapter does not grant authority or retry operations.

Evidence: `/tmp/opencode/wbx-architecture-demo-rest-23hnm649/`.
**`verified-results.json`: all selected result codes zero on 603 frozen
sources** — **1,846 core passes / 15 deliberate opt-in skips**, **140 selected
native + 120 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **871
demo/action/transport checks**, **62 native checks** and **20 boundary/
performance/inventory checks**. Both new test files run through ordinary core
discovery; no new runner or generic adapter framework is introduced.

`demo-observations.json` records **seven standalone adapter tests** and
**seven RPC/composition workflows**, all also passing in the full gate:

- The standalone cases cover People self/prefix/email/text projections,
  membership filters/invite/opaque IDs, room creation and metadata precedence,
  Team list/member/name/description routes, message query/direct/get/edit/delete
  routing and exact plain/Markdown fields. False flags and the single-space
  description-clear sentinel retain their original meanings. Returned People
  projections are detached; pre-abort/missing store/unknown or malformed routes
  make no sandbox call.
- Failed, unknown and held store outcomes propagate without retry or a new
  post-dispatch cancellation policy. Domain post-await/session checks remain
  independent of adapter translation.
- Ordinary directory/profile/roster/Team/query reads complete without changing
  selected history, application state or delivery. Confirmed create, rename,
  description replace/clear, invite, moderation and remove workflows succeed.
  Replaying an exact rename result adds no write; no metadata/member action
  becomes a delivery.
- An explicit sandbox send supplies one own message; guarded edit/delete retain
  its identity/creation evidence and add no second delivery. Exact edit-result
  replay makes no additional adapter call; confirmed deletion survives refresh.
  Foreign-message edit preparation remains refused.
- Failed roster reading leaves history usable and recovers on a later explicit
  read only. An injected unknown rename is retained against its original request;
  replay makes no call, a new request and wrong-request resolution stay blocked,
  and exact checked resolution permits explicit recovery. Automatic retries are
  zero.
- A held old-store read cannot publish into a replacement session. After
  settlement, explicit new-store reading succeeds with no retained adapter
  state or new epoch.
- A synthetic live-mode profile request reaches the injected native transport
  exactly once. Busy remains true and settlement remains pending until the fake
  native client physically closes; overlapping native admission is refused.
  Switching the same engine to demo produces a synthetic profile with **zero
  demo native requests**.

These tests use the real per-session demo sandbox and an injected messaging
store. The live-mode composition test uses synthetic OAuth and an in-process
native response, **not a live service**. Network/socket/browser effects are
forbidden. Local workflow timing and held-operation evidence are not live
latency acceptance or permission to activate the running editor.

Initial new RPC fixtures omitted required `confirmed`/`checked` fields and
attempted removal without fresh moderator evidence. Existing guards correctly
refused those operations. The fixtures now provide explicit consent and perform
a deliberate demo moderation transition before fresh-roster removal; creator
status is not treated as moderator proof. Earlier failure logs are retained.
No production admission, role, mutation or replay guard was relaxed.

`source-boundary-audit.json` proves **108 non-constructor engine methods and
the other 170 runtime inputs unchanged**. The complete engine diff is one
adapter import and constructor delegation. All routing branches, field
precedence, synthetic responses, decoding and failure behavior match the old
branch after replacing engine store access with the narrow store argument.
Engine fields/method inventory and constructor injection signature are
unchanged. Sandbox/store, live transport/physical settlement, operation slots,
domain mutation/consent/target/role/recovery, wire routing, storage owners and
all native inputs remain byte-identical.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and implementation
remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`EditorEngine` is **1,351 lines**, down from 1,387; the stateless adapter is
47 lines. Native coordination remains 1,714 lines. This is **not completion of
the architecture goal**: provider construction, remaining demo reaction/file
composition and general native action/history activation/receipt integration
remain open. The [feature guide](feature-architecture.md) documents routing
extension points, ownership and ordinary demo/live-injection failure tracing.

## Architecture refactor 14 — backend private draft open/save lifecycle

`src/local-drafts-lifecycle.ts` now owns the successfully opened profile and
one physical open/save reservation, unchanged demo partitioning and exact
revision-addressed room/reply patch sequencing. Two engine fields become one
owner. The existing storage factory and a narrow captured session context
supply safe-file operations, current-session evidence, the shared verified-key
facade and current save-grant/expiry checks. The owner adds no identity cache,
session epoch, operation queue, timer or application text projection.

Public `openLocalDrafts()`/`saveLocalDrafts()` connected/error contracts remain
compatible. Open holds physical admission through identity and file load;
save reloads the exact document/revision and merges only addressed destinations.
Reset forgets only the opened profile, **never** a pending physical operation.
Safe files/content revisions remain in `LocalDrafts`; shared identity, cache/
preference binding, native text/undo and send/delivery authority stay separate.

Evidence: `/tmp/opencode/wbx-architecture-drafts-xls4ynwx/`.
**`verified-results.json`: all selected result codes zero on 600 frozen
sources** — **1,831 core passes / 15 deliberate opt-in skips**, **140 selected
native + 120 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **161
draft/storage checks**, **62 native checks** and **19 boundary/performance/
inventory checks**. Both new test files run through ordinary core discovery.

`draft-observations.json` records **ten standalone lifecycle cases** and
**six ordinary RPC workflows**, all also passing in the full gate:

- Ordinary restore → local edit → save → reopen/reconnect preserves exact
  Markdown/Unicode/newline text, content revision and account partition, while
  reconnect supplies a new local UI session ID. Cache binding and repeated
  same-session draft opens use **one shared identity lookup**.
- Root/reply patching retains unopened destinations. Empty text removes only
  its exact destination when that patch has no remaining uncertainty; an empty
  uncertain reply survives independently of its root. No draft text enters the
  ordinary application snapshot, and no restore/save selects, sends or
  acknowledges a message.
- A concurrent editor's newer revision rejects a stale patch before write,
  retaining private bytes. Explicit reopen, user reconciliation and save
  recover. A transient physical save failure also retains bytes/native work;
  only a later explicit save retries. Automatic retries and stale commits are
  zero.
- Identity failure with cache disabled causes **zero file reads**. Explicit
  draft-open retry succeeds independently of cache binding. Missing/lost People
  grant blocks open/commit; grant recovery reuses the verified identity with
  **zero renewal identity probes**.
- Separate replacement workflows hold **open-load, save-load and save-commit**.
  New draft I/O stays busy until old physical settlement; history still works.
  Retired operations reject, old private bytes remain identical, and explicit
  new-account open/edit/save succeeds without crossing accounts. Returning to
  the original account restores its exact original root/reply/unopened work.
- Standalone cases verify lazy construction, unchanged demo-key format,
  successful-open profile admission, malformed patches, sanitized identity/
  load/save errors, commit validity and physical admission across reset. Open
  retains the existing current-session-only post-file-load check; it does not
  add a new grant/expiry policy after shared identity admission. Save retains
  live current/profile/grant checks before write, at commit and after settlement.

All six RPC workflows require **maximum physical draft I/O = 1**. Retired
commits, cross-account restores, failed-identity file reads, lost-grant commits
and automatic retries are zero in their respective workflows. Tests use real
private files with gated draft operations and synthetic OAuth/messaging
responses. Network, browser and sends are forbidden. These are positive offline
workflow/held-I/O progress checks, **not live-service latency acceptance**.
All new tests pass without relaxing production guards.

`source-boundary-audit.json` proves **104 non-draft engine methods and the
other 169 runtime inputs unchanged**. The entire engine diff is limited to
owner composition, public connection/error facades, narrow session context and
profile-reset delegation. Open identity/demo/load/profile/error/finally and
save profile/patch/revision/session/commit/error/finally algorithms match the
baseline after delegation. Identity/startup/renewal/failure policy, preference
projection/intent/I/O, safe files/content revisions, keys/provider formats,
exact-target mutation/receipt/recovery guards and all native inputs remain
unchanged. The identity boundary test now traces the same shared facade through
the draft owner rather than requiring orchestration to remain in the engine.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and implementation
remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`EditorEngine` is **1,387 lines**, down from 1,399; the draft owner is 57
lines. Native coordination remains 1,714 lines. The modest reduction preserves
compatibility/error and session adapters while establishing independent
ownership. This is **not completion of the architecture goal**: feature/demo
construction and general native action/history activation/receipt integration
remain open. The [feature guide](feature-architecture.md) documents draft
extension points, exact patch semantics, physical admission and ordinary
conflict/failure/replacement tracing.

## Architecture refactor 13 — backend preference restore/I/O lifecycle

`src/section-preferences-lifecycle.ts` now owns local grouping visibility,
revisioned edits, monotonic user intent, automatic restore and explicit
load/save/clear with one physical I/O reservation. Five engine fields become
one owner, composing the unchanged `LocalSections` model. Three narrow ports
supply storage, currently projected room IDs and publication; a captured
session context supplies only current-session, verified disk-key and automatic
restore eligibility checks. The owner cannot probe identity or bind disk state.

Public `editSections()`/`sectionPreferences()` connection and error contracts
remain compatible. Automatic reads may be superseded by edits or even refused
explicit user intent. Explicit I/O instead blocks edits until settlement.
Reset clears grouping/visibility, **never** physical admission, automatic-read
status or the monotonic intent counter. No operation is queued or automatically
retried after a skip/failure/reset. Existing safe-file and commit validation
stays in `SectionPreferences`; draft, identity and server action owners stay
separate.

Evidence: `/tmp/opencode/wbx-architecture-preferences-p7f1qebb/`.
**`verified-results.json`: all selected result codes zero on 597 frozen
sources** — **1,814 core passes / 15 deliberate opt-in skips**, **140 selected
native + 120 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **145
preference/storage checks**, **62 native checks** and **18 boundary/performance/
inventory checks**. Both new test files run through ordinary core discovery;
no new runner, operation registry or feature framework is introduced.

`preference-observations.json` records **ten standalone lifecycle cases** and
**six ordinary RPC workflows**, all also passing in the full gate:

- Ordinary automatic restore → edit → explicit save → further edit → explicit
  load → explicit clear preserves exact revisions and the verified partition.
  Save retains revision, load/clear advances it, and reconnect after clear
  publishes empty session-only grouping without autosave. Live rooms/history
  and selection remain unchanged by preference operations.
- History selection completes while automatic preference reading is explicitly
  held. Local editing succeeds; a refused clear is not queued and still retires
  the older restore intent. The late saved result cannot overwrite new work.
  Explicit save and reconnect restore that new grouping normally.
- A corrupt-version private file causes unavailable status without automatic
  retry or importing private bytes. Explicit save fails without replacing the
  file or current grouping; deliberate clear, edit and save recover, and the
  next authenticated session restores the recovered grouping.
- Separate **load, save and clear replacement workflows** retain physical
  admission across session/account change. A second explicit operation/edit
  stays busy, history remains usable, and old completion cannot commit or
  populate/mark the replacement unavailable. Each old private document remains
  byte-identical. After settlement, explicit load/edit/save and reconnect succeed
  against only the new account's verified partition.
- Standalone cases cover lazy detached snapshots, current loaded-room assignment,
  missing binding, stale revisions/intents, opt-in/grant gating for automatic
  restore, missing versus malformed documents, current and retired failures,
  binding loss during commit and no physical-admission reset. Automatic grant
  eligibility remains distinct from existing explicit bound-key/current-session
  admission; no new OAuth/expiry policy is added.

All six RPC workflows require **maximum concurrent preference I/O = 1**,
including session replacement. Retired commits, late projection changes,
automatic retries, corrupt-file overwrites and queued refused clear operations
are zero. Tests use real private files with gated operations, synthetic
OAuth/messaging responses and noncolliding private account slots. Network,
browser and send effects are forbidden. These are positive offline workflow
and held-I/O progress checks, not live-service latency acceptance.

The first new-test check caught a missing bracket in an in-memory fixture; its
failed copied-check log is retained. No production behavior or guard was
relaxed to pass the tests.

`source-boundary-audit.json` proves **100 non-preference engine methods and
the other 168 runtime inputs unchanged**. The complete engine diff is limited
to owner composition/projection, compatibility error facades, session context
and reset/restore delegation. Moved edit/intent/busy, automatic restore and
explicit load/save/clear/revision/failure/finally algorithms match the baseline
after delegation. The original pure generation/ready and disk/grant checks are
regrouped into context callbacks, not another session/binding registry.
Semantic model/safe-file storage, identity/provider/key formats, disk cache,
draft I/O, renewal, exact-target mutation/receipt/recovery guards and all native
runtime inputs remain unchanged.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and implementation
remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`EditorEngine` is **1,399 lines**, down from 1,430; the preference owner is
81 lines. Native coordination remains 1,714 lines. This is **not completion of
the architecture goal**: feature/demo construction, draft orchestration and
general native action/history activation/receipt integration remain open.
The [feature guide](feature-architecture.md) documents preference extension
points, automatic versus explicit I/O, revision/intent fences and ordinary
busy/failure/recovery tracing.

## Architecture refactor 12 — shared verified-storage identity lifecycle

`src/verified-storage-identity.ts` now owns the authenticated profile binding,
verified storage key and one shared pending account lookup. Three independent
engine fields are replaced by one owner. Configuration is lazy, detached and
secret-free; the existing account provider, key derivation and file formats
remain unchanged. Entry gates run before cached return or flight joining;
completion rechecks the captured binding, current session and live grant.
Old success/failure/finally cannot replace a new account key or evict its flight.

The engine retains its public constructor and `verifiedStorageKey()` error
facade. Cache binding and explicit live draft opens share it; preferences still
require the disk owner's verified binding. OAuth/session abort, consumer
physical I/O, user intent/revisions, cache binding and mutation admission stay
separate. Token renewal reads current credentials/grant without another probe.
Logical identity reset never releases a pending physical draft operation.

Evidence: `/tmp/opencode/wbx-architecture-storage-identity-etp_ucch/`.
**`verified-results.json`: all selected result codes zero on 594 frozen
sources** — **1,797 core passes / 15 deliberate opt-in skips**, **140 selected
native + 120 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The focused gate passes **129 identity/
cache/draft/preference checks**, **62 native checks** and **17 boundary/
performance/inventory checks**. Standard core-test discovery includes both new
test files; no new test runner or feature framework is required.

`identity-observations.json` records **nine standalone identity cases** and
**four ordinary RPC integration workflows**, all also passing in the full gate:

- Twelve concurrent eligible consumers share one lookup. Current-session,
  People-grant and expiry checks precede cached-key return and pending reuse.
  Completion preserves the existing distinction: expiry is an entry gate,
  not a new post-lookup deadline policy. Missing/malformed identity fails closed.
- Failure settles all callers with no automatic retry. Reset/rebinding retires
  old results without aborting the engine's shared signal; late completion cannot
  clear a newer flight/key. Profile mutation after configure cannot change the
  binding, and secrets/tokens are not retained in that configuration.
- RPC cache/draft/preference restore uses the same verified partition and
  **one identity read**; history selection completes while optional identity is
  explicitly held. Real private draft/preference saves and reads succeed.
  Renewal reuses identity with **zero extra probes**.
- Failed shared identity causes **zero storage reads** and no automatic retry.
  Explicit draft retry recovers drafts without implicitly restarting failed
  cache/preference binding. An explicit new authenticated session restores the
  saved grouping and drafts normally; three identity reads represent those
  three explicit lookup lifetimes, not retries behind the user's back.
- Account/session replacement preserves old physical `draftIO` admission until
  settlement, rejects the old open and performs **zero retired-account storage
  reads**. Cache and the next explicit draft open share the replacement flight;
  only the new account's private drafts/preferences are restored.
- Cache opt-out does no identity/cache/preference work merely on start.
  Missing/lost People grant cannot read storage or expose a cached identity;
  explicit draft open after grant recovery succeeds without re-probing an
  already verified unchanged session.

The RPC tests use real private cache/draft/preference files with controlled
identity promises and synthetic OAuth/messaging responses. Network, browser
and sends are forbidden; diagnostics contain only workflow counts/booleans.
This proves ordinary history progress during held optional identity and exact
failure/recovery behavior, **not live-service latency acceptance**. All new
tests passed without weakening existing guards.

`source-boundary-audit.json` proves **104 non-identity engine methods and the
other 167 runtime inputs unchanged**. The complete engine diff is limited to
owner composition, its compatibility/error facade and configuration/reset
delegation. The original admission/reuse/lookup/completion/finally algorithm
matches after delegation, with the additional captured-binding fence.
`openLocalDrafts`, `saveLocalDrafts`, preference operations/automatic restore,
physical storage/key/provider implementations, renewal/failure policy,
exact-target mutation/receipt/recovery guards and all native runtime inputs
remain unchanged. No identity provider, timer pool, file format, source epoch
or parallel request registry is added.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and history
implementation remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`EditorEngine` is **1,430 lines**, down from 1,437; the identity owner is 46
lines. Native coordination remains 1,714 lines. This intentionally small
reduction establishes independent shared identity ownership while retaining
consumer admission and error contracts; it is **not completion of the
architecture goal**. Feature/demo construction, draft/preference orchestration,
general native actions and history activation/receipt integration remain open.
The [feature guide](feature-architecture.md) documents extension choices and
tracing for identity reuse, busy storage, grant loss and explicit recovery.

## Architecture refactor 11 — native buffer setup/mapping lifecycle

`autoload/wbx/buffer_setup.vim` now owns native initialization/FileType order,
default mapping installation/release, promotion cleanup and draft presentation
setup. Existing per-buffer initialization/map snapshots and per-window fold
preparation remain the only setup state. Application composition holds five
synchronous effects, not another buffer registry or disconnect-reset policy.

The existing setup/draft facades, plugin hooks and call sites remain compatible.
Workspace still owns allocation/rename/window-option lifetime; renderer owns
surface projection; feature owners retain completion, decoration, persistence
and scheduling responsibilities. Native setup installs finite defaults, not
action authority. Receipt/send/delivery/focus admission and **Wnr = Remove
Member** remain unchanged. Ordinary Enter/write never becomes send/submit.

Evidence: `/tmp/opencode/wbx-architecture-native-setup-eidw04a2/`.
**`verified-results.json`: all selected result codes zero on 591 frozen
sources** — **1,783 core passes / 15 deliberate opt-in skips**, **140 selected
native + 120 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **62 native
checks** and 16 boundary/performance/inventory checks. Both setup fixtures and
completion checks are included in the ordinary isolated verification path.

`setup-observations.json` records **six standalone owner scenarios and five
public-command workflows per editor**, with three drawn checks per editor:

- Initial native history/fold defaults precede actual FileType hooks. Hook
  overrides win; repeated setup retains options, mapping snapshots, annotations
  and full **unsynced** undo without repeating FileType or `WbxBuffer`.
- FileType and later user mappings survive promotion. Only exact currently
  owned defaults are removed, using the original expanded localleader even
  after it changes. Native global mappings are not plugin-owned buffer defaults.
  FileType-driven promotion/redirection cannot install send defaults or emit an
  owned-buffer event after ownership/current buffer changes.
- Explicit mapping/Ctrl-S opt-outs remain intact; re-entry does not silently
  reinitialize them. History promotion releases stale action/presentation
  metadata without discarding text/undo. Clean thread-list re-entry preserves
  independent message boundaries without acquiring main-history actions.
- Public open, ready-history Enter/resume and compose honor native hooks. Native
  Enter inserts literal lines and user Ctrl-S executes only the user's mapping.
  Repeated setup/redraw and failure/recovery retain user overrides and native
  work without stealing foreign focus. Reopen/re-entry does not rerun hooks.
- Promotion releases only owned setup. Ordinary write saves the private native
  copy; later recovery does not alter it. Explicit compose then creates a fresh
  destination-bound buffer while preserving the promoted copy and command family.

The new public setup workflow issues only **one hello and two explicit session
starts**: no send, receipt or mutation. Its Enter uses the existing ready-history
local-resume path; cold Enter/selection and exact positive receipts remain in
the selected client/selection/reading fixtures. Existing UX/ownership,
completion, workspace, renderer, navigation, full-undo, independent split and
recovery regressions remain selected.

Initial new fixtures needed single-line result output under deliberately enabled
`cpoptions+=C`, finite JSON evidence instead of native raw keycode dictionaries,
and correct distinction between Neovim's built-in global insert Ctrl-S mapping
and an owned buffer-local default. Exact `maparg()` comparisons remain native.
After explicit promotion/write, a native redraw settles removed virtual draft
chrome before comparing the resulting ordinary-file view, including `topfill`.
Same-window unsynced-undo assertions remain exact. Earlier failures are retained;
no production FileType, mapping, viewport, undo or action guard was relaxed.

`source-boundary-audit.json` proves **134 non-setup coordinator functions and
the other 166 runtime inputs unchanged**. Mapping install/exact release methods
are byte-identical. The complete setup/default/FileType/re-entry/promotion/event
sequence and draft presentation effect order match the baseline after
delegation. Public setup's separate reaction scheduling is unchanged. Plugin
hooks, command catalogue, completion, view/workspace/renderer/selection owners,
backend/SDK and exact receipt/send/delivery/focus guards remain intact.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its both-editor baseline/candidate logs and acceptance
provenance are carried forward. The fixture, history syntax and history
implementation remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`autoload/wbx.vim` is **1,714 lines**, down from 1,861; the setup owner is 160
lines. `EditorEngine` remains 1,437 lines. This is **not completion of the
architecture goal**: history activation/receipt integration, general native
actions and backend construction/identity/preference composition remain open.
The [feature guide](feature-architecture.md) documents setup extension points,
FileType ordering, mapping ownership and ordinary recovery tracing.

## Architecture refactor 10 — native room-selection request/focus lifecycle

`autoload/wbx/selection.vim` now owns selection intent serials, pending focus,
duplicate/loading/local-resume policy, response/origin checks and cancellation.
Two globals leave the coordinator. Five narrow ports supply current selection
evidence, a fixed `rooms.select` adapter, existing attachment cancellation,
guarded history activation and notices. The owner keeps neither accepted state
nor a second wire request/callback registry.

The existing history activation/automatic-receipt leaf remains byte-identical,
including native setup/annotation/selected-history rechecks, reader positioning,
local unread observation and receipt conditions. Exact newest-endpoint,
freshness/staleness, display-completeness, deduplication, send and delivery
admission stay with their existing owners. Public `wbx#select()` arguments,
Enter, leave hooks and explicit disconnect/shutdown behavior remain compatible.

Evidence: `/tmp/opencode/wbx-architecture-native-selection-d_rt872w/`.
**`verified-results.json`: all selected result codes zero on 588 frozen
sources** — **1,782 core passes / 15 deliberate opt-in skips**, **134 selected
native + 114 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **56 native
checks** and 15 boundary/performance/inventory checks. Both new fixtures are
included in standard inventories and the ordinary isolated verification script.

`selection-observations.json` records **six standalone owner scenarios and
six public-command workflows per editor**, with four drawn checks per editor:

- Ordinary Enter plus duplicate Enter while loading completes one history open
  and one exact fresh newest-endpoint receipt. Ready same-room return and
  A → held B → ready A return locally without another select/refetch, reader
  jump or receipt; late B cannot take focus.
- Programmatic selection stays focus-neutral and receipt-free while retaining
  foreign text and full unsynced undo. Actual leave-and-return cancels focus and
  automatic acknowledgment even if the response arrives in the original window.
  Background events in another window do not cancel the foreground intent.
- Failed opening stays put. An explicit new request recovers normally; an old
  success/error cannot consume its newer focus intent. Disconnect/session
  replacement retires pending focus without breaking ordinary ready resume.
- Standalone completion checks cover wrong room, absent loaded-row evidence,
  non-ready/loading/disconnected state, annotations, promotion, changed origin,
  response error, refused request, reload capability and monotonic intent serials.
  Cached refusal and duplicate loading preserve already-admitted work.

The drawn public workflows issue exactly **seven selection requests** and
**two receipts**, targeting only `A/A-3` and `D/D-3`. Request IDs remain unique
and monotonic in the existing channel. There are no sends or other mutations;
no failed selection is automatically replayed. Timings are local observations,
not live-service latency guarantees. Positive receipt evidence is required in
drawn Vim and Neovim; plain Vim ex-mode correctly sends **zero** receipts when
screen visibility cannot be certified, matching the existing reading suite.

The initial new Vim fixtures required renaming a reserved unscoped `count`
variable and respecting that ex-mode visibility distinction. Earlier failure
logs remain recorded. No production viewport, receipt, ownership or protocol
guard was relaxed. Existing reading, navigation, media-resume, renderer/
workspace, independent split, full-undo and recovery regressions remain selected.

`source-boundary-audit.json` proves **128 non-selection coordinator functions
and the other 165 runtime inputs unchanged**. The moved completion, duplicate/
resume/reload/request and origin-aware cancellation algorithms match the
baseline after delegation. Four application lifecycle sites change only to
owner cancellation. The history activation/receipt block is byte-identical;
physical attachment, connection/channel, backend, SDK, renderer, workspace and
view owners remain unchanged. There is no new source/session epoch, retry queue,
delivery uncertainty state or parallel request registry.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its preserved both-editor baseline/candidate logs and
acceptance provenance are carried forward; the fixture, history syntax and
history implementation remain byte-identical.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`autoload/wbx.vim` is **1,861 lines**, down from 1,909; the selection owner is
79 lines. `EditorEngine` remains 1,437 lines. This is **not completion of the
architecture goal**: history activation/receipt integration, general native
action/setup and backend construction/identity/preference composition remain.
The [feature guide](feature-architecture.md) documents ownership, integration
and tracing for Enter, local returns and late responses.

## Architecture refactor 9 — native rooms/history renderer

`autoload/wbx/render.vim` now owns rooms/history assembly, aligned surface
metadata, syntax/fold/image placement coordination, visible composer
synchronization and status/draft revision signatures. Two signature globals
leave the coordinator. It receives accepted state, detached workspace handles
and connection display hints; none is retained as another domain/session cache.
Six narrow presentation ports reuse existing status, destination, draft,
notification and delivery-evidence owners, without granting action authority.

The shared guarded writer moves unchanged to `wbx#view#write()`. The existing
application `s:write()` facade forwards all original arguments for meeting
status and confirmed delivery clearing. Exact delivery/request/text/format/
attachment/tick admission remains outside that primitive and unchanged.
Workspace construction, request-driven focus, receipt/send admission and
feature-owned People/reaction scheduling remain separate. Composer collision
refusal preserves the existing early-return scheduling boundary.

Evidence: `/tmp/opencode/wbx-architecture-native-render-10nuo3t5/`.
**`verified-results.json`: all selected result codes zero on 585 frozen
sources** — **1,781 core passes / 15 deliberate opt-in skips**, **130 selected
native + 110 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected
native/drawn cells have zero skips. The final focused gate passes **52 native
checks** and 14 boundary/performance/inventory checks. Standard inventories and
the ordinary isolated verification script include both new renderer fixtures.

`render-observations.json` records **five standalone owner scenarios and six
public-command workflows per editor**, including four drawn checks per editor:

- Real presentation/view primitives with inert application effects preserve
  input state/handles, exact row/message metadata, quiet full undo/view/tick,
  caller-supplied failure/delivery banners and composer refusal/recovery.
  Annotated or unloaded surfaces retain their old metadata with native work.
- Public Enter navigation returns to the correct history/draft; native
  TextChanged/status redraw updates local draft badges. Twelve quiet redraw/
  status pairs preserve full **unsynced** undo, focus and independent split
  cursors/scroll/folds, with `{history: 0, images: 0, status: 0}` and no requests.
- Changed history publishes new rows without moving independent readers or
  foreign focus. Clean failure/recovery displays/removes the failure banner
  without disturbing native draft/foreign work. Annotated failure/recovery
  retains full undo and metadata in both splits; only explicit `Refresh!`
  replaces the annotation with the latest projection and aligned metadata.

Workflow requests are limited to hello, session start, explicit room selection
and explicit history refresh: **no send, receipt or mutation**. Timings are
local observations, not live-service latency guarantees. Existing projection,
structural and status fixtures retain detached-cache, header/option/body
invalidation, sparse native writes, independent folds, unload/annotation and
scan-free status guarantees. Existing workspace/session-replacement, delivery
recovery, mapping, theme, `breakat` and image regressions remain selected.

The new fixtures initially needed valid handshake fields and inert callbacks
for existing image-visibility/People presentation hooks. A full-undo comparison
also needed a new baseline after the fixture's own explicit native window leave
synchronized its draft edit; the separate same-window unsynced-undo assertions
remain exact. No production undo/protocol guard was relaxed. One intermediate
drawn meeting-workflow attempt missed its expected pane event; subsequent
unchanged focused/full attempts pass. Its cause is not established and its
earlier failure log is retained, not counted as passing.

`source-boundary-audit.json` proves **131 non-render coordinator functions and
the other 163 runtime inputs unchanged**. Moved assembly/metadata/effect order,
detached history-cache composition, first-row positioning, status signatures
and shared guarded write algorithms match the baseline after delegation.
Existing view primitives are unchanged. Exact delivery clearing, send/receipt
admission, selection focus and explicit annotation-discard guards are intact.
There is no parallel uncertainty state, request queue, source epoch or cache.

The known pre-existing syntax-only `test/editor/ui.vim` failure remains
**unfixed and not counted as passing**: expected `WbxMessageTime`, received
`WbxMessageHeader`. Its preserved both-editor baseline/candidate logs and prior
acceptance provenance are carried forward. The fixture, history syntax and
history implementation remain byte-identical; this is not a new all-fixtures
passing claim.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated docs/inventory/boundary/help,
source-lineage and preservation checks. All ten observed checkout artifacts,
45 pinned SDK inputs, installed toolchain, HEAD and staging are preserved.
No install, live service operation, checkout build/replacement or running-editor
reload/reconnect occurred. The earlier catalogue preservation exception and
operator-observed/live acceptance gaps remain separately recorded.

`autoload/wbx.vim` is **1,909 lines**, down from 2,193; the renderer is 259 lines
and the unchanged guarded writer is 51 lines in the existing view owner.
`EditorEngine` remains 1,437 lines. This is **not completion of the architecture
goal**: native action/setup and backend construction/identity/preference
composition remain open. The [feature guide](feature-architecture.md) documents
display extension points, ownership and ordinary failure tracing.

## Architecture refactor 8 — native workspace/window-buffer lifecycle

`autoload/wbx/workspace.vim` now owns managed rooms/history/meeting-status
handles, collision-safe initialization, owned rename bookkeeping, explicit
tab/split opening/repair/show and temporary statusline ownership. Four globals
leave the native coordinator, replaced by one workspace owner. Its five narrow
ports preserve setup/render/draft effects and geometry/statusline options at
their existing call sites. Public commands, `wbx#buffers()` and lifecycle hooks
remain compatible.

Rendering and action admission remain separate: the owner cannot write lines,
change undo settings, start a service request, select a conversation, send or
acknowledge a message. Existing layout/view/draft owners retain geometry,
independent cursor/fold restoration, native text and delivery uncertainty.
Physical meeting terminals still belong to transport, not the workspace.

Evidence: `/tmp/opencode/wbx-architecture-native-workspace-mzxj2mal/`.
**`verified-results.json`: all selected result codes zero on 582 frozen
sources** — **1,780 core passes / 15 deliberate opt-in skips**, **126 selected
native + 102 drawn cells**, **71 affected backend/SDK checks**, TypeScript,
copied build and two-isolated-build integrity. Counts overlap; selected native/
drawn cells have zero skips. Focused acceptance passes **40 native checks** and
13 boundary/performance/inventory checks. Standard inventories include the new
workspace fixtures. This is not a claim that every historical fixture passes;
the independently reproduced syntax-only failure below remains open.

`workspace-observations.json` records **four standalone owner scenarios and
five public-command workflows per editor**, with four drawn checks per editor.
Actual open/Enter/compose/reopen preserves unrelated work and full unsynced
native undo. Same-room publication preserves independent split cursors,
scroll and manual folds. Returning navigation succeeds while the old selection
acknowledgement is held; a late acknowledgement cannot take independent focus.
Local timings are observations, not a service-latency guarantee.

Messaging failure/recovery, explicit disconnect/reconnect and changed local
session preserve annotated history, draft text/full undo and independent splits.
Explicit repair reopens the missing explorer without replacing foreign work or
existing history windows. Promotion releases ownership; reserved-name collisions
retain native text and undo rather than adopting foreign buffers. Workflow
requests are limited to hello, session start/stop and room selection: **no send,
receipt or mutation request**. Existing native promotion/mapping, geometry,
theme, `breakat`, folds, delivery/recovery and media-lifetime checks remain.

The first expanded focused run lacked a bundle for fixtures using the default
backend. The isolated runner now builds before those checks; no checkout build
or artifact replacement occurs. New fixtures were corrected to complete the
explicit promotion edit before comparing its undo tree (native window leave
can synchronize an edit), inspect actual drawn content below Vim's virtual draft
banner, and omit `localContext` outside ready state per the real protocol.
Separate same-window and background tests retain full unsynced-undo comparisons.
No production ownership or wire rule was relaxed.

An existing reading test raced a separate positive receipt audit after
`selection.complete`. It now waits, with the existing bounded timeout, for that
positive event instead of assuming the fixed 30 ms post-selection sleep is
enough. Exact receipt conditions/counts and negative assertions remain unchanged.

**Known pre-existing failure, not counted as passing:** the expanded syntax-only
`test/editor/ui.vim` probe expects `WbxMessageTime` but receives
`WbxMessageHeader`. It does not load the plugin/backend. The identical failure
is reproduced on the preserved pre-extraction source in **both editors**:
`baseline-ui-nvim.log` and `baseline-ui-vim.log`, alongside first-candidate logs.
The fixture, history syntax and history implementation are byte-identical.
They were not changed or removed to make this workspace slice green. The
selected acceptance set does not count this failing probe as a pass; the final
handoff explicitly carries it as an unresolved baseline failure.

`source-boundary-audit.json` verifies **123 non-workspace coordinator functions
change only to handle accessors**, and the other **163 runtime inputs are
unchanged**, including backend, SDK, physical transport, layout/view/drafts and
syntax. The moved allocation, rename, statusline/window and layout transaction/
origin algorithms match the baseline after delegation. Rendering changes only
handle access; request-focus, selection/receipt/send/delivery admission and
native setup/mapping policy remain intact. No competing window-text registry,
source/session epoch or request queue was introduced.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated final docs/inventory/boundary/help,
source-lineage and preservation checks, plus the known failing baseline probe.
All ten currently observed checkout artifacts, 45 pinned SDK inputs, installed
toolchain, HEAD and staging are preserved. No install, live service operation,
checkout build/replacement or running-editor reload/reconnect occurred. The
earlier catalogue preservation exception and operator-observed/live acceptance
gaps remain separately recorded.

`autoload/wbx.vim` is **2,193 lines**, down from 2,350; the workspace owner is
205 lines. `EditorEngine` remains 1,437 lines. This is **not completion of the
architecture goal**: native rendering/action/setup orchestration and backend
construction/identity/preference composition remain. The
[feature guide](feature-architecture.md) documents ownership and tracing.

## Architecture refactor 7 — disk-cache lifecycle

`src/disk-cache-lifecycle.ts` now owns verified cache binding, restored metadata/
boolean hints, their independent expiry timers and coalesced write admission.
Seventeen cache fields and nine private lifecycle methods leave `EditorEngine`,
replaced by one owner. Current-source health, retained SDK observations and
physical filesystem serialization remain separate responsibilities.

The binding uses the existing shared `verifiedStorageKey()` service; there is
no second identity request/pool, OAuth flow or account inference. Draft/section
identity reuse and preference I/O stay with application composition. A narrow
metadata port supplies detached, bounded/sanitized live room data, never the
mutable messaging store. `SpacesCache` remains unchanged and owns private-file
validation, fixed account slots, atomic commits and clear-behind-commit ordering.
Public native/wire and positional constructor/start APIs remain compatible.

Evidence: `/tmp/opencode/wbx-architecture-disk-cache-m0lg9__n/`.
**`verified-results.json`: all result codes zero on 579 frozen sources** —
**1,779 core passes / 15 deliberate opt-in skips**, **122 selected native +
92 drawn cells**, **71 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build integrity. Counts overlap; selected native/drawn cells
have zero skips. The final focused gate passes **254 checks / six deliberate SDK
opt-in skips**, ten boundary/inventory checks and 13 selected native cells.

`disk-cache-observations.json` records **three ordinary RPC workflows**:

- A warm two-row restore survives failed REST refresh as labeled browse-only
  hints, then explicit refresh reconciles to one live row. Selected history is
  ready while SDK startup is still held. After SDK settlement, explicit cache
  clear preserves fresh live unread/history and does not repopulate the file.
  This performs one identity read and zero implicit receipts/sends.
- Navigation/history remains ready while a physical save is held. Failure
  drains only the latest new recovery snapshot: two saves total, maximum one
  active, and no idle retry of the failed document.
- Account/session replacement ignores delayed old identity, creates no retired
  storage owner and binds exactly one current owner. New-account history is
  usable; old account metadata cannot replace current live rows.

Eight standalone owner tests exercise verified binding, slow identity, pure
snapshots, independent flag/metadata expiry, failed-refresh recovery, genuine
observation ages, throttled/coalesced writes, clear waiting, late identity/load,
scope loss and finite grant/identity/storage failures. Existing real private-file
tests still prove blocked fsync/rename retention, account-slot collisions,
pending-save bounds and serialized clear. No production storage deadline,
permission check or admission rule is relaxed.

Persisted unread assertions deliberately migrate from the removed engine map
to the owner-local map, retaining exact stored times/values, bounds and late-
callback checks. Preference-only tests substitute `boundKey()` instead of
assigning a removed engine field; their held physical I/O/session fences remain
asserted, while real verified binding is covered by the RPC/integration tests.
`spacesCache.verified` retains its live REST discovery meaning, independent of
whether cache identity is pending; it is not SDK freshness or receipt authority.

The initial focused local-sections fixtures failed because the unbuilt private
copy had no bundle. The focused runner now uses the fixture's supported source-
backend mode; final full verification builds and tests isolated bundles.
New standalone fixtures also required correcting a generic deferred type and
an invalid empty last-seen timestamp to a canonical SDK observation. Earlier
failures remain recorded; only `verified-results.json` is the accepted freeze.

`source-boundary-audit.json` proves **90 non-cache engine methods and the other
162 runtime inputs unchanged**. Ten further domain methods differ only in
cache delegation/accessors. Shared verified-identity singleflight, draft
admission, exact receipt checks, current-source/retained SDK owners and physical
file safety are unchanged. Moved scheduler start/completion/invalidation
algorithms match the baseline after renaming; source observation/publication
order and renewal scope-loss behavior are preserved.

Only this index changes after the accepted freeze.
`final-handoff-checks.json` records isolated final docs/inventory/boundary/help,
source-lineage and preservation checks. All ten currently observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No install, checkout build/replacement, live service operation or
running-editor reload/reconnect occurred. The earlier catalogue preservation
exception and operator-observed/live acceptance gaps remain separately recorded.

`editor-engine.ts` is **1,437 lines**, down from 1,587; the dedicated lifecycle
owner is 210 lines. The native coordinator remains 2,350. This is **not completion
of the architecture goal**: shared identity/feature construction, preference/
draft composition and native workspace/render/action responsibilities remain.
The [feature guide](feature-architecture.md) documents ownership, integration
and normal failure tracing.

## Architecture refactor 6 — retained unread observation ledger

`src/retained-unread.ts` now owns last-confirmed SDK status, maximum actual
message activity, bounded preferred eviction and configuration-fingerprint
comparison/reset. The engine supplies detached timestamps and selected/fresh-room
IDs only when observing activity/status. Source health/fresh-room membership and
disk booleans/account/age remain separate authorities. No provider, timer,
subscription, parallel cache or public wire/native API is added.

Evidence: `/tmp/opencode/wbx-architecture-unread-ledger-7f2myla9/`.
**`verified-results.json`: all result codes zero on 577 frozen sources** —
**1,767 core passes / 15 deliberate opt-in skips**, **122 selected native +
90 drawn cells**, **71 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build integrity. Counts overlap; selected native/drawn cells
have zero skips. The focused gate passes **198 checks / six deliberate SDK
opt-in skips**, nine boundary/inventory checks and 13 selected native cells.

`unread-observations.json` records two new ordinary RPC workflows plus six
standalone ledger scenarios. Navigation retains newer actual-message
contradictions through source dropout, health-only recovery and an older SDK
observation. Current history remains usable; fresh per-room SDK catch-up removes
the contradiction without an implicit receipt. Four 500-room observation batches
exercise the 1,000-entry bound, selected-room retention and unknown—not read—
evicted/never-observed rows. A later fresh observation restores the normal
selected-room projection. These workflows perform **zero implicit receipts or
sends**.

The second RPC workflow explicitly stops/replaces the session and switches the
synthetic verified account with disk identity held. No old in-memory or disk flag
appears before verification, and old callbacks publish nothing. New-account
history and fresh SDK flags work after verification. Existing same-session
failure/reconnect, OAuth-profile/config/mode changes, disk expiry, scope loss,
pending receipts and actual newest-endpoint-beyond-display-cap regressions remain.
The configuration fingerprint is not verified account identity.

Six standalone tests cover unknown/activity-only/read/unread, monotonic actual
activity, detached inputs/projections, preferred/hard-bound eviction, pure
projection/insertion order and profile/reset distinctions. The existing snapshot
test now deliberately inspects the owner-local map instead of a removed engine
map, preserving exact value/order assertions and adding unchanged revision;
repeated snapshots still make **zero latest-message endpoint getter calls**.
Disk-only tests retain their assertion that restored flags enter neither the
retained SDK ledger nor the fresh-source set. Disk restore/retention keeps its
independent 1,000-entry bound.

`equivalence.test.ts` is a preserved offline differential probe. It extracts the
actual three ledger algorithms from the baseline engine and compares the new
owner over 2,501 initial observations plus **5,000 seeded transitions and
12,067 evictions**. Exact retained values, insertion order and composed
projections match, including configuration clearing and activity-only entries.
It runs against a byte-identical isolated copy of the accepted owner.

The first new eviction workflow incorrectly expected protection of a former
selection to survive inserting activity in a newly selected room under full
pressure. The corrected workflow checks protection **while selected**, legitimate
former-selection eviction as unknown, and subsequent fresh observation recovery.
No production eviction rule or existing assertion was relaxed; the earlier
failed candidate remains recorded in `second-results.json`.

`source-boundary-audit.json` verifies **110 non-ledger engine methods and the
other 161 runtime inputs unchanged**, including the current read-source owner,
native runtime, providers, worker/SDK and all exact-target mutation/receipt
admission. Source freshness, disk fallback, revocation, account/file-age/I/O
methods and failure policy retain their existing behavior. Session/source/room
integration only delegates history ownership; the ledger cannot declare
freshness, retry a write or start another owner.

Only this index changes after the verified freeze.
`final-handoff-checks.json` records isolated final docs/inventory/boundary/help,
differential, source-lineage and preservation checks. All ten currently observed
checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging
are preserved. No install, checkout build/replacement, live service operation or
running-editor reload/reconnect occurred. The earlier catalogue preservation
exception and operator-observed/live acceptance gaps remain separately recorded.

`editor-engine.ts` is **1,587 lines**, down from 1,597; the dedicated ledger is
48 lines. This is a small cohesive ownership extraction, not total-code-size
reduction or **completion of the architecture goal**. Disk-cache lifecycle,
feature construction and native workspace/render/action separation remain.
The [feature guide](feature-architecture.md) documents the three evidence
lifetimes, integration points and stale-flag tracing.

## Architecture refactor 5 — current read-source lifecycle

`src/read-source-lifecycle.ts` now owns the current SDK source, health/finite
diagnostics, source-scoped fresh rooms, bounded startup invalidations and
message-event evidence/deduplication. Fourteen fields leave `EditorEngine`,
replaced by one owner. Retained last-confirmed unread observations and
disk-cache/account/file-age ownership remain separate engine paths.
Constructor injection, the existing `startReadStatus` composition facade and
public wire/native APIs remain compatible.

Evidence: `/tmp/opencode/wbx-architecture-read-source-l63a0rgd/`.
**`verified-results.json`: all result codes zero on 575 frozen sources** —
**1,758 core passes / 15 deliberate opt-in skips**, **122 selected native +
90 drawn cells**, **70 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build integrity. Counts overlap; selected native/drawn cells
have zero skips. The corrected focused gate passes **190 checks / six deliberate
SDK opt-in skips**, eight boundary/inventory checks and 13 selected native cells.

`read-source-observations.json` records two ordinary RPC workflows plus six
standalone owner scenarios. Initial startup remains held until source settlement,
then the first visible list contains observed unread flags. Room selection and
ready history continue through same-source refresh failure and recovery using
one source. A healthy/empty result cannot freshen retained flags; never-observed
rooms stay unknown. These workflows perform **zero implicit receipts or sends**.

The second RPC workflow covers terminal loss, explicit OAuth/source renewal and
whole-session replacement. Old callbacks publish nothing. Same-session renewal
retains historical flags as stale until a fresh room observation arrives;
a new session drops old flags. Six standalone tests exercise held startup,
same-source degradation counters, terminal/replacement leases, bounded pending
changes, message privacy/freshness/deduplication and current-source-only operation
forwarding. Exact startup revocations survive a terminal source failure until
domain activation; overflow remains fail-closed.

Worker IPC validation, heartbeat/deadlines, physical receipt/reaction admission
and SDK adapters are unchanged. The new owner cannot read/write a disk cache,
select a messaging destination, infer membership loss from partial snapshots,
retry a write, or create another source during request forwarding. Existing
reaction uncertainty/recovery and pending-self-echo ordering remain covered.
Internal diagnostics expose only bounded counts, never provider details.

Source-dependent fixtures deliberately migrate off removed private
`readSource`/`readStatus`/`readRooms`/event-set fields. Reaction IPC tests now use
the existing source factory and real lifecycle startup rather than assigning
source state. The synthetic missing-worker case removes the optional reaction
method on a ready source; real failure callbacks separately prove context
invalidation. No expected safety category is broadened to hide a failure.
An overbroad boundary regexp that matched `readRoomsObserved()` was corrected.
A startup test's short filesystem polling loop was replaced by an explicit
source-created barrier after a rerun exposed the race; no production deadline or
assertion was relaxed. Earlier failed/focused results remain recorded.

`source-boundary-audit.json` verifies **101 non-source engine methods and the
other 160 runtime inputs unchanged**, including native code, physical worker,
SDK, wire validators and all other feature owners. Retained-unread projection
changes only its source accessors. Disk I/O/account/cache-age and genuine unread
observation methods are byte-identical. Exact receipt endpoint/freshness/no-retry
guards remain, with forwarding delegated to the current source. Fresh membership
commits before the application observation effect; retained/disk observations
still commit before store merge/publication, with no new intervening publication.

Only this index changes after the verified freeze.
`final-handoff-checks.json` records isolated final docs/inventory/boundary/help,
source-lineage and preservation checks. All ten currently observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No install, checkout build/replacement, live service operation or
running-editor reload/reconnect occurred. The earlier catalogue preservation
exception and operator-observed/live acceptance gaps remain separately recorded.

`editor-engine.ts` is **1,597 lines**, down from 1,698; the read-source owner is
174 lines. The native coordinator remains 2,350. This is **not completion of the
architecture goal**: retained unread/disk-cache ownership, feature construction
and native workspace/render/action decomposition remain. The
[feature guide](feature-architecture.md) documents lifetimes and tracing.

## Architecture refactor 4 — backend presence lifecycle

`src/presence-lifecycle.ts` now owns selected/viewport relevance, one refresh
timer, paced rolling turns, logical flights and bounded retained observations.
Nine fields and eight feature-private methods leave `EditorEngine`, replaced
by one owner and detached eligible-room context. Public provider-factory and
lookup/viewport/spaces APIs remain compatible. Engine session composition and
connected/listed/live-row admission remain outside the feature owner.

The existing `PeopleReadOwner` survives logical source/session replacement:
occupied physical HTTP slots, spent start budgets and service backoff are not
reset. Original `people-selected.ts` / `people-status.ts` retain identity checks,
bounded GETs, parsing, TTL, denial/refusal and Retry-After rules. No alternative
provider, physical pool, arbitrary lookup or generic feature framework is added.
Presence remains public REST, independent of SDK read-status/reaction health.

Evidence: `/tmp/opencode/wbx-architecture-presence-x7j0eugf/`.
**`final-results.json`: all result codes zero on 573 frozen sources** —
**1,749 core passes / 15 deliberate opt-in skips**, **122 selected native +
90 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build integrity. Counts overlap; selected native/drawn cells have
zero skips. The corrected focused gate passes **139 presence/People/reconciliation
checks**, seven boundary/inventory checks and 14 selected native cells.

`presence-observations.json` records ordinary RPC **A → B → A** navigation:
both room-open responses complete while B's presence HTTP remains physically
held; returning A is fresh with **zero additional A reads**, and late B cannot
republish. A separate RPC source-failure workflow preserves ready history through
**fresh → stale → fresh**, makes no negative-cache bypass read and recovers with
one membership/status pair, not a retry burst. Local navigation timings are
observations, not service-latency guarantees.

RPC session replacement clears old observations while two canceled HTTP reads
still occupy physical admission. A new source starts no HTTP through those
slots; old settlement publishes nothing. After physical settlement/backoff,
the current viewport successfully observes both rows. Standalone tests prove the
same lifecycle without constructing engine/OAuth/store/worker owners, including
16-row paced loading, synchronous offscreen return, expiry, revocation, opt-out/
demo source refusal and timer cleanup. Existing privacy, denial, identity,
parallel pacing, Retry-After and cancellation regressions remain intact.

Review caught an extraction regression: selected-peer refresh was incorrectly
conditioned on membership in the current bounded room list. The retained
`selected-room-regression.test.ts` probe against the earlier isolated candidate
fails at **3 reads versus the expected 5**. The final owner keeps selected,
non-revoked DM authority independent of viewport-row eligibility, as the original
engine did. New standalone and engine tests prove that a partial/capped list
cannot stop selected refresh, while actual deselection clears provider selection
and stops it. No membership absence is promoted into revocation evidence.

The first broader gate (`verified-results.json`) also found an older reconciliation
test injecting the removed private `engine.people` field. Its final replacement
spies on the real lifecycle's `deselect()` without replacing its implementation;
all existing exact-revocation/partial-source/late-callback assertions remain.
The standalone regression additionally checks real provider deselection. These
earlier failures remain recorded; only `final-results.json` is acceptance.

`source-boundary-audit.json` verifies **105 non-presence engine methods and the
other 159 runtime inputs unchanged**: native runtime, connection/channel, backend
worker/wire, providers/shared admission, SDK and mutation/receipt/reaction guards.
State-failure, stop, revocation and navigation effects only delegate presence
ownership; loaded/live-row wire guards remain unchanged. The engine retains the
start-session option comparison; the lifecycle owns its fallback presentation,
not an additional authentication or messaging-session authority.

Only this verification record changes after the final freeze.
`final-handoff-checks.json` records isolated documentation/inventory/boundary/help
checks, exact source lineage and preservation of all ten currently observed
checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging.
No install, checkout build/replacement, live operation or running-editor reload/
reconnect occurred. The earlier catalogue preservation exception, operator-
observed accessibility and live acceptance gaps remain separately recorded.

`editor-engine.ts` is **1,698 lines**, down from 1,875. The dedicated lifecycle
owner is 250 lines; the native coordinator remains 2,350. This is **not completion
of the architecture goal**: backend read-source/unread/cache and construction,
plus native workspace/render/action decomposition, remain. The
[feature guide](feature-architecture.md) documents ownership and tracing paths.

## Architecture refactor 3 — native connection and handshake owner

`autoload/wbx/connection.vim` now owns command admission, protocol readiness,
negotiated feature assertions, disconnected status, hello acceptance and startup
flag compatibility. It composes the unchanged `rpc_channel.vim`; there is no
second request counter, pending table, queue or transport generation.
`autoload/wbx.vim` retains domain state application/cleanup and native workspace/
action integration, consuming detached feature lists and connection status.
Public RPC/receive/exit APIs and the existing internal hello facade are retained.

Evidence: `/tmp/opencode/wbx-architecture-connection-e50vu46g/`.
**`final-results.json`: all result codes zero on 571 frozen sources** —
**1,739 core passes / 15 deliberate opt-in skips**, **122 selected native +
90 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build integrity. Counts overlap; selected native/drawn cells
have zero skips. Standard/focused inventories include the new connection fixtures.

`connection-observations.json` records **seven standalone scenarios and four
coordinator workflows per editor**, including three drawn foreground checks.
They cover configuration rejection before reset, failed start, held hello/FIFO,
legacy downgrade/exact notices, detached assertions, callback retirement,
invalid/error hello, passive non-reconnect and explicit recovery without replay.
Old hello/request replies cannot re-enable assertions on a replacement transport.
Existing RPC startup/navigation, real transport/protocol and feature-negotiation
regressions remain covered.

The normal workflow runs messaging **ready → failed → ready → idle → ready**
without restarting transport. At every phase the actual public
`:WebexMicrophone` command produces the exact `microphone.toggle` request and
receives an inert acknowledgement, independently of messaging recovery.
Five controls per editor preserve foreground text/full unsynced undo, changedtick,
focus, view and `breakat`. Four deliberate simulated starts cover initial startup,
explicit reconnect, invalid negotiation and explicit recovery; no Webex/media
operation occurs. A messaging failure retains handshake assertions; transport loss
clears them. Domain messaging and meeting admission intentionally remain distinct.

`source-boundary-audit.json` proves **130 non-lifecycle coordinator functions
change only to connection accessors**, domain prepare/accept/exit effects remain,
wire validation/routing and startup compatibility notices are preserved, and the
other **158 runtime inputs** are byte-identical. These include the request channel,
physical transport, feature catalogue/validators, backend, worker and SDK.
Connection reset now retires correlation before the application Prepare effect;
the state-only reset assignments and subsequent domain effects retain their
semantics. Physical transport still owns framing/generation fences and its
synchronous exit callback; write uncertainty and physical reservations never
move into the connection.

The first candidate had a fixture notice-count error (three startup diagnostics,
not two), corrected without weakening the exact compatibility-notice assertions.
The initial passing broader gate used a shorthand inert meeting action; the final
accepted freeze replaces it with the actual public command and checks its exact
payload. Both earlier results remain recorded; only `final-results.json` is the
final source freeze. Only this index changes afterward.

`final-handoff-checks.json` records isolated final documentation/inventory/boundary/
help checks, source lineage and preservation. All ten currently observed checkout
artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and staging are
preserved. No dependency install, checkout build/replacement, live operation or
running-editor reload/reconnect occurred. The earlier catalogue preservation
exception remains separate; operator-observed accessibility and live acceptance
are not implied by this refactor.

The native coordinator is **2,350 lines**, down from 2,404; its three connection
globals are gone. The connection owner is 114 lines and composes the unchanged
70-line request owner. This is **not completion of the architecture goal**:
workspace/render/action and backend presence/read-source/cache decomposition
remain. The [feature guide](feature-architecture.md) documents the new ownership,
lifetime differences, startup tracing and remaining work.

## Architecture refactor 2 — native request correlation and startup owner

`autoload/wbx/rpc_channel.vim` now owns request IDs, pending callbacks, the bounded
startup FIFO and per-request passive-error handling. `wbx#rpc()` remains the public
adapter. Four narrow ports supply startup, derived transport evidence, writing
and notices; the channel owns no jobs, buffers, focus, domain state, feature
caches, physical reservations or write uncertainty. Handshake capabilities remain
with the coordinator, not duplicated as channel state.

Evidence: `/tmp/opencode/wbx-architecture-rpc-_p1jfnk0/`.
`rpc-observations.json` records **10 standalone channel scenarios and four
coordinator workflows per editor**, with two actual drawn foreground-text checks.
They cover held hello/FIFO startup, a 32-entry queue, out-of-order/duplicate
responses, reentrant callbacks/reset, monotonic IDs across reconnect and no replay.
Normal returning-A navigation completes while B's response remains held; its late
acknowledgement cannot select B or alter A's history. Both explicit simulated
transport starts preserve unrelated text/full unsynced undo, focus, view and
`breakat`. There are no provider, send, mutation or receipt operations.

Reset during flush fences the remaining detached old queue using pending-ID
ownership, without another epoch. Reset forgets callbacks, not delivery evidence.
Envelope validation still precedes response dispatch; domain notification routing,
send/selection/receipt guards and startup capability downgrades remain unchanged.
Passive reaction errors retain the exact per-request quiet policy: no startup,
no startup queue, no wire policy field and no suppression of other explicit errors.
`:WebexHealth` now adds only `rpc_requests` pending/queued counts and the last
allocated ID; it does not expose targets, bodies or callbacks.

**`verified-results.json`: all result codes zero on 568 frozen sources** —
**1,738 core passes / 15 deliberate opt-in skips**, **118 selected native +
86 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build and
two-isolated-build integrity. Counts overlap; selected native/drawn cells have
zero skips. Both inventories include the new fixtures. Real job/protocol,
quiet-error, reaction-return, uncertainty, agenda, People and confirmation checks
remain covered.

`red-results.json` retains the new-contract failures (missing channel/diagnostics),
not a claim that ordinary baseline navigation was broken. The first candidate
exposed a fixture-only Vim reserved-name collision with `count`; renaming that
variable preserves the assertions. `source-boundary-audit.json` verifies all
other 157 runtime inputs, exact domain guards and notification routing unchanged.
The Send body changes only its existing request-counter accessor.

Only this verification record changes after the accepted freeze.
`final-handoff-checks.json` records final isolated docs/inventory/boundary/help and
lineage checks. All ten currently observed checkout artifacts, 45 pinned SDK
inputs, installed toolchain, HEAD and staging are preserved. No checkout build/
replacement, install, live operation or running-editor reload/reconnect occurred.
The catalogue artifact exception remains recorded separately.

The native coordinator is **2,404 lines**, down from 2,445; its three request
globals are replaced by one dedicated owner. The owner is 70 lines. This is
**not completion of the architecture goal**: handshake/session lifecycle,
workspace/rendering/actions and backend presence/read-source/cache decomposition
remain. The [feature guide](feature-architecture.md) documents those boundaries.

## Architecture refactor 1 — independent agenda lifecycle

`src/upcoming-agenda.ts` now owns provider lifetime, the reconciliation timer and
the committed URL-free agenda projection/revision. The engine composes narrow
session/provider/change ports, retaining authentication and explicit join
admission. Credential renewal reuses the provider's physical owner while replacing
callback ownership. No generic feature registry or second provider/cache is added.
The [feature guide](feature-architecture.md) documents responsibility boundaries,
how to add a feature, request tracing and the remaining decomposition.

Evidence: `/tmp/opencode/wbx-architecture-agenda-889m_vp4/`.
`red-results.json` reproduces **12 application broadcasts from six unchanged
cached refreshes**. The extracted owner returns those six results with **zero
broadcasts or application/agenda revision changes**. `workflow-observations.json`
records real RPC A → B → A navigation completing while agenda service reads remain
held, followed by independent agenda settlement. Local timings are observations,
not provider-latency guarantees. Standalone owner tests need no engine/OAuth/store/
RPC construction and cover renewal, stop/restart, detached projection and expiry.

**`verified-results.json`: all result codes zero on 565 frozen sources** —
**1,737 core passes / 15 deliberate opt-in skips**, **114 selected native +
82 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build and
two-isolated-build integrity. Counts overlap; selected native/drawn cells have
zero skips. All 45 focused owner/provider/integration/guide checks also pass.
`final-handoff-checks.json` records isolated final docs/inventory/boundary/help
checks and exact lineage/preservation. Only this index changes after that freeze.

`source-boundary-audit.json` verifies the other 156 production runtime inputs,
native coordinator, provider, worker/SDK/wire and exact-target/mutation/receipt
methods are unchanged. All ten currently observed artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging are preserved. No checkout build/replacement,
install, live operation or running-editor reload/reconnect occurred. The prior
catalogue exception remains separate.

This is the **first boundary, not completion of the architecture goal**:
`editor-engine.ts` is 1,875 lines (from 1,916); `autoload/wbx.vim` remains 2,445.
The new agenda owner is 121 lines. Native RPC/session/workspace and backend
presence/read-source/cache decomposition remain; native RPC ownership is next.

## Real native keyboard confirmations — offline acceptance, assistive readout open

New fixture: `test/editor/native-confirmations.vim`. Production `confirm()` and
consent helpers are not replaced. The isolated drawn driver requires the actual
prompt and `[C]ancel` default buttons before sending keyboard input to the child's
private controlling PTY. It does not interact with the running editor. The
preceding reaction menu choice and transport replies are inert/deterministic;
the final consent decision comes from the native editor.

Evidence: `/tmp/opencode/wbx-native-confirm-jddetc6m/`.
`confirmation-observations.json` records **50 actual native prompt keypresses /
52 scenarios per editor**: **14 default Enters, 14 Escapes, 13 explicit Cancels,
nine deliberate affirmatives**. It retains actual native button text for
Yes/Detach/Discard. Seven affirmative helper controls prove input was consumed
without attaching an action. Two additional affirmatives accept only the first
mention gate; default Enter/Escape at the separate `@all` gate still blocks send.
All seven helper owners plus inline Section-clear confirmation are exercised.

Real send/edit/delete/reaction controllers verify default Cancel, Escape and C.
Reaction resolution and local-group clearing also remain inert on cancellation.
Ordinary composer/edit/history Enter/write perform zero sends/submissions; Insert
Enter remains a native newline with native undo. Cancellation retains text/full
undo, focus, changedtick and `breakat`. Only 13 deliberate inert preparation/discard
requests occur: four action prepares, three action discards, three reaction
prepares and three reaction discards. There are **zero sends, mutations, receipts,
resolution requests, preference writes or backend starts**.

Headless cells check Enter/write only and label that scope explicitly; they are
not claimed as native keyboard confirmation acceptance. The drawn cells provide
that evidence. Older consent-stub fault fixtures remain intact.

**`verified-results.json`: all result codes zero on 561 frozen sources** —
**1,729 core passes / 15 deliberate opt-in skips**, **110 selected native +
78 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build candidate integrity. Counts overlap; selected native/drawn
cells have zero skips. Both standard and focused inventories include the fixture.
People details, reaction-return, uncertainty, receipt, catalogue, native chooser
and earlier mention-picker regressions remain covered.

Early failed attempts remain recorded: a fixture state omitted required Section
persistence; the driver's plan file needed atomic publication; a source-test
regexp mistakenly matched a transport-stub variable. Corrections retain the real
keyboard and no-write assertions, not stubbed consent. `source-boundary-audit.json`
verifies **all 157 production runtime inputs are byte-identical** to the baseline.
This slice changes tests, the private PTY driver, inventories and guidance only.
No consent, exact-target, mutation, uncertainty, receipt or provider guard changed.

Only ledger/index recording follows the accepted freeze.
`final-handoff-checks.json` records final isolated docs/inventory/dialog tests,
both-editor help generation and lineage/preservation checks. All ten currently
observed checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging are preserved. No install, checkout build/replacement, live operation or
running-editor activation/reload/reconnect occurred. The earlier catalogue
artifact exception is retained, not relabeled as a clean original gate.

**Operator-observed terminal/assistive readout remains NOT RUN.** Post-activation
People/reaction workflows and the exact original live reaction-delay cause also
remain unverified. Keyboard automation is not assistive-technology, live-service
or complete-review acceptance.

## Navigable native People details — offline acceptance

`:WebexPeople` / `Wp` now opens a read-only native local snapshot of the selected
conversation, not a popup or a provider lookup. Native motions/search/copy reach
complete Unicode fields and textual presence/observation age. Local `r`
regenerates published text only; `q` returns to the exact originating window.
Mappings disabled/shadowed, annotations/promoted buffers and full native undo
remain user-owned. Enter/write never send or acknowledge.

Automatic DM header/Spaces presence remains the default. Opt-out still wins,
including stale ready header data and retained fields in newly generated details.
Existing snapshots stay inert text. `:WebexPeopleRefresh` is the separate explicit
provider read: ready selected DM, known enabled capability/grant and matching
People association, plus clean owned same-room/session context from details.
Snapshot metadata only refuses, never chooses a provider target; RPC params remain
`{}`. An A snapshot cannot refresh B. State/disconnect/late responses never repaint,
close, reopen or focus details.

Evidence: `/tmp/opencode/wbx-people-native-ticlfc68/`.
**`verified-results.json`: all result codes zero on 560 frozen sources** —
**1,728 core passes / 15 deliberate opt-in skips**, **106 selected native +
74 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied build
and two-isolated-build candidate integrity. Counts overlap; selected native/drawn
cells have zero skips. Prior reaction-return, quiet-error, uncertainty, catalogue,
unread and receipt regressions remain covered, together with passive People
viewport/cache/repaint and full navigation fixtures.

`people-observations.json` records **13 main scenarios and nine drawn text states
per editor**, plus **14 ownership/boundary scenarios**. These include all 12
edit/rename/type × state/disconnect/reply/command cases, exact tab returns,
full unsynced foreground undo, mapping conflicts, old-session refusal, external
close/reopen and late replies. Complete Unicode text survives native reflow, with
`Presence Active` drawn in a **24-column split**. Main-fixture requests are exactly
four deliberately explicit inert `people.lookup` reads and zero backend starts;
the ownership matrix separately admits 14 explicit inert reads. Inspection and
local `r` issue none. Unchanged passive viewport reports remain independently
eligible; provider pacing was not disabled to make these assertions pass.

`red-results.json` retains the failing pre-implementation native/drawn cases.
`test-migration.json` records the deliberate replacement of overlay geometry/
toggle assertions, not removal of ownership or receipt coverage. Original files
remain under `before/`. Intermediate fixture corrections retain strict assertions:
explicitly release only fixture-created alternate-name placeholders after rename;
start deliberate commands at native input boundaries; keep one promoted window
per type visible while explicitly closing other fixture windows; distinguish
focused details from focused history for notification visibility. Production
list admission and endpoint/fold/wrapped-row safeguards were not loosened.

The popup lifecycle is removed rather than replaced: `autoload/wbx/people.vim`
shrinks **513 → 298 lines**. `source-boundary-audit.json` verifies byte-identical
passive helpers and unchanged backend/SDK, list ownership/return, target/RPC/
receipt guards, reaction code, validators and native options. Only ledger/index
recording changes follow the passing freeze. `final-handoff-checks.json` records
isolated documentation/inventory/help checks, exact source lineage and preservation
of all ten currently observed checkout artifacts, 45 pinned SDK inputs, installed
toolchain, HEAD and staging. The earlier catalogue artifact exception remains
separate, not erased. No install, checkout build/replacement, live operation or
running-editor reload/reconnect occurred.

This was not live or operator-observed accessibility acceptance. Native keyboard
confirmation is subsequently checked above; assistive readout, post-activation
People/reaction workflows and the exact original live reaction delay remain open.

## Reaction return to a loaded space — offline correction

The user reported A → B → A losing previously loaded reactions, showing
unavailable and recovering after roughly 30 seconds. That ordinary workflow was
not established by the earlier synthetic gates. The new fixture reproduces the
cache loss with the actual accepted-state coordinator, renderer and scheduler;
only transport replies and time are inert.

Cache ownership now follows the authenticated session/source, independently of
selected-view callback lifetime. A returning exact loaded room/message/content
can reuse its observation immediately while an old-room read remains physically
pending. One global least-recently-used cache holds at most 64 entries, including
unavailable entries; it is not a per-room allocation. Recoverably degraded data
is explicitly cached; health alone never freshens it. Legacy selectors lacking
validated source-lifetime proof remain view-scoped. Revocation, source/session/
account replacement, terminal loss, opt-out and changed/deleted loaded targets
still evict observations. Old callbacks remain fenced and no cached observation
grants inspection, write or receipt authority.

Evidence: `/tmp/opencode/wbx-reaction-return-t5s4a2p5/`.
`red-results.json` preserves A's lost snapshot while B is held.
`degraded-red-results.json` independently replays the pre-fix health-transition
case: both editors show the exact `Reactions unavailable` text instead of A's
previously observed labels, while B remains held. An intermediate
fixture's headless-Vim viewport assumption was corrected with an explicitly
positioned loaded target. `legacy-red-results.json` then reproduces the missing
source-metadata proof, and `legacy-green-results.json` confirms the conservative
fallback. No existing guard regression was removed.

**Accepted offline slice:** `settled-results.json`, all result codes zero on
**559 frozen sources**: **1,728 core passes / 15 deliberate opt-in skips**, all
**90 selected native + 58 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; selected native/drawn cells have zero skips. Standard/focused
inventories include the new fixture. Existing status, retention, quiet errors,
ASCII rendering, screen anchors, catalogue, unread provenance, uncertainty and
receipt regressions remain covered.

`return-observations.json` records **13 scenarios and two drawn checks per
editor**, with zero assertion errors and zero backend starts. A's cached labels
are drawn before B's physical completion, locally restored in **about 9–15 ms
after returning history is available**. Thirty seconds of logical delay are
simulated while B remains held. These measurements exclude real provider/history
latency; the user's exact live delay and post-activation result remain unverified.
The fixture also covers completed reads, late callbacks, source recovery,
exact-room collisions, changed-content eviction, lifetime loss, legacy fallback,
70-room cache pressure and incomplete empty observations remaining quiet.
Only five deliberate passive `messages.reactionsBatch` reads occur per fixture;
there are no receipt, inspection, preparation, mutation or history requests.

Foreground native text/full unsynced undo, focus and options remain intact.
`final-source-boundary-audit.json` verifies unchanged explicit reaction/
uncertainty, RPC, receipt and callback guard functions, plus unchanged backend/
SDK files. The change does not shorten deadlines, retry writes or loosen admission.
All ten currently observed checkout artifacts, 45 pinned SDK inputs, installed
toolchain, HEAD and staging are preserved against this slice's baseline. This
does not erase the earlier catalogue artifact-preservation exception below.
Only the ledger/index change after the accepted freeze;
`final-handoff-checks.json` records final isolated docs/help and preservation.
No checkout build/replacement, install, live service call or running-editor
reload/reconnect occurred. This was not full review or live/assistive-technology
acceptance. People details, then outstanding, are implemented by the later slice
above; confirmation/accessibility acceptance remains open.

## Cache-independent catalogue verification — tests passed, artifact exception

Catalogue discovery now publishes optional finite `roomsStatus` evidence
independently of `spaces_cache`. Failed/unverified reads never imply no spaces,
and an empty page with continuation cannot claim absence. Failed refreshes keep
loaded rows and point to the existing explicit `:WebexRefresh` command in Spaces.
The field is presentation evidence, not membership, write or receipt authority.
Legacy backends remain accepted but need explicit verification evidence before
an absence claim; existing cache verification is a fallback only without the field.

Evidence: `/tmp/opencode/wbx-catalogue-6w74ih2e/`. `red-results.json` retains the
pre-implementation failures. Focused `second-results.json` passes 25 store/engine
checks, eight selected native checks and both editors' drawn catalogue fixtures.
The fixtures cover pending/failure/explicit retry/successful empty and nonempty,
later failed refreshes, pagination, cache/legacy combinations, annotations and
unchanged foreground native work. Only two deliberate explicit `rooms.list`
reads occur in each native fixture; no automatic retry/open/receipt/mutation or
backend start is performed.

The first broad `verified-results.json` stopped at a new test's TypeScript
empty-array narrowing error; the copied build passed. The assertion now compares
projected exact room IDs, retaining full emptiness verification. The next
`settled-results.json` passed all tests but failed strict source lineage because
the ledger/index were edited while it ran. `recording-lineage.json` proves those
were the only changes. Both failed reports are retained, not relabeled.

**Source/test result:** `final-results.json`, all test result codes zero on
**558 frozen sources**: **1,728 core passes / 15 deliberate opt-in skips**, all
**88 selected native + 56 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; selected native/drawn cells have zero skips. Source lineage,
45 SDK inputs, installed toolchain, HEAD and staging pass preservation.

`catalogue-observations.json` records **16 drawn transitions and 17 scenario
checks per editor**, with syntax off/monochrome. Store/engine/JSON-RPC tests cover
pending/failure/explicit retry/successful empty and nonempty, old-session results,
subsequent failure, cache-disabled operation, SDK metadata, pagination and the
existing cache/unread-startup gates. Native tests also cover legacy evidence,
exact loaded rows, annotation protection and unsynced foreground native undo.
Only two deliberate explicit `rooms.list` reads occur per fixture; there are no
automatic retries, open/fetch-history/receipt/mutation operations or backend starts.

**Strict preservation exception:** `final-results.json` remains failed overall.
Six checkout artifacts (`cli`, `editor-main`, `read-status-worker` and their maps)
changed during that gate. All ten current artifacts match the independently
built candidate, but six differ from the starting baseline. The change is
unattributed; the agent invoked no checkout build/replacement and did not restore
or overwrite any current artifact. `artifact-change-observation.json` retains
both byte sets. `handoff-status.json` retains the failed condition and the paused
recording handoff after the reported reaction-return bug. The subsequent
return-path slice above separately verifies preservation of the newly observed
artifacts. Do not describe the original catalogue gate as all-artifacts-unchanged.

`source-boundary-audit.json` verifies unchanged cache/startup, selection,
mutation/receipt and request/capability/option guards. Only the ledger/index
change after the final source freeze. No live operation, install or agent
running-editor reload/reconnect occurred. This is source/offline verification,
not full review completion or evidence of editor activation. Navigable People
details and confirmation/operator-observed accessibility remain outstanding.

## Highlighted-space unread provenance — current follow-up

`:WebexUnreadStatus` is a read-only native textual snapshot of the exact
highlighted unchanged Spaces room row, not the open destination, a title parsed
for markers or the nearest row. It separately states published server
READ/UNREAD/UNKNOWN and freshness at capture, unread-source readiness,
cached/browse-only metadata, session-only local override and list emphasis.
Missing flags remain unknown; stale/offline/cache flags are historical, not
receipt authority. Freshness follows the published source, not another provider
lookup or wall-clock guarantee. Bounded sanitized title text is not identity;
the exact room ID stays visible.

The summary needs no backend capability/grant/start, including on retained
offline rows. It never opens/selects, fetches, acknowledges, sends or changes
local unread state. Enter/write and snapshot metadata are inert; `q` returns
to the exact originating window/tab. Reopen from a current Spaces room row
to refresh; accepted updates never auto-repaint/focus this snapshot. Native
mapping conflicts/opt-outs and annotation/promotion protection remain effective.

Evidence: `/tmp/opencode/wbx-space-provenance-nj27wrjf/`. The pre-implementation
regression reproduces the missing command. A fixture-only renderer-undo mismatch
was corrected by invoking inspection from a normal native input boundary;
complete undo-tree assertions remain. The first broader `verified-results.json`
remains failed: its only nonzero results were two invalid drawn invocations of
`local-unread-events`, already headless-only in the inventory, not feature
assertion failures. `matrix-correction.json` preserves those errors, retains
native model coverage, validates all remaining drawn cases and records identical
source between the initial and final frozen candidates.

**Accepted:** `settled-results.json`, all result codes zero on **557 frozen
sources**: **1,722 core passes / 15 deliberate opt-in skips**, all **86 selected
native + 54 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. Standard and focused inventories
include `unread-provenance`. Existing local-unread/model/Sections, receipt,
recovery, action-catalogue, native-list and reaction regressions remain covered.

`unread-provenance-observations.json` records **21 drawn scenarios / 63 textual
server/local/emphasis checks per editor**, 24 scenario checks, zero assertion
errors, zero RPCs and zero backend starts. The real accepted-state renderer and
local unread model are exercised; only transport is inert. Coverage includes
fresh/stale read/unread; unknown under ready/failed/connecting/off sources;
local-read display versus server-unread or unknown; local-unread emphasis ahead
of server-read; cached/disconnected rows; explicit snapshot reopening; duplicate/
misleading/sanitized titles; forged rows; and section/header/footer refusal.
With syntax off/monochrome and automatic read-on-open enabled, inspection and
Enter/write issue no selection, fetch, send or receipt. A fresh-looking summary
cannot pass the existing history-endpoint receipt guard.

Raw published state, selected destination, local counters, native text/full undo,
independent window/tab returns and annotation/promotion protections are retained.
`source-boundary-audit.json` verifies unchanged open/receipt/local-overlay/render/
list-ownership functions and an unchanged backend engine. No new count, receipt/
inspection authority, config flag or capability was introduced.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No install, new live operation, checkout build/replacement
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate or live/assistive-
technology acceptance. Catalogue verification, navigable People details and
unmocked confirmation/operator-observed accessibility remain in the ledger.

## ASCII reaction presentation — current follow-up

The shared optional Vim/Lua `reaction_display='text'` preference renders supported
groups as ASCII labels on separate virtual rows, wrapping to the narrowest
visible current-tab history text width, including gutters. Default `icons` keeps
glyphs; invalid values also fall back to icons. Cached qualification and unavailable
diagnostics are ASCII too. Missing counts remain absent, and incomplete empty
observations remain quiet, never zero/absence claims. Supplied long values
continue on virtual rows instead of silently truncating digits.

This is presentation only: source ownership, observation timestamps/coverage,
cache freshness, existing read admission and exact write/inspection/receipt
guards remain unchanged. The layout signature includes virtual-row height so
style/count wrapping changes use the existing bounded native screen-anchor
preservation. Native wrap/breakat/gutter/theme/window options are not replaced.
Resize recomputes presentation without changing source identity or freshness.

Evidence: `/tmp/opencode/wbx-reaction-text-rtebaaar/`. The pre-implementation
fixture reproduces the missing option and glyph-only output. Intermediate
fixture failures/corrections remain preserved: exact native split widths, fresh
screen redraws, independent cursor placement and actually drawn badges above the
reading cursor are now asserted. The intermediate `verified-results.json` remains
failed: its only core failure was the missed 28-to-29 native-option assertion.
Both native and core contracts now check 29 entries and the exact new optional
display/default/Lua-forwarding row, retaining complete documentation/catalogue
equality and exclusion of this display setting from private RPC admission.
`corrected-contracts-results.json` records the isolated contract/docs confirmation.

**Accepted:** `settled-results.json`, all result codes zero on **556 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **76 selected
native + 46 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. Standard and focused fixture
inventories include `reaction-text`; existing icon rendering, reaction
status/quiet/retention/anchors, unresolved exact-request recovery and native/core
option contracts remain covered.

`text-fallback-observations.json` records six drawn checks per editor: all seven
supported ASCII labels in real **20- and 32-column splits**, supplied full
safe-integer counts without numeric clipping, cached qualification, resize to
**24 columns with a native gutter**, and syntax-off/monochrome text. Both
independent reading anchors retain **screen row 43** through the multiline height
change, with the changed badge actually drawn above them. This demonstrates
representable native positions, not an arbitrary scrolling/buffer-boundary promise.
Seven scenario checks per editor pass with zero RPCs, preserving native
text/full undo (including unrelated unsynced work), focus, blank separators,
source data/coverage flags, opt-out and annotations. Invalid values and Lua
forwarding are tested; no missing count or incomplete empty result becomes zero.

`source-boundary-audit.json` verifies unchanged source/cache/read-admission/
callback functions and unchanged explicit-reaction/backend-controller files.
No new write, receipt, inspection or uncertainty-resolution authority exists.
All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No install, new live operation, checkout build/replacement
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate, complete live
vocabulary/count verification or operator-observed assistive-technology acceptance.
The later unread-provenance follow-up is recorded above. Catalogue verification,
People details and unmocked confirmation/operator-observed accessibility work
remain in the ledger.

## Retained unresolved reaction-write inspection — current follow-up

`:WebexReactionUnresolved` is a local read-only native list over the existing
pending/unknown maps. It shows exact room/message/original request IDs without
provider reads, unlocks, receipts or mutation replay. It is available from any
buffer, offline, with reactions disabled or without feature negotiation. The
named command is listed in Recovery; no default key family or `Wnr` meaning
changes. `r` refreshes only this local snapshot, `q` returns to the exact origin,
and native search/copy work normally. Enter/write and row metadata carry no
action authority.

Records survive notice dismissal and room/view/backend-session changes within
the running editor. They may predate the current backend/account and are **not**
verified server/account state. No new uncertainty owner or persistence journal
was added; editor restart does not preserve these maps and still locks all new
targets. Empty is only no locally retained record, never a server absence claim.
Callbacks do not auto-repaint/focus the snapshot. Recovery still requires
separate inspection in Webex, an unchanged exact loaded-history target, explicit
confirmation and the original retained request ID. Failed/stale resolution does
not retire local unknowns.

Evidence: `/tmp/opencode/wbx-reaction-unresolved-4ke1gz55/`. The pre-implementation
native run reproduces the missing command. Intermediate failed fixture evidence
is retained: ready-only context on an idle packet, physical-cursor screen
coordinates and an absolute tab-number assumption were corrected using accepted
protocol validation, native screen positions and exact originating-tab checks.
No production validator, exact-target guard or annotation boundary was removed.

**Accepted:** `verified-results.json`, all result codes zero on **555 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **74 selected
native + 44 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core/SDK counts overlap;
selected native/drawn cells have zero skips. The new real-coordinator fixture is
in standard and focused inventories. Existing actual-demo reactions, exact
controller resolution, status/quiet/retention, action catalogue and native
list-boundary regressions are included.

`unresolved-inspection-observations.json` records six drawn text checks per
editor (unknown state and exact room/message/request, including offline
rediscovery), seven scenario checks, zero assertion errors and zero backend
starts. Every local inspection asserts zero RPC delta, including no submissions/
replays. Four deliberate inert-transport setup submissions create the pending,
unknown and settled test cases; they are not inspection side effects or live
writes. Tests cover dismissed notices, room/session/offline/opt-out round trips,
multiple unknowns, forged view metadata, inert Enter/write, canceled/failed/stale
resolution, exact successful resolution, and invalidated pending writes despite
late old success ACKs.

Native text/full undo (including unrelated unsynced work), annotation/promotion
protection, independent tab returns and mapping opt-outs are preserved. The
source audit verifies byte-for-byte preservation of existing target/read/
preparation/resolution/invalidation guard functions; no backend mutation or
exact-request logic changed.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No install, new live operation, checkout build/replacement
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate or live/assistive-
technology acceptance. Later ASCII and unread-provenance follow-ups are recorded
above. Catalogue verification, People details and unmocked confirmation/
operator-observed accessibility work remain tracked in the ledger.

## Explicit reaction waiting/reading status — current follow-up

Explicit commands now acknowledge a held passive read immediately with
`[reactions: waiting]` in their originating history window, then show
`[reactions: reading]` only for admitted summary/preparation/inspection reads.
No loading rows, popup, text/undo/focus changes or replacement of user-owned
statusline options are used for acknowledgement. The plain
`wbx#buffer_status([bufnr[, winid]])` accessor is available to custom integrations;
native rendering targets the correct window even when two splits share a buffer.
Hot progress access reads fixed local data, with no main-state copy, target scan
or I/O. Progress clears before details/choices/confirmation and on result/error,
stale intent or refused admission; local choices are not called backend reads.

Display intent and physical read admission are separate. A canceled token never
frees an outstanding same-session explicit read; repeated commands/UI callbacks
cannot overlap it. A newer intent waiting behind passive work may supersede the
old waiting target, not the physical request. Target/room/context/source/health/
session changes, revocation, opt-out, content changes and leave/return fence old
intents and callbacks. Revocation/not-ready/ready presentation resets cannot
resume passive work early. A replacement backend session releases only its
orphan, and old/duplicate callbacks cannot clear newer feedback.

Evidence: `/tmp/opencode/wbx-reaction-status-ab0awjf_/`. `red-native.log`
reproduces missing feedback and competing explicit reads. `background-red.log`
then reproduces false cancellation caused by independent background-window
editing. The correction separates global source/buffer invalidation from
origin-window cursor validation. Failed reproductions remain preserved.

**Accepted:** `verified-results.json`, all result codes zero on **554 frozen
sources**: **1,721 core passes / 15 deliberate opt-in skips**, all **68 selected
native + 38 drawn cells**, **68 affected backend/SDK checks**, TypeScript, copied
build and two-isolated-build candidate integrity. Core and SDK counts overlap;
selected native/drawn cells have zero skips. Existing quiet-error, retention,
screen-anchor, framing, notification, actual-demo reaction and exact-request
uncertainty regressions are included. The new fixture is in standard and focused
verification inventories.

`statusline-observations.json` records, per editor, **23 drawn statusline checks**
(13 waiting, 10 reading), 17 scenario checks, zero assertion errors and zero
backend starts. The real RPC coordinator, passive scheduler, accepted-state
bridge and native statuslines are exercised; only transport/chooser interaction
is inert. Text, changed ticks, complete undo (including unrelated unsynced work),
focus, view, native `breakat` and user statusline options are preserved. Another
split sharing the same history buffer does not inherit the progress token.
The same fixture covers admission refusal, stale/session-orphan recovery,
duplicate callbacks and no mutation submission from the status flow.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No install, new live operation, checkout build/replacement
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate or live/assistive-
technology acceptance. Later unresolved-write inspection, ASCII and unread-
provenance follow-ups are recorded above. Catalogue verification, People details
and unmocked confirmation/operator-observed accessibility work remain in the ledger.

## Quiet passive reaction errors — current follow-up

The requested narrowly scoped policy is implemented only for individually marked
passive `messages.reactions` / negotiated `messages.reactionsBatch` requests.
Metadata stays local to RPC admission/response bookkeeping; no wire field,
capability, configuration-wide mute or backend authorization changes. Ordinary
errors still reach the owner callback and its existing negative TTL/read-only
retry logic, but do not append foreground notices or replace unrelated errors.
Unready/disconnected passive calls refuse locally without starting/reconnecting
or queuing a backend request.

Finite `phase:problem` categories and aggregate pending/failed target counts are
inspectable under `reaction_reads` in `:WebexHealth`, including after failed cached
refreshes. Unknown provider text becomes `summary:unavailable`; no provider body
or message/own-reaction identity enters those diagnostics. Success or context
invalidation removes the corresponding failure state. Explicit reaction reads
still report one sanitized reason plus health/refresh guidance. A quiet label
cannot suppress mutation/receipt/uncertainty or unrelated RPC errors, nor protocol
validation/disconnection. No mutation retry or uncertainty resolution was added.

Evidence: `/tmp/opencode/wbx-reaction-quiet-cppaavzp/`. The pre-fix native run
reproduces foreground-message/last-notice replacement, provider text exposure
and an unwanted backend-start attempt after disconnect. The new fixture uses the
real RPC coordinator/scheduler; only transport writes/running state are inert.
`quiet-error-observations.json` records **15 injected passive failures per editor**,
zero notifications, zero backend starts and zero assertion errors. It covers
single/batch errors, cold busy deferral, cached refreshes, stale callbacks,
detached/sanitized health data and active Insert-mode typing. Foreground messages,
concurrent unrelated explicit errors, `v:errmsg`/`v:statusmsg`, focus, text and
complete unsynced undo are preserved. Explicit named-command feedback and visible
fatal DTO validation are checked in the same fixture.

The intermediate `verified-results.json` remains failed: its only failing native/
drawn cells were the older option-contract assertion expecting 27 instead of 28
entries after the preceding completion-policy implementation.
`baseline-contracts-evidence.json` proves the same failure on the preserved
pre-quiet source. The fixture now requires 28 entries and the exact manual
completion-policy row; no production policy or validator was weakened.

**Accepted final slice:** `settled-results.json`, all result codes zero on
**553 frozen sources**: **1,721 core passes / 15 deliberate opt-in skips**, all
**66 selected native + 36 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core and SDK
counts overlap; required selected native/drawn cells have zero skips. Existing
framing, protocol, notification, uncertain-delivery/mutation, retention and native
anchor regressions are included. The new fixture is in standard and focused
verification inventories.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No install, new live operation, checkout build/replacement
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate or live/assistive-
technology acceptance. Later waiting/reading, unresolved-write inspection
and ASCII follow-ups are recorded above, as is unread provenance. Catalogue
verification, People details and accessibility work remain in the ledger.

## Same-source reaction presentation retention — current follow-up

The requested cache-retention slice now distinguishes the live source's
recoverable `refresh-unavailable` health from terminal worker loss, grant/source
replacement and session/account replacement. Optional closed `reactionSource`
epoch/revision/degraded metadata is validated before native acceptance. It adds no
capability or action/receipt authority. The revision preserves a failure boundary
even when RPC coalesces failed→ready into a single state packet.

Unchanged loaded-target snapshots survive a recoverable same-source outage as
explicitly `cached`, including while a picker pauses passive work. No unavailable
read is started. Recovery invalidates freshness for a bounded viewport refresh,
not a mutation retry. Observation timestamps and partial/unknown flags are not
freshened by health alone; incomplete empty snapshots remain quiet, not zero.
Revocation clears presentation synchronously. Changed/deleted content is evicted
and its outstanding results fenced, so returning to a former content key cannot
revive old observations. Terminal loss, source/grant replacement, room/context/
session/account changes and opt-out retain their invalidation behavior.

Backend preparations and inspection locks are still reset; degraded sources cannot
mark a target inspected. Single/batch summaries crossing reset remain invalid
after readiness returns. Unknown outcomes and replay records survive untouched;
only exact-request inspection resolves uncertainty, never presentation/recovery.
Startup settlement also cannot overwrite an already-degraded health observation.

Evidence: `/tmp/opencode/wbx-reaction-retention-0cr_fesx/`. Baseline, failing
pre-fix runs and successive candidates are retained. The initial fixture's
script-variable lookup mistake was corrected; `third-corrected-red.log` then
reproduced the real known-label loss/missing recovery invalidation. The first
broader `verified-results.json` candidate passed, but supplemental `pause-probe.log`
exposed a missing cached qualifier while a picker held passive scheduling paused.
`pause-fixed.log` and the final standard fixtures verify the correction without
resuming I/O. Failed evidence is not relabeled as acceptance.

**Accepted final slice:** `settled-results.json`, all result codes zero on
**552 frozen sources**: **1,721 core passes / 15 deliberate opt-in skips**,
all **46 selected native + 28 drawn cells**, **68 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; selected native/drawn cells have zero skips. The two new fixtures
exercise stubbed read timing and the real accepted-state/context/revocation bridge.
Both are in standard and focused verification inventories.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging were preserved. No install, checkout build/replacement, new live operation
or running-editor reload/reconnect occurred. Only this index and the review ledger
change after the accepted freeze; `final-handoff-checks.json` records final lineage.
This is not full review completion, a new full offline gate or live/assistive-
technology acceptance. Later quiet-passive, waiting/reading, unresolved-write
inspection, ASCII and unread-provenance follow-ups are recorded above. Catalogue
verification and People/accessibility items remain in the ledger.

## Passive reaction screen-row anchoring — current follow-up

The user requested this next implementation step from the native UX review.
The new `reaction-anchors` fixture reproduces a **three-screen-row** reading jump
in each of two independently positioned splits, in both Vim and Neovim, before
the correction. A saved buffer view alone did not prevent that physical jump.

Same-view badge-height changes now capture each visible current-tab history
split's current reading screen position immediately before painting—not at read
admission. Bounded native scrolling compensates each viewport without changing
cursor/text/undo/folds/focus or permanently changing options. Scroll/cursor binding
cannot move other windows; baseline bookkeeping prevents edge-page admission.
Unchanged-height presentation avoids the extra capture, and no intermediate
repaint is needed. Hidden tabs are not activated and annotated/promoted buffers
remain excluded. No provider, target, write or uncertainty guard changes.

Exact partial-line positioning follows the user's native `smoothscroll` choice.
An indivisible wrapped top line with it off, or a buffer boundary, may require the
closest legal viewport. The implementation does not force the option, add fake
padding or oscillate between unrepresentable positions.

Evidence root: `/tmp/opencode/wbx-reaction-anchors-c3c7rbyz/`. Pre-fix failures,
native scrolling probes and successive candidates are retained. An initial fixture
assumption of exactly two batches was corrected: reflow can expose additional
already-loaded targets. The accepted test instead requires finite settlement in
four bounded batches and no repeated successful target before expiry. Screen-row,
fold, text and full-undo assertions remain intact.

**Accepted targeted follow-up:** `verified-results.json`, all result codes zero
on **550 frozen sources**: **1,717 core passes / 15 deliberate opt-in skips**,
all **40 selected native + 22 drawn cells**, **50 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core/SDK
counts overlap; required selected native/drawn cells have no skips.

`screen-anchor-observations.json` records 20 normal/smooth comparisons per editor
with **zero row delta**, eight explicit wrapped-native-limit comparisons with a
maximum one-row delta in that tested layout, and six visible badge/blank-separator
checks per editor. The fixture also moves readers during held requests, preserves
independently closed native folds, nonzero scrolloff, scroll-bound unrelated work,
horizontal views and a genuinely unsynced foreground undo block. Supplemental
drawn Visual-mode probes preserve the selection using the byte-identical production
helper; they are separate from the fixture counts.

All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging stayed unchanged. No checkout build/replacement, install, new live
operation or running-editor reload/reconnect occurred. Only this index and the
review ledger change after that freeze; `final-handoff-checks.json` records the
final boundary. This is not full review completion, a new full offline gate or
live/assistive-technology acceptance; the other ledger items remain pending.

## Editor-native UX implementation — in progress

The user authorized implementing
[the consolidated review](editor-native-ux-review.md), retaining Vim/Neovim idioms
rather than cloning Webex. The review's implementation ledger distinguishes
delivered source from remaining items.

Current reading/discovery slice implements native manual-completion preservation
with explicit `manual`/`off`/`user` policies, current-tab-first source navigation,
window-local list/reference returns, state-first durable edit feedback, local Ex
completion and effective buffer-local aliases. Loaded/queried thread buffers now
retain presentation-only Markdown/fold metadata across refresh and re-entry,
without main-history ownership or receipt/mutation authority. Reply/fold excerpts
and UTC/offset labels preserve exact raw send/edit identity and native options.
Current reaction documentation no longer claims runtime absence.

The SDK batch deadline now returns detached ordered completed observations plus
finite timeout items instead of discarding useful siblings. Offline pinned-SDK
tests hold one of eight parents, retain seven verified results, reject competing
reads/writes until physical settlement, preserve the published result after late
completion, and prove queued reads never start after expiry. No SDK/device or
transport mutation guard is replaced.

Evidence: `/tmp/opencode/wbx-native-ux-5shpxemk/`. The pre-fix native and stalled
batch regressions are retained. Intermediate `slice2`, `slice3` and `slice3b`
failures remain failed: superseded completion/count expectations, a Vim regexp
error and an over-eager foldexpr guard were corrected while retaining the
incremental fold/text/undo assertions.

**Accepted current slice:** `reading-results.json`, all results zero on
**549 frozen sources**: **1,717 core passes / 15 deliberate opt-in skips**,
all **44 selected native + 24 drawn cells**, **50 affected backend/SDK checks**,
TypeScript, copied build and two-isolated-build candidate integrity. Core and
SDK counts overlap. Required selected native/drawn cells have zero skips.
All ten checkout artifacts, 45 pinned SDK inputs, installed toolchain, HEAD and
staging were preserved. The agent performed no checkout build/replacement,
installation, running-editor reload/reconnect or new live operation.

The later screen-anchor, degraded-source retention, quiet-passive and
waiting/reading follow-ups are recorded above. Other remaining work includes
cache-independent empty-catalogue verification and lower-priority
People/confirmation/accessibility work. This is **not full review completion or a
new full/live acceptance gate**. Only this index and the review ledger change after
the accepted freeze; `reading-handoff-checks.json` records final preservation.

## Reaction read failure follow-up — current source

### First-open recovery without waiting for periodic refresh

The user reports `Reactions unavailable` on opening a space until a later
refresh. The last existing-session inspection found a ready source with visible
labels; it did **not** capture the failing opening transition. No live root cause
is claimed.

Two pre-fix admission regressions failed: exact loaded-target reads were refused
during unrelated explicit metadata work, and the worker required membership in
its unrelated bounded unread/date cache. Summaries now retain loaded-target,
session/source and canonical SDK verification without those extra read gates.
Preparation, submission, sends and receipt/mutation exclusion retain their guards.

Native presentation now treats SDK initialization as pending rather than an
unavailable observation. View invalidation retains an outstanding same-session
read until its callback drains, preventing the new space from colliding with it;
a replaced backend session releases the orphaned native flight. Old callbacks
cannot paint the new view. Only `worker:busy`, `context:unverified` and
`admission:busy` receive up to three one-second read-only retries. Persistent or
other failures use a **60-second negative TTL/wakeup**, not the five-minute
successful-observation age. Successful siblings remain cached; no mutation is
retried and no partial empty result becomes zero.

Before-state, expected red admission tests and copied candidates are preserved at
`/tmp/opencode/wbx-reactions-first-open-y7h9_1ps/`. The intermediate
`final-targeted-results.json` remains **failed**: a newly added mixed-result test
incorrectly included `roomId` in a failure item, and the closed native validator
correctly rejected that fixture response. Its frozen-copy check also detected a
verification import rewriting a copied Python bytecode cache. The fixture now
uses the actual two-field failure contract; verification disables bytecode writes.
No production validator/assertion or exclusion guard was relaxed.

**Accepted targeted offline verification:** `verified-targeted-results.json`
there passes on **546 frozen sources**: TypeScript, copied build, **50 affected
backend/SDK checks**, all **six native + six drawn reaction cells**, nine
documentation checks and two-isolated-build candidate integrity. New checks cover
connecting→ready, old-space flight draining, new-session orphan recovery,
timer-driven transient recovery, bounded persistent busy, no retry before the
negative deadline, recovery after it and successful-sibling exclusion.

The copied source stayed frozen; all ten checkout artifacts, 45 pinned SDK inputs,
installed toolchain, HEAD and staging were preserved. This is not a new full gate
or live first-open acceptance. The agent did not build/replace checkout artifacts,
reload/reconnect the running editor or perform a new live operation. Only this
index and the implementation contract change after that accepted freeze to record
the result; final handoff evidence is `final-handoff-checks.json` there.

### Editor-native UX review — recommendations only

All four requested reviews are consolidated in
[Editor-native messaging UX review](editor-native-ux-review.md), with priorities,
source evidence, inference limits and acceptance scenarios. Webex is a task and
semantic reference, not a UI template. Completion policy, split-local navigation,
durable operation feedback and stable reading geometry take precedence over
desktop-like widgets. Except for the separately requested first-open correction,
these recommendations have **not** been implemented.

### Quieter badges, preserved separation and fewer viewport lookups

The user reports reactions now appear, but asks about repeated “partial” /
“Reactions unknown” labels, lost spacing and slow loading. `partial` is a
coverage/count guarantee flag, not evidence that a displayed legacy label is
wrong. An empty partial snapshot cannot prove no reactions; it also need not
draw a warning underneath every message.

Ordinary badges now contain only known reaction groups (plus exceptional cached
status after a failed refresh). Empty observations retain their DTO/cache state
without drawing an unknown/zero footer; coverage caveats remain in explicit
details. A separate native virtual line sits below the last content row,
preserving the message's original blank separator. No message-buffer text,
copy/send identity, undo or focus change is used to obtain the extra spacing.

The earlier live eight-target read took 2,783 ms. The passive path duplicated the
already-loaded public message GET before reading each exact internal parent.
Viewport admission already binds those loaded public IDs to the current room;
the canonical SDK identity, actor, conversation and exact decrypted parent
ID/room/verb/key checks remain mandatory. This path now uses **nine adapter
lookups instead of 17**. Explicit single-message reads and all preparation/write
paths retain their independent public lookup and ownership/write guards.
The new live latency has not been measured; fewer round trips are not a claim
that live latency falls in the same proportion.

Before-state and expected red duplicate-read / badge-layout regressions are
preserved at `/tmp/opencode/wbx-reactions-polish-xjguqdjr/`. TypeScript, 25 affected
backend/SDK checks and all six affected native cells pass. Added SDK cases reject
foreign/mismatched parents, wrong conversation/verb/key and unverified actors
on the optimized path. Preserved copied verification in that directory passes
TypeScript/build, **48 affected backend/SDK checks**, all **six native + six drawn
reaction cells**, documentation and two-isolated-build candidate integrity.
Drawn tests check separate body/reaction/blank-gap screen rows in both editors,
not just extmark/property existence. Empty snapshots keep their original
partial/unknown flags while producing no decoration; details retain caveats.
This is targeted offline verification, not a new full gate or a measured live
speedup. Only this index changes after the copied tests to record the outcome;
final lineage/preservation evidence is `final-handoff-checks.json` there.
No checkout build/replacement, running-editor reload/reconnect or live mutation
is authorized or performed for this slice.

### Authorized existing-session live diagnostic — bounded observation

The user subsequently authorized live **read-only** reaction tests through their
existing Neovim RPC socket, explicitly excluding sends, reaction mutations,
reload/reconnect, grant changes and another SDK/device. The matching existing
session was identified using plugin/buffer-kind metadata, not message contents.
Its worker and negotiated batch mode were ready.

One eight-target visible-message batch completed in **2,783 ms** with valid,
exactly correlated native DTOs. It returned `thumbsup` for one target and
`heart`/`thumbsup` for another; six targets had no recognized labels. All results
remained partial. Comparing one unknown target and one known control with the
single-message reader completed in 1,516 ms / 934 ms: unknown stayed unknown,
and the control retained `thumbsup`. Actual visible reaction extmarks contained
these labels. **Unavailable was not reproduced** on these targets; neither empty
partial results nor these successful examples establish absence, completeness,
counts, modern vocabulary or general live acceptance.

Sanitized observations are retained at
`/tmp/opencode/wbx-live-reaction-probe-pnkf7yc8/observations.json`: no message
content, account/room/message IDs, credentials, own handles or provider URLs.
No application code or running-editor configuration was changed, and no editor
was reloaded/reconnected. The precise still-failing target remains needed.

### Unknown labels, serial loading and refresh churn — current correction

The user now sees `Reactions unknown · partial`, even on known reacted messages,
with message-at-a-time loading and frequent `STALE` churn. This is not accepted
live behavior. A second concrete fixture/reader mismatch was found: the pinned
SDK's `decryptActivity` traverses **`child.activity.object`**; the reader and its
synthetic fixture assumed **`child.object`**. A corrected nested fixture fails
before the parser correction. The new offline check also runs the actual SDK
inbound transformer over a synthetic encrypted nested reaction from another
person, rather than returning already-decoded direct children unconditionally.

Negotiated `viewport-batch-v1` now carries one closed, exact-loaded-target batch
of at most eight messages through RPC/private IPC and the existing SDK owner.
At most three read chains overlap; conversation metadata is fetched once per
batch, and passive display does not fetch removal ownership. The viewport paints
one complete returned batch, not one footer per RPC. Logical timeouts retain the
physical slot until all started reads settle and prevent queued reads starting.
No bulk service endpoint, new SDK/device or room/history scan is introduced.

Last-observed presentation snapshots now refresh quietly after five minutes,
not 30 seconds. Mere age no longer replaces verified labels with `STALE` or
question-mark counts. Failed refreshes preserve known labels explicitly marked
cached. Explicit detail/write preparation still rereads; the independent
30-second mutation freshness/identity/uncertainty guards are unchanged.

Before-state and the failing nested-summary regression are preserved at
`/tmp/opencode/wbx-reactions-viewport-l414c463/`. Targeted SDK/backend and native
checks pass after correction. A
Vim-only test-variable naming failure (`count` is read-only) was corrected without
changing production behavior or weakening the assertions. No live service
validation, installed SDK/configuration change, checkout build/replacement or
running-editor activation is performed by the agent.

**Accepted focused offline gate:** `/tmp/opencode/wbx-isolated-5dsyijlg/`, all
result codes zero on **545 frozen sources**: **1,714 core passes / 15 deliberate
skips**, all **35 Neovim + 35 Vim native** and **46 drawn** cells, **224 SDK/cache**,
both research dimensions, **44 messaging compatibility**, three synthetic-browser
checks, two fresh-process restarts, documentation/help, TypeScript, copied build,
candidate integrity and actual candidate-backend evidence. Both drawn viewport
tests verify eight targets in one request, one returned-batch paint, no re-fetch
after 61 simulated seconds, unchanged labels during the five-minute refresh and
retention of known labels as cached after a failed refresh.

Required native/drawn checks have no skips; the external installed-LazyVim
integration remains deliberately skipped. All checkout artifacts, frozen
source/inventory, installed toolchain/SDK inputs and HEAD/empty staging were
preserved. This is focused offline acceptance, not a new full or live gate.
Only this index and the reaction contract change after the freeze to record the
outcome; final preservation evidence is
`/tmp/opencode/wbx-reactions-viewport-l414c463/final-handoff-checks.json`.

### Earlier unavailable failure after user rebuild/restart

The user rebuilt/restarted Neovim and still reports the exact local error
`Reaction summary unavailable. Nothing was sent or acknowledged.` All ten
checkout built files then matched the accepted `z6eqb7e3` candidate. An old file
on disk is therefore not an established explanation; the live failure remains
unresolved, and the accepted query correction is not live acceptance.

Source inspection found that the diagnostic coverage was incomplete: controller
busy/stale/invalid-result checks, local grant/source admission and IPC admission
or closure still threw ordinary errors. The engine erased those reasons.
These paths now use only bounded categories: `admission:denied`,
`admission:unverified`, `context:unverified`, `worker:busy`,
`worker:unavailable` and `summary:unverified`. Unexpected errors use
`summary:unavailable`, never a raw error string. Existing SDK phases remain.
Admission, identity checks, request uncertainty, no-replay and physical operation
exclusion are unchanged. This is a diagnostic correction, not a claimed fix for
the unidentified live cause.

Before-state, the four expected red diagnostic regressions and isolated copied
checks are preserved at `/tmp/opencode/wbx-reactions-admission-u9dvsaau/`.
TypeScript, copied build, 46 affected backend/SDK tests, all six reaction native
cells, all six reaction drawn cells, documentation and two-isolated-build
candidate integrity pass. Coverage includes the real
non-demo admission code with inert credentials/source, actual private IPC →
engine → RPC (no replaced reaction provider), and local codes rendered in both
editors' inline footers. Only synthetic operations run; no live request, device,
configuration/installed-package edit, checkout build/replacement or editor
activation occurs. This new diagnostic slice has targeted offline verification,
not a new integrated/full/live gate. The actual live category is still needed.
Final lineage and preservation evidence is in that directory's
`final-handoff-checks.json`.

### Earlier query correction and focused acceptance

The user reports `Reactions unavailable` while the existing SDK source is ready.
This establishes that the inline renderer runs, not which provider stage fails.
The prior full offline gate below did not establish live reaction reads.

Source inspection found a definite query defect: the reader omitted the pinned
SDK caller's `activityType=reactionSummary` / `includeChildren=true` parameters.
The synthetic metadata fixture incorrectly returned children without that query.
The corrected fixture first fails on a reaction belonging to somebody else;
the reader/query correction then passes. Evidence and before-state are preserved
at `/tmp/opencode/wbx-reactions-read-fix-pcv70upr/`.

Own-activity lookup is now an optional supplement: its failure cannot erase
verified aggregate labels or grant an own-removal handle. Summary display no
longer requires conversation write-encryption fields; mutations still do.
Read failures carry only closed phase/problem codes through private IPC and the
engine, for example `parent:denied` / `parent:unverified`. The inline footer shows
that bounded category, never a provider error string, URL, body or credential.
This permits diagnosis without another blind “working” claim.

The first read-fix **focused** gate, `/tmp/opencode/wbx-isolated-semqsyzb/`,
remains **failed overall**: `drawn-vim-reactions` raced its own still-pending
mutation with a raw summary RPC, received an unavailable error, then waited for
groups on that error response. Its other checks passed: 1,709 core passes /
15 deliberate skips, 35 native cells per editor, 224 SDK/cache checks, both
research dimensions, compatibility, restarts, copied build/integrity and all
source/artifact/toolchain preservation checks. This is not a full gate.

Diagnostics at `/tmp/opencode/wbx-reactions-drawn-vc3icerq/` preserve the original
failure and reproduce it in three of eight unchanged drawn-Vim runs; traced
responses reproduce both add and remove races. The fixture now waits for the
native confirmed result and suspends passive reads before its single assertion
read. It asserts a successful validated snapshot without polling past errors.
A held-mutation controller regression verifies that competing summaries are
refused without provider entry, queuing or write replay. No production admission
guard changed. All 12 corrected drawn-Vim and six drawn-Neovim repeats, all six
affected native cells, TypeScript and 44 affected backend/SDK checks pass in a
preserved copy.

**Accepted fresh focused offline gate:** `/tmp/opencode/wbx-isolated-z6eqb7e3/`,
all result codes zero on **545 frozen sources**: **1,710 core passes /
15 deliberate skips**, all **35 Neovim + 35 Vim native** and **46 drawn** cells,
**224 SDK/cache**, both research dimensions, **44 messaging compatibility**,
three synthetic-browser checks, two fresh-process restarts, TypeScript, copied
build/integrity, documentation/help and actual candidate-backend evidence.
Required native/drawn checks have no skips; the external installed-LazyVim
integration remains deliberately skipped. Source/inventory, all ten checkout
artifacts, installed toolchain/SDK inputs and HEAD/empty staging were preserved.
This is focused acceptance of the read fix, not a new full or live gate. Only
this index and the reaction contract change after the accepted freeze to record
the result; final preservation evidence is
`/tmp/opencode/wbx-reactions-drawn-vc3icerq/final-handoff-checks.json`.

The actual failing phase in the user's running client remains unobserved.
Offline regressions and copied verification do not substitute for that evidence;
no live Webex operation, installed SDK/configuration edit, artifact replacement
or running-editor restart is performed by the agent.

## Approved internal reaction implementation — current source

The user explicitly approved pinned-internal implementation and offline tests,
accepting compatibility risk. The [current contract](reactions-implementation-plan.md)
now connects default-on native summary/add/verified-own-remove/inspection
commands, closed consent-bearing RPC, narrow IPC through the existing read-status
owner, separate one-shot transport fencing and retained exact-request uncertainty.
The user's inline-display clarification adds automatic bounded visible-message
reads and native virtual-text badges beneath history messages. Commands alone
were not sufficient; the new presentation is default on and independent of
message text/edit/send identity. No automatic mutation is added.
No new device, grant, dependency, installed configuration, live operation,
artifact replacement, activation, commit/push or Atlassian work is authorized.

Before-state: `/tmp/opencode/wbx-reactions-runtime-rkoy4kwn/` preserves 531
sources, all ten checkout artifacts and HEAD/staging. Focused source tests cover
the controller/demo/RPC, IPC faults, actual SDK adapter and both editors' native
reaction flows/boundaries. Live counts remain partial/unknown; service/crypto/
deployment-schema acceptance is not established.

**Accepted full offline gate:** `/tmp/opencode/wbx-isolated-wg9joptr/`, all result
codes zero on **545 frozen sources**, with no checkout source/inventory change:

- **1,706 core passes / 15 deliberate skips**, all **116 Neovim + 115 Vim native**
  and **209 drawn** cells, including actual inline text on both editors;
- **224 SDK/cache**, nine opted-in research checks, six default research checks /
  three named optional skips, **44 messaging compatibility**, three synthetic
  browser checks and two fresh-process editor restarts;
- TypeScript, copied build, bundle integrity, documentation/help, actual candidate
  backend evidence, installed toolchain/SDK inputs and HEAD/staging preservation.

Required native/drawn checks have no skips. The external installed-LazyVim
integration remains deliberately skipped; its static example check passes.
User-rebuilt checkout artifacts are preserved, not replaced or activated. Only
this index and the reaction contract change after the accepted freeze to record
the outcome; final checks are in
`/tmp/opencode/wbx-reactions-inline-50rey6m6/final-handoff-checks.json`.

The first runtime copied gate `/tmp/opencode/wbx-isolated-41cuze4m/` is preserved
as **failed overall**: two old fixed-inventory expectations (26 options / seven
confirmation helpers) were not yet extended for reactions; native/drawn
`contracts` also retained the old option count. Those expectations now enumerate
27 options and eight confirmation helpers without weakening opt-out/Cancel checks.
An unchanged headless Vim `local-sections` cell additionally exited nonzero with
an empty assertion report; three exact-candidate focused repeats pass at
`/tmp/opencode/reaction-gate-diagnostics-a2nmgueb/`, with no cause established or
fixture change. All reaction native/drawn cells, 224 SDK/cache tests,
both research tiers, compatibility, copied build and bundle integrity passed.
The user's default-on correction arrived during that run; its checkout-lineage
check correctly reports the later source changes, not acceptance of the new
default. A fresh full gate is required for the corrected source.

The default-on, pre-inline gate `/tmp/opencode/wbx-isolated-hzoerjis/` is also
preserved as **failed overall**: all 1,705 core passes / 15 deliberate skips and
224 SDK/cache tests passed, but both native/drawn `card-text` cells exposed an
unadvertised-backend discovery error (`wbx#supports_reactions` absent). Discovery
now refuses an absent helper instead of throwing. The user rebuilt the checkout
while that gate ran; its artifact-preservation check therefore correctly failed.
No agent artifact replacement occurred. That gate does not cover inline display.

Inline before-state `/tmp/opencode/wbx-reactions-inline-50rey6m6/` preserves the
user-rebuilt ten artifacts, all then-current sources and HEAD/staging. Those
rebuilt bundles were verified against their source and their offline `hello`
advertised the reaction mode; the missing behavior was inline presentation, not
a missing build. New source must be built/restarted deliberately by the user;
the agent does not replace those artifacts or reload the editor.

The previous research full gate `/tmp/opencode/wbx-isolated-zk8yexrq/` remains
**failed overall** in unchanged Neovim `team-description`. Three focused repeats
passed, and the built artifacts matched the preceding accepted presence/picker
candidate; no cause was established and that failure is not relabeled a pass.

## Reaction provider/transport milestone — historical research only

The user approved starting the provider/safety milestone in the
[reaction implementation contract](reactions-implementation-plan.md).
Public Messaging OpenAPI revision `bd17baa1f21b70bd1bd32f6362bbfb0e4afa3b77`
has 36 paths and no reaction path/key/string reference; this is bounded absence,
not a claim about every service. The pinned SDK candidate remains test-only.
At that research-stage freeze, runtime, internal-interface risk acceptance, real summary/own-ID/ack schemas,
vocabulary, device/KMS and restart-uncertainty behavior remain gated.

Before-state, public source bytes/inspection, red failures and focused checks are
preserved at `/tmp/opencode/wbx-reactions-contract-q2ses7pm/`. The corrected
candidate passes 38 failure/replay scenarios across add/remove, actual SDK
methods/interceptors and `http-core`, with synthetic KMS and a stubbed final
Node request primitive. Recorded SDK native I/O, registration and refresh are
zero. This is not service acceptance or a shipped one-shot writer.
The research simulation now retains uncertain mutations across presentation
room/account changes; it does not establish crash durability.

`focused-2/` passes eight opted-in research checks, 12 documentation/feature/gate
checks and TypeScript; default research mode passes five simulations with three
explicit optional-SDK skips. A later direct-execution opt-in guard has been added.
`focused-3/` passes all nine opted-in checks, six default checks/three explicit
optional skips, 14 gate/docs/infrastructure checks and TypeScript. It reconfirms
151 unchanged runtime/dependency inputs and all ten checkout artifacts. The
copied gate now requires both research dimensions' exact pass/skip inventory.
Fresh integrated acceptance of that final research/guard slice remains pending.
No application runtime/dependency/editor/configuration/bundle change was included
in that historical research milestone.

## Presence and native-picker follow-up — current source

User-reported skipped/unknown people, apparent presence on non-person rooms,
space IDs in labels and blocking notification/other menus are tracked in the
[follow-up ledger](review-remediation-plan.md#presencepicker-follow-up-2026-11-17).
Implementation is **offline verified** by full gate
`/tmp/opencode/wbx-isolated-m75tuz97/`: **1,689 core passes / 14 deliberate skips**,
all **113 Neovim + 112 Vim required native** and **203 drawn** checks, two fresh
restarts, **223 SDK/cache**, **44 compatibility**, three synthetic-browser,
docs/help/TypeScript/copied-build/candidate proof and all preservation/toolchain/
actual-backend checks pass on **527 frozen sources**. Required native/drawn
checks have no skips; only the uninstalled external LazyVim integration remains
deliberately skipped. The named core skips pass in their explicit offline tiers.
Before-state, artifacts, red failures and correction lineage are
preserved at `/tmp/opencode/wbx-presence-pickers-bibrdgwo/`.

The first full follow-up gate `/tmp/opencode/wbx-isolated-1fvqnvpn/` is preserved
as **failed overall**: all 225 required native and 203 drawn cells passed, but
four core checks failed (two older reason-text expectations; two sender-name
denial checks exposing shared-decoder policy leakage). Presence-specific target
classification is now explicit opt-in and does not change other owners' denial
defaults. All 115 affected checks pass after correction; the accepted fresh full
gate above supersedes the pending boundary. No failed report or project was rewritten.

The earlier authorized bundle verification at
`/tmp/opencode/wbx-bundle-refresh-jogg2d0k/` proved all ten then-current artifacts
already matched the original accepted candidate, with no identical-file rewrite.
The new follow-up fixes are source-only, so checkout bundles now lag them again.
No active-editor or installed-configuration changes or live diagnosis occurred.
Only this index and the plan change after the accepted freeze; final evidence is
`/tmp/opencode/wbx-presence-pickers-bibrdgwo/final-handoff-checks.json`.

## Original review remediation — historical evidence boundary

The [approved remediation plan](review-remediation-plan.md) is the current
implementation/coverage ledger. Historical acceptance below is not automatically
acceptance of its newer sources; checkout bundles intentionally remain unchanged.

**Accepted final full gate:** `/tmp/opencode/wbx-isolated-__vklck9/`, all result
codes zero on **523 frozen sources**, with unchanged source inventory/lineage:

- **1,682 core passes**, **111 Neovim + 110 Vim native**, **199 drawn cells**,
  both fresh-process restarts, **217 SDK/cache**, **44 messaging compatibility**,
  **three synthetic-browser** checks, docs 9/9 and both native help checks;
- TypeScript, copied build and five-bundle/five-map candidate proof;
- actual editor-native job evidence: **140 candidate-bundle** and **286
  synthetic-fixture** launches, no source/foreign production backend;
- installed build-tool metadata/fingerprints preserved and matching expected
  lockfile versions, with no dependency install/repair;
- all ten checkout artifacts, HEAD/empty staging and frozen source preserved.

Required editor cells have zero skips. The 14 named core skips run successfully
in the explicit offline SDK/messaging tiers. One installed lazy.nvim integration
remains deliberately skipped (external plugin not installed); static LazyVim
example validation passes. These are not live OAuth, receipts or device tests.

The final completion matrix in the plan marks S/W/U/D/A and V remediation
offline-verified within its approved scope; G1 remains design/authorization-gated
and manual Busy remains provider-unsupported. No bundle refresh, active-editor or
installed-configuration change, commit/push or Atlassian work occurred.
The checkout bundles are intentionally stale relative to these sources: candidate
proof is **not** checkout/source agreement. Only these two acceptance documents
change after the gate; the documentation-only delta and final preservation proof
are in `/tmp/opencode/wbx-review-remediation-jrn3757g/final-handoff-checks.json`.

Preserved full gates:

- `/tmp/opencode/wbx-isolated-5yfwt8mj/`: failed drawn presence colors and Vim
  activity paging; corrected with native overlays/text properties and silent
  test diagnostics. Failed report/capture retained.
- `/tmp/opencode/wbx-isolated-jtorocze/`: five native/drawn fixture/schema or
  catalogue-compatibility failures per editor; corrected without dropping
  authority/race assertions. Ten native and ten drawn focused cells pass.
- `/tmp/opencode/wbx-isolated-t6qqrcx_/`: **failed overall**, one core confirmation
  inventory failure (six expected versus seven actual); 1,675 core passes and 14
  deliberate skips. All 110/109 native and 199 drawn cells, two restarts, 217
  SDK/cache, 44 compatibility, three synthetic-browser checks, docs/help/build/
  candidate proof and all source/artifact/toolchain preservation checks passed.
  The count correction inventories all seven call sites explicitly.
- `/tmp/opencode/wbx-isolated-j_axh3re/`: **failed overall**, one headless Vim
  image-fixture timing failure; 1,682 core passes/14 deliberate skips, all 111
  Neovim native and 109/110 Vim cells, all 199 drawn cells and all other tiers/
  actual-backend/preservation checks passed. A new copied diagnostic
  `phase7-image-red/` makes the response outlast the old fixed pause and reproduces
  the exact six-versus-five request failure. Callback-settlement synchronization
  replaces that pause; the slow case and exact six-request/no-send/no-receipt
  assertions remain. `phase7-image-focused-2/` passes six headless/four drawn
  concurrent image cases. The preceding failed test-probe attempt is retained.

Later source checks under `/tmp/opencode/wbx-review-remediation-jrn3757g/`:
`phase6-focused-1/` passes TypeScript, 12 contract and 12 native checks;
`phase6-focused-2/` passes TypeScript and 269 ownership/strict-mock checks;
`phase6-focused-3/` passes TypeScript, 13 harness/ownership and eight native checks.
These added closed feature negotiation, bounded operation-slot consolidation,
strict replacement mock tracking and actual editor-native backend argv evidence.
They do not substitute for the accepted complete copied gate above.

The repository-owned `python3 scripts/verify-isolated.py` builds only a frozen
copy, asserts required editor inventory counts and records per-tier commands,
dimensions, explicit skips, versions, source/artifact hashes, actual backend job
commands and installed-tool fingerprints. A full run must pass the candidate
bundle proof and unchanged checkout/history checks before acceptance. Registry
content integrity, a clean dependency install and external runtime/SDK integrity
are not established by matching local tool fingerprints. No dependency repair,
live action, editor activation or checkout artifact refresh is implied.

## Cache, adjacent-mention wrapping and Markdown no-POST failure correction

New user reports: scrolling spaces forgets presence, adjacent mentions separate
`@` from the name, and Markdown/mention failures leave delivery unresolved even
though the user reports the message absent in Webex. The user explicitly chose
**readable native history/copies instead of raw-tag yanks**, retaining exact
original IDs/source in message state and own edit/send buffers.

`cache-wrap-delivery-before/` and its JSON manifest preserve 481 sources and all
ten artifacts before this slice. Engine and native display now retain up to 500
loaded live direct-row observations across relevance/scroll changes; the existing
eight-identity HTTP owner is not enlarged. Fresh returns are immediate and issue
no new People read. Expiry, live-row/type/revocation, capability and session
boundaries still apply; hidden rows are not polled or persisted.

`mention-wrap-reproduction-1/` reproduces the actual long-ID failure for both
editors across 32–112-column widths, with and without `linebreak`. Conceal leaves
wrapping width for hidden IDs, separating even the first `@Name`. Readable
projection now replaces published mention tokens before native rendering, not
inside editable/sent source. Inline/fenced/indented code and plaintext lookalikes
remain literal. `mention-wrap-projection-2/` passes Neovim; Vim exposed its
read-only `count` variable name, corrected to `slashes`.

`cache-wrap-delivery-source-check-1/` passes all selected backend/native/drawn
behavior checks, including both editors' multi-width adjacent-mention screen
matrix. Its TypeScript failure is missing parameter annotations in the new mock;
the actual production TypeScript passes. The mock annotations are corrected.
The certainty tests prove that preflight errors, missing existing mention grants
and explicit HTTP refusals do not poison a later deliberate send, while a
possible submitted write remains unknown/blocked until explicit resolution.
No uncertain prior write is automatically cleared or replayed.

The preceding `presence-spark-final-4/` independently passes 1638 core / 14 skips,
203 native, 211 SDK/cache, both restart and all 20 drawn checks, docs/help/build/
integrity on its 481-source freeze. Its overall exit is 1 because checkout
artifacts changed outside agent build/install actions; its preserved report is
not rewritten. This does not validate the newer cache/wrapping/certainty changes.
Their isolated verification and final source-derived artifact proof are recorded
below, separately from that historical preservation failure.

`cache-wrap-delivery-focused-2/` passes **152 backend, 28 affected native, two
fresh-editor restart and all 24 drawn fixtures**, docs/TypeScript/build and
isolated bundle integrity on 486 frozen files. The user additionally confirms
the split occurs in **published history**, not editable composers. Both editors'
new 32–112-column tests require contiguous `@First` and `@Second`, rather than
accepting a line break between `@` and the name. The broad final freeze is
`cache-wrap-delivery-final-3/` (completed; limitations below). No source/build result
from a preceding slice is substituted for this new acceptance boundary.

The user confirms the wrap defect is in published history and explicitly chooses
to keep native word-wrap rules rather than permit a global `breakat` override.
The private `mention-word-edge-probe/` records the separate ordinary right-margin
`@` break at very narrow widths; it is not presented as fixed by changing global
editor preferences. The approved fix removes hidden-ID gaps from native layout.

The later request to highlight names distinctly uses precise UTF-8 byte ranges
from structured mention projection, attached through existing native per-message
decorations and theme-linked `WbxMention` (`Identifier` default). It does not
reintroduce hidden IDs or color code/plaintext lookalikes; user theme overrides
and edited-view clearing remain covered.

`cache-wrap-delivery-final-3/` passes 1643 core / 14 skips, 212 SDK/cache, both
restart and all 24 drawn checks, docs/help/build/integrity. Its native command
reaches the unchanged 420-second aggregate ceiling and exposes a real legacy
presentation regression in `ui-review`: observations without a full `rooms`
snapshot were pruned. Full snapshots still prune exact live rows; the older
selected-only API keeps its original eight-entry bound. A follow-up source check
also catches timestamp-based rejection of an explicit aged observation; only
unobserved rolling-window misses, not newer state publications, now preserve a
prior value. Original failed reports are retained.

The final runner splits the independent Vim and Neovim suites, each retaining the
same per-test and 420-second command limits. A selected/group change also cannot
clear legacy visible-room relevance merely because the new observation cache is
nonempty. Accepted highlighted-cache verification is recorded below.

`highlighted-cache-focused-5/` passes **153 backend, 36 affected native, both
restart and all 24 drawn fixtures**, docs/TypeScript/build/integrity. It includes
precise rendered color checks, per-message decoration reuse/performance, theme
override preservation, code exclusions and clearing after native annotations.
A final display-only bound limits native mention ranges to 32 per message without
omitting text; the bound itself is outside that focused freeze and included in
`highlighted-cache-final-6/` (accepted below). No request, receipt, mutation or grant
authority is inferred from a rendered/styled name.

**Accepted final run:** `highlighted-cache-final-6/` passes every check on **486
frozen files**, with no checkout source changes during the run:

- **1644 core passes / 14 deliberate skips**, **104 Neovim + 103 Vim native
  passes**, **213 SDK/cache passes**, both fresh-editor restart tests and all
  **24 drawn fixtures**;
- documentation (9/9), both editors' help checks, TypeScript, isolated build,
  bundle integrity, frozen-input checks and per-run checkout-artifact preservation.

`highlighted-cache-artifact-reconciliation.json` and
`highlighted-cache-artifact-proof-6/{candidate-proof,checkout-proof}.json` prove
all **ten actual checkout artifacts** match fresh isolated builds from the same
**85 accepted build inputs**. The pre-action checkout bytes are preserved under
`highlighted-cache-artifact-proof-6/checkout-before/`. The reconciliation reports
`changed_artifact_files: []`: no agent bundle replacement was needed or performed,
and no checkout `npm run build` was run. Earlier unattributed artifact changes
and failed preservation reports remain unchanged; this proof does not identify
their actor or retrospectively turn those failures into passes.

Final closure distinguishes the run-start checkout snapshot from the accepted
isolated build: four CLI/editor bundle/map files differ between that snapshot and
the pre-reconciliation backup. Current bytes match both the accepted isolated
output and that backup, not the older run-start bytes. The actor remains
unattributed. `highlighted-cache-completion/attempt-result.json` preserves the
initial closure failure that incorrectly required those different boundaries to
match; original snapshots and the per-run report are not rewritten.

`highlighted-cache-completion.json` records final lineage and preservation checks,
allowing only this completion-ledger edit after the accepted freeze, with a fresh
documentation check. No active editor, installed configuration, grant/provider or
live service was changed/tested; there was no commit or push. Previously stored
delivery uncertainty is not automatically cleared: inspect Webex/history and use
`:WebexResolveDelivery` explicitly before another deliberate send if still
blocked. Activation is left to the user's next editor restart.

## User-confirmed correction: fast presence batches and published HTML mentions

The user reports the previous behavior still fails **after a full editor restart**,
and identifies the published form as **`<spark-mention …>`**. The preceding offline
acceptance did not cover this form or prove simultaneous starts for fast HTTP:
its one-second start gap merely overlapped slow responses. Those claims are not
reused as acceptance of this correction.

Current viewport scheduling launches a pair in the same callback. Explicit
parallel mode permits two starts per rolling two-second interval at each existing
membership/status admission boundary, preserving the sustained budget instead of
staggering the pair. Physical concurrency remains two; spent admission survives
mode changes, service Retry-After cannot be shortened and canceled native work
retains admission until it really settles. Both initial readers share one
cancellable self lookup; canceling one must not abort the other's bootstrap.
Legacy single-start/non-viewport behavior remains compatible.

Published HTML mention tags now receive native history conceal, including labels
already prefixed with `@`; raw Markdown, native copying and exact identity remain
unchanged. Code regions remain literal. The HTML-only fallback also displays
`@Label` without duplicating an existing `@`, ignoring identity/other attributes
rather than interpreting them as actions.

`presence-spark-before/` and its JSON manifest preserve the 480-source/ten-artifact
boundary. `presence-spark-focused-1/` passes 141 backend, 22 affected native, both
restart tests, docs/build/integrity and 18/20 drawn fixtures. The two drawn failures
inspect only the first screen row of two long HTML mentions; native wrapping
places the second label on a later screen row. The corrected test inspects all
rendered rows of that buffer line and still rejects raw tags/IDs or duplicate @.
A later budget refinement additionally enforces a rolling, not fixed-window,
limit for staggered completions.

`presence-spark-focused-2/` passes all checks: **143 backend, 22 affected native,
two restart and all 20 drawn fixtures**, docs/TypeScript/build/integrity. It proves
same-timestamp starts with deliberately immediate responses and readable actual
HTML-tag labels on both editors, not merely syntax metadata. A final hardening
shares physical admission between the same owner's identity and status stages:
two uncooperative canceled status reads cannot free two extra membership slots.
`presence-spark-shared-admission-3/` passes TypeScript and all 84 selected provider/
batch/integration checks, including this draining-HTTP case. The final broad
freeze is `presence-spark-final-4/` (pending); prior failed artifacts/runs remain
unchanged. No active-editor or installed-configuration changes are authorized.

## Conversation follow-up: parallel presence and native display/routing

The next five requests supersede serial viewport scheduling: up to two peer
lookups may now overlap, with paced starts, one self-identity bootstrap, no
duplicate/third engine flight, bounded relevance/cancellation and the existing
Retry-After/deadline limits. This does not use a bulk People endpoint or label
unknown REST status as Busy. Published history conceals structured mentions
without changing raw native text/identity; Markdown code remains literal.

`WaR` now uses `WebexThreadReply`: unchanged main history resolves the existing
root-draft owner, and queried threads retain their strict session/selection/
expiry/edit safeguards. `WebexQueryReply` remains an explicit query-only command.
Composer header visibility is repaired on window/Insert entry independently of
cached buffer metadata. Automatic full-status/destination echo is removed from
normal compose; explicit destination inspection remains available.

`conversation-polish-before/` and its JSON manifest preserve 479 sources and ten
artifacts at this five-request boundary. The first focused run is retained
unaccepted: TypeScript/build, 95/96 backend checks, 16/22 native, both fresh-editor
restart tests and 16/20 drawn fixtures pass. Failures exposed a missing discovery
entry for the retained query-only command and test assumptions about split focus,
sub-second query timestamps and mocked cooldown wakeup timing. Those assertions
are corrected without removing the original authorization/cooldown checks.
Final verification and current-source bundle reconciliation are recorded below.

`conversation-polish-focused-2/` passes 22 affected native checks, both restart
tests, all 20 drawn fixtures, docs, TypeScript/build and isolated bundle integrity.
Its two backend failures (96/98 pass) are new delayed-membership test responses
missing the fixture's required `max=3` query parameter, not relaxed production
checks. The corrected tests continue to assert paced first submission and no
status HTTP call during service cooldown. Subsequent broader runs are below.

`conversation-polish-regressions-3/` passes **1630 core / 14 deliberate skips,
204 SDK/cache, both restart tests**, docs/help/TypeScript/build and isolated
bundle integrity. It retains 201/203 native and 18/20 drawn passes: the new
annotated-query test compared `undotree().synced` before/after the editor naturally
closed its edit block. Closing that block before the baseline keeps the full
undo-tree equality assertion (not merely selected fields) and passes all four
affected editor checks in `conversation-polish-ui-check-4/`.

The broader run also detected five later checkout artifact/map hash changes.
No agent checkout build/install had occurred. All observed bytes are preserved in
`conversation-polish-observed-bundles-after-3/` and its JSON manifest; all ten
already match gate 3's isolated build. This does not replace the original
preservation result or establish the actor. Final source-derived proof is recorded
below. Mention conceal additionally covers native emphasis/link-text/headings
without applying inside code regions, with positive bold/heading checks.

**Accepted final run:** `conversation-polish-final-4/` passes every check on 480
frozen source files with no checkout source changes during the run:

- **1630 core passes / 14 deliberate skips; all 203 native editor tests.**
- **204 SDK/cache checks, two separate-process draft-restart tests and all 20
  affected drawn Vim/Neovim fixtures.**
- TypeScript, isolated builds, nine documentation checks, both help generators,
  two-build isolated bundle verification and per-run checkout artifact preservation.

`conversation-polish-checkout-proof-4/` independently verifies **all ten actual
checkout bundle/map files against two fresh isolated builds of 85 current inputs**.
The unexpected observed artifacts already match current source, so **no bundle
replacement was needed or performed by the agent**. Original and later observed
artifact backups, failed runs and historical baseline/verifier records remain
intact. The earlier single-flight proof is not reused as proof of parallelism.

The only post-freeze source change is this verification ledger; its final
documentation checks and source/artifact lineage are recorded in
`conversation-polish-completion.json`. HEAD/staging, preserved historical hashes
and exact tested-source identity are checked separately. No installed config,
active-editor reload, live Webex/OAuth/receipt/device test, dependency install,
grant/provider expansion, commit or push occurred. This is offline regression
acceptance, not an unperformed live-service acceptance claim.

## Native picker, composer, presence and restart-recovery follow-up

The next user report supersedes the earlier custom mention chooser and eight-row
presence UI. Source changes now delegate choices to Neovim `vim.ui.select` / Vim
`popup_menu`, suppress completion only in owned message buffers, leave real
whitespace after inserted mentions, retain known same-session sender/DM names
during refresh, and pace all visible direct rows (up to 128) through the existing
small provider window. The additive `peopleViewport: ['paged-v1']` submode keeps
the legacy eight-row RPC and 32-capability hello boundary intact.

The user explicitly chose **editor restarts too** for draft survival. Normal/
reply draft text/format now use private verified-account storage, with one bounded
patch per unchanged 32 KiB RPC frame, locking/revision conflict guards, 0700/0600
permissions, no attachment/send-consent restoration and no implicit sends. See
[draft privacy, limits and recovery](drafts.md). Confirmation/delivery/mutation
authority remains separate. Confirmed Markdown sends retry only a transiently
failed local clear, under exact unchanged revision/text/format/target/session
guards. An uncleared confirmed-sent copy cannot resend or become an unsent disk
draft; newer edits remain protected.

`native-polish-before/` / `native-polish-before.json` preserve the 469-source
boundary and all ten generated artifacts. The retained first focused attempt
passes its 91 backend checks but exposes restart language-mode initialization
and unintended repeated restoration after composer promotion. Disk records now
restore only once per target/session, and their format is applied after native
buffer initialization. `native-polish-focused-2/` passes 91 backend, 22 affected
native, two separate-editor restart tests, ten drawn fixtures, docs/TypeScript and
isolated bundle verification; a later completion-only change remains outside that
freeze.

The first broader `native-polish-regressions-3/` is retained **unaccepted**:
1623 core passes / one failure / 14 deliberate skips, 189/201 native, two restart
passes and 12/14 drawn passes. It exposed a real completion-release error:
Vim compares absent `v:null` with numeric zero, so numeric flags were not installed
but their removal was attempted. Explicit key-existence checks fix installation/
release without touching user overrides. Its other failures were the catalogue's
old 25-key counts; tests/table now include the new `persist_drafts` option while
retaining exact catalogue/documentation equality.

`native-polish-focused-4/` passes 92 backend, 26 affected native, two completely
fresh-editor restart tests, all 14 affected drawn fixtures, nine docs, TypeScript,
five copied builds and two-build isolated artifact verification on 479 frozen
sources. It includes local-clear failure injection, protection for newer edits,
blocked duplicate sends, private disk cleanup, whole-viewport coverage and
completion restoration on buffer promotion.

The user also explicitly authorized refreshing checkout bundles **from an isolated
verified build**, retaining backups and without reloading the active editor.
Artifacts will be updated only after final verification; no checkout `npm run
build`, historical baseline rewrite, installed configuration/grant change, live
service/OAuth/receipt/device test, commit/push or broader parity resumption is
authorized by this follow-up.

`native-polish-final-5/` passes every functional/build check on its 479-source
freeze: **1625 core passes / 14 deliberate skips, all 201 native, two fresh-editor
restart tests, 199 SDK/cache and 14 affected drawn fixtures**, nine docs, TypeScript,
both help generators and two-build isolated artifact verification. Its overall
exit is **1** because six checkout bundle/map hashes changed after the pre-slice
preservation boundary. No agent checkout build/install had been run. Their actor
is unattributed; observed bytes and hashes are preserved in
`native-polish-observed-bundles-after-5/` and its JSON manifest. Embedded CLI/editor
source-map contents match the current source; provenance still requires the final
source-derived build comparison, not replacing the historical baseline.

Two later source changes are separate from gate 5: an explicit in-flight owner
prevents viewport reports from arming overlapping refresh timers around a slow
still-visible peer, with a dedicated regression assertion. The final rerun is
`native-polish-final-6/`. It freezes the ten observed checkout artifacts
for per-run preservation and reports the historical pre-slice comparison
separately; the original boundary/failed reports remain unchanged.

Gate 6 completed successfully on that prior freeze: **1626 core passes / 14
deliberate skips, 201 native, two fresh-editor restarts, 200 SDK/cache, 14 drawn**,
nine docs, both help generators, TypeScript and isolated two-build bundle
verification. It correctly reports the later three-file parallel-presence edits
outside its frozen inputs. Its source-derived bundle proof predates those edits;
it is not acceptance of the new five-request follow-up above.

## Bundle-integrity reconciliation

The user explicitly requested fixing the bundle-integrity mismatch after the
visible-presence verification below. All ten observed checkout bundle/map files
already match the `presence-spaces-gate-25/` isolated build, and their embedded
source-map contents match current source. No bundle replacement is needed.
The failing old predicate compared them with a **pre-change preservation
snapshot**, not the expected build of the current source. This does not establish
who changed the earlier bundles or retroactively pass any failed historical gate.

`npm run verify:bundles` now checks every bundle and map against **two fresh
isolated builds from frozen current build inputs**. It also rejects incomplete/
extra artifacts, nonreproducible output, changed inputs/artifacts during the
check and unsupported symlinks. It is read-only in the checkout, uses existing
dependencies, and never starts an app, worker, installed editor or OAuth session.
The first actual check, TypeScript and nine failure-mode unit tests pass in
`bundle-integrity-focused-1/`. Pre-repair sources, all ten observed files and
historical verifier/baseline hashes are preserved in `bundle-integrity-before/`
and `bundle-integrity-before.json`.

The forward verifier now uses this source-derived check and requires its build
input hashes to match the gate's frozen sources. The exact old runner is archived
as `verify-local-historical-preservation.py`; `baseline.json` and failed reports
remain unchanged. The historical preservation comparison remains visible as a
diagnostic, not falsely relabeled as a pass. The forward smoke check verifies ten
artifacts from 84 frozen build inputs; checkout files are untouched.
The full forward gate `bundle-integrity-gate-26/` passes **every check (exit 0)**
on 466 frozen sources: **1614 core passes / 14 deliberate skips, 193 native,
173 drawn, 198 SDK/cache**, 44 synthetic messaging, three browser, six research,
two loader and nine documentation checks, TypeScript, five isolated bundles
and both help generators. Both `checkout-bundles` and
`bundle-build-inputs-match-freeze` pass: all ten artifacts match two fresh builds
of the gate's 84 frozen inputs. No checkout source changed during the run.
`historical_preservation_match: false` remains an honest diagnostic; no failed
historical result was rewritten. All ten checkout artifacts, the historical
baseline/archived runner, Git HEAD and empty staging are preserved. Final
fingerprints and documentation-only lineage are in `bundle-integrity-completion.json`.
This gate predates the subsequent mention-picker/confirmation UI corrections;
it does not verify those later changes.
No Team-description acceptance, broader parity resumption, manual Busy support,
provider/grant change, live activation, commit or push follows from this repair.

## Mention-picker and confirmation UI follow-up

The subsequent user report covers a malformed participant-picker footer, missing
keyboard navigation, no automatic Markdown mode, full opaque Person IDs in the
draft, and colliding Cancel/Continue accelerators. The native non-focusing picker
now separates options/footer and supports arrows, j/k, Ctrl-N/P, page navigation,
Enter and Escape. Selection automatically enables this draft's Markdown format
and filetype. Mentions render as `@Name` via conceal while exact native markup
remains available for undo/copy/send validation; plaintext or explicit
`conceallevel=0` reveals source. Duplicate labels get short picker suffixes.
Five Cancel/Continue sites now use unique **C/Y** keys with Cancel still default;
the independent C/Detach dialog was already unambiguous.

`mention-ui-before/` / `mention-ui-before.json` preserve the preceding 466-source
state and all ten bundles. No transport/schema, installed configuration, grants,
receipt authority, automatic paging, per-send mention/@all consent or send key
is changed. FileType hook changes revoke insertion instead of overwriting work.
`mention-ui-focused-1/` retains the initial Vim read-only-variable failure and
test-input/unfinished-script-undo issues. The picker uses a Vim-safe variable;
the cancellation test starts at a real native input boundary and still compares
the entire undo tree. `mention-ui-focused-2/` passes all 20 affected native
checks but times out exercising Vim confirm through `feedkeys()`: Vim reads its
controlling TTY instead. The private drawn harness now sends only the exact
synthetic fixture's C/Y/default keys through its isolated PTY.
`mention-ui-focused-3/` passes 20 affected native, both drawn mention fixtures,
all six confirmation-site mnemonic/default audits, TypeScript, nine docs and
the read-only bundle check. Real drawn tests exercise all four confirmation
owners with C, Y and default Enter; headless tests do not claim that TTY check.
The final frozen `mention-ui-regressions-4/` run passes **all checks (exit 0)** on
469 sources: **1615 core passes / 14 deliberate skips, all 195 native checks,
22 affected drawn checks**, the six-site confirmation audit, TypeScript, nine
documentation checks and the read-only bundle checker. The actual drawn draft
shows `@Name`, not opaque IDs; native undo/redo restores exact markup. Long-list
page/end/numeric navigation, cancellation, duplicate names, FileType-hook changes,
separate send consent, drafts, uploads, mutations, recovery and keyboard ownership
are covered. No checkout source changed during the run. Both help generators also
pass in `mention-ui-help-checks/` without writing checkout tags.

Only this verification ledger changes after that frozen run; fresh documentation,
checkout bundle verification and final preservation/source-lineage assertions
are recorded in `mention-ui-completion.json`. All ten checkout artifacts,
historical evidence, Git HEAD and empty staging are preserved. These are offline
UI corrections, not live activation, installed configuration changes, alternate
presence-provider work or resumption/completion of the broader parity roadmap.

## Current UI review (separate from paused parity work)

The review changes short key labels/named effective prefix groups, removes
routine command tutorials, parent-body reply duplication and displayed-image
placeholders, and adds themeable presence circles plus bounded 60-second
selected-direct refresh. Existing grants, native ownership/full undo, explicit
send/write behavior, mutations and recovery remain with their existing owners.
Unobserved/stale peers are neutral; only eight verified observations are cached
per session, with no roster scan. Current follow-up behavior is documented in
[editor guidance](editor.md#people-presence-and-automatic-details).

Frozen inputs and retained attempts:
`/tmp/opencode/wbx-messaging-parity-341sx5zc/ui-review-before/`,
`ui-review-baseline.json`, `ui-review-engine-1/`, `ui-review-focused-1/`
(runner killed at its one-second harness deadline), and `ui-review-focused-2/`.
The latter passes TypeScript, copied builds, 80/82 focused core, 174/191 native
and both new drawn presence fixtures; it is **not a passing gate**.
Failures retain old removed-chrome/popup-padding expectations, hard-coded
pre-cleanup viewport/title positions and an ACK-before-projection fixture race.
Tests now use the actual paging edge, actual title column and settled projection;
mutation/delivery/undo assertions remain. Broader verification was pending at that point.

`ui-review-final-targeted/` passes TypeScript, five isolated bundles, four native
integration/presence checks, both drawn presence checks and nine documentation
checks on 463 frozen sources. The installed which-key **parser/tree only**
compatibility probe also passes in a private `-u NONE` editor, without plugin
setup or installed configuration changes. It exposed an actual integration
mistake: which-key's `hidden` field is boolean, not a dynamic getter. Labels now
use supported dynamic descriptions plus `real` leaf metadata, so user shadows
retain their own descriptions and removed bindings leave no ghost entries.
Gate 22 also retained one old order-based which-key fixture expectation; that
fixture now checks real named groups/leaf labels instead of the second entry.
Gate 22 finishes with 1595 core passes / 14 deliberate skips, 190/191 native,
170/171 drawn and the supporting suites passing; the retained Neovim navigation
failure is the old order-based expectation above (also in its drawn form).
The final broader rerun `ui-review-gate-23/` freezes 463 sources and passes all
functional checks: **1595 core / 14 deliberate skips, 191 native, 171 drawn,
188 SDK/cache, 44 messaging, three browser, six research, two loader and nine
documentation** checks, TypeScript, five isolated bundles and both help generators.
No checkout source changed during the run. Overall exit remains **1 solely for
the pre-existing `checkout-bundles` mismatch**; this is not formal runtime
acceptance or authorization to rebaseline bundles.

The user's subsequent correction supersedes this selected-peer-only UI boundary:
presence must load for visible direct chats without opening each conversation.
That follow-up is in progress, not accepted by gate 23. Manual **Busy** remains
an upstream REST limitation, not equivalent to DoNotDisturb or a safe inference
from `unknown`; no alternate provider has been activated.

The visible-space correction now uses optional hello submode
`peopleSpaces: ['visible-v1']` and relevance-only `people.spaces {roomIds}`.
It loads direct rows without opening them, follows the visible list/cursor within
the existing eight-peer budget (including the selected peer), and shares the
existing identity, presence, singleflight, cooldown and transport owners.
This is not an all-rooms or group-roster scan. Hidden/annotated views drop their
relevance; manual Busy remains unsupported by this REST provider.
Evidence boundary: `presence-spaces-before/`, `presence-spaces-baseline.json`.
Four checkout bundle/map hashes changed after the prior preservation snapshot
(`editor-main.js{,.map}`, `cli.js{,.map}`); cause is unattributed. The observed
files were copied to `presence-spaces-observed-bundles/`, not overwritten, and
this preservation record is not an acceptance rebaseline.

Retained `presence-spaces-focused-1/` passes 90 affected backend checks but fails
native/drawn checks. It exposed a real compatibility error: adding a 33rd
top-level capability violated the old native 32-capability bound. The fix uses
the additive submode above, preserving that bound rather than weakening it.
The new synthetic fixture also needed explicit syntax enablement and a Vim-safe
variable name. `presence-spaces-focused-2/` passes 91 backend, 11/12 affected
native, both drawn fixtures, nine docs and TypeScript/copied builds; its remaining
undrawn Vim expectation assumed eight visible rows where silent Ex reported one.
The final fixture keeps strict eight-row/color/no-duplicate checks in both drawn
editors, and requires exact changed-set reporting in undrawn Ex instead of
pretending it has the same viewport. Follow-up verification was pending at that point.
`presence-spaces-focused-3/` retains 91 backend, 11/12 native and both drawn
passes. Its remaining failure was silent Ex reporting a restored `botline`
before `topline` after a tab switch. The retained
`presence-spaces-ex-diagnostic{,-2,-3}/` proves that geometry, then passes with a
conservative empty-set assertion in undrawn Ex; both actual drawn editors retain
the mandatory positive restore/opt-out/color/annotation/full-undo checks.
The broader frozen rerun `presence-spaces-gate-24/` completed **unaccepted**:
1604 core passes / one failure / 14 deliberate skips, 188/193 native,
197/198 SDK/cache and 169/173 drawn. The core/SDK failure is the RPC fixture
described below. Five native/four drawn metadata checks also failed on an
unexpected extra workspace revision. Supporting messaging/browser/research/
loader/docs/help/build checks pass; historical `checkout-bundles` still fails.
Earlier gates do not accept this follow-up and manual Busy is not implemented.
`presence-spaces-old-native-compat/` also passes the actual new 32-capability
hello through both frozen pre-review native validators, with network forbidden.
During gate 24, the newly extended RPC shutdown test exposed its own out-of-order
request IDs (8/9 inserted before 5): the existing replay guard correctly returned
`-32600`, not the expected shutdown error. Only that test's IDs were corrected
to a monotonic sequence; admission/replay/shutdown runtime guards are unchanged.
`presence-spaces-final-checks/` passes the complete core suite (**1605 passes /
14 deliberate skips**), all **12 affected native** checks, both new drawn
fixtures, nine documentation checks, TypeScript and five isolated bundles on
464 frozen sources. `presence-spaces-lineage.json` confirms its only delta from
gate 24 is that RPC test: all runtime and native fixtures are byte-identical.
The actual installed which-key parser/tree and both frozen old native hello
validators remain separate offline compatibility evidence, not live acceptance.
Git HEAD/staging and the observed bundles at the visible-presence boundary are
unchanged. The historical bundle-integrity failure is not waived; full parity,
Team-description runtime acceptance and reliable manual Busy remain incomplete.

**Broader-regression correction:** the extra revision was a real no-op publication
from disabled/demo `people.spaces` reports, not a metadata-write failure. The engine
now ignores unsupported/disabled/demo and identical relevance reports without
publishing or postponing refresh. New assertions preserve exact whole-state
equality in those cases. No metadata mutation, recovery or receipt assertion was
relaxed. The earlier final-checks copy did not cover those unrelated metadata
consumers and is not acceptance of this later runtime fix.
`presence-spaces-noop-regressions/` passes 91 backend, 20 affected native, ten
drawn, nine documentation checks, TypeScript and five isolated bundles on 464
frozen sources. The fresh broader rerun `presence-spaces-gate-25/` freezes 464
sources and passes **all functional checks**: 1605 core passes / 14 deliberate
skips, **193 native / zero skips, 173 drawn, 198 SDK/cache**, 44 synthetic
messaging, three browser, six research, two loader and nine documentation checks,
TypeScript, five isolated bundles and both help generators. No checkout source
changed during the run. All no-op revision/metadata invariants now pass unchanged.

The overall gate still exits **1 solely for the historical `checkout-bundles`
mismatch**. The observed bundles at the visible-presence boundary, Git HEAD and
empty staging remain unchanged. This is bounded offline functional verification,
not formal runtime acceptance, a bundle rebaseline, live activation, manual Busy
support or completion/resumption of the parity roadmap. Final documentation and
source lineage are recorded in `presence-spaces-completion.json`; only this
verification ledger changes after the frozen gate, with fresh nine-doc checks.

This UI work does not accept Team-description runtime or resume the parity
roadmap. The earlier gate-21 bundle-integrity failure below is preserved:
observed bundles are untouched; `ui-review-baseline.json` records preservation,
not authorization to replace the historical acceptance baseline. No live service,
installed configuration, active editor, OAuth/grant, device, commit or push work.

**Messaging parity implementation in progress:** the
[MF01–MF26 / MP0–MP9 plan](messaging-parity-plan.md) now has an
[implementation ledger](messaging-parity-implementation.md). Local-only MP1/MP2
changes have their own evidence; prior gates below do not accept them. Reactions,
native Sections, sensitive storage and unvalidated providers remain gated.
The frozen `mp2-directory-gate-2/` passes TypeScript/five copied builds,
810 core / 14 deliberate skips, 131 native, 111 drawn, 165 SDK/cache and the
synthetic messaging/browser/research/loader/help/documentation gates. See the
ledger for retained failures and the later MF07/MF11 slice boundary.
**MF07/MF11 bounded selected-room reads now pass their final offline gate:**
`mp3-reads-gate-4/` freezes 407 sources and passes TypeScript/five copied builds,
823 core / 14 deliberate skips, 135 native / zero skips, 115 drawn / zero skips,
165 SDK/cache, 44 synthetic messaging, three browser, six research/nonactivation,
two loader and eight documentation checks, both help generators and integrity.
The [acceptance ledger](messaging-parity-implementation.md#mf07mf11-integrated-acceptance)
retains the paging regression and exact final-source lineage. No full-plan,
account-wide mentions/@all, live filter acceptance or activation claim follows.
The subsequent MF19 **textual profile subset** passes its separate final
`mf19-gate-5/`: 412 frozen sources, TypeScript/five copied builds, **836 core /
14 deliberate skips, 139 native / zero skips, 119 drawn / zero skips, 178
SDK/cache/profile**, 44 messaging, three browser, six research, two loader and
eight documentation passes, both help generators and all integrity checks.
See [MF19 acceptance](messaging-parity-implementation.md#mf19-integrated-acceptance)
for retained failures and finalization. Avatars/custom-status/self-status/DND and
profile writes are not implemented by this read-only subset.
The later MF13 inert readable-card / loaded-list slice passes its separate
`mf13-gate-6/`: **416 frozen sources, 844 core / 14 deliberate skips, 141 native /
zero skips, 121 drawn / zero skips, 178 SDK/cache/profile**, 44 messaging, three
browser, six research, two loader and eight documentation passes, TypeScript,
five copied builds, both help generators and all integrity checks.
[MF13 acceptance](messaging-parity-implementation.md#mf13-integrated-acceptance)
records retained failures and finalization. No card action, input submission,
image/URL transfer, full layout parity or live activation is claimed.
MF25's later explicit joined-Team listing passes its separate `mf25-gate-7/`:
**420 frozen sources, 860 core / 14 deliberate skips, 145 native / zero skips,
125 drawn / zero skips, 178 SDK/cache/profile**, 44 messaging, three browser,
six research, two loader and eight documentation passes, TypeScript/five copied
builds, both help generators and all integrity checks.
[MF25 acceptance](messaging-parity-implementation.md#mf25-integrated-acceptance)
retains the late-page expiry regression and finalization. `Wvt` loaded
associations are unchanged; public discovery, joins, management and unloaded-room
reads are not implemented by this subset. No live activation occurred.

**MF14 contract-first step:** the
[Markdown+single-file contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract)
is approved for offline implementation only. Three installed Node serializer
cases pass with exact fields/binary bytes and **zero socket connections**; no
Webex POST or service/ACK acceptance occurred. At that contract-first boundary,
the upload/native extension was not implemented; multiple files remain
unsupported by the reviewed provider. Prior integrated gate counts were not
promoted to accept the new contract.
See the [boundary/evidence ledger](messaging-parity-implementation.md#mf14-contract-first-boundary).
Contract-step regression checks pass: **58 existing upload/action backend,
12 native, eight documentation tests and TypeScript**, all zero skips. Both
frozen-old-editor hello compatibility probes pass; five baseline gap probes
are diagnostic evidence only. `mf14-contract-finalization.json` verifies a
three-Markdown-only delta with unchanged runtime/test/help, bundles and Git
HEAD/staging. Implementation and its gate were still pending at that boundary;
no full-plan completion follows.
The subsequent MF14 runtime/native extension passes its separate `mf14-gate-8/`:
**423 frozen sources, 896 core / 14 deliberate skips, 149 native / zero skips,
129 drawn / zero skips, 178 SDK/cache/profile**, 44 messaging, three browser,
six research, two loader and eight documentation passes, TypeScript/five copied
builds, both help generators and all integrity checks.
[MF14 acceptance](messaging-parity-implementation.md#mf14-integrated-acceptance)
retains expected-red and fixture-failure lineage and finalization. Only Markdown
plus one file is accepted offline; multiple files, recipient-first rich/file
DMs, live service acceptance and full roadmap completion are not claimed.
The earlier contract-only finalizer is historical; `mf14-finalization.json`
verifies the runtime gate's Markdown-only acceptance delta.

**MF15 contract-first work:** the
[exact-recipient rich/single-file contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract)
is recorded for offline implementation. Four installed Node encoded-wire cases
pass with zero socket connections/service POSTs; this is not recipient-echo or
live tenant/file acceptance. The runtime remained plaintext-only at that boundary.
Expected-red backend/native tests are now retained; no old gate or full-plan
completion is promoted from this research. See the
[MF15 boundary](messaging-parity-implementation.md#mf15-contract-and-expected-red-boundary).
`mf15-red-2/` records **12/13 backend failures and four native failures**,
then deliberately pending implementation; its one backend pass is a pre-existing
wrong-recipient refusal, not a delivered rich/file feature. At that boundary the
normal runners included these tests and were not all green. Separately,
`mf15-guards-2/` passes **73 existing backend, ten existing native, eight docs
checks and TypeScript**, all zero skips. The contract finalizer verifies only
documentation/test edits and unchanged runtime/help/bundles/HEAD/staging.
The subsequent [MF15 runtime slice](messaging-parity-implementation.md#mf15-recipient-richfile-runtime-slice)
extends those existing owners; **151 affected backend, 16 native, six drawn,
eight documentation checks and TypeScript pass**, all zero skips.
The fresh `mf15-gate-9/` now passes: **427 frozen sources, 946 core / 14 deliberate
skips, 153 native / zero skips, 133 drawn / zero skips, 178 SDK/cache/profile**,
44 messaging, three browser, six research, two loader and eight documentation
checks, TypeScript/five copied builds, both help generators and all integrity
checks. See [MF15 acceptance](messaging-parity-implementation.md#mf15-integrated-acceptance).
The contract-only finalizer remains historical; `mf15-finalization.json` verifies
this runtime gate's Markdown-only acceptance delta, unchanged runtime/test/help,
ten bundles and HEAD/staging. Recipient Markdown/one-file modes are accepted
offline only; live tenant/recipient echo/file acceptance, multiple files and full
MF01–MF26 completion remain unclaimed.

**MF10 provider gate:** the
[dated search review](messaging-public-provider-audit.md#mf10-server-indexed-search-provider-gate)
records **NO-GO**: reviewed Messages v1 exposes required-room history, not indexed
keyword/cross-space search. Connected tool metadata describes client-side
filtering/automatic paging; the separate Suite MCP overview claim still lacks
validated query/index/result/paging/permission schemas. No search tool/service
operation or scope expansion occurred. Feature red tests/runtime are deferred
until a supported bounded contract is approved; `/` remains loaded-buffer search.
See the [MF10 boundary](messaging-parity-implementation.md#mf10-provider-validation-boundary).
`mf10-provider-checks-2/` passes four diagnostic probes, **27 existing backend,
eight native, eight docs checks and TypeScript**, all zero skips; both additional
actual-editor loaded-search/undo probes pass. These are nonactivation/regression
checks, not indexed-search acceptance. `mf10-provider-finalization.json` verifies
three Markdown-only edits with unchanged runtime/tests/native help, ten bundles
and HEAD/staging. A supported indexed-search contract remains the blocker;
credentials/live probes are neither needed nor requested for this decision.

**MF23 rename contract-first step:** the
[standalone title-only contract](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract)
is approved for offline implementation/tests, not live activation. Four public
v1 schemas and three official policy sources were reviewed; one current
PublicREST memory-sink wire case passes with zero connections/service writes.
Team/direct spaces and all other settings remain excluded; MF10 stays gated.
Expected-red backend/native tests are added before runtime changes; prior gates
do not accept them. See the
[MF23 boundary](messaging-parity-implementation.md#mf23-rename-contract-and-expected-red-boundary).
`mf23-rename-red/` retains **21 backend / four native expected failures**, zero
skips/cancellations. At that boundary the normal runners included these cases
and were not all green. Separately, `mf23-rename-guards/` passes **91 existing
backend, 12 existing native, eight docs checks and TypeScript**, all zero skips.
The contract finalizer verifies documentation/test-only edits and unchanged
runtime/native help, bundles, HEAD and staging. This does not unblock MF10,
implement rename or complete MF23/the roadmap.
The subsequent [runtime slice](messaging-parity-implementation.md#mf23-standalone-rename-runtime-slice)
implements the bounded title-only action through existing owners. Final focused
verification passes **158 affected backend, 16 native, four drawn, eight docs
checks and TypeScript**, zero skips; both frozen-old-native compatibility probes
pass. The final copied-project acceptance is recorded below. Historical contract/
MF15 finalizers do not accept these runtime changes; MF10 remains gated and live
tenant/policy acceptance remains unrun.
`mf23-gate-10/` is **not accepted**: core/build/supporting suites pass, but an
inert card-text mock missing the new support helper causes two native and two
drawn failures. The mock now reports rename unsupported, retaining its no-RPC
guard. Native selected-room source validation was also tightened with new
unrelated-draft coverage. `mf23-focused-6/` passes **158 backend, 18 native, six
drawn, eight docs and TypeScript**, zero skips. The failed gate is retained.
`mf23-gate-11/` predates a separately reproduced create-result metadata replay
bug and does not accept the final inputs. The engine now returns retained create
evidence without re-merging its old title after a confirmed rename; no mutation
retry was involved. The actual-demo regression passes in `mf23-focused-7/`:
**159 backend, 18 native, six drawn, eight docs and TypeScript**, zero skips.
The final fresh **`mf23-gate-12/` passes**: **431 frozen sources, 1014 core /
14 deliberate skips, 157 native / zero skips, 137 drawn / zero skips, 178
SDK/cache/profile**, 44 synthetic messaging, three browser, six research, two
loader and eight docs checks, TypeScript/five copied builds, both help generators
and all integrity checks. See [MF23 acceptance](messaging-parity-implementation.md#mf23-integrated-acceptance).
`mf23-finalization.json` verifies Markdown-only acceptance edits, unchanged
runtime/tests/native help, all ten checkout bundles/maps and HEAD/staging.
The separately green gate 11 accepts its older frozen inputs only, not the later
replay correction. Standalone title-only rename is accepted **offline only**;
MF10 remains gated, other MF23 settings/Team/direct/move/delete and live tenant/
policy acceptance remain unclaimed. Full MF01–MF26 completion is still false.

**MF23 description contract-first step:** the
[bounded replacement contract](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract)
requires a mandatory title echo on the public PUT, not a description-only body.
Both concurrent-description and concurrent-title overwrite risks are explicit.
Missing descriptions are not inferred empty; clearing and Team/direct/general
settings remain excluded. Two public schemas plus hash-linked existing
permission/policy evidence and two memory-sink wire cases are retained; **zero
connections/service writes**. No runtime/help feature, live authorization or
full-roadmap completion follows. New expected-red backend/native tests are
registered before implementation; see the
[description boundary](messaging-parity-implementation.md#mf23-description-contract-and-expected-red-boundary).
`mf23-description-red/` records **26 backend / four native expected failures**,
zero skips/cancellations; default suites intentionally include these red tests.
`mf23-description-guards/` separately passes **159 existing backend, 18 existing
native, eight docs checks and TypeScript**, all zero skips. Five frozen-old-native
compatibility assertions per editor pass without enabling description support.
The contract finalizer verifies documentation/test-only changes and preserved
runtime/native help, ten checkout bundles/maps and HEAD/staging. These are not
description implementation/live acceptance or full-roadmap completion at that
historical frozen boundary.

**MF23 description runtime:** the subsequent
[runtime slice](messaging-parity-implementation.md#mf23-description-replacement-runtime-slice)
implements preparation/replacement through existing owners, with separate native
editing and required title-echo consent. The **434-source** runtime baseline is
retained; current sources add the physical description transport test.
`mf23-description-focused-3/` passes **218 affected backend, 22 native, ten drawn,
eight docs checks and TypeScript**, zero skips/cancellations. Coverage includes
exact wire/ACK/nonpublication, grants, both preimage conflicts, rename/description
uncertainty/recovery, saturation, deadlines/physical settlement, read races,
120-second/eight-buffer limits and native undo/maps/colorschemes. The earlier
focused-1 fixture scope failures remain retained. Delivered help is updated;
`mf23-description-focused-4/` repeats the same green counts after those updates.

**Final `mf23-description-gate-13/` passes:** **435 frozen sources, 1073 core /
14 deliberate skips, 161 native / zero skips, 141 drawn / zero skips, 178
SDK/cache/profile**, 44 synthetic messaging, three browser, six research, two
loader and eight docs checks, TypeScript/five isolated copied builds, both help
generators and all integrity checks. No checkout changes occurred during the
gate. See [description acceptance](messaging-parity-implementation.md#mf23-description-integrated-acceptance).
`mf23-description-runtime-finalization.json` verifies two Markdown-only
acceptance edits with unchanged runtime/tests/native help, ten checkout
bundles/maps and HEAD/staging, plus fresh documentation checks.
Historical red/contract-only/rename gates and finalizers remain scoped to their
own frozen inputs, not current description runtime acceptance. Counts overlap;
do not sum suites as independent cases.

This accepts only bounded standalone nonblank replacement **offline**.
Required title echo retains concurrent-description/title overwrite risks;
missing/null is not empty, clearing and Team/direct settings remain excluded.
MF10 and all other unaccepted operations remain gated/planned; live title-echo/
tenant/policy acceptance and full MF01–MF26 parity remain unclaimed.

**MF23 lock/unlock contract-first step:** the
[bounded moderation contract](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract)
is approved for offline tests/subsequent implementation, **not runtime/live
release**. The public PUT requires title echo; locking is creator-self-only
with fresh nonmoderator membership, unlocking needs fresh moderator proof.
Explicit private/nonannouncement flags and exact raw preconditions are required;
no Team/direct/General/guest/public/announcement/role-management workaround.
Two fresh schemas / five fresh policy sources and two memory-sink wire cases
are retained, with zero connections/service writes. New expected-red backend/
native tests precede implementation; see the
[lock boundary](messaging-parity-implementation.md#mf23-lockunlock-contract-and-expected-red-boundary).
Gate 13/finalizers remain acceptance only of their older frozen inputs.
`mf23-lock-red/` records **32 backend / four native expected failures**, zero
skips/cancellations, registered in the normal runners before runtime changes.
`mf23-lock-guards/` separately passes **218 existing backend, 22 existing native,
eight docs checks and TypeScript**, all zero skips. Six frozen-old-native
compatibility assertions per editor pass without enabling lock/unlock.
`mf23-lock-contract-finalization.json` verifies documentation/test-only changes,
unchanged runtime/native help/accepted cases, all ten checkout bundles/maps,
HEAD/empty staging and fresh documentation checks. This is not lock/unlock
runtime/live acceptance at that historical boundary, when normal suites
intentionally included the red cases. No new build/integrated gate or
full-roadmap completion was claimed there.

**MF23 lock/unlock runtime:** the subsequent
[runtime slice](messaging-parity-implementation.md#mf23-lockunlock-runtime-slice)
implements finite moderation through existing owners, strict opt-in role proof,
independent negotiation and named-only native consent. The **438-source**
runtime baseline is retained. `mf23-lock-focused-2/` passes **298 backend,
26 native, 14 drawn, eight docs checks and TypeScript**, zero skips/cancellations.
This includes exact title/flag wire, private/creator/moderator and raw ACK
guards, status/refusal/overflow, grant/selection/session loss, shared uncertainty/
original-request/late-ACK recovery, no publication and physical settlement.
Delivered help is updated; `mf23-lock-focused-3/` repeats the same green counts
after those documentation updates.

**Final `mf23-lock-gate-14/` passes:** **439 frozen sources, 1146 core /
14 deliberate skips, 165 native / zero skips, 145 drawn / zero skips, 178
SDK/cache/profile**, 44 synthetic messaging, three browser, six research, two
loader and eight docs checks, TypeScript/five isolated copied builds, both help
generators and all integrity checks. No checkout changes occurred during the
gate. See [lock/unlock acceptance](messaging-parity-implementation.md#mf23-lockunlock-integrated-acceptance).
`mf23-lock-runtime-finalization.json` verifies two Markdown-only acceptance
edits, unchanged runtime/tests/native help, ten checkout bundles/maps and
HEAD/empty staging, plus fresh documentation checks. Older red/contract/
description/rename evidence remains scoped to its own frozen inputs; the
historical 32/four expected failures are not current runtime status.

This accepts only bounded **private standalone** moderation offline:
creator-self/nonmoderator lock or fresh-moderator unlock, explicit critical
flags, no inferred roles or main metadata publication. Required title echo
and concurrent role/moderation races remain; no public/announcement/Team/direct
role-management workaround. MF10 and all other unaccepted operations remain
gated/planned; live unlock/role/title-echo/tenant acceptance and full MF01–MF26
completion remain unclaimed. Counts overlap; do not sum independent suites.

**MF23 announcement-mode contract-first step:** the
[bounded announcement contract](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract)
is approved for offline tests/subsequent implementation, **not runtime/live
release**. Both directions require fresh moderator proof in an already locked,
explicitly private standalone group. No implicit lock/role/public conversion;
the sole PUT echoes title with `isAnnouncementOnly`. Consent must disclose
participant notification on enable, moderator/bot/integration posting exceptions
and concurrent title/lock/mode/role races. Two fresh schemas / two fresh policy
sources plus hash-linked permission evidence and two memory-sink wire cases
are retained; zero connections/service writes. New expected-red backend/native
tests precede runtime/help changes; see the
[announcement boundary](messaging-parity-implementation.md#mf23-announcement-contract-and-expected-red-boundary).
Gate 14/finalizers remain scoped to their earlier frozen inputs.
`mf23-announcement-red/` records **32 backend / four native expected failures**,
zero skips/cancellations, registered before runtime changes in the normal
runners. `mf23-announcement-guards/` separately passes **298 existing backend,
26 existing native, eight docs checks and TypeScript**, all zero skips.
Seven frozen-old-native compatibility assertions per editor pass without
enabling announcement mode. `mf23-announcement-contract-finalization.json`
verifies documentation/test-only changes and preserved runtime/delivered help/
existing accepted cases, ten checkout bundles/maps, HEAD/empty staging and
fresh docs checks. This was not announcement runtime/live acceptance; normal
suites intentionally included the new red cases at that frozen boundary.
No new build/integrated gate or full-roadmap completion was claimed there.

**MF23 announcement runtime:** the subsequent
[runtime slice](messaging-parity-implementation.md#mf23-announcement-mode-runtime-slice)
implements explicit On/Off through existing owners, independent negotiation,
fresh own moderator/locked/private proof and named-only consent. The
**442-source** runtime baseline is retained. `mf23-announcement-focused-2/`
passes **377 backend, 30 native, 18 drawn, eight docs checks and TypeScript**,
zero skips/cancellations. Coverage includes actual two-field UTF-8 wire,
critical flags/role/ACK/refusal/conflict/overflow, grant/selection/session loss,
four-way uncertainty/original-request/late-ACK recovery, no publication and
stubborn native GET/PUT settlement. Delivered help now discloses participant
notification/posting exceptions and mandatory title/lock/mode/role races.
`mf23-announcement-focused-3/` repeats the same green counts after delivered
help/protocol/workflow updates.

**Final `mf23-announcement-gate-15/` passes:** **443 frozen sources, 1225 core /
14 deliberate skips, 169 native / zero skips, 149 drawn / zero skips, 178
SDK/cache/profile**, 44 synthetic messaging, three browser, six research, two
loader and eight docs checks, TypeScript/five isolated copied builds, both help
generators and all integrity checks. No checkout changes occurred during the
gate. See [announcement acceptance](messaging-parity-implementation.md#mf23-announcement-mode-integrated-acceptance).
`mf23-announcement-runtime-finalization.json` verifies two Markdown-only
acceptance edits, unchanged runtime/tests/native help, ten checkout bundles/maps
and HEAD/empty staging, plus fresh documentation checks. Historical red/
contract/lock/description/rename evidence stays scoped to its frozen inputs;
the earlier 32/four expected failures are not current runtime status.

This accepts only explicit **already-moderated private standalone** announcement
On/Off offline, with fresh own moderator proof and no implicit lock/private/
role writes. Consent discloses Webex's enable notification, posting exceptions
and mandatory title-echo/lock/mode/role races. Results publish no main state,
fake messages/alerts, delivery/plugin-send exclusions or receipt authority.
MF10 and other unaccepted operations remain gated/planned; no live mode/
notification/role/title-echo/tenant acceptance or full MF01–MF26 completion is
inferred. Counts overlap; do not sum suites as independent cases.

**MF23 description-clearing contract-first step:** the
[separate clear contract](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract)
is approved for offline tests/subsequent implementation, **not runtime/live
release**. The documented input is one ASCII space with mandatory title echo;
public spaces require a description and are excluded. Only explicitly empty
raw ACK can confirm, **not** missing/null/echoed sentinel; canonical real-service
clear ACK representation remains unestablished. Clearing must be a separate
named action from an unchanged private description preparation, never blank
Submit. Two fresh schemas/two fresh policies and hash-linked permission
evidence plus two memory-sink exact-byte cases are retained, zero connections/
service writes. Expected-red backend/native tests precede runtime/help changes;
see the [clear boundary](messaging-parity-implementation.md#mf23-description-clearing-contract-and-expected-red-boundary).
Gate 15/finalizers accept only their earlier frozen inputs.
`mf23-description-clear-red/` records **33 backend / four native expected
failures**, zero skips/cancellations, registered in normal runners before any
runtime/help changes. `mf23-description-clear-guards/` separately passes **377
existing backend, 30 existing native, eight docs checks and TypeScript**, all
zero skips. Eight frozen-old-native compatibility assertions per editor pass
without enabling clearing. The clear contract finalizer verifies eight-path
documentation/test-only changes, unchanged runtime/help/existing accepted
cases, ten checkout bundles/maps, HEAD/empty staging and fresh docs checks.
This was not clear runtime/live/canonical-ACK acceptance; normal suites
intentionally included new red cases at that historical boundary. No new
build/integrated gate or full-roadmap completion was claimed there.

**MF23 description-clearing runtime:** the subsequent
[runtime slice](messaging-parity-implementation.md#mf23-description-clearing-runtime-slice)
implements the separate named action through existing owners/private unchanged
preparation. The **446-source** runtime baseline is retained.
`mf23-description-clear-focused-3/` passes **463 backend, 34 native, 22 drawn,
eight docs checks and TypeScript**, zero skips/cancellations. Earlier focused
undo-synchronization/synthetic-revision fixture failures remain retained.
Coverage includes physical exact-sentinel wire, strict raw empty-vs-ambiguous
ACKs/flags/grants/roles/preimages/status/overflow, selection/session loss,
five-way uncertainty/original-evidence/late-ACK recovery, no publication and
physical GET/PUT settlement. Delivered help is updated.
**`mf23-description-clear-gate-16/` is not accepted:** 1312 core / 14 deliberate
skips, 173 native, supporting/build/help/integrity checks pass, but only
**151/153 drawn** pass; both recovery PTYs stop at `-- More --` and time out.
Its 447 frozen inputs stayed unchanged. The recovery fixture now sets
`nomore`, preserving all assertions and runtime behavior, and the focused
runner adds drawn recovery for both editors. Failed gate/captures remain
retained, not promoted to acceptance. `mf23-description-clear-focused-5/`
then passes **464 backend, 34 native,
24 drawn, eight docs and TypeScript**, zero skips/cancellations, including both
drawn recovery fixtures. Canonical service clear ACKs and live
clear/title-echo/permission/tenant behavior remain unestablished, not inferred
from offline explicit-empty mocks. MF10/full-roadmap gates remain unchanged.

**Final `mf23-description-clear-gate-17/` passes:** **447 frozen sources, 1312
core / 14 deliberate skips, 173 native / zero skips, 153 drawn / zero skips,
178 SDK/cache/profile**, 44 synthetic messaging, three browser, six research,
two loader and eight docs checks, TypeScript/five isolated copied builds,
both help generators and all integrity checks. No checkout changes occurred
during verification. See [clearing acceptance](messaging-parity-implementation.md#mf23-description-clearing-integrated-acceptance).
`mf23-description-clear-runtime-finalization.json` verifies two Markdown-only
acceptance edits, unchanged runtime/tests/native help, ten checkout bundles/maps,
HEAD/empty staging and fresh documentation checks. It also preserves failed
gate 16 and both pager captures, verifying the exact one-line fixture correction
plus two Markdown-file delta between gates. Historical red/contract/older gate
evidence accepts only its own frozen inputs. Counts overlap; do not sum suites
as independent cases.

This accepts only separate private standalone description clearing **offline**,
with unchanged private preparation and strict explicit-empty ACK confirmation.
Ambiguous ACKs stay unknown and canonical service output/live title-echo/
clear/permission/tenant behavior remains unverified. Native text/full undo,
keys and existing drafts/files survive; blank Submit/Enter/write do not clear.
MF10 and other unaccepted operations stay gated/planned; full MF01–MF26
completion remains unclaimed.

**MF23/MF24 standalone moderator-management review:** the
[provider review](messaging-public-provider-audit.md#mf23mf24-standalone-moderator-management-review--provider-no-go)
is **NO-GO**, not an approved role runtime contract. Three fresh Memberships
schemas require both `isModerator` and direct-space `isRoomHidden` on PUT;
role-only omission and group/third-party personal-preference echo semantics
remain unvalidated. Four fresh policy sources document space-moderator
permissions and Team-space last-moderator Leave constraints, not atomic
standalone demotion guarantees. Fresh four-read actor/Room/own/target proof
would need its own reviewed budget; old three-read metadata limits are not
expanded. Evidence uses JSON-only public-document parsing, zero authenticated
service reads/writes, no role/hidden PUTs or live experiments.
Passing backend/native NO-GO regressions are registered separately from
feature implementation; see the
[moderator boundary](messaging-parity-implementation.md#mf23mf24-standalone-moderator-review--provider-no-go).
Runtime/delivered help remain unchanged; gate 17 accepts its frozen earlier
inputs only. Full-roadmap completion and moderator runtime remain false.

`mf23-moderator-focused-2/` passes **472 backend, 38 native, 28 drawn, eight
docs checks and TypeScript**, zero skips/cancellations and no source changes
during verification. This includes eight new backend / four new native NO-GO
cases, with both new fixtures and conversation recovery drawn in Vim/Neovim.
The earlier focused-1 run passes the same counts; focused-2 strengthens actual
DM/Remove/Cancel menu coverage and complete snapshot/event nonpublication.
Counts overlap; do not sum suites as independent cases.

`mf23-moderator-gate-finalization.json` verifies the exact eight-path
docs/test-only delta, **447→450 sources**, unchanged runtime/delivered help/
existing accepted cases, registration-only runner edits, five existing
metadata singletons, the 32-capability count/ceiling, ten checkout bundles/maps
and HEAD/empty staging. A fresh eight-check docs run covers final ledger/index
results. No new integrated build/full-suite or moderator runtime acceptance:
passing rejection guards do not release the provider gate. No live operations
or activation; `moderator_runtime_implemented:false`,
`moderator_runtime_accepted:false` and `full_plan_complete:false`.

**MF22 contract-first preference review:** [review and bounded contract](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract).
The **450-source** baseline follows moderator NO-GO finalization. Six fresh
schemas/four product sources approve only an explicit **read-only own-direct
membership API hidden-flag observation**, not product Hidden list/sync,
Favorites, server mute or any preference/role write. Missing optional flag
is Not provided/null, never false. The paired mandatory moderator field still
blocks visibility-only writes; internal SDK helpers remain unapproved.
Existing local grouping/alert mute remain distinct and unchanged.
The [contract-first tests](messaging-parity-implementation.md#mf22-preference-review-and-visibility-read-contract-first-boundary)
were expected-red before runtime/help changes. Moderator/MF10/Sections/reaction/
storage gates remain binding; no live operations or full parity acceptance.
`mf22-visibility-contract-checks/` retains **20 backend / four native / four
drawn expected failures**, zero skips/cancellations, before those interfaces
were implemented. Existing guards separately pass **492 backend, 48 native,
16 drawn, eight docs and TypeScript**, all zero skips. Nine frozen-client
compatibility assertions per editor pass without enabling the API observation.
The finalizer checks the exact eight-path docs/test-only **450→453-source**
delta, unchanged runtime/help/existing cases, five strict metadata singletons,
32-capability ceiling, ten bundles/maps and HEAD/empty staging, plus fresh
eight-check docs verification. Normal new tests were intentionally red there;
that boundary did not accept a runtime read, Hidden list/sync or any preference/role write.
Historical gates/finalizers remain frozen, not reused for later source.

**MF22 raw own-direct API visibility runtime:** the
[runtime slice](messaging-parity-implementation.md#mf22-own-direct-visibility-runtime-slice)
extends existing RoomMembers/feature/PublicREST/native-list owners, not a new
preference provider/store. The **453-source** runtime baseline is preserved.
`mf22-visibility-focused-2/` passes **559 backend, 52 native, 20 drawn, eight
docs and TypeScript**, zero skips/cancellations, including 47 real-engine/
PublicREST loopback cases and physical self/Room/membership settlement across
timeout/reset. Focused-1's Vim-only fixture `count` variable failure is retained;
it was corrected without dropping assertions. Delivered help and strengthened
reply/file/reset/Refresh checks are included in the fresh gate below.
`mf22-visibility-focused-3/` repeats the same green **559 / 52 / 20 / eight /
TypeScript** counts after those additions, zero skips/cancellations.
This remains only a raw optional own-direct API flag observation; no product
Hidden/Favorites/server mute, preference/role write, live acceptance or gate
release is inferred.

**Final `mf22-visibility-gate-18/` passes:** **454 frozen sources, 1387 core /
14 deliberate skips, 181 native / zero skips, 161 drawn / zero skips, 178
SDK/cache/profile**, 44 synthetic messaging, three browser, six research, two
loader and eight docs checks, TypeScript/five isolated copied builds, both
help generators and all integrity checks. No checkout changes occurred during
verification. See [visibility acceptance](messaging-parity-implementation.md#mf22-visibility-integrated-acceptance).
`mf22-visibility-runtime-finalization.json` verifies two Markdown-only
acceptance edits, unchanged runtime/tests/native help, ten checkout bundles/maps,
HEAD/empty staging and fresh documentation checks. Historical expected-red/
focused-failure/contract/moderator/metadata evidence remains retained and scoped
to its own frozen source, not promoted to acceptance of later inputs.

This accepts only **explicit raw own-direct-membership API flag reads offline**,
with fresh self/direct Room/exact own identity and unchanged read/physical/byte
limits. Missing flag is Not provided/null, never false; malformed raw values
refuse. Local grouping/notifications, main state, drafts/files/undo/keys and
provider gates are preserved. Current product Hidden list/sync, Favorites,
server mute, preference/role writes and live tenant behavior remain unaccepted.
Moderator/MF10/reaction/Sections/security NO-GOs and `full_plan_complete:false`
remain binding. Counts overlap; do not sum suites as independent cases.

**MF24 Team-rename contract-first review:** [provider contract](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review)
and [ledger](messaging-parity-implementation.md#mf24-team-rename-review-and-contract-first-boundary).
The accepted gate-18 **454-source** state is preserved. Six fresh selected
schemas/three policy sources support a name-only PUT with fresh current Team
moderator proof. Team Memberships has no personId filter; require one complete
≤100-row response, reject paging/ambiguity and never infer role from creator/
Room/joined labels. Fresh raw name/ACK, known grants, exact joined selection,
shared ledger/original-request recovery and unchanged physical bounds apply.
New backend/Vim/Neovim tests were intentionally red before runtime/help changes.
No Team-membership write/ID-path or generic transport expansion, live permission/
description-preservation claim or release of moderator/MF22/MF10/other gates.
`team_rename_runtime_implemented:false`, `team_rename_runtime_accepted:false`,
`full_plan_complete:false` at that boundary.
`mf24-team-rename-contract-checks-2/` retains **22 backend / four native /
four drawn expected failures**, zero skips/cancellations, for missing interfaces/
path admission—not executed later safety assertions or feature acceptance.
Existing regressions pass **585 backend, 56 native, 24 drawn, eight docs and
TypeScript**, zero skips/cancellations; ten frozen-client assertions per editor
pass without enabling Team writes. The earlier contract-checks run is retained.
The finalizer checks the exact eight-path **454→457-source** docs/test-only
delta, unchanged runtime/help/accepted cases, registration-only runner edits,
the five metadata/own-direct assertions, 32-capability ceiling, ten bundles/maps
and HEAD/empty staging, plus fresh eight-check docs. No integrated runtime gate,
live acceptance or historical-gate promotion is inferred. Team-rename remains
unimplemented and new normal tests intentionally red at that boundary; all NO-GO gates persist.

**MF24 Team-rename runtime:** the [runtime slice](messaging-parity-implementation.md#mf24-team-rename-runtime-slice)
extends existing ServerTeams/ConversationActions/engine/PublicREST/native
owners from the **457-source** contract baseline. Fresh complete ≤100-row own
Team-moderator proof, raw name/ACK, name-only PUT, shared ledger/original-request
recovery, no replay and unchanged physical bounds; no membership/role writer.
Focused-1 passes **607 backend, 60 native, 28 drawn, eight docs and TypeScript**.
Focused-2's **668 backend / 61 physical cases** pass; retained native **58/60**
and drawn **26/28** expose synchronous RPC/error handling masking protocol error
as Vim E171. A separate-statement correction keeps mismatch uncertainty and
all assertions; the four native Team fixtures pass in the recovery-fix log.
`mf24-team-rename-focused-3/` passes **675 backend / 68 physical cases, 60
native, 28 drawn, eight docs and TypeScript**, zero skips/cancellations, with
delivered help and preparation/Link/chunk/native cursor/mismatch coverage.
Fresh integrated acceptance is recorded below. No live/optional-description/tenant/
atomic-update claim or other NO-GO release is inferred.

**MF24 gate 19 is not accepted:** 1477 core / 14 deliberate skips and all
165 drawn pass, as do builds/help/supporting suites/integrity, but native is
**184/185**. The unchanged `Neovim/space-description` eight-preparation-loop
failure cascades into ninth-slot/replacement assertions; Team-rename fixtures
pass in both editors/headless/drawn. Fourteen unchanged compiled reruns and
110 trace-only diagnostic runs pass, without reproducing the failure.
Cause remains **unproven**, not fixed by reruns. The initial diagnostic runner's
bad Node-path startup failures are retained/excluded, not service failures.
No runtime/test/help/timing/assertion/retry change is made for that result;
a fresh full gate was required. Gate 19 and all earlier reports remain frozen.

**MF24 final `mf24-team-rename-gate-20/` passes:** **458 frozen sources, 1477
core / 14 deliberate skips, 185 native / zero skips, 165 drawn / zero skips,
178 SDK/cache/profile**, 44 synthetic messaging, three browser, six research,
two loader and eight documentation checks, TypeScript/five isolated copied
builds, both help generators and all integrity checks. No checkout changes
occurred during verification. See [Team-rename acceptance](messaging-parity-implementation.md#mf24-team-rename-integrated-acceptance).
The finalizer verifies two Markdown-only acceptance edits, unchanged runtime/
tests/native help, 457→458-source lineage, five metadata/own-direct assertions,
32-capability ceiling, ten checkout bundles/maps and HEAD/empty staging, plus
fresh eight-check docs. Earlier expected-red/failed/frozen reports are not
promoted or rerun as acceptance of later sources.

Only **bounded explicit name-only Team rename is accepted offline**, with
fresh current moderator/raw-name/ACK proof, exact joined selection, original-
request recovery and no replay or membership/role writer. The 68 physical
transport cases and native consent/callback/cursor/mismatch/work-preservation
guards pass. Main state, notifications/receipts, native files/drafts/undo/keys,
local filters and independent meeting ownership/defaults remain preserved.
Gate 19's intermittent legacy Neovim description-fixture failure stays
**unexplained/unfixed by reruns**; gate 20 passes the same runtime/tests/help,
without changing assertions, timeouts or retry behavior. It is not a
reproducibility/root-cause claim. No live/optional-description/tenant/atomic
acceptance, other Team/role/preference operation or NO-GO release is inferred.
`team_rename_runtime_implemented:true`, `team_rename_runtime_accepted:true`
(offline only), `full_plan_complete:false`. Counts overlap; do not sum suites.

**MF24 Team-description contract-first review:** [provider contract](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review)
and [ledger](messaging-parity-implementation.md#mf24-team-description-review-and-contract-first-boundary).
The accepted **458-source** gate-20 boundary is preserved. Two fresh Team
schemas/one policy source plus explicitly hash-linked self/joined/role evidence
support changed nonblank description replacement **with mandatory exact name
echo**, raw string preimage and fresh explicit moderator proof. Missing/null is
not empty; no Team clear/sentinel/role/preference echo. Non-atomic name AND
description overwrite risks are disclosed. Three GETs per phase/one PUT maximum,
same physical/ledger owners, two-way rename/description uncertainty and exact
original-request recovery, no main/cache/notification publication.
Native work reuses the combined eight-private-prepare budget, not a parallel
registry, with named actions and strict scope/undo/consent/source guards.
New backend/native tests were expected-red before runtime/help changes.
No old-gate promotion, live/tenant/CAS claim or other NO-GO release;
`team_description_runtime_implemented:false`,
`team_description_runtime_accepted:false`, `full_plan_complete:false` at that boundary.
`mf24-team-description-contract-checks/` retains **24 backend / four native /
four drawn expected failures**, zero skips/cancellations, at missing finite
interfaces—not later safety-assertion execution or runtime acceptance.
Existing checks pass **675 backend, 60 native, 32 drawn, eight docs and TypeScript**,
zero skips/cancellations; eleven frozen-client assertions per editor pass
without enabling description writes. The finalizer checks the exact eight-path
docs/test-only **458→461-source** delta, unchanged runtime/help/accepted cases,
registration-only runner changes, seven older assertions/32-capability ceiling,
ten checkout bundles/maps and HEAD/empty staging, plus fresh eight-check docs.
No new integrated gate/historical-gate promotion or explanation/fix of gate
19's intermittent legacy failure is claimed. Default new tests remain
intentionally red at that boundary; all other provider/security/clear/role/preference gates persist.

**MF24 Team-description runtime:** [runtime slice](messaging-parity-implementation.md#mf24-team-description-runtime-slice)
extends existing ServerTeams/ConversationActions/engine/native owners from the
**461-source** contract baseline. Fresh explicit raw name/description/current
moderator proof, exact required name echo+replacement PUT/ACK, shared ledger/
physical admission and two-way rename/description uncertainty; no clear/sentinel/
role/preference echo. Native scope/immutable-preimage/source/consent guards
share the combined eight-active Room+Team preparation budget/read/clock; ACK
settles private status only, never Team cache/query/name or main-state/receipt/
notification publication. Named actions preserve native undo/text/files/keys.
Focused-1 and targeted-2 failures are retained with actual fixes, not retried
into acceptance. Targeted-3 passes TypeScript, four native and 107 backend
(24 contracts / 83 physical) checks. Fresh final focused/integrated gate is
pending the added native callback/mismatch/mixed-budget guards at that point.
`mf24-team-description-focused-2/` passes **782 backend (including 83 physical
cases), 64 native, 36 drawn, eight docs and TypeScript**, zero skips/cancellations,
without source changes during verification. All new/affected native guards
execute in both editors; the unaccepted isolated gate result follows. No live/CAS/
tenant claim or other NO-GO release; gate 19's legacy intermittent native
failure remains unexplained. Full parity remains incomplete.

**Pause checkpoint, 2026-11-16:** `mf24-team-description-gate-21/` passes all
functional checks on **462 frozen sources**: **1584 core / 14 deliberate skips,
189 native, 169 drawn, 178 SDK/cache/profile**, 44 synthetic messaging,
three browser, six research, two loader and eight docs, TypeScript/five copied
builds and both help generators. Source freeze, HEAD/empty staging and diff
checks pass. **Overall gate exits 1 and is NOT accepted:** seven checkout
bundle/map hashes differ from the original baseline. Their observed mtimes
precede gate launch; cause/actor is unproven. All ten observed bundles/hashes
are retained in `mf24-team-description-bundle-drift/`; none is restored,
overwritten or silently rebaselined.
See the [paused result](messaging-parity-implementation.md#mf24-team-description-gate-21-and-pause-checkpoint).

The pre-pause targeted recheck passes **107 backend, 12 affected native,
eight docs, TypeScript and diff checks**, with unchanged sources/observed
bundles. The two final Markdown-only status edits receive fresh eight-check
documentation verification. `mf24-team-description-runtime-pause-finalization.json`
records a pause, **not runtime acceptance**. No additional functional fix,
retry gate, build/activation, rollback, rebaseline or roadmap work is undertaken.
`team_description_runtime_implemented:true`,
`team_description_runtime_accepted:false`, `roadmap_paused:true`,
`full_plan_complete:false`. All other gates remain intact; counts overlap.

## Current source boundary

**Native completion complete (offline, uncommitted/inactive):** the
[existing-feature completion plan](native-feature-completion-plan.md) covers
Vim-native integration and correctness for existing application features only.
NC0 is frozen and NC1 passes its copied gate (783 core / 14 skips, six SDK,
24 native, eight drawn), with a
[recorded bundle-integrity exception](native-consistency-design.md#fresh-copied-build-nc1-gate).
NC2's [separate frozen gate](native-workflows-design.md#nc2-evidence) passes
784 core / 14 skips, 109 native and ten drawn checks.
NC3's copied gate passes 785 core / 14 skips, 113 native, six SDK and 16 drawn
checks, with its CLI registration correction recorded separately.
[NC4](native-organization-design.md) passes its copied gate: 794 core / 14 skips,
119 native / zero skips, six SDK and 14 drawn.
[NC5](native-meeting-design.md) is implemented; its initial copied gate and
retained drawn/focused follow-ups are recorded separately. NC6 full integrated
acceptance **passes** at `/tmp/opencode/wbx-native-completion-mm48wuud/nc6-final/`:
801 core / 14 deliberate skips, 123 native and 103 drawn / zero skips,
165 SDK/read-status/presence/cache, 44 synthetic messaging, three browser
controls, six research/nonactivation, two available-loader and eight documentation
passes. TypeScript, five copied builds and both help generators pass too.
Every result status is zero; no earlier gate is presented as final acceptance.
The [NC6 acceptance ledger](native-completion-acceptance.md) retains the failed
first integrated run and the exact final-source rerun boundary.
It also records the Markdown-only delta at NC6 finalization (390 checkout /
389 frozen sources),
unchanged runtime/test/help inputs, HEAD/staging and the preserved NC0 bundle
drift. Counts overlap; no live service/device acceptance or activation is implied.
Historical gates below do not establish acceptance of these changes.
Reaction/native Sections and other missing-provider features stay
outside that plan.

**Automatic people-popup correction:** [contract](people-popup-design.md#automatic-visibility-correction).
The selected direct conversation now displays people details automatically,
without invoking a command. The fresh strict copied-build integrated gate below
passed; earlier defaults/UI evidence predates this visibility correction.

**Later client-defaults/presence UI follow-up:** [contract](people-popup-design.md)
switches native presence, unread sync, spaces cache and sender labels to default-on
at the user's request, with explicit opt-outs. It also replaces the unbordered
top-left overlay. The affected-tier revalidation below passed; its provenance
explicitly retains the initial failed full attempt. The full F1–F5/R6 gate
further below remains evidence for its dated source/default policy.

Historical initial commit **`bd4a5d5`** contains A1 and A2's framing-only batch:
**292 files**. Earlier “uncommitted” evidence describes those historical gates;
hashes/counts are not rewritten.

The separate A2 transfer contract was approved, implemented and strict offline-
verified. A3, A4 and Phase 5 each have separate passing strict full gates.
This follow-on source checkpoint commits those approved changes. Historical
“uncommitted” statements describe their gate-time status; all changes remain
inactive, with no original build or live session replaced.
See [the plan](remaining-findings-plan.md), [A2 contract](attachment-transfer-design.md)
and [preparation](remaining-work-preparation.md).

The [messaging feature plan](messaging-feature-plan.md) records the requested
delivery order after `9aeedd8`. F1–F5 are implemented and strict offline-verified:
[names](sender-names-design.md), [local sections](local-sections-design.md),
[uploads](uploads-design.md), [own-message/rich actions](message-actions-design.md)
and [conversations/membership/Teams](conversations-design.md).
R6 [reaction](reactions-research.md) and [native Sections](native-sections-research.md)
research is delivered. The final integrated gate passed; the authorized plan is complete.

All new work remains **uncommitted and inactive**. Reaction runtime and native
Sections synchronization are not approved by passing these gates; both reports
retain their explicit risk/provider stop conditions. No live acceptance is implied.

## Pre-native-completion runtime gate (historical)

**Automatic people-popup visibility:** `/tmp/opencode/wbx-people-auto-verification-mxak6iqz/`.
This is a fresh all-tier run, not carried coverage from the prior defaults gate.

| Gate | Result |
| --- | --- |
| Core | 764 passes / 14 explicit opt-in skips |
| Native editors | 52 Neovim + 51 Vim passes / zero editor skips |
| Drawn private PTYs | 39 Neovim + 38 Vim passes |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| Opted-in research | Five passes; no runtime/provider approval |
| TypeScript, five copied builds, documentation, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 368 copied sources and 368 frozen pre-change sources checked; ten task-start bundle/map hashes unchanged |

Automatic visibility, no-extra-RPC updates, dismissal, session/conversation
changes, hidden tabs, explicit opt-outs, promoted copies, annotations, full undo
trees and covered receipt endpoints are exercised in both editors.
At that gate's finalization, only the popup report and this index had changed
after the run; documentation and integrity checks pass in `docs-final.log`, `docs-final.json`,
`final-sources.json` and `finalization.json` there. All 75 backend sources remain
unchanged by this follow-up. Nothing was live activated or committed.
That gate predates native completion. The NC phase results above and final
acceptance ledger are separate; its counts do not establish their correctness.
See [automatic visibility evidence and retained attempts](people-popup-design.md#automatic-visibility-integrated-gate).
Counts overlap and must not be summed as unique tests.

## Prior defaults/popup revalidation

**Client-defaults/people-popup follow-up: affected-tier revalidation plus
hash-bounded prior successes, not a new all-tier gate.**
Passing revalidation: `/tmp/opencode/wbx-client-defaults-affected-zjxol088/`.
Retained failed full attempt: `/tmp/opencode/wbx-client-defaults-verification-g8rja_6w/`.

| Check | Applicable result and provenance |
| --- | --- |
| TypeScript, five copied builds, both-editor help | Fresh passes |
| Complete native suite | Fresh 52 Neovim + 51 Vim passes; zero editor skips |
| Drawn private PTYs | All 77 passed in the retained full attempt; eight affected checks freshly rerun, 69 unchanged checks carried |
| Core | 763 passes / 14 explicit skips carried; affected documentation/ownership subset freshly passes eight checks |
| SDK/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes carried |
| Opted-in R6 research | Five passes carried; no new runtime/provider acceptance |
| LazyVim | One pass / one optional installed-loader skip carried |
| Integrity at revalidation | 368 sources checked; 364 identical to the full attempt; 366 frozen task-start sources and ten task-start bundle/map hashes unchanged |

The original full attempt remains `ok:false`: its sole failure was an existing
Vim attachment-fault fixture accepting retained previous-child room rows as
readiness. Synthetic room titles now carry an exact child-generation marker;
all transfer/read-count, cancellation, no-launch and draft assertions remain.
All consumers of that fixture backend ran again, alongside the complete native
suite. No previous failed native result is carried as a pass.

`summary.json`, `sources.json` and `provenance.json` at the revalidation path
identify fresh versus carried coverage. Only current-default/evidence
documentation changed after it; final documentation and integrity checks are
recorded in `docs-final.log`, `docs-final.json`, `final-sources.json` and
`finalization.json`. All 75 backend sources remain unchanged by this follow-up.
No active session/configuration/build was replaced; changes remain uncommitted.
See [full scope, retained failures and restart guidance](people-popup-design.md#offline-verification).
Counts overlap and must not be summed as unique tests.

## Prior messaging F1–F5/R6 integrated gate

**Messaging F1–F5 + R6 final integrated boundary:**
`/tmp/opencode/wbx-r6-verification-dl7zik8a/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 763 passes / 14 explicit opt-in skips |
| Native editors | 51 Neovim + 50 Vim fixtures / zero editor skips |
| Drawn private PTYs | 38 Neovim + 37 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| Opted-in R6 research | Five passes / zero skips; native I/O 0, registrations 0 |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 366 sources checked; 359 frozen pre-R6 sources and ten original bundle/map hashes unchanged |

Focused/frozen evidence: `/tmp/opencode/wbx-r6-i_8kinur/`; final source hashes,
`summary.json`, `finalization.json` and final docs log reside at the gate path.
R6 changes no runtime feature: all 114 pre-R6 runtime/dependency-manifest inputs
remain identical. Research default-off characterization: three simulations pass,
two installed-SDK/source checks explicitly skip. Opted-in checks pin 45 inputs
and search 238 installed source files. No live provider/device acceptance.

See [reaction findings/stop gate](reactions-research.md) and
[native Sections provider review](native-sections-research.md). Only the plan,
index and two research evidence reports changed after this passing boundary;
the final documentation and integrity checks pass. Suites overlap; do not sum
them into unique coverage. Earlier gate boundaries below remain historical.

## Prior messaging F5 gate

**Messaging F5 conversations/membership/Teams:** `/tmp/opencode/wbx-f5-verification-3kv5qbfm/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 762 passes / 14 explicit opt-in skips |
| Native editors | 51 Neovim + 50 Vim fixtures / zero editor skips |
| Drawn private PTYs | 38 Neovim + 37 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 359 sources checked; 350 frozen pre-F5 sources and ten original bundle/map hashes unchanged |

See [F5 scope and retained failures](conversations-design.md#offline-acceptance-boundary).
Only evidence/status documentation changed after this boundary.

## Prior messaging F4 gate

**Messaging F4 actions/rich sends/mentions:** `/tmp/opencode/wbx-f4-verification-h4z89hct/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 723 passes / 14 explicit opt-in skips |
| Native editors | 50 Neovim + 49 Vim fixtures / zero editor skips |
| Drawn private PTYs | 37 Neovim + 36 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 350 sources checked; 337 frozen pre-F4 sources and ten original bundle/map hashes unchanged |

See [F4 scope, failures and limitations](message-actions-design.md#offline-verification).
Only evidence/status documentation changed after this boundary.

## Prior messaging F3 gate

**Messaging F3 uploads:** `/tmp/opencode/wbx-f3-verification-mke8fz0y/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 682 passes / 14 explicit opt-in skips |
| Native editors | 49 Neovim + 48 Vim fixtures / zero editor skips |
| Drawn private PTYs | 36 Neovim + 35 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 337 sources checked; 329 frozen pre-F3 sources and ten original bundle/map hashes unchanged |

See [F3 evidence, failures and live limits](uploads-design.md#offline-verification).
Only evidence/status documentation changed after the passing boundary.

## Prior messaging F2 gate

**Messaging F2 local grouping/filters/presence:** `/tmp/opencode/wbx-f2-verification-lzeuywjp/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 645 passes / 14 explicit opt-in skips |
| Native editors | 47 Neovim + 46 Vim fixtures / zero editor skips |
| Private-PTY drawn | 34 Neovim + 33 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 329 sources checked; 324 frozen pre-F2 sources and ten original bundle/map hashes unchanged |

See [F2 evidence and limitations](local-sections-design.md#offline-verification).
Only evidence/status documentation changed after this boundary.

## Prior messaging F1 gate

**Messaging F1 sender identity/names:** `/tmp/opencode/wbx-f1-verification-bzl8zlyk/`.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 634 passes / 14 explicit opt-in skips |
| Native editors | 46 Neovim + 45 Vim fixtures / zero editor skips |
| Private-PTY drawn | 33 Neovim + 32 Vim fixtures |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 324 sources checked; 319 frozen baseline sources and ten original bundle/map hashes unchanged |

The SDK/cache tier includes six actual pinned-SDK network-blocked fixtures and
is wider than the prior 95-test tier. No live acceptance follows from these
counts. See [F1 scope, failures and evidence](sender-names-design.md#offline-verification).
Only documentation/status changed after this gate; finalization rechecks those
and source/build integrity.

## Prior integrated gate

**Phase 5 integrated boundary:** `/tmp/opencode/wbx-phase5-verification-mntbt1w2/`.
This includes all approved A2/A3/A4 and R1–R4/D2/D3 source changes.

| Gate | Result at that source boundary |
| --- | --- |
| Core | 611 passes / 12 explicit opt-in skips |
| Native editors | 45 Neovim + 44 Vim fixtures / zero editor skips |
| Private-PTY drawn | 32 Neovim + 31 Vim fixtures |
| SDK, synthetic messaging, browser controls | 95 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 318 sources checked; ten original bundle/map hashes unchanged |

Editors: Neovim 0.12.6 / Vim 9.1 Huge. Incremental-image is Neovim-only, not a Vim
no-op pass. Unchanged CLI cancellation passed; B4's intermittent exit-code exposure
is not claimed fixed. See [the Phase 5 record](remaining-findings-plan.md#phase-5-full-strict-offline-gate).
No live-provider/desktop acceptance is implied.

## Focused and historical evidence

| Boundary | Evidence and limitations |
| --- | --- |
| Phase 5 | `/tmp/opencode/wbx-phase5-goong4c2/`: frozen post-A4 baseline, focused contracts/helpers/both-editor checks and finalization; full gate above |
| Optional performance v1 | `/tmp/opencode/wbx-editor-performance-v1-47z2isaw/`: eight deterministic drawn guards, 12 history processes, 20 maximum-original transfers; [versioned command and scope](performance.md#optional-versioned-offline-runbook), no live latency guarantee |
| A4 | `/tmp/opencode/wbx-a4-x9jhcckl/`; full gate `/tmp/opencode/wbx-a4-verification-msfknu6r/`: 604 core, 87 native, 61 drawn |
| A3 | `/tmp/opencode/wbx-a3-7q2u7uf2/`; full gate `/tmp/opencode/wbx-a3-verification-doawubcx/`: 602 core, 87 native, 61 drawn, zero editor skips |
| A2 chunk full gate | `/tmp/opencode/wbx-a2-chunks-verification-m64ak5ii/`: 592 core, 87 native, 61 drawn, zero editor skips; predates A3/A4/Phase 5 |
| A2 framing | `/tmp/opencode/wbx-a2-rzudi4af/`: identical before/after guards, optional synthetic timings; not live/helper/render latency |
| Earlier framing full gate | `/tmp/opencode/wbx-a2-verification-53_8ac69/`: historical 547 core, 81 native and 55 drawn; predates chunk implementation |
| A1 typed open | `/tmp/opencode/wbx-a1-_wfq28y9/`: both-editor 2 → 1 GETs, zero-fetch snapshot reopen; [A1 gate](remaining-findings-plan.md#a1-full-strict-offline-gate) remains historical |
| A2 design checkpoint | `/tmp/opencode/wbx-a2-contract-1sqe5lnx/`: frozen commit/292 sources/ten bundle hashes, bounds arithmetic and focused unchanged-runtime/docs checks; not chunk-feature acceptance |
| A2 chunk implementation | `/tmp/opencode/wbx-a2-chunks-vs9s978v/`: 295-source baseline, 45 before/after feature checks, native fault/lifetime/graphics guards and full-pipeline distributions; full gate recorded separately |
| Earlier Phases 1–3 | Dated records in [the plan](remaining-findings-plan.md); later gates supersede editor availability, not historical source boundaries |

Historical design checkpoint: **89 focused tests + 14 strict native fixtures, zero skips**,
and TypeScript passed. Final documentation/help/integrity results are recorded in
[the plan](remaining-findings-plan.md#a2-transfer-contract-checkpoint-and-follow-on-preparation).
These are unchanged-runtime seam checks, not transfer/queue feature tests or a new
full runtime gate. Temporary directories are local retained evidence,
not permanent published CI links; scope stays recorded when paths are unavailable.

## Not verified or activated

- No live Webex/OAuth/receipt/device or real desktop/media acceptance is claimed.
  Synthetic SDK checks are not live-provider guarantees.
- Installed configuration, original builds and active editors remain untouched.
  Committing sources does not load them.
- Activation needs separate deliberate draft-safe backend rebuild/editor restart.
  Never hot-source, automatically reconnect or broaden grants.
- Native personal Sections synchronization has no validated approved provider.
  Local sections and server Teams remain distinct planned features; internal SDK
  reactions require their own compatibility/risk review.
