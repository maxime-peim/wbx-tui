# Higher-resolution images and a direct opening key

Status: implemented and staged-regression verified; not activated.
No installed configuration, running editor/backend,
build artifacts or account session was changed. Unlike the original preview-only
viewer, this correction **requires a backend rebuild and draft-safe restart**.
Build only when ready to activate; never hot-source the coordinator.

## Corrected behavior

- Press **`o` in Normal-mode history** on an image or its message to open it.
  The history help row shows the effective binding. `o`, `<leader>Wo` and
  `<localleader>o` now use the general [open-attachment action](attachments.md),
  including native images. `:WebexImage`, `:WebexImageBuffer` and
  `:WebexImageExternal` remain image-only controls. FileType-owned local bindings win;
  `mappings=false` intentionally disables default keys, not commands.
- Automatic inline previews remain small (240×144), cheap and bounded. Explicit
  opening independently reads the authenticated original attachment, not the
  cached thumbnail. It preserves single-pixel detail when the source fits the
  bound, preserves aspect ratio, normalizes orientation/metadata and never
  upscales smaller sources. Images larger than **1600×1200** are downscaled to fit;
  this is not unlimited full-resolution downloading. Animated images use frame 1.
- The same higher-resolution PNG goes to buffer and explicitly configured external
  viewers. External tools remain opt-in, with no automatic launch, installation or
  shell expansion. See [configuration and privacy](image-opening.md).
- The owned buffer fits graphics to available space (up to 120 columns/40 rows),
  and re-places them after resize without enlarging thumbnail pixels. Unicode-only
  terminals retain a labeled 40×12 braille fallback; real high-resolution pixels
  require supported terminal graphics or an explicit external viewer. Source PNG
  pixels remain available to that external tool. No claimed text-mode magic.
- One owned buffer snapshot can be reused without a second read. Edited/promoted
  buffers remain protected. New reads are explicit, never poll-driven; no image
  arrival replays a post, receipt or room-open action. Delayed responses cannot
  steal focus after leaving their original buffer/destination.

## Bounds and protocol

The additive `image-opening` capability admits `messages.imageOpen` with only the
current loaded room/message and its registered attachment hash. The backend checks
all three identities before fetching and after completion. Room switch, stop,
reference replacement or a mismatched result cancels the opening; no URL, path or
credential is an RPC parameter. An older backend reports that it needs rebuilding,
not a misleading thumbnail success.

The original read retains the existing authenticated HTTPS endpoint allowlist,
redirect refusal, MIME+signature checks, **8 MiB input**, 8,192 streamed chunks and
ten-second whole-operation limit. It shares native admission with inline reads:
a timed-out noncooperative read cannot overlap replacements. No original bytes or
large rasters enter the inline state, persistent spaces cache or a backend disk
cache. One result is held by the owned viewer, not a 16-image full-size cache.

ImageMagick receives only explicit PNG/JPEG/GIF/WebP stdin coders and frame 1,
128 MiB memory, no map/disk cache, 8192×8192 input-dimension limits and a five-second
process kill limit. Large sources can legitimately exceed those resource bounds
and fail; no alternate unrestricted decoder is attempted. Output is at most
1600×1200 and **6,000,000 PNG bytes**, fitting the existing 8 MiB JSON event cap.
The optional braille conversion retains the inline converter's smaller limits.

Large results are one-shot: replay IDs retain only a bounded error, never another
attachment GET or up to 64 large response bodies. The editor validates dimensions,
base64 shape/size, reference identity, braille rows and allowed fields before use.
Its external-file helper accepts the same dimensions/byte bound; owner-only file
modes, EOF/signal cleanup and 30-minute lease policy are unchanged. Temporary PNGs
are plaintext, unlink is not secure erasure, and trusted tools can retain copies.

## Verification

`test/image-detail.test.ts` checks:

- The **installed real converter** retains 960×600 single-pixel RGB detail exactly,
  does not upscale a 120×80 image, and fits a 3200×1800 image to 1600×900.
- Explicit reads authenticate original bytes independently of a cached thumbnail;
  results do not mutate the inline cache or leak URL/token data.
- Redirects, unsupported formats, bad signatures and oversized/forged-length
  bodies cannot reach decoding. Deadline and native-admission guards survive
  a noncooperative transport. Selected-space/epoch changes reject late results.
- Strict RPC fields, capability admission, bounded replay retention, and worst-case
  RGB payload fit within the existing output event cap.

The native `image-opening` fixture now **presses `o`**, checks its visible hint and
global-family alias, and verifies source dimensions in both buffer and external
handoffs. It continues checking annotations, hooks, drafts, viewport continuity,
privacy, cancellation and zero posts/receipts. Its drawn run captures the normal
writer's 960×600 PNG, validates CRCs and actual alternating single-pixel values,
and requires a placement larger than the old 40×12 thumbnail. This is transfer/
TUI evidence, not actual Kitty GPU rendering or live Webex-photo acceptance.

Initial converter testing exposed resource exhaustion on the 3200×1800 source
with a 64 MiB memory bound. The explicit-only decoder now uses a documented
128 MiB bound with mapping/disk disabled; the real-converter test passes at that
bound. No optional dependency was installed and no active session was reloaded.
Full Vim remains unavailable; no real account, OAuth, receipt, meeting or device
acceptance was attempted.

### Final staged gate — 2026-11-11

Run: `/tmp/opencode/wbx-image-detail-verification-o9fbtafe/`. All builds ran in
its `project/` copy with private HOME/config/cache/state, existing dependencies
reused without installation, and live/media opt-ins off. Every check passed:

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including seven original-detail tests | **432 pass, 11 skip, 0 fail** |
| Native editor fixtures, including the real `o` key | **23 Neovim pass, 23 Vim skip** |
| Actual lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including original-detail transfer | **12 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy help tags pass |

Core skips remain eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered separately), and one unavailable-Vim people fixture. The baseline loader
opt-in skip is covered by the actual-loader run. Missing Vim is not a pass.
`summary.json` records every return code. Logs are `plugin.log`, `lazy-loader.log`,
`messaging.log`, `sdk.log`, `browser-controls.log`, `screen-*.log` and
`history-benchmark.log`.

All **246 source files** matched the staged SHA-256 manifest after the gate.
Only this final evidence update follows; the other **245 files** still match,
with no later runtime/test changes. All **ten existing bundle/map hashes** remain
unchanged. `final-checks.json`, `docs-final.log` and `final-evidence.diff` record
final documentation, private-copy native help tags and source/build integrity.

Manifest SHA-256:

- `source-manifest.json`: `3ed2d94d0120917eb091256eeb1278665050b4e6487413f49d5b6ed4ccbbb778`
- `original-dist-manifest.json`: `f0b23dc0eab1cc4791ed6ba38bb52e4d7bb80794a40c5f437437a973f530ad1c`

Changes remain uncommitted. Preserve memory-only drafts before rebuilding the
backend/restarting the editor explicitly. This verification did not activate the
change, reconnect, broaden grants or modify any installed configuration.
