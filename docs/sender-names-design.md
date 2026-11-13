# F1 sender identity and notification names

Status: **Phase 1 implemented and strict offline-verified; uncommitted/inactive**,
following the user's “GO” on the
[delivery plan](messaging-feature-plan.md). No live acceptance or activation.
Frozen baseline: `9aeedd8`, 319 sources and ten original bundle/map hashes,
retained at `/tmp/opencode/wbx-sender-names-_urx_qua/`.

## Consent and compatibility

**Later user-requested native default:** sender labels now default **on**, with
`notifications.sender_names=false` as the explicit opt-out. Preview=false still
hides both name and excerpt; source/RPC omitted flags remain false and native
negotiation is explicit. See the [defaults follow-up](people-popup-design.md).
The original F1 boundary below records its former default-off policy; its
budgets, identity/privacy rules and historical gate counts are unchanged.

- New nested option `notifications.sender_names` defaults to false. It is effective
  only with enabled message notifications and previews. `preview=false` suppresses
  both sender and excerpt. Existing room-title controls remain independent.
- Negotiate `sender-names-v1` and an explicit default-false `senderNames` startup
  flag. Older backends get no unknown parameter and retain excerpt-only behavior.
- This opt-in also enables shared-cache display names for loaded history; default
  sessions gain **no new People requests**. No second history-name toggle is added.
- No automatic reconnect or scope expansion. Known `spark:people_read` or
  `spark:all` is required before lookup. Missing grants retain existing history
  labels and excerpt-only notifications, never expose an email/ID as a name.
- When global events are enabled, their existing private worker start receives
  additional sender-ID consent only with excerpt consent and known lookup grants.
  The worker forwards a validated observed sender ID, never a profile or name.
  The engine resolves names; no lookup is added to the metadata/receipt worker.
- Off-space sender IDs stay private to Node. Editor events carry only a sanitized
  optional sender name under explicit state-level consent. History source IDs
  stay separate from labels and are not used for peer/ownership authority.

## One bounded backend owner

The editor engine owns a session-resettable name directory for both loaded history
and consented fresh message events. No constructor/getter/render path fetches.

F1 limits:

| Budget | Limit |
| --- | --- |
| Current relevant identities | 128: up to 64 recent history senders plus 64 fresh event senders |
| Profile result cache | 256 entries, including memory-only negative results; positive names optionally persist under the verified account/profile |
| Pending distinct identities | 32; live-event identities precede background history |
| Physical requests | Two across session/grant replacement, including draining old work |
| Request starts | Parallel pairs, at most two per rolling two seconds; server Retry-After can only extend this |
| Positive refresh eligibility / maximum display age / negative retry | Six hours / 24 hours / 30 seconds |
| Request deadline | Eight seconds; abort does not release physical admission |
| Response bounds | Existing independent People decoder: 64 KiB / 1,024 reads |
| Name | 120 Unicode code points / at most 480 UTF-8 bytes, bounded input |

Use fixed-origin public known-person GETs, no directory enumeration, avatar loads,
redirect following or SDK dependency change. Match response ID/type and discard
unrelated profile fields. Unknown/empty names do not become manufactured names.
Names are presentation, not presence or membership evidence.
The name owner reuses the existing People start-budget primitive but retains its
own admission, cache, grant, denial and Retry-After state. No worker/thread or
increased sustained request rate is added. Two available slots start together,
including with fast responses; cancellation and account replacement cannot
reset the spent budget or release physically held requests.
The current follow-up retains a previously verified same-session display name
while refreshing it (including transient refresh failures), rather than briefly
falling back to an email at each refresh. Session/grant replacement or a
latched denial still clears that presentation cache. Direct-room title metadata
likewise retains a known human label over a transient email fallback, while
accepting real new names and leaving group titles untouched.

Observe explicit store/event transitions, deduplicate queued/in-flight IDs and
negative-cache failures. Cancel irrelevant work, clear identity/cache on every
session/grant replacement, and ignore old completions. Preserve physical slots
until native request and body cleanup actually settle. A 401/403 latches this
directory unavailable until session/grant replacement; ordinary same-grant token
renewal cannot reset it. No auth retry.
With `spaces_cache=1`, only positive names and their actual success time persist
in the [received display cache](received-cache.md). Verified restart restoration
does not repeat fresh name GETs; failure/serialization cannot renew name evidence.

## Notification timing

Publish creation evidence immediately, with a cached name if available. Async name
resolution may update the same event's presentation, but never increments its
creation count or refreshes its observation timestamp.

The native owner may enrich only an **already queued, not yet dispatched** alert,
matching room and exact last included message ID. Coalescing replaces the excerpt,
message ID and name together. No waiting for a lookup, second notification or
post-dispatch update; a slow lookup simply leaves the original alert excerpt-only.
Recheck current sender/preview consent on every dispatch and fallback.

Names and profile data never enter persistent spaces/unread caches, health output
or logs. Existing exact plugin-send exclusion, other-client same-account events,
stale read-status rules, draft/undo/focus ownership and meeting lifetime remain
independently tested.

## Offline verification

Full gate: `/tmp/opencode/wbx-f1-verification-bzl8zlyk/`, using a private copied
project, HOME/config/cache/state and existing dependencies, with no installation
or live/media opt-ins. `summary.json`, `sources.json` and individual gate logs
retain the exact boundary. Core test concurrency was four.

| Check | Result |
| --- | --- |
| TypeScript and all five copied builds | Passed |
| Core | 634 passes / 14 explicit opt-in skips |
| Native editors | 46 Neovim + 45 Vim fixtures / zero editor skips |
| Private-PTY drawn | 33 Neovim + 32 Vim fixtures |
| SDK/read-status/cache suite | 145 passes, including six actual pinned-SDK fixtures with all networking blocked |
| Synthetic messaging/extensions / browser controls | 44 / 3 passes |
| LazyVim | One pass / one optional installed-loader skip |
| Native help | Passed in both editors |

All 324 sources matched their copied manifests at the gate; all 319 frozen
pre-F1 sources and ten original bundle/map hashes remained unchanged.
Finalization changes only documentation/status and rechecks docs/integrity.
The SDK/cache tier is a wider selection than the prior 95-test gate; counts are
not 145 distinct live-SDK scenarios.

Focused evidence remains in `/tmp/opencode/wbx-sender-names-_urx_qua/`.
`provider-before.log` records the expected missing-module baseline;
`protocol-before.log` proves the frozen baseline rejects the new consent while
accepting excerpt consent. `native-feature.log` retains the first fixture-only
failure (unsupported third `strftime()` argument in both editors); later logs
and the full gate use portable UTC timestamps, without weakening assertions.

Coverage includes consent off/on/default/legacy fallback, missing grants,
validated REST sender IDs, cache sharing/deduplication, rename presentation and
retention, bounded queue/cache/relevance, request spacing/Retry-After, negative
results, denial latching across ordinary credential renewal, delayed fetch/body
cancellation, physical slots across replacement, old/irrelevant completions,
strict IPC, Unicode/markup, same-account other-client messages, exact local-send
exclusion, unchanged creation evidence, queued-only enrichment/coalescing,
privacy revocation at dispatch/fallback, annotation preservation and zero backend
startup from the native name fixture.

No live Webex, OAuth, receipt, device, desktop-notifier or installed-loader
acceptance is implied. SDK service/device boundaries and notifier commands in
these tests are synthetic. Installed configuration, original builds and active
editors remain untouched; activation requires a separate draft-safe rebuild and
explicit session restart, never hot-source, automatic reconnect or scope expansion.
Later roadmap phases remain planned.
