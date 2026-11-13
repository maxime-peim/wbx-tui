# Native feature completion — acceptance ledger

The authorized [NC0–NC6 plan](native-feature-completion-plan.md) completes existing
features before new Webex-parity providers. **NC0–NC6 are implemented and
offline-verified.** The final full integrated gate passes. Nothing is live
activated or committed; excluded features remain deferred.

## Scope delivered

| Phase | Contract |
| --- | --- |
| NC0 | Frozen 369-source baseline, reproductions, bundle hashes, HEAD and empty staging |
| NC1 | [Display/notification consistency, remote reconciliation and access-loss fencing](native-consistency-design.md) |
| NC2–NC3 | [One command catalogue, native discovery/default families, bound drafts, edits, mentions and files](native-workflows-design.md) |
| NC4 | [Exact conversation recovery/Open, safe native lists, local grouping, draft/unread indicators and guarded restore](native-organization-design.md) |
| NC5 | [Presence/agenda detail, independent finite meeting controls and destination-bound delivery resolution](native-meeting-design.md) |
| NC6 | Complete copied-build integration and current-source/integrity finalization |

All phase failures and follow-ups are retained separately. The detailed contracts
record behavior, ownership limits, provider boundaries and exact source lineage.
The shared catalogue exposes available keys and prerequisites in plain Vim or
Neovim without requiring optional pickers/which-key. Existing meeting meanings,
native editing/undo, annotations, user maps, draft destinations and detach
behavior are preserved.

## Integrated runs

Evidence root: `/tmp/opencode/wbx-native-completion-mm48wuud/`.

`nc6-integrated/` is the **retained failed first full attempt**, not acceptance:
801 core / 14 deliberate skips, 123 native, six SDK, 101/103 drawn, 44 synthetic
messaging, three synthetic browser controls, six research/nonactivation, two
available-loader and eight documentation checks passed. TypeScript, five builds,
both help generators and integrity checks passed. The two drawn reply failures
are the known reply-marker ordering issue corrected before the final snapshot;
the paired-roster/post-focus identity safeguards also postdate that first copy.

`nc6-final/` is the fresh final-source rerun, not a carried aggregate. It has its
own source manifest, five builds, private HOME, native/core/SDK logs, all applicable
drawn fixture logs, synthetic messaging/browser, research, help, loader and
documentation checks. Every status in `integrated-summary.json` is **zero**.

| Final check | Result |
| --- | --- |
| TypeScript and all five copied builds | Pass |
| Core | 801 pass / 14 deliberate opt-in skips |
| Native editors | 62 Neovim + 61 Vim pass / zero skips |
| Private drawn PTYs | 52 Neovim + 51 Vim pass / zero skips |
| Actual pinned SDK | Six pass, network blocked |
| SDK/read-status/presence/cache supplement | 165 pass / zero skips |
| Synthetic messaging/CLI/extensions | 44 pass / zero skips |
| Synthetic browser controls | Three pass; no real browser/device |
| Research and runtime nonactivation | Six pass; no new provider approval |
| Available real lazy.nvim loader and example | Two pass / zero skips; no installation |
| Documentation and both-editor help generation | Eight tests and both help generators pass |
| Diff, bundle, HEAD and staging checks | Pass at the preserved drift boundary described below |

The supplemental `sdk-cache-summary.json` uses that same frozen application,
including network-blocked pinned SDK, forked read-status workers, selected-peer
and verified-cache lifecycles. Counts overlap; they are not unique-test totals.

The gate froze **389 source inputs**. Subsequent changes are Markdown-only
acceptance/status and historical-pointer updates, including this new report.
`finalization.json`, `final-sources.json` and `docs-final.log` record the final
390-source checkout boundary, exact post-gate paths and fresh documentation
verification. Runtime/build/test/help inputs remain identical to the passing copy.

## Boundaries and integrity

- Every gate copies sources and links only existing dependencies. It builds
  **inside the copy**, not the checkout, and isolates HOME/XDG paths. No dependency
  installation or installed configuration modification is part of this work.
- All 369 NC0 source paths are retained. HEAD remains
  `9aeedd825a6d4c51fcf60a7bb8459c59911d2ea9`; staging remains empty.
- The **six pre-existing detected NC0 bundle/map hash differences** (`cli`,
  `editor-main`, `read-status-worker`, each with its map) remain an explicit
  integrity exception. Their timestamps predate the first copied gate. They were
  preserved, not reverted. All ten checkout bundle/map hashes remain unchanged
  from the recorded drift boundary through subsequent gates.
- Fourteen baseline core skips are opt-in duplication, not missing native
  coverage: eight synthetic CLI/extension cases are enabled in the messaging
  tier, six pinned-SDK cases in the SDK tier. Counts overlap and must not be
  summed as unique tests. The Lua/Kitty incremental-rendering fixture is Neovim
  only; it is not counted as a Vim pass.
- No live Webex/account/OAuth/receipt/device, graphical browser/Kitty or real
  meeting-media lifecycle acceptance was run. Tests use synthetic providers,
  private loopback/IPC/tmux fixtures and network-blocked SDK paths.
- Reactions, native Sections synchronization, calling, captions, server search,
  complete-thread retrieval, active-speaker following and the plan's other
  exclusions remain deferred. Research tests do not authorize runtime providers.
- No grant expansion, automatic mutation/receipt replay, automatic reconnect,
  opener/download, hot-source, commit, push or Atlassian work was introduced.
