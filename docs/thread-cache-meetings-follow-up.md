# Follow-up: whole threads, cached unread and imminent meetings

Status: **implemented and offline-validated; not live activated** (2026-11-09).
The later [shared meeting-login follow-up](shared-meeting-auth.md) changes runtime
files after this baseline; its verification is separate from the totals below.
This follows the completed [original roadmap](implementation-progress.md), whose
passing totals predate these changes and must not be reused as their evidence.

## Accepted behavior

- Main history groups loaded replies beneath their root. Roots are chronological;
  replies are chronological within each thread. Backend messages remain canonical
  chronological data, without presentation mutation. `threaded_history = 0`
  retains the former timeline layout.
- `za` on a root header closes a real outer fold containing root/reply headers and
  bodies. Individual message-body folds remain nested. `WebexThreadFold` / `Wt`
  toggles that outer fold from any member; unrelated roots remain visible.
- Native fold choices remain per-window, message/thread identity and room. Closed
  threads stay closed when replies arrive; opening an outer thread preserves the
  user's independent inner-body choices. Missing parents and cycles must not hide
  or duplicate messages.
- Latest navigation and receipt admission follow the canonical message ID, not
  the last physical rendered row. `WebexLatest` / `Wg` navigates without opening
  closed folds or granting receipt consent. A capped latest-window refetch also
  must not implicitly consent to a receipt.
- Read/unread cache is session-local, bounded and never written to disk. Failures,
  partial snapshots and same-session token renewal retain last-confirmed flags as
  `unreadStale: true`; never-observed rooms stay unknown. Explicit stop/new account
  or profile clears the cache.
- Cached unread retains emphasis; cached read is not fresh confirmation. Stale
  metadata never authorizes receipts or clears failed automatic-attempt dedup.
  Observed newer messages invalidate current certainty even outside the view cap.
- Sync diagnostics leave the spaces header. Compact footer guidance and local
  `WebexHealth` retain visibility without repeating raw errors or per-room labels.
- Imminent meetings appear before spaces, with Enter as an explicit join
  through the existing single media owner, never auto-join/transmit. The public
  API requires known-granted `meeting:schedules_read`, which `spark:all` alone
  does not establish. It covers API-visible current host/invitee series, not a
  complete calendar. No grants are silently broadened. Native discovery defaults
  on after an explicit connection; `upcoming_meetings=0` opts out beforehand.
- Cards cover now−5 minutes through now+30 minutes, maximum three, UTC `Z` times.
  A 15-second local tick publishes expiry and refreshes read-only discovery after
  its 60-second freshness period, respecting bounded cooldown/Retry-After. No
  discovery call blocks room opening or initiates a join.
- Card URLs remain in Node. Enter submits ID plus rendered projection revision;
  Node revalidates current account, occurrence/window and fresh `joinTarget` before
  using the existing headed join path. Stale/loading/unsafe-link cards cannot join.
  Room and meeting identities remain distinct even when their raw IDs collide.
  A removed hovered card moves to neutral chrome, not another row's action.

## Final staged verification

Final isolated stage: `/tmp/opencode/wbx-roadmap-verification-wgdwa89l/project`;
logs and summary: `/tmp/opencode/wbx-roadmap-verification-wgdwa89l/`.

| Check | Result |
| --- | --- |
| Strict plugin gate | Typecheck, fresh staged build, core, both editors and static LazyVim consistency pass |
| Core | **361 pass, 0 fail, 10 intentional opt-in skips (371 total)** |
| Native editor scenarios | **36 pass**, no editor skips; Neovim and full Vim |
| Separately enabled real lazy.nvim loader | **2 pass**, isolated config; not an active/full-LazyVim session claim |
| Messaging checks | **44 pass** |
| SDK/cache checks, pinned SDK enabled | **52 pass**, including socket-forbidden actual SDK, fairness/deadlines and session-local stale cache |
| Synthetic browser controls | **3 pass**, no browser/device launch |
| Private drawn PTYs | **12 editor/fixture runs pass**: reading, navigation, UI, grouped navigation, thread subtrees and upcoming meetings, each editor |
| Original checkout `dist/` | SHA-256 fingerprint unchanged; active artifacts not rebuilt/replaced |

These suites overlap; do not sum them into a unique total. All runtime/build/test
files match the final staged source; only completion/evidence documentation was
updated afterwards and checked separately. The first follow-up stage failed one
outdated default-object expectation in the people protocol fixture; it was updated
to include the new default-false RPC flag, then the entire gate passed. That
provisional evidence is retained at `/tmp/opencode/wbx-roadmap-verification-3wzfdcpe/`.

Coverage includes root/reply headers actually hidden by one outer fold, preserved
inner choices/closed-thread arrivals, independent windows and rooms, missing roots,
cycles, root eviction, legacy timeline opt-out, newest-ID navigation before the
last physical root, capped refetch without receipt consent, stale read flags not
clearing failed-attempt dedup, unknown rooms, source renewal/account replacement,
meeting/room ID collision, hover preservation, expiry, non-actionable stale cards,
grant denial without API probing, no join on discovery, and explicit join-path
revalidation with transmission initially off. Meeting join is mocked, not live.

Grouped same-shape fold save/restore measurements from nine-sample native fixtures:
at about 21,000 rows median/p95 **24.08/28.39 ms Neovim**, **33.68/34.34 ms Vim**.
These are helper timings, not end-to-end live UI latency. Structural fold changes
still trigger full native expression recomputation; no constant-time claim is made.

## Remaining limits

- Cached unread improves continuity; it does not prove the live SDK/service is
  healthy. The exact active outage still needs its sanitized `WebexHealth`
  diagnostic code, and the live session still uses its older build.
- Full meeting/invitation coverage and legitimate links outside the conservative
  safe public subset are not promised. Missing meeting grant requires a separate
  explicit authorization decision, not automatic scope/config edits.
- Live presence, posts, receipts, thread interoperability, cross-client sync and
  physical-media/join acceptance remain separately unauthorized and unperformed.
- All cache is memory-only. Preserve unsent drafts before any later approved
  activation; never source the main autoload into the active editor.

No active editor reload, new reconnect, real message/receipt, OAuth flow, device
test, installed configuration change, active artifact replacement, commit or push
was performed for this follow-up. The active session and memory-only drafts were
left untouched; verification used staged builds and synthetic private fixtures.
