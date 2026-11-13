# Native editor performance

The first performance fixes target local editor work, not Webex network latency:

- Reuse the unchanged history-body projection instead of regrouping, splitting
  and hashing every loaded message on every state revision.
- Avoid forcing a status redraw or rebuilding unchanged image placements for
  invisible polling changes. Actual destination/title/readiness changes remain live.
- Reuse pure timestamp parsing without caching notification eligibility, receipt
  authority or delivery decisions. The shared cache retains at most 2,048 exact
  inputs of at most 128 bytes, including invalid results; history observation now
  looks up each message timestamp once. Disabled/muted observers still consume baselines.
- Keep native Markdown bounded to each message without making every message's
  syntax rules compete during every repaint. Stable 16-message buckets share
  exact metadata-row patterns; 500 messages need 32 body rules instead of 500.

## What remains unchanged

All received state still passes protocol validation. Accepted revisions still reach
`User WbxState`; public snapshots remain isolated copies. History rendering is not
cached solely by message ID: body/author/time/thread/image/attachment changes,
display options, selected room and absolute row offsets invalidate its projection.
Only one detached body projection is retained; it is memory-only.

Native editing, undo, hooks, colorschemes, folds and view anchors remain authoritative.
Edited views are checked before writing; cached projections cannot authorize a
rewrite of annotations. Clean explicit reloads can reuse the projection. Native
syntax is not globally disabled and a malformed fence cannot consume another
message's header or body.

Nothing here reconnects, expands grants, sends messages or receipts, retries failed
operations, or changes cached-space revalidation. Presentation caches are never
read-status evidence. Preserve unsent drafts and restart the editor to load native
changes; do not hot-source the session coordinator. The initial presentation-only
fixes above do not require a backend rebuild; later backend/protocol batches below
do require a deliberate rebuild/restart. No installed configuration is changed.

## Verification and diagnostics

`test/editor/projection-performance.vim` checks deterministic work/invalidation,
native state hooks, visible status/error changes, detached cache inputs, clean
reload and annotation preservation without starting a backend. Existing history,
notification, unread, navigation, media and receipt fixtures cover the surrounding
contracts. Work counters describe actual projection work, not a latency promise.

Whole-editor measurements use fresh isolated editors, synthetic 435-room histories
and 50/200/500-message workloads. Compare ordinary incremental scrolling separately
from forced full repaint, and space/history projection replacement separately from
real provider/RPC latency. Syntax-off controls are attribution experiments in those
disposable editors, not a production workaround. Results and the final offline
gate for this change are recorded below.

### Optional versioned offline runbook

From this checkout, with Python 3 and the requested editors already installed:

```sh
python3 scripts/editor-performance.py
# Smaller smoke run; a missing requested editor is an error, not a pass:
python3 scripts/editor-performance.py --editor both --messages 50 --samples 3 --repeats 1
# Also reproduce maximum-original inline/chunk transfers (existing Node/tsx required):
python3 scripts/editor-performance.py --attachments
```

[`scripts/editor-performance.py`](../scripts/editor-performance.py) and
[`test/editor/performance.vim`](../test/editor/performance.vim) define schema/workload
**v1**. The default runs both editors at **435 rooms / 50, 200 and 500 messages**,
seven samples per operation, two fresh processes per editor/size with reversed
size order on the second repeat. No installation or build runs. The native-only
benchmark starts no backend. `--attachments` explicitly adds the existing
network-forbidden source fixture and controlled hashing handler, using copied source
and existing dependencies, never an original or mixed-version compiled backend.

Each invocation creates a new evidence directory under `/tmp/opencode` (or a new
`--output PATH`, refusing overwrite), snapshots source, and verifies source/copy
hashes afterward. HOME/XDG/config/TMPDIR are private. An environment allowlist drops
inherited editor startup, live/media test, OAuth, display and tmux/graphics routing.
Each editor owns a newly allocated controlling PTY; no user's editor/terminal is
attached, hot-sourced or reconnected. Terminal output is drained and counted, not
retained as a screen capture.

`summary.json` contains versions, per-process **min/median/p95/max**, raw sample
counts, startup/runtime-layout and initial-publication times, redraw-inclusive
unchanged/scroll/structural results, forced repaint, and numeric projection/writer/
syntax/decoration work. Raw synthetic samples and source manifests are retained.
p95 is nearest-rank and is the maximum at the default seven samples; it is not a
reliable tail estimate from a large population. Keep repeats separate; do not hide
outliers behind pooled medians. Startup inside Vim excludes process launch; the
separate process wall time includes setup, probes and teardown, not just startup.

Validation, JSON encode/decode and pure projection are independent attribution
probes, **not exclusive phases to add/subtract** from receive/redraw. Structural
input preparation is outside timing; validation/projection/native writes/decorations/
fold work plus ordinary redraw are inside. The fixture retains normal native syntax
and folds. Provider latency, real terminal rendering/GPU completion and actual input
latency are **not measured**.

With `--attachments`, five 6,000,000-byte opens per editor/mode report whole-operation
and maximum 2 ms timer-monitor-gap distributions, verify exact handler bytes/hashes,
five synthetic GETs, zero inline pulls or **615 chunk pulls**. This includes native
validation, helper/handler startup and physical cleanup, not exclusive helper CPU.
It excludes live providers, raster conversion and real graphics. Raw fixture values
are microseconds; summary distributions explicitly convert to milliseconds. Compare
[A2's original distributions and tradeoff](#a2-chunked-attachment-pipeline), not just
the smaller monitor gaps. The new command is not a promise to reproduce a particular
speedup on another host.

Every run first executes the existing projection, structural, paging and status
**deterministic guards** in both requested editors. These, the framing work guard
and segmented-graphics/native hook guards remain regular correctness fixtures.
The optional timing matrix is not silently added to CI and has no latency threshold.
The regular tests check harness isolation/schema and redraw inclusion, not speed.

For a sanitized diagnostic report, share only versions, schema/workload sizes,
operation distributions, work counts, GET/pull totals and guard results. Never
collect message excerpts, real room/person identifiers, URLs, tokens, attachment
blobs or a live terminal capture. A slow startup, local redraw, media transfer,
provider response and uncertain delivery are different symptoms: do not reconnect,
resend or acknowledge a receipt to “profile” them.

The [verification index](verification-index.md) identifies the latest applicable
runtime gate; the sections below retain historical paired evidence unchanged.

The completed v1 matrix (including optional transfers) is retained at
`/tmp/opencode/wbx-editor-performance-v1-47z2isaw/`: eight deterministic drawn
guards, 12 fresh history processes and 20 hash-verified maximum-original opens.
Source/copy hashes match. This is current-runtime characterization, not an
attributed before/after speedup. For example, 500-message unchanged-update process
medians span **43.5–69.6 ms Neovim / 63.8–81.5 ms Vim**; structural replacement
spans **264.9–272.7 / 402.6–441.8 ms**. Variability and both repeats remain visible.
Transfer whole-operation / maximum-gap medians are **818.4 / 265.4 → 1642.4 / 14.3 ms**
Neovim and **1831.6 / 1612.9 → 2015.5 / 15.9 ms** Vim (inline → chunks).
These do not replace the original A2 paired evidence or establish live latency.

### Paired offline results

Neovim 0.12.6, 435 synthetic rooms and 500 two-line Markdown messages; no backend,
account, external plugins or real terminal graphics. Two fresh processes per
version/workload, seven samples per operation. Before/after order is reversed in
the second pair. State timings include an ordinary redraw in **both** versions,
so deferring a repaint cannot masquerade as eliminating it.

| Operation | Before, process medians | After, process medians |
| --- | --- | --- |
| Unchanged state plus redraw | 148–168 ms | 48 ms |
| Synthetic space/history replacement plus redraw | 921–924 ms | 367–402 ms |
| Bounded remove-oldest/append-newest plus redraw | 709–763 ms | 183–194 ms |
| Forced full repaint | 56–65 ms | 7.1–7.6 ms |
| Ordinary one-line scroll plus redraw | 6.3–6.7 ms | 1.16–1.17 ms |

These establish improvement, not guaranteed live-session latencies. Full state
validation remains about 25–33 ms in this workload and was not bypassed. Space
switching still has meaningful projection/decorations work; this is a first pass,
not a claim that all latency is gone. With cursorline and relative/absolute numbers
enabled, ordinary scroll medians improved from about 7.0 ms to 3.4–4.0 ms.

Frozen sources, exact invocations, sanitized per-case results and CPU/wall medians:
`/tmp/opencode/wbx-first-perf-fixes-z8x2ysad/` (`compare.py`, `comparison.json`,
`paired/fixture.json`, `before/`, `after/`). Separate syntax-only and timestamp-only
controls are retained in `/tmp/opencode/wbx-bounded-syntax.rS6oyNTR/` and
`/tmp/opencode/wbx-notify-time-fix-86mc1js3/`. Earlier exploratory audit results are
historical, not substituted for these paired comparisons.

There is still work outside this first pass: full snapshot validation/transport,
backend state production, cursor-driven image placement churn and larger architectural
cleanup. A green correctness suite alone does not establish interactive responsiveness.
Do not use automatic reconnect/rebuild as the first response to a slow editor.

### Full offline regression gate

`/tmp/opencode/wbx-first-performance-fixes-verification-r6s0axnj/` passed:
**457 core tests / 13 skips**, **33 Neovim fixtures / 33 unavailable-Vim skips**,
**77 SDK checks**, **44 synthetic messaging checks**, **3 synthetic browser-control
checks**, **20 private-PTY drawn fixtures**, and native help tags. LazyVim checks
were **1 pass / 1 optional installed-loader skip**. TypeScript and all five build
artifacts passed in the copied project only. Core test concurrency was four.

The new projection and syntax-bucket fixtures are included in the regular editor
gate. Timestamp tests verify bounded eviction, malformed inputs, zero reparsing of
warm values, and same-time identity/no-replay behavior across notifications, unread
presentation and meetings. Existing pinned-SDK/native fixtures still cover excerpt
privacy, same-account native-client notifications, exact plugin-send exclusion and
one-shot receipt safety, with network blocked.

All 271 source files matched the staged manifest after the gate. Only this evidence
update followed; finalization rechecks documentation and source/build integrity.
All ten original bundle/map hashes remained unchanged. No installed configuration,
running editor, live provider/OAuth session, grant, device or receipt was changed.
Work remains uncommitted; live acceptance and full-Vim validation remain unverified.

## Incremental native images (U1)

Image registration now detaches the full normalized-PNG projection only when the
display projection changes. Cursor/visibility callbacks enumerate visible windows,
not all buffers and their variables, and pass **only buffer numbers** into Lua.
They validate native ownership/changedtick, graphics support, route and geometry,
then reuse unchanged image allocations, highlights and extmark IDs. Native shifts
of existing marks are verified after text changes; only missing/moved marks are
repaired. Same-ID byte changes replace only that image, never trust ID alone.

Resize adjusts fitted placement/row marks without retransmitting PNGs. Native
folding/scrolling uses existing marks. Colorscheme changes restore owned image
highlights, not all placements. Hiding the final window releases terminal pixels;
reshow uses retained registered bytes. Unload/wipe/promotion forget registration,
and a clean explicit image reload re-registers its projection. Route/UI changes
invalidate allocations and tmux-passthrough caching. Deletions from an inaccessible
old route are not sent into a different terminal; no claim of acknowledged cleanup
on the detached terminal is made. Optional failed transfers do not re-encode on
every cursor event; a new projection/explicit registration or route change can
reattempt graphics only, never HTTP, external tools, sends or receipts.

`test/editor/image-incremental.vim` instruments actual registration, writer,
highlight and extmark calls. It covers stable cursor work, detached inputs, native
mark shifts/repair, changed bytes, removal, resize, multiple windows/folds, hidden
views, unload, promotion, colorschemes, routes and nonfatal output failure. The
normal drawn image fixtures still verify the actual writer's nonuniform PNG/CRC,
pixels and higher-resolution detail independently of the fake-sink work checks.

### Isolated callback measurements

Fresh headless Neovim; 435 synthetic space rows, 500 three-line message rows,
4 or 16 valid noisy 240×144 PNGs (138,564 base64 bytes each). Each operation runs
the normal visibility callback plus ordinary redraw, with a **fake terminal sink**.
Two processes per variant/count, reversed before/after order; seven samples of ten
callbacks, warmed registration. This isolates local image callback work, not whole
state validation, provider latency or real-terminal graphics delivery.

| Ready images | Before, process medians | After, process medians |
| --- | --- | --- |
| 4 | 0.75–0.96 ms | 0.085–0.097 ms |
| 16 | 1.98–2.04 ms | 0.086–0.119 ms |

Across 70 callbacks with 16 images, the before version remarshalled **155,191,680
base64 input bytes**, rebuilt **13,440 row marks**, cleared the namespace **70**
times and reset **1,120 highlights**. All four counts are **zero** afterward;
geometry/ownership/support checks still run. Reproductions, generated valid PNGs,
frozen sources, manifests, raw samples and exact commands:
`/tmp/opencode/wbx-u1-p2ny_rn3/` (`bench.vim`, `compare.py`, `comparison.json`).

Full integrated verification for U1 is tracked in the
[remaining-findings plan](remaining-findings-plan.md), separately from Phase 1.
U1 alone is native-only and needs no backend rebuild; the earlier Phase 1 meeting
changes do. Preserve drafts and activate deliberately; never hot-source an active
session or infer permission to reconnect from offline results.

## Paging and presentation counters (U2)

History projection records the canonical oldest message's row while arranging
messages; it need not be the first displayed root. Spaces projection records the
last actual room row, excluding cards/footer chrome. Navigation reads those scalar
anchors instead of copying/filtering all message blocks or walking footer IDs.
Accepted state supplies bounded paging hints; cap/exhaustion/loading/failure and
in-flight/no-progress guards stop unavailable intent before request construction.
Blocked motion still updates the window baseline, consumes near-edge motion and
rearms the edge latch when moving away, so completion/recovery cannot replay it.
Actual RPC admission still rechecks current state and its request generation.

Local read/new-activity counts update with their entry transitions, LRU replacement,
eviction and reset. Raw stale-flag/cache-row counts are accumulated in the existing
accepted-room loop. Status/health getters return these display counts without
rescanning rooms or local entries. Raw SDK state, membership, endpoint visibility,
receipt attempts and persistent cache admission remain independent; presentation
counts cannot authorize anything. Status results remain detached copies.

`test/editor/paging-performance.vim` checks grouped anchors, chrome changes, detached
index metadata, disabled/capped datasets, in-flight/manual/no-progress admission,
stale completions, connection generations and per-window hysteresis. It poisons only
cold block/ID containers after valid projection to detect accidental keypress scans.
`test/editor/status-performance.vim` covers local opens, incoming/exact-own messages,
fresh confirmation, stale/failure/cache transitions, same-size flag changes, LRU
replacement/eviction and snapshot isolation. Its profiler guard checks that status
getters execute no collection scans, without a timing threshold. Existing native
receipt and navigation fixtures remain unchanged and in the gate.

### Isolated callback measurements

Fresh Neovim, 435 synthetic rooms and 500 tracked local-read entries; seven samples
per process, two processes per version/count with reversed order. Paging/status
samples batch 100 calls. These are **callback-only** measurements, not complete
redraw, RPC, provider or live space-switch latency.

| Callback | Before, process medians | After, process medians |
| --- | --- | --- |
| Paging, 499 messages / available | 0.738–0.745 ms | 0.023–0.042 ms |
| Paging, 500 messages / capped | 0.438–0.442 ms | 0.024–0.025 ms |
| Aggregate status, 435 rooms / 500 entries | 0.559–0.926 ms | 0.014–0.025 ms |

The unchanged local observer remains a state-update cost (roughly 4–7 ms in this
isolated workload, occasionally near 8 ms); it is not bypassed or claimed as an optimization here. These
sub-millisecond callback savings are a lower-impact follow-up, not a substitute
for the earlier syntax/projection fixes or remaining backend/structural work.

The whole-editor comparison also covers 50/200/500 messages and 435 rooms, with
ordinary redraw included in both variants. At 500 messages, ordinary scroll/redraw
process medians were 1.02–1.14 ms before and 0.63–0.64 ms after; unchanged accepted
updates were 46.9–50.2 ms after, with full validation retained. Structural results
were variable: the initial sweep had 430–446 ms after versus 340–359 ms before for
synthetic space replacement. A separate three-pair recheck gave 344–364 ms after
versus 345–365 ms before, with identical profiled decoration/fold workloads. The
final-revision sweep was 339 ms after versus 360–362 ms before. Smaller/styled
cases also varied; isolated module controls did not reproduce a consistent penalty
in the final renderer (200-message styled scroll was 2.69–2.74 ms after with profiling).
These rechecks did not establish a consistent slowdown; **no structural speedup or
live latency bound is claimed**. U3 still requires fresh structural profiles.

Frozen sources/manifests, pre-fix failures, callback samples and all whole-editor
runs (including slower/outlying runs) are retained in
`/tmp/opencode/wbx-u2-mc4yd65j/`. The final hysteresis-preserving revision is frozen
in `after-v2/`; use `callbacks-v2-comparison.json`, `whole-v2-comparison.json` and
`measure-v2.py`. Earlier revision results remain in `callbacks-comparison.json`,
`whole-summary-v2.json`, `structural-check/summary.json` and `styled-controls/summary.json`.
The first whole summary merged ordinary/styled navigation variants; the corrected
summaries separate them by occurrence without altering raw results. Additional exact
drivers/fixtures are `callbacks.vim`, `measure-callbacks.py`, `measure-whole.py`,
`summarize-whole.py`, `check-structural.py` and `check-styled.py`.

U2 is native-only. Its integrated gate is recorded in the
[remaining-findings plan](remaining-findings-plan.md); no activation/reconnect,
installed configuration change or root build is part of these offline checks.

## Structural native updates (U3)

U3 starts from a new post-Vim-fix baseline, not the earlier syntax-heavy profile.
The writer still compares actual old/new message text and retains sparse native
writes and stable message chunks. It no longer sends empty or unchanged gaps
through the splice helper. No buffer-rewrite or hash/ID/length-only shortcut is
used to establish that text is unchanged.

Syntax invalidation distinguishes exact row/chrome geometry from content and
message identity. Same-size body edits reuse native rules; a different space with
identical geometry rekeys the detached identity map without clearing/rebuilding
rules. Any geometry/chrome change still reaches the existing bounded bucket
reconciliation. Native Syntax reload and ownership cleanup invalidate both caches.
Virtual summary reconciliation likewise uses only its actual count/error/missing-
parent inputs. Native rail endpoint verification is retained, including repair
after a mark is lost. Colorschemes, user syntax overrides and raw text are untouched.

Per-window fold inspection and conservative native recomputation remain in place:
same-shape edits avoid a global reset, while changed geometry, foreign destinations
and edits with disabled folds keep their existing safe restoration. No fold method
is replaced or disabled to obtain a timing result. New diagnostic counters expose
text spans considered, helper/native writes, metadata-equality calls and input
width, geometry/identity/chrome scans, endpoint queries, summary work and fold
inspection/reset work separately. Span widths are not claimed as the exact number
of elements visited inside a short-circuiting native equality operation.

### Paired offline evidence

Fresh Neovim, 435 synthetic rooms, 50/200/500 messages, seven samples per process,
two processes per version/case with reversed order. Both versions include redraw.
The final 500-message sweep measured the following process medians:

| Operation | Before | After |
| --- | --- | --- |
| Same-size body edit | 178.0–180.9 ms | 166.9–167.7 ms |
| Bounded append/eviction | 179.3–206.4 ms | 136.6–148.7 ms |
| Synthetic space replacement | 368.8–430.2 ms | 343.7–351.4 ms |
| Space replacement, three ready Unicode images | 331.6–382.5 ms | 310.3–363.7 ms |

These are local fixture measurements, not provider/live latency bounds. The fresh
pre-change baseline was 354.9–356.3 ms for plain space replacement; the final
before-side 430 ms result is retained, not treated as a stable baseline or used to
promise a percentage gain. A preceding sparse-write sweep also improved structural
operations (plain replacement 341.8–366.4 → 318.9–325.1 ms), but is a separate source
snapshot. Pure projection remains expensive and is not claimed optimized here.

Steady updates/navigation remain variable, not claimed faster. Final-sweep unchanged
updates were 49.1–49.8 ms before and 50.8–63.0 ms after; a three-pair recheck on the
same frozen final sources gave 41.7–54.2 ms before and 42.3–46.2 ms after. Ordinary
500-message scroll/redraw was 0.74–0.81 ms before and 0.69–0.85 ms after in the final
sweep. Slower image/styled cases and all rechecks remain in the evidence directory.

Across a profiled mixed workload of seven edits, seven bounded append/evictions
and seven replacements at 500 messages, splice-helper calls fell **4,013 → 23**,
summary reconciliations **10,500 → 693**, per-message syntax chrome reconstructions
**10,500 → 1,000**, and bucket rebuilds **262 → 64**. Native `setbufline` calls
remained **3,126**, endpoint verifications **6,985**, and fold-expression evaluations
**41,954** in both versions. Savings are not confused with eliminating those
required native operations or all-history input comparisons.

An initial bulk-write experiment was rejected: fewer text API calls increased
fold-expression evaluations to 69,677 and made space replacement slower. The
runtime retains sparse writes; the rejected snapshot/results remain available.

`test/editor/structural-performance.vim` checks executed splice/syntax work as well
as counters, lost-mark repair, same-size identity replacement, append after syntax
rekeying, earlier-thread replies/prepend, reader anchors and independent fold
choices, disabled folds, three bounded Unicode images, clipping and annotations.
It passes headless and in private PTYs in both Vim and Neovim. The independent
`work-guard.vim` fails against frozen pre-U3 source in both editors, then passes
against U3, without relying on the newly introduced counters or a timing threshold.

Evidence is retained in `/tmp/opencode/wbx-u3-post-vim-e9k90i3b/`: `before/`,
`after-final/` and their manifests, `measure-final.py`, `paired-final-comparison.json`,
`profile-work-comparison.json`, `steady-recheck/`, and `work-guard-*`. Earlier
`after/` / `paired/` are the rejected bulk-write trial; `after-v2/` / `paired-v2/`
retain the preceding sparse-write sweep. The full strict two-editor gate is
recorded in the [remaining-findings plan](remaining-findings-plan.md).

## Explicit backend transitions and projection (B1)

`EditorEngine.snapshot()` no longer observes message activity, selects the people
owner or advances agenda revisions. Store changes reconcile actual message times
(including a latest endpoint withheld by the 500-message cap) and people selection
before publishing. Session/grant replacement still selects the new people owner
without starting a lookup; explicit room opens/lookups remain the only read triggers.
Receipt admission retains its independent actual-activity check and fresh per-room
SDK authority requirement. Cached unread booleans remain stale presentation only.

Agenda projections/revisions are committed on explicit publication/session, refresh,
clock-tick and action transitions. An ordinary snapshot returns the last committed
agenda, not a hidden clock-triggered revision change. The existing 15-second tick
continues while a discovery response is unresolved; expiry cannot wait behind it.
Join admission reconciles the current clock immediately, publishes changed agenda
state and checks the row revision plus the provider's fresh safe target. It never
fetches/retries a join to make an old row actionable. Public rows still contain no
join URL. Optional local messaging-owner/provider-clock injection leaves existing
positional constructors compatible and does not alter the real authorization clock.

RPC's existing microtask coalescing now retains the **latest emitted** payload,
rather than discarding it and projecting again. Hello/closed guards, synchronous
delivery notifications and RPC response paths are unchanged. Each public snapshot
still returns detached rooms, selected-room and message objects, including image
line arrays and attachment objects; retained emissions cannot alias mutable store
state. No whole-snapshot memoization or new stream/IPC pressure policy is introduced.
People ages, cached-hint ages and message-event ages remain time-sensitive pure
reads; observational does not mean that all future reads have identical values.

### Deterministic work evidence

The same offline demo start/select/history sequence, instrumented on frozen pre-B1
and final sources, produced **11 publications and 7 RPC notifications in both**,
with identical revision/loading/selection traces. Snapshot projections fell
**18 → 11**. Twenty subsequent explicit snapshot reads still performed twenty
defensive projections, but actual-activity endpoint reads fell **20 → 0**. Owner
transitions retain the necessary message reconciliation; it was not deleted merely
to reduce getter work. These are work counts, not provider/live latency guarantees
or an end-to-end speed claim; detached copies also have a real cost.

Seven independent regressions fail against frozen pre-B1 sources and pass against
B1: RPC payload reuse, one projection/publication, defensive snapshots, people
selection outside getters, no activity reconciliation during reads, contradictions
surviving without any projection, and observational agenda projection. Additional
coverage preserves capped endpoints, action-time receipt checks, source loss/
recovery, selected metadata ownership, nested isolation, fresh/stale/removed agenda
revisions without a response, late owner responses and closed/hello barriers.

Evidence is retained in `/tmp/opencode/wbx-b1-jnyls0h2/`: `baseline.json`, frozen
`before/`, `regression-before/` and `regression-after/`, `verify-regressions.py`,
`work-counts.mts`, `work-before.json`, `work-after.json`, and `focused-final.log`.
The full copied-project strict gate is recorded in the
[remaining-findings plan](remaining-findings-plan.md).

## Bounded backend output pressure (B2)

The [output pressure contract](editor-protocol.md#output-pressure-contract) classifies
replaceable presentation separately from nonreplaceable control/authority/evidence
and RPC outcomes. A shared completion-driven scheduler bounds stdout and read-status
IPC. No lightweight/delta protocol was introduced: legacy clients still receive
full snapshots, and native state hooks still run for every admitted revision.
Loading, source loss/recovery, receipt/delivery outcomes and creation evidence are
barriers, not opportunities for unconditional latest-wins replacement. In particular,
RPC no longer discards earlier same-turn creation batches when its 64-item retained
ring advances. Identical SDK room observations skip merge/projection work only after
exact normalized-field comparisons; genuine observation timestamps and full-poll
liveness remain distinct from semantic change.

A deterministic 200-update pressure fixture at 435 rooms / 500 messages blocked
transport completions while offering title-only presentation updates. Frozen pre-B2
output made **75 writes**, buffered **16,859,307 sink bytes** and failed its existing
backpressure guard at revision 75. B2 made **one active write**, retained **one latest
pending snapshot**, and transmitted revision **200** on the second write after
completion, with no failure. Peak accounted active/pending bytes were **449,582**;
peak sink writable bytes were **224,789**. These are fixture byte/work counts, not
heap/RSS measurements, provider latency or a general end-to-end speed claim. Pending
snapshots are serialized for exact byte accounting; this does not claim elimination
of all serialization or unchanged native full-state poll payloads.

Nine regressions fail against the frozen pre-B2 runtime and pass against B2, covering
stream completion/drain, latest presentation, ordered status/authority/evidence and
outcomes, bounded mandatory overflow, duplicate SDK projection work, worker IPC
pressure and message-batch overflow. Actual worker fixtures retain 200 creations
in order (including 100 same-account items), admit one IPC send while 200 metadata
updates arrive, and preserve fatal output within bounded teardown. A real Node
`Writable` test checks callback/drain ordering. Native status fixtures now assert
one public hook per admitted state in Vim and Neovim, headless and privately drawn,
including independent loading/result transitions and defensive hook payloads.

Evidence is retained in `/tmp/opencode/wbx-b2-0z0xzt8r/`: `baseline.json`, frozen
`before/`, `verify-regressions.py`, regression copies/logs, `work-counts.mts`,
`work-before.json`, `work-after.json`, `focused-final-all.log` and `sdk-focused.log`.
The [remaining-findings plan](remaining-findings-plan.md) records integrated strict
verification. B3 native lookup deduplication and B4 persistence remain separate.

## Per-room read-status reconciliation (B3)

The [read-status reconciliation contract](editor-protocol.md#read-status-event-reconciliation)
keeps queued identities registered until native admission and tracks one dirty bit
for the in-flight room. Repeated events for a queued peer do not queue another read;
events during native I/O reserve one conservative follow-up behind the original
peers. The total bound is 64 queued/in-flight room identities, including the reserved
active slot. This does not infer that a native result captured a later event merely
because its ID or length matches. Distinct overflow remains covered by periodic full
observation; due full refresh still preempts after one native lookup. Native
deadlines remain fatal, and receipt mutations are never deduplicated/replayed.

Filtering is restricted to confidently irrelevant public membership `seen` events.
The pinned listener's resource/event, actor/member equality, current creator ID and
canonical same-namespace PEOPLE IDs must all agree that another person read the
room. Unknown/self/cross-namespace/contradictory events still reconcile. Membership
creation/deletion, room updates and message evidence retain their coverage, with no
identity probe, private endpoint, new grant or registration.

### Deterministic native-work evidence

Identical actual-worker/virtual-clock fixtures on frozen pre-B3 and final sources:

| Fixture | Before | After |
| --- | --- | --- |
| Initial 64-room batch plus 8,192 repeated queued/in-flight events | 128 room reads | 65 room reads |
| 1,000 repeats for a peer still waiting in that batch | 65 room reads | 64 room reads |
| 1,000 proven peer `seen` events | 1 room read | 0 room reads |
| Saturated queue, newer observation arriving during native I/O | Active-room dirty hint lost; old result retained until later reconciliation | Reserved follow-up obtains the new observation before periodic refresh |

Each measured fixture retains two startup full reads, native metadata concurrency
one, one initial device registration and zero receipts. These are bounded local work
counts, not live latency or a promise that every new event can avoid a fresh lookup.
The saturated fixture deliberately captures native data at admission rather than
returning whatever is newest at completion. Counting only total reads would miss
that correctness regression: both sides perform 65 reads, but only B3 reobserves
the dirtied active room.

The unchanged 600-second sustained-load guard still performs nine periodic full
fetches beyond startup, with observed maximum scheduling delay 25 ms and overflow
recovery at 63,025 ms under its 5-second lookup/3-second full-fetch virtual costs.
The general gate remains period + one active lookup + full-fetch cost, not those
fixture timings. Near-30-second, never-settling, late-result and one-shot receipt
fixtures remain fail-closed. Receipt completion at metadata capacity stays immediate
and one-shot; the next full observation recovers any unadmitted metadata hint.

Six regressions fail against frozen pre-B3 runtime; all fifteen fairness/pressure
fixtures pass against B3. The focused set has 85 passes/zero skips plus four actual
pinned-SDK network-blocked checks. The actual public membership listener verifies
100 peer reads are filtered while self reads still reconcile; native same-account
message notification and exact plugin-send exclusion coverage remains intact.

Evidence remains in `/tmp/opencode/wbx-b3-f5bmeat0/`: `baseline.json`, frozen
`before/`, `verify-regressions.py`, regression copies/logs, `work-counts.mts`,
`work-before.json`, `work-after.json`, `focused-final.log` and `sdk-final.log`.
The [remaining-findings plan](remaining-findings-plan.md) records the strict integrated
gate. B4 cache-persistence coalescing remains a separate batch.

## Bounded cache persistence (B4)

Both the engine and `SpacesCache` retain one active write and one latest pending
document. The engine's existing five-second admission interval remains fixed from
the last attempt, without accumulating saves behind a slow storage owner. Same-key
pending storage saves share one completion promise; a conflicting key is rejected,
never silently substituted. Full private-file/link/ownership/byte/slot checks,
exclusive temporary files and atomic rename remain in place. See the
[persistence contract](spaces-cache.md#write-coalescing-and-lifecycle).

REST/nonempty SDK input observations, semantic equality and disk completion are
distinct. Actual observation time travels with the document through coalescing,
rate limiting and storage. Identical genuine observations can refresh metadata
age; unread flags keep their own SDK times. A metadata rewrite, empty failure
invalidation, delayed fsync or receipt outcome cannot renew them or restore read
authority. No disk/IPC/RPC format, cache setting or grant changes.

### Deterministic storage-work evidence

The same fixtures on frozen pre-B4 and final sources measured:

| Pressure fixture | Before | After |
| --- | --- | --- |
| 201 saves behind a gated real-file fsync | 201 native fsyncs | 2 native fsyncs |
| Completion promises for 200 pending same-key saves | 200 | 1 shared promise |
| Engine save admissions across 40 five-second provider updates while storage is blocked | 41 | 1 before release, 2 total |
| Peak outstanding engine save callbacks at a controlled storage boundary | 41 | 1 |
| Completion-time inflation of cache observation timestamp after a simulated 100-second storage delay | 100,000 ms | 0 ms |

Both storage runs retain native fsync concurrency one and persist the final input
`Latest 199`; both engine runs end with `Latest 39`. The engine admission/callback
fixture uses a controlled storage adapter, not 41 parallel physical fsyncs. Counts
and timestamp differences are synthetic local evidence, not live provider latency,
heap/RSS measurements or an end-to-end speed claim. Normalization/serialization
still runs on accepted input; this does not claim zero projection CPU work.

Fourteen regressions fail against frozen pre-B4 runtime; all eighteen new cache
pressure/lifecycle fixtures pass against B4. They use actual private filesystem
checks with controlled fsync/rename/stat boundaries, plus isolated engine owners.
Coverage includes a rename already admitted when clear starts, close during clear,
immediate pending cancellation without releasing active I/O, slot/profile conflicts,
detached data/timestamps, failure followed only by latest work, unchanged genuine
observations, failure invalidation, grant loss, account replacement, shutdown and a
late clear error that cannot overwrite newer scope-loss state. Existing permission,
symlink/hardlink, capacity, corruption, independent-expiry and always-stale unread
tests remain unchanged. The focused set has **87 passes / zero skips**, plus TypeScript.

Evidence remains in `/tmp/opencode/wbx-b4-xqxeie20/`: `baseline.json`, frozen
`before/`, `verify-regressions.py`, final regression copies/logs, `work-counts.mts`,
`work-before.json`, `work-after.json` and `focused-final.log`. `earlier-guard/`
retains the preceding run before adding the empty-invalidation timestamp guard.
The [remaining-findings plan](remaining-findings-plan.md) records strict integrated
verification; live activation and acceptance remain separately approval-gated.

## Single-fetch explicit attachments (A1)

The approved [typed-open contract](attachment-open-design.md) now supplies safe
metadata and either original bytes or normalized PNG in one one-shot result.
Extension/MIME keys select representation without transferring executable argv,
credentials, URLs or download destinations. Native conversion/braille reuse the
same fetched buffer; there is no retained original-byte handle/cache. Original
routes retain 6,000,000 bytes; unhandled native rasters retain 8 MiB input and
6,000,000-byte normalized output, inside the unchanged 8 MiB event cap.

Identical frozen-code native fixtures in Vim and Neovim measure **2 → 1 content
GETs** for unpreviewed images, unrelated handlers and attachment ten. Clean snapshot
reopen remains zero-fetch. These are deterministic work counts, not live latency
guarantees. The new native fixture injects only account/startup/content and CPU
conversion; native dispatch, RPC, store/API and both content readers are real.
Existing converter tests separately execute the installed raster converter.

Worker-owned admission survives store/account replacement and releases only on
actual native settlement, not a caller deadline. Typed opens conservatively reserve
the image lane before discovery; a busy preview rejects before any generic GET,
including unknown files that may prove to be text. Original-only downloads can
coexist with preview work. No A3 intent queue, A2 framing/chunking or A4 shared
lease abstraction is included. Existing output admission and ordered outcome
barriers remain unchanged; a single inline base64 body does not claim to remove
large-JSON stalls or total process-memory amplification.

Evidence: `/tmp/opencode/wbx-a1-_wfq28y9/`, including the pre-edit baseline,
identical before/after regression copies, `verify-regressions.py`,
`regression-summary.json`, focused logs and retained fixture-development failures.
All nineteen new backend feature tests fail against the pre-A1 absent feature and
pass against A1; the native work-count guards independently distinguish the actual
double-fetch defect. See the [plan](remaining-findings-plan.md) for the current
full copied-project gate and source/build integrity; no live activation is implied.

## Segmented editor framing (A2, framing-only batch)

Node's request reader and the native backend-output reader now scan only new
callback input, retaining partial records as bounded fragments. Fragments compact
once per 4 KiB block, then join at record completion; no growing incomplete
prefix or shrinking callback suffix is repeatedly materialized. Fragment metadata
is bounded too: at most 4,095 small tail fragments plus bounded completed blocks,
not one reference per byte of an 8 MiB record.

The limits remain **32,768 UTF-8 bytes per request** and **8,388,608 bytes per
event**, excluding LF, independent of aggregate callback size. Node checks raw
segment admission before UTF-8 decoding, retains `StringDecoder` boundary and
malformed-byte replacement behavior, and still enforces the replacement text's
re-encoded byte ceiling. Native code checks before segment copying/joining/JSON
decoding. Empty/partial callbacks and exact byte limits remain supported.
Framing errors close Node admission permanently; native stop/EOF clears partial
data. A native receive hook that replaces its backend cannot admit the old
callback's remaining records into the replacement generation.

### Independent executed-work guards

The same final tests run on frozen post-A1 and A2 sources:

| Fixture | Before | After |
| --- | --- | --- |
| Node, 30,067 ASCII bytes fed one byte at a time: newline/explicit length scan units | 904,084,622 | 60,133 |
| Vim and Neovim, 262,145 ASCII bytes fed in 64-byte fragments: newline/explicit length scan units | 1,074,790,402 each | 524,290 each |
| Node decoder bytes offered from one 98,304-byte over-limit incomplete segment | 98,304 | 0 (rejected before decoding) |

Counts come from wrapped actual primitive boundaries, not a framer-maintained
success counter. Native tests execute a private copy of the real autoload with
only those boundaries instrumented and test-local feed/inspection helpers appended;
normal integration still exercises real native job callbacks and schema admission.
Scan units are explicit search spans/length-check inputs for these ASCII fixtures,
not CPU instructions, internal C-library scans, heap/RSS, allocator-copy counts or
a provider-latency ratio. Prior `+=` allocation/copy costs are **not** claimed as a
measured byte count. New substring/join input counts are separately bounded linearly.

Four of eight new Node checks fail against pre-A2 sources; both native work guards
fail independently before larger fixtures run. All eight Node checks and both
native fixtures pass on A2. Cases cover every Unicode byte split, one-byte input,
coalesced records, bounded join metadata, limit-minus-one/exact/plus-one, overflow
before decode/copy, malformed UTF-8 compatibility, terminal error boundaries,
stop/EOF reset, reentrant backend replacement and retained drafts. The original
Node mock tracker rejected an Array-prototype target; the corrected measurement
replaces/restores that descriptor in a synchronous `finally`. That fixture-only
failure is retained rather than treated as a product regression.

### Remaining large-record pause: chunking is a separate checkpoint

Optional **uninstrumented** local receive/JSON phase benchmarks prepare input
fragments before timing. Five native samples per size yielded these medians:

| Record bytes | Neovim receive, including decode | Neovim decode alone | Vim receive, including decode | Vim decode alone |
| --- | --- | --- | --- | --- |
| 65,536 | 0.408 ms | 0.186 ms | 0.564 ms | 0.232 ms |
| 1,048,576 | 5.940 ms | 3.044 ms | 8.037 ms | 3.862 ms |
| 8,388,608 | 55.875 ms | 28.016 ms | 68.376 ms | 34.423 ms |

At the ceiling, receive ranges were **52.916–58.494 ms** (Neovim) and
**66.814–81.158 ms** (Vim). These receive/decode columns are separate phase samples,
not quantities to add or subtract to infer exact exclusive framing cost. Node's
seven-sample 8 MiB output serialization median was **6.159 ms**, range
**5.951–8.110 ms**; its synthetic parse-phase median was **4.226 ms**. That parse
benchmark does not mean the worker accepts 8 MiB requests.

This is a real remaining worst-size synchronous pause, **not a zero-stall claim**.
It warrants A2's conditional chunked-transfer contract review. This low-risk
framing batch introduces **no chunks, transfer handles, capabilities, larger
limits or wire-shape changes**. Do not label all of A2 complete or silently move
on as though the measured conditional work vanished. The follow-up must extend
A1's single `payload` contract, with owner/generation binding, bounded credits,
ordering/length/canonical encoding, completion/digest checks, cancellation and
pre-dispatch capability fallback reviewed before implementation. See
[the shared boundary](attachment-open-design.md#replay-old-backends-and-the-a2-transfer-boundary).

These synthetic unknown-response benchmarks do not render a history, validate a
typed attachment body, run converters/helpers, measure live Webex or include real
desktop/device acceptance. There are no wall-clock CI assertions. Exact-size
transport records are not permission for larger original attachment payloads.

The subsequent [approved A2 transfer contract](attachment-transfer-design.md)
uses receiver-driven bounded records through the local sink and graphics writer.
Its implementation measurements below are distinct from these framing-only
distributions; the design checkpoint itself was not performance evidence.

Evidence: `/tmp/opencode/wbx-a2-rzudi4af/`, with `baseline.json`, frozen `before/`,
`verify-regressions.py`, final regression copies/logs, `benchmark-native.py`,
`benchmark-node.mjs`, raw timing samples and summaries. `earlier-guard/` retains
the run before adding the one-byte native metadata check.
`before-unicode-boundary/` retains the next run before adding the near-ceiling
multibyte record; its phase benchmarks use the same unchanged runtime and ASCII
inputs. The
[remaining-findings plan](remaining-findings-plan.md) records full integration
verification and the chunked-transfer follow-up. No active editor,
installed configuration, original build or live session is changed.

## A2 chunked attachment pipeline

The approved single-credit path now bounds typed attachment JSON, canonical
validation, helper handoff and optional graphics submissions rather than moving
one giant base64 join to another native callback. One selected representation
stays worker-private until completion/cancel/expiry; one chunk is at most
**49,152 decoded / 65,536 base64 bytes**, and one complete response at most
**69,632 UTF-8 bytes**. No source/output limit was raised. Legacy inline/state
records remain supported and are not magically made asynchronous.

Native timers request the next chunk only after the incremental helper ACK.
Normalized PNGs enter a memory-only segmented presentation store; render metadata
contains a local key, not a recopied PNG list. The Neovim guard wraps actual
terminal submission, scheduling and aggregate joins: its 147,457-byte synthetic PNG
uses **49 Kitty packets**, at most **65,536 base64 payload bytes per scheduled
turn**, no whole-PNG `transmission()` or oversized join, no resubmit on unchanged
refresh, and no late submission after a UI-route replacement. Full Vim retains
segmented memory without Lua and still supports zero-fetch external snapshot reopen.
These are executed work guards, not terminal-internal buffering/RSS limits.

### Whole-transfer distributions and throughput tradeoff

Optional uninstrumented native fixtures compare **the same current runtime** in
typed-inline capability mode versus opted-in chunks. Each editor/mode performs
five fresh explicit opens of the same **6,000,000-byte binary**, through real
RPC/store/API/native validation, private helper file and a controlled foreground
Node handler that hashes the file and exits. Each mode has **five GETs**; chunk
mode has exactly **615 pulls**. All twenty handler hashes match the source bytes.
No original-byte cache, preview, receipt, post or live network participates.

| Editor / mode | Whole operation ms, min / median / max | Maximum 2 ms monitor gap per operation, ms, min / median / max |
| --- | --- | --- |
| Neovim inline | 802.171 / 836.874 / 871.928 | 260.219 / 267.309 / 280.123 |
| Neovim chunks | 1591.393 / 1618.613 / 1685.778 | 15.391 / 15.902 / 16.304 |
| Vim inline | 1563.296 / 2027.271 / 2096.493 | 1345.578 / 1776.623 / 1852.140 |
| Vim chunks | 1306.492 / 1988.340 / 2055.218 | 9.235 / 14.897 / 20.511 |

This supports a **responsiveness**, not universal throughput, claim: Neovim's
whole-operation median is slower with 123 stop-and-wait round trips; Vim's median
is similar in these samples. Neither is a live-service latency prediction.
The monitor measures timer scheduling gaps, not exclusive function CPU or input
latency; it includes OS scheduling, polling, native validation/encoding, helper/
handler startup and cleanup. Whole-operation timing includes a fixed synthetic
80 ms content delay, worker representation preparation, all transfers, local
materialization, foreground hashing and actual exit cleanup. It excludes startup
before space selection, image conversion, text-buffer creation and real terminal
graphics. No timing threshold enters CI.

This is not a subtraction from the earlier 8 MiB JSON-only benchmark. That fixture
excluded typed validation and local helper encoding; the inline pipeline here
includes those larger native costs. Other large state records, text rendering and
provider latency remain independent. The immutable snapshot/one-credit memory
bounds do not promise a 6 MiB process RSS.

### Reproduction, failures retained and gates

`/tmp/opencode/wbx-a2-chunks-vs9s978v/` retains `baseline.json` / `before/`
(**295 sources / ten original bundle hashes**), `verify-regressions.py`, identical
final before/after feature fixtures, `benchmark-transfers.py`,
`transfer-timing-summary.json` and raw per-editor results. All **45** new backend/
helper tests fail on feature absence and pass on implementation; both new native
integrations distinguish absence too. This is not 45 independent old defects.

Retained fixture-development failures include premature prompt keystrokes, a
script-local variable in an `eval()` wait, script-driven edits sharing an undo
block, and using `:WebexImage external` instead of `:WebexImageExternal`.
`earlier-prompt-benchmark/` retains a prompt-based benchmark where Vim Ex exited
without a result; it is not a passing Vim sample or claimed product fix. The final
comparison uses the same controlled foreground hash handler in both editors/modes,
avoiding interactive input entirely. Earlier evidence directories retain their
exact source copies rather than being overwritten. Runtime safety assertions and
limits were not weakened to make fixtures pass.

The [plan](remaining-findings-plan.md) and [verification index](verification-index.md)
record integrated full-gate evidence separately. Nothing activates an editor,
rebuilds original bundles or connects to a live provider.
