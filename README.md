# wbx-tui — Webex for Vim and Neovim

Webex messaging in **native editor buffers, windows, modes and undo**. Meetings
use real tmux participant/share panes and one independent media owner, normally
in a side Kitty window, with an editor-terminal fallback. Changing presentation
attaches to that owner; it does not join again. Tmux appearance is **inherited**
by default; engine-themed borders/status are opt-in.

The new native controls, folds, edge paging, geometry and safety changes are
**implemented and offline-validated in isolated builds; not live activated**.
Verification did not replace the active build artifacts or restart the client.
The later [whole-thread/cache/meeting follow-up](docs/thread-cache-meetings-follow-up.md)
is offline-validated separately; the original totals do not cover it.
The [shared meeting-login follow-up](docs/shared-meeting-auth.md) is tracked
separately as well; no change here hot-reloads the running session.
The [Neovim gutter follow-up](docs/gutter-ui.md) preserves existing statuscolumn
renderers; its original missing-Vim record is historical. Later strict gates cover both editors.
The opt-in [local spaces cache](docs/spaces-cache.md) is verified-account scoped,
stale and non-actionable. With unread sync enabled it also keeps
[last-confirmed read/unread flags](docs/persistent-unread.md), always stale on restore.
The authorized [received-data cache](docs/received-cache.md) separately retains
names and recent decrypted message text/reactions across restarts; private files
are plaintext, and restored content is display-only.
Use the [verification index](docs/verification-index.md) for the latest applicable
source/gate boundary, skips and unverified live acceptance; earlier totals remain historical.

Experimental [persistent message reactions](docs/reactions-implementation-plan.md)
are implemented in source, **on by default in the native client, not activated here**. They use pinned
internal SDK interfaces, automatic inline history summaries, explicit exact-message
write consent, verified-own removal and inspection locks. Live counts and service
acceptance remain unverified.

## Install the native plugin

Requires Node **22.12+**, npm, and Neovim or full Vim with `+job +channel +timers`.
No external editor plugins are mandatory. In your checkout:

```sh
npm ci
npm run build
```

**LazyVim:** copy the complete [`examples/lazyvim.lua`](examples/lazyvim.lua)
spec into `~/.config/nvim/lua/plugins/wbx-tui.lua` and adjust `dir`. It uses your
existing loader and preserves your save key/statusline. Do not add another
`require('lazy').setup()` or runtimepath entry. See the
[installation guide](docs/editor.md#lazyvim).

**Plain Vim/Neovim:** use your native plugin directory/plugin manager, or add:

```vim
set runtimepath^=/absolute/path/to/wbx-tui
```

Restart the editor, then run `:WebexHealth`. Loading the plugin and checking
health do not sign in, join a meeting or capture devices. Rebuild after engine
changes and restart deliberately; never source the main autoload into an active
session. Normal/reply draft text, format and unresolved-delivery flags autosave
to private **plaintext** recovery storage by default when account verification
and storage are available. `persist_drafts = false` opts out; export wanted work
before restarting if recovery is disabled/unavailable. Files and sending consent
are never restored. See [draft recovery](docs/drafts.md).

## Try the safe demo

Run **`:WebexDemo`** for local synthetic messaging: no account or network needed.
Use **j/k → Enter** to open a space, **i** in history to compose, and
**Backspace** in history to return to spaces. Native motions, `/` search, undo,
registers, splits and colorschemes remain your editor's own.

In the composer, **Enter inserts a newline; writing never sends**.
**Esc → `<localleader>s`** explicitly sends to the demo only (default local
leader: `\`). Ctrl+s also sends by default outside the LazyVim recipe; set
`send_with_ctrl_s = false` to preserve your save binding.

**`:WebexMeetingDemo`** additionally needs the local meeting prerequisites below.
It renders generated participants/share without joining Webex or capturing
devices. It is not evidence of live media interoperability.

## Essential native controls

| Where | Key / command | Action |
| --- | --- | --- |
| Spaces | j/k, Enter | Browse, then explicitly open a space |
| History | i / Backspace | Compose / return to spaces |
| History | `<localleader>r` | Reply to that message's thread root; never send |
| Composer | `<localleader>R` | Return to the normal draft, retaining reply text |
| Composer, Normal mode | `<localleader>s` / `:WebexSend` | Explicit send |
| Any owned view | `:WebexDestination` | Inspect the draft's bound target/readiness |
| Workspace | `:WebexRefresh`, `:WebexMoreSpaces`, `:WebexOlder` | Refresh / manual paging |
| Global, Normal mode | `<leader>W?` / `:WebexActions` | Effective bindings, send hint and preserved conflicts |
| Workspace | `<leader>Wl` / `:WebexLayoutReset` | Directly reset owned layout preferences; not a submenu |
| History | `<leader>Wt` / `:WebexThreadFold` | Toggle the whole loaded thread; body folds stay nested |
| History | `<leader>Wg` / `:WebexLatest` | Locate the canonical newest message, without opening folds |
| History | `<leader>Wab`, `<leader>Wvb` | Toggle/list **local session-only** bookmarks, not Webex Flags |
| History → plain composer | `<leader>Waq`, then `<leader>Wai` | Capture/insert same-space copied quotation; never send |
| History / selected space | `<leader>Wvh`, `<leader>Wvg` | **Loaded-only** thread / file messages; `:WebexContent links` or `media` also available |
| Selected space | `<leader>WvC` / `:WebexCards` | Loaded card-text messages; Enter navigates to history, never runs a card action |
| History | `<leader>WvH` / `:WebexThreadFetch` | Explicit bounded remote thread read; `r` refresh, `]p` next page |
| Selected space | `<leader>Wvi` / `:WebexMentions` | Selected-space API @me results, not a global inbox or verified @all coverage |
| Current remote thread | `<leader>WaR` / `:WebexQueryReply` | Reuse exact-root reply draft; never send or overwrite native text |
| Messaging session | `<leader>Wnp` / `:WebexDirectory [name prefix]` | Explicit bounded directory prefix lookup; Enter prepares exact-person DM, never sends |
| Directory/member row | `<leader>WnP` / `:WebexProfile [exact person ID]` | Explicit textual profile; `r` refreshes the same ID, no avatar/presence lookup or writes |
| Messaging session | `<leader>WvT` / `:WebexJoinedTeams` | Explicit bounded joined-Team query; Enter filters loaded spaces only, never joins or fetches rooms |
| History | `o` / `<leader>Wo` / `:WebexAttachment` | Open attachment: native text/image view or configured handler |
| History | `<leader>WA` / `:WebexAttachmentDownload` | Choose a new destination and save original bytes |
| Meeting cards | Enter / `:WebexUpcoming` | Explicitly join the selected fresh card / refresh discovery |
| Selected direct space | Automatic compact People float/header/Spaces icons; `<leader>Wp` / `:WebexPeople` inspects | Navigable native People snapshot; no lookup; `r` local refresh, `q` exact-window return |
| Messaging | `:WebexDisconnect` | Disconnect messaging, retaining drafts; not meeting leave |
| Notifications | `:WebexNotificationsTest`, `:WebexNotificationsMute [minutes]`, `:WebexNotificationsResume` | Test local delivery / mute (30 min default) / resume |
| Meeting | `:WebexMeetingKitty` / `:WebexMeetingEditor` | Present the same call |
| Meeting | `:WebexMeetingDetach` / `:WebexLeave` | Detach view / explicitly end call |

These [messaging additions](docs/messaging-parity-implementation.md) require
an updated backend; local/loaded views and bounded public reads are labeled
separately. They do not establish full server parity or live service acceptance.
Supported Adaptive Cards 1.0–1.3 show a bounded, read-only text subset in history.
Hidden content, input values, images/URLs and all card actions remain inert or
omitted, not automatically opened or submitted.

Closing the editor/view **detaches by default**; it does not prove sending
stopped. Inside managed meeting tmux panes, q/Escape/Ctrl+C explicitly leave.
If a viewer loses its control socket, media state is **unknown**, not ended;
quitting that disconnected view only closes the view. Reattach or leave explicitly.
Native commands/keys and compatibility-client keys are different interfaces.
Full commands, mappings, options and hooks: [editor guide](docs/editor.md) and
`:help wbx-tui` ([help source](doc/wbx-tui.txt)).
The global Normal-mode family defaults to `leader_prefix = '<leader>W'`;
`mappings = false` disables it along with buffer defaults. Existing conflicting
maps are preserved. Automatic paging follows deliberate edge navigation, never
initial rendering; manual paging commands remain retry controls after errors.

## Live prerequisites — choose the feature

| Feature | Additional requirements |
| --- | --- |
| Native REST messaging (`:Webex`) | Operator-owned Webex OAuth integration, exact loopback redirect, approved room/message read/write scopes, system browser (`xdg-open`), membership of the chosen spaces |
| Synced unread titles / receipts | `read_status` defaults true; existing optional Node SDK install (`npm run install:read-status`) and approved `spark:all` including `spark:kms` required; nothing installs automatically |
| People presence | `people_status` defaults true; existing approved `spark:people_read` and `spark:memberships_read`, or applicable `spark:all`; organization/status-sharing policy may withhold presence |
| Joined Teams | Already-known granted `spark:teams_read` or `spark:all`; explicit read only, no grant expansion or Team join |
| Upcoming meeting cards | Existing granted `meeting:schedules_read` (not `spark:all` alone), supported Webex account/API coverage; `upcoming_meetings = false` disables discovery |
| Already joined elsewhere | Read-only, partial active-call observations via the existing metadata SDK (`spark:all`); requires both `read_status` and `upcoming_meetings`; no join/transfer/leave action. [Coverage and limits](docs/upcoming-meetings.md#joined-elsewhere-follow-up-2026-11-20) |
| Meeting demo | Linux, tmux, Chrome/Chromium; Kitty/display for pixels or native editor terminal support (Vim `+terminal`) for blocks |
| Live meeting (`:WebexMeeting URL`) | Meeting-demo requirements **plus `npm run sdk`**, approved SDK meeting authorization, an authorized meeting and any lobby/org-policy admission |

Default engine config: **`~/.config/wbx-tui/config.json`**, respecting
`XDG_CONFIG_HOME`, `WBX_CONFIG` and explicit `config`. Native messaging requires
`oauth.clientSecret` in that current-user-owned, owner-only JSON (`chmod 600`),
never in Lua/Vimscript, buffers or RPC. Compatibility CLIs can instead prompt
privately. A configured client secret **is persistent plaintext**; access/refresh
grants remain memory-only. Meetings reuse a sufficiently authorized connected
login through a private shared renewal owner, without another sign-in. Standalone
meeting login remains available when messaging is disconnected. No OpenCode/MCP
credentials are imported. See [shared meeting authorization](docs/shared-meeting-auth.md)
and [OAuth/security](docs/oauth.md).

`npm run sdk` downloads the checksum-pinned **browser** SDK into `vendor/` for
live meetings. It is **not** needed for REST messaging or either demo, and does
**not** install the separate unread-status Node SDK. Media transmission starts
off: microphone/camera/share need explicit intent, trusted browser confirmation
and permission. Local preview is separate and opt-in.

Unread sync can issue a receipt on a successful explicit open of an unread space
at the newest displayed endpoint. For inspection without automatic receipts, set
**`mark_read_on_open = false` before connecting**. Polling does not acknowledge
messages. Both receipt paths require the known latest endpoint's complete,
unfolded body to be displayed; SDK receipt transport is one-shot, including retry
and redirect guards. Review the [receipt policy](docs/editor.md#recent-spaces-and-webex-unread-status)
before enabling it; ordinary messaging works without this optional SDK.

## Capabilities and limits

- [Client-local sections and filters](docs/local-sections-design.md) group loaded
  spaces without changing membership, drafts or selected destination. Commands
  support create/rename/remove/assign/order/collapse; filters are all/unread/direct/
  group/one section. Persistence is explicit and requires an already verified
  account/profile. These are not synchronized native Webex Sections or Teams.
- [Notifications](docs/notifications.md) default to your editor's existing
  `vim.notify` integration (Snacks/Noice/nvim-notify) or native Vim messages.
  Selected-space incoming messages and fresh upcoming-meeting reminders are
  deduplicated; desktop/hybrid delivery is opt-in. Short message previews are on
  by default; set `notifications.preview = false` to hide message text.
  Other spaces use confirmed message-created events from the already-enabled
  unread SDK, independently of unread flags/timestamp changes. No new grants,
  history reads, receipts or joins. Previews include other spaces and show only
  up to 160 sanitized message characters, without a generic label; full long bodies
  are not forwarded. Existing explicit `preview=false` settings are respected.
  Sender names default **on** for `Alice: excerpt` and shared-cache history labels,
  using bounded People reads only with an existing grant. Set
  `notifications.sender_names = false` to opt out.
  `preview=false` hides sender names too; unknown names stay excerpt-only.
  See the [sender-name contract](docs/sender-names-design.md).
  Native completion also supplies `WvP` selected-peer refresh and existing
  meeting `WmP/WmL/WmR` source-slot/layout/auth choices, with time/coverage and
  unknown-state disclosure. See [control contracts](docs/native-meeting-design.md)
  and the [verification ledger](docs/verification-index.md). No installed editor,
  configuration or live service is activated by these source changes.
  See the [global-event correction and limits](docs/global-message-events.md).
- `spaces_cache = true` is the native default (Vim: `1`) for a faster first
  spaces display after sign-in. Cached titles/order are muted and browse-only;
  fresh spaces load independently of unread-sync startup. With `read_status = true`,
  last-confirmed unread/read booleans are also retained, with their own expiry and
  no receipt authority. A separate bounded cache now stores names and recent
  decrypted text/reactions as private plaintext. No credentials or mutation handles
  are stored. `:WebexCacheClear` clears both current-profile entries.
  Set `spaces_cache = false` to opt out; existing identity grants are required.
  See [privacy/bounds](docs/spaces-cache.md).
- Native replies and separate normal/thread drafts are supported. Replies group
  beneath chronological roots, chronological within each thread;
  `threaded_history = false` retains the global timeline. **No dedicated thread pane.**
- Last-confirmed unread/read flags survive sync outages as labeled, session-local
  stale cache. Health uses the footer/statusline, not the spaces header. Stale
  status cannot authorize receipts or reset failed automatic attempts.
- `:WebexUnreadStatus` inspects the highlighted **Spaces row**, not the open
  destination: published server read/unread/unknown state and freshness, cached
  metadata, session-only local override and list emphasis are separate text.
  This local snapshot works with syntax off and on retained offline rows; it
  never opens, fetches or acknowledges a space, even with `mark_read_on_open=1`.
- Space discovery is tracked independently of `spaces_cache`. Pending, failed
  or unverified discovery is not “No spaces found”; that message requires a
  successful empty list with no next page. On failure, use `:WebexRefresh` in
  Spaces to retry explicitly. Existing rows are retained; no automatic retry,
  opening or receipt is implied.
- A successful explicit space open clears its **local unread emphasis immediately**,
  even without a receipt/status update or with `mark_read_on_open=false`. Server
  flags remain separate; newer messages or fresh SDK activity restore emphasis.
  Local overrides are session-only and never become receipt authority or cache data.
- Re-entering the currently loaded space resumes its native reading position;
  it does not clear history, refetch it or issue a receipt. `:WebexLatest` can
  explicitly reload an endpoint outside the bounded history window.
- [Native performance](docs/performance.md) separates local projection/syntax work
  from network latency, with an optional isolated reproducible benchmark.
- Received image attachments have [bounded inline previews](docs/messaging-media.md):
  real images on supported Neovim/Kitty-placeholder terminals, Unicode braille
  elsewhere. An existing ImageMagick executable supplies raster decoding.
  `images = 'unicode'` forces the fallback; `images = false` disables automatic preview reads.
  The general open action (or image-only [`:WebexImage`](docs/image-detail.md)) reads original attachment
  pixels (up to 1600×1200, no upscaling) into a separate
  buffer; `:WebexImageExternal` uses an explicitly configured graphical or terminal
  tool. Opening never sends a receipt. Larger originals are fitted to that bound;
  they are not enlarged from the inline thumbnail. This correction requires a
  backend rebuild and draft-safe editor restart; nothing updates a running session.
- [Attachments](docs/attachments.md): **`<leader>Wo` / `o` in history** now opens
  any attachment via `:WebexAttachment [index]`: text/source in a new native
  buffer, images in their native viewer, or an explicitly configured extension/MIME
  handler. `:WebexAttachmentDownload [index]` prompts for a new destination and
  saves original bytes without overwriting existing files. No automatic OS opener.
- Up to three imminent API-visible host/invitee meetings appear above spaces.
  Cached cards are not joinable, and coverage is not a complete calendar.
- Plaintext sends are limited to 1,000 UTF-16 code units. Normal/reply drafts use
  default-on private plaintext recovery when available (`persist_drafts = false`
  opts out); ambiguous delivery retains text and blocks that room until explicitly
  resolved. Storage warnings mean native text may still need explicit export.
- [Outgoing files](docs/uploads-design.md): `:WebexAttach [path]` stages one stable
  local snapshot (10 MiB); `:WebexSend` explicitly sends plain text/file, a file
  alone, or **Markdown plus one file** after `:WebexFormat markdown` with an
  updated backend. Mention targets and @all retain separate send-time consent.
  Eight references/20 MiB total, no automatic POST retry, queue or remote-URL
  upload. Removal, Enter and writes never send; disconnect retains stale metadata.
- [Own-message actions and rich sends](docs/message-actions-design.md):
  separate edit buffers, explicit submit/delete and disclosed non-atomic conflict
  confirmation. Plaintext stays default; Markdown and real mentions are deliberate,
  with a separate @all confirmation and bounded selected-room roster.
- [Conversations and Server Teams](docs/conversations-design.md):
  recipient-bound DM drafts (`:WebexDirect`), separate confirmed group creation/
  invitations, selected-room membership actions and lazy Team labels/filters.
  Recipient drafts also support explicitly negotiated Markdown, one file, or
  Markdown plus one file using existing Format/Attach/Send commands. First Send
  confirms possible persistent-DM creation; no placeholder or automatic retry.
  `:WebexRenameSpace [title]` confirms title-only standalone-group rename;
  Team/direct spaces are excluded, `Wnr` stays Remove Member. Fresh permissions
  and exact ACK evidence are required; no automatic mutation replay.
  `:WebexDescribeSpace` prepares a separate native description edit;
  `:WebexDescriptionSubmit` confirms replacement with the required title echo
  and disclosed concurrent-title/description races. Cancel retains text/undo;
  clearing via Submit and Team/direct settings remain excluded. Enter/write never submit.
  Separate `:WebexDescriptionClear` requires an unchanged private description
  preparation and explicit destructive consent. It uses the documented
  single-space sentinel; only an explicit empty ACK confirms, never missing/
  null/echoed space. Native old text/full undo remain; public spaces are excluded.
  Named-only `:WebexLockSpace` / `:WebexUnlockSpace` confirm bounded moderation
  transitions: creator-only lock, fresh-moderator unlock, private standalone
  spaces only. Required title echo and role/race consequences are disclosed;
  transition ACKs never infer ongoing moderator authority.
  `:WebexAnnouncementOn` / `:WebexAnnouncementOff` confirm mode changes in an
  already locked private standalone space. Fresh moderator proof is required;
  consent discloses Webex's participant notification, posting exceptions and
  title-echo race. Neither command implicitly locks or changes roles.
  Named-only `:WebexDirectVisibility` reads your own selected direct-membership
  API hidden flag; missing means Not provided. It is not a product Hidden list,
  Favorites/server mute sync or a preference writer. `r` explicitly rereads and
  `q` returns without changing drafts, local grouping or notifications.
  Named-only `:WebexRenameTeam [name]` uses a fresh exact `:WebexJoinedTeams`
  row and rechecks Team moderator proof before one name-only PUT. It is not
  a Room rename, Team-membership/role writer or atomic compare-and-set.
  Wnr remains Remove Member; Team-list Enter remains a loaded-space filter.
  Separate named-only `:WebexDescribeTeam` prepares a private plain metadata
  buffer from that exact joined row; `:WebexTeamDescriptionSubmit` confirms a
  changed nonblank replacement with the required unchanged name echo. Concurrent
  description loss AND name echo overwriting a concurrent rename remain risks.
  `:WebexTeamDescriptionCancel` retains native text/full undo. The eight-active
  preparation budget is shared with Room descriptions. No clearing/sentinel,
  role/preference write, Enter/write submission or main-state/cache publication.
   `<leader>Wnd/ns` prepare a DM/create a group, `Wni/nr/nl` invite/remove/leave,
   and `Wvp/vt` open participants/partial Server Teams. `:WebexActions` /
   `<leader>W?` opens the full contextual native reference with effective keys,
   prerequisites and preserved conflicts. `Wa`, `Wu`, `Wn`, `Wv` complete the
   existing action families; the `Wm` meeting keys keep their original meanings.
- No native personal Sections synchronization or public in-meeting chat.
  Meeting-pane space chat sends to a persistent **space**, whose
  members may differ from the meeting attendees.
- Existing Webex personal Sections are not exposed by the pinned public SDK or
  any validated approved provider found in this review. Client-local manual
  grouping is distinct, never advertised as native synchronization.
  See the [native Sections research](docs/native-sections-research.md).
- Approved experimental [native reactions](docs/reactions-implementation-plan.md)
  default on, with `reactions=0` / Lua `reactions=false` as explicit opt-out.
  Verified nonempty groups appear beneath exact loaded messages; empty partial
  observations are quiet, not evidence of zero. Successful snapshots refresh
  after five minutes. Returning to an unchanged loaded message in the same
  session/source reuses its bounded local observation instead of waiting for
  another room's read. Name/image-preview changes do not invalidate reactions.
  Updated backends paint completed summaries immediately, without waiting for the
  slowest message in the same bounded batch.
  Recoverable failures mute retained data without a `cached` suffix;
  cached display never authorizes writes. `reaction_display='text'` (Vim/Lua) opts into ASCII labels,
  one group per virtual row with narrow-split wrapping; default `'icons'` keeps
  emoji badges and emoji-plus-label pickers. Text mode also applies to pickers.
  Supplied counters, including `1` (`♥️ 1 (you) | 👍 4`), remain visible; unknown
  totals add no placeholder. With no supplied total, `♥️ 1 (you)` shows your one
  confirmed contribution, not a complete aggregate; details still identify the
  unknown total. Your reactions have an explicit `(you)` marker
  as well as a distinct highlight. Passive loading/errors add no unavailable
  footers; details remain in `:WebexHealth`. `:WebexReactions`
  (**`<leader>Wal`**) lists reactions and who sent each in a searchable read-only
  view. It shows names only (no person IDs), and closes when leaving that space;
  annotated/promoted copies are retained. Unavailable names remain unknown.
  `:WebexReactionAdd`, `:WebexReactionRemove` and `:WebexReactionResolve` remain
  explicit guarded operations. Add opens its picker immediately; preparation
  waits for physical read admission, then the chosen emoji is sent without a
  second confirmation or first-use inspection. `:WebexReactionUnresolved` opens a read-only,
  editor-memory snapshot of pending/unknown exact targets and request IDs, even
  offline; it never unlocks or retries them and is not persisted across editor
  restart. Only `thumbsup`, `heart`, `celebrate`, `smiley`,
  `haha`, `confused` and `sad` are supported. Live counts/full vocabulary and
  cryptographic/deployment acceptance remain unverified; source/offline
  acceptance does not imply running-editor activation or public API support.
  Message-action keys are `<leader>Wal` List, `<leader>Waa` Add, `<leader>War` Remove own, and
  `<leader>WaI` Resolve uncertain outcome. Only a retained unknown previous write
  requires checking Webex and explicit resolution; ordinary Add/Remove do not.
  Confirmed own changes are cached and painted immediately, without switching
  spaces or waiting for summary propagation. A confirmed new own Add increments
  the last known count; already-owned totals and unknown counts stay unchanged.
  `(you)` identifies your reaction without a different background.
- **Who read a message:** Opening a group or person discussion loads one
  snapshot for the latest loaded message. `:WebexReadBy` / **`<leader>Wav`** shows centered
  reader information at the end of the feed: `Read by Alice` in person discussions,
  or `Read by 2 [+]` in groups. **`:WebexReadByToggle` / `<leader>WaV`** folds the
  group names locally; no message text is repeated. Repeat the inspection command
  on that message to refresh explicitly. Existing SDK read-watermark events update the same
  footer, coalescing bursts without polling. Live evidence uses member read-through markers,
  not presence or exact read times; missing receipts never mean “unread”.
  No cursor-triggered fetch, polling, automatic paging, new SDK connection or
  read receipt. Respects `read_status=0`; Wnr still removes a member.
  [Read-by behavior and evidence limits](docs/message-readers.md).
- Native Vim/Neovim hooks/plugins are usable. The standalone TUI also supports
  explicitly trusted executable `--init` modules; it has **no plugin package
  installer or sandbox**. JSON stays declarative.
- Native message/thread body folds use `za`/`zo`/`zc`; `folds` defaults true, with
  `b:wbx_folds = 0` as a per-buffer opt-out. History stays on bounded native
  Markdown syntax; optional installed Tree-sitter is used **only for composers**.
- Neovim 0.10+ uses a subtle message gutter after the numbers, delegating your
  existing statuscolumn, signs and click handlers. `message_borders = 'rails'`
  restores the old in-text rails; Vim/older Neovim keep rails. Native local
  overrides win. This editor-only change needs a draft-safe restart, not a
  backend rebuild. [Appearance and compatibility](docs/gutter-ui.md).
- Edge paging is bounded at 500 spaces / loaded messages, with clear limit/error
  states. Per-window message anchors preserve readers across updates/prepends;
  geometry remembers manual sizes through shrink/grow. Mixed tabs use owned
  fixed-size flags only, never corrective resizing of shared split boundaries.
- **Selected-direct presence defaults on** and passes offline backend/helper
  checks. The compact People float, DM header and Spaces icons appear automatically, without an extra
  inspection lookup or command. `:WebexPeople` / `<leader>Wp` opens a read-only
  native split with full details, native search/motions/copy, `r` local snapshot
  refresh and `q` exact-window return. Opening/refreshing this text never fetches;
  `:WebexPeopleRefresh` is the separate explicit provider read. Callbacks never
  repaint/focus the snapshot; annotations/promoted buffers are retained.
  Enter/write never send or acknowledge. Visible direct chats load presence
  without being opened. All visible direct rows (up to 128) receive paced turns
  through one small shared identity window, not just eight rows near the cursor.
  They become refresh-eligible after 60 seconds, subject to provider backoff and
  viewport size. Two peer lookups start together per batch, with a two-start/
  two-second rolling budget rather than a gap within the pair. Spaces distinguish
  call 📞, meeting 📹 and DND ⛔. Known stale icons stay neutral while refreshing;
  expired/unobserved/undisclosed statuses show `?`. Same-grant token renewal keeps
  observations and the viewport/timer. Manual Busy may be reported as Unknown by the REST API.
  Set `people_status = false` to opt out; no installed config, grants
  or live session is changed by this source update.
  Unknown/inactive is not offline. **Custom-status text is unsupported** by the
  public REST provider used here. See [people status](docs/people-status.md) and
  [source/validation status](docs/editor.md#source-implementation-and-validation-status).
- **Drafts survive graceful editor restarts** via account-verified private local
  storage (`persist_drafts = false` opts out). Restoring never sends or restores
  attachment/send authority. See [draft storage](docs/drafts.md) for limits and
  failure handling. Mention choices use your native editor picker/theme, message
  composers suppress completion, and consecutive mentions are separated safely.

Prior evidence includes one approved diagnostic reconnect with mark-on-open
disabled and aggregate-only styling observations. It does **not** establish live
message/receipt/thread delivery, OAuth renewal or meeting/media acceptance.
Those checks remain **NOT RUN** in the [live acceptance record](docs/live-acceptance.md).
Historical synthetic results are in [editor validation](docs/editor-validation.md).
Current integrated offline evidence and remaining live-acceptance limits are in
[implementation progress](docs/implementation-progress.md).

## Architecture and references

The editor owns buffers, drafts and focus. A dedicated Node RPC backend owns
messaging REST/OAuth; an optional Node child owns unread metadata. An independent
tmux owner runs the browser media worker and serves native viewer processes.
See the [source/runtime map](docs/architecture.md),
[editor protocol](docs/editor-protocol.md) and [pinned SDK boundary](docs/sdk-boundary.md).

| Reference | Contents |
| --- | --- |
| [Native user guide](docs/editor.md) | Install, safe demos, options, integrations, commands |
| [OAuth](docs/oauth.md) | Grants, prerequisites, secret handling and retention |
| [Standalone messaging](docs/messaging.md) | Supported compatibility TUI, distinct keys and bounds |
| [Meeting engine / CLI](docs/meeting.md) | Native panes, media controls, rendering, transport, engine checks |
| [Engine configuration / trusted init](docs/configuration.md) | JSON settings and standalone executable extensions |
| [Optional unread SDK](optional/read-status-sdk/README.md) | Separate install, scopes, privacy, receipt boundaries |
| [People presence](docs/people-status.md) | Selected-peer snapshots, grant/identity checks, custom-text blocker |
| [Messaging feature plan](docs/messaging-feature-plan.md) | Phase 1 sender names verified offline; later delivery order, capability findings and approval gates |
| [Validation](docs/editor-validation.md) / [live acceptance](docs/live-acceptance.md) | Historical offline evidence / authorized tests still to perform |
| [Implementation progress](docs/implementation-progress.md) / [plan](docs/implementation-plan.md) | Current offline evidence and live limits / requirement ledger |
| [Review](docs/improvement-review.md) | Historical measurements and decisions |

Baseline developer gate: `WBX_STRICT_EDITORS=1 npm run verify:plugin` (requires
full Vim and Neovim; delegates to `npm run verify:isolated`, building only a preserved
working-tree copy). The gate includes core, native/drawn, restart, SDK/cache,
docs/help and candidate bundle checks, with installed build-tool version/identity
evidence. It never repairs dependencies, refreshes checkout bundles or activates an
editor. `python3 scripts/verify-isolated.py --focused` is an affected tier, not full
acceptance. Earlier baseline runs
passed in staged copies; the gutter follow-up records missing-Vim skips rather
than claiming a new strict two-editor pass. The active build was not replaced.
Graphical/media suites are separately opt-in;
see the validation references for their scope and prerequisites.

Read-only bundle check: `npm run verify:bundles`. It compares all five generated
bundles and their source maps with **two isolated builds of the current source**.
It does not rebuild/replace checkout `dist/`, install dependencies, load editor
configuration or start Webex. Missing, stale, changed or unexpected artifacts
fail the check. Historical verification snapshots remain historical evidence,
not the expected output hashes for later source revisions.
