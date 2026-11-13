# Native option catalogue

`wbx#options#catalogue()` is the source of truth for native keys and Lua setup
forwarding. `require('wbx-tui').setup({...})` and `g:wbx_tui` share these keys.
Rows carry key/default/materialization/category/Lua-forwarding metadata. Optional
module defaults are descriptive, not injected into user globals or unrelated modules.
The catalogue does **not** forward keys to RPC: private request admission and
explicit consent translation remain separate. Lua-only `treesitter`, `which_key`
and `on_buffer` remain local integrations/callbacks.

| Key | Default / owner |
| --- | --- |
| `demo` | 0 |
| `config` | Empty: standard private config path |
| `backend` | Empty argv: built dedicated backend |
| `mappings` | 1 |
| `leader_prefix` | `<leader>W` |
| `send_with_ctrl_s` | 1 |
| `completion_policy` | `manual`: preserve native manual completion; suppress already-loaded automatic providers in owned drafts. `off` also suppresses native completion; `user` releases the suppression. Buffer-local `b:wbx_completion_policy` overrides it. |
| `read_status` | 1; existing optional SDK/grant required |
| `reactions` | 1; inline history summaries and bounded visible-message reads; explicit opt-out; pinned internal SDK; writes require explicit commands/consent; existing ready read-status owner/grant required in live mode |
| `reaction_display` | `icons`; `text` uses ASCII labels on separate virtual rows, wrapping to the narrowest visible current-tab history split (including gutters). Presentation only; missing counts remain missing, partial empty observations remain quiet. Invalid values fall back to `icons`. |
| `people_status` | 1; automatic selected-DM header/Spaces cues; native local details on demand; known grants required for provider reads |
| `upcoming_meetings` | 1; public schedule cards with the known meeting grant; also read-only joined-elsewhere observations when the existing `read_status` SDK is enabled. No new device or call action. |
| `spaces_cache` | 1; verified private account-scoped room/unread and separate decrypted received-text/name/reaction display caches; same identity path may restore explicitly saved grouping, never autosaves grouping |
| `threaded_history` | 1 |
| `message_borders` | Editor-dependent; Neovim gutter when supported |
| `images` | auto |
| `image_open` | buffer |
| `image_viewer` | Empty: external viewer requires explicit configuration |
| `attachment_handlers` | Empty |
| `attachment_download_dir` | Current directory |
| `notifications` | Module-owned defaults; previews and sender names on; explicit opt-outs |
| `mark_read_on_open` | 1; still requires fresh authority/endpoint admission |
| `rooms_width` | 30 |
| `compose_height` | 8 |
| `statusline` | 1 |
| `meeting` | display=auto, fallback=editor, headless_demo=0, leave_on_exit=0 |
| `picker` | auto |
| `folds` | 1 |
| `persist_drafts` | 1; private, verified-account local text/format autosave and graceful editor-restart recovery |

This table lists defaults, not unconditional actions. No setting makes writes/
Enter send, grants receipt authority to a cache, installs external tools or starts
media transmission. Selected handlers are still checked at explicit dispatch;
an empty extension dictionary suppresses MIME fallback. `notifications.preview=false`
remains distinct from backend default-false wire consent.
`notifications.sender_names` is independently switchable and effective only with
enabled message notifications/previews; it also enables shared-cache history names.
Supported passive client features now default on at the user's request; explicit
false/0 remains an opt-out. Nothing connects at editor startup. Missing grants or
optional SDK support means unavailable, not automatic installation/reauthorization.
Native clients negotiate the flags explicitly; omitted flags on the lower-level
RPC/engine interface remain false for compatibility. See [defaults/popup follow-up](people-popup-design.md).
Presence appears automatically in a compact selected-DM float, header and Spaces margin signs,
including truthful unknown/unavailable states; no command is needed.
`:WebexPeople` opens a navigable native read-only local snapshot without a lookup;
`r` refreshes local text, `q` returns to the exact origin. Native search/copy,
annotations/promoted buffers and mapping conflicts are preserved. Enter/write
never send or acknowledge. State/late replies do not repaint or focus details.
`:WebexPeopleRefresh` / `WvP` is a separate explicit read; it respects the opt-out,
known capability/grant, provider cache/backoff and snapshot room/session guards.
Visible direct chats also load presence
without being opened. A single engine timer refreshes the selected/visible set
after 60 seconds (or later under Retry-After); no roster scan. Current clients
report up to 128 actually visible direct rows. Verified peers share exact-ID People
batches of at most 85; cold rosters use two continuously working HTTP readers
for the whole reported batch before the status GET, not two-person display turns.
No one-second cold-lookup SLA is claimed.
Neovim presence uses a dedicated two-cell statuscolumn slot after line numbers,
not inline name-area text. The original gutter/click regions are delegated; later
explicit local overrides win. Vim uses native signs. Neither changes buffer text,
undo, other signs or numbering preferences.
Spaces distinguish call 📞, meeting 📹, DND ⛔ and the other supported statuses.
The meeting icon does not imply that Webex disclosed the peer's camera state.
Known stale icons remain neutral while refreshing; expired/unobserved/withheld
statuses show `?`. UI expiry updates only unchanged owned rows, with no I/O.
Same-grant token renewal retains the provider, observations, viewport and timer;
true grant/session/account changes still invalidate. The float never fetches or
focuses; opening native details dismisses it for that selection.
Existing `WmP/WmL/WmR` controls use the independent meeting owner and require
negotiated capabilities; no new option, renderer or media owner is added.
See [editor configuration](editor.md) and [attachments](attachments.md).

`persist_drafts` defaults to true for the user-requested editor-restart recovery.
It stores only local normal/reply text, destination, format and uncertainty under
a verified account/profile; false disables disk autosave. See [drafts](drafts.md).
Mention pickers use Neovim `vim.ui.select` or Vim `popup_menu`; there is no custom
picker color/background option. Native Ctrl-N/Ctrl-P and explicitly invoked
completion functions remain available in owned normal/reply/edit drafts; local
settings survive re-entry and promotion. Automatic provider suppression is local
to owned message drafts, never global. `completion_policy='user'` is an explicit
opt-out; it does not load or configure a provider. Strict legacy suppression is
available with `completion_policy='off'`.
