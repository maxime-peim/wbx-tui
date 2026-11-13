# Local read-on-open and notifications outside the selected space

**Notification follow-up (2026-11-12):** the activity-only approach below did not
resolve the reported live issue. It depended on unread metadata changing and
discarded the original message-created event. Current backends instead forward
[confirmed global message events](global-message-events.md); the staged gate in
this document is historical evidence for local unread presentation, not proof of
live notification delivery. Local display/receipt/cache contracts remain unchanged.

Status: implemented and staged-regression verified; not activated.
No active editor/configuration/build, real Webex
session, receipt, OAuth or desktop notification was changed/exercised. Preserve
drafts, rebuild the backend and restart explicitly when ready; never hot-source
the coordinator. The rebuild supplies the new SDK activity projection.

## Local unread display

The old UI deliberately waited for a server `unread=false` snapshot before
removing emphasis. A slow/missing update, unsuccessful receipt or manual-only
receipt policy could therefore leave an explicitly opened space looking unread.

Now a **successful explicit open** clears that space's local emphasis immediately,
including with `mark_read_on_open=false`, unknown/stale read state, empty/pending
attachment history or a failed/unconfirmed receipt. This is a local “visited”
presentation, not a claim that every body was read or acknowledged in Webex.
Resuming the loaded space applies it without another request, receipt or viewport
reset. An admitted explicit mark-read action also clears locally. Focus-neutral
programmatic selection, cancelled/failed/stale selection, cached browse-only rows,
edited history and native-hook promotion never create this override.

The implementation is a separate native view overlay. **`wbx#state()` remains the
authoritative backend snapshot**, including its original `unread`, `unreadStale`
and source-health values. Receipt admission never reads the overlay. Neither a
local clear nor an ACK can clear failed automatic attempts, refresh cached flags,
register SDK devices, change scopes, issue an extra receipt, or persist a false
server-read bit. Existing complete/unfolded/latest endpoint rules and
manual-only opt-out remain unchanged.

The automatic Read By lookup cannot consume mark-on-open's one attempt merely
by occupying the SDK first. The existing receipt slot waits behind that physical
read, then revalidates source/session, selected room, newest loaded endpoint and
fresh per-room server status before submitting once. Backoff, source loss,
deadline or a changed room/endpoint cancels the waiting receipt. There is no
write retry, receipt from Read By itself, or weakening of the explicit-open,
visibility, completeness, opt-out and failed-attempt guards.

The statusline labels pending overrides as `locally read N`; health's
`local_unread` dictionary contains only read/unread/tracked counts. Space titles
and row text are not rewritten merely to clear an emphasis. The renderer records
effective unread rows and local read/unread row metadata, preserving native
current-space backgrounds, colorschemes, per-window reading position and drafts.
Server/cache health and unknown counts remain truthful even when a locally visited
space is not bold.

### What restores unread

- A newly observed loaded message beyond the visited message boundary, including
  distinct IDs at the same timestamp. Older pages, unchanged polls, image decode,
  body edits or REST room ordering changes do not count. Exact acknowledged local
  sends are excluded; older backends retain conservative one-batch exclusion.
- The known newest endpoint overtaking the bounded loaded history window.
- A **fresh SDK unread-activity advance** in a visited space, even if `unread` never
  changed from true and the space is no longer selected.
- A genuine later fresh server-read to server-unread cycle, including explicit
  mark-unread elsewhere. A repeated old true flag alone cannot undo local clearing.

Actual new incoming content can be emphasized locally while an older server-read
flag is stale. A fresh read observation covering its activity confirms it; an
older read watermark cannot hide newer observed content. Confirmed anchors remain
in memory to recognize subsequent incoming messages without resurrecting old ones.
Timestamp-less legacy data is handled conservatively through endpoint changes;
same-time boundaries cap at 64 IDs and suppress ambiguous ties after saturation.

The overlay holds at most 500 room anchors and two bounded 256-entry local-send
exclusion sets. It is session-only, never a disk cache, and is cleared on backend
replacement, explicit disconnect, account/session failure or editor shutdown.
Cached membership remains browse-only, and display overrides never apply to cached
rows. Lost/evicted/unsupported observations cannot establish receipt authority.

## Historical notifications in other spaces (legacy fallback only)

The activity behavior in this section applies only to older backends omitting
`messageEvents`. Current backends use actual creations and default-on excerpt-only
previews; see [current notification coverage](notifications.md#message-coverage-and-safety).
The local unread-display behavior above still uses fresh SDK activity.

The first notification implementation watched actual selected-space messages and
fresh `read -> unread` transitions elsewhere. It missed new activity in spaces
that were already unread. The existing SDK worker already listens for message
events across spaces and refreshes affected read-status metadata; the missing
piece was propagating its activity watermark to the editor.

Room snapshots now include optional **`unreadActivity`**, copied only from the
actual SDK `lastActivity` observation. It is not REST room `lastActivity`, a
receipt outcome or a client wall-clock flag. Disk-only restored booleans do not
acquire one. It remains explicitly historical with `unreadStale=true` when SDK
health/room freshness is lost.

For an unselected space, continuous healthy, non-cached, per-room-fresh updates
produce an alert when either its unread flag changes false-to-true or its
`unreadActivity` advances while unread stays true. Advancing already-unread spaces
say **“New unread activity (unread sync)”**—not an invented count or body preview.
Repeated activity, first observations and outage/cache recovery establish baselines
instead of replaying a backlog. Pending same-space activity alerts coalesce.

This requires **already-enabled `read_status=true`**, its existing optional SDK and
grants. Nothing enables them, broadens scopes or starts another observer. With SDK
sync disabled/unavailable, only actual selected-space messages can be observed.
No unselected histories, attachment bodies, people identities or new provider
endpoints are fetched; the target space is never selected, acknowledged or joined.
Partial memberships, SDK reconciliation latency and recovered intervals remain
coverage limits, not a complete guaranteed per-message feed.

## Verification

- `test/editor/local-unread-events.vim`: input immutability, immediate clearing,
  unchanged/stale/unknown/cached flags, REST-vs-SDK provenance, off-space restoration,
  own sends, delayed confirmations, equal timestamps, bounded windows and cache
  bounds/reset.
- `test/editor/local-unread.vim`: normal coordinator/RPC/render path, local clearing
  with receipts off and sync failed, focus-neutral/failed/cancelled opens, resume,
  immutable server state, syntax metadata/text/viewport/draft continuity and reset.
  It notifies synthetic space A while B remains selected and **A stays server-unread**,
  then advances A again for a second alert without any `rooms.read`, message POST,
  or unselected history request. Repeated/REST-only updates stay quiet.
- Existing reading/activity fixtures retain raw-state and failed-receipt retry
  assertions while updating their old “server-only emphasis” expectation.
- `test/read-status-cache.test.ts` proves the engine projects actual SDK activity,
  never REST activity or receipt success, and keeps historical activity stale.
  Existing persistent-flag regressions pass without local overrides entering disk.
- Native notification event tests now cover already-unread unselected activity,
  initial baselines, no duplicate timestamps and no REST-derived alerts.

Focused headless and private-PTY checks pass. Full Vim is unavailable and remains
an explicit skip. Real SDK/Webex/OS-notifier acceptance was not attempted.

### Final staged gate — 2026-11-11

Run: `/tmp/opencode/wbx-local-unread-verification-0g65cj00/`. All builds ran in its
`project/` copy with private HOME/config/cache/state, existing dependencies reused
without installation, and live/media opt-ins off. Every check passed:

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including SDK activity provenance | **433 pass, 11 skip, 0 fail** |
| Native editor fixtures, including both local-unread suites | **28 Neovim pass, 28 Vim skip** |
| Actual lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **53 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including local unread/off-space alerts | **15 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy help tags pass |

Core skips remain eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered separately), and one unavailable-Vim people fixture. The baseline loader
opt-in skip is covered by the actual-loader run. Missing Vim is never a pass.
`summary.json` records every return code. Logs are `plugin.log`, `lazy-loader.log`,
`messaging.log`, `sdk.log`, `browser-controls.log`, `screen-*.log` and
`history-benchmark.log`.

All **257 source files** matched the staged SHA-256 manifest after verification.
Only this final evidence update follows; the other **256 files** still match,
with no later runtime/test changes. All **ten existing bundle/map hashes** remain
unchanged from this gate's initial checkout baseline. `final-checks.json`,
`docs-final.log` and `final-evidence.diff` record final documentation, private-copy
native help tags and source/build integrity.

Manifest SHA-256:

- `source-manifest.json`: `06c244169e21b5b4f8287abc9524469ec89a7738da4c28015d4b43e2b0db1900`
- `original-dist-manifest.json`: `b0b0f976817fb5165b7b06eb5e80667df3de9c395b2bb753146d7f4febdfb961`

Changes remain uncommitted. Preserve drafts before rebuilding/restarting explicitly;
verification did not reconnect, broaden grants, issue live receipts, reload the
active session or modify any installed configuration.
