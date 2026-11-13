# Native completion: organization and conversations (NC4)

Implements the [NC4 scope](native-feature-completion-plan.md#nc4--complete-conversation-roster-and-organization-integration)
without new providers, membership rights or persistent message drafts.
NC4 passes its copied-build gate. Later phase status is maintained in the
[completion ledger](native-feature-completion-plan.md#implementation-ledger).

## Native boundaries

- `autoload/wbx/lists.vim` owns only the two finite, on-demand participant/Team
  list buffers. `r` refreshes, `]p` requests a bounded next page, Enter uses an
  exact row, and `q` returns without wiping. It checks ownership, name, buftype,
  changedtick and modified state **before requests and again before publication**.
  Promoted/annotated views and native undo are retained; only unchanged owned
  maps are released. User maps and `mappings=false` win. Observation time is local,
  not a completeness/freshness or membership guarantee.
- Participant row actions prepare an exact-recipient DM or explicitly remove
  that exact membership. Informational rows have no target. Second-page IDs
  work; labels/actor identities are never reinterpreted as authorization.
  Fresh backend moderator-only removal policy is unchanged. Team Enter applies
  only the existing loaded-room filter; it never selects a new destination.
- `WebexConversationOpen` / `Wno` explicitly opens the current recipient's
  confirmed DM, or the latest confirmed group-creation ID. `WebexDirectOpen`
  remains compatible. A new failed/unknown create cannot Open an older group as
  if it were the new result. Creation, Open and invitation stay separate.
- Recipient preparation, first-send, membership, grouping and recovery choices
  use the bounded native intent guards. Changed text, focus-away/back, selection,
  readiness or format cancels the old choice before request admission.
  Unknown recipient delivery cannot be replayed or discard its only resolvable
  context. Failed/old-session resolution cannot claim success.
- Up to 256 exact native unknown conversation-action targets are retained, without
  eviction or automatic replay. A successful unrelated action cannot erase an
  earlier unknown outcome. Explicit resolution chooses exact action/room/request,
  waits for a successful ACK and compares the original evidence before clearing;
  an older ACK cannot clear a newer unknown result. Backend write limits, public
  routes and one-shot operation admission are unchanged.

## Display-only organization

Draft badges use incremental counts of the **existing owned native registry**.
Only local normal/reply/file-presence booleans enter list presentation; bodies
remain native and memory-only. Changedtick-cached length work runs on observed
draft changes, not a whole-registry/body scan on every publication. Rendering
does one badge lookup per loaded room (at most 500). Promotion/wipe removes its
indicator without deleting work. File progress does not amplify history renders.
The loaded/local Drafts filter, other filters and collapse never retarget the
selected room or inherit another draft.

Enter on an unchanged local-section header toggles only that section. Collapsed
headers show loaded/local unread counts with unknown/stale counts; a compact
all-loaded summary preserves awareness when filters/collapse hide rows. These
counts are presentation, not server totals or receipt authority. Observed
locked/read-only/announcement flags are explicitly labeled observations, not
fresh role or send rights. Grouping state says session/saved/unavailable.

## Previously saved grouping restore

After the **existing** spaces-cache account/profile verification, the engine
may read that exact profile's previously explicitly saved grouping once, only
if this session's grouping is empty and unchanged. No extra identity probe,
autosave, cloud/native Sections synchronization or provider is introduced.
`spaces_cache=false` opts out of that identity/read path.

Generation, verified profile key, known grant, explicit-preference intent and
grouping revision fence completion. Pure local edits remain available while an
automatic disk read is active and cancel its result. Explicit Load/Save/Clear
cancels a pending automatic restore too; physical disk admission is retained
until settlement, rather than overlapping operations. Cache clear, grant loss
or session/account replacement drops late results. Invalid files show unavailable
without overwriting work; missing files leave session grouping. Existing
private-file validation/budgets and explicit Save/Load/Clear remain unchanged.
Restored unknown room IDs do not establish membership or authorize navigation.

## Evidence

`/tmp/opencode/wbx-native-completion-mm48wuud/` retains:

- `nc4-restore-before.log`: missing automatic restore, then guarded model coverage.
- `nc4-lists-before.log`: native list integration failures retained during delivery.
- `nc4-native-v1.log`: new badge/header contracts plus a Vim-only read-only `count`
  name collision; corrected to `counts`, not an editor skip.
- `nc4-native-v3.log`: promoted-list map release did not run in script-startup
  OptionSet conditions; admission now explicitly releases only owned maps.
- `nc4-native-v5.log`: **18 focused native passes** including real keystrokes,
  paged identities, delayed annotations, promoted lists, independent draft badges,
  filter/selection isolation and unknown/late-resolution guards.
- `nc4-model-v3.log`: local preference identity, revision, clear, account/session,
  missing/corrupt-file and physical-admission checks pass.

### Copied acceptance

`nc4-acceptance/summary.json` records TypeScript and all five builds passing,
**794 core passes / 14 explicit skips, 119 native / zero skips, six actual SDK
and 14 drawn checks**. Every result status is zero. Source hashes, logs, private
HOME and the copied application are retained there. Checkout bundles, HEAD and
staging stayed unchanged during this gate; the earlier NC0 bundle drift remains
documented, not reverted or relabeled a pass.

No installed config/editor, live
account/device/receipt/OAuth test, dependency installation, commit or push.
