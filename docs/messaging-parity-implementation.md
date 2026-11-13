# Messaging parity implementation ledger

Status: **in progress; offline only, uncommitted/inactive**.
This implements the subsequent user directive for the
[MF01–MF26 / MP0–MP9 plan](messaging-parity-plan.md), not its superseded
planning-only authorization. No service acceptance follows from offline tests.

## MP0 boundary and provider audit

`/tmp/opencode/wbx-messaging-parity-341sx5zc/baseline.json` and `before/`
freeze 391 existing sources, ten checkout bundle/map hashes, HEAD
`9aeedd825a6d4c51fcf60a7bb8459c59911d2ea9` and empty staging.
All pre-existing edits, including the NC0 bundle-drift exception, are retained.
Builds run only in isolated copies, using already-installed dependencies.
The old NC6 pass is historical, not verification of these changes.

The official Messages list/create, People list and Rooms update documentation
pages were fetched anew. Their retrieved bodies contained navigation, not usable
operation schemas; **none validates a new runtime contract**. Installed public
SDK 3.13.0 source documents message Markdown/files and People displayName queries.
That is bounded source evidence, not proof of permissions, complete results,
wire combinations, replay containment or live policy acceptance.

| Feature | Current decision / next dependency |
| --- | --- |
| MF01 reactions | **Blocked R**: explicit internal-interface approval, summary/own-ID/parent/event/vocabulary and detached-write containment absent; [research](reactions-research.md) remains NO-GO |
| MF02 space pins | Planned; no approved public shared-pin provider |
| MF03 Flags/bookmarks | Local session-only bookmark slice; server Flags still provider-gated |
| MF04 quotations | Local same-space copied plaintext slice; no native service quote/cross-space forwarding |
| MF05 forwarding | Planned; policy, attribution, destination and native-vs-copy provider contract absent |
| MF06 typing | Planned; event/send/expiry/privacy contract absent; no outbound activity |
| MF07 mentions inbox | Selected-space authenticated API @me slice **implemented-offline**, accepted in `mp3-reads-gate-4/`. No account-wide inbox or verified @all coverage. |
| MF08 seen-by | Planned; privacy/grants/paging/absence semantics not established |
| MF09 server mark-unread | Planned; no approved write/reconciliation contract |
| MF10 server search | **Provider-gated / NO-GO** after the [dated review](messaging-public-provider-audit.md#mf10-server-indexed-search-provider-gate): reviewed Messages v1 has no indexed query; connected tool is client-side scanning; Suite MCP overview lacks a validated index/query/paging/permission contract. No feature tests/runtime approved. |
| MF11 threads | Loaded-only view and bounded public remote-thread read/root-draft slice **implemented-offline**, accepted in `mp3-reads-gate-4/`. API exhaustion is not an atomic/future-complete snapshot. |
| MF12 galleries | Loaded file/link/media message lists slice; remote discovery still provider-gated |
| MF13 cards | Inert versioned readable text subset / loaded-card list **implemented-offline**, accepted in `mf13-gate-6/`. All card actions/inputs remain unsupported and inert; no full layout parity. |
| MF14 multiple/rich files | Markdown+single-file runtime/native subset **implemented-offline**, accepted in `mf14-gate-8/` under the [reviewed contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract). Multiple files are not exposed by the reviewed provider. |
| MF15 first-send rich DMs | Recipient Markdown, single-file and their separately negotiated combination **implemented-offline**, accepted in `mf15-gate-9/` under the [reviewed contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract). No live tenant/recipient-echo/file acceptance. |
| MF16 persistent drafts | Subsequently approved private plaintext normal/reply recovery is default-on with `persist_drafts=false` opt-out; see [drafts](drafts.md). Encrypted storage/account management is not implemented; the earlier design gate remains historical. |
| MF17 durable history | **Blocked D**: key/account/access-loss/purge design needs approval; no body persistence |
| MF18 account switching | **Blocked D**: credential/meeting-lease/storage isolation design needs approval; session fence below is not multi-account support |
| MF19 profiles/status | Textual selected-person read subset **implemented-offline**, accepted in `mf19-gate-5/`. Avatars, custom status, self-status/DND/profile writes remain outside this subset. |
| MF20 directory | **Implemented-offline**, accepted in `mp2-directory-gate-2/`. No scan/presence/organization selector; live tenant/grant acceptance unrun. |
| MF21 native Sections | **Blocked S**: [provider matrix](native-sections-research.md) unresolved; no Team/Favorites substitute |
| MF22 personal preferences | [Own-direct API visibility observation](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract) **implemented-offline**, accepted in `mf22-visibility-gate-18/` through existing owners. This is only the raw optional own-direct `isRoomHidden` flag, **not full product Hidden state/list/sync**. Favorites/server mute providers and all preference writes remain **NO-GO/provider-gated**; no moderator echo or local grouping/alert-mute substitution. |
| MF23 space management | [Standalone title-only rename](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract) **implemented-offline**, accepted in `mf23-gate-12/`. [Bounded description replacement](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract) **implemented-offline**, accepted in `mf23-description-gate-13/`. [Private standalone lock/unlock](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract) **implemented-offline**, accepted in `mf23-lock-gate-14/`. [Already-moderated private standalone announcement mode](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract) **implemented-offline**, accepted in `mf23-announcement-gate-15/`. [Separate private standalone description clearing](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract) **implemented-offline**, accepted in `mf23-description-clear-gate-17/` through existing owners, with conservative explicit-empty ACK confirmation only. Team/direct/general settings, move/delete remain excluded/gated; no live tenant/policy acceptance. |
| MF24 Teams/roles | [Bounded Team rename](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review) **implemented-offline**, accepted in `mf24-team-rename-gate-20/`. [Team-description replacement](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review) implemented through existing owners; gate 21 functional checks pass, but **not accepted** because historical checkout-bundle integrity fails. Work is paused; required exact name echo, raw description preimage and fresh moderator proof remain binding, with no clear or role/preference echo. [Standalone moderator review](messaging-public-provider-audit.md#mf23mf24-standalone-moderator-management-review--provider-no-go) stays **NO-GO**; other Team lifecycle/membership/roles remain planned/operation-gated. Joined rows are selection, never write permission. |
| MF25 discovery/join | Joined-Team read subset **implemented-offline**, accepted in `mf25-gate-7/`. Public/org discovery, Team/space joining and unloaded Team-room reads remain outside this subset. |
| MF26 bulk membership | Planned; explicit per-target admission/outcomes depends on MF23/MF24 review |

No newly discovered product gap enlarges the finite catalogue at this boundary.
Each service sub-operation requires Gate P before exposure. Provider research
may continue independently; navigation pages/method names never release gates.

**Subsequent public-HTML audit:** the official pages embed substantive version-1
JSON schemas even though their Markdown retrieval omitted them.
[Dated provider findings and MF20 contract](messaging-public-provider-audit.md)
record the source fields and exact limitations. MF14 multiple-file delivery is
**not exposed by the reviewed public provider** (one file/message), not an
approved array-based batch. Markdown+single-file has a separately recorded
offline contract and installed-serializer evidence; that research alone was
**not live service or runtime acceptance**. Its subsequent runtime acceptance
is recorded below, still without live service acceptance. MF07/MF11 have a subsequent
[approved selected-room read contract](messaging-public-provider-audit.md#mf07--mf11-selected-room-read-contract),
not a broad inbox/completeness claim. MF23/MF25 remain narrower provider
candidates, not released write gates.

## MP1 / first MP2 contract

Approval here is for a **local-only alternative**, with no new provider requests,
grants, file IO, receipts, transmission, account probing or meeting ownership.
The existing engine remains the sole backend owner.

- `local-context-v1`: optional `localContext = {sessionId, coverage: "session-only"}`.
  A 128-bit random opaque ID is created for each admitted session start and is
  omitted outside ready state. It is stable across rooms/snapshots, never across
  reconnects/processes, and is not an authenticated person ID, account/profile
  namespace, credential, provider revision or durable-store key.
- Old backends without this capability/DTO remain usable but cannot activate the
  new local actions. Native DTO validation rejects malformed/extra fields.
  Local targets bind session + exact room + exact message; each activation
  rechecks current loaded data, selected readiness and owned unchanged view.
- Bookmarks: at most 128 identity pairs; **no message bodies** retained in their
  registry. Saturation refuses, never silently evicts. List labels resolve only
  from currently loaded messages. Disconnect/new session clears the registry.
  Navigation never fetches/selects another room: select/load it explicitly first.
- Quotations: one bounded in-memory source, same selected room only, text at most
  3000 bytes; explicit capture then explicit insert into a plain normal/reply
  composer. No attachment copy, native quote/forward or mention consent.
  Attribution is a sanitized display label, not verified authorship. Mention
  delimiters are neutralized. Final text must fit existing 1000 UTF-16/4000-byte
  limits; no truncation, format switch, overwritten text or implicit send.
  At most eight source guards/draft; submit rechecks session, selected source
  room and current exact source fingerprint. Removed/changed/unloaded sources
  refuse until the user explicitly detaches copied-text provenance or restores
  the matching source. Detachment is deliberate, retaining ordinary native text.
- Thread: existing bounded ancestry resolver, including missing/cyclic parents;
  only loaded members, always **partial/loaded**, not complete Webex retrieval.
  At most the existing 500-message/20000-body-row display budgets; no receipt
  authority. Enter jumps to the corresponding unchanged main history message.
- Content lists: at most 500 loaded messages, one row/message, finite
  files/links/media selectors; labels clipped to 160 characters. Links are
  detected in already-loaded text, not parsed/fetched/executed. Enter navigates
  to the message; existing attachment/open commands remain separate.
- Reuse owned `lists.vim` lifecycle, annotations/promotion/map conflict handling
  and return-window checks. Render only on explicit invocation; background
  snapshots perform only session invalidation, not query/body/list rebuilding.
  Preserve all existing Wa/Wu/Wn/Wv/Wm meanings, full native undo and opt-outs.

Client support: native Vim/Neovim only for these local interactions; additive
snapshot metadata does not change standalone messaging TUI delivery or views.
No general RPC/query/Ex tunnel or new mutation transport is introduced.

## MF20 read-only directory slice

Uses the [approved bounded public-read contract](messaging-public-provider-audit.md#mf20-approved-read-only-implementation-contract).
`people.search` is finite and separately capability-gated; the existing engine's
session owner, known-grant checks, feature deadline and physical REST boundary
remain in charge. A new query/reset revokes old paging; cancellation does not
free physical admission early. No repeated request on auth/redirect/rate-limit.
Names/IDs only are projected, not raw directory/profile/presence/admin fields.
Same-name Enter prepares the exact selected person via the existing recipient
owner, with a separate fresh lookup and no send. No standalone TUI behavior change.

## MF07 / MF11 selected-room read slice

Implements the dated public read contract, not internal interfaces or a generic
query tunnel. `MessageQueries` owns two fixed bounded read slots through existing
engine feature/known-grant/physical REST admission. Source/root/room identities
are revalidated. Query bodies use the existing pure bounded message parser,
never attachment registries, main-history insertion, receipts or notifications.
Selection/reload/revocation/session changes invalidate slots; physical work
cannot be overlapped by cancel/reset. Source/root/page, item, byte, deadline and
expiry budgets and API-vs-content completeness labels are explicit.

`WvH` fetches a remote thread, distinct from local `Wvh`; `Wvi` lists selected-room
API @me results. `r` / `]p` are explicit bounded reads, Enter opens retained text
or exact loaded-ID navigation, `q` returns. `WaR` reuses existing exact-root reply
drafts with text/undo preserved and the backend parent/send/ACK guards unchanged.
No caller-supplied actor/mention target/parent/URL RPC, cross-room search,
@all guarantee, implicit source load or live service acceptance.

## MF19 selected-person textual-read slice

Implements only the
[approved six-field public-read contract](messaging-public-provider-audit.md#mf19-selected-person-textual-profile-contract).
`mf19-baseline.json` / `mf19-before/` preserve the pre-slice 407-source state.
One `people.profile {personId}` GET uses existing engine session/known-grant/
physical admission; the DTO contains only bounded sanitized text. There is no
profile cache/registry, automatic name/presence enrichment, avatar transfer,
status/DND/profile/admin write, dependency, grant or meeting-owner change.

`WnP` selects an exact current-session directory/member row ID; the named command
also accepts one explicit exact ID. The single on-demand textual view uses `r`
for an explicit same-ID/session fresh read, `q` to return and `/` to search.
Enter has no profile action. Existing annotation/promotion/unload/map/conflict,
choice/session/source-row/observation guards preserve native work and focus.
Roster rows receive the originating native session marker without acquiring
membership/role/write authority. Old-session profiles/rosters refuse to retarget.
An expired same-session profile can explicitly refresh but cannot reuse old data
as authority. Native-only interaction; standalone delivery semantics unchanged.

`mf19-red/core.log` retains the expected missing-module failure before code.
`mf19-focused-1/` passes TypeScript/12 backend and 13 of 14 native checks; its
Vim-only failure is a fixture variable named `count`, read-only in that build.
Renaming that test variable fixes the fixture without weakening an assertion.
`mf19-focused-2/` passes **TypeScript, 13 backend, 14 affected native and four
drawn checks**, all zero skips. This includes same-name IDs, no private/profile/
presence/avatar DTO leakage, fixed-origin 200/302/401/403/404/429 GET counts,
grant/cancel/session replacement, stale/future/late/changed-row/away-and-return
responses, explicit refresh, contextual help, prefix/user maps, annotations,
promotion, unload, small windows, presence opt-out and full native draft undo.
The fresh copied-project acceptance below covers these new runtime/test/help
inputs; no prior gate or offline pass implies live tenant acceptance.

### MF19 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf19-gate-5/`
freezes **412** source inputs, with all result statuses zero:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **836 pass / 14 deliberate opt-in skips** |
| Actual Vim/Neovim native fixtures | **139 pass / zero skips** |
| Private drawn PTYs | **119 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| SDK/read-status/presence/cache plus profile tests | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum them as independent cases. This accepts only the
textual-read subset of MF19 alongside previously accepted slices, not all MF19
operations, all of MP3 or MF01–MF26. No live profile/tenant/grant acceptance or
activation occurred.

`mf19-finalization.json` records the exact gate/counts and post-gate Markdown
delta. Finalization reruns documentation checks and verifies unchanged
runtime/test/help inputs, ten checkout bundle/map hashes, HEAD and staging.
The follow-on provider research in the audit is documentation only, outside
this frozen gate; no new runtime contract follows from it.

## MF13 inert readable-card slice

The [approved subset contract](messaging-public-provider-audit.md#mf13-approved-readable-card-subset)
uses the official Messages v1 envelope, Webex Cards Guide and a pinned Microsoft
1.3 schema. `mf13-baseline.json` / `mf13-before/` freeze 412 pre-slice sources.
Only TextBlock/FactSet/Container/Column text from exact supported versions is
projected, in source order and under explicit attachment/child/node/depth/text
budgets. Hidden/conditional content, input defaults, actions/URLs, nested
ShowCards and unknown/new versions are omitted without traversal or raw dumps.
No new request, grant, SDK, dependency or action/provider tunnel is introduced.

Existing pure `message-content.ts` parsing appends labeled inert text to existing
plain/rich fallbacks within the existing display budget. Query projections remain
inert text only; main history has strict defensively copied count/partial metadata.
It does not infer sender permissions or produce notification/unread/receipt
evidence. `WvC` / `:WebexCards` / `:WebexContent cards` reuse the loaded-content
owner and exact-ID navigation, maps/opt-outs, annotations, promotion and native
undo; Enter never performs a card action or URL open. Compatibility clients gain
only inert readable text, not native commands or interactive cards.

`mf13-red/` retains the expected pre-implementation missing-module failure.
`mf13-focused-1/` passes TypeScript and 27 card/content/query backend checks.
`mf13-focused-2/` retains two native and two drawn fixture failures: the synthetic
projection stub incorrectly loaded session layout lifecycle hooks without its
coordinator. The fixture now uses the inert projection seam; real plugin command
registration remains separately checked by the catalogue fixture.
`mf13-focused-3/` passes **12 affected native / two drawn** checks. A subsequent
pure parser-to-editor fixture now supplies actual production-projected card data,
not hand-authored rendered text. `mf13-focused-4/` passes **TypeScript, 27 affected
backend, 12 native, two drawn and eight documentation checks**, all zero skips,
including that parser-to-editor path. Final integrated evidence follows; no
earlier gate accepts this new slice or releases card actions.

### MF13 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf13-gate-6/`
freezes **416** source inputs, with every result status zero:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **844 pass / 14 deliberate opt-in skips** |
| Actual Vim/Neovim native fixtures | **141 pass / zero skips** |
| Private drawn PTYs | **121 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap. This accepts the bounded read-only text projection and native
loaded-card list, not interactive cards, all MF13 operations, full MP3/MP4,
MF01–MF26 parity or live bot/tenant/service acceptance. No activation occurred.
Unknown/new content, actions and inputs remain inert; the R/S/D gates remain.

`mf13-finalization.json` records actual gate counts and the Markdown-only
acceptance delta, reruns documentation checks, and verifies unchanged
runtime/test/help inputs, all ten checkout bundle/map hashes, HEAD and staging.

## MF25 explicit joined-Team read slice

The [approved exact public-read contract](messaging-public-provider-audit.md#mf25-joined-team-listing-contract)
revalidates the official v1 `GET /teams` schema and known granted teams-read
scope. `mf25-baseline.json` / `mf25-before/` freeze 416 pre-slice sources.
`teams.joined` extends existing `ServerTeams` and engine/PublicREST admission;
one GET per explicit query/page, a session/revision/age-bound 50/page, five-page,
250-ID / 64 KiB slot, no reset-based physical overlap and no hidden detail/room
scan. Results are exact IDs/sanitized labels only, not descriptions/roles/raw
payloads. The old loaded-association cache/provider stays independent.

`WvT` / `:WebexJoinedTeams` opens the on-demand joined list; `Wvt` remains loaded
Team labels. `r` is a fresh same-session query, `]p` one exact-revision page,
`q` return and `/` native loaded search. Enter uses the exact row ID to filter
only currently loaded noncached spaces through the existing owner, never joins,
fetches rooms, selects a draft destination or produces receipt/notification
authority. Missing loaded rooms are not Team absence. Old/new session, age,
future clock, callback serial/intent, annotation/promotion/unload/map and full
native draft-undo guards remain. Capability negotiation stays within the
unchanged maximum of 32 entries. Native-only controls; compatibility clients and
independent meeting owners are unchanged.

`mf25-red/` retains the pre-implementation failures for missing `teams.joined`
admission/owner methods. `mf25-focused-1/` passes TypeScript and 18 joined/legacy
Team checks. `mf25-focused-2/` passes **18 backend, ten affected native, four drawn
checks and TypeScript**, all zero skips, including actual default keys and the
real demo backend. Additional sparse-page, later-page 429, independent-cache,
mid-read grant loss and replacement-session tests plus documentation are new
inputs for the final focused and fresh copied integrated gate, not accepted by
earlier passes. Public/org discovery, Team/space joins, management and unloaded
Team-room reads remain undelivered; no live tenant/grant acceptance is implied.

`mf25-focused-3/` passes 20 joined/legacy backend, ten native, four drawn, eight
documentation checks and TypeScript. `mf25-expiry-red/` then retains the failing
late-page regression: a GET completing after the two-minute lifetime could return
stale data and refill the backend slot even though native response-age guards
would reject installation. The backend now rechecks lifetime at completion and
invalidates that cursor. `mf25-focused-4/` passes **21 joined/legacy backend, ten
native, four drawn, eight documentation checks and TypeScript**, all zero skips.
Fresh integrated verification includes that fix; no earlier pass is promoted
across later runtime inputs.

### MF25 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf25-gate-7/`
freezes **420** source inputs, with every result status zero:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **860 pass / 14 deliberate opt-in skips** |
| Actual Vim/Neovim native fixtures | **145 pass / zero skips** |
| Private drawn PTYs | **125 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap. This accepts only the bounded explicit joined-Team listing and
exact loaded-space filter alongside previously accepted slices, not all MF25,
Team/space joining, public/org discovery, unloaded-room reads, management or
MF01–MF26 parity. No live tenant/grant acceptance or activation occurred.

`mf25-finalization.json` records actual gate counts and the Markdown-only
acceptance delta, reruns documentation checks, and verifies unchanged runtime,
test/help inputs, all ten checkout bundle/map hashes, HEAD and staging.
Capability count is 32 under the unchanged 32-entry protocol ceiling.

## MF14 contract-first boundary

`mf14-baseline.json` / `mf14-before/` preserve the **420** preceding sources,
ten checkout bundle/map hashes, HEAD and empty staging. Only the provider audit,
this ledger and the verification index change for this contract-first step.
No upload/runtime/protocol/native help implementation is accepted or advertised.

The [dated contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract)
records the exact wire/negotiation/consent/grant/preflight/physical admission,
quotas, refusal/unknown/ACK, privacy and native workflow rules. It distinguishes
official JSON schema plus plaintext-only multipart examples, public SDK payload
selection, actual installed Node multipart encoding and **unrun live service
acceptance**. Files remain one/message. There is no fallback, fanout, parallel
sender, new grant, dependency, configuration, meeting owner or live activation.

`mf14-contract-research/node-wire.log` passes three encoded multipart cases
through `@webex/plugin-messages` / `@webex/http-core` 3.13.0, `request` 2.88.2 and
`form-data` 2.5.6, using an in-memory native sink: three POST-shaped native calls,
one file each, exact root/Markdown/UTF-8/binary bytes and lengths, **zero socket
connections / zero service POSTs**. Request interceptors are bypassed, so this
is not SDK replay proof and the SDK is not chosen as the runtime sender.
The earlier `public-multipart-research.log` only intercepted pre-encoding options
and is retained as narrower evidence. Public documentation extraction initially
returned 403; the corrected public HTML retrieval passes and retains only the
selected operation/attachment-guide fields in `mf14-public-evidence.json`.

The implementation must also address newly recorded owner deltas: independent
finite hello assertion without a 33rd capability; preflight inside the existing
upload reservation; raw (not display-trimmed) Markdown ACK equality before file
registration; shared ledger saturation refusal instead of evidence eviction;
and native delivery-text correlation. An ACK does not expose a local file digest
or byte-equality proof. These are required future assertions, **not passing
runtime guarantees**. Expected-red implementation cases and the subsequent
fresh copied-project acceptance gate are still pending.

`mf14-contract-checks/` passes **TypeScript, 58 existing upload/action backend
tests, 12 affected actual Vim/Neovim regression checks and eight documentation
tests**, all zero skips. Five additional baseline probes pass by explicitly
confirming current behavior/gaps (including Markdown display trimming and
64-entry evidence eviction), **not** by validating the proposed feature.
Separate frozen-old-client hello probes pass four assertions in each editor:
the current 32 capabilities and the optional finite assertion are compatible;
a 33rd capability is rejected. They do not enable the combination.

`mf14-contract-finalization.json` records these actual results, the three
encoded-wire cases and the exact three-Markdown-file delta against the freeze.
Finalization reruns documentation checks, checks unchanged runtime/test/help
inputs and ten checkout bundle/map hashes, and preserves HEAD/empty staging.
No new full integration/build pass, MF14 runtime acceptance or full-plan
completion is claimed by this documentation-only step.

## MF14 Markdown single-file runtime slice

`mf14-runtime-baseline.json` / `mf14-runtime-before/` preserve the 420-source
contract-finalized state before runtime edits, separately from the earlier
research freeze. This extends existing `Uploads.send` / `multipart` /
`MessagingStore.sendPrepared`, engine dispatch, native Send and draft/ACK owners.
There is no new sender, draft registry, grant, dependency, SDK/device, live
service activation, installed configuration or checkout build.

The 32-capability list and ceiling remain unchanged; the optional finite hello
assertion explicitly enables Markdown plus one file, never inferred from the two
older capabilities. Existing Attach/Format/Send commands and keys are reused.
Consent revalidates session/selection/window/tick/text/root/format/draft/file.
Mentions use existing grammar and fresh exact-person membership verification,
with separate @all consent. Its 20-second preflight is inside the same 60-second
upload reservation. PublicREST's native-settlement observation keeps that owner
reserved after logical cancellation; stubborn GETs cannot allow overlap.

The custom one-shot serializer emits one `markdown` part and one immutable binary
file, exact room/root, no generated fallback, file drop or hidden message fanout.
Raw ACK room/root/Markdown/new-ID/time/single-allowlisted-reference checks precede
registry projection. This is request/handle correlation, not remote byte-equality
proof. The combined native delivery includes exact caption text; legacy events
remain compatible. Shared ledger saturation at 64 refuses instead of evicting
write evidence into replay eligibility. Notification exclusion/hold/privacy,
native editing/undo and independent meeting ownership stay with existing owners.

`mf14-red/` retains four expected backend failures (RPC, serializer, delivery
format, ledger saturation) and two native failures for missing combination
negotiation before runtime code. `mf14-focused-1/` retains a fixture TypeScript
annotation error and the discovery that legacy delivery intentionally omits
draft text. The initial universal text check was narrowed to the combined
shape, with exact caption publication there and legacy event compatibility.
`mf14-focused-2/` then passes **67 backend, 12 native checks and TypeScript**.
`mf14-focused-3/` passes **86 backend checks and TypeScript**, 14/16 affected native
and two drawn workflows. Its new boundary fixture incorrectly assumed closing
a split preserves the source window and compared an unsynchronized scripted
undo block across native window leave. `mf14-native-boundaries-4/` retains the
remaining undo-block synchronization assertion. The fixture now uses existing
windows with exact return and explicitly ends scripted typing before capturing
full undo; assertions remain. Verification continued below.
`mf14-focused-5/` and `mf14-focused-6/` additionally retain fixture-only replacement
prompt and scoped wait-expression mistakes while expanding root/replacement
coverage. `mf14-focused-7/` passes **86 affected backend, 16 native, four drawn,
eight documentation checks and TypeScript**, all zero skips. Root replies,
replacement files, exact text/format ACK retention and both editors' consent
races are included. The effective catalogue now also explains missing combination
support for a staged Markdown draft; final verification includes that later
help-context assertion, not just the preceding focused pass.
`mf14-focused-8/` passes **86 affected backend, 18 native, four drawn, eight
documentation checks and TypeScript**, all zero skips, including effective
catalogue/old-backend availability. The fresh copied-project integrated gate
follows; these focused counts alone do not establish full MF14 or MP4/roadmap completion.

Multiple files, rich/file first-contact DMs and unreviewed MF01–MF26 operations
remain outside this subset. No live multipart/tenant/grant/ACK acceptance follows.

### MF14 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf14-gate-8/`
freezes **423** source inputs, with every result status zero:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **896 pass / 14 deliberate opt-in skips** |
| Actual Vim/Neovim native fixtures | **149 pass / zero skips** |
| Private drawn PTYs | **129 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum them as independent cases. This accepts only explicit
Markdown plus one staged file, its existing native Attach/Format/Send workflow,
finite combination negotiation, consent/ACK and shared-owner admission guards,
alongside previously accepted slices. It does not accept multiple files, MF15
recipient-first rich/file DMs, all MF14, all MP4 or MF01–MF26 parity.
No live multipart/tenant/grant/ACK policy acceptance or activation occurred.

`mf14-finalization.json` records actual gate counts and the Markdown-only
acceptance delta, reruns documentation checks, and verifies unchanged runtime,
test/help inputs, all ten checkout bundle/map hashes, HEAD and staging.
The capability count and protocol ceiling both remain 32; the combination uses
the separate finite optional hello assertion, not inferred capability support.

## MF15 contract and expected-red boundary

`mf15-baseline.json` / `mf15-before/` preserve **423** MF14-accepted sources,
ten checkout bundle/map hashes, HEAD and empty staging. The
[dated MF15 contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract)
records exact person/self/returned-room evidence, first-send creation consent,
recipient-bound staging, finite independent mode negotiation, shared physical
upload/conversation admission, budgets and typed refusal/unknown/ACK rules.
It does not implement the feature or accept live service/tenant/file/ACK policy.

`mf15-public-evidence.json` retains five official v1 operation schemas and the
room-only local multipart guide, never page auth/CSRF state. The guide does not
directly demonstrate recipient multipart; the schema does not promise mandatory
recipient echo. Missing recipient echo in the new modes must remain unknown,
not be inferred from a title or creator. No new membership grant is requested.
`mf15-contract-research/node-wire.log` passes **four** installed Node serializer
cases (recipient Markdown JSON, file-only, plain/file, Markdown/file), one native
POST-shaped call each with exact fields/binary bytes/length and no fabricated
room/root/email, **zero socket connections / zero service POSTs**. SDK request
interceptors are bypassed; the SDK is not a chosen runtime sender or replay proof.

Required implementation deltas include recipient-vs-room snapshot binding
without fake IDs, explicit direct-format negotiation under the unchanged
32-capability ceiling, preserving native file/format/target/session/undo guards,
raw exact-recipient ACKs and post-ACK room-read failures remaining unknown.
No prior integrated gate accepts new MF15 sources.

`test/direct-rich-files.test.ts` adds finite RPC, first/later ID routing,
recipient echo, real-mention refusal, post-ACK room-read failure, format/file
ledger identity, shared source/quota, multipart target and actual demo-engine
composition contracts. `test/editor/direct-rich-files.vim` and
`direct-rich-boundaries.vim` are registered in the existing native/drawn runners,
not another catalogue or runtime sender. They specify existing keys/commands,
finite hello assertions, creation consent, target/file/format/window races,
replacement files, native undo and explicit Open without draft adoption.
Assertions beyond missing format/negotiation are still future green evidence,
not claimed as exercised by an early expected failure.

`mf15-red/` retains the initial **11/12 backend failures and four native
failures**. `mf15-red-2/` includes the additional actual-engine composition test:
**12/13 backend failures, four native failures**, zero skips/cancellations.
The one passing backend case is an existing wrong-recipient ACK refusal, not
MF15 feature acceptance. Expected failures demonstrate missing direct-format
RPC/serialization/native editing/hello guards and recipient-bound staging.
They also expose that a successful POST followed by a room GET 403 currently
returns failed: the new contract requires unknown and no recreation/retry.
This outcome fix must stay in the existing conversation owner.

`mf15-guards-2/` passes **TypeScript, 73 existing recipient/upload backend checks,
ten existing native checks and eight documentation checks**, all zero skips.
These regression results do not turn intentionally failing MF15 suites green.
At that boundary the default backend/native suites included those red tests and
were **not an accepted integrated gate** before implementation.

`mf15-contract-finalization.json` verifies this documentation/test-only delta:
runtime/native help, ten checkout bundles, HEAD and empty staging are unchanged.
It records research, red and regression counts separately and reruns docs.
No implementation, build, live service acceptance or full-plan completion is
claimed. The next step is extension of the existing recipient/upload owners
under this contract, followed by green tests and a fresh copied-project gate.

## MF15 recipient rich/file runtime slice

`mf15-runtime-baseline.json` / `mf15-runtime-before/` preserve the **426-source**
contract/red-test state separately. No earlier red/research/guard gate is
retroactively promoted to accept runtime changes.

The existing conversation owner now accepts typed format/file intent, retains
the same 256-entry action ledger and person-keyed uncertainty, and reserves
before fresh self/person reads. The existing upload owner has a canonical
exclusive room/root-versus-recipient snapshot union, shared quotas, target
revocation and parent cancellation, never a target disguised as room ID.
Markdown JSON uses PublicREST; files use the same fixed-origin `postUpload`.
First POST uses exact freshly verified `toPersonId`; later sends use only the
confirmed direct room ID. Raw recipient/author/content/file evidence and exact
returned-room verification precede projection/adoption. Post-ACK GET refusal
is unknown, including legacy direct sends; typed POST refusal remains refused.
Only bounded projections/private allowlisted file references are retained.

Existing native Direct/Format/Attach/Remove/Cancel/Status/Send commands and keys
are reused, with first-send exact-person/format/file creation consent and
tick/text/draft/target/window/session guards. The independent finite direct-mode
list keeps the 32 capabilities/ceiling unchanged. Separate modes and MF14 do
not imply the combination; combination-only backends can prepare that mode
without enabling unasserted separate deliveries. Recipient snapshots never
adopt normal/reply drafts; explicit Open alone navigates. Native undo, newer
text/format/replacement files, exact-send exclusion and queued preview privacy
stay with the existing owners.

`mf15-focused-1/` passes TypeScript, 113/114 affected backend and all 14 native
checks. Its failure exposed an overbroad conversation busy check borrowing the
upload reservation and rejecting even a room-ledger unknown/replay lookup.
Admission remains in the existing owners; engine entry points already guard
physical uploads. Removing that redundant check preserved legacy behavior.
`mf15-focused-2/` passes **147 affected backend / 14 native / four drawn checks
and TypeScript**, all zero skips. It includes actual JSON/multipart request
counts/bytes, first/later selectors, immutable sources, raw ACK mismatch matrix,
typed POST refusal, post-ACK room-read failure, grant/cancel/expiry/reset races,
bounded retention and notification ordering.

`mf15-focused-3/` passes **151 backend checks and TypeScript**, 13/14 native and
two drawn checks. New promoted-buffer/disconnect coverage exposed a real
status bug: two empty draft/progress IDs could be treated as an active progress
record and dereference a missing phase. The existing upload label now requires
nonempty progress and displays only inert retained metadata for promoted work.
The assertion remains; final focused/integrated verification follows.
`mf15-focused-4/` passes 151 backend/TypeScript/docs, all four new direct drawn
workflows and 14/16 native checks. Its added queued-privacy test reused a synthetic
clock already advanced 35 seconds, correctly failing the existing 30-second
creation-freshness check. Resetting that fixture's clock (without changing
runtime freshness rules) retains and exercises the intended privacy assertions.
`mf15-focused-5/` passes **151 backend, 16 native, six drawn, eight documentation
checks and TypeScript**, all zero skips. Both editors cover native recipient
undo, exact-person/file consent races, combined-only negotiation, missing-mode
contextual help, explicit Open/no adoption and promoted-buffer safety. Transport
tests include deterministic preflight/total deadlines and stubborn work across
reset; shared queued direct-notification tests preserve other-client events while
revoking sender/excerpt at release. Fresh copied-project acceptance follows.

No installed configuration, dependency, OAuth/grant, meeting owner, checkout
bundle, HEAD or staging changes are authorized or made by this slice. No live
Webex/echo/file/tenant acceptance, multiple files or full MF01–MF26 completion
is claimed.

### MF15 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf15-gate-9/`
freezes **427** sources; every recorded gate status is zero:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **946 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **153 pass / zero skips** |
| Private drawn PTYs | **133 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging and diff check | Pass |

Counts overlap; do not sum them as independent cases. This accepts the recorded
MF15 offline recipient Markdown, one staged file with optional plain caption,
and Markdown-plus-one-file workflow through the existing owners. Post-ACK room
verification failures remain unknown; no mutation replay, inferred peer identity,
file drop, draft adoption or live service acceptance is implied.
Multiple files, secure persistent drafts, provider-gated actions and the rest
of MP4/MF01–MF26 remain incomplete.

`mf15-old-client-checks/` separately passes four frozen-old-native hello
compatibility assertions in each editor, without enabling the new modes.
`mf15-finalization.json` records actual integrated counts, reruns documentation
checks after acceptance edits, and verifies a Markdown-only post-gate delta.
Runtime/test/native-help inputs, all ten checkout bundle/map hashes, HEAD and
empty staging remain unchanged. The 32-capability ceiling is unchanged; the
new formats use independent finite assertions. No installed configuration,
activation, live Webex/OAuth/receipt/device test, dependency, commit or push
occurred. `full_plan_complete` remains **false**.

## MF10 provider validation boundary

`mf10-provider-baseline.json` / `mf10-provider-before/` preserve **427**
MF15-accepted sources, ten checkout bundles/maps, HEAD and empty staging.
The [MF10 review](messaging-public-provider-audit.md#mf10-server-indexed-search-provider-gate)
does **not** approve an implementation: six reviewed Messages v1 operations
expose room history, not indexed keyword/cross-space search. The exact List
Messages parameters are required roomId plus parentId/mentionedPeople/before/
beforeMessage/max; its ordering/Link paging and membership/messages_read scope
do not establish search matching, index coverage or query-bound cursors.

Official Messaging MCP and Suite MCP overviews are retained separately. The
Suite description advertises cross-space search but supplies no validated
versioned index/query/result/paging/permission contract. The session's connected
tool metadata explicitly describes client-side filtering over required-room
history, automatic pagination/429 retries, a post-filter max and ineffective
after/hasFiles filters. Its equivalence to those hosted servers is unproven.
No search tool or service operation was invoked, no auth/MCP/grant expansion
occurred, and no internal-interface/meeting/credential owner is borrowed.

`mf10-public-evidence.json`, `mf10-catalog-evidence.json` and
`mf10-installed-evidence.json` retain only selected official schema/guide fields,
session tool metadata and bounded installed public SDK source. None proves
universal provider absence or live service acceptance. No full page/auth/CSRF
state, credentials or user message data is retained.

Expected-failing **feature** tests are deferred: no supported contract exists
to test yet. Adding invented RPC/response/cursor semantics would bypass Gate P.
Diagnostic boundary probes and existing query/native regressions instead verify
that unapproved keywords/search RPCs are rejected and `/` stays loaded-only.
These are nonactivation evidence, **not MF10 implementation acceptance**.
The needed input is a supported versioned indexed-search provider/query/paging/
permission contract (and any required explicit provider-risk decision), not
credentials or a live probe. A local scan would be a separately scoped feature,
not a substitute MF10 completion claim.

`mf10-provider-research/public-evidence.log` passes extraction of six v1
operation schemas, exact room-required history parameters, permission/pagination
evidence and both official MCP overview candidates. Four offline diagnostic
probes pass: schema boundary, session tool semantics, unapproved RPC/extra-field
refusal and hostile query-bearing continuation rejection without following it.
`mf10-provider-checks/` retains the first external native fixture's failure:
it tried to annotate history without explicitly making the native buffer
modifiable. The fixture now makes that local annotation choice explicitly;
runtime history/editing rules are unchanged.

`mf10-provider-checks-2/` passes **four diagnostic probes, 27 existing backend,
eight existing native, eight documentation checks and TypeScript**, all zero
skips. Separate actual Vim/Neovim diagnostic runs both pass: `/` finds a loaded
annotation, preserves message/space state and draft text/full undo, and does
not expose an unapproved search command. These passing absence/loaded-boundary
checks are **not** passing indexed-search feature evidence.

`mf10-provider-finalization.json` verifies exactly three Markdown-file edits,
unchanged runtime/test/native-help inputs and all ten checkout bundle/map hashes,
HEAD and empty staging. It reruns documentation checks. No new build/integrated
gate, MF10 contract approval/runtime acceptance or full-plan completion is
claimed. The previous MF15 gate remains acceptance of its frozen runtime only.

## MF23 rename contract and expected-red boundary

`mf23-rename-baseline.json` / `mf23-rename-before/` preserve **427** preceding
sources, ten checkout bundle/map hashes, HEAD and empty staging. The
[dated rename contract](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract)
approves **offline implementation/tests only** for title-only rename of the
selected standalone group space. Four official v1 schemas and three help-policy
sources validate title-only JSON, self/room/membership/moderator checks and
General-space restrictions; all Team/direct spaces are excluded rather than
guessing General from a label. Tenant restrictions and the residual GET→PUT
race remain explicit. MF10 remains independently gated.

`mf23-rename-research/wire.log` passes one existing-PublicREST PUT into a memory
sink: exact UTF-8 `{title}`/Content-Length, **zero socket connections / service
writes**. Selected schemas/policy excerpts are retained, not page auth/CSRF state.
This encoding/research evidence is not live permission/title-only/ACK acceptance.
No SDK mutation, scope/configuration change, alternate sender or meeting owner.

The contract reuses existing conversation admission/256-entry ledger/uncertainty,
PublicREST physical limits, exact selected-room identity and canonical title
limits. At most three fresh GETs then one title-only PUT within 20 seconds,
without paging/retry. Preflight title mismatch is conflict; post-admission
ambiguity is unknown. Rename recovery binds exact original request evidence.
The 32 capabilities/ceiling remain unchanged; an independent finite hello
`spaceActions:["rename-v1"]` enables a named-only `WebexRenameSpace` catalogue
action without taking `Wnr` from Remove Member. No runtime/helper/help feature
implementation is claimed at this boundary.

`test/space-rename.test.ts` specifies finite RPC/recovery, exact preflight and
body, standalone/role/Team/direct/conflict/grant/ACK/unknown/replay/deadline
guards and actual engine title-only composition. Existing native/drawn runners
register `space-rename.vim` and `space-rename-boundaries.vim` for default-Cancel
consent, literal titles, finite negotiation, prompt races, source ownership,
draft/full undo/focus/maps and no-message side effects. Assertions beyond
missing methods/command/negotiation are future green evidence, not exercised
feature proof from an early expected failure. No previous integrated gate accepts
these new tests.

`mf23-rename-red/` retains **21/21 backend failures and four native failures**,
zero skips/cancellations. Backend failures identify unrecognized rename/recovery
RPC and absent existing-owner/engine extensions; native failures identify the
missing named command and finite hello/support guards. Later permission/ACK/
deadline/undo assertions remain to be exercised by implementation; these expected
failures are not renamed “passes” or live/provider acceptance.

`mf23-rename-guards/` passes **91 existing backend, 12 existing native, eight
documentation checks and TypeScript**, all zero skips. At that contract-first
boundary these regressions did not turn default suites green: rename tests
intentionally failed before the existing owners were extended.
`mf23-rename-contract-finalization.json` checks the exact documentation/test-only
delta, unchanged runtime/native help, ten checkout bundles, HEAD and empty
staging, and reruns documentation checks. No new build/integrated/runtime gate,
live service/grant/tenant/atomicity acceptance or full-plan completion is claimed.

## MF23 standalone rename runtime slice

`mf23-rename-runtime-baseline.json` / `mf23-rename-runtime-before/` freeze the
**430-source** contract/red-test state before runtime edits. The research/red/
guard finalizer remains historical; it does not accept newer runtime inputs.

The existing conversation owner now implements finite title-only rename under
the reviewed contract: reserve shared ledger/admission, require existing known
grants, fresh self/standalone-room/own membership and moderator proof if locked,
maximum three GETs then one `{title}` PUT in the existing 20-second total budget.
No provider/grant/SDK/meeting expansion, full Room writeback, automatic retry,
post-PUT read or generic settings tunnel. Only raw exact ID/type/title ACK can
publish. Preflight title mismatch is conflict; post-admission ambiguity stays
unknown with original request evidence. The shared uncertainty owner now keeps
request identity for evidence-bound rename resolution; older action shapes
remain compatible and no result eviction/replay is added.

The engine/store publish only the confirmed title, retaining activity/order,
flags, messages, unread, receipt endpoints, notifications and draft destinations.
Old retained ACK replay cannot roll back a later title. A fence exists only for
the already-in-flight room-list call, not subsequent fresh remote observations.
Existing opt-in space-cache persistence retains its prior observation age and
unread evidence. No durable draft store or identity is derived from localContext.

Vim/Neovim negotiate independent finite `spaceActions:["rename-v1"]` under
the unchanged 32-capability ceiling. Named-only `:WebexRenameSpace [title]`
shares the single catalogue and conversation consent/recovery owner; `Wnr`
remains Remove Member. Default-Cancel consent shows ID/old/new title and the
residual non-atomic race. Snapshot guards check ownership, selection/session/
window/tick, exact selected title, draft/format/root/file/destination. No Ex
execution of titles, focus stealing, draft adoption, undo rewrite or annotation/
promotion loss. Rename resolution alone carries the original unknown request;
failed/older/old-session ACKs cannot clear newer uncertainty.

`mf23-focused-1/` passes **112 affected backend, 16 native, four drawn, eight
docs checks and TypeScript**, zero skips. This is the first exercised green
contract boundary, not a retrofit of the earlier expected-red results.
`mf23-focused-2/` adds physical engine/PublicREST wire/status/ACK/grant/selection/
reset, replay-title and delayed-room-list coverage: **153 backend/TypeScript/docs
pass**, 14/16 native and two of four drawn pass. The new native title/session
race fixture submitted stale synthetic revisions, correctly ignored by the
existing revision guard; its artificial revisions now advance explicitly.
No runtime revision guard was weakened. `mf23-focused-3/` passes **157 backend,
16 native, four drawn/eight docs checks**; TypeScript found one newly added
synthetic read-status observation missing required `lastSeen`, now supplied.
Final focused/integrated verification follows after delivered-help updates.
`mf23-focused-4/` and `mf23-focused-5/` each pass **158 affected backend, 16
native, four drawn, eight documentation checks and TypeScript**, zero skips.
The final run includes literal Ex-looking titles through the named command
without executing them, unchanged colorscheme styling, annotated history and
reply-root/Markdown/file preservation with full native undo. The optional
existing space-cache test verifies title-only persistence without age/unread
renewal. `mf23-old-client-checks/` separately passes five frozen-old-native
compatibility assertions per editor; ignoring the new hello field does not
enable rename. Ten checkout bundles, HEAD/staging and 32 capabilities remain
unchanged. A fresh copied-project integrated gate follows.

`mf23-gate-10/` is retained **NOT accepted**: 431 frozen sources, TypeScript/
five copied builds and **1013 core passes / 14 deliberate skips** are green,
but native is **155 pass / two fail** and drawn is **135 pass / two fail**.
Both failures are the existing card-text fixture in each editor: its inert
isolated `wbx.vim` mock omitted the new `supports_space` helper during shared
catalogue construction (`E117`). The mock now explicitly reports no rename
support; its prohibition on any provider/action/receipt RPC is unchanged.
All supporting suites, both help generators and frozen-input/bundle/Git
integrity checks passed; none substitutes for a green native/drawn gate.

Independent source review also tightened rename's native source to require a
history/composer bound to the selected room, not merely any owned draft.
The added unrelated-owned-composer and destination-change guards pass.
`mf23-focused-6/` passes **158 backend, 18 native, six drawn, eight docs checks
and TypeScript**, zero skips, including both card and rename fixtures. A new
copied-project gate is required for these later runtime/test inputs.

`mf23-gate-11/` freezes the card/source corrections but predates a later
independent replay regression and is **not acceptance of the final inputs**.
The demo-only `mf23-create-replay-diagnostic/diagnostic.log` reproduced a real
metadata bug: create → confirmed rename → exact retained create-result replay
restored the original title. No mutation was replayed. The engine now returns
retained creation evidence without re-merging its stale Room metadata, just as
rename replays do not republish old titles. The added actual-demo regression
checks the entire selected-room and room-list metadata, not only the label.
`mf23-focused-7/` passes **159 backend, 18 native, six drawn, eight docs checks
and TypeScript**, zero skips. The final fresh copied-project gate below freezes
the creation-replay correction; earlier gates are not retroactively promoted.

Transport fixtures use inert loopback-only request injection and no live
service/OAuth/SDK/grant operation. An initial local fixture incorrectly expected
read-status callbacks without the existing synthetic `spark:all` prerequisite;
it now explicitly grants that mock scope, with missing-grant tests separate.
No production grant gate was expanded. Additional tests preserve 256-entry
saturation/replay evidence, logical deadline and stubborn physical settlement
across reset, exact rename recovery, native reply/file work, annotations, full
undo, opt-outs and finite old/new negotiation.

Only this bounded MF23 subset is implemented. MF10 stays NO-GO; all other
unaccepted operations/settings and full MF01–MF26 completion remain unclaimed.
No installed configuration, checkout builds, live activation, dependency install,
meeting ownership/default, commit, push or Atlassian operation is part of this work.

### MF23 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-gate-12/`
freezes **431 sources**, including the creation-result replay regression.
Every recorded gate status is zero, with no checkout changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1014 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **157 pass / zero skips** |
| Private drawn PTYs | **137 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only the
recorded **selected standalone-group title-only rename** workflow under its
bounded public contract. Default-Cancel exact-ID/title consent, fresh grants/
self/member/moderator proof, title-only wire, conflict/unknown distinction,
physical settlement, evidence-bound recovery, replay and stale-list protection
are exercised offline. Native annotations/promotions, reply/root/format/file
destinations, full undo, colorschemes, focus and effective mappings are preserved.
`Wnr` is still Remove Member; rename remains named-only and Enter/write never send.

`mf23-gate-10/` remains a failed gate, not acceptance. `mf23-gate-11/` passes its
older frozen tests (**1013 core / 14 skips, 157 native, 137 drawn**) but predates
the reproduced creation-result replay bug/fix; its recorded checkout changes
include that later runtime/test delta. Only `mf23-gate-12/` accepts final inputs.
The contract-only/MF15 finalizers remain historical and are not reused.

`mf23-finalization.json` records actual gate counts, reruns documentation checks,
and verifies a **Markdown-only post-gate acceptance delta**, unchanged runtime/
tests/native help, all ten checkout bundle/map hashes, HEAD and empty staging.
The 32-capability count/ceiling, meeting defaults/ownership, existing known grants,
installed configuration and dependencies remain unchanged. No live Webex/OAuth/
receipt/device test, automatic reconnect/open/download, activation, commit,
push or Atlassian operation occurred.

This is not live title-only/tenant/policy/atomicity acceptance. The disclosed
GET→PUT race remains; Team/direct rename, other settings/moves/deletion and
unaccepted roadmap operations remain excluded/gated. MF10 stays **NO-GO**.
`full_plan_complete` remains **false**.

## MF23 description contract and expected-red boundary

`mf23-description-baseline.json` / `mf23-description-before/` preserve **431**
sources after rename finalization, all ten checkout bundle/map hashes, HEAD and
empty staging. The [separate description contract](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract)
is approved for **offline contract-first tests/subsequent implementation only**.
No accepted rename gate or finalizer is promoted to accept new runtime features.

Two fresh public Room v1 schemas document description reads/ACKs but still
require `title` on every PUT. Description-only JSON is not approved. The bounded
wire body must echo the exact checked title with the new description, disclosing
both description lost-update and title-overwrite races. No atomicity guarantee,
general settings map, compliance bypass or title-omission guess. Reuse hash-linked
same-date self/membership schemas and three existing role/policy sources.
Only explicitly present bounded preimages may be edited; missing/null is unknown,
not empty. Nonblank replacement only: clear and its single-space sentinel remain
excluded, as do direct/Team/General/cached/revoked/read-only targets.

`mf23-description-public-evidence.json` retains selected schema fields, not
page authentication/CSRF state. `mf23-description-research/wire.log` passes two
existing-PublicREST memory-sink cases, with exact UTF-8/newline/escaping/
Content-Length and only `{title,description}`: maximum 2052 request bytes,
**two native PUT-shaped calls / zero connections or service writes**.
This is not tenant, title-preservation, role or live ACK acceptance.

The proposed read preparation and explicit submit both reuse existing
conversation/engine/native owners, fresh self/room/own membership and moderator
proof if locked; three GETs maximum per explicit step and one PUT only on
Submit, 20 seconds per step and unchanged physical/IPC bounds. The 256-action
ledger is shared; rename/description uncertainty must interlock per room because
description PUTs echo the title. Original-request/room recovery never retries.
No description/body/provider object is installed in main room/history/cache/
unread/notification/receipt state. Preparation belongs in a separate bounded
ephemeral native edit view; no backend draft store or authenticated identity is
inferred from localContext.

Negotiation uses independent optional `spaceDescriptions:["replace-v1"]`, not
a new value in the old strict rename singleton. This preserves rename clients
and the 32-capability ceiling. Named-only Describe/Submit/Cancel commands reuse
the single catalogue without taking existing keys or making Enter/write send.
The planned native view preserves raw text/full undo, normal/reply/recipient/file
draft separation, source ownership/selection/session/window/age/tick fences and
explicit default-Cancel risk consent. No user-facing help/runtime implementation
is made at this boundary.

`test/space-description.test.ts` specifies finite preparation/write/recovery,
raw presence/empty/clear/limits, exact two-field wire, fresh permissions, both
preimage conflicts, ACK/refusal/unknown/replay/deadline/physical-settlement/
cross-action recovery and engine nonpublication boundaries. Both native/drawn
runners register `space-description.vim` and `space-description-boundaries.vim`
for independent finite negotiation, named commands, native editing/undo,
default-Cancel and submit source-race protections. Early failures on absent
methods/commands do not execute or prove all later assertions.

`mf23-description-red/` retains **26/26 backend failures and four native
failures**, zero skips/cancellations. Failures identify unknown finite RPCs,
absent existing-owner/engine extensions, the missing named action/support
helper and ignored malformed new handshake shapes. These are expected-red
assertions, not passing permission/ACK/deadline/native-editing feature evidence.
At that boundary they were registered in normal runners, which were **not all
green** before implementation. No old integrated gate accepts later inputs.

Separately, `mf23-description-guards/` passes **159 existing backend, 18
existing native, eight documentation checks and TypeScript**, all zero skips.
`mf23-description-old-client-checks/` passes five frozen rename-era hello/
outcome/ceiling assertions in **each** editor, without enabling descriptions.
It also confirms why extending the old strict `spaceActions` list would break
compatibility. Those checks are not new-feature acceptance.

`mf23-description-contract-finalization.json` verifies the exact documentation/
test-only delta, unchanged runtime/native help, all ten checkout bundle/map
hashes, HEAD and empty staging, and reruns documentation checks. No build/new
integrated runtime gate, live Webex/OAuth/grant/receipt/device/tenant probe,
installed configuration/dependency change, commit/push or Atlassian operation
was performed at that frozen boundary. Description runtime/acceptance and
full-plan completion were **false** there; its finalizer remains historical,
not acceptance of the subsequent runtime below. MF10 stays gated.

## MF23 description replacement runtime slice

`mf23-description-runtime-baseline.json` / `mf23-description-runtime-before/`
freeze the **434-source** contract/test-only state. Runtime now implements
bounded nonblank replacement through the existing ConversationActions,
EditorEngine, finite protocol/worker, PublicREST and native conversations owner.
No sender/transport/settings store, grant flow, capability expansion or generic
RPC/URL/body tunnel is added. Independent `spaceDescriptions:["replace-v1"]`
preserves rename's strict `spaceActions:["rename-v1"]` and the 32-entry ceiling.

Preparation freshly checks existing known grants, self, exact standalone Room,
own membership/moderator; submit repeats proof, compares exact old title and
description, then sends one `{title:expectedTitle,description}` PUT. Explicit
empty preimages may be replaced, missing/null/unsafe/oversize ones cannot.
New text is nonblank/changed, LF-only, ≤1000 UTF-16 units / 4000 UTF-8 bytes,
no clearing/sentinel, controls, truncation or normalization. Direct/Team/General/
cached/revoked/read-only rooms refuse. Each step has 20 seconds total / at most
three GETs, with one PUT only on submit and no post-PUT verification/read/replay.
Logical read/write deadlines retain unsettled physical admission across reset.

Preimage mismatch is conflict, zero PUTs; exact raw ID/group/title/description
ACK is required for success. Post-admission ambiguity remains unknown with full
bounded intent. Rename and description uncertainty interlock per room under the
shared 256-action ledger; resolution validates original unknown request/room and
physical idle state. Old or old-session ACKs cannot clear newer uncertainty.
Descriptions/results and echoed titles never publish into main room/history/
disk cache/unread/notification/receipt state, including retained-result replay.
The synthetic provider keeps descriptions separately from main room metadata.

Native named-only `:WebexDescribeSpace`, `:WebexDescriptionSubmit` and
`:WebexDescriptionCancel` share the catalogue without changing Wa/Wu/Wn/Wv/Wm.
Preparation opens a separate plain nofile/noswapfile/noundofile/nomodeline buffer.
Private registry ownership binds the snapshot, not mutable buffer variables
alone. Eight active buffers / 120-second freshness are enforced. Source ownership,
draft/format/root/file, session/selection epoch, window/tick and post-consent age
fences prevent stale edits/late focus stealing. Default-Cancel consent explicitly
discloses description lost-update AND concurrent-title overwrite risk: public
PUT requires title, not atomic field isolation. Cancel/completion/conflict/
expiry/promotion retains text/full undo; fresh preparation comes from selected
history/list/composer. Cancel cannot prove an admitted write unsent or clear an
unknown. Enter/write and message Send/EditSubmit/Attach/Format never submit it.

`mf23-description-focused-1/` passes **185 backend, eight docs checks and
TypeScript**; native is 20 pass / two fail and drawn eight pass / two fail.
The new workflow reached a fixture-only `E121` in its wait expression, which
referenced `normal` outside its scope. It now embeds the buffer number instead;
no assertion or runtime scope guard was weakened.
`mf23-description-focused-2/` and `mf23-description-focused-3/` each pass
**218 affected backend, 22 native, ten drawn, eight docs checks and TypeScript**,
zero skips/cancellations. The latest includes actual PublicREST two-field UTF-8
wire/status/ACK/overflow, grant loss at each step, selection/session invalidation,
shared saturation/replay/interlock/recovery, logical deadlines/stubborn physical
settlement across reset, late read-source races, virtual 120-second expiry,
eight-buffer admission, native recovery, undo, colorschemes and mapping opt-outs.
Counts overlap; do not sum them as independent cases.

`mf23-description-focused-4/` repeats that same green **218 backend / 22 native /
ten drawn / eight docs / TypeScript**, zero skips/cancellations, after delivered
help/protocol/workflow documentation updates.

Delivered help describes the workflow and exclusions. The fresh copied-project
integrated gate below accepts these inputs, not live behavior. Prior contract-only/
rename finalizers accept only their frozen inputs.
No checkout build, installed configuration/dependency change, live Webex/OAuth/
receipt/device operation, reconnect, meeting-ownership/default change, commit,
push or Atlassian work occurs. MF10 stays NO-GO and full parity is incomplete.

### MF23 description integrated acceptance

**PASS — offline only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-description-gate-13/` freezes
**435 sources**, including delivered native help and the new physical
description-transport tests. Every recorded gate status is zero, with no
checkout changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1073 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **161 pass / zero skips** |
| Private drawn PTYs | **141 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only
**selected standalone-group nonblank description replacement** under the
reviewed public contract, alongside the previously accepted rename slice.
Preparation and submit reuse existing owners and fresh known grants/self/room/
membership/moderator proof, with independent negotiation. Raw exact ACK and
both preimage checks, two-field wire, refusal/unknown distinction, shared
rename/description uncertainty, original-request recovery, no replay/eviction
and physical settlement across deadlines/reset are exercised offline.
Descriptions and echoed titles never publish into main room/history/cache/
unread/notification/receipt state. Native private preparation, eight-buffer/
120-second bounds, source/consent races, cancellation, text/full undo,
colorschemes, focus, draft/file separation and mapping opt-outs are covered.
Describe/Submit/Cancel remain named-only; `Wnr` still removes a member and
Enter/write never send or submit metadata.

`mf23-description-red/` and the contract-only finalizer retain their historical
26 backend / four native expected failures; they are not current feature status.
`mf23-description-focused-1/` retains the fixture scope failures, not a green
gate. The corrected focused runs and final gate do not overwrite that evidence.
The older rename/contract gates are not retroactively promoted to accept this
runtime. Only gate 13 accepts these final description inputs.

`mf23-description-runtime-finalization.json` verifies **two Markdown-only
post-gate acceptance edits**, unchanged runtime/tests/native help, all ten
checkout bundle/map hashes, HEAD and empty staging, and reruns documentation
checks. The 32-capability count/ceiling and strict rename singleton remain
unchanged; frozen-old-native compatibility remains evidence of ignored additive
negotiation, not description enablement in old clients. No installed
configuration/dependency change, checkout build, live Webex/OAuth/grant/receipt/
device probe, reconnect, activation, commit/push or Atlassian work occurred.
Meeting ownership/defaults, initial transmission-off and detach behavior are
unchanged.

The public PUT still requires `{title:expectedTitle,description}`: the disclosed
description lost-update **and concurrent-title overwrite** races remain.
This is not atomic CAS, title-isolated description-only wire, live title-echo/
tenant/policy acceptance, clearing or full MF23 settings parity. Missing/null
preimages are not inferred empty. Team/direct/General settings, clearing,
move/delete and all other unaccepted roadmap operations remain excluded/gated.
MF10 stays **NO-GO**; `full_plan_complete` remains **false**.

## MF23 lock/unlock contract and expected-red boundary

`mf23-lock-baseline.json` / `mf23-lock-before/` freeze **435** preceding sources
after description-runtime finalization, ten checkout bundle/map hashes, HEAD
and empty staging. The [lock/unlock contract](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract)
is approved for **offline contract-first tests/subsequent implementation only**.
Gate 13 accepts delivered description/earlier subsets, not this later work.

Two fresh Room v1 schemas expose boolean `isLocked` but require title on PUT.
Five fresh official policy sources plus hash-linked self/membership evidence
support a deliberately restricted slice: **lock only when fresh authenticated
self equals raw creatorId and has explicit nonmoderator own membership; unlock
only with explicit fresh own moderator proof**. The creator restriction avoids
assuming the updater rather than original creator receives the documented
promotion. Creator identity never substitutes for membership or unlock authority.
Public/announcement modes must be explicitly false; missing does not mean false.
Direct/Team/General/cached/revoked/read-only spaces refuse, with no privatize/
announcement-clear/member-role/grant fallback or account/tenant/Free-plan bypass.

Only `{title:expectedTitle,isLocked:locked}` is approved. Default-Cancel consent
must disclose creator promotion/restricted management on lock, shared-management
consequences on unlock, the mandatory title echo and residual title/moderation/
role races. No atomic CAS or assumption about all moderator memberships after
unlock. No full Room/lock/title/cache/roster/history/unread/notification/receipt
publication from an ACK; fresh permission is checked at every later action.

`mf23-lock-public-evidence.json` retains selected schemas and policy excerpts,
not page auth/CSRF state. `mf23-lock-research/wire.log` passes two existing
PublicREST memory-sink cases (`true`/`false`): exact UTF-8/Content-Length,
only `title,isLocked`, maximum **349 bytes**, **zero connections/service writes**.
This is not live unlock/promotion/role-preservation/policy acceptance.

Proposed finite `rooms.lock` and original-evidence `conversations.resolve`
reuse ConversationActions/EditorEngine/PublicREST/native conversations and the
256-action ledger. Three GETs maximum then one PUT in 20 seconds, unchanged
physical/IPC/byte bounds; no extra mutation, post-PUT read, replay or queue.
Rename/describe/lock uncertainty must interlock per room, including description
preparation. Independent `spaceLocks:["lock-unlock-v1"]` preserves both old
strict singletons and the 32-capability ceiling. Named-only Lock/Unlock reuse
the single catalogue, explicit preconditions (not a toggle or inferred cached
flag) and native source/consent guards without changing keys or draft ownership.

`test/space-lock.test.ts` adds finite RPC/recovery, exact title/flag wire,
creator/moderator/private-mode/role-presence guards, precondition conflicts,
refusal/ACK/unknown/interlock/ledger/deadline/physical-settlement/nonpublication
and actual-demo engine assertions. The normal native/drawn runners register
`space-lock.vim` / `space-lock-boundaries.vim`: named actions, independent strict
negotiation, source/consent races, annotations, replies/files, full undo,
colorschemes and mapping opt-outs. Missing-method/command failures before later
assertions do not prove those later protections. Runtime/help remain unchanged;
no lock/unlock feature is exposed at this boundary.

`mf23-lock-red/` retains **32/32 backend expected failures and four native
expected failures**, zero skips/cancellations. They identify unknown finite
RPC/recovery shapes, absent existing-owner/engine methods, missing named actions/
support helper and ignored malformed new negotiation shapes. Early failures do
not execute the full permission/ACK/deadline/native-preservation assertions.
At that boundary normal runners included these cases and were intentionally
**not all green**; no previous integrated gate accepts subsequent inputs.

Separately, `mf23-lock-guards/` passes **218 existing backend, 22 existing native,
eight docs checks and TypeScript**, all zero skips. The frozen
`mf23-lock-old-client-checks/` passes **six compatibility assertions per editor**:
the additive sibling is ignored without enabling lock/unlock, both old strict
singletons remain strict and the capability ceiling stays 32. Those are
regression/compatibility checks, not moderation feature acceptance.

`mf23-lock-contract-finalization.json` verifies the exact **documentation/test-only
delta**, unchanged runtime/delivered native help and all existing accepted cases,
ten checkout bundle/map hashes, HEAD/empty staging and fresh documentation checks.
No new copied build/integrated runtime gate, live Webex/OAuth/grant/receipt/device/
tenant probe, installed configuration/dependency change, automatic reconnect,
meeting-ownership/default change, commit/push or Atlassian work occurs.
Lock/unlock runtime/acceptance was **false** at that frozen boundary; gate 13's delivered subsets
remain accepted only for their frozen inputs, MF10 stays **NO-GO** and
`full_plan_complete` remains **false**.

## MF23 lock/unlock runtime slice

`mf23-lock-runtime-baseline.json` / `mf23-lock-runtime-before/` freeze the
**438-source** contract/test state before runtime edits. The existing
ConversationActions, EditorEngine, finite protocol/worker, PublicREST and native
conversation owner now implement the reviewed moderation transition.
`spaceLocks:["lock-unlock-v1"]` is independent of rename/description negotiation;
both old strict singletons and the 32-capability count/ceiling are unchanged.
No generic settings tunnel, sender, grant flow or role writer is added.

Fresh self, exact standalone Room, explicit private/nonannouncement flags,
known existing grants and exact own membership precede the sole two-field PUT.
Lock requires raw creator==self plus explicit nonmoderator membership; unlock
requires explicit moderator proof. The existing membership verifier's new
strict-role option is opt-in, preserving legacy missing-role behavior.
Title/lock precondition mismatch is conflict with zero PUTs; exact raw
ID/group/title/lock/private/nonannouncement ACK is required for success.
No-op/coerced booleans, missing critical flags, Team/direct/cached/revoked/
read-only targets and membership/announcement/public conversion fallbacks refuse.
Three GETs maximum, one `{title:expectedTitle,isLocked:locked}` PUT, 20 seconds
total; no post-PUT GET, paging/retry/redirect/auth replay/queue. Physical work
retains admission through logical deadline/reset until actual settlement.

Rename/describe/lock share the 256-action ledger and per-room uncertainty
interlock, including description preparation. Recovery validates exact original
unknown room/request and physical idle; old/old-session resolution or admitted
action ACKs cannot clear newer uncertainty. Results never publish main room/
title/lock/cache/roster/role/history/unread/notification/receipt state, including
replay. The synthetic demo's separate moderation/creator and role model is
deliberate fixture behavior, not a claim about live post-unlock memberships.

Named-only `:WebexLockSpace` / `:WebexUnlockSpace` share the catalogue and
default-Cancel consent owner, without repurposing Wa/Wu/Wn/Wv/Wm or Wnr.
Consent shows exact ID/title and explicit preconditions, creator promotion/
restricted shared management on lock, broader shared management on unlock,
mandatory title echo and residual title/moderation/role races. Full native
source/draft/destination/root/format/file/session/selection/window/tick checks
run after prompts. Text/full undo, annotations/promotions, reply files,
colorschemes, mappings and focus survive; Enter/write never lock/unlock.

`mf23-lock-focused-1/` passes **257 backend, 26 native, 14 drawn, eight docs
checks and TypeScript**, zero skips/cancellations. `mf23-lock-focused-2/`
passes **298 backend, 26 native, 14 drawn, eight docs and TypeScript**, zero
skips/cancellations, after adding physical loopback-only engine/PublicREST
lock/unlock wire, raw ACK/status/overflow, grant loss, selection/session
invalidation, bounded retention/stubborn settlement and native cross-action/
original-request/late-resolution/old-action-ACK recovery coverage.
The existing verifier's default-versus-strict role compatibility is separately
exercised. Counts overlap; do not sum suites as independent cases.

`mf23-lock-focused-3/` repeats the same **298 backend / 26 native / 14 drawn /
eight docs / TypeScript** green boundary, zero skips/cancellations, after
delivered help/protocol/workflow documentation updates.

Delivered help/protocol/workflow docs are updated. The fresh copied-project
gate below accepts these inputs offline; this does not imply live
unlock/promotion/role/title-echo/tenant acceptance or full settings parity.
Historical contract/description/rename finalizers accept only their frozen
inputs. No checkout build, installed configuration/dependency change, live
Webex/OAuth/receipt/device operation, reconnect, meeting ownership/default
change, commit/push or Atlassian work occurs. MF10 stays NO-GO and
`full_plan_complete` remains false.

### MF23 lock/unlock integrated acceptance

**PASS — offline only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-lock-gate-14/` freezes **439
sources**, including delivered native help and the new physical lock/unlock
transport tests. Every gate status is zero, with no checkout changes during
verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1146 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **165 pass / zero skips** |
| Private drawn PTYs | **145 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only
the reviewed **private standalone moderation transition**: creator-self-only
locking with explicit nonmoderator membership, or unlocking with explicit fresh
space-moderator proof. Exact title/lock preconditions, explicit private/
nonannouncement flags, known grants, raw ACK/refusal/unknown behavior and
two-field wire are exercised offline. Opt-in strict-role validation retains
the existing verifier's default compatibility. No membership write, inferred
post-unlock role, optimistic main flag/title/role/cache publication, extra
mutation or post-PUT read is introduced.

The shared rename/description/lock interlock, original-request evidence,
saturation/replay protection, logical/physical deadlines and settlement across
reset are covered. Both editors exercise default-Cancel/source-race consent,
annotated/promoted work, replies/files, full undo, colorschemes, focus, key
opt-outs and cross-action/late-resolution/old-admitted-ACK recovery.
Lock/Unlock stay named-only, `Wnr` remains Remove Member and Enter/write never
change moderation. The demo's explicit synthetic role transitions are not
evidence of live post-unlock membership semantics.

`mf23-lock-red/` retains its historical **32 backend / four native expected
failures**; these are not current feature status. Contract-only/description/
rename gates and finalizers remain historical, scoped to their frozen inputs.
Only gate 14 accepts these final lock/unlock runtime/test/help inputs.

`mf23-lock-runtime-finalization.json` verifies **two Markdown-only post-gate
acceptance edits**, unchanged runtime/tests/native help, all ten checkout
bundle/map hashes, HEAD/empty staging and fresh documentation checks.
The 32-capability count/ceiling and both old strict singletons are unchanged.
Frozen-old-native compatibility means ignored additive negotiation, not enabling
moderation in old clients. No installed configuration/dependency change,
checkout build, live Webex/OAuth/grant/receipt/device/tenant probe, automatic
reconnect, activation, commit/push or Atlassian work occurred. Independent
meeting ownership, initial transmission-off, inherited tmux styling and
detach-by-default remain unchanged.

Mandatory title echo can still overwrite a concurrent rename; moderation/role
changes can race. This is not CAS, live promotion/unlock/role/title-echo/policy
acceptance, public/announcement/Team/direct/general role management or full
MF23 parity. Clearing/move/delete and every other unaccepted roadmap operation
remain excluded/gated. MF10 stays **NO-GO**; `full_plan_complete` remains **false**.

## MF23 announcement contract and expected-red boundary

`mf23-announcement-baseline.json` / `mf23-announcement-before/` freeze **439**
preceding sources after lock/unlock finalization, ten checkout bundle/map
hashes, HEAD and empty staging. The [announcement-mode contract](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract)
is approved for **offline contract-first tests/subsequent implementation only**.
Gate 14/finalizers accept the earlier delivered subsets, not later inputs.

Two fresh Room v1 schemas document boolean enable/disable but still require
title on PUT. Two fresh official policy sources plus hash-linked three
role/moderation/General sources and self/membership schemas support a bounded
slice: **already locked, explicitly private standalone groups; fresh own
moderator proof in both directions**. No implicit lock/private conversion,
creator/Team-role inference, membership write, grant expansion or tenant bypass.
Missing flags are unavailable, not false. The only body is
`{title:expectedTitle,isAnnouncementOnly:announcementOnly}`, not a generic map.

Product help explicitly says enabling notifies others and permits moderators,
bots and integrations to post; nonposting participants can still read, view
files and join meetings. Default-Cancel consent must disclose those effects,
broader posting on disable subject to remaining policy, mandatory title echo
and concurrent title/lock/mode/role races. Do not claim silence, “only moderators
can post,” read isolation or meeting restrictions. No fake local notification/
system message, delivery, plugin-send exclusion or same-account alert suppression.

`mf23-announcement-public-evidence.json` retains selected schemas/policy excerpts,
not page auth/CSRF/script state. `mf23-announcement-research/wire.log` passes
two current-PublicREST memory-sink cases (true/false): exact UTF-8/Content-Length,
only `title,isAnnouncementOnly`, maximum **359 bytes**, **zero connections/service
writes**. This is not live mode/role/title-echo/notification/tenant acceptance.

Proposed `rooms.announcement` / `conversations.resolve` shapes reuse the existing
ConversationActions, EditorEngine, native conversation and physical PublicREST
owners. Three GETs maximum then one PUT in 20 seconds, unchanged existing byte/
IPC/physical bounds; exact raw ACK and precondition/permission checks, no
post-PUT read/retry/rollback/queue. Extend per-room uncertainty across
rename/describe/lock/announcement, including description preparation. Recovery
uses exact original unknown evidence and physical idle, never replay.
No main room/title/mode/lock/cache/roster/role/history/unread/notification/receipt
publication is approved. Independent `spaceAnnouncements:["enable-disable-v1"]`
preserves existing strict singletons and the 32-capability ceiling.

Named-only `:WebexAnnouncementOn` / `:WebexAnnouncementOff` specify explicit
preconditions, not a toggle or inference from missing loaded flags. They must
share the catalogue/consent/recovery owner, preserve Wa/Wu/Wn/Wv/Wm and all native
work, and recheck exact source/draft/root/format/file/session/selection/window/
tick/ownership after prompts. Enter/write/Send never change the mode.

`test/space-announcement.test.ts` adds finite RPC/recovery, exact wire,
moderator/locked/private/flag-presence/roster/precondition/grant checks,
ACK/refusal/unknown/interlock/ledger/deadline/physical-settlement/nonpublication
and actual-demo assertions. Both normal native/drawn runners register
`space-announcement.vim` / `space-announcement-boundaries.vim` for named actions,
independent strict negotiation, explicit posting/notification/race consent,
source races, annotations/promotions, reply files, full undo/colorschemes/focus
and mapping opt-outs. Early missing-method/command failures do not execute or
prove all later assertions. Runtime/delivered help remained unchanged there.

`mf23-announcement-red/` retains **32/32 backend and four native expected
failures**, zero skips/cancellations. Failures identify unknown finite RPC/
recovery shapes, absent existing-owner/engine methods, missing named commands/
support helper and ignored malformed new assertion shapes. These are red
specifications, not passing permission/ACK/native-preservation feature evidence.
At that boundary normal runners included these cases and were **not all green**.
No previous integrated gate accepts subsequent implementation inputs.

Separately, `mf23-announcement-guards/` passes **298 existing backend, 26
existing native, eight docs checks and TypeScript**, all zero skips.
`mf23-announcement-old-client-checks/` passes **seven frozen compatibility
assertions per editor**: the new sibling is ignored without enabling mode
changes, all three old strict singletons remain strict and the ceiling stays 32.
These are regressions/compatibility evidence, not new-feature acceptance.

`mf23-announcement-contract-finalization.json` verifies the exact documentation/
test-only delta, unchanged runtime/delivered help and existing accepted cases,
all ten checkout bundle/map hashes, HEAD/empty staging and fresh documentation
checks. No new copied build/integrated runtime gate, live Webex/OAuth/grant/
receipt/device/tenant probe, installed configuration/dependency change,
automatic reconnect, meeting ownership/default change, commit/push or
Atlassian work occurred there. Announcement runtime/acceptance was **false**;
Gate 14 accepts only its frozen earlier inputs. MF10 stays **NO-GO** and
`full_plan_complete` remains **false**.

## MF23 announcement-mode runtime slice

`mf23-announcement-runtime-baseline.json` / `mf23-announcement-runtime-before/`
freeze the **442-source** contract/test boundary before runtime work. The
existing ConversationActions, EditorEngine, finite protocol/worker, PublicREST
and native conversation owner now implement explicit announcement On/Off.
Independent `spaceAnnouncements:["enable-disable-v1"]` preserves all three
older strict singletons, protocol version and the 32-capability count/ceiling.
No second writer/sender, grant flow, generic settings/RPC/URL/body tunnel or
new native draft/preparation store is added.

Both directions require known existing unexpired grants, fresh authenticated
self, exact already-locked/private standalone Room and explicit own moderator
membership via the existing strict verifier. Creator/cached/Team-role labels
are not permission. Missing/null/coerced critical flags refuse; title/mode
precondition mismatch is conflict, zero PUTs. Direct/Team/General/public/
unlocked/cached/revoked/read-only targets refuse without implicit lock,
private conversion, promotion or membership write. Three GETs maximum then
one `{title:expectedTitle,isAnnouncementOnly:announcementOnly}` PUT in
20 seconds total, with unchanged byte/IPC/physical limits. No post-PUT GET,
retry/redirect/auth replay/rollback/queue. Exact raw ID/group/title/locked/
private/mode ACK precedes success; post-admission ambiguity stays unknown.

Rename/describe/lock/announcement share the 256-action ledger and per-room
uncertainty interlock, including description preparation. Recovery binds exact
original unknown room/request and physical idle. Old/old-session resolution
or action ACKs cannot erase newer uncertainty. Logical deadlines/reset retain
physical GET/PUT admission until actual native settlement. Results/replay
publish no main room/title/lock/mode/cache/roster/role/history/activity/unread/
notification/receipt state, fake messages/alerts, delivery IDs or plugin-send
exclusions; same-account other-client alerts and previews are untouched.
The demo keeps a separate announcement map and changes neither roles nor lock
on On/Off, generating no synthetic message/notification.

Named-only `:WebexAnnouncementOn` / `:WebexAnnouncementOff` reuse the catalogue
and default-Cancel consent/recovery owner. No Wa/Wu/Wn/Wv/Wm or Wnr meanings
change. Consent shows exact ID/title/old-new mode, fresh already-locked/private/
moderator requirement, broader posting on disable subject to policy, and
**Webex participant notification on enable plus moderator/bot/integration
posting exceptions**. Others may still read/view files/join meetings.
Mandatory title echo and concurrent title/lock/mode/role races are disclosed,
not atomic CAS or read/meeting isolation. Native ownership/draft/destination/
root/format/file/session/selection/window/tick checks repeat after prompts.
Text/full undo, annotations/promotions, reply files, focus, colorschemes,
navigation and mapping opt-outs survive; Enter/write never change mode.

`mf23-announcement-focused-1/` passes **330 backend, 30 native, 18 drawn, eight
docs checks and TypeScript**, zero skips/cancellations.
`mf23-announcement-focused-2/` passes **377 backend, 30 native, 18 drawn,
eight docs and TypeScript**, zero skips/cancellations. The latter adds actual
loopback-only engine/PublicREST wire for both directions, raw ACK/status/
overflow, fresh role/critical flags, missing grants/grant loss at every step,
selection/session loss, bounded retained results/nonpublication and stubborn
native GET/PUT settlement across logical deadlines/reset. Native recovery
adds four-way interlocks, original-request evidence, late/old-session
resolution and old admitted action ACKs against newer uncertainty.
Temporary contract test interfaces/casts are replaced by typed owner/engine
calls. Counts overlap; do not sum suites as independent cases.

`mf23-announcement-focused-3/` repeats that same green **377 backend / 30 native /
18 drawn / eight docs / TypeScript** boundary, zero skips/cancellations, after
delivered help/protocol/workflow documentation updates.

Delivered help/protocol/workflow docs are updated. The fresh copied-project
gate below accepts these inputs offline, not live mode/role/notification/
title-echo/tenant acceptance or full settings parity.
Historical contract/lock/description/rename finalizers accept only their frozen
inputs. No checkout build, installed configuration/dependency change, live
Webex/OAuth/receipt/device operation, reconnect, meeting ownership/default
change, activation, commit/push or Atlassian work occurs. MF10 stays NO-GO and
`full_plan_complete` remains false.

### MF23 announcement-mode integrated acceptance

**PASS — offline only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-announcement-gate-15/`
freezes **443 sources**, including delivered native help and the new physical
announcement transport tests. Every recorded gate status is zero, with no
checkout changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1225 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **169 pass / zero skips** |
| Private drawn PTYs | **149 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only the
reviewed **announcement enable/disable in an already moderated, explicitly
private standalone group**, with fresh own moderator proof in both directions.
Exact title/mode preconditions, raw locked/private/mode ACK, typed refusal/
unknown distinction, known grants and two-field wire are exercised offline.
No implicit lock/private conversion, creator permission, membership/role write,
extra mutation or post-PUT GET is introduced.

Four-way rename/description/lock/announcement uncertainty, description
preparation interlocks, original-request evidence, saturation/exact replay and
logical/physical deadlines with stubborn GET/PUT settlement across reset are
covered. Both editors exercise named actions, independent strict negotiation,
default-Cancel/source-race consent, annotations/promotions, replies/files,
full undo, colorschemes, focus, mapping opt-outs and cross-action/old-session/
late-resolution/old-admitted-action-ACK recovery. On/Off keep explicit opposing
preconditions, not a toggle or missing-flag inference. No existing
Wa/Wu/Wn/Wv/Wm or Wnr meaning changes; Enter/write never change mode.

Consent accurately discloses **Webex participant notification on enable** and
**moderator/bot/integration posting exceptions**; others may still read/view
files/join meetings. Results and replays publish no main room/title/flags/cache/
roster/roles/history/activity/unread/notification/receipt state, fake system
message/alert, delivery ID or plugin-send exclusion. Same-account other-client
alerts and preview protections remain unchanged. The separate synthetic demo
mode map changes neither roles nor lock and invents no participant notification.

`mf23-announcement-red/` retains its historical **32 backend / four native
expected failures**, not current runtime status. Contract-only/lock/
description/rename evidence and finalizers remain scoped to their own frozen
inputs; none is retroactively promoted. Only gate 15 accepts these final
announcement runtime/test/help inputs.

`mf23-announcement-runtime-finalization.json` verifies **two Markdown-only
post-gate acceptance edits**, unchanged runtime/tests/native help, all ten
checkout bundle/map hashes, HEAD/empty staging and fresh documentation checks.
The 32-capability count/ceiling and three old strict singletons stay unchanged.
Seven frozen-old-client compatibility assertions per editor establish ignored
additive negotiation, not old-client announcement support. No installed
configuration/dependency change, checkout build, live Webex/OAuth/grant/receipt/
device/tenant probe, automatic reconnect, activation, commit/push or Atlassian
work occurred. Independent meeting ownership, initial transmission-off,
inherited tmux styling and detach-by-default remain unchanged.

The mandatory `{title:expectedTitle,isAnnouncementOnly:announcementOnly}` PUT
can still overwrite a concurrent rename; lock/mode/role changes can race.
This is not CAS or live mode/role/notification/title-echo/tenant acceptance.
Public/Team/direct/unlocked/general role management, clearing/move/delete and
all other unaccepted operations remain excluded/gated. MF10 stays **NO-GO**;
`full_plan_complete` remains **false**.

## MF23 description-clearing contract and expected-red boundary

`mf23-description-clear-baseline.json` / `mf23-description-clear-before/`
freeze **443 preceding sources**, ten checkout bundle/map hashes, HEAD and
empty staging after gate 15 finalization. The [separate clear contract](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract)
is approved for **offline contract-first tests/subsequent implementation only**,
not a change to blank replacement semantics or live clearing authorization.

Two fresh Room v1 schemas explicitly document the single ASCII-space removal
request, but require title on PUT. Two fresh policy sources plus hash-linked
self/membership schemas support fresh current own membership and strict
moderator proof when locked. This destructive slice requires explicit private/
nonannouncement flags, nonblank exact bounded preimages, no direct/Team/
General/public/announcement/cached/revoked/read-only target or role/conversion
fallback. Public spaces require a description and are excluded, not privatized.
Only `{title:expectedTitle,description:" "}` is approved, generated internally.

**ACK limitation:** docs do not establish the canonical cleared response shape.
Only raw explicitly present `description:""` may confirm; omitted/null/sentinel/
other whitespace or nonempty ACK stays unknown. The request sentinel is not
response proof, and no trimming/missing-empty inference/post-PUT read/retry is
allowed. Conservative empty-string success is **not** a promise that real
tenants return it. Consent must disclose destructive removal, concurrent
description loss and title-overwrite risk; fresh GET→PUT is not CAS.

`mf23-description-clear-public-evidence.json` retains selected schemas/excerpts,
not page auth/CSRF state. `mf23-description-clear-research/wire.log` passes
two current-PublicREST memory-sink cases: only title/description, exact
**U+0020 / byte `20`**, UTF-8/Content-Length, maximum **350 bytes**, zero
connections/service writes. Its empty mock ACK does not validate canonical
service clearing/ACK/title preservation or live permission/tenant behavior.

Proposed `clearDescription` / `clearSpaceDescription` / `rooms.descriptionClear`
extend existing owners and the shared ledger, with no caller sentinel/settings
map. Three GETs maximum then one PUT in 20 seconds, unchanged byte/IPC/physical
bounds, exact original-request recovery and five-way metadata uncertainty,
including preparation; no replay/post-PUT GET/role/grant expansion.
No main state/draft/delivery/notification/receipt publication.

Named-only `:WebexDescriptionClear` reuses the existing **private unchanged**
description preparation and catalogue/consent/recovery owner, not a new draft.
It requires independent `spaceDescriptionClears:["single-space-v1"]` plus
existing replacement/preparation support. All four older strict singletons
and the 32-capability count/ceiling stay unchanged. Edited text refuses before
consent; Enter/write/blank replacement Submit never clear. Existing eight/
120-second preparation bounds and native work/undo/focus/maps remain binding;
completion retires preparation but leaves its old native text/full undo intact.

New backend and actual Vim/Neovim expected-red tests cover finite shape,
sentinel/preimages/permission/ACK/recovery/interlock/ledger/deadline/nonpublication
and native independent negotiation/private unchanged editing/consent/undo/maps
boundaries. Early missing-method/command failures do not execute or prove all
later assertions. Runtime/delivered help and accepted existing cases remained
unchanged at that frozen boundary; its execution evidence follows below.

`mf23-description-clear-red/` retains **33/33 backend and four native expected
failures**, zero skips/cancellations: unknown finite RPC/recovery shapes,
missing existing-owner/engine clear methods, named command/helper and ignored
malformed new assertions. These are expected-red specifications, not passing
sentinel/permission/ACK/native-preservation feature evidence. Normal runners
included these cases and were intentionally **not all green** before later
implementation; no previous integrated gate accepts subsequent runtime inputs.

`mf23-description-clear-guards/` separately passes **377 existing backend,
30 existing native, eight docs checks and TypeScript**, all zero skips.
`mf23-description-clear-old-client-checks/` passes **eight frozen compatibility
assertions per editor**: additive sibling ignored without clear enablement,
four old strict singletons still strict, capability ceiling still 32.
These are regression/compatibility checks, not description-clear acceptance.

`mf23-description-clear-contract-finalization.json` verifies the exact **eight-path
documentation/test-only delta**, unchanged runtime/delivered native help and
existing accepted cases, ten checkout bundle/map hashes, HEAD/empty staging,
and fresh documentation checks. No new build/integrated runtime gate, live
Webex/OAuth/grant/receipt/device/tenant probe, installed configuration/dependency
change, reconnect, meeting ownership/default change, activation, commit/push or
Atlassian work occurred there. Clear runtime/acceptance and canonical service ACK
validation were **false**; Gate 15 accepts its frozen earlier inputs only.
MF10 stays **NO-GO** and `full_plan_complete` remains **false**.

## MF23 description-clearing runtime slice

`mf23-description-clear-runtime-baseline.json` /
`mf23-description-clear-runtime-before/` freeze the **446-source** contract/test
state before runtime work. The existing ConversationActions, EditorEngine,
finite protocol/worker, PublicREST and native description/conversation owner
now implement separate explicit clearing. Independent
`spaceDescriptionClears:["single-space-v1"]` requires existing `replace-v1`
preparation support; the four older strict singletons, protocol version and
32-capability count/ceiling remain unchanged. No generic tunnel, sender,
role/grant flow, backend lease or new native draft/preparation store.

Fresh self, exact standalone private/nonannouncement Room/nonblank preimages,
known unexpired grants and strict own boolean-role membership precede PUT.
Locked requires explicit own moderator proof, not creator/Team/cache labels.
Public/announcement/Team/direct/General/cached/revoked/read-only targets and
missing/coerced/unsafe critical evidence refuse. Exact title/description
mismatch is conflict, zero PUTs. Three GETs maximum then one
`{title:expectedTitle,description:" "}` PUT in 20 seconds, using only the
internally owned ASCII U+0020 sentinel and unchanged byte/IPC/physical limits.
No post-PUT read, alternate-empty/sentinel attempt, retry/redirect/auth replay/
rollback/queue. Explicit raw empty description plus exact identity/title/
checked-lock/private/nonannouncement ACK alone confirms. Missing/null/echoed
space/other whitespace or nonempty ACK stays unknown, never trimmed/inferred.
**Canonical real-service clear output remains unestablished**, not validated
by a synthetic explicit-empty ACK.

Five-way metadata uncertainty includes preparation and is exact-room scoped.
The shared 256-action ledger preserves identity/exact replay/saturation evidence.
Original unknown request/room and physical-idle recovery never replay or erase
newer evidence. Logical deadline/reset retains stubborn native GET/PUT admission
until physical settlement. No main room/title/description/flags/cache/roles/
history/activity/unread/notification/receipt/delivery publication. Demo clearing
uses its separate description map and deliberately models explicit empty ACK,
not real-service output; no main flags/roles/messages/alerts change.

Named-only `:WebexDescriptionClear` uses the same private preparation, catalogue,
default-Cancel consent and recovery. It refuses changed native text before
prompting, never treats blank replacement Submit/Enter/write as clear.
Private snapshot/current-session/selection/tick/window/root/format/file/context
and 120-second freshness repeat after consent. Eight preparations stay shared;
forged variables/promotions never create authority. Success/conflict/unknown
retires preparation but leaves old native text/full undo intact, never a sentinel
or blank buffer. Cancel retains work and cannot retire an admitted write or
resolve unknown. Existing reply files/drafts, annotations, focus, colorschemes,
navigation and all key meanings/opt-outs survive. Consent discloses destructive
removal, exact old text/title, both title/description overwrite races and the
conservative ACK limit; GET→PUT is not CAS or a tenant-policy bypass.

`mf23-description-clear-focused-1/` passes **410 backend, eight docs and
TypeScript**, but native is 30 pass / four fail, drawn 18 pass / four fail:
the newly reached fixtures compared transient Vim `undotree().synced` before
and after a normal buffer switch. Empty insert/escape synchronizes undo before
snapshots, retaining full-tree assertions. `focused-2/` passes **463 backend,
eight docs and TypeScript**, native 32 pass / two fail, drawn 20 pass / two fail:
a synthetic hello revision/session made the real demo stop event appear old.
The fixture now tests actual session disconnect **before** synthetic revisions
and actual transport reset afterward, without weakening either reset assertion.
Both failed runs remain retained.

`mf23-description-clear-focused-3/` passes **463 backend, 34 native, 22 drawn,
eight docs and TypeScript**, zero skips/cancellations. Physical loopback-only
engine/PublicREST coverage includes moderated/unmoderated sentinel bytes,
explicit-empty vs missing/null/space ACKs, flags/preimages/roles, HTTP status/
overflow, grants and loss at every step, selection/session races, bounded
retention/nonpublication and stubborn GET/PUT settlement. Native recovery covers
five-way interlocks, canceled/admitted preparation, exact original evidence,
old/old-session resolution/action ACKs and newer cross-action uncertainty.
Subsequent tests add exact-room scope and forged-native-buffer rejection;
contract-only casts are replaced by typed owner/engine calls.
Counts overlap; do not sum suites as independent cases.

`mf23-description-clear-focused-4/` passes **464 backend, 34 native, 22 drawn,
eight docs and TypeScript**, zero skips/cancellations, after exact-room-scope/
forged-buffer additions and delivered help/protocol/workflow documentation.

`mf23-description-clear-gate-16/` is **not accepted**. Its 447-source frozen
copy passes **1312 core / 14 deliberate skips, 173 native, 178 SDK/cache/profile**,
44 synthetic messaging, three browser, six research, two loader and eight docs
checks, TypeScript/five copied builds, both help generators and all integrity
checks, with no checkout changes during the gate. **151/153 drawn checks pass**;
both `conversation-recovery` PTYs time out. Retained private captures end at
`-- More --`: the expanded recovery fixture omitted `nomore`. Adding `nomore`
to that fixture removes the pager, not an assertion or runtime safety guard.
The focused runner now draws recovery in both editors, not only headless native
recovery. Gate 16/captures remain failed historical evidence, never promoted.

`mf23-description-clear-focused-5/` passes **464 backend, 34 native, 24 drawn,
eight docs and TypeScript**, zero skips/cancellations, including both drawn
recovery fixtures after that one-line fixture correction.

Delivered help/protocol/workflow docs are updated. The fresh copied-project
gate below accepts the corrected inputs offline; this does not establish canonical
service ACKs/live clear/title-echo/permission/tenant acceptance or full parity.
Historical contract/announcement/lock/description/rename finalizers remain
scoped to their frozen inputs. No checkout build, installed configuration/
dependency change, live Webex/OAuth/receipt/device operation, reconnect,
meeting ownership/default change, activation, commit/push or Atlassian work.
MF10 stays NO-GO; `full_plan_complete` remains false.

### MF23 description-clearing integrated acceptance

**PASS — offline only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf23-description-clear-gate-17/`
freezes **447 sources**, including delivered native help, sentinel transport
tests and corrected drawn recovery. Every recorded gate status is zero, with
no checkout changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1312 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **173 pass / zero skips** |
| Private drawn PTYs | **153 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only
**separate bounded clearing in a private nonannouncement standalone group**,
from nonblank exact preimages, under fresh existing-grant/self/strict-own-member/
locked-moderator proof. The internally owned **one ASCII-space sentinel** and
required title echo are exercised through actual engine/PublicREST composition.
Only raw explicitly present empty-description ACK plus exact identity/title/
checked-lock/private/nonannouncement evidence confirms. Missing/null/echoed
sentinel/whitespace/nonempty ACK stays unknown, without normalization,
post-PUT verification or alternate empty/sentinel retry.

Five-way exact-room uncertainty, preparation interlocks, original-request
recovery, saturation/exact replay, grant/selection/session races, status/
overflow/nonpublication and stubborn physical GET/PUT settlement across
deadlines/reset are covered. Both editors exercise private unchanged
preparation, edited/forged/promoted/stale work refusal, native undo/text/file/
reply separation, default-Cancel/source races, colorschemes, focus, navigation,
mapping opt-outs and old/old-session/cross-action resolution/action ACKs.
Completion retires preparation but retains **old native text/full undo**,
never a blank or sentinel-filled edit. Cancel cannot retire an admitted PUT.
Blank Submit/Enter/write never clear, Wnr remains Remove Member and all existing
key-family meanings survive. No main room/title/description/flags/cache/roles/
history/activity/unread/notification/receipt/delivery publication is introduced.

**Gate 16 remains failed/unaccepted**, with its two recovery pager timeouts
and private `-- More --` captures preserved. Gate 16→17 changes only two
Markdown files and the recovery fixture's one-line `nomore` correction:
runtime/tests-other-than-that-line/native help are unchanged. Focused-1/2
fixture failures and the historical **33 backend / four native expected-red**
boundary remain retained, not current runtime status. Only gate 17 accepts
these final clearing inputs; older gates/finalizers are not promoted.

`mf23-description-clear-runtime-finalization.json` verifies **two Markdown-only
post-gate acceptance edits**, unchanged runtime/tests/native help, all ten
checkout bundle/map hashes, HEAD/empty staging and fresh documentation checks.
The 32-capability count/ceiling and four older strict singletons stay unchanged;
eight frozen-old-client compatibility assertions per editor mean ignored
additive negotiation, not enabling clearing in old clients. No checkout build,
installed configuration/dependency change, live Webex/OAuth/grant/receipt/
device/tenant probe, automatic reconnect, activation, commit/push or Atlassian
work occurred. Independent meeting ownership, initial transmission-off,
inherited tmux styling and detach-by-default remain unchanged.

**Canonical real-service clear ACK representation is still unestablished.**
Explicit-empty mocks do not establish tenant behavior; some real tenants may
always require manual unknown recovery. Title echo can overwrite a concurrent
rename, and clearing can lose another client's newer description; role/flag
races remain. This is not atomic CAS or live clearing/title-echo/permission/
tenant acceptance. Public/announcement/Team/direct/general settings, role
management, move/delete and all other unaccepted operations remain excluded/
gated. MF10 stays **NO-GO**; `full_plan_complete` remains **false**.

## MF23/MF24 standalone moderator review — provider NO-GO

The requested MF23 follow-on reviews standalone messaging-space moderators,
which the finite plan classifies under **MF24 Teams/roles**. It does not
approve Team management or promote earlier room-setting gates into role-write
acceptance. `mf23-moderator-baseline.json` / `mf23-moderator-before/` freeze
**447 preceding sources**, ten checkout bundle/map hashes, HEAD and empty
staging after gate 17 finalization.

The [separate provider review](messaging-public-provider-audit.md#mf23mf24-standalone-moderator-management-review--provider-no-go)
is **NO-GO**, not an approved expected-red implementation contract. Three fresh
Memberships v1 schemas explicitly make **both `isModerator` and `isRoomHidden`
required on PUT**. The latter is documented for personal direct-space visibility
and optional in reads/ACKs. Role-only omission, missing→false inference, group
ignore/no-op behavior and third-party hidden-flag echo semantics are not
validated. No one-field writer, default false, copied preference, generic
settings tunnel or MF22/grant expansion is approved.

Four fresh official policy sources document current-space-moderator assignment/
removal and **Team-space last-moderator Leave** restrictions. They do not
establish atomic standalone demotion/last-moderator update rules or an
unmoderate/leave/delete workaround. A future other-member-only slice could
exclude self/Team/direct/public/unlocked/announcement targets and require
fresh actor/target proof, but role/leave races remain. Existing self/Room/own/
exact-target proof uses four GETs; no silent expansion of the three-GET
Room-metadata contracts, dropped proof, roster scan or new resource budget.
Versioned wire/field-isolation, role/last-moderator/ACK/refusal semantics and
a finite resource envelope must be reviewed before runtime work.

`mf23-moderator-public-evidence.json` retains selected schemas/excerpts and
hash-linked Room/self evidence, not page auth/CSRF data. There are **zero
authenticated service reads/writes**, candidate role/hidden PUTs or live
last-moderator probes. Credentials, memory serialization or consent to an
unexplained personal-preference echo cannot release this provider gate.

`test/space-moderator-gate.test.ts` and actual
`space-moderator-gate.vim` / `space-moderator-gate-boundaries.vim` are **passing
NO-GO regressions**, not implementation/permission tests. They keep invented
role RPC/recovery/tunnels and command placeholders unavailable despite readable/
forged moderator labels; preserve existing invite/remove/leave, capabilities
and metadata singletons; and retain native text/undo/maps with no main state/
delivery change. The normal native/drawn runners register these guards.
No new runtime assertion/helper/command/key, role provider or help changes.

### Moderator NO-GO guard verification

`mf23-moderator-focused-1/` passes **472 backend, 38 native, 28 drawn, eight
docs checks and TypeScript**, zero skips/cancellations, with all 450 source
hashes unchanged during verification. `mf23-moderator-focused-2/` repeats that
green boundary after strengthening the actual roster-menu assertion and full
engine snapshot/event nonpublication checks. The existing clean-row menu is
exercised and remains exactly DM / Remove / Cancel; annotated work refuses
before the menu. No runtime change was needed.

Those totals include **eight new backend and four new native NO-GO cases**,
with both new fixtures drawn in each editor. They also rerun delivered
rename/description/lock/announcement/clear, five-way recovery, rich recipient
and affected conversation/roster/transport regressions. These passing guards
verify absence/rejection of unsupported moderator mutation paths, not role
update serialization, permission, last-moderator or feature acceptance.
Counts overlap; do not sum suites as independent cases.

`mf23-moderator-gate-finalization.json` verifies the exact **eight-path
documentation/test-only delta**, **447→450 sources**, unchanged runtime,
delivered help and all existing accepted cases, and runner-registration-only
changes. The five delivered metadata singletons, 32-capability count/ceiling,
ten checkout bundles/maps, HEAD and empty staging remain unchanged. Only the
two ledger/index Markdown files change after focused-2; a fresh eight-check
documentation run validates those final results/links.

No fresh integrated build is needed for this unchanged-runtime NO-GO boundary;
**gate 17 is not promoted to acceptance of these later docs/guards**, and no
new full-suite/integrated runtime or moderator feature acceptance is claimed.
No checkout build, installed configuration/dependency change, live Webex/OAuth/
grant/receipt/device operation, reconnect, activation, commit/push or Atlassian
work. Independent meeting ownership/defaults and all existing keys, including
Wnr as Remove Member, remain unchanged. `moderator_runtime_implemented:false`,
`moderator_runtime_accepted:false`, provider **NO-GO** and
`full_plan_complete:false` remain binding. Runtime work must wait for the
versioned field-isolation, role/last-moderator semantics and finite resource
contract described in the provider review—not credentials or a live write probe.

## MF22 preference review and visibility-read contract-first boundary

`mf22-preferences-baseline.json` / `mf22-preferences-before/` freeze **450
preceding sources**, ten checkout bundles/maps, HEAD and empty staging after
moderator NO-GO finalization. The [MF22 provider review](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract)
finds no validated Favorites or server mute provider in reviewed Memberships/
Rooms catalogues; installed internal helpers are not approved substitutes.
Hidden-only PUT still requires `isModerator` as well as `isRoomHidden`, so no
role echo/default/combined write is approved. Moderator/Sections/reaction/
MF10 provider gates and storage/account gates remain unchanged.

Six fresh schemas and four fresh product sources support **only a read-only
own selected direct-membership `isRoomHidden` API flag observation** for
offline contract-first tests/subsequent implementation. Modern product Hide
also covers groups and notification/Favorites side effects that the API flag
does not establish. Neither true/false nor missing establishes server mute,
Favorites removal or complete Hidden-list/sync parity. Missing optional flag
is **Not provided/null**, never false; malformed null/coerced fields refuse.
The evidence file hash/URLs and exact limitations are retained in the review,
with zero authenticated service reads/writes and no SDK loading/invocation.

Reuse `RoomMembers.readOwnDirectVisibility`, `EditorEngine.memberVisibility`
and existing selected feature/PublicREST/self identity owners, not local
sections, alert mute, a parallel sender/provider or durable preference store.
Finite `members.visibility {roomId}` permits no caller identity/write/body/
paging fields. Three GETs maximum (self, direct Room, exact own membership),
known existing read grants, strict identity/single-row/no-Link proof and
unchanged physical/byte/deadline bounds. The five-field ≤4096-byte result
reports session/room, `coverage:"own-direct-membership-flag"`, observation time
and boolean/null flag only. No main state/cache/roster/notification/unread/
receipt/delivery/local preference changes or mutation recovery.

Proposed named-only `:WebexDirectVisibility` / Refresh reuse the existing
members/native on-demand lists with independent
`membershipVisibility:["own-direct-v1"]`, the same three existing capabilities,
unchanged 32-capability ceiling and five older metadata singletons.
Native view labels this as an API flag, not product Hidden/Favorites/server
mute, and preserves text/full undo, destinations/files, annotations/promotions,
focus, colorschemes and key opt-outs. Only local r/q, no Enter action/paging;
status/render never read and Enter/write never change preferences.
Session/selection/window/tick/freshness fences apply to explicit reads/results.

`test/member-visibility.test.ts` and native `member-visibility.vim` /
`member-visibility-boundaries.vim` were registered **expected-red specifications**,
not runtime/permission acceptance; early unavailable-method/command failures
could not prove later assertions. Runtime/delivered help and existing accepted
cases remained unchanged at that boundary. Its execution/finalization evidence follows.

`mf22-visibility-contract-checks/` retains **20/20 backend, four native and
four drawn expected failures**, zero skips/cancellations: missing finite RPC,
existing RoomMembers/engine methods and named command/native helper. The new
normal backend/native/drawn registrations were intentionally red before runtime
implementation; early failures did **not** execute/prove later wire/privacy/
freshness/native preservation assertions.

Existing affected checks separately pass **492 backend, 48 native, 16 drawn,
eight docs and TypeScript**, zero skips/cancellations. These include the
moderator NO-GO guards, delivered metadata/recovery/rich-recipient suites,
local-section storage/restore, local notification routing/cancellation and
preview protections. **Nine frozen-client assertions per editor** pass:
ignored additive observation negotiation is not read enablement, five older
metadata singletons stay strict and the capability ceiling stays 32.
Counts overlap; do not sum suites as independent cases.

`mf22-visibility-contract-finalization.json` verifies the exact **eight-path
docs/test-only delta**, **450→453 sources**, unchanged runtime/delivered help/
existing accepted cases and registration-only runner changes. Five existing
metadata assertions, the 32-capability count/ceiling, ten checkout bundles/maps,
HEAD and empty staging remain unchanged. Only two ledger/index Markdown files
change after the recorded test run, followed by fresh eight-check documentation
verification. No new integrated runtime build/gate was run or inferred there.
Earlier accepted gates and moderator finalization remain scoped to their
frozen inputs; none is retroactively promoted.

No installed configuration/dependency change, checkout build, authenticated
Webex/OAuth/grant/receipt/device operation, reconnect, automatic opener/download,
activation, meeting ownership/default change, commit/push or Atlassian work.
MF22 API observation runtime/acceptance remained **false** there; Favorites, product
Hidden synchronization and server mute remain provider-gated, with **zero
approved preference writes**. Moderator/MF10/reaction/Sections/security gates
and `full_plan_complete:false` remain binding.

## MF22 own-direct visibility runtime slice

`mf22-visibility-runtime-baseline.json` / `mf22-visibility-runtime-before/`
freeze the **453-source** contract/test state. Existing RoomMembers now performs
stateless fresh self/direct Room/own-row reads; EditorEngine's selected feature/
known-grant/session/admission owner returns the strict five-field observation.
Finite `members.visibility {roomId}` and independent
`membershipVisibility:["own-direct-v1"]` reuse the protocol/worker; the five
older metadata singletons, protocol version and 32-capability count/ceiling
remain unchanged. No new provider, credential flow, storage or preference writer.

The three GETs maximum use exact current self/direct room and filtered own
membership. Known existing people/rooms/memberships-read grants are rechecked
at every step; no write scope. Missing/invalid Room identity/type, Team, group,
unselected/cached/revoked/unready contexts, duplicate/foreign/malformed/paged
own rows and lost grants/selection/session refuse without follow-up read.
Explicit raw boolean is projected; absent `isRoomHidden` becomes null/Not
provided, never false. Raw null/coercions refuse. Roles, names, email and other
preferences are ignored, never output or permission.

At most three GETs in the existing 20-second feature budget, eight-second
physical deadlines, unchanged byte/read/IPC limits and shared PublicREST
physical admission. Timeout/reset cannot admit a replacement while the native
socket/DNS is unsettled. No POST/PUT/DELETE, verification GET, retry/redirect/
auth refresh, polling, receipt or write uncertainty/recovery. Result is only
session/room/coverage/time/boolean-or-null, ≤4096 bytes, never a main Room/list/
roster/cache/history/activity/unread/notification/delivery publication.
The demo retains its absent flag as Not provided; it invents no preference.

Named-only `:WebexDirectVisibility` / Refresh use existing members/lists and
catalogue, with local r/q only, no Enter action/paging/global mapping. The view
discloses **API flag only, not current product Hidden/Favorites/server mute or
ongoing synchronization**. No automatic local filtering, Favorites removal or
alert suppression. Source/window/tick/context/session/selection fences repeat
after callbacks; stale/future/old-session/away-return/annotated/promoted results
cannot overwrite work, steal focus or refill a newer view. Same-session clean
expired views may only be explicitly reread. New explicit context invalidates
a dropped old callback, not a backend physical admission. Native text/full
undo, reply/file/draft destinations, colorschemes, focus, navigation and user
mapping overrides/opt-outs remain preserved.

`mf22-visibility-focused-1/` passes **512 backend, eight docs and TypeScript**,
but native **51/52** and drawn **19/20**: the newly reached Vim fixture used
unscoped read-only `count`. Renaming that test variable to `request_count`
preserves all assertions; no runtime assertion or safety guard was weakened.
The failed run is retained.

`mf22-visibility-focused-2/` passes **559 backend, 52 native, 20 drawn, eight
docs and TypeScript**, zero skips/cancellations. Its **47 physical transport
cases** compose the real engine/PublicREST via loopback only: true/false/
omitted flags, exact GET sequence/query/bytes, raw flag/identity/type/paging/
status/overflow failures, grant/selection/session loss, no publications/
retained roles/profiles and stubborn native self/Room/membership settlement
across logical deadlines and reset. Contract-only interfaces/casts are replaced
by typed owner/engine calls.

Subsequent native checks strengthen direct-reply Markdown/file/draft/full-undo
preservation, missing negotiation dependencies, actual disconnect/reset and
old-session Refresh refusal. Delivered help/protocol/workflow docs are updated.
`mf22-visibility-focused-3/` repeats the green **559 backend, 52 native,
20 drawn, eight docs and TypeScript** boundary, zero skips/cancellations, after
those native additions and documentation updates.
The fresh copied-project gate below accepts these inputs offline; it does not
establish live API flag behavior, product Hidden/Favorites/server mute parity
or any preference/role write. Historical contract/moderator/metadata reports
accept only their own frozen inputs. No checkout build, installed configuration/
dependency change, authenticated Webex/OAuth/receipt/device operation, reconnect,
activation, meeting ownership/default change, commit/push or Atlassian work.
MF10/moderator/reaction/Sections/security gates and `full_plan_complete:false`
remain binding. Counts overlap; do not sum suites as independent cases.

### MF22 visibility integrated acceptance

**PASS — offline only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf22-visibility-gate-18/`
freezes **454 sources**, including delivered native help, the own-direct
observation tests and 47 physical transport cases. All recorded statuses are
zero, with no checkout changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1387 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **181 pass / zero skips** |
| Private drawn PTYs | **161 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only
an explicit **raw own selected direct-membership API flag observation**.
Fresh known read grants/self/exact direct Room/unique own membership, exact
three-GET sequence and isolated five-field output are exercised through the
existing engine/PublicREST owners. Omitted flag is **Not provided/null**, never
false; raw null/coercions, foreign/duplicate/paged identities, missing grants
and invalidated targets refuse without scan/fallback/retry. No other person's
preference, role, name/email/credential or raw profile is projected/retained.
Read-only scope needs no memberships-write grant and enables no role writer.

Physical self/Room/membership timeout/reset tests retain native admission
until actual settlement. HTTP/status/overflow/grant/selection/session failures
cannot publish stale results, convert refusal to visible, or add a verification
GET or mutation. Main room/list/cache/roster/history/activity/unread/notification/
receipt/delivery state, local grouping/alert mute and five-way metadata
uncertainty remain untouched. No preference/role write, polling, SDK call,
subscription or new identity/durable preference/draft store is introduced.

Both editors exercise independent strict negotiation, on-demand named reads,
local r/q without Enter/paging, explicit same-session reread, stale/future/
old-session/away-return/window/tick guards and dropped old callbacks against
newer observations. Annotated/promoted views, direct-reply Markdown/file/draft
destinations, native text/full undo, focus, colorschemes, navigation and mapping
shadows/opt-outs survive. Wnr remains Remove Member and all existing key-family
meanings are preserved. Enter/write never send or change preferences.

The historical **20 backend / four native / four drawn expected-red** boundary
and focused-1 Vim fixture-variable failure remain retained, not current runtime
status. Nine frozen-client assertions per editor prove ignored additive
negotiation without enabling this read; the five older metadata singletons
and 32-capability count/ceiling stay unchanged. Earlier contract/moderator/
metadata gates and finalizers remain scoped to their own frozen inputs;
only gate 18 accepts these final runtime/test/help inputs.

`mf22-visibility-runtime-finalization.json` verifies **two Markdown-only
post-gate acceptance edits**, unchanged runtime/tests/native help, all ten
checkout bundle/map hashes, HEAD/empty staging and fresh documentation checks.
No checkout build, installed configuration/dependency change, authenticated
Webex/OAuth/grant/receipt/device/tenant probe, reconnect, automatic opener/
download, activation, commit/push or Atlassian work occurred. Independent
meeting ownership, initial transmission-off, inherited tmux styling and
detach-by-default remain unchanged.

**This is not current product Hidden state/list/synchronization, Favorites or
server mute parity.** API flag equivalence to modern app Hide and its
notification/Favorites effects remains unestablished. All preference writes,
including mandatory moderator echo, stay NO-GO; moderator runtime remains
unimplemented/unaccepted. MF10, reaction/Sections/security gates and every other
unaccepted roadmap operation remain gated/planned. No live API flag/tenant
acceptance; `full_plan_complete` remains **false**.

## MF24 Team-rename review and contract-first boundary

`mf24-team-rename-baseline.json` / `mf24-team-rename-before/` preserve the
accepted **454-source** gate-18 state, ten checkout bundles/maps, HEAD and empty
staging. No accepted runtime/test/help source is overwritten or reset.
The [Team-rename provider review](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review)
retains six fresh selected v1 schemas, three official policies and bounded
Teams/Team Memberships/People catalogues. JSON-only public-doc extraction,
zero authenticated service reads/writes, no SDK invocation or page auth state.

Teams PUT requires only `name`; optional description is **not echoed/written**.
Exact raw Team ID/name ACK is required; missing/coerced/sanitized/error ACK
remains unknown. This schema-conforming body is not live description-
preservation/tenant evidence. Non-atomic name/role races remain disclosed.
The real `/v1/team/memberships` list has **no personId filter**. Fresh authority
therefore requires one complete **≤100-row** page, no Link/overflow/foreign/
duplicate/error identities, with exactly one fresh authenticated-self row and
explicit `isModerator:true`. Creator, Room role, loaded Team association,
joined-list membership, cache or sanitized label never supplies permission.
No membership-ID derivation, scan/drain, fallback detail or role/preference echo.

Approved only for offline contract-first work: existing `ServerTeams` module
supplies stateless fresh proof/selection admission, existing
`ConversationActions` owns preparation/rename and the same 256-request ledger.
Each preparation ≤3 GETs/zero mutations; each submission ≤3 GETs/one name-only
PUT, each within existing 20-second/8-second physical and byte/read limits.
Both need known existing people/teams/team-memberships-read and teams-write
grants; no expansion/acquisition/refresh. One pending native preparation,
≤4096-byte five-field preparation, 120-second age, no new role/draft/store.
The proposed new literal collection path is **GET-only with exact teamId/max=100**,
no extra/duplicate query keys or ID subpath. **Runtime allowlist stays unchanged
here**; its positive contract assertion is intentionally red.

Finite `teams.renamePrepare` / `teams.rename` require exact current joined-Team
ID/revision/session/age, not a selected Room. Fresh protected proof repeats at
submission; old prep cannot lend role authority. Independent
`teamActions:["rename-v1"]` uses three existing capabilities and leaves the five
older metadata assertions, own-direct visibility assertion, protocol version
and 32-capability ceiling intact. Native named-only `:WebexRenameTeam [name]`
extends conversations/clean joined-row workflow, not Enter/Wnr/loaded labels.
Prompt/confirmation/callback fences explicitly bind row as well as native
window/tick/session/revision/selection; native work/files/undo/keys are retained.

The original `team-rename:{teamId}` unknown request is resolved through the
existing conversation owner with exact Team/request/manual Webex check, never
replay. Shared ledger saturation and physical settlement are fail-closed;
late ACK/old replay cannot clear newer uncertainty. Confirmed non-replayed ACK
can invalidate Team caches/selection only, never rewrite native rows or main
Room/roster/history/unread/notification/receipt/delivery state or local filters.
Five-way Room metadata uncertainty stays independent. Team membership/role/
lifecycle, standalone moderator, MF22 preferences and every other provider/
security gate remain unapproved as before.

`test/team-rename.test.ts`, `test/editor/team-rename.vim` and
`test/editor/team-rename-boundaries.vim` are registered **expected-red
specifications**, not runtime or permission acceptance, at that boundary.
Missing interfaces/path admission failed before later assertions executed.
Existing runtime, delivered help and accepted cases remained unchanged there.
Execution/finalization evidence follows separately; no checkout build,
installed config/dependency change, authenticated live operation, reconnect,
automatic opener/download, meeting-owner/default change, activation,
commit/push or Atlassian work. Team-rename runtime/acceptance and
`full_plan_complete` remain **false**.

### MF24 Team-rename contract verification

`mf24-team-rename-contract-checks-2/` retains **22 backend / four native /
four drawn expected failures**, zero skips/cancellations. The first run
(`mf24-team-rename-contract-checks/`) has the same counts; the second preserves
additional native original-request/newer-uncertainty specifications and makes
the shared room-create saturation fixture's separate existing grant explicit.
No runtime was implemented at that contract-first boundary.

The failures are the intended missing finite RPC/recovery branch, narrow
transport admission, shared owner/engine methods, command and native helper.
They are **not** service refusals, TypeScript failures or proof that later
wire/role/deadline/native/recovery assertions executed. Normal new backend/
native suites were intentionally red before the subsequent runtime slice.

Existing affected checks separately pass **585 backend, 56 native, 24 drawn,
eight docs and TypeScript**, zero skips/cancellations, with no source changes
during verification. They cover joined-Team/loaded-Team reads, existing
conversation/metadata/recovery, raw own-direct visibility, local sections,
notification and moderator NO-GO guards. **Ten frozen gate-18 client assertions
per editor** pass without enabling Team writes: unknown additive negotiation
is ignored, all five metadata singletons plus own-direct visibility remain
strict, and the capability ceiling stays 32. Counts overlap; do not sum suites.

`mf24-team-rename-contract-finalization.json` checks the exact **eight-path
documentation/test-only delta**, **454→457 sources**, unchanged runtime,
delivered help and existing accepted cases, and runner-registration-only
edits. It verifies the retained evidence hash, no new allowlist/command/helper/
runtime assertion, five older metadata assertions plus own-direct visibility,
32-capability count/ceiling, ten checkout bundles/maps and HEAD/empty staging.
Only ledger/index Markdown changes after checks-2, followed by fresh eight-check
documentation verification. Gate 18's acceptance remains its frozen visibility
inputs only; no historical finalizer is rerun/promoted and no fresh integrated
runtime build/Team-rename acceptance is claimed.

Next runtime work must implement the reviewed bounded fresh Team proof,
name-only wire and shared ledger/recovery/native fences, then pass these
specifications, real physical engine/transport checks and a fresh isolated
integrated gate. Optional-description preservation and tenant behavior remain
unverified, not a reason to probe live. No user credential/manual action is
needed for that offline step. Team lifecycle/membership/other roles, standalone
moderator/MF22 preference writes and all other provider/security gates remain
unchanged; **`team_rename_runtime_implemented:false`,
`team_rename_runtime_accepted:false`, `full_plan_complete:false`** there.

## MF24 Team-rename runtime slice

`mf24-team-rename-runtime-baseline.json` / `mf24-team-rename-runtime-before/`
freeze the **457-source** contract/test boundary. Existing ServerTeams now
supplies stateless fresh raw Team/complete-page moderator proof and exact
joined-slot session/ID/revision/age selection admission. Existing
ConversationActions owns preparation/name-only mutation and the same
256-request ledger, logical deadline, physical admission and original-request
uncertainty. No new provider, sender, role cache, backend preparation/draft/
preference store, account identity or credential flow.

Each phase requires current known people/teams/team-memberships-read and
teams-write grants, fresh self, exact raw safe Team name, no error/Link,
one complete ≤100-row membership page with valid unique identities/exact Team
and exactly one explicit own `isModerator:true`. There is **no personId filter**.
Any paging/overflow/malformed/foreign/duplicate/missing/false/coerced role
refuses without fallback/drain. Preparation cannot lend role authority.
Submission rechecks raw old name and returns conflict if changed, zero PUT.
Only **one `{name}` PUT** is permitted; exact explicit raw Team ID/name ACK
confirms. No description/default/role/preference/Room field is echoed.
Optional-description live preservation/tenant behavior and atomic name/role
preconditions remain unverified/disclosed, not inferred from a name ACK.

At most three GETs per phase / one PUT on submit, each phase within existing
20-second total and eight-second physical/byte/read/IPC bounds. Whole successful
interactive flow: ≤6 GETs / one PUT. Only literal
`/v1/team/memberships?teamId=...&max=100` is added with strict GET/no body/exact
query admission; no membership-ID or write path/general `team/*` allowlist.
No retry, redirect, auth refresh, verification GET, automatic repair, polling,
receipt or hidden fan-out. Logical timeout/reset retains native socket/DNS
admission; late ACK cannot promote retained unknown or clear newer evidence.
Shared ledger saturation fails closed. Exact replay is retained evidence only,
no IO/cache invalidation; original Team/request/manual check recovery does no
IO/replay and waits for idle logical/physical work.

Finite RPCs/engine methods bind exact current joined-Team session/ID/revision/
age, with no selected Room requirement. Independent `teamActions:["rename-v1"]`
reuses three existing capabilities, preserving five metadata assertions,
own-direct visibility, protocol version and 32-capability count/ceiling.
The demo's explicit synthetic Team role/name state is independent of Room
roles or duplicate joined labels; it is not service permission evidence.

Named-only `:WebexRenameTeam [name]` reuses conversations/joined lists and the
single catalogue; no global mapping, Enter mutation or new permanent buffer.
Fresh exact raw preimage/ID/new name and non-atomic role/name/optional-field
limitations are confirmed. Pending preparation spans prompt/confirmation;
source/row/query/session/window/tick/epoch/age fences repeat, including a
cursor-away-return invalidation latch. Stale/future/old-session/late callbacks,
annotations/promotions and dropped preparations cannot submit for new intent.
Exact original-request resolution/malformed/mismatched response handling stays
conservative; old ACK cannot clear newer uncertainty.
Confirmed non-replayed ACK invalidates existing Team labels/selection only,
never rewrites native rows/text/full undo; explicit Refresh supplies a new
joined revision. No main Room/cache/roster/roles/history/activity/unread/
notification/receipt/delivery publication, local filter/sections identity
change or plugin-send exclusion. Reply/file/draft destinations, text/full undo,
focus, colorschemes, navigation, Wnr and mapping shadows/opt-outs are preserved.

`mf24-team-rename-focused-1/` passes **607 backend, 60 native, 28 drawn, eight
docs and TypeScript**, zero skips/cancellations. All 22 formerly-red backend/
four native/four drawn specifications execute against the new owners.
`mf24-team-rename-focused-2/` adds **61 real-engine/PublicREST physical cases**:
**668 backend** pass, but native **58/60** and drawn **26/28** expose a real
native error-path bug. A synchronous deliberately mismatched response threw
inside an inline `if rpc(...)` within `try/finally`, masking the intended
protocol error with Vim `E171 Missing :endif`. Moving the call to its own
statement preserves unknown evidence and assertions. The failed run is
retained; `mf24-team-rename-native-recovery-fix/native.log` passes both fixtures
in both editors (**four pass**), without weakening mismatch/recovery guards.

Subsequent physical coverage also includes preparation deadlines, Team/ACK
Links and chunk-read overflow. Delivered help/protocol/workflow docs are updated.
`mf24-team-rename-focused-3/` passes **675 backend, 60 native, 28 drawn, eight
docs and TypeScript**, zero skips/cancellations, after the correction and all
**68 physical transport cases**. Native cursor-away-return and deliberately
mismatched callback uncertainty checks also pass in both headless and drawn
editors. The fresh copied-project gate below records bounded offline
acceptance, not live/tenant or other Team/role parity. No checkout build, installed config/dependency change,
authenticated Webex/OAuth/grant/receipt/device/tenant probe, reconnect,
automatic opener/download, activation, commit/push or Atlassian work.
All other Team/lifecycle/role/preference, standalone moderator, MF10/reaction/
Sections/storage/account gates remain binding; independent meeting ownership/
initial transmission-off/tmux inheritance/detach defaults are unchanged.
Historical gates/finalizers accept only their frozen sources.
`full_plan_complete:false`. Counts overlap; do not sum suites.

### MF24 gate-19 retained native failure

`mf24-team-rename-gate-19/` is **NOT ACCEPTED**. Its 458 frozen sources pass
**1477 core / 14 deliberate skips**, all **165 drawn**, 178 SDK/cache/profile,
44 messaging, three browser, six research, two loader, eight docs, TypeScript/
five copied builds, both help generators and integrity checks, but native is
**184/185**. Only `Neovim/space-description` fails: an eight-preparation-loop
wait fails, followed by ninth-slot/replacement cascade assertions. Both Team
fixtures pass in each editor, and the unchanged description fixture passes
in Vim and both drawn PTYs. No checkout changes occurred during gate 19.

The description fixture/runtime policy is not weakened or changed.
`mf24-gate19-description-reproduction-corrected/` retains **14 passing unchanged
compiled-fixture reruns** (ten Neovim/four Vim); the private trace-only overlay
in `mf24-gate19-description-diagnostics/` retains **110 passing diagnostic runs**
(100 Neovim/ten Vim), preserving the original guards/conditions. The failure
did not recur; **its cause is unproven**, not declared fixed by reruns. Initial
diagnostic-launch failures used an unavailable hard-coded `/usr/bin/node`;
they are retained separately and excluded from reproduction/acceptance counts.
The corrected runner uses the actual existing Node executable.

A fresh full gate was required with the same runtime/tests/help; neither timing
allowances, assertions nor retries are changed, and gate 19 is not promoted.
Any later green gate accepts only its frozen offline inputs, not an explanation
or resolution of this intermittent legacy fixture result. No live probes or
provider/security gate changes are involved.

### MF24 Team-rename integrated acceptance

**PASS — bounded offline slice only:**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf24-team-rename-gate-20/`
freezes **458 sources** and passes every recorded gate status, with no checkout
changes during verification:

| Gate | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1477 pass / 14 deliberate opt-in skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **185 pass / zero skips** |
| Private drawn PTYs | **165 pass / zero skips**; Neovim-only incremental-image case is not counted as a Vim pass |
| SDK/read-status/presence/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum suites as independent cases. This accepts only
**explicit name-only rename of an exact fresh joined-Team selection**, with
fresh authenticated self/raw Team/explicit current Team-moderator proof.
One complete ≤100-row membership response per phase, no Link/ambiguity/
overflow/foreign/duplicate identity or invented person filter; no cached label/
creator/Room-role authority. Each phase uses ≤3 GETs, submit one `{name}` PUT,
within unchanged deadline/byte/read/IPC and shared physical-admission bounds.
No Team-membership/role/description/preference/Room write or extra writer.

All formerly-red specifications execute. The **68 physical transport cases**
compose real engine/PublicREST via inert loopback/injected native streams,
not live APIs: exact six-GET/one-PUT interactive shape, raw preimage/role/ACK,
scope/query/session loss, malformed/error/paged/overflow responses, one-shot
status handling, original-request/newer-uncertainty protection, strict GET-only
membership collection admission, preparation deadlines and self/Team/member/
PUT socket settlement through logical timeout/reset. No verification GET,
redirect/auth replay, late promotion, new request ledger or eviction.
Exact retained replay does no IO or stale-cache publication.

Both native editors exercise single-catalogue named action and strict independent
negotiation, exact raw preimage consent, original-request recovery, retained
uncertainty on malformed/mismatched response, old-ACK/newer-evidence fencing,
source/window/tick/query/session/age and cursor-away-return guards. Preparation
stays pending through prompt/confirmation; dropped old callbacks cannot submit
for a newer intent. Only confirmed non-replayed ACK invalidates Team labels/
selection, not native rows/text/full undo. Refresh is explicit. Reply/file/
draft destinations, native work/undo, focus, colorschemes, navigation, Enter
filtering, Wnr Remove Member, key families and mapping shadows/opt-outs survive.
No main Room/cache/roster/role/history/activity/unread/notification/receipt/
delivery publication, filter/sections rename or plugin-send exclusion.

**Gate 19 remains failed and retained.** Its unchanged Neovim description-
preparation failure did not recur in gate 20, 14 unchanged compiled reruns or
110 trace-only diagnostics, but **the cause remains unproven**. No runtime/
test/help/assertion/timeout/retry behavior changed between gates 19 and 20;
only ledger/index documentation recorded the failed evidence. Gate 20 is
current bounded offline pass evidence, **not a claim that the intermittent
legacy failure was explained or fixed**. Initial bad-Node diagnostic launches
remain excluded. Focused-2's separate native mismatch error is retained with
its actual correction; no historical failed/red gate is promoted.

`mf24-team-rename-runtime-finalization.json` checks the **two Markdown-only
post-gate acceptance edits**, unchanged runtime/tests/native help, 457→458-source
runtime lineage, all ten checkout bundles/maps, HEAD/empty staging, five
older metadata singletons plus own-direct visibility, 32-capability count/
ceiling and fresh eight-check documentation verification. Ten frozen-client
assertions per editor remain compatibility evidence, not old-client write
enablement. Prior visibility/metadata/contract/moderator reports remain scoped
to their own frozen inputs.

No checkout build, installed config/dependency edit, authenticated live Webex/
OAuth/grant/receipt/device/tenant operation, reconnect, automatic opener/
download, activation, commit/push or Atlassian work occurred. Independent
meeting ownership, initial transmission-off, inherited tmux styling and
detach-by-default remain unchanged.

Live permission/optional-description preservation/tenant/conditional-update
acceptance remains **unverified**, with races disclosed in native consent.
Other Team lifecycle/description/membership/moderator operations and standalone
moderator/MF22 preference writes remain **unapproved/provider-gated**.
MF10/reaction/Sections/storage/account gates and all other unaccepted roadmap
operations remain gated/planned. `team_rename_runtime_implemented:true`,
`team_rename_runtime_accepted:true` **offline only**;
`full_plan_complete` remains **false**.

## MF24 Team-description review and contract-first boundary

`mf24-team-description-baseline.json` / `mf24-team-description-before/`
preserve the accepted **458-source** gate-20 state, ten checkout bundles/maps,
HEAD and empty staging. [The provider review](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review)
retains **two fresh selected Teams v1 schemas / one fresh policy source**,
plus explicitly hash-linked reuse of four same-day self/joined/Team-membership
schemas, three policies and scope descriptions. Reused material is not counted
as new fetching. Embedded state is JSON-only, no scripts/page auth/SDK or
authenticated service reads/writes.

Approve only changed nonblank **Team description replacement** for offline
contract-first work. PUT requires `name`, so the exact body is
**`{name:expectedName,description}`**, not description-only or a new name.
Both raw name and explicit raw string description are fresh preimages; missing/
null/coerced description is not empty. Explicit old empty string may be
replaced, but blank/whitespace/no-op submission cannot clear. Reuse stricter
local LF-only 1000 UTF-16-unit/4000-byte bounds without calling them provider
maxima. Only exact raw ID/name/new-description ACK confirms; ambiguity stays
unknown, no sentinel/fallback/verification GET. Consent discloses non-atomic
description loss **and required name echo overwriting a concurrent rename**.
No conditional-write/atomic-role/name/description or live tenant claim.

Existing ServerTeams proof/selection and ConversationActions read/perform/
256-request/physical/uncertainty owners are extended, not duplicated. Fresh
self/exact Team/unique own explicit moderator still uses one complete ≤100-row
membership page with no Link/duplicate/foreign/error/overflow proof or invented
personId filter. Both phases repeat known existing people/teams/team-memberships-
read/teams-write grants. Each phase ≤3 GETs in 20 seconds, submission one PUT;
whole successful flow ≤6 GETs/one PUT. Existing native admission/8-second
physical/request/response/read/IPC limits stay unchanged, no new path or writer.

`teams.descriptionPrepare {teamId,revision}` returns six fields (session/Team/
query revision/time/exact raw name/old description), ≤16384 bytes, through
`EditorEngine.prepareTeamDescription` / `ConversationActions.readTeamDescription`.
`teams.describe` / `describeTeam` accept exact preimages/replacement and explicit
confirmation only, no replacement name/actor/role/Room/body/URL/preferences.
Independent `teamDescriptions:["replace-v1"]` preserves Team-rename, five Room
metadata and own-direct assertions, protocol version and 32-capability ceiling.

**Two-way Team metadata uncertainty** includes rename and description writes/
preparations in the existing ledger. Original `team-describe:{teamId}` request/
Team/session/manual-check resolution cannot clear rename or newer uncertainty,
replay or release unsettled physical work. Old exact replay is retained evidence
only, no IO/timestamp/cache publication. Description ACK only retires/settles
private edit authority/status; unlike rename it never resets/renews/invalidates/
publishes Team labels/joined cache or main Room/roles/history/unread/notification/
receipt/delivery/filter state. Native text/full undo remains unchanged.

Named-only `:WebexDescribeTeam` / `:WebexTeamDescriptionSubmit` / Cancel reuse
conversations and **the same private eight-active-prepare budget combined
across Room and Team descriptions**, same pending-read owner and clock, not
eight each or another live draft registry. New six-field preparation has an
explicit 16384-byte bound; rename's 4096-byte preparation remains unchanged.
Prepare from a clean current exact joined-Team row; Submit from the matching
private plain metadata edit only, not copied `b:` fields, Room, recipient,
reply/file/Markdown or promoted work. Strict source/row/query/session/window/
tick/age/consent/callback fences preserve native text/full undo, files/draft
destinations, focus, colorschemes, annotations/promotions, navigation, Wnr and
mapping shadows/opt-outs. Enter/write/blank never send or clear; no Team-clear
command or sentinel. Neither Team nor Room commands adopt the other's scope.

`test/team-description.test.ts`, `test/editor/team-description.vim` and
`test/editor/team-description-boundaries.vim` are registered **expected-red
specifications**, not runtime/permission acceptance. Missing method/command/RPC
failures cannot prove later body/role/recovery/native assertions executed.
Runtime/help/accepted cases remain unchanged. Execution/finalization evidence
follows. No checkout build, installed config/dependency/grant change, live/
OAuth/receipt/device/tenant probe, reconnect, activation, automatic opener/
download, meeting-owner/default change, commit/push or Atlassian work.
Team-description clear, other Team lifecycle/membership/roles, standalone
moderator/MF22 preference writes and all MF10/reaction/Sections/storage/account
gates remain unapproved. Gate 20 is not promoted to later source acceptance;
gate 19's unproven legacy native failure remains retained, not fixed by this
review. **Team-description runtime/acceptance and full-plan completion were false
at that contract-first boundary.**

### MF24 Team-description contract verification

`mf24-team-description-contract-checks/` retains **24 backend / four native /
four drawn expected failures**, zero skips/cancellations. They fail at the
missing finite RPC/recovery branch, existing owner/engine methods, command or
native helper—not a live refusal, compiler error or executed later safety
assertion. Default new backend/native tests are intentionally red until a
subsequent implementation, not “all suites green,” at that boundary.

Existing affected checks separately pass **675 backend, 60 native, 32 drawn,
eight docs and TypeScript**, zero skips/cancellations and no source changes
during verification. These include accepted Team rename and its 68 physical
cases, joined/loaded-Team queries, Room description/metadata/clear/recovery,
own-direct visibility, local sections, notification and moderator NO-GO guards.
**Eleven frozen gate-20 client assertions per editor** pass: ignored additive
description negotiation is not writer enablement; Team rename, all five Room
metadata and own-direct assertions remain strict; the capability ceiling is 32.
Counts overlap; do not sum suites as independent cases.

`mf24-team-description-contract-finalization.json` verifies the exact
**eight-path docs/test-only delta**, **458→461 sources**, unchanged runtime,
delivered help and every accepted case, with registration-only runner edits.
It verifies the new/reused evidence hashes, existing seven independent
assertions and 32-capability count/ceiling, ten checkout bundles/maps and
HEAD/empty staging. Only ledger/index Markdown changes after the recorded
checks, followed by fresh eight-check docs verification. No new integrated
runtime build/acceptance; gate 20 and all historical finalizers remain frozen,
not rerun/promoted to later inputs. Gate 19's unresolved intermittent native
description-fixture result remains retained; this read-only review does not
explain/fix it.

Next offline runtime work needs the scoped shared proof/edit/ledger/uncertainty
changes, real physical wire/ACK/grant/session/query/settlement tests, mixed
Room+Team eight-slot/scope/undo/consent/callback/recovery compatibility checks
and a fresh isolated integrated gate. No credential/manual step is needed
for that offline work. **`team_description_runtime_implemented:false`,
`team_description_runtime_accepted:false`, `full_plan_complete:false`** there.
Other Team/clear/role/preference and every existing NO-GO remain unapproved;
no live operations, activation, checkout build, installed/dependency/grant
change, commit/push or Atlassian work occurred.

## MF24 Team-description runtime slice

`mf24-team-description-runtime-baseline.json` /
`mf24-team-description-runtime-before/` freeze the finalized **461-source**
contract boundary, ten checkout bundles/maps, HEAD/empty staging. The existing
ServerTeams proof now opts into explicit raw description validation without
changing rename's default preimage/DTO. ConversationActions owns
`readTeamDescription` / `describeTeam` through the same known-grant/self/read/
perform/20-second/physical/256-action owners, not a provider or preparation store.
Name and explicit string description are compared fresh before dispatch;
missing/null/coercion is never empty. One complete ≤100-row Team-membership
page proves explicit own current moderator, with no invented person filter,
paging/drain/fallback/cached-role/creator/Room-role authority. Submission repeats
proof and uses exactly **one `{name:expectedName,description}` PUT**.
Only explicit exact raw Team ID/name/replacement-description ACK confirms;
malformed/omitted/error/Link/mismatch ambiguity stays unknown, no verification
GET/retry/redirect/auth replay. Required name echo remains operation-specific,
not role/preference pairing approval. Concurrent description loss AND name echo
overwriting a concurrent rename are explicitly disclosed; no CAS guarantee.

Changed nonblank LF-only replacement reuses local 1000 UTF-16-unit/4000-byte
safety limits, not provider maxima. Explicit old `""` may be replaced; no
blank/no-op/sentinel/clear. Each phase ≤3 GETs/20 seconds, submission one PUT;
whole successful flow ≤6 GETs/one PUT. Existing 8-second physical, byte/read/
IPC bounds and unsettled native admission remain unchanged; no transport/path
expansion. Two-way same-Team rename/description uncertainty blocks both reads
and new-ID writes through the existing ledger. Original action/Team/request/
session/manual-check recovery requires idle logical/physical work, no IO or
replay. Old evidence cannot clear newer uncertainty. Exact retained replay
cannot reset/renew/invalidate newer Team cache/query/name or publish main state.

Finite engine/RPC preparation and submit bind exact joined Team/session/query
revision/age with no selected Room requirement. `teamDescriptions:["replace-v1"]`
is independent of rename and requires only existing conversations/joined-teams/
local-context capabilities; older seven assertions and protocol version/
32-capability ceiling remain intact. Six-field preparation ≤16384 bytes is
separate from rename's unchanged five-field/4096-byte DTO. Synthetic demo Team
description state is independent of Room roles and duplicate joined labels.

Named-only `:WebexDescribeTeam` / `:WebexTeamDescriptionSubmit` / Cancel use
the same private `s:descriptions`, shared read-pending/clock and **eight active
Room+Team preparations combined**, no extra live draft registry. Each distinct
edit buffer retains native text/full undo; the on-demand list window is reused,
not a permanent or accumulating split. Scope ownership prevents either Room
or Team commands adopting the other. Exact joined source/row/cursor-away-return/
window/tick/session/query/age and callback guards prevent abandoned preparation
from stealing focus, opening edits or wedging a newer read. Submit binds current
plain private metadata/text around confirmation, rejecting copied `b:` fields,
forged raw preimages, reply/file/Markdown/recipient/Room/promoted contexts or
newer text/window/session/age changes. Completion/cancel retires only private
authority/status; it never blanks/replaces text or native undo.
Unlike rename, **description ACK leaves Team labels/name/joined cache/query/
revision/timestamp untouched**. No main Room/cache/roster/role/history/activity/
unread/notification/receipt/delivery publication or filter/sections change.
Wnr Remove Member, Team-list Enter filtering, key families, shadows/opt-outs,
draft/reply/file destinations, annotations/promotions, focus and colorschemes
stay intact. Independent meeting owner/transmission-off/tmux/detach defaults
are unchanged.

Retained `mf24-team-description-focused-1/`: **699 backend / eight docs pass**;
native **62/64**, drawn **34/36**, and TypeScript fail at actual integration
gaps (lazy capability-owner initialization and recovery-union narrowing).
`mf24-team-description-targeted-2/` confirms those fixes but exposes Vim split
exhaustion from repeated canceled preparations. Reusing the on-demand list
window fixes accumulation without discarding edit buffers or weakening tests.
`mf24-team-description-targeted-3/` passes TypeScript, four native fixtures and
**107 backend checks (24 contracts / 83 physical transport cases)**. Later
additions cover copied public metadata, cursor/notes/revision/future/age callback
fences, malformed/mismatched results and both directions of the combined budget.
No historical failed/red evidence is promoted; no old accepted test is weakened.

`mf24-team-description-focused-2/` passes **782 backend, 64 native, 36 drawn,
eight docs and TypeScript**, zero skips/cancellations and no checkout changes
during verification. This includes all 24 formerly-red backend contracts,
four native/four drawn description specifications and **83 real-engine/
PublicREST physical cases**, plus unchanged affected regressions. Native
malformed/mismatch/old-ACK, source/cursor/time, copied-DTO and both-direction
combined-eight-budget guards execute in both editors. Counts overlap; do not
sum suites as independent acceptance.
A fresh isolated integrated gate was required; its paused, unaccepted result
is recorded below.
No checkout build, installed configuration/dependency/grant change,
authenticated Webex/OAuth/receipt/device/tenant operation, reconnect, automatic
opener/download, activation, commit/push or Atlassian work. Live name-echo/
description/permission/tenant/atomic-update acceptance remains unverified.
Team clearing/lifecycle/membership/other roles and standalone moderator/MF22
preference writes stay gated, as do MF10/reaction/Sections/storage/account
operations. Gate 19's intermittent legacy Neovim Room-description failure
remains unexplained, not fixed by this work. `full_plan_complete:false`.

### MF24 Team-description gate 21 and pause checkpoint

**2026-11-16 — PAUSED, implemented but NOT runtime-accepted.**
`/tmp/opencode/wbx-messaging-parity-341sx5zc/mf24-team-description-gate-21/`
freezes **462 sources**. Every functional/build/help check passes:

| Check | Result |
| --- | --- |
| TypeScript / five isolated copied builds | Pass |
| Core | **1584 pass / 14 deliberate skips**, zero failures/cancellations |
| Actual Vim/Neovim native fixtures | **189 pass / zero skips** |
| Drawn PTYs | **169 pass / zero skips**; Neovim-only image-incremental is not counted as a Vim pass |
| SDK/cache/profile | **178 pass / zero skips** |
| Synthetic messaging / browser / research / loader | **44 / 3 / 6 / 2 pass**, zero skips |
| Documentation / both native help generators | **8 pass / both generators pass** |
| Source freeze / HEAD and empty staging / diff check | Pass; no source changes during gate |
| Historical checkout bundles | **FAIL**; overall gate exits **1**, not accepted |

Seven of the ten checkout bundle/map hashes differ from the original frozen
baseline. Observed checkout mtimes are **2026-11-15 23:55:48**, before isolated
gate-21 launch at **23:58:39**; the cause/actor is **unproven**, not attributed
to the copied build. All ten observed files and old/new hashes are retained
in `mf24-team-description-bundle-drift/`, with the earlier inspection in
`mf24-team-description-runtime-boundary-inspection.json`. No bundle is reverted,
overwritten, rebuilt or silently accepted as a new baseline by this work.
Historical manifests/gates remain immutable; functional passes do not waive
the failed integrity check. No final runtime-acceptance manifest is issued.

The pre-pause recheck in `mf24-team-description-pause-checks/` passes
**107 backend (24 contracts / 83 physical), 12 affected native, eight docs,
TypeScript and diff checks**, zero skips/cancellations. Both sources and the
observed bundles stay unchanged during that check; HEAD/empty staging remain
unchanged. Counts overlap; do not sum suites. Existing implementation fixes
remain in place; no additional functional failure was found to repair.
The final two Markdown status edits receive a separate fresh documentation
check in `mf24-team-description-pause-documentation.log`; the pause record is
`mf24-team-description-runtime-pause-finalization.json`, explicitly **not**
runtime acceptance.

Roadmap work is paused at the user's request. No retry gate, bundle restoration,
rebaseline, installed configuration change, hot-source/reconnect, credential/
grant operation, live service probe, activation, commit/push or new feature is
performed to bypass the blocker. Resuming formal acceptance requires resolving
the bundle-integrity provenance/baseline decision explicitly. No current code
test is reported red, and no full-gate acceptance is claimed.
`team_description_runtime_implemented:true`,
`team_description_runtime_accepted:false`, `roadmap_paused:true`,
`full_plan_complete:false`. All clear/role/preference/provider/security gates
and the unresolved gate-19 legacy native-fixture result remain binding.

## Verification and retained lineage

- `red/`: before implementation, the context test and both actual editors fail
  for the missing session DTO/capability. `first-green/` retains a fixture error
  calling nonexistent `wbx#setup`; changed to the existing catalogue setup API.
- `focused-2/`: TypeScript and 12 native checks pass. `focused-3/` retains the
  newly added unloaded-list regression: noncurrent BufUnload must inspect
  `<abuf>`, not current-buffer variables. `focused-4/` passes eight affected native
  checks after the targeted lifecycle correction.
- `mp2-gate-1/`: **not an accepted full gate**. Its frozen 396-source project
  passes TypeScript/five builds, 802 core / 14 deliberate skips, 127 native,
  165 SDK/cache, 44 synthetic messaging, three browser, six research/nonactivation,
  two available-loader and eight documentation tests, both help generators.
  105/107 drawn checks pass; both new saturation fixtures hit the native
  `-- More --` pager, confirmed in retained PTY captures. The fixtures now set
  `nomore`, rather than weakening any assertion or suppressing a runtime failure.
  All frozen inputs/bundles/HEAD/staging integrity checks passed.
  MF20 changes made while this copied gate ran are explicitly **outside** it.
- `directory-red/`: expected missing module failure before MF20 implementation.
  `directory-focused-1/` passes seven backend tests/TypeScript.
  `directory-focused-2/` passes eight backend and ten actual native tests,
  including same-name IDs, query-bound hostile paging, grant/refusal/expiry,
  dropped/late callbacks, annotation/promotion and no-placeholder behavior.

`mp2-directory-gate-2/summary.json`: **PASS**, frozen 402-source project.
TypeScript/five copied builds, **810 core / 14 deliberate skips, 131 native /
zero skips, 111 drawn / zero skips, 165 SDK/cache, 44 synthetic messaging,
three browser, six research/nonactivation, two loader and eight documentation
tests**, both help generators and all integrity checks pass. This accepts the
local MP2 and MF20 slices offline only. The initial drawn failures remain in
`mp2-gate-1/`; no assertions were weakened.

The subsequent MF07/MF11 contract/tests/runtime are a **new slice outside that
frozen pass** and require their own gate. MP1's durable identity/security
contracts and the rest of MP3–MP9 remain incomplete. No live
Webex/OAuth/receipt/device tests occurred.

### MF07/MF11 verification lineage

- `message-reads-red/` retains the expected missing-module failure.
  `message-reads-native-red/` retains missing native-key/view failures in both
  editors before integration. `message-reads-focused-1/` passes eight initial
  backend tests and TypeScript.
- `message-reads-native-1/` retains a Neovim resize-fixture error: the fixture's
  existing splits require at least 14 screen rows. The narrow-window test now
  uses a valid 16-row screen; no feature assertion was removed. Vim passed.
- `message-reads-focused-2/` passes nine backend and 14 affected native tests.
  `message-reads-focused-3/` passes **13 backend, 14 affected native, four drawn
  query checks, eight documentation checks and TypeScript**, all zero skips.
  Added fixed-public-boundary loopback tests prove the source/root/page GET
  counts and no redirects/retries on 302/429. The actual-demo root reply uses
  the existing explicit Send/ACK path, with normal draft/undo unaffected.
- The shared exact-ID jump's final transport recheck and query observation-time
  label are subsequent small changes included in the fresh copied gate below,
  not silently attributed to those focused runs.

Remaining catalogue rows are neither implemented nor accepted by these focused
passes; final integrated evidence follows below.

The navigation review added a new regression in `message-jump-red/`: both editors
proved that a programmatic result jump could arm native older-history paging.
The shared exact-ID helper now centers the explicit target and resets the paging
baseline. It also refuses a reply hidden inside another message's closed fold,
preserving the fold and returning to the query rather than substituting the root.
Query headers now show the original exact room/root IDs as well as observation
time. `message-jump-green/` passes 14 affected native and four drawn query checks.
`mp3-reads-gate-3/` passes its frozen suites but predates this regression/fix and
is intermediate, not final-source acceptance.

### MF07/MF11 integrated acceptance

**PASS — offline only:** `/tmp/opencode/wbx-messaging-parity-341sx5zc/mp3-reads-gate-4/`
freezes **407** current source inputs. Its `summary.json` records zero status for:

| Gate | Result |
| --- | --- |
| TypeScript / five copied builds | Pass |
| Core | **823 pass / 14 deliberate opt-in skips** |
| Actual Vim/Neovim native fixtures | **135 pass / zero skips** |
| Private drawn PTYs | **115 pass / zero skips**; Neovim-only incremental-image fixture not counted as a Vim pass |
| Network-blocked SDK/read-status/presence/cache | **165 pass / zero skips** |
| Synthetic standalone messaging | **44 pass** |
| Synthetic browser controls | **3 pass** |
| Research/nonactivation | **6 pass** |
| Available loader integration | **2 pass** |
| Documentation / both help generators | **8 pass / both generators pass** |
| Frozen inputs, checkout bundles, HEAD/staging, diff check | Pass |

Counts overlap; do not sum them into independent cases. This is current-source
offline acceptance for the local/directory and selected-room thread/@me slices,
**not all MF01–MF26**, all of MP3, live service/filter/tenant acceptance, or
authorization to activate/reconnect the installed client.

Finalization records `reads-finalization.json` beside the gates, checks that only
this ledger, the verification index and the provider-audit Markdown changed
after the gate, reruns documentation checks, and preserves all runtime/test/help
hashes and ten checkout bundle/map hashes. No installed configuration,
dependencies, unrelated work, HEAD or staging changes.
