# A1 checkpoint: single-fetch typed attachment opening

Status: **approved, implemented and strict offline-verified; not activated**.
Committed with framing in `bd4a5d5`; later “uncommitted” statements describe their
historical evidence boundaries.
The user approved implementation after reviewing the summary. The behavior in
[attachments](attachments.md) remains authoritative for the current sources. This
proposal belongs to [Phase 4/A1](remaining-findings-plan.md#phase-4--explicit-attachments-and-large-transfers);
it neither completes A2–A4 nor authorizes live acceptance, a rebuild or restart.

## Recommendation and alternatives

Use one new capability-gated RPC for an explicit open/download intent. Send a
bounded **selection policy**, containing only extension/MIME keys and whether a
match requires original bytes. Obtain safe metadata from one authenticated GET,
choose a representation, and consume those same bytes. Return **either** original
bytes **or** a normalized PNG, never both. Executables, arguments, terminal choice,
download directory/destination and credentials remain outside this RPC.

This avoids a server-side byte-handle registry and metadata/continuation round trip.
The cost is a small, strictly validated selection policy and cross-language tests
for the exact matching semantics. Do not silently truncate that policy.

Not recommended for this batch:

- Generic-read then image-read: reproduces the duplicate GET and accidental 6 MB
  limit on native images.
- Return original and normalized data together: unnecessary decode/conversion work,
  memory amplification, and two near-limit blobs cannot fit the current event cap.
- Return originals for conversion in the editor/helper: 8 MiB originals cannot fit
  the current base64 event, and this moves conversion/admission ownership.
- Fetch, return a metadata handle, then resolve: workable but adds retained originals,
  expiry/cancel state and another RPC. Do not implement it incidentally. If policy
  forwarding is rejected, review that alternative first: worker/account/session/
  request/store/destination binding, one retained original at most 8,388,608 bytes,
  a fixed nonrenewable TTL, single-use resolution and release on completion,
  cancel/expiry/replacement would all be mandatory. Expiry must not free an active,
  noncooperative native operation's admission slot.

## Observed seam and ownership at the frozen design checkpoint

The pre-A1 code followed these paths (retained as the reproduction baseline):

1. `WebexMessagingAPI.message()` registers opaque SHA-256 identities independently
   in `MessageAttachments` (first ten files) and `MessageImages` (first four).
   Registrations retain private allowlisted contents URLs, not original bytes.
2. `wbx#attachment_open()` selects the cursor's loaded message/file. A ready inline
   image with no handlers can go straight to `messages.imageOpen`, or reuse an
   existing image snapshot. Other files go to `messages.attachmentOpen`.
3. `EditorRPC` strictly admits identities; `EditorEngine.openAttachment()` binds the
   result to the current store/session; `MessagingStore.openAttachment()` checks
   selected room, readiness and loaded message/file membership before and after
   the request. Selection/reload/close abort the work and advance its epoch.
4. `MessageAttachments.open()` performs a bounded content GET and returns sanitized
   metadata plus original base64. In native code `s:handler()` chooses by extension
   before MIME. Without a handler, a supported raster calls
   `wbx#attachment_image()`, issuing **another** `messages.imageOpen`.
5. `WebexMessagingAPI.openImage()` can register the generic reference in its image
   reader, so attachments five through ten can render. `MessageImages.openNative()`
   performs its own original GET, checks MIME/signature, and converts those bytes.
   Raster and optional braille conversion already share this second read's bytes.
6. `wbx#attachment_context()` checks serial, window, buffer, exact cursor row,
   selected room, unchanged history and loaded message/file identity. These guards
   run again at materialization and launch boundaries. They are separate from
   backend destination checks and native job/file-lease generations.
7. `EditorRPC` replaces successful large results in its replay table with a small
   one-shot error. Neither original bytes nor detailed image results enter engine
   snapshots or space caches. Timeouts abort callers, but reader/converter cleanup
   retains the underlying reader's admission until it actually settles.

Two important differences need explicit treatment: the generic reader requires
HTTP **200**, while the image reader currently accepts `response.ok` (including
206); generic and native-image input/time limits also differ. This proposal does
not pretend they are already interchangeable.

## Approved wire contract

These private protocol names are now implemented. Protocol version remains 1;
advertise `attachment-typed-open-v1` only when all
request/result/cancel validation and native integration are present. Old methods
and their old result shapes remain unchanged for old clients.

```ts
// JSON-RPC envelope id is the operation identity; no second client-chosen ID.
// Method: messages.attachmentResolve
type Resolve = {
  roomId: string; messageId: string; attachmentId: string;
  action: 'open' | 'download';
  selectors: { key: string; use: 'original' | 'native' }[];
};
type InlineBase64 = { mode: 'inline'; encoding: 'base64'; data: string };
type Resolved = {
  meta: { id: string; name: string; mime: string; sourceBytes: number };
  body:
    | { kind: 'original'; decodedBytes: number; text: boolean; payload: InlineBase64 }
    | { kind: 'png'; decodedBytes: number; width: number; height: number;
        lines: string[]; payload: InlineBase64 };
};
// Method: messages.attachmentCancel; only for this connection's typed operation.
type Cancel = { requestId: number }; // result: null; absent/finished target is a no-op
```

Reject unknown fields, coercion, duplicate selector keys and invalid discriminants.
Room/message IDs use `chatId`; file IDs remain 64 lowercase hexadecimal characters.
The full request stays at most 32,768 UTF-8 bytes. Selection policy limits:
**128 entries / 24,576 serialized UTF-8 bytes**, keys at most 129 ASCII
bytes. Only exact lowercase MIME keys or extension keys producible from a sanitized
120-character basename are useful; include `.` for extensionless/trailing-dot
names. Ignore locally unreachable keys without normalizing them into new matches.
An oversized useful policy fails locally before a GET; it is never truncated or
retried through the old two-read path. This is an explicit new policy bound, not
a new bound on the user's stored configuration.

For downloads, send `selectors: []`; local handler configuration is irrelevant.
Native configuration, not remote metadata, builds the open policy:

- A present empty dictionary `{}` maps to `native` and suppresses MIME fallback.
- Every other present value maps to `original`, including a malformed handler.
  Validate only the **selected** real handler locally before launch. An invalid
  selected handler remains an error, never permission for native/OS fallback.
- A non-dictionary handler table fails locally; unrelated invalid values must not
  invalidate a different selected handler. No executable/configuration value is
  serialized into the policy.

Capture a detached handler-table revision and image mode for the intent. Before
dispatching the result, resolve the metadata against that captured table and verify
the current relevant configuration still agrees. Changes cancel the intent; they
must not launch a newly configured program or automatically refetch. The native
editor, not Node, still validates the executable, literal argv, terminal support
and current context. Policy hints select data representation; they grant no ability
to run a program, access a destination path or fetch a different object.

## Selection and one-fetch algorithm

1. Check handshake, policy, current session/store and loaded destination, and acquire
   the native admission described below **before** calling fetch. No HEAD, range,
   metadata probe, token refresh, registration request or automatic recovery GET.
2. Fetch only the registered exact `https://webexapis.com/v1/contents/...` URL,
   with the current Node-held token, `GET`, `redirect: 'error'`, `Accept: '*/*'` and
   the operation's abort signal. Require exact **200** for the new method, never
   follow redirects or accept 204/206/error bodies. This tightens the new typed
   image path relative to legacy `response.ok`; do not silently change the legacy
   image/preview readers during A1. Provider failures expose only bounded local
   messages, not URLs, headers, tokens or response text.
3. Reuse the existing basename sanitizer and normalized MIME grammar/default.
   They are hints, not execution authority. Compute the final extension of that
   **sanitized** name exactly as native `fnamemodify(name, ':e')` does, then lowercase
   it and prepend `.`. Test parity rather than assuming Node `extname()` is identical.
4. A present extension selector wins, even when `native`; only an absent extension
   selector permits MIME lookup. Otherwise use native behavior. Download or a
   selected `original` route uses the generic original-byte budget. An unhandled
   supported raster MIME uses the native-image budget. Other unhandled data uses
   the original-byte budget for text/binary classification. Do not sniff arbitrary
   MIME into a decoder; PNG/JPEG/GIF/WebP require matching signature **and** MIME.
5. Enforce the chosen declared/streamed byte limit before retaining excess input,
   with at most 8,192 body chunks, abort checks around each read, and bounded reader
   cleanup. A missing/understated Content-Length never bypasses the streamed cap.
   Reject malformed or negative supplied lengths; length is not proof of content.
6. Return originals unchanged for handler/download/text dispatch. For the raster
   route, invoke an extracted **Node-private bytes-to-image** function on this same
   bounded buffer; it must not re-register a URL, fetch, or call `openImage()`.
   Preserve explicit raster coders/stdin, first-frame choice, aspect ratio,
   no-upscaling, process/output limits, no delegates and no shell. Derive braille
   from these bytes unless an existing matching bounded preview supplies it.
   Decoder/signature failure is an error, not a fallback GET or external launch.
7. Recheck ownership/destination after every asynchronous boundary and before
   emitting a one-shot result. Original buffers stay operation-private and become
   unreachable after processing/cleanup; no byte lookup handle is published.
8. Native code validates the result and policy/metadata agreement, rechecks context,
   then adapts **one** body to the existing text/file helper or image viewer.
   The generic-result path must no longer call `wbx#attachment_image()` on the new
   capability. No helper is allowed to fetch or convert by URL.

One *successful new* open without a reusable snapshot therefore has exactly one
content GET. Invalid/busy/canceled-before-fetch intents have zero; a failed/canceled
fetch has at most one. Independent inline previews are outside this count and must
be counted separately in fixtures, not hidden. An explicitly separate download or
new retry is a new intent, not reuse of cached originals.

## Limits: preserve categories, remove the accidental generic-image cap

| Route | Original input | Returned decoded body | Other bounds |
| --- | --- | --- | --- |
| Download, matching handler, or generic native text/binary | 6,000,000 bytes | Same original bytes, at most 6,000,000 | Read deadline 30 s |
| Unhandled supported native raster, whether previously previewed or not | 8,388,608 bytes (8 MiB) | Normalized PNG at most 6,000,000 bytes | At most 1600×1200; native image budget 10 s as below |
| Native text view | Subset of generic route | Original text bytes | At most 1,048,576 bytes / 20,000 lines; strict UTF-8 and control checks |
| Every inline result | N/A | Exactly one body | At most 8,388,608 UTF-8 bytes for complete JSON-RPC record, excluding newline |

This deliberately corrects the current inconsistency: an **unhandled** 7 MB raster
will open natively even with unrelated handlers or without a preview. It will
**not** become a valid 7 MB download/handler payload. Selecting a handler must not
silently fall back to PNG to evade the 6,000,000-byte original-byte limit. PDF/SVG
never acquire raster privileges. These are decimal MB versus binary MiB, not
interchangeable labels.

The approved timeout detail: generic pre-header discovery has a
30 s ceiling. When headers select native raster, shorten the deadline to **10 s
from the first GET**, not ten new seconds after metadata/read/each converter.
If that budget is already exhausted, abort without conversion/refetch. Known native
image-only operations keep their existing ten-second deadline. An unknown response
that never supplies headers can wait up to thirty seconds because its type is not
yet known; no *successful* typed raster result gets more than the ten-second work
budget. Header arrival must not reset either clock. Existing per-process kill
limits remain, and deadlines do not release physical admission early.

`sourceBytes` is the actual bounded received byte count; `decodedBytes` is the
actual returned representation length, equal to source size only for originals.
Both are safe integers. Maximum base64 is `4 * ceil(6,000,000 / 3) = 8,000,000`
ASCII bytes. Metadata, braille, discriminants and the RPC envelope must fit in the
remaining event budget. Count UTF-8 bytes, not Vim character count or JS code units.
Never raise transport/helper caps to accommodate an 8 MiB base64 original.

Validate exact fields, canonical base64 alphabet/padding/pad bits, encoded length,
decoded length and per-kind bounds before any visible side effect. Native validation
can check length/final quartet without allocating a second decoded blob; helpers
still independently decode and verify canonical round trips. PNG dimensions and
signature must agree with converted bytes. Original-helper validation of text,
private file ownership/mode and exclusive destinations remains independent.

## Lifetime, cancellation, admission and snapshots

No transient handle or persistent original-byte cache is proposed. Nevertheless an
operation needs an unforgeable internal owner tuple: RPC connection/worker,
account/session generation, monotonic envelope request ID, exact store instance,
destination epoch and room/message/file IDs. Native context additionally binds its
transport generation, intent serial, window/buffer/row and configuration revision.
Do not use attachment hash, room ID alone, state revision or a temp-file lease
serial as a substitute. Unchanged presentation updates do not cancel valid work.

Admission is worker-owned, surviving store/account replacement until old
native work actually settles:

- One **explicit content operation** at a time across new and legacy explicit reads;
  do not rely only on a replaceable store's boolean. This owns network/read/cleanup
  lifetime, not just the promise returned to the RPC caller.
- A typed `open` reserves the existing shared image-native lane too, before GET,
  because an unknown type may need conversion. Downloads/original-only legacy
  reads do not need that lane. Preview batches own the image lane as before.
- A1 rejects known contention before fetching; it does **not** implement A3's queue.
  This conservatively also rejects an unknown typed open that would later prove
  to be text while a preview is busy. That is a declared tradeoff, not a claim of
  improved text concurrency. A3 may retain at most one still-valid explicit intent,
  with no original bytes, then admit it once; it must not retry a failed GET.
- At most one explicit original buffer (8,388,608 bytes) and one independent
  background-preview input (8,388,608 bytes) can be logically owned; a download
  concurrent with preview uses only 6,000,000 of the explicit budget. Typed opens
  exclude simultaneous preview work. Derived PNG/RGB, one-shot serialization,
  bounded output queues and existing bounded preview caches are additional memory;
  this is **not** an 8 MiB process-RSS guarantee. Bound/release reader parts and
  concatenate only once, rather than retaining unnecessary duplicate originals.

Cancel on cursor/context departure, navigation/reload, buffer/window ownership
loss, session/account replacement, relevant grant loss, disconnect, new conflicting
intent or deadline. Explicit cancellation addresses only the still-registered typed
request on the same connection and matching owner; absent/finished/foreign targets
do nothing. A stale cancellation/completion cannot clear a newer operation's busy
state. Navigation away and back cannot revive a canceled intent. Auto-command
reentrancy must be checked before buffer writes and program launch.

Cancel revokes publication/launch immediately, aborts the stream/converter and
releases queued/operation data once safe. A noncooperative fetch, read, native child
or cleanup retains its admission until actual settlement/exit, even after the
caller receives cancellation/timeout or the account is replaced. No timeout may
start overlapping replacement work. Already-emitted results cannot be retracted;
native guards must discard them and release local files. Once a user-approved
exclusive save is committed it remains a download, not a temporary lease to delete.

An image buffer remains an explicit, memory-only **presentation snapshot**, usable
without reselecting a room or authorizing another GET. Preserve that zero-fetch
reopen and the existing clean history-image snapshot shortcut when no handlers
need metadata; bind history shortcut provenance to the originating session and
destination. Any retained safe metadata must be bounded and never include original
bytes. Do not use an image snapshot as original bytes for a download/handler.
Text buffers remain separate, editable, hook-safe and undoable; do not overwrite
annotations or commandeer a user's named/changed buffer. Keep terminal leases on
the actual `term_start()` buffer. Meetings keep their independent owner/teardown.

## Replay, old backends and the A2 transfer boundary

Add the new success result to the existing one-shot replay policy: retain only
request fingerprint/tombstone and a small explicit-new-ID error, not body data.
Pending duplicates, reused IDs and expired IDs never fetch or convert again.
Cancellation replays are harmless and must not acquire a fresh target. Outcomes
are ordered mandatory output barriers, never coalesced presentation state. If an
output cannot be admitted within the existing bounded queue, fail closed rather
than silently dropping it or emitting half an attachment.

Compatibility is deliberately honest:

| Backend support | New native client behavior |
| --- | --- |
| `attachment-typed-open-v1` | Use typed request/result/cancel; one-fetch guarantee applies |
| Existing `message-attachments` / `image-opening` only | Retain legacy explicit behavior and existing limits, clearly labeled legacy/two-read where applicable; no claim of single-fetch support |
| Image-only projections | Retain existing image-only fallback and index 1–4; do not guess missing attachment identities |
| No suitable capability | Explain update/rebuild/restart requirement; no URL guessing, opener, automatic reconnect or transport downgrade |

Never try the legacy path automatically after a typed request fails, times out,
returns a malformed result, or advertises a capability it cannot honor. No duplicate
GET, weakened validator or surprise tool launch masquerades as compatibility.

A1 uses **inline base64 only** under unchanged byte/record limits. A2 first fixes
incomplete-frame scanning/copying independently in `EditorLines` and native
transport, with fragmented Unicode/base64 work guards; no chunk protocol is needed
to establish one-fetch semantics. Do not bundle that runtime fix into this design.

If measured JSON/serialization stalls remain, extend the **same `payload` field**
with one separately negotiated transfer descriptor, not another attachment-handle
mechanism. Before implementation, specify fixed decoded/encoded totals, owner and
transfer identity, bounded chunk size/number and outstanding credit, strictly
contiguous sequence/offset, canonical per-chunk base64, end digest/total validation,
cancel/expiry and final completion. Reject gap/duplicate/reordered/foreign/late
chunks and early/extra completion before materialization. Stream backpressure must
bound total pending output; chunks are not permission for an unbounded queue or a
larger attachment. Inline is the fallback only **before** dispatch, never a retry
after a transfer starts. No chunk capability, records or handles are added by A1.

The framing-only runtime fix has since passed its strict gate. The separate
[A2 transfer contract](attachment-transfer-design.md) was separately approved and
implemented with this shared payload extension and end-to-end incremental sink.
See [current evidence](verification-index.md) for its integration gate.

## Required implementation acceptance

This is the acceptance contract. Focused implementation evidence follows; the
full strict integration gate is recorded in the remaining-findings plan.

| Area | Required adversarial fixture |
| --- | --- |
| Actual native key -> RPC -> API | Both editors, unknown/unpreviewed raster, unrelated handlers, file 7/10, known inline image: exactly one authenticated content GET; clean snapshot reopen: zero; no HEAD/probe/POST/receipt/identity lookup |
| Policy parity | Extension over MIME; explicit empty extension suppresses MIME; upper-case suffix; extensionless/trailing-dot/multiple-dot names; sanitized RFC filename; matched invalid handler errors; unrelated invalid handler does not; oversized policy rejected before GET |
| Data provenance | Converter and braille see the exact fetched buffer; originals hash-identical in handler/download; detailed raster is original-derived, not upscaled preview; no originals in state/cache/replay/logs |
| Limits | Each of 6,000,000 and 8,388,608 at minus-one/exact/plus-one; raster source >6 MB native success but handler/download rejection; normalized output >6 MB rejected; complete worst-case UTF-8 envelope fits 8 MiB |
| HTTP/media | 302/307/204/206/403/429; malformed/missing/lying length; partial/stalled stream and cleanup; MIME/signature mismatch; octet-stream PNG stays generic; SVG/PDF never reaches raster decoder |
| Native validation | Canonical/noncanonical pad bits, malformed base64, mismatched declared lengths/kind/PNG dimensions, unknown keys, cross-file result, oversized line/text and malformed UTF-8; no partial visible result |
| Ownership/replay | Delayed headers/read/conversion/cleanup across stop, grant loss, account replacement, same-space reload and cursor away/back; pending/finished/reused IDs; cancel races with completion; no stale busy reset or publication |
| Admission/A3 seam | Busy preview -> zero typed GETs under A1; timed-out noncooperative native operation blocks replacement across API/store replacement; A3 queue deferred, not implied by an A1 busy result |
| Local lifetime | Download prompt cancel, exclusive existing/symlink destinations, unchanged private modes/cleanup, foreground GUI/terminal exit, actual Vim terminal buffer, hostile/reentrant hooks, annotations/undo/drafts/focus preserved |
| Compatibility/pressure | All capability combinations, no failure-triggered downgrade/refetch, old result shapes unchanged; slow output preserves ordered one-shot outcome within current bounds; no new meeting ownership policy |

Implementation follows checkpoint approval and failing one-fetch/native policy
fixtures against the frozen baseline. Run focused backend/helper/both-editor
and drawn fixtures, then the full copied-project strict gate. Keep root bundles,
installed configuration, sessions and all live-provider/device tests untouched.

## Historical design checkpoint evidence (offline, 2026-11-13)

Frozen post-B4 sources and original bundle hashes:
`/tmp/opencode/wbx-a1-design-w0ar78e6/baseline.json` and `before/` (**283 source
files / ten original bundle-map files**). Reproducer: `run-baseline.py`,
`baseline-backend.mts`, `baseline-native.vim`, results `native-baseline.json`.

All six cases reproduce **two content GETs to the same registered endpoint**:
unpreviewed image, unrelated `.pdf` handler, and attachment seven, each in Vim and
Neovim. Startup/account ownership is a synthetic fixture; native command dispatch,
RPC, engine/store/API, both content readers and installed raster conversion use
the frozen actual code. All HTTP-shaped calls use an injected local fetcher, global
fetch is forbidden, inline previews and receipts are disabled, and no external
handler is launched. This is a work-count reproduction, not a live latency claim.

The first custom fixture timed out because it emitted snapshots without advancing
the engine revision. `earlier-fixture-startup-failure/` retains that run; the fixture
was corrected to call the real `publish()` transition. No product source was
changed to obtain those six reproductions. At that checkpoint runtime implementation
and new regression tests were pending. A2 framing/chunking and live acceptance
remain pending after A1 implementation.

At the design checkpoint, existing frozen-code checks passed: **35 media/backend/helper tests** and
**six native fixtures** (attachments, image opening and terminal hooks in both
editors), all with zero skips. Logs: `existing-media.log`, `existing-native.log`.
That checkout's **three documentation checks** passed. `checkpoint-integrity.json`
and `checkpoint-source-manifest.json` recorded **284 source files at that point**: only
this new design and edits to `attachments.md` / `remaining-findings-plan.md` differ
from baseline. All 283 frozen files and all ten original bundle/map hashes remain
unchanged then; no runtime/test edit, active build or installed-session action occurred.
That was a focused design/baseline check, not a new full runtime gate; B4 was still
the latest full gate at that checkpoint.

## A1 implementation evidence

Implementation baseline (after design documentation, before runtime/test edits):
`/tmp/opencode/wbx-a1-_wfq28y9/` (**284 frozen files / ten original bundle-map
hashes**). `verify-regressions.py` runs identical final fixtures on pre-A1 and A1
copies. All **19 new backend feature tests** fail on the absent pre-A1
method/policy and pass on A1; this is feature-absence evidence, not nineteen
independently attributed old bugs. Both native fixtures independently record the
actual same-object content GETs: **2 → 1** for unknown image, unrelated handler
and attachment ten. Snapshot reopen remains zero-fetch.

Focused coverage includes boundary sizes for both original budgets, strict status/
length/signature validation, no MIME sniffing, policy precedence, grant/destination
loss, exact request cancel, one-shot replay, shortened-from-GET deadlines, stalled
cleanup and worker admission across API replacement. Native tests cover originals
to GUI/actual Vim terminal buffers, downloads, configuration/cursor revocation,
canonical pad bits/PNG dimensions, the exact 6 MB / 8 MB base64 boundary, and a real
`BufNew` hook that disconnects before image writes. Shared filename cases test Vim
and Node final-extension parity. Existing real converter tests remain separate
from the new native fixture's deterministic CPU converter seam.

Retained fixture-development failures include an unqualified variable in an
`eval()` wait and a `BufAdd` hook that did not run for an unlisted `bufadd()` buffer.
The final fixture uses `BufNew` and asserts the hostile hook actually ran; no
product assertion or protocol check was weakened to pass it. Logs and frozen
regression copies remain alongside `regression-summary.json`.

A2 framing/chunking, A3 queueing and A4 shared-helper extraction remain separate.
Native/backend activation, installed configuration and live tests remain untouched.

The complete strict copied-project gate
`/tmp/opencode/wbx-a1-verification-c4jmy7ly/` passed: **539 core passes / 12 opt-in
skips**, **40 Neovim + 39 Vim fixtures / zero editor skips**, **27 Neovim + 26 Vim
drawn fixtures**, **95 SDK**, **44 messaging** and **three browser-control checks**.
TypeScript, all five copied builds, documentation and native help in both editors
passed. LazyVim remains one pass / one optional installed-loader skip. All **290
source files** matched source/staged manifests, and all ten original bundle/map
hashes remain unchanged. Only this document's evidence/status and the plan evidence
changed after the gate; finalization rechecks documentation and both manifests.
Changes remain uncommitted, inactive and separately approval-gated for live use.
