# Private draft recovery

The user requested drafts to survive **editor restarts**, not just closing a
plugin tab. Normal and reply composers now autosave after a 500 ms debounce and
flush on graceful disconnect/shutdown. `persist_drafts = false` disables disk
autosave; no installed configuration is edited by this source change.

## What is stored

- Exact text, room ID, optional reply-root ID, Plain/Markdown format and a
  conservative delivery-uncertainty flag.
- At most 64 drafts in one account/profile document, up to 1 MiB total.
- Native autosave patches one item at a time under the existing 32 KiB RPC frame
  limit; an item above 24 KiB JSON-encoded is refused with a warning, not truncated.
- No tokens, client secrets, user configuration, profile details, file contents,
  upload handles, mention-consent flags, receipt authority or mutation handles.

Draft text is sensitive **plaintext on local disk**, not an encrypted vault.
The folder is `$XDG_STATE_HOME/wbx-tui-drafts/` (otherwise
`~/.local/state/wbx-tui-drafts/`), mode `0700`; files and locks are `0600`.
Only current-user-owned regular, singly linked files are accepted; symlinks,
unsafe permissions, corrupt/unknown documents and excessive storage are refused.
Atomic temporary-file writes use exclusive creation, file sync and rename.

## Account isolation and restore

`:WebexDrafts` explicitly opens an account-verified local inventory **before**
each composer/reply exists. It reads the existing recovery records, not Webex or a
second draft registry. Rows distinguish saved, queued/saving and unsaved/oversize
text; the view is an inert metadata snapshot (`r` refreshes it locally).

- Enter / `:WebexDraftExport` copies exact text to an ordinary native buffer with
  swap/undo-file/modelines disabled. Write to a chosen file explicitly. Unloaded
  or inaccessible reply roots remain exportable without fetching history.
- `:WebexDraftRestore` requires the exact already-selected ready space and, for
  replies, an already-loaded root. It never selects/fetches a destination, replaces
  newer native text, restores files/consent or sends. Existing/promoted/conflicting
  buffers are retained; export is the safe alternative.
- `:WebexDraftDiscard` asks before discarding saved **text**, refuses a destination
  still owned by a native buffer/pending send, and preserves unresolved-delivery
  evidence. It is **not** `:WebexResolveDelivery`. A failed local save may leave
  older disk text; queued/unsaved rows are not claimed as durable.

The loaded-spaces Drafts filter includes verified unopened recovery work and
unresolved recovery evidence. `[draft]` / `[reply draft]` denote instantiated
native work; room-level `[saved]` / `[unsaved]` summarize verified record storage.
Both may appear when different roots/revisions have different states; the index
shows exact destinations. Account changes, unavailable verification or disk opt-out
prevent stale index actions; already-exported native user text is never erased.

Live restore requires a verified `/people/me` identity under the already-granted
People-read scope. It shares the existing spaces-cache identity lookup when
possible; there is no OAuth renewal, new grant or directory scan. The storage key
hashes the account together with the absolute configuration/OAuth profile. Another
account/configuration cannot adopt its data. Demo drafts have a distinct profile.
Without verified identity, native buffers remain in memory and a warning explains
that restart recovery is unavailable.

Restoration fills only an unchanged empty composer for the exact room/reply root
when the user opens it. It does not select a room, read history, mark read, send,
or recreate a recipient-first DM/edit preparation. Current nonempty/newly edited,
annotated, promoted or differently bound buffers are never replaced. Retained
same-editor buffers keep native undo; a fresh editor restores text/format, not an
undo-file or transport authority. Each disk draft is considered for restore only
once per session, not resurrected whenever a composer is recreated.

Recovered pending/unknown deliveries retain the existing inspection/explicit
resolution requirement. Recovery never retries a send. Mention-bearing Markdown
still needs per-submission consent and fresh membership validation. Attachment
handles/prepared edits are not restored; select/prepare them again deliberately.
Markdown grant/mention-validation failures before the message POST are definite
not-sent outcomes, not unknown deliveries; they retain the draft without blocking
the next deliberate send. Explicit server refusals remain failures with a bounded
HTTP-status diagnostic. Possible writes after submission still require checking
Webex and explicit resolution. This does not clear already-restored uncertainty
or automatically retry a failed request.

## Clearing and failures

Confirmed matching sends clear only the exact unchanged native draft, then patch
that destination out of storage. Newer text/format/destination/revision wins over
an old acknowledgement. A transient editor write lock retries only the local
clear with the same guards, never repeats the POST. Explicitly erasing a draft's
text also removes that saved text after autosave.
If the editor permanently refuses clearing, the unchanged confirmed-sent copy is
not saved as an unsent draft and cannot be accidentally sent again. Editing it
creates new draft work; no old acknowledgement may erase that newer revision.

Concurrent writers use an optimistic document revision and exclusive lock.
Conflicts preserve the newer disk version and current native text, with a visible
warning; resolve/export the retained buffer before quitting. Stale locks are not
silently removed because another editor may own them. Disk/permission/size errors
likewise warn instead of silently deleting older user work.

Graceful restarts are covered by separate-process Vim/Neovim tests. Abrupt
termination, power loss, disk failure and unresolved concurrent-editor conflicts
are **not** a lossless-recovery guarantee. Edits made in retained buffers after
disconnect, without an available verified storage backend, must be exported
explicitly if a warning says they were not saved.
