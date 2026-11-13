# Native meeting engine and compatibility CLI

For the primary interface, start with the [Vim/Neovim guide](editor.md).
This reference preserves the standalone meeting CLI, native pane controls,
rendering/transport details and engine verification procedures formerly in the
root README. The standalone [messaging TUI](messaging.md) and its
[trusted init API](configuration.md#beyond-settings-programmable-init-api-v1)
remain supported compatibility interfaces; their keys are not editor mappings.

Commands below are run from the checkout root. The primary runtime/source map is
in [architecture](architecture.md); recorded test evidence and current live-test
boundaries are in [editor validation](editor-validation.md) and the
[live acceptance record](live-acceptance.md). Descriptions of fixture coverage
below are not a claim that those suites were rerun for this documentation move.
Current teardown, browser-control reachability, truthful source/status labels,
foreign-pane tiling protection and lazy viewer-import changes are implemented in
source. The integrated offline gate and synthetic lifecycle/control checks passed;
the physical-device, browser/media and cross-client live acceptance is separate.
See [implementation progress](implementation-progress.md) for exact checks/limits.

## Native meeting engine

A **TypeScript, keyboard-first Webex meeting workspace**: high-resolution terminal
video, **real tmux sessions and panes**, remappable actions, themes and reloadable
JSON configuration. **One call = one tmux session; each participant video and
active screen share = a native pane with its own process.** No simulated tmux
splits in normal calls. All views share one media worker and audio owner.
Meeting microphone, camera and screen sharing are implemented with **sending off
by default**, explicit browser confirmation, and an isolated local preview.
Per-participant receiver selection is implemented against the pinned SDK, but
**real Webex interoperability is not yet live-verified**. Opt-in Webex **space
messaging** is available; it is explicitly separate from in-meeting chat.
Opt-in **session-only OAuth onboarding and automatic renewal** are implemented;
real sign-in/delivery still require authorized acceptance testing.

### Run the compatibility meeting CLI

Meeting mode requires Linux, **tmux**, Node **22.12+** (an LTS release is recommended), npm, and a recent
Google Chrome/Chromium. Kitty is the initial pixel-rendering reference terminal.

```sh
npm ci
npm run build
npm start -- demo
```

The synthetic demo needs **no account, network media, microphone, or camera**.
It creates/attaches session **`wbx-demo`**, initially with **five actual tmux panes**:
a moving test chart, three named animated mock participants, and a generated screen
share. Use `--participants 1` through `12`, `--no-mock-share`, and `--call-id NAME`
to vary the call. These are generated media, never device or desktop capture.
Live mode never inserts mock people into meetings.

```sh
npm start -- demo --participants 6
npm start -- demo --config examples/config.json
npm start -- demo --layout speaker --renderer kitty
npm start -- demo --call-id standup --detached --headless --renderer blocks
tmux list-sessions
tmux list-panes -t wbx-standup -F '#{pane_id} #{pane_pid} #{@wbx_source}'
```

The chart compresses much better than real video. Use the deliberately difficult
moving-noise source to exercise real-video throughput rather than relying on it:

```sh
npm start -- demo --layout single --pattern noise --renderer kitty
```

By default the app launches its own **headed** browser and minimizes it for
terminal rendering. A browser window can appear during startup; this prototype
does not promise invisible startup. `--foreground` keeps it visible for debugging.
`--headless` is available for synthetic tests only, and cannot reveal a browser
fallback later. An off-the-record context and a separate disposable profile are
used; the app never attaches to an existing browser.

### Call sessions and lifecycle

- Outside tmux, launch creates the session and attaches it. Inside tmux it creates
  a separate call session on the current server and switches your client to it;
  it does not nest tmux or turn your existing window into a call gallery.
- Live session IDs are deterministic hashes of the normalized meeting link,
  `wbx-<16 hex digits>`. `--call-id standup` uses `wbx-standup`. Running the same
  call again attaches the **existing** session: no second join, browser or audio.
  A name collision with unrelated work is refused and left untouched.
- Detach using your normal tmux prefix + `d` (usually Ctrl+B, then `d`). The
  meeting continues. Reattach with the same command or `tmux attach -t SESSION`.
  `--detached` creates/reuses without attaching; headed pixel workers wait for
  their first client before probing the terminal. Live developer-token/OAuth
  secret prompts are inside the owner pane, never command arguments or saved
  token files. Refresh grants stay in the owner, not the launch bootstrap.
- Membership/source updates automatically create/remove **native** view panes.
  Remote participants with cameras off retain their panes and a waiting label.
  Screen-share start creates its pane; share end removes it. Preview-on creates a
  separate local-preview pane. The browser/session is not recreated.
- `q`/Escape/Ctrl+C in any managed pane leaves the **whole call**. `pane.close`
  only hides that extra view until its source leaves/reappears. The first video
  pane owns the call and cannot be closed with that action; zoom it instead.
  Other sessions are never killed. User-added unrelated work is not killed when
  managed viewer processes disconnect.
- The mock call supports `:mock.add`, `:mock.remove`, and `:mock.share` to test
  real pane creation/removal without an account or a physical media device.

### Keys (operate on real tmux panes)

| Key | Action |
| --- | --- |
| `q`, Escape, Ctrl+C | Leave/stop and quit |
| `p` | Pause/resume terminal rendering, without leaving |
| `g` | Pixel graphics |
| `t` | Low-resolution text blocks |
| `b` | Reveal the existing browser view; no new meeting connection |
| `a` | Toggle **received** audio; initially off |
| `c` | Start/stop **local camera preview**; never send it to the meeting |
| `m` | Enable/stop **meeting microphone**; enabling requires browser confirmation |
| `v` | Enable/stop **meeting camera**; independent of local preview |
| `d` | Start/stop **outgoing screen sharing**; choose a screen in the browser |
| `u` | Show the bounded incoming participant roster and camera/microphone state |
| `x` | Webex **space** chat: select a space, read history, compose/send; not meeting chat |
| `s` | Focus the next native view pane |
| Tab / Shift+Tab | Next / previous pane |
| `h` / `j` / `k` / `l` | Focus left / down / up / right |
| Ctrl+W then `v` / `s` | Split vertically (side by side) / horizontally (stacked) |
| Ctrl+W then `c` / `o` | Close extra native view / zoom without deleting other participants |
| Space then `m` | Maximize / restore focused pane |
| `+` / `-` | Grow / shrink focused split |
| Space then `1` / `2` / `3` | Single / speaker / gallery layout |
| Space then `r` | Atomically reload configuration; keep the meeting and panes |
| `:` | Command palette, Tab completion, Enter run, Escape cancel |
| `?` | Current keybindings and source IDs; `j`/`k` scroll |

All bindings except emergency **Ctrl+C** are remappable. Escape closes help or
command mode before it can act as a normal-mode quit key. Typing command text
never triggers global hotkeys; bracketed pastes never execute actions.

### Customize the workspace

Configuration lookup: `--config PATH`, then `$WBX_CONFIG`, then
`${XDG_CONFIG_HOME:-~/.config}/wbx-tui/config.json`. Missing implicit defaults are fine;
an explicitly requested missing/invalid file fails before starting a browser.
CLI rendering, sizing and FPS options override configuration. Reload from any view
updates the shared call config and remapped controls across its panes. See
[`examples/config.json`](../examples/config.json) for a complete usable customization.

To create a full default config (use `node`, not npm's extra stdout banner):

```sh
mkdir -p ~/.config/wbx-tui
node dist/cli.js config > ~/.config/wbx-tui/config.json
```

JSON is declarative, **not executable**. Fields are validated and unknown keys,
invalid colors/actions, ambiguous key prefixes, oversized files and unbounded
layouts are rejected. Failed reloads keep the last working configuration.
Themes, keys, named layouts, media sizes, FPS and renderer can be reloaded;
initial layout and mock count take effect at next launch. Existing native geometry
stays intact on reload until you select a layout or membership changes.

- `keybindings`: map token sequences to action names, or arrays of actions
  (macros). `null` unbinds a default. Separate sequence tokens with spaces:
  `"<C-w> v"`, `"<leader> m"`. Tokens include `<Esc>`, `<Tab>`, `<S-Tab>`,
  `<Enter>`, `<BS>`, `<Up>`, `<Down>`, `<Left>`, `<Right>`, `<Space>`, `<C-x>`.
  Prefixes expire after one second. `leader` is one printable character, space
  by default. Example: `"<leader> f": ["layout speaker", "pane.maximize"]`.
- `theme`: override any of `background`, `foreground`, `muted`, `accent`,
  `border`, `focus`, `warning` using `#RRGGBB`. Colors style in-pane UI; native tmux
  status/borders inherit your server configuration unless you explicitly set
  `"tmux": {"appearance": "theme"}` (`"inherit"` is the default). Built-ins:
  `:theme midnight`, `:theme forest`,
  `:theme light` (session-local; edit JSON to persist colors).
- `layouts`: named trees compiled into **native tmux layouts**, not regions inside
  one terminal. A leaf is `{"source":"video"}` with
  optional `title`; a split has `direction`, `ratio` (0.1–0.9), and two `children`.
  Up to 16 panes and eight split levels. Built-ins: `single`, `gallery`,
  `speaker`, `presentation`. Default `gallery` uses tmux's tiled layout, `speaker`
  uses main-vertical, `presentation` makes the share the main pane, and `single`
  zooms the owner without destroying other views. Custom trees preserve ratios;
  absent sources are pruned and additional active participants/shares are retained.
- `renderer`, `fallback`, `fps`, `width`, `height`, `demoParticipants`: startup
  defaults. Media sizes and FPS also reload. Capture requests remain capped at
  1920×1080 and one in flight; per-pane rendering is serial and backpressured.

Useful palette commands (also usable as keybinding actions):

```text
layout gallery                 layout presentation
source.set mock-2              source.set share
pane.split.vertical            pane.split.horizontal
pane.close                     pane.only
pane.maximize                  pane.grow / pane.shrink
focus.left / right / up / down  focus.next / focus.previous
layout.save mydesk             reload
theme forest                   tmux.open mock-2
mock.add / mock.remove          mock.share
microphone.toggle              video.toggle / screen.toggle
camera.toggle                  participants
chat                           chat.close
auth.refresh                   # explicit OAuth renewal; no new meeting join
```

`:layout.save mydesk` reads **actual tmux geometry**, converts pane IDs back to
source IDs, and explicitly saves that reusable native layout to the config and
makes it the initial layout. It preserves other customization, uses an atomic
`0600` replacement, and refuses to overwrite malformed configuration. No live
meeting URL, token, frames or SDK objects are saved. Unsaved layout edits and
session-local theme switches are ephemeral.

`:source.set share` focuses the native share pane; it does not replace somebody
else's video inside a fake split. Sources are `video` (primary incoming person or
active-speaker fallback), `remote-2`…`remote-12` (other incoming people), `share`
(received screen), `local` (preview only), `self` (meeting camera), `presenting`
(outgoing screen), and generated `mock-2`…`mock-12` (`mock-1` aliases the demo chart). Missing sources
are never substituted with another person's feed. Local preview requires a
separate explicit camera action. Use `?` to see current source availability.

Browser buttons control the same session. Window-manager policy may prevent
browser focus/minimization.

### Space messaging (not in-meeting chat)

Press **`x`** or run `:chat` in any managed pane. The first explicit open lists
up to **30 Webex spaces** using the meeting owner's existing SDK/account. Use
`j`/`k` or arrows and **Enter** to select a space. Opening/selecting never sends.
The compose view names the destination and shows its room ID. Messages go to
**that persistent space's members**, who may differ from the meeting attendees.
The app never derives a room ID from a meeting URL, creates spaces, adds members,
or sends direct messages on your behalf.

Type a plaintext draft and press **Enter** to send it to the displayed space.
Composition is modal: `m`, `v`, `d`, `c`, `q`, etc. are text, not media/quit
hotkeys. Ctrl+C remains emergency quit. Unicode input is supported; bracketed
pastes are ignored under the existing terminal-input safety policy. Use arrows
to scroll history, **Ctrl+R** to refresh, **Tab** to choose another space, and
**Escape** to return to video. Escape hides the view but keeps the selected-space
poll running; `:chat.close` stops polling and clears the shared selection/history.
Leaving the call also stops it. Chat uses an overlay in the current real pane;
other participant/share panes keep rendering.

All managed panes share one selected space, history, polling owner and send
admission. Switching spaces discards unsent drafts, and a stale pane's draft
cannot be redirected to the new space. History is capped at **50 messages**,
refreshed every **4 seconds** while selected, and outgoing bodies at **1,000
UTF-16 code units**. This is bounded recent history, not a complete archive.
Attachments/non-text messages appear as a placeholder; HTML is not rendered.
No chat text, space selection or history is intentionally saved in app config or
exit metrics. Your terminal/tmux logging can still capture displayed text.

Read errors and missing messaging scopes are nonfatal to the meeting. A rejected
send retains the draft; ambiguous network/deadline outcomes say **delivery
UNKNOWN**. The app does not automatically retry POSTs; check the space before
any explicit retry. A timed-out native request retains its admission until it
settles, avoiding a growing network queue. No extra browser, SDK registration,
media capture or meeting join is created for chat. In demo calls, `x` opens a
clearly labeled **local-only MOCK space**, without an account or network request.

Live space access requires space membership and suitable messaging scopes
(`spark:rooms_read`, `spark:messages_read`, `spark:messages_write`, or applicable
broader grants). Meeting-only tokens may not have them. This implementation
polls only the explicitly selected space instead of using `messages.listen()`,
which subscribes to account-wide activity. The pinned meetings plugin exposes
no public in-meeting chat send/receive API; **actual meeting chat is not
implemented**, and the compliance Meeting Chats REST API is not a sending API.

### Meeting microphone, camera and screen sharing

In a connected live call, press **`m`**, **`v`** or **`d`**. This arms the chosen
control and reveals the existing owned browser. **Click its explicit confirmation
button**, then grant any requested browser/device permission. Arming from the
terminal alone does not capture or publish. Scripted DOM clicks cannot confirm.
Screen sharing uses a genuine browser click to preserve the chooser's required
user activation. No permission is auto-granted.

Press the same key again to cancel/stop, without a confirmation step. Local raw
tracks stop immediately, independently of SDK/network cleanup. Late capture and
late publish completion are cleaned up; device/display end and host mute turn
sending off without automatically re-enabling it. Quit requests media shutdown
before waiting for native-pane cleanup. Microphone/camera/share state is shown
separately in the terminal and browser. Uncertain SDK publish/update failures
block further acquisition until rejoining, rather than silently risking a second
publication. Sending is unavailable in demo and CLI headless modes.

Meeting-camera output appears in a **`self`** pane and outgoing screen in a
**`presenting`** pane. The independent **`local`** preview is never published;
stopping one camera controller does not stop the other. If both are enabled, your
camera can remain active until both are off. Outgoing screen sharing is currently
**video-only** (no desktop/system audio capture). Received screen-share audio uses
the same explicitly enabled received-audio control as meeting audio.

### Local camera preview (explicitly opt-in)

Press **`c`** in either a demo or a live meeting. The app reveals its owned browser
so you can grant camera permission. Once allowed, a **new native local-preview
pane** uses the same pixel/shared-memory rendering path. Use normal focus keys
to move between remote video/share/self-preview; changing the viewed source does
not stop camera capture. Press **`c` again** to stop capture, or quit/leave to
release it. Capture remains off by default on every launch.

The terminal and browser explicitly label this **preview only / NOT SENT**.
Enabling a preview does **not** enable Webex video transmission. The preview never
requests your microphone (`audio: false`), and its component has no meeting/SDK
reference. The browser camera button requests the same controller action.

Permission denial or a missing/busy camera is nonfatal. Canceling a pending prompt
prevents late capture from being adopted; if the browser later returns a stream,
its tracks are immediately stopped. Shutdown stops owned tracks before waiting
for Webex to leave. Pasted terminal text is not interpreted as camera controls.

Preview is unavailable in the CLI's `--headless` synthetic mode: the permission UI
must remain reachable. Automated camera tests replace `getUserMedia` with generated
canvas media; they never activate a physical camera or auto-grant permissions.

### Rendering and tmux

```sh
npm start -- probe
npm start -- demo --renderer kitty
npm start -- demo --renderer blocks
npm start -- demo --renderer browser
```

`auto` uses bounded Kitty feature probes, including Unicode placeholders and
in-place root-frame editing (the animation-frame API).
If probing fails, the default is **blocks**, not an unexpected browser reveal.
Choose `--fallback browser` or set `fallback` in JSON to opt into a browser fallback.

The Kitty backend transfers actual pixels, not colored character blocks.
It uses protocol-defined Unicode placeholders and DCS passthrough inside tmux,
scopes image deletion to this viewer, and edits the existing root frame in place.
It does not replace/re-place the image every frame or retain an animation history.
Pixel resolution depends on source quality and pane size.

#### Native view transport

Every normal call uses native tmux automatically. `:tmux.open mock-2` or a split
action can explicitly create an **additional** view of a source; you do not need
these commands to create the initial participant/share panes.

The owner creates a private `0700` directory and `0600` Unix socket. It exposes
bounded frames, source/status/config metadata and terminal replies. Managed call
viewers relay validated actions to the owner, which checks session/pane/process
ownership before touching tmux. Tokens and SDK objects never cross this socket.
All viewers share a FIFO capture admission with at most one media-worker request
in flight. No media worker or audio player is duplicated per pane.

tmux sends terminal replies to its active pane. Participating workspaces relay
bounded, validated graphics **and cell-size** replies through the owner, including
during viewer startup probes; reports cannot become keyboard hotkeys. Each renderer
checks its own unique frame fence. New attached clients trigger fresh image
allocations so cached placeholders do not become black boxes in a new terminal.
Focusing
an unrelated shell that cannot relay replies can pause graphics after the normal
timeout. Return to a participating pane and retry `g` (or use blocks). This is not
a tmux-wide keyboard interception service. Shared-memory multi-client caveats
below still apply.

On local Linux, `--pixel-transport auto` first probes a real RAM-backed POSIX
shared-memory object. When accessible, uncompressed RGBA frames bypass PNG
encoding, and only a short object name passes through tmux. This matters for
camera video: photo/noise frames can be many times larger than the demo chart
when encoded as PNG and base64.

`--pixel-transport shm` requires that local fast path; `--pixel-transport inline`
forces the original PNG/base64 path for remote or incompatible environments.
Shared memory is only enabled on a verified tmpfs `/dev/shm`, with one protected
`0600` object in flight **per viewer**. Kitty unlinks the object after reading; the app also
cleans up on completion/failure. No frames are written to disk-backed files;
normal OS swap policy still applies. A hard kill can leave at most the current
RAM object behind until cleanup/reboot.

The app checks that only one interactive tmux client displays its window before
enabling this transport: two readers would race to unlink the same object.
Unknown/multiple-reader arrangements use inline mode. Attaching another client
mid-run can invalidate that assumption; restart with inline transport if needed.
SSH/container/sandbox setups are not presumed to share memory just because they
run Linux: the actual terminal read probe must succeed.

After each pixel update, a unique query waits for an acknowledgment from the
outer terminal. This prevents tmux's output queue from getting far ahead of Kitty.
Graphics replies are separated from keyboard input; delayed replies from another
attached client cannot acknowledge the next frame. No acknowledgment within three
seconds **after stdout delivery** pauses pixel rendering and displays the error.
It does **not** leave the meeting or stop received audio. Use `t`/`b` to switch
views, or `g`/`p` to retry. Rendering errors must not be treated as call failures.
This processing acknowledgment is **not** a display/vsync acknowledgment.

tmux must permit passthrough. Enable it for the current pane yourself if needed:

```sh
tmux set -p allow-passthrough on
```

The application enables scoped passthrough; status/borders inherit your tmux
configuration by default. Opt-in engine styling affects **only its call
session/window**, not global settings, your prefix or unrelated sessions. New
sessions inherit server/global settings, not another session's local overrides.
Some terminal/tmux combinations
do not forward probe replies; `--renderer kitty` is an explicit override, **not** a
guarantee that the outer terminal supports the protocol. A non-graphics terminal
will still not display pixels. `TERM` alone is not used as proof of support.

Cell pixel dimensions are queried. If unavailable, the app reports an **8×16
estimate**. Supply the real values to avoid excessive scaling or wasted space:

```sh
npm start -- demo --renderer kitty --cell-width 10 --cell-height 20
```

Other options: `--fps 15`, `--width 1280 --height 720`, `--duration 10`, and
`--browser-path /path/to/chromium`. See `npm start -- --help`.

Repeated `live` commands for the same call attach the same tmux session. Explicitly
different `--call-id` values create separate calls and would join separately.
`--standalone` retains the old single-terminal/internal-split rendering bench for
regression tests only; it is **not** the default meeting window model.

### Live Webex (explicitly opt-in)

```sh
npm run sdk
npm start -- live
```

`sdk` downloads the pinned **Webex browser SDK 3.13.0** from jsDelivr. Its SHA-256
is checked on download and before every live launch. The bundle is cached locally
under ignored `vendor/`; no runtime CDN is needed for this bundle. The Webex SDK
itself still contacts Webex services and may request other SDK assets.

Enter a Webex HTTPS meeting link at launch and a short-lived developer access token
in the new call's owner pane. Token input is hidden. **Do not put tokens in command arguments, source
files, screenshots, or bug reports.** No token argument or token file is supported.
`--meeting HTTPS_LINK` exists, but the prompt avoids putting meeting links in shell
history and the process command line.

For browser authorization instead of a personal token, configure the public
`oauth` profile and run **`npm start -- live --auth oauth --config PATH`**. The
owner asks for the integration secret privately, opens an off-the-record consent
tab, validates a loopback Authorization Code + PKCE S256 callback, and keeps
refresh grants in memory. Renewal updates the existing SDK without rejoining;
`:auth.refresh` requests it explicitly. Failed or unacknowledged renewal ends
the call and stops local tracks. No token cache/remember-me storage is added.
See [OAuth setup, security and tests](oauth.md) before configuring your own
authorized integration. Webex still requires the confidential client secret at
its token endpoint; the secret is never exposed in browser code.

Use an authorized **test meeting**, not a production meeting, for first validation.
The token/account must permit SDK registration and meeting participation; org
policy, lobby admission, token expiry, Webex service type, and network restrictions
can prevent joining. Developer-token mode has no refresh grant; OAuth is the
renewal-capable alternative. Neither meeting authorization path has completed live
acceptance. The separately recorded messaging startup diagnostic is not evidence
of meeting sign-in, renewal or media interoperability.

The adapter registers and joins once with multistream enabled, initially without
local streams. It requests up to **12 remote participant videos**, one screen-share
receiver, three active-speaker audio streams and one shared-screen audio stream.
Public roster CSIs select the individual receiver slots. A stream is shown under
a participant's name only when its CSI (and member ID when supplied) matches.
Muted people stay present; leaving the primary view promotes another person and
invalidates the old image. If individual selection fails, a notice explains the
fallback to a single active-speaker view without rejoining.

People start with 720p-or-less hints, with resolution hints following requested
pane size; screen share requests the SDK's best quality. These are quality
requests, not promises about what Webex will send. The bounded roster/view set
excludes self and paired-self devices; meetings larger than 12 remote people do
not yet have roster pagination. Native panes and registered sources are capped
at 16 total, including share, preview, sending camera and outgoing screen.
Unsupported or identity-mismatched sources show a waiting state, never another
person's feed. See [SDK boundary and API provenance](sdk-boundary.md).

## Architecture

This diagram and list describe the meeting engine. See
[the complete source/runtime map](architecture.md) for all five build entrypoints,
native editor ownership, optional unread SDK and source-versus-built execution.

```text
  Browser: synthetic source OR Webex SDK → video element → PNG/RGBA frame
                                                        │
                       authenticated, binary loopback WebSocket
                                                        │
Node: one-frame demand queue → Kitty pixels OR text blocks
      call controller in tmux owner pane → one SDK join/audio owner
                        private Unix socket → one viewer process per native pane
      native tmux session → participants, share, optional self-preview
```

- `src/browser/`: synthetic source, frame sampling, narrow Webex adapter, browser UI.
- `src/browser/camera.ts`: opt-in preview capture, pending-request cancellation and track cleanup; no SDK access.
- `src/browser/outgoing.ts`: explicit send lifecycle, immediate track stopping, host mute and late-operation cleanup.
- `src/browser/participants.ts`: bounded receiver selection, CSI/member identity guards, stable source mapping and fallback.
- `src/browser/chat.ts`, `src/chat-protocol.ts`: opt-in selected-space messaging, bounded history, POST results and validated IPC.
- `src/chat-ui.ts`: modal space picker/history/Unicode composition, draft and destination safety.
- `src/oauth.ts`, `src/auth-protocol.ts`, `src/browser/auth.ts`: loopback OAuth, private grant ownership, proactive renewal/adoption deadlines and credential bridge.
- `src/host.ts`: isolated Chrome lifecycle, loopback server, authentication, frame requests.
- `src/protocol.ts`: validated commands/events and a bounded binary frame format.
- `src/render.ts`, `src/terminal.ts`: graphics, capability queries, text blocks, controls.
- `src/shared-memory.ts`: bounded, owner-only, RAM-backed frame leases for local Kitty.
- `src/cli.ts`, `src/metrics.ts`: scheduling, state, diagnostics.
- `src/config.ts`, `src/keys.ts`: validated configuration, declarative actions/macros, key sequence matching.
- `src/ui.ts`: per-pane themed chrome, modal palette/help/roster; native actions delegate to tmux.
- `src/call-launch.ts`: call identity, private transient launch bootstrap, native session create/attach/reuse.
- `src/call-panes.ts`, `src/tmux-layout.ts`: membership-driven native panes, focus/resize/zoom, tmux layout compile/save, attach recovery.
- `src/viewer.ts`, `src/tmux.ts`: private frame/action/config broker, cross-pane terminal reply relay.
- `src/workspace.ts`: legacy standalone rendering-bench split tree only.
- `src/browser/mock.ts`: independent, named, animated generated participant sources.

Only one frame request may be in flight. Requests have deadlines and sequence IDs;
late/canceled replies are ignored. Large frame bytes do not pass through CDP or
JSON. Browser encoding and terminal writes are awaited, so slow output cannot
create a growing frame backlog. Pixel writes additionally await terminal processing,
not merely a successful stdout write into tmux. Unchanged frames/status lines are
not retransmitted. The source video remains independent of rendering.
Native membership snapshots coalesce to the latest state; unchanged pane tags
are cached and ownership is checked with one pane census. Media/leave controls
validate their requesting pane independently of the membership/layout queue.

## Verification

```sh
npm run check
npm test
npm run build
WBX_BROWSER_TEST=1 WBX_TEMP_DIR=/tmp/opencode npm run test:browser
npm audit
```

Browser tests are opt-in, use real **headless Chrome** with synthetic media/fake
SDK objects, and never use a live account or physical media devices. Camera-preview
tests inject generated streams rather than granting camera permission. Set `WBX_BROWSER` for
a non-default Chrome path. `WBX_TEMP_DIR` selects the disposable profile location;
the directory must already exist. CLI smoke tests also require util-linux `script`.
They create a private tmux server for the passthrough test, never use your running
server or configuration, and require tmux for that check. After `npm run sdk`, add
`WBX_SDK_TEST=1` to also verify that the actual pinned bundle loads in Chrome
without initializing an account.

An additional **visible**, opt-in regression test opens its own Kitty/Chrome
windows and private tmux server to check sustained, acknowledged pixel updates:

```sh
WBX_KITTY_TEST=1 npm run test:kitty
```

It uses synthetic media only, starts Kitty with no user configuration, and checks
that root images/placements are reused, allowing bounded recreation after desktop
or tmux geometry changes. Display tests run serially because they share a window
manager (parallel windows can resize each other on tiling desktops). It includes
a **30-second high-entropy video test** of the shared-memory path, not just the
easily compressed chart. It does not use your existing tmux server. It requires
X11, Kitty, tmux, `script`, and Linux tmpfs shared memory for the stress test.
The native-call test creates a real call session with **five tmux panes and five
processes**, cycles native focus, detaches, opens a fresh Kitty client, verifies
the same media owner, and checks advancing, acknowledged video in every pane. To capture
the actual Kitty window (requires ImageMagick `import` and `xwininfo`):

```sh
WBX_KITTY_TEST=1 WBX_SCREENSHOT=/tmp/opencode/wbx-native-call.png \
  ./node_modules/.bin/tsx --test test/kitty/native-call.test.ts
```

| Area | Verification boundary |
| --- | --- |
| Protocol bounds, cancellation, initial no-send SDK calls, image encoding | Automated unit tests |
| Real browser → binary transport, 720p PNG, RGBA samples, browser controls | Headless Chrome + synthetic/fake SDK tests |
| CLI output, key handling, terminal restoration | Pseudo-terminal + headless Chrome |
| Pixel bytes through tmux and scoped deletion | Private tmux server + pseudo-terminal; not visual quality |
| Sustained in-place pixel updates and outer-terminal processing ACKs | Opt-in real Kitty + private tmux + minimized headed Chrome regression test |
| Heavy frames and recovery from rendering timeouts | Noise-source RAM-transport stress test; pseudo-terminal timeout/recovery test |
| Local preview, denial/cancellation/cleanup, and no outgoing publishing | Unit tests + real Chrome using a generated fake camera; physical-camera check remains manual |
| Confirmation-gated microphone/camera/share, trusted click, cancellation, host mute, late publishing and leave cleanup | Unit tests + real Chrome with generated streams/fake SDK; no physical device or real account |
| Individual receiver CSIs, distinct feeds, muted presence, stable identity and primary promotion | Unit tests + real Chrome with pinned-API fake SDK; not live multi-user negotiation |
| Explicit space selection, plaintext send/history, Unicode, stale destinations, denial/unknown delivery and cleanup | Unit tests + real Chrome fixtures + actual pinned SDK messaging plugins with HTTP responses stubbed; no account or live delivery |
| Space compose/history from a native peer, shared owner history and video restoration | Real native tmux + headless Chrome using local-only demo messages |
| Native source-event coalescing, cached tags, muted-member panes, identity-based dismissal and priority media/leave | Injected tmux unit tests; native lifecycle tests exercise real tmux separately |
| OAuth PKCE/state callback, exchange/rotation, denial/cancel/timeout and expiry/adoption cutoff | Local HTTP provider fixtures; real Chrome + actual pinned SDK credentials/messaging with external services blocked; not live sign-in |
| Config validation, key sequences/macros, pane geometry, focus, resize, save and modal command safety | Automated unit tests |
| Twelve distinct moving mock feeds, no device requests, shared viewer transport | Real headless Chrome + read-only broker tests |
| Real workspace controls, persistence, remapping, failed/successful reload | Pseudo-terminal integration test |
| Actual call-named session, individual pane/process identities, one browser, join/leave/share lifecycle, controls/config/save, reuse and scoped shutdown | Native tmux + headless Chrome integration test |
| Five native pixel panes, ACK relay, fresh-client detach/reattach without another media owner | Real Kitty + private tmux integration test; optional actual-window screenshot |
| Kitty image quality and tmux resize/zoom/detach behavior | **Manual check still required** |
| Minimized headed browser keeps advancing; reveal works | **Manual check still required** |
| Real Webex account, audio, screen sharing, lobby and policy behavior | **Not live-verified** |

The adapter tests are not proof that a real Webex account can join. Likewise,
headless frame-transfer tests are not a terminal/display frame-rate benchmark.

### Manual acceptance procedure (not recorded results)

Use the [single live acceptance table](live-acceptance.md#run-and-record) for
PASS/FAIL/NOT RUN evidence. The following detailed procedure does not grant
authorization or mark any live check complete.

1. Run the demo directly in Kitty. Confirm fine text is sharp in pixels, noticeably
   worse in blocks, and comparable in the browser. Confirm the frame counter moves.
2. Inspect `tmux list-sessions` / `list-panes`. Split, resize, zoom/unzoom, detach and
   reattach. Create another mock call with a different `--call-id` and verify that
   it is a separate session. Look for misplaced or stale images.
3. Toggle `b`, `t`, and `g`, including while paused. Confirm the same browser/source
   remains and no images remain outside their pane after exit.
4. Confirm source frames continue changing with the owned browser minimized.
5. Join an authorized test meeting. Have another participant enable video. Confirm
   a 10-minute session, received audio if enabled, leave behavior, and browser
   fallback without a duplicate participant. Microphone, meeting camera and preview
   must remain off until individually requested. With two remote people, verify
   distinct native panes, `u` roster, mute/unmute, departure and primary promotion.
6. Have another participant share a screen; verify a new native pane appears and
   disappears when sharing ends. Check actual small-text
   readability; receiver negotiation alone is not proof a presentation is arriving.
7. Press `c`, explicitly allow permission in the owned browser, and verify the local
   image and **NOT SENT** indicator. Cycle sources with `s`, stop with `c`, and
   verify the device activity light turns off. Test denial/cancellation and quit.
8. In the authorized test call, enable `m` and `v` separately, confirm in the
   browser, and ask the other participant to verify actual transmitted audio/video.
   Preview alone must never transmit. Test mute, host mute, device denial,
   cancellation and quit; stop all camera controllers before checking its light.
9. Enable `d`, choose a non-sensitive test screen, and verify it at the other
   endpoint. Stop from both the TUI and browser sharing indicator. Screen sharing
   is video-only. Test incoming share audio separately with `a` enabled.
10. In a separately authorized test **space**, use `x` to select the exact approved
    destination, send a harmless agreed test string, and verify it from a second
    Webex client. Reply there and confirm it appears within the polling interval.
    Check Unicode, denied scopes, `chat.close` and native-pane controls. Do not
    expect messages in the meeting's in-call chat. Full coordination and a
    pass/fail record are in [the live acceptance plan](live-acceptance.md).

Exit prints frame counts, unique presented-source frame counts, skipped source
frames, unavailable requests, data volume, capture-to-TTY-write latency, Node event
loop delay/CPU/RSS, actual terminal bytes and acknowledged-update latency/counts,
capture/bridge vs terminal-write vs post-write-ACK timing, render error count,
selected pixel transport, and a Linux owned-browser-tree RSS snapshot. Counts include
startup and pause/browser-view time. A TTY write completing does **not** prove the
image reached the display. A terminal processing ACK is stronger than a write,
but still does not establish presentation/vsync time. Browser-tree RSS sums processes and may double-count
shared memory; it is not PSS or a whole-system memory measurement.
With multiple feeds, overall FPS is the **aggregate across sources**, not the
frame rate of each participant. `perSource` reports separate frame counts/FPS.

Initial goal: a usable single feed approaching **720p/15 fps** where pane/source
permit it, responsive controls, no growing queue/memory, and no rejoin when changing
views. Measure on the intended hardware before claiming success.

## Privacy and scope

- SDK logs are silenced, buffering/log auto-upload disabled; browser/SDK console
  objects are not copied into terminal logs.
- Control access requires a random per-session secret and matching loopback origin.
  The secret travels over the private browser-control pipe, not URLs or assets.
- Tokens are not deliberately saved by the application. The SDK runs in an
  off-the-record browser context; only the owned disposable profile is erased on
  normal shutdown. A crash/SIGKILL may leave that profile directory behind.
- Runtime OAuth client secrets and refresh grants stay in Node owner memory. The
  optional `oauth.clientSecret` persists only in your original owner-only config
  (0600), is omitted from public config output, and skips the secret prompt. Only access
  credentials/public metadata reach the browser; other panes receive bounded
  auth status, never tokens. No credential vault/remember-me file is added.
- The local pixel fast path uses an ephemeral, owner-only RAM object containing
  the current decoded frame, never a recording or persistent cache. It does not
  share token/session objects with the terminal. See transport caveats above.
- Browser sandboxing remains enabled. No permission-auto-grant or fake-device
  launch flags are used in the application.
- Local preview requires explicit preview intent and browser permission.
  Preview frames stay in the local rendering pipeline, never the meeting's local
  streams. Meeting microphone/camera/screen require separate intent, trusted
  browser confirmation and permission; sending is off at every launch.
- Exit best-effort leaves/unregisters, then closes only the owned browser. It never
  kills or changes your ordinary browser, Webex application, or tmux server.

Not implemented in the meeting CLI/space overlay: **in-meeting chat**,
access/refresh-token persistence, outgoing system audio, large-meeting roster or
overlay space pagination, messaging attachments, threads/edits/deletes or SIXEL.
This is not a suite-wide prohibition on replies or executable extensions: the
native editor supports thread-bound replies; the standalone messaging TUI supports
explicitly trusted `--init` modules, but no package installer or sandbox. The
optional configured OAuth client secret remains persistent plaintext in its
original private file; it is not a remembered login grant.
Outgoing media and individual participant selection are implemented and tested
with generated streams and SDK fixtures, **not yet verified in a real meeting**.
Live verification needs an authorized test meeting, a developer token or
operator-owned OAuth integration/consent entered locally, a second participant,
and explicit device/screen permission.
Space messaging additionally has actual pinned-plugin integration tests at a
stubbed HTTP boundary; live account authorization/delivery remain unverified.
