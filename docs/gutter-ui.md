# Neovim message gutter

Status: **source implemented and offline-validated; not live activated**.
This UI follow-up supersedes the older in-text-rail default in earlier evidence.
No installed configuration, active editor or build artifact is changed by it.

## Appearance and options

Neovim 0.10+ defaults to **`message_borders = 'gutter'`**. A subtle `▎` sits at the
right edge of the number/sign/fold margin, outside message text. Separator rows
stay blank. Replies keep two virtual indentation columns, parent previews and
loaded-reply counts; real native whole-thread/body folds are unchanged. Wrapped
continuations use a whitespace-only native hanging indent rather than a white
in-text rail. Explicit native `showbreak` customizations still win.
If `ambiwidth=double` or native `setcellwidths()` makes `▎` wider than one cell,
the marker falls back to ASCII `|`, keeping the gutter exactly one cell wide.
Restoring single-cell Unicode display restores `▎` on the next redraw, without
changing buffer text or recreating message decorations.

```lua
opts = {
  message_borders = 'gutter', -- Neovim default
  -- message_borders = 'rails', -- previous ┌ │ └─ style
}
```

Plain Vimscript: `g:wbx_tui.message_borders`; per-buffer override:
`b:wbx_message_borders`. Set the preference before opening a workspace. Full Vim
and older Neovim keep the existing rail/property/sign fallback. There is no new
backend/RPC field, dependency, download or mandatory UI plugin.

`WbxMessageGutter` defaults to `NonText`, `WbxReplyGutter` to `Comment`, with no
hard-coded white/RGB color. Native highlight overrides and colorscheme hooks
remain available. `message_borders = 'rails'` retains `WbxMessageBorder`.

## Existing statuscolumns are delegated, not replaced with a new renderer

The adapter is **window-local and history-only**. It saves the exact original
`statuscolumn` format/expression and appends one right-aligned margin slot. The
original format is not flattened: number/sign/fold directives, highlights and
click-handler regions remain intact. Empty native statuscolumns use the native
`%C%s%l` fields, preserving `number`, `relativenumber`, `numberwidth`, `signcolumn`
and `foldcolumn`. No global values are changed.

LazyVim's renderer continues to call Snacks; no Snacks configuration/patterns or
installed LazyVim options are rewritten, and message markers do not masquerade
as Git signs. Other diagnostics/signs keep their own namespaces and priorities.
Native splits recover the original format without nesting wrappers. Leaving,
renaming or promoting history releases only still-owned local settings; unrelated
buffers retain their native settings.

A FileType hook or later explicit `:setlocal statuscolumn=...` remains authoritative
and is never reclaimed by polling. Such an override can intentionally hide the
gutter. Use `message_borders = 'rails'` if you want to manage the whole statuscolumn
yourself. Only the user's original option expression is evaluated, exactly as
native `%!`; backend message text/titles/IDs never become expressions.

Bodies, yanks, draft text/undo, message identities, receipt visibility checks and
focus-neutral updates are unchanged. Border-style changes only update decorations;
unchanged updates retain native IDs and do no decoration-row work.

## Verification — 2026-11-10

This is the original gutter baseline. The subsequent
[fold-spacing follow-up](fold-spacing.md) keeps the separator visible after
thread collapse and records its own regression run.

Final staged run: `/tmp/opencode/wbx-gutter-verification-ays24hjr/`, with the
checkout copied to `project/`; original `node_modules`/optional SDK/vendor inputs
were reused without installing anything. Editors use private HOME/config/state;
graphical/media/live-test opt-ins are disabled. Environment: Neovim **0.12.6**,
Node **25.2.1**, Python **3.12.3**.

| Check | Final result |
| --- | --- |
| TypeScript check and five-artifact build | Pass, staged copy only |
| Core tests | **373 pass, 11 skip, 0 fail** (384 total) |
| Native editor suite | **19 Neovim pass, 19 Vim skip, 0 fail** |
| Real lazy.nvim loader/spec checks | **2 pass, 0 skip/fail**, separate opt-in run |
| Synthetic standalone messaging/extension checks | **44 pass, 0 skip/fail** |
| Read-status/actual pinned SDK/cache/receipt checks, network blocked | **52 pass, 0 skip/fail** |
| Synthetic browser controls, no live media | **3 pass, 0 skip/fail** |
| Drawn Neovim PTY fixtures | **8 pass, 0 fail** |
| Final documentation/link/help-tag checks | Pass |

The core skips are eight separate compatibility-CLI opt-ins, two optional SDK
opt-ins (both covered by the separate SDK run), and one missing-Vim people fixture.
The baseline verifier also records one loader opt-in skip; the separate actual
loader run above passes both checks. Skips are not included in pass counts.

The eight drawn fixtures are `gutter`, `ui`, `reading`, `navigation-plan`,
`grouped-navigation`, `thread-subtrees`, `upcoming-meetings` and `replies`.
The gutter fixture exercises both a private custom renderer and the actual
installed Snacks statuscolumn module with minimal private scaffolding, not the
user's configuration or a complete live LazyVim session. Positive checks cover
placement after numbers, foreign signs, wrapped reply indentation, native columns,
fold/arrival preservation, split restoration, promotion, quoted formats, actual
FileType/later overrides, colorscheme links, style switching and unchanged body
yanks/undo. `ambiwidth=double` and explicit native cell-width overrides pass both
headless and drawn checks with the single-cell fallback. The original reply rail
fixture explicitly opts in to rails, retaining its positive coverage.

The previous temporary full-Vim binary is no longer present and no system Vim is
available in this environment. Fresh Vim execution is **NOT RUN**, with explicit
skips; earlier full-Vim baseline results are historical, not new coverage.
No package/tool installation is performed to hide this limitation.

Logs are `plugin.log`, `lazy-loader.log`, `messaging.log`, `sdk.log`,
`browser-controls.log` and `screen-*.log` under the final run directory.
`summary.json` records all return codes. `source-manifest.json` records SHA-256
hashes for **222 source files**: the staged files and original checkout matched
exactly after verification. `original-dist-manifest.json` records all eight
original bundle/map hashes; **original `dist/` remained unchanged**. The only
post-gate source edit is this documentation-only evidence update; final integrity
checks require the other 221 files to match and recheck every original artifact.
Final documentation/help/integrity results are recorded in `docs-final.log` and
`final-checks.json` in the same run directory. No runtime/test code changed after
the final staged gate.

No live Webex call, message, receipt, OAuth/device action, installed-config change,
active editor reload, artifact activation, commit or push is performed.

This is a source-only editor UI change: **no backend rebuild is needed for this
gutter change alone**. Preserve unsent memory-only drafts, then fully restart
Neovim to activate. Do not source the main autoload into the active session.
