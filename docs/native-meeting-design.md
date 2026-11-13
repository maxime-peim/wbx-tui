# Native completion: presence, agenda and independent meeting controls (NC5)

Source-only integration of existing features. No live OAuth, Webex, receipt,
browser/device or installed configuration test/activation is included.

## Contracts

- `WebexPeopleRefresh` / `WvP` explicitly reads the existing selected-peer
  provider, respecting its cache/backoff and explicit opt-out. It does not
  toggle/reopen dismissed or promoted details. Snapshot age is labeled **at
  display**, with a local observation time, not a continuously fresh indicator.
  Rendering still performs no lookup or periodic presence poll.
- Agenda cards show both projected UTC endpoints, local start/end with date and
  zone, and joinability/reasons. Existing bounded horizon, three-card limit and
  backend identity/revision join guards are unchanged. This is not a complete
  calendar. Display conversion is pure; there is no opener or automatic join.
- Compact status reports mic/camera/share/Rx audio/control availability only
  from existing owner observations. Missing/stale states say unknown, not off.
  Detailed status retains last observations and preview explicitly **NOT SENT**.
- `WmP` / `WebexMeetingSources` offers the existing maximum-16 source **slots**,
  never a complete attendee/self/lobby roster. `WmL` / `WebexMeetingLayout`
  exposes existing owned focus, split, close, zoom, grow/shrink and named layouts.
  `speaker` remains compatible fixed main/secondary geometry, **not active-speaker
  following**. There is no layout-save/config write in the native adapter.
- `WmR` / `WebexMeetingAuthRefresh` reaches existing explicit meeting auth
  separately from messaging auth, with no leave/rejoin or grant expansion.
  Existing lowercase `Wm` bindings retain their meanings.

## Finite adapter and acknowledgement

`src/native-panes.ts` admits only typed presentation actions with a positive
revision and exact optional layout/source data. No arbitrary command, renderer,
media, auth, shell/Ex string or config path can enter this adapter.
`meeting.pane` also binds the exact selected meeting session. Messaging readiness
is not a meeting capability gate.

The private viewer broker advertises optional native capability through its
existing **config envelope**. Older viewers ignore additive fields; newer
clients never send native requests to older owners. No unknown unsolicited
worker event or capability-query command disconnects an older peer.
The bounded source roster and revision are carried together in that envelope,
never assembled from independently arriving last-reported media events.
Source/layout revisions fence stale choices at broker admission and again
inside the serialized managed-pane owner action. Editor connection-local
revisions never reuse a prior viewer's capability identity, even in the same
named session. Native meeting epochs also reject away/back and disconnected
choices. Existing pane PID/window/source/owner authorization remains mandatory.
Native actions recheck requester/target identity after asynchronous focus reads.

There is at most one physical native operation admitted per broker and one per
viewer, with a 256-request socket budget. No mutation queue or retry is added.
An ACK is sent only after owner-side completion; errors may follow partial tmux
work and therefore say **unknown**, not definitely unchanged. Timeout/disconnect
also reports unknown; timeout closes the control transport rather than admitting
another request behind uncertain work. ACKs/results are transient, never replayed
as configuration. Existing media stop/leave admission is independent.

No second Webex join/media owner or new renderer implementation was added. All pane work goes
through `CallPanes`, keeps inherited tmux appearance, and cannot close the owner
pane. Presentation does not change transmission; editor exit still detaches.

## Delivery-resolution safety follow-up

The review found native `WebexResolveDelivery` cleared uncertainty **before**
an unbound RPC ACK. `delivery-resolution-before.log` retains the failing
regression. The new `delivery-resolution-v1` capability uses `delivery.resolveBound`
with the exact original room; backend selection/busy checks cannot resolve a
replacement room. Native clearing requires a successful exact ACK, unchanged
intent and the same versioned uncertainty evidence. Failed replies, selection/
focus/edit changes and newer unknown attempts retain uncertainty. Older backends
explain unavailability rather than using legacy unbound resolution. Existing
legacy protocol remains compatible for older clients; the native client never
uses it. Tests that deliberately recover now wait for the ACK before editing/
resending; physical send/receipt assertions were not relaxed.

## Evidence and final acceptance

Under `/tmp/opencode/wbx-native-completion-mm48wuud/`:

- `nc5-model-v1.log`: finite protocol, real private broker/viewer, old-owner
  compatibility, owner completion, stale source revisions, pending disconnect,
  managed-pane authorization and existing native/meeting/viewer tests pass.
- `nc5-native-v1.log`: retained fixture error (editing a read-only spaces view
  while messaging intentionally idle); corrected to unrelated native work.
- `nc5-native-v2.log`: **12 passes** for meeting/presence/agenda/discovery,
  including independent messaging state, full native undo and stale choices.
- `nc5-native-v3.log`: **14 passes** for delivery ACK fencing plus existing
  faults/protocol/replies/keyboard lifecycle fixtures.

### Initial copied gate and retained follow-ups

`nc5-acceptance/` passed TypeScript, five builds, **800 core / 14 explicit skips,
123 native / zero skips, six SDK and 12 initial drawn checks**. Two drawn reply
checks caught destination context preceding the reply marker; four drawn
faults/protocol invocations hit missing CLI registrations. All original failures
remain. `nc5-drawn-followup/` copies that exact application plus a recorded
reply-first native-banner correction and runner registration change: all six
missing/failing drawn checks pass (**18 drawn checks with lineage**, not an
initially clean run).

The later paired-roster and post-focus identity safeguards, strict native schema
checks, and extra bound-delivery model regression pass `nc5-model-v3.log`,
`nc5-native-v4.log` and `nc5-check-v4.log`. They are included in the fresh final
integrated snapshot, not retroactively attributed to the earlier phase gate.

The fresh [NC6 integrated gate](native-completion-acceptance.md) passes the current
paired-roster/identity/delivery safeguards: 801 core / 14 deliberate skips,
123 native / zero skips and all 103 drawn runs, plus SDK/cache, synthetic
integrations, research, help and loader checks. The earlier failures remain
unchanged. Live media, native Sections sync, reactions and other exclusions stay
deferred; no activation or commit is implied.
