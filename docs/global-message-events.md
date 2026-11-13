# Confirmed message events outside the selected space

**Current policy supersedes the historical same-account correction below:**
the user now requires suppressing all self-authored messages, including sends
from another client. Muted rooms and unknown live mute preferences are suppressed
too. Modern selected-space alerts use actor-aware creations rather than REST
history, preventing self echoes and double notifications. See
[current suppression policy](notifications.md#current-suppression-policy).

**NC1 follow-up:** [consistency contract](native-consistency-design.md) adds a
deduplicated generic unread-activity fallback during `polling` only, with fresh
continuous authoritative metadata. It also completes exact deletion/access-loss
invalidation and bounded selected-history reconciliation. The gates below
predate NC1 and remain historical, not acceptance of that follow-up.

**Preview follow-up:** off-space notifications now support bounded excerpts,
enabled by default; `notifications.preview=false` keeps them metadata-only.
Native clients still explicitly negotiate the source-side flag before text is
forwarded. See [preview contract and current gate](notification-previews.md).
The gates below predate this extension and remain historical evidence for the
global-event and same-account corrections.

**Sender-name follow-up:** `notifications.sender_names=true` additionally opts
into validated names; default sessions remain excerpt-only with no new People
reads. Only independently consented IDs reach the Node name directory, never
editor RPC. This supersedes historical identity-omission statements only under
that opt-in. See [F1 contract](sender-names-design.md).

## Same-account correction — confirmed sender detail

**F3/F5 follow-up:** uploads and recipient-first DMs publish fresh same-account
events for a bounded native hold (64 events/90 seconds); exact acknowledged-send
exclusion precedes release. This supersedes snapshot withholding below only for
those logical operations; Node/worker freshness is still 30 seconds. Ordinary
room plaintext sends retain their earlier withholding behavior.
See [upload ordering](uploads-design.md#notification-ordering) and
[F5 contract](conversations-design.md). No capture/release refreshes receipt or
unread authority, and unknown writes never replay.

The user clarified that their reproduction sends from the **same account** in
the native Webex client while Neovim has a different space selected. The previous
change's unconditional `message.self` notification filter suppressed exactly this
case. That filter was my mistake: account identity is not proof that this plugin
sent a message. Room ordering can still update because it does not use that filter.

The account-wide exclusion is now removed. Native/other-client messages from the
same account qualify just like another person's messages. Only exact acknowledged
plugin-send IDs are excluded. To preserve echo suppression even when an SDK event
beats the plugin POST response and the user switches spaces, same-account events
are retained but withheld from snapshots while a local POST is pending. The
delivery ID is emitted first; when the POST settles, eligible native-client events
are released and only the actual plugin send is filtered. Other-account events
never wait. A hung POST can outlast the existing 30-second freshness bound; this
does not add retries or claim an uncertain send succeeded.

The pinned SDK/native fixture now includes **another person's message, a duplicate,
a same-account native-client post and an exact acknowledged plugin post** in the
same unselected, still-server-read space. Exactly the first and native-client post
notify (coalesced into one two-message alert). A separate engine regression covers
the early-echo/pending-POST/space-switch ordering. Focused and full staged checks
pass. The first gate below predates this correction; the latest gate follows it.

## Diagnosis and scope — 2026-11-12

The user reported that only the opened space notified. Their running health showed
`read_status=ready`, no stale/cache rows or notice, and successful desktop
submission. All **435 listed rooms** had known unread flags and `unreadActivity`.
This ruled out missing activity fields and did not support the earlier stopped-sync
theory at that snapshot. It did **not** establish that global events were arriving
or that metadata was advancing.

Source tracing found a concrete loss point: the worker's public SDK `created`
callback discarded the message event after queuing `getWithReadStatus()`. Native
notifications then required unread=true plus a metadata change. A new message
could therefore be lost when the status stayed unchanged/read, including when
another client consumed it. Healthy setup was not delivery evidence.

The new network-forbidden regression exercises the **actual pinned SDK** public
`messages.listen()` -> Mercury activity callback -> `getMessageEvent()` -> message
GET -> worker -> private IPC validator -> engine -> native notification routing.
The real worker executes in-memory with a synthetic process boundary; separate
forked-worker tests exercise the actual private IPC transport and its validation.
The room deliberately remains **unread=false with unchanged timestamps**. The
current fixture produces one coalesced alert for two distinct off-space creations,
including the native same-account send; the duplicate and exact plugin send do not.
This demonstrates and fixes that boundary. It does **not prove the user's live
stream is delivering events**, nor claim live Webex/OS acceptance.

## Implementation and safety

- The existing worker listens exactly as before. Its public created callback also
  projects only `{id, roomId, created, self}` into a separate fixed-25ms batch of
  at most 64 unique events. It never waits for an unread metadata lookup to finish.
- `created` comes from the message, never the SDK listener envelope's creation
  time. Startup/pre-source history, more-than-30-second-old or over-5-second-future
  messages are ignored. This is intentionally not a guaranteed backlog service.
- The SDK listener already fetches each individual message before emitting it.
  The change adds **no network call**, no history fetch and no identity lookup.
  Full bodies, files, actor/person IDs and SDK errors are discarded before IPC.
  A 160-character sanitized excerpt is retained only with explicit preview consent.
  `self` uses only the SDK's already-resolved `internal.me` identity to delay
  account-matching events during a pending plugin POST, never to exclude the whole
  account. Only exact successful plugin-send IDs exclude an event.
- The engine retains at most 64 recent events and 1000 deduplication keys. It
  rechecks shape, age, source generation and session ownership. Event evidence
  is an additive `messageEvents` snapshot field, never persisted or merged into
  authoritative unread observations. Late callbacks after failure/replacement are
  ignored. Failure clears retained items; explicit replacement resets counters.
- Native code consumes events once, groups distinct creations by space and uses
  existing privacy, mute, focus, coalescing, rate and desktop-fallback controls.
  It only notifies listed/non-cached spaces. Selected-space events remain handled
  by the existing content-aware REST observer, avoiding SDK/REST double alerts.
  Initial/disabled/muted/expired/locally-sent events are consumed rather than replayed.
- Native time has one-second resolution; the observation-time check allows that
  subsecond rounding difference without relaxing the 30-second age limit or the
  separate message timestamp check. The real SDK/native fixture covers it.
- Healthy event delivery does not infer notifications from unread metadata.
  NC1's known-degraded fallback consumes matching late creations rather than
  duplicating them. Older backends without this additive field retain their
  legacy activity fallback.

No receipt admission, read-status freshness, persisted flag, local-read overlay,
failed automatic attempt, message send, OAuth/device lifecycle or meeting ownership
rule changes. No additional grant, registration, reconnect or automatic retry.
All work remains uncommitted; installed configuration and the running session are
untouched. Preserve drafts and explicitly rebuild/restart to activate both halves;
do not hot-source the coordinator.

## Safe runtime diagnostics

`notifications.message_events` in `:WebexHealth` contains **only**:

- `state`: listener/source setup state; `live` alone is not proof of delivery;
- `received`: unique valid/fresh creations accepted by this backend source,
  including self/selected events (not all raw wire traffic);
- `other_space`: non-selected creation evidence accepted by native detection,
  before queue/mute/rate/delivery filtering.

No IDs, timestamps, titles, bodies, credentials, paths or command argv appear.
After activation, comparing these counters around ordinary incoming activity
distinguishes missing SDK/worker delivery from native filtering and OS routing.
No fabricated live message or receipt test has been run.

## Verification

Focused checks passed: TypeScript; worker/IPC/engine/fairness tests; all three
network-blocked pinned-SDK fixtures (including the new SDK-to-native path);
pure event detection; headless and private-PTY native routing. Full Vim is not
installed and remains an explicit skip.

Important regressions include unchanging read metadata, same-account native-client
notifications, duplicate/exact-plugin-send exclusion, pending-POST echo ordering,
no selected SDK/REST duplication, stale read-status independence,
initial/reconnect history, privacy allowlists, bounded storage, old-source
callbacks, rejected oversized/duplicate/private IPC, a hung metadata lookup not
blocking creation delivery, and unchanged receipt deadline/one-shot safeguards.

Limits remain explicit: 500 listed spaces, bounded bursts/deduplication, 30-second
freshness and normal notification rate limits; SDK GET/stream errors, delayed or
replayed intervals may lose events. SDK-disabled/unavailable operation still has
only selected-space polling. Real Webex delivery, OS DND and an installed editor's
focus/provider integration remain unverified.

### First global-event staged gate (historical; before same-account correction)

All checks passed in `/tmp/opencode/wbx-global-events-verification-y80669pk/`,
using its `project/` source copy, private HOME/config/cache/state, existing
dependencies without installation and no live/media opt-ins:

| Check | Result |
| --- | --- |
| TypeScript and complete five-artifact build | Pass, staged only |
| Core regression suite | **440 pass, 12 skip, 0 fail** |
| Native editor fixtures | **29 Neovim pass, 29 Vim skip** |
| SDK/worker/cache/persistence, including all three pinned-SDK fixtures | **72 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn private-PTY Neovim fixtures | **16 pass** |
| LazyVim example/spec checks | **1 pass, 1 optional loader skip** |
| Private native help tags | Pass |

Core skips include optional CLI/SDK tiers and unavailable Vim; the three optional
SDK fixtures are covered by the explicit SDK run. Vim and the installed lazy.nvim
loader are not represented as passes. `summary.json` records every return code;
logs are `plugin.log`, `sdk.log`, `messaging.log`, `browser-controls.log`,
`screen-*.log` and `native-help.log`.

At that first gate, all **259 source files** matched their copied SHA-256 manifest,
and all **ten original bundle/map hashes** remained unchanged. Its original
finalization changed only this evidence file. The same-account correction then
changed runtime/tests and documentation; that older manifest is not evidence for
the correction. Use the new gate below for the current source set.

### Same-account correction staged gate

All checks passed in `/tmp/opencode/wbx-global-events-verification-salodxcg/`, with
the same isolated-copy/private-HOME/no-install/no-live-test policy:

| Check | Result |
| --- | --- |
| TypeScript and complete five-artifact build | Pass, staged only |
| Core, including pending-send/space-switch echo ordering | **441 pass, 12 skip, 0 fail** |
| Native editor fixtures | **29 Neovim pass, 29 Vim skip** |
| SDK/worker/cache/persistence, including actual same-account SDK-to-native regression | **73 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn private-PTY Neovim fixtures | **16 pass** |
| LazyVim example/spec checks | **1 pass, 1 optional loader skip** |
| Private native help tags | Pass |

All **259 source files** matched the new staged manifest; all **ten existing
bundle/map hashes** stayed unchanged from this run's original-checkout baseline.
Only this final evidence update follows the new gate; the other **258 sources**,
including every runtime/test change, still match. This run's `summary.json`,
`final-checks.json` and `docs-final.log` record return codes, the evidence-only
post-gate change, documentation recheck and build integrity. Skips remain explicit,
not passes. Installed configuration, the active editor, OAuth/device/receipt/send
lifecycle and original build were untouched; changes remain uncommitted. Live
delivery with the user's clients is still not claimed as verified.
