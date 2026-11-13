" Server read-state/room-identity regressions. Synthetic backend; no real receipts.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let g:wbx_tui = {'demo': 1, 'read_status': 1, 'backend': [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs']}
let s:drawn = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression)
      return
    endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! Publish(changes) abort
  let state = extend(wbx#state(), deepcopy(a:changes), 'force')
  let state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': state})
endfunction
function! Text(buffer) abort
  return join(getbufline(a:buffer, 1, '$'), "\n")
endfunction
function! CurrentMatches(window) abort
  return filter(getmatches(a:window), 'v:val.group ==# "WbxCurrent"')
endfunction
function! s:health() abort
  silent let value = wbx#health()
  return value
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('fixture-room')
  call WaitFor('wbx#state().ready')
  let buffers = wbx#buffers()
  call Publish({'rooms': [], 'room': v:null, 'messages': [], 'ready': v:false, 'loadingRooms': v:true, 'readStatus': 'connecting'})
  call assert_match('Loading spaces and unread status', Text(buffers.rooms), 'initial unread discovery is explicit rather than a briefly plain room list')
  call assert_equal([], filter(copy(getbufvar(buffers.rooms, 'wbx_room_ids')), '!empty(v:val)'), 'initial loading rows cannot be selected')
  let current = {'id': 'fixture-room', 'title': 'Current', 'type': 'group', 'lastActivity': '2026-11-09T12:00:00.000Z', 'unread': v:true}
  let other = {'id': 'other-room', 'title': 'Other', 'type': 'group', 'lastActivity': '2026-11-09T11:00:00.000Z', 'unread': v:false}
  let unknown = {'id': 'unknown-room', 'title': 'Unknown', 'type': 'group', 'lastActivity': ''}
  let messages = map(range(1, 100), '{"id": "activity-" . v:val, "author": "Synthetic", "created": "2026-11-09T12:00:00.000Z", "text": "Message " . v:val}')
  call Publish({'rooms': [current, other, unknown], 'room': current, 'messages': messages, 'ready': v:true, 'loadingRooms': v:false, 'readStatus': 'ready', 'readStatusNotice': ''})
  call assert_match('● Current\n', Text(buffers.rooms), 'room titles have no unread suffix')
  call assert_match('  Other\n', Text(buffers.rooms), 'server-read spaces need no unread suffix')
  call assert_match('  Unknown\n', Text(buffers.rooms), 'unknown status adds no per-room clutter')
  call assert_notmatch('\[?\]\|\[UNREAD\]', Text(buffers.rooms), 'status labels do not crowd the list')
  call assert_match('1 unknown', Text(buffers.rooms), 'unknown state is summarized once, not treated as read')
  call assert_equal([3], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'confirmed unread styling follows server metadata')
  call assert_equal([], readfile($WBX_EDITOR_AUDIT), 'loading/selecting/polling never sends a read receipt')
  call Publish({'readStatusNotice': 'Live unread events unavailable; read status uses periodic server refresh.'})
  call assert_equal([3], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'polling fallback retains confirmed unread emphasis')
  call assert_match('periodic server refresh', s:health().read_status_notice)
  call Publish({'readStatus': 'failed', 'readStatusNotice': 'Server read-status refresh failed; background status refresh will try again.'})
  call assert_equal([3], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'an outage retains last-known unread emphasis')
  call assert_equal('', getbufline(buffers.rooms, 2)[0], 'unread diagnostics no longer occupy the spaces header')
  call assert_match('last-known states kept', Text(buffers.rooms), 'cached emphasis is explicitly historical')
  call assert_notmatch('Server read-status refresh failed', Text(buffers.rooms), 'raw health details stay in WebexHealth')
  let current.unreadStale = v:true
  let other.unreadStale = v:true
  call Publish({'rooms': [current, other, unknown], 'readStatus': 'ready'})
  call assert_equal([3], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'partial recovery preserves cached unread emphasis')
  call assert_match('2 cached.*1 unknown', Text(buffers.rooms), 'cached and never-observed statuses remain distinguishable')
  call remove(current, 'unreadStale')
  call remove(other, 'unreadStale')
  call Publish({'rooms': [current, other, unknown], 'readStatus': 'ready', 'readStatusNotice': ''})
  call assert_equal([3], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'fresh server recovery restores emphasis without reopening the buffer')
  call assert_equal([], readfile($WBX_EDITOR_AUDIT), 'status recovery never sends a read receipt')

  call win_gotoid(win_findbuf(buffers.rooms)[0])
  call cursor(4, 3)
  let first = win_getid()
  call assert_equal([[3]], map(CurrentMatches(first), 'v:val.pos1'), 'the open row stays indicated while browsing a different space')
  execute 'tab sbuffer ' . buffers.rooms
  call cursor(3, 3)
  let second = win_getid()
  call Publish({'rooms': [unknown, current, other]})
  call assert_equal([4], b:wbx_unread_rows, 'unread styling follows the reordered room identity')
  call assert_equal('WbxUnread', synIDattr(synID(4, 9, 1), 'name'), 'confirmed unread titles are highlighted in each native window')
  call assert_equal('fixture-room', b:wbx_room_ids[line('.') - 1], 'reordering retains the room under this tab cursor')
  call win_gotoid(first)
  call assert_equal('other-room', b:wbx_room_ids[line('.') - 1], 'reordering retains a different hovered room in another tab')
  call assert_equal('fixture-room', wbx#state().room.id, 'room reordering cannot change the open destination')
  for window in [first, second]
    call assert_equal([[4]], map(CurrentMatches(window), 'v:val.pos1'), 'the current-space background follows room identity in every tab')
  endfor
  call assert_equal(0, len(readfile($WBX_EDITOR_AUDIT)), 'list updates never send receipts')

  call win_gotoid(win_findbuf(buffers.history)[0])
  let reader = win_getid()
  normal! 120Gzt
  let view = winsaveview()
  let tick = b:changedtick
  let draft = wbx#buffers().drafts['fixture-room']
  call setbufline(draft, 1, 'Retained direct-space draft')
  let draft_tick = getbufvar(draft, 'changedtick')
  let current.title = 'Alex Example'
  let current.type = 'direct'
  call Publish({'rooms': [unknown, current, other], 'room': current})
  call assert_match('● Alex Example', Text(buffers.rooms), 'resolved personal-space names replace generic titles without losing the current indicator')
  call assert_equal(view, winsaveview(), 'a direct-space name update preserves the reading viewport')
  call assert_equal(reader, win_getid(), 'name metadata never steals focus')
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'), 'name updates never rewrite the destination-bound draft')
  call assert_equal('fixture-room', wbx#destination(draft).id)
  call assert_equal('Alex Example', wbx#destination(draft).title)
  call assert_equal([], readfile($WBX_EDITOR_AUDIT), 'resolving names never sends a receipt or message')
  let tick = b:changedtick
  call Publish({'loading': v:true})
  call assert_equal(tick, b:changedtick, 'a poll start does not rewrite active history')
  call assert_equal(view, winsaveview(), 'a poll start does not move the viewport')
  call Publish({'loading': v:false})
  let messages = messages + [{'id': 'activity-101', 'author': 'Synthetic', 'created': '2026-11-09T12:01:00.000Z', 'text': 'New incoming message'}]
  call Publish({'messages': messages})
  call assert_equal(view, winsaveview(), 'appending a new message preserves the reading viewport')
  call assert_match('New incoming message', Text(buffers.history), 'new content still arrives')
  call assert_equal(reader, win_getid(), 'background updates never change focus')
  normal R
  sleep 20m
  call assert_equal([], readfile($WBX_EDITOR_AUDIT), 'R cannot mark unseen newer messages read while scrolled up')
  normal! G
  normal R
  if s:drawn | call WaitFor('len(readfile($WBX_EDITOR_AUDIT)) == 1') | endif
  call assert_equal(s:drawn ? ['read:fixture-room:activity-101'] : [], readfile($WBX_EDITOR_AUDIT), 'only a drawn newest endpoint may be acknowledged')
  call assert_equal(s:drawn ? [] : [4], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'an admitted explicit mark-read clears only the local presentation')
  call assert_true(wbx#state().rooms[1].unread, 'local read presentation never modifies authoritative state')
  let rooms_tick = getbufvar(buffers.rooms, 'changedtick')
  let current.unread = v:false
  call Publish({'rooms': [unknown, current, other]})
  call assert_equal([], getbufvar(buffers.rooms, 'wbx_unread_rows'), 'a server-confirmed receipt clears unread emphasis')
  call assert_equal(rooms_tick, getbufvar(buffers.rooms, 'changedtick'), 'a read-state change needs no text rewrite')
  call win_gotoid(first)
  call assert_equal('WbxRoom', synIDattr(synID(4, 9, 1), 'name'), 'a confirmed read title returns to normal without reopening the view')
  call assert_equal('WbxSelected', synIDattr(synID(4, 1, 1), 'name'), 'the open marker stays distinct from unread title emphasis')
  call assert_equal([[4]], map(CurrentMatches(first), 'v:val.pos1'), 'server-read confirmation preserves the independent current-space background')
  call win_gotoid(reader)
  call Publish({'readStatus': 'failed', 'readStatusNotice': 'Synthetic SDK unavailable'})
  call assert_notmatch('\[?\]', Text(buffers.rooms), 'SDK failure is not repeated on every row')
  call assert_match('Unread sync unavailable', Text(buffers.rooms), 'SDK loss remains visible as one footer summary')
  call assert_notmatch('Synthetic SDK unavailable', Text(buffers.rooms), 'diagnostic text no longer crowds the explorer')
  call assert_equal('failed', s:health().read_status, 'local health exposes the active sync state')
  call assert_equal('Synthetic SDK unavailable', s:health().read_status_notice)
  call setbufvar(buffers.history, '&modifiable', 1)
  call setbufline(buffers.history, 1, 'Private annotation')
  normal R
  sleep 20m
  call assert_equal(s:drawn ? 1 : 0, len(readfile($WBX_EDITOR_AUDIT)), 'an edited history cannot send receipts')
  call assert_equal('Private annotation', getline(1))
  call assert_equal('', maparg('R', 'i'), 'read receipts never steal Insert text')
  call win_gotoid(first)
  split
  let third = win_getid()
  call assert_equal(1, len(CurrentMatches(third)), 'a native split gets exactly one current-space cue')
  let current_match = CurrentMatches(third)
  call wbx#rooms#syntax()
  call wbx#rooms#syntax()
  call assert_equal(current_match, CurrentMatches(third), 'unchanged rendering does not churn or duplicate matches')
  call Publish({'room': other})
  for window in [first, second, third]
    call assert_equal([[5]], map(CurrentMatches(window), 'v:val.pos1'), 'changing the open destination moves the current cue in every window')
  endfor
  call Publish({'room': v:null, 'messages': [], 'ready': v:false})
  call assert_equal([], CurrentMatches(third), 'no selected destination means no current-space cue')
  call Publish({'room': current})
  let user_match = matchadd('Search', 'Current')
  enew
  call assert_equal([], CurrentMatches(third), 'switching to unrelated work removes only the Webex current-space cue')
  call assert_equal([user_match], map(getmatches(), 'v:val.id'), 'user-owned window matches are retained')
  execute 'buffer ' . buffers.rooms
  call assert_equal([[4]], map(CurrentMatches(third), 'v:val.pos1'), 'returning to spaces restores its current cue')
  call matchdelete(user_match)
  let reused = w:wbx_current_match.id
  call matchdelete(reused)
  call matchadd('Search', 'Current', 10, reused)
  call wbx#rooms#clear_current()
  call assert_equal([reused], map(getmatches(), 'v:val.id'), 'cleanup never deletes a match ID that the user reused')
  call matchdelete(reused)
  call wbx#rooms#current()
  call assert_equal([w:wbx_current_match], CurrentMatches(third), 'the restored match retains its exact ownership record')
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.spaces')
  for window in [first, second, third]
    call assert_equal([], CurrentMatches(window), 'renaming the spaces buffer releases the cue in every window')
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'positive_receipts': s:drawn ? 'virtual/drawn UI' : 'NOT RUN: undrawn silent Ex; zero receipts verified'})], $WBX_EDITOR_RESULT)
qa!
