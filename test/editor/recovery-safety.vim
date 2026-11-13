" Native recovery admission/lifecycle; all RPC callbacks are inert and controlled.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile([
      \ 'function! wbx#state() abort', 'return deepcopy(g:recovery_state)', 'endfunction',
      \ 'function! wbx#supports_local_drafts() abort', 'return 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Unexpected protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'let req = {"method": a:method, "params": deepcopy(a:params), "session": g:recovery_state.localContext.sessionId}',
      \ 'if a:0 | let req.Callback = a:1 | endif',
      \ 'call add(g:recovery_requests, req)',
      \ 'if a:method ==# "drafts.save" && !g:recovery_hold',
      \ 'call call(req.Callback, [{"result": {"sessionId": req.session, "profile": a:params.profile, "revision": repeat("e", 64)}}])',
      \ 'endif', 'return len(g:recovery_requests)', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'persist_drafts': 0}
let g:recovery_state = {'state': 'ready', 'ready': v:true,
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:recovery_requests = [] | let g:recovery_hold = 0
function! s:create(name, kind, room) abort
  enew
  execute 'file ' . fnameescape(a:name)
  setlocal buftype=nofile bufhidden=hide noswapfile noundofile
  let b:wbx_kind = a:kind | let b:wbx_room = a:room
  let b:wbx_format = 'plain'
  return bufnr('%')
endfunction
function! s:compose(room, text) abort
  let buffer = wbx#drafts#compose({'id': a:room, 'title': a:room}, [], function('s:create'))
  execute 'buffer ' . buffer
  call setline(1, a:text)
  call wbx#draft_persistence#observe(buffer)
  return buffer
endfunction
function! s:open(items) abort
  let requests = filter(copy(g:recovery_requests), 'v:val.method ==# "drafts.open"')
  let req = requests[-1]
  call call(req.Callback, [{'result': {'sessionId': req.session, 'profile': repeat('f', 64),
        \ 'revision': repeat('d', 64), 'items': a:items}}])
endfunction
function! s:saves() abort
  return filter(copy(g:recovery_requests), 'v:val.method ==# "drafts.save"')
endfunction
function! s:ack(req) abort
  call call(a:req.Callback, [{'result': {'sessionId': a:req.session,
        \ 'profile': a:req.params.profile, 'revision': repeat('e', 64)}}])
endfunction
try
  let disabled = s:compose('disabled', 'Account A text')
  let g:recovery_state.localContext.sessionId = repeat('b', 32)
  call assert_false(wbx#draft_persistence#valid(disabled), 'disk opt-out must not disable session provenance')
  let g:wbx_tui.persist_drafts = 1
  let normal = s:compose('normal', '')
  call wbx#draft_persistence#sync(g:recovery_state)
  call setline(1, 'New native text before recovery')
  call wbx#draft_persistence#observe(normal)
  call feedkeys("i\<Esc>", 'xt')
  let native = [getline(1, '$'), undotree()]
  call assert_false(wbx#draft_persistence#valid(normal), 'send admission waits for supported recovery, not just destination readiness')
  call s:open([
        \ {'roomId': 'normal', 'text': 'Old native text', 'format': 'plain', 'uncertain': v:true},
        \ {'roomId': 'unopened', 'parentId': 'old-root', 'text': 'Unopened reply', 'format': 'markdown', 'uncertain': v:true}])
  call assert_equal(native, [getline(1, '$'), undotree()], 'newer native text and undo must not be replaced')
  call assert_true(wbx#drafts#uncertain('normal'), 'typing does not erase recovered uncertainty')
  call assert_true(wbx#drafts#uncertain('unopened'), 'unopened sibling/root evidence protects the whole room')
  sleep 600m
  let writes = s:saves()
  call assert_true(!empty(writes))
  call assert_equal(v:true, writes[-1].params.items[0].uncertain, 'autosave cannot downgrade imported evidence')
  let g:recovery_hold = 1
  call setline(1, 'Outstanding save')
  call wbx#draft_persistence#observe(normal)
  sleep 600m
  let old = s:saves()[-1]
  let g:recovery_state.localContext.sessionId = repeat('c', 32)
  call wbx#draft_persistence#sync(g:recovery_state)
  call s:open([])
  call setline(1, 'New session save')
  call wbx#draft_persistence#observe(normal)
  sleep 600m
  let current = s:saves()[-1]
  call assert_equal(repeat('c', 32), current.session, 'abandoned saves cannot wedge the next session')
  call s:ack(old)
  call setline(1, 'Queued behind current owner')
  call wbx#draft_persistence#observe(normal)
  sleep 600m
  call assert_equal(current, s:saves()[-1], 'late old callback cannot release a newer save')
  call s:ack(current)
  call assert_equal('Queued behind current owner', s:saves()[-1].params.items[0].text)
  let g:recovery_hold = 0
  call s:ack(s:saves()[-1])
  let large = s:compose('000-oversized', repeat('x', 25000))
  let small = s:compose('zzz-small', 'Independent small draft')
  sleep 600m
  let patches = flatten(map(s:saves(), 'copy(v:val.params.items)'))
  call assert_true(!empty(filter(copy(patches), 'v:val.roomId ==# "zzz-small"')), 'one oversize draft cannot starve another')
  call assert_equal(repeat('x', 25000), getbufline(large, 1)[0], 'no clipping of oversized native work')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
