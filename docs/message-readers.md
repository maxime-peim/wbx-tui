# Who has read a message

Opening a group or person discussion loads one snapshot for the latest loaded
message. In unchanged native history, put the cursor inside any loaded message
and use **`:WebexReadBy` / `<leader>Wav`** (Message actions → Read by…) to inspect
that message or refresh it explicitly. This is a
read-only inspection, separate from **`:WebexMarkRead`** and your own unread flags.
It uses the existing read-status SDK and known grant; `read_status=0` disables it.
There is no new dependency, SDK connection or option. Older backends without
`messageReaders:["watermark-v1"]` report the feature unavailable.

## Display

The originating history window shows `read-by: waiting` while an admitted passive
reaction read drains, then `read-by: loading`. Repeated invocation does not queue
another request. A completed query shows a centered footer at the end of the feed.
In person discussions, the single disclosed reader's name appears without a count:

```text
                         Read by Alice Example
```

Group reader lists are **collapsed by default**, showing `Read by 2 [+]`.
Use **`:WebexReadByToggle` / `<leader>WaV`** (capital `V`) from history to
expand/collapse the current footer locally:

```text
                            Read by 2 [-]
                            Alice Example
                               Bob Chen
                   Partial snapshot · Checked 08:02
```

Each disclosed person has a separate row. The disclosure is virtual presentation,
not a native message-body fold: `za`, message folds, draft/history bytes and undo
are untouched. It sends no request or receipt. Expansion is retained for the
same cached message across live updates, including toggles during a pending read.
New message targets start collapsed. Mapping conflicts/opt-outs retain precedence.

Names are sanitized, with `Name unavailable` for an undisclosed name. Person IDs,
emails, avatars and raw membership fields are not displayed. The sender is
excluded. The most recently inspected loaded message in this room supplies the
footer; the message text is never repeated. The exact target stays bound
internally, not a claim about the whole conversation.
Opening initially chooses the latest loaded message; a later explicit inspection
can choose an older one. Select that message and repeat `:WebexReadBy`
to refresh explicitly. Cursor movement does not change the target or fetch.

Names wrap by display cells in narrow layouts. Like reaction decorations, this
buffer-scoped footer fits the narrowest visible current-tab split; padding is
centered for that width. It does not edit message text, undo, folds, mappings or
the presence gutter, and works with reactions opted out. Focus and scrolling
stay where you left them; scroll to the feed's end to see the footer.

| Evidence | Footer title |
| --- | --- |
| One disclosed reader in a person discussion | `Read by Alice Example` |
| Disclosed group readers | `Read by 2 [+]` |
| No disclosed read-through evidence | `No read receipts reported` |
| No usable result | `Read receipts unavailable` |
| Retained old/failed-refresh result | `Read by 2 (stale) [+]` |

Group counts are the number of disclosed readers, not a complete membership
census. Live coverage remains partial; expanded details label that coverage and
the snapshot check time. That check time is not an individual read time.

An empty/failed result never means “nobody read this” or “Unread by…”. The footer
is a checked snapshot, refreshed by read-watermark events, not presence or exact
individual read times.

## What the SDK actually proves

SDK 3.13 exposes `memberships.listWithReadStatus({roomId})`. Internally it requests
`participantAckFilter:all` and `activitiesLimit:0`; it projects each member's
`lastSeenId` and `lastSeenDate` from the last-seen **activity**, not the instant
that person read the selected message. These are markers, not exact read times;
no exact per-person read time is invented.

Each inspection first gets the exact public message, verifying its room,
identity, original creation time and sender. It then reads one membership
projection for that same room. Valid padded/unpadded SDK IDs are compared by
resource type, cluster and UUID, so regional membership ID normalization does
not falsely make receipts unavailable. Different rooms, clusters or resource
types still fail closed. A reader is included only when:

- their canonical member identity is unique and belongs to the exact room;
- their same-cluster last-seen message equals the selected message with the same
  activity date, or has a strictly later activity date;
- the dates/identities are valid and not implausibly in the future.

Missing/malformed, older and ambiguous equal-time markers do not prove reading.
Presence, reactions, local unread overrides and other people's absence from the
projection are not evidence. The public SDK drops participant coverage flags, so
**live results always remain partial**, including an empty response.

At most 500 membership entries are admitted and at most 128 readers returned.
Oversized or contradictory projections fail closed. There is no paging, directory
scan or extra per-person name lookup. The SDK may bootstrap its own identity
through its existing normal read path; no authorization grant is expanded.

## Lifetime and safety

- Opening/reopening a conversation fetches once; explicit commands can refresh.
  Accepted SDK read-watermark events refresh the currently displayed target.
  Cursor movement, ordinary redraws and expiry do not fetch. A changed source
  clears old evidence without automatically reconnecting or retrying.
- One native cache retains at most **32 message snapshots across rooms** in this
  editor/session/source. Reader names/status are never added to disk caches or
  broadcast in full-state notifications.
- Footers become stale after five minutes or source degradation. A single local
  expiry timer repaints labels; it never performs a refresh or reconnect.
- Changed/deleted loaded messages, annotations, source/account/session replacement
  and opt-out fence cached presentation. A late reply cannot replace another
  message's footer, change a draft or steal focus.
- Parent/worker SDK admission excludes competing reaction operations and receipts
  while an inspection is physically pending. A separately admitted mark-on-open
  receipt can reserve its existing single slot and wait for that read to settle.
  Before its only submission, the engine rechecks session/source, selected room,
  newest loaded endpoint and fresh server status. A changed context, backoff,
  source loss or deadline cancels it without a POST. This is serialization, not
  a receipt sent by Read By or a retry. Existing hard deadlines and process
  teardown remain; UI cancellation does not release native admission.
- A 429 enters existing shared SDK server backoff. No inspection, write, receipt
  or SDK registration is automatically retried by this feature.

The default Wnr member-removal binding, reaction `(you)` markers, strict
own-removal checks and uncertain-write recovery are unchanged. Synthetic/demo
results are not live acceptance; see the [verification index](verification-index.md).

## Subscription

The existing SDK connection's `memberships:seen` events now refresh the footer.
Only validated same-account/source SDK envelopes become **room-only invalidation
hints**; no event actor, name, last-seen ID or read time becomes reader evidence.
The unread-status path still ignores other people's events for your own unread
flags and does not perform extra unread lookups.

With `seen-events-v1`, native `messages.readBy` requests opt into hints using
`watch:true`. Legacy clients never receive new notifications, and older backends
keep one-shot opening/explicit reads. Hints carry the selected room, session and
source lifetime only. Names still come from the normal exact-message/member query.

One fixed one-second window coalesces bursts. If a read or reaction is physically
pending, at most one follow-up target waits for its existing admission to drain;
new explicit targets supersede old queued work. An event marks old data stale
until a successful refresh. Source/session/room changes, annotations, opt-out and
backoff fence queued work and late replies. Failures do not start retry loops.
Only visible current-tab history is refreshed; there is no polling, history scan,
extra SDK listener/connection, read receipt or disk reader cache. Lost events can
still leave an older checked snapshot; explicit refresh remains available.
