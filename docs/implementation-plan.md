# Correctness, usability and maintainability implementation plan

Status: **implemented and offline-validated; not live-activated**. Prepared 2026-11-09 from the seven-agent
review, coordinator reproductions, and the user's six additional requests.

Execution evidence and outstanding gates: [implementation progress](implementation-progress.md).

The later approved grouped-thread, stale-cache and imminent-meeting requests
supersede this original plan's global-chronology/body-only-fold/top-health choices.
They have a separate [follow-up ledger](thread-cache-meetings-follow-up.md) and
must not inherit the original roadmap's passing test counts.

This is one integrated backlog: **29 consolidated review findings and 6 user
requests**. The coverage ledger below assigns every item to a delivery phase.
Additional product suggestions are listed separately, not silently treated as
authorized implementation scope.

## Principles and boundaries

- Fix safety and data-integrity prerequisites before building features on them.
- Preserve native editing, undo, hooks, mappings, colorschemes and unrelated work.
- Keep explicit sends. Enter and writes never send; uncertain delivery blocks
  further sends to the room; mutating requests are never automatically replayed.
- Keep normal and thread drafts separately destination-bound. Folding, paging,
  resizing and background updates must not change their text or ownership.
- Unknown presence/read/media status is not offline/read/stopped. Display only
  confirmed activity, and distinguish stale observations from current state.
- Preserve chronological main history, focus-neutral background updates,
  independent meeting ownership, inherited tmux styling and detach by default.
- Keep conventional Vim runtime directories at the project root. Prefer small
  extractions over bulk moves, renames or a frontend rewrite.
- Do not silently add scopes, dependencies, persistent private data or accounts.
- Implementation and offline testing do not authorize live activation. No active
  editor reload, reconnect, real post/receipt, OAuth flow, media/device acceptance
  or installed configuration change without the corresponding explicit approval.

## Phase 0 — Regressions and evidence

**Purpose:** make the review actionable without confusing static risks with
executed failures.

- Add isolated regressions for the confirmed off-page title loss, exhausted
  pagination revival, shutdown-admission race, folded-endpoint receipt,
  message-anchor displacement, unloaded view and optional parser-boundary bugs.
- Promote the receipt replay reproduction into a network-blocked fixture below
  `acknowledge`, retaining the real public SDK acknowledgement/submission chain.
- Reproduce conditional socket and teardown risks with bounded local mocks or
  loopback harnesses; never depend on real browser/device capture.
- Record baseline rendering, event-burst, wrapping and viewer-import measurements
  with executable fixtures and environment details. Timings are synthetic, not
  claims about live service latency or GPU/terminal throughput.
- Cover existing behavior before extracting ownership/configuration code.

**Exit:** every bug has a failing regression or a documented, bounded failure-path
test. A static concern is not relabeled as reproduced without new evidence.

## Phase 1 — Receipts, admission and bounded teardown

**Covers:** C0, C1, C2, C3, C6, P3.

1. **Displayed endpoint policy.** Check that the newest message endpoint is
   genuinely displayed, including closed-fold visibility, before automatic
   acknowledgement. Apply the same policy to the manual path. Do not forcibly
   open folds or reset users' folding settings. Retain cancellation, clipping,
   edited-buffer and failed/unknown-attempt deduplication guards.
2. **One-shot receipt transport.** Enforce the no-replay boundary below the SDK's
   key-rotation/redirect retry behavior using the local compatibility adapter,
   not edits to `node_modules`. Test key-rotation branches, redirects, failure and
   uncertain outcomes. One admitted receipt may issue at most one mutating
   submission; failure cannot trigger a detached follow-up submission.
3. **Shutdown admission barrier.** After valid shutdown admission, reject new
   mutations synchronously, before awaiting meeting leave. Preserve the final
   response, concurrent-close idempotence and default detach semantics.
4. **Independent owner teardown.** Start bounded browser/owner shutdown without
   waiting for presentation/visibility queues. Bound CDP operations, invalidate
   stale transitions and ensure earlier cleanup failures cannot skip hard stop.
5. **Socket cleanup.** Destroy rejected upgrade sockets, track outstanding raw
   sockets and bound HTTP-server closure. Do not stop at closing browser media
   while leaving terminal restoration/profile cleanup indefinitely pending.
6. **SDK timeout admission.** Distinguish a deadline from a settled inaccessible
   room. On deadline, stop the optional worker or retain admission until the
   original native request settles; never accumulate abandoned native requests.

**Acceptance:** deferred leave cannot admit a new start/send; a never-settling
presentation operation cannot delay the owner hard-stop deadline; rejected raw
connections cannot hang cleanup; SDK timeouts keep native concurrency bounded;
folded or incomplete newest endpoints issue no receipt. All tests use mocks or
isolated local harnesses.

## Phase 2 — Stable layout, metadata and automatic pagination

**Depends on:** safety guards from phase 1.
**Covers:** C4, C5, U1, U9; USER1, USER3, USER4.

### Geometry

- Set initial sidebar/composer sizes to the existing 30 columns / 8 lines, then
  preserve manual adjustments using owned, window-local geometry state.
- Protect the sidebar width and composer height against external equalization
  such as LazyVim's `VimResized` → `tabdo wincmd =`, without disabling that
  behavior globally or imposing settings on unrelated windows.
- Treat defaults as initial values, not dimensions reapplied on every event.
  Clamp gracefully on small terminals; restore preferred sizes when space returns.
- Add an explicit layout-reset command. Closing/recreating an owned pane should
  not reset every surviving pane or move the current reader.

### Store and reader identity

- Keep a bounded authoritative room-name/activity cache independently of REST
  page membership; blank SDK reintroduction must not erase off-page names.
- Track history pagination initialization, active cursor and exhaustion
  separately. Latest-page polls must never resurrect exhausted cursors.
- Anchor each history window to message ID plus intra-message cursor/viewport
  offsets, including folds and wrapped lines where supported. Restore identity
  across prepends and oldest-message eviction, not just numerical line numbers.
- Distinguish unloaded owned projections from genuinely edited/promoted buffers;
  safely rebuild previously unchanged history on explicit reopen.

### Automatic loading

- Spaces: request the next page when deliberate user navigation reaches roughly
  five remaining room rows, not only through `j/k` but also viewport scrolling.
- History: request older messages when deliberate scrolling approaches the first
  loaded message, preserving the visible anchor after insertion.
- Use one in-flight request per relevant dataset, cursor deduplication,
  generation checks and edge hysteresis. Ignore plugin-induced cursor/view
  restoration; initial rendering must not drain every available page.
- Show loading, exhausted, error and memory-limit states. Errors require an
  explicit retry rather than a request storm. Retain manual commands.
- Preserve bounded memory/rendering. Never silently evict a visible anchor or
  treat a clipped/older window as the current newest endpoint. Retain an explicit
  known-latest endpoint; an explicit return-to-latest may refetch the latest page.
- Stop clearly at a configured bound rather than offering pagination that cannot
  progress. Do not expand the existing limits without memory/render benchmarks.
- Preloading, pagination, filtering and background polling never acknowledge
  messages or send drafts.

**Acceptance:** shrink/grow and external equalization preserve preferred geometry;
manual resizing remains native; multiwindow readers keep the same message;
off-page names survive refresh; unload/reopen works; exhausted/error cursors do
not loop; paging remains bounded and issues no send/receipt. Exercise keyboard,
mouse/viewport scrolling, search, room switches and delayed responses.

## Phase 3 — Rendering and transport performance

**Depends on:** stable message identities from phase 2.
**Covers:** P1, P2, P4, P5, U8.

- Replace whole-history decoration rebuilding with changed-message/range updates.
  Precompute reply-row membership; retain unchanged syntax/decorations and avoid
  replacing all buffer lines for a single appended/edited block where possible.
- Keep history on independently bounded native Markdown syntax until a correctly
  bounded per-message Tree-sitter integration exists. Composer Tree-sitter can
  remain ordinary whole-buffer parsing. One unclosed fence must not affect the
  next message with integrations enabled.
- Batch optional SDK metadata changes on a short, bounded publication interval;
  publish health only when it changes. Keep delivery/uncertainty notifications
  immediate and generation-safe. Measure whether metadata-only notifications
  are needed before expanding the RPC protocol; retain a coherent full snapshot.
- Preserve messages-array/cache identity when display content is unchanged so
  the compatibility TUI does not rewrap every poll.
- Load Puppeteer only in browser-owning paths; read-only viewers must not import
  Chromium ownership infrastructure. Protect this with dependency-boundary tests.

**Acceptance:** a one-message change does not recreate every loaded decoration;
unchanged polls retain wrapping/decorating fast paths; 64-room event bursts have
bounded publication/work; independent Markdown contexts hold with installed
parsers; viewer dependency tests exclude Puppeteer. Re-run comparable 1,500-row
and approximately 21,000-row benchmarks in both editors where available, and
report median/p95 work and output volume without presenting them as live FPS.

## Phase 4 — Native message and thread folding

**Depends on:** phases 1–3.
**Covers:** USER2.

- Define native message-body folds with stable message-ID-backed state; keep
  headers/snippets visible. Start open unless the user's folding preferences
  specify otherwise. Respect existing filetype hooks and provide an opt-out.
- Preserve native `za`, `zo` and `zc`; provide a thread action to collapse/expand
  the root and its loaded reply bodies together, in their chronological places.
- Show honest root summaries such as `4 loaded replies`; distinguish missing
  parents and unavailable totals. Folding is presentation, not altered body text.
- Never fold an entire root-to-last-reply span if it contains unrelated messages.
  A compact dedicated thread-focus view is an optional follow-up decision, not a
  prerequisite or an excuse to reorder the main timeline.
- Keep drafts, reply-to-root targeting, yanks, navigation, per-message Markdown
  boundaries and fold-aware receipt exclusions intact across updates/pagination.

**Acceptance:** interleaved threads can be collapsed without hiding unrelated
messages; fold choices survive new messages and pagination; root counts do not
claim unloaded replies; hidden newest endpoints issue no acknowledgement.

## Phase 5 — Visible status, controls and the `<leader>W` command family

**Covers:** U2, U3, U4, U5, U6, U7; USER6.

- Put one aggregate unread-sync health indicator in the visible spaces heading.
  Preserve normal read titles, bold/accent unread titles, current background and
  marker; do not add per-room unread/unknown suffixes.
- Render meeting receiving, local preview, actual sending, pending confirmation,
  failure reasons and stale/disconnected observations distinctly. Inactive source
  labels must not claim transmission.
- Place browser confirmation/stop controls before long video content or keep
  them visibly reachable. Reveal/focus an armed confirmation without activating
  it; preserve trusted browser clicks and initially disabled transmission.
- Suppress automatic whole-window tmux tiling when foreign panes are present, or
  arrange only a verified owned region. Never retag, move or resize unrelated work
  as a side effect of participant/share arrival.
- Add a short non-sendable composer/context hint showing the effective send
  binding and help. Do not replace a user's statusline or put guidance in draft
  text. Improve optional preset muted-text contrast; leave user highlights alone.
- Register a configurable `<leader>W` namespace in Vim and Neovim when mappings
  are enabled; do not overwrite existing maps or change the installed config.
  Surface skipped conflicts through help/health, and retain current local aliases.

Proposed defaults:

| Key after `<leader>W` | Action |
| --- | --- |
| `w` | Open workspace |
| `s` | Pick space |
| `c` | Compose |
| `r` / `R` | Reply / cancel reply, retaining drafts |
| `t` | Toggle loaded thread folds |
| `S` | Explicit send, admitted only from a valid composer |
| `f` | Refresh |
| `l` | Layout actions, including explicit reset |
| `d` | Disconnect messaging, retaining drafts |
| `m…` | Meeting subgroup: join, status, presentation, detach, explicit leave/media controls |
| `?` | Contextual actions/help with effective bindings |

The thread-focus mapping suggested earlier is intentionally not promised here:
`Wt` serves the required folding feature until a separate focused view is agreed.

**Acceptance:** health/error state is visible with 500 spaces; inactive media does
not look active; confirmation/stop controls remain reachable at small viewports;
foreign tmux pane geometry is untouched; which-key and plain Vim help agree with
installed mappings; mapping conflicts are preserved; Enter/write never send.

## Phase 6 — People presence and status

**Covers:** USER5. **Capability/API validation gate required.**

Decision recorded: the user approved the supported **presence-only, default-off**
integration. Custom-status text is explicitly unsupported by this REST provider;
no private-provider substitution, scope/configuration change or live lookup was
authorized/performed by that decision.

- Interpret the request as people presence and custom status, not per-message
  read receipts or typing indicators. Start with direct-chat headers and an
  explicit people-details action rather than decorating every message/list row.
- Verify supported Webex APIs/SDK fields, organization policy, required grants,
  freshness and rate limits against public documentation and offline fixtures.
  Implementation must not guess availability from activity or author identity.
- Use an isolated provider boundary with explicit `unknown`, unavailable and
  stale states. Add text labels alongside color; do not map unknown to offline.
- Bound caches, subscriptions and fetch concurrency to relevant people; prioritize
  the active conversation and stop work on disconnect. Do not enumerate an entire
  organization or add uncontrolled per-message lookups.
- If an additional scope/provider is necessary, present the exact requirement
  and obtain approval before changing authorization/configuration. Do not silently
  substitute an unsupported/private mechanism.
- No status-editing, automatic DND changes or profile mutation is included.

**Acceptance:** offline fixtures cover supported states, custom text, denial,
missing identity, stale/unknown data, throttling and cleanup. If the authorized
API cannot provide the feature, record the precise blocker and an explicit user
decision; do not mark presence implemented or quietly remove it from the plan.
Live freshness/interoperability remains a separately authorized acceptance step.

## Phase 7 — Narrow architecture cleanup and consolidated documentation

**Covers:** A1, A2, A3, D1, D2, D3, D4, D5.
Documentation changes also accompany each earlier phase; this is the final
coherence pass, not permission to leave newly changed behavior undocumented.

- Make development mode rebuild/synchronize all artifacts used by spawned owners
  and browser workers. Test startup from a clean checkout and stale-artifact
  detection; document the real execution model.
- Share the bounded, permission-checked config document reader but project only
  relevant runtime settings. Invalid compatibility-only layouts/maps should not
  block native editor OAuth; full compatibility validation and private-file/
  expected-profile checks remain strict.
- Extract owned-buffer/window checks and write/view primitives behind small
  internal interfaces. Keep one session/draft state owner and the public `wbx#`
  API; do not duplicate ownership registries or perform bulk directory moves.
- Document runtime entrypoints/import boundaries and supported compatibility
  clients. Do not delete modules merely because they are outside the primary UI.
- Rewrite the README navigation around primary install, safe demo, essential
  commands, live prerequisites and honest limits. Link separate user,
  compatibility, protocol/developer and validation references.
- Correct thread-support versus dedicated-pane claims, trusted-init versus plugin
  installation claims, inherited versus opt-in themed tmux styling, live browser
  SDK versus messaging prerequisites, and stale coverage counts.
- Reconcile the recorded approved diagnostic reconnect/styling observations with
  acceptance-plan wording. Preserve NOT RUN for unperformed live post/receipt/
  thread/media tests; never convert synthetic evidence into live acceptance.
- Keep examples, Vim help, which-key descriptions, configuration reference and
  effective default maps consistent. Add automated checks where drift is easy to
  detect; separate current summaries from historical test records.

**Acceptance:** source/built development paths agree; runtime configuration
isolation is tested; ownership safeguards survive extraction; dependency/import
checks stay clean; links/help tags/examples resolve; a new user can identify the
correct prerequisites and supported capabilities without reading compatibility
history. No claimed validation exceeds actual evidence.

## Coverage ledger

IDs match the consolidated audit, except USER1–USER6, which track the user's list.

| ID | Finding/request | Phase |
| --- | --- | --- |
| C0 | Folded newest endpoint can be acknowledged | 1 |
| C1 | Presentation queue delays media-owner hard stop | 1 |
| C2 | SDK-internal receipt POST replay | 1 |
| C3 | Mutation admission during shutdown | 1 |
| C4 | Off-page direct-room name regression | 2 |
| C5 | Exhausted history cursor revived by polling | 2 |
| C6 | Rejected raw upgrade socket can hang cleanup | 1 |
| U1 | Reader message identity shifts on prepend/eviction | 2 |
| U2 | Misleading/incomplete native meeting status | 5 |
| U3 | Unread failure explanation outside visible list | 5 |
| U4 | Browser confirmation/stop controls below videos | 5 |
| U5 | Automatic tiling rearranges foreign tmux panes | 5 |
| U6 | Explicit-send guidance absent at landing point | 5 |
| U7 | Optional muted-text contrast | 5 |
| U8 | Tree-sitter crosses message Markdown boundaries | 3 |
| U9 | Unloaded unchanged history treated as editing | 2 |
| P1 | Whole-history decoration rebuild | 3 |
| P2 | Metadata events amplify into full-history updates | 3 |
| P3 | Timed-out native SDK operations accumulate | 1 |
| P4 | Compatibility wrapping cache invalidated on unchanged polls | 3 |
| P5 | Read-only viewers eagerly import Puppeteer | 3 |
| A1 | Development mixes source and stale compiled workers | 7 |
| A2 | Native startup coupled to compatibility configuration | 7 |
| A3 | Ownership/write logic mixed with orchestration | 7 |
| D1 | Contradictory threads/trusted-extension capability summaries | 7 |
| D2 | Missing/misplaced live prerequisites | 7 |
| D3 | Inconsistent record of authorized live observations | 7 |
| D4 | Drifted defaults and current coverage counts | 7 |
| D5 | README/navigation/architecture hierarchy | 7 |
| USER1 | Resize preserves usable, manually adjusted layout | 2 |
| USER2 | Message/thread folding | 4 |
| USER3 | Automatic space pagination near list end | 2 |
| USER4 | Automatic older-history pagination near top | 2 |
| USER5 | People presence/custom status | 6 |
| USER6 | Default configurable `<leader>W` command family | 5 |

## Verification and delivery rules

- Deliver small, independently reviewable patches, with a regression and docs for
  each behavior change. Do not mix broad refactors with feature/transport fixes.
- Re-run type/build/core checks and strict Vim/Neovim fixtures after affected
  phases. Exercise optional integrations through real installed loaders/parsers
  in isolated configurations, not the active editor.
- Use private fake backends, network-blocked actual-SDK fixtures, in-memory
  process/media objects, isolated tmux servers and synthetic rendering checks.
- Add compatibility-TUI cache and viewer-import checks; benchmark changed as well
  as unchanged histories, event bursts and never-settling native operations.
- Re-check no focus/viewport/draft/undo changes from background work, no accidental
  sends/receipts, no foreign-window/pane mutations and no credentials in outputs.
- Keep a single source-of-truth acceptance table with pass/fail/not-run and actual
  command/environment evidence; do not add overlapping suite counts as unique
  tests or claim historical results were rerun.
- Record implementation complete, offline validated and live accepted separately.
  Before any approved restart, explicitly preserve memory-only drafts. Never
  source the main autoload into an active session.
- No commits, pushes, installs or installed configuration rewrites are implied by
  this planning document. Live activation and acceptance require separate approval.

## Optional product proposals, separately tracked

These are useful follow-ups, not prerequisites for resolving the 35 core items:

- A scrolled-up new-message counter and explicit jump-to-latest affordance.
- A compact persistent space/destination/delivery context header (the required
  sync-health and composer hints are already in phase 5).
- Optional next/previous-message and jump-to-parent navigation.
- Unread/direct quick filters that do not mutate server read state.
- A dedicated compact thread-focus view, without reordering the main timeline.
- Opt-in private local draft recovery, with an explicit retention/security design
  and no automatic sending. Persistence remains off until deliberately enabled.

## First implementation slice

Start with phase-0 regressions and the phase-1 receipt/shutdown/teardown boundaries.
Then deliver phase 2 as the first user-visible bundle: stable resize behavior,
off-page name retention, reliable reopen, message anchoring and automatic paging.
Advance the independent command-menu work from phase 5 when convenient, without
blocking the safety fixes or bundling unrelated refactoring into that patch.
