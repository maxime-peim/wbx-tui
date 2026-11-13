# Persistent last-confirmed unread status

Status: **implemented and staged-regression verified; not live activated**.
No installed configuration, active editor, original build artifact or real service
session is changed. The previous [spaces-cache gate](spaces-cache.md) remains the
original metadata-only baseline; this extension's evidence is recorded below.

## Native defaults and explicit opt-outs

```lua
spaces_cache = true,
read_status = true,
```

Both options now default true in the native editor, following the later
[client-defaults request](people-popup-design.md); explicit false/0 wins.
No extra setting or grant is added. This uses the existing verified account/profile
cache and optional read-status source. Explicitly disabled features and demo mode
remain inert; no SDK installation, connection or grant expansion is automatic.
With `read_status=false`, flags are neither projected nor saved; metadata caching
still works. The existing cache identity check, scope requirements, owner-only
plaintext files and other [privacy/bounds](spaces-cache.md#diskprivacy-bounds) apply.
This is a backend change: preserve unsent drafts, rebuild explicitly and restart
when ready. Never hot-source the main autoload. No activation is automatic.

## Meaning and provenance

Only valid per-room SDK observations can create/update a last-confirmed flag.
The saved fields are **room ID, `unread:boolean` and local observation time**.
No SDK last-seen dates, message IDs/content, receipts, pending actions or credentials
are serialized. A receipt ACK/failure, REST activity or a metadata refresh cannot
invent a flag, clear it, or advance its observation timestamp.

On restore, `unreadStale=true` is unconditional. Cached unread titles keep their
normal unread emphasis; last-known read values are not styled as unread. The
footer identifies historical/STALE flags and separately counts unknown rooms.
Metadata may itself be cached/browse-only or already freshly revalidated by REST;
neither case makes a restored flag fresh. Missing/expired values remain absent,
not false/read. An empty/partial healthy SDK snapshot cannot freshen omitted flags.
Only a fresh per-room SDK observation supersedes the corresponding historical bit.

Restored booleans have a separate bounded memory map. They **never enter**
`readRooms` or `readCache.status`, which hold actual SDK observations. Receipt
admission still requires fresh per-room status, current authorization and the
known latest complete/unfolded body endpoint. Neither stale read=false nor stale
unread=true can issue a receipt or clear the native failed-attempt guard. Cache
loading and subsequent SDK recovery never replay an open, post or receipt.

A new authenticated cache-enabled session clears old session read memory before
identity verification, avoiding cross-account leakage through shared OAuth
configuration. Fresh callbacks from this session remain separate from disk data;
a late disk load cannot replace them. Stop/generation checks reject old callbacks.

## Format, age and clearing

- File format **v2** keeps metadata unchanged and adds a separate `unread` array,
  at most one typed record per cached space (500 total), bound to that document's
  verified account/profile and metadata IDs. Unknown fields, duplicate/unbound
  IDs, coerced booleans and malformed timestamps fail closed.
- Existing v1 metadata-only files remain readable. They have unknown read status
  until an actual observation, and migrate on a normal successful write. No old
  row-level boolean is guessed or imported as authoritative state.
- Each restored disk flag has its own six-hour maximum display age. Metadata refresh may renew
  metadata age but **preserves the flag's original timestamp**. Expired/future
  flags are ignored independently; an expiry timer updates an idle list without
  waiting for another command or SDK poll. Expiry is not secure deletion.
  The separate, already-existing same-session SDK memory history keeps its own
  policy; a real live observation is not replaced by a disk-expiry result.
- Storage remains eight bounded slots, 1 MiB per completed document, owner-only
  and atomically replaced. Observation memory is bounded at 1,000 entries; only
  flags bound to the serialized 500 metadata entries can go to disk.
- The existing five-second admission interval now retains one active write and
  one latest pending document at both engine and storage boundaries. Genuine new
  observations are separate from semantic equality: identical SDK status can
  refresh its actual flag timestamp, but metadata writes, delayed commits, empty
  invalidation and failures cannot. Cache status reports the document's observation
  time, not a later fsync completion time. See [bounded persistence](spaces-cache.md#write-coalescing-and-lifecycle).
  This is a best-effort display
  cache, not a durable journal; quitting before a pending write may lose the latest
  observation. No synchronous quit-side receipt or network operation is added.
- `:WebexCacheClear` removes the current profile's metadata and flags, drops
  disk-only flags from this session, and stops further cache writes for it. Actual
  live SDK state, drafts and failed receipt attempts are not cleared. Independent
  opted-in processes can still maintain their own cache; this is not revocation.

## Verification

Focused filesystem/engine/RPC and headless/drawn Neovim checks cover v1 migration,
v2 validation, independent ages, unknown/read/unread display, persistence across
new engines, startup races, account isolation, partial/empty SDK recovery, expired
flags on an idle list, bounded memory, clear/stop, and receipt ACK/failure safety.
The native cache fixture checks that unread styling is not hidden by muted cache
syntax and that restoring flags never enables cache-row selection or receipts.
No real Webex, OAuth, message, receipt or meeting/device test is performed.
Current strict two-editor and slow-storage/owner-isolation evidence is recorded in
the [remaining-findings plan](remaining-findings-plan.md); the gate below is historical.

### Original unread-extension staged gate — 2026-11-10

Run directory: `/tmp/opencode/wbx-persistent-unread-verification-n6zjk8ix/`, with
the checkout copied to `project/`. Existing dependency inputs were reused without
installation. HOME/config/cache/state were private, with live/media test opt-ins
disabled. Builds ran only in the staged copy, never in the active checkout.

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including **15 new persistent-unread checks** | **409 pass, 11 skip, 0 fail** (420 total) |
| Native editor suite | **20 Neovim pass, 20 Vim skip, 0 fail** |
| Separate real lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including spaces cache | **9 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy native help tags pass |

The core skips are eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered by the separate SDK run), and one missing-Vim people fixture. The baseline
loader opt-in skip is covered by the separate actual-loader run. Full Vim is
unavailable: its skips are not passes or fresh strict two-editor acceptance.

An earlier staged attempt (`wbx-persistent-unread-verification-9jmevdha/`) found
two older engine fixtures injecting an SDK source without enabling `read_status`.
Their setup now explicitly opts in; all assertions remain, and no runtime guard
was relaxed. The complete successful gate above includes that correction.

Logs: `plugin.log`, `lazy-loader.log`, `messaging.log`, `sdk.log`,
`browser-controls.log`, `screen-*.log` and `history-benchmark.log`;
`summary.json` records all return codes. All **230 source files** matched the
staged SHA-256 manifest after the gate. Only this final evidence update follows;
the other **229 files** still match, with no subsequent runtime/test changes.
All **ten original bundle/map hashes** remain unchanged. Final documentation,
private-copy native help tags and integrity results are in `docs-final.log` and
`final-checks.json`; `final-evidence.diff` records the documentation-only delta.

Manifest SHA-256:

- `source-manifest.json`: `485bb1516177d1645e70dfc30c3506f5c9ace8971740a350dddf5bf14322d05b`
- `original-dist-manifest.json`: `ae03ae65461696954b8c4da6bc64877c3d9877a6c57f97a406f8813713a23f62`

At this historical gate, no real account, OAuth, message, receipt, meeting/device
or installed-config acceptance was performed and caching was opt-in/default-off.
The later native-defaults/UI follow-up changes those defaults without changing
the backend or requiring another build of an already compatible backend.
Preserve unsent drafts before restarting; do not hot-source the main autoload.
