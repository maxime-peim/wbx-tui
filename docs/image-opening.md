# Explicit image opening

**Current correction:** the first implementation below reused only a thumbnail.
[Higher-resolution opening and the direct `o` key](image-detail.md) replace that
limitation. Explicit actions now fetch original-derived pixels (up to 1600×1200,
no upscaling) for both buffer and external viewers. That correction needs a
backend rebuild and draft-safe restart. The verification totals below describe
the earlier implementation, not the subsequent correction.

The original implementation's staged verification is retained below. The current
higher-resolution correction has its own verification record in the linked guide.
No running editor, installed configuration, backend artifacts or account session
was changed. Keep drafts safe, rebuild the backend and restart when ready; never
hot-source the session coordinator.

## Controls

- `:WebexImage` uses `image_open = 'buffer'` by default. History's `o` and
  `<localleader>o`, plus global `<leader>Wo`, now use the general
  [`:WebexAttachment` action](attachments.md), including native images unless a
  file handler matches. `<Plug>(WebexImage)` remains image-only.
- `:WebexImageBuffer` and `:WebexImageExternal` override that preference.
- In unchanged history, place the cursor on an attachment or its message.
  An optional `1`–`4` chooses an attachment; otherwise the image under the cursor,
  or the first attachment, is selected. Commands in the image buffer reuse its
  snapshot, without selecting a space or conferring destination authority.
- Only loaded Webex attachment identities qualify. Markdown/HTML URLs remain
  inert. Explicit images use a separate authenticated bounded original read;
  switching away while that request is pending cancels opening, not the user's
  later focus. No reconnect, post, receipt, new grant or automatic retry occurs.
- `images = false` disables **automatic** inline reads, not an explicit image-open
  request. The shared single native-operation guard still applies; the automatic
  thumbnail attempt budget is unchanged. Missing decoders/unsupported attachments
  report unavailability.

The explicit image is **original-derived pixels up to 1600×1200**, preserving
aspect ratio and never upscaling; animation uses its first frame. Arbitrary links
remain inert. Inline previews alone remain 240×144.

## Buffer viewer

One reusable owned `wbx://image` nofile buffer (`filetype=wbx-image`) shows Kitty
Unicode-placement graphics where supported, otherwise the 40×12 braille preview.
It works on non-graphical terminals and in Vim without an image plugin. Native
splits, close/wipe, hooks, mappings and colorschemes remain available. No Enter or
write action sends anything. Opening preserves drafts and history reading anchors.

The buffer is a memory-only snapshot. Hidden/reopened snapshots do not fetch again;
explicit clean reloads reconstruct that snapshot. Edits pause replacement and
graphics, and a rename/promotion releases ownership without erasing user text.
An occupied or annotated viewer name is never reclaimed by force. Closing the
window leaves the snapshot in memory; native `:bwipeout` removes it.

## External viewers

No external executable is configured or launched automatically. In Lua/LazyVim
options, for an installed terminal tool:

```lua
image_open = 'external', -- optional: only changes :WebexImage's explicit action
image_viewer = {
  argv = { 'chafa', '--format', 'symbols', '--' },
  terminal = true,
},
```

Plain Vim equivalent:

```vim
let g:wbx_tui.image_open = 'external'
let g:wbx_tui.image_viewer = {'argv': ['chafa', '--format', 'symbols', '--'], 'terminal': 1}
```

For an installed graphical viewer use, for example:

```lua
image_viewer = { argv = { 'imv' }, terminal = false },
```

The PNG path is appended as **one literal argument**. No shell string, tilde/glob
expansion, `%`/placeholder interpolation, system-opener inference or installation
occurs. Include any required `--` in `argv`. Programs must run in the foreground:
forking/delegating openers such as `xdg-open`/`open` can exit before their actual
viewer reads the file and are not supported for this lease lifecycle.

`terminal=true` opens a separate native editor terminal, including an actual PTY
and stdin for interactive viewers. Output remains in that terminal until closed;
closing/wiping it stops its owned viewer. `terminal=false` starts a noninteractive
job without changing the editor's focused window or displaying provider output.
A graphical program may itself focus its own OS window. Only one external viewer
is admitted at a time. Moving away before export completion cancels launch.

### Privacy and lifetime

The local `scripts/image-lease.mjs` helper receives only the normalized higher-resolution PNG over
stdin. It cannot retrieve Webex content and receives no URL, attachment filename,
message ID or bearer token. It creates one random `wbx-image-*` directory under the
OS temporary directory (`TMPDIR` if set), mode **0700**, and `preview.png`, mode
**0600**, returning only that path locally, never through the Webex RPC protocol.
Input and image size/dimensions are bounded; no shell or persistent cache is used.

The helper removes its exact file/directory on viewer exit, terminal wipe,
messaging disconnect/backend exit, editor shutdown/pipe EOF or a 30-minute lease
limit. The limit also stops the owned viewer. External tools are user-trusted,
not sandboxed: they can read/save/upload the handed-off pixels or fork their own
children; their copies and descendants are not managed. The export is temporary
**plaintext**, not encryption; unlink is not secure erasure. SIGKILL of the helper
or OS failure can leave the private temporary file behind. Buffer-only viewing
creates no image file. No broad startup scavenging or unrelated-file deletion is
performed. No meeting owner/process is reused or stopped.

## Upstream context

The original writer defect was in this plugin's `/dev/tty` integration, not a
demonstrated Neovim core bug. Upstream already merged
[PR #35406, `feat(tui): add nvim_ui_send`](https://github.com/neovim/neovim/pull/35406)
on 2025-08-22; the [documented API](https://neovim.io/doc/user/api.html#nvim_ui_send())
is available since 0.12. Related tracked issues include
[#35079, stdout truncation](https://github.com/neovim/neovim/issues/35079) and
[#36317, newly attached UI behavior](https://github.com/neovim/neovim/issues/36317),
both closed at review time; neither is claimed as our exact `/dev/tty` failure.

A plugin patch/PR with our regression is appropriate once a target repository is
chosen. This checkout has no configured remote. No issue, PR, commit, push or
remote change was made. A new Neovim issue would need an independent reproduction
of its documented API failing, which we do not have.

## Verification

`test/editor/image-opening.vim` covers disabled automatic reads with explicit
opening, delayed-open cancellation, both attachment indices, snapshot reuse and
clean reload, annotation/rename and FileType-hook preservation, draft/history
continuity, graphical and terminal fake executables, literal argv, private file
modes, duplicate-launch refusal, export cancellation and terminal-close cleanup.
It audits exactly one preview request and zero posts/receipts. The drawn variant
also requires the real graphics writer to place the viewer image with automatic
inline images disabled. `test/image-lease.test.ts` checks normalized bytes,
0700/0600 modes, EOF/signal cleanup and malformed/non-raster/oversized rejection.

Full Vim is unavailable and remains an explicit skip; no actual third-party
graphical viewer, live Webex photo, OAuth, receipt, media or device acceptance was
run. External-viewer acceptance uses synthetic executables, not installed tools.

The first staged gate (`/tmp/opencode/wbx-image-opening-verification-72c0ev0p/`)
passed core/native/new-image checks but **failed** drawn `spaces-cache` with a
timeout. Repeating it and preserving the private PTY output reproduced a `More`
prompt: the new catalogue entry made the existing full `maparg` dump from health
exceed the screen. The correction echoes only binding keys/commands while keeping
the complete return value for integrations. The drawn runner now preserves a
private timeout capture rather than silently losing this diagnostic evidence.

### Final staged gate — 2026-11-11

Run: `/tmp/opencode/wbx-image-opening-final-vhe5g7wp/`, with all builds in its
`project/` copy. Dependencies were reused without installation; HOME/config/cache/
state were private and live/media test opt-ins disabled. Every check passed:

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including the three new image-lease tests | **425 pass, 11 skip, 0 fail** |
| Native editor fixtures | **23 Neovim pass, 23 Vim skip, 0 fail** |
| Separate actual lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including image opening and spaces-cache | **12 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy help tags pass |

Core skips are eight compatibility-CLI opt-ins, two optional SDK opt-ins (covered
separately), and one unavailable-Vim people fixture. The baseline loader opt-in
skip is covered by the actual-loader run. Missing Vim is never counted as a pass.
`summary.json` records every return code; logs are `plugin.log`, `lazy-loader.log`,
`messaging.log`, `sdk.log`, `browser-controls.log`, `screen-*.log` and
`history-benchmark.log`.

All **243 source files** matched the staged SHA-256 manifest after verification.
Only this final evidence update follows; the other **242 files** still match,
with no later runtime/test changes. All **ten existing bundle/map hashes** remain
unchanged. `final-checks.json`, `docs-final.log` and `final-evidence.diff` record
final documentation, private-copy help tags and integrity checks.

Manifest SHA-256:

- `source-manifest.json`: `a0a5da875537b1933da84d28c6bd648908bb15c9cbcbb8d6e7e9840c6c3c1035`
- `original-dist-manifest.json`: `f0b23dc0eab1cc4791ed6ba38bb52e4d7bb80794a40c5f437437a973f530ad1c`

Changes remain uncommitted. No installed configuration, active build/editor,
real account, receipt/device path or meeting owner was changed or exercised.
