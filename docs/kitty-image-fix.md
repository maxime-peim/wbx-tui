# Kitty image output correction

Status: reproduced, corrected and staged-regression verified; not activated.
No active editor, terminal policy, installed configuration, original build
or Webex session was changed. This correction is editor-only: an already-current
backend does not need rebuilding. Preserve memory-only drafts and restart the
editor when ready; never hot-source the main autoload.

## Failure and confirmed cause

The reported screenshot shows our monochrome braille fallback under
`[Image preview]`, not Kitty's private-use image placeholders. Kitty detection,
truecolor and the reported window width were all eligible. Separate user snapshots
reported no ready images/placements at their sampling point; that discrepancy is
not silently treated as proof of a transport failure.

A new isolated native fixture independently reproduced a concrete writer defect:
with normal detection enabled in a drawn Kitty-profile TUI, the old writer installed
no image marks. The previous fixtures replaced both detection and `/dev/tty` I/O,
so their passes did **not** exercise this path.

Neovim 0.12 separates its core from the TUI. Opening `/dev/tty` in the core is not
a reliable way to reach the user's terminal. The corrected writer uses
[`nvim_ui_send()`](https://neovim.io/doc/user/api.html#nvim_ui_send()) on 0.12+,
which sends bytes to the attached TUI; older built-in TUIs retain stdout output.
No editor option, terminal permission or tmux policy is changed to make it work.
The read-only tmux option check also includes inherited settings (`-A`).

Before/after reproduction: `/tmp/opencode/wbx-kitty-image-reproduction-9uzghazi/`.
The same normal-writer fixture fails with the original image module in a private
copy (`before.log`) and passes with the corrected module (`after.log`);
`summary.json` records both module hashes and return codes. No prior verified
snapshot or active checkout build was overwritten to reproduce the failure.

## Diagnostics and ownership

The `images` dictionary in `:WebexHealth` now reports only counts/enums:

- `mode`: `kitty`, `unicode` or `off`.
- `reason`: for example `sent-to-ui`, `no-ready-images`, `configured-unicode`,
  `truecolor-disabled`, `history-too-narrow`, `terminal-write-failed` or
  `renderer-error`.
- `output`: `ui-send` or `legacy-stdout`.

`sent-to-ui` means the data was handed to the UI, not that a live Kitty screenshot
has been visually accepted. Internal failures are sanitized to a reason and,
when available, an `E<number>` code. No provider text, image bytes, URLs, IDs,
credentials or new terminal probe is included. Failed partial allocations are
tracked before highlighting/placement, so cleanup deletes only owned image IDs.
Changing/removing attachment metadata clears both pixels and placement metadata;
plain polling preserves ready previews without rewriting the text or repeating reads.

## Verification

The new `image-renderer` fixture uses a deterministic non-uniform 240x144 RGB
gradient, the real PNG encoder, JSON-RPC state delivery, ordinary terminal detection
and the **normal writer**. Its drawn run captures output in an isolated controlling
PTY: no existing terminal, display window or account is used. The capture checks
PNG signature/dimensions/CRCs, decompressed source pixel values, quiet Kitty
transfers, virtual placement commands and Neovim-emitted placeholder characters.
Repeated state snapshots retain the image and changedtick; explicit metadata
removal leaves no orphaned braille text or real-image marks. There are no posts,
receipts or repeated image reads. The existing native fixture separately checks
UI-write failure, legacy stdout fallback and cleanup after a placement error.

The PTY runner now explicitly claims its own controlling terminal; `setsid()`
alone was insufficient to guarantee that `/dev/tty` referred to the private PTY.
This is protocol/TUI handoff evidence, not actual Kitty GPU-rendering or live
Webex-photo acceptance. No dependency install or real account/OAuth/receipt/device
test is performed. Fresh full Vim remains unavailable and is an explicit skip.

### Final staged gate — 2026-11-11

Run directory: `/tmp/opencode/wbx-kitty-image-fix-verification-jwdli5ws/`, with
the checkout copied to `project/`. Existing dependencies were reused without
installation; HOME/config/cache/state were private and live/media opt-ins off.
All builds ran in that copy, not the active checkout.

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core | **422 pass, 11 skip, 0 fail** (433 total) |
| Native editor suite | **22 Neovim pass, 22 Vim skip, 0 fail** |
| Separate real lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including the normal image writer | **11 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy native help tags pass |

The normal image fixture captured PNG bytes, virtual placement and TUI placeholder
cells without replacing detection or the output writer. It also checks that a
non-terminal UI cannot inherit a Kitty profile, inherited tmux options are read
without changing them, and health does not initiate another query. The legacy
stdout branch was exercised synthetically; a fresh Neovim 0.10/0.11 runtime was
not available for that compatibility path. Full Vim is likewise not accepted by
counting its missing-binary skips as passes.

Core skips are eight compatibility-CLI opt-ins, two optional SDK opt-ins (covered
separately), and one missing-Vim people fixture. The baseline loader opt-in skip
is covered by the separate actual-loader run. Logs are `plugin.log`,
`lazy-loader.log`, `messaging.log`, `sdk.log`, `browser-controls.log`,
`screen-*.log` and `history-benchmark.log`; `summary.json` records every return code.

All **238 source files** matched the staged SHA-256 manifest after the gate.
Only this evidence update follows; the other **237 files** still match, with no
subsequent runtime/test changes. All **ten existing bundle/map hashes** remain
unchanged through the gate and final checks. Final documentation, private-copy
native help tags and integrity results are in `docs-final.log` and
`final-checks.json`; `final-evidence.diff` records the documentation-only delta.

Manifest SHA-256:

- `source-manifest.json`: `1d6baeae53ccb5a4571104725284d14a5cb34091867ed92f7344df2d206ab801`
- `original-dist-manifest.json`: `f0b23dc0eab1cc4791ed6ba38bb52e4d7bb80794a40c5f437437a973f530ad1c`

No actual Kitty window/GPU rendering, live Webex photo, OAuth, receipt, meeting
or device acceptance was performed. The original screenshot and zero-metadata
snapshot are not relabeled as a successful live test. Changes remain uncommitted.
Preserve drafts and restart Neovim when ready; this editor-only correction needs
no rebuild of an already-current backend and never hot-sources the session owner.
