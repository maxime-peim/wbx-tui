# Complete the existing native features

Status: **COMPLETE — NC0–NC6 implemented and offline-verified under the user's
subsequent full-plan directive.** The final integrated gate passes; the recorded
pre-existing bundle-integrity exception remains explicit and untouched.
This is completion/integration of existing application features, not the next
Webex-parity expansion. No activation or commit is implied.

## Implementation ledger

- **NC0:** frozen current working tree, 369 source inputs, ten bundle/map hashes,
  HEAD and empty staging at `/tmp/opencode/wbx-native-completion-mm48wuud/`.
  Its `before/` copy and failing `*-before*.log` fixtures retain the reproductions.
- **NC1:** [contracts, provider boundary and evidence](native-consistency-design.md).
  Copied gate: 783 core pass / 14 explicit skips; six actual SDK, 24 affected
  native and eight drawn checks pass. Six checkout bundle hashes drifted from NC0
  before the copy gate; preserved rather than overwritten. HEAD/staging unchanged.
- **NC2:** [catalogue/default keys/context help](native-workflows-design.md)
  implemented and verified: 784 core / 14 explicit skips, 109 native and ten
  drawn checks pass for its frozen source boundary.
- **NC3:** [draft/message/file workflows](native-workflows-design.md) pass their
  copied gate: 785 core / 14 skips, 113 native, six SDK and 16 drawn checks.
  The two initial drawn CLI registration errors are retained with runner lineage.
- **NC4:** [organization/conversation completion](native-organization-design.md)
  passes its copied gate: 794 core / 14 skips, 119 native, six SDK, 14 drawn.
- **NC5:** [presence/agenda/meeting integration](native-meeting-design.md)
  implemented. Initial copied gate: 800 core / 14 skips, 123 native, six SDK;
  18 drawn checks with explicit native/runner correction lineage. Later paired
  roster/identity safeguards pass the final NC6 copy, not just focused checks.
- **NC6:** full copied integration, every applicable drawn fixture, synthetic
  messaging/browser, SDK/research, help and available loader checks pass:
  **801 core / 14 deliberate skips, 123 native / zero skips, 103 drawn / zero
  skips, 165 SDK/cache, 44 synthetic messaging, three browser controls, six
  research/nonactivation, two loader and eight documentation passes**.
  [Final acceptance and exact source/integrity boundary](native-completion-acceptance.md).

## Objective and baseline

Finish the features already started in the Vim/Neovim plugin so their normal
workflows are usable, discoverable, truthful and safe. Prefer native editing,
default key sequences and on-demand lists over recreating Webex's buttons or
adding permanent panes. Passive state should appear automatically.

The baseline is the current uncommitted working tree on `9aeedd8`, including
the completed [F1–F5 delivery](messaging-feature-plan.md), default-on passive
features and [automatic selected-DM popup](people-popup-design.md).
The fresh runtime baseline gate is
`/tmp/opencode/wbx-people-auto-verification-mxak6iqz/`: 764 core passes / 14
explicit skips, 103 native passes / zero editor skips, 77 drawn checks, 145
SDK/cache, 44 messaging, five research and three browser-control passes.
Those results predate this plan's future implementation and are not its acceptance.

Audit evidence is static unless separately reproduced. In particular, remote
change reconciliation, degraded notification fallback, popup notification
occlusion and membership invalidation need failing offline reproductions before
fixes; they are not claimed live-service observations.

## Scope rule

A feature belongs here when there is an application-owned runtime path,
validated operation or already-projected data to finish. A method merely found
inside a bundled SDK, or a research fixture, is not an implemented feature.

| In scope | Completion boundary |
| --- | --- |
| Native commands and mappings | Default ergonomic mappings, contextual native help, optional which-key; no dependency required to discover/use common actions |
| Own-message editing/deletion | Complete prepare/edit/submit/cancel/uncertain-result workflows using existing contexts and one-shot mutation owner |
| Plain/Markdown and mentions | Explicit per-draft format, paged selected-room participant choice, correct target binding and visible format/limits |
| Uploads and received attachments | Existing one-file staging/send/cancel/status and bounded native/handler open/download workflows |
| DMs, group creation and membership | Existing exact-identity preparation, explicit creation/send/invite/remove/leave and explicit open of a confirmed returned room |
| Roster, local grouping, filters and Teams | Finish current bounded views, navigation, local preferences and loaded-room Team associations; no native-sync claim |
| Existing passive data | Draft indicators, section unread aggregates, observed room flags, freshness, mute/media state and existing agenda details |
| Messages, notifications and access lifecycle | Correct existing reconciliation/visibility/degraded-state behavior without inventing events or authority |
| Existing meetings | Surface current owner observations and pane controls through native integration; preserve one meeting/media owner |

### Explicitly deferred: filling new feature gaps

No reaction runtime; native personal Sections/Favorites/Hidden/server-mute sync;
pins/Flags; forwarding/quote actions; typing; incoming mention inbox; seen-by or
mark-unread; full profile/avatar/custom-status provider; organization/name search;
remote indexed search; complete-thread fetch/new thread pane; content galleries
or adaptive cards; persistent message drafts; new Team/admin/moderation rights;
calling/incoming calls; captions; meeting chat; recording/transcripts; scheduling/
external calendars; device routing, advanced capture or new meeting capabilities.

These remain later work even if an SDK contains related functions. The
[reaction](reactions-research.md) and [native Sections](native-sections-research.md)
provider/risk stop gates remain intact. Thread grouping and loaded-buffer search
stay useful bounded features, not promises of complete retrieval.

## Integration decisions

1. **Automatic information:** retain automatic People presence in header/Spaces
   cues; the later [native UX review](editor-native-ux-review.md) supersedes the
   popup with on-demand navigable native details. Use compact
   list/header/statusline indicators for existing draft, unread, restriction,
   format, file, mute and media state. Do not add a popup per datum.
2. **Actions use keys:** common operations get default Normal-mode sequences.
   Explicit sends, mutations, receipts and tool launches keep their guards.
3. **Lists open on demand:** roster, Teams, filters and section management use
   owned native buffers/pickers, not permanent sidebars.
4. **One catalogue:** extend `autoload/wbx/commands.vim` to describe action/group,
   target context, capability, invocation/arguments and optional default key.
   Derive mappings, context help and optional which-key from it; do not build a
   second independently maintained inventory or a generic unvalidated RPC runner.
5. **Unavailable is explained:** distinguish wrong context, missing backend
   capability, SDK/grant prerequisite and unsupported feature. Help lists the
   reason; discovering an action must not perform a lookup or mutation.
6. Preserve public helpers/commands, existing key meanings, custom prefixes and
   user mappings. `mappings=false` still disables defaults. Which-key is optional;
   plain Vim must be a complete baseline, including when no completion plugin exists.

### Planned default key families

Suffixes below follow `<leader>W`, or its configured replacement.
The action catalogue installs the families below, including the capability-gated
NC5 `mP`/`mL`/`mR` adapter. Effective keys/conflicts are always
reported by `:WebexActions`, not assumed from this table.

| Suffix | Action / context |
| --- | --- |
| `ae` / `ad` | Edit / confirm deletion of the exact history message under the cursor |
| `as` / `ac` | Submit / cancel an explicit edit, retaining native text |
| `af` / `am` / `aM` | Choose draft format / choose participant mention / deliberate `@all` |
| `ua` / `ur` / `uc` / `us` | Stage file / remove staged file / cancel upload / file status |
| `nd` / `ns` | Prepare exact-recipient DM / create named group space |
| `no` / `nc` | Explicitly open confirmed returned DM/group / cancel recipient preparation |
| `ni` / `nr` / `nl` | Invite / remove exact selected member / leave selected space, with existing checks |
| `vp` / `vt` | Selected-space participants / partial Server Teams |
| `vf` / `vs` | Filter chooser / local-section actions, including explicit preference operations |
| `vn` | Existing local notification controls/status; not Webex account DND |
| `vP` | Explicit selected-peer snapshot refresh; not a popup toggle or periodic poll |
| `mP` / `mL` / `mR` | Current bounded meeting source roster / existing layout-source actions / explicit meeting-auth refresh |
| `?` | Contextual action reference, effective keys, prerequisites and preserved conflicts |

Existing reply/send/open/download/latest keys and the `m` meeting family remain.
In particular `me` already presents the meeting in the editor and `md` detaches
it; do not repurpose them as message edit/delete. Rare recovery/admin commands
can remain named Ex actions, but must be discoverable in the same reference.

## Delivery sequence

One small, independently verified slice at a time. Do not mix an event/authority
fix with a keymap refactor or label historical gates as proof of new changes.

### NC0 — Freeze and reproduce

- Hash current tracked/untracked inputs and current bundle/maps; record commit,
  staging, dependency manifests and existing source modifications.
- Reproduce the audit's correctness concerns with synthetic sources and private
  editors. Trace real event payloads through the pinned, network-blocked adapter;
  do not guess public/SDK field names.
- Record the exact runtime/provider/IPC boundaries before extending them.

**Exit:** retained failing fixtures, bounded contracts and a source/evidence ledger.
No live account, configuration or active editor is involved.

### NC1 — Finish state and notification consistency

Primary owners: `src/messaging-store.ts`, `src/editor-engine.ts`,
`src/read-status*.ts`, `autoload/wbx/notifications.vim`,
`autoload/wbx/notify_events.vim`, `autoload/wbx/view.vim`.

- **NC1a Visibility:** use shared display-only geometry for visible-message
  suppression, including folds, final wrapped row and people-popup occlusion.
  Keep notification visibility distinct from receipt authorization.
- **NC1b Degraded alerts:** where continuity and fresh authoritative unread
  activity exist but creation-event delivery fails, provide a deduplicated,
  generic unread-activity fallback. No invented message count/excerpt, startup/
  cache/recovery replay or double alert when live delivery returns.
- **NC1c Remote message changes:** propagate validated exact edit/delete identity;
  fetch fresh edited content only within fixed bounds and current authorization.
  Apply confirmed tombstones, never infer deletion from absence in a bounded
  page. Preserve annotated views, pending mutation outcomes and canonical
  latest/receipt guards after endpoint deletion.
- **NC1d Access changes:** reconcile positive self-membership removal/access-loss
  evidence against its original room even if selection changed. Retain drafts
  and unknown outcomes; invalidate stale room actions/roster. Absence in a
  partial room snapshot is not sufficient evidence of membership loss.

**Exit:** source failure/recovery, duplicate/out-of-order events, account/
generation changes, selection changes and partial pages cannot fabricate state,
reset failed attempts or replay actions. Same-account messages from other clients
remain eligible; only exact acknowledged plugin sends are excluded.

### NC2 — Complete the keyboard/discovery foundation

Primary owners: `autoload/wbx/commands.vim`, `plugin/wbx.vim`,
`lua/wbx-tui/init.lua`, native setup hooks.

- Implement the common key families and appropriate remappable `<Plug>` targets
  by calling existing guarded native actions, not bypassing their owners.
- Offer a complete contextual reference in both editors, including uncommon
  recovery actions. Show actual effective bindings/conflicts, not promised keys.
- Handle argument-taking actions through validated prompts/choices, not command
  interpolation. Context changes during an asynchronous choice revoke that intent.
- Install defaults without clobbering user/global/buffer maps, motion/editing
  behavior or prefix descendants; repeated setup remains idempotent.

**Exit:** real keystrokes exercise every common action in both editors. Wrong
context, help display and missing capability issue no mutation/provider request.
Existing meeting keys and custom prefixes retain their meaning.

### NC3 — Finish message, rich-draft and file workflows

Primary owners: `autoload/wbx/message_actions.vim`, `rich.vim`, `uploads.vim`,
`drafts.vim`, `autoload/wbx.vim`, their existing backend owners.

- Message edit/delete targets come from the cursor's stable message identity.
  Preserve dedicated edit buffers, explicit submit/cancel, ownership/preflight,
  conflict handling and unknown-result resolution. Enter/write never submit.
- Show destination/reply, Plain/Markdown, length/limit and staged-file/progress
  state without injecting text into the editable draft or resetting undo.
- Make participant mention selection use the existing bounded paged roster,
  including participants beyond the first page; preserve partial/freshness labels.
  Do not reinterpret literal `@name`, enable Markdown or ping `@all` silently.
  No organization scan or new request on every keystroke.
- Complete attach/remove/cancel/status navigation and handler/download choices.
  Preserve one explicit file, replacement disclosure, anonymous snapshot binding,
  cancellation/unknown semantics and deliberate send/open/save/tool launch.
- Disclose current upload/receive/format constraints before submission, including
  10 MiB upload versus 6,000,000-byte generic receive limits. Do not silently
  raise transport/memory budgets, lower accepted limits or add multi-file/rich-file
  sending as part of this completion batch.
- Retain current sender-name/preview consent semantics and explicit opt-outs;
  explain their dependency. Independent history-name privacy controls would be a
  separate contract change, not a silent reinterpretation of old preferences.

**Exit:** edits, reply drafts, staged files and undo survive navigation,
late replies, disconnect, refusal/conflict and cancel/unknown outcomes.
Paged mention choices cannot act on another room/draft or stale membership.

### NC4 — Complete conversation, roster and organization integration

Primary owners: `autoload/wbx/conversations.vim`, `members.vim`, `teams.vim`,
`sections.vim`, `rooms.vim`, `drafts.vim`, `src/local-sections.ts`,
`src/editor-engine.ts`.

- Finish exact-recipient preparation/send/open/cancel/recovery. Group create,
  open and invite remain separate actions; retain the exact confirmed returned
  room and expose explicit Open without guessing by title or replaying creation.
- Roster/Team views gain native refresh, next-page, Enter/row actions and safe
  return navigation. Member targets remain exact identities, not mutable labels.
  An annotated/promoted view is preserved, not wiped by `q` or refresh.
- Enter toggles a local-section header, filters use a native chooser, and Team
  rows apply the existing loaded-room filter. Keep filtering presentation-only:
  never silently select a replacement destination or lose the selected draft.
- Show local draft/reply-draft badges and a loaded/local Drafts filter from the
  existing registry; no disk persistence of message bodies.
- Show collapsed-section unread aggregates with unknown/stale provenance,
  observed room restriction badges, and session/saved/unavailable grouping state.
  None is receipt, role, send or membership authority.
- Restore previously explicitly saved grouping after existing account/profile
  verification only when the current session grouping is empty and unchanged.
  A late load cannot overwrite edits; clear/opt-out/account change cancels it.
  Retain explicit Save/Load/Clear; no new autosave, identity probe or cloud sync.
- Preserve the current moderator-only removal policy and partial Team/roster
  bounds; finishing the UI does not expand mutation rights or discovery coverage.

**Exit:** every existing conversation/grouping workflow is keyboard-reachable;
second-page identities work; filters/collapse cannot hide all unread awareness;
stale saved data cannot replace current work or authorize an action.

### NC5 — Finish existing presence, agenda and meeting integration

Primary owners: `autoload/wbx/people.vim`, `upcoming.vim`, meeting/status code in
`autoload/wbx.vim`, `src/editor-meetings.ts`, `src/call-panes.ts`,
finite editor/broker protocol boundaries.

- Preserve automatic selected-DM details and dismissal behavior. Add a distinct
  explicit refresh action and clear snapshot age; do not fetch during rendering,
  add periodic presence polling or turn this into a full-profile provider.
- Surface already-projected agenda start/end/local-time details and joinability
  reasons without widening discovery horizon or claiming calendar completeness.
- Show compact reported mic/camera/share/receive-audio/control availability when
  a call is owned; unknown/stale is not off. Keep preview explicitly NOT SENT.
- Make the current bounded meeting source roster and existing pane layout/source
  actions discoverable from native controls. Route through the existing owner
  using a finite validated, capability-negotiated adapter where needed; the
  current editor allowlist does not already include arbitrary pane operations.
  No generic command tunnel, second renderer, SDK join or tmux ownership bypass.
- Preserve existing `speaker` command compatibility but describe its geometry
  accurately; active-speaker following is not added. Label source-slot/roster
  coverage, rather than claiming complete self/lobby/attendee support.
- Expose existing explicit meeting-auth refresh distinctly from messaging auth.
  Do not implement refresh through leave/rejoin or broaden grants.

**Exit:** existing controls work or explain current unavailability from native
keys/help. Presentation changes do not change transmission, meeting ownership,
inherited tmux styling or detach-by-default behavior.

### NC6 — Integrated acceptance and documentation

- After each slice, run focused model/protocol checks and strict Vim/Neovim
  keystroke/lifecycle fixtures; retain failures and exact safety assertions.
- At integration, run TypeScript, builds in an isolated copied project, core,
  complete native and private drawn suites, network-blocked SDK/read-status/
  cache, synthetic messaging/browser controls, relevant research nonactivation
  checks, documentation/help and available loader checks.
- Cover default options plus explicit opt-outs, old backend capabilities, custom
  prefixes/conflicts, repeated setup, ordinary mixed tabs, tiny/resized views,
  promoted buffers, annotations, late responses and full native undo trees.
- Check unchanged publications/scroll/status paths for added redraw/request
  amplification; keep current bounded ownership and admission budgets.
- Update README/help/option/action catalogues and the verification index from
  actual results. Label skipped/deferred/live-unverified coverage; counts overlap.
- Verify original bundles/configuration, unrelated source work, commit and staging
  remain intact. Record fresh source hashes and any post-gate documentation-only
  delta; never relabel an earlier failed/full gate or reuse old counts as new proof.

## Definition of done

- Every in-scope feature has an effective default key/native interaction or an
  automatic passive display, a complete outcome/recovery path, and truthful
  capability/coverage/freshness disclosure.
- Both editors are first-class without optional UI plugins or installed config
  edits. Existing defaults, native editing, user mappings and ordinary work survive.
- New read-side reconciliation never becomes send/receipt/membership authority.
  Failed/unknown mutations and receipts do not automatically replay.
- Runtime and integration changes have fresh offline evidence; the deferred
  parity list has not silently entered this batch.

The subsequent directive authorizes implementation of these phases, not
activation, hot-source/reload, reconnect, live Webex/OAuth/receipt/device tests, dependency installation or
downloads, grant expansion, installed configuration edits, commits or pushes.
Keep Atlassian out. Any eventual activation remains a separate user-controlled,
draft-safe step.
