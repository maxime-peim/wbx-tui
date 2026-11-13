# R6b — Native personal Webex Sections provider review

Status: **research complete; NO-GO for native import/sync** (2026-11-14).
No validated approved retrieval/export provider was found. Local sections and
Server Teams remain available with distinct, honest labels. This is not a claim
that Webex Sections are unsynchronized or technically impossible.

## What the current evidence actually says

| Source | Observed result | Limitation |
| --- | --- | --- |
| [Official Space sections guide](https://help.webex.com/en-us/article/uaayuo/Webex-App-%7C-Space-sections), retrieved 2026-11-14; page dated 2026-03-11 | Desktop section changes are reflected on mobile. Names/order/moves/collapse and built-in Favorites/Other exist. Guide states up to 50 sections, 500 spaces/section, 25-character names. | UI behavior, not API IDs, export format, permissions or sync protocol. Not the local plugin's 32-section/500-total-reference contract. |
| [Public Rooms](https://developer.webex.com/docs/api/v1/rooms) / [Teams](https://developer.webex.com/docs/api/v1/teams) and public messaging documentation/search | No native personal Sections list/order/membership/export contract found. `teamId` describes server Teams, not a person's private group ordering. | Dynamic operation pages may return navigation only; absence in this review is not a worldwide/nonfuture absence proof. |
| [Cisco employee response](https://community.cisco.com/t5/webex-for-developers/how-can-i-create-a-section-via-api/m-p/4968416), 2023-11-29, re-read 2026-11-14 | “There is not corresponding API … at the moment.” | Historical statement, not a 2026 support guarantee. |
| [Later hide/mute request](https://community.cisco.com/t5/webex-for-developers/hide-mute-spaces-using-api/td-p/5268968) | Fresh page fetch returned HTTP 403; not used as current capability proof. | Community/search context is not a service schema. |
| Installed optional SDK 3.13.0 source | 238 `.js`/`.ts` source files searched under installed `@webex/*/src`. Four conversation hits are favorite/filter helpers; other hits are RFC/token “section” text. No native IDs/order/membership provider found. | Bounded installed dependency set, not all SDKs/apps/services. |
| Official export search | No supported export with personal section IDs/order/room membership/account/completeness fields established. | User-facing message/compliance exports or screenshots are not automatically a suitable personal-preference provider. |

The official desktop/mobile statement is positive evidence against the old
“Sections must be local-only” inference. The plugin limitation is **provider
validation and approval**, not denial that Webex can synchronize private state.
No browser cookies/local app databases were accessed and no private URLs probed.

## Reproducible installed-source search

[Source audit](../test/research/sections-source.test.ts) scans installed
`optional/read-status-sdk/node_modules/@webex/*/src/**/*.js` and `**/*.ts`.
Tests, documentation and generated distribution trees are not counted in that
238-file search. [Exact inventory](../test/research/sdk-inventory.json) separately
hashes critical source **and** executable distribution files plus dependency
manifests/full lockfile (45 inputs). It refuses drift instead of claiming an old
negative search applies to a changed dependency.

Search pattern: `\bsections?\b|favorite|unfavorite`, case-insensitive.
Hits:

- `internal-plugin-conversation/src/conversation.js`: lines 179, 2462, 2464,
  2499 — favorite list/filter and dynamically generated favorite/unfavorite/
  hide/lock/mute methods.
- `webex-core/src/credentials-config.js`: lines 61, 71, 83, 95 — RFC section URLs.
- `webex-core/src/lib/credentials/credentials.js`: 204, 207, 211, 224 — token
  segments, not messaging groupings.

The internal favorite/unfavorite helpers do not expose custom section IDs,
labels/order or room-to-section membership. They are not an approved shortcut
for native Sections import or write sync. This report does not call them.

```sh
WBX_REACTIONS_RESEARCH_TEST=1 node --import tsx --test test/research/*.test.ts
```

That opt-in also runs the separate reaction research checks. No dependency
installation or service/account request occurs. With no flag, installed-SDK
checks explicitly skip; the reconciliation simulations still run. Evidence and
integrated verification: [verification index](verification-index.md).

## Provider acceptance matrix

Every item below must be established by documented supported read access or an
explicitly approved internal/export investigation. None can be inferred from
room titles, a Team label, Favorites, a screenshot or an SDK method name.

| Required property | Current status |
| --- | --- |
| Stable native section IDs and built-in/custom distinction | Not established |
| Exact labels and native ordering | UI documented; retrieval schema unverified |
| Exact room membership and unassigned behavior | UI documented; complete retrieval mapping unverified |
| Verified authenticated account/profile scope | No provider contract |
| Completeness, paging, missing/inaccessible-room semantics | No provider contract |
| Updates, revision/conflict semantics, deletions and cross-client freshness | No provider contract |
| Least-privilege authorization/privacy/retention/export ownership | No provider contract |
| Supported read import and separately supported writes | Neither approved |

## Offline verification result

Final integrated gate `/tmp/opencode/wbx-r6-verification-dl7zik8a/` passes all five
research checks with zero native I/O/registrations, including this exact
238-file search and 45 input hashes. It also passes the full existing runtime/
native/drawn/build/help suites; see [exact counts](verification-index.md).
No runtime provider, installed dependency, config, build or editor was changed
by this research. R6 preserves all 114 pre-existing runtime/dependency-manifest
inputs. Default-off invocation explicitly skips installed-source/SDK checks,
not silently claiming them as passes. Finalization changes evidence/status docs
only and rechecks documentation and source/bundle integrity.

## Future import and synchronization must be separate decisions

If a real provider is later identified, first deliver explicit **read-only**
preview/import under a reviewed contract: verified account/profile binding,
bounded input size/paging, completeness/error labels, exact native IDs, provenance,
no unread/receipt authority and no automatic overwrite of local preferences.
Preserve draft destinations and selected-room identity regardless of grouping.

The official native ceilings differ from F2: an import of 50 native sections or
many per-section room references must not silently truncate into 32 local sections/
500 total assignments, pretend completeness, or expand limits automatically.
Require a conflict/overflow preview and explicit choice; native/read-import/local
IDs and provenance must remain distinguishable.

Only a later **separate** write-sync proposal may address rename/reorder/move/
delete, conflict and unknown outcomes. It requires internal-interface risk
approval if applicable, provider-specific least privilege, exact one-shot
operations, explicit confirmation, version conflict policy and no automatic
retry. No cookie scraping, guessed endpoints, browser automation or broader
grants are substitutes.

**Decision:** retain [client-local sections](local-sections-design.md) and
[loaded Server Team associations](conversations-design.md), without native sync
claims. The [reaction stop gate](reactions-research.md#decision-gates-and-remaining-acceptance)
also applies to any future internal Sections source. No user-dependent blocker
prevented completing this research; implementation remains outside the
authorized plan because no approved provider was validated.
