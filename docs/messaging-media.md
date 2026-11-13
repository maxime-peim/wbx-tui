# Space re-entry, image previews and Webex Sections

Status: re-entry/images implemented and staged-regression verified, not activated.
Synchronized Webex Sections remain blocked, not implemented.
The original image gate below missed a Neovim 0.12 TUI-output bug; see the
[Kitty image correction](kitty-image-fix.md) for the reproduction and updated gate.
No active editor/configuration, original build artifacts or real service session
is changed. Preserve unsent drafts, explicitly rebuild and restart when ready.

## Re-entering the current space

Plain Enter/pickers/programmatic selection do not reload an already loaded space.
Native explicit re-entry only focuses its retained history: cursor/topline, folds,
pages, undo/drafts and latest-endpoint knowledge remain intact. Initial duplicate
opens do not abort/restart pending history or replace its original focus intent.
Re-entry does not issue another people lookup or an automatic read receipt.
Failed initial history can still be retried explicitly; another space is a new
selection. Ordinary polling/`:WebexRefresh` keeps loaded message anchors.

`:WebexLatest` navigates to the canonical newest message, which may be above later
roots in grouped history. If that endpoint is outside the bounded history window,
it explicitly requests `rooms.select.reload:true`, resetting history to latest.
This is navigation, not receipt consent. Older backends get no unknown parameter.

## Image previews

```lua
images = 'auto', -- default; 'unicode' forces braille, false disables automatic reads
```

Only Webex `files` attachment references supplied by a valid room-bound message
are eligible. Arbitrary HTML/Markdown/resource URLs remain inert. Opening a space
does not itself download every attachment: only visible, unfolded preview rows
in unchanged owned history trigger the separate identity-only `messages.images`
operation. A caller cannot supply a URL, local path or bearer token.
Explicit [`:WebexImage` opening](image-opening.md) also admits a pending selected
attachment through a separate identity-bound `messages.imageOpen` operation,
including with automatic previews disabled. [Higher-resolution opening](image-detail.md)
reads original-derived pixels up to 1600×1200; it no longer reuses the thumbnail.

An existing ImageMagick `magick`/`convert` executable decodes PNG/JPEG/GIF/WebP
through stdin using an explicit raster coder, resource limits and first frame
only. No dependency install, shell command interpolation or browser is involved.
Output is a fixed 240x144 RGB canvas, normalized PNG and 40x12 braille rendering.
Without a decoder, unsupported content, expired authorization or unsafe redirects,
an explicit unavailable/unsupported placeholder remains instead of fake pixels.

Neovim 0.10+ with truecolor and a terminal supporting Kitty Unicode placements
(Kitty or ghostty) overlays the real normalized image on the same preview rows.
Unknown terminals, WezTerm's non-placeholder path, Vim, narrow windows, headless
editors and disabled graphics use Unicode. In tmux, a bounded read-only query of
the current pane's existing `allow-passthrough` is required; nothing enables it or
changes tmux/editor styling. Zellij is conservatively Unicode-only. No Snacks or
other image plugin is configured, and no persistent plugin image cache is used.
Graphics use chunked quiet (`q=2`) transfers, owned IDs and placeholder extmarks;
scrolling/folds/splits remain editor-owned. Image output never contains provider
text, URLs, local paths or terminal commands from the message body. Graphics
failure leaves Unicode, not a broken state/draft update.
On Neovim 0.12+, graphics use `nvim_ui_send()` through the attached TUI, not a
`/dev/tty` opened by the core process. Older built-in TUIs use stdout. `:WebexHealth`
includes an `images` dictionary with mode, fallback reason and output route;
no image bytes, URLs, credentials or terminal query is included in that report.

### Bounds and privacy

- Exact TLS `https://webexapis.com/v1/contents/<opaque-id>` only, no userinfo,
  query/fragment or redirect following. The Node owner supplies its current bearer.
  CDN redirects are intentionally not guessed/followed; some attachments therefore
  remain unavailable until a documented safe retrieval path is added.
- Four references per message, 1,000 registered opaque references, 16 cached raster
  previews. Each selected history admits at most 16 new image reads, with no
  automatic retry loop. Memory/cache eviction cannot authorize receipts.
- One native preview operation at a time, at most 8 MiB/file and 8,192 body chunks,
  ten-second whole-operation deadline; conversion is separately killed at five
  seconds with memory/map/disk/dimension/time limits. A noncooperative abandoned
  transport keeps native admission until it actually settles.
- MIME and magic bytes must agree. SVG/PDF/HTML and other active/document formats
  are not decoded. Provider bodies/errors are never forwarded to the editor.
- Automatic PNG bytes/Unicode and the separate buffer viewer are memory-only;
  explicitly configured external viewing exports a private short-lived PNG as
  documented in [image opening](image-opening.md). The optional spaces cache still
  stores no messages, attachments or image data. Room changes/stop suppress late
  results; current loaded identity and image references must still match.
- Preview reads never send posts/receipts, replay opens, alter grants or change
  drafts. Pending enabled previews withhold automatic receipt eligibility; arrival
  does not replay the receipt. `images=false` prevents automatic preview reads,
  including on previously received pending metadata; an explicit image-open
  action can still request one. Enter/write in composers never send.

## Webex Sections

**2026-11-14 follow-up:** [R6b provider review](native-sections-research.md)
rechecks current official desktop/mobile synchronization behavior and 238 installed
SDK source files. Native Sections do synchronize in Webex's own apps; no validated
approved import/export provider was established. F2 Local sections and F5 Server
Teams remain distinct. The dated review below is historical evidence, not a
claim that all private synchronization is impossible.

The user's existing personal Sections in Webex are **not** the Teams API, and
their existence does not prove they are local-only: Webex's own apps may synchronize
private preferences. The blocker here is a supported public retrieval surface.

Review on 2026-11-11 found no Sections list/membership API in the public Rooms
reference, no suitable surface in the installed Webex SDK **3.13.0**, and no current
documented replacement. Cisco's [Sections API support discussion](https://community.cisco.com/t5/webex-for-developers/how-can-i-create-a-section-via-api/m-p/4968416)
states that no corresponding API was available (2023); the later
[hide/mute/Sections request](https://community.cisco.com/t5/webex-for-developers/hide-mute-spaces-using-api/td-p/5268968)
and [public Rooms reference](https://developer.webex.com/docs/api/v1/rooms/list-rooms)
do not supply an implementation contract found in this review. This is an
evidence-bounded limitation, not proof that Webex has no internal synchronization.

No private endpoint was invented or probed, browser cookies/account data scraped,
or extra grants requested. No unrelated client-local grouping is substituted.
Actual Sections import/sync needs a documented read source or separately approved
investigation of an available export/provider.

## Verification

Focused tests cover URL admission, memory-only PNG/braille rendering, authenticated
bounded reads, unsupported MIME/signatures/redirects, timeouts and late data,
actual installed converter stdin decoding, selected-message binding, same-space
idempotence, latest resets and protocol validation. The synthetic native
`media-resume` fixture checks pending-open deduplication, retained views/drafts,
Unicode display, strict payloads, owned-ID protocol output through a stubbed writer,
explicit latest reload without receipts, shared-image ownership, and backend
replacement during a pending preview without losing drafts or blocking the next
session's previews. A drawn PTY run also passes.

### Final staged gate — 2026-11-11

Run directory: `/tmp/opencode/wbx-media-resume-verification-0r1odt0a/`, with the
checkout copied to `project/`. Existing dependency inputs were reused without
installation. HOME/config/cache/state were private and live/media test opt-ins
disabled. Builds ran only in the staged copy, not the active checkout.

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including **13 new image/re-entry checks** | **422 pass, 11 skip, 0 fail** (433 total) |
| Native editor suite | **21 Neovim pass, 21 Vim skip, 0 fail** |
| Separate real lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including media/resume/reconnect | **10 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy native help tags pass |

The core skips are eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered separately above), and one missing-Vim people fixture. The baseline
loader opt-in skip is covered by the separate actual-loader run. Full Vim is
unavailable; skips are not passes or fresh strict two-editor acceptance.

An earlier gate (`wbx-media-resume-verification-9mr7kijv/`) also passed, before
final review added pending-preview backend-replacement cleanup, shared-image
ownership and history-budget regression coverage. The final gate above verifies
all of those changes. Keyboard/receipt fixtures now use explicit forced reloads
where fresh injected provider results are the subject, and separately assert
that ordinary re-entry preserves the reader without any request. The first
keyboard response is explicitly gated rather than relying on a timing race.

Logs: `plugin.log`, `lazy-loader.log`, `messaging.log`, `sdk.log`,
`browser-controls.log`, `screen-*.log` and `history-benchmark.log`;
`summary.json` records every return code. All **236 source files** matched the
staged SHA-256 manifest after verification. Only this final evidence update
follows; the other **235 files** still match, with no subsequent runtime/test
changes. All **ten existing bundle/map hashes** remain unchanged through the
gate and final checks. Documentation, private-copy native help tags and integrity
results are in `docs-final.log` and `final-checks.json`; `final-evidence.diff`
records the documentation-only delta.

Manifest SHA-256:

- `source-manifest.json`: `cfbabbafd40c5f6a35d1d37f74232b43bf2a79d78c19cca5c6b739ae4609a769`
- `original-dist-manifest.json`: `9d2234d38e96ce18215b0058f2463d7a81ff97bfec5bd7b9d2fb0b8850c87c89`

Real terminal-image interoperability and live Webex image/Sections/OAuth/receipt/
device acceptance are **not** claimed: the real-image protocol uses a stubbed
writer, while drawn checks exercise native Unicode/layout behavior. No dependencies
installed, active session reloaded, permissions changed or changes committed.
Preserve unsent drafts, explicitly run `npm run build`, then restart when ready;
do not hot-source the main autoload. Existing Sections sync is still unsupported.
