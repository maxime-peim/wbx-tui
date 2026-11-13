# Session-only Webex OAuth onboarding and renewal

For the compatibility **meeting CLI**, OAuth is opt-in: `live --auth oauth`.
Default CLI `live` still accepts a hidden developer token (`--auth token`).
Native editor messaging (`:Webex`) and standalone `messages` select configured
OAuth automatically; developer-token prompts are not a native-editor interface.
No OAuth grant is requested in demo mode.

This document's owned-browser instructions describe **meeting** mode. Standalone
`messages --auth oauth` uses the same Node-owned confidential client/loopback flow
but opens your **system browser** with `xdg-open`, then updates the Node REST
client directly. It does not start an SDK/meeting browser, manage browser cookies
or close your system browser on quit. See [messaging setup](messaging.md).

Native messaging uses that system-browser/Node REST flow too, but requires
`oauth.clientSecret` in the private engine JSON rather than a hidden terminal
prompt. See [the editor prerequisites](editor.md#live-oauth). REST-only messaging
needs no browser Webex SDK or Chrome worker. Live meetings additionally need
`npm run sdk`; optional unread metadata instead uses its separate
[Node SDK install](../optional/read-status-sdk/README.md). These are distinct
dependencies and authorization surfaces, not interchangeable setup steps.

## Local setup — operator action required

1. Create/select your **own authorized Webex Integration** at
   <https://developer.webex.com/my-apps>. Do not distribute an embedded shared
   client secret. This confidential-client flow is for an operator controlling
   their local integration and machine.
2. Register the exact callback, for example:
   **`http://127.0.0.1:53682/oauth/callback`**. Only literal IPv4 loopback, a fixed
   non-privileged port, and that path are accepted. `localhost`, wildcard
   interfaces, query strings and fragments are rejected. Match the registered
   URI byte-for-byte; choose another port if occupied.
3. Choose organization-approved scopes needed for SDK meetings and desired
   messaging. Match the integration's generated authorization URL, including
   `spark:kms` when encrypted content requires it. Some SDK calling features need
   `spark:all`: this is **broad full user-account access**, not a harmless default.
   The app never silently adds scopes. Meeting REST scopes alone do not establish
   SDK interoperability.
4. Put your integration settings in `~/.config/wbx-tui/config.json`. For example, if
   broad SDK access has been expressly approved:

   ```json
   {
     "oauth": {
       "clientId": "REPLACE_WITH_YOUR_REGISTERED_CLIENT_ID",
       "redirectUri": "http://127.0.0.1:53682/oauth/callback",
       "scopes": ["spark:all", "spark:kms"]
     }
   }
   ```

   **Optional:** add `"clientSecret": "YOUR_SECRET_ENTERED_LOCALLY"` inside
   `oauth` to skip the hidden secret prompt. This is plaintext secret storage:
   keep this file out of version control, backups/shared folders and screenshots.
   First restrict it to your own user:

   ```sh
   chmod 600 ~/.config/wbx-tui/config.json
   ```

   A secret-bearing config must be a regular file owned by your user, with no
   group/other permissions (0600 or read-only 0400). Unsafe permissions fail closed
   rather than silently prompting. Without this optional field, only the public
   profile is stored and the app asks for the secret locally at each login.
   Access/refresh tokens still cannot be stored in config. `--print-config` and
   `config` omit the secret; `--check-auth` reports only whether it is configured.

   Narrower messaging grants include `spark:rooms_read`, `spark:messages_read`,
   and `spark:messages_write`; these alone do not promise meeting participation.
   This version validates explicit `spark:`/`meeting:` user scopes. OpenID identity
   login and administrative scope profiles are not supported.

5. Build/fetch the SDK and launch:

   ```sh
   npm run build
   npm run sdk
   npm start -- live --auth oauth --config /path/to/your-public-config.json
   ```

6. Enter the approved meeting link. The owner reads `oauth.clientSecret` from your
   private config if present; otherwise enter it into the **local hidden prompt**.
   Never put it in CLI arguments, source files, screenshots or a message to the
   agent. The secret is stripped from shared config and passed only to the Node
   OAuth owner; it never enters the tmux bootstrap, browser or viewer IPC.
7. Sign in and approve Webex's integration/scopes in the app's **owned,
   off-the-record browser tab**. Verify the application identity and permissions
   yourself. Closing the tab or Ctrl+C cancels. No media is captured/published by
   signing in. After authorization/token checks, the tab closes and the same
   owned browser joins once behind the real tmux views.

The callback listener exists only during onboarding. Concurrent logins on the
same callback port are refused; existing calls are untouched. Repeating a running
call's launch attaches its owner without another authorization or meeting join.

## Renewal while the call runs

Native editor joins can now [reuse the connected login](shared-meeting-auth.md)
instead of running steps 6–7 again. Its single detached Node grant owner serves
private leases to messaging and the independent media owner; no rotating grant
is copied between active owners. Discovery scope alone is insufficient for SDK
calling; missing supported access fails explicitly, never by adding consent.
The standalone login flow above remains available without a connected login.

- During a call, the integration secret and refresh token stay **in Node owner memory**.
  A user-configured `oauth.clientSecret` also remains in its original private file;
  access/refresh grants are never written there.
  Only access credentials, expiry/scope and public client ID reach the private
  browser worker. The SDK receives an inert `refresh_token: "owner-managed"`
  marker and `config.credentials.refreshCallback`, which asks Node for renewal.
  Real refresh grants/secrets never reach the browser, frame broker, other panes,
  status events or metrics.
- The owner schedules renewal before returned access expiry, conservatively
  accounting for request elapsed time. It invokes public
  `sdk.credentials.refresh()`; the callback, SDK-triggered renewal and concurrent
  requests share one in-flight Node grant. Public SDK credential access verifies
  adoption before rearming the expiry deadline. No second registration/browser/
  join is used. The public client ID permits the SDK's own scope-reduction flow
  without exposing the integration secret.
- A Node timer is necessary because the pinned SDK does not reliably arm its
  *initial* refresh timer for credentials hydrated from supplied attributes. Long
  lifetimes are chunked to avoid Node timeout overflow. The old hard expiry stays
  in force until the SDK acknowledges new credentials. SDK-facing expiry is
  conservatively shortened for unusually long grants to keep its own browser
  timers below the signed 32-bit limit; it may renew earlier, never later.
- Rotated refresh tokens replace the old value. Omitted refresh tokens retain
  the previous one; omitted lifetimes never invent an extension. Returned access/
  refresh lifetimes are used rather than assumed fixed durations.
- `:auth.refresh` explicitly requests renewal for authorized acceptance testing.
  No token is displayed. Auth method and bounded status appear in managed panes.
- Denial, expired/revoked grants, malformed responses, network uncertainty,
  missing adoption or deadlines stop local media and end the call. A failed or
  uncertain grant is **not automatically replayed**: its response may have been
  lost after rotation. Start a new call and sign in explicitly. The app never
  silently changes users or broadens consent.

## Security and retention

The flow uses Authorization Code + **PKCE S256**, fresh 256-bit state, exact
redirect/Host/path/method checks, single-use callbacks, a three-minute login
deadline, and bounded 15-second token requests. Duplicate fields/wrong states are
rejected without consuming the legitimate flow. There is no implicit grant,
arbitrary token endpoint, open redirect or token-in-URL exchange. Token POSTs use
TLS at the fixed Webex endpoint and refuse redirects. Constant callback responses
have no-store/no-referrer/CSP headers; raw provider errors are not shown/logged.
No OAuth secrets enter the tmux launch bootstrap or native-view socket.

Login grants are **session-only**, not a credential vault. The optional client
secret field is persistent plaintext configuration, not a remembered login. No
access/refresh-token disk cache, user-facing remember-me/import/export or integration-secret
environment variable is used. Quit does not delete your configured client secret.
Each consumer closes its own runtime references/timers and owned UI resources.
With shared authorization, another active lease keeps the grant owner alive;
closing messaging is not meeting logout/leave. The last lease triggers memory-only
owner shutdown after a ten-second idle grace. JavaScript strings are not guaranteed securely erased;
OS swap, same-user process inspection, crash dumps, browser internals and hard-kill
cleanup limits still apply. Use a trusted machine. Quit does **not** revoke remote
Webex grants; revoke the integration/test authorization through Webex when needed.
The rotating refresh token stays in one Node authorization owner, never the media
browser, viewer broker or read-only pane. See [lease lifetime](shared-meeting-auth.md).

This is API authorization, not OpenID identity verification. ID tokens are not
requested/trusted. Scope consent/org policy still govern operations. OAuth does
not turn space messaging into the unavailable public in-meeting chat API.

## Evidence and provenance

- [Integrations](https://developer.webex.com/docs/integrations) and
  [authentication](https://developer.webex.com/docs/authentication): confidential
  client code exchange and refresh form parameters.
- [Login with Webex](https://developer.webex.com/docs/login-with-webex): PKCE S256,
  query callback response, and client-secret requirement at the token endpoint.
  PKCE does not remove that Webex requirement.
- [Local OAuth tutorial](https://developer.webex.com/docs/run-an-oauth-integration)
  and [scope guidance](https://developer.webex.com/docs/integration-scopes).
- Pinned [Credentials](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/webex-core/src/lib/credentials/credentials.js)
  and [Token](https://github.com/webex/webex-js-sdk/blob/v3.13.0/packages/%40webex/webex-core/src/lib/credentials/token.js):
  public `refresh()`, `getUserToken()`, `change:supertoken`, refresh callback and
  expiry-based credential representation.

`test/oauth.test.ts` uses real local HTTP provider/listener fixtures for PKCE/state,
rotation, denial, cancellation, timeout, and expiry/adoption cutoff.
`test/browser/oauth.test.ts` uses real Chrome and **actual pinned SDK credential/
messaging plugins**, with external services blocked and provider/HTTP responses
stubbed. It verifies proactive renewal, new API credentials, one join and generated
track cleanup on revocation. These are **not live sign-in/delivery tests**. Follow
[`live-acceptance.md`](live-acceptance.md) with local credentials and an authorized
second participant before claiming interoperability.
