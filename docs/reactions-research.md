# R6a — Persistent space reaction feasibility

Status: **research complete; NO-GO for runtime in this batch** (2026-11-14).
Internal-interface risk approval is absent. Source compatibility is demonstrated
offline, not service acceptance. No runtime owner, RPC, capability, editor command,
configuration option, SDK upgrade or meeting-owner change was added.

**2026-11-17 follow-up:** after the research milestone, the user explicitly
approved internal-interface implementation and offline tests. The
[current implementation contract](reactions-implementation-plan.md) supersedes
the historical NO-GO for source integration, not the live-acceptance gates.
It records native commands (now default on at the user's request), a separate production reaction fence,
partial/unknown live counts and restart write-locking. No new device, grant,
dependency, live operation, bundle replacement or activation is authorized.
The historical findings/counts below are not acceptance of that later runtime.

## Decision and evidence levels

| Question | Finding | Evidence level |
| --- | --- | --- |
| Technically possible in pinned SDK? | `addReaction`, `deleteReaction`, `sendReaction`, `getReactionSummaryByParentId` exist and execute with synthetic boundaries. | Actual installed 3.13.0 code |
| Persistent space vs meeting reaction? | Conversation activity targets and parent activity IDs support space-message/reply research. Optional recipient arguments also serve direct in-meeting chat (IMC); those arguments do not prove persistent-space acceptance. Meetings' transient reaction UI is a different feature. | Source, not live acceptance |
| Public `messages` API contract? | No public message reaction contract found in the reviewed public Messages documentation/plugin. Internal methods are not a public API guarantee. | Bounded source/document review |
| Safe one-shot writer today? | **No.** Actual `submit()` launches detached key-rotation follow-up requests. The existing request fence applies only to `acknowledge`, not reaction `add`/`delete`. | Actual method executed with stubbed requests |
| Count/own-ID/event schema established? | Summary type filtering and activity relationships established; authoritative count/own-reaction-ID wire fields, event ordering and completeness remain unverified. | Source + explicitly synthetic simulation |
| Runtime decision | Do not integrate even display into today's metadata worker without a separately approved internal provider contract. | Stop gate retained |

## Exact inputs and reproducibility

Frozen pre-R6 baseline: `/tmp/opencode/wbx-r6-i_8kinur/` (359 sources, ten original
bundle/map hashes). The optional dependency tree was already installed; nothing
was installed, changed or rebuilt.

[Machine-readable inventory](../test/research/sdk-inventory.json) pins 45
package/source/distribution inputs with SHA-256. It includes both reviewed `src`
and actually executed `dist`, not an assumption that the two are interchangeable.
The existing [optional lockfile](../optional/read-status-sdk/package-lock.json)
pins the full transitive resolution and integrity metadata; SHA-256:
`275caaa85a779f25b8756351fd0b38b245387568ce4cc982664381cc6c2c0e1d`.

| Component | Installed version | Responsibility / dependency chain |
| --- | --- | --- |
| `@webex/internal-plugin-conversation` | 3.13.0 | Activity preparation/submission, HMAC, summaries; depends on encryption/user/core and crypto-js |
| `@webex/internal-plugin-encryption` | 3.13.0 | KMS/key storage and outbound/inbound transforms; depends on device/Mercury/core, node-kms/node-jose |
| `@webex/internal-plugin-device`, `internal-plugin-mercury` | 3.13.0 | Authenticated device identity, discovery/event connection; not invoked by the fixture |
| `@webex/webex-core`, `http-core` | 3.13.0 | Plugin/credential/service/interceptor pipeline and Node transport |
| `@webex/plugin-messages`, `plugin-rooms`, `plugin-memberships` | 3.13.0 | Existing public projections/metadata chain; not a reaction runtime contract |
| `@webex/plugin-authorization`, `plugin-authorization-node` | 3.13.0 | Auth flow dependencies; no authorization performed |
| `request` / `crypto-js` | 2.88.2 / 4.2.0 | Native transport / HMAC implementation |

Portable, opt-in, offline-only checks from the project root:

```sh
WBX_REACTIONS_RESEARCH_TEST=1 node --import tsx --test test/research/*.test.ts
```

Without that flag, the actual-SDK/source-audit tests skip explicitly. The three
simulation tests need no optional SDK. Missing dependencies are a failure when
opted in, not permission to install. No credentials/configuration are read.
[SDK fixture](../test/research/reactions-sdk.test.ts) blocks socket connect, TLS,
HTTP/HTTPS, DNS and fetch, and traps device register/unregister. Expected:
**five passes, zero skips**, native I/O **0**, registrations **0**.
Final integrated gate/evidence is recorded in the [verification index](verification-index.md).

## Offline evidence and limits

Focused evidence: `/tmp/opencode/wbx-r6-i_8kinur/research-first.log` and
`research-final-candidate.log`. Final integrated copied-project gate:
`/tmp/opencode/wbx-r6-verification-dl7zik8a/`. Five opted-in checks pass with zero
skips, native I/O or registrations. The full gate passes 763 core tests/14 opt-in
skips, 101 native/zero editor skips, 75 drawn fixtures, 145 SDK/cache, 44 messaging
and three browser controls; TypeScript, five copied builds, docs and both-editor
help pass. LazyVim: one pass/one optional installed-loader skip. These overlapping
tiers are not a unique-test total.

All 366 source inputs matched the copied gate; 359 frozen pre-R6 sources/ten
original bundles were checked. All 114 pre-R6 runtime/dependency-manifest inputs
are unchanged, demonstrating this slice adds research rather than a runtime
writer. Default-off research invocation separately passes three simulations and
explicitly skips the two optional installed-SDK/source audits. Only evidence/
status docs change after the passing boundary, with final docs/integrity checks.

Preparation failures are retained at
`/tmp/opencode/wbx-r6-preparation-flhamvfd/research-v1.log`: an Ampersand
once-set request property rejected repeated assignment in the fixture. The
fixture now shadows that property once at the stub boundary; the actual submit
and two-stub-write/unknown assertions remain unchanged. All five checks pass in
`research-v3.log`. A relative report anchor typo was detected and corrected by
the documentation test. No service behavior was inferred from these harness
errors. Final evidence/status edits are checked separately from the full gate.

## Method, identity and summary characterization

Paths below are relative to `optional/read-status-sdk/node_modules/@webex/`;
line numbers refer to the hashed source inputs.

- `internal-plugin-conversation/src/conversation.js:246–263`:
  `createReactionHmac()` reads `parent.encryptionKeyUrl` from encryption's
  unbounded storage, parses the JWK, serializes **ordered** `{k,kid,kty}`, appends
  parent activity ID and display name, then HMAC-SHA256 with the parent ID as key.
  The fixture independently reproduces those bytes with Node crypto and synthetic
  JWK material. Reply and root IDs yield different HMACs. Real keys never enter
  this research and must never cross RPC or appear in logs.
- `:291–303`: `sendReaction()` resolves the conversation URL, calls `prepare()`
  with its target, then `submit()`. The fixture checks this route with preparation
  and submission stubbed; it **does not** prove live encryption/KMS transforms.
- `:335–397`: add is an `activity`, verb `add`, actor person, conversation target,
  `parent:{type:"reaction",id:parentActivity.id}`, and
  `object:{objectType:"reaction2",displayName,hmac}`. Delete is verb `delete`,
  `object:{objectType:"activity",id:reactionActivityId}`. Deletion therefore needs
  the exact own **reaction activity ID**, not the message ID or emoji alone.
  Both methods accept a caller actor override; the fixture demonstrates it.
  Any approved owner must derive authenticated actor identity itself and reject
  editor actor/URL/key/recipient overrides.
- `:923–937`: summary read targets the parent activity and filters `body.children`
  to `reactionSummary` / `reactionSelfSummary`; no children yields `[]`, whereas
  malformed non-array children reject. This is not proof that missing children
  is a complete zero count or that the self summary exposes a deletable ID.
- `src/activities.js:29–52,68` classifies add/summary/self-summary and extracts
  parent IDs. A delete is generic `DELETE`, requiring a separate mapping to known
  reaction identity so it is not misread as message deletion.
  `conversation.js:2134–2211` joins reactions/self summaries separately on reply
  and root IDs, retaining stable original root/reply identity around edits.
  Public message-ID to private activity-ID/cluster mapping remains a provider
  responsibility, not an editor string conversion.

The comment at `conversation.js:279,361` lists `celebrate`, `heart`, `thumbsup`,
`smiley`, `haha`, `confused`, `sad`. The actual method accepts arbitrary display
names in the fixture. Thus **neither accepted emoji vocabulary nor per-user/
message limits are established**; no full native emoji library or seven-item
service guarantee is promised. These are explicit no-go gaps, not guessed values.

## Authorization, encryption and replay inventory

| Layer | Observed behavior / implication |
| --- | --- |
| Messaging session | Current metadata/receipt owner admits only its existing `spark:all` including KMS contract. No reaction-specific grant sufficiency was verified. Configured scopes are not account grants. |
| Device/account | Actor fallback reads `internal.device.userId`; real discovery, device authorization and membership must be validated by a future approved owner. This fixture does not register or borrow a meeting device. |
| Encryption | Default `includeEncryptionTransforms:true`; `encryption-transforms.js:42–44` encrypts reaction display name. HMAC requires parent key storage and real transforms may invoke KMS. No proposed bypass/disable of encryption. |
| Conversation submission | `conversation.js:1359–1432` POSTs activities. `1400087` clears target key URL and launches another request; `1409004` / `1400049` retrieve current key URL then launch another request. Those promises are detached and outer result can resolve `undefined`. Fixture observes two **stub** write calls per branch, not two network writes. |
| Auth interceptor | `webex-core/src/interceptors/auth.js:123–178`: 401 can refresh credentials and replay when allowed/capable; `shouldRefreshAccessToken:false` suppresses that branch, not other replay layers. |
| App redirect interceptor | `src/interceptors/redirect.js:65–135`: `cisco-location` and supported body redirects call `webex.request()` again. Native redirect flags alone are insufficient. |
| Server-error handling | `src/lib/interceptors/server-error.js` may mark alternate service hosts and emit metrics, but rejects the original failure; do not invent a direct retry here. |
| Native request transport | `http-core/src/request/request.js`, `request/request.js`, `request/lib/redirect.js`: request options control redirects/pooling; reused pooled sockets have an ECONNRESET retry path. A future one-shot writer must fence beneath interceptors and use unpooled native admission. |
| Existing local fence | `src/read-status-sdk.ts:52–82` is receipt-only. Its nonreceipt branch intentionally delegates unchanged. Widening it casually would change the metadata/receipt contract and is **not approved**. |
| Event reconnection | Mercury has its own event-connection lifecycle/backoff. It is not a user-write retry policy and must not automatically revive uncertain mutations or receipt failure memory. |

No private endpoint was guessed or probed: the fixture supplies only
`synthetic.invalid` objects to SDK methods whose request boundary is stubbed.
Support policy for public SDK/API semver/EOL is **not** a promise for
`webex.internal.*`; no Cisco compatibility/support assurance for these internals
was obtained.

## Offline reconciliation demonstration and proposed boundary

[Simulation](../test/research/reactions-reconciliation.test.ts) deliberately uses
an **invented normalized summary**, not a claimed Webex wire DTO:

- Summary samples replace counts; duplicate/out-of-order event hints only mark
  them dirty. No plus/minus arithmetic from raw events.
- Account/room epoch and hints observed after read admission fence late results.
  A local hint counter is **not** claimed as a service revision/order token.
- Root/reply caches and exact own IDs are distinct; other people's IDs, stale
  samples and invalidated samples cannot authorize removal.
- Unknown add/undo races latch target writes. Same request returns the retained
  result; a new ID cannot silently retry. No optimistic rollback pretends failure
  proves a reaction absent.
- The later contract regression found that this original simulation cleared
  mutation records on room/account selection. It now resets presentation only,
  namespaces and retains mutation records, and permits only explicitly correlated
  inspection to resolve uncertainty without replay. This is retained-memory
  research, **not** worker/crash/restart durability or a production journal.
- Simulation budgets: 64 loaded message targets, 16 emoji/own IDs each, 256 hint
  identities, 32 mutation outcomes. Overflow invalidates/refuses rather than
  evicting an old request into replay. Creation/unread/receipt evidence stays zero.

These tests demonstrate a conservative design, **not** production event-schema
compatibility. If risk approval and provider/schema validation later exist:
use a narrow optional messaging-account owner, not the meeting device and not a
general mutation expansion of today's metadata worker. Admit only already loaded
validated parent identities; derive actor internally. Proposed bounds: 64 targets,
16 summaries/target, eight explicit reads/page, one physical request, 8-second
request/20-second sequence deadline, 30-second display freshness and 256 retained
one-shot outcomes/session. No keys, raw activities or private URLs over RPC.
Capabilities/privacy/unknown resolution and no-replay transport require review
before any runtime work; display first, explicit add second, exact-own removal last.

## Decision gates and remaining acceptance

**No-go now:** missing explicit internal-dependency risk decision, validated
summary/count/own-ID/event/parent mapping contract, supported vocabulary/limits,
and a dedicated one-shot boundary proven across every replay layer. Offline
source proof does not waive any of these.

After separate approval only, a minimal live-acceptance plan would establish
same-account root/reply summary shape, exact own reaction removal, permission/
membership/expiry handling and transport outcomes in a disposable consented space,
with explicit device/KMS ownership and zero implicit retries. No such test,
registration, reconnect, grant expansion, dependency migration or runtime
implementation was performed here.

References reviewed read-only on 2026-11-14:
[public Messages overview](https://developer.webex.com/messaging/docs/messaging),
[public JS SDK](https://developer.webex.com/docs/sdks/node),
[public support policy](https://developer.webex.com/docs/api-and-sdk-support-policy),
[tagged conversation source](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/@webex/internal-plugin-conversation/src/conversation.js).
Dynamic developer pages/search absence are bounded observations, not proof no
newer service exists. Installed hashes and executable fixtures are the exact
compatibility evidence for this report.
