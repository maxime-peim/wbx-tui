# Folded-thread separator follow-up

Status: **source fixed and offline-validated; not live activated**.
No active editor, installed configuration or original build artifact is changed.

## Fix

`thread_end` includes the existing empty separator after the last loaded member.
The old fold expression assigned that row to the nested body/outer thread fold,
so closing the thread drew the next sender directly against its caption.
`autoload/wbx/folds.vim` now gives that final separator fold level zero. Internal
member separators remain inside the outer thread, and projection metadata, body
text, message identities and decoration bounds are unchanged. No extra blank
lines are inserted; the legacy ungrouped timeline is unchanged.

`autoload/wbx/view.vim` checks the actual content endpoint when choosing a closed
fold's latest-navigation target. The newly exposed empty separator must not be
mistaken for an unfolded latest body. `WebexLatest` still targets the canonical
message and never opens folds or grants receipt consent. Receipt eligibility
already checks actual body content; a new synthetic receipt test explicitly
rejects the visible-gap/hidden-body case.

Native fold options remain authoritative. A one-screen-line body without its
separator is not visibly collapsible with default `foldminlines=1`; the enclosing
header-plus-body thread remains collapsible. The private synthetic benchmark
explicitly uses `foldminlines=0` to exercise its one-line body workload, recording
that option rather than changing any runtime defaults.

## Regression coverage

The new headless/drawn separator assertions fail against the original expression
and pass after the fix. Positive cases cover native `za` and the thread command,
adjacent collapsed threads, single-message threads, final missing-parent threads,
arrivals/prepends, root loading/eviction, inherited empty-foldtext settings, both
rail/gutter styles, and unchanged buffer text/undo. The gutter fixture additionally
checks actual blank screen rows with the installed Snacks module and private
custom renderer, including ambiguous/custom-width settings. It does not load the
user's configuration or a complete live LazyVim session.

Focused checks: five Neovim scenarios pass (`reading`, `history-features`,
`grouped-navigation`, `thread-subtrees`, `gutter`); drawn `thread-subtrees`,
`grouped-navigation` and `gutter` pass. Missing Vim is explicitly skipped, not
counted as a pass.

## Final staged verification — 2026-11-10

Run directory: `/tmp/opencode/wbx-fold-spacing-verification-46wmsut6/`.
Builds and tests ran against `project/`, reusing installed dependency inputs
without downloads/installations. HOME/config/state were private and live/media
test opt-ins were disabled. Neovim was **0.12.6**; no full Vim was available.

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core | **373 pass, 11 skip, 0 fail** |
| Native editors | **19 Neovim pass, 19 Vim skip, 0 fail** |
| Separate real lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures | **8 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload, private `foldminlines=0` |
| Final documentation/link/help checks | Pass |

Core skips remain the eight compatibility-CLI opt-ins, two optional SDK opt-ins
(separately run above), and the missing-Vim people fixture. The baseline loader
opt-in skip is covered by the separate actual-loader run. No missing-editor check
is counted as a pass, and this is not a fresh strict two-editor acceptance run.

`summary.json` records all return codes; `plugin.log`, `lazy-loader.log`,
`messaging.log`, `sdk.log`, `browser-controls.log`, `screen-*.log` and
`history-benchmark.log` contain detailed results. All **223 source files** matched
the staged SHA-256 `source-manifest.json` after the gate. Only this documentation
evidence update follows that gate; final integrity checks require the remaining
222 files to match, with results in `final-checks.json` and `docs-final.log`.
All ten original bundle/map hashes still match `original-dist-manifest.json`;
the active checkout's `dist/` is unchanged. No runtime/test changes follow the gate.

No live Webex, OAuth, message/receipt, meeting, browser/device or installed-config
test is performed. No cache persistence is introduced. Changes remain uncommitted.
This fix is editor-only: preserve unsent memory-only drafts, then restart Neovim
when ready; no backend rebuild is required for this fix alone. Never source the
main autoload into an active session.
