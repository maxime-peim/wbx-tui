# Bounded coordinator audit and completion checklist

## Decision

**The bounded ownership audit and C1–C4 offline implementation checklist are
complete.** C1/C2 are fixed and C3/C4 have direct combined/vertical evidence.
Live service, devices/media and operator readout remain separate NOT RUN
acceptance, not implied by offline closure. There is no further line-count target or
pre-authorized extraction programme.

Scope: current `EditorEngine`, native `autoload/wbx.vim` and bridging `EditorRPC`.
The worker matters because output ordering, replay and shutdown can break
otherwise correct feature owners. Existing feature internals are referenced,
not recursively counted as more coordinators. This is a source/contract and
coverage review, not proof that every possible race has been tested.

| Scoped surface | State bindings | Routines |
| --- | ---: | ---: |
| `src/editor-engine.ts` / `EditorEngine` | 54, including constructor parameter properties | 110, including constructor |
| `autoload/wbx.vim` | 22 script bindings + existing event-payload global | 134 functions |
| `src/editor-worker.ts` / `EditorRPC` | 13, including injected owners | 5 class routines + `runEditorWorker` |
| Application snapshot | 31 projected members | Not 31 additional mutable stores |

All **90 bindings and 250 routines** map exactly once to **30 responsibilities**.
All 31 snapshot members have producer/authority classifications.
[The machine-readable audit](coordinator-audit.json) records **each symbol**,
its owner/lifetime, invalidation triggers, cross-layer trace, positive/recovery
test pointers, coverage limitations and completion-item references.

`scripts/audit-coordinators.ts` parses actual TypeScript class members,
constructor-injected fields, module functions and native script/global
assignments, including those inside callbacks. TypeScript infers snapshot
members, including optional spreads. The checker rejects unmapped, duplicate
and stale entries and broken evidence anchors. This is a static review artifact,
**not a runtime registry/framework**. Passing it establishes inventory/link
completeness, not semantic or branch coverage; the linked assertions still need
human review.

## Remaining responsibility decisions

Exact method/field membership is in the JSON. “Keep” means a legitimate
coordinator role, not a request to add another forwarding module.

| ID | Responsibility/state authority | Decision |
| --- | --- | --- |
| E-compose | Concrete construction, injected seams, shared PublicREST physical admission | Keep composition root, not a provider registry |
| E-session | OAuth/access, application generation, UI session, mode/config/readiness | Keep one application lifetime; C3 combined failure/stop/replacement evidence passes |
| E-projection | Detached snapshot, publication revision, application notice | Keep explicit assembly, no broad memoization |
| E-store | MessagingStore, room/history facades, exact revocation fan-out | Keep consistency boundary; C4 vertical evidence |
| E-source-unread | Current SDK lease/health/events versus historical unread; receipts | Keep distinct owners; C4 traces their bridge |
| E-cache | Verified disk hints and initial-list visibility latch | Keep cache separate from catalogue/unread truth |
| E-storage | Verified identity, drafts/profile/revision, preferences/user intent | Keep separate physical reservations, shared identity |
| E-people-names | Presence relevance versus name cache/grant/denial latch | Keep optional reads independent of history/token renewal |
| E-agenda | Discovery/session facade and revision-checked join target | Keep discovery separate from meeting/media |
| E-attachments | Logical resolve map, pipeline token, transfer and content admission | Keep: C3 proves logical retirement and independent physical content/cleanup reservation |
| E-send-upload | Plain/rich/file admission, preflight, submission certainty, delivery | Keep: C3 proves old physical upload/FD lifetime and subsequent deliberate work without stale publication |
| E-feature-reads | Current-target/grant/action gate, directory/query/roster/Team owners | Keep finite adapters, no generic service tunnel |
| E-message-actions | Message mutation and reaction preparation/outcome facades | Keep; **reset retention differs**, see below |
| E-conversations | Recipient/space/Team mutation facade and direct display transaction | Keep routing; C2 fixed in existing ledger owner |
| E-meeting-auth | Socket-only reuse of current authorization | Keep, never second-sign-in fallback |
| N-state | Revision-admitted snapshot, intent epoch, scalar display counts | Keep ordered invalidation; C4 vertical evidence |
| N-transport | Protocol dispatch, connection/RPC owner, exit fan-out | Keep domain ingress, not duplicate handshake/jobs |
| N-workspace | Workspace/setup handles and native compatibility adapters | Keep native text/maps/windows authoritative |
| N-selection | Picker/selection/activation, exact endpoint commands | Keep menu, focus-request and receipt lifetimes separate |
| N-composer-delivery | Ports-only send/ingress/clear/recovery handles | Keep pending/uncertainty/text out of coordinator fields |
| N-render | Renderer/render-request handles and context adapters | Keep presentation retry; C1 fixed in syntax/text-color ownership, not backend state |
| N-attachments | Logical action/image handles and callbacks | Keep physical jobs/bytes/sinks separate |
| N-meeting | Independent action/observation handle and pure status adapter | Keep; messaging failure cannot end media |
| N-paging | Navigation over existing paging token owner | Keep; page failure/absence is not deletion |
| N-selectors | Capabilities/destination/source/viewport/status selectors | Keep; support is not grant/membership authority |
| N-diagnostics | Notice, existing User-event payload, local Health | Keep observable, never raw provider/private logs |
| N-shutdown | Disconnect/exit cleanup and closing flag | Keep messaging stop, detach and optional leave distinct |
| W-routing | Finite protocol dispatch and bounded request/replay tables | Keep; RPC acceptance is not delivery |
| W-state-output | One equivalent-lane microtask presentation slot | Keep authority/evidence barriers; never resnapshot |
| W-shutdown | Admission barrier, idempotent close and stdio lifecycle | Keep; explicit new worker/handshake, no request replay |

## State interactions and invalidation matrix

There is no single “session” that can safely replace these lifetimes.
Application `state == ready`, selected-history `ready`, negotiated protocol
readiness, current SDK health, disk binding and independent meeting readiness
are different facts.

| Trigger | Logical invalidation/publication | Evidence or physical work retained |
| --- | --- | --- |
| Same-session room selection/reload | Conversation owner changes; query reset, presence pause/sync, attachment destination cancel; native focus/view guards recheck | Session and source lease remain; background destination-bound sends do not become new-account work; native text/undo remain |
| Exact room revocation | Forget exact room in upload/read/unread/disk, selected roster/presence/query; emit `room.revoked` before store revocation; native advances context and revokes exact draft/upload/notification authority | Other rooms remain usable; retained text is nonauthoritative; partial page absence never invokes this path |
| SDK refresh degradation | Clear source fresh-room set, change degradation/revision, revoke reaction preparation; historical unread becomes stale | Same-source labels may remain explicitly cached; no receipt/write authority |
| SDK terminal failure/replacement | Retire current source/lease/event authority | Historical unread and physically draining provider admission follow their own rules; history can remain ready |
| Token-only renewal | Update actual token/grant/expiry; replace source/presence ownership and agenda session as required | Same-grant sender denial/cache is not reset; shared People/REST physical admission does not restart |
| Application `failed()` | Stop cache/presence/names/preferences/uploads/actions/conversations/agenda/source, close store/OAuth, publish failed | Does **not** increment generation or perform all stop resets; state/current-owner predicates make consumers inactive. C3 tests interaction, not just each owner |
| Explicit `stopSession()` / replacement | Clear UI session/identity/draft-open/cache binding, reset feature/query owners, abort logical work, increment generation, close store/OAuth, publish idle | Physical storage/HTTP/converter/upload reservations must settle; native possible-write evidence is not remote absence |
| Native accepted ready-to-ready session change | Cancel render/attachment/image, reset session assertions, retire pending sends into uncertainty; captured session fences selection ACK | Native drafts/annotations/promoted buffers remain; independent meeting is not messaging state |
| Native transport exit | Clear handshake/RPC callbacks, retire actions/focus/read intents, mark meeting unready, retain drafts, emit disconnected event | Monotonic request identity, possible-write evidence, independent media-unknown state remain |
| Native explicit disconnect | Flush drafts, invalidate actions/reads, request `session.stop` | Native buffers/undo and independent meeting remain |
| Editor/worker shutdown | Backend admission barrier, optional explicit media leave, bounded native wait/client stop | No new operation behind shutdown; media-exit proof remains original-process/PID responsibility |
| Native edit/promotion | Pause guarded writes or relinquish generated-view ownership; exact mapping/setup release | User text/full undo, themes, native `breakat`, independent windows/folds and user mappings remain |

Nested records are not hidden authorities: `attachmentOperations` entries contain
captured `store`, `generation`, `abort`; `uploadTransaction` contains captured
`generation`; native `room_counts` contains only `unread_stale`/`cached`.
RPC completed entries retain exact wire identity/response; one-shot bodies are
replaced by a replay error. Other nested snapshot data is delegated projection.
Local callback captures are scoped evidence, not persistent session registries.

### Retention is not uniform

The audit corrects a misleading generalization:

- Native drafts, message-action unknown targets and conversation unknown intents
  can survive invalidation without authorizing retry.
- `MessageReactions.reset()` retains exact-request uncertain reaction evidence.
- **`MessageActions.reset()` clears backend contexts/requests/uncertainty/edit
  counts.** Conversation reset clears active requests/uncertainty/recipients/
  sent IDs, but now moves partition-proven metadata possible-writes to its
  disjoint retired request section. Both sections share the original limit;
  requests are moved, not copied. Legacy nonmetadata reset rules are unchanged.
- OperationSlots still retain unsettled physical work. A late old result cannot
  repopulate active requests, install metadata or change retired evidence.
- Retired metadata never replays into a new session. Explicit wire recovery
  freshly reads authenticated self with the existing grant, compares the exact
  config/client/redirect/configured-scopes/account partition, and only resolves
  the original action/target/request. The synchronous APIs remain same-session.
  No extra identity read is added to normal metadata preflight or storage.
- Checked recovery can be repeated if its ACK was lost, but cannot resolve a
  newer unknown. Evidence is bounded and process-local across session reset/
  reconnect; no persistence or restart/replay facility was added.

Do not retain arbitrary old-account handles, create another recovery authority,
loosen exact-request matching or treat reset as remote failure.
The existing new-session isolation tests remain valid.

## Cross-layer failure walkthroughs

### Ready history but stale/unknown unread or reactions

1. Private SDK child `read-status-worker` emits sanitized health, observations
   or exact changes through `ReadStatusWorker`.
2. `ReadSourceLifecycle` checks current owner/session and updates source
   epoch/revision/health. Healthy-but-empty is not per-room freshness.
3. Engine reconciles unread/cache/store activity; `publish()` assembles source
   evidence and ready history separately.
4. `EditorRPC` preserves authority/evidence lane barriers through same-turn
   bursts; bounded physical output/framing is another layer.
5. Native protocol/revision admission applies state; local unread/rendering/
   reaction owners consume it under their own guards.
6. Inspect `:WebexHealth` physical/protocol readiness, `read_status`,
   `read_status_notice`, `reaction_reads`, cache status/counts, then source
   category/epoch/revision. Unavailable never means zero/read/deleted.
7. **C4 now composes the whole trace:** forked synthetic SDK → actual worker
   stdio → Vim/Neovim, headless/drawn. It proves ready history, terminal source
   failure with stale/unknown Health, explicit source recovery/new epoch, exact
   deletion/self-revocation, stale-data rejection and successful new selection/
   native work. Adjacent fixtures are not substituted for this proof.

### Unknown metadata write after reconnect

1. Native exact consent records and submits original named-action request.
2. Engine/ConversationActions repeat target/grant/preimage proof, reserve
   physical admission and classify ambiguous post-submission outcome unknown.
3. Native retains the intent, blocks conflicting writes and offers explicit
   `:WebexConversationResolve` after checking Webex.
4. Previously reset discarded the request and recovery failed **`-32035`**.
   Now reset moves dispatch-bound metadata evidence to the inert retired section
   without accepting any late completion or releasing physical admission.
5. `conversations.resolve` awaits `recoverConversationAction`: under shared
   admission, authenticate current self and compare its real partition. Wrong
   account/config/profile, original request or target is refused without
   consuming evidence. Team choices use the current recovery session, not the
   retired intent's session.
6. A successful response removes only matching native unknown evidence while
   preserving text/undo. A new deliberate request still repeats ordinary
   preflight; no PUT, target read, publication or automatic retry is recovery.

The account-free probe made one simulated possible-write rename, then explicitly
stopped/restarted the same engine/demo partition and selected the exact room:
backend request/unknown counts **1/1 → 0/0**; original recovery returned
`-32035`; **one attempted write, zero network requests, zero retries**.
This is preserved **baseline failure evidence**, not current behavior. New
regressions prove recovery and subsequent deliberate work for all seven metadata
actions, loopback engine/RPC account/config/profile isolation, held-PUT stop and
auth failure, and real native space/Team workflows in both editors. No live
account or remote outcome is inferred.

## Finite completion checklist

No further extraction is required unless a gate demonstrates it is needed.

| ID | Classification | Required completion evidence |
| --- | --- | --- |
| C1 | **Closed:** fallback and painted-header timestamp styling | Original `ui.vim` unchanged; metadata-bucket/Markdown/folding and timestamp paint fixtures pass headless/drawn in both editors; UI restored to maintained focused gate with omission regression |
| C2 | **Closed:** reset/reconnect original metadata recovery | All seven actions recover; exact account/config/profile/request/target and physical fences remain; both editors recover space/Team actions and perform new deliberate work without replay |
| C3 | **Closed coverage gap; no runtime defect reproduced:** combined failure/stop physical consumers | 36 three-consumer cases cover storage phases, metadata/upload writes, both settlement orders, failed/idle and ready replacement; retain uncertainty, forbid early physical release/replay and complete fresh storage/content/write work |
| C4 | **Closed coverage gap; runtime unchanged:** SDK-to-native vertical recovery | Four headless/drawn Vim/Neovim cells drive actual entry/framing/output/default fork; sanitized Health/request/process/IPC traces prove failure, stale/unknown, exact invalidation, explicit recovery/new work and zero mutation replay |

External acceptance—not a reason to leave this offline audit open:

| ID | Unrun acceptance | Requirement |
| --- | --- | --- |
| L1 | Live People/reaction return and original delay attribution | Separate service/operator authorization, sanitized layer timing |
| L2 | Graphical Kitty/device/live media | Device/second-endpoint authorization; observed transmission and actual leave |
| L3 | Assistive readout | Operator walkthrough in the real setup; text assertions are not accessibility acceptance |

Detailed owners, anchors and exits are in [the checklist data](coordinator-audit.json).
External checks remain **NOT RUN**. No credential, live reconnect, post, receipt
or device action is authorized by this document.

## Evidence and audit maintenance

C4: `/tmp/opencode/wbx-c4-native-source-s4hegr8s/`.
`test/editor/sdk-native-build.mjs` privately bundles the actual eight-line editor
entry and actual SDK-worker entry. It prepends synthetic auth/REST and read-only
stdio observers only; the SDK boundary is substituted in the child. Default
engine/meeting construction, `EditorLines`, `EditorRPC`, lane-preserving
`editorOutput`, real fork/private IPC and native ingress are unchanged.
Private build proofs hash original runtime sources and bundled outputs.
No hand-authored editor RPC, fabricated IPC, test RPC method or production
configuration/provider default was introduced.

The synthetic SDK is controlled through atomic private HOME phase files.
A genuine asynchronous SDK exception traverses the worker's real terminal
failure handler. A and B retain stale historical unread while U stays unknown;
the app/history/protocol remain ready. Removing the fault does not retry.
`:WebexAuthRefresh` starts exactly one new child/source epoch in the same native
UI session. Wrong-room/nonself events cannot revoke A; exact deletion and
self-membership loss can. REST and SDK deliberately keep returning stale A.
Then explicit B selection/history and fresh unsent work succeed. Background
stages preserve native draft/annotations, full undo, focus, independent split
folds, theme, `breakat` and Wnr.

Whitelisted traces contain fixed synthetic IDs, source epochs, health/method
metadata, process IDs and IPC types—not credentials, raw SDK errors, body/draft
text or configuration/binding paths. One stdin request has one stdout ACK.
Network/browser/provider writes/receipts and unexpected RPCs are forbidden;
normal Enter/write never sends. Both SDK processes and the editor exit cleanly.
The fixture is registered for both modes/editors and both maintained focused
gates. Two isolated negative controls detect a missing failure-epoch retirement
and broken exact-deletion routing; these are test faults, not checkout defects.
This is a real process/stdio/native **synthetic** proof, not installed SDK,
live service timing, media or assistive acceptance.

C3 combined held-I/O evidence:
`/tmp/opencode/wbx-c3-held-io-3shr47ah/`. The 36-case matrix in
`test/mixed-cleanup-integration.test.ts` uses one actual engine/RPC per case,
real private draft files, actual Webex content/admission/transfer owners,
PublicREST/ConversationActions or file-backed Uploads/common delivery owners.
Only OAuth/identity/fetch/request and load/save port boundaries are synthetic.
No runtime inputs changed and no cleanup defect was manufactured to justify
another extraction.

| Matrix axis | Cases |
| --- | --- |
| Invalidation | OAuth-refresh failure invoking application `failed()`, explicit stop, explicit account-A → account-B replacement |
| Storage port held | Draft open-load, save's revision-load, save/commit port |
| Concurrent submitted writer | Exact metadata PUT, actual staged-file multipart upload |
| Settlement order | Storage first, network first |

Every case starts with **storage + content GET + submitted write all held**.
Failure/stop variants settle one side while still failed/idle before explicit
restart; failure does not advance application generation, so this proves the
state/current-owner guard rather than relying only on replacement. Replacement
keeps all three consumers held until B is ready. Fresh work on a released side
can complete while another side remains held.

Late headers still wait for body cancellation; a valid late ACK still waits for
ClientRequest close; an actual anonymous upload snapshot FD remains open until
its native send drains. Failed admissions never queue/replay. Old storage
cannot commit/return a stale profile or clear exact persisted reply uncertainty.
Old write evidence stays unknown/inert, not new-account authority; metadata
recovery rejects B's use of A's evidence and succeeds after an explicit return.
Each case then saves/restores current private drafts, pulls/completes current
attachment bytes and confirms exactly one new deliberate metadata/upload write.
Each late completion is checked against a detached snapshot and all engine
state/delivery/progress/invalidation events.

The held load/save ports are backed by real LocalDrafts operations; this is
controlled lifetime/commit-admission evidence, not OS-crash/fsync fault injection.
The transport boundary deliberately ignores abort and withholds cleanup;
no network, browser, People/SDK or optional-cache operation is authorized.
Sanitized finite traces name invalidation, settlement and fresh-work steps.
`negative-controls.json` records expected failures after isolated-copy-only
faults: early draft-I/O release, early content-lease release and stale draft
acceptance while failed. These demonstrate detection, not checkout defects.
C4's separate forked SDK/actual stdio/native proof is recorded above.

Evidence root: `/tmp/opencode/wbx-coordinator-audit-itu7ko_5/`.

C1 fix/regressions: `/tmp/opencode/wbx-c1-timestamps-0qrieu7_/`.
The zone-less fallback conflicted with a zone-required child rule. Drawn probes
also showed whole-header text properties/extmarks masking correct metadata
timestamp syntax. Matching suffix grammar and leaving header text colors to
syntax fix both: no extra source/view/cache state or coordinator was introduced.
`built-matrix.json` records **28/28** passing cells (seven fixtures × headless/
drawn × Vim/Neovim). The original UI file, timestamp assertion and existing
metadata/Markdown/folding fixtures are byte-identical. UI is no longer omitted
from maintained focused acceptance; the full inventory already required it.
Historical exclusion/failure evidence below is retained, not rewritten.

C2 fix/regressions: `/tmp/opencode/wbx-c2-recovery-dd7lvsul/`. The preserved
baseline fails the new owner, loopback RPC and both-editor native regressions.
The candidate's `candidate-tests.log` passes all 647 scoped metadata/Team/
conversation/identity/editor tests; `candidate-native.json` passes all eight
selected native cells, including unchanged recovery and Team boundary fixtures.
Final evidence is indexed in [verification](verification-index.md).

- `known-ui-native.json`: the audit baseline reproduced C1 in **both**
  editors: expected `WbxMessageTime`, received `WbxMessageHeader`. Failure is
  recorded, not relabeled as a pass.
- `unknown-reset-probe.json`: actual account-free engine/ledger C2 reproduction;
  network/browser calls forbidden.
- `verified-audit.log`: complete symbol/projection partition and anchor checks.
- `verified-results.json`: new checker/contracts/typecheck and selected existing
  offline integration suites in a preserved copy. No runtime/build change
  warrants another two-build/full regression loop for this audit-only slice.
- Last whole-runtime gate:
  `/tmp/opencode/wbx-architecture-meeting-status-p4tdb4z1/final-handoff-checks.json`.
  Its **1,913 core / 15 skips, 216 native, 206 drawn, 71 SDK and six meeting
  lifecycle** counts are historical evidence, not newly rerun counts.

Reproduce checking from an isolated copy:

```sh
node --import tsx scripts/audit-coordinators.ts
node --import tsx --test test/coordinator-audit.test.ts
```

For a new coordinator field/routine/snapshot member, update its exact
responsibility, lifecycle/invalidations and trace/test pointers. If normal
recovery is untested, add a bounded checklist item rather than calling a
refusal-only test a workflow. Do not silently expand this audit's scope or
declare the full architecture objective complete from inventory counts.
