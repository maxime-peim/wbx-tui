# WBX Messaging — modal, keyboard-first Webex spaces

Use **[the Vim/Neovim plugin guide](editor.md)** for native messaging buffers,
drafts, mappings and editor integrations. The standalone TUI described below is
retained as a compatibility/reference client during migration.

Its commands, Enter/`:w` behavior and limits below apply to **this client only**.
The native editor supports thread-bound replies and never sends on a write;
the meeting-pane space overlay has its own controls in the
[meeting reference](meeting.md#space-messaging-not-in-meeting-chat). The
[trusted `--init` API](configuration.md#beyond-settings-programmable-init-api-v1)
is supported here; it is not a plugin installer or a sandbox.

This is a **standalone messaging workspace**, not the meeting video's `x` overlay
and not in-meeting chat. It lists existing group/direct spaces, reads plaintext
history and sends plaintext to the explicitly selected space. **No meeting is
joined and no camera, microphone, SDK asset or Chrome worker is started.**

## Launch

```sh
npm ci
npm run build
npm start -- messages --demo
npm start -- messages --demo --theme tokyonight
npm start -- messages --demo --config examples/messaging.json
npm start -- messages                      # use configured OAuth automatically
npm start -- messages --auth token         # explicit developer-token prompt
npm start -- messages --auth oauth --config /path/to/public-config.json
```

Messaging needs Node 22.12+ and an interactive UTF-8 terminal. Truecolor is used;
Kitty is tested but not required. Run normally in any real tmux window, e.g.:

```sh
tmux new-session -s wbx-messages -n messages 'node dist/cli.js messages --demo'
```

Messaging panels are **application text splits inside that native window**, not
separate tmux processes. This is deliberate: a single modal editor owns message
input. The existing **meeting** command continues to use one real native pane
per participant/share. Neither mode changes or replaces the other's layouts.
Detach/reattach tmux preserves the messaging process and its in-memory drafts.

Live messaging uses the fixed `https://webexapis.com/v1` REST API, with the bearer
only in the Node process. Supply organization-approved `spark:rooms_read`,
`spark:messages_read`, `spark:messages_write` grants (or explicitly approved
broader scopes). Never paste credentials into chat, CLI arguments or repository files.
Optional `oauth.clientSecret` may be stored in your private owner-only config;
see [permissions and retention](oauth.md). It is not included in public output.
OAuth reuses [the exact loopback/PKCE setup](oauth.md), but `messages --auth oauth`
opens the local system browser with `xdg-open`; **it does not launch the meeting
browser**. Runtime secrets and refresh grants stay in Node; a configured client
secret also remains in its original private file. Login grants are session-only.
`:auth.refresh` renews the current REST credentials without a meeting/media worker.
Expiry or failed renewal closes the client. Token-only mode cannot renew.

`--demo` is an account-free, **network-free** three-space sandbox. Every send
stays local and its acknowledgment says so. Demo data is never inserted into a
real account. `--print-config` prints effective public configuration without a
terminal, network or credential prompt; `--help` documents CLI options.

### Does my existing OAuth configuration work?

Meeting and messaging commands share the **same app `oauth` profile** and default
config path. Messaging needs the three `spark:` read/write scopes above (or an
expressly approved `spark:all` grant); meeting-only scopes are not sufficient.
Check a public profile **without signing in or displaying client credentials**:

```sh
npm start -- messages --check-auth --config /path/to/public-config.json
```

This reports missing scopes and schema compatibility, not live Webex acceptance.
Your integration must still register the exact callback and approve the requested
scopes. Start with `messages` to use the configured profile. The owner uses optional
`oauth.clientSecret` from the private config, otherwise asks in a hidden prompt.
**OpenCode/MCP's Webex OAuth connection is a
separate credential owner**: the standalone app does not read/copy its token,
refresh grant or integration secret. Do not paste/export those grants into app
configuration. A Neovim Lua config/colorscheme also isn't loaded or executed;
use the public JSON appearance settings below.

## Modes and default shortcuts

| Mode | Keys | Effect |
|---|---|---|
| Normal | `j` / `k`, arrows, `gg` / `G`, `Ctrl+u` / `Ctrl+d` | Move through spaces/messages |
| Normal | `Enter` | Open highlighted space; never send a message |
| Normal | `i` / `a` | Focus composer and enter Insert |
| Normal composer | `h/j/k/l`, `0` / `$`, `x`, `I` / `A` | Cursor motions, line bounds/delete, insert at line start/end |
| Insert | printable text, arrows, Home/End, Backspace/Delete | Edit multiline Unicode draft, grapheme-aware |
| Insert | `Enter` | Newline, **not send** |
| Normal/Insert | `Ctrl+s` | Explicitly send to the space named above the draft |
| Insert | `Esc` | Normal mode; never quits |
| Normal | `Tab` / `Shift+Tab`, `Ctrl+w h/j/k/l/w` | Cycle/directionally focus panels |
| Normal | `Ctrl+w + / - / > / <`, `Ctrl+w o` | Resize height/width; toggle focused-panel zoom |
| Normal | `Ctrl+y` / `Ctrl+e`, PageUp/PageDown | Scroll wrapped history lines, including long messages |
| Normal | `/`, then Enter | Filter spaces, or search loaded message text/authors |
| Normal | `n` / `N` | Next/previous loaded-message search match |
| Normal | `Ctrl+r` | Refresh focused spaces/history |
| Normal | `:` | Command line; Tab completion, Up/Down command history |
| Normal | `?` | Scrollable help, including effective mode mappings |
| Normal | `q` / `:q` | Quit only if there are no drafts/pending sends |
| Any | `Ctrl+c` | Unconditional exit; discards in-memory drafts |

Bracketed paste is accepted **only in Insert** and never runs shortcuts, command
lines, Ctrl+C or sends from pasted newlines. Paste strips control/bidi characters
and respects the body limit. Paste outside Insert is ignored. Unbracketed paste
cannot be distinguished from typing: use a terminal with bracketed-paste support.
This follows Vim's modal conventions, **not** the full Neovim editing language,
plugin API, Lua config, operators, registers or shell-command execution.

The display is **Neovim-inspired**, not a card dashboard: a buffer/tab line,
`wbx://` buffer status lines, thin split separators, relative-number gutters,
cursorline highlighting, `~` end-of-buffer lines, a colored mode segment and a
right-aligned UTF-8/line:column indicator. The real terminal cursor is a block in
Normal and a bar in Insert/command mode; its default shape is restored on quit.
There are no outer boxes or simulated graphical cards.

## Commands

```
:layout mail                 spaces left, history above composer
:layout stacked              vertically stacked spaces/history/composer
:layout detailed             spaces, history/composer, destination info
:layout.save NAME            atomically save current messaging splits to config
:theme midnight              built-ins: midnight, forest, light
:colorscheme tokyonight       alias for theme; also gruvbox
:set number                  absolute numbers; set relativenumber / set nonumber
:bnext                       next focused buffer; bprevious goes backward
:reload                      validate/reload mappings, theme and configured layout
:history.older               load an older history page
:rooms.refresh               load more spaces, or refresh first page if exhausted
:focus.rooms                 also focus.messages, focus.compose, focus.next, …
:pane.maximize               resize actions: pane.grow/shrink/widen/narrow
:auth.refresh                OAuth only
:draft.clear                 explicitly discard selected space's draft
:delivery.resolve            acknowledge UNKNOWN delivery after checking history
:send                        same explicit action as Ctrl+s; :w alias
:q!                          explicitly discard drafts/pending delivery and quit
```

Commands are a validated allowlist, **not a shell**. No command text executes until
Enter. Runtime theme/layout changes are session-only unless `layout.save` is
explicitly invoked. Reload retains the selected space, credentials and drafts.
Terminals smaller than 60 columns/18 rows show only the focused panel; Tab still
switches between all configured panels. Tiny terminals display a resize notice.

## Customize shortcuts, themes and layout

Default config: `$XDG_CONFIG_HOME/wbx-tui/config.json` (or `~/.config/wbx-tui/config.json`).
Override via `--config PATH` or `WBX_CONFIG`. See
[`examples/messaging.json`](../examples/messaging.json) for a working profile:

```json
{
  "leader": ",",
  "theme": { "background": "#101c18", "accent": "#a5d78d", "focus": "#a5d78d" },
  "messaging": {
    "layout": "mail",
    "keybindings": {
      "normal": { "J": "move.down", "<leader> e": ["focus.compose", "insert"], "q": null },
      "insert": { "<C-e>": "send" }
    }
  }
}
```

- Bindings merge with defaults **per mode**. `null` unbinds; arrays are bounded
  action macros. Sequences use spaces (`g g`, `<C-w> h`, `<leader> r`). `<Space>`
  represents literal space; prefix sequences time out after one second.
- Insert mappings accept **single special keys only** so printable text always
  remains literal. Even Escape may be remapped; physical Ctrl+C is reserved.
  Ambiguous prefixes and unknown actions fail validation before a reload takes
  effect, leaving the working configuration intact.
- All seven theme roles are customizable `#RRGGBB`: `background`, `foreground`,
  `muted`, `accent`, `border`, `focus`, `warning`. Partial overrides retain defaults.
  `--theme NAME` / `:theme NAME` select a built-in for the session.
- `messaging.lineNumbers` selects `relative` (default), `absolute` or `off`.
  The `:set …` commands above override this for the current session.
- `messaging.layouts.NAME` is a binary tree. A leaf is `{ "panel": "rooms" }`,
  `messages`, `compose` or optional `info`. A split contains `direction`:
  `vertical` (left/right) or `horizontal` (top/bottom), `ratio`: 0.1–0.9 and
  two `children`. Required panels must each appear exactly once; info at most once.
- `:layout.save NAME` writes **only messaging geometry** using a private atomic
  replacement. Meeting layouts, public OAuth settings, remaps and theme overrides
  are preserved. An existing private `oauth.clientSecret` is preserved in its
  original file (mode 0600); drafts, messages and login grants are never added.

## Delivery and bounds

- Selection is explicit. No meeting URL is inferred as a destination. Drafts are
  bound to **space IDs**, kept only in memory, and restored when switching spaces.
  A late send acknowledgment can only clear its original, unchanged draft.
- Sends use plaintext JSON (`text`), not executable HTML/Markdown. Opening a space
  or pressing Enter in the editor never sends. A returned Webex message ID/room
  match is required before showing success; this is API acceptance, not proof that
  another person read it.
- No automatic POST retries. Network failures, server uncertainty or invalid
  acknowledgments report **UNKNOWN**, retain the draft and block further sends to
  that space until `:delivery.resolve`. Check history/another endpoint first; a
  subsequent explicit retry can otherwise duplicate an already-delivered message.
- Up to 500 existing spaces, fetched in pages of 100; selected-space polling every
  four seconds and up to 500 loaded messages. Older history loads explicitly.
  Outgoing bodies are capped at 1,000 UTF-16 code units. Incoming text is bounded
  at 10,000 characters with an explicit truncation marker. Up to 100 in-memory
  destination drafts and the last 64 request IDs are retained.
- GET/POST responses are bounded to 1 MiB with 12-second deadlines; redirects are
  refused. Pagination must stay on the exact TLS host/API path and selected room.
  Raw provider errors and tokens are never rendered or logged.
- Existing direct conversations are supported through their spaces. **In this
  compatibility client**, creating
  new spaces/DMs, attachments, threads, edits/deletes, reactions, all-space unread
  counts, push/webhooks and durable/offline history are not implemented. Only
  the selected space is polled. Rich/non-text messages show a placeholder.

## Verification and authorized live acceptance

```sh
npm run check
npm run build
npm run test:messaging
WBX_KITTY_TEST=1 npm run test:kitty
```

The messaging suite includes real local HTTP/OAuth-provider fixtures and the
**built CLI in real tmux and a PTY**, covering remaps/macros, theme changes, split
resizing, saved/reloaded layouts, Unicode/multiline delivery, modal paste safety,
unknown outcomes, pagination, stale-room results and terminal restoration. Kitty
adds a real terminal render/screenshot test. Fixtures are **not live Webex delivery**.

Live send/receive/renewal acceptance for this client remains **NOT RUN** and needs
the operator's authorization. The prior native-editor startup diagnostic and
styling-only observations in [the acceptance record](live-acceptance.md) do not
complete these checks:

1. Designate a test space with consenting members and an authorized second endpoint.
2. Enter approved credentials locally; do not send them to the agent. OAuth
   registration/consent must be performed by the integration owner.
3. Verify the space list/history, then explicitly send a harmless unique marker.
   Confirm exact text (including Unicode/newlines) on the second endpoint.
4. Reply from that endpoint; confirm it arrives via selected-space polling. Switch
   spaces with different drafts and verify destination isolation.
5. Test theme/key/layout reload and tmux detach/reattach without credential prompts
   or duplicate sends. In OAuth mode, test approved `:auth.refresh` and delivery
   afterward; approved grant revocation must stop the client.
6. Record sanitized PASS/FAIL results only; remove test messages/revoke test grants
   yourself as appropriate. Quit does not revoke remote Webex authorization.

API references: [List Rooms](https://developer.webex.com/docs/api/v1/rooms/list-rooms),
[List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages),
[Create a Message](https://developer.webex.com/docs/api/v1/messages/create-a-message),
[Pagination](https://developer.webex.com/docs/basics#pagination).
