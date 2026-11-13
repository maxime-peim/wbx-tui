# Authorized live acceptance plan

**Status: live post/receipt/thread/meeting/media acceptance remains NOT RUN.**
Those tests require separate user authorization, locally supplied token/OAuth
credentials as appropriate, an agreed test meeting/space and a second endpoint.
No live meeting join or agent-requested message/receipt is recorded here.
Automated tests use generated media, fake meeting objects and stubbed messaging
HTTP responses; they are not proof of successful Webex interoperability.

There **were** narrower, explicitly approved live observations, recorded in
[editor validation](editor-validation.md#authorized-startup-diagnostic):

| Prior observation | Recorded scope | What it does not establish |
| --- | --- | --- |
| One startup diagnostic reconnect | Mark-on-open temporarily disabled, no space selected, server read-status recovery and draft/focus aggregates inspected; original preference restored | Root cause, permanent recovery, cross-client events or receipt delivery |
| Read-title/current-row styling updates | Aggregate syntax/highlight/state inspection; no main-autoload reload, backend restart, reconnect, message or receipt requested | New authorization, OAuth renewal, threaded delivery or media acceptance |

These observations supersede any blanket “no credentials ever used against
Webex” or “no live inspection ever performed” claim. Do not broaden their prior
authorization to cover a new reconnect, OAuth flow, post, receipt or device test.
Historical test counts and styling observations are not fresh integration runs.

Current native changes are implemented and offline-validated, not live activated; integrated
evidence belongs in [implementation progress](implementation-progress.md). The
user approved presence-only implementation, then requested
[default-on passive client features](people-popup-design.md), without
installed configuration/grant changes or live queries. `:WebexPeople` /
`<leader>Wp` opens a navigable native local snapshot, while automatic presence
stays in the DM header/Spaces cues. Inspection/local `r` never look up a person;
`:WebexPeopleRefresh` is the separate explicit provider read. Keyboard ownership
and integrated mocked behavior have passed offline checks. Custom-status text is unsupported by the
public REST provider here. Presence freshness/policy/interoperability remain
**NOT RUN**; implementation approval does not complete those live checks. See
[people status](people-status.md) for the supported subset and precise blocker.

## Arrange the test before joining

The local operator must provide/approve:

1. A non-production Webex test meeting and permission to join via the SDK.
2. A second authorized participant using the native Webex app or supported browser,
   available for about 15 minutes to verify both directions of media.
3. A separate disposable/test **Webex space**, both users already members, its
   exact title/room ID, and approval to post the agreed string below. Meeting
   attendee authorization alone is **not** authorization to message a space.
4. Either a short-lived token with meeting participation rights and, for messaging,
   `spark:rooms_read`, `spark:messages_read`, and `spark:messages_write` (or
   applicable broader grants). The token is entered **locally into the hidden
   app prompt only**, never into chat, source files, shell arguments, logs or
   screenshots. Do not send it to the agent. **Alternatively**, follow
   [OAuth setup](oauth.md): register the exact loopback URI, configure public
   client ID/scopes, and supply the client secret through the hidden prompt or
   optional owner-only `oauth.clientSecret` config field (0600).
   The native editor requires that private field rather than a buffer prompt.
   Review/approve Webex consent yourself. Never include the private file or secret
   in the evidence; the earlier approved startup diagnostic is not authorization
   for this acceptance flow.
5. Permission to activate the intended microphone/camera and share a harmless test
   window. Prepare a non-sensitive chart; do not share the whole desktop if it
   exposes unrelated information. No recording is necessary.

Agree a harmless identifiable string, e.g. `WBX TUI authorized acceptance 1 — 世界`.
Schedule the test directly with the second participant; no invitations are sent
automatically by this repository or plan.

## Local preparation

The primary interface is now the [Vim/Neovim plugin](editor.md). Complete the
isolated editor tests first (`npm run test:editor` and the opt-in meeting/Kitty
variants). For an authorized live editor test, use `:Webex` for messaging and
`:WebexMeeting APPROVED-URL` for the call; configure OAuth and its client secret
only in the owner-only JSON. Do not type credentials into editor buffers.

Also verify `:WebexMeetingKitty` / `:WebexMeetingEditor` retain the media-owner
PID and second endpoint's single participant, drafts survive the switch, closing
the editor detaches without a second join, and `:WebexLeave` explicitly ends it.
All these **live** observations remain NOT RUN. The compatibility CLI procedure
below remains available for engine-only comparison.

```sh
npm ci
npm run check
npm test
npm run build
npm run sdk
npm start -- live
```

Enter the approved meeting link, then the token in the new call's owner pane.
Use Kitty on Linux with tmux for pixel validation. Leave microphone/camera/share
off initially. Never use production spaces as a fallback if test access fails.
For OAuth testing, launch `npm start -- live --auth oauth --config PATH` with your
profile instead. If storing `oauth.clientSecret` there, restrict it to your user
with mode 0600 and never share that file or include it in acceptance evidence.

## Run and record

Fill in `PASS`, `FAIL`, or `NOT RUN`; no credentials or private meeting/space URLs
belong in this record. Stop on unexpected recipients, publishing or permissions.

| Check | Expected observation | Result |
| --- | --- | --- |
| One join | Second endpoint sees exactly one TUI participant; repeated local launch reattaches | NOT RUN |
| Native geometry | `tmux list-panes -F '#{pane_id} #{pane_pid} #{@wbx_source}'` shows separate participant/share processes | NOT RUN |
| Incoming people | Two remote cameras have distinct correct names/pixels; mute/off retains presence; leave promotes primary without old imagery | NOT RUN |
| Incoming audio | `a` plays approved remote audio, including a received shared-screen sound if supported | NOT RUN |
| Preview isolation | `c` shows local NOT SENT preview; second endpoint receives no TUI camera/microphone | NOT RUN |
| Outgoing microphone | `m`, explicit browser confirmation and permission produce audible speech remotely; second `m` stops it | NOT RUN |
| Host mute | Host mutes TUI microphone; no automatic unmute; local capture stops | NOT RUN |
| Outgoing camera | `v`, explicit confirmation and permission produce actual remote video; second `v` stops it independently of preview | NOT RUN |
| Incoming share | A remote share creates a native pane and removes it at end; check small text | NOT RUN |
| Outgoing share | `d`, explicit chooser and safe test window are visible remotely; TUI/chooser stop ends sharing; no system audio promised | NOT RUN |
| Space destination | `x` lists authorized spaces; explicitly select the exact agreed title/ID; UI says NOT in-meeting chat | NOT RUN |
| Space send | Enter the agreed text; second client sees it exactly once in the approved SPACE, not necessarily in the meeting chat | NOT RUN |
| Space receive | Second client replies; TUI receives within about 4 seconds plus network time; author/text/Unicode are correct | NOT RUN |
| Native chat | Open `x` in another managed pane: same space/history; typing media/quit letters does not activate them; Escape restores video | NOT RUN |
| Chat close/failure | `:chat.close` clears selection/stops polling; missing scopes show a nonfatal error; UNKNOWN delivery is checked remotely before any retry | NOT RUN |
| Detach/reattach | Same media owner/SDK participant remains; fresh terminal pixels resume without duplicate join/audio | NOT RUN |
| OAuth consent | Exact integration/scopes; consent/denial handled; optional private secret never appears in config output, arguments, views or logs | NOT RUN |
| OAuth renewal | `:auth.refresh` changes SDK credentials without duplicate participant; media and space delivery work afterward | NOT RUN |
| OAuth revocation/expiry | Approved revoked test grant/failed renewal stops local tracks and leaves; no automatic replay/user switch | NOT RUN |
| Leave | `q`/Ctrl+C leaves once, stops all local capture and chat polling, removes managed panes and leaves unrelated tmux sessions alone | NOT RUN |

If both preview and meeting camera were enabled, disable **both** before checking
the camera activity light. A stopped preview is not proof that meeting-camera
capture stopped. A local frame or successful SDK promise is not proof of remote
delivery: the second endpoint's observation is the acceptance evidence.

## Optional Webex-synced unread acceptance

**Cross-client/receipt acceptance: NOT RUN.** The prior approved startup/status
observation above is narrower than this procedure. This metadata-only test does
not require a meeting, microphone,
camera or screen permission, but it still requires the operator's authorization
to read the agreed test spaces and to send a read receipt.

1. Install `npm run install:read-status`, set `read_status=true` and
   `mark_read_on_open=false` for the initial read-only stage in the editor
   plugin options and approve an OAuth integration grant with `spark:all` and its
   implicit `spark:kms` scope. Do not broaden or reauthorize a grant unattended.
2. In another authorized Webex client, arrange one read and one unread test space.
   Explicitly connect with `:Webex`; compare bold unread titles with that client's
   state. An aggregate unread-status warning means unknown/unavailable, not
   a successful read-status check; no per-space question marks are displayed.
3. Read one test space in the other client. Verify that the SDK's membership event
   clears its marker here without selecting it or moving this editor's focus.
4. Send an agreed message from the other endpoint. Verify its space moves by recent
   activity, the room under the browsing cursor remains the same, and its unread
   marker appears. With `mark_read_on_open=false` still in force, polling or
   opening history must not publish a receipt. Do not invoke manual mark-read.
5. After explicit approval to send a receipt, enable `mark_read_on_open=true` and
   open the agreed unread space with Enter. Confirm exactly its latest loaded
   endpoint is acknowledged only after the successful open, and that the other
   client sees it as read. Alternatively, keep mark-on-open off and use
   `:WebexLatest`, unfold the newest thread/body, then R.
   Verify the other client sees it as read, with no new message posted. Stop if a
   different room or an unviewed newer endpoint would be acknowledged.
6. Check SDK loss/missing scopes retain labeled historical unread/read flags,
   while never-observed rooms stay unknown and receipts remain blocked. Confirm
   health stays out of the spaces header. Check token renewal replaces the metadata SDK child, never
   the independent media owner, and no provider objects/credentials appear in
   editor output. SDK event/read-status acceptance remains NOT RUN until these
   observations are recorded by the authorized operator.

## Optional threaded-reply acceptance

**NOT RUN.** This needs separate operator approval to read the agreed space and
post a reply to an agreed parent message. Approval to join a meeting or to inspect
read status is not permission to publish threaded messages. Use the existing
messaging scopes; do not broaden grants or reconnect an active session unattended.

1. In the approved test space, arrange a parent containing Markdown headings,
   a code example and sender-looking text, plus an actual reply and an intervening
   top-level message. Verify borders distinguish header/body, roots stay
   chronological and replies are grouped chronologically beneath their root with
   a two-column indent. Root-header `za` must hide reply headers and bodies but
   not unrelated roots; inner body choices survive opening the thread. Quotes
   alone must not create threads. `threaded_history=0` retains the legacy timeline.
2. Retain a normal unsent draft. Use history `<localleader>r` / `:WebexReply` on
   the agreed parent; inspect **Replying to …** and `:WebexDestination` before any
   send. Type a harmless agreed reply, cancel, and return to that thread. Both
   normal and reply drafts must survive; Enter/cancel must publish nothing.
3. After explicit approval, send once with the normal explicit send gesture. The
   second client must see exactly one reply under the agreed parent in that
   space, not a new top-level message or a message in another thread. Check reply
   selection from an existing answer still uses the same root.
4. Verify late ACKs never erase a normal draft, another thread's draft or newer
   edits. If a real outcome is uncertain, check the other endpoint before any
   explicit resolution/retry. Do not deliberately disrupt production networking;
   failure/mismatched-ACK paths already have synthetic fixtures.

Record only aggregate pass/fail evidence, without private message bodies, parent
IDs or credentials. No agent-run live threaded send is authorized by this plan.

## Evidence and cleanup

- Record terminal/browser/Webex SDK version, operating system and terminal type.
- Keep sanitized pane IDs/PIDs and aggregate render metrics. Do not capture token
  prompts, private chat content, meeting links or other users without consent.
- Note a failed stage and bounded UI error, not raw SDK objects/credentials.
- Quit the TUI, verify device indicators, and expire/revoke the token or OAuth
  integration grant in Webex. Quit does not itself revoke remote authorization.
- Test messages are persistent space content. Remove them manually only with
  space-owner approval; the TUI does not implement message deletion.
- OAuth onboarding/renewal are implemented and fixture-tested, **not live-accepted**
  until the rows above pass. In-meeting chat and access/refresh-token persistence
  remain unimplemented; an optional configured client secret is persistent
  plaintext in the original private file. Developer-token expiry needs a new local token; rejected
  OAuth renewal requires explicit sign-in again.
