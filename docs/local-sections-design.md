# F2 local sections, filters and presence

**Later native completion:** [NC4](native-organization-design.md) adds the native
section/filter choices, header Enter toggle, local draft indicators and guarded
restore through existing verified identity. F2's original default-key/explicit-load
policy and gate below are historical, not the current complete UI.

Implementation contract following the request to finish the messaging plan.
Status: **implemented and strict offline-verified; uncommitted and inactive**.
Frozen pre-F2 source: `/tmp/opencode/wbx-f2-0gknld0o/` (324 sources, ten original
bundle/map hashes). No activation, configuration rewrite or server mutation.

- Local sections are presentation preferences, not Webex Sections or Teams.
  At most 32 sections, 60 Unicode characters/240 bytes per label, 500 distinct
  assigned room IDs total. IDs are generated; labels are unique ignoring ASCII
  case, with other Unicode spelling retained exactly in all three runtimes.
  Removing a section unassigns its rooms; moving a room removes its old assignment.
- Explicit commands create/rename/remove/reorder, assign/unassign, collapse and
  load/save/clear preferences. No new default keys are installed. Semantic edits
  carry an expected revision and reject stale intent rather than overwrite it.
- Default list remains flat. Local filters all/unread/direct/group/one section
  never select a replacement room or fetch. Headers are not room rows. Partial
  paging stays explicit; the paging edge is the last actual visible data row.
  Unknown and stale unread evidence remains display-only, not a total/receipt.
- Preferences are session-only until account/profile identity is verified by the
  existing opt-in spaces-cache identity boundary. Explicit load/save/clear can
  then use that private key; there is no implicit new identity request or startup
  load/write. Without identity the commands explain the session-only limitation.
- Version 1 stores section labels/order/collapse and room IDs only, never unread,
  messages, people profiles or credentials. Eight fixed private slots, 300 KiB
  per slot, at most 64 directory entries; collisions are read misses and save
  refusals, never account matches or automatic eviction of user preferences.
  Files 0600, directory 0700, owned/nonlinked regular files only, bounded
  UTF-8 decoding, atomic private temporary + fsync + rename. Corrupt/unknown
  versions fail closed without replacing current preferences. Clear removes
  only the matching profile, never another slot occupant. A private exclusive
  per-slot lock prevents cross-process check/rename collisions; stale locks fail
  closed without automatic deletion or retry.
- One physical preference I/O operation at a time across session replacement;
  no queued writes or automatic saves/retries. Reset clears logical preferences
  immediately; old load completions cannot populate another session.
- Presence stays selected-direct/default-off and uses the existing provider.
  Text includes supported status and stale/unknown/unavailable explanations;
  Active is recent activity, not guaranteed availability. No wider polling,
  custom text, inferred busy/offline or audio/video call distinction.

All native writes retain existing annotation, cursor, draft, focus and indexed
row identity handling. Cached rows remain browse-only independent of sections.

## Offline verification

Final copied-project gate: `/tmp/opencode/wbx-f2-verification-lzeuywjp/`.

| Check | Result |
| --- | --- |
| Core | 645 passes / 14 explicit opt-in skips |
| Native editors | 47 Neovim + 46 Vim fixtures / zero editor skips |
| Drawn private PTYs | 34 Neovim + 33 Vim fixtures |
| SDK/read-status/cache / synthetic messaging / browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, documentation, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 329 sources checked; 324 frozen pre-F2 sources and ten original bundle/map hashes unchanged |

The native section fixture uses the newly built copied backend in the full gate,
not the old original bundle. Focused runs can explicitly select source execution
with `WBX_TEST_SOURCE_BACKEND=1`. Both editors exercise real section commands,
hidden selection, unchanged draft text/tick/undo, header non-selection, collapse,
ordering, removal, Unicode validation, filter reset and 435-room projection.
One hundred motions reuse existing row identities without a new grouping pass.
Backend tests cover private files/links/modes/size/version/corruption, stale
revisions, missing identity, profile collisions, concurrent writers, stale locks,
and physical I/O admission/old completions across session replacement.

Earlier passing gates `/tmp/opencode/wbx-f2-verification-blynjbiw/` and
`/tmp/opencode/wbx-f2-verification-vuknhtdp/` predate collision/Unicode hardening.
They are retained but superseded by the final gate. Focused evidence, the
expected pre-F2 protocol rejection and the JavaScript/Vim Unicode-case
characterization are in `/tmp/opencode/wbx-f2-0gknld0o/`. No assertion was weakened.
Only evidence/status documentation changes after the final gate.

No live Webex/OAuth/receipt/device or real desktop acceptance was run. No installed
configuration, active editor, original build, grant, commit or activation changed.
These sections do not synchronize Webex personal Sections, change server Teams,
or imply complete room/roster coverage from a partial page.
