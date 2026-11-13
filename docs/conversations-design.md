# F5 direct/group conversations, membership and server Teams

**Later native completion:** [NC2–NC3 workflows](native-workflows-design.md)
and [NC4 organization](native-organization-design.md) add effective default
families, safe native lists, exact confirmed group Open and ACK-fenced recovery.
The F5 command-only UI and verification below remain historical source evidence.
**MF15 follow-on:** recipient drafts now extend those same conversation and
upload owners with independently negotiated Markdown, one staged file, or their
explicit combination. See the [MF15 contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract)
and [runtime slice](messaging-parity-implementation.md#mf15-recipient-richfile-runtime-slice);
the old F5 gate below does not accept these later changes.
**MF23 follow-on:** independently negotiated, named-only standalone group
title rename reuses the same conversation ledger, self/member proof and
PublicREST. Three fresh GETs maximum then one `{title}` PUT; no Team/direct
rename or arbitrary settings. Preflight conflict is not atomic CAS; ambiguity
is unknown. Recovery binds the original unknown request and room, never replay.
See the [contract](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract)
and [runtime slice](messaging-parity-implementation.md#mf23-standalone-rename-runtime-slice).
**MF23 description follow-on:** named-only Describe/Submit/Cancel extend the same
conversation owner, not a second settings writer or message draft. Independent
`spaceDescriptions:["replace-v1"]` leaves rename's strict singleton unchanged.
Fresh preparation and submit each prove self/room/own membership/moderator and
existing grants, with three GETs maximum / 20 seconds per step. Submit alone
adds one `{title:expectedTitle,description}` PUT: mandatory title echo means
concurrent description lost-update **and** title-overwrite races, not CAS.
Missing/null preimages are not empty; clearing and Team/direct settings refuse.
Rename/description unknowns interlock per room with original-request recovery.
No description/title publication into main room/cache/history/unread/receipt/
notification state. Native private snapshots bind eight active / 120-second
ephemeral edits; cancellation/completion retains native text/full undo.
See the [contract](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract)
and [runtime slice](messaging-parity-implementation.md#mf23-description-replacement-runtime-slice);
earlier F5/rename gates do not accept these later inputs.
**MF23 moderation follow-on:** named-only Lock/Unlock reuse the conversation
ledger, PublicREST and consent/recovery owner with independent
`spaceLocks:["lock-unlock-v1"]`. Creator-self/nonmoderator proof is required for
lock; fresh moderator proof for unlock. Private/nonannouncement flags must be
explicit. Three GETs maximum then one title/lock PUT in 20 seconds; no membership
write or post-PUT read. Mandatory title echo and moderation/role races remain.
All five metadata actions interlock on per-room uncertainty. ACKs publish no
room/cache/roster/role/history/receipt/notification state or draft changes.
The demo's separate synthetic moderation/role model is not live unlock-role
evidence. See the [contract](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract)
and [runtime slice](messaging-parity-implementation.md#mf23-lockunlock-runtime-slice).
**MF23 announcement follow-on:** named-only On/Off use independent
`spaceAnnouncements:["enable-disable-v1"]` and the same consent/ledger/recovery/
PublicREST owners. Fresh own moderator and already-locked/private standalone
proof in both directions; no setup lock, public conversion or role write.
Three GETs then one title/mode PUT maximum in 20 seconds. Consent discloses
Webex participant notification on enable, moderator/bot/integration posting
exceptions and title/lock/mode/role races. No main state, fake message/alert,
delivery, plugin-send exclusion or receipt publication; no notification
suppression. Native work/keys/focus survive. See the
[contract](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract)
and [runtime slice](messaging-parity-implementation.md#mf23-announcement-mode-runtime-slice).
**MF23 clear follow-on:** independently negotiated, named-only DescriptionClear
reuses private unchanged description preparation, strict fresh member/moderator
proof and the same metadata ledger/transport/recovery owner. Only checked title
plus one ASCII-space description sentinel is sent. Explicit empty raw ACK alone
confirms; missing/null/sentinel ACK is unknown and canonical service output is
unestablished. No blank replacement semantics change, new draft, post-PUT read,
retry, main state or native-text deletion. Public/announcement/Team/direct
targets refuse. Five-way uncertainty includes preparation. Native text/full
undo, eight/120-second limits, consent and keys survive. See the
[contract](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract)
and [runtime slice](messaging-parity-implementation.md#mf23-description-clearing-runtime-slice).
**MF22 read-only follow-on:** `:WebexDirectVisibility` / Refresh extend the same
RoomMembers/self/PublicREST/feature owner and native members/lists, with
independent `membershipVisibility:["own-direct-v1"]`. Three GETs maximum read
fresh self, exact direct Room and exact own membership. Only the optional raw
API hidden flag is observed, missing→Not provided, not false. No product Hidden
list/sync, Favorites/server mute, role echo/write, new preference store or
local notification/grouping effect. Main state/roster/history/unread/receipt/
delivery remain untouched. Native r/q and source/age/session fences preserve
annotations, files, text/full undo, focus and mapping opt-outs. See the
[contract](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract)
and [runtime slice](messaging-parity-implementation.md#mf22-own-direct-visibility-runtime-slice).

Status: strict offline-verified, uncommitted/inactive.
**MF24 name-only Team follow-on:** fresh exact joined-Team selection extends
ServerTeams proof/admission and the shared ConversationActions ledger/physical
owner, not Room roles or another sender. Independent `teamActions:["rename-v1"]`
negotiates named-only `:WebexRenameTeam [name]`. Each preparation/submission
proves self/raw Team/unique own moderator from one complete ≤100-member page;
no personId filter, paging scan, cached-role/creator shortcut or membership
write. Three GETs maximum per phase; submission adds one `{name}` PUT.
Exact ACK/original-request recovery and 256-action saturation are one-shot.
Only confirmed non-replayed ACK invalidates Team labels/joined selection;
no main Room/cache/role/receipt/notification publication. Native rows/full undo,
files/replies/drafts, Enter filtering, Wnr and mapping opt-outs survive.
Non-atomic name/role and unverified optional-description/tenant behavior remain
disclosed; all other Team/moderator/preference NO-GOs stay binding. See the
[contract](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review)
and [runtime slice](messaging-parity-implementation.md#mf24-team-rename-runtime-slice).

**MF24 description follow-on:** `readTeamRenameProof` gains an opt-in explicit
raw description mode; its rename defaults remain unchanged. Existing
ConversationActions read/perform/shared 256-action ledger owns `readTeamDescription`
and `describeTeam`, with two-way Team-rename/description uncertainty. Three
fresh GETs per phase, one `{name:expectedName,description}` PUT on submit,
explicit exact ID/name/description ACK, no clear/sentinel or role/preference
echo. Name and description overwrite races are disclosed, not CAS.
Native conversations shares its private descriptions/read/clock and eight-
active combined Room+Team budget, distinguishes scope and immutable preimage,
and uses the on-demand list window without accumulating canceled splits.
Named prepare/Submit/Cancel and independent `teamDescriptions` preserve keys,
native text/full undo/files/focus and older capability assertions. Description
ACK retires only private preparation/status, never Team labels/query/cache or
main Room/notification/receipt state. See the
[contract](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review).
Frozen pre-F5 baseline `/tmp/opencode/wbx-f5-sujtkvnv/` contains 350 sources and
ten original bundle/map hashes. No activation, live probe, OAuth grant/config
change or internal writes.

- All actions reuse F4's one-shot PublicREST, authenticated-self proof and
  RoomMembers verifier. No SDK/member provider duplication, admin/compliance
  APIs, grants, queue, POST/DELETE retry or auth/redirect replay.
- Explicit exact person ID or exact email resolution, never name/roster search.
  Ambiguous/missing identity refuses preparation. Eight recipient draft contexts,
  ten-minute lifetime, exact authenticated-self/recipient/session binding.
  Dedicated recipient composers never adopt another conversation's room draft.
- First explicit DM Send confirms that it may create a persistent DM; no
  placeholder POST. Plaintext only initially, 1000 UTF-16 units/4000 bytes;
  unsupported files/rich formats refuse rather than downgrade.
  First POST has toPersonId, not a fabricated roomId. Validate exact ACK text,
  authenticated author, real message/room IDs, root and creation time; a bounded
  GET verifies the returned room is direct. Bind later sends to that returned
  room ID. The request closure binds recipient intent; the public response is not
  a cryptographic attestation of the recipient or bytes.
- Direct delivery carries its independent recipient target/draft identity plus
  real room/message IDs. Exact plugin-send exclusion occurs before room
  publication/notification-hold release. Native ACK clears unchanged original
  text only; late responses never steal focus, change the recipient or adopt an
  existing normal-room composer. Explicit Open navigates to the returned room,
  retaining both drafts. Unknown delivery latches the recipient context until
  explicitly checked/resolved, never automatically repeats first creation.
- Group creation is a separate confirmed title-only POST (1-80 safe characters,
  320 bytes). Names may duplicate. Returned IDs bind later operations, not names.
  Invitations are separate requests/outcomes; a failed invite cannot create
  another room. Unknown creation requires explicit check/resolve before another
  create. No placeholder message, bulk invitations, Team move or room deletion.
- Invite: fresh self membership and fresh group/lock metadata. Unlocked member or
  explicitly verified moderator of a locked space only; unknown lock refuses.
  Remove: fresh moderator proof and exact target membership/room/person identity,
  never inferred powers. Self-removal uses explicit Leave, which deletes only
  the authenticated user's exact membership, NEVER the room.
- Leave success or uncertainty conservatively revokes room send/read authority;
  unknown is not reported as confirmed left. Preserve text/history/undo/reply
  drafts, mark exact room files stale and cancel their work. Blocked room IDs
  fence stale SDK/REST metadata for the session; no automatic reconnect or status
  refresh restores authority. A deliberate fresh connection may revalidate.
- One active sequence, 20s logical/8s per HTTP request; native I/O cleanup holds
  admission across cancellation/reset. At most 256 exact action outcomes/session,
  no eviction/replay. Unknown key latches require explicit check/resolve.
- Retain validated teamId/lock/read-only/announcement metadata in room/store
  projections. Cached flags never grant permission; fresh service checks do.
  Absent SDK fields cannot erase known REST metadata; authoritative REST can.
- Server Teams are lazy label reads for IDs on loaded, noncached rooms, max eight
  IDs/explicit command, cache 32 labels/ten minutes, negative retention 30 seconds.
  No automatic Team-room/member draining, Team mutations or membership inference.
  Show unresolved IDs and partial loaded coverage. Team filters never select,
  fetch, change membership or retarget drafts. Label Server Team, not Local
  section or synchronized personal Webex Section.

Registered command-only UI: WebexDirect [person ID/email], WebexDirectOpen,
WebexDirectResolve, WebexCreateSpace [title], WebexInvite [person ID/email],
WebexRemoveMember, WebexLeaveSpace, WebexConversationResolve, WebexTeams/More,
WebexTeamFilter [ID] or WebexFilter team:ID. WebexDirectCancel retains text.
Names were checked against existing commands before registration; no default key
additions. WebexActions lists these helpers. Native personal Webex Sections stay separate.

Required known existing grants: people_read for explicit identity, messages_write
and rooms_read for DM creation/ACK validation, rooms_write for group creation,
memberships_read/write for scoped membership actions, teams_read for lazy Team
labels. Aggregate all is accepted; configured scopes never prove a grant.

Public references reviewed in preparation (read-only, 2026-11-14):
https://developer.webex.com/docs/api/v1/rooms describes immutable Team association;
https://developer.webex.com/docs/create-spaces-add-participants-post-messages-from-postman
separates title-only room creation, membership additions and message posting;
https://developer.webex.com/blog/introducing-the-webex-messaging-announcement-mode-api
describes locked/announcement/moderator semantics. Dynamic operation-page
navigation alone is not schema proof. Offline tests do not imply live acceptance.

## Offline acceptance boundary

Focused tests use synthetic identity and accounts only. They cover exact email/
ID ambiguity, missing grants, account replacement, first/returned DM routing,
malformed ACKs, grant/reset/destination loss after submission, no request eviction,
unknown latches and exact self-membership deletion. Native fixtures exercise
actual demo commands in both editors, retained older room/reply drafts/files,
newer recipient text under late ACK, explicit navigation, role denial, leave
versus deletion and lazy Team filtering with hidden selection. Unknown leave
still revokes its exact room if selection changes while DELETE is in flight;
unrelated room authority survives. No mutation is automatically replayed.
Final gate: `/tmp/opencode/wbx-f5-verification-3kv5qbfm/`, private copied project
and HOME/config/state, existing dependencies only; native fixtures use the copied
compiled backend, required Vim and Neovim. Focused evidence:
`/tmp/opencode/wbx-f5-sujtkvnv/`.

| Check | Result |
| --- | --- |
| Core | 762 passes / 14 explicit opt-in skips |
| Native editors | 51 Neovim + 50 Vim fixtures / zero editor skips |
| Drawn private PTYs | 38 Neovim + 37 Vim fixtures |
| SDK/read-status/cache / synthetic messaging / browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 359 sources checked; 350 frozen pre-F5 sources and ten original bundle/map hashes unchanged |

The frozen baseline characterization records expected absence of F5 RPCs, not a
feature pass. Retained focused failures: the initial native fixture called
`get(v:null,...)` before room readiness; it now guards readiness/type. A new
selection-race regression initially expected a silent no-op when selecting a
revoked ID; the existing API correctly rejects it, now asserted explicitly.
The command-discovery doc check exposed singular/plural wording, corrected in the
contract. No production assertion was weakened. Post-submission grant/reset/
destination cases verify that an outer final credential check cannot erase an
unknown mutation outcome. Finalization changes only this report, the plan and
verification index, followed by docs/integrity checks.

No live Webex/OAuth/DM/member/receipt/device acceptance, grant expansion,
configuration change, original build, active-editor reload, commit, push or
activation occurred. Server policy/race restrictions remain authoritative; offline
passing counts do not establish live acceptance.
