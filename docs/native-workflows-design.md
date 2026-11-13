# Native completion: keyboard and draft workflows (NC2–NC3)

Part of the authorized [completion plan](native-feature-completion-plan.md).
Source-only changes; no installed configuration, editor reload, live account
test, automatic opener/download, grant change or commit is included.

## NC2 — one catalogue, native discovery

`autoload/wbx/commands.vim` is the finite inventory of every registered command,
including uncommon recovery actions. It owns group, target context, capability,
description, usage and optional default key. Default mappings, remappable targets,
effective-key references and optional which-key descriptions derive from it.
No caller-provided Ex string or generic RPC tunnel is accepted.

Existing `Wm` meanings are unchanged. New `Wa`, `Wu`, `Wn`, `Wv` families invoke
the existing guarded native owners. Plain/Markdown, local filters, local sections
and local notifications have finite native choices; values are data, never
command interpolation. A missing capability or wrong context explains why
without starting a backend, looking up a provider or sending a mutation/receipt.
Provider/grant preflights remain with the existing owner, never guessed by help.

`:WebexActions` opens an on-demand, searchable native reference (`q` returns).
It shows actual effective keys, skipped/user-shadowed conflicts, named recovery
commands and unavailable reasons. It preserves annotations/promoted buffers and
their undo. An annotated reference yields one notice, not an unbounded message
dump/More prompt. No optional picker/Lua/which-key is required in plain Vim.
Repeated setup releases only unchanged plugin-owned mappings; custom prefixes,
shorter/longer conflicts, buffer shadows, ordinary motions and `mappings=false`
are respected. Commands and `<Plug>` targets remain available with defaults off.

### NC2 evidence

Under `/tmp/opencode/wbx-native-completion-mm48wuud/`:

- `nc2-native-v4.log`: **16 affected native passes**, actual keys through demo
  owners, custom prefixes, missing capabilities, disabled defaults and native undo.
- Initial `nc2-copy/` caught an ES library-version mismatch in a documentation
  test (`toSorted`); changed to compatible `sort`, not a wider TypeScript target.
- `nc2-copy-v2/` caught the drawn More-prompt fallback and one intermittent Vim
  attachment-preflight fixture failure. Both original failed logs remain.
- `nc2-final/` records its exact lineage: the frozen NC2 snapshot plus only the
  reference-fallback correction, **not NC3 code**. TypeScript, **784 core passes /
  14 explicit skips, 109 native passes / zero skips, ten drawn checks** pass.
  Its backend builds are the five-artifact build from `nc2-copy-v2/`; NC2's final
  correction is Vim-only. The earlier attachment fixture passed in this full run
  without weakening its physical-read/cancellation assertions.
- The checkout bundles were unchanged during `nc2-copy-v2/`. The earlier NC0
  checksum drift remains explicitly recorded in the
  [NC1 integrity exception](native-consistency-design.md#fresh-copied-build-nc1-gate),
  not relabeled a passing assertion.

## NC3 — explicit, bound native workflows

- **Editing and deletion:** targets come from unchanged history identity, never
  annotations or labels. Dedicated edit text/undo stays native. Prepare, delete
  confirmation, submit and rich consent recheck the original buffer/window/tick,
  selection/readiness, format, parent and session context. Leave-and-return still
  revokes the old choice. Preflight remains non-atomic, explicitly disclosed.
- **Unknown mutations:** retain up to 256 exact native targets/pending admissions.
  An unknown delete is recoverable even when no edit buffer or history row
  remains. `:WebexMutationResolve` chooses exact retained targets in the selected
  room, confirms inspection and never resubmits. Failed resolution keeps evidence;
  versioned native evidence prevents an older resolution response from clearing
  a newer unknown result. Disconnect marks preparations stale, retains pending
  outcomes as unknown and ignores old callbacks. Another attempt requires fresh
  explicit preparation; cancel cannot prove an admitted mutation unsent.
- **Draft display and limits:** non-sendable virtual context and status accessors
  show destination/reply, Plain/Markdown, UTF-16 count/1,000 and UTF-8 bytes/4,000,
  plus staged file/progress. Count work is bounded and cached by changedtick;
  oversized native drafts report `>1000`/`>4000`, not an invented exact total.
  Supplementary characters count as two UTF-16 units, combining marks separately,
  and newlines count. No text, undo tree, user statusline or syntax mode is
  replaced. Dedicated edits show exact room/message, outcome and stale preparation.
- **Paged mentions:** one explicit first page, a deliberate “Load more” choice,
  then the existing bounded accumulated roster. No per-keystroke requests or
  automatic page drain. Failed/stale/changed-room/draft responses cannot insert.
  Partial/observation coverage is visible. Membership is still revalidated by
  the backend at submission. Literal names never silently become mentions;
  Markdown and @all consent remain explicit.
- **Files:** one explicit anonymous snapshot, not multi-file/rich-file sending.
  Replacing a staged file discloses the change and defaults to Cancel; the old
  snapshot survives failed/declined staging. File selection/confirmation is bound
  to its original draft. Status and selection disclose **10 MiB upload** versus
  **6,000,000-byte generic receive** ceilings. Existing native/handler/download
  choices and physical cancellation/unknown-result admission remain unchanged.

The intent registry contains at most 32 outstanding local choice tokens; it
does not confer backend authority. Background work in another window does not
cancel the user's choice. Selection-away/back and loss/recovery of readiness
advance a native context epoch; ordinary same-room polling does not.

### NC3 evidence in progress

`nc3-drafts-before.log` retains missing second-page mentions and changed-choice
insertion. `nc3-mutations-before.log` retains unreachable unknown-delete recovery.
`nc3-native-v2.log` caught a status-work publication regression, fixed without
weakening its performance assertions; `nc3-native-v4.log` caught a misplaced local
variable read. Later focused native fixtures pass. Copied-build full results
must be recorded before NC3 acceptance; none of NC4–NC6 is implied.

`nc3-copy/` retains a failed full attempt (110/113 native): the legacy
history-hint assertion still expected *only* the hint rather than the new
format/count context, and Vim's attachment fixture again opened a new intent
before its prior selection reply/focus callback had settled. The hint fixture
now checks both new context **and the unchanged exact hint/text/full undo**.
The attachment fixture uses a test-only barrier on the real engine select promise
and its ordered native RPC callback, without relaxing any physical-read,
preflight, away/back or tool-launch assertion. `nc3-native-v6.log` passes all
12 affected fixtures; `nc3-chunked-drawn-vim-1.log` through `-3.log` are three
independent passing drawn runs.

An additional integration edge ensures unselected-tombstone budget saturation
immediately publishes lost readiness, even without a loaded-body change. The
read-side limit remains fail-closed, idempotent and non-replaying. Final current
source verification follows separately from the earlier copies.

`nc3-final/` (the snapshot before those fixture corrections) retains **785 core
passes / 14 skips, six SDK and 12 drawn passes**, but **111/113 native**, still
failing the two old hint-only expectations. It is **not** labeled acceptance.
`nc3-acceptance/` is the fresh complete-source rerun including those corrections:
TypeScript, all five builds, **785 core passes / 14 explicit skips, 113 native /
zero skips and six actual pinned-SDK passes**. Fourteen drawn runs passed in the
initial invocation; the two `history-features` invocations were rejected by the
runner's CLI allowlist (exit 2), not editor assertions. Adding that fixture name
to the runner and rerunning against the **unchanged frozen application** passes
both editors: **16 drawn passes total**. The original errors remain, with exact
runner hash/lineage in `drawn-runner-followup.json`. NC3 is accepted offline;
this is not NC4–NC6 acceptance.
