# Editor engine boundary (version 1)

The portable Vimscript and Neovim Lua integrations share a private **JSON-RPC
2.0 over UTF-8 newline-delimited editor-job stdio** transport. This is not a
Neovim-only RPC interface. `dist/editor-main.js` is the dedicated Node entry
point; `cli.js editor-worker` remains a compatibility entry point. No connection,
terminal probe or media launch occurs before a method explicitly asks for it.

## Layers and ownership

`state.joinedMeetings` is an optional, strictly validated read-only projection:
`{state: off|loading|ready|unavailable, partial: true, items: [{id, title}],
observedAt?: milliseconds}`. Only ready observations contain a timestamp/cards
(at most three); IDs are opaque 64-character lowercase hex hashes. No raw locus,
device/participant identity, URL or join target crosses this boundary. Native
rows have a distinct `joined-meeting` identity and no action mapping. The existing
`meetings.upcoming` operation also requests a throttled refresh through the
already-running metadata SDK; it never creates a source or changes call control.
See [coverage and limits](upcoming-meetings.md#joined-elsewhere-follow-up-2026-11-20).

See [the architecture map](architecture.md) for built/source
execution, compatibility clients and private process boundaries. This reference
describes the implemented source protocol; final integrated evidence is kept in
[implementation progress](implementation-progress.md). Local keys, folds, layout
and automatic paging reuse existing operations. The selected-direct people
subset adds the capability/lookup operation below, not a public lifecycle API.

- `plugin/wbx.vim` / `autoload/wbx.vim`: commands, native buffers/windows,
  per-space/thread drafts, changedtick-safe delivery ACKs and native user hooks.
- `autoload/wbx/history.vim`: bounded message blocks, isolated Markdown bodies,
  native extmark/text-property decorations and display-only reply banners.
- `autoload/wbx/view.vim`, `layout.vim`, `folds.vim`: stateless owned-projection
  writes/message anchors, owned window-local geometry, per-window native folds.
  They serve the single session/draft coordinator rather than duplicate it.
- `autoload/wbx/commands.vim`: one configurable global `<leader>W` catalogue for
  mappings, effective help/health and optional which-key. `people.vim` renders
  the optional selected-direct header/details without owning authorization.
- `autoload/wbx/transport.vim`: Vim jobs/channels vs Neovim jobs/terminals,
  bounded line assembly and owned tmux-client detachment. Output is JSON data,
  never Ex commands or keystrokes. Old job callbacks cannot mutate a new session.
- `autoload/wbx/protocol.vim`: typed backend response/notification checks before
  editor mutation, including constrained tmux attach argv and delivery fields.
- `lua/wbx-tui/`: optional setup/pickers/installed parser/which-key/statusline
  enhancements. The Vim baseline requires none of them.
- `src/editor-protocol.ts`: version, strict typed operation parsing, framing and
  limits. Enum values are never coerced from arrays/objects.
- `src/editor-output.ts`: exact UTF-8 output budgeting and newest-history suffix
  serialization, without modifying live snapshots or RPC replay objects.
- `src/bounded-output.ts` / `state-output.ts`: completion-driven ordered admission
  and conservative presentation-versus-control/authority/evidence classification.
- `src/editor-worker.ts`: dispatch/replay/admission, notifications and shutdown.
- `src/attachment-transfer.ts`: one selected representation, bounded pull credit/
  expiry/digest and one-shot completion; `autoload/wbx/attachment_stream.vim` plus
  the bundled local sink perform incremental verified native handoff.
- `autoload/wbx/snapshots.vim`: memory-only normalized PNG pieces, with incremental
  Lua storage/graphics on Neovim and no original-byte cache.
- `src/editor-engine.ts`: OAuth owner plus existing REST transport/store, without
  terminal/editor imports. It never owns or polls unsent draft text.
- `src/people-status.ts` / `people-selected.ts`: bounded opt-in public REST
  presence/verified selected-peer identity, no organization enumeration or
  automatic grant changes. Custom-status text is unsupported for this provider.
- `src/upcoming-meetings.ts` / `autoload/wbx/upcoming.vim`: bounded granted-scope
  scheduling reads and inert card projection. Safe URLs stay in Node; explicit
  ID/revision joins are revalidated before using the existing media-owner path.
- `src/spaces-cache.ts`: optional bounded owner-only display metadata, scoped by
  verified account/profile. Cached rows are never seeded into the live store.
- `src/editor-meetings.ts`: launcher/controller for the existing tmux media
  owner. It does not join Webex, request devices or run another media worker.
- `src/viewer-framing.ts`: bounded incremental packet assembly for the existing
  media viewer transport, separate from media/control interpretation.

The engine JSON config owns OAuth/media/tmux options; Vimscript/Lua owns editor
configuration. Connected native messaging and meetings can lease the same
in-memory grant owner, preserving independent media lifetime without a second
login. No token/secret/lease is accepted or returned by editor RPC. Standalone
meeting authorization remains independent when messaging is disconnected.
There is no shared refresh-grant file or inherited MCP grant; see
[the internal handoff contract](shared-meeting-auth.md).

## Framing and admission

Room projections may carry optional boolean `notifications` as presentation-only
notification eligibility. It preserves known per-user conversation mute tags,
never publishes raw tags or grants read/write/receipt authority. Unknown live
preferences project false until observed. Mute-only changes publish even without
an activity/read timestamp change; preferences are not restored as cache authority.
All self-authored message creations are consumed without notifying, including
other-client sends. This supersedes historical same-account notification examples.

Read-by inspection negotiates `messageReaders:["watermark-v1","seen-events-v1"]`, dependent on
`messaging` and `local-context-v1`, without adding another base capability.
`messages.readBy` accepts only `{roomId,messageId,watch?:true}` for one exact loaded message
in the selected revalidated conversation, with an enabled existing SDK/grant.
Its closed result is `{roomId,messageId,coverage:"space-read-watermark",
observedAt,partial,readers:[{personId,name?}]}`; at most 128 unique reader identities
and bounded safe names cross the boundary. It is not a message read receipt or
an unread/presence observation. The original sender is excluded; live coverage
is always partial because the public SDK discards participant coverage flags.
See [read-by evidence and limits](message-readers.md).

Private SDK IPC adds `{type:"readers",id,roomId,messageId}` and either
`{type:"readers",id,result}` or `{type:"readers",id,failed:true}`. Parent/worker
admission retains the pending read through physical settlement and excludes
competing reactions/receipts. One independently admitted receipt can reserve its
existing slot while waiting for that read, with source/endpoint/freshness checks
again before its sole submission. Even a correctly correlated receipt reply
cannot settle a reserved-but-unsent receipt. Malformed, foreign and unsolicited
replies fail closed. Shared server backoff and fatal native deadlines remain unchanged.
The native client fetches once on conversation opening or explicit inspection.
After `watch:true`, `messages.readersChanged` notifies only
`{roomId,sessionId,sourceEpoch,sourceRevision}` for the selected, loaded room.
It is an invalidation hint, never a pushed reader observation. Clients that do not
opt in receive no new notification; older servers get no `watch` field.
Native hints coalesce over one second and use the existing read/admission path
for the exact displayed footer target. No polling, extra SDK registration,
recipient/actor/URL fields, reader full-state fields or name-cache persistence.
Private `changes` IPC adds `{kind:"readers-changed",roomId}` from validated public
`memberships:seen` envelopes, using its existing bounded batch/coalescing path.
Startup reader hints do not occupy the mandatory revocation ledger.

Experimental reaction operations use the negotiated
`messageReactions:["pinned-internal-v1","viewport-batch-v1","self-summary-v1","progressive-v1","actor-details-v1"]` submodes without increasing the
32-capability ceiling. `messages.reactions`, `messages.reactionPrepare`,
`messages.reactionSubmit`, and `messages.reactionResolve` require exact
`roomId/messageId` and `internalConsent:true`. Preparation adds explicit
`action:add|remove` and a legacy reaction name or one Unicode emoji/RGI sequence
(at most 64 UTF-16 units, excluding standalone digits, skin-tone modifiers and
regional indicators). The same
validated label is accepted in summaries/details; non-preset labels equal the
emoji itself, never arbitrary provider text. Submission adds frozen `contextId`,
unique `requestId` and `confirmed:true`; inspection adds `checked:true` and the
original `requestId` when resolving a retained unknown. `messages.reactionDiscard`
accepts only `contextId`. No caller actor, SDK activity/key/URL/recipient or raw
own-reaction identity is admitted. See the [current reaction contract](reactions-implementation-plan.md).
`messages.reactionsBatch` is used only when `viewport-batch-v1` is advertised.
After `progressive-v1` negotiation, its optional `progressive:true` flag permits
`messages.reactionProgress` notifications with exactly `{requestId,snapshot}`:
the originating positive RPC ID and one closed reaction summary for a requested
target, without an opaque `own` handle. `selfSummary:true` independently opts into
`mine` evidence. Legacy requests get no progress notifications. The private SDK
worker likewise emits progress only after explicit opt-in by its parent.
After `actor-details-v1` negotiation, a single `messages.reactions` request may
opt into `details:true`. Its base response is `{snapshot,actors,partial:true}`;
an optional `activityReadFailure` adds only a fixed phase/problem diagnostic.
`snapshot` is the existing closed summary without removal handles, and `actors`
contains at most 10 unique `{reaction,personId,name?}` entries bound to that
message's exact child collection. Names are bounded inert text; actor counts are
not aggregate totals. Contradictory room/parent/verb/object bindings are rejected.
The exact endpoint may bind omitted parent/target fields for display only;
strict own-removal checks are unchanged. No supplied actor identity or name
can grant mutation authority. Child reads use one bounded page, no auto-pagination.
The engine reuses disclosed names or relevant known names, otherwise tries at
most eight exact-person GETs within an eight-second start window using the known
people-read grant; failures retain IDs. The last physical read retains its normal
eight-second timeout. No directory/account scan or cache warming occurs.
Legacy summary/batch/progress DTOs remain unchanged. The closed summary still
refreshes its ordinary display cache; actor lists and their name lookups never
enter automatic/persistent caches or state notifications.
Progress paints completed targets but never retires the pending RPC or releases
physical admission; the original ordered final response still settles it.
Duplicate/late/foreign view or content callbacks cannot repaint or authorize
inspection, removal or receipts.
Main state may also carry optional, closed `reactionSource` metadata:
`{epoch: nonnegative-safe-integer, revision: nonnegative-safe-integer,
degraded: boolean, readable?: boolean}`. `epoch` changes on source replacement/loss; `revision`
increments when that same source enters recoverable `refresh-unavailable`
health, including a failure/recovery cycle coalesced into one ready snapshot.
`degraded:true` is valid only with `readStatus:"failed"`. This is presentation
lifetime metadata, **not** a new capability or read/inspection/write/receipt grant.
Absent metadata does not enable retention through an unclassified failure.
Only unchanged loaded message content in the same room/context/session/source
can retain an explicitly cached observation; recovery invalidates its freshness
and fences old callbacks. Terminal loss, grant replacement, revocation and changed
or deleted targets discard it. Backend preparations/inspection locks are still
reset, and retained unknown writes still require exact-request resolution.

`readable:true` is valid only during recoverable failed unread discovery and
reports separate reaction-summary transport eligibility. It never grants
inspection, mutation or receipt authority. A startup discovery 429 keeps the
existing SDK owner but pauses new SDK reads until server backoff expires.
Optional `historyCached:true` requires `ready:false` and `historyLatest:false`:
its message array is a stale display projection, never the live store.
Optional `cachedReactions` contains at most 32 closed summary DTOs for this room's
projected messages and must not contain opaque `own` handles. Its observation
times/partial flags are not refreshed by restoration. No new capability or
mutation parameter is introduced; [storage/privacy rules](received-cache.md).
The batch method requires `roomId`, one to eight distinct already-loaded `messageIds`, and
`internalConsent:true`. Its closed result is `{roomId,items}` in request order;
each item is a normalized snapshot or `{messageId,reason}` with a bounded read
failure. Wrong/duplicate/foreign/missing targets fail validation. Batches never
inspect/unlock targets or mint own-removal authority.

Passive native reaction reads use a **local per-request** error policy, not a
wire field, capability or global mute. Only `messages.reactions` and the negotiated
`messages.reactionsBatch` may opt into it; explicit commands use normal feedback.
These passive requests refuse locally if transport/handshake readiness is absent:
they cannot start/reconnect a backend or queue startup work. Valid RPC failures
still reach the owning callback, negative TTL and bounded read-only retry logic,
without replacing foreground messages or `last_notice`. Only allowlisted
`phase:problem` reasons survive into presentation/`:WebexHealth.reaction_reads`;
unknown provider text reduces to `summary:unavailable`. The health entry contains
aggregate `failedTargets`, `pendingTargets` and unique `reasons`, not message IDs
or provider payloads. Successful observations/context invalidation clear the
corresponding diagnostics. Explicit reaction-read failures give one sanitized
reason plus health/refresh guidance. Invalid envelopes/DTOs, disconnects and
mutation/receipt/uncertainty errors retain their normal visible handling.

Requests are objects with `jsonrpc: "2.0"`, an increasing positive safe integer
`id` (maximum 2^31−1), `method`, and an optional object `params`. Unknown top-level
keys, unknown parameters, secret/token parameters, arrays and invalid IDs are
rejected. The first accepted operation must be:

```json
{"jsonrpc":"2.0","id":1,"method":"hello","params":{"version":1}}
```

Its result includes version/capabilities and current messaging/meeting snapshots.
No auth token, client secret, refresh grant or private configuration is returned.
Protocol mismatches fail before login or message/media actions.
The additive `local-context-v1` capability supplies optional ready-state
`localContext: {sessionId: "<32 lowercase hex>", coverage: "session-only"}`.
This opaque random fence is recreated for every admitted session, stable across
selected rooms, absent outside ready state and defensively copied. It is **not**
an authenticated person/account/profile namespace, grant, provider revision or
durable-store key. It introduces no new RPC method. Native local bookmarks,
copied-text quotation guards and loaded thread/content navigation require it;
older backends remain usable with those actions unavailable. Choice intents
include the fence, preventing confirmation across account/reconnect replacement.
No account lookup or message-body persistence was added.
`directory-search-v1` adds only `people.search {query, more?, revision?}`:
an explicit 2–120 character company-directory name **prefix**, with revision
required only for an explicit next page. Its strict result contains
`sessionId`, `query`, `revision`, `coverage:"directory-prefix"`, `observedAt`,
`partial`, `more` and at most 250 `{personId,label}` items. No raw profile,
presence, email, avatar or credential is projected. One fixed public GET/page,
50/page, five pages/two-minute query lifetime, original query/privacy-bound Link
validation and known people-read grant checks are specified in the
[provider contract](messaging-public-provider-audit.md#mf20-approved-read-only-implementation-contract).
It is independent of automatic selected-peer presence and introduces no scan,
automatic pagination, identity probe, grant expansion or write operation.
`people-profile-v1` adds only `people.profile {personId}` for one explicit exact
person ID. One fixed-origin `GET /v1/people/{personId}`, known people-read grant
checks and the existing session/feature/physical admission return
`{sessionId,personId,coverage:"person-text",observedAt,partial,fields}`.
Only `displayName`, `firstName`, `lastName`, `department`, `title`, `timezone`
strings may occur in `fields`: 120 Unicode characters / 480 bytes each, 4096-byte
DTO; normalization, clipping or missing fields marks the subset partial.
No caller org/actor/URL/credential/callingData/field expansion, presence, avatar
URLs, private contacts, raw profiles, new cache or write is admitted. Native
profiles bind exact row/session/choice and reject stale/future results; explicit
same-ID refresh may replace old data only with a fresh GET. This remains
independent of `people-status` and sender-name opt-outs, with no automatic
enrichment. See the
[contract](messaging-public-provider-audit.md#mf19-selected-person-textual-profile-contract).
`adaptive-card-text-v1` adds **no RPC**. Existing message reads project a bounded,
inert Adaptive Card 1.0–1.3 text subset into ordinary message text/Markdown.
Main-history optional `cards:{count,partial}` contains only an inspected-envelope
count (1..10) and boolean; unknown fields/raw cards/actions/inputs/URLs are rejected
by native validation. Snapshot copies and reconciliation include this metadata.
The capability independently gates the native loaded-card list; old backends
never acquire it by matching a body label. Query DTOs keep only inert rendered
text under existing item/byte quotas, not this metadata or a raw card registry.
No card action/input/refresh/auth operation, file-transfer reference or new
notification/receipt evidence is created. See the
[versioned projection/budget contract](messaging-public-provider-audit.md#mf13-approved-readable-card-subset).
`joined-teams-v1` adds finite `teams.joined {more?,revision?}`: one explicit
known-grant `GET /v1/teams?max=50` per query/page. Revision is required only for
next pages; there are no caller Team/org/person/role/URL/cursor/grant selectors.
It returns `{sessionId,coverage:"joined-teams",revision,observedAt,partial,more,
limit,items:[{teamId,label}]}`, never descriptions, members, raw metadata or roles.
The existing `ServerTeams` owner keeps this session-only paged slot separate
from loaded-label caches, with 50/page, five pages/250 IDs, 64 KiB of item JSON,
two-minute lifetime, strict fixed-origin/privacy-free Link validation, explicit
budget/cycle labels and no reset-based physical overlap. Session replacement
revokes old cursors. No results seed rooms, write/receipt authority or notifications.
The native list filters loaded noncached spaces only; joining/discovery/room
reads remain separate contracts. See the
[MF25 contract](messaging-public-provider-audit.md#mf25-joined-team-listing-contract).
The advertised capability list now uses the existing maximum of 32 entries;
the protocol ceiling was not increased.
The optional hello-result `uploadFormats:["markdown-single-file-v1"]` separately
asserts Markdown plus one file, without a 33rd capability or protocol bump.
Native validation admits absence/empty list or that exact singleton, requiring
`uploads-v1`, `markdown-send-v1` and `local-context-v1`. Other shapes/values refuse.
Old clients ignore the field; new clients refuse the combination when it is
absent even if uploads and Markdown are separately available. Assertion state is
reset with the existing hello/transport lifecycle, never persisted in options.
The independent optional `directFormats` list contains at most three unique
values: `markdown-v1`, `single-file-v1`, `markdown-single-file-v1`. Each requires
`conversations-v1` and `local-context-v1`, with `markdown-send-v1` for Markdown
modes and `uploads-v1` for file modes. Unknown/wrong-type/duplicate values refuse.
Omitted/empty means legacy plaintext; separate modes/MF14 never imply the
combination. Combination-only support allows its format/staging but not
unasserted text-only/file-only delivery. This retains the 32-capability ceiling.
The independent optional `spaceActions` is omitted/empty or exactly `["rename-v1"]`,
requiring `conversations-v1`, `room-members-v1` and `local-context-v1`. Malformed,
duplicate/unknown assertions refuse; create/member capabilities alone never imply
rename. Assertion state resets with hello/transport, not options. Old clients
ignore this field; capability count/ceiling remain 32 and protocol version stays 1.
Independent optional `spaceDescriptions` is omitted/empty or exactly
`["replace-v1"]`, requiring the same three capabilities. Rename support alone
does not imply it. Do not extend the old strict `spaceActions` singleton.
Malformed/unknown/duplicate shapes refuse; assertion state resets with hello/
transport. Frozen rename-era clients ignore the sibling without enabling it.
Independent optional `spaceLocks` is omitted/empty or exactly
`["lock-unlock-v1"]`, requiring those same three capabilities. Unknown/wrong-type/
duplicate assertions refuse. It resets with hello/transport and adds no 33rd
capability or protocol bump; both older strict singletons remain unchanged.
Independent optional `spaceAnnouncements` is omitted/empty or exactly
`["enable-disable-v1"]`, requiring the same three capabilities. Malformed/unknown/
duplicate assertions refuse; reset follows hello/transport. The three older
strict singletons and 32-capability ceiling stay unchanged; frozen-old clients
ignore this sibling without enabling announcement mode.
Independent optional `spaceDescriptionClears` is omitted/empty or exactly
`["single-space-v1"]`, requiring those same three capabilities AND
`spaceDescriptions:["replace-v1"]` for reused preparation. Malformed/unknown/
duplicate assertions refuse. All four older strict singletons and the
32-capability ceiling stay unchanged; hello/transport resets revoke support.
Independent optional `teamActions` is omitted/empty or exactly `["rename-v1"]`,
requiring existing `conversations-v1`, `joined-teams-v1`, `local-context-v1`.
Unknown/malformed/duplicate assertions refuse; hello/transport resets revoke
support. Five older metadata singletons and own-direct visibility remain
independent; the protocol version and 32-capability ceiling do not change.
Frozen clients ignore this sibling without enabling Team mutations.
Independent optional `membershipVisibility` is omitted/empty or exactly
`["own-direct-v1"]`, requiring `conversations-v1`, `room-members-v1`,
`local-context-v1`. Malformed/unknown/duplicate values refuse; hello/transport
resets revoke support. The five older metadata singletons, protocol version and
32-capability ceiling stay unchanged. Older clients ignore the sibling without
enabling this read; roster/write support alone does not imply it.
`message-queries-v1` adds finite selected-room reads:
`messages.thread {roomId,messageId,more?,revision?}` and
`messages.mentions {roomId,more?,revision?}`. First thread reads revalidate the
loaded source, root when distinct and one replies page (at most three GETs);
mentions use only the authenticated `me` filter. Every further page is explicit
and revision-bound. The result's coverage is `room-thread` / `room-mentions-me`,
with session/room/kind/source/root, revision, observation, partial/more/limit and
inert projected bodies. Independent slots expire after two minutes, at most
five pages/250 results plus root, 256 KiB/query; reset on real selection/reload,
revocation or session replacement. No result seeds main history/attachments,
notifications, unread or receipt endpoints. Root-draft preparation reuses the
existing native owner; no arbitrary-root send operation was added. See the
[exact contract](messaging-public-provider-audit.md#mf07--mf11-selected-room-read-contract).
The `message-replies` capability explicitly gates reply composing/sending in the
native editor; older backends cannot silently degrade a reply to a normal post.
The additive `people-status` capability advertises optional presence support;
`people_status` remains off unless the editor explicitly sends `peopleStatus:true`.
Capability advertisement is not a promise of granted access or live disclosure.
`upcoming-meetings` negotiates meeting discovery independently: the client sends
`upcomingMeetings:true` only to an advertising backend, including queued startup.
It still requires already-known `meeting:schedules_read`, not `spark:all` alone.
`spaces-cache` negotiates the separate, default-off `spacesCache:true` opt-in and
the no-argument clear operation. Older backends receive neither optional startup
field unless advertised; missing cache support is reported without preventing
ordinary messaging. No cache key, person ID, token or arbitrary file path is an
RPC cache parameter.
`same-space-resume` advertises additive `rooms.select.reload:true` for an explicit
bounded-window reset. Ordinary selection of the current loaded/loading space is
idempotent; native re-entry also preserves the reader and never reissues receipts.
Older backends receive no reload parameter (their existing selection already resets).
`message-images` advertises `messages.images`, accepting only loaded current-room
message identity, never a URL/path/token. Automatic native calls are limited to
visible unfolded image placeholders when previews are enabled. Optional message
`images` arrays carry only a SHA-256 reference, status, bounded normalized PNG
base64 and 12x40 Unicode braille rows; native validation rejects unknown keys,
paths/URLs, terminal controls and invalid shapes. The separate `image-opening`
capability advertises explicit-only `messages.imageOpen`, accepting exactly
`roomId`, `messageId`, and the selected loaded attachment's SHA-256 `imageId`.
It returns one `{id,state:'ready',png,width,height,lines}` object, never updates
inline state and never selects a space or issues a receipt/post. Actual pixels
are read independently of the thumbnail, fit within 1600×1200 without upscaling,
with normalized PNG ≤6,000,000 bytes (base64 ≤8,000,000). The unchanged 8 MiB event
bound admits the single result. A replayed request ID returns a bounded error,
not a refetch; large result bodies are not retained in the 64-entry replay cache.
Older backends without this capability refuse large-image opening with a rebuild
notice rather than silently substituting a thumbnail. No URL/path/token parameter
or grant is added. The backend persists no image. Native external viewing
may explicitly export this higher-resolution PNG through the local private-file helper;
no temporary path or external command enters the Webex protocol. See
[the media contract](messaging-media.md) and [explicit detail opening](image-detail.md).

Request lines are at most **32,768 bytes**; emitted lines at most **8,388,608
bytes**. Fragmented UTF-8 and multiple lines in a job callback are supported.
Successful `delivery` events additionally carry optional `messageId`, the exact
accepted message identity from the POST acknowledgment. Failed/unknown deliveries
must not carry it. The native notification observer records it before the following
state update to exclude local sends without comparing bodies, guessing authors,
issuing identity reads, or discarding concurrent incoming messages. Older backends
without it get conservative one-batch suppression. Local-send exclusion adds no
notification RPC, authentication scope or automatic read/receipt;
notification timers inspect only already-validated native state.
Framing/queue overflow fails closed rather than interpreting partial text. A huge
history snapshot may omit oldest loaded text and mark `truncated`. Backpressured
stdout is bounded: compatible pending presentation coalesces, while irreducible
overflow disconnects rather than accumulating unbounded message data. Provider
exceptions/stdout are never forwarded as logs.
The output budget applies to state notifications, state results and the hello's
nested state. Each retained message is encoded once, without a deep clone or
repeated whole-history stringification; already-backpressured output is rejected
before serialization.

There are at most 32 pending operations. The last 64 completed request responses
can be replayed for an **identical** ID/request; an altered or older/evicted ID
never executes again. IDs still pending cannot be reused. Delivery IDs are
separate, destination-bound and deduplicated in the existing messaging store.
No automatic message POST retry occurs.

### Typed attachment transfer

`attachment-typed-open-v1` keeps `messages.attachmentResolve` / `attachmentCancel`
and A1's exact inline result for omitted transfer choice. With **both** typed and
`attachment-chunks-v1` advertised, clients may explicitly pass
`transfer:'chunks-v1'`. Only `body.payload` changes to the
[approved descriptor](attachment-transfer-design.md#approved-wire-contract).

`messages.attachmentChunk` carries original `requestId`, random connection-local
`transferId`, contiguous `seq` and decoded `offset`; its one-shot result adds
`decodedBytes` and canonical `data`. Maximum chunk is **49,152 decoded / 65,536
base64 bytes**; the complete response is at most **69,632 UTF-8 bytes**. At most
123 chunks and one outstanding credit, released only after the actual write
callback and required drain. Native grants another pull only after its sink ACK,
on a separate scheduled turn. No unsolicited notifications or state-wire chunks.

`messages.attachmentComplete` echoes independently verified count/totals/SHA-256
and returns a small completion acknowledgement; no visible native side effect
precedes it. Descriptor/control responses fit 8,192 bytes. Cancel still names the
original resolve through descriptor lifetime. One worker-owned explicit pipeline
holds one chosen representation until completion/cancel/expiry, while the separate
image-native slot follows actual conversion/cleanup. Lifetime is 30 seconds from
descriptor creation; idle timeout is five seconds, never renewing the lifetime.
GET/raster deadlines and source/output limits remain unchanged.

Every result remains a mandatory ordered barrier. Unknown/foreign identities
cannot clear a rightful owner; matching malformed/reordered access revokes it.
Resolve/chunk successes retain tombstones, not bytes or reusable descriptors.
Only pre-dispatch capability fallback is permitted: failures cannot refetch through
inline/legacy methods. Local PNG presentation snapshots remain independently
reopenable without another remote transfer.

## Output pressure contract

The B2 scheduler leaves version-1 state envelopes unchanged. The separately
negotiated attachment capability above does not alter state lanes. All delivered `state`
notifications are full snapshots; there is **no delta/status-only wire format**
or new negotiation requirement. Legacy clients retain the full-state path, and
every revision admitted by the native client still reaches `User WbxState`.

| Output | Pressure policy |
| --- | --- |
| Adjacent `state` notifications with identical control, authority and evidence | One active write plus the latest pending presentation for that lane |
| Loading/ready/sending, session/auth/failure/ownership, people/agenda/cache status | Ordered barriers; never merged across a transition |
| Room membership/order, unread/staleness/activity, selected destination, newest endpoint identity/time | Ordered barriers; never treated as unchanged because IDs/counts match |
| Message-creation feed state/count/items, including same-account evidence | Ordered barriers; never replaced by a later bounded-ring snapshot |
| RPC results/errors, deliveries, receipt outcomes, meeting notifications and notices | Nonreplaceable FIFO records, including one-shot large results |

Presentation within a lane may change room titles/REST ordering timestamps and
message text/Markdown/images/attachments without crossing a control/authority/
evidence transition. Actual array order, membership and endpoint identity/time
remain in the lane key. Unknown state/control fields are conservative barriers.
Lane equality authorizes **replacement only**, not data acceptance: complete
serialization/byte limits and native validation still run, with no ID/length-only
shortcut or writable alias to owner state.

The RPC microtask keeps one latest compatible snapshot; a changed lane flushes its
predecessor rather than dropping an intermediate status or creation batch. Existing
synchronous delivery notifications and response handling remain separate. Output
never merges snapshots across an intervening result/event already offered to it.
This explicitly retains more same-turn status/evidence than the old unconditional
latest-snapshot microtask. No public hook is renamed or suppressed for admitted data.

Stdout admits one active write until **both** its callback and, on a false return,
stream `drain`. Pending compatible snapshots replace only the adjacent queue tail;
nonreplaceable barriers remain ordered. The queue holds at most **128 records**
and **16,777,218 accounted UTF-8 bytes**, including newlines and the active record
(two maximum-size lines). The existing pre-serialization writable-length guard
and 8 MiB per-record limit remain. These are serialized-byte limits, not measured
heap/RSS figures. Mandatory overflow, invalid output or a send error fails closed;
it is never converted into a successful outcome, dropped response or automatic retry.
Graceful shutdown flushes its accepted final response; explicit channel failure/
teardown discards untransmitted data and late callbacks cannot restart output.

Private read-status worker IPC uses the same ordered scheduler, with one send
awaiting its completion callback, at most **128 records / 2,097,152 accounted
UTF-8 bytes**. Only adjacent snapshots with exactly unchanged read authority can
coalesce title updates. `ready`, health, message batches, receipt results and fatal
reasons are always FIFO barriers. Accepted fatal output drains within the existing
one-second hard worker-teardown budget; an unresponsive IPC peer cannot extend it.
Parent-to-worker receipt admission remains single-flight and one-shot.

Unchanged per-room event results no longer publish redundant snapshots. Real full
observations still cross IPC every reconciliation cycle for liveness and genuine
observation timestamps. The engine compares every normalized room field before
skipping redundant merge/projection work, while preserving cache observation time;
source loss/recovery still invalidates/restores authority explicitly. Full message
batches flush at their existing 64-item limit instead of silently discarding a new
creation. Transport overflow fails closed; engine evidence age/retention bounds,
preview consent and exact acknowledged-plugin-send exclusion remain unchanged.
Native SDK lookup admission/fairness/deadlines and cache-write scheduling are not
changed by this output policy.

## Read-status event reconciliation

The optional worker tracks at most **64 queued/in-flight room identities** in
total, not a cleared 64-room batch plus another 64-room queue. A queued room stays
registered until its native lookup is admitted; repeated events while it waits
are covered by that lookup. An event for the in-flight room records one dirty
bit, since the native result may have captured state before that event. Once the
native operation settles, one follow-up goes behind the already-queued peers.
Counting the active room in the bound reserves that slot even at capacity.
Continuous new events can require further observations, but do not allocate one
request/waiter per event or starve other queued rooms.

Distinct overflow still belongs to the existing periodic full reconciliation.
Full refresh retains priority after at most the currently active metadata lookup;
it is not postponed until an entire room batch finishes. Events during a full
fetch remain conservatively queued: a capped full result is not assumed to cover
every event. The 30-second native deadline remains fatal; a timed-out waiter never
admits a replacement while its noncooperative native request is still running.
Settled room failures invalidate that room, without inventing dirtiness/retries.

Only a public `memberships.seen` event can skip actor-irrelevant reconciliation,
and only when all existing metadata agrees: resource/event are `memberships`/`seen`,
`createdBy` exactly matches the current SDK self ID, `actorId` equals
`data.personId`, a room ID is present, and both person IDs decode to canonical
public PEOPLE identifiers in the same namespace with distinct subjects. Unknown,
cross-namespace, differently cased self-like, absent or contradictory identities
retain reconciliation. No identity lookup, private endpoint or grant is added.
Membership creation/deletion, room changes and message creation/deletion do not
use this actor filter. In particular, same-account messages from other clients
remain notification evidence, and self `seen` events from other clients reconcile.

Receipt mutations are **not** part of this deduplication. They retain their
single-flight, one-shot admission and existing completion/error ordering. Only a
receipt's subsequent metadata hint enters the same bounded reconciliation queue;
if a distinct hint cannot be admitted, periodic full observation recovers it.
Completion still flushes already-observed metadata before its response and never
invents a read date, replays a receipt, reconnects or registers another device.
Neither editor RPC nor private IPC gains a new envelope or capability.

## Operations

| Method | Parameters |
| --- | --- |
| `session.start` | `mode: demo/live`, optional config path, `readStatus`, `peopleStatus`, `upcomingMeetings`, `spacesCache`, `notificationPreview`, `senderNames`: booleans (omitted flags default false) |
| `session.stop` | none; cancels login, stops polling, clears Node auth memory |
| `state.get` | none |
| `auth.refresh` | none; messaging OAuth only |
| `rooms.list` | optional `more: boolean` |
| `rooms.select` | listed `roomId`, optional `reload: boolean` (explicit latest reset only) |
| `rooms.read` | current loaded `roomId`, known-latest loaded endpoint `messageId`; one receipt, no retry |
| `messages.list` | optional `older: boolean` |
| `messages.images` | current loaded `roomId`, loaded `messageId`; bounded attachment previews, no URL/token/path |
| `messages.imageOpen` | current loaded `roomId`, loaded `messageId`, registered `imageId`; explicit original-derived raster |
| `messages.attachmentOpen` | current loaded `roomId`, loaded `messageId`, registered `attachmentId`; explicit bounded original bytes, no URL/token/path |
| `messages.send` | `roomId`, `requestId`, explicit plaintext `text`, optional thread-root `parentId` |
| `messages.sendRich` | same target/text/request plus native `draftId`, optional `mentionsAccepted`/`allAccepted`; Markdown only |
| `messages.actionPrepare` | loaded `roomId`, `messageId`, `action: edit|delete`; returns bounded opaque message context |
| `messages.actionSubmit` | `contextId`, `requestId`, `action`, native `revision`, `conflictAccepted:true`, edit-only `content`/`format`, optional mention consent |
| `messages.actionDiscard` | `contextId`; frees unused preparation, never cancels/replays an admitted write |
| `messages.actionResolve` | selected `roomId`, exact `messageId`; clear uncertainty after explicit inspection, never retry |
| `members.list` | optional `more` only; cannot request an arbitrary other room/person |
| `members.visibility` | exact selected direct `roomId` only; own-membership API flag read, never caller person/member/hidden/mute/favorite/action/body/paging |
| `teams.renamePrepare` | exact fresh joined `teamId,revision` only; fresh private raw-name/moderator proof, no write |
| `teams.rename` | `requestId,teamId,revision,expectedName,name,confirmed:true`; no caller person/member/role/description/preference/Room/body/URL/paging |
| `teams.descriptionPrepare` | exact fresh joined `teamId,revision` only; private raw name/description/current moderator proof |
| `teams.describe` | `requestId,teamId,revision,expectedName,expectedDescription,description,confirmed:true`; no replacement name/actor/member/role/Room/body/URL/preference/paging |
| `direct.prepare` | exact `person` ID/email; returns opaque target, public person ID/label/expiry; no placeholder |
| `direct.send` | `targetId`, native `draftId`, `requestId`, `text`, `confirmed:true`; optional `format:"markdown"` and/or one opaque `attachmentId`; blank text only for plain file-only |
| `direct.resolve` / `direct.discard` | exact `targetId`; no mutation replay |
| `rooms.create` | `requestId`, bounded safe `title`, `confirmed:true`; invitations separate |
| `rooms.rename` | `requestId`, selected `roomId`, exact canonical `expectedTitle`/`title`, `confirmed:true`; standalone-group title only |
| `rooms.descriptionPrepare` | selected `roomId` only; explicit fresh standalone description read/preparation, no PUT |
| `rooms.describe` | `requestId`, selected `roomId`, exact `expectedTitle,expectedDescription,description`, `confirmed:true`; nonblank replacement with mandatory unchanged title echo |
| `rooms.descriptionClear` | `requestId`, selected `roomId`, exact `expectedTitle,expectedDescription` (nonblank), `confirmed:true`; separate destructive action, no caller description/sentinel |
| `rooms.lock` | `requestId`, selected `roomId`, `expectedTitle`, differing boolean `expectedLocked,locked`, `confirmed:true`; explicit moderation transition, not a toggle |
| `rooms.announcement` | `requestId`, selected `roomId`, `expectedTitle`, differing boolean `expectedAnnouncementOnly,announcementOnly`, `confirmed:true`; explicit On/Off, no implicit lock |
| `members.action` | selected `roomId`, `requestId`, `action:invite|remove|leave`, invite person/remove membership `target`, `confirmed:true`; leave forbids target |
| `conversations.resolve` | `action:create|invite|remove|leave|rename|describe|lock|announcement|description-clear`, exact `roomId` except create, `checked:true`; all five metadata actions additionally require original unknown `requestId` |
| `teams.list` | optional `more`; only loaded noncached room Team IDs |
| `teams.joined` | optional `more`; `revision` required only for one explicit next joined-Team page |
| `uploads.stage` | explicit absolute `path`, native `draftId`, exclusive `roomId`/optional root `parentId` OR opaque prepared `targetId`; returns only `{attachmentId,name,bytes}` |
| `uploads.remove` | same destination/draft binding and exact `attachmentId`; removal is not cancellation of an admitted POST |
| `uploads.cancel` | `draftId`, optional `phase: stage|send`; never grants retry |
| `uploads.send` | `roomId`, optional root `parentId`, `draftId`, one staged `attachmentId`, `requestId`, `text`; optional `format:"markdown"` plus boolean `mentionsAccepted`/`allAccepted` only with that format; plain text may be empty, Markdown must be nonblank |
| `delivery.resolve` | none; selected space only |
| `delivery.resolveBound` | exact `roomId`; `delivery-resolution-v1` capability; returns exact room ACK, refuses changed selection/pending send |
| `people.lookup` | none; selected direct peer only, never accepts arbitrary person/room IDs |
| `meetings.upcoming` | none; read-only refresh, no host/person filters or force bypass |
| `spaces.cacheClear` | none; clear only the verified current account/profile cache and stop writes for this session |
| `meeting.joinUpcoming` | `meetingId`, rendered projection `revision`, optional display/fallback; no URL/config/headless/sending parameters |
| `meeting.start` | mode, optional meeting/config/callId/headless, display/fallback |
| `meeting.present` | display: kitty/editor, optional fallback |
| `meeting.control` | validated action (mic/video/share/audio/preview/refresh/quit) |
| `meeting.reconnect` | exact original `session`; one explicit broker-only attempt, verifying living PID/pane/marker/private socket before and after connection; no join, grant or action replay |
| `meeting.pane` | `meeting-panes-v1`; exact session and finite typed intent/revision; separate negotiated owner capability and completion ACK |
| `meeting.leave` | none; explicit leave |
| `shutdown` | optional `leaveMeeting: boolean` (default detach) |

Team preparation is exactly
`{sessionId,teamId,revision,observedAt,expectedName}` (≤4096 UTF-8 bytes, 120-second
native freshness), not authenticated/durable account identity, provider revision
or a reusable role grant. Team outcome is exactly
`{requestId,action:"team-rename",status,notice,teamId,expectedName,name}` with
changed/failed/conflict/unknown; existing 16384-byte result bound. No Room field,
actor/member/role/profile/description, fake message/receipt/delivery or send
exclusion. Both phases require current exact joined selection/session/revision
and known people/teams/team-memberships-read/teams-write grants. Each has ≤3
GETs/self/Team/complete ≤100-membership page; no personId filter or paging.
Submission adds one `{name}` PUT. Existing total/physical/byte/read/IPC bounds
and settlement admission are unchanged. Raw preimage/ACK and permission are
fresh; races/optional-description live semantics remain unverified.
`conversations.resolve` adds only
`{action:"team-rename",teamId,requestId,checked:true}`; no Room override. Original
unknown request/Team/session/manual check plus idle native physical work is
required. It does no IO/replay; late ACK/old request cannot clear newer
uncertainty. Exact retained replay does not invalidate a newer joined cache.
Only non-replayed changed outcome invalidates Team caches/selection; main
state and native text/undo remain untouched. See the
[contract](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review).

Independent `teamDescriptions` is omitted/empty or exactly `["replace-v1"]`,
requiring existing conversations/joined-teams/local-context capabilities, not
rename negotiation. Unknown/duplicate/malformed assertions refuse; reset
revokes support. Seven older assertions and the 32-capability ceiling/version
are unchanged; frozen clients ignore the additive field without enabling it.
`teams.descriptionPrepare` returns exactly
`{sessionId,teamId,revision,observedAt,expectedName,expectedDescription}`,
≤16384 UTF-8 bytes. Rename's five-field 4096-byte DTO stays unchanged.
Native freshness is 120 seconds and expires with the earlier joined query.
Session/query/time are local fences, not durable identity/provider CAS/role
authority. Both phases repeat same four known grants and ≤3 fresh GET proof
(self, raw Team, one complete ≤100-row explicit own moderator page), within
20 seconds each. No personId filter/drain/fallback or new transport admission.
Submission adds one exact `{name:expectedName,description}` PUT. Missing/null
description is not empty; changed nonblank LF-only replacement is bounded to
local 1000 UTF-16 units/4000 bytes. No clear/sentinel/role/preference echo.

Outcome is exactly
`{requestId,action:"team-describe",status,notice,teamId,expectedName,expectedDescription,description}`,
changed/failed/conflict/unknown, ≤16384 bytes, no Room/message/delivery fields.
Exact raw ID/name/replacement ACK is necessary; invalid ACK/post-dispatch
ambiguity stays unknown. Concurrent description and name-echo overwrite risks
remain disclosed; no atomicity/tenant/live permission guarantee.
Recovery adds only `{action:"team-describe",teamId,requestId,checked:true}`;
original unknown action/Team/request/session/manual check and idle logical/
physical work, no IO/replay. Rename/description uncertainty interlocks both
ways, preparations included; old ACKs/requests cannot clear newer uncertainty.
Shared 256-action ledger and physical settlement survive logical deadlines.
Description ACK settles private preparation/status only: **no Team cache/name/
joined-query invalidation/renewal or main-state/notification/receipt event**.
Native Room+Team edits share eight active private records/read owner/clock;
copied DTOs never create authority. See the
[contract](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review).

Notifications: `state`, `delivery`, `meeting`, `meeting.event`, `notice`.
`uploads-v1` additionally negotiates the upload operations and small strict
`upload.progress {roomId,parentId?,draftId,attachmentId,phase,bytes,total}` events
(at most four/second per operation). Paths/bytes/names/credentials are forbidden
in progress. `uploads.invalidated {}` revokes handles on grant loss. Optional
`state.uploadPending:true` is a logical current-session upload transaction only.
Native clients hold eligible fresh notification candidates before its delivery
ID arrives; exact plugin-send exclusion precedes release. There is no source
freshness extension or notification/receipt timestamp refresh.
Upload `delivery` adds exact `attachmentId`/`draftId`, paired and validated.
Ordinary delivery remains compatible. Unchanged original text/tick/file/draft
identity controls ACK clearing; a progress event never redraws history.
See [upload limits, lifetime and notification ordering](uploads-design.md).
`message-actions-v1`, `markdown-send-v1` and `room-members-v1` negotiate separate
helpers; older/disconnected backends refuse without reconnect or plaintext fallback.
Mutation results contain exact request/context/room/message/action/revision,
status `changed|failed|unknown|conflict` and a bounded notice; they are not delivery
events. Prepared contexts are bounded server-content snapshots, never raw author
identity, fingerprints, URLs or credentials. Selected-room roster results include
validated public person/membership IDs only after explicit authorized lookup,
bounded labels/roles, revision and truthful partial/more/state.
Independent own-direct visibility observation returns exactly
`{sessionId,roomId,coverage:"own-direct-membership-flag",observedAt,isRoomHidden}`
(≤4096 UTF-8 bytes). The flag is boolean or null/Not provided, never missing→false
or a modern product Hidden/Favorites/server-mute assertion. Raw null/coercions
refuse. Fresh self/direct Room/exact unique own membership take three GETs
maximum with existing people/rooms/memberships-read grants and unchanged
feature/physical/IPC bounds. Any membership Link/paging/duplicate/foreign
identity refuses without scan or fallback. Roles/other preferences are not
authority or output. No mutation, main state/cache/roster/notification/unread/
receipt/delivery publication or new recovery ledger. Repeated explicit reads
revalidate; cached RPC replays retain their original time/session and never
refresh it. Native results are source/session/selection/window/tick/age fenced.
See the [MF22 contract](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract).
Rich `delivery` pairs `format:markdown` with native `draftId`. Independently
negotiated Markdown/file deliveries additionally include staged `attachmentId`
and exact bounded caption `text`; native matching requires all these fields.
Legacy plain/rich-text-only delivery events remain usable without caption text.
Raw room/root/Markdown/single-file ACK checks precede reference registration.
Mention reads stay inside the existing upload reservation; native PublicREST
settlement can outlive logical cancel. No extra POST, download or receipt follows.
The shared 64-entry delivery ledger refuses saturation rather than evicting write
identities. See the [MF14 contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract).
Optional message `updated`/`edited` are display metadata, never new creation
timestamps or receipt authority. See [F4 contract](message-actions-design.md).

F5 capabilities: `conversations-v1`, `memberships-write-v1`, `server-teams-v1`.
Conversation results have request/action/status (`changed|failed|unknown`), notice,
and confirmed real room ID; direct adds exact target/draft and confirmed message ID.
`direct.delivery` is emitted before room publication and `state.directPending`
release, so native exact-send exclusion runs first. This is separate from normal
room/reply `delivery`; a recipient draft never adopts that draft ledger.
MF23 `action:"rename"` additionally requires exact `roomId,expectedTitle,title`.
All five metadata actions admit `status:"conflict"` (preflight mismatch, zero PUTs);
other action shapes remain compatible. Raw exact ACK precedes title-only
metadata publication, not message `delivery`. No permission is inferred from
the display name/cache/old title. Failed/unknown outcomes carry the same intent.
Unknown recovery validates original room/request ledger evidence and physical
idle state; old resolution ACKs cannot clear newer or old-session uncertainty.
The shared ledger remains 256 entries, result ≤16 KiB, no eviction/replay.
At most three fresh GETs and one title-only PUT inside 20 seconds, with unchanged
PublicREST physical/byte/read bounds. No generic settings/URL/body tunnel.
See the [MF23 contract](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract).
Description preparation returns exactly
`{sessionId,roomId,expectedTitle,expectedDescription,observedAt}` (≤16 KiB).
Session-only `sessionId` is not authenticated identity or a backend lease.
The old description must be explicitly present/safe; missing/null is not empty.
`action:"describe"` requires exact `roomId,expectedTitle,expectedDescription,description`
and `changed|failed|conflict|unknown`, not a new `title` or generic settings map.
Both descriptions are ≤1000 UTF-16 units / 4000 UTF-8 bytes, LF-only, without
unsafe controls/normalization; new text must be nonblank and changed. No clearing.
The sole service body is `{title:expectedTitle,description}`, because public PUT
requires title. Both description lost-update and title-overwrite races remain.
Preparation and submit separately prove existing grants/self/room/membership/
moderator policy; each has 20 seconds total / three GETs maximum, and only submit
may add one PUT. Exact raw ID/group/title/description ACK precedes success.
Descriptions/results never publish into main room/title/cache/history/unread/
notification/receipt state or emit delivery. No post-PUT read/replay.
Unknown rename/describe/lock/announcement/description-clear interlock per room; resolution requires exact original
unknown request/room and physical idle state, without rewriting evidence.
Native private preparation ownership is ephemeral: eight active buffers,
120-second age, full source/session/selection/window/tick/consent fences.
Text/full undo survive retirement, completion, promotion and source loss.
Unchanged PublicREST limits: 8 seconds/call, 8192 request bytes, 262144 response
bytes, 1024 reads; IPC request ceiling remains 32768 bytes. Logical timeout/reset
does not release unsettled physical work. See the
[description contract](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract).
`action:"lock"` requires exact `roomId,expectedTitle,expectedLocked,locked`,
with differing booleans, not a new title/actor/role or settings map. Lock and
unlock are one finite operation shape with explicit opposite preconditions.
Fresh raw private/nonannouncement proof is mandatory; missing is not false.
Lock checks fresh creator==self AND explicit nonmoderator own membership; unlock
checks explicit own moderator proof. `RoomMembers.verify` has an opt-in strict
role requirement; existing verification behavior remains compatible.
Maximum three GETs then one `{title:expectedTitle,isLocked:locked}` PUT in
20 seconds, unchanged PublicREST/IPC/ledger/physical bounds, no post-PUT GET.
Exact raw ID/group/title/lock/private/nonannouncement ACK precedes success.
Mandatory title echo and concurrent moderation/role races are not atomic CAS.
Results never publish main room/title/lock/cache/roster/roles/history/unread/
notification/receipt state, including replay, and do not infer post-unlock roles.
Lock uncertainty also blocks description preparation; exact original-request
recovery waits for physical idle and never clears newer/old-session evidence.
See the [moderation contract](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract).
`action:"announcement"` requires exact `roomId,expectedTitle,expectedAnnouncementOnly,announcementOnly`
and differing explicit booleans. No new title/actor/role/settings map or delivery
shape. Both directions require fresh explicit own moderator proof with raw
`isLocked:true,isPublic:false` and explicit mode. No implicit lock/role/public
conversion. At most three GETs then one
`{title:expectedTitle,isAnnouncementOnly:announcementOnly}` PUT in 20 seconds,
unchanged IPC/PublicREST/ledger/physical bounds, no post-PUT GET/replay.
Exact raw ID/group/title/locked/private/mode ACK precedes success. Title echo
and concurrent lock/mode/role changes are not atomic CAS. Unknown in any of the
five metadata actions also blocks description preparation; resolution waits
for physical idle and exact original evidence, never erasing newer uncertainty.
Results publish no main metadata/cache/role/history/unread/notification/receipt
state, fake messages, delivery IDs or plugin-send exclusions. Consent discloses
Webex's participant notification on enable and moderator/bot/integration posting
exceptions, not local alert suppression or ongoing authority.
See the [announcement contract](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract).
`action:"description-clear"` requires exact `roomId,expectedTitle,expectedDescription`
(bounded nonblank), no new `description`/title/body/sentinel field. The finite
request never accepts caller-supplied service whitespace. Fresh self/private/
nonannouncement Room and exact strict-role membership precede the sole
`{title:expectedTitle,description:" "}` PUT; locked requires moderator.
Maximum three GETs / one PUT in 20 seconds, unchanged byte/IPC/physical/ledger
bounds, no post-PUT GET or fallback. Preimage mismatch is conflict; exact raw
ID/group/title/unchanged checked-lock/private/nonannouncement and explicitly
present `description:""` ACK is required. **Canonical real clear ACK shape
is not established:** missing/null/echoed-space/other whitespace/nonempty is
unknown, never inferred or trimmed. The two-field wire remains non-atomic.
Clear unknowns interlock all five metadata actions/preparation per room,
with exact original-request/physical-idle recovery and no replay.
Native clearing reuses unchanged private preparation, its eight/120-second
bounds and consent/source/session/tick fences. Completion retires preparation
without changing native text/full undo. No main state/cache/roles/history/
unread/notification/receipt/delivery publication, including replay.
See the [clear contract](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract).
MF15 new modes add exact caption `text`, optional `format:"markdown"` and/or
`attachmentId` to `direct.delivery` and its RPC result. All are correlated by
the native recipient owner before changing text/file metadata. Legacy plaintext
outcomes remain compatible without the extra fields. Raw peer/author/content/
file evidence plus same-ID direct-room verification precede projection; a room
GET refusal after a successful POST is unknown, never a failed creation.
Recipient progress uses exclusive `{targetId,draftId,attachmentId,phase,bytes,total}`,
not a synthetic room ID or peer identity. Snapshot limits remain shared; files
send only via `direct.send`, never target-bound `uploads.send`.
The existing 256-action ledger retains bounded projections (16 KiB/new-mode
result), no full provider bodies. PublicREST physical settlement and parent
upload cancellation preserve admission across deadline/reset. See the
[MF15 contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract).
`room.revoked {roomId}` revokes exact-room staged handles/draft send authority and
queued notifications before the revoked store state is published. Session-blocked
room IDs fence stale SDK/REST history authority, including unknown leave.
Room `teamId`/lock/read-only/announcement flags are bounded metadata, not authority.
Team results retain revision/more, `partial:true` and at most eight labels with
known/unavailable/not-loaded state and loaded room IDs. No actor/role/route/
Team-write fields are admitted. See [F5 contract](conversations-design.md).
The optional `message-attachments` capability admits up to ten inert attachment
`{id}` references per message. Optional `attachmentMetadata:["headers-v1"]`
advertises `messages.attachmentMetadata {roomId,messageId}`: selected loaded targets
only, no URLs/options. Visible unfolded native history opts in, independently of
image previews. Header-only HEAD reads populate optional paired `{name,mime}` fields
on references (safe 120-character basename / normalized MIME); legacy clients never
request them. Reads share physical content admission, cancel on destination/session
changes, retain admission through cleanup, and have a ten-second batch deadline.
There are at most 64 file attempts per selected-space visit; the editor additionally
caps automatic message attempts at 16. No body, redirect or GET fallback is used.
`messages.attachmentOpen` returns only
`{id, name, mime, size, text, data}`: a sanitized basename, MIME, byte count, bounded
UTF-8 text eligibility and at most 6,000,000 bytes encoded as base64. It is a
one-shot response, not retained by RPC replay or state snapshots. No server content
URL, credential, output path or external command crosses this boundary. Native
handling revalidates base64/size before local materialization. Downloads and tools
are editor-local explicit actions; see [attachment handling](attachments.md).
Message entries retain their plaintext `text` and may include bounded `markdown`
and boolean `quoted` display metadata, plus an optional validated `parentId` for
actual replies. REST null parents normalize to absent; malformed/self parents
are rejected, not guessed. No HTML renderer, active objects or
resource-loading instructions cross this boundary. The editor validates optional
metadata before rendering, and old clients can continue using the text fallback.
`mark_read_on_open` is an editor-only policy (default true when read sync is
enabled), not an additional backend operation: a guarded successful open of an
unread space may send one `rooms.read`. Polling and programmatic selection alone
do not. Failed/unknown receipt attempts are not automatically retried. A successful
explicit open now clears only native presentation immediately, independently of
`mark_read_on_open` or receipt outcomes. The raw snapshot, freshness, receipt guards
and persisted flags are unchanged; local display state never enters this protocol.
An optional room `unreadActivity` is the normalized UTC timestamp of the actual
SDK observation, not REST `lastActivity`, an image/load/receipt time or a locally
invented status. It may remain historical with `unreadStale=true`; consumers must
check aggregate/per-room freshness. Cached disk-only booleans do not acquire it.
The native observer uses fresh advances to invalidate local read presentation.
Unread-derived off-space notifications are a **legacy-only fallback**, used only
when the backend omits `messageEvents`; current backends use creation evidence.
No new request, endpoint, startup option, grant or automatic receipt is added.

Current snapshots additionally include `messageEvents: {state, received, items}`.
Its state is `off`, `connecting`, `live`, `polling` or `failed`; `received` counts
unique valid/fresh public SDK creations accepted by the current source. At most
64 recent items contain `id`, `roomId`, normalized UTC `created`,
boolean `self` and integer epoch-ms `observedAt`. There are no full bodies, attachment
data, actor IDs or title copies. Items are session-owned, age-bounded and never
cached on disk. Their only consumer is notification detection, never read-state
freshness, local-read confirmation, receipt admission or attempt reset.
`self` identifies the account, not the sending client, and suppresses notification:
native/other-client sends from the same account are consumed without alerting.
The exact acknowledged plugin-send exclusion also remains for legacy echo safety.
Older clients can ignore this additive field. New clients use actual creation
evidence for unselected spaces instead of the historical unread-metadata fallback,
avoiding duplicate alerts after reconciliation. See [global events](global-message-events.md).

`notification-previews` additionally negotiates `session.start.notificationPreview`
(strict wire boolean, default false). The native UI preview option defaults true
and explicitly sends this flag when enabled; `preview=false` omits it. It is consent for bounded off-space excerpts,
not a message fetch or an SDK opt-in. Native clients send it only when unread sync,
message notifications and `notifications.preview` are already enabled, stripping
it for older backends. When consented, `messageEvents.preview=true` permits optional
per-item `preview`: at most 160 Unicode characters/640 UTF-8 bytes, sanitized plain
text only. Without consent, the worker never constructs it; private IPC and engine
reject unconsented excerpts, and native validation requires the feed opt-in bit.
Full bodies, files and actor data remain excluded. Existing metadata/receipt
semantics are unchanged. See [notification previews](notification-previews.md).

`sender-names-v1` independently negotiates default-false `session.start.senderNames`.
The native UI sends it only with enabled message notifications, previews and
`notifications.sender_names` (native default true); legacy backends receive no unknown
parameter. It also enables shared-cache loaded-history labels. Known existing
People grants are required for any lookup; no grants are probed or expanded.

Private worker `start.senderNames:true` requires `preview:true`; unconsented
`senderId` is rejected by the private parent and engine. IDs come only from public
message `data.personId`, not activity actor guesses. Editor snapshots strip raw
`authorId`/`senderId`. Top-level `senderNames:true` allows optional history
`senderName` equal to its projected `author`; event-feed `senderNames:true` also
requires `preview:true` and permits per-item `senderName` only beside an excerpt.
Names are sanitized, nonempty, at most 120 Unicode code points/480 UTF-8 bytes.
Missing/denied grants remove name availability. Enrichment never changes
`received` or `observedAt`, and only an exact queued native event may gain a name.
No creation replay or receipt evidence follows. See [F1 contract](sender-names-design.md).

`local-sections-v1` admits explicit `sections.edit {revision, edit}` semantic
actions create/rename/remove/toggle/move/assign, and `sections.preferences
{revision, action: load|save|clear}`. There is no caller-supplied profile key/path
or full unbounded preferences document. Expected revisions reject stale edits.
Optional `state.sections` contains revision, persistence (session/saved/unavailable)
and at most 32 validated local sections/500 unique assigned room IDs. This is
presentation only; IDs do not establish membership or receipt/send authority.
Preference I/O is explicit and uses only an already verified private account key;
one physical admission survives reset. No lookup, server mutation or automatic
write/replay. Filters are native-only and do not enter backend room selection.
See [local sections](local-sections-design.md).

Viewer socket loss is a local `disconnect` event, not a browser-worker
`status=ended` event or a new RPC/wire capability. Native controls become unavailable;
only recorded owner-process exit confirms termination. Standalone views pause
with unknown media state. Intentional detach does not synthesize a failure or leave.

The native client additionally requires the actual last wrapped body row to be
visible/unfolded, with an unedited, complete, known-latest display. Clipping,
closed body folds and capped older windows exclude receipts; folds are never
opened by receipt admission. State includes `historyLatest` so an older bounded
window cannot masquerade as latest. The optional SDK preserves its public
acknowledgement chain but restricts native transport to one mutating submission,
including key-rotation, redirect and reused-socket replay defenses. See
[the SDK boundary](../optional/read-status-sdk/README.md).
State revisions increase within one backend lifetime. Delivery carries its
request/space IDs, the same optional `parentId`, and `sent`, `failed` or `unknown`,
never an editable draft.
The editor clears only the unchanged source buffer on `sent`; failed/unknown
drafts remain. Pending/unknown delivery stays blocked in the editor across a
backend restart until the user checks Webex and explicitly resolves it.
ACK clearing also requires the original destination-bound, reserved-name
`nofile` composer still to be owned. Renamed/type-promoted buffers become user
work, not draft targets. Polling checks view changedticks independently of the
`modified` flag; edited views are retained until explicit `:WebexRefresh!` in
that view. Unrelated reserved-name buffers are never adopted or replaced.
Delivery fields and the pending request's exact destination are checked before
send admission is released. Invalid output stops further bytes from that job and
synchronously retains/blocks pending drafts as unknown; an old exit callback
cannot undo cleanup or affect a replacement backend. Identical rendered views
are not rewritten, but accepted revisions still produce their normal state hooks.
If messaging stops while a POST is pending, the send returns `-32004` (delivery
unknown), even though the closed store suppresses late delivery events. The
editor releases pending admission but retains/blocks that destination's draft;
it never treats cancellation as silent success or an automatic retry.

Threaded send admission requires the current room, a loaded root message or a
loaded reply establishing that root, and a valid explicit `parentId`. A loaded
reply cannot itself become a nested root. Request replay is bound to room,
parent and plaintext; an altered target/body cannot reuse a delivery ID. REST
ACKs must match both room and parent, and native ACK clearing also checks the
original buffer's parent binding. Uncertainty remains room-wide, including
other thread drafts. Ordinary draft names are unchanged; reply buffers use a
disjoint `wbx://reply/<escaped-room>/<escaped-parent>` URI and collision-free
draft keys, because valid Webex IDs can contain base64 slashes.

Display metadata is computed locally from validated messages: a body line can
never define a sender header/reply target by resembling UI text. Native rails,
indentation and composer banners do not mutate body/draft text or changedticks.
Render work is capped at 1,000 body lines/message and 20,000/view; clipping is
explicit and prevents both manual and automatic receipts from that view.

History projection updates preserve per-window message-ID/intra-message anchors
and fold choices. Grouped rendering defaults on (`threaded_history=0` opts out):
roots chronological, replies chronological within each root. Thread blocks expose
`thread_start/end/head/size` for real outer folds around root and reply headers,
with message bodies nested. `:WebexThreadFold` toggles that outer fold from any
member, never a spanning range of unrelated roots. Latest navigation/receipts
resolve the canonical newest message ID, not the final rendered block.
Automatic edge paging uses
`rooms.list({more:true})` / `messages.list({older:true})`, with one in-flight
request, no initial draining and explicit error retry. It does not introduce a
send/read operation. Clean unloaded projections are distinguished from actual
annotations/promoted buffers, including hidden edits after `noautocmd bufload()`.
Current integrated validation is recorded separately from historical tests.

Rooms may expose `unread:boolean` with `unreadStale:boolean` on listed and selected
metadata. Both fields are absent for never-confirmed/evicted rooms. Last-confirmed
values survive source failure/partial data/same-session renewal only in memory;
explicit stop/account/profile changes clear them. A stale read flag is historical,
not confirmation, receipt consent or permission to clear automatic-attempt dedup.

The independent `spacesCache` projection contains `state` (off/loading/miss/stale/
ready/unavailable), optional fixed `reason`, observation time, and an optional
`verified` boolean recording successful live room-list discovery. Cached-only
list rows carry `cached:true`, with no selected room, messages, readiness or restored
pagination cursor. Optional last-confirmed `unread:boolean` fields require
**`unreadStale:true`** on cached rows; omission means unknown, not read. These
flags remain stale after REST membership is revalidated, until a fresh per-room
SDK observation supersedes them. Mixed cached/live rows, selected cached rooms,
and cached/fresh-read contradictions fail native validation. Both native
selection and Node reject cached-only targets; no pending open is replayed when
the fresh list replaces them. Status/error metadata never exposes account IDs,
cache keys, identity responses, paths or provider errors. With caching enabled
(native default true), fresh REST rows can appear before the SDK settles;
`spaces_cache=false` retains the original first-list/unread gate.
See [the spaces-cache contract](spaces-cache.md).
The [persistent unread extension](persistent-unread.md) uses the same flags and
existing fields. Disk booleans never populate the SDK's authoritative maps, and
cache/metadata renewal never resets their independent observation timestamps.

`upcomingMeetings` is a bounded scheduling projection with state, coverage,
required scope, up to three inert cards and a monotonic revision. Cards contain
ID, sanitized title, UTC start/end, type/state and joinability, **never a URL or
secret**. Unknown fields/duplicate IDs/stale joinability fail validation. Enter
submits only ID/revision; Node checks the same fresh occurrence/account before
the existing headed live join, transmission initially off. Expired hovered cards
move to neutral chrome rather than silently inheriting another row's action.

With `peopleStatus:true` (explicitly requested by native clients by default),
state also carries a bounded flat
`peopleStatus` for the selected direct room: textual capability/state/presence,
optional observation/last-activity/retry time and sanitized display name, and
explicit `customStatus:'unsupported'`. Existing grant checks precede identity or
presence reads. Explicit room selection/details may trigger optional fetches.
Optional hello submode `peopleSpaces: ['visible-v1']` adds `people.spaces {roomIds}`
and bounded state `peopleSpaces: SelectedPeopleStatus[]`. The existing top-level
capability count remains at most 32, preserving the old native hello boundary.
The request has unique, at most eight listed/noncached direct-room IDs; no person
IDs, grants, URLs or tokens. Each projected status must refer to an exact current
direct row. Native viewport/cursor reports are debounced; unchanged sets add no
RPC. Hidden/annotated lists report empty relevance. This never selects a room.
Current clients additionally negotiate `peopleViewport: ['paged-v1']`, using
`people.viewport {roomIds}` (up to 128 unique live direct rows) and state
`peopleViewport: SelectedPeopleStatus[]`. The legacy eight-row submode is unchanged;
no 33rd top-level capability was added. Sanitized visible observations are retained
while the existing provider keeps the complete visible relevance set. The
60-second freshness deadline is eligibility for refresh, not a promise to refresh
128 slow HTTP targets simultaneously. Verified peers use the documented People
list-by-ID endpoint in batches of at most 85 exact IDs, with no directory search.
Cold roster discovery uses two continuously working HTTP readers for the entire
reported batch, then retrieves the resolved statuses in one GET. It no longer
limits each scheduler turn to two people or sleeps between roster pairs.
The status-request budget still permits two starts per rolling two-second interval;
one bulk GET consumes one start. Both initial readers share one cancellable
self bootstrap; cancellation of one cannot abort the other's bootstrap. There is
no duplicate active target or third physical request. Membership/status stages retain the existing
native admission/abort/deadline guards; status GETs wait before their first
submission when the shared start/cooldown deadline has not arrived. This is not
HTTP replay and does not bypass Retry-After.
Viewport relevance is not cache lifetime. The engine/native display retain up to
500 loaded live direct-row observations per session, projecting only the current
viewport/selected set on the wire. Re-entering a fresh row uses its original
observation time rather than returning `not-loaded` and issuing new HTTP. Cache
retention cannot widen the 128-visible-plus-selected relevance owner or cross session/grant/row
authority boundaries.
Verified peer mappings are retained for up to five minutes (at most 500), pruned
on unloading/revocation, and never confer mutation authority.
Selected and visible peers share one identity/presence owner, two physical slots,
singleflight and a paced engine timer. Refresh is every 60 seconds (or later under
Retry-After). Session/provider changes cancel it; denied/missing-grant/expired-token
states cannot start reads or auth replay. History/list polling, pagination,
snapshots and token renewal do not themselves fetch presence.
Explicitly disabled/demo/disconnected presence paths do not request people;
group rows are never peers (other visible direct rows remain independently eligible). The
separate spaces-cache identity path may read only self identity for account isolation,
never peer presence or directory enumeration. The native
**`:WebexPeople` / `<leader>Wp`** opens native local snapshot text without
`people.lookup`, messages or receipts. Local `r` refreshes published text only;
`q` returns to the exact origin. `:WebexPeopleRefresh` remains a separate explicit
provider read, with snapshot room/session metadata used only as a refusal guard.
State/late responses never repaint or focus details. Offline evidence is in the
[verification index](verification-index.md); earlier checks are recorded in
[implementation progress](implementation-progress.md). See
[people status](people-status.md#selected-room-backendrpc-and-native-contract)
for exact allowlisted fields, grants, TTL/bounds and validation rules.

### Private local drafts

Optional hello `localDrafts: ['disk-v1']` enables `drafts.open {}` and
`drafts.save {profile,revision,items}`. Open returns `{sessionId,profile,revision,items}`;
save returns the same header without `items`. Both hashes are lowercase SHA-256
strings; the session ID is the current local UI session. The profile is derived
only from a verified self account and the OAuth/configuration profile (or a
separate account-free demo profile), never supplied as arbitrary filesystem scope.

Items contain only `{roomId,parentId?,text,format:"plain"|"markdown",uncertain:boolean}`.
Save is a **patch**, not a replacement: named destinations are merged; empty text
with `uncertain:false` removes only that draft. Native autosave sends one bounded
item per request, retaining the unchanged 32 KiB request-frame limit. The whole
private document is bounded at 64 entries / 1 MiB; native autosave refuses an
individual item above 24 KiB encoded rather than truncating it. An optimistic
revision plus exclusive private lock refuses conflicting editors/unsafe files.
No credentials, attachment handles, consent flags, read receipts, requests or
mutation preparations are saved/restored. Restoring is not permission to send.
See [storage and recovery](drafts.md).

`session.stop` may interrupt an in-flight `session.start`; generation checks
suppress late OAuth/history callbacks. Shutdown replies before closing its own
jobs/sockets. EOF/signals also close the OAuth/store/controller resources.
Valid shutdown admission rejects new mutations before waiting for explicit
meeting leave, while retaining read-only state access and the final response.
By default the media owner survives; closing an editor is not proof of leave.
With `leaveMeeting: true`, shutdown also cancels queued/in-progress meeting
startup and confirms the recorded owner process exited before acknowledging
leave. Control-socket loss alone is not accepted as that confirmation. Concurrent
close calls share one cleanup; the editor allows a bounded longer exit wait for
this explicit policy. Failed confirmation is reported as unknown, never success.

## Meeting presentation

The launcher uses deterministic private call identities and refuses collisions
with unrelated tmux work or stale metadata without a verified live owner. The
exact initial owner pane/process is recorded before terminal/OAuth waits; startup
cancellation never guesses the first pane or signals newly inserted user work.
Controllers verify call identity and owner-only broker
socket permissions before admission. Tmux metadata carries pane/owner identities,
never credentials. Presentation controls act on the existing owner and are
checked against its managed pane identity.

Kitty/editor switches replace only the owned presentation client, not the
Webex/media owner or participant/share pane processes. Kitty readiness is checked
against its actual tmux client before graphics are re-probed. Graphics/cell-size
responses relay across panes so reply routing does not depend on focus. Fresh
capability/shared-memory checks and serialized probes prevent stale replies or
rapid switches from advancing a different display. Unsupported pixels fall back
to blocks without a rejoin. Tmux appearance inherits the user's server config
unless explicitly opted into engine styling.

See [editor tests and user setup](editor.md) and the separate
[authorized live acceptance record](live-acceptance.md). Its narrow prior
diagnostic reconnect/styling observations do not complete live delivery, receipts,
threads, renewal or meeting/media acceptance, which remain NOT RUN.
