# Public messaging provider audit

Retrieved **2026-11-15**, unauthenticated official documentation only.
The initial Markdown fetches exposed navigation only. A later HTML inspection
found JSON in `window.__INITIAL_STATE__`, parsed as JSON (never evaluated).
`apiReference.entry.entries[].versions[].spec` contains the substantive
version-1 operation and response schemas. No page auth/CSRF/analytics state is
used by the application or retained as a provider credential.
This corrects the evidence limitation, not the earlier fact that the Markdown
bodies lacked schemas. It is documentation evidence, **not live service acceptance**.

## Findings

| Source | Exact documented finding | Consequence |
| --- | --- | --- |
| [List People](https://developer.webex.com/docs/api/v1/people/list-people), v1, `GET /people` | `displayName`: “List people whose name starts with this string.” Non-admins require email or displayName. `excludeStatus`: “Omit people status/availability to enhance query performance.” Response `items` has person IDs/display names and optional Link header. | MF20 can implement explicit bounded prefix queries, not substring search, org enumeration or presence polling. The older installed SDK's “contains” wording is not used. |
| Same page, `scopes.scopeItems` | `spark:people_read`: “Read your users' company directory”. `orgId` is admin-only for another organization. | Reuse known granted `spark:people_read`/`spark:all`; never send orgId/admin/calling fields or expand scopes. |
| Same page, embedded Basics → Pagination | RFC5988 Link header, `rel="next"` guaranteed when another page exists. Example preserves displayName and max plus before/after. | Explicit next-page requests only; constrain returned links to exact origin/path/query and fixed size/privacy parameters. No automatic drain. |
| [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages), v1, `GET /messages` | roomId required; parentId supported; mentionedPeople accepts only `me`/current user, max at most 100 with that filter; descending creation order, pagination. | MF07 selected-room mentions and MF11 explicit remote threads are possible contract candidates, not evidence for an account-wide inbox or complete one-page thread. |
| [Create a Message](https://developer.webex.com/docs/api/v1/messages/create-a-message), v1, `POST /messages` | “The `files` parameter is an array, which accepts multiple values to allow for future expansion, but currently only one file may be included with the message.” | MF14 multiple files is **not exposed by this reviewed provider**. Do not fan one Send into hidden messages or interpret the array as approval. The separately reviewed Markdown+single-file contract below permits offline implementation only. Existing smaller application limits remain. |
| [Get Person Details](https://developer.webex.com/docs/api/v1/people/get-person-details), v1 | Presence only in own/managed organizations and subject to status-sharing policy. | No inferred offline/custom status. Selected textual profiles are a separate field/privacy contract; avatar URLs do not authorize fetching. |
| [Update a Person](https://developer.webex.com/docs/api/v1/people/update-a-person), v1 | Admin-only full-details replacement, partial microservice side effects possible even on error. | Not a self-status/DND writer; no account-admin people editor is added to this messaging roadmap. |
| [List Rooms](https://developer.webex.com/docs/api/v1/rooms/list-rooms), v1 | orgPublicSpaces lists joined/unjoined org-public spaces, sorted by madePublic; cannot combine teamId/type/sortBy. | MF25 discovery has a public candidate, not permission to join/read/post without membership validation. |
| [Update a Room](https://developer.webex.com/docs/api/v1/rooms/update-a-room), v1 | teamId may assign only unowned spaces to a Team; moves between Teams unsupported. Some flags are compliance-only; announcement mode requires locked space. | MF23 cannot implement arbitrary Team moves or infer rights from observed flags. Each write needs fresh roles and a separate one-shot contract. |
| [Delete a Room](https://developer.webex.com/docs/api/v1/rooms/delete-a-room), v1 | Non-moderator deletion removes the actor instead; Team room deletion archives instead; deletion irreversible. | Leave/Delete/Archive require distinct truthful semantics; a successful status alone cannot prove shared room deletion. |

No reaction/Sections/internal-interface gate is released by these public schemas.
The public docs also do not establish remote pins/Flags, typing, seen-by,
mark-unread, cross-space search, personal Hidden/mute or native Sections.
The later [MF22 review](#mf22-preferences-review-and-own-direct-visibility-read-contract)
adds a narrow **raw direct-membership flag observation** contract; it does not
establish product Hidden/Favorites/mute synchronization or preference writes.

## MF20 approved read-only implementation contract

Gate P decision: **approved bounded public-read contract for offline
implementation**, separate from service acceptance.

- Native `:WebexDirectory [name prefix]` prompts once when omitted; no per-key
  lookup. At least two non-control characters, at most 120 Unicode characters /
  480 bytes; no empty query, wildcard/organization scan or caller-selected org.
- Finite `people.search` operation accepts only `{query, more, revision}` with
  revision required for next-page requests; session owned by the existing engine.
  Return `{sessionId, query, revision, coverage:"directory-prefix", partial, more,
  observedAt, items:[{personId,label}]}`. No email, avatar, phone, presence,
  status, roles, licenses, credential or raw payload is projected/retained.
- One physical GET per explicit query/page through existing `PublicREST`;
  existing known grant checks before/after. No SDK, redirects, auth refresh,
  retries, account probe, meeting device, persistence or background polling.
- Request max=50, excludeStatus=true; strict public-origin `/v1/people` next link,
  exact query/privacy/page-size binding, finite before/after cursors, no duplicate/
  additional keys, cyclic links, hidden read sequence or unbounded redirects.
  Links omitting excludeStatus are normalized to true, never followed without it.
- 50 items/page, at most five pages/250 retained identities, two-minute local
  query expiry, existing 20-second feature/8-second physical deadline and single
  physical owner. Rate-limit/refusal/malformed/cancel/expiry invalidates paging;
  partial data remains partial, no budget-based completeness claim.
- Strict ID/label/duplicate validation; missing labels become “Unnamed person”,
  never guessed identities. Same-name rows remain distinguishable by person ID.
- Native on-demand directory list reuses annotation/promotion/map/return guards.
  Enter prepares a DM through the existing exact-person owner, never sends.
  Recheck clean list/session/age/revision and use the selected ID, not a label.
  Prepare itself revalidates the exact person/grant; directory hits confer no
  membership, ownership, write or receipt authority. No automatic profile lookup.
- `directory-search-v1` advertises this operation independently of automatic
  selected-peer presence. Older backends explain unavailability. No default
  consent, dependency, configuration or standalone TUI behavior changes.

Required offline evidence: protocol malformed/extra-field rejection, fixed-query
and hostile pagination, same-name IDs, failure/429/expiry/cancel, account/session
reset, DTO privacy and explicit physical-read counts; actual Vim/Neovim keys,
heading/annotated/promoted/late/away-and-return choices and missing capability.
Live directory policy/tenant/grant acceptance remains unrun and separately gated.

## MF07 / MF11 selected-room read contract

Gate P decision: **approved bounded public-read contract for offline
implementation**, not live acceptance or an account-wide inbox. Sources are
the version-1 List Messages / Get Message Details schemas above: room membership
is required; list supports `parentId`, `mentionedPeople=me`, max and Link paging.
No internal SDK/interface is involved.

- Finite `messages.thread {roomId,messageId,more?,revision?}` and
  `messages.mentions {roomId,more?,revision?}` operations; no caller person,
  arbitrary parent, URL, actor, server query or credential fields.
  Exact selected ready room/session and known granted `spark:messages_read`/
  `spark:all` are required before and after every physical read.
- A new thread starts from an exact **currently loaded** main-history message.
  GET that message afresh and verify room/ID/loaded parent relation; if it is a
  reply, GET its root afresh and require a root (no parent). Then explicitly
  fetch one `GET /messages?roomId=...&parentId=...&max=50` page. This is at most
  three bounded GETs (source, root when distinct, first replies page), disclosed
  as the initial read sequence, not automatic pagination. Each subsequent
  explicit page costs exactly one GET. Malformed/nested/cyclic/wrong-room parent
  data refuses, without guessing ancestry or falling back to unrelated content.
- Mentions issue one `GET /messages?roomId=...&mentionedPeople=me&max=50` per
  explicit page. Identity comes from the documented authenticated `me` filter,
  not names, body markup or a new identity probe. **@all coverage is unverified**;
  the view says selected-space API @me results, not all incoming mentions.
- Independent fixed thread/mention slots, each at most five pages, 250 returned
  items (plus one thread root), 256 KiB serialized retained item data and a
  two-minute query lifetime. Existing 20-second feature/8-second physical
  deadlines and shared physical admission stay unchanged. Cancellation/reset
  cannot admit another request until physical work settles.
  The editor additionally bounds its JSON re-encoding to 512 KiB (encoding
  differences), without raising the Node retained-item quota. The existing
  separate 64-entry RPC reply cache stays bounded; cached read replies retain
  session/age metadata and never refill query slots or confer action authority.
- Strict next links: fixed public origin/path, exact room/root-or-me/max,
  bounded before/beforeMessage cursors, no changed/duplicate/additional filters.
  Cycles, item/page/byte budgets stop with an explicit partial/limit label.
  Page absence is not deletion/access-loss proof. Exhausted query means at
  observation only, not an atomic snapshot or future completeness.
- DTOs bind session, room, source/root where applicable, revision, observation
  time, coverage, partial/more/limit and inert message bodies. Reuse pure
  `parseMessage`/bounded rich-text rendering, not `projectSent` or any file URL/
  image/card registry. No original file URLs, raw activities, author permissions,
  tokens or attachment/card actions are projected. File counts and explicit
  omitted/clipped-content labels are display-only.
- Reset both query slots on real room selection/reload, revocation, session
  stop/replacement. Old callbacks cannot refill either slot. Native choices
  also bind the selection epoch, including away-and-return, not just room IDs.
  No query result is merged into main history, unread/notification events,
  membership, newest-message endpoints or read-receipt evidence.
- Native `WvH` / `:WebexThreadFetch` explicitly opens the remote thread;
  existing `Wvh` / `:WebexThread` remains loaded-only. `Wvi` / `:WebexMentions`
  opens selected-space @me results. On-demand lists use `r` refresh, `]p`
  explicit next page, `q` return, `/` native loaded search; Enter opens an inert
  mention body or jumps to an exact already-loaded main-history message.
  Unloaded results never trigger an implicit fetch/selection/nearest-row jump.
- `:WebexQueryReply` is allowed only in a current queried thread with a
  verified root still referenced by loaded main history. It opens/reuses the
  existing exact-root reply draft, preserving text/undo; does not send or infer
  write authority. Existing backend parent/readiness/grant/send/ACK guards remain
  in charge. No parallel draft/send engine or reply-from-arbitrary-ID RPC.
- Capability `message-queries-v1`, strict old-backend absence, single command
  catalogue/help/optional which-key, annotation/promotion/unload/map/focus fences
  and explicit opt-outs. Rendering/help/status/cursor movement never fetches.

Required evidence: success/refusal/404/429, wrong identities/relationships,
hostile/cyclic paging and saturation, account/room/epoch/cancel/expiry races,
physical GET counts and no mutations/receipts/notifications; actual native keys,
partial/coverage labels, exact result navigation/root drafts/undo, missing
capability and annotation/promotion/unload safety. Live tenant/filter semantics
remain separately unverified.

## MF19 selected-person textual profile contract

Gate P decision: **approved bounded public-read contract for offline
implementation**, not live tenant acceptance or a status/administration writer.
On 2026-11-15 the official
[Get Person Details](https://developer.webex.com/docs/api/v1/people/get-person-details)
HTML's embedded version-1 JSON schema was read directly: `GET /people/{personId}`,
one required exact person ID; optional `callingData` defaults false.
The documented string response properties are `displayName`, `firstName`,
`lastName`, `department`, `title` and `timezone`. Missing timezone is explicitly
allowed. The same schema describes avatar as a URL, and status/lastActivity as
policy-restricted presence, not custom status or write permission.
`spark:people_read` is documented as “Read your users' company directory”.

- Finite `people.profile {personId}` only: no name/email resolution, caller actor,
  account selector, orgId, callingData, URL, field expansion or credentials.
  Reuse the existing engine session/known people-read grant/physical `PublicREST`
  owner; one fixed-origin exact-ID GET, no pagination, retries, redirect/auth
  refresh, identity probe, implicit participant scan, subscriptions or SDK.
- Return only `{sessionId,personId,coverage:"person-text",observedAt,partial,fields}`.
  `fields` may contain only the six documented strings above. Reuse bounded
  display-text sanitization, max 120 Unicode characters / 480 bytes per field,
  4096-byte entire DTO. Missing/malformed/normalized/clipped fields are partial,
  not inferred identity, absence, offline/busy state, role or authorization.
- Never project/store avatar URLs, emails, phones, addresses, manager/admin/
  license/role/org fields, raw payloads, presence/status/lastActivity or undocumented
  customStatus. Do not enrich the automatic presence/name caches or notification
  queues. Avatar transfers, self status/DND/profile writes stay outside this slice.
- Existing 262144-byte physical response / 8-second physical / 20-second feature
  limits and single physical admission remain. No new Node profile cache/registry
  or disk storage. Existing bounded RPC replies retain session/observation metadata.
  Stop/replacement/expiry/grant loss aborts or refuses old work; it cannot refill
  a new account/session.
- Native `WnP` / `:WebexProfile` uses an exact unchanged directory/member row ID,
  never its label, or an explicit `:WebexProfile {exact-person-ID}` argument.
  Participant views carry an additive native session marker captured by their
  existing read intent; old-session rosters cannot silently supply new targets.
  No automatic profile read on row movement, rendering, help or status.
- One on-demand `wbx://profile` textual buffer reuses existing list ownership,
  annotation/promotion/unload/user-map/return-window checks. It shows exact ID,
  observation time, partial/not-provided fields and excluded-field policy.
  `r` / `:WebexProfileRefresh` explicitly re-reads that same exact ID in the same
  session; `q` returns; `/` searches. Enter never sends, prepares a DM or launches
  an avatar/URL. Native editing/full undo in other buffers is untouched.
- Reject late/away-and-return/edited/prompt/selection/session callbacks, old or
  future response timestamps (two-minute response acceptance window), and
  mismatched IDs. A retained expired profile can only explicitly request fresh
  data, not confer authority; old-session refresh refuses. Missing capability
  `people-profile-v1` explains unavailability without reconnecting or probing.
  Existing mappings/groups, opt-outs and independent meeting owners are unchanged.

Required evidence: finite parser/DTO privacy, same-name IDs, unsafe/oversized/
missing fields, wrong ID/errors, missing/expired grants, physical GET counts,
302/401/403/404/429 no-replay, cancellation/reset and no presence/notification
mutation; actual Vim/Neovim keys, contextual help, custom-map/opt-out, annotation/
promotion/unload/undo/tiny-window and stale-session/late/away-and-return fixtures.
No live profile/tenant/grant/device test is authorized by offline acceptance.

## Follow-on public-read research (not runtime acceptance)

Inspected 2026-11-15 while the separate MF19 copied gate ran. These findings do
not widen that gate or approve a new runtime slice:

- **MF12:** the current v1
  [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages)
  schema lists only `roomId`, `parentId`, `mentionedPeople`, `before`,
  `beforeMessage`, `max`. It does **not** document `has=files`, a media index or
  link search. Do not invent those filters. Explicit bounded ordinary history
  plus local filtering could be separately designed, always labeled partial,
  not server-indexed gallery discovery. Current delivery remains loaded-only.
- **MF25:** v1 [List Teams](https://developer.webex.com/docs/api/v1/teams/list-teams)
  explicitly lists Teams **the authenticated user belongs to**, with only `max`
  as a documented parameter and `{id,name,description,created}` items. This is a
  candidate for a separately advertised joined-Team list, not org/public-Team
  enumeration. Existing `teams.list` remains labels for loaded room associations.
  v1 [List Rooms](https://developer.webex.com/docs/api/v1/rooms/list-rooms) supports
  `teamId`; `orgPublicSpaces` is a different joined/unjoined discovery contract
  and cannot combine `teamId`, `type` or `sortBy`. Neither labels nor returned
  room flags authorize joining, role changes or writes.
- **MF13:** the official [Cards Guide](https://developer.webex.com/docs/buttons-and-cards)
  embedded `documentation.entry.body` explicitly states Webex supports Adaptive
  Cards **1.3**. Messages' v1 `attachments` schema distinguishes AdaptiveCard
  content from file URLs. Microsoft's
  [versioned 1.3 schema](https://raw.githubusercontent.com/microsoft/AdaptiveCards/69b1a430303c03570009f68811734e90c66ec9c4/schemas/1.3.0/adaptive-card.json)
  documents finite TextBlock text, FactSet title/value, Container/Column trees,
  `isVisible=false`, input initial values and nested Action.ShowCard content.
  A future readable subset must honor hidden subtrees and omit input defaults,
  action data/URLs, nested ShowCards, refresh/auth, images/media and unknown/new
  versions. Plain inert rendering is not an action/submission contract.
  The attempted repository tag and adaptivecards.io version URLs returned 404;
  only the explicit repository version-path above returned 200, pinned to
  commit `69b1a430303c03570009f68811734e90c66ec9c4`. Failures were
  not treated as schemas or replaced with an unversioned current schema.

The bounded research note and proposed follow-on constraints are retained in
`/tmp/opencode/wbx-messaging-parity-341sx5zc/next-public-read-audit.md`.

## MF13 approved readable-card subset

Gate P decision: **approved inert read projection for offline implementation**,
using the official Messages v1 attachment envelope, Cards Guide and exact
Microsoft 1.3 schema commit above. No new service operation, grant, SDK,
dependency, schema download at runtime or action/submission provider is added.
`mf13-before/` / `mf13-baseline.json` freeze the preceding 412-source state.

- Only `contentType:"application/vnd.microsoft.card.adaptive"` with
  `content.type:"AdaptiveCard"` and exact `version` 1.0, 1.1, 1.2 or 1.3 is
  readable. Unknown/new versions/types are labeled inert omissions, never
  recursively dumped or interpreted as a fallback schema.
- Plain textual `TextBlock.text`, `FactSet.facts[].{title,value}` and nested
  `Container.items` / `ColumnSet.columns` / `Column.items` are the initial subset.
  Source order is retained; no layout/pixel parity is claimed. Markdown in card
  strings is literal display text. No HTML/template/Ex/JS/regex evaluation.
- `isVisible:false` hides the entire subtree. Invalid visibility or `requires`
  fails closed for that subtree; no fallback/requires, nested ShowCard, input
  default/ID/data, action title/data/URL, refresh/auth, image/media or unknown
  payload traversal. Generic omission labels contain no hidden values or URLs.
  All card actions and input collection remain unsupported and inert.
- Per message: inspect at most ten content attachments, 32 children per array,
  128 visited nodes, depth eight, 2048 UTF-16 units inspected per visible text
  field, and 4096 UTF-16 / at most 16384 UTF-8 bytes of projected card text.
  Node/depth/array/text saturation stops with an explicit partial/omitted label,
  never reads a hidden subtree to estimate its size or drains later content.
- Reuse `message-content.ts` / `parseMessage` for history, query and compatibility
  clients. Preserve existing plain/rich fallback text; append labeled card text
  into both display representations (escaped in Markdown). Combined display
  remains under existing 10100 UTF-16 units with explicit clipping labels, not a
  silently raised message budget. Ordinary non-card messages are unchanged.
- Main-history optional metadata is only `cards:{count,partial}`: count 1..10
  recognized Adaptive Card envelopes inspected, not all server attachments or
  action IDs. No raw card/action/input/URL object enters editor state, file/image
  registries, sender caches, notifications, unread or receipt authority.
  Snapshot metadata is defensively copied and equality/reconciliation includes it.
  Query DTOs retain only inert rendered text under their existing quotas and
  continue to disclose unsupported/omitted content, never raw metadata.
- Capability `adaptive-card-text-v1` gates a local loaded-card list:
  `WvC` / `:WebexCards` / `:WebexContent cards` reuse the current loaded-content
  owner and exact session/room/message/ownership guards. No new RPC. Enter
  navigates only to an exact loaded unchanged main-history message, never an
  action or URL. `r` regenerates locally, `q` returns, `/` searches. Old backends
  explain unavailable rather than parsing labels into card authority.
- Readable text is automatic in ordinary history; no new persistent pane or
  background query. User maps, opt-outs, annotations/promotions, full native
  draft undo, folds, destination binding and independent meeting ownership stay
  unchanged. Compatibility TUI gains only inert text, not native commands.

Required evidence: malformed/version/visibility/hidden/input/action/privacy
tests, malicious template/control strings, depth/node/array/byte saturation,
no fetch/POST/action/receipt calls, normal fallback preservation, strict metadata
and snapshot copying, query/main-history integration, actual Vim/Neovim
keys/help/opt-outs/annotations/folds/session checks and fresh copied full gate.
No card submission, avatar/link fetch or live bot/service test is authorized.

## MF25 joined-Team listing contract

Gate P decision: **approved bounded public-read contract for offline
implementation**, not Team joining, public discovery, management or live policy
acceptance. The official
[List Teams](https://developer.webex.com/docs/api/v1/teams/list-teams)
embedded version-1 JSON schema was re-read on 2026-11-15: `GET /teams` “Lists
teams to which the authenticated user belongs.” Only `max` is a caller query;
the response is `{items:[{id,name,description,created}]}` with optional `Link`.
The same page documents `spark:teams_read`: “List the teams your user's a member
of.” General official pagination defines RFC5988 `rel="next"` links. No user,
organization, account or arbitrary Team ID is a list parameter.
`mf25-before/` / `mf25-baseline.json` freeze the preceding 416-source state.

- Finite `teams.joined {more?,revision?}` only. Revision is required exactly for
  explicit next-page requests; no caller Team/person/org/role/filter/URL/cursor/
  token/grant fields. `joined-teams-v1` is separate from `server-teams-v1`:
  existing `teams.list` / `WebexTeams` retains loaded-room label semantics.
- Extend existing `ServerTeams`, engine feature/known-grant/session admission
  and fixed-origin `PublicREST`, not a parallel Team service or generic query
  tunnel. Require already-known `spark:teams_read` or `spark:all` before/after.
  One GET `/v1/teams?max=50` per explicit new query/page; no per-Team details,
  membership/room scan, identity probe, SDK, redirects, auth refresh or retry.
- One session-only paged slot: 50 items/page, at most five pages / 250 retained
  IDs, 65536 UTF-8 bytes of serialized retained items, two-minute lifetime from
  the first observation, checked both at page admission and completion. Native
  JSON re-encoding is separately bounded at 131072 bytes without changing the
  Node quota. Existing 20-second feature, 8-second / 262144-byte physical-response
  deadlines/quotas and single physical admission remain.
  Reset revokes old cursors but cannot release unsettled physical work.
- Strict same-origin `/v1/teams` next links preserve max=50; only bounded
  before/after cursor parameters from the returned Link may be followed.
  Reject duplicates, additional/retargeted filters, changed max, unsafe origins,
  fragments/credentials, malformed/ambiguous next links. Cycle/byte/page/item
  exhaustion stops explicitly partial; no automatic drain or nearest-page guess.
  Unknown cursor shapes refuse rather than being treated as documented support.
- DTO: `{sessionId,coverage:"joined-teams",revision,observedAt,partial,more,limit,
  items:[{teamId,label}]}`. Limits are `none|items|pages|bytes|cycle`. Project only
  strict unique IDs and bounded sanitized display labels (120 Unicode characters /
  480 bytes); missing/malformed names say “Unnamed Team”, never guessed identities.
  Names are presentation-only and may be clipped. No description, raw payload,
  creator/member list, roles, room membership, credentials or action authority.
  API exhaustion means only that query at observation, not an atomic snapshot,
  current membership proof, organization census or deletion/access-loss proof.
- Keep the slot separate from the loaded-label cache; reset on existing session
  stop/replacement. Failures invalidate next-page eligibility without erasing
  old display annotations or inferring remote membership changes. Query results
  do not seed rooms, loaded-label caches, unread/notifications, receipts, roles,
  writes or meeting resources.
- Native `WvT` / `:WebexJoinedTeams` explicitly opens the on-demand joined list;
  `Wvt` remains loaded associations. `r` / `:WebexJoinedTeamsRefresh` explicitly
  starts a fresh query in that same session (even if the retained view aged).
  `]p` / `:WebexJoinedTeamsMore` reads ONE next unexpired exact-revision page.
  `q` returns; `/` searches loaded text. No render/help/cursor-triggered reads.
- Enter / `:WebexJoinedTeamFilter` uses the exact selected row ID only to filter
  currently loaded, noncached spaces through the existing filter owner. If none
  are loaded, explain that limitation; do not fetch rooms, select a destination,
  join/invite/post, or claim the Team has no spaces. A joined-Team hit does not
  confer room membership, read/write permission or role authority.
- Native DTO/response age/future-time, exact session/intent/serial, clean-buffer
  and away-and-return guards; old-session/annotated/promoted views cannot page,
  refresh or target a new session automatically. Preserve source focus, full
  draft undo, user mappings/prefixes/opt-outs and the single command catalogue.
  This adds one capability under the unchanged 32-capability protocol ceiling.
  Native-only controls; standalone messaging/meeting behavior is unchanged.

Required evidence: fixed GET counts, strict RPC/DTO privacy, hostile/cyclic
paging, overflow/age/revision/session/cancel/grant-loss/refusal/429, no hidden
detail/room scans or writes; same-name IDs and stale/late/away-and-return/annotated/
promoted/unloaded native lists, no rendering request growth, exact loaded-only
filtering/destination/undo and old-backend/key/help/opt-out checks in both editors.
Fresh copied integrated verification and separate live tenant/grant acceptance
remain required; this contract authorizes no live service probe or join.

## MF14 Markdown plus single-file contract

Gate P decision, **2026-11-15: approved for offline implementation and synthetic
verification only**. This is a single-message/single-file extension, not delivery
acceptance, multi-file support, MF15 first-contact DMs or permission to activate
Webex/OAuth. At this contract-first boundary runtime/native help still refused
Markdown with a staged file. The subsequent
[runtime slice](messaging-parity-implementation.md#mf14-markdown-single-file-runtime-slice)
records its own implementation and acceptance status; this research does not
stand in for that gate.
`mf14-baseline.json` / `mf14-before/` freeze **420** pre-slice sources, ten checkout
bundle/map hashes, HEAD and empty staging. Earlier accepted gates do not accept
the proposed runtime changes.

### Evidence and its limits

1. The official [Create a Message v1](https://developer.webex.com/docs/api/v1/messages/create-a-message)
   operation says plain **or rich** message with an optional attachment. It
   documents `roomId`, `parentId`, `markdown`, optional alternate `text`, and
   exactly one `files` value. `spark:messages_write` posts/deletes messages.
   Response fields include message `id`, `roomId`, `parentId`, `created`,
   `markdown` and `files`. The operation schema's sole request content type is
   **application/json**, not a separate Markdown multipart schema.
2. The same page's embedded Basics → Local File Attachments guide explicitly
   requires `multipart/form-data` instead of JSON for local files and shows
   `files`, `roomId` and optional plain `text`. It does **not** directly demonstrate
   a `markdown` part. Remote URL attachments are a different JSON shape, not a
   replacement for staged bytes. The schema also says uploaded files may be
   converted by Webex.
3. Installed public `@webex/plugin-messages@3.13.0`,
   `src/messages.js:136–161`, selects one `formData` object for non-string file
   values and retains Markdown/root fields. `@webex/http-core@3.13.0`'s browser
   `request.shim.js:248–286` appends fields to browser FormData; this is **not the
   Node serializer**. Its package browser mapping and Node `request.js` instead
   select `request@2.88.2`, whose `request.js:319–341` expands file arrays using
   `form-data@2.5.6`. No installed package is edited or used as the upload sender.
4. `mf14-node-wire.mts` executes the public message payload selection and actual
   installed **Node** transport/serializer into an in-memory Writable. A socket
   tripwire forbids all connections. Three cases pass: Markdown + one binary
   file; Unicode/multiline Markdown + exact root + one file; and an explicit
   alternate-text source-compatibility case. Each produces exactly one native
   POST-shaped call, exact decoded UTF-8 fields, one `files` part (not `files[]`),
   exact binary bytes and accurate Content-Length. **Zero network connections /
   zero service POSTs.** The SDK request interceptors are bypassed by this fixture:
   it proves encoding compatibility, not SDK replay containment or service ACKs.
5. `mf14-public-evidence.json` retains only the selected official schema/guide
   excerpts, not full page/auth/CSRF state. Its SHA-256 is
   `26a750fb6639b409764321148951cef538835aee1f1f9d29ee76f74b843f2bf4`.
   Initial Python retrieval received 403; one corrected public HTML request with
   a browser User-Agent succeeded, as did the separate fetch integration.
   Both the failure and corrected result are retained, not counted as live tests.

All MF14 research paths above are beneath
`/tmp/opencode/wbx-messaging-parity-341sx5zc/`; `mf14-contract-research/` retains
the run output. This combined documentation/source/encoded-byte evidence
supports a conservative offline implementation. **No actual Webex acceptance of
Markdown multipart, root handling, tenant/file policy, conversion, grants or
response Markdown equality has been tested.** No live probe is authorized.

### Finite negotiation and wire shape

- Keep the existing 32 capability strings and the unchanged 32-entry ceiling.
  Add only optional hello-result `uploadFormats:["markdown-single-file-v1"]`,
  a **separate finite assertion** of this combination. It is not another RPC,
  arbitrary format/provider registry or a 33rd capability. New native validation
  admits an omitted field, an empty list, or that exact singleton; wrong types,
  duplicates/unknown values refuse. The singleton requires `uploads-v1`,
  `markdown-send-v1` and `local-context-v1`. Store/reset the assertion with the
  existing hello/transport lifecycle, never in persistent user configuration.
- Existing clients ignore the optional hello field and keep their refusal.
  New clients talking to an old backend also refuse the combination. The
  presence of uploads + Markdown capabilities **alone does not enable it**.
  A malformed/missing assertion never downgrades to plaintext, drops a file or
  routes to a text-only send. Do not silently remove older capability strings.
- Extend existing `uploads.send` with optional `format:"markdown"` and optional
  boolean `mentionsAccepted` / `allAccepted`, only with that format. Omitted
  format preserves the existing plaintext contract. No `files` array, extra
  `markdown` body, URL, caller account/actor, raw bytes, token, arbitrary field
  map or second delivery operation. Existing `text` carries the exact Markdown
  draft when format is Markdown; empty/whitespace-only rich captions refuse
  rather than silently becoming a plain file send.
- Extend `UploadFields` / `multipart()` in `src/upload-http.ts`, not the SDK:
  fixed `POST https://webexapis.com/v1/messages`, random boundary, fixed byte
  Content-Length, text parts `roomId`, optional exact `parentId`, and exactly one
  `markdown` part; exactly one binary `files` part from the already-staged
  immutable source, escaped basename, `application/octet-stream`, closing CRLF.
  Preserve valid UTF-8/newlines exactly. No generated `text` alternative, HTML,
  remote-file URL, second message, multipart field tunnel or Markdown-to-plain
  rewrite. The explicit fallback research case is **not** a new application
  input. Plain uploads retain their current `text`/file-only wire.

### Consent, ownership and bounded preflight

- Reuse `Uploads`' anonymous read-only FD snapshot, exact
  `{roomId,parentId?,draftId,attachmentId}` binding, engine generation/session,
  `uploadContext`, `MessagingStore.sendPrepared` and current transport. No
  second sender, draft-body registry, filesystem reread, meeting SDK/device,
  credential lease, new grant or persistent file path. Detach/copy binding,
  format and consent inputs before the first await.
- An owned unchanged normal/reply composer, explicit file staging, explicitly
  chosen Markdown format and existing Send command/key are the base intent.
  Retain existing destination/readiness/known unexpired write-grant checks.
  Loaded room metadata is **not fresh posting permission**; the service enforces
  that permission and may refuse. No new actor/person probe is inferred.
- Reuse `richMentions()` / `validateMentions()` / `RoomMembers.verify`, not a
  second mention parser or cached-directory/roster authority. Unsupported
  email/HTML/malformed mention syntax refuses. Maximum 16 unique exact person
  IDs / 32 markup occurrences. Real mentions are group-only. Existing send-time
  target consent is required for any real mention; `<@all>` additionally needs
  separate default-Cancel consent **for this submission**, not just insertion.
- Before any membership GET, validate syntax, group context, consent and known
  `spark:memberships_read`/`spark:all`. For each unique person, exactly one fresh
  exact-person/room membership GET, sequentially, no automatic paging. Recheck
  required grants, session, root/destination binding and cancellation around
  each read and immediately before submission. `@all` alone has no person-ID
  verification GET; explicit group/broadcast consent does not assert complete
  roster membership or guaranteed delivery. No mentions means zero preflight
  GETs. A missing consent/grant, bad identity, failed/429/late GET or changed
  binding must produce **zero POSTs**, not a text/file fallback.
- Reserve the existing store delivery and upload work slot **before preflight**.
  Put preflight inside the existing `Uploads.send` run, governed by its exact
  cancellation and physical cleanup lifetime. Its subordinate mention deadline
  is at most the existing 20-second feature budget, within the unchanged
  60-second entire send budget. The 20 seconds is not a new POST deadline or an
  excuse to release a nonsettled physical GET. No operation queues behind it;
  cancellation/reset/replacement cannot free the physical slot early.
- Existing budgets remain: 1000 UTF-16 units / 4000 UTF-8 bytes of valid Markdown,
  10 MiB/file, 20 MiB aggregate, eight references, 65536-byte chunks, eight-second
  staging, 60-second send including preflight, 8192-byte multipart envelope,
  262144-byte / 1024-read response. Public membership reads retain their existing
  eight-second / 262144-byte physical limits; no retries or background drain.
  Serialized envelope overflow refuses before the first write.

### One-shot outcomes and correlated ACK

- The existing fixed-origin Node HTTPS upload transport remains the sole POST
  owner. No SDK/REST auth refresh, redirects, key-rotation follow-up, reconnect,
  recovery, cancel or timeout may replay it. Consume conservative submission
  admission immediately before the first body write. Reject duplicates through
  the shared delivery ledger, never a second upload replay cache.
- Bind ledger identity to exact room/root/text, draft, staged handle, Markdown
  format and normalized consent, preserving legacy plain identities. A reused
  request ID with changed text/format/file/consent/target refuses. The shared
  **64-entry** per-session ledger must refuse saturation rather than evict old
  write evidence into resend eligibility; extend that existing owner, not a new
  ledger. The current oldest-entry eviction is an implementation delta required
  before this slice can pass.
- Before submission, local validation/preflight/abort/deadline failure is
  **failed/refused** with no POST. After conservative submission, the existing
  explicit refusal statuses (400/401/403/404/413/415/422/429) stay refused, with a
  truthful warning that file bytes may have reached the service. Any redirect,
  ambiguous status/network/cancel/deadline, malformed/oversize/invalid-UTF-8 JSON,
  or mismatched ACK is **unknown**, never retried. Remote rollback, file cleanup
  or nonreceipt cannot be inferred. Retain native text and staged/uncertainty
  state according to the existing upload owner; explicit resolution never sends.
- Only a bounded 200/201 JSON object without an `errors` envelope may acknowledge.
  Validate **raw** message ID, exact room, exact root (only absent/null means no
  parent), valid creation time and exactly one allowlisted Webex contents URL
  using existing `webexAttachment()`. Require **raw `markdown === submitted
  text`**, before any display normalization; no trimmed, stripped-HTML or
  plaintext fallback equality. Require a new ID, not a currently loaded message.
  Only after these checks call `store.projectSent` to register returned file
  references. A rejected ACK must not seed file/image registries or history.
- The provider ACK does **not** echo local `attachmentId`, `draftId`, content
  digest or original bytes; file conversion is documented. Correlation means
  this one response to this one reserved request/staged handle plus one returned
  allowlisted file reference, **not byte-identical remote-file proof**. Do not
  download/HEAD the attachment automatically to fabricate such proof.
- Publish through the extended existing delivery shape for this combination:
  `{requestId,roomId,parentId?,text,attachmentId,draftId,format:"markdown",status,
  message,messageId?}`. Only an exact successful ACK supplies `messageId`.
  Native correlation must check request/room/root/draft/attachment/format **and
  exact text**; baseline `drafts#delivery` did not itself compare result text,
  so that is a required implementation guard. Legacy events without a combined
  Markdown/file identity remain usable without an added caption field.
  Clear only the unchanged owned source buffer and matching staged handle after
  exact tick/text/format/target validation; retain full native undo, annotations,
  promoted buffers and any newer draft/file. No late ACK clears newer
  uncertainty or installs into another session.
- Preserve notification ordering: exact acknowledged plugin-send exclusion
  precedes upload-hold release; only that message ID is excluded. Same-account
  other-client messages still notify. Unknown deliveries gain no exclusion.
  `preview=false` hides sender/excerpt even in queued alerts. No extra receipts,
  body enrichment, cursor-triggered fetch or notification authority is added.

### Native integration and implementation acceptance

Use existing `:WebexAttach`, `:WebexFormat markdown`, `:WebexSend`,
`<localleader>s` / configured Send binding and `Wa` upload/format/mention helpers.
No new key family, permanent pane, replacement editor or duplicate catalogue.
Enter inserts a newline; write never sends. Show the staged filename/format and
destination with existing indicators/help. Revalidate the captured
session/selection epoch/window/buffer/tick/text/format/root/draft/handle after
**all** consent prompts, including away-and-return and file replacement.
Unavailable combination negotiation refuses before prompting or sending.
Route rich+file to `uploads.send`; leave rich-only and plain-only routes with
their current owners. No standalone TUI/meeting behavior change is inferred.

Before runtime edits, retain expected-red backend/native cases. Required green
evidence then includes actual custom-serializer bytes and one physical POST;
zero-POST preflight refusal; replay/ledger saturation; complete raw ACK mismatch
matrix; grant/session/selection/cancel/deadline/FD races; no pre-ACK registry
effects; exact acknowledged-send notification/privacy rules; native routing,
default-Cancel consent, stale/format/file races, text/undo/focus/maps/opt-outs,
old/new-client negotiation and both editors' drawn workflows. Run a **fresh
copied-project integrated gate** after implementation, not a checkout build.
Keep previous gate counts historical and full-plan incompleteness explicit.
Actual Webex wire/tenant/filter/grant/ACK policy acceptance remains separate
and requires authorization not present here.

## MF15 exact-recipient rich and single-file contract

Gate P decision, **2026-11-15: approved for offline implementation and synthetic
verification**, not service activation. This extends the existing recipient-first
owner with Markdown, one staged file with optional plain caption, or Markdown
plus one file. It does not add multiple files, recipient threads, group creation,
forwarding, interactive cards or an alternate sender. The recipient runtime
was still plaintext-only at this contract-first boundary; the subsequent
[MF15 runtime slice](messaging-parity-implementation.md#mf15-recipient-richfile-runtime-slice)
records implementation/verification separately from this research.
`mf15-baseline.json` / `mf15-before/` preserve **423** preceding sources, ten
checkout bundle/map hashes, HEAD and empty staging.

### Provider and encoded-wire evidence

- Re-read official **version-1**
  [Create a Message](https://developer.webex.com/docs/api/v1/messages/create-a-message),
  [Get Room Details](https://developer.webex.com/docs/api/v1/rooms/get-room-details)
  and People schemas, including Get My Own Details, Get Person Details and the
  exact-email List People filter. Their public embedded state is parsed only as
  JSON. Retained selected fields/excerpts:
  `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf15-public-evidence.json`,
  SHA-256 `7ff40c570df8edaa28566ff6a8cce3915616d2cbc5601cd6d4d24329bd20edb1`.
  No full page/auth/CSRF state or provider credentials are retained.
- Create Message documents `toPersonId` as the person ID for a private 1:1
  message, `markdown`, optional alternate `text`, and **one file only**. The
  documented response includes recipient ID, authenticated author ID, actual
  room/message IDs, room type, creation time, Markdown/text and files.
  Those schema properties are **not a guarantee every response echoes them**.
  Missing evidence below is unknown, never inferred or substituted.
- The local-file guide shows `roomId` multipart, **not** an explicit
  `toPersonId` multipart example. `mf15-node-wire.mts` executes public SDK
  3.13.0 payload selection and its actual Node serializer (`request` 2.88.2,
  `form-data` 2.5.6) into a memory-only native sink with all socket connections
  forbidden. Four cases pass: exact-recipient Markdown JSON, file-only multipart,
  plain-caption/file multipart, and Markdown/file multipart. Each has one
  POST-shaped native call, exact UTF-8 fields/binary bytes/Content-Length,
  **no roomId/parentId/email selector**, zero connections and zero service POSTs.
  Output is retained in `mf15-contract-research/`. SDK interceptors are bypassed;
  this proves encoding compatibility, not service policy/recipient echo/replay
  containment. The SDK is not chosen as a runtime sender.
- Get Room Details documents `type:"direct"` but explicitly warns that room
  titles may not identify the other participant. Never use a label, title or
  creatorId as peer proof. The new modes require an exact raw recipient-ID echo
  in addition to a fresh same-ID direct-room read. Existing plaintext legacy
  event/RPC shapes remain compatible; the stronger new contract is independently
  negotiated. Live availability of that echo remains **unverified**.

### Identity, finite protocol and staging

- Reuse `ConversationActions.prepareDirect` / `sendDirect` and their existing
  authenticated-self, exact person-ID/email resolution, context map, request
  ledger and person-keyed uncertainty. An email is resolved once during explicit
  preparation into one exact person ID; Send revalidates that ID, **not the email
  again**. Self/ambiguous/missing identity refuses. At each Send, freshly GET self
  and exact recipient; verify same authenticated self and prepared recipient.
  No directory scan, status/avatar enrichment, cached-label authority or
  arbitrary recipient/account override.
- Known unexpired `spark:people_read`, `spark:messages_write`, `spark:rooms_read`
  (or applicable `spark:all`) are required, as for existing recipient-first
  delivery. Recheck around reads and submission/ACK; configured grants are not
  proof. No membership grant expansion is needed: real Markdown mentions remain
  **group-only** and are refused in these 1:1 drafts using the existing
  `richMentions()` parser, before any POST. Plaintext mention lookalikes stay
  literal. No @all prompt can authorize a direct-message broadcast.
- Keep the 32 capability strings/ceiling. Add only a finite optional hello-result
  `directFormats` list containing unique members of
  `markdown-v1`, `single-file-v1`, `markdown-single-file-v1`, at most three.
  All require `conversations-v1`/`local-context-v1`; Markdown modes additionally
  require `markdown-send-v1`, file modes `uploads-v1`. An omitted/empty list means
  legacy plaintext only. Unknown/duplicate/wrong-type assertions refuse.
  Two separate direct-mode assertions, or MF14 support, do **not** imply the
  combined mode. No 33rd capability, dynamic provider registry or protocol bump.
- Extend existing `direct.send {targetId,draftId,requestId,text,confirmed:true}`
  with optional `format:"markdown"` and/or one opaque `attachmentId`. Omitted
  format stays plain. Empty text is allowed only with a staged file; Markdown
  remains nonblank, 1000 UTF-16 units / 4000 UTF-8 bytes. No caller roomId, parentId,
  personId, email, URL, raw bytes, files array, actor, token, HTML, alternate-text
  field or mention-consent bypass.
- Extend the **same** `Uploads` snapshot owner and `uploads.stage` /
  `uploads.remove` with a mutually exclusive recipient binding
  `{targetId,draftId}` in place of `{roomId,parentId?,draftId}`. Mixed/missing
  selectors refuse. Only current unexpired prepared contexts may stage; no
  fabricated room ID, placeholder POST, new file store or normal-room draft
  adoption. `uploads.send` remains room-bound; a recipient file is delivered
  only by `direct.send` through the existing conversation ledger.
  The internal binding union, progress DTO and native helpers must preserve the
  discriminator rather than converting opaque IDs between namespaces.
- Canonically copy binding/format/file identity before awaits. Existing snapshot
  quotas are shared across normal/reply/recipient drafts: **eight references /
  20 MiB aggregate / 10 MiB per file**, not another recipient quota. Keep
  anonymous read-only FDs, 65536-byte chunks, eight-second staging, replacement
  disclosure and late-stage/session fences. No path reread at Send.
  Progress is bounded identity metadata with either room/root or opaque target,
  never person/email/path/bytes/credentials. Disconnect/cancel/expiry cannot
  silently revive a handle.

### One mutation and authoritative completion

- First Send performs fresh self/person reads, then **one** fixed-origin
  `POST /v1/messages` using only the freshly verified `toPersonId`. Markdown-only
  uses existing `PublicREST` JSON, not a second text sender; files use the existing
  fixed-origin `postUpload` serializer/transport, with one `files` part and either
  plain `text`, `markdown`, or no caption. Never send both room and person
  selectors, synthesize a plaintext fallback, or create a placeholder/empty DM.
- After a confirmed first response, one exact returned-room GET must prove that
  same real ID is direct, before adopting it. Later recipient sends use only
  that stored real room ID after fresh same-ID direct-room validation; they must
  still ACK the exact recipient. No room-title matching, nearest-room scan,
  automatic selection, separate room creation or hidden second message.
  This is one client submission, **not an atomic service guarantee** that a DM
  is created exactly once.
- Reserve the existing conversation transaction before fresh preflight; for
  files also reserve the existing `Uploads.send` work/FD before those reads.
  One action/file sequence, no queue. File preflight uses at most the existing
  20-second sub-budget; the file sequence, POST and room verification share the
  existing **60-second upload budget**, not 20 + 60 + another ACK budget.
  Markdown-only retains the existing 20-second conversation limit. All public
  GET/JSON calls retain their eight-second physical limits.
  Logical abort/deadline/reset must not release unsettled GET/POST/socket/DNS/FD
  work; reuse `PublicREST.settled` and the physical upload owner.
- Recheck context/self/session/recipient/expiry/grants immediately before
  submission. Validity loss before conservative mutation admission is refused
  with zero POSTs; after admission it is unknown. File removal does not cancel
  an already admitted operation; explicit UploadCancel cannot prove it unsent.
  Exactly one POST per new request; no redirect, SDK key-rotation, refresh,
  reconnect, retry, resolution or replay-cache path may repeat it.
- Before publishing any room/message, registering file references or clearing
  native work, require bounded successful raw ACK evidence: no errors envelope;
  new message ID; actual room ID; authenticated author exactly self; **toPersonId
  exactly the prepared/fresh recipient**; root-only parent absent/null; valid
  creation time; exact **raw** Markdown or exact plain caption (empty file-only
  text may be absent/empty); and zero files for text-only or exactly one
  existing-policy allowlisted Webex contents reference for a staged file.
  Reject contradictory roomType, unexpected card/content attachments and
  wrong/extra/missing file evidence. Display trimming/HTML/name equality is not
  ACK equality. A first room must then pass the same-ID direct-room GET.
- Missing recipient echo is unknown, even if the room title looks right.
  A successful POST followed by refused/429/timeout/malformed room verification
  is **unknown**, not a failed send: remote creation may already have happened.
  Explicit POST refusal remains refused, including the reviewed upload refusal
  statuses; carry its typed refusal evidence, never infer status from strings.
  All other post-admission ambiguity retains the recipient's uncertainty latch.
  No remote rollback, file-byte equality or delivery-to-human proof is claimed;
  no automatic HEAD/download manufactures a digest the ACK does not supply.
- Keep the existing **256-entry** conversation/action ledger and person-keyed
  uncertainty, with no eviction or second send ledger. Bind format/file/text,
  target and draft into request identity. New IDs, changed format/files, expiry
  or another prepared context for that same person cannot bypass unknown.
  Store only the bounded message projection and one private allowlisted file
  reference when needed, at most **16 KiB** of retained result data for a new-mode
  send, not a full provider body. Byte exhaustion after submission is unknown.
  Eight recipient contexts / ten-minute lifetime remain; expiry never turns an
  uncertain first send into safe automatic creation/retry.
- Extend only `direct.delivery`/the matching RPC outcome for new modes with
  exact optional `format`, `attachmentId` and bounded caption `text`, alongside
  existing request/target/draft and confirmed real room/message IDs. Do not
  publish raw URLs, source bytes, peer emails or auth/profile payloads. Emit the
  exact acknowledged-send exclusion **before** room publication and existing
  directPending/notification-hold release. Preserve same-account other-client
  notifications and queued `preview=false` sender/excerpt revocation. Unknown
  outcomes acquire no exact-send exclusion, fabricated unread or receipt.

### Native acceptance and current boundary

Reuse `WebexDirect` / `Wnd`, existing `WebexFormat` / `Waf`, Attach/Remove/
Cancel/Status helpers and the same explicit Send binding. No new command family,
permanent pane, editor replacement or separate catalogue. The recipient status
must show exact peer, format/length, staged snapshot and “may create a persistent
DM”; selecting/staging/formatting/Enter/write do not send. Before first Send,
default-Cancel consent covers this exact person, text, format and staged file.
Recheck session/selection epoch/window/buffer/tick/text/format/target/draft/file
after all prompts; missing assertions refuse without downgrade or file drop.
Baseline helpers' room-only binding and “plain+file only” status wording were
required implementation deltas, not evidence of then-delivered recipient files.

ACK handling preserves full native undo, newer text/format/replacement files,
annotations/promoted buffers and older normal/reply drafts. A recipient file
never adopts the normal composer of the returned room. Only explicit Open
navigates there. Late/older resolution ACKs cannot clear newer uncertainty,
change the person, steal focus or adopt an unverified room. Old clients/backends
remain plaintext-only. Meeting ownership, transmission defaults, detach/tmux
styling, dependencies, configuration, credentials and grants stay unchanged.

Required expected-red then green evidence: finite RPC/hello variants; shared
snapshot quotas and exact target/draft source binding; physical JSON/multipart
counts/bytes; preflight zero-POST refusal; first/later ID routing; missing/wrong
recipient/author/root/raw text/file ACKs; post-ACK room-read failure; unknown
and saturation/replay/cancel/deadline/session races; notification privacy/order;
actual Vim/Neovim keys, consent/contextual help, file replacement, draft undo,
annotations/promotions, old negotiation and explicit Open without draft adoption.
A fresh copied-project full gate is required **after** implementation.
At the contract-first step, these expected-red tests did not implement MF15 or
release live tenant/echo/file/ACK policy acceptance. Subsequent offline acceptance
must retain that live-service boundary.

## MF10 server-indexed search provider gate

Gate P decision, **2026-11-15: NO-GO for runtime implementation/contract-first
feature tests**. Indexed keyword/cross-space search is **not exposed by the
reviewed Messages v1 operations**. Additional official MCP overview claims
remain **unvalidated candidates**, not evidence that no such provider can exist.
No supported index/query/cursor/permission contract was established for this
application. Do not approve a history scan just by naming it “search.”

`mf10-provider-baseline.json` / `mf10-provider-before/` preserve **427** accepted
MF15 sources, ten checkout bundle/map hashes, HEAD and empty staging. All paths
below are under `/tmp/opencode/wbx-messaging-parity-341sx5zc/`.

### Evidence and limits

1. Fresh unauthenticated official
   [Messages / List Messages v1](https://developer.webex.com/messaging/docs/api/v1/messages/list-messages)
   embedded state was parsed **as JSON only**. The page publishes six v1
   operations: Create, Delete, Edit, Get Details, List Direct Messages and List
   Messages. There is no indexed-search operation in that reviewed set.
   `GET /messages` has exactly these six query parameters:
   `roomId` (**required**), `parentId`, `mentionedPeople`, `before`,
   `beforeMessage`, `max`. No keyword `query`/`q`, cross-space selector, sender
   filter, `after` or `hasFiles` is documented there. List Direct Messages
   selects one 1:1 room by person ID/email; it is not an account-wide index.
2. The documented ordering is descending **creation time**, not relevance,
   index revision or a snapshot guarantee. Response `Link` / `rel="next"` paging
   is room-history paging. An absent keyword/index/cross-space continuation
   contract cannot be supplied by adding `query` to that URL or by scanning
   rooms until enough local matches accumulate. General REST pagination does
   not establish index completeness, matching rules, deleted/revoked-hit
   handling, stable search ordering or query-bound cursors.
3. [Messages reference](https://developer.webex.com/messaging/docs/api/v1/messages)
   requires room membership. The v1 scope description is
   `spark:messages_read`: “Read the content of rooms that you are in.”
   `mentionedPeople` permits only `me`/the current user; bots must include it in
   group spaces. None proves an account-wide indexed-search grant, unjoined-space
   access, reader completeness or permission to write/mark read from a hit.
   Missing/policy-limited content is not proof of no matching messages.
4. The official
   [Messaging MCP guide](https://developer.webex.com/messaging/docs/messaging-mcp-server)
   lists a room-bound `webex-search-messages`; the separate
   [Suite MCP guide](https://developer.webex.com/mcp/docs/webex-suite-mcp-server)
   says “Searches messages across the user's spaces.” Those are **different
   overview claims**. The reviewed pages do not publish a versioned search
   request/result/cursor schema or establish indexed-vs-client-side execution.
   Both require administrator enablement and OAuth; their scope tables list
   `spark:mcp` for connection and `spark:messages_read` for message search.
   The full multi-tool scope examples are not least-privilege authorization
   for this plugin. No MCP connection, provisioning or scope expansion occurred.
5. The session's separately discoverable `webex-messaging` tool catalog describes
   `webex-search-messages` as **case-insensitive client-side** text/Markdown
   filtering with **required roomId**, automatic full pagination and HTTP 429
   retries. `max` bounds **post-filter results**, not reads/pages; `after` and
   `hasFiles` explicitly have no effect. This is not MF10 server-indexed search
   and cannot satisfy the existing physical budgets/no-auto-drain policy just
   by supplying `max`. **Only catalog metadata was read; the tool was not
   invoked.** Its implementation/version/equivalence to either official hosted
   MCP server is not established, so it cannot resolve the Suite overview claim.
6. Installed public `@webex/plugin-messages@3.13.0`, `src/messages.js:315–321`,
   forwards `list(options)` as `qs:options` to resource `messages`. Permissive
   SDK argument forwarding is **not provider validation** for a new parameter.
   The bounded source inspection does not claim to cover all SDKs or internal
   services. No SDK, internal search interface, browser cookie/app database,
   compliance API, meeting device or live user-data search was exercised.

Retained evidence: `mf10-public-evidence.json` (selected public schemas,
membership/pagination/MCP guide excerpts; SHA-256
`a4a8bc5201bcdd5a173561c26a8843621c048507186b35707f7049b0737d1ecf`),
`mf10-catalog-evidence.json` (session metadata, not hosted-server proof),
`mf10-installed-evidence.json` (pinned bounded source), and
`mf10-provider-research/public-evidence.log`. No full page/auth/CSRF state or
credentials are retained; **zero service reads/writes or MCP tool invocations**.
Public documentation HTTP fetches are not live Webex service acceptance.

### What is needed before an implementation can be approved

- A supported **versioned indexed-search operation/provider** and exact request/
  result/error schemas, not an endpoint inferred from a name or overview.
  Establish cross-space coverage, supported filters, keyword/token/phrase/case
  and escaping rules, time boundaries, attachment indexing and freshness/lag.
  Unsupported filters must refuse, not be silently ignored.
- Establish user/account/session/crypto ownership, least-privilege **existing
  granted** scopes, tenant/bot restrictions, and service-enforced permitted-space
  filtering. Search hits confer no message/room/write/receipt authority.
  No new provider origin, MCP credential forwarding or internal-interface risk
  is approved by this roadmap or by access to a harness tool.
- Establish exact room/message/root identities and query/account/session-bound
  continuation semantics, ordering/revision/deduplication, partial/empty/expired/
  revoked/deleted behavior and hostile-cursor containment. Define each physical
  request/page plus cancellation, 429/refusal and native settlement behavior.
  A post-filter result cap is not a request/byte/time budget.
- Then specify finite typed RPC/DTO/hello negotiation, bounded query/result/page/
  retained-byte/age/deadline budgets and exact native navigation. Reuse existing
  query/list/transport owners where compatible; do not add a generic query/URL
  tunnel, account scan, persistent index, automatic room open/fetch or receipt.
  Preserve native `/`, draft undo, annotations/promotions, key families/opt-outs,
  exact-target and session/choice fences.
- Only **after Gate P approval**, add expected-failing backend and actual
  Vim/Neovim tests for that exact finite contract, including physical request
  counts, query-bound paging, permission/expiry/reset/429/cancel/budget races,
  no registry/history/unread/notification/receipt side effects, exact hit jumps
  and loaded-vs-index provenance. Do not invent a success RPC or leave default
  suites red for an operation whose provider is not approved.

Existing native `/`, loaded/local filters, selected-room @me queries and remote
thread reads remain unchanged and truthfully labeled. A separately approved
bounded local/history-scan alternative would need its own name/coverage and
contract; it would **not complete MF10**. The blocker is a supported indexed-search
contract/decision, **not credentials**. No live probe or grant change is requested.

## MF23 standalone space-rename contract

Gate P decision, **2026-11-15: approved for offline implementation/tests of
title-only rename for a selected standalone group space**. Not a live-write
authorization, all-space rename, settings editor, Team move or room deletion.
MF10 stays gated. `mf23-rename-baseline.json` / `mf23-rename-before/` preserve
**427** preceding sources, ten checkout bundles/maps, HEAD and empty staging.
The subsequent [runtime slice](messaging-parity-implementation.md#mf23-standalone-rename-runtime-slice)
records implementation/verification separately; this section remains the
binding reviewed contract, not live permission or full MF23 acceptance.

### Evidence and permission limits

- Official [Update a Room v1](https://developer.webex.com/messaging/docs/api/v1/rooms/update-a-room)
  is `PUT /rooms/{roomId}`, JSON with **title as its only required body field**.
  Its 200 response exposes Room ID/type/title. Optional classification/Team/
  lock/public/description/announcement/read-only fields are **not rename input**.
  A nonmember Compliance Officer is restricted to selected nontitle fields;
  no compliance/admin bypass is approved.
- Fresh Get Room Details, Get My Own Details and List Memberships v1 provide
  exact room type/lock/Team association, authenticated self and own membership/
  `isModerator`. Person-filtered memberships require roomId. Creator IDs,
  labels, cached rosters and Team roles are not current space-moderator proof.
- Official [Roles on Teams and Spaces](https://help.webex.com/en-us/article/zuwad5)
  permits unmoderated-space members to change its name; moderators control
  editing moderated-space information. External/guest users can face additional
  tenant restrictions. [Edit space settings](https://help.webex.com/en-us/article/ktsmt5)
  and [General-space rules](https://help.webex.com/en-us/article/m4hfiu) exclude
  General even for Team moderators. No stable General discriminator is validated
  in the reviewed Room schema: this slice refuses **every Team-associated room**,
  never matches a localized title. Direct rooms are excluded too.
- No atomic rename/If-Match/ETag/revision or server title maximum was established.
  A fresh title comparison detects an already-changed name but cannot close the
  GET→PUT role/title race. Consent must disclose possible last-writer behavior.
  Service/tenant policy can still refuse; observed flags are not permission.
- Selected public evidence is retained in
  `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-rename-public-evidence.json`:
  four v1 operations, three help-policy sources, SHA-256
  `42fb527d9e267220fe63726ebe241c244cccf305dc82bf145a6393396873f037`.
  Embedded state is parsed only as JSON, no full page/auth/CSRF state retained.
  `mf23-rename-research/wire.log` runs the **current PublicREST** serializer into
  a memory-only native sink: one PUT-shaped call with exact UTF-8 `{title}` and
  Content-Length, zero socket connections/service writes. Encoding compatibility
  is not future permission, tenant, title-only service or ACK acceptance.

### Finite contract and resource limits

- Extend existing `ConversationActions` / `EditorEngine`, not a second writer:
  proposed `rename(requestId,roomId,expectedTitle,title,valid)` and
  `renameSpace(requestId,roomId,expectedTitle,title)`. Reuse their shared action
  slot, **256-entry** request ledger, uncertainty owner and PublicREST.
- Finite RPC `rooms.rename {requestId,roomId,expectedTitle,title,confirmed:true}`.
  Both titles use existing `safeSpaceTitle`: exact canonical **1–80 Unicode
  characters / ≤320 UTF-8 bytes**, no trimming/control/display-normalization
  changes. These are smaller application limits, not the provider's ceiling.
  Blank, malformed, oversized or same-title intent refuses before IO. Existing
  opaque-ID/request validators remain. No caller actor/account/person/role,
  Team ID, settings map/flags, URL/path, credential, HTML or command fields.
  `expectedTitle` captures consent, not identity or permission.
- Preserve all **32 capabilities and the 32-entry ceiling**. Independent optional
  hello `spaceActions:["rename-v1"]` accepts only omission, empty list or that
  exact singleton; singleton requires `conversations-v1`, `room-members-v1` and
  `local-context-v1`. Wrong/duplicate/unknown assertions refuse. Old capabilities
  alone never enable rename. Reset this assertion with hello/transport state;
  no new registry, persistent option, protocol bump or 33rd capability.
- Admit only the exact selected ready/noncached/nonrevoked group room and
  current session/generation. Require known unexpired **people_read,
  rooms_read, memberships_read and rooms_write** Webex `spark:` grants (or
  applicable existing `spark:all`) before IO and around every call. Never infer
  granted scopes from configuration or initiate authorization/grant expansion.
- Reserve before reads. Maximum **three sequential GETs and one PUT**, with
  early refusal/conflict where applicable:
  1. GET `/v1/people/me` through existing authenticated-self proof.
  2. GET exact `/v1/rooms/{roomId}`: require same ID, `type:"group"`,
     canonical raw current title, explicit boolean `isLocked`, **absent teamId**.
     Present/null/empty/malformed Team IDs refuse, not “standalone.”
     `isReadOnly:true`/malformed known flags refuse; absent optional read-only/
     announcement flags are not role authority. Raw title differing from
     `expectedTitle` returns **conflict**, zero PUTs.
  3. Existing `RoomMembers.verify`: one
     `/v1/memberships?roomId=...&personId=<fresh self>&max=100` GET, exactly one
     correct membership, no duplicate/continuation/paging. Unlocked requires
     own membership; locked additionally requires **fresh isModerator:true**.
  4. Recheck known grants, session/selection/cancel then exactly one fixed-origin
     `PUT https://webexapis.com/v1/rooms/{roomId}` with **only `{title}`**.
     Never PUT a fetched full Room, send “unchanged” optional settings or add
     id/roomId to the body. The service enforces remaining policy/races.
- Keep **20 seconds total**, not a new budget per step. Each existing PublicREST
  call keeps **8 seconds / 8192 request bytes / 262144 response bytes / 1024
  reads**. No room/membership scan, automatic pages/retry/redirect/auth refresh,
  second mutation, SDK, meeting device or post-PUT verification GET. Logical
  abort/deadline/reset retains unsettled GET/PUT/socket/DNS admission through
  existing physical settlement. No queue or new dependency.

### Outcomes, recovery and native integration

- Ledger identity binds action/room/expectedTitle/title. Exact repeat IDs return
  retained evidence without GET/PUT; changed identities refuse; saturation
  refuses rather than evicts. Validation/preflight/permission/429/cancel failure
  before conservative PUT admission is failed/refused, with zero PUTs.
  A detected old-title mismatch is **conflict**, not proof of atomic CAS.
  Explicit typed PUT refusals stay refused (409 does not prove a title CAS).
  Post-admission ambiguity, network/deadline/session/grant loss or malformed/
  mismatched ACK is **unknown**, never automatically retried.
- Require successful bounded raw Room ACK, no errors envelope, exact room ID,
  `type:"group"` and **raw title exactly submitted**, before title publication.
  No optimistic success, title normalization or fake message creation. Extend
  the existing conversation outcome for `action:"rename"` with exact
  `roomId,expectedTitle,title`, request ID, notice and
  `changed|failed|conflict|unknown`; conflict is valid **only for rename**.
  Do not change direct/create/member meanings or emit message `delivery`.
  Retain bounded outcome evidence only (≤existing **16 KiB/result**), no provider
  object/profile data. This is not a room settings cache.
- Unknown latches `rename:<roomId>` across new titles/IDs. Reuse
  `:WebexConversationResolve`, extending `conversations.resolve` **only for
  rename** with `{action:"rename",roomId,requestId,checked:true}`; requestId is
  the exact original unknown ledger entry, not a new mutation. Verify that
  backend evidence; resolution sends nothing. Keep existing other-action shapes.
  Failed/late/old-session resolution cannot clear newer uncertainty or replay.
- A confirmed exact ACK permits a **title-only** change in the existing store/
  room metadata/cache. Preserve IDs/order, Team/room flags, history/content,
  drafts/destinations, unread/lastActivity, receipt endpoint and notifications.
  Do not call full room/message merges that fabricate activity. Fence an already
  in-flight pre-ACK room-list read from rolling back the confirmed title; later
  fresh observations may report subsequent remote changes. No permanent “ours
  wins” cache, automatic room/history fetch or new acknowledged-message exclusion.
- Native `:WebexRenameSpace [title]` reuses conversation consent/uncertainty and
  the **single effective catalogue**. Named-only initially: `Wnr` remains
  Remove Member and all Wa/Wu/Wn/Wv/Wm meanings/overrides/opt-outs remain.
  `:WebexActions`/help show standalone-only scope and negotiation prerequisites.
  Default-Cancel confirmation includes old/new title, exact ID and residual
  race. Titles remain inert strings, never Ex/shell execution. Enter/write do
  not rename/send. Recheck session/selection epoch/window/buffer/tick, selected
  ID/**title**, draft/format/root/file and ownership after prompts. Changed or
  promoted work cannot authorize a write. Preserve focus, annotations and full
  native undo; no composer recreation, adoption or fallback update.

Retain expected-red protocol/owner/engine and Vim/Neovim tests **before runtime
edits**. Required green evidence includes physical request counts/bytes,
fresh-role/Team/direct/conflict/grant guards, raw ACK/refusal matrix, shared
ledger/unknown/evidence-bound recovery, selection/reset/deadline/physical/native
and late-room-read races, unchanged messages/receipts/notifications/drafts/undo/
maps, finite old/new negotiation and both editors' drawn workflows in a fresh
**copied-project integrated gate**. This contract and expected-red tests are not
runtime/live acceptance or completion of all MF23/MP5/MF01–MF26.

## MF23 bounded space-description replacement contract

Gate P decision, **2026-11-15: approved for offline contract-first tests and
subsequent implementation of a selected standalone group's nonblank description
replacement**. Not a description-only PUT, clear/delete-description feature,
Team/direct/public-state editor, arbitrary settings tunnel or live authorization.
The accepted rename slice and MF10's separate **NO-GO** remain unchanged.
`mf23-description-baseline.json` / `mf23-description-before/` preserve **431**
preceding sources, ten checkout bundles/maps, HEAD and empty staging.

### New evidence and explicit exclusions

- Fresh official [Update a Room v1](https://developer.webex.com/messaging/docs/api/v1/rooms/update-a-room)
  still requires **`title`** on `PUT /rooms/{roomId}`. `description` is an
  optional string; both the update ACK and
  [Get Room Details v1](https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details)
  document a string `description`. Their schemas do not make that response
  property required. **Missing/null/policy-omitted is not known empty.**
- The update documentation explicitly says removal uses a single space `" "`.
  This slice **does not clear** descriptions: new empty/whitespace-only values,
  including that sentinel, refuse without IO. Public spaces require a filled
  description when made public; no public/private transition is sent here.
  No fallback PATCH, undocumented title omission or service-normalization
  assumption is approved.
- Consequently the sole mutation body is **`{title: expectedTitle, description}`**.
  No caller-selected new title, room ID in the body, optional settings writeback,
  copied full Room object or other field. This mandatory title echo can overwrite
  a concurrent rename after preflight. Default-Cancel consent must expressly
  disclose **both** description lost-update and title-overwrite risk; do not
  advertise “description-only wire,” atomic field isolation or CAS.
- Reuse the same-date self/membership schemas and three role/settings/General
  policy sources already retained for rename. Fresh self/room/own membership
  is required; a locked space additionally needs fresh `isModerator:true`.
  General settings policy supports this bounded role check, not a claim of live
  description-specific permission. Creator/title/Team-role/cached-roster labels
  are not authority. Tenant/external-user restrictions and service refusal remain
  binding; no compliance nonmember/admin bypass is admitted.
- Exclude **all Team-associated rooms**, not just a localized “General” name,
  plus direct/cached/revoked/read-only rooms. Require explicit boolean lock and
  valid known flags as for rename. Standalone public spaces may replace a
  description with nonblank text; discovery/join/public conversion is separate.
- No provider maximum, omission-as-empty, description-clear ACK normalization
  or conditional/ETag contract was established. Application bounds below are
  smaller policy, not provider limits. Oversized/unsafe/missing current content
  refuses, never silently truncates or invents an editable empty preimage.

Selected evidence under `/tmp/opencode/wbx-messaging-parity-341sx5zc/`:
`mf23-description-public-evidence.json`, SHA-256
`5265fd90443db6ee0aaaf5c3c91b4e559a1fad7bd7671b5ff2ef9fe354b1f022`,
contains two fresh Room schemas and hash-linked reuse of two self/membership
schemas plus three policy sources, not duplicated live probes. Embedded state
is parsed **as JSON only**; no full page/auth/CSRF state or credentials retained.
`mf23-description-research/wire.log` passes two existing-PublicREST memory-sink
cases: exact UTF-8/newlines/escaping/Content-Length and only `title,description`,
largest request **2052 bytes**, one native PUT per case, **zero socket connections/
service writes**. This proves serialization within existing limits, not live
title preservation, tenant policy or raw description-echo acceptance.

### Finite owners, read preparation and submission

- Extend existing conversation/engine/native owners and PublicREST. No parallel
  settings writer, sender, HTTP client, backend draft store or grant flow.
  Proposed owner methods:
  `readDescription(roomId,valid)` returning only
  `{roomId,expectedTitle,expectedDescription}`, and
  `describe(requestId,roomId,expectedTitle,expectedDescription,description,valid)`.
  Engine methods: `prepareSpaceDescription(roomId)` and
  `describeSpace(requestId,roomId,expectedTitle,expectedDescription,description)`.
- Explicit read RPC **`rooms.descriptionPrepare {roomId}`** only for the exact
  selected ready noncached room. It requires the same known unexpired
  `spark:people_read`, `spark:rooms_read`, `spark:memberships_read`,
  `spark:rooms_write` (or applicable existing `spark:all`) as submission: this
  prepares an edit, not a broader metadata browser. Maximum **three GETs**:
  authenticated self, exact Room, exact filtered own membership. No PUT, pages,
  room selection, history fetch, receipt or persistent context. Role proof is
  checked again at submit, never borrowed from preparation.
- Engine preparation returns a bounded snapshot with
  **`sessionId,roomId,expectedTitle,expectedDescription,observedAt`**. The title
  must satisfy existing `safeSpaceTitle`; the raw description property must be
  explicitly present and be a safe bounded string. Explicit `""`/whitespace
  preimages are distinguishable from absence and may be replaced; **new** values
  must contain non-whitespace. No normalization or unrequested full Room fields.
  `local-context-v1` is session-only, not authenticated identity or a durable key.
  Planned native validator `wbx#protocol#space_description(snapshot)` accepts only
  those five fields with exact session/ID/string/time bounds, never embedded
  roles, provider data or a credential/context lease.
- Finite write RPC **`rooms.describe {requestId,roomId,expectedTitle,
  expectedDescription,description,confirmed:true}`**. Expected values are exact
  consent/preimage comparisons, not identity/permission. Reject new `title`,
  actor/account/role, URL/path, raw body/map, public/lock/Team flags, attachments,
  Markdown/HTML format, credential or other fields. No-op description refuses
  without reads or ledger reservation.
- Both description strings: **≤1000 UTF-16 code units / ≤4000 UTF-8 bytes**,
  LF-only line separators; reject other C0/C1 controls (including TAB/CR/NUL),
  unpaired surrogates and the existing unsafe bidi/zero-width display controls.
  Preserve otherwise inert text, spaces, indentation, quotes, bars and LF
  exactly; do not execute Ex/shell, render Markdown, follow URLs or fetch files.
  Validate encoded request/event/result sizes too; no truncation to fit.
- Submission reserves existing physical conversation admission and the shared
  **256-request** ledger before reads. Repeat the **three fresh GETs** above.
  Exact raw room ID/group/standalone/flags and own membership/moderator proof
  are required. Changed raw title **or** description gives **conflict**, zero
  PUTs; missing/malformed description is unavailable/refused, not empty or CAS.
  Then recheck session/selection/current title/known grants/cancellation and
  send **one `{title:expectedTitle,description}` PUT**, no post-PUT GET.
- Each explicit preparation/submission has **20 seconds total**, not a timeout
  per step. PublicREST remains **8 seconds/call, 8192 request bytes, 262144
  response bytes, 1024 reads**. IPC remains **32768 request bytes**, result/
  snapshot **≤16 KiB**. No automatic pages/retry/redirect/auth refresh/queue.
  Logical deadline/reset retains unsettled native GET/PUT/socket/DNS admission.
  Preparation snapshots confer no backend lease; native limits are **eight
  active edit buffers**, **120-second** preparation age checked again after
  consent. Oversized typed work remains ordinary text/undo, not an actionable queue.
- Preserve **32 capabilities / the 32-entry ceiling** and rename's exact
  `spaceActions:["rename-v1"]` contract. Do **not** add a value to that old strict
  singleton: existing rename clients would reject it. Instead independently
  negotiate optional **`spaceDescriptions:["replace-v1"]`** (absent/empty/exact
  singleton only), requiring `conversations-v1`, `room-members-v1`,
  `local-context-v1`. New native helper `wbx#supports_description('replace-v1')`
  resets with hello/transport state. Old clients ignore the new sibling;
  rename support alone never enables description writes.

### Outcomes, cross-action uncertainty and native editing

- Add conversation `action:"describe"` with exact `requestId,roomId,expectedTitle,
  expectedDescription,description,notice` and `changed|failed|conflict|unknown`.
  Conflict remains invalid for create/direct/member outcomes. Require successful
  raw ACK with no error envelope, exact ID/group, raw **title==expectedTitle**
  and **description==submitted text** before success. Missing/mismatched/normalized
  echo after admission is unknown, never inferred from the HTTP status.
  Before admission validation/policy/permission/429/cancel/deadline is refused;
  explicit typed PUT refusal stays refused; post-admission ambiguity/session/
  grant loss is unknown. No full provider object, credentials or profile retained.
- Ledger identity binds the entire exact old/new intent; exact duplicate IDs
  return evidence without GET/PUT/publication, changed intent and saturation
  refuse with no eviction. Unknown latches `describe:<roomId>`. Because PUT
  echoes title, **rename and describe must both refuse a new action for a room
  with either rename or describe uncertainty**. No existing rename unknown may
  be bypassed via description, or vice versa; unrelated-room evidence stays separate.
- Reuse `:WebexConversationResolve` and
  `conversations.resolve {action:"describe",roomId,requestId,checked:true}` with
  exact original unknown request/room ledger evidence and physical idle state.
  Existing rename and other-action shapes remain compatible. Resolution sends
  nothing, never rewrites evidence, rolls back, retries or clears a newer/old-
  session uncertainty through a late ACK. Successful unrelated actions cannot
  clear this interlock.
- Do **not** install descriptions/provider objects into main room/history,
  attachment, unread, notification, receipt, lastActivity or spaces-disk-cache
  state. The bounded read snapshot and confirmed result belong to the dedicated
  native edit view only. A description ACK must not republish even its echoed
  title over later room metadata. Accepted rename replay/list protections remain.
- Named-only **`:WebexDescribeSpace`** explicitly reads/prepares an edit in an
  independent ordinary `nofile`, `noswapfile`, `noundofile`, `nomodeline` buffer.
  Snapshot lives in `b:wbx_space_description`; use a unique session/serial
  `wbx://space-description/...` name, not a message/recipient/normal/reply draft.
  Reuse `autoload/wbx/conversations.vim` consent/recovery and the single catalogue,
  not message mutation/delivery or a second command inventory.
- Named-only **`:WebexDescriptionSubmit`** confirms exact ID, old/new description,
  unchanged title echo and the two residual races; **default Cancel**.
  **`:WebexDescriptionCancel`** retires preparation authority but retains native
  text/full undo. Enter/write and normal Send/EditSubmit/Attach/Format commands
  cannot submit or reinterpret metadata. Submit ACKs keep the body and full
  undo; later edits/status/source loss never clear or adopt other draft work.
  Successful/conflict/canceled/stale preparation requires a fresh explicit
  preparation before another submission, without overwriting annotated work.
- Preparation responses must recheck exact source ownership/tick/draft/format/
  root/file/session/selection epoch/window before opening a new view. Submit
  rechecks original session, selected ID/title, unique buffer ownership, snapshot/
  age, full body/tick and window/selection after prompts. No stale/leave-return/
  promoted/unrelated buffer may authorize a write, no late focus stealing or
  adoption of normal/reply/recipient/file drafts. Preserve colorschemes, maps,
  opt-outs, annotations and navigation. All Wa/Wu/Wn/Wv/Wm meanings remain.

The contract-first step added **expected-failing** finite protocol/owner/engine and actual
Vim/Neovim tests, not runtime/help implementation. Required future green evidence
includes physical two-field PUT bytes/counts, permission/missing/empty/clear/
budget/ACK/refusal matrix, exact title+description conflicts, cross-action
unknown/recovery/ledger saturation, total deadline/native settlement/reset,
read/no-message/receipt/notification/cache effects, independent compatibility
and actual editor source races/undo/promotion/draft separation. A fresh copied
integrated gate is required after implementation. Live description/title-echo/
tenant/policy/clearing acceptance and full MF23/MF01–MF26 remain unclaimed.
The subsequent [description runtime slice](messaging-parity-implementation.md#mf23-description-replacement-runtime-slice)
records implementation/verification separately; this remains the binding
contract, not live policy or title-echo acceptance.

## MF23 bounded standalone lock/unlock contract

Gate P decision, **2026-11-15: approved for offline contract-first tests and
subsequent implementation of a narrowly bounded standalone-space moderation
transition**. No runtime/live release in this step. “Lock” means **moderate**,
not archive, freeze messages, encrypt, change meeting access or block everyone.
The accepted rename/description slices remain unchanged; MF10 stays **NO-GO**.
`mf23-lock-baseline.json` / `mf23-lock-before/` preserve **435** current sources,
ten checkout bundle/map hashes, HEAD and empty staging after gate 13 finalization.

### Public evidence, authority and exclusions

- Fresh official [Update a Room v1](https://developer.webex.com/messaging/docs/api/v1/rooms/update-a-room)
  admits boolean `isLocked` but still **requires `title`**. The sole approved
  body is **`{title:expectedTitle,isLocked:locked}`**, not a flag-only PATCH,
  full Room writeback, membership update or arbitrary settings map.
  Both update ACK and
  [Get Room Details v1](https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details)
  expose `id,type,title,creatorId,isLocked,isPublic,isAnnouncementOnly,teamId`.
  Response fields are not required by those schemas: missing is not false,
  private, unlocked or proof of a role.
- The update field description says **“the creator becomes a moderator.”**
  Thus **lock (`false→true`) requires fresh `Room.creatorId == authenticated
  self` AND a current own membership with explicit `isModerator:false`**.
  Creator identity is an additional restriction on the beneficiary of this
  intentional moderation change, never a substitute for membership or existing
  moderator proof. Noncreator lock is excluded rather than guessing whether
  an updater or original creator would be promoted.
- **Unlock (`true→false`) requires fresh own `isModerator:true`**, not creator,
  cached-roster/Team-role labels or `isLocked:true` alone. A creator who is not a
  current moderator cannot unlock. No moderator add/remove, self-promotion via
  Memberships, compliance bypass or last-moderator workaround is included.
  Known existing grants are `spark:people_read`, `spark:rooms_read`,
  `spark:memberships_read`, `spark:rooms_write` (or applicable existing
  `spark:all`); **no memberships-write grant or authorization expansion**.
- [Moderate a space](https://help.webex.com/en-us/article/gw1w6c) and
  [Roles on Teams and Spaces](https://help.webex.com/en-us/article/zuwad5)
  describe restriction of membership/settings management, state that **public
  spaces are not moderated**, and exclude Team guests from moderating.
  [Make someone a moderator](https://help.webex.com/en-us/article/ltsmt5)
  explicitly says being the creator does not already make someone a moderator.
  [Edit space settings](https://help.webex.com/en-us/article/ktsmt5) excludes
  General. Accordingly exclude **all Team-associated rooms** (even null/empty
  `teamId`), direct/cached/revoked/read-only targets. Require fresh, explicitly
  present **`isPublic:false` AND `isAnnouncementOnly:false`** for either
  transition. Missing/malformed flags refuse; no inferred “private” default,
  automatic privatization or clearing announcement mode to make unlock work.
- The official
  [announcement-mode API blog](https://developer.webex.com/blog/introducing-the-webex-messaging-announcement-mode-api)
  documents default moderator assignment **at creation**, announcement mode's
  lock prerequisite and Free-plan restrictions. Creation semantics are not
  proof of arbitrary existing-room updater promotion. Account/tenant/plan
  policy can still refuse. Neither scope possession nor a local role label
  proves service permission.
- Boolean false is a supported schema value and means unmoderated in the Room
  model, **not evidence of how every moderator membership is rewritten on
  unlock**. Do not assert that roles are all removed, preserved, transferred or
  restored on relock. No post-update role authority is inferred or published.
  Further moderator/Team/announcement/public/read-only operations stay gated.
- Mandatory title echo can overwrite a concurrent rename; moderation/role
  changes can race between fresh checks and PUT. No If-Match/ETag/CAS contract
  was established. Consent must disclose these races plus lock's creator
  promotion/restricted shared management and unlock's broader shared-management
  consequence. This is not an atomic title-isolated switch.

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-lock-public-evidence.json`,
SHA-256 `d6b15e5c3f2eeb1efe330839f76031dcbeb67d5fd7505bff8b7bb83aca3515c1`,
retains **two fresh Room schemas / five fresh policy sources**, with hash-linked
reuse of the same-date self/membership schemas. Embedded page state is parsed as
**JSON only**, never evaluated or retained with authentication/CSRF data.
`mf23-lock-research/wire.log` passes two existing-PublicREST **memory-sink**
cases (`true` and `false`): only `title,isLocked`, exact UTF-8/Content-Length,
maximum **349 request bytes**, **zero connections/service writes**. This is
serializer/budget evidence, not live unlock, promotion, role-preservation,
title-echo or tenant acceptance.

### Finite operation, resource limits and outcomes

- Extend existing owners with proposed
  `ConversationActions.setLocked(requestId,roomId,expectedTitle,expectedLocked,locked,valid)`
  and `EditorEngine.setSpaceLocked(requestId,roomId,expectedTitle,expectedLocked,locked)`.
  One finite RPC **`rooms.lock {requestId,roomId,expectedTitle,expectedLocked,
  locked,confirmed:true}`**, with explicit booleans that **must differ**.
  No toggle, truthy-string coercion, caller actor/creator/role, extra flags,
  arbitrary body/URL, credentials or membership mutation.
- `expectedLocked` is an **explicit transition precondition**, not permission
  or an inference from a missing loaded flag. Named Lock requests false→true;
  Unlock requests true→false. The exact fresh Room must match that precondition
  and the consent title (`safeSpaceTitle`: 1–80 canonical Unicode characters /
  320 UTF-8 bytes). Same-state/invalid inputs refuse before IO/reservation.
- Bind exact selected ready/noncached/nonrevoked room, session/generation and
  source ownership; reserve existing physical conversation admission and the
  **shared 256-request** ledger before reads. Check known unexpired grants and
  session/selection/cancel around each call. At most **three GETs**:
  authenticated self; exact standalone Room with canonical title/boolean lock/
  explicit private/nonannouncement proof; exact filtered own membership.
  Missing/unsafe room/creator/role evidence is failed/unavailable, never empty.
  Changed title or lock precondition is **conflict**, zero PUTs.
- Reuse `RoomMembers.verify` with operation-specific **explicit boolean role**
  validation without broadening its legacy behavior; exactly one correct own
  membership, no duplicates, foreign IDs, malformed flags or continuation.
  No room/roster scan or automatic paging. Lock checks fresh creator identity
  plus nonmoderator membership; unlock checks fresh moderator membership.
- Recheck known grants/current context immediately before exactly **one PUT**
  with only `{title:expectedTitle,isLocked:locked}`. Total **20 seconds**, not
  a budget per call; existing PublicREST **8 seconds/call, 8192 request bytes,
  262144 response bytes, 1024 reads**; IPC **32768 request bytes** and bounded
  result **≤16 KiB**. No post-PUT GET, membership write, retry/redirect/auth
  refresh/reconnect/queue. Logical deadline/reset must retain unsettled
  GET/PUT/socket/DNS admission until physical settlement.
- Require bounded successful raw ACK without error envelope: exact ID/group,
  raw `title==expectedTitle`, explicit raw `isLocked==locked`, absent `teamId`,
  explicit `isPublic:false`/`isAnnouncementOnly:false`, no invalid/read-only
  flags. Missing/coerced/mismatched state is **unknown after admission**, not
  confirmation inferred from HTTP 200. Before admission failures are refused;
  typed service refusals stay refused, while post-admission network/deadline/
  grant/session ambiguity stays unknown.
- Conversation outcome **`action:"lock"`** carries exact
  `requestId,roomId,expectedTitle,expectedLocked,locked,notice` and
  `changed|failed|conflict|unknown`. No full provider object or claimed actor/
  role entitlement. Conflict remains invalid for create/direct/member actions.
  Exact duplicate IDs return retained evidence without IO/publication; changed
  identities and saturation refuse, never evict or silently retry.
- Extend the existing **per-room metadata uncertainty interlock to all three
  actions: rename, describe, lock**. An unknown in any blocks new metadata
  actions and description preparation for that room, not unrelated rooms.
  Recovery reuses `:WebexConversationResolve` and
  **`conversations.resolve {action:"lock",roomId,requestId,checked:true}`**,
  with exact original unknown ledger evidence and physical idle state.
  Resolution never mutates, rewrites old evidence, auto-retries or lets a late/
  old-session ACK clear newer uncertainty. Legacy resolution shapes stay strict.
- Like descriptions, results stay **separate from main room metadata**: no
  title/lock/cache/history/activity/unread/notification/receipt or roster/role
  publication from this action, including replay. A confirmed notice reports
  only this exact transition's ACK, not ongoing permission. Existing explicit
  room reads may later show current flags; no hidden refresh/post-PUT role query
  or optimistic “we are now moderator” update.

### Native contract and required verification

- Independent optional hello **`spaceLocks:["lock-unlock-v1"]`**:
  absent/empty/exact singleton only, requiring `conversations-v1`,
  `room-members-v1`, `local-context-v1`. Proposed helper
  `wbx#supports_lock('lock-unlock-v1')` resets with hello/transport.
  Do not extend rename/description strict singletons or the **32-capability**
  ceiling; old clients ignore the sibling without enabling lock/unlock.
- Named-only **`:WebexLockSpace` / `:WebexUnlockSpace`**, no arguments or toggle.
  Reuse the existing conversation consent/recovery owner and **single command
  catalogue**. `Wnr` stays Remove Member; all Wa/Wu/Wn/Wv/Wm meanings,
  overrides and opt-outs survive. No new durable preparation/draft store.
- Require an owned selected-space history/list/composer, never promoted,
  unrelated, recipient or description-edit buffers. Default-Cancel consent
  shows exact room ID/title and explicit old→new moderation precondition;
  discloses role/shared-management consequences, mandatory title echo and
  non-atomic concurrent-title/moderation/role races. Creator proof is deferred
  to fresh backend checks, not inferred by the UI.
- Recheck session/selection epoch/window/buffer/tick, selected ID/title,
  draft/destination/format/root/file identity and ownership after consent.
  Preserve annotations, full native undo, focus, colorschemes, replies/files
  and navigation. Enter/write/Send never lock/unlock; completion changes only
  action evidence/notice, not draft text, destination or main room state.

This boundary adds expected-failing finite backend and actual Vim/Neovim tests
**before runtime/help implementation**, plus frozen-old-native compatibility
checks. Passing old regressions is not lock feature acceptance. After runtime
work, require physical wire/ACK/status/grant/creator/moderator/missing-flag/
precondition/unknown/interlock/ledger/deadline/settlement/nonpublication cases,
native source/consent/recovery/undo/maps/promotion coverage and a fresh isolated
integrated gate. Live unlock/role/policy/title-echo acceptance, general
moderator management and full MF23/MF01–MF26 remain unclaimed.
The subsequent [lock/unlock runtime slice](messaging-parity-implementation.md#mf23-lockunlock-runtime-slice)
records implementation/verification separately; this remains the binding
contract, not a live permission, unlock-role or tenant-policy acceptance.

## MF23 bounded standalone announcement-mode contract

Gate P decision, **2026-11-15: approved for offline contract-first tests and
subsequent implementation of explicit announcement-mode enable/disable on an
already moderated private standalone group**. No runtime/live release at this
boundary. Gate 14 accepts earlier delivered subsets only; MF10 stays **NO-GO**.
`mf23-announcement-baseline.json` / `mf23-announcement-before/` freeze **439**
sources after lock finalization, ten checkout bundle/map hashes, HEAD and empty
staging. This is a persistent messaging-space setting, not meeting chat,
calendar announcements, a Send operation or local alert preferences.

### Validated provider and permission boundary

- Fresh official [Update a Room v1](https://developer.webex.com/messaging/docs/api/v1/rooms/update-a-room)
  documents boolean `isAnnouncementOnly` to **set or clear** announcement mode,
  explicitly including false, and says a space can only enter it when locked.
  Public PUT still **requires `title`**. The sole approved body is
  **`{title:expectedTitle,isAnnouncementOnly:announcementOnly}`**.
  No `isLocked`, role/membership field, public/private switch, copied Room,
  description, Team move, flag-only PATCH or generic settings map.
- Fresh [Get Room Details v1](https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details)
  and update ACK expose Room `id,type,title,isLocked,isPublic,isAnnouncementOnly`.
  Their response properties are not required: absence/null is not false,
  unlocked/private or permission. This slice requires explicit raw
  **`isLocked:true`, `isPublic:false` and boolean `isAnnouncementOnly`** for
  **both** enable and disable. Disabling does not unlock or unmoderate.
- Current official [Send announcements in moderated spaces](https://help.webex.com/en-us/article/n0wbhrz)
  describes use in any moderated space, requires the actor to be a moderator,
  and says **other people in the space get notified when announcements are
  enabled**. It allows **moderators, bots and integrations** to post; others
  can still read announcements, view files and join meetings, and system
  messages can still appear. Do not advertise “only moderators can post,”
  complete silence, read isolation, encryption or meeting restrictions.
- The official [announcement-mode API blog](https://developer.webex.com/blog/introducing-the-webex-messaging-announcement-mode-api)
  separately describes clearing `isAnnouncementOnly:false` while keeping the
  space moderated. Its creation-time lock/default-moderator examples do not
  authorize an implicit lock, creator promotion or extra membership write here.
  Account/plan/tenant policy and typed service refusal remain binding.
- Reuse hash-linked same-date self/membership schemas and space-role/
  moderation/General policy. **Both directions require fresh authenticated
  self and explicit fresh own `isModerator:true`** in exactly one membership.
  Creator identity, Team roles, cached roster/display flags and configured
  scopes are not authority. Require known existing unexpired
  `spark:people_read`, `spark:rooms_read`, `spark:memberships_read`,
  `spark:rooms_write` (or applicable existing `spark:all`); no grant expansion,
  memberships-write, admin/compliance bypass or role-management fallback.
- Exclude direct, **every Team-associated room** (even null/empty `teamId`,
  avoiding guessed General identification), public/unlocked/cached/revoked/
  read-only targets and malformed known flags. No automatic lock/private
  conversion, promotion, multi-step setup, cleanup or rollback.
- Mandatory title echo can overwrite a concurrent rename; lock/mode/role can
  change between fresh proof and PUT. No If-Match/ETag/atomic CAS contract was
  established. Consent must disclose those races and the participant-visible
  posting/notification consequences. An ACK proves only that exact response,
  not ongoing ability to post or moderate, unchanged memberships or future state.

Evidence at `/tmp/opencode/wbx-messaging-parity-341sx5zc/`:
`mf23-announcement-public-evidence.json`, SHA-256
`77186b467b3f5fd60cf2bda70e84d9234f89cf633c039e9cff2265f2c4867381`,
retains **two fresh Room schemas / two fresh policy sources**, with hash-linked
reuse of three policy sources and two self/membership schemas. Embedded page
state is parsed as **JSON only**, never evaluated or retained with auth/CSRF
state. `mf23-announcement-research/wire.log` passes two current-PublicREST
**memory-sink** cases (true/false), exact UTF-8/Content-Length, only
`title,isAnnouncementOnly`, maximum **359 request bytes**, **zero connections/
service writes**. This is serialization/budget evidence, not live mode, role,
title-echo, notification or tenant acceptance.

### Finite owners, bounds, outcomes and uncertainty

- Extend existing `ConversationActions.setAnnouncementOnly(requestId,roomId,
  expectedTitle,expectedAnnouncementOnly,announcementOnly,valid)` and
  `EditorEngine.setSpaceAnnouncementOnly(requestId,roomId,expectedTitle,
  expectedAnnouncementOnly,announcementOnly)`, not a separate writer.
  Finite RPC **`rooms.announcement {requestId,roomId,expectedTitle,
  expectedAnnouncementOnly,announcementOnly,confirmed:true}`**.
  Exact booleans must differ; no toggle/string coercion, caller role/creator/
  actor/account, new title, credentials, extra flags, URLs or body tunnel.
- `expectedAnnouncementOnly` is an explicit transition precondition, **not
  inferred from a missing loaded flag**. On requests false→true, Off true→false.
  The fresh raw Room must match it and the exact canonical consent title under
  `safeSpaceTitle` (1–80 Unicode characters / 320 UTF-8 bytes). No-op/unsafe/
  malformed inputs refuse before IO or ledger reservation.
- Bind selected ready/noncached/nonrevoked room and current session/generation.
  Reserve existing physical conversation admission and **shared 256-request
  ledger** before at most **three GETs**: authenticated self, exact standalone
  Room with explicit locked/private/mode evidence, exact filtered own membership.
  Use the existing verifier's opt-in explicit-role validation; exactly one
  correct own moderator, no duplicates/foreign identity/continuation/scan.
  Missing/unsafe scope/role evidence is failed/unavailable, not false/permission.
  Changed title or mode precondition gives **conflict**, zero PUTs.
- Recheck known grants/session/selection/cancel around every call and before
  exactly **one PUT** with only the two reviewed fields. Maximum **20 seconds
  total**, not per step; unchanged PublicREST **8 seconds/call, 8192 request
  bytes, 262144 response bytes, 1024 reads**, IPC **32768 request bytes**,
  result **≤16 KiB**. No post-PUT GET, implicit lock, role write, paging,
  retry/redirect/auth replay/reconnect/queue. Logical deadline/reset retains
  unsettled native GET/PUT/socket/DNS admission until physical settlement.
- Require successful bounded raw ACK, no error envelope, exact room ID/group,
  exact raw `title==expectedTitle`, explicit `isLocked:true`, `isPublic:false`,
  `isAnnouncementOnly==announcementOnly`, absent `teamId`, no invalid/read-only
  flags. Missing/coerced/mismatched ACK after admission is **unknown**, never
  inferred from HTTP 200 or cached metadata. Pre-admission validation/policy/
  grant/cancel/deadline refusal is failed; typed PUT refusal stays failed;
  post-admission network/deadline/session/grant ambiguity stays unknown.
- Conversation **`action:"announcement"`** carries exact
  `requestId,roomId,expectedTitle,expectedAnnouncementOnly,announcementOnly,notice`
  and `changed|failed|conflict|unknown`. Conflict remains invalid for create/
  direct/member actions. Exact repeat IDs return evidence without IO or
  publication; changed identities/saturation refuse, never evict/replay.
- Extend the **per-room metadata uncertainty interlock to all four actions**:
  rename/describe/lock/announcement. Unknown in any blocks every new metadata
  action and description preparation for that room, not unrelated rooms.
  Reuse `:WebexConversationResolve` and **`conversations.resolve
  {action:"announcement",roomId,requestId,checked:true}`**, requiring exact
  original unknown ledger evidence and physical idle. Resolution sends nothing,
  never rewrites old evidence or lets old/old-session ACKs erase newer uncertainty.
  Existing resolution shapes stay strict; no automatic replay or rollback.
- Results stay separate from main room/title/lock/announcement/cache/roster/
  role/history/activity/unread/notification/receipt state, including replay.
  No message delivery, invented system message, plugin-send exclusion or alert
  suppression. Webex's documented participant notification is **not** a
  fabricated local alert or a promise of silence. Preserve same-account
  other-client notifications and existing preview/receipt protections.

### Native interface and required verification

- Independent optional hello **`spaceAnnouncements:["enable-disable-v1"]`**
  accepts omission/empty/exact singleton only, requiring `conversations-v1`,
  `room-members-v1`, `local-context-v1`. Proposed helper
  `wbx#supports_announcement('enable-disable-v1')` resets with hello/transport.
  Do not extend existing strict rename/description/lock singletons or the
  **32-capability ceiling**. Old clients ignore the sibling without enabling it.
- Named-only **`:WebexAnnouncementOn` / `:WebexAnnouncementOff`**, no arguments
  or toggle, share the existing conversation consent/recovery owner and single
  catalogue. No Wa/Wu/Wn/Wv/Wm key reassignment, no new draft/preparation store.
  Use an owned selected-space history/list/composer, never promoted/unrelated/
  recipient/description-edit work.
- Default-Cancel consent shows exact room ID/title and requested old→new mode,
  already-locked/fresh-moderator requirement, restricted posting on enable
  (**moderators/bots/integrations exceptions and participant notification**),
  broader posting on disable subject to remaining policy, mandatory title echo
  and concurrent title/lock/mode/role races. It must not silently auto-lock,
  promise role changes or claim encryption/read-access restrictions.
- Recheck ownership, session/selection epoch/window/buffer/tick, selected ID/
  title and draft/destination/format/root/file identity after prompts. Preserve
  annotations/promotions, full undo, replies/files, focus, colorschemes, maps and
  navigation. Enter/write/Send never alter announcement mode; completion changes
  only action evidence/notice, not ongoing state or draft text/destination.

This contract-first step adds expected-failing finite backend and actual
Vim/Neovim tests **before runtime/help changes**. Later green acceptance requires
physical two-field wire/ACK/status/permission/missing-flag/conflict/unknown/
ledger/interlock/recovery/deadline/settlement/nonpublication tests, native
source/consent/undo/maps/recovery coverage and a fresh isolated integrated gate.
Public/Team/direct/unlocked modes, live mode/role/notification/title-echo/tenant
acceptance and full MF23/MF01–MF26 remain unclaimed.
The subsequent [announcement-mode runtime slice](messaging-parity-implementation.md#mf23-announcement-mode-runtime-slice)
records implementation/verification separately; this remains the binding
contract, not live permission, notification or title-echo/tenant acceptance.

## MF23 bounded standalone description-clearing contract

Gate P decision, **2026-11-15: approved for offline contract-first tests and
subsequent implementation of a separate, conservative description-clear action**.
This is **not** authorization to make blank replacement Submit destructive,
relax the delivered replacement singleton or activate live clearing. Gate 15
accepts only earlier delivered inputs; MF10 stays **NO-GO**.
`mf23-description-clear-baseline.json` / `mf23-description-clear-before/`
freeze **443 sources**, ten checkout bundle/map hashes, HEAD and empty staging
after announcement finalization.

### Public evidence and an important ACK limit

- Fresh official [Update a Room v1](https://developer.webex.com/messaging/docs/api/v1/rooms/update-a-room)
  explicitly says **“To remove a `description` please use a space character
  ` ` by itself.”** The reviewed input sentinel is exactly **one ASCII
  `U+0020`, UTF-8 hex `20`**. It is not empty string, null, omission, two spaces,
  TAB/newline, NBSP, arbitrary Unicode whitespace or text normalization.
  Public PUT still **requires title**; the only approved wire body is
  **`{title:expectedTitle,description:" "}`**. The caller supplies no sentinel
  or generic body, and the existing nonblank replacement path stays strict.
- Update ACK and fresh
  [Get Room Details v1](https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details)
  document an **optional string** `description`. The docs define the removal
  **request**, but do **not** guarantee whether a real cleared ACK returns an
  empty string, omits the field, returns null or echoes the sentinel.
  Therefore this slice confirms **only explicitly present raw `description:""`**,
  with the exact identity/title/critical flags below. **Omission, null,
  `" "`, other whitespace or nonempty content after admission stays unknown.**
  Do not treat the input sentinel as response proof, trim ACKs, infer missing
  empty, or add a post-PUT GET/retry to manufacture confirmation. This is a
  conservative success predicate supported by the string schema, **not an
  established canonical service response promise**. A tenant that omits the
  cleared field may always require explicit unknown recovery.
- The update schema says public spaces **must have a filled description**.
  This destructive slice excludes public spaces rather than testing removal
  against that constraint or automatically privatizing them. Require fresh
  explicit **`isPublic:false` and `isAnnouncementOnly:false`**, boolean
  `isLocked`, absent `teamId`, no invalid/read-only known flags.
  Direct/Team/General/announcement/cached/revoked/read-only targets refuse.
  Missing/null critical flags are not a safe private/unlocked default.
- Fresh official [Roles on Teams and Spaces](https://help.webex.com/en-us/article/zuwad5)
  and [Edit space settings](https://help.webex.com/en-us/article/ktsmt5)
  plus hash-linked same-date self/membership schemas support fresh exact own
  membership. **Locked requires explicit fresh moderator proof**; unlocked
  requires current own membership with an explicit boolean role, not necessarily
  moderator. Creator/Team/cached labels and grants alone do not prove authority.
  No membership/role/public/lock/mode/classification write, compliance bypass
  or tenant-policy workaround. Require known existing unexpired
  `spark:people_read`, `spark:rooms_read`, `spark:memberships_read`,
  `spark:rooms_write` (or applicable existing `spark:all`); no grant expansion.
- Mandatory title echo may overwrite a concurrent rename, and clearing may
  lose another client's newer description even after comparing both preimages.
  Roles/lock/public/mode can also race. No atomic If-Match/ETag/CAS contract was
  established. Consent must disclose **destructive removal, exact old text,
  required title echo and both description-loss/title-overwrite races**.

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-description-clear-public-evidence.json`,
SHA-256 `bdb80122d1b84ab45a8453131f0d70021ecc40fec95a67dc1338a89a179b4e53`,
retains **two fresh Room schemas / two fresh policy sources** and hash-linked
two self/membership schemas. Page state is parsed as **JSON only**, never
evaluated or retained with auth/CSRF data. `mf23-description-clear-research/wire.log`
passes two existing-PublicREST **memory-sink** cases, only `title,description`,
exact one-byte sentinel and UTF-8/Content-Length, maximum **350 request bytes**,
**zero connections/service writes**. Its explicitly empty mock ACK is synthetic,
not canonical-service-ACK or live permission/clear/title-preservation evidence.

### Finite operation and existing-owner boundaries

- Extend the existing `ConversationActions.clearDescription(requestId,roomId,
  expectedTitle,expectedDescription,valid)` and
  `EditorEngine.clearSpaceDescription(requestId,roomId,expectedTitle,expectedDescription)`.
  Finite RPC **`rooms.descriptionClear {requestId,roomId,expectedTitle,
  expectedDescription,confirmed:true}`**. No new title, `description`, sentinel,
  clear flag, caller actor/account/role, credentials, URL or body map.
- Require exact bounded **nonblank** old description under the existing
  LF-only **1000 UTF-16 units / 4000 UTF-8 bytes** rules, no controls, normalization
  or truncation; empty/whitespace/sentinel preimages cannot authorize a no-op
  destructive clear. Missing/null/unsafe/oversize raw descriptions refuse, not
  empty. Exact canonical consent title uses existing `safeSpaceTitle`
  (1–80 Unicode characters / 320 bytes). Invalid inputs reserve nothing/read
  nothing. Exact fresh nonblank title/description mismatch is **conflict**,
  zero PUTs, not CAS.
- Reuse description preparation (`rooms.descriptionPrepare` /
  `readDescription`) and native private snapshot ownership, **not a new store,
  backend lease or durable clear draft**. Submission binds selected ready
  noncached/nonrevoked room and current session/generation, reserves physical
  conversation admission and the **shared 256-request** ledger before reads.
  At most **three GETs**: self, exact standalone Room/preimages/critical flags,
  exact filtered own membership via existing opt-in strict-role verification.
  Exactly one correct own membership; no duplicate/foreign role, paging or scan.
- Recheck grants/context/cancel around every call and immediately before the
  sole **one PUT** containing exact checked title and internally owned `" "`.
  **20 seconds total**, unchanged PublicREST **8 seconds/call, 8192 request bytes,
  262144 response bytes, 1024 reads**, IPC **32768 request bytes**, bounded result
  **≤16 KiB**. No DELETE, post-PUT GET, empty/sentinel fallback, paging/retry/
  redirect/auth refresh/reconnect/rollback/queue. Logical deadline/reset retains
  unsettled native GET/PUT/socket/DNS admission through physical settlement.
- Success requires raw exact ID/group/title, absent `teamId`, explicit empty
  description, explicit private/nonannouncement flags, explicit `isLocked`
  **equal to the fresh checked lock state**, no error envelope or invalid/
  read-only flags. Missing/coerced/mismatched admitted ACK is unknown, not
  HTTP-success inferred clearing. Pre-admission validation/grant/policy/deadline
  failure is refused; typed service refusal stays refused; post-admission
  network/deadline/session/grant ambiguity stays unknown.
- Outcome **`action:"description-clear"`** carries exact
  `requestId,roomId,expectedTitle,expectedDescription,notice` and
  `changed|failed|conflict|unknown`, **no new `description`/sentinel/title/body**.
  Do not weaken old action shapes. Exact duplicate IDs return retained evidence
  without IO/publication; changed identities/saturation refuse without eviction.
- Extend per-room uncertainty to **all five** metadata actions:
  rename/describe/lock/announcement/description-clear, including description
  preparation. Unknown in any blocks the others for that room, not unrelated
  rooms. Reuse `:WebexConversationResolve` and
  **`conversations.resolve {action:"description-clear",roomId,requestId,checked:true}`**,
  requiring exact original unknown evidence and physical idle, never replay.
  Late/old-session resolution or action ACKs cannot erase newer uncertainty or
  rewrite old evidence.
- No main room/title/description/flags/cache/roster/roles/history/activity/
  unread/notification/receipt publication, fake system message/alert, delivery ID
  or plugin-send exclusion, including replay. An explicit empty ACK is not
  durable knowledge, ongoing role authority or local draft deletion.

### Native interface and required verification

- Independent optional **`spaceDescriptionClears:["single-space-v1"]`**:
  absent/empty/exact singleton only, requiring the existing three
  `conversations-v1`, `room-members-v1`, `local-context-v1` capabilities and
  **`spaceDescriptions:["replace-v1"]`** for the reused preparation workflow.
  Proposed helper `wbx#supports_description_clear('single-space-v1')` resets
  with hello/transport. Replacement alone never enables clearing; **all four**
  delivered strict singletons and the **32-capability ceiling** stay unchanged.
  Frozen-old clients ignore the sibling without enabling clearing.
- Named-only **`:WebexDescriptionClear`**, no arguments, in the single
  contextual catalogue. No key reassignment or new draft owner. Invoke only
  from an **active privately owned, fresh, unchanged description preparation**,
  obtained through `:WebexDescribeSpace`. It is unavailable from ordinary/
  reply/recipient/history/list, promoted/unrelated or forged buffers. If native
  edit text differs from the snapshot, refuse **before consent** rather than
  discard newer work. Emptying the buffer, Enter/write and normal
  `:WebexDescriptionSubmit` **never clear**.
- Default-Cancel consent shows exact ID/title/old description and destructive
  removal, mandatory title echo, lost-description and concurrent-title/
  permission races. Recheck private snapshot/text/tick, root/format/file,
  buffer/window ownership, selection/session and **120-second** age after
  consent. Existing **eight-active-preparation** bound remains, no new capacity.
- Success/conflict/unknown retires that preparation, retaining its old native
  text/full undo; it never inserts the sentinel, blanks native text, steals
  focus or adopts a message draft. A refused attempt may retain an otherwise
  valid preparation. `:WebexDescriptionCancel` retains text/full undo and cannot
  cancel an admitted write or resolve unknown. Preserve annotations/promotions,
  reply roots/files, colorschemes, navigation and mapping overrides/opt-outs.

This boundary adds expected-failing backend and actual Vim/Neovim tests
**before runtime/help changes**. Future acceptance needs physical exact-sentinel
wire, raw empty-vs-omitted/null/sentinel ACK/status/overflow/grants/roles/preimage/
unknown/interlock/ledger/deadline/settlement/nonpublication tests, native
private-preparation/edited-text/consent/recovery/undo/maps coverage and a fresh
isolated integrated gate. Canonical service ACK representation, live clear/
title-echo/permission/tenant acceptance and full MF23/MF01–MF26 remain unclaimed.
The subsequent [clear runtime slice](messaging-parity-implementation.md#mf23-description-clearing-runtime-slice)
records implementation/verification separately; this remains the binding
contract, not canonical service ACK/live clear/tenant acceptance.

## MF23/MF24 standalone moderator-management review — provider NO-GO

Gate P decision, **2026-11-15: NO-GO for a new standalone-space promotion/
demotion runtime contract**. The user-requested next MF23 review concerns
messaging-space roles, classified under **MF24** in the finite roadmap; it does
not approve Team lifecycle/Team moderator changes, grant expansion or general
membership settings. Gate 17 accepts only its earlier delivered subsets.
`mf23-moderator-baseline.json` / `mf23-moderator-before/` preserve **447 sources**,
ten checkout bundle/map hashes, HEAD and empty staging after clear finalization.

### Fresh Memberships contract: role exists, role-only wire is not validated

- Official [Update a Membership v1](https://developer.webex.com/messaging/docs/api/v1/memberships/update-a-membership)
  is `PUT /memberships/{membershipId}`. Its fresh embedded JSON schema has
  **`required:["isModerator","isRoomHidden"]`**, not just `isModerator`.
  Both are boolean. `isModerator` expresses moderator status; `isRoomHidden`
  says **“When set to true, hides direct spaces in the teams client. Any new
  message will make the room visible again.”** A one-field `{isModerator}`
  request therefore does **not** conform to this reviewed schema. A method
  name, SDK convenience signature or example is not authority to silently omit
  a required field or label that omission validated.
- [Get Membership Details v1](https://developer.webex.com/messaging/docs/api/v1/memberships/get-membership-details),
  the update ACK and [List Memberships v1](https://developer.webex.com/messaging/docs/api/v1/memberships/list-memberships)
  expose membership ID/room/person and optional role/visibility fields.
  `isRoomHidden` is described as whether the **direct-type room** is hidden in
  Webex clients. It is not required in those responses. Nothing reviewed
  establishes omission as false, group-space ignore/no-op behavior, or whose
  personal preference would be affected by an actor updating another person's
  group membership with a copied flag.
- Do **not** invent `isRoomHidden:false`, copy a projected/defaulted optional
  flag, normalize a missing preimage, or echo an optional other-person preference
  to work around the required body field. Even an exact fresh echo could race
  another client; without validated group/actor/target semantics, consent cannot
  truthfully describe a role-isolated write. The earlier approved **Room title
  echo** contract does not authorize a new Membership visibility echo or expand
  MF22 personal preferences. Neither candidate two-field wire nor role-only
  wire is approved here. No serializer test could release that semantic gate.

### Permissions and last-moderator constraints are operation-specific

- Fresh [Make someone a moderator of a space](https://help.webex.com/en-us/article/ltsmt5)
  describes a **current space moderator** assigning/removing others as
  moderators; creator status alone is explicitly insufficient.
  [Roles on Teams and Spaces](https://help.webex.com/en-us/article/zuwad5)
  distinguishes space/Team roles, says public spaces are unmoderated and notes
  organization restrictions. `memberships-write-v1`, possession of
  `spark:memberships_write`, a loaded `[moderator]` label, creator ID, cached
  roster or Team role does not prove current service authority.
- Fresh [Quietly leave a space](https://help.webex.com/en-us/article/DOC-18360)
  and [Delete a Space](https://help.webex.com/en-us/article/zrj294) say that the
  **last moderator of a Team space cannot Leave** without unmoderating or
  promoting someone else. This is **not** a documented standalone-space
  `isModerator:false` update rule, atomic “at least one moderator” API invariant,
  or permission to unmoderate/delete/leave as a fallback. Generic 4xx tables
  do not establish an operation-specific last-moderator error contract.
- A future other-member-only slice might exclude all self promotion/demotion,
  Team/General/direct/public/unlocked/announcement/read-only/revoked/cached
  targets, require an explicitly fresh current own moderator and a distinct
  exact target membership/person with an opposite explicit role precondition.
  That would avoid intentionally changing the checked actor, **not** eliminate
  role/leave races or prove the actor remains moderator at PUT. Partial roster
  counts/labels must never establish “not last moderator,” and no automatic
  lock/unlock/promotion/removal/rollback is authorized. This is a candidate
  restriction, **not an approved operation or permission guarantee**.

### Resource review and release evidence

- Reuse existing conversation mutation/RoomMembers/PublicREST/native ownership
  if a contract is later approved. The present fresh-proof path would need
  self, Room, filtered own membership and exact target membership: **four GETs**,
  as distinct from the existing **three-GET Room-metadata** contracts.
  Do not silently spend a fourth read, drop identity/Room/target proof, scan a
  roster, auto-page, cache actor authority or add a second provider to force
  that old budget. A role-specific finite resource envelope is **not approved**
  at this boundary; older operation budgets remain unchanged.
- Any later approval must bind exact actor/target/session/selection and
  role precondition, raw exact membership/room/person/boolean ACK, typed refusal
  vs admitted ambiguity, last-moderator policy, shared request identity/
  stop-on-unknown/recovery and physical settlement across cancellation/reset.
  Existing PublicREST **8192 request bytes / 262144 response bytes / 1024 reads /
  8 seconds per call**, IPC **32768 request bytes**, shared **256-action**
  ledger / **16 KiB** result bound and finite overall deadline are not waived.
  No post-write probe/retry/auth refresh/redirect/reconnect or hidden personal/
  role/Room mutation is approved. No runtime hello assertion, command or key
  is reserved/enabled by this review.
- Gate release needs a **versioned supported role-only request contract**
  resolving required `isRoomHidden` versus omission, **or** separately reviewed
  truthful group/actor/target preservation semantics and consent boundaries;
  plus fresh operation-specific permission/last-moderator/refusal/ACK semantics
  and a reviewed finite resource budget. Credentials, live write probes,
  synthetic serialization or a user accepting an unexplained preference echo
  do not establish that missing provider contract.

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-moderator-public-evidence.json`,
SHA-256 `185cb461b2b70db0848ea6680a8d0e1999cb4e23b2bdd76e3cd9cbde19d746bc`,
retains **three fresh Memberships schemas / four fresh policy sources** plus
hash-linked Room/self evidence. Embedded state is parsed as **JSON only**,
never evaluated or retained with auth/CSRF state. **Zero authenticated service
reads/writes**, no candidate role/hidden PUT or live last-moderator experiment.

Because provider support for the bounded role-isolated operation is unresolved,
this step adds **passing NO-GO regression checks**, not expected-red tests for
an invented approved contract. Backend checks keep unnegotiated role RPC/
recovery/settings tunnels unavailable and existing actions/capabilities strict.
Actual Vim/Neovim fixtures retain readable role labels without enabling new
commands or authority, preserve native work/keys/undo and reject invented role/
hidden ACK shapes. Test names/unknown assertions are synthetic rejected inputs,
not a reserved interface. No current runtime/help behavior changes. Moderator
management remains unimplemented/provider-gated, MF10 stays NO-GO and full
MF01–MF26 parity remains incomplete.

## MF22 preferences review and own-direct visibility read contract

Gate P decision, **2026-11-15:** approve **offline contract-first tests/subsequent
implementation of an explicit read-only own-direct-membership API flag view**.
No Favorites, product Hidden, server mute or personal-preference mutation
contract is approved. This is not a moderator-gate workaround. The
`mf22-preferences-baseline.json` / `mf22-preferences-before/` boundary preserves
**450 preceding sources**, ten checkout bundle/map hashes, HEAD and empty staging.

### What the providers actually establish

| Sub-operation | Reviewed evidence | Decision |
| --- | --- | --- |
| Favorites read/write and server notification mute read/write | Six fresh selected v1 schemas, plus Memberships/Rooms catalogues (five/six operations), establish no favorite/mute field, query or operation. Product guides describe app controls, not a versioned external preference provider. Installed internal SDK helpers exist but are not approved supported contracts. | **Provider-gated / NO-GO for runtime.** Negative result is bounded to these sources, not universal API absence. No internal provider risk approval, replay/identity/event contract or grant expansion. |
| Product Hidden list/sync, group hiding, Favorites removal or notification suppression | Modern [Hide less important spaces](https://help.webex.com/en-us/article/nz44xmg) covers groups and DMs, automatically turns notifications off and removes Favorites. Public Memberships describes a direct-room flag with new-message reappearance. Equivalence between these product behaviors and that API flag is **not established**. | **Not approved.** Do not advertise a complete Hidden view, import hidden groups, suppress local alerts or remove Favorites based on the API flag. |
| Hide/unhide via Memberships PUT | Fresh [Update a Membership v1](https://developer.webex.com/messaging/docs/api/v1/memberships/update-a-membership) requires **both `isModerator` and `isRoomHidden`**. Omitting the former violates the reviewed schema; fabricating/echoing it is an unreviewed role write, including on direct memberships. | **NO-GO.** The reciprocal of the moderator blocker, not permission to echo a role. No default false, inferred actor role, visibility-only PUT, role/hidden combined write or metadata workaround. |
| Read your own exact direct-membership `isRoomHidden` field | Fresh [List Memberships v1](https://developer.webex.com/messaging/docs/api/v1/memberships/list-memberships) and [Get Membership Details v1](https://developer.webex.com/messaging/docs/api/v1/memberships/get-membership-details) expose an optional boolean: whether the **direct-type room** is hidden in Webex clients. Filtered list accepts exact `roomId,personId,max`. Fresh [Get My Own Details](https://developer.webex.com/messaging/docs/api/v1/people/get-my-own-details) and [Get Room Details](https://developer.webex.com/messaging/docs/api/v1/rooms/get-room-details) supply self and direct-room identity. | **Approved bounded read candidate below**, not a write, list of Hidden spaces, modern product-state equivalence, ongoing visibility guarantee or full MF22 acceptance. |

The API update text says new messages make a hidden direct room visible again.
The current app Hide guide describes notification/Favorites effects the API
read schema does not define. Neither a raw true nor false flag supplies mute,
Favorites, unread, membership-permission or receipt evidence. Missing optional
flag means **Not provided**, not false. API `roomType` is not mandatory; it may
be omitted only because the separately fetched exact Room proves `type:"direct"`.
If present it must agree. Other people's optional visibility must not be projected.

Fresh product sources also include [Favorites](https://help.webex.com/en-us/article/8hf3oc),
[specific-space notifications](https://help.webex.com/en-us/article/nizi9w8) and
[Space sections](https://help.webex.com/en-us/article/uaayuo). App preference
controls are real; absence of a reviewed external API is not a claim they are
local-only. Sections synchronization remains a separate MF21 NO-GO.

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf22-preferences-public-evidence.json`,
SHA-256 `9f9b2aad89013fbf21f2e62c0721202ee6a4b04d19fde4738a5669a8da86579e`,
retains **six fresh selected schemas / four fresh product sources**, three
resource catalogues and one hash-checked installed-source excerpt. Embedded
state was parsed as **JSON only**; no page auth/CSRF state was retained.
The installed SDK's generated favorite/hide/mute methods were **read, never
loaded/invoked**. Their presence does not authorize private activities or release
reaction/Sections/moderator gates. **Zero authenticated service reads/writes.**

### Existing owners and finite read-only interface

- `LocalSections` / `SectionPreferences`, `EditorEngine.editSections` /
  `sectionPreferences` and `autoload/wbx/sections.vim` own **local grouping**,
  including existing bounded disk preferences. A section named Favorites
  remains a local label, not a service Favorites ID or permission to synchronize.
  Do not change its identity/store, persist visibility, auto-import preferences
  or treat local/session context as authenticated account identity.
- `autoload/wbx/notifications.vim` owns **local plugin alert mute** (1–1440
  minutes), queue cancellation and no replay on Resume. It is not per-space
  server mute, account DND, Hidden or meeting mute. Leave notification options,
  preview privacy, exact-send exclusions and same-account other-client alerts
  unchanged. A visibility read changes none of those settings.
- Extend **existing `RoomMembers`** with stateless
  `readOwnDirectVisibility(rest,roomId,token,signal)`, returning exactly
  `{roomId,isRoomHidden:boolean|null}`. Do not change `RoomMember`/roster
  projection, add a parallel personal-preference store, or make raw role/hidden
  fields writable via current invite/remove/leave.
- Extend **`EditorEngine.memberVisibility(roomId)`** through the existing
  selected `feature`/`featureOwner`, known-grant and fixed-origin PublicREST
  owners. Request **`members.visibility {roomId}`** accepts exactly one
  selected ready direct room ID—no caller person/membership/profile/token,
  hidden/favorite/mute/action/body/URL, paging/revision or confirmation fields.
  Unselected/group/cached/revoked/unready/session-invalid requests refuse.
- Require known unexpired existing `spark:people_read`, `spark:rooms_read`,
  `spark:memberships_read` or applicable existing `spark:all`; **no write grant**,
  device lease, SDK invocation, grant acquisition/refresh or account probe.
  Recheck context/grants/cancel before and after every call. Self is obtained
  afresh through existing `authenticatedSelf`; loaded labels, a roster or
  `localContext` never supply authenticated identity.
- Exactly **three GETs maximum**: `/v1/people/me`, exact
  `/v1/rooms/{roomId}`, then
  `/v1/memberships?roomId={roomId}&personId={freshSelf}&max=100`.
  Validate raw exact direct Room ID/type, absent `teamId`, no error envelope;
  missing/non-direct/mismatched proof refuses before membership lookup.
  Exactly one own row with valid membership/room/person identity; duplicate,
  empty, foreign, malformed/error or any linked/paged response refuses. No
  roster scan, fallback detail GET, account-wide query or automatic drain.
- `isRoomHidden` must be an explicitly present boolean to be reported as
  true/false. Missing is projected as **null / Not provided**; raw null,
  strings/numbers/objects are malformed and refuse. An optional `roomType`
  must match direct if present. Roles, email, names, provider URLs and other
  preferences are ignored/discarded, not permission or output.
- Result is exactly
  **`{sessionId,roomId,coverage:"own-direct-membership-flag",observedAt,isRoomHidden}`**,
  **≤4096 UTF-8 bytes**. `sessionId` is the existing ephemeral session fence,
  not authenticated/persistent account identity; self proof stays Node-private.
  No person/membership ID, actor, role, favorite/mute, credentials or raw envelope.
  `observedAt` describes this response, not ongoing synchronization. The demo
  retains absent-field→null behavior, without inventing false.
- Existing **20-second feature / 8-second physical-call** bounds, single
  shared physical PublicREST admission, **8192 request bytes / 262144 response
  bytes / 1024 reads**, **32768 IPC request bytes** and existing bounded reply
  cache remain unchanged. Reject physical busy before dispatch; cancellation/
  timeout/reset cannot dispatch a replacement request while the old native
  socket/DNS is unsettled. **Zero mutations, retries, redirects, auth refresh,
  receipts, polling, subscriptions or verification reads.** Repeated explicit
  reads must revalidate, not return a retained flag as current policy.
- Reads never publish main Room/list/title/flags/roster/history/activity/unread/
  notification/receipt/delivery state, update cache/grouping, hide/select/leave
  a space or register metadata uncertainty/recovery. Failure is unavailable,
  not false, nonmembership, deletion or confirmed preference change.

### Native integration, negotiation and acceptance boundary

- Independent optional **`membershipVisibility:["own-direct-v1"]`**, omitted/
  empty/exact singleton only, requiring existing `conversations-v1`,
  `room-members-v1` and `local-context-v1`. Malformed/unknown/duplicate values
  refuse; hello/transport loss resets support. Proposed helper
  `wbx#supports_member_visibility('own-direct-v1')`. Roster/write grants alone
  never imply support. Preserve all **five older metadata singletons**, protocol
  version and **32-capability ceiling**. Frozen clients ignore this additive
  sibling without enabling the read.
- Named-only **`:WebexDirectVisibility`** /
  **`:WebexDirectVisibilityRefresh`**, no arguments, in the single contextual
  catalogue, **not `WebexHideSpace`**. Reuse `autoload/wbx/members.vim`,
  `wbx#members#visibility()` / `visibility_refresh()` and owned on-demand
  `lists.vim` kind **`direct-visibility`**, with
  `b:wbx_member_visibility_snapshot`. No new native draft/provider owner.
- Explicit open from owned selected direct history/space-list/composer; reject
  unrelated/promoted/recipient/description-edit contexts. Refresh binds the
  same clean direct view/session/room. Reuse view-intent buffer/window/tick/
  selection/epoch fences; repeated getters/render/status do no IO. Late,
  away-and-return, wrong-target/session, annotated or promoted callbacks cannot
  overwrite work, steal focus, refill a newer view or leave a dropped callback
  permanently blocking a new explicit request.
- Show **“own direct-membership API flag”**, exact room ID, observation time
  and true / false / **Not provided**. Disclose **not Favorites, not server mute,
  not a full product Hidden list or ongoing state**; no inferred behavior for
  other clients. Two-minute native observation freshness, no future-dated
  extension (at most current-second clock rounding). A same-session expired
  clean view may only get an explicit fresh reread; old-session Refresh refuses.
- Only buffer-local `r` refresh and `q` return, respecting shadows/opt-outs;
  **no Enter action or `]p`**, no new global binding. Enter/write never send,
  hide, mute or change preferences. Preserve native text/full undo, annotations/
  promoted buffers, replies/files/draft destinations, focus, colorschemes,
  navigation, Wa/Wu/Wn/Wv/Wm and Wnr as Remove Member.

This boundary adds **expected-red backend and actual Vim/Neovim tests before
runtime/help changes**. Early missing method/command failures specify intent,
not evidence that later assertions executed. Later runtime acceptance needs
actual fixed-origin physical wire/status/overflow/grants/session/cancellation/
settlement coverage, strict DTO/old-client/native races and a fresh isolated
integrated gate. At this contract-first boundary **MF22 runtime was unimplemented**.
The subsequent [runtime slice](messaging-parity-implementation.md#mf22-own-direct-visibility-runtime-slice)
records implementation/verification separately, not product Hidden/Favorites/
server-mute or live preference acceptance. All preference writes remain gated;
moderator and MF10 NO-GOs remain binding, and full parity is false.

## MF24 bounded Team-rename contract-first review

**2026-11-15 — Gate P: approved for offline contract-first tests only.**
Name-only Team rename is a separate MF24 operation, not a Room rename,
moderator writer, Team lifecycle/membership implementation or full-parity
acceptance. Runtime/help remain unchanged at this boundary.
`mf24-team-rename-baseline.json` / `mf24-team-rename-before/` preserve the
accepted **454-source** gate-18 state, ten checkout bundles/maps, HEAD and empty
staging. Old finalizers/gates do not accept these later tests.

### Fresh provider evidence

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf24-team-rename-public-evidence.json`,
SHA-256 `6e9fb1365db1d2e57a37ac4576ee68317f4848ef958d63727ee760d7e11d24ed`,
retains **six fresh selected v1 schemas / three official policy sources**,
Teams/Team Memberships/People catalogues (five/five/six operations) and five
relevant scope descriptions. Embedded state was parsed as **JSON only**, never
evaluated; full-page auth/CSRF state was not retained. **Zero authenticated
service reads/writes**, no SDK invocation.

| Source | Established finding | Boundary |
| --- | --- | --- |
| [Update a Team v1](https://developer.webex.com/messaging/docs/api/v1/teams/update-a-team) | `PUT /teams/{teamId}` requires **`name` only**; `description` is optional. Response exposes optional `id,name,description,created`. | Sole approved body **`{name}`**, no description/default/role/preference echo. Only explicit exact raw ID/name confirms. No conditional-write/ETag or atomic name/role precondition is documented here. |
| [Get Team Details v1](https://developer.webex.com/messaging/docs/api/v1/teams/get-team-details) | Exact `/teams/{teamId}` exposes raw `id,name`. | The optional description query is unused. Fresh raw name is the preimage, not a sanitized/clipped/cache label. Other fields are not echoed or published. |
| [List Teams v1](https://developer.webex.com/messaging/docs/api/v1/teams/list-teams) | Lists Teams to which authenticated user belongs; `max`, optional Link. | Existing joined query supplies exact session/revision-bound selection only, **not moderator authority**. Partial lists can select returned IDs but never prove absence. |
| [List Team Memberships v1](https://developer.webex.com/messaging/docs/api/v1/team-memberships/list-team-memberships) | Path **`/team/memberships`**, required **`teamId`**, optional **`max`**. Rows expose `id,teamId,personId,isModerator`; optional Link. | **No `personId` or email filter.** Do not invent `/team-memberships`, filtered own lookup or derive opaque IDs. This slice allows **one complete page ≤100 rows**; any Link/overflow/ambiguity refuses, even with self on page one. |
| [Get Team Membership Details v1](https://developer.webex.com/messaging/docs/api/v1/team-memberships/get-team-membership-details) | Exact `/team/memberships/{membershipId}` exposes identity/role. | No current fresh trusted membership ID exists in labels. This path is **not admitted**; no cached/derived-ID or fallback GET. |
| [Get My Own Details v1](https://developer.webex.com/messaging/docs/api/v1/people/get-my-own-details) | `/people/me` exposes authenticated self ID. | Existing `authenticatedSelf`, never caller override, display label, cached roster or `localContext`. |
| [Update a team name](https://help.webex.com/en-us/article/2xi5rv), [roles](https://help.webex.com/en-us/article/zuwad5), [team moderators](https://help.webex.com/en-us/article/xuwad5), dated 2026-03-07 | Users can rename Teams they **moderate**; current Team moderators can change Team information. Team/space moderators are distinct. | Creator/initial role is not fresh authority. No Room-moderator shortcut, self-promotion/join, org-admin or compliance grant inference. |

Name-only PUT conforms to the schema, unlike the mandatory paired-role/
visibility Memberships PUT. It does **not** establish live optional-description
preservation or tenant behavior. No description is requested, mirrored,
restored or claimed synchronized. Fresh preflight is **not compare-and-set**:
concurrent rename can be overwritten and roles/permissions can race. Disclose
these limits before submission. No live probe, automatic repair/rollback,
second write, post-PUT read or claimed race elimination.

### Existing owners and exact wire proof

- Extend **`ServerTeams`' module** with stateless fresh raw Team/own-role proof;
  reuse its current joined-slot selection admission. No role cache, second Team
  registry/provider or new draft/preference store. Loaded-room labels and
  joined display labels/membership presence remain navigation data only.
- Extend **`ConversationActions.prepareTeamRename(teamId,valid)`** and
  **`renameTeam(requestId,teamId,expectedName,name,valid)`**, with existing
  authenticated-self/grant/read/perform/physical owners and the **same
  256-request ledger**. No second sender, generic HTTP/action tunnel or changes
  to existing Room policies. Preparation returns `{teamId,expectedName}` only;
  no role, raw roster, prep token or backend preparation registry.
- **Both phases** require fresh known unexpired existing `spark:people_read`,
  `spark:teams_read`, `spark:team_memberships_read`, `spark:teams_write` or
  applicable existing `spark:all`, checked before IO and at every step.
  Configured scopes are not grants. No grant/config expansion, auth acquisition/
  refresh, meeting credential/device or SDK access is authorized.
- Each phase uses **≤3 fresh GETs**, in order: `/v1/people/me`, exact
  `/v1/teams/{teamId}`, then exactly
  **`/v1/team/memberships?teamId={teamId}&max=100`**. Recheck grant/session/
  context/cancel before and after each. Team proof requires exact raw ID/name,
  no error envelope/Link. Submission name mismatch is **conflict**, zero PUT;
  it may stop before membership lookup. Unsafe/missing name refuses, never
  sanitizes into consent.
- Membership response: no error envelope or Link, at most **100 rows**.
  Every row has valid membership/person IDs and exact Team ID. Malformed/error/
  foreign rows, duplicate membership or person IDs refuse. Exactly one fresh
  self row must have explicit **`isModerator:true`**; false/missing/null/coerced
  values refuse. Other roles/profile/visibility fields are not authority or
  native output. Missing self is unavailable, not deletion/nonmembership proof.
  No auto-drain, fallback detail, cached role or invented own filter.
  Submission always re-proves role; preparation cannot lend authority.
- After proof and exact raw preimage comparison, issue **one PUT**
  `/v1/teams/{teamId}` with **`{name}` only**. No description, Room title,
  actor/role, preference, Team-membership or extra fields. Canonical old/new
  names reuse local title validation: 1–80 Unicode code points / 320 UTF-8
  bytes, exact safe nonblank text, no trim/normalization/control/unsafe-Unicode
  coercion/truncation. No-op/invalid names/IDs/request IDs refuse before
  ledger/read admission.
- Only raw ACK **`id===teamId,name===requestedName`**, without errors/Link,
  confirms. Missing/coerced/sanitized/mismatched fields remain unknown. No
  verification GET. Extra response fields are discarded, not a description/
  role/preservation/synchronization claim.
- Narrow transport contract: admit **only literal `/v1/team/memberships`**,
  exactly one valid `teamId` and `max=100`. Enforce **GET/no body before physical
  admission**. Reject missing/extra/duplicate keys, cursors, ID subpaths and all
  non-GET methods on this newly admitted path. No general `team/*` expansion.
  Existing `/v1/teams/{id}` already admits the name PUT. **No runtime allowlist
  change is made here**; the positive admission test is intentionally red.

### Resources, outcome and replay

This is an **explicit Team-specific envelope**, not a silent increase to any
existing Room-metadata/roster/joined-list/physical ceiling:

| Boundary | Limit |
| --- | --- |
| Preparation | ≤3 GETs, **zero mutations**, existing **20-second** total deadline |
| Submission | ≤3 GETs + **one PUT**, existing **20-second** total deadline |
| Whole successful interactive flow | ≤6 GETs + **one PUT**; user consent time does not extend authority/freshness |
| Role proof | **One complete page / ≤100 rows per phase**, private transient processing, no exported/retained Team roster |
| Concurrency | Existing shared **one** PublicREST call plus conversation/feature/action admission; no queue/retry/redirect/auth replay |
| Transport | Existing **8 seconds/call**, **8192 request bytes / 262144 response bytes / 1024 reads**, fixed origin/DNS/socket ownership |
| Editor | Existing **32768-byte request / 16384-byte conversation result**; preparation **≤4096 bytes**, one pending native preparation, **120-second** native age |
| Mutation retention | Existing **256 shared action requests**, fail-closed saturation, retained exact outcomes; no eviction/new Team ledger |
| Privacy | Preparation: session/Team/revision/time/raw name only. Outcome: request/action/status/notice/Team/old/new names only. No actor/member ID, role/roster/email/token/description/persistent preference. |

Outcome is exactly
`{requestId,action:"team-rename",status,notice,teamId,expectedName,name}`,
`changed|failed|conflict|unknown`, never a Room/message/delivery result.
Pre-dispatch refusal/cancel/timeout and definitive service refusal are failed.
Ambiguous post-dispatch failure/malformed ACK/timeout/context or grant loss is
**unknown**, not rollback. Physical admission survives logical timeout/reset
until native socket/DNS settlement; late ACK cannot promote retained unknown.

Use **`team-rename:{teamId}`** in the existing ledger, distinct from Room
`rename:{roomId}` even for equal opaque strings. Unknown blocks same-Team new
IDs; exact replay returns retained evidence with **no IO**; same ID/different
intent refuses. Extend existing `conversations.resolve` only with
**`{action:"team-rename",teamId,requestId,checked:true}`**, no Room/actor/role/
name/body/URL override. Require matching original unknown Team/request/session,
explicit manual Webex check and no active logical/physical work. Old evidence
cannot clear newer uncertainty. Resolve does no IO, retains old unknown and
never resubmits; further attempts require new consent/fresh proof. Session-only
uncertainty is not a restart journal; no reconnect/restart eligibility/replay.

Confirmed **non-replayed** rename may invalidate existing Team labels/joined
selection only, never publish a cached name as fresh permission or renew an
old query timestamp. A new explicit joined read supplies a fresh revision.
Preserve native row text/full undo; invalidate selection rather than rewriting.
Unknown/conflict/refusal/replay/late ACK cannot replace newer rows/uncertainty.
No main Room/title/space association, filter/sections identity, roles/roster,
messages/history/activity/unread/notification/receipt/delivery publication,
plugin-send exclusion or meeting-owner change. Existing five-way standalone
Room uncertainty remains independent.

### Finite engine/protocol and native source fences

- **`EditorEngine.prepareTeamRename(teamId,revision)`** and
  **`renameTeam(requestId,teamId,revision,expectedName,name)`** use current
  `ServerTeams` joined-slot ID/session/revision/freshness admission and shared
  conversation ownership. No selected Room is needed/inferred. Missing/foreign/
  stale/old-session/replaced joined revision refuses **before protected reads**.
  Joined rows fence selection, never role. Changed query/session pre-dispatch
  invalidates; post-dispatch loss remains conservative unknown.
- **`teams.renamePrepare {teamId,revision}`** returns exactly
  `{sessionId,teamId,revision,observedAt,expectedName}`. Time/query revision are
  local observations, not provider revision or role authority. Session-only
  context is not durable/authenticated account identity; self stays Node-private.
- **`teams.rename {requestId,teamId,revision,expectedName,name,confirmed:true}`**
  accepts no extra member/person/role/description/preference/Room/body/URL/paging.
  Independent optional **`teamActions:["rename-v1"]`**, omitted/empty/exact
  singleton only, requires existing **`conversations-v1`, `joined-teams-v1`,
  `local-context-v1`**. Malformed/unknown/duplicate values refuse; hello/transport
  reset revokes support. Proposed `wbx#supports_team('rename-v1')`. Preserve
  five older metadata singletons, own-direct visibility assertion, protocol
  version and **32-capability ceiling**. Frozen clients ignore this sibling
  without enabling Team writes.
- Named-only **`:WebexRenameTeam [name]`** in the single contextual catalogue
  reuses **`autoload/wbx/conversations.vim`** via
  `wbx#conversations#team_rename(name)` / `team_rename_reason()`, from an
  **unchanged fresh selected `WebexJoinedTeams` row only**. Loaded-association
  `WebexTeams`, Team-space composer/history, headings, unrelated files and
  stale/annotated/promoted lists cannot authorize. No global binding/permanent
  pane/Enter mutation; **Wnr stays Remove Member**.
- Explicit command preparation reads a private bounded Team membership page
  for permission proof, never displays/exports it. Then prompt for a new name
  if absent and confirm exact Team ID, fresh raw old name, exact new name,
  fresh moderator recheck and non-atomic name/role/optional-field limitations.
  Cancel/Enter/write alone never submit; draft contents are not rename input.
- Capture session/query revision/exact row ID, buffer/window/tick/name/type,
  selection/epoch before preparation, before/after prompt and confirmation.
  **View-intent alone does not bind cursor-row identity**; recheck selected
  Team explicitly. Reject stale/future (>current-second rounding) timestamps,
  old-session/away-return/revision/row changes, annotations/promotions and late
  callbacks. Dropped prep cannot wedge a new explicit session/read; old
  callbacks cannot submit for a newer one.
- Strict `wbx#protocol#team_rename_preparation` and existing conversation
  validator reject missing/extra/mismatched/unsafe/no-op fields or Room/role/
  preference masquerade. Malformed/mismatched write responses retain
  uncertainty, not merely clear busy. Reuse `:WebexConversationResolve` with
  original Team/request/manual check; no new recovery manager.
- Preserve joined-list **Enter=exact loaded-space filter, r/`]p`=explicit
  reads, q=return**, and mapping shadows/opt-outs. No label-based filter rename
  or auto-room join/select/fetch. Keep native text/full undo, annotations/
  promotions, reply/file/draft destinations, focus, colorschemes, navigation,
  Wa/Wu/Wn/Wv/Wm meanings. Rendering/status/help/catalogue/scrolling do no IO.
  Enter/write never send or change settings.

### Contract-first acceptance boundary

Backend and actual Vim/Neovim tests specify this contract **before runtime/help
changes**. Missing method/command/transport admission is expected-red, not proof
later assertions ran. Runtime acceptance needs real engine/PublicREST wire/
status/overflow/ACK/refusal/replay/grant/session/query/deadline/reset/settlement
checks, native callback/prompt/outcome/recovery/old-client coverage and a fresh
isolated integrated gate. Public docs/fixtures are not live permission,
optional-description preservation, tenant or conditional-update acceptance.

Team creation/deletion/descriptions/membership/moderator changes, standalone
moderator and MF22 preference writes remain **unapproved/provider-gated**.
MF10/reaction/Sections/storage/account gates are unchanged. No runtime allowlist/
grant/config change, OAuth/device probe, activation, commit/push or Atlassian
work. At that contract-first boundary **Team rename runtime/acceptance were
false**. The [runtime follow-on](messaging-parity-implementation.md#mf24-team-rename-runtime-slice)
records later implementation/verification, never live optional-description/
tenant acceptance or another Team/role/preference operation. Full MF01–MF26
completion remains **false**.

## MF24 bounded Team-description replacement contract-first review

**2026-11-15 — Gate P: approved for offline contract-first tests only.**
This is changed **nonblank description replacement**, not clear, rename,
Team membership/role, Room metadata or general Team-settings parity.
Runtime, delivered help, accepted cases, credentials/scopes and transport
admission remained unchanged at this contract-first boundary. Later runtime
verification is recorded in the [runtime slice](messaging-parity-implementation.md#mf24-team-description-runtime-slice).
`mf24-team-description-baseline.json` /
`mf24-team-description-before/` preserve the accepted gate-20 **458-source**
state, ten checkout bundles/maps, HEAD and empty staging.

### Evidence and required name echo

`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf24-team-description-public-evidence.json`,
SHA-256 **`7f24000eb71771ae584572af940e3b881fc14f4ec900e65871efce66462ee212`**,
retains **two fresh selected Teams v1 schemas / one fresh policy excerpt**.
The schemas match the reviewed rename schemas exactly. Four same-day
self/joined/Team-membership schemas, three policies and scopes are explicitly
reused, hash-linked to `mf24-team-rename-public-evidence.json`
(`6e9fb1365db1d2e57a37ac4576ee68317f4848ef958d63727ee760d7e11d24ed`);
they are **not counted as new fetches**. JSON-only embedded-state parsing,
no script evaluation/full-page auth/CSRF retention, SDK invocation or
authenticated service reads/writes.

| Source | Established finding | Consequence |
| --- | --- | --- |
| Fresh [Update a Team v1](https://developer.webex.com/messaging/docs/api/v1/teams/update-a-team) | `PUT /teams/{teamId}` requires **`name`** and optionally accepts string **`description`**. | Description-only `{description}` violates the reviewed required-field shape. Approve **only `{name:expectedName,description}`** for this operation, not another name or field echo. |
| Fresh [Get Team Details v1](https://developer.webex.com/messaging/docs/api/v1/teams/get-team-details) | Exact `/teams/{teamId}` response exposes string `id,name,description`; none is schema-required. Update response has the same fields. | Require explicit exact raw ID/name and string description for preimage/ACK. **Missing/null is not empty**. No fabricated default, normalization or fallback query. |
| Fresh [Manage Your Teams and Projects](https://help.webex.com/en-us/article/hw96tfb), dated 2026-03-11; reused [Team moderators](https://help.webex.com/en-us/article/xuwad5) / [roles](https://help.webex.com/en-us/article/zuwad5) | Current Team moderators can update Team details/information; Team/space roles differ. | Fresh Team-role proof, not creator, cached/Room role, joined label, org-admin or compliance inference. This is wire-level description support, not a claim every Webex UI exposes the same editor. |
| Reused [List Team Memberships v1](https://developer.webex.com/messaging/docs/api/v1/team-memberships/list-team-memberships) / [Get My Own Details](https://developer.webex.com/messaging/docs/api/v1/people/get-my-own-details) / [List Teams](https://developer.webex.com/messaging/docs/api/v1/teams/list-teams) | Exact self and session/revision-bound joined selection; `/team/memberships` has `teamId,max`, **no personId filter**. | Same complete one-page ≤100-row explicit own-moderator proof as rename. No new path, role provider/cache, membership-ID derivation or roster scan. |

The mandatory **name echo is approved only for this Team-description
operation**. It does not generalize Room title-echo approval or authorize a
Memberships `isModerator`/`isRoomHidden` echo. Before PUT, compare both fresh
raw name and raw description with the exact prepared preimage; any mismatch
is **conflict**, zero write. However, GET→PUT is **not atomic**: a concurrent
description can be lost **and the required name echo may overwrite a concurrent
rename**; moderator/tenant permission can race. Native consent must explicitly
disclose both overwrite risks, exact Team ID/name and old/new description.
No conditional-write/ETag, atomic role/name/description precondition, live
canonical ACK/tenant guarantee, rollback, automatic repair or verification GET
is established or authorized.

### Existing backend owners and finite proof

- Extend existing **`ServerTeams` stateless proof** with an opt-in description
  preimage mode, preserving rename's default/raw-name/role behavior. No duplicate
  Team GET, role lookup, owner/store or new public transport admission.
  Current joined rows supply selection only, never permission or raw preimages.
- Extend existing **`ConversationActions.readTeamDescription(teamId,valid)`**
  → `{teamId,expectedName,expectedDescription}`, and
  **`describeTeam(requestId,teamId,expectedName,expectedDescription,description,valid)`**.
  Reuse authenticated self, known-grant checks, logical read/perform and the
  same physical/256-request mutation/uncertainty ledger. No parallel sender,
  role cache, backend preparation registry, credential/account or preference store.
- Both phases require known unexpired existing **`spark:people_read`,
  `spark:teams_read`, `spark:team_memberships_read`, `spark:teams_write`** or
  applicable existing `spark:all`. Configured scopes are not grants. Recheck
  session/context/permission/cancel before and after each physical call; no
  acquisition/refresh/config expansion, SDK/device/meeting credential.
- Per phase: **≤3 GETs** in order, `/v1/people/me`, exact
  `/v1/teams/{teamId}`, then exactly
  `/v1/team/memberships?teamId={teamId}&max=100`.
  Team ID/name must be explicit exact raw safe values, no errors/Link. Description
  must be an explicitly present safe string. Missing/undefined/null/coerced/
  malformed values refuse, never “empty” or a hidden read of another endpoint.
  The odd documented optional GET `description` query is unused; no
  `description=true`/empty query workaround is invented.
- Existing complete-page proof remains: no error envelope/Link, ≤100 rows;
  each valid member/person ID belongs to exact Team, no duplicate member or
  person IDs, exactly one fresh self row with explicit `isModerator:true`.
  False/missing/null/coerced role, missing self, foreign/error/duplicate/overflow/
  linked pages refuse without drain/fallback. Other roles/profile/preferences
  remain private transient data. Submission repeats proof; preparation is
  **not a reusable grant**. A preimage conflict may stop before the role GET.
- Approved replacement is **changed nonblank LF-only** text using the existing
  stricter local description bound **1000 UTF-16 units / 4000 UTF-8 bytes**,
  no CR/tab/control/unsafe-format/surrogate coercion, truncation or normalization.
  These are **local safety limits**, not a claim of Webex's maximum.
  Explicit old `""` is a valid replacement preimage, but missing/null is not.
  Old raw text must itself fit the bound to avoid lossy/unbounded consent.
  Blank/whitespace/no-op Submit refuses; **no clear, sentinel, delete or
  implicit blank write**. The Room single-ASCII-space clearing contract does
  not apply to Teams.
- After exact preimage and current moderator proof: **one PUT**, body exactly
  **`{name:expectedName,description}`**. No new name, actor/member/role,
  preference, Room title, caller URL/body, additional field or hidden fan-out.
  Invalid IDs/request IDs/names/preimages/replacements refuse before ledger/
  read admission.
- Only raw ACK with explicit exact **Team ID, unchanged echoed name and exact
  requested description**, no errors/Link, confirms. Omitted/null/coerced/
  normalized/trimmed/sentinel/mismatched/error fields remain **unknown**, not
  confirmation via name alone, expected text or a follow-up GET. Extra fields
  are ignored/discarded, not authority or synchronized state.

### Shared resource and recovery contract

| Boundary | Approved finite limit |
| --- | --- |
| Preparation | **≤3 GETs / zero mutations**, existing **20-second** total deadline |
| Submission | **≤3 GETs + one PUT**, existing **20-second** total deadline |
| Whole successful interactive flow | **≤6 GETs + one PUT**; editing/consent does not extend authority |
| Membership proof | Same **one complete page / ≤100 rows per phase**, no retained/exported role roster |
| Physical/transport | Existing **one** native PublicREST admission, **8 seconds/call**, **8192 request bytes / 262144 response bytes / 1024 reads** |
| IPC/result | Existing **32768-byte request / 16384-byte result**. New six-field description preparation is **≤16384 UTF-8 bytes**; rename's five-field **4096-byte** preparation stays unchanged |
| Native preparation | **Same eight active Room+Team description records combined**, not eight each; existing private ephemeral native owner, **120-second** age, no auto-renewal/disk persistence |
| Mutation retention | **Same shared 256-action ledger**, fail-closed saturation, exact retained outcome, no eviction/retry eligibility |

Reuse existing action admission, including sends/uploads/features; no queue,
polling/subscription, retry/redirect/auth replay, hidden rate loop, post-PUT
read or receipt. Logical timeout/reset cannot release a still-unsettled native
socket/DNS admission; late exact ACK cannot promote retained unknown.

Use new finite **`team-describe:{teamId}`** in the **same** ledger.
**Team rename and description uncertainty interlock both ways**, including
preparations and new-request-ID writes. Resolving one original action cannot
clear another/newer request; the five Room metadata keys remain independent.
Exact request replay returns retained evidence with no IO, new observation
timestamp or cache publication. Reused ID/different intent refuses.
Pre-dispatch refusal/cancel/timeout and definitive service refusal are failed;
post-dispatch ambiguity, invalid ACK, timeout or grant/context loss are unknown,
not asserted rollback.

Existing `conversations.resolve` gains only
**`{action:"team-describe",teamId,requestId,checked:true}`**. Require matching
original unknown action/Team/request/session, explicit manual Webex check and
idle logical/physical work. No Room override, role/name/description/body/URL,
service read/write or replay. Original unknown remains retained; an older
resolution/ACK cannot clear newer uncertainty. Resolution need not borrow a
fresh joined row/role or request a grant. Further submissions require new
explicit consent and fresh proof. Session-only uncertainty is not a restart
journal; no reconnect/restart replay/eligibility is introduced.

Description ACK **only settles/retires private edit preparation/status** and
retains native text/full undo. Unlike rename it **does not reset, renew,
invalidate or publish Team labels/joined query/cache/name**. No main Room,
roster/role/history/activity/unread/notification/receipt/delivery publication,
filter/sections change or plugin-send exclusion. Later explicit reads re-prove
state. Rename's existing non-replayed cache invalidation remains separate;
any invalidated joined revision makes old Team-description preparation inert.

### Protocol, native edit and source boundaries

- Existing **`EditorEngine.prepareTeamDescription(teamId,revision)`** and
  **`describeTeam(requestId,teamId,revision,expectedName,expectedDescription,description)`**
  use current exact session/Team/joined revision/age and existing conversation
  owner. No selected Room is required/inferred. Missing/foreign/stale/replaced/
  old-session joined selection refuses before protected reads; invalidation
  after dispatch stays conservative unknown.
- **`teams.descriptionPrepare {teamId,revision}`** returns exactly
  **`{sessionId,teamId,revision,observedAt,expectedName,expectedDescription}`**.
  The existing session-only context is a fence, not authenticated/durable
  account identity; self stays Node-private. Revision/time are local query/
  observation metadata, not provider CAS or a role grant.
- **`teams.describe {requestId,teamId,revision,expectedName,expectedDescription,description,confirmed:true}`**,
  no replacement `name`, caller actor/member/role, Room, body/URL, paging or
  preference. Outcome exactly
  **`{requestId,action:"team-describe",status,notice,teamId,expectedName,expectedDescription,description}`**,
  with changed/failed/conflict/unknown and no Room/message/delivery masquerade.
- Independent optional **`teamDescriptions:["replace-v1"]`** is omitted/empty/
  exact singleton only, requiring existing **conversations-v1, joined-teams-v1,
  local-context-v1**. Reject malformed/unknown/duplicate assertions; hello/
  transport resets revoke support. Proposed
  **`wbx#supports_team_description('replace-v1')`**; rename alone never enables
  description and description does not imply rename/clear/role changes.
  Preserve `teamActions:["rename-v1"]`, five Room metadata singletons,
  own-direct visibility, protocol version and **32-capability count/ceiling**.
  Frozen clients ignore the additive sibling without enabling the writer.
- Named-only **`:WebexDescribeTeam`**, **`:WebexTeamDescriptionSubmit`** and
  **`:WebexTeamDescriptionCancel`** in the existing single contextual catalogue;
  no arguments/global keys/Enter action. Reuse **autoload/wbx/conversations.vim**,
  **team_description() / team_description_submit() / team_description_cancel()**,
  `is_team_description(buffer)` and existing **private `s:descriptions` owner**,
  sharing its read-pending state, eight-record budget and description clock.
  No second native live-draft/preparation registry or generic settings editor.
- Prepare only from an unchanged current-session fresh exact **joined-Team
  row**, not loaded-association Team labels, Room composer/history, annotations,
  promoted/unrelated files or copied `b:` metadata. Fence row/query/session/
  window/tick/epoch/age/cursor-away-return before read and callback. Stale/
  future (>current-second rounding), old/abandoned or late callbacks cannot
  open/steal focus, overwrite notes or wedge a newer explicit preparation.
- An ordinary modifiable **`wbx://team-description/{session}-{serial}`** nofile
  buffer contains only exact old description, no sendable header/sentinel.
  Private immutable record + `b:wbx_team_description` bind Team/raw name/old
  description/session/query revision/observation/epoch. Strict
  **`wbx#protocol#team_description`** checks six-field shape/limits. Ownership
  checks distinguish Team from Room despite shared budget; neither Submit/
  Cancel/Send adopts the other scope from buffer variables.
- Submit only from that current private owned plain metadata buffer, not a
  recipient/Room/reply/file/Markdown/promoted context. User text is deliberately
  editable; capture current native text/tick/window/source/preparation around
  confirmation and compare immutable original metadata. Recheck session/query
  revision/age (the earlier joined expiry still applies). Forged fields,
  newer edits, focus/window-away-return, reply/file/format or epoch changes
  cancel without mutation and preserve text/full undo. Confirm exact Team ID,
  required name echo, old/new text and **both** description/name overwrite races.
- Completion/cancel retires authority, never blanks/replaces user text or undo.
  Cancel cannot retire an admitted write, resolve unknown or imply rollback.
  Native status/help/getters/render/search/scrolling perform no provider IO.
  **Blank Submit/Enter/write never clear or send.** No Team-clear command,
  sentinel, file reread/upload or markdown downgrade.
- Preserve normal/recipient/reply files/draft destinations, annotation/promotion,
  focus, colorschemes, native undo/search/navigation and all shadows/opt-outs.
  **Wnr stays Remove Member**, Team-list Enter remains exact loaded-space
  filtering, Room-description commands keep their existing meanings. No
  independent meeting ownership/transmission/tmux/detach changes.

### Contract-first acceptance boundary

Backend and actual Vim/Neovim tests are **expected-red before runtime/help
changes**. Missing method/command/finite RPC is not execution/proof of later
wire/permission/native assertions. A later runtime slice must exercise real
engine/PublicREST exact body/preimages/ACK/status/byte/read/grant/session/query/
deadline/reset/settlement and two-way metadata uncertainty, mixed Room+Team
native budget/scope/undo/consent/callback/recovery/compatibility guards and a
fresh isolated integrated gate. Gate 20 accepts its own frozen Team-rename
inputs only; its gate-19 unexplained legacy native failure stays retained,
not declared fixed by this review.

No runtime/transport/grant/config/dependency change, authenticated live/OAuth/
receipt/device/tenant probe, activation, commit/push or Atlassian work.
Team description clearing and other Team lifecycle/membership/roles, standalone
moderator, MF22 preferences and MF10/reaction/Sections/storage/account gates
remain unapproved/provider-gated. **Team-description runtime/acceptance were
false at this contract-first boundary**; the later runtime slice does not
release clear/role/preference gates or claim live permission/tenant/CAS
acceptance. Full MF01–MF26 completion remains **false**.
