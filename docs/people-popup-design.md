# Client defaults and people details presentation correction

## Restored compact summary and quiet renewal

The user requested the selected-DM float back. A small passive presentation
owner (`autoload/wbx/people_popup.vim`) now renders only the existing published
snapshot; it never fetches. The full `:WebexPeople` native snapshot remains
available for complete text/search/copy and dismisses the float for that
selection. Focus, full undo, dismissal/promoted text, opt-out and conservative
receipt-obscuration guards are preserved.
An annotated/promoted overlay retains geometry-only receipt protection even
after dismissal or session replacement; it is never repainted or reclaimed.

Same-grant credential renewal retains the existing People provider/viewport
and minute refresh instead of clearing observations with no native report to
restore them. Known stale observations keep their status icon while neutral;
never-observed/withheld/expired data remains unknown, not guessed Busy/Offline.
Meeting 📹, call 📞 and DND ⛔ are distinct even without color. Reaction pickers
now use emojis consistently with inline history; explicit text fallback stays.
The historical UI changes below describe earlier decisions, not this follow-up.

## Historical native-details follow-up (superseded above)

The [native UX review](editor-native-ux-review.md) replaces the automatic popup
with on-demand navigable **native local text**, not with a disabled provider.
Passive presence remains automatically visible by default in the selected-DM
header and Spaces cues; `people_status=0` remains an explicit opt-out.
`:WebexPeople` / `Wp` opens `wbx://people-details` using shared native-list
ownership, local `r` regeneration, exact-window `q` return and native search/copy.
It performs no `people.lookup`. `:WebexPeopleRefresh` is the separate explicit
provider read, guarded by known enabled capability/grant, a ready selected DM
and matching room association. From details, clean owned snapshot room/session
metadata adds only a refusal guard, never provider authority.

Callbacks never repaint, close, reopen or focus snapshot text; full native undo,
annotations/promoted buffers, opt-outs and mapping conflicts are preserved.
Enter/write never send or acknowledge. Complete Unicode fields and freshness
labels remain readable in narrow splits without color or syntax. Existing
snapshots are inert text; newly generated opted-out snapshots mask retained
People fields. Passive provider/viewport pacing, backend and SDK are unchanged.
The overlay-specific lifecycle and duplicate ownership state are removed;
the unchanged endpoint guard's `obscures()` compatibility hook returns zero
because ordinary native splits never overlay history.

Current verification is tracked in the [verification index](verification-index.md).
The sections below retain historical popup requirements and acceptance evidence;
they do not prescribe the current UI or establish live/operator accessibility.

## Historical UI-review follow-up

Normal popup content is now only status, name and available last activity:
no command/configuration instructions or “Snapshot only” disclaimer. The engine
refreshes the selected/visible direct-peer set every 60 seconds, honoring existing grants,
singleflight, deadlines and Retry-After; the presentation itself never fetches.
Spaces show theme-overridable presence circles from up to eight session-bound
verified observations. Visible direct rows load without being opened, following
the list viewport/cursor within the shared eight-peer budget. Stale/unknown peers
are neutral; groups/cached rows have no dot, and offscreen peers are not scanned.
The dated gates below predate this follow-up and do not accept it; see
[current verification](verification-index.md). Native ownership, undo, dismissal,
focus and receipt-obscuration safeguards are unchanged.

Status: **automatic visibility implemented and strict copied-build
integrated verification passed; uncommitted/inactive**.
The earlier defaults/presentation evidence below combines a retained full
attempt with passing affected-tier revalidation; it predates automatic visibility.

## Automatic visibility correction

The user clarified that default-on means **visible by default**, not only an
enabled provider hidden behind `:WebexPeople`. The selected direct conversation
now automatically shows its compact people popup on normal native rendering,
without a feature opt-in or command. The toggle is only for dismissal/restoration.
The existing `people_status=false` opt-out remains respected.

- Automatic display consumes the selected-peer snapshot already supplied by the
  backend. No extra lookup, RPC, polling, grant probe or receipt follows.
  Unknown, disabled-session and unavailable/missing-grant states stay visible
  rather than requiring a command to discover why presence is absent.
- Dismissal/click-close or promotion is respected for the current selection.
  Another conversation or a new session gets default presentation again.
  Unchanged publications do not recreate the popup.
- Only a visible, owned, unedited history for that selected direct conversation
  can anchor automatic details. Group/disconnected/hidden/annotated views and
  unrelated tabs do not get one; returning to the conversation tab restores it.
  The explicit command retains its focus-neutral local fallback.
- Pending explicit lookup replies stay generation/room/ownership fenced.
  User-promoted copies survive later automatic presentation for another person.
- Neovim's non-entering float APIs still synchronize the current buffer's undo
  block. The popup restores only an already-unsynced block when the originating
  window/buffer/tick/undo sequence are unchanged; intervening edits cannot be
  joined. Tests compare the entire undo tree, not only its sequence number.
- A frame intersecting the newest displayed endpoint's screen row conservatively
  blocks receipt admission. Closing the popup never sends/retries a receipt.
  The covered/revealed endpoint checks run in both private drawn editors;
  undrawn Vim Ex views remain ineligible, never guessed visible.

Current-task frozen inputs and retained focused attempts:
`/tmp/opencode/wbx-people-auto-oh3loocj/`. Prior verification is not reused as
proof of this runtime change.

### Automatic visibility integrated gate

Fresh passing gate: `/tmp/opencode/wbx-people-auto-verification-mxak6iqz/`.
No results were carried forward from earlier gates.

| Check | Fresh result |
| --- | --- |
| TypeScript and five copied builds | Passed |
| Core | 764 passes / 14 explicit opt-in skips |
| Native editors | 52 Neovim + 51 Vim passes / zero editor skips |
| Private drawn PTYs | 39 Neovim + 38 Vim passes |
| SDK/read-status/cache, synthetic messaging, browser controls | 145 / 44 / 3 passes |
| Opted-in reaction/Sections research | Five passes; no runtime approval or native I/O |
| LazyVim | One pass / one optional installed-loader skip |
| Both-editor help | Passed |
| Integrity | All 368 copied sources and 368 frozen pre-change sources matched; ten task-start bundle/map hashes unchanged |

Normal coordinator rendering is exercised without a `WebexPeople` invocation;
automatic lifecycle checks cover unavailable grants, fresh updates, unchanged
publications, opt-out, dismissal, conversation/session changes, unrelated tabs,
promotion and annotations, with zero added RPC. Covered/revealed endpoints are
checked in both actual drawn editors. Full native undo trees remain unchanged.

Retained focused failures distinguish actual defects from fixture setup:
`auto-before.log` reproduces the missing automatic popup.
`auto-focused-v1.log` exposed Neovim float creation synchronizing the draft's
undo block; production code now preserves that preexisting block instead of
relaxing the assertion. Later attempts corrected a synthetic fresh snapshot
missing required observation time, a wrap-sensitive wording assertion and
Vim Ex's undrawn zero screen coordinates. Mandatory positive visibility checks
remain in both private drawn PTYs; headless Vim conservatively stays ineligible.
`auto-focused-v5.log` and both `auto-drawn-v1-*.log` pass.

All 75 backend sources are unchanged by this follow-up; an already compatible
backend needs no rebuild for automatic presentation. Only this report and the
verification index changed after the integrated gate. Final documentation,
source/bundle integrity, unchanged commit and empty staging are recorded in
`docs-final.log`, `docs-final.json`, `final-sources.json` and `finalization.json`
at the fresh gate path. No active editor, installed configuration, live service,
OAuth/grant, receipt, media/device, dependency, commit or push was changed.

The reported screenshot showed `Presence off (opt-in)` in an unbordered,
editor-relative top-left float. This is a disabled-session state, not proof a
person is offline or the service denied access. The popup placement was a UI
defect; a new setting cannot retroactively enable an already-connected backend.

The user subsequently requested that supported Webex-client features be enabled
by default. This supersedes the earlier default-off choices for native presence,
unread sync, spaces cache and sender names. Explicit false/0 still wins;
lower-level engine/RPC omitted flags remain false for compatibility.

| Native option | New default | Existing prerequisite / effect after explicit connection |
| --- | --- | --- |
| `people_status` | true/1 | Selected-direct peer snapshot, existing People/member grants; no roster-wide polling |
| `read_status` | true/1 | Existing optional SDK and known `spark:all` including KMS; same SDK owner/device/listeners, not a second registration |
| `spaces_cache` | true/1 | Verified account/profile key and private metadata-only disk cache; stale restored flags never authorize receipts |
| `notifications.sender_names` | true/1 | Existing known People grant and bounded directory; `preview=false` hides both sender and excerpt |

No editor-startup connection, automatic dependency install, OAuth/grant change
or retry is introduced. Missing prerequisites show unavailable rather than
bypassing checks. Existing receipt endpoint/visibility/one-shot checks and media
transmission-off/detach defaults remain unchanged. Attachments, edit/delete,
grouping, roster and Teams already have explicit commands without feature flags.
Markdown remains per-draft so literal text cannot unexpectedly ping. Reactions
remain unimplemented under the separate research stop gate, not a disabled setting.

## Presentation and ownership

- Keep the existing `people_status` session/grant contract and selected-DM-only
  provider. No installed config edit, implicit reconnect, OAuth/scope expansion
  or live presence test is part of this correction.
- `:WebexPeople` uses the selected conversation's visible history pane, even when
  invoked from the composer or spaces pane; otherwise it anchors to the invoking
  window. Details appear inset at the pane's top-right, not editor top-left.
- Neovim uses a rounded, nonfocusable native float and the colorscheme's
  `NormalFloat`/float border. Vim uses a rounded native popup with standard
  `Pmenu`/`Comment` styling. No colorscheme/global highlight is replaced.
- Content is compact: status/name/available observation metadata and a dismissal
  hint. Disabled state gives the actual `people_status = true` option and explains
  that it applies to a new connection; irrelevant feature disclaimers are not
  dumped over the conversation. Full inert `wbx#people#lines()` reporting remains
  compatible for existing callers.
- At most 64 inner columns, further constrained to the anchor pane; Unicode text
  wraps by display width, and height is capped within the pane. Tiny views use
  one actionable message rather than a clipped popup/text wall.
- Pane/terminal resize reflows only when geometry changes and never requests
  presence. Repeated resize events do not repeatedly reopen the window.
- Preserve focus, draft text/tick/undo, history annotations and the existing
  keyboard toggle. Late responses cannot reopen a dismissed view, follow the
  cursor to another pane or replace an ordinary buffer reused in the anchor.
  Edited/renamed/retyped user-promoted popup copies remain untouched under the
  existing ownership checks.

## Offline verification

Frozen pre-change inputs and focused evidence:
`/tmp/opencode/wbx-presence-ui-52fpzpgt/`.
Regressions reproduce the original editor-top-left/unframed behavior before
the fix in `popup-before.log`. Both-editor ownership and new pane-layout fixtures
now pass; private drawn PTYs verify real text cells over the conversation.
No live account/configuration/editor is used. The prior F1–F5/R6 gate does not
establish this later UI/defaults change.

### Copied-build verification and retained failure

The full attempt `/tmp/opencode/wbx-client-defaults-verification-g8rja_6w/`
remains unchanged with `summary.json` reporting **`ok:false`**. It passed
TypeScript, five copied builds, 763 core checks (14 explicit skips), all 77 drawn
fixtures, 145 SDK/cache checks, 44 synthetic messaging checks, five research
checks, three browser-control checks and both-editor help. Native coverage passed
102/103: `Vim/chunked-faults` timed out waiting for its exact physical-read count.
LazyVim passed one check and skipped its optional installed-loader check.

The fault fixture restarted synthetic backends while retaining the previous
room publication; its old one-row readiness check could accept that older child.
Each child now publishes its inherited `WBX_ATTACHMENT_GENERATION` in the
synthetic room title, and the fixture requires that exact generation before
selecting. Per-child audit isolation and every exact-read-count, canceled-intent,
no-launch/no-temp-file and draft-safety assertion remain intact. No runtime
attachment behavior was weakened.

Passing revalidation: `/tmp/opencode/wbx-client-defaults-affected-zjxol088/`.

| Freshly run check | Result |
| --- | --- |
| TypeScript and five copied builds | Passed |
| Complete native suite | 52 Neovim + 51 Vim passes; zero editor skips |
| Every changed fixture-backend consumer in private drawn PTYs | Eight passes: typed attachments, chunked attachments, chunked faults and chunked lifetime, in both editors |
| Documentation and popup ownership | Eight passes |
| Both-editor help tags | Passed |

`provenance.json` and both SHA-256 source manifests bound the carried results:
364/368 source files were identical to the full attempt; only the two synthetic
fixture files and the optional-SDK/persistent-unread guidance changed before
revalidation. All four fixture-backend consumers were rerun. The affected
documentation/ownership subset of core was rerun; unrelated successful core,
SDK/cache, messaging, research, browser, LazyVim and 69 drawn checks are carried
from the retained attempt, **not claimed as freshly rerun**. Suites overlap;
their counts are not additive unique coverage.

At revalidation, all 368 copied sources, 366 frozen task-start sources and ten
task-start bundle/map hashes matched; the prior failed copy also remained intact.
All 75 backend `src/` files are unchanged by this follow-up, so an already
compatible backend needs no rebuild for these native defaults/UI changes.
Final evidence/current-default wording edits are documentation-only, checked
separately by `docs-final.log`, `docs-final.json`, `final-sources.json` and
`finalization.json` at the passing revalidation path.

Retained intermediate failures: Vim represents an all-one border as `[]` in
`popup_getoptions`; tests now assert the actual top/bottom/side geometry.
Its popup text origin is `popup_getpos().core_*`, rather than the same
`screenpos()` coordinates as Neovim; drawn tests still require the actual `P`
cell from `Presence off`. A narrow headless pane exposed overly long disabled
guidance; the wording was shortened rather than dropping the compactness check.

No original build is produced or substituted. Build fingerprints are captured
from the checkout at this task's start (they had changed since the earlier task)
and remain unchanged by this work. Changes remain uncommitted/inactive. Preserve
unsent memory-only drafts, then restart the editor and explicitly connect when
ready; never hot-source the coordinator. Existing sessions keep their original
startup flags, and explicit false/0 overrides still win. No live Webex/OAuth,
receipt, device, grant-expansion or dependency-install acceptance was performed.
