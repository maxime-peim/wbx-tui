# Native completion: consistency contracts (NC1)

Source-only, uncommitted implementation; no active editor/configuration or
service was changed. Part of the authorized
[existing-feature completion plan](native-feature-completion-plan.md).
This report covers NC1 only; later phase status and independent evidence are in
the [workflow ledger](native-workflows-design.md).

## Source and provider ledger

| Boundary | Contract and owner |
| --- | --- |
| Display geometry | `autoload/wbx/view.vim` supplies viewport-bounded `range_visible()`: every logical/body screen row, closed folds, clipped wrapped endpoints and the owned people overlay. Notifications require the whole body. Receipts reuse geometry only; identity, freshness, explicit intent and one-shot guards remain separate. |
| Degraded notifications | `autoload/wbx/notify_events.vim` uses continuous fresh authoritative unread metadata only when creation delivery reports `polling`. Maps are pruned with loaded noncached rooms; a generic unread-activity alert invents neither count nor excerpt. Startup, cache, stale/failed/recovered source and disabled activity never replay. Matching late creations and exact acknowledged plugin sends are consumed. Same-account other-client messages remain eligible. |
| Public SDK projection | Installed optional public `@webex/plugin-messages` / `plugin-memberships` **3.13.0**, not private APIs. `messages.js` maps post/share/delete, **not update**. Its delete event has an exact message/room but no body or creation timestamp. Membership deletion identifies the removed member via `data.personId`, not `actorId`; a moderator may remove us. Envelope `createdBy` must match the canonical already-resolved self ID. No new identity lookup, device or subscription is added. |
| Private worker IPC | `ReadChange` admits only `{kind:'message-deleted', roomId, id}` or `{kind:'room-revoked', roomId}`. Strict keys, valid IDs, nonempty distinct batches ≤64. Fixed 25 ms batching; observed changes flush before any snapshot/ready can overtake them. Startup delivery is validated too. No body/person/actor/token fields enter IPC. |
| Engine lifecycle | Current source/generation only. Up to 64 distinct changes received synchronously during connection are held before REST discovery; excess fails startup closed. Room removal applies to the original room, including one not yet listed. Presence, roster, staged uploads, native room authority and unread/message-event state are invalidated; drafts and unresolved outcomes are not reset. Partial snapshot absence never revokes. |
| Public message REST | `WebexMessagingAPI.getMessage()` performs one exact `GET /v1/messages/{id}`, same selected room and exact message identity, existing timeout/token/redirect restrictions. Only exact **404** is a tombstone; 401/403/429/5xx/malformed failures retain loaded text. |
| Loaded old messages | `MessagingStore` runs one serial extra exact read per normal live selected-history refresh, never on rendering/scroll, never alongside another history read. Skip newest-page identities; prioritize a missing canonical endpoint, otherwise round-robin loaded identities (≤500). Selection/epoch/revision, creation identity and monotonically newer edit versions fence late responses. Unchanged/older/unversioned-after-versioned content is not an edit. |
| Access-loss REST | A room-history **403** revokes that original requested room even after selection changed. A **401** is token failure, not proof of membership loss. Exact-message 403 is not room-loss proof. |
| Bounded evidence | Retain at most 1,000 exact tombstone and 1,000 revoked-room identities per store. They are never evicted to restore access. Saturation aborts reads, revokes readiness and requires explicit reconnect; late room/history results cannot restore authority. |

Deletion never selects a replacement receipt endpoint. A deleted canonical
endpoint remains ineligible until explicit latest reload. Positive deletion
before a message is loaded is retained, so late/stale pages cannot resurrect it.
No automatic write, receipt, grant expansion, reconnect, opener or download is
introduced. Provider failure is sanitized and does not queue retries of a
mutation. Read-side polling is not a complete-history or instantaneous-event
guarantee.

## Reproductions and verification

All evidence is under `/tmp/opencode/wbx-native-completion-mm48wuud/`.
Failures are retained, not overwritten as successes:

- `nc1a-before-native.log` and drawn variants: popup occlusion and nested folds.
  `nc1a-native.log`: **10 pass**; eight drawn-editor runs also pass.
- `nc1b-before.log`: absent generic degraded fallback.
  `nc1b-native-v1.log`: **14 pass**, overlapping the geometry fixtures.
- `nc1cd-before.log`, `nc1d-denial-before.log`, `nc1d-startup-before.log`:
  missing reconciliation, original-room denial and startup invalidation.
- `nc1-edge-before.log`: real forked startup publication ordering, unchanged
  version replacement, preselection deletion and saturation/late-discovery
  failures. The corrected edge/worker suites pass in `nc1-edge-v2.log`.
- `nc1-core-v1.log` retains two integration failures (extra ordinary loading
  publication and an unmocked exact GET); both fixed without weakening original
  assertions. `nc1-core-v2.log` passed but predates the final edge corrections.
- `nc1-sdk-v2.log`: **six pass**, including actual pinned public message delete
  and membership member-versus-actor projections with sockets/receipts forbidden.
- `nc1-native-v3.log`: **24 pass** before the final startup/edge refinements.

### Fresh copied-build NC1 gate

`nc1-copy/` contains immutable `sources.json`, its own `project/`, private HOME,
logs and `summary.json`. Existing dependencies were linked, never installed.
TypeScript and all five builds pass; **783 core pass / 14 explicit skips,
six actual pinned-SDK pass, 24 affected native pass / zero skips and eight
drawn-editor runs pass**. This is NC1 evidence, not NC2–NC6 acceptance.
No live account, receipt, OAuth or device test was run.

**Integrity exception, not a passing assertion:** the post-gate comparison
detected six checkout bundle/map hashes differing from NC0 (`cli`, `editor-main`,
`read-status-worker`, each with its map). Their recorded mtimes predate this
copied build. They were preserved untouched rather than reverting potentially
unrelated work. The exact current/baseline hashes and differing paths are in
`baseline.json` and `nc1-copy/summary.json`; HEAD and staging are unchanged.
No unchanged-bundle or active-session acceptance is claimed.
