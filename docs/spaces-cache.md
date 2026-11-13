# Optional local spaces cache

Status: **implemented and offline-validated; not live activated**.
The initial metadata-only implementation is now extended with
[optional last-confirmed unread/read flags](persistent-unread.md), separately from
the authoritative SDK state and original session-local unread cache. No installed config,
active editor, original build artifact, grant or real service session is changed.
The same option now also enables the separately authorized
[received name/text/reaction display cache](received-cache.md). The metadata-only
field list below describes `wbx-tui-spaces`, not `wbx-tui-received`; clear covers
both current-profile files. Neither cache grants live authority.

## Native default and opt-out

```lua
-- Add to existing LazyVim opts or require('wbx-tui').setup(...):
spaces_cache = true -- native default; false opts out
```

Vimscript: `g:wbx_tui.spaces_cache = 1`, before connecting. This is an editor/backend
option, not engine JSON. Rebuild the backend explicitly and preserve unsent,
memory-only drafts before restarting; unlike the gutter/fold-only changes, this
feature does need a new backend build. Do not hot-source the main autoload.

No cache work occurs just from installation, setup, health/snapshot inspection,
explicitly disabled use or demo mode. After explicit live sign-in, one bounded
`https://webexapis.com/v1/people/me` GET verifies the account using existing
`spark:people_read` or `spark:all`. No scope is added, OAuth repeated, presence
looked up, membership enumerated or custom status queried by this identity check.
Its deadline is three seconds, redirects are refused, and failure cannot hold up
REST messaging. Without verified identity/grants, no cache is read or written.

Keys hash the verified account ID, absolute config path and public OAuth profile
(client, redirect and sorted configured scopes). They never use a token or secret.
The raw identity response/account ID is neither persisted nor returned to editors.
Token renewal does not repeat this lookup or invalidate an established key; losing
the identity grant disables further cache use/writes until explicit reconnection.

## Display and actions

The first successful connection seeds metadata. Later connections can display
cached IDs/titles/types/order activity while REST/SDK work runs. Cached titles
use `WbxCachedSpace` (default `Comment`), with a conspicuous **STALE/browse-only**
footer and statusline cue. With `read_status=true`, last-confirmed unread/read
booleans can also restore, **always explicitly stale**, never invented for an
unobserved room. Unread emphasis stays visible above the metadata mute.
This improves time to an initial list, not authentication or live unread readiness;
no real-network startup-time claim has been measured. Reopening an already-ready
backend already reuses its room list without a new discovery operation.

Cached rows are a separate projection, **never live store membership**. Enter,
API and pickers cannot select them, and they cannot authorize sends, receipts,
joins or paging. Cached clicks are not queued for replay. A fresh REST discovery
replaces the list, including removed/renamed spaces and an authoritative empty
list, preserving per-window typed row anchors/focus and all drafts/undo. Press
Enter again on a fresh row to open it explicitly. Expired/removed anchors fall
back to neutral chrome rather than another actionable space.

With `spaces_cache=true`, fresh REST rows are released independently of unread
initialization. Their read state stays unknown or last-confirmed/stale until a
fresh per-room SDK observation; the aggregate SDK being ready is not sufficient.
the existing receipt endpoint, freshness and explicit-open checks still apply.
Default-off startup keeps the previous joint REST/SDK first-list gate. A failed
initial REST refresh leaves cached rows stale and browse-only; `WebexRefresh` is
the explicit retry. Identity/cache failure disables only caching, not messaging.

## Disk/privacy bounds

- `id`, sanitized `title` (80 characters), `type` and ordering `lastActivity`.
  With `read_status=true`, an optional separate array stores only room ID,
  last-confirmed `unread:boolean` and its original local observation time.
  No tokens, client secrets, refresh grants, messages, drafts, SDK last-seen dates,
  receipts, message IDs, person emails/profile responses, meeting links or cursors.
- **Private plaintext, not encryption or secure erasure.** Names/memberships can
  be sensitive. Cache data survives disconnect/quit until removed or overwritten.
- Default directory: `$XDG_CACHE_HOME/wbx-tui-spaces/`, or
  `~/.cache/wbx-tui-spaces/` when XDG_CACHE_HOME is unset/non-absolute.
  The cache directory is current-user-owned `0700`; files are `0600`. Existing
  unsafe permissions are rejected, never silently chmodded or worked around.
- Eight fixed numbered slots, at most 500 rooms / 1 MiB per completed file. Full
  SHA-256 profile keys are checked inside each document. Collisions replace old
  hints or produce misses, never another account's rows; no cross-process lock or
  credential index is required. Concurrent commits are atomic whole-file renames.
- Six-hour maximum display age; each flag has an independent six-hour limit that
  metadata rewrites cannot renew. Future/invalid timestamps are ignored. Expiry
  does **not** erase disk data. Writes compare complete projected data **and its
  genuine observation time**, and start at most once per five seconds per backend,
  not on every selected-history poll. An unchanged successful provider observation
  may renew metadata age; a metadata write never renews an old unread flag.
- Reads use bounded file descriptors with no-follow/non-blocking admission;
  symlinks, hardlinks, non-regular files, foreign ownership, shared permissions,
  malformed/oversized/invalid-UTF-8 documents, extra fields and duplicate IDs fail
  closed. Unknown JSON/provider text never reaches health/error notices.
- Normal writes clean their private temporary file. A process crash can leave
  an orphan temporary; directory scans stop at 64 entries and refuse new writes
  rather than deleting unfamiliar files or scanning without a bound.

## Write coalescing and lifecycle

The engine and storage owner each retain **one active write plus one latest pending
document**, rather than an unbounded promise/fsync chain. The five-second interval
is fixed from the last admission, not repeatedly postponed by new input. Slow
storage does not admit another save every five seconds: newer snapshots replace
the pending one, and completion admits only the latest still-owned document.
Successful REST/nonempty SDK observations supply the document timestamp; admission,
serialization, fsync, completion, empty invalidation and failure do not fabricate
one. Each unread flag retains its separate actual SDK observation time. Exact
repeated data is not confused with a genuine new observation of unchanged data.

Storage serializes/sanitizes each accepted input into a detached, bounded document.
Superseded pending saves for the **same key** share the latest document's completion
promise, not a waiter list or a guarantee to persist every intermediate snapshot.
A conflicting key cannot replace another profile's pending save; it is rejected
without changing that save. Sequential profile use and independent instances still
work, with complete profile-key checks and atomic slot collisions as before.
The v1/v2 disk schema and editor RPC/capabilities are unchanged.

Close, grant loss, session/account replacement and clear revoke pending snapshots,
timers and completion callbacks. An admitted native filesystem operation retains
its lifetime until it settles; no timeout frees admission to overlap a replacement.
Already-admitted atomic rename cannot be physically canceled. Clear waits behind
that possible commit, removes only its matching profile and **never reopens save
admission**, including during its own file checks. Failure reports remain visible;
only newly requested pending work may continue, without replaying the failed write.
Pending writes are best-effort, not a durable journal or a quit-side flush promise.

**`:WebexCacheClear`** clears only the verified current profile's matching slot,
serialized behind an admitted writer so it cannot be immediately repopulated.
Further writes are disabled for that session; live spaces, history and drafts
remain. Other explicitly opted-in backend processes can still refresh their own
cache independently; clear is not a cross-process revocation. A colliding slot
belonging to a different profile is not deleted. Other
profiles and corrupt/unverifiable files are not silently removed. Disabling the
option is not deletion. To erase every profile/orphan or repair an unsafe/corrupt
cache, disconnect and inspect/remove only the dedicated cache directory yourself.
No automated broad cleanup touches other cache/configuration paths.

## Verification

Focused filesystem/engine/RPC checks and the native cached-space fixture pass
without real network, account, OAuth, receipts, meeting/media or installed-config
actions. The synthetic engine test holds REST and SDK behind independent gates,
proves cached display precedes both, then proves fresh REST display precedes SDK
readiness. File tests cover account/profile isolation, collisions, permissions,
links, corruption, bounds, deadlines, concurrent commits, cancellation and clear.
Native headless/drawn checks cover mute/unknown styling, action guards, capability
negotiation/older backends, split anchors, drafts/undo and absent sends/receipts.
The historical gate below lacked full Vim; the current
[remaining-findings record](remaining-findings-plan.md) includes strict Vim/Neovim
verification and B4's slow-storage/coalescing evidence.

### Original metadata-only staged gate — 2026-11-10

This is the historical metadata-only baseline. The newer unread extension has
its own [verification record](persistent-unread.md#verification).

Run directory: `/tmp/opencode/wbx-spaces-cache-verification-ein157dq/`, with the
checkout copied to `project/`. Existing dependency inputs were reused without
installation; HOME/config/cache/state were private and live/media test opt-ins
were disabled. Neovim **0.12.6** was available; full Vim was not.

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including all **21 new cache checks** | **394 pass, 11 skip, 0 fail** (405 total) |
| Native editor suite | **20 Neovim pass, 20 Vim skip, 0 fail** |
| Separate real lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including spaces cache | **9 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | Pass |

The core skips are eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered by the separate SDK run), and one missing-Vim people fixture. The
baseline loader opt-in skip is covered by the separate actual-loader run. Missing
editors are not passes: this is not fresh strict two-editor acceptance.

Detailed logs: `plugin.log`, `lazy-loader.log`, `messaging.log`, `sdk.log`,
`browser-controls.log`, `screen-*.log` and `history-benchmark.log`; `summary.json`
records every return code. All **228 source files** matched the staged SHA-256
`source-manifest.json` after verification. Only this documentation evidence update
follows the gate; final integrity checks require the other 227 files to match.
All **ten original bundle/map hashes** still match `original-dist-manifest.json`;
the active checkout's `dist/` was not rebuilt or activated. Final documentation,
private-copy native help tags and integrity results are in `docs-final.log` and
`final-checks.json`. No runtime/test changes follow the staged gate.

At this historical gate, no real account, OAuth, message, receipt, meeting/device
or installed-config acceptance was performed; caching was opt-in/default-off.
The later [native-defaults follow-up](people-popup-design.md) enables caching by
default without changing this backend's identity, privacy or receipt boundaries.
