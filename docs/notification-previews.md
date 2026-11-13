# Short notification excerpts, including other spaces

Client-defaults follow-up: previews and sender labels now default **on**.
`notifications.sender_names=false` opts out of `Alice: excerpt` and
shared-cache history labels; `preview=false` hides both. Name resolution never
delays or replays an alert. This additive contract supersedes historical
“never author”/excerpt-only assertions below when the separately negotiated
sender flag is enabled (native default true). See
[sender names](sender-names-design.md) for grants, budgets and gates.

Previews are **enabled by default**, with a known sender label unless opted out:

```lua
notifications = { mode = 'hybrid' } -- previews on; preview=false hides message text
```

Vim: `let g:wbx_tui.notifications = {'mode': 'hybrid'}`; add `'preview': 0` to opt out.
An alert shows `Alice: First words of the message` when the sender is known, or
`First words of the message` otherwise, without a generated “New message”
prefix, separator or count. Coalesced batches show the last included excerpt. Existing explicit
`preview=false` values continue to win over the default. Desktop tools and editor
notification histories can retain this text; disable previews for sensitive chats
if that exposure is unacceptable. Installed configuration is never rewritten.

## Data and consent boundary

The existing public SDK listener already gets each message's details. Only with
explicit session consent does the worker read its plain `data.text` for an excerpt.
It inspects at most 2048 UTF-16 units, replaces control/bidi/invisible marks and
whitespace with safe single spaces, removes malformed surrogate units and limits
the result to **160 Unicode code points**. It never forwards a full long body,
files, person IDs, HTML or Markdown fallback. An attachment-only/empty message
stays generic. No new message/history fetch, identity lookup, scope or receipt.

Native `notifications.preview=true` (the default), enabled message notifications and existing
`read_status=true` jointly permit a strict `notificationPreview:true` session-start
flag, negotiated through `notification-previews`. Older backends get no unknown
parameter and keep generic off-space alerts. The engine passes consent to the
private source/worker; missing/false consent constructs no excerpt. The owner and
engine independently reject unconsented excerpt payloads. Native protocol validation
also requires `messageEvents.preview=true` before allowing a per-event `preview`,
with independent 160-character/640-byte/unsafe-character checks.

Consent is fixed at session start; changing it requires an explicitly replaced
session, never an automatic reconnect/device registration. Turning the native UI
option off still hides queued excerpts at dispatch, but the already-consented
source retains its bounded in-memory policy until that session ends. Excerpts are
never persisted to spaces/unread caches, health diagnostics or a plugin log.

Native detection keeps only the excerpt of the last eligible event in a same-space
batch, then uses the existing queue/privacy/rate limits and literal-argv delivery.
`notify-send` markup is escaped. Excluded plugin echoes cannot replace the preview;
same-account native-client posts are now suppressed under the later user correction.
Explicit opt-out/disabled configurations
remain generic; selected-space previews retain their existing behaviour.

Read-state freshness, receipt admission and failure deduplication, local unread
presentation, message POST identity, draft/focus/view state and independent meeting
ownership are unchanged. No running editor, installed configuration, original
build or real Webex session is touched by implementation/verification. Preserve
drafts and explicitly rebuild/restart when ready; never hot-source the coordinator.

## Verification

Focused checks pass for worker excerpt construction, Unicode bounds, control/bidi
sanitization, trailing whitespace, malformed preview types/consent, private IPC
and engine rejection without consent, explicit RPC admission and capability
negotiation. The network-forbidden **actual pinned SDK -> worker -> private
validator -> engine -> native routing** fixture now runs with previews both off
and on, proving no new fetches, no file/full-tail leakage, same-account delivery,
exact plugin-send exclusion and sanitized opt-in text in real native notification
routing. Worker process boundaries in this fixture are synthetic; separate forked
IPC tests cover the actual private transport.

`test/editor/notification-previews.vim` exercises normal coordinator startup,
capability negotiation and notification routing with a fake backend: default-on,
explicit-off, explicit-on and older-backend degradation. Existing selected-space
and coalesced preview tests require excerpt-only bodies. Missing/disabled previews
retain generic labels. No real desktop/Webex calls. Existing
selected-space preview, desktop escaping, focus, privacy and receipt tests remain.
Full Vim is unavailable and is an explicit skip.

### Initial excerpt gate (historical; before default-on change)

All checks passed in `/tmp/opencode/wbx-notification-previews-verification-cazqzbks/`.
Builds ran only in its `project/` copy with private HOME/config/cache/state,
existing dependencies reused without installation, and no live/media opt-ins:

| Check | Result |
| --- | --- |
| TypeScript and complete five-artifact build | Pass, staged only |
| Core, including consent/IPC/engine/RPC boundaries | **445 pass, 13 skip, 0 fail** |
| Native editor fixtures | **30 Neovim pass, 30 Vim skip** |
| SDK/worker/cache/persistence, including real pinned-SDK preview off/on | **77 pass** |
| Synthetic messaging/extensions | **44 pass** |
| Synthetic browser controls | **3 pass** |
| Drawn private-PTY Neovim fixtures, including preview negotiation | **17 pass** |
| LazyVim example/spec checks | **1 pass, 1 optional loader skip** |
| Private native help tags | Pass |

Core skips include optional CLI/SDK tiers and unavailable Vim; all four pinned-SDK
fixtures are covered by the explicit SDK run. Missing Vim and the installed
lazy.nvim loader are not counted as passes. `summary.json` records every return
code. Logs are `plugin.log`, `sdk.log`, `messaging.log`, `browser-controls.log`,
`screen-*.log` and `native-help.log`.

At that initial excerpt gate, all **261 source files** matched their staged SHA-256 manifest after verification;
all **ten existing bundle/map hashes** remained unchanged from the original
checkout's run baseline. Its finalization changed only this evidence file; the other
**260 sources** matched at that point. `final-checks.json`
and `docs-final.log` record the evidence-only difference, final documentation
recheck and original build integrity. No configuration, running editor, OAuth,
Webex/receipt/device session or real desktop was changed/exercised. Changes remain
uncommitted and activation remains user-controlled. Real OS/editor-integration
acceptance remains unverified. That gate predates the requested default-on/prefix
change; its source manifest is not evidence for the newer change.

### Default-on and label gate (historical; before excerpt-only formatting)

The requested default and label changes passed the full isolated gate at
`/tmp/opencode/wbx-default-previews-verification-kvpw5ahk/`: **445 core pass/13 skip**,
**30 Neovim pass/30 unavailable-Vim skip**, **77 SDK pass**, **44 synthetic messaging
pass**, **3 browser-control pass**, **17 drawn fixtures pass**, and private native
help tags pass. LazyVim checks remain **1 pass/1 optional installed-loader skip**.
TypeScript and all five artifacts built successfully in the copied project only.

Native regression cases now cover omitted preview settings (default on), explicit
false, explicit true, and older-backend degradation with both omitted/explicit
settings. Selected and global coalesced previews retain `New message (N)` before
the excerpt; explicit opt-out still delivers generic labels without text.

All **261 sources** matched the copied manifest after the gate; all **ten original
bundle/map hashes** stayed unchanged. Only this final evidence update follows;
the other **260 sources** still match. The run's `summary.json`, `final-checks.json`
and `docs-final.log` record return codes, evidence-only post-gate changes and build
integrity. No installed configuration, running editor, real Webex/desktop session,
receipt/device action or original build was changed. Work remains uncommitted.

### Excerpt-only presentation correction

The user clarified that previews should **not** repeat “New message”. Preview
bodies now contain only the excerpt, including coalesced batches; the title and
default-on setting are unchanged. Generic message/count labels remain only when
the excerpt is unavailable or previews are disabled.

Focused checks for this display-only correction passed: **4 Neovim fixtures**
(4 unavailable-Vim skips), **4 network-blocked pinned-SDK fixtures** including
preview off/on through native routing, the private-PTY preview fixture, TypeScript
and both documentation checks. These tests assert exact excerpt-only editor bodies,
desktop escaping without the generated label, coalesced previews and generic
opt-out/older-backend fallbacks. The full gates above predate this final formatting
change; no new full-gate or live acceptance is claimed. No original build, active
editor, installed configuration, receipt or provider session was changed.
