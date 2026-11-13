# Persistent received display data

The user authorized private disk storage of decrypted received text across
restarts. `spaces_cache=1` (the native default) now enables both the existing
[room/unread cache](spaces-cache.md) and this separate received-data cache.
Set `spaces_cache=0` / Lua `spaces_cache=false` before connecting to disable both.
The later approved local Neovim plugin-spec update and checkout bundle rebuild
are recorded in the [verification index](verification-index.md). Activation still
requires a deliberate restart; no dependency installation or live service
operation is part of this implementation.

## Identity, bounds and privacy

- Verify the account after explicit live authentication using the existing shared
  `VerifiedStorageIdentity` lookup. Partition by verified account plus config/OAuth
  profile, never the access token or transient editor `localContext.sessionId`.
  The latter only fences callbacks. Demo and disabled sessions do no disk work.
- `$XDG_CACHE_HOME/wbx-tui-received/` (otherwise `~/.cache/wbx-tui-received/`):
  owner-only `0700` directory, `0600` files, eight fixed slots, **4 MiB per file**.
  Full profile hashes prevent slot collisions from exposing another account.
  The shared private-file implementation retains bounded reads, no-follow,
  owner/mode/link/type checks, atomic replacement and clear-after-commit ordering.
- At most **256 ID/name mappings**. Refresh eligible after six hours; a successful
  observation expires after 24 hours. Failed refreshes never renew that evidence.
  Negative results, presence and profile response bodies are not persisted.
  Existing sender-name consent/grants/denial gates still apply.
- At most **16 recently observed rooms × 32 recent text messages**. Message
  observations and reaction observations expire independently after six hours.
  Oversized combined histories evict older rooms rather than exceeding the file
  limit. No pagination cursors, attachment URLs, pixels or SDK objects are stored.
- Reaction labels, supplied counts and display-only `mine` evidence use an
  independent source-content key and their original observation time. Resolving
  names or updating image previews does not invalidate them. Opaque `own` removal
  handles, preparations, inspection locks and mutation outcomes are never stored.
  A verified own-write acknowledgement can update its display observation
  immediately. Its affected count is omitted, `mine` remains display-only, and
  sibling timestamps are not renewed. Historical ACK replay does not update it.
  Explicit reaction actor lists use a separate DTO and never enter this cache;
  exact-person lookups for that list do not warm the sender-name disk cache.
- **Plaintext, not encryption or secure erasure.** Message text/Markdown may itself
  contain sensitive data or links. Expiry stops reuse, not retention on disk.
  Disconnecting or disabling caching does not erase old files.

## Restoration never grants authority

Cached room rows remain browse-only until normal room discovery succeeds.
After explicitly selecting a live listed room, saved text can appear immediately
while a normal fresh history request runs, labelled **Saved history · stale
display only**. It is a separate engine projection, not `MessagingStore.messages`.
`ready` and `historyLatest` stay false. Fresh history replaces the projection,
including an empty history; cached text cannot preserve an absent fresh target.

Cached reactions are muted, without a per-badge `cached` suffix. Recent snapshots
can avoid an immediate duplicate passive read for the existing five-minute
presentation interval. Explicit details/preparation/removal always retain their
independent live verification. No cached observation can authorize a send, receipt,
attachment request, mutation, removal, inspection unlock or automatic replay.
Oversized transport snapshots omit cached reaction metadata when trimming text.

Positive message deletion, content edits and room revocation evict the relevant
observations. Invalidation during a held disk load cannot resurrect old history.
Account/session replacement fences callbacks; grant loss retires optional storage
and presentation owners. Same-grant token renewal does not discard verified names
or repeat account verification.

Writes are best-effort, coalesced behind physical storage and delayed five seconds;
there is no quit-side durability promise. `:WebexCacheClear` clears both current
verified profile entries and disables further writes for that backend session.
Other backend processes may independently write their own snapshots. Corrupt,
unverifiable or unsafe paths are not deleted or repaired automatically.

## Startup throttling

An initial unread-discovery HTTP 429 no longer destroys the SDK source. It keeps
one device registration and pauses new SDK reads for at least 60 seconds or the
longer supplied `Retry-After` (seconds or HTTP date). Long pauses retain IPC
heartbeats. Metadata resumes only after that deadline; queued mutations are
never replayed, and no reauthentication/reconnect/device registration is added.

Unread readiness and exact-message reaction-read readiness are distinct.
A non-throttle metadata refresh failure can leave independently verified reaction
summaries available, but writes/receipts and inspection still require the existing
ready source. Cached unread flags always remain stale; undisclosed status/counts
are never inferred.

## Offline checks

`test/received-cache.test.ts` exercises restart, account collisions, independent
expiry/keys, bounds, names, corruption, permissions, invalidation and clear.
`test/received-cache-integration.test.ts` restarts actual engines with inert
providers, proving restored text never enters the live store or admits sends,
reactions or receipts. `test/read-status-fairness.test.ts` runs the production
worker with an inert SDK/clock through startup 429 and server backoff.
The existing `reaction-source` native fixture covers restored stale text/badges
and separate reaction readiness in both editors. Live-service recovery and
reaction writes remain unverified.
