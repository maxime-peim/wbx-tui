import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('agenda feature depends only on its provider contract, not the application or transport', async () => {
  const source = await readFile('src/upcoming-agenda.ts', 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./upcoming-meetings.js']);
  assert.doesNotMatch(source, /EditorEngine|EditorRPC|MessagingStore|OAuthSession|globalThis|fetch\(/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /private readonly agenda: UpcomingAgenda/);
  assert.doesNotMatch(engine, /upcomingTimer|upcomingValue|upcomingRevision|upcomingKey|reconcileUpcoming|scheduleUpcoming/);
  for (const method of ['snapshot', 'refresh', 'joinTarget', 'start', 'stop', 'reconcile'])
    assert.ok(engine.includes(`this.agenda.${method}(`), 'composition uses the explicit feature port: ' + method);
});

test('feature guide distinguishes implemented ownership from remaining coordinator debt', async () => {
  const guide = await readFile('docs/feature-architecture.md', 'utf8');
  for (const text of ['Adding a feature', 'Tracing an agenda operation', 'Remaining decomposition',
    'physical admission', 'snapshot()', 'not a new service/plugin framework', 'Wnr = Remove Member'])
    assert.ok(guide.includes(text), text);
  assert.match(guide, /Native RPC request channel[^\n]*Implemented/);
  assert.match(guide, /Native transport\/handshake lifecycle[^\n]*Implemented/);
  assert.match(guide, /Backend presence lifecycle[^\n]*Implemented/);
  assert.match(guide, /Backend read-source lifecycle[^\n]*Implemented/);
  assert.match(guide, /Retained unread ledger[^\n]*Implemented/);
  assert.match(guide, /Disk cache ownership[^\n]*Implemented/);
  assert.match(guide, /Backend verified-storage identity[^\n]*Implemented/);
  assert.match(guide, /Backend preference lifecycle[^\n]*Implemented/);
  assert.match(guide, /Backend draft lifecycle[^\n]*Implemented/);
  assert.match(guide, /Demo REST routing adapter[^\n]*Implemented/);
  assert.match(guide, /Demo reaction construction\/state[^\n]*Implemented/);
  assert.match(guide, /Demo recipient-file posting[^\n]*Implemented/);
  assert.match(guide, /Backend provider composition[^\n]*Implemented/);
  assert.match(guide, /Native workspace lifecycle[^\n]*Implemented/);
  assert.match(guide, /Native rooms\/history renderer[^\n]*Implemented/);
  assert.match(guide, /Native room-selection lifecycle[^\n]*Implemented/);
  assert.match(guide, /Native buffer setup\/mapping lifecycle[^\n]*Implemented/);
  assert.match(guide, /Native history activation\/receipt lifecycle[^\n]*Implemented/);
  assert.match(guide, /Native composer send action[^\n]*Implemented/);
  assert.match(guide, /Native successful-delivery clear[^\n]*Implemented/);
  assert.match(guide, /Native textlock presentation[^\n]*Implemented/);
  assert.match(guide, /Native bound delivery recovery[^\n]*Implemented/);
  assert.match(guide, /Native attachment-open lifetime[^\n]*Implemented/);
  assert.match(guide, /Native image request lifetime[^\n]*Implemented/);
  assert.match(guide, /Native meeting action lifetime[^\n]*Implemented/);
  assert.match(guide, /Native delivery ingress[^\n]*Implemented/);
  assert.match(guide, /Native space-picker[^\n]*Implemented/);
  assert.match(guide, /Native meeting-status presentation[^\n]*Implemented/);
  assert.match(guide, /Coordinator review[^\n]*Bounded audit complete/);
  assert.match(guide, /coordinator-audit\.md/);
  assert.match(guide, /not a claim that moving 41 lines fixes the monoliths/);
});

test('native request correlation has one owner and cannot own editor/domain state or start jobs itself', async () => {
  const channel = await readFile('autoload/wbx/rpc_channel.vim', 'utf8');
  assert.doesNotMatch(channel, /wbx#(?:state|transport|drafts|view|reaction_history)#?|bufnr\(|win_getid\(|timer_start\(|job_start\(|jobstart\(/);
  for (const port of ['Ensure', 'Status', 'Send', 'Notify'])
    assert.ok(channel.includes(`.ports.${port}`), 'injected channel port: ' + port);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:(?:next|pending|queue|rpc|features|ready|disconnected)\b/, 'no duplicated request/connection state remains in the coordinator');
  assert.doesNotMatch(coordinator, /wbx#rpc_channel#/, 'the connection composes the channel, not the coordinator');
  const connection = await readFile('autoload/wbx/connection.vim', 'utf8');
  for (const operation of ['call', 'response', 'flush', 'reset', 'next_id', 'diagnostics'])
    assert.ok(connection.includes(`wbx#rpc_channel#${operation}`), 'connection composes ' + operation);
  const receive = coordinator.slice(coordinator.indexOf('function! wbx#_receive'), coordinator.indexOf('function! wbx#_protocol_error'));
  assert.ok(receive.indexOf('wbx#protocol#valid') < receive.indexOf('wbx#connection#response'), 'wire validation still precedes all callback dispatch');
});

test('connection owns negotiation/loss but cannot own domain sessions, workspaces or physical job generations', async () => {
  const source = await readFile('autoload/wbx/connection.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:state|drafts|view|uploads|transport)#|bufnr\(|win_getid\(|timer_start\(|job_start\(|jobstart\(|generation/);
  for (const port of ['Backend', 'Prepare', 'Start', 'Started', 'Accept', 'Stop', 'Running', 'Write', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /wbx#features#reset\(a:owner.features,'session'\)/);
  assert.match(source, /wbx#features#reset\(a:owner.features,'transport'\)/);
  assert.match(source, /wbx#protocol#hello/);
});

test('presence lifetime owns relevance/timers/observations without depending on application/store/worker', async () => {
  const source = await readFile('src/presence-lifecycle.ts', 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./people-selected.js', './people-status.js']);
  assert.doesNotMatch(source, /EditorEngine|MessagingStore|OAuthSession|EditorRPC|ReadStatusWorker|fetch\(/);
  assert.match(source, /this.readOwner \?\?= new PeopleReadOwner/);
  assert.match(source, /this.owner === owner/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /private readonly presence: PresenceLifecycle/);
  assert.doesNotMatch(engine, /peopleTimer|peopleReadOwner|peopleViewport(?:Values|Flights|Cursor)|peopleSpaceCursor|schedulePeopleRefresh|scheduleViewportPresence|scheduleSpacePresence|rememberPeopleStatus|retainedPeopleStatus/);
  for (const method of ['sync', 'snapshot', 'reset', 'start', 'stop', 'pause', 'lookup', 'setViewport', 'setSpaces', 'deselect'])
    assert.ok(engine.includes(`this.presence.${method}(`), method);
});

test('read-source lifetime owns current health/events but cannot own retained unread, disk cache or messaging authority', async () => {
  const source = await readFile('src/read-source-lifecycle.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|MessagingStore|SpacesCache|OAuthSession|ReadStatusWorker|readCache|cachedUnread|writeFile|fetch\(/);
  for (const name of ['observed', 'started', 'changed', 'eventsChanged', 'changes', 'invalidated', 'overflow', 'revoked', 'create'])
    assert.ok(source.includes(`this.effects.${name}`), name);
  assert.match(source, /this.owner === owner/);
  assert.match(source, /this.revision\+\+/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /private readonly reads: ReadSourceLifecycle/);
  assert.doesNotMatch(engine, /private (?:readSource|readRooms|pendingReadChanges|readStatus|readSourceEpoch|readSourceRevision|readSourceDegraded|readStatusNotice|messageEventState|messageEventsSince|messageEventsReceived|messageEventsSeen|messageEvents|notificationSenders)\b/);
  assert.match(engine, /private readonly unread = new RetainedUnread/);
  assert.match(engine, /private readonly disk: DiskCacheLifecycle/);
});

test('retained unread ledger owns observations and eviction, never source freshness, disk or application state', async () => {
  const source = await readFile('src/retained-unread.ts', 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]), ['./read-status-protocol.js']);
  assert.doesNotMatch(source, /EditorEngine|MessagingStore|ReadSourceLifecycle|SpacesCache|OAuthSession|Date\.now|setTimeout|fetch\(|cachedUnread|unreadStale/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /ConfirmedUnread|readCache\b|readProfile\b|rememberReadStatus/);
  for (const method of ['peek', 'observeStatuses', 'observeActivity', 'useProfile', 'clear', 'reset', 'forget'])
    assert.ok(engine.includes(`this.unread.${method}(`), method);
  assert.match(await readFile('src/disk-cache-lifecycle.ts', 'utf8'), /const UNREAD_CACHE_LIMIT = 1000/, 'disk restore/retention retains its independent bound');
});

test('disk lifecycle owns restore/expiry/admission without owning live source, messaging, OAuth or physical file operations', async () => {
  const source = await readFile('src/disk-cache-lifecycle.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|MessagingStore|ReadSourceLifecycle|RetainedUnread|OAuthSession|node:fs|fetch\(/);
  for (const port of ['create', 'metadata', 'changed']) assert.ok(source.includes(`this.options.${port}`), port);
  for (const port of ['key', 'current', 'allowed', 'verified']) assert.ok(source.includes(`session.${port}(`), port);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /private (?:wantSpacesCache|liveRoomsReady|roomsRefreshFailed|cachedSpaces|cachedUnread|unreadExpiry|cacheStatus|cacheOwner|cacheKey|cacheExpiry|cacheWriteTimer|cacheWriteAt|cacheWritten|cacheObservedAt|cacheWriteActive|cacheWritePending|cacheWriteEpoch)\b/);
  assert.doesNotMatch(engine, /prepareSpacesCache|clearSpacesCache|persistSpaces|flushCacheWrite|cacheWriteFinished|invalidateCacheWrites|scheduleUnreadExpiry|observeUnread/);
  for (const method of ['snapshot', 'unread', 'reset', 'bind', 'stop', 'scopeLost', 'observe', 'persist', 'roomsLoaded', 'clear', 'forget', 'boundKey'])
    assert.ok(engine.includes(`this.disk.${method}(`), method);
});

test('native workspace owns managed handles/open/rename/window options without source, rendering or action authority', async () => {
  const source = await readFile('autoload/wbx/workspace.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|destination|supports|connection|transport|uploads|notifications|drafts)#?\(|rooms\.select|rooms\.read|messages\.send|setbufline\(|deletebufline\(|undolevels|breakat|foldmethod/);
  for (const port of ['Setup', 'Render', 'Draft', 'Geometry', 'Statusline'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /return copy\(a:owner.buffers\)/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:(?:rooms|history|meeting_buffer|renames)\b(?!\()/);
  assert.doesNotMatch(coordinator, /s:(?:initialize_buffer|workspace_window|show_buffer|composer_window)\(/);
  for (const method of ['new', 'id', 'buffers', 'ensure', 'buffer', 'rename_pre', 'rename_post', 'window_enter', 'window_leave', 'open', 'show', 'composer_window', 'reset_geometry'])
    assert.ok(coordinator.includes(`wbx#workspace#${method}`), method);
});

test('native renderer owns projection and redraw signatures, not workspace/request/delivery authority', async () => {
  const source = await readFile('autoload/wbx/render.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|workspace|connection|transport)#?\(|rooms\.select|rooms\.read|messages\.send|wbx#people#sync|wbx#reaction_history#schedule|timer_start|win_gotoid|tabnext|sbuffer|s:state/);
  for (const port of ['Status', 'Destination', 'Compose', 'Notify', 'Uncertain', 'Pending'])
    assert.ok(source.includes(`.ports.${port}`), port);
  for (const primitive of ['wbx#history#projection', 'wbx#view#write', 'wbx#rooms#rows'])
    assert.ok(source.includes(primitive), primitive);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:rendered_(?:status|drafts)|function! s:(?:history_view|redraw_status|position_rooms)\(/);
  assert.doesNotMatch(coordinator, /wbx#rooms#rows|wbx#history#projection|setbufvar\([^\n]*'wbx_(?:message|presence)_rows'/);
  assert.match(coordinator, /wbx#render#apply/);
  assert.match(coordinator, /wbx#people#sync\(s:state\)/);
  assert.match(coordinator, /wbx#reaction_history#schedule\(\)/);
  const view = await readFile('autoload/wbx/view.vim', 'utf8');
  assert.match(view, /function! wbx#view#write\(buffer, lines, Notify, \.\.\.\)/);
  assert.doesNotMatch(view, /rooms\.read|messages\.send|s:renderer/);
  const rooms = await readFile('autoload/wbx/rooms.vim', 'utf8');
  assert.doesNotMatch(rooms, /^\s*redraw!/m, 'background presence updates must not clear and repaint the entire screen');
});

test('room-selection owner keeps intent/focus lifetime separate from RPC correlation, activation and receipts', async () => {
  const source = await readFile('autoload/wbx/selection.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|workspace|connection|transport|drafts|uploads|unread|paging)#?\(|rooms\.read|messages\.send|sbuffer|win_gotoid|timer_start|wbx_message_blocks|setbufline/);
  for (const port of ['Context', 'Request', 'Attachments', 'Open', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /a:owner\.focus !=# a:request/);
  assert.match(source, /let a:owner\.serial \+= 1/);
  assert.match(source, /let request\.allow_read = 0/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:selection_(?:focus|serial)|function! s:(?:selected|select_intent)\(/);
  for (const method of ['new', 'select', 'leaving', 'cancel'])
    assert.ok(coordinator.includes(`wbx#selection#${method}(`), method);
  assert.match(coordinator, /function! s:selection_open\(request\)/);
  assert.match(coordinator, /wbx#history_activation#open\(s:activation, a:request\)/);
});

test('native buffer setup owns initialization/default mapping release, not actions, sessions or workspace handles', async () => {
  const source = await readFile('autoload/wbx/buffer_setup.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|workspace|connection|transport|selection)#?\(|rooms\.select|rooms\.read|messages\.send|timer_start|win_gotoid|setbufline|undolevels|s:state/);
  for (const effect of ['Render', 'EnterWindow', 'LeaveWindow', 'Draft', 'Event'])
    assert.ok(source.includes(`a:effects.${effect}`), effect);
  assert.match(source, /current ==# mapping\[2\]/);
  assert.match(source, /installed\.lhs/);
  assert.ok(source.indexOf("let b:wbx_initialized = 1") < source.indexOf("execute 'setlocal filetype=wbx-'"), 'native re-entry guard precedes FileType');
  assert.ok(source.indexOf("execute 'setlocal filetype=wbx-'") < source.indexOf("let b:wbx_default_maps = []", source.indexOf("let b:wbx_initialized = 1")), 'default mappings follow native hooks and ownership recheck');
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /function! s:(?:default_map|release_maps)\(|b:wbx_default_maps|b:wbx_initialized|b:wbx_history_fold_prepared/);
  assert.match(coordinator, /wbx#buffer_setup#apply\(s:buffer_setup_effects\)/);
  assert.match(coordinator, /wbx#buffer_setup#draft\(\)/);
});

test('native history activation owns endpoint attempt lifetime without duplicating selection, transport or source state', async () => {
  const source = await readFile('autoload/wbx/history_activation.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|transport|selection|drafts|uploads)#?\(|rooms\.select|messages\.send|timer_start|serial|context_epoch|setbufline|undolevels/);
  for (const port of ['State', 'Options', 'Render', 'Setup', 'Notify', 'Request'])
    assert.ok(source.includes(`.ports.${port}`), port);
  for (const primitive of ['wbx#view#endpoint', 'wbx#view#latest', 'wbx#view#owned', 'wbx#workspace#show', 'wbx#unread#open'])
    assert.ok(source.includes(primitive), primitive);
  assert.match(source, /function! wbx#history_activation#lost\(owner\) abort\n[^\n]*\n  let a:owner\.pending = \{\}\nendfunction/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:(?:read_pending|auto_read_attempts|known_latest)|function! s:(?:read_finished|request_read|newest_displayed)\(/);
  for (const method of ['new', 'open', 'observe', 'newest', 'read', 'lost'])
    assert.ok(coordinator.includes(`wbx#history_activation#${method}(`), method);
});

test('verified storage identity owns profile/key/single-flight without OAuth, file, consumer or application authority', async () => {
  const source = await readFile('src/verified-storage-identity.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|EditorError|OAuthSession|DiskCacheLifecycle|LocalDrafts|SectionPreferences|node:fs|fetch\(|setTimeout|setInterval|new AbortController/);
  assert.match(source, /if \(this\.pending\) return this\.pending/);
  assert.match(source, /this\.binding !== binding/);
  assert.match(source, /if \(this\.pending === pending\) this\.pending = undefined/);
  assert.ok(source.indexOf('!context.current()') < source.indexOf('if (this.verified)'), 'current grant/session checked even before returning cached identity');
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /private storage(?:Profile|Key|Identity)\b/);
  assert.match(engine, /private readonly identity: VerifiedStorageIdentity/);
  for (const method of ['configure', 'key', 'reset']) assert.ok(engine.includes(`this.identity.${method}(`), method);
  assert.equal([...engine.matchAll(/this\.spacesCache\.account\(/g)].length, 1, 'one existing account provider, composed only through identity owner');
  assert.match(engine, /key: \(\) => this\.verifiedStorageKey\(generation\)/);
  assert.match(engine, /this\.drafts\.open\(this\.draftSession\(this\.generation\)\)/);
  const drafts = await readFile('src/local-drafts-lifecycle.ts', 'utf8');
  assert.match(drafts, /await session\.key\(\)/);
});

test('section preferences own local projection/intent and physical I/O lifetime without identity, disk or application ownership', async () => {
  const source = await readFile('src/section-preferences-lifecycle.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|EditorError|VerifiedStorageIdentity|DiskCacheLifecycle|OAuthSession|node:fs|fetch\(|setTimeout|setInterval|AbortController/);
  for (const port of ['create', 'rooms', 'changed']) assert.ok(source.includes(`this.options.${port}(`), port);
  for (const port of ['key', 'current', 'restoreAllowed']) assert.ok(source.includes(`session.${port}(`), port);
  assert.match(source, /reset\(\): void \{ this\.sections\.reset\(\); this\.active = false; \}/);
  assert.match(source, /if \(this\.io && !this\.automatic\)/);
  assert.match(source, /this\.intentValue === intent/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /private (?:readonly sections\b|sections(?:Active|IO|Automatic|Intent)\b)|restoreSections|new LocalSections/);
  for (const method of ['snapshot', 'intent', 'reset', 'edit', 'operate', 'restore'])
    assert.ok(engine.includes(`this.preferences.${method}(`), method);
  assert.match(engine, /key: \(\) => this\.disk\.boundKey\(\)/);
});

test('draft lifecycle owns open/save profile and physical admission without verified identity, file or delivery authority', async () => {
  const source = await readFile('src/local-drafts-lifecycle.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|EditorError|VerifiedStorageIdentity|DiskCacheLifecycle|OAuthSession|MessagingStore|node:fs|fetch\(|setTimeout|setInterval|AbortController|messages\.send|emit\(/);
  for (const port of ['key', 'current', 'allowed']) assert.ok(source.includes(`session.${port}(`), port);
  assert.match(source, /reset\(\): void \{ this\.profile = undefined; \}/);
  assert.match(source, /document\.revision !== revision \|\| !valid\(\)/);
  assert.match(source, /item\.text \|\| item\.uncertain/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /private draft(?:Profile|IO)\b|validLocalDrafts|demo-drafts|new Map\(document\.items/);
  for (const method of ['open', 'save', 'reset']) assert.ok(engine.includes(`this.drafts.${method}(`), method);
  assert.match(engine, /key: \(\) => this\.verifiedStorageKey\(generation\)/);
});

test('demo REST adapter owns only stateless synthetic routing while composition retains live injection and settlement', async () => {
  const source = await readFile('src/demo-rest.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|EditorError|new MessagingStore|new PublicREST|fetch\(|node:fs|setTimeout|setInterval|AbortController|\.emit\(|\.send\(|\.markRead\(|new Map|new Set/);
  assert.match(source, /Pick<MessagingStore, 'room' \| 'demoConversation' \| 'demoMessageAction'>/);
  assert.match(source, /signal\.aborted \|\| !store/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /return demoREST\(this\.store, path, method, signal, body\)/);
  assert.match(engine, /if \(this\.mode !== 'demo'\) return this\.publicREST\.call\(path, method, token, signal, body\)/);
  assert.match(engine, /new PublicREST\(owners\.publicRequest\)/);
  assert.match(engine, /busy: \(\) => this\.publicREST\.busy\(\), settled: \(\) => this\.publicREST\.settled\(\)/);
  assert.doesNotMatch(engine, /url\.pathname|demo-directory-|Account-free demo/);
});

test('demo reactions own only synthetic groups/provider construction, not admission, source or uncertainty state', async () => {
  const source = await readFile('src/demo-reactions.ts', 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]), ['node:crypto', './reaction-contracts.js']);
  assert.doesNotMatch(source, /EditorEngine|MessageReactions|ReadSourceLifecycle|OAuth|fetch\(|node:fs|setTimeout|setInterval|AbortController|checked|contexts|outcomes|reset\(|\.emit\(/);
  assert.match(source, /groups:structuredClone\(groups\)/);
  assert.match(source, /current\.own !== command\.own/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /private readonly demoReactions = new DemoReactions\(\)/);
  assert.match(engine, /if \(this\.mode === 'demo'\) return this\.demoReactions\.reaction\(command\)/);
  assert.match(engine, /if \(this\.mode === 'demo'\) return this\.demoReactions\.reactions\(batch\)/);
  assert.doesNotMatch(engine, /demoReactions\.(?:get|set|clear)|Map<string,ReactionGroup|count:1,own:randomBytes/);
  assert.match(engine, /return this\.reads\.reaction\(command\)/);
  assert.match(engine, /return this\.reads\.reactions\(batch,progress\)/);
});

test('demo recipient-file posting is stateless stream/submission translation, not upload admission or recipient recovery', async () => {
  const source = await readFile('src/demo-recipient-file.ts', 'utf8');
  assert.doesNotMatch(source, /new Uploads|new MessagingStore|new Map|new Set|postUpload|fetch\(|node:fs|node:https|setTimeout|AbortController|\.emit\(|reset\(|\.resolve\(/);
  assert.match(source, /for await \(const _ of source\.read\(signal\)\)/);
  assert.ok(source.indexOf('submitted();') < source.indexOf("store()!.demoConversation('direct'"), 'late lookup follows the caller admission callback');
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.match(engine, /postDemoRecipientFile\(\(\) => this\.store, source, target, text, intent, signal, submitted\)/);
  assert.match(engine, /if \(this\.mode !== 'demo'\) return postUpload\(source,/);
  assert.match(engine, /token, signal, submitted, this\.owners\.uploadRequest/);
  assert.doesNotMatch(engine, /Local sandbox snapshot consumption|personId: 'toPersonId' in target/);
});

test('backend providers compose finite construction ports without credentials, feature lifetimes or a second owner registry', async () => {
  const source = await readFile('src/backend-providers.ts', 'utf8');
  assert.doesNotMatch(source, /EditorEngine|EditorRPC|new Map|new Set|setTimeout|setInterval|AbortController|\.emit\(|\.start\(|\.stop\(|\.close\(|expiresAt|generation|epoch|\.token\(/);
  for (const constructor of ['ReadStatusWorker', 'OAuthSession', 'SpacesCache', 'WebexSelectedPeopleProvider',
    'WebexUpcomingMeetingsProvider', 'SenderNames', 'WebexMessagingAPI', 'MessagingStore'])
    assert.ok(source.includes(`new ${constructor}(`), constructor);
  assert.match(source, /return \{ readStatus, people: createPeople, upcoming: createUpcoming/);
  assert.match(source, /owners\.messaging\?\.\(api, 4000, mode\) \?\? new MessagingStore/);
  const engine = await readFile('src/editor-engine.ts', 'utf8');
  assert.doesNotMatch(engine, /new (?:ReadStatusWorker|OAuthSession|SpacesCache|WebexSelectedPeopleProvider|WebexUpcomingMeetingsProvider|SenderNames|WebexMessagingAPI|MessagingStore)\(|demoMessageAPI\(/);
  for (const method of ['readStatus', 'people', 'upcoming', 'names'])
    assert.ok(engine.includes(`providers.${method}`), method);
  assert.match(engine, /this\.store = createMessagingStore\(mode, \(\) => \{/);
  assert.match(engine, /Date\.now\(\) >= this\.expiresAt/);
  assert.match(engine, /this\.spacesCache\.create\(\)/);
  assert.match(engine, /this\.authorization\.create\(config\.oauth, secret\)/);
});

test('native composer send owns one consent-to-dispatch flow, not draft outcomes, correlation or delivery clearing', async () => {
  const source = await readFile('autoload/wbx/send_action.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel)#?\(|timer_start|job_start|jobstart|s:(?:pending|uncertain|session|serial|epoch)|setbufline|undolevels|drafts#(?:delivery|disconnect|resolve|mark_uncertain)\(/);
  for (const port of ['State', 'Destination', 'Supports', 'SupportsUpload', 'Capabilities', 'NextId', 'Consent', 'Request', 'Notify', 'Render'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.ok(source.indexOf('wbx#drafts#register(') < source.indexOf('.ports.Request'), 'register pending before transport can respond synchronously');
  assert.ok(source.indexOf('wbx#view#intent_valid(origin)') > source.indexOf('.ports.Consent'));
  assert.equal([...source.matchAll(/\.ports\.State/g)].length, 2, 're-read current quote proof after consent');
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.match(coordinator, /function! wbx#send\(\) abort\n  call wbx#send_action#send\(s:send_action\)\nendfunction/);
  assert.doesNotMatch(coordinator, /function! s:send_response\(|Draft\/target changed during consent/);
  assert.match(coordinator, /'Clear':function\('wbx#delivery_clear#clear', \[s:delivery_clear\]\)/, 'successful-delivery exact native clear remains separate');
});

test('native delivery clear owns only exact successful local write and bounded retry, never send or uncertain outcome authority', async () => {
  const source = await readFile('autoload/wbx/delivery_clear.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel|send_action)#?\(|messages\.send|uploads\.send|delivery\.resolve|drafts#(?:register|delivery|disconnect|resolve|failed)\(|timer_stop|new Map|s:(?:pending|session|serial|epoch)/);
  for (const port of ['State', 'Write', 'Render', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /return \{'ports':a:ports\}/);
  assert.match(source, /a:retries > 0 && !has_key\(pending, 'attachmentId'\)/);
  assert.match(source, /timer_start\(10, function\('wbx#delivery_clear#clear', \[a:owner, pending, a:session, a:retries - 1\]\)\)/);
  assert.ok(source.indexOf("'wbx_confirmed_sent'") < source.indexOf('.ports.Write'));
  assert.match(source, /catch \/\^Vim\//);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /function! s:clear_delivery\(|Message sent, but the editor could not clear/);
  assert.match(coordinator, /'Clear':function\('wbx#delivery_clear#clear', \[s:delivery_clear\]\)/);
  const ingress = await readFile('autoload/wbx/delivery_ingress.vim', 'utf8');
  assert.match(ingress, /a:owner\.ports\.Clear, \[pending, get\(get\(call\(a:owner\.ports\.State, \[\]\), 'localContext', \{\}\), 'sessionId', ''\), 3\]/);
  assert.match(coordinator, /wbx#delivery_ingress#receive\(s:delivery_ingress, params\)/);
  assert.match(coordinator, /wbx#delivery_recovery#resolve\(s:delivery_recovery\)/);
});

test('native textlock request retains only bounded presentation work and never queues an ACK, snapshot or mutation', async () => {
  const source = await readFile('autoload/wbx/render_request.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|drafts|uploads|delivery_clear|connection)#?\(|messages\.send|uploads\.send|requestId|roomId|messageId|snapshot\s*[:=]|generation/);
  for (const port of ['Context', 'Render', 'Interrupted', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /'remaining':3/);
  assert.match(source, /timer_start\(10, function\('s:retry', \[a:owner, a:work\]\)\)/);
  assert.match(source, /a:owner\.work is a:work/);
  assert.match(source, /a:timer != a:owner\.timer/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.match(coordinator, /function! s:render\(\) abort\n  call wbx#render_request#render\(s:render_request\)\nendfunction/);
  assert.match(coordinator, /function! s:render_now\(\)/);
  assert.match(coordinator, /'Interrupted':function\('wbx#render#interrupted', \[s:renderer\]\)/);
  const view = await readFile('autoload/wbx/view.vim', 'utf8');
  assert.match(view, /if !replaced \| call setbufvar\(a:buffer, '&modifiable', modifiable\) \| endif/);
  assert.match(await readFile('autoload/wbx/render.vim', 'utf8'), /function! wbx#render#interrupted\(owner\)/);
});

test('native bound recovery owns one guarded request/callback, not uncertainty storage, retry or RPC correlation', async () => {
  const source = await readFile('autoload/wbx/delivery_recovery.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel|delivery_clear|send_action)#?\(|messages\.send|uploads\.send|rooms\.read|timer_start|timer_stop|job_start|jobstart|setbufline|s:(?:pending|uncertain|session|epoch|serial)/);
  for (const port of ['State', 'Supports', 'Request', 'ProtocolError', 'Render', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /return \{'ports':a:ports\}/);
  assert.match(source, /'delivery\.resolveBound', \{'roomId': room\.id\}/);
  assert.match(source, /'evidence': wbx#drafts#evidence\(room\.id\)/);
  assert.match(source, /wbx#drafts#resolve\(a:context\.room, a:context\.evidence\)/);
  assert.match(source, /keys\(value\) !=# \['roomId'\]/);
  assert.ok(source.indexOf('wbx#view#intent_valid(') < source.indexOf("let value ="), 'reject stale intent before interpreting response');
  assert.ok(source.indexOf('wbx#drafts#resolve(') < source.indexOf('wbx#draft_persistence#resolved('));
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.match(coordinator, /function! wbx#resolve_delivery\(\) abort\n  call wbx#delivery_recovery#resolve\(s:delivery_recovery\)\nendfunction/);
  assert.doesNotMatch(coordinator, /function! s:delivery_resolved\(|'delivery\.resolveBound'/);
});

test('native attachment-open owns the existing logical intent lifetime, not physical bytes/files/jobs or another request registry', async () => {
  const source = await readFile('autoload/wbx/attachment_open.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel)#?\(|job_start|jobstart|chansend|ch_sendraw|timer_start|writefile|readfile|setbufline|messages\.send|rooms\.read|s:(?:active|pending|serial|generation|intent)/);
  assert.match(source, /return \{'ports':a:ports, 'busy':0, 'serial':0, 'generation':0, 'intent':\{\}\}/);
  for (const port of ['State', 'Message', 'Options', 'Capabilities', 'Disconnected', 'CanCancel',
    'ImageBusy', 'SetImageBusy', 'ImageOpen', 'Request', 'ProtocolError', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  for (const dependency of ['wbx#attachments#open', 'wbx#attachment_stream#start', 'wbx#attachment_stream#resolved', 'wbx#images#open', 'wbx#protocol#resolved_attachment'])
    assert.ok(source.includes(dependency), dependency);
  assert.ok(source.indexOf('let previous.revoked = 1') < source.indexOf('if call(a:owner.ports.CanCancel'), 'local revocation precedes remote cancel');
  assert.match(source, /'messages\.attachmentCancel', \{'requestId': previous\.request\}/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:attachment_(?:busy|serial|owner|intent)|function! s:attachment_(?:resolved|done|cancel|image_done|picked)\(/);
  assert.match(coordinator, /function! wbx#attachment_open\(action, index\) abort\n  call wbx#attachment_open#open\(s:attachment_open, a:action, a:index\)\nendfunction/);
  assert.match(coordinator, /call wbx#render_request#cancel\(s:render_request\)\n    call wbx#attachment_open#stop\(s:attachment_open\)\n    call wbx#image_request#reset\(s:image_request\)\n    call wbx#connection#session/);
});

test('native image requests own one shared identity-bound admission and attempts, never image bytes or a second source/session registry', async () => {
  const source = await readFile('autoload/wbx/image_request.vim', 'utf8');
  assert.match(source, /return \{'ports':a:ports, 'attempts':\{\}, 'metadata':\{\}, 'busy':\{\}, 'room':''\}/);
  assert.doesNotMatch(source, /job_start|jobstart|timer_start|writefile|readfile|setbufline|messages\.send|rooms\.read|wbx#(?:rpc|state|connection|rpc_channel)#?\(|s:(?:pending|active|session|serial|epoch)/);
  assert.match(source, /a:owner\.busy isnot a:1/);
  assert.match(source, /len\(a:attempts\) >= 16/);
  assert.match(source, /getbufvar\(buffer, 'wbx_image_source', \{\}\) ==# a:source/);
  assert.match(source, /a:context\.source\.owner != call\(a:owner\.ports\.Generation, \[\]\)/);
  assert.match(source, /wbx#images#open\(opened, a:context\.mode, a:context\.source\)/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:image_(?:busy|attempts|room)|function! s:(?:images_done|image_open_done)\(/);
  assert.match(coordinator, /call wbx#image_request#visible\(s:image_request\)/);
  assert.match(coordinator, /call wbx#image_request#open\(s:image_request, a:mode, a:index\)/);
  const attachment = await readFile('autoload/wbx/attachment_open.vim', 'utf8');
  assert.match(attachment, /SetImageBusy, \[0, a:context\.image_read\]/);
  assert.match(attachment, /context\.image_read = call\(a:owner\.ports\.SetImageBusy, \[1\]\)/);
  assert.match(attachment, /wbx#image_request#snapshot\(source, a:context\.attachment\)/);
});

test('native meeting action owns observations and the sole pane request, while menu construction, messaging and physical terminal ownership stay separate', async () => {
  const source = await readFile('autoload/wbx/meeting_action.vim', 'utf8');
  assert.doesNotMatch(source, /jobstart|job_start|termopen|term_start|jobstop|job_stop|system\(|chansend|timer_start|wbx#(?:rpc|state|connection|rpc_channel)#?\(|messages\.send|session\.start|s:(?:pending|serial|meeting|events|epoch)\s*=/);
  for (const port of ['Options', 'Input', 'Ready', 'Disconnected', 'Capabilities', 'Closing', 'Request',
    'Notify', 'ProtocolError', 'Render', 'Event', 'CancelSelection', 'Focus', 'Detach', 'Terminal'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /if a:owner\.pending != a:serial \| return \| endif/);
  assert.match(source, /'meeting\.pane', \{'session':a:meeting\.session, 'intent':intent\}/);
  assert.match(source, /'meeting\.reconnect', \{'session':meeting\.session\}/);
  assert.match(source, /call wbx#meeting_action#reset\(a:owner\)/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:(?:meeting_events|meeting_epoch|terminal_session|view_detached)\b|s:meeting\b|function! s:update_meeting\(/);
  assert.match(coordinator, /wbx#meeting_action#receive\(s:meeting_action, params\)/);
  assert.match(coordinator, /wbx#meeting_action#media\(s:meeting_action, params\)/);
  const menus = await readFile('autoload/wbx/meeting.vim', 'utf8');
  assert.doesNotMatch(menus, /s:(?:pending|serial)\b|function! s:result\(|wbx#rpc\(/);
  assert.match(menus, /wbx#chooser#select/);
  assert.match(menus, /wbx#_meeting_pane\(a:origin, a:epoch, a:meeting, a:intents, a:choice\)/);
});

test('call pane ending cleanup stays exact-owner and independent from unknown viewer transport loss', async () => {
  const source = await readFile('src/call-panes.ts', 'utf8');
  assert.match(source, /private closingResult\?: Promise<void>/);
  assert.match(source, /if \(this\.closingResult\) return this\.closingResult/);
  assert.match(source, /if \(this\.closing\) \{ await this\.closeView\(this\.views\.get\(pane!\)!\); return; \}/);
  const cleanup = source.slice(source.indexOf('  private async closeView('));
  assert.match(cleanup, /if \(view\.owner/);
  assert.match(cleanup, /#\{window_id\}\|#\{pane_pid\}\|#\{@wbx_owner\}\|#\{@wbx_source\}/);
  assert.match(cleanup, /this\.tmux\.run\('if-shell', '-F', '-t', view\.pane, proof, `kill-pane -t \$\{view\.pane\}`\)/);
  assert.doesNotMatch(cleanup, /kill-session|kill-window|kill-server|send-keys|process\.kill|viewer.*action/);
  assert.match(cleanup, /await deadline\(\(\) => this\.tail, 1000\)/);
  const cli = await readFile('src/cli.ts', 'utf8');
  assert.match(cli, /Viewer disconnected; the meeting owner may still be active/);
  const meetings = await readFile('src/editor-meetings.ts', 'utf8');
  assert.match(meetings, /while \(!await processEnded\(pid\)\)/);
});

test('native delivery ingress composes outcome effects and accepted-session retirement without a second ledger, retry or send authority', async () => {
  const source = await readFile('autoload/wbx/delivery_ingress.vim', 'utf8');
  assert.match(source, /return \{'ports':a:ports\}/);
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel|send_action|delivery_recovery)#?\(|messages\.send|uploads\.send|delivery\.resolve|timer_start|timer_stop|setbufline|setline\(|s:(?:pending|uncertain|session|epoch|serial|seen)\s*=/);
  for (const port of ['State', 'Clear', 'ProtocolError', 'Notify', 'Render', 'Event'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /function! wbx#delivery_ingress#observe\(previous, next\)/);
  assert.match(source, /call wbx#drafts#disconnect\(\)/);
  assert.match(source, /let outcome = wbx#drafts#delivery\(a:result\)/);
  assert.ok(source.indexOf('if !outcome.known') < source.indexOf('if !outcome.valid'));
  assert.ok(source.indexOf('if !outcome.valid') < source.indexOf('call wbx#unread#sent'));
  assert.ok(source.indexOf('.ports.Clear') < source.indexOf('wbx#uploads#delivered'));
  assert.ok(source.indexOf('wbx#drafts#observe') < source.indexOf('.ports.Render'));
  assert.match(source, /'WbxDelivery', deepcopy\(a:result\)/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /function! s:delivery\(result\)|wbx#drafts#delivery\(|wbx#uploads#delivered\(/);
  assert.ok(coordinator.indexOf('call wbx#delivery_ingress#observe(s:state, a:state)') < coordinator.indexOf('let s:state = a:state'));
});

test('native space picker owns captured loaded choices and provider handoff, never selection requests, sessions, receipts or activation', async () => {
  const source = await readFile('autoload/wbx/space_picker.vim', 'utf8');
  assert.match(source, /return \{'ports':a:ports, 'serial':0\}/);
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|rpc_channel|selection|history_activation|drafts)#?\(|rooms\.select|rooms\.read|messages\.send|setbufline|undolevels|s:(?:pending|session|serial|epoch|rooms)\s*=/);
  for (const port of ['State', 'Options', 'Disconnected', 'Select', 'Notify'])
    assert.ok(source.includes(`.ports.${port}`), port);
  assert.match(source, /deepcopy\(get\(call\(a:owner\.ports\.State, \[\]\), 'rooms', \[\]\)\)/);
  assert.match(source, /wbx#view#picker_valid\(get\(a:context, 'origin', \{\}\)\)/);
  assert.match(source, /a:owner\.ports\.Select, \[a:id, 1, 0\]/);
  assert.match(source, /timer_start\(0, function\('s:picked_space', \[a:owner, a:context, a:context\.rooms\[index\]\.id\]\)\)/);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.doesNotMatch(coordinator, /s:picker_serial|function! s:(?:space_picked|fzf_space|picked_space)\(|fzf#run\(/);
  for (const [facade, method] of [['picker_context', 'context'], ['pick_select', 'select'], ['picker_cancel', 'cancel'], ['pick', 'open']])
    assert.ok(coordinator.includes(`function! wbx#${facade}(`) && coordinator.includes(`wbx#space_picker#${method}(s:space_picker`));
  const selection = await readFile('autoload/wbx/selection.vim', 'utf8');
  assert.match(selection, /let request\.session = get\(context, 'session', ''\)/);
  assert.match(selection, /get\(context, 'session', ''\) !=# a:request\.session/);
  assert.match(coordinator, /'session':get\(get\(s:state, 'localContext', \{\}\), 'sessionId', ''\)/);
});

test('native meeting-status projection is stateless text, separate from observation/control authority and native writes', async () => {
  const source = await readFile('autoload/wbx/meeting_status.vim', 'utf8');
  assert.doesNotMatch(source, /wbx#(?:rpc|state|connection|meeting_action|transport|workspace|view|chooser)#?\(|wbx#meeting_(?:state|events)\(|jobstart|job_start|timer_start|timer_stop|setbufline|setline\(|writefile|readfile|system\(|\.ports\.|let s:(?!save_cpo\b)/);
  assert.match(source, /function! wbx#meeting_status#lines\(meeting, events, connected\)/);
  assert.match(source, /function! wbx#meeting_status#compact\(meeting, events, connected\)/);
  for (const phrase of ['Last reported ', 'not proof of stopped sending', 'NOT SENT',
    'not microphone sending', 'NOT complete attendee/self/lobby coverage', 'not active-speaker following'])
    assert.ok(source.includes(phrase), phrase);
  const coordinator = await readFile('autoload/wbx.vim', 'utf8');
  assert.match(coordinator, /let lines = wbx#meeting_status#lines\(wbx#meeting_state\(\), wbx#meeting_events\(\), !wbx#connection#disconnected\(s:connection\)\)/);
  assert.doesNotMatch(coordinator, /Last reported |confirmed sending|Speaker layout:|Rx audio playback:/);
  assert.match(coordinator, /call s:write\(wbx#workspace#id\(s:workspace,'meeting'\), lines\)/);
  const menus = await readFile('autoload/wbx/meeting.vim', 'utf8');
  assert.match(menus, /function! wbx#meeting#compact\(meeting, events, connected\) abort\n  return wbx#meeting_status#compact\(a:meeting, a:events, a:connected\)\nendfunction/);
});
