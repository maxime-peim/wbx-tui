" Native navigation/layout regressions. Private fake backend; no network/media.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let mapleader = ','
nnoremap ,Wr :let g:wbx_navigation_conflict = 1<CR>
let g:wbx_tui = {'demo': 1, 'read_status': 1, 'mark_read_on_open': 0, 'statusline': 0}
set cpoptions+=C
let s:cpo = &cpoptions
" Match inherited LazyVim defaults without touching any installed configuration.
setglobal foldmethod=indent foldlevel=99 foldtext=
runtime plugin/wbx.vim
filetype plugin on
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  let revision = 0, fail = false;
  const requests = [];
  const room = id => ({ id: 'nav-' + id, title: 'Synthetic ' + id, unread: true });
  const message = n => ({ id: 'message-' + n, author: 'Synthetic', created: '2026-11-09T12:00:00Z', text: 'Body ' + n + '\nDetail ' + n + '\nEndpoint ' + n });
  let state = { revision, state: 'idle', mode: 'demo', ready: false, room: null, rooms: [], messages: [], readStatus: 'ready' };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const req = JSON.parse(line), p = req.params || {};
    requests.push(req.method);
    const reply = result => write({ jsonrpc: '2.0', id: req.id, result });
    if (req.method === 'hello') return reply({ version: 1, state, capabilities: ['message-replies'], meeting: { active: false, ready: false } });
    if (req.method === 'session.start') { appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(req) + '\n'); state = { ...state, state: 'ready', rooms: Array.from({length:30}, (_,i)=>room(i)), moreRooms: true }; publish(); return reply(null); }
    if (req.method === 'test.publish') { state = { ...state, ...p }; publish(); return reply(null); }
    if (req.method === 'test.fail') { fail = p.fail; return reply(null); }
    if (req.method === 'test.requests') return reply(requests);
    if (req.method === 'rooms.select') { state = { ...state, room: room(p.roomId.split('-')[1]), ready: true, messages: Array.from({length:40},(_,i)=>message(i+100)), moreHistory: true, historyLatest: true }; publish(); return reply(null); }
    if (req.method === 'shutdown') { reply(null); return process.exit(0); }
    appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(req) + '\n');
    if ((req.method === 'rooms.list' && p.more) || (req.method === 'messages.list' && p.older)) {
      const selected = state.room?.id;
      return setTimeout(() => {
        if (fail) { write({ jsonrpc: '2.0', id: req.id, error: { code: -1, message: 'Synthetic page failure' } }); return; }
        if (req.method === 'rooms.list') state.rooms = [...state.rooms, ...Array.from({length:20},(_,i)=>room(state.rooms.length+i))].slice(0,500);
        else if (state.room?.id === selected) { const first = Number(state.messages[0].id.split('-')[1]); state.messages = [...Array.from({length:5},(_,i)=>message(first-5+i)), ...state.messages].slice(0,500); }
        publish(); reply(null);
      }, 80);
    }
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui.backend = [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
let s:controls = 0
function! s:done(message) abort
  let s:controls += 1
  if type(get(a:message, 'result', v:null)) == v:t_list
    let s:rpc_log = copy(a:message.result)
  endif
endfunction
function! s:control(method, params) abort
  let expected = s:controls + 1
  call wbx#rpc(a:method, a:params, function('s:done'))
  call WaitFor('s:controls == ' . expected)
endfunction
function! s:count(method) abort
  return len(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method'))
endfunction
function! s:move(command) abort
  execute 'normal! ' . a:command
  doautocmd CursorMoved
endfunction
function! s:at(id, offset) abort
  let block = filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
  call cursor(block.start + a:offset, 3)
  normal! zt
  call wbx#paging#baseline()
endfunction
function! s:identity() abort
  let block = filter(copy(b:wbx_message_blocks), 'v:val.start <= line(".") && line(".") <= v:val.end')[0]
  return [block.id, line('.') - block.start, col('.'), line('.') - line('w0')]
endfunction
try
  call assert_equal(0, wbx#transport#running())
  call assert_match('wbx_navigation_conflict', maparg(',Wr', 'n'), 'default command family preserves user maps')
  call assert_equal(":<C-U>call wbx#commands#invoke('WebexSend')<CR>", maparg(',WS', 'n'), 'same explicit-send key uses the context-guarded catalogue')
  call assert_true(!empty(wbx#commands#conflicts()))
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 30')
  let s:missing = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexCreateSpace"')[0]
  call assert_match('Missing backend capability: conversations-v1', s:missing.reason)
  call feedkeys(",Wns", 'xt')
  call assert_equal(0, s:count('rooms.create'), 'old backend discovery/defaults explain missing capability without a write or prompt')
  call assert_equal(s:cpo, &cpoptions, 'autoload helpers preserve native cpoptions')
  call assert_true(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "session.start"')[0].params.peopleStatus, 'presence defaults on for an explicit connection')
  let s:buffers = wbx#buffers()
  let s:rooms_window = win_getid()
  let s:history_window = win_findbuf(s:buffers.history)[0]
  call win_execute(s:history_window, 'let g:wbx_navigation_fold_options = [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldtext]')
  call assert_equal(['expr', 'wbx#folds#expr(v:lnum)', 99, ''], g:wbx_navigation_fold_options, 'pre-FileType setup specializes inherited LazyVim fold defaults')
  call assert_equal(['indent', 99, ''], [&g:foldmethod, &g:foldlevel, &g:foldtext], 'global folding configuration is unchanged')
  let s:compose_window = filter(getwininfo(), 'getbufvar(v:val.bufnr, "wbx_kind", "") ==# "compose"')[0].winid
  doautocmd CursorMoved
  sleep 120m
  call assert_equal(0, s:count('rooms.list'), 'initial viewport never drains pages')
  call s:move('G')
  call WaitFor('s:count("rooms.list") == 1')
  for s:i in range(1, 10) | doautocmd CursorMoved | endfor
  call WaitFor('len(wbx#state().rooms) == 50')
  sleep 120m
  call assert_equal(1, s:count('rooms.list'), 'restoration and repeated edge events do not storm')
  call s:move('gg')
  call s:control('test.fail', {'fail': v:true})
  call s:move('G')
  call WaitFor('s:count("rooms.list") == 2')
  sleep 120m
  call s:move('gg')
  call s:move('G')
  sleep 120m
  call assert_equal(2, s:count('rooms.list'), 'page errors require explicit retry')
  call assert_match('explicit retry', join(getline(1, '$'), '\n'))
  call s:control('test.fail', {'fail': v:false})
  WebexMoreSpaces
  WebexMoreSpaces
  call WaitFor('len(wbx#state().rooms) == 70')
  call assert_equal(3, s:count('rooms.list'), 'manual retries share one-inflight admission')
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call s:move('gg')
    call winrestview({'lnum':35, 'topline':10})
    call wbx#paging#baseline()
    let s:cursor = line('.')
    execute "normal! 3\<C-e>"
    call wbx#_scrolled(string(win_getid()))
    call assert_equal(s:cursor, line('.'), 'native viewport scrolling need not move the cursor')
    call WaitFor('s:count("rooms.list") == 4')
    call WaitFor('len(wbx#state().rooms) == 90')
  endif

  call wbx#select('nav-0')
  call WaitFor('wbx#state().ready')
  call win_gotoid(s:history_window)
  call s:at('message-120', 2)
  let s:first = s:identity()
  execute 'tab sbuffer ' . s:buffers.history
  let s:second_window = win_getid()
  call s:at('message-130', 1)
  let s:second = s:identity()
  let s:messages = wbx#state().messages
  let s:older = [{'id': 'older-anchor', 'author': 'Older', 'created': '2026-11-08T00:00:00Z', 'text': 'Older\nbody\nendpoint'}]
  call s:control('test.publish', {'messages': s:older + s:messages})
  call assert_equal(s:second, s:identity(), 'second tab retains message and intra-message position on prepend')
  call win_gotoid(s:history_window)
  call assert_equal(s:first, s:identity(), 'first window has an independent stable anchor')
  call s:control('test.publish', {'messages': s:messages})
  call assert_equal(s:first, s:identity(), 'oldest eviction preserves surviving anchor')
  doautocmd CursorMoved
  call assert_equal(0, s:count('messages.list'), 'restored history does not auto-load')
  call s:move('gg')
  call WaitFor('s:count("messages.list") == 1')
  call WaitFor('len(wbx#state().messages) == 45')
  sleep 120m
  call assert_equal(1, s:count('messages.list'), 'history prepend does not start another page')
  call s:move('G')
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call winrestview({'lnum': b:wbx_paging_edge + 30, 'topline': b:wbx_paging_edge + 15})
    call wbx#paging#baseline()
    let s:scroll_anchor = s:identity()[0:2]
    execute "normal! 12\<C-y>"
    call wbx#_scrolled(string(win_getid()))
    call assert_equal(s:scroll_anchor, s:identity()[0:2], 'viewport paging retains cursor message identity despite loading chrome')
  else
    call s:move('gg')
  endif
  call WaitFor('s:count("messages.list") == 2')
  " Switch while the request is delayed: the stale callback cannot unlock or
  " overwrite the new room's paging generation or select a different draft.
  call wbx#select('nav-1')
  call WaitFor('wbx#state().room.id ==# "nav-1" && len(wbx#state().messages) == 40')
  sleep 120m
  call assert_equal('nav-1', wbx#state().room.id)
  call assert_equal(40, len(wbx#state().messages))
  WebexOlder
  call WaitFor('len(wbx#state().messages) == 45')
  call assert_equal(3, s:count('messages.list'), 'new room has independent paging admission after a stale completion')
  let s:cap = map(range(1, 500), '{"id":"cap-" . v:val,"author":"Synthetic","created":"2026-11-09T00:00:00Z","text":"bounded"}')
  call s:control('test.publish', {'messages': s:cap})
  call s:move('G')
  call s:move('gg')
  WebexOlder
  sleep 120m
  call assert_equal(3, s:count('messages.list'), '500-message memory bound stops manual and automatic paging')
  call assert_match('memory limit', join(getline(1, '$'), '\n'))
  call assert_equal(0, s:count('rooms.read'), 'pagination never acknowledges')
  call assert_equal(0, s:count('messages.send'), 'pagination never sends')
  call win_execute(s:second_window, 'enew')
  let s:threaded = [{'id':'write-root','author':'Root','created':'','text':'Original body'}, {'id':'write-middle','author':'Other','created':'','text':'Unchanged intervening body'}, {'id':'write-reply','parentId':'write-root','author':'Reply','created':'','text':'Answer'}]
  call s:control('test.publish', {'messages':s:threaded})
  let s:middle_decoration = deepcopy(b:wbx_block_decorations['write-middle'])
  let s:threaded[0].text = "Changed body\nExtra body row"
  call s:control('test.publish', {'messages':s:threaded})
  call assert_equal(1, b:wbx_decoration_work.messages, 'a parent-body edit no longer rewrites the reply or intervening decorations')
  call assert_equal(s:middle_decoration, b:wbx_block_decorations['write-middle'], 'unchanged message decoration ownership survives disjoint edits and line growth')

  " Newest folded body must be excluded on BOTH receipt paths.
  call s:control('test.publish', {'messages': s:messages, 'moreHistory': v:false})
  let s:last = b:wbx_message_blocks[-1]
  setlocal foldmethod=manual
  execute s:last.body . ',' . (s:last.end - 1) . 'fold'
  normal! Gzb
  WebexMarkRead
  sleep 30m
  call assert_equal(0, s:count('rooms.read'), 'closed newest body cannot be manually acknowledged')
  let g:wbx_tui.mark_read_on_open = 1
  call win_gotoid(s:rooms_window)
  call wbx#select('nav-0', 1)
  call WaitFor('bufnr("%") == s:buffers.history')
  sleep 30m
  call assert_equal(0, s:count('rooms.read'), 'closed newest body cannot be acknowledged on explicit open')
  let g:wbx_tui.mark_read_on_open = 0
  normal! zR
  call s:control('test.publish', {'historyLatest': v:false})
  normal! Gzb
  WebexMarkRead
  sleep 30m
  call assert_equal(0, s:count('rooms.read'), 'an older capped projection is not the known latest endpoint')
  call s:control('test.publish', {'historyLatest': v:true})
  normal! Gzb
  WebexMarkRead
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call WaitFor('s:count("rooms.read") == 1')
  else
    sleep 30m
    call assert_equal(0, s:count('rooms.read'), 'undrawn silent Ex is not a visible endpoint')
  endif

  " Unload/reopen is not an edit; annotated projections still survive unload!.
  call win_gotoid(s:second_window)
  close
  call win_gotoid(s:rooms_window)
  execute 'bunload! ' . s:buffers.history
  call wbx#select('nav-0', 1)
  call WaitFor('bufnr("%") == s:buffers.history && bufloaded(s:buffers.history)')
  call assert_match('Body 139', join(getline(1, '$'), '\n'), 'unchanged unloaded projection is rebuilt on explicit reopen')
  setlocal modifiable
  call setline(1, 'Private retained annotation')
  call win_gotoid(s:rooms_window)
  execute 'bunload! ' . s:buffers.history
  call assert_equal(1, getbufvar(s:buffers.history, 'wbx_unloaded_edited', 0), 'edited unload is recorded')
  call assert_equal('Private retained annotation', get(getbufvar(s:buffers.history, 'wbx_unloaded_text', []), 0, ''), 'edited text is captured before unloading')
  noautocmd call bufload(s:buffers.history)
  call s:control('test.publish', {'notice':'Synthetic publication during edited hidden reload'})
  execute 'bunload! ' . s:buffers.history
  execute 'sbuffer ' . s:buffers.history
  call assert_equal('Private retained annotation', getline(1), 'edited unloaded view is not overwritten')
  WebexRefresh!

  " Loading a clean projection while hidden is not permission to replace later
  " native edits, even when nofile/nomodified cannot identify those edits.
  for s:load_without_hooks in [0, 1]
    call win_gotoid(s:rooms_window)
    execute 'bunload! ' . s:buffers.history
    call assert_true(getbufvar(s:buffers.history, 'wbx_unloaded_clean', 0), 'clean unload leaves a pending regeneration marker')
    if s:load_without_hooks
      noautocmd call bufload(s:buffers.history)
    else
      call bufload(s:buffers.history)
    endif
    call assert_true(getbufvar(s:buffers.history, 'wbx_unloaded_clean', 0))
    call setbufvar(s:buffers.history, '&modifiable', 1)
    call setbufline(s:buffers.history, 1, 'Private hidden reload annotation')
    call setbufvar(s:buffers.history, '&modified', 0)
    let s:hidden_text = getbufline(s:buffers.history, 1, '$')
    let s:hidden_tick = getbufvar(s:buffers.history, 'changedtick')
    call s:control('test.publish', {'notice':'Synthetic hidden reload publication'})
    call assert_equal(s:hidden_text, getbufline(s:buffers.history, 1, '$'), 'background state preserves edits made after hidden bufload of a clean projection')
    call assert_equal(s:hidden_tick, getbufvar(s:buffers.history, 'changedtick'), 'background reload protection does not write or change native undo state')
    execute 'sbuffer ' . s:buffers.history
    call assert_equal(s:hidden_text, getline(1, '$'), 'explicit reopen does not baseline or overwrite hidden reload edits')
    call assert_true(wbx#view#edited(bufnr('%')), 'hidden reload edits remain an edited projection after reopen')
    WebexRefresh!

    call win_gotoid(s:rooms_window)
    execute 'bunload! ' . s:buffers.history
    if s:load_without_hooks
      noautocmd call bufload(s:buffers.history)
    else
      call bufload(s:buffers.history)
    endif
    call setbufvar(s:buffers.history, '&modifiable', 1)
    call setbufline(s:buffers.history, 1, ['Private direct-reopen annotation', 'Retain this second native line'])
    call setbufvar(s:buffers.history, '&modified', 0)
    let s:hidden_text = getbufline(s:buffers.history, 1, '$')
    let s:hidden_tick = getbufvar(s:buffers.history, 'changedtick')
    execute 'sbuffer ' . s:buffers.history
    call assert_equal(s:hidden_text, getline(1, '$'), 'reopen without an intervening publication also preserves new hidden edits')
    call assert_equal(s:hidden_tick, b:changedtick, 'reopen does not rewrite newly edited content')
    call assert_true(wbx#view#edited(bufnr('%')), 'reopen must not adopt a private annotation as generated content')
    let s:hidden_undo = undotree()
    call s:control('test.publish', {'notice':'Synthetic publication after direct reopen'})
    call assert_equal(s:hidden_text, getline(1, '$'), 'later publication still respects edits after direct reopen')
    call assert_equal(s:hidden_undo, undotree(), 'background publication retains native history-annotation undo after reopen')
    WebexRefresh!
  endfor

  " An untouched blank reload can still rebuild, but only on explicit reopen.
  call win_gotoid(s:rooms_window)
  execute 'bunload! ' . s:buffers.history
  call bufload(s:buffers.history)
  let s:blank_text = getbufline(s:buffers.history, 1, '$')
  let s:blank_tick = getbufvar(s:buffers.history, 'changedtick')
  call s:control('test.publish', {'notice':'Synthetic publication before blank reopen'})
  call assert_equal(s:blank_text, getbufline(s:buffers.history, 1, '$'), 'background publication does not regenerate a hidden clean-reload marker')
  call assert_equal(s:blank_tick, getbufvar(s:buffers.history, 'changedtick'))
  execute 'sbuffer ' . s:buffers.history
  call assert_match('Body 139', join(getline(1, '$'), '\n'), 'blank clean reload is rebuilt on explicit reopen')
  call assert_false(wbx#view#edited(bufnr('%')), 'safe blank reopen remains a generated projection')

  " Presence headers consume only validated snapshots; rendering never looks
  " people up or changes destination-bound drafts, focus, titles or receipts.
  let s:direct = extend(deepcopy(wbx#state().room), {'type':'direct'}, 'force')
  call s:control('test.publish', {'room':s:direct})
  let s:people_windows = has('nvim') ? nvim_list_wins() : popup_list()
  call assert_equal([], filter(s:people_windows, has('nvim') ? '!empty(nvim_win_get_config(v:val).relative)' : '1'), 'normal coordinator rendering never creates a People overlay')
  call assert_equal(0, s:count('people.lookup'), 'automatic presentation consumes selected-peer state without an extra lookup')
  call assert_notmatch('\[Presence ', join(getbufline(s:buffers.history, 1, '$'), '\n'), 'old backend without a validated snapshot does not fabricate a presence header')
  let s:off = {'capability':'off', 'state':'unavailable', 'presence':'unknown', 'customStatus':'unsupported', 'roomId':s:direct.id, 'reason':'off'}
  call s:control('test.publish', {'peopleStatus':s:off})
  call assert_match('\[Presence off\]', join(getbufline(s:buffers.history, 1, '$'), '\n'), 'a disabled old session stays explicit and concise')
  let g:wbx_tui.people_status = 0
  call s:control('test.publish', {'peopleStatus':s:off})
  call assert_notmatch('\[Presence ', join(getbufline(s:buffers.history, 1, '$'), '\n'), 'an explicit client opt-out still stays quiet')
  WebexCompose
  let s:metadata_draft = bufnr('%')
  let s:metadata_original = getline(1, '$')
  call setline(1, 'Private draft during presence metadata')
  let s:metadata_tick = b:changedtick
  let s:metadata_undo = undotree()
  let s:metadata_focus = win_getid()
  let s:metadata_view = winsaveview()
  let s:metadata_audit = readfile($WBX_EDITOR_AUDIT)
  let s:metadata_messages = deepcopy(wbx#state().messages)
  let s:fresh = {'capability':'ready', 'state':'fresh', 'presence':'active', 'customStatus':'unsupported', 'roomId':s:direct.id, 'observedAt':1700000000000}
  let s:stale = extend(deepcopy(s:fresh), {'state':'stale', 'presence':'inactive', 'reason':'aged'}, 'force')
  let s:scope = {'capability':'scope-required', 'state':'unavailable', 'presence':'unknown', 'customStatus':'unsupported', 'roomId':s:direct.id, 'requiredScope':'spark:people_read', 'reason':'scope-required'}
  for s:people in [s:off, s:fresh, s:stale, s:scope]
    let g:wbx_tui.people_status = 1
    call s:control('test.requests', {})
    let s:metadata_rpcs = copy(s:rpc_log)
    call s:control('test.publish', {'peopleStatus':s:people})
    call s:control('test.requests', {})
    call assert_equal(s:metadata_rpcs + ['test.publish', 'test.requests'], s:rpc_log, 'presence publication emits no extra plugin RPC, lookup, pagination, send or receipt')
    call assert_equal('# ' . s:direct.title, getbufline(s:buffers.history, 1)[0], 'presence never changes the room title')
    call assert_equal('[' . wbx#people#line(s:people) . ']', getbufline(s:buffers.history, 3)[0], 'direct header displays only the provider snapshot line')
    call assert_equal(s:metadata_focus, win_getid(), 'presence metadata is focus-neutral')
    call assert_equal(s:metadata_draft, bufnr('%'))
    call assert_equal(s:metadata_view, winsaveview())
    call assert_equal(['Private draft during presence metadata'], getline(1, '$'))
    call assert_equal(s:metadata_tick, b:changedtick, 'presence metadata does not edit a draft')
    call assert_equal(s:metadata_undo, undotree(), 'presence metadata preserves native draft undo')
    call assert_equal(s:metadata_messages, wbx#state().messages, 'presence does not infer or rewrite message content')
  endfor
  call assert_equal(s:metadata_audit, readfile($WBX_EDITOR_AUDIT), 'metadata rendering performs no backend mutation or lookup')
  let g:wbx_tui.people_status = 1
  let s:group = extend(deepcopy(s:direct), {'type':'group'}, 'force')
  call s:control('test.publish', {'room':s:group, 'peopleStatus':{'capability':'ready', 'state':'unknown', 'presence':'unknown', 'customStatus':'unsupported', 'roomId':s:group.id, 'reason':'not-direct'}})
  call assert_notmatch('\[Presence ', join(getbufline(s:buffers.history, 1, '$'), '\n'), 'group timelines do not acquire direct-person headers')
  let g:wbx_tui.people_status = 0
  call setline(1, s:metadata_original)

  " Manual owned sizes survive external equalization and terminal shrink/grow.
  call win_gotoid(s:rooms_window)
  doautocmd WinResized
  vertical resize 38
  doautocmd WinResized
  call win_gotoid(s:compose_window)
  resize 11
  doautocmd WinResized
  let s:equalalways = &equalalways
  augroup wbx_navigation_equalize
    autocmd!
    autocmd VimResized * tabdo wincmd =
  augroup END
  let s:focus = win_getid()
  set columns=190 lines=70
  doautocmd VimResized
  sleep 30m
  call assert_equal(38, getwininfo(s:rooms_window)[0].width)
  call assert_equal(11, getwininfo(s:compose_window)[0].height)
  set columns=65 lines=22
  doautocmd VimResized
  sleep 30m
  set columns=190 lines=70
  doautocmd VimResized
  sleep 30m
  call assert_equal(38, getwininfo(s:rooms_window)[0].width, 'preferred sidebar width returns after terminal growth')
  call assert_equal(11, getwininfo(s:compose_window)[0].height, 'preferred composer height returns after terminal growth')
  call assert_equal(s:equalalways, &equalalways, 'global equalization preference is untouched')
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  close
  call win_gotoid(s:compose_window)
  doautocmd WinResized
  WebexDemo
  call WaitFor('s:count("session.start") == 2')
  call assert_equal(s:compose_window, win_getid(), 'recreating a missing pane preserves the surviving reader focus')
  call assert_equal(38, getwininfo(s:rooms_window)[0].width, 'pane recreation retains the surviving sidebar preference')
  call assert_equal(11, getwininfo(s:compose_window)[0].height, 'automatic expansion after pane close is not mistaken for a manual resize')
  WebexLayoutReset
  call assert_equal(30, getwininfo(s:rooms_window)[0].width)
  call assert_equal(8, getwininfo(s:compose_window)[0].height)
  call win_gotoid(s:compose_window)
  split
  enew
  call assert_false(&l:winfixheight, 'native split releases copied fixed-size ownership on foreign work')
  close
  call win_gotoid(s:compose_window)
  enew
  call assert_false(&l:winfixheight, 'foreign buffer does not inherit owned geometry protection')
  let s:foreign = win_getid()
  let s:geometry = map(getwininfo(), '[v:val.winid, v:val.width, v:val.height]')
  WebexLayoutReset
  call assert_equal(s:geometry, map(getwininfo(), '[v:val.winid, v:val.width, v:val.height]'), 'mixed tab layout reset leaves foreign geometry alone')
  call assert_equal(s:foreign, win_getid())

  " Aggregate unread health is visible even with a full list; media is truthful.
  let s:many_rooms = map(range(1,500), '{"id":"room-" . v:val,"title":"Space " . v:val}')
  call s:control('test.publish', {'rooms': s:many_rooms, 'readStatus': 'failed', 'readStatusNotice': 'Synthetic failure'})
  call assert_equal('', getbufline(s:buffers.rooms, 2)[0], 'sync diagnostics stay out of the spaces header')
  call assert_match('Unread sync unavailable', join(getbufline(s:buffers.rooms, 1, '$'), "\n"))
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':{'active':v:true,'ready':v:true,'session':'wbx-native-status','display':'kitty','attach':[]}})
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'sources','sources':[{'id':'self','kind':'local','label':'Your camera SENDING TO MEETING','available':v:false},{'id':'video','kind':'video','label':'Remote synthetic','available':v:true}]}})
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'camera-state','state':'on','sending':v:false,'requestId':1}})
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'audio-state','enabled':v:true}})
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'send-state','kind':'camera','state':'awaiting','requestId':1,'reason':'denied'}})
  let s:meeting_text = join(getbufline(wbx#buffers().meeting, 1, '$'), '\n')
  call assert_notmatch('SENDING TO MEETING', s:meeting_text)
  call assert_match('Meeting camera source · unavailable', s:meeting_text)
  call assert_match('Local preview: on · NOT SENT', s:meeting_text)
  call assert_match('Rx audio playback: enabled', s:meeting_text)
  call assert_match('pending trusted browser confirmation.*reason: denied', s:meeting_text)
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':{'active':v:true,'ready':v:false,'session':'wbx-native-status','display':'kitty','attach':[]}})
  call assert_match('Observations STALE', join(getbufline(wbx#buffers().meeting, 1, '$'), '\n'))
  WebexCompose
  call assert_equal('', get(b:, 'wbx_send_hint', ''), 'composer chrome has no command tutorial')
  call assert_equal([''], getline(1, '$'), 'send/help context never becomes draft text')
  call assert_notequal('%!wbx#statusline()', &l:statusline, 'context does not require taking over the statusline')
  let g:wbx_tui.leader_prefix = ',X'
  call wbx#commands#setup()
  call assert_equal('', maparg(',WS', 'n'))
  call assert_match('WebexSend', maparg(',XS', 'n'), 'command prefix is configurable')
  call assert_match('wbx_navigation_conflict', maparg(',Wr', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg(',XS', 'n'))
  let g:wbx_tui.mappings = 1
  let g:wbx_tui.leader_prefix = '<leader>W'
  let g:mapleader = ' '
  call wbx#commands#setup()
  call assert_match('WebexSend', maparg('<Space>WS', 'n'), 'space leaders work without rewriting user settings')
  nnoremap <buffer> <Space>WS :let g:wbx_navigation_local_send = 1<CR>
  call assert_match('current user mapping', join(wbx#commands#conflicts(), '\n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_match('wbx_navigation_local_send', maparg('<Space>WS', 'n'), 'disabling defaults retains a user-local shadow')
  nunmap <buffer> <Space>WS
  call assert_equal('', maparg('<Space>WS', 'n'), 'expanded space-leader maps are safely released')
  if has('nvim')
    lua << trim LUA
      local starts, stops, wk_entries = 0, 0, {}
      local ts = vim.treesitter
      local start, stop = ts.start, ts.stop
      ts.start = function() starts = starts + 1 end
      ts.stop = function() stops = stops + 1 end
      package.loaded['which-key'] = { add = function(entries) wk_entries = entries end }
      require('wbx-tui').setup({ treesitter = true, which_key = true, mappings = true })
      require('wbx-tui').setup({ folds = false })
      assert(vim.g.wbx_tui.folds == false, 'Lua forwards the native folding opt-out')
      require('wbx-tui').setup({ folds = true })
      local stopped_before = stops
      local buffers = vim.fn['wbx#buffers']()
      vim.g.wbx_tui_event = { bufnr = buffers.history, kind = 'history' }
      vim.api.nvim_exec_autocmds('User', { pattern = 'WbxBuffer' })
      assert(starts == 0 and stops == stopped_before + 1, 'whole-history Tree-sitter must stop, never start')
      vim.g.wbx_tui_event = { bufnr = vim.api.nvim_get_current_buf(), kind = 'compose' }
      vim.api.nvim_exec_autocmds('User', { pattern = 'WbxBuffer' })
      assert(starts == 1 and stops == stopped_before + 1, 'composer retains ordinary whole-buffer parsing')
      local named, described = false, false
      for _, entry in ipairs(wk_entries) do
        if entry.group and entry.group() == 'Webex' then named = true end
        if entry.real and type(entry.desc) == 'function' and entry.desc() then described = true end
      end
      assert(named and described, 'which-key receives named groups and effective short leaf labels, independent of entry order')
      ts.start, ts.stop = start, stop
      package.loaded['which-key'] = nil
    LUA
  endif
  " Real workspace creation must let FileType/local overrides win AFTER the
  " inherited-default prehook, including a FileType opt-out that releases it.
  call s:control('test.publish', {'rooms':[{'id':'nav-0','title':'Synthetic 0','unread':v:false}]})
  augroup wbx_navigation_fold_hooks
    autocmd!
    autocmd FileType wbx-history setlocal foldmethod=manual foldlevel=3 foldtext=foldtext()
  augroup END
  execute 'bwipeout! ' . wbx#buffers().history
  call wbx#select('nav-0', 1)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history"')
  call assert_equal(['manual', 3, 'foldtext()'], [&l:foldmethod, &l:foldlevel, &l:foldtext], 'FileType fold overrides win in an actual owned history window')
  call s:control('test.publish', {'notice':'Synthetic hook preservation'})
  call assert_equal(['manual', 3, 'foldtext()'], [&l:foldmethod, &l:foldlevel, &l:foldtext], 'later rendering does not reapply folding defaults')
  call win_gotoid(s:rooms_window)
  augroup wbx_navigation_fold_hooks
    autocmd!
    autocmd FileType wbx-history let b:wbx_folds = 0
  augroup END
  execute 'bwipeout! ' . wbx#buffers().history
  call wbx#select('nav-0', 1)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history"')
  call assert_equal(['indent', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext], 'FileType opt-out releases only the prehook-owned folding defaults')
  let g:wbx_tui.people_status = 1
  let s:start_count = s:count('session.start')
  WebexDemo
  call WaitFor('s:count("session.start") == s:start_count + 1')
  let s:starts = filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "session.start"')
  call assert_equal(v:true, get(s:starts[-1].params, 'peopleStatus', v:false), 'people status is forwarded only after explicit opt-in')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
