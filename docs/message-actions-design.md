# F4 own-message actions, Markdown and mentions

Status: strict offline-verified, uncommitted and inactive.
Frozen pre-F4 baseline: `/tmp/opencode/wbx-f4-_5gwl3dz/` (337 sources and ten
original bundle/map hashes). No activation, live request, OAuth change or
internal SDK mutation.

## Explicit consent and conflict policy

- Command-only `WebexEdit` opens a dedicated message-bound native buffer after
  fresh public message details and authenticated self-identity verification.
  Ordinary history annotations and writes never mutate. `WebexEditSubmit` is the
  only edit action, with an explicit per-submit confirmation: preflight detects
  already-visible changes but cannot eliminate races without conditional writes.
  `WebexDelete` uses an exact selected-message confirmation and the same preflight.
- No verified public conditional-write guarantee was found. Never invent ETags,
  updated events or atomic compare-and-swap. A new GET must match the exact
  original raw content/update/parent/author fingerprint immediately before PUT/
  DELETE; any detected change refuses. The confirmation must disclose the
  residual GET/write race and cancellation must be the default. This per-action
  user decision gates the non-atomic policy; merely opening an edit grants none.
- Recheck authenticated self, exact room/message/author and current loaded-room
  authority, plus known people_read/messages_read/messages_write grants (or all).
  Refuse foreign/unknown author, files/cards for edits, malformed source,
  unavailable grants and oversized content. Server restrictions remain
  authoritative. Enforce at most ten observed local successful edits, never
  claim this counts unseen edits in another client; server ten-edit limit applies.
- Server edit text/Markdown is at most 1,000 UTF-16 units / 4,000 UTF-8 bytes,
  still within original composer/RPC limits. Prepared edit contexts hold only
  existing server content, not unsent native text: eight contexts, ten-minute
  lifetime, opaque handles, exact room/message binding. Read-only snapshot output
  does not reveal self tokens, raw author IDs or service URLs.
- Mutation results have their own request-addressed ledger/outcome, not delivery.
  At most 256 outcomes/session, reject further mutations instead of evict/replay.
  Same request/intent returns its outcome, conflicting reuse refuses. One active
  sequence, no queue, 20-second logical lifetime; physical REST admission survives
  cancellation/reset and prevents overlapping native I/O. 401/403/429 are no
  automatic refresh/retry. Post-submission timeout/loss/malformed success is unknown.
  Unknown blocks that message's further mutations until explicit check/resolve.
- Edits mark presentation as edited without becoming creations. Confirmed deletion
  removes only the exact message and leaves reply drafts/annotations intact.
  Deleting a known receipt endpoint cannot authorize an invented earlier endpoint;
  automatic receipt failure memory is unchanged. Public SDK created/deleted
  coverage has no updated mapping; use existing bounded polling for remote edits.

## Markdown and validated mention targets

- Plaintext default. `WebexFormat plain|markdown` is per normal/reply draft and
  does not send. `WebexMention` selects an explicitly refreshed member from the
  shared selected-room membership source. It delegates to Neovim `vim.ui.select`
  (including the user's picker/theme/keybindings) or Vim `popup_menu`, rather than
  painting a custom floating box. The provider may temporarily focus its picker;
  completion is accepted only after the exact buffer/text/session/target returns.
  Selection enables
  this draft's Markdown format/language mode without a second format prompt.
  Native `<@personId:ID|Label>` text is displayed as `@Label` using conceal, not
  replaced with an ambiguous name-based target. Undo and exact send validation
  retain the original markup; explicit plaintext or `conceallevel=0` reveals it.
  Duplicate picker labels include short identity suffixes. F1 cached names may improve inert labels,
  but names/emails cannot substitute structured identity. `WebexMentionAll` is a
  separate conspicuous confirmed action for `<@all>`.
- Mention insertion leaves actual trailing whitespace and a cursor position beyond
  the closing delimiter, so consecutive mentions cannot split each other's markup.
- Message composers suppress native/plugin completion locally; normal files are
  unaffected, and promotion restores only plugin-owned overrides.
- Cancel/Continue confirmations use unique **C/Y** keys, defaulting to Cancel.
  Selection/format changes are not submission consent; per-send membership/@all
  checks are unchanged.
- Manual Markdown can also contain mention markup. Explicit Send/Submit includes
  individual tags without another dialog; @all retains one broadcast confirmation.
  Edit/delete confirmations remain separate. Backend validates supported exact
  markup, at most 16 distinct person
  targets, and fresh selected-room membership for each target immediately before
  write. Do not accept personEmail mentions or arbitrary HTML mention targets.
  Plaintext lookalikes remain literal, never promote them to markup automatically.
- Selected-room roster reads are explicit, max 100 rows/page, 500 retained,
  ten pages, repeated-cursor detection, private validated same-origin next links,
  partial/failed labels, no all-room drain. No presence or avatar lookup. This
  single source also serves F5 roster/permissions, with fresh self/target membership
  reads for writes. Membership removal between read and write remains service-
  authoritative. Room/session changes invalidate snapshots and in-flight work.
- Rich sends use the same prepared-new-message ledger/exact exclusion path as
  F3. Format and target consent enter replay identity. Native ACK clearing checks
  text/tick, draft identity and format; changes during submit retain newer text.
  File uploads initially remained plaintext. The subsequent
  [MF14 extension](messaging-public-provider-audit.md#mf14-markdown-plus-single-file-contract)
  supports separately negotiated Markdown plus one file through the existing
  upload owner; unsupported combinations refuse, never downgrade.

## Evidence references and bounds

Public Messaging Basics retrieved on 2026-11-14 documents `markdown`,
`<@personId:ID|Label>`, `<@all>` and multipart creation:
https://developer.webex.com/messaging/docs/basics .
The public edit reference is indexed as ten edits/no file or attachment edits;
its dynamic page fetch yields navigation only, so is not fresh schema proof:
https://developer.webex.com/docs/api/v1/messages/edit-a-message .
Pinned 3.13.0 `plugin-messages/src/messages.js` confirms PUT/DELETE and no public
updated event mapping. Public conditional semantics remain unverified.

New public metadata/write transport: fixed `webexapis.com:443`, native HTTPS
agent:false, allowlisted public resources only, JSON request <=8 KiB, response
<=256 KiB/1,024 reads, 8-second/request deadline, tracked DNS/stream/socket cleanup.
No SDK, redirect/auth/cookie replay, guessed private endpoints, automatic openers,
downloads, secrets/editor file content or grant expansion. Loopback-only tests
exercise actual HTTP boundaries; no live acceptance is implied.

## Offline verification

Final copied-project gate: `/tmp/opencode/wbx-f4-verification-h4z89hct/`.

| Check | Result |
| --- | --- |
| Core | 723 passes / 14 explicit opt-in skips |
| Native editors | 50 Neovim + 49 Vim fixtures / zero editor skips |
| Drawn private PTYs | 37 Neovim + 36 Vim fixtures |
| SDK/read-status/cache / synthetic messaging / browser controls | 145 / 44 / 3 passes |
| TypeScript, five copied builds, docs, both-editor help | Passed |
| LazyVim | One pass / one optional installed-loader skip |
| Integrity | 350 sources checked; 337 frozen pre-F4 sources and ten original bundle/map hashes unchanged |

Focused evidence: `/tmp/opencode/wbx-f4-_5gwl3dz/`. Tests cover verified own/
foreign/unknown authors, fresh conflict refusal, contexts/expiry/ledger budgets,
ten locally observed edits, malformed canonical creation/root/update ACKs,
separate mutation outcomes, unknown resolution, account replacement/late cleanup,
strict intent validation, bounded roster pagination/cursors/partial identity,
fresh mention targets, literal/rich distinctions, @all, Unicode and exact fields.
The native fixture executes actual demo-backend commands in both editors,
including cancellation, no write/Enter mutation, retained text/undo/focus,
annotations and reply drafts, format changes while sending and deletion without
invented receipt endpoints. Full gates use copied compiled backends.

The first gate `/tmp/opencode/wbx-f4-verification-5hhxb_y_/` passed before an
independent regression exposed incomplete ACK canonical-identity validation.
`ack-identity-before.log` retains the two expected failures; creation/root and
update-marker regressions now pass and malformed ACKs stay unknown, never history
creations. A second gate `/tmp/opencode/wbx-f4-verification-62l202pm/` passed core
and all drawn fixtures but one existing Vim attachment-fault fixture timed out.
Its focused copied rerun passed. The fixture now isolates audits by backend
generation, retaining exact read-count assertions against late stopped-child
writes. The final full gate above passes with that isolation.

Earlier focused native failures (a missing message-row helper and fixture
expression scope) are retained in native-first/v2 logs and corrected without
weakening assertions. Finalization changes only evidence/status documentation,
then rechecks docs and source/build integrity. No live Webex/OAuth/mutation/
receipt/device/desktop acceptance, grant/configuration change, original build,
active-editor reload, commit, push or activation occurred.
