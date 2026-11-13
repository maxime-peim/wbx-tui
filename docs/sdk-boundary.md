# Webex SDK boundary

The browser bundle is pinned to **Webex JS SDK 3.13.0**, with its SHA-256 checked
by `scripts/fetch-sdk.ts` and `src/host.ts`. Public browser APIs below are from
that tag, not inferred from current/unversioned examples. TypeScript interfaces
in `src/browser/webex.ts` and `src/browser/participants.ts` deliberately describe
only this adapter's narrow boundary. Fixtures model that shape; they do not
establish service interoperability.

## Pinned upstream references

All links refer to `webex/webex-js-sdk` tag `v3.13.0`:

- [Meeting](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/meeting/index.ts):
  `join({enableMultistream: true})`, `addMedia`, `updateMedia`, `publishStreams`,
  `unpublishStreams`, `leave`, remote-media and meeting-state events.
- [Media helpers](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/media-helpers/src/webrtc-core.ts):
  `createMicrophoneStream`, `createCameraStream`, `createDisplayStream` return
  helper wrappers with `outputStream`; these wrappers, not preview streams, are
  passed to publication APIs.
- [Members](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/members/index.ts):
  `members:update` includes `full`; `membersCollection.getAll()` seeds the roster;
  `getCsisForMember(id, 'video', 'main')` supplies per-member receiver selection.
- [Member](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/member/index.ts):
  membership, self/paired-self, name, host and audio/video mute fields.
- [Remote media manager](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/multistream/remoteMediaManager.ts):
  named layouts with `memberVideoPanes` and `screenShareVideo`, `setLayout`,
  `getLayoutId`, `setRemoteVideoCsis([{remoteMedia, csi}])`. A null CSI cancels
  that slot's request.
- [Remote media](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/multistream/remoteMedia.ts)
  and [receive slot](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-meetings/src/multistream/receiveSlot.ts):
  `stream`, `sourceState`, `memberId`, `csi`, `sourceUpdate`, `stopped`,
  and `setSizeHint(width, height)`.
- [Rooms](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-rooms/src/rooms.js)
  and [Messages](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/plugin-messages/src/messages.js):
  `rooms.list({max})`, `messages.list({roomId,max})` return `Page.items`;
  `messages.create({roomId,text})` returns the created message. The full Webex
  bundle [registers these plugins](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/webex/src/webex.js).
- [Credentials](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/webex-core/src/lib/credentials/credentials.js)
  and [Token](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/webex-core/src/lib/credentials/token.js):
  public credential refresh/callback and adoption verification. Confidential grant
  exchange stays in Node; see [OAuth setup/provenance](oauth.md).

## Receive and identity

Initial `addMedia` has empty `localStreams` and `sendAudio:false/sendVideo:false`.
Audio/video receive directions are enabled, with three main audio receivers and
one shared-screen audio receiver. Received audio playback itself starts off.
`media:remoteAudio:created` and `media:remoteScreenShareAudio:created` provide
remote-media groups; `media:remoteVideo:layoutChanged` provides layout objects.

`Single` is the initial active-speaker fallback. Once remote roster members are
known, `People` provides 12 receiver-selected slots, pinned by public CSIs. Slots
are not participant identities: every emission checks the selected CSI, live
state and SDK member ID when available. Muted cameras publish no stream but
retain presence. Source generations follow member identity rather than camera
toggles. Roster updates invalidate bindings even while a layout promise is
pending, and replacement layout objects are re-pinned. Selection failures fall
back to `Single` and emit a bounded notice, without another join.

## Send and shutdown

Terminal/browser intent only arms sending. A trusted browser confirmation click
invokes the appropriate helper; no fake-device or permission-auto-grant browser
flags are used by the app. Microphone/camera publication ensures the matching
`updateMedia` direction is enabled, then uses `publishStreams({microphone})` or
`publishStreams({camera})`. Screen publication uses
`publishStreams({screenShare:{video}})` and is video-only. Stopping uses
`unpublishStreams([wrapper])`, **not** `updateMedia({audioEnabled:false})`, which
would also disable receiving that media type.

`OutgoingMedia` disables/stops raw tracks synchronously before awaiting SDK
cleanup, also covering late permission/publish results. `muted:byServer`, track
end, `meeting:self:mutedByOthers`, and `meeting:stoppedSharingLocal` are treated
as off, never automatic unmute. Uncertain update/publish errors prevent new
capture until rejoin. The preview controller has no SDK reference and cannot
publish. Leave closes all local controllers first; browser teardown is the final
hard stop if SDK leave/unregister does not settle.

## Verification limit

Space messaging is not meeting chat. It uses the existing SDK only after explicit
TUI intent and only posts to an explicitly selected space. No meeting URL → room
mapping is assumed. The pinned meeting implementation has a `canChat` policy
field but no public in-meeting chat send/receive API. `messages.listen()` is not
used because its account-wide subscription may hydrate unrelated spaces. Instead,
the selected room's latest 50 messages are polled every four seconds. Attachments
and HTML are not fetched/rendered. Requests are bounded, send IDs deduplicated
within the last 64 requests, and uncertain delivery is never automatically retried
by this adapter. Already dispatched network POSTs cannot be recalled by closing
the UI/call.

`test/participants.test.ts`, `test/outgoing.test.ts`, `test/webex.test.ts`, and
real-Chrome tests in `test/browser/` cover adapter behavior with generated media.
`WBX_SDK_TEST=1` additionally checks the actual pinned bundle loads without an
account and exercises its **actual rooms/messages plugins** through the app with
HTTP responses stubbed. External browser requests are blocked in that test; the
meeting itself remains a fake fixture. This checks plugin request shapes and
`Page.items`, not Webex server behavior. Native tmux tests also send/read local-only
demo chat from a real viewer process and restore its video afterward.
None proves live service negotiation, organization policy, lobby
admission, real received audio, actual remote delivery, or hardware permissions.
Use the [authorized live acceptance record](live-acceptance.md) and
[meeting-engine procedure](meeting.md#manual-acceptance-procedure-not-recorded-results);
enter tokens only
into the app's local hidden prompt, never source files, commands or screenshots.
