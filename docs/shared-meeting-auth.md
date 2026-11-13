# Reusing the connected login for meetings

Status: **implemented and offline-validated; not live activated** (2026-11-09).
This follows the [thread/cache/meeting follow-up](thread-cache-meetings-follow-up.md).
It does not authorize a live login, join, refresh grant, device test, installed
configuration change or replacement of the active build.

## User-visible behavior

- Joining manually or from an upcoming-meeting card reuses the connected native
  messaging login when its known grant contains the supported SDK meeting scope
  `spark:all`. It does not open another sign-in tab or request new consent.
- `meeting:schedules_read` permits discovery, not SDK media authorization. A
  connected grant without supported meeting access produces an explicit error;
  no broader scopes, fallback login or config changes are automatic.
- An in-progress messaging login cannot start a competing meeting login. Account/
  config changes require explicit disconnect; no silent account substitution.
- Without a connected native login, standalone/explicit meeting authorization
  remains available. Existing active calls attach to their single owner.
  Attaching never changes that owner's signed-in account or authorization.
- Browser/device permission and trusted confirmation to transmit remain separate
  from account sign-in. Microphone/camera/share still start off.

## Ownership, not copied refresh tokens

The first connected meeting join freezes the original Node OAuth grant owner and
hands its in-memory state to **one detached `oauth-worker`** over child IPC.
Only after the handoff is acknowledged does the original session discard its
refresh token and integration secret and act as a private client. A failed or
ambiguous handoff fails closed; it never resumes a copied rotating refresh grant.

Messaging and the media owner hold separate leases on a user-owned Unix socket
in a fresh `0700` directory; the socket is `0600`. The tmux launch file/argv
contain only the socket address, not an access token, secret or refresh token.
No credentials enter environment variables, editor RPC, viewer/frame IPC,
status/metrics, files or shell commands. The existing private config may still
contain the user's pre-existing persistent client secret; this change does not
rewrite it. This is a same-user process boundary, **not a sandbox against hostile
code already running as that user**.

The shared owner alone rotates the refresh grant, single-flight across clients.
Version notifications let the other consumer adopt the resulting access token
without issuing another grant. The meeting uses the existing public SDK refresh/
acknowledgement bridge, never private credential mutation or another meeting join.
Both consumers retain expiry/adoption deadlines. An uncertain/denied renewal is
not retried; a hard 17-second owner deadline stops an uncooperative refresh.

Disconnecting or closing the editor releases only its lease. A connected meeting
keeps its lease and renewal capability. Leaving a meeting releases only that
lease, so connected messaging continues. After the last lease closes, the worker
exits and removes its empty private directory after a ten-second idle grace.
There is no persistent token store, remembered-login import or reusable global
account service. Reopening after all leases have ended requires explicit login.

Bounds: eight local clients, one pending request/client, 16 KiB framing/output
limits, three-second initial-request deadline, twenty-second client deadline,
five-second child bootstrap deadline, one native refresh. The fixed HTTPS token
endpoint, no redirects and no automatic failed-grant replay remain unchanged.

## Runtime/build integration

`scripts/build.ts` now builds `dist/oauth-worker.js` alongside the existing four
artifacts. Rebuild and fully restart before activating; never source the main
autoload into an active editor. Preserve unsent memory-only drafts first.

`EditorRPC` connects the internal authorization resolver to `EditorMeetings`;
neither meeting RPC operation accepts a token, secret, lease address or refresh
grant. The hidden `--auth-socket` option is accepted only inside a verified live
`call-worker`, not general CLI/view/demo entrypoints. A media owner verifies the
socket owner/permissions and public client ID before borrowing access. Read-only
viewers keep their existing lazy ownership-import boundary.

## Offline evidence

Mocked/local tests cover one initial login, no sign-in/grant at initial sharing,
rotation coalescing, cross-consumer adoption without double rotation, detached
meeting renewal after messaging disconnect, last-lease cleanup, protected socket
permissions/no token files, malformed requests, grant denial, native timeout,
handoff cancellation/failure, scope/account refusal and RPC credential rejection.
The real detached worker bootstrap/cleanup also runs with synthetic credentials
and a private staged build; no real Webex operation is used.

Final staged project: `/tmp/opencode/wbx-roadmap-verification-aitb_a60/project`.
Logs and summary: `/tmp/opencode/wbx-roadmap-verification-aitb_a60/`.

| Check | Result |
| --- | --- |
| Strict plugin gate | Typecheck, fresh isolated five-artifact build, core, both editors and static LazyVim checks pass |
| Core | **374 pass, 0 fail, 10 intentional opt-in skips (384 total)** |
| Native editor scenarios | **36 pass**, both full Vim and Neovim, no editor skips |
| Separately enabled real lazy.nvim loader | **2 pass**, isolated config |
| SDK/cache checks with pinned SDK enabled | **52 pass**, actual SDK fixtures forbid sockets |
| Messaging | **44 pass** |
| Synthetic browser controls | **3 pass**, no browser/device launch |
| Private drawn PTYs | **12 editor/fixture runs pass**, including grouped navigation, subtrees and upcoming cards |
| Original checkout `dist/` | SHA-256 fingerprint unchanged; active artifacts not rebuilt/replaced |

The 13 new shared-authorization checks include the real detached worker bootstrap
and ten-second last-lease cleanup using synthetic credentials in a private build.
They do not contact Webex or exercise real meeting admission. Counts overlap;
do not sum these suites as unique tests. Runtime/build/test source matches the
final stage; only completion/evidence documentation changed afterwards.

The provisional run at `/tmp/opencode/wbx-roadmap-verification-rbdwtci5/` exposed
a pre-existing wall-clock race in the proactive-expiry fixture: real loopback
renewal had only 20 ms to finish under parallel build load. It now uses controlled
timers/monotonic clock to prove the same exact renewal and unacknowledged-expiry
boundaries. Production expiry/adoption safeguards were not relaxed. The entire
gate was rerun and passed after that change.

No live login, real refresh grant, join, message, receipt, physical device test,
installed configuration rewrite, dependency install, commit or push occurred.
Physical media, actual SDK/server grant interoperability and cross-client live
acceptance remain separate. Preserve unsent memory-only drafts before any later
approved rebuild/restart; do not hot-source the main autoload.
