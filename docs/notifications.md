# Message notifications and meeting reminders

## Current suppression policy

The user's later correction supersedes the same-account eligibility examples
below: **never notify for the authenticated user's own messages**, regardless of
which client sent them. The registered SDK device UUID supplies canonical self
identity even without the optional `me` plugin. Modern selected-space alerts use
the same actor-aware creation feed, not an unclassified REST-history echo.

Per-space `MESSAGE_NOTIFICATIONS_OFF`/`IGNORED` tags survive the pinned SDK's
otherwise lossy room projection as one boolean, never raw tags. Unknown live
preferences suppress alerts until known. Muting consumes queued/held alerts;
unmuting does not replay them. Mention-only room settings conservatively suppress
generic message notifications; this does not invent mention eligibility.
No server preferences are changed and no new provider lookup is introduced.

The [global-event follow-up](global-message-events.md) supersedes the
[unread-activity notification workaround](local-unread.md): current backends
forward actual public message-created events independently of room unread flags.
The original gate below is historical, not evidence of this new path.

Status: implemented and staged-regression verified; not activated.
No active editor/configuration/build or
account session was changed. No real desktop notification, Webex connection, grant,
receipt, meeting or device test was performed. Preserve drafts before rebuilding
and restarting explicitly; never hot-source the coordinator. The backend forwards
bounded global message-creation evidence and, with negotiated session consent,
an optional sanitized excerpt/name; never full long bodies, files or raw author identities.

## Delivery and controls

The default is **enabled, editor-only**, using the user's current `vim.notify` in
Neovim. Existing Snacks/Noice/nvim-notify overrides therefore work without loading,
installing or setting up another plugin, or replacing `vim.notify`. Plain Vim or
a failed integration uses a native non-focusing message. This feature never moves
the cursor, opens a workspace, rewrites a draft, joins a call or posts a receipt.

In existing Lua/LazyVim options:

```lua
notifications = {
  mode = 'editor', -- 'desktop' or 'hybrid' are explicit system-tool opt-ins
  messages = true,
  meetings = true,
  preview = true, -- default; false hides message text AND sender
  sender_names = true, -- default; false opts out of previews/history names
  titles = true,
  suppress_visible = true,
  meeting_minutes = { 5, 0 },
},
```

Vim equivalent:

```vim
let g:wbx_tui.notifications = {'mode': 'hybrid', 'messages': 1, 'meetings': 1,
      \ 'preview': 1, 'sender_names': 1, 'titles': 1, 'suppress_visible': 1, 'meeting_minutes': [5, 0]}
```

Set `notifications=false` / `0` to disable, or `enabled=false` inside the dictionary.
Unknown keys, malformed booleans/mode/argv or lead times fail closed; health reports
`invalid=1` without copying the invalid data. Up to four distinct integer lead
times, 0–30 minutes, are allowed; `0` means start and `{}`/`[]` (Lua/Vim list) means
no reminders. Message/meeting toggles are independent. Defaults remain active when
the option is absent; no installed configuration is rewritten.

- `:WebexNotificationsTest`: synthetic local alert through the configured route.
  Does not start the backend, connect, fetch, join or capture. Respects disable,
  mute and rate limits.
- `:WebexNotificationsMute [minutes]`: 1–1440 minutes, default 30. Clears pending
  alerts, stops an owned active notifier, consumes events while muted, and does
  not replay them on resume. Already displayed OS notifications cannot be recalled.
- `:WebexNotificationsResume`: resume future notifications, not backlog.
- `:WebexNotifications`: native choice menu (`vim.ui.select` / Vim `popup_menu`),
  using the user's UI provider rather than plugin-owned styling. Escape cancels;
  stale/superseded callbacks cannot mute, resume or test. This is local control,
  not Webex account DND, and opening the menu performs no RPC.
- `:WebexHealth`: settings, counts, active/queued state, focus, muting, last provider
  and sanitized reason; no titles, snippets, IDs, paths, custom argv or tool errors.

## System tools and privacy

`mode='desktop'` always tries a system notifier; `mode='hybrid'` does so only after
the editor reports `FocusLost`. Focused or unknown-focus editors use the editor
route. No terminal focus mode or multiplexer option is enabled to obtain events;
terminals/UIs that never report focus loss cannot route hybrid notifications to
the desktop automatically.

Detection uses installed `notify-send` when an existing DBus/display-session hint
is present, then installed `terminal-notifier`. Missing/failed/timed-out tools fall
back to the editor. Linux/macOS paths are supported; other systems retain editor
delivery unless a custom command is configured. Exit success means **submitted to
the tool**, not proof that an OS displayed it through DND/lock-screen policy.

For another trusted, short-lived notifier:

```lua
notifications = {
  mode = 'desktop',
  command = { '/absolute/path/to/notifier-wrapper', '--my-option' },
},
```

The title and body are appended as **two literal arguments**; no shell strings,
substitution, install, implicit opener, click callback or action is added. The
command replaces discovery. Each helper gets a two-second deadline; native job
admission stays held until it actually exits. Only that owned helper is stopped;
cancel/disconnect also retain that admission across new sessions and explicit
notification tests, while revoking fallback, success accounting and replay.
user-supplied wrappers/descendants are trusted, not sandboxed or broadly killed.
Tool stdout/stderr never enter editor logs or status. An uncertain timeout can
produce an editor fallback even if the OS already received the desktop alert;
no retry of the system command occurs.

Message previews and known sender labels default **on**, without a “New message”
prefix or count (including coalesced batches). Set `preview=false` to hide
message text and sender; messages with no usable text remain generic. Unread/meeting alerts
retain their existing labels. Space/meeting names appear in the title by default;
set `titles=false` for generic “Webex” titles too. Excerpts include up to 160
sanitized plain-text characters. Set `sender_names=false` for excerpt-only alerts;
controls, newlines and unsafe bidi/invisible marks
are removed. Known `notify-send` markup is escaped. Preview/name settings are
rechecked at dispatch, so turning them off also protects queued events. OS or
plugin histories and custom tools can retain their content; this is not encrypted
or private from the user's selected notifier. No notification log is written by
the plugin.

This also covers **other spaces** with an updated backend. For example,
`notifications = { mode = 'hybrid' }` uses the default-on preview setting. The native
client negotiates `notification-previews` and explicitly passes session consent
to the existing SDK worker; with previews off, no off-space excerpt crosses worker
IPC. Only the first 160 Unicode characters of bounded plain text are eligible,
never full bodies, HTML/Markdown fallback, files or author data. No extra fetch.
Attachments without text remain “New message”. Startup consent is fixed for that
session: changing it requires an explicit new session, not an automatic reconnect.
Turning the UI option off still hides already-queued excerpts immediately at
dispatch. See [excerpt contract and verification](notification-previews.md).

### Optional sender names

`notifications.sender_names=true` (Vim: `1`) is now the native default for an
explicitly started session's `Alice: excerpt`; set false/0 to opt out. It is
effective only with enabled message notifications and previews. The same flag enables display names in loaded
history; it does not enable presence. Missing grant/name leaves existing history
labels and excerpt-only alerts, never a manufactured email/ID prefix.

`sender-names-v1` negotiates a separate `senderNames` flag (omitted RPC flags still
default false; the native client explicitly requests true by default). Older
backends receive no unknown flag. Only known `spark:people_read` or `spark:all`
permits bounded known-person GETs; no new grants, reauthorization, roster scan,
avatar loads. Default sessions may make bounded known-person reads under the
existing grant; explicit opt-out prevents enrichment. The engine shares one
memory-only directory across loaded history and fresh events. Raw sender IDs stay
Node-private; editor events carry only validated, consented names.

Lookup never delays a creation alert. Only an exact matching **queued,
undispatched** event can gain a name; coalescing replaces sender/excerpt together.
Late lookup results never replay or update a dispatched alert. Privacy is
rechecked at dispatch and fallback; an already-submitted OS alert/tool argv
cannot be recalled. Names/excerpts never enter persistent caches or health.
See [budgets, lifetime and offline evidence](sender-names-design.md).

## Message coverage and safety

Outgoing uploads may outlast the source's 30-second freshness window. Legacy
history without an actor-aware feed retains its bounded pending-send hold:
64 candidates for at most 90 seconds. Modern self events are suppressed outright,
and modern REST-history echoes never become alerts. Mute, disable,
privacy, membership/cache status, visibility and disconnect can revoke delivery.
No timestamp/count is refreshed, and unrelated off-space events stay immediate.
Recipient-first DM sends use the same native hold while `directPending:true`;
their exact `direct.delivery` precedes room publication/release. Leaving a room
revokes its queued/held alerts. See [F5 contract](conversations-design.md) and
[upload ordering](uploads-design.md#notification-ordering). The older short-send
withholding behavior below applies to ordinary room-bound plaintext sends.

The observer uses only validated, already-loaded selected-space history. An initial
fill, room re-entry, explicit reset, older-page prepend, changed content/image,
repeat poll or recovered unknown timestamp never becomes a “new message”. A new
ID at/after the observed message-time watermark can notify; equal-time IDs are
deduplicated separately with a bounded saturation guard. Messages lacking usable
UTC timestamps cannot safely notify. Each poll's new messages are grouped, and
nearby queued batches for the same room are coalesced rather than producing floods.

Focused readers viewing the complete unfolded latest message are suppressed;
composers, hidden/history-away views or unfocused editors are not. Suppression
consumes events and cannot acknowledge anything. Existing canonical endpoint,
fold, ownership and receipt checks remain unchanged. Without terminal visibility
evidence the observer does not assume the user read a message.

Locally successful sends carry the exact acknowledged `messageId` in `delivery`;
it arrives before the resulting state update. No author/body heuristics or extra
people/me API is used. The bounded 256-ID exclusion set prevents local-send alerts
without dropping simultaneous incoming messages. Earlier backends lacking this
field conservatively baseline one post-send batch, possibly missing simultaneous
incoming messages; rebuild/restart for exact exclusion. Same-account messages
from the native Webex client or another device **do not notify**, following the
user's later correction. SDK device self identity requires no additional lookup.
Other-account events are not delayed by a pending send.

Other spaces use **confirmed public SDK message-created events** from the existing,
already-enabled `read_status` worker. Unchanged activity, `unread=false`, already-true
flags or unavailable per-room read status cannot discard an actual fresh creation.
Events are deduplicated, grouped per space and coalesced through the normal queue;
internal counts represent observed distinct creations, not an unread total, and
are not added to preview text. Off-space excerpts require the negotiated session
consent above (sent by default when enabled). All self-authored messages are
excluded, and muted or unknown-preference live rooms cannot deliver alerts.

Neither REST `lastActivity` nor SDK unread metadata fabricates a message. Current
backends suppress metadata-derived notification fallback to avoid double alerts
when reconciliation follows a creation. Older backends without `messageEvents`
retain the historical unread-transition/activity fallback. Mark-unread alone is
therefore no longer a message notification with current backends.

The SDK's **existing** public listener performs a message GET before emitting its
created event. The worker discards full bodies/files, optionally keeps
a consented sanitized excerpt and independently consented sender ID for the
engine's name directory, and adds
no request, history fetch, SDK opt-in, scope, receipt, room select or reconnect.
Only listed, membership-validated/non-cached spaces qualify. Initial/replayed/old
events, duplicates, disabled/muted intervals and recovery backlog stay quiet.
Worker/source failures still require explicit recovery; no receipts are retried.
With the SDK disabled or its event stream unavailable, selected-space REST polling
remains available, but off-space delivery is not guaranteed. See
[global event evidence, diagnostics and limits](global-message-events.md).

## Meeting timing and lifecycle

Defaults are **5 minutes before and at start**. Only current `ready` discovery
cards with nonfuture `observedAt` younger than 60 seconds qualify, including cards
without a join link. Fresh partial results can remind their visible valid cards;
they do not establish complete calendar coverage. The source remains the existing
three API-visible host/invitee current-series cards, not a separate calendar feed.

One local one-second timer runs only with enabled reminders and nonempty cards;
it never refreshes a provider. The existing discovery/refresh mechanism must supply
freshness. Duplicate `(meeting ID, start, lead time)` phases are consumed once per
connection. Late discovery coalesces already-due lead times, and start alerts are
at most 60 seconds late. Rescheduled starts have new keys; removed/stale/expired
occurrences invalidate queued alerts. Already displayed alerts cannot be recalled.
If disconnected/restarted, new-session history is a baseline; an imminent meeting
may remind again because no cross-account notification history persists.

Bounds: 1000 equal-time message IDs, 500 current unread flags, 256 local sent IDs,
256 legacy-send skips and 256 reminder keys. Saturation drops uncertain events
rather than forgetting a key and replaying it. There are at most 16 pending events,
12 admitted deliveries per minute, one desktop job at a time, one-second spacing
between queued events and a 30-second queue age. Overload drops notifications,
including reminders; this is best-effort, not a reliable alarm service. Drop counts
are observable. Mute/disable consume events without a backlog. Disconnect/backend
exit/editor shutdown cancel timers/queue/jobs and isolate the next connection,
without clearing drafts or stopping the independent meeting owner.

## Verification

Focused native/pure-event and fake-tool PTY checks pass. Tests cover baselines,
poll/image/edit/page deduplication, equal timestamps, exact/legacy local-send
exclusion, fresh unread transitions, visibility suppression, privacy/argv/markup,
fresh reminder phases/reschedules/removal/expiry, coalescing, bounds, invalid
settings, mute/resume/disconnect cancellation, focus routing, editor fallback,
timeouts retaining job admission, and no notification-driven sends/receipts/joins
or provider refresh. Both discovered system executables and custom commands are
private fakes; no real desktop daemon is contacted. Existing successful-send tests
also verify exact ACK identity, including clipped history and no ID on failure.

Full Vim is unavailable and remains an explicit skip. Real plugin UI/OS focus/DND,
desktop rendering, Webex message/calendar acceptance, OAuth, receipts and media
have not been exercised.

### Final staged gate — 2026-11-11

Run: `/tmp/opencode/wbx-notifications-verification-rbx_zyd5/`, with builds only in
its `project/` copy. Dependencies were reused without installation; HOME/config/
cache/state were private, and live/media opt-ins were off. Every check passed:

| Check | Result |
| --- | --- |
| TypeScript and five-artifact build | Pass, staged only |
| Core, including exact ACK identity regressions | **432 pass, 11 skip, 0 fail** |
| Native editor fixtures, including three notification suites | **26 Neovim pass, 26 Vim skip** |
| Actual lazy.nvim loader/spec | **2 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Network-blocked pinned SDK/read-status/cache/receipt | **52 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn Neovim fixtures, including notification routing | **14 pass** |
| History benchmark assertions | **2 scales pass**, 9 samples/workload |
| Final documentation/link/help checks | **2 pass**, private-copy help tags pass |

Core skips remain eight compatibility-CLI opt-ins, two optional SDK opt-ins
(covered separately), and one unavailable-Vim people fixture. The baseline loader
opt-in skip is covered by the actual-loader run. Missing Vim is never a pass.
`summary.json` records all return codes; logs are `plugin.log`, `lazy-loader.log`,
`messaging.log`, `sdk.log`, `browser-controls.log`, `screen-*.log` and
`history-benchmark.log`.

All **253 source files** matched the staged SHA-256 manifest after the gate.
Only this final evidence update follows; the other **252 files** still match,
with no later runtime/test changes. All **ten existing bundle/map hashes** remain
unchanged from this gate's initial checkout baseline. `final-checks.json`,
`docs-final.log` and `final-evidence.diff` record final documentation, private-copy
native help tags and source/build integrity.

Manifest SHA-256:

- `source-manifest.json`: `7120341794ca91660859dc2eaba9852e8ff3972bc90728bf268236a59fe50a2b`
- `original-dist-manifest.json`: `af09427a653a4e9b88602acceb50356c4dd3f4e2c03eebd45594487a8edca417`

Changes remain uncommitted. No notifier/plugin was installed or configured, no
actual desktop notification sent, and no active backend/editor or account session
was reloaded. Rebuild/restart explicitly after preserving memory-only drafts.
