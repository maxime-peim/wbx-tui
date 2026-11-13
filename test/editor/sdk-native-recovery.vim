" C4: actual editor entry/framing/output -> forked SDK worker -> native ingress.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
syntax enable
let s:tracefile = $HOME . '/c4-trace.jsonl'
let s:control = $HOME . '/c4-control.json'
let s:build = $HOME . '/c4-build'
let s:health = [] | let s:checks = [] | let s:drawn = []
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'C4 timeout: ' . a:expression | endif
endfunction
function! s:trace(kind) abort
  return filter(map(readfile(s:tracefile), 'json_decode(v:val)'), 'v:val.kind ==# a:kind')
endfunction
function! s:phase(name) abort
  call writefile([json_encode({'phase': a:name})], s:control . '.next')
  call assert_equal(0, rename(s:control . '.next', s:control))
endfunction
function! s:room(id) abort
  return get(filter(copy(get(wbx#state(), 'rooms', [])), 'v:val.id ==# a:id'), 0, {})
endfunction
function! s:ids() abort
  return map(copy(wbx#state().messages), 'v:val.id')
endfunction
function! s:checkpoint(label) abort
  silent let h = wbx#health()
  " Whitelist only portable Health diagnostics, never full buffers/config/paths.
  let safe = {'stage': a:label}
  for key in ['backend_running', 'protocol_ready', 'read_status', 'read_status_notice', 'read_status_cached_rooms', 'mark_read_on_open', 'local_unread']
    let safe[key] = h[key]
  endfor
  let safe.status = wbx#status()
  let safe.source_epoch = wbx#state().reactionSource.epoch
  call add(s:health, safe)
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    call assert_true(screenpos(win_getid(), line('.'), 1).row > 0, a:label . ': focused native work is drawn')
    call add(s:drawn, a:label)
  endif
endfunction
function! s:preserved(label) abort
  let focus = win_getid()
  call assert_equal(s:focus, focus, a:label . ': background ingress never steals focus')
  for item in s:work
    call assert_true(win_gotoid(item.window))
    call assert_equal(item.buffer, bufnr('%'))
    call assert_equal(item.text, getline(1, '$'), a:label . ': native text/annotation')
    call assert_equal(item.undo, undotree(), a:label . ': full native undo')
    call assert_equal(item.fold, [foldclosed(3), &l:foldmethod, &l:foldenable], a:label . ': independent native folds')
  endfor
  call win_gotoid(focus)
  call assert_equal(s:theme, execute('highlight Normal'))
  call assert_equal(s:breakat, &breakat)
  call assert_equal(s:remove, maparg('\Wnr', 'n'), 'Wnr remains Remove Member')
endfunction
let s:barrier = 0
function! s:ack(response) abort
  call assert_false(has_key(a:response, 'error'))
  let s:barrier += 1
endfunction
function! s:request(method, params) abort
  let n = s:barrier + 1
  call wbx#rpc(a:method, a:params, function('s:ack'))
  call s:wait('s:barrier == ' . n)
endfunction
function! s:barrier() abort
  call s:request('state.get', {})
endfunction
try
  call writefile([], s:tracefile)
  call s:phase('initial')
  call writefile([json_encode({'oauth': {'clientId': 'c4-synthetic', 'clientSecret': 'PRIVATE-SECRET',
        \ 'redirectUri': 'http://127.0.0.1:53682/oauth/callback', 'scopes': ['spark:all']}})], $WBX_CONFIG)
  call setfperm($WBX_CONFIG, 'rw-------')
  let build = system(shellescape($WBX_NODE) . ' ' . shellescape($WBX_EDITOR_ROOT . '/test/editor/sdk-native-build.mjs') . ' ' . shellescape(s:build))
  if v:shell_error | throw 'C4 private build failed' | endif
  let g:wbx_tui = {'backend': [$WBX_NODE, s:build . '/dist/editor-main.js'], 'config': $WBX_CONFIG,
        \ 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
        \ 'read_status': 1, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0, 'persist_drafts': 0}
  call wbx#open(0)
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && get(wbx#state(), "readStatus", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('room-a')
  call s:wait('get(wbx#state(), "ready", 0) && s:ids() ==# ["message-a", "keep-a"]')
  call s:wait('len(filter(s:trace("request"), ''v:val.method ==# "messages.readBy"'')) == 1 && !wbx#read_by#busy()')
  call assert_true(s:room('room-a').unread)
  call assert_false(get(s:room('room-a'), 'unreadStale', 0))
  call assert_false(has_key(s:room('room-u'), 'unread'), 'never-observed room is unknown, never read/false')
  let s:session = wbx#state().localContext.sessionId
  let s:epoch = wbx#state().reactionSource.epoch
  call win_gotoid(win_findbuf(wbx#buffers().history)[0])
  call s:checkpoint('ready-history')
  let s:history = bufnr('%')
  setlocal modifiable
  call append(1, 'PRIVATE native history annotation')
  call feedkeys("A retained\<Esc>", 'xt')
  setlocal foldmethod=manual foldenable
  3,5fold
  let first = win_getid()
  vsplit
  let second = win_getid()
  normal! zR
  WebexCompose
  call feedkeys("iPRIVATE unsent C4 work\<CR>Ordinary Enter only adds a line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  silent! write
  let s:draft = bufnr('%') | let s:focus = win_getid()
  let s:theme = execute('highlight Normal') | let s:breakat = &breakat | let s:remove = maparg('\Wnr', 'n')
  let s:work = []
  for window in [first, second, s:focus]
    call win_gotoid(window)
    call add(s:work, {'window': window, 'buffer': bufnr('%'), 'text': getline(1, '$'), 'undo': undotree(),
          \ 'fold': [foldclosed(3), &l:foldmethod, &l:foldenable]})
  endfor
  call win_gotoid(s:focus)

  call s:phase('fault')
  call s:wait('get(wbx#state(), "readStatus", "") ==# "failed"')
  call s:wait('len(s:trace("sdk-exit")) == 1')
  call assert_equal('ready', wbx#state().state, 'source failure is not application failure')
  call assert_true(wbx#state().ready, 'history remains ready during source failure')
  call assert_true(s:room('room-a').unread && s:room('room-a').unreadStale)
  call assert_true(s:room('room-b').unreadStale)
  call assert_false(has_key(s:room('room-u'), 'unread'))
  call assert_match('stale.*never-observed spaces remain unknown', wbx#state().readStatusNotice)
  call assert_match('sdk-error', wbx#state().readStatusNotice)
  call assert_notmatch('PRIVATE', wbx#state().readStatusNotice)
  call assert_true(wbx#state().reactionSource.epoch > s:epoch, 'terminal source failure retires its source epoch')
  call assert_equal(s:session, wbx#state().localContext.sessionId)
  call s:preserved('source failure') | call s:checkpoint('source-failed-stale-unknown')
  call assert_equal(1, wbx#health().backend_running)
  call assert_equal(1, wbx#health().protocol_ready)
  call assert_equal(2, wbx#health().read_status_cached_rooms)
  let failedEpoch = wbx#state().reactionSource.epoch
  call s:phase('recover')
  call s:barrier()
  call assert_equal('failed', wbx#state().readStatus, 'removing the fault never implicitly retries/reconnects')
  call assert_equal(1, len(s:trace('sdk-create')))
  WebexAuthRefresh
  call s:wait('get(wbx#state(), "readStatus", "") ==# "ready" && len(s:trace("sdk-create")) == 2')
  call assert_true(wbx#state().reactionSource.epoch > failedEpoch)
  call assert_equal(s:session, wbx#state().localContext.sessionId)
  call assert_false(get(s:room('room-a'), 'unreadStale', 0))
  call assert_false(has_key(s:room('room-u'), 'unread'))
  call s:preserved('explicit recovery') | call s:checkpoint('explicit-source-recovered')
  call add(s:checks, 'source failure preserves ready history/native work; stale and unknown remain distinct; only explicit refresh starts a fresh SDK process/source epoch')

  call s:phase('mismatch')
  call s:wait('!empty(filter(s:trace("ipc-out"), ''v:val.type ==# "changes"''))')
  call s:barrier()
  call assert_equal(['message-a', 'keep-a'], s:ids(), 'wrong-room deletion cannot delete A')
  call assert_true(wbx#state().ready, 'nonself membership event cannot revoke A')
  call s:phase('delete')
  call s:wait('s:ids() ==# ["keep-a"]')
  call s:preserved('exact deletion') | call s:checkpoint('exact-message-deleted')
  call assert_true(wbx#state().ready, 'exact message deletion is not membership loss')
  " The synthetic REST deliberately still returns the deleted body.
  call s:request('messages.list', {})
  call s:barrier()
  call assert_equal(['keep-a'], s:ids(), 'stale REST cannot resurrect a confirmed deletion')
  call s:phase('revoke')
  call s:wait('!get(wbx#state(), "ready", 0) && empty(s:room("room-a"))')
  call assert_equal(['keep-a'], s:ids(), 'revocation keeps loaded historical text')
  call assert_equal(1, len(s:trace('revoked')), 'exact native room.revoked traverses actual stdout/ingress')
  call s:preserved('exact self revocation') | call s:checkpoint('exact-membership-revoked')
  call assert_false(wbx#destination(s:draft).ready, 'revoked exact draft cannot regain send authority')
  call s:phase('stale')
  call s:wait('get(s:room("room-b"), "unreadActivity", "") ==# "2026-11-01T12:00:02.000Z"')
  call s:request('rooms.list', {})
  call s:barrier()
  call assert_true(empty(s:room('room-a')), 'stale SDK and REST cannot restore revoked authority')
  call assert_false(wbx#state().ready)
  call s:preserved('stale SDK/REST') | call s:checkpoint('stale-data-rejected')
  call add(s:checks, 'only exact room/message and self-membership evidence invalidate; stale SDK/REST cannot resurrect deleted content or revoked authority')
  call wbx#select('room-b')
  call s:wait('get(wbx#state(), "ready", 0) && get(wbx#state().room, "id", "") ==# "room-b" && s:ids() ==# ["message-b"]')
  WebexCompose
  call feedkeys("iPRIVATE fresh explicit Beta work\<CR>Native second line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  silent! write
  call assert_true(wbx#destination().ready)
  call assert_equal('room-b', wbx#destination().id)
  call assert_true(bufexists(s:draft), 'revoked unsent draft remains retained, not rebound or submitted')
  call assert_match('PRIVATE unsent C4 work', join(getbufline(s:draft, 1, '$'), "\n"))
  call assert_match('PRIVATE native history annotation', join(getbufline(s:history, 1, '$'), "\n"))
  call s:checkpoint('new-explicit-selection-and-native-work')
  call add(s:checks, 'fresh explicit Beta selection/history and new native work succeed; ordinary Enter/write never sends')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
try
  call s:wait('!wbx#health().backend_running && len(s:trace("sdk-exit")) == 2')
  let processes = s:trace('sdk-process') | let editors = s:trace('editor-start')
  call assert_equal(1, len(editors), 'one real stdio worker for the complete workflow')
  call assert_equal(2, len(processes), 'explicit source replacement forks exactly one new worker')
  call assert_notequal(processes[0].pid, processes[1].pid)
  for sdk in processes | call assert_equal(editors[0].pid, sdk.ppid) | endfor
  call assert_equal([], s:trace('forbidden'), 'zero business writes, receipts, unexpected RPC or network/browser work')
  call assert_equal(1, len(filter(s:trace('auth'), 'v:val.operation ==# "authorize"')))
  call assert_equal(1, len(filter(s:trace('auth'), 'v:val.operation ==# "refresh"')))
  let incoming = map(s:trace('request'), 'v:val.id')
  let replies = map(s:trace('response'), 'v:val.id')
  for id in incoming | call assert_equal(1, count(replies, id), 'each actual stdin request gets one stdout ACK') | endfor
  call assert_equal([], filter(s:trace('ipc-in'), 'index(["start", "stop", "readers"], v:val.type) < 0'), 'no receipt/reaction/mutation IPC replay')
  let reads = filter(s:trace('request'), 'v:val.method ==# "messages.readBy"')
  call assert_equal(1, len(reads), 'one opening lookup; redraw, failure and source recovery never retry it')
  call assert_equal(['room-a', 'keep-a', 'initial'], [reads[0].roomId, reads[0].messageId, reads[0].phase])
  let reader_ipc = filter(s:trace('ipc-in'), 'v:val.type ==# "readers"')
  call assert_equal(1, len(reader_ipc))
  call assert_equal([processes[0].pid, 'room-a', 'keep-a'], [reader_ipc[0].pid, reader_ipc[0].roomId, reader_ipc[0].messageId], 'read-only lookup stays in the original source worker and exact loaded target')
  " Deliberately noncanonical C4 IDs must fail closed before any SDK content read.
  call assert_equal([-32034], map(filter(s:trace('response'), 'v:val.id == reads[0].id'), 'get(v:val, "code", 0)'))
  call assert_equal(1, len(s:trace('editor-exit')))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
let trace = filereadable(s:tracefile) ? map(readfile(s:tracefile), 'json_decode(v:val)') : []
call assert_notmatch('PRIVATE\|Bearer\|clientSecret\|/home/\|/tmp/', json_encode(trace), 'trace is sanitized by construction')
let proof = filereadable(s:build . '/build-proof.json') ? json_decode(join(readfile(s:build . '/build-proof.json'), "\n")) : {}
call assert_equal(['src/editor-main.ts', 'src/read-status-worker.ts'], get(proof, 'entries', []))
call writefile([json_encode({'errors': v:errors, 'checks': s:checks, 'health': s:health, 'trace': trace, 'build': proof, 'drawn': s:drawn})], $WBX_EDITOR_RESULT)
qa!
