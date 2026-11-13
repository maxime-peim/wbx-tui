# Organization, performance and native-editor UX review

This historical pass used three independent reviews (architecture, performance
and UX), followed by scoped implementation and shared regression checks. The native
Vim/Neovim plugin remains the primary interface; the existing Node/Webex media
engine and compatibility clients are not replaced.

This is the record of that pass, not the current implementation status. Preserve
its measurements and run-specific observations as historical evidence. The later
[implementation plan](implementation-plan.md) tracks newly found gaps and planned
key/fold/pagination/presence changes; the [source map](architecture.md) describes
the four runtime entrypoints. No measurements or tests here were rerun for the
documentation reorganization. Approved narrow live diagnostics/styling are
distinguished from NOT RUN live delivery/media tests in
[the acceptance record](live-acceptance.md).

Grouped history supersedes the old `G then R` recipe below: use `:WebexLatest`,
unfold/display the complete endpoint, then explicitly request a receipt. See
[current receipt guidance](editor.md#recent-spaces-and-webex-unread-status).

## Decisions

Prioritize observed correctness defects and measured hot paths over a broad
rewrite. Preserve the full Vim baseline, native undo/mappings/hooks, destination-
bound drafts, explicit-only sending, no automatic POST retries, and user-owned
buffers/windows. Meetings retain one media owner, independent tmux panes, inherited
styling and detach-by-default lifetime. No live account or device acceptance is
part of this work.

| Area | Improvement | Boundary |
| --- | --- | --- |
| RPC admission | Strict, typed operation parsing instead of coercing enum parameters | `src/editor-protocol.ts` / `src/editor-worker.ts` |
| Editor input | Validate backend payloads before mutation; reject mismatched ACKs without releasing send admission | `autoload/wbx/protocol.vim` / `autoload/wbx/transport.vim` |
| Editor output | Encode a bounded newest-history suffix without cloning or repeatedly serializing oversized snapshots, including nested hello state | `src/editor-output.ts` |
| Viewer transport | Incremental fixed-header/bounded-body assembly; each incoming byte copied once | `src/viewer-framing.ts` |
| Native workflows | Preserve FileType mappings, truthful disconnect/uncertainty states, tab-aware explicit focus and textual loading/pagination guidance | `autoload/wbx.vim` / `lua/wbx-tui/` |
| Native rendering | Skip identical view writes after ownership/dirty checks; preserve hooks, cursor, viewport and undo state | `autoload/wbx.vim` |
| Text-block video | Avoid repeating unchanged ANSI colors within a row | `src/render.ts` |
| Verification | Build before editor integration tests, share runner behavior and provide a strict both-editors gate | `scripts/verify-plugin.ts` / `test/editor/helpers.ts` |

These modules isolate wire admission, output budgeting and packet assembly from
the stateful controllers. They do not expose credentials or introduce mandatory
editor plugins. The larger ownership/layout coordinator is intentionally not
split wholesale during behavioral changes.

## Keyboard-first space navigation

The follow-up UX/UI review corrects an important mistake in the original LazyVim
recipe: disabling every buffer mapping just to preserve Ctrl+s made normal space
selection command-driven. Navigation and that optional send binding are separate
now: use `mappings = true` with `send_with_ctrl_s = false` in LazyVim.

- Navigate the native spaces list with j/k or `/` and open with Enter, like a file.
- Successful explicit opens start at the end of chronological history (oldest
  above, newest below), including reopening the same space. Polls and incoming
  messages preserve a reader's scrolled-up viewport. Delayed/canceled/failed
  opens retain their focus guards; native hooks and edited views remain in charge.
- Read in history with persistent key hints; i starts composing, and Backspace
  returns to the open room's row. Passive updates preserve the browsing cursor.
- In a draft, Enter remains a newline. Esc then Normal-mode `<localleader>s` is
  the separate explicit send gesture; writing never sends.
- Preserve existing FileType maps and ordinary editor bindings. Picker commands
  remain optional alternatives, not prerequisites for navigation.
- Style real room rows separately from help/loading rows, keep the textual open-
  conversation marker independent of cursor position, and use standard highlight
  groups so colorschemes and user overrides remain in charge.

The UI syntax checks run in both Vim and Neovim without loading a backend.
Long-history keyboard checks exercise opening, switching and reopening, as well
as scrolled-up polling. Backend ordering tests cover initial history, older pages,
poll updates and out-of-order send acknowledgments.

## Poll stability, recent spaces and server unread state

The live-usage follow-up reproduced a missed case: every four-second history poll
sets `loading=true` and then `false`, which inserted/removed a two-line loading
row above all messages. Identical-state tests alone did not catch that. Loaded
history now renders identically during successful unchanged polls; state hooks
still receive both transitions. Actual changed view writes preserve each native
window's view, while room reordering anchors the cursor by room ID.

REST room requests explicitly ask for `sortBy=lastactivity`; loaded spaces sort
stably by validated timestamps and update from received history/send ACKs. Unread
state is not guessed from REST timestamps: an optional, separately installed Node
SDK worker reads actual server last-seen activity and listens for message/read
events. SDK failure means unknown. Successful explicit opening of an unread space
now sends one receipt at the latest loaded endpoint (opt out with
`mark_read_on_open=false`); G then R remains the manual alternative. Polling never
changes server read state. Optional dependencies, credentials,
SDK logs and shutdown are isolated from editor stdio and the media owner.

Synthetic checks cover poll start/completion, appended messages, multiple-window
viewports, reordered rooms, explicit receipt admission, SDK event reconciliation,
worker timeout/crash and the actual pinned SDK contract with all network blocked.
No live account, read receipt or cross-client acceptance was exercised.

The presentation follow-up removes per-room status suffixes: confirmed unread
titles use native bold plus the colorscheme's `Special` accent by default, while unknown status appears once below the
list. Row metadata drives syntax independently of title text; read receipts can
clear emphasis without changing the buffer's changedtick or viewport. Default
styling follows colorscheme changes and respects user highlight overrides. Health
inspection exposes the safe sync state/notice without starting a connection.

Initial unread discovery is coordinated with REST room discovery: the first
populated space list carries its server read state instead of briefly looking
read. The SDK fetch runs alongside event-listener setup, not after three serial
subscriptions. Reconciliation after subscription setup covers the startup gap.
Deterministic fixtures cover REST-first and SDK-first arrivals, slow listeners,
SDK failure, opt-out and disconnect during the initial loading gate.

The vanishing-unread follow-up confirmed a failed sync state in the running
editor through read-only aggregate inspection. The old generic notice did not
record the immediate trigger. Expected background failures no longer kill the
whole worker: failed/incomplete per-room lookups invalidate only that room;
listener failure falls back to periodic server discovery; failed reconciliation
invalidates stale certainty and recovers on a later successful read-only fetch.
No receipt, device registration or OAuth grant is replayed by this recovery.
Fatal IPC/runtime failures remain fail-closed with an allowlisted health reason.
Synthetic regressions cover these paths, later valid events and recovery styling
in both editors; this does not establish live long-duration acceptance.

## Personal/direct-space names

The personal-space title follow-up found the pinned SDK discarding its own
server-computed title whenever `displayName` was absent. A local adapter preserves
`computedTitle` on returned copies before the SDK's list/get conversion, without
modifying cached conversations, read dates, dependency pins or request counts.
Missing REST titles no longer manufacture a value that can overwrite a known
peer name; shared metadata merging retains names and newer activity while
updating selected-room labels by immutable ID. Unknown direct names use the
honest `Direct conversation` fallback, never a guessed message-author identity.
The actual pinned SDK contract and native title-update regressions pass offline;
the running session and OAuth grant were not touched.

## Rich message reading and mark-on-open

History initializes native wrap/linebreak and Markdown conceal before FileType
hooks, so user overrides still win and polling never reasserts defaults. Drafts
remain literal editable text. REST messages retain bounded server Markdown; a
small pinned HTML parser converts HTML-only rich bodies into inert Markdown
without execution, browser loading or resource fetching. Native syntax/conceal
renders headings, emphasis, lists, links and code. Message headers and quote labels
follow row metadata so Markdown body headings cannot impersonate UI attribution.
Quotes receive a distinct quoted/forwarded label, without guessing forwarding
provenance that this REST path does not reliably expose.

The user's requested behavioral change supersedes the earlier manual-only
receipt policy: a successful, uncanceled explicit open of an unread space sends
one receipt through its newest loaded message. Empty/edited history, failed/stale
selection, unavailable status and focus-neutral programmatic selection cannot
send one. Attempts remain recorded after failure/unknown outcome, preventing
implicit retry on reopening. Only confirmed server-read state clears emphasis
and permits a new unread cycle at the same endpoint. An independent opt-out
retains manual-only receipts. No live receipt or account reconnect was exercised
while implementing this change.

The subsequent unread regression was observed as `readStatus=failed` with the
generic `startup` reason and no known statuses. SDK construction/list/get passed
offline; the old notice did not identify which startup step failed. Startup
diagnostics now carry only fixed phase/problem codes, distinguishing SDK load,
readiness, device registration and initial snapshot. No SDK package or auth policy
was modified. A single user-approved reconnect, with mark-on-open temporarily
disabled, restored server status and unread syntax while preserving the draft and
focus. The original failure did not recur; its exact cause remains unknown, and
restoration is not described as a permanent root-cause fix.

The next opened-space complaint was a presentation defect, not another sync
failure: server status was already read and unread metadata had cleared, but
`WbxSelected` still colored the entire open row. It now accents only `●`; read
titles return to `WbxRoom`/`Normal`. Both editors cover successful automatic
receipt ACK, delayed server confirmation, normal read-title styling and renewed
unread emphasis for later activity. The styling-only fix was applied live without
restarting, reconnecting or requesting a receipt, preserving backend state,
spaces text, drafts, focus and viewport.

That marker-only presentation was too weak as a current-space indicator. An
independent native `WbxCurrent` background now marks the open row even when the
browsing cursor moves, without restoring the misleading read-title accent/bold.
Unread syntax preserves the marker accent as well. Window-local matches follow
selection/reordering across tabs, are removed on view release and never clear
user-owned matches. Both editors' real drawn-cell checks confirm that current
background and unread foreground/bold combine correctly. The live styling-only
update retained backend/unread state, text, drafts, focus and viewports.

## Message blocks and reply drafts

The message-block/reply follow-up replaces Markdown-looking sender headings with
metadata-driven UI headers and native virtual corner/rail/end decorations. Body
source stays unprefixed, so yanks, searching and Markdown code/list indentation
remain native. Per-body syntax regions prevent unclosed fences bleeding into
the next sender header. Actual Webex parent IDs drive capped two-column reply
indentation/parent previews without reordering chronological history or guessing
relationships from quotes.

Reply drafts are isolated by room and canonical thread root, with collision-free
keys and disjoint escaped URIs. Reply/cancel never send or discard another draft;
headers/statuslines expose the bound parent. Both backend and editor bind ACKs
to room/parent and unchanged source text, preserving conservative room-wide
uncertainty and no automatic POST retries. Legacy backends cannot silently
degrade a reply into a normal post. Native decoration work is bounded with an
explicit clipping notice; incomplete displays cannot acknowledge read status.
The change was checked with native editors, actual drawn PTY cells and synthetic
HTTP/SDK fixtures, without touching the active live session.

## Component measurements

All inputs below are synthetic. These are component measurements, **not**
terminal-display timings, live meeting benchmarks or end-to-end FPS claims.
Measurements used Node 25.2.1 on the local Linux host.

### Fragmented viewer packet assembly

64 KiB fragments, 15 samples; comparison against the previous accumulated
`Buffer.concat()` loop:

| RGBA frame | Previous median | Incremental median |
| --- | ---: | ---: |
| 1280 × 720 | 20.955 ms | 0.607 ms |
| 1920 × 1080 | 104.506 ms | 1.230 ms |

Tests additionally assert exact body allocations and linear copied-byte counts;
they do not assert wall-clock thresholds. Socket fragmentation, controls,
cancellation, partial disconnects and mixed metadata/frame packets are covered.

### Oversized editor history output

500 messages × 10,000 CJK characters, 7 samples, explicit GC between samples,
8,388,608-byte line budget:

| Encoder | Median | Output bytes | Retained messages |
| --- | ---: | ---: | ---: |
| Previous stringify/clone/quarter-drop loop | 67.332 ms | 6,372,183 | 212 |
| Bounded suffix encoder | 14.051 ms | 8,386,002 | 279 |

Both process the same source history. Output sizes differ because the new encoder
uses the byte budget more closely instead of discarding messages in quarters.
Sources and RPC replay objects stay unchanged. Tests cover UTF-8/JSON escaping,
exact limits, state/response/hello envelopes and a backpressured reader.

### Text-block ANSI generation

160 × 90 RGBA, 50 samples; ANSI generation plus UTF-8 byte counting:

| Content | Bytes before → after | Median ms before → after |
| --- | ---: | ---: |
| Flat | 252,622 → 23,662 | 2.338 → 0.148 |
| Six bars | 283,672 → 32,032 | 2.358 → 0.237 |
| Noise | 277,367 → 277,367 | 2.761 → 2.949 |

Repeated colors benefit substantially. Noise has no byte savings and showed a
small CPU cost for the color comparisons; this is not a universal rendering
speedup. ANSI-state interpreter tests compare cell positions/colors, including
odd heights, non-default origins and repeated/random pixels.

## Follow-ups deliberately deferred

- Preserve history cursor/topline by message identity when older messages are
  prepended. Retaining numeric line positions is insufficient; this needs
  multiple-window/tab regression cases before changing scroll behavior.
- Suppress unchanged background polling projections/notifications without hiding
  loading errors, readiness or pagination changes. Do not deduplicate transient
  delivery acknowledgments or silently change public hook semantics.
- Bind routine tmux operations to a verified immutable session ID to reduce
  subprocess work. Never cache authorization or follow a replacement session that
  happens to reuse the old name.
- Reuse capture-canvas backing storage only after explicit cancellation,
  alternating-size and shutdown tests. No measured browser speedup is claimed.
- Add actionable Node-version/custom-backend health diagnostics. Do not make a
  health check start a backend, browser or authentication flow.
- Consider extracting the ownership nucleus from `autoload/wbx.vim` in a later
  behavior-preserving pass, after the stronger verification gate is established.

See [validation](editor-validation.md) for recorded per-pass results and the separate
[authorized live-acceptance boundary](live-acceptance.md).
