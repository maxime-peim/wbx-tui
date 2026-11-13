# Optional Webex read-status SDK

Install from the checkout root with `npm run install:read-status`. This uses this
directory's independent, pinned lockfile and disables dependency install scripts.
The baseline `npm ci` does not install this SDK tree.

This is distinct from `npm run sdk`, which fetches the browser SDK for **live
meetings**. REST-only messaging and local messaging demos need neither SDK;
meeting demos need Chrome but not the Webex browser bundle. See the
[feature-specific prerequisites](../../docs/editor.md#live-oauth) and
[runtime source map](../../docs/architecture.md).

`read_status = true` is the native editor default; false/0 opts out. The SDK
remains an optional, separately installed dependency: nothing installs or connects
automatically. Explicitly connect with `:Webex`. The OAuth integration needs
`spark:all` (including its `spark:kms`
grant) for SDK event/read-status APIs. No scopes or private OAuth JSON are changed
automatically. `:WebexDemo` never starts the SDK or contacts Webex.

Only room, membership, message-event, authorization, logging and their supporting
plugins are registered. No meeting plugin, browser, media capture or transmission
is used. The engine passes access credentials to a separate Node child over
private IPC, with in-memory SDK storage and discarded SDK output. Refresh tokens
stay with the existing OAuth owner. Token rotation replaces the SDK child.

Sender names have a separate session flag, enabled by default by the native
client; `notifications.sender_names=false` opts out. Omitted lower-level flags
still default false. Private `start.senderNames:true`
requires `preview:true`; only then may validated public `data.personId` become
`senderId` in worker IPC. The engine strips raw IDs before editor RPC and resolves
profiles through its bounded public-REST name directory, not the SDK child. No
People plugin/dependency or grant expansion is added. Default native sessions may
perform bounded known-person lookups using existing grants.
See [the sender-name contract](../../docs/sender-names-design.md).

The SDK brings a substantial legacy dependency tree, including deprecated
transitive packages. It is isolated here rather than making those dependencies
mandatory for the native REST client. Disabling `read_status` is the rollback;
the editor then uses the original REST-only messaging path.
The lockfile overrides legacy `form-data` to the compatible 2.5.6 security patch
to address its boundary-randomness and multipart-injection advisories. Other
legacy moderate-severity advisories remain; isolation is not a claim that the SDK
dependency tree is vulnerability-free. The metadata worker accepts no arbitrary
service URLs and enables the SDK's catalog-URL validation.

Read markers come from `rooms.listWithReadStatus()` / `getWithReadStatus()` and
their actual `lastActivityDate` / `lastSeenActivityDate` fields. Missing or failed
status is **unknown**, never silently read. Message and membership events fetch
authoritative status; infrequent reconciliation covers missed events. Polling and
focus-neutral programmatic selection never send receipts. With sync enabled,
`mark_read_on_open` defaults true: a successful, uncanceled explicit open of an
unread space at its known latest, completely displayed message sends one receipt
through `memberships.updateLastSeen()`. The last wrapped body row must be visible
and unfolded; clipped/incomplete, capped older, edited/empty history or unavailable sync cannot
acknowledge it. The attempted endpoint is retained after failure/unknown outcome
so reopening does not automatically retry it. Server confirmation, not an ACK,
clears unread emphasis. Set `mark_read_on_open=false` for manual-only behavior;
**`:WebexLatest` then `R`** in unedited history remains the explicit receipt alternative.

**Implemented receipt-safety boundary:** native automatic/manual paths require
the known-latest complete body endpoint to be genuinely displayed, including
closed-fold and final wrapped-row checks; folds are never forcibly opened. The
isolated SDK adapter retains the real public `updateLastSeen` → acknowledge →
prepare → submit chain, but installs a per-receipt one-shot native request below
SDK interceptors. SDK error/key-rotation responses cannot initiate a detached
second submission; redirects, access-token-refresh replay and reused-socket
transport retry are disabled for that receipt. Failure/unknown consumes the
single attempt. Non-receipt discovery is not replaced or given these mutation
semantics; the pinned SDK/transport versions are checked and unsupported upgrades
fail closed. No `node_modules` edits are required.

Independent one-shot review, network-blocked actual-SDK checks and the integrated
offline build/editor gates have passed. They are **not** live receipt acceptance.
See [current implementation evidence](../../docs/implementation-progress.md).
For read-only inspection, set `mark_read_on_open=false` before connecting and do
not use manual mark-read. Polling/status discovery is not a receipt.

Initial room discovery and SDK status loading run concurrently. The first
populated editor list combines both results; it shows an explicit loading state
in the meantime. The SDK fetches its first snapshot without waiting for event
subscriptions, then reconciles once more after subscription setup to cover the
startup gap. Failure/cancellation is bounded and does not leave REST messaging
blocked indefinitely.

### Personal/direct-space names

Pinned SDK 3.13.0 checks a conversation's `computedTitle` but mistakenly emits
`displayName` instead when building read-status rooms. One-to-one and personal
spaces often have only the computed title, so they used to lose their names.
The isolated SDK adapter promotes that server-computed title on a returned copy
before the SDK's list/get projection. Explicit display names still win; SDK
caches, dates and original conversation objects are not modified.

This is a local compatibility shim, not a dependency/node_modules patch or a new
lookup: it adds no HTTP, people/membership requests, OAuth scopes or receipts.
REST/SDK metadata merging retains a known name when a later title is missing.
Genuinely unnamed direct spaces say `Direct conversation`; no peer identity is
guessed from message authors. The actual pinned-SDK contract test covers list,
get, explicit/computed/personal/missing names, unchanged caches and receipts with
all network blocked.

### Background recovery

One failed event lookup invalidates only that room's status; other confirmed
statuses stay available and later events still run. Listener failure or an SDK
error event falls back to periodic server status discovery (normally every
60 seconds, plus request time). A failed background full fetch invalidates its
stale snapshot but keeps the next periodic fetch scheduled, so successful server
data can restore styling without reconnecting. The visible notice distinguishes
polling, partial unknown status and a refresh awaiting recovery. Only read-only
status discovery is repeated: never OAuth authorization, device registration or
read receipts. Fatal worker/IPC failures still stop sync and expose only a fixed,
validated reason code in editor health; SDK error text remains private/discarded.
Metadata publication is batched on a short bounded interval and unchanged health
is not repeatedly published. Full reconciliation is admitted between event
lookups so sustained slow metadata traffic cannot indefinitely starve it; deadlines
stop the worker or retain native admission rather than accumulating abandoned
requests. Request deadlines stop the optional worker and require an explicit
reconnect; settled read-only service failures may recover on the next cycle.
Fairness/overflow, never-settling work and unchanged watchdog-heartbeat cases pass
the integrated offline checks; consult the current progress record for evidence.

The event coordinator retains at most 64 queued/in-flight room identities in total.
Queued rooms stay deduplicated until actual lookup admission. Events during the
active lookup set one dirty bit and reserve a follow-up behind queued peers, even
at capacity; they cannot turn a deadline into a replacement native request. Overflow
and unadmitted receipt-completion metadata hints remain covered by periodic full
observation. Receipt mutation admission, uncertainty and one-shot transport are
unchanged; only metadata reconciliation is deduplicated.

Peer `memberships.seen` events are ignored only when the pinned public event's
actor/member/creator metadata and canonical same-namespace PEOPLE IDs confidently
prove another reader. Self, missing, contradictory or unknown identities still
reconcile. Other membership/room events and message evidence are not actor-filtered.
The actual pinned public listener is covered with all network blocked: 100 peer
reads cause no lookup, while self reads still do. No people/identity request,
scope, OAuth grant or device registration is added. See the
[reconciliation contract](../../docs/editor-protocol.md#read-status-event-reconciliation)
and [current batch evidence](../../docs/remaining-findings-plan.md).

Startup failure codes now distinguish `sdk-load`, `sdk-ready`, `device-register`
and `initial-snapshot`, with a fixed problem class, for example
`device-register:denied`, `sdk-ready:deadline` or `initial-snapshot:network`.
Only known HTTP status/network error codes are classified; error messages,
server bodies, paths, hostnames, credentials and stack traces are never included.

Separate R6 research characterizes pinned reaction internals and searches for
native personal Sections providers, with transport/registration blocked:
[reactions report](../../docs/reactions-research.md) and
[Sections report](../../docs/native-sections-research.md). After explicit
internal-interface risk approval, the [reaction implementation](../../docs/reactions-implementation-plan.md)
adds a narrow typed request to this existing worker, not a new device/SDK owner.
Native reactions default on, with an explicit opt-out and no automatic writes.
The receipt-only one-shot fence is unchanged; a separate
reaction fence protects exact add/remove requests. Known reaction activities are
filtered before the public SDK discards their type on deletion. No new
registration, scope, live probe, activation or dependency migration is approved.

Offline contract command (no account; all network blocked):

```sh
WBX_READ_STATUS_SDK_TEST=1 node --import tsx --test test/read-status-sdk.test.ts test/reactions-sdk.test.ts
```

This command includes the actual pinned Node SDK's network-blocked contract;
the receipt fixtures retain its public acknowledgement chain down to the native
submission boundary. Historical results remain in
[editor validation](../../docs/editor-validation.md); current one-shot/fairness
evidence belongs in [implementation progress](../../docs/implementation-progress.md).
It does **not** establish live organization-policy, event-stream or cross-client
interoperability; those still require authorized acceptance.
The prior approved startup diagnostic restored aggregate read status with
mark-on-open disabled; it was not cross-client/receipt acceptance. See
[the live record](../../docs/live-acceptance.md).
