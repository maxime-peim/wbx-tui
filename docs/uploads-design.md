# F3 destination-bound uploads

**Later native completion:** [NC2–NC3](native-workflows-design.md) adds the `Wu`
default family, non-sendable file/limit context and replacement disclosure.
The command-only UI/gate below is historical; physical upload bounds still apply.
**MF14 follow-on:** the current native path also supports Markdown plus one file,
under the [separately reviewed contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract)
and [slice verification ledger](messaging-parity-implementation.md#mf14-markdown-single-file-runtime-slice).
The F3 counts below do not accept those later changes.

Conservative implementation contract for the request to finish the messaging plan.
Frozen pre-F3 source: `/tmp/opencode/wbx-f3-0mydn4mj/` (329 sources, ten original
bundle/map hashes), after the final F2 gate. Status: strict offline-verified,
uncommitted and inactive.
No live POST, activation, grant change or original build.

## MF14 extension of the same owner

Use the existing `WebexAttach`, `WebexFormat markdown`, then explicit
`WebexSend` / configured Send key. Plain file-only and text-only routes are
unchanged. One anonymous staged snapshot is still one message/POST; no multi-file
fanout, remote-file URL input, new sender or SDK transport. The finite optional
hello `uploadFormats:["markdown-single-file-v1"]` asserts this combination,
independently of the existing 32 capability strings. Old clients/backends refuse
the combination rather than downgrading, dropping bytes or altering other routes.

`uploads.send` adds only optional `format:"markdown"` with optional boolean
`mentionsAccepted`/`allAccepted` (flags require that format). Existing `text`
carries the exact nonblank Markdown caption, under 1000 UTF-16 / 4000 UTF-8 bytes.
The multipart adds `markdown`, NOT a generated plain-text alternative, alongside
exact room/root and the one binary `files` part.

The store and upload reservation precede mention preflight. Reuse the existing
mention grammar, group check, exact-person fresh membership reads and independent
target/@all consent; no roster/label is permission. Recheck known unexpired write
and membership-read grants and selection/root/session around every read. At most
16 unique-person GETs, sequential, no automatic paging; @all-only requires consent
but no person-ID lookup. The 20-second preflight sub-deadline lies inside the
unchanged 60-second operation. Cancellation or timeout ends logical work without
freeing an unsettled FD/GET/socket/DNS reservation; PublicREST exposes only native
settlement to that existing owner, not a new provider/tunnel.

Before registering attachment/image references or publishing history, require a
bounded successful raw ACK with exact room/root/Markdown, new ID/creation time,
no error envelope, and exactly one existing-policy allowlisted contents URL.
Display trimming is not ACK equality. No automatic HEAD/download verifies a
digest the provider does not return; documented conversion prevents claiming
byte-identical remote storage. Only the new combination's delivery adds exact
caption text alongside existing format/draft/file fields; legacy events still
work without it. Late/mismatched ACKs cannot clear newer text/files/uncertainty.

The existing shared new-message ledger now refuses its 64-entry session limit
instead of evicting an older request into resend eligibility; no second replay
ledger is introduced. Exact plugin-send exclusion still precedes hold release,
does not suppress other-client self messages, and preserves queued preview
revocation. All earlier physical/byte/reference/progress limits below remain.
MF14's acceptance is offline only; live service/tenant/grant/ACK policy tests
remain unrun. MF15 first-contact rich/file DMs were not part of this MF14
extension; the subsequent [MF15 slice](messaging-parity-implementation.md#mf15-recipient-richfile-runtime-slice)
adds an exclusive recipient snapshot binding in this same owner, not a second
file store or send route.

## User intent and limits

- New command-only actions `WebexAttach [path]`, `WebexAttachRemove`,
  `WebexUploadCancel`, `WebexAttachmentStatus`. Existing incoming open/download
  commands and keys are unchanged. File selection, removal, Enter and writes
  never send. One file per normal/reply draft; existing plaintext limit remains
  1,000 UTF-16 units (empty text allowed for file-only explicit Send).
- At most 10 MiB/file, eight staged references, 20 MiB total staged bytes,
  including revoked/draining work. One physical stage and one physical upload
  at a time, no automatic queue. Replacement staging may coexist with an older
  upload; late acknowledgment cannot clear the replacement.
- Eight-second staging / 60-second send deadline. Cancellation revokes logical
  consent immediately but never frees physical I/O admission before settlement.
  Known existing `spark:messages_write` or `spark:all` required; no scope probing,
  reauthorization or retry.

## Stable source and temporary storage

Explicit absolute local regular files only. Refuse symlink components, hardlinks,
directories, devices, FIFOs, invalid paths and oversize files. Open no-follow and
nonblocking; compare path/FD device/inode/size/mtime/ctime before and after copying.
Copy in 64 KiB chunks into an owned 0700 temporary directory / 0600 file.
Reopen the completed snapshot read-only, then **unlink it while retaining its FD**.
The stable anonymous snapshot cannot be replaced via its original path.
Changing/replacing the original after successful staging does not change the
approved staged bytes; show “snapshot”, basename and size explicitly in the UI.

Only bounded metadata and random handles live in Node. No file bytes/base64,
spool path, URL or credentials cross editor RPC; the chosen input path is admitted
only by the explicit staging request. Handles bind session, room/root and native
draft identity. No unsent native text is stored in the backend.
Release anonymous FDs on removal, acknowledged send or session end, after any
physical readers drain. Process death closes anonymous files; an empty private
temporary directory may remain. Delete only this owner's exact temporary paths,
never scavenge another process or recursively delete user paths.

## One-shot transport and outcomes

Use literal multipart fields `roomId`, optional `parentId`, optional `text`, and
one `files` part. At most 8 KiB envelope plus file, exact Content-Length, safely
encoded filename, 64 KiB reads/backpressure. Production target is fixed
`https://webexapis.com/v1/messages`, fresh `https.request` (`agent:false`);
no SDK, redirect following, cookie, hidden retry or auth replay.
Response bound: 256 KiB / 1,024 reads. Require a valid new ID and exact room/root.
The request closure binds the acknowledgment to its staged handle; do not claim
a server-provided byte hash.

Known refusal is failed. Cancellation before transmission is failed; after
possible submission, timeout/loss/redirect/malformed acknowledgment is unknown.
Keep the draft/staging metadata and existing uncertainty latch; never replay.
Hold the physical slot/source until native cleanup settles even after a logical
deadline. Ignore late completions from canceled/replaced sessions.

Use the existing new-message delivery/exact-plugin-send exclusion path, with a
bounded prepared-send identity in the store ledger. Preserve public plaintext
adapters and compatibility clients. Clear only unchanged text/tick AND original
attachment/draft identity. Native buffer text, undo, annotations/folds and focus
remain owned by the editor.

Progress is small validated `upload.progress` events, no more than four/second,
with status-only redraw, not full-history serialization. No paths/basenames in
health or logs. Demo staging is local and demo sending never contacts Webex.
Tests use a synthetic loopback receiver and adversarial transport/cleanup seams;
no live acceptance or timing-threshold claim.

## Notification ordering

`uploadPending:true` denotes a current logical upload send, not lingering physical
cleanup. The backend publishes fresh same-account events during that operation;
it does not extend the worker/Node 30-second creation-freshness window. Native
notification detection holds at most 64 individual selected-history candidates
and off-space same-account SDK creations, captured while fresh, for at most
90 seconds. Unrelated off-space messages remain immediate. Overflow is consumed,
not replayed. Exact IDs are marked at capture to deduplicate history after room
switches. The delivery event precedes the sending-false state/release, excluding
only the exact acknowledged plugin message ID. Same-account other-client posts
remain eligible even after their backend freshness window expires.

Release preserves original creation/observation time and count, never renews
receipt or unread authority, and rechecks current room membership/cached status,
visible-reader suppression, mute/disable and privacy. Disconnect drops the queue.
Preview revocation strips sender/excerpt together; queued name enrichment never
pairs a name with a different excerpt. Uncertain uploads cannot prove an exact
echo ID, so may produce a notification after release; they are not silently
classified as acknowledged sends. Capture/release cannot guarantee delivery
after overload, lost transport or expiry.

## Offline verification

Final gate: `/tmp/opencode/wbx-f3-verification-mke8fz0y/`, private copied project
and HOME/config/state, existing dependencies only; compiled backend in native
fixtures (`WBX_TEST_SOURCE_BACKEND=0`), required Vim and Neovim.

| Check | Result |
| --- | --- |
| TypeScript / five copied builds | Passed |
| Core | 682 passes / 14 explicit opt-in skips |
| Native editors | 49 Neovim + 48 Vim fixtures / zero editor skips |
| Drawn private PTYs | 36 Neovim + 35 Vim fixtures |
| SDK/read-status/cache / synthetic messaging / browser controls | 145 / 44 / 3 passes |
| LazyVim | One pass / one optional installed-loader skip |
| Documentation / both-editor help | Passed |
| Integrity | 337 sources matched; 329 frozen pre-F3 sources and ten original bundle/map hashes unchanged |

Focused evidence is in `/tmp/opencode/wbx-f3-0mydn4mj/`. The pre-F3 protocol
characterization records expected absence, not a feature pass. Upload tests
verify actual multipart bytes at empty/small/10 MiB limits, Unicode/quoted names,
one-shot refusal/redirect/loss outcomes, response bounds, grant revocation,
exact delivery/replay identity, anonymous read-only FDs, source replacement,
snapshot/reference budgets, cancellation/reset and stubborn native cleanup.
The 10 MiB diagnostic streams 160 chunks of 65,536 bytes and records event-loop
turns without a latency threshold or live-throughput claim.

Both-editor fixtures cover staging/removal/file-only sending, unchanged undo/
text/focus, destination retention, old ACKs versus newer files/text, stale handles,
no send on Enter/write, no backend startup from ordinary buffers, and status-only
progress. Synthetic-clock notification fixtures exercise 60-second holds,
ACK-before-release, exact-send exclusion, other-client same-account events, room
switches, overflow, disable/mute/disconnect, cached/missing rooms, visibility,
privacy and expiry without refreshing original evidence.

Retained early failures: Vim's fixture-only read-only `count` variable, assuming
FD cleanup after one tick, and reattach racing empty-directory housekeeping.
Known-refusal HTTP fixtures consume the body so an early socket reset is not
mistaken for an observed status. A synthetic-clock fixture initially failed to
reset its creation clock between cases; the corrected fixture passes in both
editors. Assertions were retained. Only evidence/status docs change after this
gate and receive final documentation/integrity checks.

No live Webex/OAuth/upload/receipt/device/desktop acceptance occurred, no grants
or installed configuration changed, no original build or active editor was
replaced. No commit, push, activation, opener or download was performed.
