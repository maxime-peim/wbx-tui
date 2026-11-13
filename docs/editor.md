# Vim / Neovim client

wbx-tui is an editor plugin suite backed by the Node Webex engine. Messaging uses
**native buffers and windows**, not an emulated editor. Meetings keep their real
tmux participant/share panes and one media owner. The old standalone interfaces
remain compatibility/reference clients.

**Current delivery state:** native controls, folding, edge paging, geometry,
reader anchors and safety changes are implemented and offline-validated in staged
builds, including both editors and private drawn PTYs. The live editor/backend
and its build artifacts were not replaced. The approved presence-only integration
now defaults on for the selected direct peer; custom-status text is unsupported. Current commands, results and
limitations are in the [verification index](verification-index.md), separate
from historical test totals and live acceptance.
The [Neovim gutter follow-up](gutter-ui.md) retains its original missing-Vim record;
later strict gates cover both editors without relabeling those historical skips.
The [native option catalogue](native-options.md) lists Vim/Lua keys and defaults;
local settings are not automatically forwarded to the backend.

## Local messaging productivity

`<leader>Wab` toggles a **session-only local bookmark**; `Wvb` lists them.
`Waq` captures copied text in main history; `Wai` appends it to the same-space
plain composer with one native undo. Nothing is sent. A changed/unloaded source
blocks submission until recaptured or explicitly detached with `:WebexQuoteDetach`.
`Wvh` opens an on-demand **loaded/partial thread** and `Wvg` lists loaded file
messages (`:WebexContent links` / `media` select the other projections).
Enter in a list navigates to an exact loaded main-history message, not an opener
or receipt. `r` regenerates locally; `q` returns; `/` searches.
All use the existing configurable catalogue, effective `W?` help, optional
which-key and mapping opt-outs/conflict preservation. No extra plugin is needed.
See [scope, limits and current evidence](messaging-parity-implementation.md).

`<leader>Wnp` / `:WebexDirectory [name prefix]` runs one explicit bounded company
directory **prefix** query, without presence/avatar lookups. The on-demand list
shows exact IDs for disambiguation; Enter prepares a DM through the existing
fresh identity owner and never sends. `r` refreshes, `]p` explicitly pages,
`q` returns. Limits: 50/page, five pages/250 identities, two-minute expiry;
existing known people-read grant required. No empty query/org enumeration or
scope expansion. See the [public provider contract](messaging-public-provider-audit.md).

For explicit remote reads, use `WvH` / `:WebexThreadFetch` on a main-history
message, or `Wvi` / `:WebexMentions` for the selected space's API @me results.
`r` refreshes; `]p` requests one next page. These are bounded, expiring query
views, not receipt authority, a global inbox or verified @all coverage.
Enter opens an inert mention body or jumps only to an exact already-loaded
main-history message; nothing is fetched implicitly. Files/actions stay inert.
`WaR` / `:WebexThreadReply` replies from unchanged loaded history or reuses an
existing exact-root reply draft from a current queried thread when its
verified root is still referenced by main history; never sends or alters its
text/undo. Local `Wvh` remains loaded-only. See the
[MF07/MF11 contract](messaging-public-provider-audit.md#mf07--mf11-selected-room-read-contract).

`WnP` / `:WebexProfile` on a current directory/member row explicitly reads that
exact person's **textual** details. `:WebexProfile exact-person-ID` is also
available; labels and emails are not resolved. The on-demand view includes only
display/first/last name, department, title and time zone, with missing/normalized
fields labeled partial. `r` refreshes that same ID/session; `q` returns; `/`
searches. Enter never sends, prepares a DM or opens an avatar.
No presence/custom status/avatar/private contact/admin data, cache enrichment,
profile writes, grant expansion or background polling is added. Automatic
presence/name opt-outs remain independent and unchanged. See the
[MF19 contract](messaging-public-provider-audit.md#mf19-selected-person-textual-profile-contract)
and `:help wbx-tui-profiles` for limits and stale-result guards.

Supported Adaptive Cards 1.0–1.3 now render a bounded **read-only text subset**
inside ordinary history. `WvC` / `:WebexCards` / `:WebexContent cards` opens an
on-demand **loaded-only** card-message list, using the existing local content
owner. Enter jumps to its exact main-history message; it never executes an
action, opens a URL, fetches an image or submits input. `r` regenerates locally,
`q` returns and `/` searches. Unknown versions/elements, hidden subtrees, input
defaults, action data and nested ShowCards are omitted, never dumped or evaluated.
Existing fallback text, mappings/opt-outs, annotations, folds and native undo
are retained. See `:help wbx-tui-cards` and the
[readable-card contract](messaging-public-provider-audit.md#mf13-approved-readable-card-subset).

`WvT` / `:WebexJoinedTeams` explicitly lists Teams the authenticated user belongs
to, separate from existing `Wvt` loaded-room labels. `r` starts a fresh same-session
query; `]p` reads one unexpired exact-revision page; `q` returns and `/` searches.
Enter filters only currently loaded noncached spaces by the exact row ID. It
never joins, fetches rooms or changes the selected draft destination; no loaded
spaces is not proof of Team emptiness. Limits: 50/page, five pages/250 IDs, 64 KiB
retained item data and two-minute query lifetime, with partial/observation labels.
Only sanitized names/IDs are projected, with known `spark:teams_read`/`spark:all`;
no grant expansion, background scan or role authority. See
`:help wbx-tui-joined-teams` and the
[MF25 read contract](messaging-public-provider-audit.md#mf25-joined-team-listing-contract).

## Install

Requirements: Node **22.12+**, npm, and Neovim or a full Vim build with
`+job +channel +timers`. Meeting demos additionally need Linux, `tmux`,
Chrome/Chromium, and either Kitty with a graphical display or an editor with
terminal support (Vim `+terminal`). Live meetings also need the separately fetched
browser SDK (`npm run sdk`); ordinary REST messaging and demos do not.
`vim.tiny` is not sufficient. The latest strict gates used Neovim 0.12.6 and Vim 9.1 Huge;
older releases are not yet acceptance-tested.

Build the engine in your local checkout (not in your Neovim config directory):

```sh
cd ~/src/wbx-tui   # change to your checkout
npm ci
npm run build
```

### LazyVim

LazyVim already configures **lazy.nvim** and imports `lua/plugins/*.lua`. Create
`~/.config/nvim/lua/plugins/wbx-tui.lua` (or the equivalent under your
`$XDG_CONFIG_HOME` / `$NVIM_APPNAME` Neovim config directory) with this **complete
file**, including the `return`:

```lua
-- ~/.config/nvim/lua/plugins/wbx-tui.lua (LazyVim plugin spec)
return {
  {
    dir = vim.fn.expand('~/src/wbx-tui'), -- change to your checkout
    name = 'wbx-tui',
    lazy = false, -- register commands at startup; does NOT start the engine
    main = 'wbx-tui', -- opts are passed to require('wbx-tui').setup()
    build = 'npm ci && npm run build',
    opts = {
      mappings = true, -- j/k, Enter opens a space; i composes; Backspace returns
      send_with_ctrl_s = false, -- keep LazyVim's save key; Normal <localleader>s sends
      statusline = false, -- keep LazyVim's statusline
      picker = 'builtin', -- optional picker uses vim.ui.select; Enter needs none
      meeting = { display = 'auto', fallback = 'editor', leave_on_exit = false },
    },
  },
}
```

This is also available as [`examples/lazyvim.lua`](../examples/lazyvim.lua).

- `dir` points to an **existing local checkout**; it is not a GitHub plugin ID.
  The checkout is used in place; no remote repository name is assumed.
- `main` selects the Lua setup module explicitly. Put editor options in `opts`,
  not in a standalone top-level `require('wbx-tui').setup(...)` file under
  `lua/plugins/`. Do not add another `require('lazy').setup()` or a runtimepath
  line to LazyVim.
- `lazy = false` makes every `:Webex*` command available at startup, even if you
  changed lazy.nvim's default loading policy. Only the small editor integration
  loads then: no Node backend, OAuth, browser or meeting starts.
- `build` is a lazy.nvim install/update hook, **not a startup hook**. For a local
  checkout, do the manual build above first and after pulling engine changes;
  alternatively run `:Lazy build wbx-tui` explicitly. Do not assume `:Lazy sync`
  will rebuild an already-present local checkout.
- Keep OAuth/client secrets in the private engine JSON, never in this Lua file.
  An optional engine config path belongs in `opts.config`, not the spec's
  `config` field (which lazy.nvim reserves for a setup function).

Restart Neovim. Check `:Lazy` for the local `wbx-tui` entry, then run:

1. `:WebexHealth` — `backend_built` should be `1`; merely loading the plugin
   should leave `backend_running` at `0`.
2. `:WebexDemo` — local synthetic messaging, no Webex account.
3. Move through spaces with **j/k** and press **Enter** to open one, just like a
   file. History focuses the **canonical newest message**, which need not be the
   last row in grouped threads. Roots and each thread's replies are chronological;
   `:WebexLatest` locates the newest ID. Press **i** to start composing in Insert
   mode; **Backspace** in history returns to the spaces list. Native **/** searches
   the list by title.
4. In the composer, Enter inserts a newline. **Esc**, then **`<localleader>s`**
   explicitly sends into the local demo only (by default, `\` followed by `s`).

`:WebexDestination` inspects the current draft's exact destination and readiness
without sending or starting a backend. With `statusline = false`, explicit compose
also prints this context, so keeping LazyVim's statusline does not hide the target.

The spec enables buffer-local navigation without taking LazyVim's global keys or
statusline. **Ctrl+s is not bound to Webex sending** with
`send_with_ctrl_s = false`; it retains your editor's binding (writing a `nofile`
draft may be refused, but never sends). The normal-mode `<localleader>s` send
shortcut is separate from typing, Enter and saving. Set `send_with_ctrl_s = true`
only if you also want Ctrl+s to **send**, rather than save, in a Webex composer.
`mappings = false` remains an advanced opt-out of all default mappings;
it is not needed to preserve Ctrl+s. No `<leader>w...` mappings are installed by
this spec, avoiding LazyVim's window-management prefix. Existing buffer-local
FileType mappings still take precedence. The implemented global uppercase
`<leader>W` family is separate from lowercase LazyVim window keys; configure
`leader_prefix` to change it, or `mappings = false` to opt out of default maps.
Existing conflicting mappings are preserved. See [the command family](#global-command-family)
for source defaults and effective-binding help. No installed recipe is rewritten.

**Updating an earlier recipe:** replace `mappings = false` with
`mappings = true, send_with_ctrl_s = false`. This restores Enter navigation
without turning your save key into a send key. The plugin does not rewrite your
editor configuration.

If `:WebexDemo` is unknown, check that `:Lazy` lists `wbx-tui`, that the file
returns the spec above, and that `dir` is the repository root containing both
`plugin/wbx.vim` and `lua/wbx-tui/init.lua`. If health reports an unbuilt backend,
run `:Lazy build wbx-tui` or the shell build above. `:messages` shows loader/setup
errors. Do not work around loading errors by adding a second plugin setup.

For actual Webex access, configure [live OAuth](#live-oauth) separately and use
`:Webex` instead of `:WebexDemo`. Installation, health and demo steps never sign
you in. See the upstream [LazyVim plugin guide](https://www.lazyvim.org/configuration/plugins)
and [lazy.nvim spec reference](https://lazy.folke.io/spec) for loader configuration.

### Plain Vim / Neovim

Without LazyVim, add the checkout to `runtimepath` in Vimscript (or use your
plugin manager's local-directory option):

```vim
set runtimepath^=/absolute/path/to/wbx-tui
```

Alternatively, link it into your editor's native `pack/*/start/` directory.
[`examples/editor.lua`](../examples/editor.lua) is a plain Neovim `init.lua`
configuration snippet, **not** a LazyVim plugin spec. Use
[`examples/lazyvim.lua`](../examples/lazyvim.lua) for LazyVim instead.

Vim needs **no Lua** or external editor plugins. `:WebexHealth` checks the local
client without logging in; Neovim also supports `:checkhealth wbx-tui`. To install
help tags manually, run `:helptags /absolute/path/to/wbx-tui/doc`.
Loading/configuring the plugin never connects, joins, or captures anything.

## Safe local demo

`:WebexDemo` opens the native spaces/history/composer workspace with synthetic
messages. **j/k → Enter** opens the highlighted space and focuses its history.
Opening a different space with Enter locates its canonical newest message,
which can be above later roots in grouped history. Re-entering the loaded space
only focuses its retained history, preserving cursor, viewport, folds, loaded
pages and drafts, without another read/receipt. `:WebexLatest` / `<leader>Wg`
returns there without opening closed folds or implicitly issuing a receipt.
Background polls and incoming messages do not pull you down if you scroll up.
**i** starts composing; **Backspace** in history returns to spaces. No selection
command is required. Insert mode, motions,
visual selections, registers, undo, splits and your colorscheme are the editor's
own. Enter in a composer inserts a newline. **Esc → `<localleader>s`** explicitly
sends; writing, Enter and leaving Insert mode do not. `:WebexSend` remains an
alternative. Ctrl+s also sends by default outside the LazyVim recipe; set
`send_with_ctrl_s = false` to preserve your save binding while retaining
navigation. A successful ACK clears
only the original, unchanged draft. Switching spaces retains separate drafts.

### Upcoming meetings in spaces

When a Webex-visible host/invitee meeting approaches, up to three cards appear
above spaces (five-minute grace through thirty minutes ahead). Times marked `Z`
are UTC. Select a fresh card and press **Enter** to join through the existing
single media owner, with transmission initially disabled. Discovery, refreshes,
clock changes and list reordering never join automatically.

Discovery requires the already-granted **`meeting:schedules_read`** scope;
`spark:all` alone does not suffice. Missing grants are shown in the footer and
`:WebexHealth`, without changing scopes/configuration or opening OAuth. Set
`upcoming_meetings = false` before connecting to disable discovery.
`:WebexUpcoming` / `<leader>Wmu` refresh explicitly; cached cards are not joinable.
Only supported API-visible series/occurrences and safe public links are shown,
not a complete calendar. [Exact capability and bounds](upcoming-meetings.md).

### Optional local spaces cache

**`spaces_cache = true`** is the native default (Vim:
`g:wbx_tui.spaces_cache = 1`); set false/0 to opt out before connecting. After explicit
sign-in and verification of the current account, a cached list can appear while
REST/unread initialization continues. Its **muted titles and STALE/browse-only
footer** distinguish it from a fresh list. Enter, pickers and programmatic
selection cannot open a cached row. Revalidation never replays an earlier click,
send or receipt; press Enter again on a fresh row when ready.

IDs, titles, types and ordering activity are stored. With `read_status = true`,
last-confirmed read/unread booleans and their individual observation times are
also retained, **always stale on restore**, never receipt authority. This metadata
file excludes messages, drafts, tokens and SDK last-seen dates. Files are owner-only **plaintext**
under `$XDG_CACHE_HOME/wbx-tui-spaces/` (normally `~/.cache/wbx-tui-spaces/`):
500 entries, eight bounded slots and six-hour maximum display age. Keys use the
verified account plus OAuth/config profile, not a rotating token. One bounded
`people/me` GET requires **already-granted `spark:people_read` or `spark:all`**;
missing identity/grants or an unsafe cache only disable caching, never messaging.
No new grant, presence lookup or automatic sign-in is requested.

The same option also enables the separately authorized
[received-data cache](received-cache.md): up to 256 names and 16 rooms × 32 recent
text messages/reaction observations, in private plaintext under
`$XDG_CACHE_HOME/wbx-tui-received/`. Names refresh after six hours and expire after
24; text and reactions have independent six-hour expiry. Saved text appears only
after selecting a live listed room, explicitly stale while revalidating.
It never enters the live store or restores send/receipt/mutation authority.
No attachment data, opaque removal handles, credentials or replay contexts persist.

With caching enabled (the native default), fresh REST spaces become usable without waiting for unread
initialization; restored flags stay stale and unknown status stays unknown, with
no receipt admission until a fresh per-room SDK observation. There is no extra
option beyond `spaces_cache` and `read_status`. Cached unread emphasis remains
visible above the muted metadata styling; the footer identifies historical flags.
The [persistent unread contract](persistent-unread.md) describes independent
six-hour expiry, backwards-compatible metadata-only caches, and safety checks. With
`spaces_cache=false`, the original first-list/unread gate remains unchanged. The first
connection seeds metadata; a still-connected backend already reuses its list.
Caching does not skip OAuth or guarantee a particular live startup time.

**`:WebexCacheClear`** clears both verified current-profile cache entries and stops
cache writes for that session, without changing drafts or live history. Disabling
the option does not erase old files. Expiry is not secure deletion. See
[the cache contract](spaces-cache.md) for cleanup, exact bounds and evidence.
This is a backend change: rebuild explicitly, preserve unsent memory-only drafts,
then restart when ready. Installed configuration and running sessions are not
modified automatically.

### Message display

History defaults to native **`wrap` and `linebreak`**, plus `conceallevel=2` and
`concealcursor=nc` for reading Markdown. `FileType wbx-history` hooks and later
`:setlocal` changes remain authoritative; defaults are not reapplied on polling.
Use `:setlocal conceallevel=0` to inspect literal Markdown. Composers keep literal
editable text, and outgoing messages are still sent as plaintext.

The reader preserves Webex's `markdown` instead of throwing away formatting for
the stripped `text` alternative. HTML-only rich messages are parsed locally into
bounded Markdown, retaining basic headings, emphasis, lists, links, quotes and
code. Native syntax/conceal supplies formatting; there is no browser/HTML
execution, resource fetching or renderer
plugin installation. This is not a complete HTML/CSS or GitHub-flavored Markdown
renderer.

Quoted/forwarded content receives a distinct **`↪ Quoted / forwarded content`**
label and keeps quote structure and any attribution present in the supplied rich
body. This REST path has no reliable, separate forwarding-provenance field:
ordinary quotes share this presentation, and plain text without quote metadata
cannot be reliably identified as forwarded. No sender/original-space identity is
invented, and thread IDs or a literal “Forwarded” string are not treated as proof.

### Message blocks and replies

Message headers are **plain sender/time chrome, not `##` Markdown**. Neovim 0.10+
defaults to **`message_borders = 'gutter'`**: a subtle `▎` at the right edge of the
number/sign/fold margin, after the numbers and outside the text. Separator rows
stay blank; there are no structural rails inside the body. If `ambiwidth=double`
or a native cell-width override makes `▎` wider than one cell, an ASCII `|` keeps
the same single-cell slot. Markdown parsing is
bounded to each body with native syntax; an unclosed code fence cannot consume
the next native sender header. The plugin does **not** start whole-history
Tree-sitter and stops it on its owned history buffer; optional installed
Tree-sitter is used only for composers. Gutter-mode wrapped continuations use a
whitespace-only hanging indent through native `showbreak`. Native FileType/later
option overrides still win.

The gutter is a **history-only, window-local adapter around your original
`statuscolumn`**, not a replacement renderer. LazyVim still delegates to Snacks;
its original signs, numbers, fold controls, highlight directives and click handlers
remain intact. Empty statuscolumns use native number/sign/fold fields. No global
column settings, Snacks configuration or unrelated window options are rewritten.
Leaving or promoting history restores only still-owned settings. A FileType hook
or later `:setlocal statuscolumn=...` remains authoritative, even if it deliberately
hides the marker; polling does not reclaim it.

For the previous muted `┌`, `│`, `└─` style, set **`message_borders = 'rails'`** in
Lua setup/LazyVim `opts`, or `g:wbx_tui.message_borders = 'rails'` in Vimscript,
before opening the workspace. `b:wbx_message_borders` is a per-buffer override.
Vim and older Neovim retain rails. The gutter alone needs **no backend rebuild**:
preserve unsent memory-only drafts, then fully restart Neovim when ready, rather
than sourcing the main autoload. [Exact contract and verification](gutter-ui.md).

Replies retain their Webex `parentId`, indent by two columns and show a short
parent-author/text preview. By default they are **grouped under their root**:
roots stay chronological, and replies stay chronological inside each thread.
Set `threaded_history = false` (Vim: `0`) to retain the former global timeline.
Grouping is editor presentation only; backend messages stay chronological.
If that parent is outside loaded history, the preview
says **parent not loaded** rather than fetching extra content or inventing an
identity. Ordinary quotes/forwarded blocks do not become replies.

- Put the history cursor anywhere in a message and press **`<localleader>r`**
  (default `\r`), or run **`:WebexReply`**. This opens its thread-bound draft in
  Insert mode; it does not send. Replying to an answer targets the same Webex
  thread root, not an unsupported nested thread.
- The composer shows **Replying to …** above its text and in the default
  statusline. `:WebexDestination` and the buffer-bound destination accessor also
  expose the exact `parentId`. A scrolled draft still has its statusline target.
- **Esc → `<localleader>s`** / `:WebexSend` explicitly sends plaintext to that
  room and thread. Enter remains a newline; writing never sends.
- **`<localleader>R`** in Normal mode, or **`:WebexCancelReply`**, returns to the
  room's normal draft. It **retains** the reply buffer, its edits/undo and any
  pending delivery. Choosing that thread again restores its draft. Every
  `(room, thread root)` has its own draft, separate from the normal room draft.
  Switching reply targets reuses the owned composer pane instead of adding
  another split. Existing unrelated editor windows are left alone.
- ACK clearing requires the original unchanged draft **and matching room and
  parent**. Once a confirmed reply clears, the composer automatically returns to
  the room's normal draft, retaining any text already there. Newer reply edits or
  a different selected thread are left alone; focus never moves to another pane.
  Failed/unknown outcomes retain text; uncertainty blocks both normal and reply
  sends in that room until explicit resolution. No POST is retried.

Borders/indentation/banners are display decorations: native body yanks and draft
text do not gain rail characters or Markdown-altering whitespace. Neovim 0.10+
uses inline extmarks for indentation (and rails when selected); Vim with virtual
text properties uses those native APIs.
Older full editors fall back to sign-column borders/reply markers and explicit
parent labels; exact inline indentation is unavailable there. No editor plugin
or dependency is installed. `WbxMessageHeader`, `WbxMessageBorder`,
`WbxReplyContext` and `WbxQuoteLabel` respect native highlight overrides.
`WbxMessageGutter` links to `NonText`, `WbxReplyGutter` to `Comment`; neither sets
hard-coded white/RGB colors.

Rendering is bounded to 1,000 body lines per message and 20,000 body lines per
view. Exceeding that limit shows an explicit clipping notice and disables read
receipts from that incomplete display. Existing REST/transport limits still apply.

Replies require a backend advertising `message-replies`. An older backend is
refused rather than silently sending an unthreaded message. After updating,
restart the editor/reconnect **explicitly when ready**; never source the main
autoload into an active session, because it owns draft/session state. The block/
reply tests are synthetic; live cross-client thread acceptance remains unverified.
Drafts are in memory only: preserve any unsent text before restarting the editor.

### Open or download attachments

From a loaded message, use `:WebexAttachment [index]` to open text/source files in
a new editable buffer, or dispatch an explicitly configured extension/MIME handler.
`:WebexAttachmentDownload [index]` prompts for a new destination and saves original
bytes without overwriting existing files. The default command family adds
`<leader>Wo` / `<leader>WA`; history `o` / `<localleader>o` share the general open
action, including native images. Current user mappings win. No new grant, receipt,
automatic opener or remote write-back is introduced. See [attachment configuration,
safety and limits](attachments.md). An updated `message-attachments` backend is
required; preserve drafts before rebuilding and restarting, never hot-source.

### Native message and thread folding

Native body folds are implemented in source, enabled by `folds = true` (Vim:
`g:wbx_tui.folds = 1`), with `b:wbx_folds = 0` as the per-buffer opt-out. Lua
`setup({ folds = false })` forwards the same option. These are editor options,
not engine JSON. Existing FileType hooks, explicit local fold settings and manual
folds remain authoritative; untouched defaults start message bodies open.

Use native **`za` / `zo` / `zc`** on a message body for its nested body fold.
On a root header, **`za` closes the whole thread**, including loaded reply headers
and bodies. **`:WebexThreadFold`** / **`<leader>Wt`** toggles that outer fold from
any member. Unrelated roots stay visible. With grouping disabled, it retains the
legacy body-only action rather than hiding unrelated interleaved messages.
Summaries such as
`4 loaded replies` describe loaded data, not a guessed server total.
Collapsing a thread leaves its existing trailing blank separator visible before
the next message; it does not insert extra text or swallow the gap. One-line body
folds still obey your native `foldminlines` setting. Latest navigation checks the
actual content fold, not that visible separator, and never opens it for a receipt.
The [fold-spacing follow-up](fold-spacing.md) records the regression checks.

Fold choices and reader positions are window-local and message-ID-backed across
updates and pagination. Folding does not change body text, yanks, normal/thread
drafts or reply targeting. A hidden/folded newest endpoint cannot issue a receipt;
the plugin does not open folds to acknowledge it. There is no dedicated
thread-focus pane. The grouped-thread/cache/meeting follow-up is tracked separately
in [follow-up evidence](thread-cache-meetings-follow-up.md); original-roadmap pass
counts do not validate this newer change.

### Meeting demo

`:WebexMeetingDemo` opens a synthetic meeting with three generated participants
and a generated screen share. It never joins Webex or transmits media. Chrome is
headed by default. For automated tests, opt into a headless **demo-only** browser.
In the LazyVim spec, add `headless_demo = true` inside `opts.meeting`. For plain
Vim, the equivalent option is:

```vim
let g:wbx_tui = {'meeting': {'headless_demo': 1}}
```

## Notifications

Notifications default to **editor delivery** through your current Neovim
`vim.notify` integration (including Snacks/Noice/nvim-notify), with a native Vim
fallback. Nothing installs or configures a notifier. To opt into system delivery
only while the editor is unfocused, add to your existing Lua/LazyVim options:

```lua
notifications = {
  mode = 'hybrid', -- default: 'editor'; also 'desktop'
  messages = true,
  meetings = true,
  preview = true,  -- default: first 160 sanitized characters; false hides text/name
  sender_names = true, -- default: names in previews AND loaded history; false opts out
  titles = true,   -- false also hides space/meeting names
  meeting_minutes = { 5, 0 },
},
```

`:WebexNotificationsTest` tests local delivery without starting a backend.
`:WebexNotificationsMute [minutes]` defaults to 30 minutes, and
`:WebexNotificationsResume` resumes only future alerts. Set `notifications=false`
to disable, or toggle `messages`/`meetings` independently. Health reports mode,
muting, counts and sanitized delivery status.

Selected-space new messages, locally acknowledged-send exclusion, confirmed SDK
message-created events elsewhere, visible-reader suppression and fresh meeting reminders are
bounded/deduplicated. No initial-history or muted backlog is replayed. Other-space
coverage needs the already-enabled unread SDK's public listener. It no longer
depends on unread flags/activity advancing. Preview text defaults on, showing only
up to 160 sanitized message characters without a generic label; `preview=false` hides
text, including for other spaces. Full long bodies are never forwarded. The existing SDK
listener gets individual message details internally;
this change adds no fetch or history read. See the
[global-message event correction](global-message-events.md).
Meeting coverage remains the existing three API-visible cards, not a full calendar.
Desktop delivery is opt-in and can expose titles on the OS notification surface;
message excerpts default on and can be disabled with `preview=false`. Focus reporting, fallback,
custom argv, rate limits and privacy are detailed in the
[notification contract and verification](notifications.md).

Sender names use a separately negotiated session flag (native default on) and a
known existing People grant; false disables enrichment. A missing name stays
excerpt-only; slow lookups do not delay or replay alerts. The same bounded
directory (optionally restored from the verified disk cache) improves history labels without changing source identity,
annotations, read authority or presence. See [sender names](sender-names-design.md).

## Images and personal Sections

Client-local grouping is now available through `:WebexSectionCreate`,
`:WebexSectionAssign`, `:WebexSectionRename`, `:WebexSectionMove`,
`:WebexSectionToggle` and `:WebexSectionRemove`. `<leader>Wvs` opens their native
menu; `<leader>Wvf` chooses a local filter.
`:WebexFilter all|unread|direct|group|section:NAME` changes the loaded row view,
never the selected destination or its draft. Section headers cannot select rooms;
partial/unknown/stale membership/read hints remain non-authoritative.
Enter toggles an unchanged local-section header. Normal/reply/file draft badges
and the local `drafts` filter come from the in-memory native registry, never disk.
Collapsed headers and an all-loaded summary retain unread/unknown/stale awareness.
Observed locked/read-only/announcement badges are not fresh permission proof.
Explicit `:WebexSectionsSave`, `:WebexSectionsLoad` and `:WebexSectionsClear`
use a private account/profile key only after the existing `spaces_cache` identity path
has verified identity. Otherwise grouping stays session-only, with no new lookup.
Previously explicitly saved grouping also restores after that same verification,
but only into an empty, unchanged session. Edits/clear, cache opt-out/clear, grant
loss and account/session changes cancel a late restore. No autosave is added.
See [F2 contract](local-sections-design.md) for limits and evidence.
This does not imply native personal Sections import/sync or server Team mutation.

Received Webex image attachments have inline previews. `images = 'auto'` (default)
uses real images on supported Neovim/Kitty-placeholder terminals, otherwise a
Unicode braille rendering. Use `images = 'unicode'` to force the fallback, or
`images = false` to suppress automatic preview reads. Raster decoding requires an already
installed ImageMagick `magick` or `convert`; nothing is installed automatically.
Unsupported formats, redirects and missing decoders show an honest placeholder.
The `images` entry in `:WebexHealth` explains the selected path/fallback. Neovim
0.12 uses its TUI output API for Kitty graphics; the core's `/dev/tty` is not a
reliable image-output route. See the [image-output correction](kitty-image-fix.md).

Only visible, unfolded attachment rows in an explicitly opened, unchanged history
trigger authenticated reads. Arbitrary HTML/Markdown image URLs stay inert. Image
data stays in memory unless explicitly exported to an external viewer, and cannot
issue a post/receipt. **`o` in history** / `<leader>Wo` / history `<localleader>o`
now use `:WebexAttachment`, which includes native image viewing unless a matching
file handler is configured. `:WebexImage` retains its image-only action, reading
original-derived pixels in a separate buffer by default.
`:WebexImageBuffer` and
`:WebexImageExternal` select a viewer explicitly; `[1-4]` selects an attachment.
`image_open = 'external'` changes only the explicit action's default. For example:

```lua
image_viewer = { argv = { 'chafa', '--format', 'symbols', '--' }, terminal = true },
```

Use an installed foreground graphical tool such as `{ argv = { 'imv' },
terminal = false }` instead if desired. There is no automatic fallback launch or
shell expansion. Explicit opening still works with automatic images disabled.
Explicit images are bounded at **1600×1200**, preserve aspect ratio and never
upscale; inline previews remain 240×144. External viewing receives the same
higher-resolution PNG in a private short-lived file. A backend rebuild and
draft-safe editor restart are required for this correction. See the
[higher-resolution contract and verification](image-detail.md) and
[external-viewer configuration/privacy](image-opening.md).

Webex personal Sections have no validated approved provider found in this review.
Webex's own apps synchronize them, but Local sections and Server Teams are
distinct features, not native sync emulation. See
[R6b provider/export review](native-sections-research.md).

## Navigation, pagination and layout

Deliberate cursor/viewport navigation near the last roughly five space rows
requests one more spaces page; scrolling near the first loaded history message
requests one older page. This includes native motions, search and viewport
scrolling, not just j/k. Rendering, restoration and initial placement do not drain
pages. There is one in-flight request per dataset, with cursor/generation guards
and edge hysteresis. Errors require explicit manual retry with
**`:WebexMoreSpaces`** or **`:WebexOlder`**, rather than repeated edge requests.
Paging, preloading and filtering never send messages or receipts.

The existing bounds stay **500 spaces / 500 loaded messages**. Loading,
exhausted, error and memory-limit states are textual. At the history bound, older
paging stops clearly instead of silently replacing the visible reader with
another page. A capped older window is not treated as the known newest endpoint;
**`:WebexLatest`** explicitly reloads the latest endpoint when it is outside that
window, without receipt consent. `:WebexRefresh` polls while retaining loaded anchors.
Each history window anchors cursor and viewport by message ID plus intra-message
offsets, including its own fold state and native view offsets. If a later bounded
cache update evicts an anchor, a warning explains the nearest-retained-message
fallback rather than silently keeping an unrelated numeric row.

The sidebar starts at **30 columns**, composer at **8 lines**. Manual native
resizes become window-local preferences, preserved across terminal shrink/grow
and external equalization. Small terminals clamp dimensions without discarding
preferred sizes. **`:WebexLayoutReset` / `<leader>Wl` directly resets owned
preferences** to `rooms_width` / `compose_height`; it is not a layout submenu.
In tabs containing unrelated windows, only owned native `winfixwidth` /
`winfixheight` locks are used: no corrective shared-boundary resizing is applied,
even for reset. The plugin does not disable equalization globally or change
unrelated window options.

Clean unloaded projections can be rebuilt on explicit reopen; genuinely
edited/promoted views retain their protection. The narrow unload/reopen follow-up
and final multiwindow/paging/resize verification remain recorded in
[implementation progress](implementation-progress.md).

## Recent spaces and Webex unread status

Spaces are requested and sorted by most recent activity. Received history and
send acknowledgments update the ordering too. Webex's activity timestamp may also
include non-message activity; it is not an invented last-message timestamp.
Reordering preserves the **room identity** under each window's cursor, not just a
row number. Background history polls no longer insert/remove a loading row after
the first load, and changed views retain their reading viewport.

Direct/personal spaces keep Webex's explicit or server-computed names, rather
than losing computed names in the optional SDK's read-status projection. Blank
SDK/REST refresh titles do not replace a known name. A genuinely unnamed direct
space says **Direct conversation**; an unnamed group says **Untitled space**.
Names are never guessed from the last message's author, and resolving them adds
no HTTP/person lookup or OAuth scope. Names may update without changing room IDs,
draft destinations, unread state, focus or browsing/reading position.

For unread state synchronized with other Webex clients, install the optional Node
SDK separately:

```sh
npm run install:read-status
npm run build
```

`read_status = true` (Vim: `1`) is the native default; set false/0 to opt out.
The SDK is still a separate optional dependency and is never installed for you.
Connect explicitly with `:Webex`; missing SDK/grants leave status unavailable
without widening permissions or disabling REST messaging. The OAuth
integration needs **`spark:all`**, including its **`spark:kms`** grant. The plugin
does not broaden scopes, rewrite private OAuth configuration or reauthorize you
automatically. Demo mode never starts this SDK.

With unread sync enabled and `spaces_cache = false`, the initial list stays in **Loading spaces and
unread status** until room discovery and the first SDK status snapshot have both
settled. Its first populated view already includes unread styling, rather than
looking read for a few seconds. SDK event listeners start in parallel with the
initial status fetch; they no longer delay that snapshot. SDK failure/deadline
still releases the REST list with an explicit unavailable-status notice. Normal
REST-only and demo startup do not wait for this optional step.
Room catalogue discovery is independent of `spaces_cache`: pending,
unverified/legacy and failed reads cannot become “No spaces found.” Only a
successful empty list with no next page may show that message. An empty page
with continuation says no spaces are loaded yet, not that none exist. Failed
refreshes retain already-loaded rows and show a separate failure notice;
`:WebexRefresh` **in Spaces** retries explicitly. Rendering, snapshots and
failure do not schedule another read or open/acknowledge a destination.
The optional closed `roomsStatus` field (`unverified`, `loading`, `ready`,
`failed`) is observational evidence for the latest admitted catalogue read,
not membership, write or receipt authority. Supplemental SDK metadata cannot
verify discovery. Older backends without this field stay unverified unless they
publish the existing explicit cache-verification bit. Cached-row browse-only
guards and the existing combined unread-startup gate are unchanged.
The separate [local cache](#optional-local-spaces-cache), enabled by default, instead shows
explicitly stale/unknown metadata and last-confirmed flags, then releases fresh
REST rows before the SDK settles; it never substitutes disk flags for authoritative
unread state or receipt admission.

- **Unread space titles are bold and accent-colored by default**, using the SDK's server last
  activity and last-seen activity. There are no `[UNREAD]` or `[?]` suffixes.
  Read titles return to normal text, including the open space; only its `●`
  marker keeps the `WbxSelected` open-space accent. A separate `WbxCurrent`
  background identifies the open row even while you browse elsewhere and remains
  after read confirmation. It borrows only the colorscheme's `CursorLine`
  background (falling back to `Visual`, or underline if neither has a background),
  never its foreground/bold. Native `WbxUnread` highlighting
  uses your colorscheme's `Special` foreground without changing the background;
  you can customize its color
  with `:highlight WbxUnread guifg=#e0af68 gui=bold cterm=bold` or link it to a
  preferred group with `:highlight! link WbxUnread Special`.
- Aggregate unread-sync health appears in a compact **footer/statusline**, not
  at the top of the spaces list. Raw diagnostic codes/details stay in local
  `:WebexHealth`; no per-room unread/unknown suffixes are added.
  Last-confirmed unread/read states survive same-session sync failures as a
  bounded, memory-only cache, with historical unread emphasis retained and cached
  counts labeled. Explicit stop/account/profile changes clear it; nothing is
  persisted. Never-observed rooms stay unknown. Unknown, missing or stale read state is
  never silently treated as read. An unemphasized space is not proof it has been
  read when sync is unavailable. Missing SDK packages/scopes or a failed worker
  leave REST messaging available. `:WebexHealth` reports `read_status` and the
  safe `read_status_notice` without connecting or exposing credentials.
- **`:WebexUnreadStatus`** from an unchanged room row in Spaces opens a read-only
  textual **snapshot of that highlighted row**, not the conversation currently
  open elsewhere. It separates the published server `READ`/`UNREAD`/`UNKNOWN`
  flag and freshness at capture, unread-source readiness, cached/browse-only
  metadata, session-only local override and resulting list emphasis. Titles are
  bounded sanitized text, not state markers; exact room ID remains visible.
  Freshness follows the last published ready source and per-room stale/cache
  flags, not a new server lookup or wall-clock guarantee. Missing flags remain
  unknown, never read. Cached/offline flags are historical, not receipt authority.
  The summary works with syntax off/monochrome and retained offline rows without
  a capability, grant or backend start. Inspection never calls open/select,
  fetches history/status, changes local emphasis or sends a receipt/message,
  including with `mark_read_on_open=1`. Enter/write and snapshot metadata are
  inert. `q` returns to the exact originating window; reopen from the current
  Spaces row to refresh. Standard list mapping opt-outs/conflicts and native
  annotation/promotion protection apply. Accepted updates do not auto-repaint or
  focus this snapshot. Headers, section/footer rows and edited/promoted Spaces
  views are refused rather than falling back to an open/nearest space.
- Background failures are isolated: an inaccessible room or missing dates make
  only that space's status stale, or unknown if never confirmed. If live event setup fails, authoritative
  server status continues through periodic refresh (normally every 60 seconds,
  plus request time), with a visible polling notice. A temporary full-refresh
  failure retains historical flags as stale until a successful refresh confirms them;
  it does not permanently stop the worker. Recovery only repeats read-only status
  discovery, never sign-in, SDK device registration, message POSTs or receipts.
  Fatal worker/IPC failures still stop sync; the health notice includes an
  allowlisted reason such as `sdk-error` or `heartbeat-timeout`, never SDK logs.
  Startup reasons also identify the failing stage, for example
  `device-register:denied` or `initial-snapshot:network`. A generic `failed`
  problem means the SDK did not expose a recognized safe status/code; it is not
  evidence of a scope or network problem. Reconnect only explicitly; credentials,
  scopes and private configuration are never automatically changed.
- **Opening a known-unread space with Enter now marks it read** when sync is
  ready, selection succeeds, and its unchanged history is displayed at the
  known latest message, including the last wrapped body row. A closed body fold,
  clipped/incomplete display or capped older window does not qualify. An unread
  status arriving during that load also qualifies.
  If the automatic Read By lookup already occupies the SDK, the one receipt slot
  waits for that physical read and revalidates the source, selected room, newest
  endpoint and fresh status before submitting once. That wait is not a retry;
  Read By never sends a receipt itself.
  A canceled/failed/stale open, edited view, empty history, programmatic selection
  without opening, or polling never sends this receipt. It is attempted once per
  endpoint, without retry after failure/unknown outcome; reopening alone cannot
   retry it. Local display now clears independently on a successful explicit open;
   only server confirmation changes the authoritative flag. A later
  server-unread cycle after confirmed read can be acknowledged again.
- Set `mark_read_on_open = false` in Lua, or `'mark_read_on_open': 0` in
  `g:wbx_tui`, for the former manual-only behavior. **`:WebexLatest` then R** in history
  explicitly marks through the newest loaded message read in Webex once unfolded.
  `:WebexMarkRead` / `<Plug>(WebexMarkRead)` are alternatives. An edited history
  or a viewport above newer messages cannot issue the receipt. Both automatic
  and manual paths require the complete known-latest body endpoint to be visible
  and unfolded, with fresh per-room status; neither forcibly opens folds. Cached
  read flags never reset a failed automatic receipt's deduplication. Composer R and
   Insert text are untouched. `mark_read_on_open=false` disables automatic network
   receipts, not local clearing after an explicit open. Local clearing also works
   during sync outages and pending/failed receipts. It is a session-only
   presentation override, not a fake SDK read status: `wbx#state()` remains the
   authoritative snapshot, and neither receipt admission nor persistent caches
   consume the override. New observed messages/fresh SDK activity restore emphasis;
   old repeated flags do not. See [local unread behavior and verification](local-unread.md).

The optional SDK runs in a separate Node process with in-memory storage, silent
output and access credentials delivered over private IPC. No Chromium, meeting
join or device capture is involved; it uses the existing messaging OAuth grant,
not the media owner's independent session. See
[`optional/read-status-sdk`](../optional/read-status-sdk/README.md) for dependency
isolation and offline validation. Live cross-client acceptance remains unverified.

**Receipt safety implementation:** the editor now checks actual endpoint
visibility, including folds, wrapping, clipping and known-latest identity. The
optional SDK adapter preserves its real public acknowledgement chain while
enforcing one mutating transport submission below SDK replay/interceptor paths.
Key-rotation/error bodies cannot trigger detached resubmission; redirects and
native reused-socket replay are disabled for receipts. Failure/uncertainty consumes
the attempt and is not retried automatically. The one-shot boundary has independent
review and network-blocked integrated offline evidence in
[implementation progress](implementation-progress.md). No live receipt acceptance
is implied. For read-only inspection, set `mark_read_on_open = false` before
connecting and do not invoke a manual receipt.

## Live OAuth

Choose the prerequisites for the feature you actually want:

| Path | Authorization / local prerequisites |
| --- | --- |
| Native messaging | System browser via `xdg-open`, owned OAuth integration/exact redirect, approved `spark:rooms_read`, `spark:messages_read`, `spark:messages_write` (or approved broader grant), space membership, private configured client secret |
| Optional unread sync | Separate `npm run install:read-status`, `read_status=true`, approved `spark:all` including `spark:kms`; no Chrome or browser SDK |
| People presence | `people_status=true` (default), already-granted `spark:people_read` and `spark:memberships_read` or applicable `spark:all`; presence disclosure remains subject to organization/status-sharing policy |
| Live meeting | Linux/tmux/Chrome and presentation support, **`npm run sdk`**, approved SDK participation rights, approved meeting/lobby/org-policy access; explicit browser intent/permission before capture or transmission |

`npm run sdk` fetches/checks the pinned browser SDK into `vendor/`. It does not
install the optional Node unread SDK; neither SDK is needed for REST-only
messaging or local messaging demo. The synthetic meeting demo needs Chrome but
not the browser Webex SDK. See [the meeting reference](meeting.md#live-webex-explicitly-opt-in)
for the download/asset boundary.

The engine reads **`~/.config/wbx-tui/config.json`**. Lookup respects
`$XDG_CONFIG_HOME`, `$WBX_CONFIG`, and the plugin's explicit `config` path (the
editor equivalent of CLI `--config`). See [OAuth setup](oauth.md) for the Webex
integration, exact loopback redirect and required scopes.

Add `oauth.clientSecret` locally in that file and restrict it to your user:

```sh
chmod 600 ~/.config/wbx-tui/config.json
```

The Node owner requires a regular, current-user-owned, owner-only secret-bearing
file. Do not put the secret in editor setup, Lua, RPC, environment variables,
screenshots or bug reports. Public config/health/IPC omit it. The editor client
fails closed with setup instructions instead of requesting credentials in a buffer.
This configured secret is persistent plaintext in your original JSON; only the
access/refresh grants are session-only. Quit does not remove that field or revoke
Webex consent. See [retention limits](oauth.md#security-and-retention).

`:Webex` starts configured OAuth in the system browser (`xdg-open`). Select a
listed space before sending. `:WebexDisconnect` cancels sign-in/stops messaging;
it does **not** leave an active meeting. `:WebexAuthRefresh` explicitly refreshes
messaging auth. Connected meeting joins reuse the existing login when its known
grant supports SDK calling (`spark:all`), without another sign-in. One private,
detached refresh owner serves both consumers, so a joined meeting can renew after
the editor disconnects. Missing grants/account changes fail explicitly; scopes
are never silently broadened. Without a connected login, standalone meeting
authorization remains available. No refresh-token file or OpenCode/MCP account
is shared. [Ownership/security details and verification](shared-meeting-auth.md).

`:WebexMeeting https://YOUR-SITE.webex.com/meet/YOUR-ROOM` starts/reuses a call.
Meeting microphone, camera and screen transmission start **off**. Enabling them
requires explicit controls and the owned browser's permission/confirmation UI.
`:WebexPreview` is separate, opt-in, local camera preview—not camera sending.
Live headless meetings are rejected.

## Meeting presentation and lifetime

- `meeting.display = 'auto'` prefers a side Kitty and falls back to an editor
  terminal if unavailable/launch fails. Set `fallback = 'error'` to disable that.
- `display = 'editor'` forces native editor terminal presentation with text-block
  video. `display = 'kitty'` explicitly requires Kitty/display availability.
- `:WebexMeetingKitty` / `:WebexMeetingEditor` switch presentation on the existing
  call. Only this plugin's old terminal client/window is removed. The media-owner
  PID and participant/share pane processes remain unchanged; there is no rejoin.
- `:WebexMeetingDetach` detaches this editor view. Closing its terminal buffer or
  the editor likewise leaves the tmux call alive by default. Reopen with the same
  meeting command to attach to the existing owner.
- **`:WebexLeave` explicitly ends the call.** Inside a tmux meeting pane, the
  engine's `q`/Escape/Ctrl+C keys also leave. Normal editor modes/keys are unchanged.
- `:WebexMeetingStatus` opens a native status buffer; `:WebexMicrophone`,
  `:WebexCamera`, `:WebexShare`, `:WebexAudio` control the existing owner.
- Losing a viewer/control socket disables controls and reports **unknown media
  state**, not meeting termination. The native controller confirms the recorded
  owner process exited before reporting ended. Standalone viewers pause and label
  send/audio observations unknown; quitting a disconnected viewer only detaches
  that view. No automatic rejoin, reconnect or leave follows socket loss.

Status distinguishes **received audio/media**, **local preview (NOT SENT)**,
confirmed **sending**, pending browser confirmation and bounded failure reasons.
Disconnected/stale observations are labeled as last reported, never proof of a
stopped device or an active transmission. Inactive source labels do not claim
sending. The owned browser keeps confirmation/stop controls before long video
content and reveals an armed control without programmatically confirming it.
Only a trusted browser click can authorize transmission. Automatic tmux tiling
is suppressed when unrelated panes are present rather than rearranging them.

Kitty gets a fresh capability probe when switching; unsupported/unacknowledged
graphics fall back to blocks without dropping the call. Shared memory is used
only when safe for the attached terminal readers. `leave_on_exit = 1` is optional;
default exit behavior is detach. Opt-in graceful exit cancels pending startup and
waits for the recorded media owner to exit (up to five seconds in the editor).
An exited view/control connection alone is not proof that media stopped. A
crashed/unreachable backend cannot guarantee
leave: check the tmux session explicitly. Merely closing a view is not proof that
transmission stopped.

State/readiness notifications do not take focus from messaging or reopen a view
you closed. `:WebexMeetingEditor` explicitly focuses/reopens the owned terminal;
your normal tmux detach key can be followed by that command without rejoining.

## Configuration and integrations

Complete native configuration examples: [LazyVim spec](../examples/lazyvim.lua),
[Vimscript](../examples/editor.vim) and [plain Neovim Lua](../examples/editor.lua).
All retain your editor's own UI and modes. In LazyVim, edit the spec's `opts`
instead of adding a second standalone setup call.

Meeting sessions **inherit your tmux server's configuration** by default: status
bar, prefix/key tables, pane borders and theme are not replaced. Participant
titles/ownership tags, layouts, graphics passthrough and scoped cleanup remain
engine-managed. To opt into the older wbx-themed status/borders, put
`"tmux": {"appearance": "theme"}` in the engine JSON. The default is `"inherit"`.
New sessions inherit tmux's global/server settings; session-local customizations
from another session are not automatically copied. Test-only private servers use
isolated configs intentionally. Already-running older workers retain their old
overrides until restarted; do not leave/rejoin a live call just to change styling.

Common Vim options (all optional):

```vim
let g:wbx_tui = {
      \ 'config': '',
      \ 'demo': 0,
      \ 'backend': [],
      \ 'mappings': 1,
      \ 'leader_prefix': '<leader>W',
      \ 'send_with_ctrl_s': 1,
      \ 'read_status': 1,
      \ 'spaces_cache': 1,
      \ 'people_status': 1,
      \ 'mark_read_on_open': 1,
      \ 'folds': 1,
      \ 'message_borders': 'gutter',
      \ 'rooms_width': 30,
      \ 'compose_height': 8,
      \ 'statusline': 1,
      \ 'picker': 'auto',
      \ 'meeting': {'display': 'auto', 'fallback': 'editor',
      \             'headless_demo': 0, 'leave_on_exit': 0},
      \ }
```

`backend` is an argv list, e.g. `['/path/to/node', '/path/to/dist/editor-main.js']`;
it is never evaluated as a shell string. The dedicated backend does not import
the standalone UI, probe a terminal or load Chromium. An optional
`meeting.call_id` selects a named tmux call identity. The engine's JSON remains
responsible for OAuth/media/tmux layouts, not editor splits or mappings.
The default initial sidebar/composer dimensions are **30 columns / 8 lines**.
The 32-column sidebar in `examples/editor.vim` is an explicit customization, not
a different default. See [navigation, pagination and layout](#navigation-pagination-and-layout)
for remembered manual sizes, direct layout reset and the mixed-tab restriction.

Neovim `require('wbx-tui').setup({...})` accepts the same options plus
`treesitter`, `which_key`, and `on_buffer = function(event) ... end`. Optional
Markdown parsing uses an **already installed** parser, never a download. History
uses bounded per-message native syntax, not whole-buffer Tree-sitter. Optional
Tree-sitter starts **only for compose** buffers; the plugin stops it on owned
history buffers, including those already open when Lua setup runs. This prevents
an unclosed message fence from swallowing a later message/header.
No parser/plugin download, LSP or AI activation happens automatically.
Spaces can use Telescope, fzf-lua, or `vim.ui.select`; set `picker` explicitly to
`'telescope'`, `'fzf-lua'`, or `'builtin'`, or keep `'auto'`. Vim optionally uses
fzf.vim and otherwise its built-in picker. All integrations fail back to the
portable baseline when absent. A lualine component is
`require('wbx-tui').status` for global connection status, or
`require('wbx-tui').buffer_status` for the current draft's destination/readiness.
Both return plain text; neither replaces your statusline. Completion/statusline tools may target the custom
filetypes using their own APIs; they are not dependencies.

Local aliases remain buffer-local: spaces **j/k** moves and **Enter** opens;
`r` refreshes. History **i** composes in Insert mode, **Backspace** returns to
spaces and `r` refreshes. In the composer, Normal-mode **`<localleader>s`** sends;
Ctrl+s also sends unless `send_with_ctrl_s=0`. Enter is always a native newline
in Insert mode. Set `mappings=0`
to disable both buffer defaults and the global command family, then map
`<Plug>(WebexOpen)`, `<Plug>(WebexSelectSpace)`, `<Plug>(WebexSpaces)`,
`<Plug>(WebexCompose)`, `<Plug>(WebexComposeInsert)`, `<Plug>(WebexSend)` and
`<Plug>(WebexRefresh)` yourself. Optional read receipts use
`<Plug>(WebexMarkRead)`. `statusline=0` leaves all statuslines to you.
Replies use `<Plug>(WebexReply)` / `<Plug>(WebexCancelReply)`, or the optional Lua
wrappers `require('wbx-tui').reply()` / `.cancel_reply()`.
Thread folds also expose `<Plug>(WebexThreadFold)`. Composer guidance shows the
effective explicit send binding and `:WebexActions` help outside sendable draft
text. It does not replace a user's statusline.
Existing buffer-local mappings installed by native `FileType` hooks/ftplugins
take precedence over these defaults. Default mappings are not added after a hook
renames/promotes the buffer out of Webex ownership.
Highlights link to standard editor groups (`WbxTitle`, `WbxMuted`,
`WbxSelected`, `WbxWarning`); the plugin never applies a global colorscheme.

The spaces list initially positions on a real room; **Backspace** explicitly
returns to the open conversation's row. Its `●` marker identifies the opened
conversation independently of the cursor, with a persistent `WbxCurrent` row
background. Both current-space and unread highlights respect native user
overrides. Background updates preserve browsing
position; Enter focuses history only after successful selection, and leaving the
origin window/buffer cancels that pending focus request.

Custom navigation can call `wbx#rooms()` (`:WebexSpaces`) and `wbx#compose(1)`
(native Insert mode). `:WebexCompose` / `wbx#compose()` retain Normal mode.
`wbx#select(id)` remains focus-neutral; `wbx#select(id, 1)` requests Enter's
guarded focus behavior. Edited/promoted views, unrelated windows and reserved-name
collisions retain the same protection through either API.

Filetypes: `wbx-rooms`, `wbx-history`, `wbx-compose`, `wbx-meeting`. Use normal
`FileType` hooks or `User WbxBuffer`, `WbxState`, `WbxDelivery`, `WbxMeeting`,
`WbxMeetingEvent`, `WbxDisconnected`. `WbxMeetingEvent` exposes validated media
status/presentation/source events separately from the meeting snapshot hook.
Hook data is in `g:wbx_tui_event`; buffer events include
`bufnr` and `kind`. Public `wbx#state()`, `wbx#buffers()`, `wbx#meeting_state()`
return snapshots/identifiers, not credentials. Drafts are editor-owned `nofile`
buffers with swap, undo-file and modelines disabled. They remain only in memory
unless you explicitly copy/save them using your editor.

`wbx#destination([bufnr])` / `require('wbx-tui').destination(bufnr)` report an
owned draft's `id`, `title`, `selected`, `ready`, `uncertain` and `pending` state,
plus `parentId`/`reply` context for a reply draft,
or an empty dictionary outside an owned destination-bound composer. The target
is bound to that buffer, not merely the globally selected space.
`wbx#buffer_status([bufnr[, winid]])` / Lua `buffer_status(bufnr)` format that context as
plain text for optional statusline integrations. Inspection never starts a job.

Renaming a Webex buffer or changing its `buftype` releases plugin ownership.
It can no longer send or be cleared by a late send ACK; only unchanged
plugin-installed default mappings are removed. To turn a draft into an ordinary
file, use `:file /your/path`, `:setlocal buftype=`, then `:write`. Writing never
sends. Unrelated buffers occupying a reserved `wbx://` name are not adopted;
rename or close them explicitly before reopening that component.

History/spaces/status views are read-only by default. If you use
`:setlocal modifiable` and edit one, polling preserves its local annotations and
pauses replacement, even while hidden.
Save any wanted copy first; **`:WebexRefresh!` in that view discards its edits**
and resumes updates. Ordinary `:WebexRefresh` never discards those changes.
Edited spaces rows cannot select destinations; use `:WebexPickSpace` instead.
`:Webex` restores closed/wiped component views without replacing unrelated user
windows, and closing one component does not stop updates to the others.

Other commands: `:WebexPickSpace`, `:WebexRefresh`, `:WebexMoreSpaces`,
`:WebexOlder`, `:WebexResolveDelivery`. An ambiguous send retains the draft and
blocks further sends to that space until you check Webex/history and explicitly
resolve it. No automatic POST retry occurs. Text is plaintext, bounded at 1000
UTF-16 code units per send. Dedicated thread panes and public
in-meeting chat are not implemented. New conversation commands are described below.

### Who has read this message

Opening a group or person discussion loads the footer once for its latest loaded
message. Use **`:WebexReadBy` / `<leader>Wav`** on a loaded history message to inspect
disclosed readers in groups or person discussions. The centered footer shows
`Read by Alice` for a personal discussion or `Read by 2 [+]` for a group; no
message text is repeated. Group names start folded; use
**`:WebexReadByToggle` / `<leader>WaV`** to expand/collapse them locally.
This leaves native message folds alone and performs no network read or receipt.
Live results preserve the latest disclosure choice, including during a pending read.
Repeat the command on that message for an explicit refresh. A bounded session
snapshot distinguishes stale/unavailable data from no disclosed receipts.
The sender is excluded; no separate list opens and focus does not move.
Existing SDK read-watermark events refresh this same footer target automatically.
Bursts coalesce over one second, with one serialized follow-up if an operation is
pending. Events only invalidate; names still require the exact-message/member
read. Session/source/room changes, backoff and opt-out cancel stale queued work.

This uses the existing enabled read-status SDK, not presence or your own unread
markers. The SDK provides space read-through watermarks, **not exact read times**;
live results remain partial. No cursor/paint-triggered fetch, new polling,
pagination, SDK connection, disk reader cache or receipt is introduced.
`read_status=0` opts out. Older watermark-only backends retain opening/explicit
snapshots; backends without reader support report the feature unavailable.
Source/session replacement and opt-out clear reader presentation, not annotations.
Wnr still removes a member. See [reader evidence and safety](message-readers.md).

### Experimental persistent message reactions

Native reactions are **on by default**; `reactions=false` in Lua or `reactions: 0`
in `g:wbx_tui` explicitly opts out. Reaction badges appear automatically beneath
visible history messages using native virtual text, not message-body edits.
Set `g:wbx_tui.reaction_display = 'text'` in Vimscript, or
`require('wbx-tui').setup({reaction_display = 'text'})` in Lua, for **ASCII text
fallback**. The default `'icons'` uses shared emoji badges and emoji-plus-label
pickers; text mode also applies to pickers. Invalid values
also fall back to icons. Text mode renders each supported group separately as
`Thumbs up`, `Heart`, `Celebrate`, `Smile`, `Laugh`, `Confused` or `Sad`
(other Unicode emoji use ASCII `Emoji U+...` codepoints), with
supplied counts and explicit own markers. Supplied counters, including `1`, stay
visible; missing totals add no counter placeholder and are never treated as zero.
Empty incomplete observations stay quiet.
Icon mode shows `♥️ 1 (you) | 👍 4`. Your reactions also use
`WbxHistoryReactionsOwn` (theme-overridable), linked to the normal reaction style
by default: `(you)` is enough, without an orange background. Display-only self
evidence cannot authorize removal. Neovim uses individual chunks on one virtual
row; Vim groups own chips separately because a virtual-text property has one
highlight. Neither changes message text or blank separators. A confirmed new
own Add increments the last known counter once; an already-owned Add keeps it,
and missing/overflowing aggregate counters stay unknown. With own participation
confirmed but no total supplied, the badge shows `♥️ 1 (you)` for your known
contribution, not a complete aggregate. `:WebexReactions` still identifies unknown
totals in details; this display does not write a count into the snapshot.
These adjusted observations remain
partial, not fresh authoritative totals or removal permission.
If a reaction is refused before preparation/submission, the error records the
SDK state and any existing health notice at that instant. A later ready
`:WebexHealth` snapshot does not prove the source was ready when it was refused.
No refused reaction is queued or retried automatically.

Text rows wrap to the narrowest visible history split's text width, accounting
for gutters, without changing native `wrap`, `breakat` or window options. Known
long values continue on virtual rows rather than silently truncating their
digits. There is no `cached` suffix in either mode; retained stale data uses muted
styling. Passive loading and failures add no "Reactions unavailable" footers;
fixed diagnostic reasons remain in `:WebexHealth`. Split/terminal
resize recomputes presentation from the same cached observations; it grants no
read, write, inspection or receipt authority and does not freshen observations.
Details remain available through `:WebexReactions`; labels include Unicode emoji,
but bounded partial observations never prove authoritative absence. This option
is not operator-observed assistive-technology acceptance.

Delayed badge insertion/removal compensates each visible split's viewport to keep
the text being read at its screen row, without moving its cursor or changing folds,
text, undo, focus or user options. Exact partial-line scrolling follows your native
`smoothscroll` setting. With it off, an indivisible wrapped top line or a buffer
boundary uses the closest legal viewport; no fake padding or forced option is used.
Reads cover at most eight loaded visible targets per batch. Successful snapshots
refresh quietly after five minutes. Empty partial observations stay quiet and
make no zero/absence claim; details explain unknown counts and partial coverage.
With `progressive-v1`, completed summaries paint immediately without waiting for
the slowest message. The same three read chains, shared room lookup and one
outstanding batch remain. Progress never releases admission; the final response
still settles the request. Older backends retain final-batch compatibility.
Settled failures back off for one minute, while transient busy/context refusals
have at most three one-second read-only retries. Verified completed siblings
survive a batch deadline; unfinished targets carry finite timeout reasons.
During a recoverable same-source outage, unchanged labels remain muted, without
`cached` text; no passive reads run while transport/backoff disallows them. Returning A → B → A reuses A's
unchanged exact loaded room/message/content observation immediately, even while
B's physical read is still pending. Temporary history-loading states do not
replace the authenticated cache source. One least-recently-used presentation
cache retains at most 64 entries **across rooms**, not 64 per room. Evicted or
never-observed messages still need a provider read; this is not a network-latency
guarantee. An incomplete empty cached observation remains quiet, never zero.
Reaction reuse has its own source-content key, separate from the combined
rendered-message hash. Resolving a sender name or completing an image preview
does not evict reactions, issue another reaction read or change write authority.
Recovery schedules a bounded refresh without freshening the old observation,
not an automatic mutation. View changes still fence callbacks, but do not by
themselves discard same-source observations. Legacy contexts without explicit
session/source retention proof remain view-scoped. Revocation, changed/deleted
loaded targets, opt-out, account/session changes, terminal worker loss and
source/grant replacement still evict cached data. Cached presentation cannot enable
inspection/preparation, writes or read receipts, and never resolves unknown writes.
Passive read failures do not interrupt composition or replace unrelated foreground
messages/errors. Their finite diagnostic categories and aggregate failed/pending
target counts and `cacheEntries` remain under `reaction_reads` in `:WebexHealth`; provider payloads
are not retained. `:WebexReactions` still reports an explicit failure once, with
local health/refresh guidance. Protocol-invalid output, connection failures and
mutation uncertainty remain visible; quiet presentation changes no write guards
or retry/cooldown rules and never starts/reconnects an unavailable backend.

Explicit commands show a short, state-first **`reactions: waiting`** token in the
originating history window while an existing passive read drains, then
**`reactions: reading`** during the admitted summary/preparation/inspection read.
No loading rows, buffer edits, popup or focus change are used for acknowledgement.
The token clears before a picker/confirmation, on a result/error or when the
intent becomes stale. Moving to another message/window, changing room/session/
source, revocation or opt-out fences the old intent; returning cannot revive it.
Already-admitted reads retain their reservation until actual settlement, so
repeating a command cannot start a competing read. A newer command waiting behind
passive work may replace the older waiting intent, not the physical request.
Backend-session replacement fences an orphaned callback instead of waiting for it.
**Add is local first:** `:WebexReactionAdd` opens its emoji picker immediately,
even during an admitted passive batch. Only the chosen preparation waits.
**Choosing an emoji sends it** after the existing exact-target/freshness checks.
There is no first-use/restart inspection gate or second confirmation dialog.
Canceling the picker sends nothing. **Other emoji...** lets you paste one Unicode
emoji; Enter submits, empty input cancels. Skin tones, flags and joined sequences
are accepted, not arbitrary text. Remove skips the picker when only one freshly
verified own type is available; multiple own types retain a choice.
SDK read failures retain their finite reason.
Only a retained **unknown previous write** requires checking that exact message
in Webex and explicitly using `:WebexReactionResolve`; normal Add never opens
that recovery confirmation automatically or replays a failed choice.
Confirmed Add/Remove results update the exact message's display cache immediately,
before any read-back or space change. A confirmed Add supplies display-only own
evidence, not a removal handle or aggregate count. The changed group's old count
is dropped rather than incremented/decremented; other observations keep their
timestamps. Failed/unknown writes do not paint a successful change. Confirmed
observations also enter the private received-data cache; replaying an old ACK
cannot freshen or erase a newer cache entry.

The pinned SDK has an internal `event:conversation.activity` WebSocket feed,
but no public message-reaction subscription here. The current adapter filters
reaction activities out of message events so a reaction deletion cannot become
a message deletion. Cross-client reaction push invalidation is **not yet wired**;
the existing bounded five-minute reads and explicit details refresh still apply.

Other splits—even those showing the same history buffer—do not inherit that
window's progress token. User-owned statusline options remain untouched; custom
integrations can opt into `wbx#buffer_status()` (or supply buffer/window IDs).
The feedback is local presentation, not proof of inspection, write authority or
mutation completion; use the separate local inspection below for retained writes.
Source commands are `:WebexReactions`, `:WebexReactionAdd`,
`:WebexReactionRemove`, and `:WebexReactionResolve`, from unchanged loaded history.
Under **`<leader>Wa` (Message actions)**, **`l` lists reactions and who sent each**,
**`a` adds**, **`r` removes your reaction**, and **`I` resolves an uncertain outcome**:
`<leader>Wal`, `<leader>Waa`, `<leader>War`, `<leader>WaI`.
User mapping conflicts and `mappings=false` retain precedence.
`:WebexReactions` opens a searchable, read-only native list grouped by reaction;
`q` returns to history. Run it again from the selected message to refresh.
Only disclosed actors are shown, with safe display names, no IDs or explanatory
paragraphs. Unavailable names show “Name unavailable”, and missing actors/counts are
unknown, never inferred from aggregate counts. Reads use one page of at most
10 activities (the service limit), no automatic paging, and at most eight exact-person name lookups
within a bounded lookup window; no directory/room scan or new SDK connection.
Actor relationships and these name lookups do not enter automatic or disk caches.
The list is a snapshot, not a live subscription or ownership/removal authority.
Clean generated lists close on space/session changes; annotated/promoted buffers
are retained, and stale callbacks cannot reopen a departed space's list.
Older backends retain the summary chooser without actor details.
Mutation choices still use the native chooser. An explicit reaction choice
is the write intent, still bound to the unchanged loaded message and source.
Resolving an unknown result needs its retained original request identity.
`:WebexReactionUnresolved` opens a **read-only local snapshot** of pending and
unknown writes, with full exact room, message and original request IDs. It is
available from any buffer, offline, with reactions disabled or an older backend;
it reads only the existing editor-memory locks, never a provider or a second
uncertainty journal. `r` refreshes that local snapshot, `q` returns to the exact
origin, and native motions/search/copy work normally. No new default key family
is added. Enter/write, opening/closing/editing the view and its row metadata
cannot submit, inspect, unlock, acknowledge or replay anything.

Notices can be dismissed and rooms/views/backend sessions changed without losing
these retained IDs. This is editor-local evidence that may predate the current
backend/account, **not verified server/account state**. It is not persisted across
editor restart. Nothing is replayed on restart; if a previous outcome was unknown,
check it before explicitly choosing another reaction. An empty list means no
locally retained record, never proof of server absence. The snapshot does not
auto-refresh on callbacks; rerun the command after settlement. Annotated/promoted
buffers and full native undo are retained rather than overwritten.

For recovery, inspect the exact target in Webex separately, return to that
unchanged loaded history message and explicitly use `:WebexReactionResolve`.
The retained original request ID and existing intent/confirmation/result guards
still decide resolution. An RPC error or stale ACK leaves the local unknown
retained. Text inspection cannot clear it; no retry/discard action is bound to rows.
No mutation retries automatically. Live mode requires the existing ready read-status
worker and known grant; it does not register another device. Live counts remain
unknown/partial. Supported legacy names are `thumbsup`, `heart`, `celebrate`,
`smiley`, `haha`, `confused` and `sad`. The pinned internal SDK is not a supported public reaction API;
deployment schema/crypto/service acceptance and activation remain unverified.
See the [implementation and safety contract](reactions-implementation-plan.md).

### Own-message actions, Markdown and mentions

`:WebexEdit` from unchanged native history prepares a verified own text-only
message in a separate native buffer. `:WebexEditSubmit` explicitly confirms the
target and residual GET/PUT race; writes/Enter/history annotations never mutate.
`:WebexEditCancel` releases unused preparation and retains native text.
`:WebexDelete` separately confirms exact own-message deletion (not leaving a room).
Preflight refuses detected server changes but is not atomic; no conditional-write
guarantee is verified. Cancel is the default. Files/cards cannot be edited;
server edit limits remain authoritative. Unknown outcomes are never replayed;
check the exact message before `:WebexMutationResolve`. Reply drafts and native
annotations/undo remain intact. A deleted receipt endpoint is not replaced with
an invented earlier one.

Native confirmations keep **Cancel as the default**: unqualified Enter and Escape
cancel rather than authorize a send/mutation. An earlier picker choice is not
consent; mention-bearing submissions and `@all` retain their separate gates.
Ordinary Normal/Insert Enter and `:write` in message drafts never invoke Send or
edit/reaction submission. Isolated Vim/Neovim PTY checks drive actual native
confirmation keys without replacing consent helpers. These keyboard checks are
not operator-observed terminal/assistive readout or live-service acceptance.

Unknown deletion targets are retained even without an edit buffer/history row;
`:WebexMutationResolve` can choose their exact IDs in the selected room.
Failed resolution and late old callbacks cannot clear a newer unknown outcome.
Disconnect makes preparations stale; resolving never replays or makes an old
edit buffer a fresh preparation. See [native workflow contract](native-workflows-design.md).

`:WebexFormat plain|markdown` is per draft; syntax coloring alone is never send
consent. `:WebexMention` delegates to **`vim.ui.select`** in Neovim, including
your configured picker/theme/keybindings, or Vim's built-in `popup_menu`. It no
longer paints a plugin-owned picker/background. Selecting a participant automatically switches
THIS draft to Markdown (including native `filetype=markdown`) and inserts a real
mention. It renders as **@Name** in the draft, with opaque identity markup
concealed even while typing; the exact `<@personId:ID|Name>` remains native text
for undo, copying and membership-validated sending. `:setlocal conceallevel=0`
reveals that source explicitly. Duplicate names receive a short identity suffix
in the picker, not a full Person ID. Canceling leaves the draft/format unchanged.
The draft's displayed `@` is anchored at the label, so hidden-ID wrapping no
longer strands it on an earlier row. Legacy Vim/Neovim conceal can still reserve
blank wrapped rows for hidden IDs; eliminating those requires conceal-aware
editor layout, not rewriting sendable targets or changing global `breakat`.
Insertion leaves real whitespace after the mention and places the cursor beyond
its closing delimiter; inserting another mention cannot split the first one.
At the user's explicit choice, published history projects `<@personId:ID|Label>`,
`<@all>` and `<spark-mention …>Label</spark-mention>` to ordinary `@Label` / `@all`
text, without duplicating an existing `@`. Hidden long IDs otherwise consume
native wrapping width and can detach `@` from a name. **Copying history now copies
readable names**, not raw mention tags. Original message state and own-message
edit buffers retain exact source/IDs; drafts still use the raw structured target
for validated sending. Inline/fenced/indented code stays literal, as do plaintext
lookalikes. This published-text projection does not depend on `conceallevel`.
Structured mention labels retain precise native highlighting through **`WbxMention`**
(linked to your theme's `Identifier` by default). The whole label is styled, not
just `@`, without coloring unrelated literal names or code. A user-defined
`highlight WbxMention ...` is preserved; no colorscheme values are hardcoded.
Styling is bounded to 32 mention ranges per message; additional labels still
remain readable text rather than being omitted.
Native wrapping rules remain unchanged, as requested: the fix removes artificial
long-ID wrapping, not the editor's ordinary right-margin word-break behavior.
Automatic completion providers are suppressed locally in owned message composers,
including Markdown, without loading a plugin or changing global configuration.
Native Ctrl-N/Ctrl-P and manually invoked completion functions stay available;
your local settings survive re-entry. `completion_policy='off'` selects strict
suppression, while `'user'` opts out of provider suppression. The default is
`'manual'`; `b:wbx_completion_policy` can override it per buffer. Promotion restores
only the plugin's own overrides.
Individual person tags need no extra confirmation: explicit Send/Submit includes
them, and the backend still revalidates exact selected-room membership.
`:WebexMentionAll` and sending `@all` have conspicuous
separate confirmations. Plaintext lookalikes remain literal. Markdown plus **one
staged file** uses the existing upload owner after independent combination
negotiation; unsupported backends refuse without dropping the file/downgrading.
Use `:WebexAttach`, `:WebexFormat markdown`, then the same `:WebexSend` /
`<localleader>s`. Submission/@all consent is rechecked against exact draft/session/
format/file identity. Mention preflight has a 20-second sub-deadline within the
60-second send and makes no POST on failure. The raw ACK must match room/root/
Markdown and return one allowlisted contents reference; no file-byte equality is
claimed. Multiple files/recipient-first rich DMs remain separate.
`:WebexMembers` and `:WebexMembersMore` explicitly read selected-room
roster pages (100/page, 500 retained, ten pages); partial/failed rows never grant
permission. No background roster/presence scan or grant expansion.

### Native reading and discovery

Reply banners include a bounded excerpt from the already-loaded root, so two
same-author/minute roots are distinguishable without a fetch. Published mention
labels stay readable; raw edit/send identity is unchanged. Message timestamps
retain their UTC/explicit-offset designation. Plugin-owned default fold captions
include a bounded topic excerpt and omit zero-reply noise; your `foldtext` wins.

Loaded and explicitly queried thread buffers reuse message-scoped Markdown syntax
and native folds as **presentation only**. Their refresh/re-entry retains native
fold choices and identity-based reading position. They never become main history
or gain attachment/mutation/receipt authority; annotations/promoted buffers are
not reclaimed. Native motions and user-managed splits remain the interface.

`:WebexFormat`, `:WebexFilter`, `:WebexContent`, `:WebexActions` and existing
Section arguments offer local Ex completion. Loaded Section names containing Ex
metacharacters remain selectable through the picker or their safe exact IDs.
`:WebexAttach` uses native filename completion without staging/uploading.
`:WebexActions` shows verified buffer-local aliases, including the installed
localleader/mode, separately from global mappings. References/lists prefer this
tab and retain their exact initiating window for `q`; local jumps do not select
another tab's first history window.
The mention picker offers an explicit next-page choice, including participants
beyond the first 100. Changing draft/focus/selection during a choice cancels
that intent. Virtual draft context shows Plain/Markdown and bounded UTF-16/UTF-8
counts without adding sendable text or replacing your statusline.
Confirmation buttons use **C**ancel / **Y**es, continue; Cancel remains the
default. Enter in a picker only inserts a target, never sends a message.
Successful unchanged Markdown drafts clear after their confirmed delivery.
For ordinary Markdown sends, a positive create response is validated against the
exact destination/root, valid creation metadata, bounded rich content and a new
message ID. Server-normalized Markdown or HTML-only output need not echo the
submitted source byte-for-byte; the submitted bytes and exact native pending
draft still own clearing. An echo loaded during the POST is not a reused ID, but
an ID known before admission or already acknowledged by this session is refused.
Malformed replies, wrong targets and transport loss retain the draft and
unknown-delivery lock, without automatic retry or historical auto-resolution.
A transient local write/textlock failure retries **only clearing**, not sending,
and rechecks exact text/revision/format/destination/session on each attempt.
Newer edits are never cleared by an older acknowledgement.
Entering a composer (including ordinary `i` in an existing window) reveals its
cached virtual header per window without editing text or undo. Normal compose no
longer echoes the full status and destination ID when `statusline=false`;
`:WebexDestination` remains the explicit diagnostic command.

### Drafts across editor restarts

At the user's request, normal/reply draft text and its Plain/Markdown format are
autosaved to private local storage by default (`persist_drafts = false` opts out).
Restoring requires the same verified account/configuration profile and never
sends, replays a pending message, restores an attachment handle, or fetches a
conversation automatically. Restores only fill unchanged empty native composers.
Graceful shutdown flushes local writes before stopping the backend. Storage errors,
conflicts and oversized drafts are disclosed rather than silently overwriting work.
See [private draft storage](drafts.md) for permissions, limits and recovery.
See [F4 contract](message-actions-design.md); current source is not activation.
See the [MF14 contract](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract)
and `:help wbx-tui-uploads` for negotiation, budgets and unknown/no-replay rules.
The common 64-entry delivery ledger refuses saturation rather than forgetting
older write identities. No automatic reconnect or new live acceptance is implied.

### Conversations and Server Teams

#### Own direct-membership API flag (read-only)
For the separate Team-name operation, see [Team rename](#team-name-only).

**`:WebexDirectVisibility`** opens an on-demand native view from owned selected
direct history/space-list/composer. It displays exact room ID, observation time
and the raw own-membership API `isRoomHidden` true/false or **Not provided**.
Missing is not false; malformed null/coerced raw values refuse. This is **not**
Favorites, server mute, a complete product Hidden list or ongoing cross-client
sync. Current app Hide has side effects the API flag does not establish.
No local space filtering, Favorites removal or alert suppression follows.

Independent `membershipVisibility:["own-direct-v1"]` is required, not roster/
write capability alone. These are named-only catalogue actions; no global key
is taken. In the owned view, **r** / **`:WebexDirectVisibilityRefresh`** explicitly
rereads the same selected own-direct context; **q** returns. No Enter action or
paging; Enter/write never send or change settings. Existing shadow mappings/
opt-outs, full native undo, annotations/promotions, reply files/destinations,
focus, colorschemes and all key-family meanings survive.

Fresh self, exact direct Room and exact unique own membership use at most
three GETs in 20 seconds, eight seconds per physical call and unchanged
transport/IPC limits. Known existing people/rooms/memberships-read grants are
needed, not a write grant. No caller person override, roster/account scan,
SDK, retry/redirect/auth refresh/queue/poll, receipt or mutation. Group/Team/
cached/revoked/unready/ambiguous/paged/invalidated targets refuse. Physical
work stays admitted through timeout/reset until actual settlement.

Only five fields (session/room/coverage/time/boolean-or-null), ≤4096 bytes, are
returned; no role/person/member/email/credential/raw profile. The view is
fresh for two minutes, never authority; expired same-session views permit only
an explicit fresh read. Old-session Refresh and late/away-return/window/tick
callbacks cannot borrow a new identity or replace native notes. Main room/
list/cache/roster/history/activity/unread/notification/receipt/delivery state and
local preferences remain unchanged. Favorites/product Hidden/server mute and
moderator-write provider gates remain binding. See the
[MF22 contract](messaging-public-provider-audit.md#mf22-preferences-review-and-own-direct-visibility-read-contract).
Offline checks do not establish live tenant behavior.

#### Team name only

From a clean fresh exact `:WebexJoinedTeams` row, use named-only
**`:WebexRenameTeam [name]`**. Preparation reads fresh raw Team name/permission;
prompt if no name was supplied, then confirm exact Team ID, old/new names,
fresh moderator recheck and non-atomic races. No draft contents, cached/
sanitized labels, creator or Room role supplies the preimage or authority.
No global key is taken: the single action catalogue discovers it. **Wnr stays
Remove Member**; Team-list Enter/r/`]p`/q remain loaded filtering/explicit reads/
return, respecting mapping shadows/opt-outs. Enter/write never mutate or send.

Independent `teamActions:["rename-v1"]` requires existing conversations/joined-
teams/local-context support, not membership presence or other metadata support.
Each preparation and submission rechecks known existing people/teams/team-
memberships-read and teams-write grants, fresh self, exact Team and a single
complete **≤100-member response**. No documented personId filter exists:
paging/Link/overflow, foreign/duplicate/malformed identities or non-explicit
own `isModerator:true` refuses. Private transient proof never becomes a role/
roster view/cache. No grant acquisition, fallback scan/detail or role writer.

Each phase has ≤3 GETs in 20 seconds; submit adds **one name-only PUT**. The
whole successful flow uses ≤6 GETs/one PUT. Existing eight-second physical,
request/response/read/IPC bounds and native settlement admission stay intact.
Only exact raw Team ID/name ACK confirms. Ambiguity after dispatch is unknown,
not rollback, and blocks same-Team new IDs. `:WebexConversationResolve` binds
original Team/request/manual check without IO/replay; older ACKs cannot clear
newer uncertainty. Shared 256-action saturation fails closed.

Fresh preimage is **not compare-and-set**: concurrent name edits may be lost,
roles can race, and optional-description preservation/tenant behavior is not
live-validated. No description/role/preference/Room field is requested. No
post-PUT read, retry/redirect/auth replay or automatic repair.
Confirmed non-replayed rename invalidates Team label/selection only; native
rows/text/full undo remain intact until explicit joined Refresh. Main Room/
cache/history/roles/unread/notification/receipt/delivery and local filter/
section identities are untouched. Exact row/query/session/window/tick/age
fences include abandoned row-away-return and late callbacks; notes/promoted
buffers, reply/file/draft destinations, focus and colorschemes survive.
Other Team/role/preference and all existing NO-GO gates remain binding.
See the [contract](messaging-public-provider-audit.md#mf24-bounded-team-rename-contract-first-review).

#### Team description replacement

From an unchanged fresh exact `:WebexJoinedTeams` row, **`:WebexDescribeTeam`**
reads fresh raw Team name/description and current Team-moderator proof. It uses
the on-demand list window for a separate ordinary modifiable nofile buffer:
edit/search/undo natively, then **`:WebexTeamDescriptionSubmit`** explicitly
confirms exact Team ID, required unchanged name echo and old/new description.
**Both overwrite risks remain:** concurrent description edits may be lost and
the required name echo may overwrite a concurrent rename; roles can race.
No conditional update/atomicity/live tenant claim. **Cancel** with
`:WebexTeamDescriptionCancel` retains text/full undo.

Independent `teamDescriptions:["replace-v1"]` requires conversations/joined-
teams/local-context support; rename alone does not enable it. Same current
known grants and fresh self/raw Team/complete ≤100-row own-moderator proof
repeat at submission. No personId filter, paging scan, creator/Room/cache role,
membership writer or private roster publication. Missing/null/coerced old
description is not empty; an explicit old `""` can be replaced.
Only changed nonblank LF-only text fits local **1000 UTF-16-unit/4000-byte**
bounds, not asserted provider maxima. Blank/no-op Submit/Enter/write never
clear/send. No Team clear/sentinel or implicit reply/file/Markdown conversion.

Each phase ≤3 GETs/20 seconds; submit adds one exact
`{name:expectedName,description}` PUT. Exact raw ID/name/new-description ACK
alone confirms, no follow-up GET/repair/retry/redirect/auth replay. Same shared
256-action ledger and native settlement hold. Unknown rename/description
blocks both operations/preparations; original action/Team/request/manual check
resolution does no IO/replay and cannot clear newer uncertainty.

The **eight active Room+Team preparations are combined** in the existing private
owner, not another draft registry. Six-field description preparation ≤16384
bytes/two-minute age is separate from rename's unchanged 4096-byte bound.
Exact joined query/session/revision/row/window/tick/age/callback fences apply;
Submit additionally binds private immutable metadata and current plain native
text around consent. Copied buffer variables, promoted work or Room/recipient/
reply/file/Markdown contexts cannot authorize it. Source annotations/old
callbacks cannot steal focus or overwrite native work.
ACK/cancel retires edit authority/status only. **Unlike rename, description ACK
does not reset/renew/invalidate/publish Team labels/name/joined query/cache**.
Main state, receipts/notifications, local sections/filters and files/drafts/
undo remain intact. No global binding is assigned; the single catalogue
discovers named actions. Wnr and Team-list Enter retain their meanings and all
mapping shadows/opt-outs. Other provider/security gates remain binding.
See the [contract](messaging-public-provider-audit.md#mf24-bounded-team-description-replacement-contract-first-review).

`:WebexDirect ID-or-email` resolves an exact person and prepares a separate
recipient draft, plaintext by default. No placeholder is sent. Its first `:WebexSend`
confirms possible persistent DM creation; later sends bind the returned real
room ID. `:WebexDirectOpen` navigates explicitly without adopting a normal-room
draft. Enter/write never send; late ACKs retain newer text and do not steal focus.
`Wno` / `:WebexConversationOpen` opens the current recipient's confirmed DM or
the latest confirmed group result. An unknown newer group is never replaced by
opening an older result. `:WebexDirectOpen` remains available.
`:WebexDirectCancel` retains text; check Webex before `:WebexDirectResolve`.
The existing `:WebexFormat markdown` / `Waf`, `:WebexAttach` / `Wua`, file
Remove/Cancel/Status and explicit Send keys also work here when their exact
`directFormats` mode is negotiated. Markdown-only, single-file, and combined
Markdown/file are independent assertions; neither separate mode nor MF14 room
support implies the combination. Empty captions require a plain file-only send.
Real Markdown mentions remain group-only. Consent rechecks exact person, native
work, format, file and session/selection/window identity. Old/missing support
refuses without downgrade, file drop or placeholder. Shared snapshot quotas and
native undo/newer work are preserved; no recipient-to-normal draft adoption.
New-mode completion requires raw exact recipient/author/content/file evidence
and fresh direct-room verification. Missing echo or failed verification after a
successful POST stays **unknown**, never inferred from titles or safe to recreate.
File preflight uses 20 seconds inside one 60-second send/ACK budget;
Markdown-only retains 20 seconds total. Physical cancellation can settle later.
See the [MF15 contract](messaging-public-provider-audit.md#mf15-exact-recipient-rich-and-single-file-contract);
live service/tenant/echo/file acceptance remains unrun.

`:WebexRenameSpace [title]` is a **named-only**, confirmed title-only action for
the selected ready **standalone group**. `Wnr` still removes a member; no key
family was repurposed. `:WebexActions` exposes exact support/source prerequisites.
Requires independent `spaceActions:["rename-v1"]`, known existing read/write
grants and fresh self/room/membership proof (moderator if locked). Direct,
Team-associated/General, cached and read-only spaces are excluded; use an owned
history/list/composer, not promoted work. There is no generic settings editor.
The default-Cancel prompt binds exact ID/old/new title plus draft/text/format/
root/file/session/window identity. It discloses the non-atomic GET→PUT race.
Canonical titles are 1–80 characters / 320 UTF-8 bytes, no normalization or Ex
execution. At most three GETs and one `{title}` PUT in 20 seconds; no replay or
post-PUT verification request. Old-title mismatch is **conflict** without PUT;
post-admission ambiguity stays **unknown**. Check Webex, then explicitly
`:WebexConversationResolve` the original request; resolution never sends.
An exact ACK updates metadata only: no activity/unread/messages/receipt/
notification effects, draft adoption or focus/undo/annotation/file loss. Optional
existing space-cache updates do not renew observation age or unread evidence.
See the [bounded MF23 contract](messaging-public-provider-audit.md#mf23-standalone-space-rename-contract);
other settings and live tenant acceptance remain outside this delivered slice.

#### Standalone space descriptions

1. From an owned selected-space history/list/composer, run **`:WebexDescribeSpace`**.
   This explicitly reads fresh metadata and opens a separate plain native edit;
   it does not send, select a different room or touch message drafts.
2. Edit normally, then **`:WebexDescriptionSubmit`**. The **default-Cancel** prompt
   shows exact room ID, unchanged title echo and old/new description.
3. **`:WebexDescriptionCancel`** retires preparation while retaining text/full
   undo. Enter/write, normal Send/EditSubmit/Attach/Format never submit metadata.
   All three commands are named-only in the single contextual catalogue; the
   existing key families and mapping opt-outs remain unchanged.

Requires independently negotiated `spaceDescriptions:["replace-v1"]`, not just
rename support. Preparation and submit each require known existing
`spark:people_read`, `spark:rooms_read`, `spark:memberships_read`, `spark:rooms_write`
(or applicable `spark:all`), fresh self/room/own membership and moderator proof
when locked. Direct, Team/General, cached, revoked and read-only rooms are excluded.
Missing/null descriptions are **not** inferred empty; explicitly empty preimages
may be replaced. Clearing, including the service's single-space sentinel, is
excluded. New text must differ and be nonblank, LF-only, ≤1000 UTF-16 units /
4000 UTF-8 bytes; no TAB/CR/unsafe controls, normalization or truncation.

**The public PUT requires title:** the sole body is
`{title: expectedTitle, description}`. Consent discloses both the description
lost-update race **and** overwriting a concurrent rename via title echo. This
is not atomic CAS or a field-isolated description-only write. Each explicit
preparation/submit step has 20 seconds total and at most three GETs; only submit
adds one PUT, without retry/redirect/auth replay or a post-PUT verification GET.
Changed title/description preimage gives **conflict**, zero PUTs. Missing or
mismatched raw ACK ID/type/title/description stays **unknown** after admission.
An unknown rename, description, lock, announcement **or description-clear** blocks all five metadata operations for that room.
Inspect Webex, then `:WebexConversationResolve` the exact original request/room;
physical work must be idle. Resolving never sends or clears newer uncertainty.

Eight active preparations maximum, 120-second freshness rechecked after consent.
Private native ownership binds the original snapshot; changing buffer variables
does not create authority. Completed/conflicted/canceled/expired/promoted/stale
work needs fresh preparation from the selected-space source. Text/full undo and
unrelated drafts, reply roots, files, annotations, colorschemes and focus survive.
The separate buffers disable swap/undo files/modelines, not native undo.
Descriptions and their echoed titles never publish into main room/history/
disk cache/unread/notification/receipt state. This is not durable storage or
full settings parity. See the
[bounded contract](messaging-public-provider-audit.md#mf23-bounded-space-description-replacement-contract);
live title-echo/tenant/policy acceptance remains unrun.

#### Standalone moderation

**`:WebexLockSpace`** requests unmoderated→moderated; **`:WebexUnlockSpace`**
requests moderated→unmoderated. Named-only, no arguments or toggle, both appear
in `:WebexActions` without changing existing key families. Use an owned selected
history/list/composer, not promoted/unrelated/recipient/description-edit work.
Enter/write never change moderation; native text/full undo, replies/files,
annotations, colorschemes, mappings and focus are preserved.

Independent `spaceLocks:["lock-unlock-v1"]` is required. Fresh known
people/rooms/memberships-read and rooms-write grants, self/room/own membership
are checked before PUT. **Lock is creator-self-only with explicit nonmoderator
membership**; **unlock needs explicit fresh moderator proof**, not creator
status. Both require fresh explicit `isPublic:false`/`isAnnouncementOnly:false`.
Direct/Team/General/cached/revoked/read-only targets, missing critical flags,
automatic privatization/announcement clearing and membership-role workarounds
are excluded. No grant expansion or account/plan/tenant bypass.

The **default-Cancel** prompt shows exact ID/title and explicit old/new
precondition, creator promotion/restricted shared management on lock, broader
shared management on unlock, and non-atomic title/moderation/role races.
The sole PUT is `{title:expectedTitle,isLocked:locked}`: mandatory title echo
can overwrite a concurrent rename. This is not CAS, message freezing, encryption
or meeting locking. At most three GETs and one PUT in 20 seconds total;
no post-PUT GET/replay/queue. Precondition mismatch is conflict, zero PUTs;
missing/mismatched raw ACK after admission stays unknown. Any unknown
rename/description/lock/announcement/description-clear blocks all five for that room. Check Webex, then
`:WebexConversationResolve` exact original evidence with physical work idle.

ACKs report only the transition, **not ongoing flags or roles**. They do not
publish room/title/lock/cache/roster/history/activity/unread/notification/receipt
state, even on replay. Post-unlock moderator memberships are not inferred;
later protected actions need fresh proof. See the
[bounded contract](messaging-public-provider-audit.md#mf23-bounded-standalone-lockunlock-contract).
Live promotion/unlock/role/title-echo/tenant-policy acceptance remains unrun.

#### Standalone announcement mode

**`:WebexAnnouncementOn`** requests false→true; **`:WebexAnnouncementOff`**
requests true→false. Both named-only commands share `:WebexActions`, existing
consent/recovery and native source guards, without taking keys or changing
drafts. They are not a toggle, Send or implicit Lock. Enter/write never change
mode; text/full undo, annotations/promotions, reply files, focus, colorschemes
and mapping opt-outs are preserved.

Independent `spaceAnnouncements:["enable-disable-v1"]` is required. Both
directions freshly prove self, exact own **explicit moderator membership**,
and **already locked, explicitly private standalone** Room state, with known
existing people/rooms/memberships-read and rooms-write grants. Missing flags
do not mean false. Direct/Team/General/public/unlocked/cached/revoked/read-only
targets refuse; no automatic lock, public conversion, role write, creator-based
permission, grant expansion or tenant bypass. **Off keeps the space moderated.**

**Default-Cancel** consent shows exact ID/title, explicit old/new preconditions,
posting impact and non-atomic title/lock/mode/role races. On permits
**moderators, bots and integrations** to post; other participants can still
read, view files and join meetings. **Webex notifies other people when enabled**;
system messages may still appear. Off broadens posting subject to remaining
policy. This is not silence, encryption or read/meeting isolation.

The sole PUT is `{title:expectedTitle,isAnnouncementOnly:announcementOnly}`:
mandatory title echo can overwrite a concurrent rename, not CAS. Three GETs
maximum then one PUT in 20 seconds, no post-PUT read/replay/queue. Changed title
or mode is conflict, zero PUTs; missing/mismatched raw critical ACK is unknown.
Any unknown rename/description/lock/announcement/description-clear blocks all five metadata
actions and preparation for that room. Inspect Webex, then resolve exact
original evidence with `:WebexConversationResolve` while physical work is idle.
Results never publish room/title/flags/cache/roles/history/unread/notification/
receipt state, fake system messages, delivery or plugin-send exclusions.
Same-account other-client alerts and preview protections remain unchanged.
See the [bounded contract](messaging-public-provider-audit.md#mf23-bounded-standalone-announcement-mode-contract).
Live mode/role/notification/title-echo/tenant acceptance remains unrun.

#### Separate description clearing

Run **`:WebexDescribeSpace`**, leave its nonblank text **unchanged**, then
**`:WebexDescriptionClear`**. This named-only destructive action has independent
`spaceDescriptionClears:["single-space-v1"]` negotiation plus existing
replacement/preparation support. It reuses private preparation ownership and
eight-active/120-second bounds, not a new draft store. Edited/empty/whitespace/
forged/promoted/stale work refuses; ordinary/history/list/reply/recipient
buffers cannot clear directly. **Blank Submit, Enter/write and Cancel never clear.**

Default-Cancel consent shows exact ID/title/old text, destructive removal and
both description-loss/title-overwrite races. Fresh existing grants, self,
exact own strict-role membership and explicit private/nonannouncement Room
proof are checked; locked needs moderator, unlocked needs a boolean own role.
Public/announcement/Team/direct/General/cached/revoked/read-only spaces are
excluded, with no role/lock/mode/private conversion or grant expansion.

Only `{title:expectedTitle,description:" "}` is sent: exact single ASCII-space
sentinel, internally owned, no empty-string fallback. Three GETs maximum then
one PUT in 20 seconds, unchanged physical/byte/IPC bounds, no post-PUT GET/
replay/queue. Exact title/description mismatch is conflict, zero PUTs.
**Canonical service clear ACKs are unestablished:** only explicitly present
raw empty description plus exact identity/title/flags confirms. Omitted/null/
echoed-space/whitespace/nonempty ACK is **unknown**, not trimmed or inferred.
Some real tenants may always need manual recovery.

All five metadata unknowns interlock for the exact room and preparation.
Inspect Webex, then `:WebexConversationResolve` original request evidence
with physical work idle; resolution never retries or infers empty.
Success/conflict/unknown retires the preparation while keeping its **old native
text/full undo**, never blanking it or inserting the sentinel. Cancellation
retains work and cannot retire an admitted PUT. Existing replies/files,
annotations, colorschemes, focus, keys/opt-outs and navigation remain intact.
No main room/title/description/flags/cache/roles/history/unread/notification/
receipt or synthetic delivery publication. See the
[clear contract](messaging-public-provider-audit.md#mf23-bounded-standalone-description-clearing-contract);
offline checks do not establish live clearing/canonical ACK/title-echo/tenant behavior.

`:WebexCreateSpace title` confirms title-only group creation. Select the returned
room explicitly before `:WebexInvite ID-or-email`; creation and invitation have
separate outcomes. `:WebexRemoveMember` chooses an exact `:WebexMembers` membership
and requires fresh moderator proof. `:WebexLeaveSpace` deletes only your own
membership, **not the room**. Confirmed/unknown leave revokes exact-room authority
for this session, retains drafts/undo and makes only its staged files stale.
Unknown is not confirmed left. Refresh/stale metadata cannot restore permission.
Check the exact operation before `:WebexConversationResolve`; resolving never
replays it. Missing existing known grants show unavailable, not a new OAuth flow.
Unknown actions remain individually recoverable across unrelated successful
actions; failed/older resolution ACKs cannot clear newer uncertainty.

`:WebexTeams` / `:WebexTeamsMore` explicitly fetch lazy labels for loaded
noncached room Team IDs; eight/page, 32 cached, always partial loaded associations.
`:WebexTeamFilter ID` (or an unchanged Team row) filters without fetching/selecting.
The separate `:WebexJoinedTeams` / `WvT` now performs a bounded explicit joined-Team
read; it does not change those loaded-label semantics or add Team/room joining.
Server Teams are not Local sections or native personal Webex Sections. No Team
membership changes, room moves/deletes or bulk actions were added.
The `Wn`/`Wv` key families and `:WebexActions` expose these guarded helpers.
See [F5 contract](conversations-design.md).
Participant/Team lists have `r` refresh, `]p` next page, Enter exact row actions/
filter and `q` return. Annotations, promoted files, native undo and user maps are
preserved. See the [NC4 contract](native-organization-design.md).

### Explicit outgoing files

`:WebexAttach [path]` in a ready normal/reply or negotiated recipient composer selects one local regular
file and stages an anonymous read-only snapshot, at most 10 MiB. The filename/size
appears in the statusline, never in sendable text. `:WebexSend` explicitly sends
text plus the file, or a file alone. `:WebexAttachRemove` removes its draft
association; it does not cancel/retarget a POST already admitted.
Selecting a replacement discloses the previous snapshot and defaults to Cancel;
failed/declined staging retains it. Selection/status disclose the 10 MiB upload
versus 6,000,000-byte generic receive limits; neither ceiling is silently raised.
`:WebexUploadCancel` explicitly cancels active staging/upload; after possible
submission the outcome is unknown, not “unsent”. `:WebexAttachmentStatus` inspects
metadata without sending or starting a backend. The `Wua/ur/uc/us` keys reach
stage/remove/cancel/status; file selection remains explicit.

Symlinks, hardlinks, special files and changed/oversize sources are refused.
Original changes after staging cannot change the snapshot. At most eight
references/20 MiB total, one stage/one physical upload, 8/60-second deadlines and
no automatic queue, redirect, auth replay or POST retry. Physical cleanup retains
admission after logical cancellation. An old ACK cannot clear newer text or a
replacement file; native undo, room/reply association and annotations are retained.
Disconnect marks metadata stale and retains uncertainty; reselect explicitly.
Known existing messages_write/all grant is required, never probed or expanded.
Progress redraws status only and filenames/paths stay out of health/logs.
Demo sends are local. See [F3 contract and offline evidence](uploads-design.md).

Loading/empty/error and pagination states have textual guidance, not color-only
indicators. Backend loss repaints connection status while retaining drafts and
marking meeting details unknown/last reported, never implying that media stopped.
Unchanged view contents are not rewritten on each notification; native cursor,
viewport and undo state remain untouched. Explicit compose/status commands focus
an existing view across tabs before opening any new split.

## Global command family

The implemented **global Normal-mode** family uses `leader_prefix = '<leader>W'`
by default in both Vim and Neovim. `mappings = false` disables it and buffer
defaults; commands and `<Plug>` targets remain usable. Existing conflicting maps
are skipped, not overwritten. **`:WebexActions` / `<leader>W?`** lists effective
bindings, context/capability prerequisites, the explicit-send hint and preserved conflicts
in an on-demand native reference (`q` returns, `/` searches). Discovery never
fetches or mutates. Edited/promoted references are retained. `:WebexHealth` reports
the catalogue/conflicts too. Optional which-key descriptions come from the same
[`autoload/wbx/commands.vim`](../autoload/wbx/commands.vim) catalogue, not a second
independent key list. Local aliases remain available.

Interactive space pickers (native, Telescope, fzf-lua or Vim fzf) open guarded
history like Enter, but **never mark read on opening**, even when automatic
open-marking is enabled for Enter. Labels include title/type, a Team-space hint
and an ordinal for otherwise identical labels, **not raw space or Team IDs**.
Exact IDs stay internal to callbacks. Cancelled/stale callbacks cannot take over another buffer or session;
the public `wbx#select()` / Lua `select_space()` API remains focus-neutral.
Plain Vim needs no fuzzy-finder: `:WebexSpaces` then native `/` searches loaded
rows. Pickers never scan/fetch hidden destinations.

Notification controls, local section/filter choices, participant/removal menus,
meeting source/layout choices, unknown-action recovery and multi-attachment
selection use the same native UI chooser as mentions: Neovim `vim.ui.select`
(including the user's UI provider) or Vim `popup_menu`; only older editors
without either API fall back to `inputlist`. Escape cancels. Late, duplicate,
out-of-range or superseded choices cannot act; temporary picker focus is allowed
only with unchanged buffer/text/session/target context. Mutation/recovery
confirmation remains separate, with Cancel as its default. Recovery confirmation
still names exact target/request evidence; hiding IDs in labels does not loosen
write/uncertainty guards. Enter in a picker is not message-send consent.

Optional `:WebexActions available` removes unavailable entries; `context` puts
the source buffer's common available groups first. A group name such as `files`,
`meetings` or `recovery` narrows the index; `all` restores the complete catalogue.
Named-only, disabled defaults and shadowed/unbound defaults have distinct labels.
Filtering an open reference uses its inert context snapshot; reopen from the
destination to refresh availability. Enter still executes nothing.

Filtered spaces show matched/loaded counts, zero-result guidance and a
**selected hidden** warning when the unchanged destination is not visible.
`:WebexFilter all` restores loaded rows without a fetch or retarget; a collapsed
local section still requires explicit expansion. Short section summaries retain
unread/unknown/stale provenance. The global catalogue stops at **500 rooms**:
explicit `:WebexMoreSpaces` can load one page below that cap, never bypass it.
Joined-Team labels do not load their spaces. Use Webex for unreachable Team or
notification destinations; changing server memberships is not a browsing remedy.
New bounded Team-space browsing remains a separate design/authorization gate.

Which-key uses short labels and named prefixes: **a — Message actions, u — Files,
n — Conversations, v — Views, m — Meetings**. Views holds browsing and related
display controls; message editing, uploads, conversation management and meeting
controls stay in their own families. `s` remains the **Pick space** leaf, not a
submenu. Names derive from effective owned bindings and respect user shadows and
mapping opt-outs. Normal workspace, attachment and composer chrome shows state,
not command tutorials; discovery stays in help and the action/key menus.
Reply attribution does not repeat the parent body. Successfully rendered image
previews have no placeholder; unavailable/clipped previews keep useful labels.

Keys below are **after `<leader>W`** (or your configured replacement prefix):

| Suffix | Command | Action |
| --- | --- | --- |
| `w` | `:Webex` | Open workspace |
| `s` | `:WebexPickSpace` | Pick space |
| `c` | `:WebexCompose` | Compose |
| `p` | `:WebexPeople` | Native local People snapshot; passive header/Spaces presence defaults on |
| `r` / `R` | `:WebexReply` / `:WebexCancelReply` | Reply / cancel, retaining drafts |
| `t` | `:WebexThreadFold` | Toggle whole loaded thread; no dedicated thread view |
| `g` | `:WebexLatest` | Go to canonical newest message; never open folds or consent to a receipt |
| `o` | `:WebexAttachment` | Open attachment: native text/image view or configured file handler |
| `A` | `:WebexAttachmentDownload` | Download original bytes to a chosen new destination |
| `mu` | `:WebexUpcoming` | Refresh imminent Webex-visible meetings; never join automatically |
| `S` | `:WebexSend` | Explicit send; valid owned composer only |
| `f` | `:WebexRefresh` | Refresh |
| `l` | `:WebexLayoutReset` | **Direct** owned-layout reset, not a submenu |
| `d` | `:WebexDisconnect` | Disconnect messaging, retain drafts |
| `ae` / `ad` | `:WebexEdit` / `:WebexDelete` | Exact own history message; fresh preflight and consent |
| `as` / `ac` | `:WebexEditSubmit` / `:WebexEditCancel` | Explicit submit / cancel; native edit text retained |
| `af` | `:WebexFormat` | Native Plain/Markdown choice for this draft only |
| `am` / `aM` | `:WebexMention` / `:WebexMentionAll` | Participant / deliberate @all; insertion never sends |
| `ua` / `ur` | `:WebexAttach` / `:WebexAttachRemove` | Stage one file / remove it |
| `uc` / `us` | `:WebexUploadCancel` / `:WebexAttachmentStatus` | Cancel / status |
| `nd` / `ns` | `:WebexDirect` / `:WebexCreateSpace` | Exact-recipient preparation / group creation; invitations separate |
| `no` / `nc` | `:WebexConversationOpen` / `:WebexDirectCancel` | Open confirmed DM/group / cancel preparation |
| `ni` / `nr` / `nl` | `:WebexInvite` / `:WebexRemoveMember` / `:WebexLeaveSpace` | Explicit confirmed membership actions, not room deletion |
| `vp` / `vt` | `:WebexMembers` / `:WebexTeams` | Bounded participants / partial Server Teams |
| `vT` | `:WebexJoinedTeams` | Explicit bounded joined-Team list; filter loaded spaces only |
| `vf` / `vs` | `:WebexFilter` / `:WebexSections` | Native filter / local section and explicit preference choices |
| `vn` | `:WebexNotifications` | Local controls only, not account DND |
| `vP` | `:WebexPeopleRefresh` | Separate explicit selected-peer provider read; snapshot/session/opt-out guards |
| `mP` / `mL` | `:WebexMeetingSources` / `:WebexMeetingLayout` | Bounded slots / finite owned pane-layout choices |
| `mR` | `:WebexMeetingAuthRefresh` | Explicit meeting OAuth refresh, separate from messaging |
| `mj` | `:WebexMeeting` | Join/reuse meeting |
| `ms` | `:WebexMeetingStatus` | Meeting status |
| `me` / `mk` | `:WebexMeetingEditor` / `:WebexMeetingKitty` | Present in editor / Kitty |
| `md` | `:WebexMeetingDetach` | Detach view, keep meeting |
| `ml` | `:WebexLeave` | Explicitly leave meeting |
| `mm` / `mc` | `:WebexMicrophone` / `:WebexCamera` | Microphone / camera sending |
| `mp` | `:WebexPreview` | Local preview, not sent |
| `mh` | `:WebexShare` | Screen sending |
| `ma` | `:WebexAudio` | Received audio |
| `?` | `:WebexActions` | Actions/effective bindings/conflicts |

Mappings call the finite shared catalogue, which checks context/capability before
invoking existing guarded owners. No caller-supplied Ex/RPC tunnel exists.
Named recovery commands are listed too, without pretending they have default keys.
Custom prefixes, prefix descendants and user buffer/global mappings are preserved;
repeated setup releases only unchanged plugin-owned defaults. Meeting `me`/`md`
retain their original presentation/detach meanings.

NC5 pane controls negotiate both backend and existing owner support. There is no
generic action tunnel or media owner. `speaker` is fixed main/secondary geometry,
not active-speaker following. Source slots (max 16) are not a complete attendee,
self or lobby roster. Stale choices are revision/session-fenced, and only an
owner completion ACK reports applied. Unknown/disconnected/partial outcomes do
not replay. Transmission, detach and inherited tmux appearance are unchanged.

Presence refresh uses the existing provider cache/backoff, periodically for the
selected peer and on explicit request; it never reopens a dismissed/promoted
popup. Rendering itself does not fetch presence. Agenda rows show both UTC endpoints,
local time and joinability reasons without widening the discovery window.
Compact call status uses reported mic/camera/share/Rx/control state; stale or
missing observations are unknown, not off. Local preview is always NOT SENT.

`:WebexResolveDelivery` now waits for a destination-bound ACK before clearing
matching native evidence. Selection/focus/edit changes, failure or newer unknown
evidence invalidate that clear. Older backends cannot perform an unbound native
reset; update deliberately. Resolution never sends a message or receipt.

## People presence and automatic details

The user requested **default-on passive client features** after the initial
opt-in implementation. `people_status = true` (Vim `1`) is now the native default;
set false/0 to opt out. Explicit existing opt-outs are never overridden.
The popup itself also appears automatically for a displayed direct conversation;
enabling only the provider while hiding its UI behind a command is not the default.
The command/header/option are wired in source, with current verification tracked
in the [verification index](verification-index.md).
No installed configuration, scopes, authorization or live session was changed.

For an explicitly started authorized connection, the selected direct-chat
header and automatic Spaces cues use the public REST presence snapshot
provider. **`:WebexPeople` / `<leader>Wp`** opens navigable, read-only local text
in an ordinary native split, not a popup; it never requests a lookup.
The provider checks already-granted `spark:people_read` and
`spark:memberships_read` (or applicable `spark:all`) before identity/status reads;
missing grants yield a scope-required state, never automatic reauthorization or
scope additions. Group/demo/disconnected/explicitly-disabled cases do not trigger people
reads for those targets. There is no organization enumeration or group-roster
presence scan; selecting a group does not disable independent visible-DM reads.

Explicit room selection or `:WebexPeopleRefresh` may fetch the relevant peer through bounded,
generation-guarded reads. Visible direct-space rows now also load presence
**without opening their conversations**. A debounced viewport/cursor report
negotiates `peopleViewport: ['paged-v1']` in current clients. Up to 128 actually
visible direct rows share the existing identity/presence owner. The selected peer and
visible set become eligible for refresh after **60 seconds**, or later under
Retry-After; large/slow viewports may take longer to complete. This is not a true
hidden-room scan or new transport pool. Verified peers use documented People
list-by-ID batches of at most 85 exact IDs. Cold rosters still need separate reads;
a one-second cold-viewport completion is not guaranteed. Legacy
`peopleSpaces: ['visible-v1']` clients retain their original eight-row limit.
Cold viewport lookups now resolve the whole reported batch with two continuous
HTTP readers and one shared self bootstrap, then retrieve statuses in one GET.
They do not publish pairs or pause two seconds after every two people.
The rolling two-start/two-second budget applies to status GETs, not individual
roster jobs. Shared self bootstrap, bounded physical
admission/cancellation and Retry-After remain enforced.
Already observed statuses are cached for up to 500 loaded live direct rows within
the same session, separately from the bounded viewport relevance set. Verified
peer mappings are retained for up to five minutes across scrolling, with the
same row/session invalidation and a 500-entry limit.
Scrolling away does not erase them; scrolling back shows a still-fresh value
immediately, without another People read. Freshness/staleness limits remain
truthful. Hidden rows are not polled, and removal/type change, denial or session
replacement invalidates the relevant cache.
One paced timer uses the same singleflight/admission bounds; hiding the list
removes its peers, and disconnect, provider replacement,
denial, missing grants and expired credentials stop it. It never renews auth or
adds grants. History polling/paging and snapshots do not fetch. Header and
details label fresh/stale/unknown/unavailable states in text. `inactive` is **not
necessarily offline**; missing or undisclosed status must not be inferred from
authors, unread state, activity or meeting-roster membership. Organization and
status-sharing policy may prevent disclosure. **Custom-status text is unsupported**
by the public Node/REST surface used here, not an empty custom status or an
implemented feature. No profile/status mutation is included. See the
[capability, bounds and exact blocker](people-status.md); live freshness/policy
acceptance remains NOT RUN.

The compact People float, DM header and Spaces icons are the passive default.
The float uses only the already-published selected-peer snapshot and preserves
focus/full undo; closing/promoting it is respected for that selection. Opening
native details dismisses it. `:WebexPeople` is a **read-only local snapshot** of the
selected conversation, not the highlighted Spaces row. It also works offline,
with a missing grant or with `people_status=0`; newly generated opted-out views
mask retained person/observation fields. Existing snapshots remain inert text,
not live indicators. Repeating the command or local `r` regenerates only local
published data. **`:WebexPeopleRefresh` / `WvP`** is the separate explicit provider
read, requiring a ready selected DM, enabled known capability/grant and matching
People room association. From a details buffer it additionally requires an
unchanged owned snapshot of that same selected room/session. An A snapshot never
refreshes a newly selected B. Its metadata can only refuse a read, never select a
provider target; the RPC still sends `{}`.

Use native motions, `/`, selection and copy to read complete names, status, local
observation age, available last activity and retry times. Syntax/color are not
required, Unicode fields are not popup-clipped, and narrow splits use native
wrapping/options. Local `q` returns to the exact originating window if it still
shows the same buffer; returns are independent across tabs/splits. User mappings
and `mappings=0` win. State, disconnect and late refresh callbacks never repaint,
close, reopen or focus the snapshot. Edited/renamed/type-promoted copies and full
native undo remain user-owned; annotation ticks, not `nomodified`, guard reuse.
Enter/write never send, acknowledge or look up a person. Details cannot authorize
a history receipt or suppress a notification as if they were focused history.
Spaces use gutter cues for direct peers: 🟢 active, 📞 call, 📹 meeting,
⛔ Do not disturb, 🖥️ presenting, 🌙 inactive, 🏖️ out of office and ⏳ pending.
Unknown, unobserved or undisclosed statuses use `?`, not an inferred offline or
manual-Busy state. A stale known icon stays visible with neutral styling while
refreshing, avoiding a sequential `?` flash; after five minutes it expires to
unknown. Full text/freshness remains available without an emoji-capable font.
Observations for the visible rows are retained;
later rows no longer evict earlier visible
statuses. Offscreen peers outside the selected/visible set are not polled. Groups and
cached spaces have no presence icon. Idle cues expire to unknown without changing
native text/undo or doing I/O. Theme overrides use `WbxPresenceActive`,
`WbxPresenceBusy`, `WbxPresenceAway` and `WbxPresenceUnknown`.
Neovim 0.10+ appends a dedicated two-cell statuscolumn slot after line numbers,
outside the buffer's space-name area; there is no inline presence text. Original
custom gutter formats/click regions are delegated and restored on leaving Spaces.
Later explicit overrides win. Vim/older Neovim use native margin signs instead.
Buffer text/undo, numbering and unrelated signs remain untouched.
See [native details and historical popup verification](people-popup-design.md).
**Manual Busy is not DoNotDisturb:** Cisco reports that the People REST API can
return manual Busy as `unknown`. It cannot safely be recovered from that value.
The red busy-style circle above covers documented call/meeting/presenting/DND
states, not a claim of manual-Busy support. A different provider is not activated
by this UI correction; see [the provider limitation](people-status.md#manual-busy-provider-limitation).
Automatic display and state updates add no RPC or provider work. A people frame
covering the newest body endpoint conservatively blocks receipt eligibility;
dismissing it does not send or retry a receipt.

Same-account/application credential renewal with unchanged grants preserves the
People viewport, observations and minute timer. It no longer discards every
badge or waits for an unchanged viewport report to be resent. Actual grant loss
and session/account replacement still invalidate their observations.

## Source implementation and validation status

The new command family, folding, automatic edge paging, manual-size preservation,
per-window anchors, unload guards, bounded native history syntax, visible unread
health, truthful media states and non-sendable send hint are **implemented and
offline-validated; not live activated**. Selected-peer presence and other passive
client features default on; explicit opt-outs remain. Hidden reload edits, popup keyboard ownership and room-specific fold-state
restoration are covered by the completed isolated checks. No live presence,
post/receipt or media acceptance is implied.

Use [implementation progress](implementation-progress.md) for actual current-pass
commands/evidence and the [implementation plan](implementation-plan.md) as the
requirement ledger. Historical results below/in the validation record are not
new pass totals. Existing examples and installed configuration remain unchanged;
an eventual authorized activation must preserve memory-only drafts first.

## Tests

Safe documentation-only smoke checks (no application startup/build/network):

```sh
node --import tsx --test test/documentation.test.ts test/implementation-plan.test.ts
```

These check local links/anchors, advertised help commands/tags and the plan's
coverage ledger; they do not validate runtime, media, SDK or live behavior.

```sh
npm run verify:plugin
# CI: require BOTH full Vim and Neovim; missing/limited editors are failures.
WBX_STRICT_EDITORS=1 npm run verify:plugin
# Separate explicit media/presentation suites:
WBX_EDITOR_MEETING_TEST=1 npm run test:editor
WBX_EDITOR_MEETING_TEST=1 WBX_KITTY_TEST=1 npm run test:editor
```

`verify:plugin` delegates to `verify:isolated`: a preserved working-tree copy is
checked/built, then core, both independent native editor suites, real fresh-process
draft restarts, synthetic SDK/cache, drawn PTY fixtures, docs/help, LazyVim example
consistency and candidate bundle proof run there. The checkout is never built or
repaired. Commands, source/artifact hashes, tool versions, timeouts, skips and
lineage are retained under the printed `/tmp/opencode/wbx-isolated-*` path.
The shared `test/editor/fixtures.json` declares editor/mode cells and documented
benchmark/media exclusions; required skips are not passes.

This gate always requires both full editors, strips inherited source/media/build
overrides and pins `WBX_TEST_SOURCE_BACKEND=0`. Installed Node, esbuild (including
tsx's separate nested version/native executable), tsx and TypeScript identities
are fingerprinted and checked against lockfile version/dependency metadata before
building and again afterward. That is **not** registry-content verification,
clean-install reproducibility or external runtime/SDK dependency integrity; no
dependencies are installed or repaired. Source-mode tests remain an explicit
separate direct-test option. `python3 scripts/verify-isolated.py --focused` runs
an affected tier, not full acceptance. Direct `test:editor` commands still honor
explicit graphical opt-ins.

The private acceptance probe (`WBX_TEST_BACKEND_AUDIT`, set only by the copied
gate) records actual editor-native job argv, fixture and launch status in its
evidence directory. Production use with this unset writes no command log. Each
native dimension and the restart tier must actually launch the copied candidate
bundle; source/foreign production bundle commands fail the gate. Synthetic
fixture commands are reported separately. Direct explicit source-mode tests are
not bundle acceptance.

To test the documented LazyVim spec with an **already installed** lazy.nvim:

```sh
WBX_LAZY_PATH="$HOME/.local/share/nvim/lazy/lazy.nvim" npm run test:lazyvim
```

This imports the checked-in spec through real lazy.nvim in an isolated Neovim
config, verifies idle startup/preserved mappings/statusline, and runs the explicit
local messaging demo. It does not start your LazyVim config, bootstrap/download
plugins, run build hooks or test the full LazyVim distribution. Without
`WBX_LAZY_PATH`, only the documentation/example consistency check runs.

Set `WBX_VIM` / `WBX_NVIM` to editor binaries; set `VIMRUNTIME` if using an
uninstalled Vim build (the runner removes it for Neovim). Meeting tests require
tmux/Chrome; Kitty tests open real local windows. These tests use synthetic data,
isolated config directories and private tmux sockets, never your real account.
Live acceptance remains [explicitly separate](live-acceptance.md).

See [the local validation record](editor-validation.md) for coverage, real-editor
screenshots and remaining boundaries, or [the backend protocol](editor-protocol.md)
for the editor/engine ownership and transport contract.
The [source/runtime map](architecture.md) also explains all five entrypoints and
why source controllers can still depend on compiled owner/browser/SDK children.
