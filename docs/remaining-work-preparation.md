# Prepared work after A2: A3, A4 and Phase 5

Status: **approved preparation record, subsequently implemented and strict
offline-verified**. A3, A4 and Phase 5 have separate passing full gates. The
original requirements below are retained,
not rewritten as test results. The [remaining-findings plan](remaining-findings-plan.md)
and [verification index](verification-index.md) carry current evidence.

## Sequence and gates

1. A2 prerequisite is complete: retain its passing end-to-end integration gate
   and receive/sink/graphics evidence.
2. A3: one revocable typed-open waiting intent behind background previews.
3. A4: extract mechanisms proven equivalent by corrected specialized paths.
4. Phase 5: named options; pure projections then destination state; shared limit
   fixtures; configuration catalogue; current docs and reproducible runbook.

Freeze source/commit and original bundle hashes per runtime batch. Add a failing
regression or source-backed characterization first; refactors need not invent old
bugs. Keep independent safety/work guards, drafts/undo/annotations/focus checks.
Run focused backend/helper/both-editor/drawn checks then full copied-project gate.
Missing editors remain skips. No installed settings, hot-source, reconnect,
live OAuth/Webex/receipts/devices, tool installation or activation.
Preparation does not authorize an automatic commit.

## A3: one waiting intent, not a retry queue

### Source seam

`ContentAdmission` has worker-lifetime explicit/image flags and rejects contention.
`MessageImages.load()` owns image admission for previews;
`MessageAttachments.resolve()` reserves explicit plus image lanes for typed `open`
before GET, even for unknown files later classified as text. Store-level
`imageLoading`/`attachmentLoading` are extra admission, not proof of physical
settlement. A1 deliberately returns busy here.

A2's explicit pipeline reservation remains distinct from physical work and A3's
waiter. Never queue by retrying failed `resolve()` or polling a replaceable store.

### Proposed policy

- One **typed `action: 'open'`** may wait only behind a **background preview**
  when no competing explicit pipeline exists and destination is valid. Unknown
  typed files qualify because A1 reserves image admission before metadata.
- Downloads retain existing explicit admission; other explicit reads/converters/
  transfers return busy, not a generic queue.
- Backend retains identities/action, detached selectors, request ID, owner/
  destination generations, abort signal and deadline. **No fetched bytes,
  metadata, URL, credentials, argv or save destination**. Native captured
  configuration/context stays editor-local, independently revoking the intent.
- First valid waiter wins. Second receives bounded busy; no silent replacement.
  Cancellation can revoke the first, followed by a new explicit user intent.
- Proposed maximum wait: **ten seconds from enqueue**, nonrenewable. GET/raster
  clocks start on admission; transfer clock starts at descriptor creation.
- Wake on actual settlement, not caller timeout. Keep one waiter/settlement listener/
  expiry timer, no polling. A valid waiter takes priority over the next preview;
  do not abort/replay the current preview or permit preview starvation of the waiter.
- On wake atomically revalidate session/grants/exact store/destination/loaded file/
  request/abort state and acquire lanes once. Native context remains independently
  checked before outcomes. Cancel removes waiter synchronously; departure/return
  cannot revive it. Failures are terminal: **zero or one GET, never retry**.
- Stubborn work retains physical admission even after the waiter expires.

Use role-aware worker tokens (`preview`, `typed-open`, legacy explicit), not two
booleans as queue policy. Engine owns the worker-lifetime waiter; API/store layers
validate without competing queues. Typed pending/cancel registration covers waiting.

### Legacy scope, slices and acceptance

Dedicated `:WebexImage` uses legacy `messages.imageOpen`, different native cancel/
context behavior, and possibly image-only identities. Initial A3 scope is **general
typed attachment open**; legacy image methods remain immediate busy/error.
Broadening requires a reviewed cancel/adapter contract, not silent handler-policy
reuse. Document/test this boundary. Local zero-fetch snapshots remain outside it.

1. Characterize preview contention/stubborn cleanup across API/store/session
   replacement; record GET/converter/max-overlap counts.
2. Add role-aware owner and one cancelable waiter/expiry, fake-clock and gated-
   settlement tests, without rendering coupling.
3. Integrate typed request/native cancellation and bounded local waiting feedback,
   not a new remote progress capability.
4. Both-editor/drawn actual command → RPC → content fixtures, then full gate.

Require zero typed GETs while waiting; settlement gives one GET if valid, otherwise
zero; second waiter rejected; preview pressure cannot starve a valid waiter.
Cover enqueue/cancel/wake races, ten-second edge, old timer/exit, aborted parent,
presentation versus reload, cursor away/back, grant/disconnect/helper failure,
active A2 transfer and noncooperative work. Maximum native overlap remains one;
no reselect, receipts, tool launch or reset of failed automatic attempts.

## A4: narrow shared local primitives

Re-inventory **after A2**, not just before its helper protocol changes.

| Specialized path | Candidate mechanism | Policy staying specialized |
| --- | --- | --- |
| `autoload/wbx/attachments.vim` | Job stop, stdin EOF, bounded callbacks, serial-aware exit | Text/original validation, selectors, prompt/save ownership |
| `autoload/wbx/image_external.vim` | Job/EOF pieces, guarded terminal creation | Image context/format, preview lease/fallback |
| Future A2 sink | Helper generation and small-message framing | Integrity/prepare/complete/commit, spool/snapshot |
| `autoload/wbx/notifications.vim` | Reference tests for revocation versus physical exit | Notifier/fallback/privacy, not migrated merely for similarity |
| Node lease helpers | Exact cleanup/bounded reader if duplication survives | PNG/text checks, save permanence, phases/deadlines |

C2/C3 hook/stubborn-process regressions are prerequisites, not permission to erase
differences. Proposed boundaries:

- **Native job adapter:** platform start/stop/close-stdin, literal argv, explicit
  callbacks; no replacement/retry/focus or meeting/process-group teardown.
- **Guarded terminal:** prepare blank owned buffer; capture window/buffer/tick/
  prior hide policy; recheck hooks and caller validity; return **actual terminal
  buffer and job**. Full Vim's replacement terminal buffer remains explicit.
- **Lease owner:** separate intent, actual job generation, revocation and settlement.
  Revoke launch immediately; exact cleanup follows caller policy/real settlement.
  Old callbacks cannot stop replacements; restore only settings the launch owns.
- **Pure Node utilities if warranted:** bounded framing/exact-file operations,
  not universal `finally rm`, shared format validator or broad directory cleanup.

Migrate one primitive/one caller at a time, retaining public entrypoints/assertions.
Never share blanket timeout/kill/leave policy with independently owned meetings
or merge native and standalone owners.

Retain `test/editor/{attachments,typed-attachments,image-terminal-hooks,image-opening,notification-cancellation}.vim`
and Node lease tests. Cover reentrant disconnect/replacement, rename/annotation/
OptionSet hooks, actual Vim terminal wipe, foreground/EOF/partial-helper lifetime,
0700/0600 modes, exact cleanup and exclusive no-symlink save. Claimed overlap fixes
need their own failing reproduction, not moved code.

## Phase 5: small architecture slices

### R1 — Named options and explicit defaults

Current seams: `EditorEngine.start(mode, path, readStatus, peopleStatus,
upcomingMeetings, spacesCache, notificationPreview)` and `wbx#select(id, focus?,
allow_read?, reload?)`; worker dispatch branches over positional combinations.

Introduce named **internal** start/select options; retain public TS/Vim/Lua
compatibility adapters. Table-test focus/reload/resume/receipt consent and optional
sources. Preserve omission versus false, backend default-false preview consent
versus native default-on excerpts, focus-neutral programmatic selection. No view
helper decides receipts. Do R1 before ownership moves.

### R2 — Pure projections, then destination controller

Existing `autoload/wbx/{rooms,history,view,paging,unread}.vim` already own useful
seams; do not create a parallel projection layer.

1. Characterize `s:render`, `s:history_view`, structural/decorative keys; move pure
   projection decisions into existing modules. Writes/hooks/focus stay in owner;
   preserve caches, not new whole-state JSON keys.
2. Characterize drafts/replies/sends before moving `s:drafts`, `s:reply_targets`,
   `s:sends`, `s:uncertain` and compose/destination logic. Controller keys include
   session/room/reply parent, never just visible room. Native edits/undo are user-owned.
3. Move one transition at a time. Keep display, authority, delivery evidence,
   transport and meeting owners separate.

Test rename/promote/annotations, draft switching/replies, unknown delivery, late
ACK after room/session change, automatic receipt failure memory, cached-space
browse-only state and local unread hints independently. Enter/write never send;
no receipt/outcome replay. Keep paging/syntax/status/image work guards and hooks.

### R3 — Names, units and shared boundary fixtures

Rename general selectors such as `s:image_target()` only after characterization.
Distinguish request/intent/session/lease/native-job generations; use `decodedBytes`,
`base64Bytes`, `textLines` and unit-bearing times without unrelated churn.

Add a versioned language-neutral boundary fixture read by TS/Vimscript/Node helper
tests: source/PNG/text maxima, base64 lengths/pad bits, A2 totals and UTF-8 envelope
counting. Assert production implementations independently agree; do not replace
independent validators with one shared assertion. Equal numbers need not mean
equal semantic limits.

### R4 — Native configuration catalogue, not wire authority

Characterize Lua forwarding in `lua/wbx-tui/init.lua`, native
`wbx#commands#options()` normalization and private `session.start` defaults.
Handlers/local destinations/callbacks are **not** remote-wire settings.

One native catalogue supplies key/default/category/Lua forwarding eligibility,
instead of another whitelist. Keep callbacks separate; preserve boolean forms,
nested meeting merge and unknown-option behavior. RPC remains a strict explicit
allowlist with translation tests, not catalogue auto-forwarding.

Test actual `setup(...)` and globals: extension/MIME opt-outs, malformed selected
versus unrelated handlers, download directory, `notifications.preview=false`,
read/people/cache/upcoming flags. No user config mutation, tools or extra grants.

### D2 — Current guidance and verification navigation

Start with [the verification index](verification-index.md) prepared here. Separate
source boundaries/full/focused gates/editor skips/live acceptance. Docs passes
cannot replace runtime gates; preserve historical hashes/counts and dated
“uncommitted”/missing-editor statements.

Derive/check keys/commands/features/options against existing command and R4
catalogues. Extend `test/documentation.test.ts` and native help checks, not another
manual default table. Distinguish proposals and legacy limitations from runtime.

### D3 — Versioned optional performance runbook

Inventory existing private-PTY/whole-editor fixtures, then promote an explicit
reproducible local command. Isolate HOME/XDG/runtime/config and synthetic providers/
copied builds; disable inherited live/media/graphical opt-ins. No attachment to the
user's editor, installation, automatic live profiling or reconnect.

Record distributions/work counts at 50/200/500 messages and 435 rooms: unchanged
updates, scroll, forced repaint, structural replacement including redraw. Separate
startup/projection/validation/JSON/helper/graphics/provider time; include A2 whole-
transfer time/event-loop gaps. Sanitized counts/enums only, not excerpts, identities,
URLs/tokens/blobs. Optional timings, never fragile CI thresholds.

## Completion and stop conditions

Each slice needs scoped diff, source/evidence manifest, focused results, full-gate
totals/skips and unchanged original bundles. Explain regressions, never relax
fixtures. New wire names, queue scope/deadlines or ownership beyond approval return
to review. Personal Sections stay blocked on public API/SDK support, no private
endpoints/scraping. Progressive startup and live acceptance remain separate.
