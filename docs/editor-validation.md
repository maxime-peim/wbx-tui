# Editor migration validation

Automated test evidence here is **local/synthetic**, not a live Webex acceptance
claim. Separate live-session checks comprise one user-approved startup reconnect
with mark-on-open disabled, plus styling-only updates; only aggregate state was
inspected (see below). These checks requested no message or read receipt, and
enabled no meeting transmission or physical device permission.

## Evidence status

Grouped history supersedes the older `G then R` instructions below. Current manual
receipts require `:WebexLatest`, an unfolded/displayed complete endpoint, then R;
see [the current receipt policy](editor.md#recent-spaces-and-webex-unread-status).

This is a **historical evidence record**, not the current checkout test count.
Counts below belong to
their named runs/follow-ups, can overlap and must not be summed as unique tests.
The documentation alignment uses only safe local documentation/source-consistency
checks; no build, application/editor startup, live reconnect or device action.
The coordinator records current-pass implementation and focused evidence in
[implementation progress](implementation-progress.md). The roadmap's integrated
offline gate, both native editors, real lazy.nvim loader and private drawn PTYs
have passed there, including U9/presence-helper follow-ups. This does not activate
or accept the live session. No new suite totals are added to this historical table.

The [implementation plan](implementation-plan.md) records later findings,
including folded receipt visibility/SDK replay, pagination/anchor issues and
optional whole-buffer parser boundaries. Older passing fixtures do not establish
coverage of those newly identified paths. Current source uses composer-only
Tree-sitter, bounded native history syntax, fold-aware known-latest receipts,
one-shot SDK transport and a top-heading unread indicator; historical descriptions
below retain their original presentation/coverage context. Live acceptance has a
[single result table](live-acceptance.md#run-and-record), with the approved narrow
diagnostic/styling observations distinguished from NOT RUN delivery/media tests.

## Recorded environment

- Neovim 0.12.6 and a locally built full Vim 9.2.
- Linux, tmux 3.4, Kitty 0.50.0, and the existing Chromium demo engine.
- Private fixture config directories and tmux sockets; no user config overwritten.

## Historical coverage

The recorded actual-editor runs exercised the areas below across both editors.
Headless and separately opted-in meeting/presentation scenarios changed across
follow-ups; use each run's result rather than a stale aggregate scenario count:

- Native spaces/history/composer windows, distinct custom-filetype buffers,
  normal `FileType` hooks/ftplugins and syntax or installed Tree-sitter.
- Actual keys: j/k and Enter open the highlighted space, i enters native Insert
  composition, history Backspace returns to the open room, and Normal localleader
  explicitly sends. First fill skips the header; passive updates preserve cursor
  position and the conversation marker remains independent of the cursor.
- Successful Enter opens start at the end of chronological history, including
  switching spaces and reopening the same space. Long/multiline histories show
  the latest message; subsequent polls and incoming messages retain a reader's
  scrolled-up view. Canceled, failed and edited-history opens keep their guards.
- Delayed selection/error/stale completions cannot steal focus after leaving the
  origin, including leaving then returning. Edited/promoted/wiped/colliding views
  retain ownership protection. Programmatic selection remains focus-neutral.
- Independent Ctrl+s opt-out preserves native save mappings without disabling
  navigation; the master mapping opt-out and FileType precedence still work.
- Syntax-only UI fixtures distinguish real rooms, help and warnings; preserve
  Markdown, colorscheme changes, standard highlight links and custom overrides.
- Rich reading defaults to native wrap/linebreak and concealed Markdown, with
  FileType and later native overrides preserved. Server Markdown replaces the
  stripped text alternative; metadata-derived message headers and quoted/forwarded
  labels remain distinct from body Markdown headings. Inert HTML conversion is
  separately checked for formatting, quote structure, malformed/deep/oversized
  inputs, active content, safe links and plain-text sending.
- Structural message blocks use native virtual rails, not body prefixes. Reply
  indentation is driven only by validated `parentId`, stays chronological and
  shows honest missing-parent context. Body yanks retain original Markdown;
  isolated body syntax prevents unclosed fences consuming the next sender header.
  The reply fixture checks normal/thread draft isolation, Enter/undo, cancel and
  resume, same-root reply-to-reply, path-like ID collision protection, delayed
  ACKs, edits while pending, promoted drafts, unknown/mismatched-parent delivery,
  legacy-backend refusal and clipping without a read receipt. Switching/canceling
  thread drafts reuses the existing composer rather than accumulating splits.
- Real poll start/completion transitions leave loaded (including empty) history
  unchanged; initial loading/errors remain visible. Appended messages preserve
  the reading viewport, and reordered spaces keep each window's hovered room ID.
- Confirmed server-unread titles use native bold and colorscheme-accent styling, separate from the
  opened-space marker. Server-confirmed read titles return to normal text; only
  the `●` marker retains the open-space accent. Unknown read state is summarized once below the list,
  without per-space suffixes. Metadata-only read-state changes update syntax
  without editing buffer text; colorscheme changes and user overrides survive.
  Successful explicit opens of known-unread spaces at the latest loaded endpoint
  issue one receipt by default; G then R remains available and mark-on-open can
  be disabled. No optimistic clearing, retry after failure/unknown outcome, or
  receipt from polling, canceled/failed/stale opens, edited/empty history or
  focus-neutral selection occurs. A new unread cycle after confirmed read, and
  unread metadata arriving during successful loading, are covered too.
  An independent current-row background persists while browsing other rooms and
  after read confirmation, follows reordering/selection in every window/tab, and
  does not leak into unrelated or renamed buffers. Native splits get one cue;
  cleanup preserves user matches, including reused match IDs.
- Initial unread-enabled startup has an explicit, non-selectable loading row;
  the first populated space list combines REST discovery and SDK read status.
- Window-local statuslines restore on ordinary-buffer switches/native splits,
  without discarding a later user override or changing the global statusline.
- Initial normal/insert `FileType` mappings take precedence over plugin defaults;
  hooks that promote a draft do not receive new send mappings afterward.
- Explicit compose/status commands prefer existing windows across tabs. Draft
  destination/readiness inspection works with the user's statusline preserved;
  loading/empty/error/pagination rows are textual and non-selectable.
- Optional picker/which-key contract fixtures verify selection, missing/broken
  dependency fallback, idempotent setup and disabled-parser behavior. Vim's
  built-in picker is exercised with native input; Neovim uses `vim.ui.select`.
  These fixtures do not claim acceptance against arbitrary installed plugin versions.
- A separate opt-in loader test imports the documented LazyVim spec through an
  already-installed real lazy.nvim in an isolated Neovim config. It checks
  `main`/`opts`, command registration, idle startup and preserved save mappings/
  statusline, then uses j/Enter, history i and Normal localleader to send in the
  local demo. No selection/compose/send commands are required. No full
  LazyVim distribution, user's config, plugin bootstrap or build hook is run.
- Unicode/multiline editing, native undo, independent per-space drafts and
  changedtick-safe send ACKs. The draft has no automatic write/send/persistence.
- Renamed/type-promoted drafts lose sending/ACK-clear ownership without losing
  ordinary-file contents or later user mappings. Native writes never send.
- Edited visible/hidden views survive polling, even when `nofile` leaves the
  native `modified` flag unset. Explicit `:WebexRefresh!` resets only that view;
  edited spaces cannot select a destination.
- Closed/wiped components reopen without replacing unrelated windows. History
  continues updating without spaces; reserved-name collisions are refused.
- Fragmented UTF-8 backend output, invalid-output refusal and Ex-injection
  canaries. Old job callbacks cannot mutate a replacement backend.
- Typed response/notification admission rejects malformed hello/state/delivery/
  meeting data before editor mutation. Invalid/mismatched ACKs synchronously
  retain/block pending drafts; later bytes and old exits cannot release them.
- Identical 500-message projections preserve changedtick, cursor, viewport and
  undo state across displayed tabs. Accepted state hooks still run; edited views,
  shorter histories and explicit view reset retain their safety behavior.
- Unknown delivery and a backend crash retain the draft and block retry across
  backend restarts until explicit resolution.
- Disconnect during a pending POST returns explicit unknown delivery instead of
  leaving editor send admission stuck; the draft remains blocked until checked.
- Real tmux participant/share processes, one media-owner PID, editor terminal
  detach/reopen, side Kitty and return, rapid presentation changes, explicit leave
  and demo controls that never publish media.
- Manually closing/detaching a terminal is respected by late state events;
  readiness notifications do not steal messaging focus. Explicit reattach replaces
  an exited tmux client while retaining the original media owner.
- Backend loss visibly repaints messaging as disconnected and meeting state as
  unknown/last reported. A new call clears previous call events. Private Kitty
  geometry and explicit `WbxMeetingEvent` presentation checks avoid dependence on
  a user's terminal config or clipped pane headers; real per-pane ACKs remain
  required by graphical tests.
- Default exit detaches; opt-in leave-on-exit cancels queued startup and waits
  for the recorded media owner to exit, including the actual `VimLeavePre` hook.
  A disconnected control socket alone is not reported as confirmed termination.
- Real Kitty-acknowledged frames from every participant/share pane after switching
  from the editor. Returning to text rendering keeps all pane processes.
- A custom tmux prefix, status text/colors, pane-border position/format/colors
  are inherited; explicit theme opt-out restores inheritance while retaining a
  later user customization.
- A deliberately failing Kitty executable triggers the configured fallback;
  disabled fallback requires an explicit editor presentation. Pre-broker leave
  targets the recorded owner even if unrelated work is inserted before it, and
  stale metadata cannot reopen a dead owner or replace retained unrelated work.

Backend tests also verify the dedicated entry point does **not** import the
standalone UI, terminal renderer/input or Chromium host; version negotiation,
framing limits, request replay/expiry, secret redaction, canceled local OAuth
without Webex HTTP, and clean stdio shutdown are exercised separately.
Additional tests cover strictly typed operation parameters with zero engine calls
on rejection, exact UTF-8 output budgets (including nested hello histories),
immutable replay snapshots, backpressure, linear-copy viewer packet assembly and
equivalent ANSI cell colors/positions after text-block output compression.

The optional read-status worker has private-IPC, validation, bounded admission,
timeout/crash, shutdown, scope-failure and stale-callback fixtures. An isolated
coordinator fixture tests another client's read receipt and new-message events.
Startup regressions cover REST-first and SDK-first arrivals, initial SDK failure,
REST-only opt-out and disconnect while waiting. The real worker coordinator also
proves its first snapshot does not wait for slow event-listener setup.
Recovery checks isolate inaccessible/missing-date/mismatched room updates, listener
throws/rejections and SDK error events, and temporary full-refresh failure.
Later events and periodic fetches restore authoritative state without another
device registration or any receipt. Both editors verify polling emphasis and
unknown-to-ready recovery without reopening buffers or issuing receipts. Health
and fatal-reason IPC admission reject arbitrary provider error text.
A separate opt-in test loads the actual pinned Node SDK, stubs its conversation
boundary and blocks all network, testing list/get status and an explicit receipt.
It verifies that no meeting plugin is loaded. These checks do not establish live
event-stream or organization-policy acceptance.

## Historical commands and results

Set `WBX_VIM` / `WBX_NVIM` when the editors are not on PATH. An uninstalled Vim
build may need its matching `VIMRUNTIME`; the test runner removes that override
for Neovim. Tests involving windows are opt-in.

| Command | Previously recorded result (not rerun by this documentation pass) |
| --- | --- |
| `npm run check` / `npm run build` | pass |
| `WBX_STRICT_EDITORS=1 npm run verify:plugin` | pass; fresh build, 215 core tests, 24 required headless cases, static LazyVim consistency |
| `npm test` | 215 pass, 9 opt-in skips (224 total) |
| `npm run test:messaging` | 44 pass |
| `WBX_BROWSER_TEST=1 WBX_SDK_TEST=1 npm run test:browser` | 23 pass, including isolated pinned-SDK fixtures |
| `WBX_KITTY_TEST=1 npm run test:kitty` | 6 pass |
| `WBX_STRICT_EDITORS=1 WBX_EDITOR_MEETING_TEST=1 WBX_KITTY_TEST=1 npm run test:editor` | 30 pass, covering actual Vim and Neovim |
| `WBX_LAZY_PATH=/path/to/lazy.nvim npm run test:lazyvim` | 2 pass: example consistency and isolated real-loader demo |
| `WBX_READ_STATUS_SDK_TEST=1 npx tsx --test test/read-status*.test.ts` | 30 pass, including the actual pinned SDK contract with all network blocked |
| `WBX_READ_STATUS_SDK_TEST=1 npx tsx --test test/room-titles.test.ts test/read-status*.test.ts` | 35 pass, including personal/direct-space titles and the expanded pinned-SDK contract |

The polling/unread follow-up reran the strict verifier, all 26 editor scenarios
(including synthetic tmux/Kitty presentation), messaging tests, the real
lazy.nvim loader and the separate Node SDK contract. A copy of the installed,
explicitly approved `read_status=true` LazyVim spec was also exercised in an
isolated local demo; it did not sign in or start the SDK in demo mode. Browser/SDK
and standalone Kitty results above are retained from the preceding engine pass.
The bold-title presentation follow-up reran the strict verifier and real lazy.nvim
loader, plus both editors' styling/activity fixtures, including 500 unread rows,
metadata-only clearing, colorscheme/accent changes and custom highlight overrides.
The initial-unread startup follow-up reran the strict verifier, all 26 editor
scenarios (including synthetic tmux/Kitty), the real lazy.nvim loader and all
18 read-status checks. Live first-load timing remains unverified; no active
editor/backend was restarted or account reconnected for this change.
The vanishing-unread follow-up reran the strict verifier (all 20 headless editor
cases), all 25 read-status checks and both real lazy.nvim checks. The 26-case
graphical/editor result above is retained from the initial-startup pass. Recovery
timers were accelerated only inside isolated fake-SDK children; the production
periodic interval remains 60 seconds plus request time. Live long-duration
recovery remains unverified; the active editor/backend and drafts were untouched.
The chronological-history follow-up reran the strict verifier, all 44 messaging
checks and both real lazy.nvim checks. Backend ordering is checked across initial
history, older pages, polling and out-of-order send acknowledgments. The keyboard
fixture also passed in a private interactive 60×160 full-Vim PTY with
`WBX_EDITOR_SCREEN=1`, verifying last-message visibility on an actually drawn
screen (silent Ex Vim does not populate reliable screen-row information). No
active editor was reloaded or restarted, and no live read receipt was sent.
The rich-reading/mark-on-open follow-up reran the strict verifier, all 28 editor
scenarios (including synthetic tmux/Kitty), all 25 read-status checks and both
real lazy.nvim checks, plus all 44 messaging checks. Six new backend cases cover rich Markdown/HTML admission
and inert rendering; both editors exercise the new reading/receipt behavior.
The root dependency audit after pinning `htmlparser2` 12.0.0 reported zero
vulnerabilities; this does not change the separate optional-SDK audit below.
Forwarding provenance and live cross-client mark-on-open acceptance remain
unverified. No active editor was reloaded or account connected, and all receipt
attempts in the new fixtures were synthetic.
The SDK-startup diagnostic follow-up reran the strict verifier and all 30
read-status checks. New fixtures distinguish SDK construction, SDK readiness,
device registration and initial snapshot failure, with allowlisted problem
classes and no provider error text. The full 28-case graphical/editor result is
retained from the rich-reading pass.

### Personal/direct-space title follow-up

Source inspection found a reproducible SDK 3.13.0 projection defect: it checks
`displayName || computedTitle`, but emits only `displayName`. The isolated adapter
now preserves the server-computed name on returned conversation copies for list
and get. It does not alter SDK caches, last-seen/activity dates, packages, scopes
or request counts. Missing REST titles remain unknown until merged, rather than
manufacturing a fallback that can overwrite a known name. The store uses a
direct-specific fallback only when no authoritative name is available, updates
selected-room metadata by ID and retains newer activity through REST refresh.

The strict verifier passed 215 core tests (9 opt-in skips), 24 headless cases and
static LazyVim consistency. All 44 messaging checks and the combined 35 title/
read-status checks also passed. The actual pinned SDK runs its list/get paths
with all network blocked and conversation I/O stubbed below the title adapter;
it covers direct, personal, explicit and unavailable names, unchanged raw data,
allowlisted IPC projection and the existing receipt contract. Both native editors
verify that a resolved direct-space name preserves current/unread indicators,
focus, viewport, draft changedtick and room binding, without another receipt.

No live session was inspected, restarted or reconnected, and no real message or
receipt was requested. The rebuilt backend will load the fix on its next explicit
restart. Graphical/media and real-loader results in the table are retained from
the message-block/reply pass, not new live acceptance.

### Message blocks and replies

The new strict pass built the backend and passed all 210 core tests (9 opt-in
skips), 24 headless editor cases and static LazyVim consistency. All 44 messaging
checks, all 30 read-status checks (including the pinned SDK with network blocked)
and both real lazy.nvim checks also passed. Seven new backend tests cover parent
metadata admission/normalization, exact threaded POST bodies, matching ACKs,
current-room/root admission, destination-bound replay, uncertainty and capability
advertisement. The HTTP round trip uses only a private loopback server, never
Webex.
The native reply fixture also completes a real editor → compiled RPC →
`EditorEngine` → in-memory demo API round trip, verifying exact plaintext and
parent metadata, ACK clearing and indented history without a live account.

Both editors' reply fixtures also passed in private interactive 60×160 PTYs.
Drawn cells verify structural sender corners versus sender-looking Markdown body
rails, two-column reply indentation, wrapped continuation rails and a visible
reply composer banner. Body yanks and draft text contain no UI decorations.
Neovim's explicit compose path uses native topfill to expose a banner above line
one; background updates never force that view change.
The full editor suite also passed all 30 cases, including synthetic tmux/Kitty
meeting-owner, independent-pane, presentation/fallback and shutdown regressions.

This change did **not** source the main autoload into the active editor, restart
or reconnect its backend, post a live message or request a live receipt. The
running session is intentionally unchanged. Activation needs an explicit editor
restart/reconnect; cross-client threaded delivery remains NOT RUN under the
[separate acceptance plan](live-acceptance.md#optional-threaded-reply-acceptance).

### Read-title styling follow-up

Aggregate-only inspection of the subsequent opened-space complaint found that
server unread state had already cleared and the row was absent from unread
metadata. Its title still used the whole-row `WbxSelected`/`Directory` accent,
making a read space look unread. `WbxSelected` now matches only the `●` marker;
read titles use `WbxRoom`/`Normal`, while server-unread titles retain bold/accent
styling.

Both editors' UI, activity and reading fixtures passed (6/6), followed by the
strict verifier: 203 core tests, 9 opt-in skips, 22 required headless editor cases
and static LazyVim consistency. The reading regression covers a successful
automatic receipt ACK that does not optimistically clear unread, delayed server
confirmation restoring normal title styling, unchanged text/viewport and renewed
unread emphasis for later incoming activity without another automatic receipt.

The two room syntax definitions were applied to the running editor without
sourcing the main autoload, restarting or reconnecting. Aggregate verification
confirmed `serverUnread=false`, `titleGroup=WbxRoom`, `titleStyle=Normal`,
`markerGroup=WbxSelected` and 7 remaining unread rows. Backend revision, spaces
text, draft changedticks, focus and viewport were unchanged. No live message or
read receipt was requested; this verifies presentation of an already-confirmed
read state, not live receipt delivery or cross-client acceptance.

### Current-space indicator follow-up

The marker-only fix left `●` present but removed the stronger row-level cue.
The open space now also has a native `WbxCurrent` background match, independent
of the browsing cursor and read state. Its default borrows only the colorscheme
background, not foreground/bold; unread titles remain bold/accent-colored and
read titles retain normal text color. Unread syntax now contains `WbxSelected`
so it cannot mask the marker's separate accent.

The strict verifier passed again (203 core tests, 9 opt-in skips, 22 headless
editor cases and static LazyVim consistency). Both editors' UI fixtures also ran
in private interactive 60×160 PTYs with `WBX_EDITOR_SCREEN=1`. Drawn-cell attribute
comparisons verify combined current-background/unread styling and normal read
text retaining the current background after confirmation, not just syntax IDs.

The small rooms autoload was reloaded live, without sourcing the main autoload,
restarting, reconnecting, changing selection or requesting a receipt. Aggregate
verification found exactly one current-row match in the visible spaces window,
background `#252530`, no current-cue foreground/bold, `WbxSelected` on the marker
and `WbxRoom` on the read title. Backend revision, unread rows, spaces text,
draft changedticks, focus and all inspected viewports were unchanged.

### Authorized startup diagnostic

Read-only aggregate inspection found a failed SDK startup, not an automatic
receipt or colorscheme problem. With the user's explicit approval, one controlled
backend reconnect was performed after adding precise startup diagnostic codes.
Mark-on-open was temporarily disabled; no space was selected and no message or
receipt was requested. The reconnect restored known server read status and
correct accent/bold unread-row syntax. Draft changedticks and focus were unchanged,
and the original mark-on-open preference was restored afterward.

The original startup failure did **not** recur, so its specific cause remains
unknown. This is evidence of restored operation in that session, not a permanent
fix or long-duration/cross-client acceptance claim. No OAuth scope, SDK package,
private configuration, auth/encryption policy or telemetry behavior was changed.

Optional SDK dependency audit (2026-11-09): **0 high, 0 critical, 38 moderate**
after pinning the compatible `form-data` 2.5.6 security patch. Moderate legacy
advisories remain; the SDK's independent lockfile is not part of the mandatory
REST-client dependency tree. This is not a vulnerability-free dependency claim.

The strict baseline verifier was also run with graphical/media opt-in variables
set in its parent environment: it disabled them rather than starting those suites.
Missing/limited-editor strict failures and pre-tmux admission are regression-tested.
See [the improvement review](improvement-review.md) for component measurements,
trade-offs and deferred work; none of those microbenchmarks is a live FPS claim.

Pinned SDK 3.13.0 loads, messaging plugin interfaces and credential refresh were
exercised in real Chromium with synthetic credentials and stubbed HTTP. All
non-loopback browser requests were blocked. This is not a real-service SDK join,
actual account/organization-policy or two-endpoint interoperability check; those
remain **unverified** and require [authorized live acceptance](live-acceptance.md).
At that stage, messaging and media had separate in-memory OAuth sessions; the
later [shared-login follow-up](shared-meeting-auth.md) supersedes that behavior.
Attachments,
dedicated thread panes, reactions, edits/deletes, new conversations and public in-meeting chat
are outside that recorded baseline. Native thread-bound replies are supported;
dedicated thread panes are not. The new key/fold/automatic-paging/presence work is
not accepted by any of these historical results.

## Visual evidence

Real editor windows (not the legacy emulated TUI) were captured locally in Kitty:

- `/tmp/opencode/wbx-plugin-neovim.png` — Neovim, its built-in `habamax` colorscheme.
- `/tmp/opencode/wbx-plugin-vim.png` — full Vim, its built-in `desert` colorscheme.

Both show native splits and an **unsent** Unicode draft. Vim's rendering of a
complex ZWJ emoji differs from Neovim's; the test verifies that its underlying
Unicode text survives editing and delivery unchanged. Font/grapheme display is
the editor's behavior, not a custom text editor inside the plugin.

`test/editor/showcase.vim` is the synthetic interactive capture fixture. Captures
predate the improvement-review pass and are session-local evidence, not installed
plugin assets or a live UI guarantee.
