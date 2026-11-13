# Remaining findings: implementation plan

Status: **Phases 1–3 complete and strict Vim/Neovim offline-verified.
Phase 4/A1 is also complete and strict offline-verified.
A2's framing and approved chunk-transfer batches are complete and strict
Vim/Neovim offline-verified.
A3–A4 and Phase 5 are complete and separately strict offline-verified.
All approved remaining stages are complete offline; live acceptance/activation
and the explicitly deferred decisions below remain separate.**
This is the backlog after the
[first native performance fixes](performance.md), not a request to repeat them.

The newer eight-review architecture/UI/UX findings have a separate
[remediation plan](review-remediation-plan.md). The completion status above
belongs to this historical plan's scope; it does not claim those later findings
are fixed.

Already complete: bounded syntax buckets, unchanged history-body projection reuse,
conditional status redraw, bounded pure timestamp caching, and their regression
coverage. The paired offline baseline is now approximately 48 ms per unchanged
update, 1.2 ms per ordinary scroll, and 367–402 ms per synthetic space/history
replacement at 435 rooms / 500 messages. These are test conditions, not live-session
latency guarantees.

## Order and evidence

1. Fix small correctness/configuration defects and make current guidance truthful.
2. Finish incremental native UI work, prioritizing demonstrated costs.
3. Reduce backend traffic safely, after separating state transitions from projection.
4. Make explicit attachment opening single-fetch and improve large transfers.
5. Consolidate architecture, naming and documentation in small verified steps.

The Phase 1 configuration and lifecycle defects now have isolated failing
reproductions against frozen pre-change source, followed by passing focused fixes.
The original static concerns are not being presented as live-session observations.
Backend amplification paths are source-confirmed, but their
contribution to this user's live latency is not measured. Status/paging callbacks
are measured smaller contributors; do not promote them above larger costs solely
because their loops are easy to remove.

## Phase 1 — Correctness and configuration

| ID | Change | Primary files | Acceptance |
| --- | --- | --- | --- |
| C1 | Forward `attachment_handlers` and `attachment_download_dir` through Lua setup. | `lua/wbx-tui/init.lua`, Lua/native integration fixtures | The documented `require('wbx-tui').setup(...)` path reaches handler dispatch and the destination prompt. Test extension/MIME precedence, invalid values and opt-outs, not just direct Vim globals. |
| C2 | Bring external image terminal creation up to attachment handling's native-hook safety. | `autoload/wbx/image_external.vim`, image fixtures | BufEnter/OptionSet hooks that redirect, annotate or disconnect cannot cause a tool to launch in another buffer or replace user work. Stale requests release only their own lease. |
| C3 | Separate cancelled notification intent from ownership of a draining notifier process. | `autoload/wbx/notifications.vim`, routing fixtures | A stubborn fake notifier never overlaps a replacement during cancel, disconnect/start or notification-test sequences. Admission releases on native exit, not merely when cancellation is requested. No replay or privacy regression. |
| C4 | Distinguish viewer transport loss from verified meeting termination in both consumers. | `src/viewer.ts`, `src/editor-meetings.ts`, `src/cli.ts`, synthetic ownership tests | Losing the socket while the owner remains alive reports unavailable/unknown control state, never falsely claims media ended or implicitly leaves. Verified owner exit and explicit leave remain distinct. |
| D1 | Correct current user-facing contradictions alongside these changes. | `README.md`, `doc/wbx-tui.txt`, `docs/editor.md`, notification/protocol/architecture guides | General open is `<leader>Wo` / history `o` / `:WebexAttachment`; download is `<leader>WA`; only uploads remain unsupported. Notification guidance describes creation events and excerpt-only default previews, with legacy fallback labeled. Grouped-history instructions do not promise a globally linear timeline or rely on `G, R`. |

Keep these separate, reviewable changesets. C1, the C2/C3 reproductions and D1 can
proceed independently. C4 gets an explicit ownership-contract review; do not fold it
into an unrelated performance refactor. Fix specialized lifecycle safety before
extracting shared lifecycle machinery.

### Phase 1 implementation and ownership review

- **C1 implemented:** Lua setup forwards both attachment settings unchanged for
  dispatch-time validation. The native attachment fixture uses the actual Lua setup
  path on Neovim and covers MIME/extension precedence, an empty-extension opt-out,
  invalid shell strings/directories, configured raster overrides, and accepting the
  configured download-directory default. Existing exclusive-save checks remain.
- **C2 implemented:** terminal creation checks request generation and fresh/blank
  buffer admission after BufEnter and again after option hooks. Annotation rejection
  removes only the aborted launch's wipe-on-hide setting. Late launch/exit cleanup
  cannot attach an old job to, or revoke, a replacement lease. Tests cover redirect,
  annotation, disconnect and replacement, with exact private-file cleanup.
- **C3 implemented:** cancellation revokes queued intent and delivery/fallback, but
  the active notifier retains admission until its exact exit callback. A stubborn
  fake tool reproduced overlap after stop/start and source loss; tests now show no
  overlap or replay through those paths and mute/resume/notification-test sequences.
- **C4 implemented:** ViewerHost has no media-termination evidence, so socket loss
  now emits a local replayable `disconnect`, never a fabricated worker `ended`.
  The native controller disables controls immediately but retains active ownership
  until its existing recorded-PID exit check confirms termination. Explicit leave
  still signals only its verified owner; ordinary close still detaches. Standalone
  viewers pause, label send/audio state unknown, handle rejected in-flight captures
  without fatal cleanup, and allow local exit without implying owner leave. Actual
  remote ended events retain their original branch. No wire capability, SDK join,
  automatic reattachment, transmission default or tmux styling changed.
- **D1 implemented:** general attachment keys/support, notification creation and
  excerpt-consent contracts, grouped-history latest/receipt guidance, and lost-control
  ownership guidance are aligned. Historical verification totals/hashes remain
  historical; documentation checks guard the current quick-reference keys.

Frozen source/manifest, functional pre-fix failures and reproduction logs are in
`/tmp/opencode/wbx-phase1-tam02n9v/`. Focused native attachment/image/notifier checks
and TypeScript/viewer/meeting/CLI/documentation tests pass. Full Vim is unavailable
and remains an explicit skip. Full copied-project verification passed; no installed
configuration, active editor, live provider/OAuth/receipt/device test or root build
has been changed. Backend activation for C4 requires a deliberate copied-build
verification followed by a user-controlled rebuild/restart; never hot-source.

### Phase 1 full offline gate

`/tmp/opencode/wbx-phase1-verification-cr3628_4/` passed with core concurrency four:

- **464 core passes / 13 explicit skips**, including the new meeting-transport and
  standalone handler checks and all framing rejection/fragmentation regressions.
- **35 Neovim fixtures / 35 unavailable-full-Vim skips**; **22 private-PTY drawn
  fixtures**, including both new hook/cancellation fixtures.
- **77 SDK checks**, including network-blocked public-created-event/native-preview
  integration; **44 synthetic messaging checks**, **3 synthetic browser-control checks**.
- TypeScript, five copied build artifacts, native help tags and documentation pass;
  LazyVim has **1 pass / 1 optional installed-loader skip**.

All **275 source files** matched both source/staged manifests after the gate, and
all **ten original bundle/map hashes** were unchanged. Only this evidence update
followed; finalization rechecks documentation and manifests. Changes remain
uncommitted and inactive. Live acceptance, full Vim and real desktop/device testing
remain unverified; nothing authorizes activating or reconnecting a running session.

The earlier `/tmp/opencode/wbx-phase1-verification-yodqgsir/` attempt is retained as
incomplete/failed evidence, not a pass: a new documentation-test type error and
old framing fixtures waiting for the removed synthetic ended event were corrected.
The full fresh gate above supersedes it; malformed-frame/admission checks were not
weakened. Pre-fix reproduction failures are separately retained under the Phase 1
baseline directory.

## Phase 2 — Incremental native UI

| ID | Change | Primary files | Acceptance |
| --- | --- | --- | --- |
| U1 | Separate image registration from placement/visibility updates; retain unchanged marks. | `autoload/wbx/images.vim`, `lua/wbx-tui/images.lua` | Cursor movement with unchanged viewport/geometry/content performs no PNG remarshalling or namespace/extmark rebuild. Resize, scrolling, folds, colorscheme, UI/route changes, unload and wipe invalidate the appropriate owned resources. Only changed placements update. |
| U2 | Pre-index paging anchors and short-circuit work when admission is disabled; cache aggregate presentation counters. | `autoload/wbx/paging.vim`, `autoload/wbx/unread.vim`, native status helpers | No all-message lookup per keypress at the paging cap. Preserve window baselines, hysteresis, generations and no-progress guards. Counts update after local open, new activity, stale/failure and room changes, but never become receipt authority. |
| U3 | Profile the remaining structural-update cost, then narrow decoration verification and fold/syntax invalidation. | `autoload/wbx/view.vim`, `autoload/wbx/history.vim`, `autoload/wbx/folds.vim` | Append, prepend, earlier-thread replies, clipped history and same-size edits retain native anchors, per-window fold choices and annotations. Work counters include scans/verification, not only mutations. Reduce dirty-range work without replacing all folds or disabling syntax. |

U1 addresses demonstrated native image amplification. U2 is a small,
lower-impact follow-up. U3 addresses the remaining measured space-replacement cost,
but its algorithm must follow fresh post-fix profiles rather than old syntax-heavy
profiles. Use realistic bounded image cases as well as explicitly labeled stress
cases; simulated graphics are not real-terminal delivery evidence.

### U1 implementation and focused evidence

Full PNG registration is separate from buffer-number-only refresh. The visible
callback no longer reads every buffer's complete variable dictionary. Lua retains
unchanged pixel allocations, highlights and row-mark IDs, verifies native mark shifts
after text edits, and reconciles only changed/removed resources. Same-ID byte changes
are compared exactly. Geometry, colorscheme and output-route invalidations are
separate; hidden/unloaded/promoted views release their owned resources without
touching native text. Optional output failures remain nonfatal and do not re-encode
on each cursor event. No fetch/admission/delivery/receipt policy changed.

The new `test/editor/image-incremental.vim` fixture and existing image, media-resume,
ownership, attachment and projection checks pass. Normal private-PTY image fixtures
also pass with real normalized-pixel/CRC capture. Isolated fake-sink callback
medians at 16 ready images improved from 1.98–2.04 ms to 0.086–0.119 ms, with zero
repeated payload registration/mark rebuilding; see [scope and results](performance.md#incremental-native-images-u1).
Frozen before/after sources and exact benchmark evidence are in
`/tmp/opencode/wbx-u1-p2ny_rn3/`; the new fixture fails against pre-U1 source on
cursor-only registration/remarshalling. Both U1 runtime files still match the
frozen after-measurement hashes.

### U1 full offline gate

`/tmp/opencode/wbx-u1-verification-m7k0t4kg/` passed with core concurrency four:
**464 core passes / 13 skips**, **36 Neovim fixtures / 35 unavailable-Vim skips**,
**77 SDK checks**, **44 synthetic messaging checks**, **3 synthetic browser-control
checks**, and **23 private-PTY drawn fixtures**. The incremental Lua/Kitty work
fixture is Neovim-only; no no-op Vim pass is counted. TypeScript, all five copied
builds, native help and documentation passed; LazyVim remains **1 pass / 1 optional
installed-loader skip**. Prior syntax/projection/timestamp guards and all Phase 1
lifecycle fixtures remain in this integrated gate.

All **276 source files** matched both manifests after the gate. All **ten original
bundle/map hashes** remain unchanged. Only this evidence update followed, with
documentation/manifests rechecked at finalization. Everything remains uncommitted,
inactive and isolated from installed configuration and the active editor. Full Vim,
live provider/receipt/device and real desktop/terminal acceptance remain unverified.

### U2 implementation and focused evidence

Canonical history and last-room paging anchors are indexed during projection.
Keypresses no longer borrow full message-block/room-ID lists; blocked datasets
stop request intent while preserving window baselines, consumed near-edge motion
and away-from-edge rearming. Completion/recovery does not replay blocked movement.
In-flight, failure, no-progress, room/connection generation and final current-state
RPC checks remain separate from those presentation hints. No cursor movement grants
receipt consent or changes a destination-bound draft.

Local display counts update at entry transitions/replacement/eviction/reset, and
raw stale/cache-room counts reuse the accepted-state room loop. Status/health reads
are constant-size, detached and never consumed by receipt/cache authority. The new
paging/status fixtures pass, including cold-metadata poisoning and executed-scan
profiling guards; existing navigation, grouped history, unread, cache, notification
and receipt checks pass in fresh isolated Neovim and private drawn PTYs.

At 500 messages, the isolated capped paging callback improved from 0.438–0.442 ms
to 0.024–0.025 ms; a status getter with 435 rooms/500 local entries improved from
0.559–0.926 ms to 0.014–0.025 ms. All 50/200/500-message whole-editor cases include
redraw in both versions. An initially slower structural sweep was investigated
with separate paired rechecks/profiles; it did not reproduce a consistent slowdown.
No structural speedup is claimed. See [measurement scope and retained evidence](performance.md#paging-and-presentation-counters-u2).

Frozen source/manifest, failures against pre-U2 source and all measurements are in
`/tmp/opencode/wbx-u2-mc4yd65j/` (`after-v2/` is the final hysteresis-preserving
revision; earlier snapshots/control runs are retained). U2 is native-only; source and root bundle/map
integrity were checked again by the full copied-project gate below. No running
editor/configuration, provider/OAuth session, receipt or device has been changed.

### U2 full offline gate

`/tmp/opencode/wbx-u2-verification-wjznxokz/` passed with core concurrency four:
**464 core passes / 13 skips**, **38 Neovim fixtures / 37 unavailable-Vim skips**,
**77 SDK checks**, **44 synthetic messaging checks**, **3 synthetic browser-control
checks**, and **25 private-PTY drawn fixtures**, including both new U2 guards.
TypeScript, all five copied builds, native help and documentation passed; LazyVim
remains **1 pass / 1 optional installed-loader skip**. All earlier native editing,
ownership, notification, image, receipt, syntax and projection regressions remain
in the integrated gate.

All **278 source files** matched both manifests after the gate. All **ten original
bundle/map hashes** were unchanged. Only this evidence update followed, with
documentation/manifests rechecked at finalization. Changes remain uncommitted and
inactive; neither installed configuration nor the running editor was touched.
Full Vim, live provider/receipt/device and real desktop/terminal acceptance remain
unverified. U3 must start from fresh post-U2 structural profiles, not the old
syntax-heavy baseline or callback-only gains.

### U2 strict two-editor recheck — pre-fix failure

After full Vim was installed, the complete offline gate was rerun in
`/tmp/opencode/wbx-u2-both-editors-verification-ifbkso2b/` with required-editor
admission (`WBX_STRICT_EDITORS=1`), Vim 9.1 Huge and Neovim 0.12.6. This result is
**not a pass**. It is retained as pre-fix evidence and superseded by the passing
strict two-editor gate below; preceding gate records remain historical.

- Core: **465 passes / 12 opt-in skips**; SDK: **77 passes**; synthetic messaging:
  **44 passes**; synthetic browser controls: **3 passes**.
- Headless editors: **38 Neovim passes**, **10 Vim passes / 27 Vim failures**,
  **zero editor skips**. The Lua-specific incremental-image fixture is still
  Neovim-only, not a no-op Vim pass.
- Drawn private PTYs: **25 Neovim passes**, **6 Vim passes / 18 Vim failures**.
- TypeScript, all five copied builds, help tags in both editors and documentation
  passed. LazyVim remains **1 pass / 1 optional installed-loader skip**.

Twenty-six headless Vim failures and seventeen drawn Vim failures hit the same
U2 paging error: `autoload/wbx/paging.vim` assigns an unscoped `count` variable,
which this Vim rejects with `E46: Cannot change read-only variable "count"`.
The independent `thread-subtrees` fixture also fails exact viewport-preservation
assertions around fold save/restore, in both headless and drawn Vim. These checks
were not skipped, weakened or relabeled as passes. Their logs and the categorized
`test-results.json` remain in the verification directory.

All **278 source files** matched both manifests after testing; all **ten original
bundle/map hashes** were unchanged. Only this failure-evidence update followed,
with documentation/manifests rechecked separately. At that checkpoint no runtime
fixes had been applied. The running editor, installed configuration and live
provider/OAuth, receipt, device and graphical-media sessions were untouched.

### Vim correctness fixes and strict two-editor gate

- `autoload/wbx/paging.vim` uses `item_count`, avoiding Vim's read-only unscoped
  `count` alias. Paging admission, generations, hysteresis and memory caps are
  otherwise unchanged.
- `autoload/wbx/folds.vim` restores a view only after actual movement. In Vim,
  restoring an already-identical, not-yet-redrawn view can itself normalize the
  pending topline and scroll it. Repeated inner/outer inspections and disabled-fold
  save/restore now preserve exact views, options, focus, text and undo. Existing
  viewport assertions remain, with repeated-operation guards added.
- `autoload/wbx/image_external.vim` and `autoload/wbx/attachments.vim` bind Vim
  terminal cleanup to the buffer returned by `term_start()`, not the prepared blank
  buffer that Vim replaces. A blank-buffer wipe no longer prematurely releases a
  running handler's private file. Actual terminal wipe/exit still releases it;
  generation checks reject stale startup without taking a replacement's lease.
  Pre-launch BufEnter/OptionSet safety, literal argv, private-file permissions and
  initially disabled automatic external opening remain unchanged.

The full run after the first paging/fold fixes, retained at
`/tmp/opencode/wbx-vim-fixes-verification-f4mpi1ah/`, exposed these terminal issues
and fixture assumptions previously hidden behind the paging exception. It is
failed evidence, not a pass. Silent Ex mode has no drawn viewport: image fixtures
now assert automatic admission is refused there and drive only explicit synthetic
responses; notification fixtures assert an undrawn view cannot suppress an alert.
Those undrawn positive-visibility limitations are explicitly labeled in results.
The real positive automatic-visibility/suppression assertions still run unchanged
in both drawn editors. Hook fixtures bound their own scratch-window accumulation
while asserting retained text survives; aggregate-status assertions silence only
incidental health output to avoid a test-only More prompt. No receipt or runtime
visibility check was relaxed, and no fixture was skipped to obtain a pass.

Frozen pre-fix sources/manifests, failing paging/fold reproductions (including the
strengthened fold fixture), and isolated terminal failures with the paging/fold
fixes already installed are retained in `/tmp/opencode/wbx-vim-fixes-pbjklsu5/`.
The exact changes are listed in `changes.json`; no files were added or removed.

`/tmp/opencode/wbx-vim-fixes-verification-dmif67jb/` then passed the full gate with
core concurrency four and `WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **465 core passes / 12 explicit opt-in skips**.
- **38 Neovim + 37 Vim fixtures**, **zero editor skips**.
- **25 Neovim + 24 Vim private-PTY drawn fixtures**. The incremental Lua/Kitty
  fixture remains Neovim-only, not a no-op Vim pass.
- **77 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
- TypeScript, all five copied builds, help tags in both editors and documentation
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

All **278 source files** matched both source/staged manifests, and all **ten
original bundle/map hashes** were unchanged. Only this evidence update followed,
with documentation/manifests rechecked at finalization. Changes remain uncommitted
and inactive; installed configuration and the running editor were untouched. Live
provider/OAuth, receipt, device and real desktop/media acceptance remain separately
approval-gated and unverified. At that checkpoint U3 implementation had not started;
its structural baseline needed refreshing after the correctness fixes.

### U3 fresh structural baseline — implementation pending

`/tmp/opencode/wbx-u3-bh2pbfhh/` freezes the post-U2 source and ten original
bundle/map hashes. `profile-before.py` uses the same bounded synthetic fixture
with redraw included, 435 rooms, 50/200/500 messages, seven samples per process,
one profiled process and two unprofiled processes per message count. No backend,
installed configuration, active editor or live service is involved.
These measurements predate the Vim correctness fixes above; retain them as
historical evidence and refresh the baseline before U3 implementation.

Unprofiled process medians (milliseconds; synthetic local work, not live latency):

| Messages | Same-size body edit | Bounded append/eviction | Space replacement |
| --- | --- | --- | --- |
| 50 | 45.6–53.2 | 49.7–51.9 | 72.6–84.6 |
| 200 | 86.8–88.5 | 88.2–99.6 | 155.4–178.5 |
| 500 | 174.7–175.1 | 173.1–175.3 | 355.1–364.0 |

The 500-message profile combines seven instances of each operation, not a
space-switch-only profile. Decoration and syntax each visit all 10,500 message
blocks across those 21 updates; there are 6,985 native endpoint-verification calls,
10,500 summary checks and 41,954 fold-expression evaluations. The writer invokes
4,013 splice helpers, including empty gaps around preserved message chunks.
History arrangement/projection remains a major cost alongside this verification,
decoration and fold work; required new-room mark creation is not redundant work.

U3 implementation must separate geometry/chrome changes from content-only changes
and count scans/verification as well as mutations before claiming dirty-range
savings. Native shifts, per-window folds (including disabled folds), earlier-thread
replies, clipped history, syntax overrides and annotations remain required gates.
At this baseline checkpoint no U3 runtime optimization or Phase 3 backend work had
started. These profiles replaced assumptions from the earlier syntax-heavy baseline.

### U3 implementation and measured evidence

The baseline was refreshed after the Vim fixes in
`/tmp/opencode/wbx-u3-post-vim-e9k90i3b/`. It still showed roughly 355–356 ms for
synthetic 500-message space replacement. U3 now skips empty/unchanged writer gaps,
reuses native syntax rules for exact geometry/chrome matches while rekeying message
identities, and reconciles virtual summaries only for changed summary inputs.
Actual text comparisons, sparse native writes, rail endpoint checks and conservative
per-window fold recomputation remain intact. New counters distinguish input/span
widths, scans, native queries, mutations and fold inspection/reset work.

An initial bulk-write approach was rejected: it reduced native text calls but
increased fold-expression evaluations from 41,954 to 69,677 and made replacement
slower. Sparse writes were restored before acceptance; the rejected snapshot and
all unfavorable measurements are retained, not erased. The final mixed structural
profile retains the original 41,954 fold evaluations and 6,985 endpoint verifications,
while reducing splice-helper calls 4,013 → 23, summary reconciliations 10,500 → 693,
syntax chrome reconstructions 10,500 → 1,000, and bucket rebuilds 262 → 64.

Final paired 500-message process medians were 178.0–180.9 → 166.9–167.7 ms for
same-size edits, 179.3–206.4 → 136.6–148.7 ms for bounded append/eviction, and
368.8–430.2 → 343.7–351.4 ms for synthetic space replacement. The slower 430 ms
before-side sample is not treated as the stable baseline. Three-ready-image Unicode
replacement was 331.6–382.5 → 310.3–363.7 ms. Steady-update/navigation measurements
remain variable and are not claimed faster. See [scope, rechecks and retained
evidence](performance.md#structural-native-updates-u3); none is a live latency bound.

The new structural fixture passes in Vim and Neovim, headless and privately drawn.
It verifies executed work as well as counters, lost-mark repair, unchanged native
syntax definitions after identity replacement, incremental append thereafter,
earlier-thread insertion/prepend, per-window anchors/folds, disabled folds, bounded
Unicode images, clipped syntax and annotation/undo preservation. Existing history,
syntax, native navigation and projection fixtures pass without relaxed assertions.
An independent executed-work fixture fails against frozen pre-U3 source in both
editors and passes against U3. No backend, receipt, delivery, notification eligibility,
meeting ownership or external-tool policy changed. Full copied-project verification
passed below; no installed configuration, active editor or original builds changed.

### U3 full strict offline gate

`/tmp/opencode/wbx-u3-verification-zu1b_qvj/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **465 core passes / 12 explicit opt-in skips**.
- **39 Neovim + 38 Vim fixtures**, **zero editor skips**.
- **26 Neovim + 25 Vim private-PTY drawn fixtures**, including the new structural
  work/identity fixture in both editors. The incremental-image Lua fixture is
  Neovim-only, not a no-op Vim pass.
- **77 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
- TypeScript, all five copied builds, native help in both editors and documentation
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

All **279 source files** matched both source/staged manifests after the gate. The
four U3 runtime/syntax files also match the final measured snapshot in
`/tmp/opencode/wbx-u3-post-vim-e9k90i3b/after-final/`. All **ten original bundle/map
hashes** remain unchanged. Only this evidence update followed, with documentation
and manifests rechecked at finalization. Changes remain uncommitted and inactive;
the running editor and installed configuration were untouched. No live provider,
OAuth, receipt, device or real desktop/media acceptance was attempted or authorized.
At the U3 checkpoint Phase 3/B1 was next; no backend transition or snapshot
optimization had started.

## Phase 3 — Backend state production and pressure

### B1. Make required transitions explicit before optimizing snapshots

In `src/editor-engine.ts`, move observed-message/read-authority reconciliation,
people selection and agenda expiry/revision updates onto explicit transitions.
Introduce narrow owner/clock seams, then make reusable snapshot projections genuinely
observational. Reuse the snapshot already emitted by `publish()` instead of computing
another one in `src/editor-worker.ts`.

**Gate:** message activity contradicting a cached read state still marks it stale;
source loss/recovery retains fail-closed behavior; clock advancement invalidates
expired meeting actions even without a new provider response. Cached unread hints
never enter the authority ledger. Do not memoize the current side-effectful getter
and accidentally remove those transitions.

### B1 implementation and focused evidence

The post-U3 sources and all ten original build/map hashes were frozen before edits
in `/tmp/opencode/wbx-b1-jnyls0h2/`. Store transitions now reconcile actual observed
activity and people ownership before publication. Message evidence survives room
switches and older SDK observations, including newest endpoints withheld by the
display cap. Receipt admission keeps its independent fresh-authority/activity
checks. People projection no longer selects/cancels owners, and grant replacement
still cannot trigger an implicit presence read. Optional local owner/clock seams
preserve existing positional injection and do not change authorization expiry.

Agenda expiry/revision reconciliation is explicit on owner/publication, refresh,
clock-tick and action transitions. Snapshots return the last committed agenda;
they do not secretly advance its revision. The existing 15-second clock tick is
rearmed independently of an unresolved discovery read. A join action immediately
rechecks clock freshness/revision and publishes invalidation even if the tick is
delayed, without fetching or retrying a join. Late stopped/renewed-owner responses
cannot resurrect an old agenda. URL-free editor projection is retained.

RPC retains the latest emitted state for its existing microtask notification;
it no longer computes a second snapshot. All owner publications/loading transitions
remain, with no new state suppression, hook change or output-pressure policy.
Rooms, selected-room and nested message/image/attachment data are defensively
copied. Whole-state memoization remains deliberately absent: optional people,
cached hints and notification-event ages still have pure time-sensitive projections.

All **111 focused tests** pass with zero skips, plus TypeScript. Seven deterministic
regressions fail against frozen pre-B1 sources and pass against B1. Identical offline
demo traces retain **11 publications / 7 notifications**, reducing projections
**18 → 11**; twenty explicit inspections retain twenty defensive projections but
perform **zero** activity-endpoint reads rather than twenty. These are work counts,
not live latency claims. See [B1 scope and retained evidence](performance.md#explicit-backend-transitions-and-projection-b1).
Full copied-project strict verification passed below; original builds, installed
configuration and the running editor remain untouched.

### B1 full strict offline gate

`/tmp/opencode/wbx-b1-verification-rwm60kv3/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **478 core passes / 12 explicit opt-in skips**, including thirteen new B1 tests.
- **39 Neovim + 38 Vim fixtures**, **zero editor skips**.
- **26 Neovim + 25 Vim private-PTY drawn fixtures**; the incremental-image Lua
  fixture remains Neovim-only, not a no-op Vim pass.
- **81 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

All **279 source files** matched source/staged manifests after testing. The two
runtime files and four changed test files match the deterministic work-guard source
manifest in `/tmp/opencode/wbx-b1-jnyls0h2/`. All **ten original bundle/map hashes**
remain unchanged. Only this plan evidence update followed the gate; finalization
rechecks documentation and manifests. Changes remain uncommitted and inactive;
backend activation still requires a deliberate user-controlled rebuild/restart.
No active editor reload, installed configuration change, reconnect, live OAuth,
Webex receipt/device test or real desktop/media acceptance was performed.
At the B1 checkpoint B2 was next; no new stream/IPC coalescing or persistence policy
had been implemented.

### B2. Bound replaceable state traffic and preserve observable semantics

Classify output first: replaceable state/projections versus nonreplaceable RPC
responses, deliveries, receipt outcomes, failure/ownership transitions and message
creation evidence. Then implement one in-flight plus one latest pending state at
each relevant boundary, with stream-drain/IPC-completion scheduling and existing
hard fail-closed limits retained.

Suppress no-op provider projections and redundant poll payload work. Do **not**
silently discard the currently observable loading/status transitions or native
`WbxState` contract. If lightweight status/delta messages are needed, specify and
negotiate them, with legacy full-state fallback. Every state actually admitted by
the native client must still reach its public hooks.

**Gate:** slow-consumer and SDK-burst tests show bounded memory/queue depth; latest
valid state arrives without duplicate sends, lost failure responses, notification
replay or lost message evidence. Large responses remain one-shot. Same-account
events remain eligible except exact acknowledged plugin sends. No writable public
aliases replace defensive snapshots, and no accepted-data shortcut trusts only an
unverified ID or length.

### B2 implementation and deterministic evidence

Post-B1 sources and all ten original build/map hashes were frozen in
`/tmp/opencode/wbx-b2-0z0xzt8r/`. The reviewed
[output pressure contract](editor-protocol.md#output-pressure-contract) keeps all
version-1 full-state envelopes/capabilities and legacy behavior: no new delta/status
wire format or native hook suppression. Only compatible adjacent presentation can
replace. Loading/status, ownership/failure, membership/unread authority, newest
endpoint identity/time and creation-feed changes are barriers; responses, deliveries,
receipt outcomes and meeting notifications are nonreplaceable FIFO records.

Stdout now has one active callback/drain-gated write and one latest pending compatible
presentation between barriers. It retains the old per-record and pre-serialization
limits, with bounded **128-record / two-maximum-line** total admission. Private
read-status IPC uses completion-gated admission with **128 records / 2 MiB**.
Irreducible overflow fails closed, not by dropping outcomes or retrying. Graceful
shutdown flushes accepted final responses; explicit teardown prevents late callbacks
from resurrecting output. Fatal worker output retains the existing one-second hard
teardown deadline. No independent meeting-owner lifecycle policy changed.

RPC preserves earlier same-turn control/evidence transitions before retaining the
latest compatible snapshot. Full message batches flush at the existing 64-item cap
rather than silently dropping later creations. Same-account items remain eligible;
only exact acknowledged plugin-send identities exclude notifications natively.
Unchanged per-room SDK lookups suppress redundant snapshots, and exact duplicate
full observations skip engine merges/projections while retaining genuine observation
time. Full observations remain for liveness; stale/source-loss authority cannot be
freshened by an equality shortcut. Native lookup scheduling/fairness/deadlines (B3)
and cache persistence policy (B4) are unchanged.

Nine deterministic regressions fail against frozen pre-B2 runtime and pass against
B2. A 435-room / 500-message pressure fixture formerly wrote 75 times and failed
before revision 200; B2 keeps one active plus one pending presentation and delivers
revision 200 in two writes without failure. Peak active/pending accounted UTF-8
bytes are 449,582, not a heap/RSS claim. The focused suite has **84 passes / zero
skips**, plus four actual-SDK network-blocked tests and TypeScript. Real worker
tests deliver 200 ordered creations, coalesce 200 title updates behind one IPC send
and preserve fatal output. Real Node stream and both editors' headless/drawn hook
checks pass. See [scope and retained work counts](performance.md#bounded-backend-output-pressure-b2).
Full copied-project strict verification passed below; installed configuration,
running editor, original bundles and live services remain untouched.

### B2 full strict offline gate

`/tmp/opencode/wbx-b2-verification-ptwjgkfa/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **493 core passes / 12 explicit opt-in skips**, including fifteen new B2 tests.
- **39 Neovim + 38 Vim fixtures**, **zero editor skips**.
- **26 Neovim + 25 Vim private-PTY drawn fixtures**, including the extended
  per-admitted-state public hook checks in both editors. The incremental-image
  Lua fixture remains Neovim-only, not a no-op Vim pass.
- **86 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

All **282 source files** matched source/staged manifests after the gate, and all
**ten original bundle/map hashes** remain unchanged. The final source manifest,
frozen pre-B2 reproduction, nine before-failing/after-passing guards and pressure
work counts remain in `/tmp/opencode/wbx-b2-0z0xzt8r/`. Only this plan evidence update
followed testing; finalization rechecks documentation and manifests. Changes remain
uncommitted and inactive. No installed configuration change, active editor reload,
root build, reconnect, live OAuth/Webex receipt/device test or real desktop/media
acceptance was performed. Backend activation still requires a deliberate
user-controlled rebuild/restart. At the B2 checkpoint B3 was next; lookup
deduplication and persistence coalescing were not implied complete by B2's
transport pressure work.

### B3. Deduplicate read-status reconciliation, not receipts

In `src/read-status-worker.ts`, track per-room queued/in-flight dirtiness so repeated
SDK membership events do not create redundant lookups. Filter an actor only when
existing trusted public metadata confidently proves the event irrelevant; ambiguous
events retain reconciliation coverage. Do not add identity lookups, private APIs
or grants merely to optimize this path.

**Gate:** synthetic event storms produce bounded per-room work while new activity
is eventually reconciled. Existing fatal deadlines, priority and one-shot receipt
admission remain unchanged; timeout must not release a noncooperative transport's
native admission or automatically reconnect/register/replay.

### B3 implementation and deterministic evidence

The post-B2 sources and ten original build/map hashes were frozen before edits in
`/tmp/opencode/wbx-b3-f5bmeat0/`. Queued room identities now remain registered until
actual native admission, rather than disappearing into an untracked batch. An event
during the active read sets one dirty bit and reserves a follow-up behind queued
peers. The bound is **64 queued/in-flight room identities total**, including the
active slot, so saturation cannot lose that active room's later observation. Distinct
overflow remains covered by periodic full reconciliation; the full fetch keeps its
existing priority after one active lookup. Capped full results are not assumed to
subsume every queued event.

The actor filter is limited to public membership `seen` events with consistent
resource/event, actor/member/creator and canonical same-namespace PEOPLE identity
proof. Unknown/self/contradictory/cross-namespace identities retain reconciliation;
membership creation/deletion, room events and message evidence are not filtered.
The pinned public SDK listener confirms 100 peer reads avoid lookups while self
reads from another client still reconcile, with no network, identity requests,
additional grants, registrations or receipts. See the
[reviewed contract](editor-protocol.md#read-status-event-reconciliation).

Receipt mutations retain one-shot/single-flight admission and immediate result
ordering; only their subsequent metadata hints share the bounded queue. A distinct
unadmitted hint is recovered by periodic full observation, never an invented read
date or receipt replay. Settled service errors do not invent dirtiness/retries.
Fatal/near-deadline/never-settling work and late native results still lose admission
without overlapping replacement requests, reauthorization or device registration.

Six regressions fail against frozen pre-B3 source, and all fifteen worker fairness/
pressure fixtures pass against B3. An initial 64-room batch plus 8,192 repeated
events reduces native room reads **128 → 65**; 1,000 repeats for a queued peer
reduce **65 → 64**. Proven peer `seen` bursts reduce **1 → 0** native reads, not a
claimed 1,000 → 0. A deliberately admission-captured native result exposes the old
saturated dirty-hint loss and verifies the new result is reobserved before full
refresh. Native metadata concurrency stays one, with two startup full reads, one
registration and zero receipts in the measured work fixtures.

All **85 focused tests / zero skips**, four actual-SDK network-blocked checks and
TypeScript pass. The 600-second virtual stress guard retains nine periodic full
fetches beyond startup and bounded overflow recovery. Counts/timings are synthetic
local evidence, not provider/live latency guarantees; see
[scope and retained work counts](performance.md#per-room-read-status-reconciliation-b3).
Full copied-project strict verification passed below. Original builds, installed
configuration, active editor and live services remain untouched.

### B3 full strict offline gate

`/tmp/opencode/wbx-b3-verification-6ltl8f4q/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **502 core passes / 12 explicit opt-in skips**, including nine new B3 tests.
- **39 Neovim + 38 Vim fixtures**, **zero editor skips**.
- **26 Neovim + 25 Vim private-PTY drawn fixtures**; the incremental-image Lua
  fixture remains Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
  The actual pinned SDK membership-actor proof passes in both preview modes,
  alongside native same-account message and exact plugin-send exclusion checks.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

All **282 source files** matched source/staged manifests after testing. Both changed
runtime files and both changed test/fixture files match the deterministic regression
snapshot in `/tmp/opencode/wbx-b3-f5bmeat0/`. All **ten original bundle/map hashes**
remain unchanged. Only this plan evidence update followed the gate; finalization
rechecks documentation and manifests. Changes remain uncommitted and inactive;
activation still requires a deliberate user-controlled rebuild/restart. No installed
configuration change, active editor reload, root build, reconnect, live OAuth/Webex
receipt/device test or real desktop/media acceptance was performed. At the B3
checkpoint B4 was next; cache-persistence coalescing was not implied complete by
B3's native lookup work.

### B4. Coalesce optional cache persistence

In `src/editor-engine.ts` / `src/spaces-cache.ts`, retain one active write and one
latest pending document, rather than every queued fsync. Keep genuine observation
timestamps separate from semantic changes.

**Gate:** slow-storage tests bound pending work; account changes, cache-clear and
shutdown cannot resurrect stale writes. Profile/account isolation, atomic private
files, independent unread expiry and always-stale restored flags remain intact.

### B4 implementation and deterministic evidence

Post-B3 source and all ten original bundle/map hashes were frozen before edits in
`/tmp/opencode/wbx-b4-xqxeie20/`. The engine and storage owner now each retain one
active write plus one latest pending document. The existing five-second admission
interval stays fixed; slow I/O cannot accumulate one save/callback chain every
five seconds. Same-key pending storage requests share a completion promise for
the latest document, while conflicting profile keys reject without overwriting
another pending profile. All private-file, link/ownership, byte/entry/slot bounds,
exclusive temporary files and atomic whole-file rename checks remain intact.

Successful REST/nonempty SDK input timestamps are distinct from semantic equality
and disk completion. Coalesced documents keep those actual observation times, and
cache status no longer claims that slow storage completion is a fresh observation.
Genuine unchanged observations can renew metadata age; only actual SDK observations
renew flag ages. Empty invalidation, failures, metadata rewrites and receipt outcomes
cannot invent an observation or restore unread/receipt authority. Disk v1/v2,
editor protocol/capabilities, cache opt-ins and grants are unchanged.

Clear/close, grant loss and account/session replacement revoke pending work, timers
and callbacks. Clear never reopens save admission and waits for an already-admitted
native commit before removing its matching key. Active filesystem I/O is not freed
by a synthetic timeout. Atomic rename already admitted to the OS cannot be canceled;
clear waits behind it, and other opted-in processes remain independent. A late clear
failure cannot overwrite a newer scope-loss state. Failures remain observable and
only the latest newly requested work may continue; no failed write is replayed.

Fourteen regressions fail against frozen pre-B4 source; all eighteen new pressure/
lifecycle fixtures pass against B4. A gated real-filesystem fixture reduces **201
fsyncs → 2**, with native fsync concurrency one. Two hundred pending same-key saves
retain **one**, not 200, completion promises. Across 40 five-second provider updates,
engine admissions fall **41 → 1 while blocked / 2 total**, and peak outstanding
storage callbacks **41 → 1**. The engine fixture is a controlled adapter, not a claim
of 41 concurrent physical fsyncs. Latest input survives both fixtures, with no
completion-time observation inflation. Counts/timestamp differences are synthetic
local evidence, not provider/live latency or heap/RSS guarantees; see
[scope and retained work counts](performance.md#bounded-cache-persistence-b4).

All **87 focused tests / zero skips** and TypeScript pass. Existing permissions,
links, corruption, profile/collision, independent-expiry and stale-restoration tests
remain unchanged. Full copied-project strict verification passed below; root builds,
installed configuration, active editor and live services remain untouched.

### B4 full strict offline gate and retained first-run failure

The final full gate, `/tmp/opencode/wbx-b4-verification-e54d17kg/`, passed with core
concurrency four, `WBX_STRICT_EDITORS=1`, Vim 9.1 Huge and Neovim 0.12.6:

- **520 core passes / 12 explicit opt-in skips**, including eighteen new B4 tests.
- **39 Neovim + 38 Vim fixtures**, **zero editor skips**.
- **26 Neovim + 25 Vim private-PTY drawn fixtures**; the incremental-image Lua
  fixture remains Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, and **3 synthetic browser-control passes**.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **1 pass / 1 optional installed-loader skip**.

The first full attempt, `/tmp/opencode/wbx-b4-verification-4doss51w/`, passed every
other check but failed one unchanged messaging CLI prompt-cancellation assertion:
Ctrl+C returned exit 130 instead of expected 1, before any secret was provided or
service contacted. All five unchanged isolated rechecks passed, followed by the
complete fresh passing gate above. Recheck logs remain in
`/tmp/opencode/wbx-b4-xqxeie20/cli-cancellation-rechecks/`. Both full-gate source
manifests are identical. No CLI/authentication source or assertion was changed or
relaxed; this intermittent cancellation/timing exposure is retained as follow-up,
not claimed fixed by B4 or erased by a selective retry.

All **283 source files** matched source/staged manifests after both gates. Both
changed runtime files and the new pressure test match the final deterministic
regression snapshot in `/tmp/opencode/wbx-b4-xqxeie20/`. All **ten original
bundle/map hashes** remain unchanged. Only this plan evidence update followed the
passing gate; finalization rechecks documentation and manifests. Changes remain
uncommitted and inactive. No installed configuration change, active editor reload,
root build, reconnect, live OAuth/Webex receipt/device test or real desktop/media
acceptance was performed. Backend activation still requires a deliberate
user-controlled rebuild/restart. Phase 3 is complete; Phase 4/A1 still requires
its protocol-design checkpoint before implementation.

**Dependencies:** B1 precedes snapshot reuse/coalescing in B2. B3 and B4 can be
developed independently against deterministic adapters, then integrated under the
same pressure/authority tests. Startup progression is not included in these steps.

## Phase 4 — Explicit attachments and large transfers

| ID | Change | Acceptance |
| --- | --- | --- |
| A1 | Design a single explicit typed-open operation that fetches once, obtains safe metadata and reuses those bytes for native conversion or configured handling. | One authenticated content GET per valid open, including unknown/unpreviewed images and images with unrelated handlers configured. Extension-over-MIME precedence, original-byte downloads and current image/generic limits remain explicit. No persistent original-byte cache. |
| A2 | Remove repeated incomplete-frame scanning/copying; introduce bounded chunking if large JSON processing remains a measured stall. | Linear framing under highly fragmented Unicode/base64 input; byte/record limits still reject oversized or malformed input before unbounded allocation. Chunked transfer must validate ordering, length/canonical encoding, identity and completion, with capability fallback. |
| A3 | Admit or queue at most one still-valid explicit image intent behind background preview work. | No generic fetch merely to discover known contention. Cancellation/navigation/disconnect revokes intent; a timed-out but still-running native operation retains admission. No automatic retry, duplicate launch or re-selection. |
| A4 | Extract narrow shared lease/job/guarded-terminal primitives from the corrected specialized paths. | Preserve per-format validation, exact-file cleanup, private permissions, exclusive save/no-symlink-overwrite behavior, foreground lifetime and user hooks. Never share a blanket retry/teardown policy with independently owned meetings. |

A1 needs a protocol design checkpoint before implementation. If an opaque transient
handle/lease is used, bind it to account/session/request/destination generations,
bound retained bytes and lifetime, and release on completion/cancel/expiry. No URL,
credential, executable argv or download destination belongs in remote-content RPC.
Downloads still require explicit destination choice; opening still requires explicit
user action. Legacy backends must degrade honestly, not guess URLs or launch tools.

Do the low-risk framing fix independently of a larger chunked protocol. A2's chunking
and A1 should share a reviewed transfer contract, not two competing blob mechanisms.
A4 depends on C2/C3 reproductions and specialized safety fixes.

### A1 protocol-design checkpoint (historical design-only record)

The proposed [single-fetch typed-open contract](attachment-open-design.md) is ready
for review. It recommends one capability-gated request carrying only bounded
extension/MIME selection hints, never handler argv or save paths. Node obtains safe
metadata and returns either original bytes or normalized PNG from one GET, without
a transient byte-handle registry. Empty extension-handler opt-outs still suppress
MIME fallback. Original-byte routes retain 6,000,000 bytes, unhandled native rasters
retain 8,388,608 input bytes, and normalized output retains 6,000,000 bytes. The
currently accidental 6 MB restriction on unpreviewed/unrelated-handler native
images is explicitly corrected by the proposal, not silently imposed on all routes.

The checkpoint specifies owner/cancel/admission lifetime, one-shot replay, exact
HTTP 200 for the new method, deadline classification, bounded policy and record
validation, honest legacy fallback and the shared prospective A2 payload boundary.
It calls out the conservative busy-preview tradeoff for unknown typed opens; A3's
single waiting intent is still separate. Neither A1 nor chunking/framing runtime
changes are approved or implemented just by writing this checkpoint.

Post-B4 sources (**283 files**) and all **ten original bundle/map hashes** were
frozen first in `/tmp/opencode/wbx-a1-design-w0ar78e6/`. Six strict offline native
reproductions show **two content GETs per open**: unpreviewed image, unrelated
handler and file seven beyond preview slots, in both Vim and Neovim. Real frozen
native dispatch/RPC/store/API/readers/conversion run against injected local content;
no live network, OAuth, receipt, external viewer or installed configuration is used.
`native-baseline.json` records counts; the design documents fixture scope and the
retained first custom-fixture startup error. These are current-defect baselines,
not evidence that the proposed operation already exists or passes its acceptance.

Only documentation is changed in the working checkout. The B4 full gate remains
the latest runtime gate; checkpoint documentation validation/source-integrity
evidence is recorded separately. Implementation needs explicit contract approval,
then failing one-fetch/policy fixtures and the normal copied-project strict gate.
Checkpoint checks pass: **35 existing frozen media/backend/helper tests**, **six
existing native fixtures in both editors**, and **three documentation checks**,
all with zero skips. `checkpoint-integrity.json` records **284 current source files**,
only the three documentation paths changed/added, 283 frozen source files intact
and all ten original bundle/map hashes unchanged. No full runtime gate is claimed
for that design-only batch, and all work remained uncommitted and inactive.

### A1 implementation and focused evidence

The user approved implementation after reviewing the design summary. The reviewed
`messages.attachmentResolve` / `messages.attachmentCancel` methods and capability
`attachment-typed-open-v1` are now implemented in protocol, RPC, engine/store/API,
bounded Node reading/conversion and native dispatch/validation. A request carries
identities/action and bounded extension/MIME hints, never executable settings, URLs,
credentials or save paths. Metadata chooses one original-byte or normalized PNG
result from one GET; there is no transient original-byte handle/cache.

The approved original-versus-raster limits, exact new-method HTTP 200 rule,
deadline classification, empty-extension opt-out, worker-owned physical admission,
explicit cancellation, native context/configuration guards and one-shot replay are
implemented. Old wire shapes remain; old backends use a labeled legacy path, never
a failure-triggered automatic downgrade/refetch. Source-bound image snapshots remain
zero-fetch. Known preview contention fails before GET; the conservative unknown-file
busy behavior is intentional. A2 framing/chunking, A3 waiting-intent queue and A4
shared helper extraction are not included.

Before edits, **284 files and ten original bundle/map hashes** were frozen in
`/tmp/opencode/wbx-a1-_wfq28y9/`. `verify-regressions.py` executes identical final
fixtures against frozen pre-A1 and current A1 copies. All **19 new backend feature
tests** fail on the absent pre-A1 method/policy and pass on A1; this is absence-of-
feature evidence, not nineteen independently attributed historical bugs. Both
native fixtures independently record **2 → 1 content GETs** for unknown/unpreviewed
images, unrelated handlers and attachment ten. Snapshot reopening remains zero-fetch.
Counts are deterministic synthetic work evidence, not provider/live latency claims.

Focused backend/helper/engine/output coverage has **85 passes / zero skips**.
Both editors' new native fixture passes, alongside the six unchanged attachment/
image/terminal fixtures. Boundary tests cover both source budgets, canonical base64,
PNG dimensions, exact 6 MB original / 8 MB encoded native validation, status/MIME/
signature/length/chunk limits, no content replay, destination/grant loss, precise
cancel, shortened-from-GET deadlines, ignored transport/cleanup and API replacement
without freeing worker admission. Native checks preserve actual Vim terminal leases,
text edits/drafts, explicit downloads, selector precedence, relevant configuration
revocation, away-and-back cancellation and a real `BufNew` disconnect hook before
image writes. Shared filename cases lock Node/Vim final-extension semantics.

Fixture-development failures (variable scope in an eval wait, and nonexecuting
`BufAdd` for an unlisted buffer) are retained; the final fixture uses `BufNew` and
asserts it executes. No protocol/behavioral assertion was relaxed. New native CPU
conversion is injected deterministically; existing real-converter tests remain
separate. Full copied-project strict integration passed below; changes remain uncommitted
and inactive, without installed configuration, root build or running-session changes.

### A1 full strict offline gate

`/tmp/opencode/wbx-a1-verification-c4jmy7ly/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Neovim 0.12.6 and Vim 9.1 Huge:

- **539 core passes / 12 explicit opt-in skips**, including nineteen A1 tests.
- **40 Neovim + 39 Vim fixtures**, **zero editor skips**.
- **27 Neovim + 26 Vim private-PTY drawn fixtures**, including the new typed
  attachment fixture in both editors. The incremental-image fixture remains
  Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, and **three browser-control passes**.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **one pass / one optional installed-loader skip**.

All **290 source files** matched source/staged manifests at the gate. Runtime and
tests match the deterministic regression copy in `/tmp/opencode/wbx-a1-_wfq28y9/`;
all **ten original bundle/map hashes** are unchanged. The A1 verifier copy adds
the new typed fixture to both-editor drawn verification without changing existing
gates or assertions. Only this plan's evidence/status and the design document's
evidence/status changed after the full gate; finalization rechecks documentation,
all other source hashes and the original bundle hashes.

The first complete A1 gate passed, including the unchanged CLI cancellation test;
B4's earlier intermittent cancellation exposure is not claimed fixed. No active
editor/configuration change, root build, hot-source, reconnect, live OAuth/Webex,
receipt/device test or real desktop/media acceptance occurred. Work remains
uncommitted and inactive. Activation requires a deliberate draft-safe native and
backend rebuild/restart, not an automatic step of this verification.

### A2 framing-only implementation and independent evidence

Post-A1 sources (**290 files**) and all ten original bundle/map hashes were frozen
in `/tmp/opencode/wbx-a2-rzudi4af/` before edits. Node request framing and native
backend-output framing now scan new callback bytes, retaining bounded partial
fragments compacted once per 4 KiB block and joined only at record completion.
Neither a growing incomplete prefix nor a shrinking callback suffix is repeatedly
materialized. The request/event ceilings remain **32,768 / 8,388,608 UTF-8 bytes**,
excluding LF; callback aggregate size is not mistaken for record size.

Node checks raw admission before decoding and preserves `StringDecoder` Unicode/
replacement behavior plus the normalized byte ceiling. A failed framer cannot
admit later records or a follow-up push. Native stop and EOF release partial
records; a reentrant receive hook that starts a replacement backend cannot admit
the old callback's remaining bytes into the new generation. No wire shape,
capability, cache/receipt authority or independent meeting ownership policy changes.

Identical tests on frozen before/after copies show Node's one-byte ASCII scan
count **904,084,622 → 60,133**; Vim and Neovim's 64-byte-fragment count
**1,074,790,402 → 524,290 each**. These are explicit primitive search/length input
units, not CPU instructions, all internal C work or measured allocator copies.
A 98,304-byte oversized Node segment reaches **zero**, not 98,304, UTF-8 decoder
bytes. Four new Node regressions fail pre-A2 and all eight pass on A2; both native
work guards fail independently before the old sources attempt the larger checks.
The final fixtures cover Unicode byte splits, one-byte metadata bounds, multiple
records, exact/adjacent limits, pre-copy/decode overflow, malformed-byte compatibility,
terminal errors, EOF/reset, generation replacement and drafts. A corrected Array-
prototype mock setup failure is retained and is not claimed as a product defect.

All **67 focused backend/documentation/harness checks / zero skips** and
TypeScript pass, alongside **ten strict native fixtures** covering framing,
protocol, faults and both attachment paths. The final native work guard also
checks a near-ceiling multibyte record, not only ASCII/base64.

### A2 conditional chunking remains open after measurement

Five-sample uninstrumented native benchmarks still measure a maximum-size 8 MiB
record receive median of **55.875 ms Neovim / 68.376 ms Vim**, including JSON decode;
separate decode medians are **28.016 / 34.423 ms**. Node's seven-sample output
serialization median is **6.159 ms**. The
[full distributions and scope](performance.md#remaining-large-record-pause-chunking-is-a-separate-checkpoint)
distinguish framing, JSON phases and input preparation, with no timing CI thresholds
or live latency/whole-editor claim.

That residual synchronous pause warrants the conditional chunked-transfer design
review, not a claim that framing alone removed large-JSON stalls. This batch adds
**no chunks or transfer handles**. A2's protocol-changing follow-up must share A1's
payload contract and review ordering/length/canonical encoding, owner/generation/
completion checks, bounded credits and capability fallback before implementation.
Therefore **only the framing sub-batch is complete**, not all of A2.
Full copied-project strict integration passed below; all work remains uncommitted and
inactive, without root builds, installed configuration or active-session changes.

### A2 framing-only full strict offline gate

`/tmp/opencode/wbx-a2-verification-53_8ac69/` passed with core concurrency four,
`WBX_STRICT_EDITORS=1`, Neovim 0.12.6 and Vim 9.1 Huge:

- **547 core passes / 12 explicit opt-in skips**, including eight new Node tests.
- **41 Neovim + 40 Vim fixtures**, **zero editor skips**.
- **28 Neovim + 27 Vim private-PTY drawn fixtures**, including framing in both
  editors and the retained A1 single-fetch fixtures. The incremental-image fixture
  remains Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, and **three browser-control passes**.
- TypeScript, all five copied builds, documentation and native help in both editors
  passed; LazyVim remains **one pass / one optional installed-loader skip**.

All **292 source files** matched source/staged manifests at the gate; runtime and
tests match the final independent regression copy in `/tmp/opencode/wbx-a2-rzudi4af/`.
All **290 frozen pre-A2 source files** and all **ten original bundle/map hashes**
remain intact. Only this plan's evidence/status changed after the passing gate;
finalization rechecks documentation and source/build integrity. The copied A2
verifier includes the added framing drawn fixtures without changing existing gates
or assertions.

The first complete framing gate passed. The unchanged CLI cancellation test also
passed; its earlier intermittent exposure is not claimed fixed. No original build,
installed configuration, active editor reload, hot-source, reconnect, live Webex/
OAuth/receipt/device test or real desktop/media acceptance occurred. Changes remain
uncommitted and inactive. Backend/native activation requires a deliberate draft-safe
rebuild/restart. The measured large-record pause and A2 chunked-transfer contract
review remain open; passing this gate does not approve a new transfer protocol.

### A2 transfer-contract checkpoint and follow-on preparation

The framing sources were committed in **`bd4a5d5`** as part of the initial project
commit. “Uncommitted” statements above remain historical gate records. Before this
checkpoint, all **292 tracked files / ten original bundle-map hashes** were frozen
under `/tmp/opencode/wbx-a2-contract-1sqe5lnx/` (`baseline.json`, `before/`).

The proposed [A2 transfer contract](attachment-transfer-design.md) is ready for
review: opt in on existing typed resolve, extend only `body.payload`, and use
receiver-driven pulls with **one credit**, **49,152 decoded-byte chunks**, **at most
123 chunks**, fixed **30-second lifetime**, strict sequence/offset/canonical encoding,
independent sink digest/format checks and completion before visible side effects.
Cancel remains addressed to the original request through descriptor lifetime.
Existing limits, one-fetch behavior, ownership/grant guards and replay stay intact.

The design includes incremental helpers and segmented PNG snapshots/graphics:
another aggregate base64 join, helper JSON or Kitty packet would move the stall.
It adds one temporary selected-representation owner, not a reusable original-byte
cache or second fetch API. Measure total duration/event-loop gaps during
implementation: up to 123 local round trips may trade throughput for shorter turns.

Arithmetic checks nine sizes through 6,000,000 bytes: largest sample chunk envelope
**65,709 bytes** under proposed 69,632 cap; worst valid-kind metadata descriptor
**2,105 bytes**; equivalent inline envelope **8,001,913 bytes** under unchanged
8 MiB ceiling.
This is feasibility, **not implemented-feature or performance evidence**.

[A3/A4/Phase 5 preparation](remaining-work-preparation.md) records source-backed
seams, slices and adversarial acceptance. A3 proposes one revocable typed-open
waiter behind previews, ten-second maximum wait, no fetched bytes/retry/early
physical release; legacy image-only methods keep their busy behavior. A4 follows
proven specialized paths one caller at a time. Phase 5 sequences named options,
pure projections then destination state, cross-language limits, configuration
catalogue and durable docs/performance guidance.

The [verification index](verification-index.md) separates commit status, unchanged
latest runtime gate and this design-only checkpoint. Only documentation changes
belong to this batch. **A2 chunk implementation still requires explicit contract
approval**; A3/A4/Phase 5 are prepared, not executed.

Checkpoint checks passed in a private current-source copy: **89 existing backend/
helper/documentation/harness tests**, **seven Neovim + seven Vim fixtures**, **zero
skips**, and TypeScript. Native fixtures cover framing/protocol, typed and legacy
attachments, image opening/terminal hooks and notifier cancellation. They validate
unchanged seams, **not** proposed chunks or a queue. No new drawn/build/full runtime
gate is claimed; the framing gate above remains the latest applicable full gate.

Finalization passed **three documentation checks / zero skips** and help-tag
generation in both private editors, verifying all **295 current source files**,
all **292 frozen baseline copies** and all **ten original bundle/map hashes**.
Only six documentation paths differ from the initial commit
(three edited, three added); no runtime/test bytes, installed configuration or
sessions changed. Results/manifests are retained with `checkpoint-checks.json` and
`checkpoint-integrity.json`. Work remains uncommitted and inactive.

### A2 approved chunk implementation and focused evidence

The user explicitly approved the transfer contract before runtime edits. All
**295 pre-implementation sources / ten original bundle-map hashes** were frozen
in `/tmp/opencode/wbx-a2-chunks-vs9s978v/`. The new capability and typed resolve
opt-in extend the existing payload only; legacy/typed-inline methods keep their
old shapes. One chosen representation, 49,152-byte decoded chunks, one credit,
contiguous ordering, canonical encoding, sink SHA-256/format checks and explicit
completion are integrated. Request-addressed cancellation survives descriptor
return; physical native/converter/sink admission survives caller revocation.

The output adapter acknowledges each mandatory record only after callback/drain.
Native code yields between pulls/helper ACKs and never joins a giant base64
helper document. PNG snapshot storage/graphics stay segmented; clean snapshot
reopen is still zero-fetch even after disconnect. Original source/output/text
limits, exclusive downloads, annotations/undo/hooks, foreground/actual Vim terminal
leases, read/receipt authority and independent meeting ownership are unchanged.
A3 queueing and A4 shared-helper extraction are not part of this implementation.

Identical new feature fixtures fail **45/45 before / pass 45/45 after**, and both
new native integrations distinguish feature absence. This is feature-absence
evidence, not 45 independently attributed historical bugs. Additional both-editor
fault/lifetime checks cover corrupt digest/sequence/completion, initial resolve
failure, cursor/config revocation, canceled save, hostile disconnect hooks and
a stubborn sink across backend replacement. Neovim's graphics guard executes
49 packets for the synthetic PNG, at most 65,536 payload bytes per scheduled turn,
with no aggregate transmission/join or old-route continuation.

Optional five-sample maximum-original pipeline comparisons show Neovim monitor-gap
medians **267.309 → 15.902 ms**, Vim **1776.623 → 14.897 ms**. Whole-operation medians
are **836.874 → 1618.613 ms** and **2027.271 → 1988.340 ms**, respectively: shorter
pauses are not a blanket throughput win. Each mode retains five GETs; chunks use
615 pulls. All handler hashes match. The
[full distributions/scope](performance.md#a2-chunked-attachment-pipeline) include
native validation/helper/foreground cleanup but exclude live service and graphics.
Fixture-development and abandoned prompt-benchmark results remain retained.

TypeScript and focused backend/helper/native checks pass. Full copied-project
strict integration passed below; changes remain uncommitted and inactive. No root
build, installed configuration, active editor, live OAuth/Webex/receipt/device
action, reconnect or automatic tool installation occurred.

### A2 chunk-transfer full strict offline gate

`/tmp/opencode/wbx-a2-chunks-verification-m64ak5ii/` passed with core concurrency
four, `WBX_STRICT_EDITORS=1`, Neovim 0.12.6 and Vim 9.1 Huge:

- **592 core passes / 12 explicit opt-in skips**, including all 45 new feature/
  helper tests and unchanged framing/typed-inline/output/authority guards.
- **44 Neovim + 43 Vim fixtures / zero editor skips**.
- **31 Neovim + 30 Vim private-PTY drawn fixtures**, including all three new
  chunked attachment/fault/lifetime fixtures in both editors. The separate
  incremental-image fixture remains Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, **three browser-control passes**.
- TypeScript, all five copied builds, documentation and help in both editors
  passed; LazyVim remains **one pass / one optional installed-loader skip**.

All **304 source files** matched source/staged manifests at the passing gate.
Runtime/tests match the final independent regression/benchmark source copy;
all **295 frozen pre-implementation sources** and all **ten original bundle-map
hashes** remain intact. The copied verifier adds only the three new both-editor
drawn fixtures to the existing gates, without changing assertions.

Only evidence/status in this plan, the transfer contract, preparation document
and verification index changed after the gate. Finalization rechecks documentation
and source/build integrity, retaining the exact gate manifest and measured copies.
The first complete implementation gate passed; the earlier unchanged CLI
cancellation exposure is not claimed fixed. Fixture-development and optional
benchmark failures remain separately retained, not relabeled as passes.

A2 is now complete offline, including the measured conditional transfer work.
A3, A4 and Phase 5 remain prepared, not executed. Changes are uncommitted and
inactive. No original build, installed setting, active-editor reload, hot-source,
reconnect, live OAuth/Webex/receipt/device or real desktop/media acceptance occurred.
Activation requires a separate deliberate draft-safe backend rebuild/editor restart.

## Phase 5 — Architecture, readability and durable guidance

### A3 implementation (after the A2 gate)

The user approved the prepared remaining stages. Post-A2 **304 sources / ten
original bundle-map hashes** were frozen in `/tmp/opencode/wbx-a3-7q2u7uf2/`.
Worker-owned admission now retains one revocable typed-open waiter behind a
background preview, with a fixed ten-second deadline, no bytes/GET while waiting
and atomic priority on actual physical settlement. Logical intent cancellation
does not release stubborn native work. Downloads and legacy image-only methods
retain immediate admission/busy behavior. No new wire method/capability is added.

New admission and actual engine/API tests cover settlement, second-waiter refusal,
cancel/expiry/reload/remove/stop, no duplicate GET and noncooperative cleanup.
Both editors' existing drawn-capable chunk fault fixture now also verifies one
preview GET followed by exactly one typed GET, with no probe before release.
TypeScript and focused tests pass. Full copied-project gate is next; A4 and Phase 5
will follow it, not overlap this runtime batch. Original builds/settings/sessions
remain untouched; all changes remain uncommitted/inactive.

A3 full strict gate `/tmp/opencode/wbx-a3-verification-doawubcx/` passed:
**602 core / 12 opt-in skips**, **87 native / zero editor skips**, **61 drawn**,
**95 SDK**, **44 messaging**, **three browser controls**, TypeScript, five copied
builds and both native help checks. LazyVim remains one pass / one optional skip.
All **305 sources** matched manifests; all ten original bundle-map hashes stayed
unchanged. The only post-gate update was this evidence before the A4 freeze.

### A4 narrow local mechanism extraction

Post-A3 **305 sources / ten bundle-map hashes** were frozen under
`/tmp/opencode/wbx-a4-x9jhcckl/`. Shared `local_job.vim` primitives stop a supplied
job, close its stdin or release an already-invalidated exact owner, with no registry,
retry, timers or meeting/notifier teardown policy. `local_terminal.vim` performs
fresh/blank admission, pre/post-option hook/window/changedtick checks, literal argv
launch and binding to the actual returned Vim terminal buffer. Caller-specific
generation, format, save, context and lease policies remain in their original modules.

Attachment callers were migrated and tested first, then image callers, then the
incremental sink's close-input operation. Existing hostile-hook/stubborn-process/
exclusive-file tests are unchanged; 16 focused native fixtures and Node helper
tests pass. New architecture checks lock the narrow seam, not claim old bugs.
Node filesystem helpers remain format-specific because their save/permanence and
phase policies differ; no universal filesystem teardown was extracted.
Full copied-project verification is next, before Phase 5.

A4 full strict gate `/tmp/opencode/wbx-a4-verification-msfknu6r/` passed:
**604 core / 12 opt-in skips**, **87 native / zero editor skips**, **61 drawn**,
**95 SDK**, **44 messaging**, **three browser controls**, TypeScript, five copied
builds and both help checks. LazyVim remains one pass / one optional skip.
All **308 sources** matched manifests; all ten original bundles remained unchanged.

- **R1 — Named intent/options:** replace internal positional startup/navigation
  booleans with named objects; keep compatibility adapters for existing public APIs.
  Make focus, reload and receipt consent explicit and separately test them. Wire
  default-false preview consent remains distinct from native default-on previews.
- **R2 — Narrow modules:** extract pure rooms/history projections and a draft/
  destination controller from `autoload/wbx.vim`, after their behavioral seams are
  tested. Separate read authority, display hints, meeting ownership and transport.
  Do not merge native editor ownership with the standalone terminal UI.
- **R3 — Clear contracts/comments:** distinguish request generation from lease
  generation; rename image-only helpers that now select general messages; use
  unit-bearing decoded-byte/base64-byte/text-line names. Add cross-language maximum
  boundary tests so TypeScript, Vimscript and helper limits cannot drift silently.
- **R4 — Configuration source of truth:** consolidate normalization/forwarding and
  check the documented Lua/Vim option paths. Avoid another hand-maintained whitelist
  mismatch, without conflating native settings with private wire admission.
- **D2 — Current documentation:** keep authoritative option/key/feature tables and
  test them against configuration and the command catalogue. Add a verification
  index identifying latest applicable full/focused evidence, editor skips and live
  acceptance. Preserve honestly labeled historical records rather than rewriting
  their hashes or presenting them as current.
- **D3 — Performance evidence/runbook:** preserve a reproducible, versioned optional
  whole-editor harness and deterministic work guards. Extend `docs/performance.md`
  with sanitized diagnostic counts and distinctions between startup, rendering,
  media, provider latency and delivery. No automatic live profiling or reconnect.

R1/R3 documentation and local adapters can accompany earlier touched code. Larger
R2 extraction follows B1 and proven native view seams. D1 is immediate; D2/D3 evolve
with each batch rather than waiting for an end-of-project documentation rewrite.

### Phase 5 implementation and focused evidence

Post-A4 **308 sources / ten original bundle-map hashes** were frozen under
`/tmp/opencode/wbx-phase5-goong4c2/` before refactoring.

- **R1:** `EditorStartIntent` and the worker's named startup entry retain the public
  positional adapter (including overridden-owner arity). All 32 optional-source
  combinations are table-tested. Native selection has a named private intent behind
  unchanged `wbx#select()` / Lua APIs. Existing navigation/resume/read fixtures retain
  their independent focus, reload and receipt checks.
- **R2:** existing `rooms.vim` owns pure row projection, `history.vim` owns the
  detached body cache, and `drafts.vim` owns destination/reply drafts, pending sends
  and local uncertainty. The coordinator retains protocol/authority, actual native
  writes, hooks, changedtick/ownership checks and delivery dispatch. Disconnect
  invalidates pending send identity, not draft buffers or undo; late ACKs cannot
  clear a new session's draft. No projection becomes receipt or cached membership
  evidence. Existing ownership/replies/annotation/structural/work tests are retained.
- **R3:** the general message selector is named `message_at_cursor`; versioned
  `test/contract-boundaries.json` is consumed independently by TypeScript, native
  protocol/framing and bundled-helper tests. Canonical pad bits, UTF-8 byte/codepoint
  units, exact request/event ceilings, distinct source/PNG/text metadata ceilings,
  chunk totals and selector limits are checked without merging production validators.
- **R4/D2:** one native catalogue records 25 keys/defaults/materialization/categories/
  Lua forwarding eligibility. Optional module defaults are not injected into user
  globals. Actual Lua setup tests retain false values, extension opt-outs, meeting
  merge, download destination and unknown-option behavior. Callback integrations and
  explicit private-wire allowlists remain separate. Current quick references,
  architecture and verification navigation now point at the applicable evidence,
  not historical missing-editor statements.
- **D3:** `scripts/editor-performance.py` plus the synthetic native fixture provide a
  versioned optional private-PTY runbook for 435 rooms / 50/200/500 messages, startup,
  redraw-inclusive distributions and deterministic work guards. Explicit optional
  maximum-original transfer runs retain exact GET/pull/hash checks and timer gaps.
  No live profiling, editor attachment, build, download or timing CI threshold.

Focused TypeScript, Node helper/contract/startup tests and both-editor behavioral/
work fixtures pass. During extraction, Vim exposed its read-only local `count` name;
the new fixture also initially compared JSON booleans to numbers and TS inferred an
unbounded promise-array result. Those failures are retained in the baseline logs;
the variable/type corrections preserve the assertions. Optional matrix and final
copied-project strict gate are recorded next; no commit or activation is implied.

The versioned optional matrix passed at
`/tmp/opencode/wbx-editor-performance-v1-47z2isaw/`: **eight drawn deterministic
guards**, **12 fresh history processes** (both editors, all three sizes, two repeats,
seven samples/operation), plus **20 exact-byte maximum-original opens**. Every mode
retained five GETs and chunks retained 615 pulls. Whole-operation / maximum-monitor-
gap medians were **818.438 / 265.361 ms inline → 1642.356 / 14.300 ms chunks**
in Neovim, **1831.618 / 1612.897 → 2015.462 / 15.921 ms** in Vim. Again, smaller
pauses are not a throughput win. Per-process distributions/work counts, manifests
and all raw synthetic samples are retained; both source/copy integrity checks pass.
The preceding smoke/native-only matrices remain in the baseline logs. This is
current-runtime characterization, not a paired architectural speedup claim.

### Phase 5 full strict offline gate

`/tmp/opencode/wbx-phase5-verification-mntbt1w2/` passed with core concurrency
four, `WBX_STRICT_EDITORS=1`, Neovim 0.12.6 and Vim 9.1 Huge:

- **611 core passes / 12 explicit opt-in skips**; no failures.
- **45 Neovim + 44 Vim native fixtures / zero editor skips**.
- **32 Neovim + 31 Vim private-PTY drawn fixtures**, including contracts in both
  editors. Incremental-image remains Neovim-only, not a no-op Vim pass.
- **95 SDK**, **44 synthetic messaging**, **three browser-control passes**.
- TypeScript, all five copied builds, documentation and both-editor help passed.
  LazyVim remains **one pass / one optional installed-loader skip**.

All **318 source files** matched source/staged manifests at the passing gate;
all **ten original bundle/map hashes** remained unchanged. Frozen pre-A3/A4/Phase 5
copies retain **304 / 305 / 308** exact sources. The optional final benchmark's
runtime/harness match this gate; only two strengthened test files changed between
benchmark and full gate. No runtime or benchmark assertion was weakened.

Only evidence/status in this plan, the preparation record and verification index
changed after the gate. Finalization rechecks docs, frozen source and original
build integrity. A3, A4 and R1–R4/D2/D3 are complete offline; historical gates retain
their original counts, skipped-editor statements and scope. The unchanged CLI
cancellation path passed this gate; its earlier intermittent exposure is not
claimed fixed. Personal Sections/public-source support, progressive startup and
live acceptance remain deferred, not silently implemented.

All work remains **uncommitted and inactive** on `bd4a5d5`. No installed setting,
original build, active editor, live OAuth/Webex/receipt/device state, meeting
owner, remote or grant was changed. No Atlassian upload, tool installation or
automatic opener occurred. Activation/reconnect requires separate deliberate
draft-safe approval; offline completion does not authorize either.

## Deferred decisions, not silent behavior changes

- Progressive startup while optional SDK status initializes is a separate UX/design
  decision: show explicit unknown status with receipts disabled, never invent read
  flags or weaken cached-space membership checks. Measure startup separately first.
- Reducing validation cost must retain strict admission. Prefer fewer redundant
  payloads and bounded transfer/reference contracts before weakening validators.
- Public event/API behavior, new wire capabilities and any changed file-size limit
  require an explicit contract/fallback review, not an incidental refactor.

## Execution and release gates

1. Each ticket gets a reproducing fixture or measured baseline, then a focused fix
   and adversarial regression checks. Do not bundle all phases into one rewrite.
2. Independent tracks may run in parallel: configuration/docs; native rendering;
   backend authority/pressure; explicit media. Assign disjoint files and an
   integration owner; dependency checkpoints above still apply.
3. Compare unchanged updates, ordinary scroll, forced repaint and structural
   replacement at 50/200/500 messages and 435 rooms. Include redraw in state timings.
   Use distributions/call counts and fixed-fixture regression guards rather than
   fragile single-run wall-clock CI thresholds. Preserve the first-pass gains.
4. Run the full offline gate in a copied project after each integrated batch:
   core, Neovim, full Vim when available, SDK-with-network-blocked, synthetic
   messaging/browser controls, drawn fixtures, documentation and build checks.
   Report unavailable editors as skips, never passes.
5. Keep changes uncommitted unless requested. Preserve unrelated/untracked work,
   root build artifacts, installed configuration and the active editor. Native
   activation requires a draft-safe user restart; backend/protocol changes also
   require a deliberate rebuild/restart. Reconnect, live provider, receipt, OAuth,
   device or live-editor acceptance remains separately approval-gated.

**Completed sequence:** A3, A4 and Phase 5 passed the gates above and were included
in follow-on commit `9aeedd8`. The preparation record remains historical.
New work is planned separately in the [messaging feature delivery plan](messaging-feature-plan.md);
no feature implementation, wire mechanism or live activation is approved implicitly.
