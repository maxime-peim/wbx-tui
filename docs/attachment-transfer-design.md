# A2 checkpoint: bounded typed-attachment transfers

Status: **approved, implemented and strict offline-verified; not activated**.
This continues [A2](remaining-findings-plan.md#phase-4--explicit-attachments-and-large-transfers)
after its verified framing fix, extending [A1's payload boundary](attachment-open-design.md#replay-old-backends-and-the-a2-transfer-boundary).
The user approved this contract before the separate implementation batch. Approval
does not authorize activation, live testing, larger file limits or A3–A4.

## Evidence and recommendation

Retained maximum-record receive medians are **55.875 ms Neovim / 68.376 ms Vim**,
including JSON decode; separate decode medians are **28.016 / 34.423 ms**, and
Node serialization's median is **6.159 ms**. See [distributions and scope](performance.md#remaining-large-record-pause-chunking-is-a-separate-checkpoint):
these synthetic unknown-response measurements exclude typed validation, helpers,
rendering and live latency. They justify smaller payload records, not a zero-stall
claim.

Source inspection also finds full base64 passed through native `json_encode()` to
`attachment-lease.mjs` / `image-lease.mjs`, whose input is one accumulated JSON
document. `lua/wbx-tui/images.lua` builds a whole Kitty transmission with
`table.concat()`. Splitting backend output and then joining at these boundaries
would merely move the pause.

Recommend **receiver-driven stop-and-wait pulls, one chunk of credit**, only for
explicitly opted-in typed results. Retain one short-lived selected representation,
with its descriptor in the existing `payload`, not a second attachment-fetch API.
Keep segmentation through local helpers and the optional graphics writer.

Alternatives not selected: unsolicited push/windowed notifications, arbitrary
JSON/state chunking, shared-path RPC, a reusable blob cache, URLs, larger payloads,
or reassembling a giant local-helper document. The tradeoff is up to **123 local
pull round trips** plus sink acknowledgements. Measure total transfer time and
event-loop gaps before declaring success; do not silently widen credit for speed.
Legacy image and large state records can still pause.

## Approved wire contract

These names/shapes are implemented. Protocol stays version 1.
`attachment-chunks-v1` is advertised only alongside `attachment-typed-open-v1`;
activation remains gated on the complete passing implementation.

```ts
// messages.attachmentResolve: existing identities/action/selectors, plus:
type TransferChoice = { transfer?: 'chunks-v1' };
// Omitted => exact existing inline result. Opted in => chunks at EVERY size.

type ChunkPayload = {
  mode: 'chunks'; encoding: 'base64';
  requestId: number;       // Original attachmentResolve envelope ID
  transferId: string;      // 16 random bytes, 32 lowercase hexadecimal characters
  encodedBytes: number;    // 4 * ceil(body.decodedBytes / 3)
  chunkBytes: 49152;       // Decoded bytes; divisible by three
  chunks: number;          // ceil(body.decodedBytes / chunkBytes)
  sha256: string;          // 64 lowercase hexadecimal characters; decoded bytes
};
// Resolved.meta/body stay as A1. Only payload becomes InlineBase64 | ChunkPayload.

// messages.attachmentChunk
type Pull = {
  requestId: number; transferId: string;
  seq: number; offset: number; // zero-based sequence / decoded-byte offset
};
type Chunk = Pull & { decodedBytes: number; data: string };

// messages.attachmentComplete
type Complete = {
  requestId: number; transferId: string;
  chunks: number; decodedBytes: number; encodedBytes: number; sha256: string;
};
type Completed = { requestId: number; transferId: string; complete: true };

// messages.attachmentCancel stays { requestId: number } -> null,
// now covering the original operation through transfer completion/expiry.
```

Reject unknown/missing fields, coercion and invalid discriminants. IDs keep the
positive 31-bit bound. Each control uses a fresh increasing envelope ID;
`requestId` always names the original resolve, not the pull. Transfer IDs are
connection-local correlations, not authorization, file names or reusable byte
handles. No unsolicited chunk notification.
All counts, lengths, sequences and offsets are nonnegative safe integers, with
exact derived bounds; no fractional, nonfinite or out-of-range values.

| Quantity | Bound |
| --- | --- |
| Selected representation | Unchanged: at most 6,000,000 decoded bytes |
| Original/raster source | Unchanged: 6,000,000 / 8,388,608 bytes |
| Chunk | At most 49,152 decoded / 65,536 base64 ASCII bytes |
| Full chunk response / helper chunk line | 69,632 UTF-8 bytes excluding LF |
| Descriptor response / other transfer control records | 8,192 UTF-8 bytes excluding LF |
| Chunk count | 0–123, derived exactly from total |
| Credit | One outstanding pull / one unacknowledged local sink chunk |
| Registry | One live selected representation per worker |
| Lifetime | 30 seconds from descriptor creation, nonrenewable |
| Idle timeout | Five seconds without a completed protocol step, capped by lifetime |
| Global request/event ceilings | Unchanged: 32,768 / 8,388,608 UTF-8 bytes excluding LF |

69,632 is a **narrower response/helper bound**, not an increased request limit:
payload data never travels back to the backend. Errors are small and sanitized.
Other state/meeting records retain existing limits. The generic native framer
still allows 8 MiB records; do not claim it rejects a malicious oversized chunk
before JSON decode. Compliant producers generate bounded chunks.

Still enforce the equivalent A1 inline-envelope ceiling, using bounded metadata
accounting without constructing it. Chunking cannot enlarge the admitted body.

## Ordering, integrity and completion

Let `N = body.decodedBytes`, `K = 49152`, `C = ceil(N/K)`.

1. Validate descriptor, exact file, captured policy and echoed original request
   against its pending native intent before accepting data.
2. Require `seq` contiguous from zero, `offset = seq*K`, and exactly
   `min(K, N-offset)` decoded bytes. Reject gaps/repeats/reorder/overrun/empty chunks,
   changed totals and foreign identity. No pipelining: the next pull acknowledges
   consumption of the previous chunk.
3. Independently canonical base64 per chunk: exact alphabet/quartets/padding/pad
   bits, encoded and decoded lengths. Nonfinal chunks have no padding; final
   three-divisible lengths also have none. Helpers independently decode and verify
   canonical round trips.
4. Local sink incrementally hashes decoded bytes and requires exact count/totals,
   descriptor SHA-256 and all per-kind predicates before reporting **prepared**.
   Digest detects corruption/mixing, not provider trust or execution authority.
5. Only then send `attachmentComplete` with independently verified totals/digest.
   Backend checks all chunks were sent once, atomically terminates the transfer
   and returns `Completed`. No bytes remain replayable.
6. Only after that response and another native context/configuration check may
   a buffer be populated, graphics submitted, a tool launched or a save requested.
   Private spool preparation is not visible success. Lost/failed completion means
   discard, never inferred success.

For zero-byte originals, count/encoded length are zero and SHA-256 is the empty
digest; no pull is valid, but prepare/complete still occur. PNG remains at least
45 bytes with A1 signature/dimensions/braille checks. Early/extra completion and
post-terminal pulls fail without refetch.

## Ownership, admission and replay

Bind transfer to **worker/connection, account/session generation, exact store,
destination epoch, original request, room/message/file, action and representation**.
Extend ownership beyond `EditorEngine.resolveAttachment()`'s current `finally`:
deleting its operation there would lose post-descriptor cancellation/invalidation.
Registry lookup never bypasses current destination/grant checks.

Native context additionally binds transport generation, intent serial, window/
buffer/row and detached configuration revision through completion. Departure/
return never revives intent; presentation-only changes do not cancel it. Recheck
at every async boundary, including before enqueueing outcomes.

Hold **one logical explicit pipeline reservation** from pre-GET admission through
completion/cancel/expiry and physical cleanup. Otherwise current reader return
would free explicit admission while a retained transfer still exists. Competing
legacy explicit reads share this reservation without changing wire shapes.
Release the separate image-native lane only when conversion/cleanup actually
settles, not on caller timeout; do not hold it during transfer/save prompts.

Retain one immutable chosen representation: at most 6,000,000 decoded bytes **or**
its bounded 8,000,000-byte canonical base64 form, not both persistently. PNG
transfer retains no original raster. Encode/hash bounded slices, not a full
serialized resolve. Converter buffers, independent preview, sink spool and PNG
snapshot are additional memory/disk; this is not an RSS guarantee.

Cancel addresses the original request before/after descriptor. Cancellation,
expiry, grant/session/store/destination loss, disconnect and shutdown immediately
revoke publication, stop pulls and release owned data when safe. Queued records
cannot be recalled; native guards discard late responses. Noncooperative network/
converter/cleanup retains physical admission until settlement. Old exits cannot
free new owners. A committed download survives later cancellation.

Resolve/chunk **successes** retain only small one-shot RPC tombstones/fingerprints,
not descriptor handles or chunk data. Reused/expired IDs cannot fetch or advance.
Two fresh envelope IDs for one sequence are an error, not extra credit. Completion
may retain its small ordinary result, delivered once by the native intent.
Cancel replays are harmless; absent/finished targets are no-ops. Matching-transfer
malformed/order errors revoke it; unknown/foreign identities cannot cancel another
owner.

## Backpressure and fairness

All transfer outcomes remain **ordered mandatory barriers** in existing bounded
output, never coalesced presentation. Unrelated state/meeting/control/evidence may
interleave; sequence, not adjacency, defines a transfer. Do not reserve stdout.

Keep one pull response admitted until its write callback **and required drain**
settle. Add a narrow per-record completion facility, not `await flush()` on all
unrelated output or another unbounded Promise queue. Future pulls while the prior
response is queued cannot advance. Global byte/record overflow stays fail-closed.

Native issues the next pull on a scheduled timer turn only after local sink ACK.
At most one such timer exists: no recursion consuming all chunks in one callback.
Blocked helper input grants no next credit. Failure/timeouts cancel, not retry.

## Local sink and segmented PNG presentation

Preflight bundled local Node/helper availability before selecting chunks/GET.
No automatic installation or post-dispatch fallback. The specialized sink is part
of A2 approval, while shared-helper extraction remains A4:

- Literal argv/private stdio; versioned ready response within ten seconds. Strict
  bounded framing/phases/fields; one acknowledged chunk at a time. No network,
  shell, credentials or executable settings in remote-content RPC.
- After descriptor send `begin` with exact safe metadata/totals, sequenced `chunk`
  records, then `prepare`. Canonical decode/hash streams to an exclusively created
  0600 spool in a 0700 directory, at most 6,000,000 bytes.
- Prepare independently checks totals/digest, strict UTF-8/control/1 MiB/20,000-line
  text eligibility (agreeing with the declared flag), and PNG signature/declared
  dimensions as applicable. Small prepared reply only, never another large
  encoded document.
- After backend completion, native may issue one local `commit` for a foreground
  lease, bounded text read, or explicitly prompted exclusive save. Recheck after
  prompts/hooks. No chosen destination is touched before verification/consent;
  `wx` rejects existing files/symlinks. Remove failed partial saves only when this
  helper owns that exact new file.
- EOF/error/cancel removes only owned private resources. Existing foreground/
  30-minute lease lifetime remains; committed saved files survive helper exit.

The new chunk sink's physical process slot survives revocation, disconnect and
editor-backend replacement until its exact exit callback. Closing stdin/requesting
stop is not settlement; a stubborn helper cannot overlap a replacement sink.
Existing foreground-handler/viewer busy rules remain independently enforced.

Local ready → descriptor wait is at most 45 seconds (30-second fetch plus proposed
A3 ten-second wait and margin), then at most 30 seconds to prepare/commit; receiving
also obeys the backend's earlier transfer expiry. No partial input/heartbeat renews
clocks. GET/raster deadlines remain 30/10 seconds from GET, not extended by transfer.
Slow valid users may time out; recovery requires a new explicit intent.

For PNGs, retain validated pieces in an immutable **local presentation store**,
one committed detailed snapshot plus at most one bounded in-flight candidate,
under new local snapshot keys. Preserve the old snapshot if the candidate fails.
Buffer/placement metadata references those keys, not whole deep-copied chunk lists.
Neovim receives pieces into
Lua incrementally; full Vim uses a bounded segmented store without Lua. Never
marshal/join the whole list at registration/render. Local keys are not wire handles.

After completion, transfer snapshot ownership to the image view and remove the
validation spool. Keep original source provenance and zero-GET reopen, including
without a backend/reselect; never use a PNG snapshot as download/handler originals.
Protect edited/promoted/named buffers and annotations; release storage on actual
owner loss/replacement.

A completed snapshot carries local completed-publication evidence and verified
totals/digest. Explicit snapshot reopen can feed those pieces to a new local PNG
lease, independently rechecking them, **without** another remote descriptor/pull/
completion, current grant requirement or GET. It retains the existing snapshot
context/configured-viewer guards; it never becomes an original-byte download.
The remote transfer completion gate applies to new remote results, not local
reopening of an already completed presentation snapshot.

For this new path, a generation/route-bound scheduled graphics writer submits at
most sixteen existing 4 KiB base64 Kitty packets per turn (65,536 payload bytes,
plus bounded escapes), retaining an iterator/one scheduled batch, not a giant
packet string. Placement is ready only after final transmission. Cancellation/
route change/write failure stops pending batches, cleans only the correct route
and retains readable braille, never launches an opener. Keep `q=2`, tmux wrapping,
existing placement ownership and legacy inline preview support. This bounds
application submissions, not terminal-internal buffering.

## Compatibility and implementation gate

| Support before dispatch | Behavior |
| --- | --- |
| Both capabilities and local sink ready | Explicit `transfer: 'chunks-v1'`, pull/complete flow |
| Typed only | Existing A1 inline resolve/cancel |
| New backend, old client or omitted choice | Exact A1 inline shape, no unsolicited chunks |
| Legacy attachment/image only | Existing honestly labeled legacy behavior/limits |
| Chunk advertised without typed; malformed descriptor/wrong mode | Protocol failure, no downgrade/refetch/launch |
| Local sink preflight fails | Fail before resolve/GET, no automatic installation |
| Any failure after opted-in resolve | Cancel/discard; retry only as a new explicit user intent |

No legacy HTTP/MIME, selector, undo/modeline, receipt, notification privacy, meeting
ownership/transmission or tmux appearance changes.

Implementation order after explicit approval: (1) private
representation/owner, validators/replay/cancel and actual output completion;
(2) incremental helper and both-editor sink state machine; (3) segmented snapshot/
graphics and zero-fetch reopen; (4) pressure/compatibility/measurements and full
copied-project gate. Advertise capability only when all are integrated.

Required adversarial fixtures:

| Area | Acceptance |
| --- | --- |
| Bounds | 0/1/2/3, K−1/K/K+1, 6 MB−1/exact/+1; unchanged raster 8 MiB source bounds; UTF-8 envelopes/helper caps |
| Integrity | Pad bits, nonfinal padding, truncation/extra bytes, digest/length mismatch, wrong PNG dimensions, false text; no visible partial success |
| State | Gap/repeat/reorder/foreign/late data, concurrent pull, two IDs/one seq, early/extra completion, lost final response, zero-byte case, replay after >64 RPCs |
| Ownership | Cursor away/back, relevant config change, hooks, reload, grant/session/disconnect/cancel at each boundary; no stale busy reset |
| Physical lifetime | Noncooperative fetch/converter/helper cleanup blocks overlap; one retained transfer; canceled prepared data cannot launch |
| Pressure | Block write callback/drain separately, preserve control/evidence interleaving/global bounds; stalled sink grants no pull |
| Outcomes | Byte-identical handler/download, exclusive/no-symlink saves, text undo/focus/annotations, actual Vim terminal buffer/foreground lease |
| Presentation | Zero-GET reopen; no original cache or aggregate base64 JSON/join/Kitty packet; bounded work/turn; cancellation/UI-route change during graphics |
| Fallback | Every matrix row, old shapes unchanged, no failure-triggered refetch |
| Measurement | Independent byte/record/pump counts; receive/validation/helper/materialization/graphics distributions, whole-transfer time and event-loop gaps |

Keep independent A1 single-fetch, framing, output, helper, both-editor and drawn
regressions. No timing CI thresholds. Full gate includes core, blocked-network SDK,
synthetic messaging/browser controls, five copied builds, help/docs and explicit
editor/optional-loader skips. No live acceptance.

## Checkpoint evidence

Frozen **`bd4a5d5`**, **292 tracked files / ten original bundle-map hashes**:
`/tmp/opencode/wbx-a2-contract-1sqe5lnx/{baseline.json,before/}`.
`check-contract-bounds.mjs` / `contract-bounds.json` check arithmetic/encoding only:
nine byte sizes through 6,000,000; maximum 123 chunks; largest sample chunk envelope
**65,709 bytes**, worst valid-kind metadata descriptor **2,105 bytes**, equivalent
inline envelope **8,001,913 bytes**. Not production validators, performance or implemented
transfer acceptance.

Focused checkpoint verification passed: **89 unchanged backend/helper/documentation/
harness tests**, **14 strict native fixtures** (seven each editor), **zero skips**,
and TypeScript. These check existing seams and proposal links, not chunk behavior.
Final documentation/help and source/build-integrity checks also passed; see the
[plan](remaining-findings-plan.md#a2-transfer-contract-checkpoint-and-follow-on-preparation).

Those checks describe the historical design-only checkpoint, not the subsequent
runtime implementation. The implementation froze **295 sources / ten original
bundle-map hashes** in `/tmp/opencode/wbx-a2-chunks-vs9s978v/` before editing code.
Its identical final feature fixtures fail **45/45** on the frozen absent feature
and pass **45/45** on A2; both new native integrations fail on absence and pass
with chunks. This is feature-absence evidence, not 45 independent historical bugs.
Additional native fault/lifetime fixtures cover bad digests/sequence/completion,
context/config revocation, canceled save, real disconnect hooks and a stubborn
sink across backend replacement. Neovim graphics guards execute the real scheduled
writer: at most 65,536 payload bytes per turn, without a whole-PNG packet/join.

[Performance evidence](performance.md#a2-chunked-attachment-pipeline) records both
shorter event-loop gaps and slower whole-transfer throughput. The
[verification index](verification-index.md) and [plan](remaining-findings-plan.md)
record integrated verification separately. [Follow-on preparation](remaining-work-preparation.md)
keeps A3/A4/Phase 5 separate; no installed settings, root build or sessions changed.

The complete strict gate `/tmp/opencode/wbx-a2-chunks-verification-m64ak5ii/`
passed: **592 core / 12 opt-in skips**, **44 Neovim + 43 Vim fixtures / zero editor
skips**, **31 Neovim + 30 Vim drawn**, **95 SDK**, **44 messaging** and **three
browser-control checks**. TypeScript, five copied builds, documentation and both
native help checks passed; LazyVim remains one pass / one optional installed-loader
skip. All **304 source files** matched gate manifests; ten original bundle/map
hashes stayed unchanged. Finalization rechecks evidence-only status updates,
documentation and integrity. Nothing was committed or activated by this gate.
