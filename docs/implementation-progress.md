# Implementation progress and offline acceptance

**Historical original-roadmap baseline.** The newer grouped-thread, stale-unread
and upcoming-meeting follow-up changes runtime/tests after the stage recorded
here. Its current verification is [tracked separately](thread-cache-meetings-follow-up.md);
the totals and source-integrity statement below apply to the original completion.

Completed source implementation and isolated verification on **2026-11-09** after
approval of [the complete plan](implementation-plan.md). All **29 consolidated
review findings and 6 user requests** have an implementation/evidence entry below.
Presence is the explicitly approved REST-only subset; custom-status text remains
unsupported. Additional optional product proposals remain a separate backlog.

**Not live activated.** No active editor/session reload, real reconnect, post,
read receipt, OAuth flow, physical device/media action, installed configuration
rewrite, dependency install, commit or push occurred for this implementation.
The original checkout's `dist/` fingerprint stayed unchanged. All new build
artifacts were generated and exercised in a staged copy, not substituted into the
running client's paths. Its memory-only drafts remain untouched.

## Coverage and outcomes

| Items | Outcome | Evidence / behavior |
| --- | --- | --- |
| A1 | Implemented; offline validated | All four artifacts rebuild before development launch; build failure cannot start stale code. Fresh/stale private-output and sequencing/cleanup regressions pass. |
| C3, C4, C5, P4, A2, U7 | Implemented; offline validated | Shutdown blocks new mutations; bounded authoritative names survive off-page replacement; exhausted cursors stay exhausted; unchanged messages retain wrapping caches; native config/secret projection preserves private-file/profile checks; preset muted text meets 4.5:1. |
| C2, P3 | Implemented; offline validated and independently reviewed | Actual public pinned-SDK receipt chain has one native transport admission with encryption/preparation retained; rotation, redirects, auth/socket replay fail closed. Deadlines stop the optional worker rather than orphan native operations. Actual-SDK fixtures forbid all socket connections. |
| P2 | Implemented; offline validated | Bounded metadata batching and health deduplication retain periodic heartbeat snapshots. Full reconciliation preempts between individual lookups: 600 virtual seconds of slow/overflow load performs 9 periodic full fetches, recovers overflow after 63.025 seconds, native metadata concurrency 1. |
| C1, C6, U4, U5, P5 | Implemented; offline validated | Hard-stop starts independently of presentation queues; CDP/server/socket cleanup is bounded; browser controls precede videos and never auto-confirm; foreign panes suppress automatic geometry changes; viewers do not eagerly load host/Puppeteer. Tests use mocks and loopback, not browsers/devices. |
| C0, U1, U2, U3, U6, U8, U9, A3, USER1, USER3, USER4, USER6 | Implemented; offline validated | Fold/visibility/known-latest receipt guards, message-ID window anchors, truthful visible status, send guidance, composer-only Tree-sitter, unloaded/hidden annotation protection, stateless ownership/view helpers, remembered geometry, guarded automatic edge paging and conflict-safe configurable `<leader>W` commands. Both editors and private drawn PTYs pass. |
| P1, USER2 | Implemented; offline validated | Incremental message decorations, disjoint writes and independent native/thread folds preserve body text, loaded counts, IDs and per-window choices. Cross-room fold choices do not leak by numerical row. Large structural fold recomputation remains a measured cost, not a claimed constant-time update. |
| D1, D2, D3, D4, D5 | Implemented; offline validated | Focused README, preserved compatibility meeting reference, runtime map, factual capability/prerequisite/security/default corrections, separate historical/current evidence. Local links/anchors, help commands/tags, recipe consistency and the complete requirement ledger pass. |
| USER5 | Approved presence-only scope implemented; offline validated | Default off; approved grants checked before public self/membership/peer reads. Selected-direct snapshots/headers and focus-neutral keyboard-toggle details preserve drafts and user-promoted popup copies. Unknown/stale is not offline; custom text is explicitly unsupported. No scopes or installed configuration were changed. |

## Final integrated verification

Final staged project:
`/tmp/opencode/wbx-roadmap-verification-a08glwhn/project`.
Logs and result summary:
`/tmp/opencode/wbx-roadmap-verification-a08glwhn/`.

| Check | Observed result |
| --- | --- |
| `WBX_STRICT_EDITORS=1 npm run verify:plugin` | Pass: typecheck, fresh build, core tests, both editor suites and static LazyVim consistency |
| Core tests | **320 pass, 0 fail, 10 intentional opt-in skips (330 total)** |
| Required native editor scenarios | **30 pass**, both Neovim and full Vim, no editor skips |
| Real installed lazy.nvim import/setup in isolated config | **2 pass**; not a full LazyVim-distribution/live-session claim |
| `npm run test:messaging` | **44 pass** |
| Read-status suites with pinned SDK enabled | **45 pass**, including socket-forbidden actual-SDK receipt contracts and deterministic fairness/deadline checks |
| Synthetic browser-control checks | **3 pass**, no browser launch or device capture |
| Private interactive PTYs: reading, navigation-plan, UI | **6 editor/fixture runs pass**; includes drawn Vim positive receipt admission to fake RPC only |
| Original checkout `dist/` | SHA-256 fingerprint unchanged before/after verification |
| Post-gate documentation/recipe smoke | 4 pass, 1 deliberate real-loader skip; the real loader already passed separately above |

These suites overlap. Do not add the counts into a unique total. The baseline
gate intentionally skips optional tests; the actual SDK and real-loader checks
were then separately enabled in the isolated stage. Existing browser/media,
Kitty/physical-device and cross-client live suites were **not** newly performed.
All runtime, build and test files match the final verified stage byte-for-byte;
only completion/evidence documentation was changed afterward.

The first provisional stage captured a documentation anchor rename mid-alignment
and failed one link check before reaching editor suites. That was corrected;
the complete gate passed, then passed again after the final cross-room fold-state
regression. The final path above supersedes provisional logs, which are retained
under `/tmp/opencode/wbx-roadmap-verification-qws19yko/` and
`/tmp/opencode/wbx-roadmap-verification-kja0ehg8/` for traceability.

## Performance evidence and remaining cost

Reproducible private fixture: `test/editor/history-benchmark.vim`; nine samples,
Neovim 0.12.6 and full Vim 9.2. These timings exclude actual live service, screen
drawing, terminal transport and physical media behavior.

- At approximately 21,000 rows, an append/edit decorates only **3/21 rows** in the
  measured cases; unchanged projections decorate **zero**. Disjoint root-body and
  reply-preview edits retain intervening Vim text-property ownership.
- Incremental append work measured median/p95 **47.16/49.29 ms** in Neovim and
  **68.86/72.70 ms** in Vim in the recorded fixture.
- Same-shape body-edit fold save/restore improved from median **169.24 to
  10.60 ms** in Neovim and **249.82 to 16.20 ms** in Vim at 21,000 rows.
  These are fold-helper measurements, not end-to-end UI latency.
- Structural fold changes still require native expression recomputation:
  approximately **185 ms Neovim / 263 ms Vim median** in the earlier append
  measurement. No-frame-drop or constant-time large-history claim is made.
- A synthetic 4,096-event/64-room burst performs 64 deduplicated reads and one
  8,375-byte snapshot, not one whole-history publication per event/room.

Benchmark artifacts: `/tmp/opencode/wbx-history-final-xjo4_mm7/result.json`,
`/tmp/opencode/wbx-history-final-f3gk0ypc/result.json`,
`/tmp/opencode/wbx-fold-shape-final-bench-ut4bzjo0/result.json`, and
`/tmp/opencode/wbx-fold-shape-final-bench-etthvvhl/result.json`.

## Live and capability boundaries

- The user explicitly approved **presence-only opt-in implementation**, disabled
  by default. Required grants are `spark:people_read` and, for verified direct
  peer resolution, `spark:memberships_read`, or an applicable approved broader
  grant. Unknown grants do not trigger a probe or reauthorization.
- Presence is a public REST snapshot, subject to organization/privacy restrictions,
  not a real-time subscription. Custom-status text has no documented compatible
  public REST field and is unsupported, not silently inferred or privately fetched.
- Physical media, receipt/post/thread delivery, long-duration/cross-client sync
  and live presence disclosure/freshness remain unaccepted. The earlier approved
  diagnostic reconnect and styling-only observations are accurately retained in
  [the live record](live-acceptance.md), not reclassified as new acceptance.
- No vulnerability-free dependency claim is made; the existing optional legacy
  SDK remains isolated with unchanged dependency pins/lockfile.
- Before any future approved activation, preserve unsent memory-only drafts.
  A fresh editor/backend load is required; never source the main autoload into
  an active session. Building/connecting/receipt or media acceptance remains a
  separate deliberate step, not an automatic continuation of this implementation.
