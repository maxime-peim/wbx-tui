# Open or download message attachments

Place the cursor on a message in loaded history:

- `:WebexAttachment [1-10]` opens an attachment, including images. On an inline
  image it selects that image; otherwise multiple files prompt for a number when
  the index is omitted. `0` cancels. History and selection show the safe filename
  and MIME type when available, in the message's original file order.
- `:WebexAttachmentDownload [1-10]` reads an attachment, then prompts for its
  destination. Clear the path to cancel. A successful save is permanent.

**`<leader>Wo` is the general “Open attachment” action**, replacing its image-only
label/action. History's `o` and `<localleader>o` use that same command. Download
remains `<leader>WA`; there is no separate default `<leader>Wa` open binding.
Existing user mappings are preserved. Both commands also have matching `<Plug>`
mappings. Enter and writes never post messages or authorize receipts.

With `attachmentMetadata:["headers-v1"]`, visible unfolded history requests
header-only `HEAD` labels, even with `images=0`: at most 16 message attempts /
64 file references per selected-space visit, ten files per message, one batch
at a time, ten seconds per batch. Successful sanitized labels are cached only
in the bounded session reference map; space/session changes cancel late work.
No content body, redirect, GET fallback or automatic retry is used for labels.
Unavailable metadata and older backends show “Name unavailable · type unknown”.
The filename/type line replaces the attachment count and redundant unsupported
image-preview line. Explicit opening still validates fresh content and metadata.

## Native buffers

Without an external handler, supported UTF-8 text opens in a **new split and new
buffer**. This includes text/source files regardless of whether syntax support is
installed. The current session's filetype detection, syntax, filetype plugins,
mappings and normal undo remain in control. FileType-hook annotations and earlier
attachment-buffer edits are not overwritten by subsequent opens.

These are editable `nofile` copies, not remote files. Modelines, swapfiles and
persistent undo are disabled locally before inserting content. There is no send or
write-back action. Use `:write /chosen/new/path` to save an edited text copy; use the
download command to preserve the attachment's **original bytes**, including binary
data. Unmodified copies are not persisted automatically; preserve edits before exit.

Native text viewing is bounded to **1 MiB / 20,000 lines**, with valid UTF-8 and no
binary/control bytes except tabs and line endings. Other encodings, larger text and
binary formats require a configured tool or download. A filename or MIME type alone
never authorizes interpreting binary content as text. Arbitrary document plugins
are not auto-detected or invoked through `BufReadCmd`.

Without a matching attachment handler, PNG/JPEG/GIF/WebP use the existing native
image viewer through this **same open action**, preserving `image_open` and its
explicit external-viewer option. This also works with inline previews disabled and
for loaded attachments beyond the four inline-preview slots. `:WebexImage`,
`:WebexImageBuffer` and `:WebexImageExternal` remain explicit image-only controls;
their index is still 1–4. Inline image settings and automatic attempt budgets are
unchanged. From an existing image buffer, the general open action reuses its
snapshot instead of selecting or fetching another attachment.

With `attachment-typed-open-v1`, a new explicit open uses **one authenticated content
GET**. The editor supplies only bounded extension/MIME selection hints; Node obtains
safe metadata and returns either original bytes or an original-derived normalized
PNG from that same read. A matching file handler still takes precedence and receives
original bytes. No reusable original-byte cache is created.
Clean image-buffer snapshots, and source-bound history snapshots when no handlers
need metadata, still reopen without fetching.

With the additional `attachment-chunks-v1` capability, the native client preflights
its bundled local sink before GET and opts into one-credit **49,152-byte decoded
chunks** (at most 123). A short-lived, non-reusable descriptor transports only the
chosen representation. Sink digest/format checks and backend completion precede
display, tool launch or a save prompt. PNG snapshots/optional graphics stay
segmented; original bytes are never retained as a presentation snapshot.
The fixed transfer lifetime is 30 seconds with a five-second idle timeout; neither
extends GET/converter budgets. A draining local sink keeps admission until actual
exit. Failures never automatically retry or downgrade. Typed-only backends retain
the existing A1 inline shape, selected before dispatch. See the
[approved transfer contract](attachment-transfer-design.md).

Unhandled native rasters retain **8 MiB input / 6,000,000-byte PNG / 1600×1200**
bounds, including unpreviewed images, attachments beyond the first four, and images
with unrelated handlers. Downloads, matching handlers and generic data remain
limited to **6,000,000 original bytes**. A 7 MB raster may open natively, but it
cannot silently bypass the original-byte limit through a handler or download.

Older backends keep the labeled legacy behavior: a ready projected image without
handlers may use the direct image read, while unknown/unhandled images can require
a generic read followed by an image read, inheriting the generic 6 MB cap. No failed
typed operation automatically retries or downgrades to that path. The reviewed
[A1 contract and evidence](attachment-open-design.md) describe both modes. Backend
and native changes require a deliberate draft-safe rebuild/restart; no activation
or installed configuration change is automatic.

## External tools

Add to existing Lua/LazyVim options; no installed configuration is rewritten:

```lua
attachment_handlers = {
  [".pdf"] = { argv = { "zathura" } },
  [".csv"] = { argv = { "visidata" }, terminal = true },
  ["image/png"] = { argv = { "imv" } },
},
attachment_download_dir = "~/Downloads", -- optional; defaults to current directory
```

Vim equivalent:

```vim
let g:wbx_tui.attachment_handlers = {
      \ '.pdf': {'argv': ['zathura']},
      \ '.csv': {'argv': ['visidata'], 'terminal': 1}}
let g:wbx_tui.attachment_download_dir = '~/Downloads'
```

Exact lowercase extension keys (including the dot) take precedence over exact
lowercase MIME keys. An explicit empty extension dictionary `{}` suppresses a MIME
handler. Configured handlers override native text viewing too. The
private absolute filename is appended as **one literal argument**; no placeholders,
shell expansion, command strings, automatic system opener or executable download is
used. `terminal=true` creates an editor terminal for interactive programs; otherwise
the tool runs without taking editor focus. Programs should stay in the foreground:
when they exit, the private file is deleted, even if they spawned another process.
External tools and their own caches/history are outside the plugin's privacy control.

Only one attachment read/materialization/external handler is admitted at a time.
Close the handler before opening another attachment. A tool's exit, terminal-buffer
wipe, disconnect or editor exit releases its file. Leases also expire after 30 minutes.
Text buffers keep their in-memory copy after their private file is released. As with
any temporary-file owner, `SIGKILL`/machine crashes cannot guarantee cleanup.

Typed opens reserve image-native admission before fetching because unknown data
may need conversion. One still-valid typed-open intent may wait up to ten seconds
behind background preview work, with no generic probe or retained bytes. A second
waiter or competing explicit operation is busy; nothing retries or reselects.
Cancellation/navigation/grant loss revoke the wait. Actual physical settlement,
not a preview caller's timeout, permits admission. Dedicated legacy image-only
methods keep their immediate busy behavior. Original-only
downloads can coexist with background previews. A timeout/cancel does not release
native admission until the underlying operation and cleanup actually settle, even
across account/session replacement. Neither failed fetches nor converters replay.

The selection policy is limited to 128 useful exact keys / 24,576 serialized bytes
within the existing 32,768-byte request. Unreachable local keys remain inert. An
oversized useful policy fails before GET, never truncates into different dispatch.
Executable settings stay local and are checked only for the selected handler;
changing relevant settings during an open cancels it, not launches a new program.

## Download authorization and limits

Invoking either attachment command explicitly authorizes its content GET using the
already-connected account. **Download additionally requires choosing a destination.**
There is no new OAuth grant, scope request, identity lookup, reconnect, message send
or read receipt. The existing Webex message-read permission is used; denied access
fails without automatic recovery or retry.

The destination's parent directory must already exist. Saves create files with mode
`0600` and **never overwrite an existing path**, including a symlink. Opening files
for text/tool viewing instead uses an exclusive `0600` file in a private `0700`
temporary directory, removed on release. Downloads remain until the user removes
them. The initial directory setting is a suggestion, not a sandbox.

Content reads are restricted to registered, exact HTTPS Webex contents URLs from
valid loaded messages. RPC accepts identities, explicit action and representation
selection keys, never remote URLs, tokens, tools or output paths. URLs and credentials remain in Node;
filenames are sanitized basenames. Redirects and partial responses are rejected.
Original-byte reads retain **6,000,000 bytes / 30 seconds**, including streamed byte
checks. After metadata selects native raster, its budget becomes **ten seconds from
the first GET**, not ten new seconds per stage. Unknown pre-header discovery can
wait up to thirty seconds; no successful native raster gets more than ten seconds
of work. The typed method requires exact HTTP 200; legacy image-only/preview
readers' existing `response.ok` behavior is unchanged. The equivalent inline body
still fits the existing 8 MiB event budget. Chunking does not enlarge file/transport
limits: each chunk response is at most 69,632 UTF-8 bytes and only one pull is
outstanding. Content is one-shot, never retained in state snapshots, replay caches,
space caches or logs. A canceled/expired descriptor cannot fetch or replay bytes.

Late results cannot open a buffer/tool or prompt for a save after the cursor leaves
the original message/window or the destination/session changes. Typed cancellation
also revokes an away-and-back intent; already committed explicit downloads remain.
Cached spaces are
still browse-only until membership revalidation. Older backends report that an
update is required rather than guessing a download URL. This adds no automatic
attachment read; the independent, pre-existing inline image preview path is unchanged.

## Verification

Synthetic checks cover authenticated reads, URL/identity boundaries, byte/time/
reference bounds, malformed UTF-8, binary detection, filename sanitization,
one-shot RPC retention, selected-space cancellation, helper permissions/cleanup and
exclusive downloads (including symlink refusal). A native editor fixture covers
buffer filetypes, modelines, undo, hooks, separate edits, delayed focus, literal
handler argv, GUI/terminal handling, destination cancellation and unchanged drafts,
posts and receipts. No real Webex account, desktop opener or installed configuration
is exercised. Live acceptance remains unverified; offline evidence follows.

### Initial attachment gate (historical; before unified open binding)

`/tmp/opencode/wbx-attachments-verification-ic99ayvw/` passed with **456 core tests /
13 skips**, **31 Neovim fixtures / 31 unavailable-Vim skips**, **77 SDK checks**,
**44 synthetic messaging checks**, **3 synthetic browser-control checks** and
**18 private-PTY drawn fixtures** (including attachments). LazyVim checks were
**1 pass / 1 optional installed-loader skip**. TypeScript, all five copied build
artifacts and private native help tags passed. The pinned-SDK event fixtures still
cover excerpt-only previews off/on and same-account sends with network blocked.

The initial unrestricted-concurrency run at
`/tmp/opencode/wbx-attachments-verification-l0zklxrh/` hit the pre-existing synthetic
OAuth fixture's 30 ms startup-lease race before its first client connected; all
attachment, SDK and drawn checks passed there. The unchanged OAuth fixture passed
in isolation. The successful full run used `--test-concurrency=4` for the same core
tests, without relaxing assertions or changing authorization/runtime behavior.
Both runs remain separate evidence, not a silently discarded failure.

At that gate, all **267 source files** matched the staged SHA-256 manifest.
All **ten original bundle/map hashes** remained unchanged. Only its final evidence
update followed; the other **266 sources** matched then. `summary.json`,
`final-checks.json` and `docs-final.log` record the gate, final documentation check
and source/build integrity. No active editor, installed configuration, real provider
session, grant, receipt or device action was changed. Work remains uncommitted.

### Unified open-binding follow-up

The user requested that `<leader>Wo` become **Open attachment**, not a separate
`<leader>Wa` action. The command catalogue/which-key label, history `o` and
`<localleader>o`, and visible help hint now all name `:WebexAttachment`. Explicit
image-only commands remain available, including the fallback for older image-only
backend projections. Native image snapshot reuse and file-handler precedence are
preserved. General image dispatch checks the same room/message/attachment identity
before and after its asynchronous read, including attachments outside inline slots.

Focused checks passed: **34 core/media/documentation tests**, **4 Neovim fixtures**
(4 unavailable-Vim skips), TypeScript and both attachment/image private-PTY fixtures.
Cases exercise the actual `<leader>Wo` key for text and images, configured image
handlers, direct known-image reads, snapshot reuse, late-focus cancellation and
user overrides. The initial gate above predates this binding/dispatch follow-up.
No active editor/configuration/provider session or original build was changed.

The complete follow-up gate at
`/tmp/opencode/wbx-unified-attachment-open-verification-fm_phtcd/` passed:
**457 core / 13 skips**, **31 Neovim / 31 unavailable-Vim skips**, **77 SDK**,
**44 synthetic messaging**, **3 browser-control** and **18 drawn fixtures**;
LazyVim remained **1 pass / 1 optional skip**. TypeScript, all five copied artifacts
and private native help tags passed. Core concurrency was bounded to four, without
changing authorization logic. All **267 sources** matched the staged manifest and
all **ten original bundle/map hashes** stayed unchanged. Only this evidence update
followed; the other **266 sources** still match. Finalization rechecks documentation
and source/build integrity. Live acceptance remains unverified; work is uncommitted.
