" MF22 controlled observation callbacks: only a finite read, never a preference write.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:visibility_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_member_visibility(format) abort', 'return g:visibility_available', 'endfunction',
      \ 'function! wbx#context_epoch() abort', 'return g:visibility_epoch', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid visibility DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call assert_equal("members.visibility", a:method)',
      \ 'call add(g:visibility_requests, [a:method, deepcopy(a:params)])',
      \ 'if g:visibility_hold | let g:VisibilityCallback = a:Callback | return 1 | endif',
      \ 'call call(a:Callback, [{"result": deepcopy(g:visibility_result)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:visibility_available = 0 | let g:visibility_hold = 0 | let g:visibility_epoch = 1 | let g:visibility_requests = []
let g:visibility_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'direct', 'type': 'direct', 'title': 'Synthetic direct'},
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:visibility_result = {'sessionId': repeat('a', 32), 'roomId': 'direct', 'coverage': 'own-direct-membership-flag',
      \ 'observedAt': localtime() * 1000, 'isRoomHidden': v:true}
command! WebexDirectVisibility call wbx#members#visibility()
command! WebexDirectVisibilityRefresh call wbx#members#visibility_refresh()
try
  execute 'file ' . fnameescape(wbx#view#compose_name('direct', ''))
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'direct' | let b:wbx_parent = ''
  call setline(1, 'Retained native work')
  call feedkeys("i\<Esc>", 'xt')
  let source = bufnr('%') | let tree = undotree()
  WebexDirectVisibility
  call assert_equal([], g:visibility_requests)
  let g:visibility_available = 1
  WebexDirectVisibility
  let list = bufnr('%')
  call assert_equal([['members.visibility', {'roomId': 'direct'}]], g:visibility_requests)
  call assert_true(wbx#members#visibility_current())
  call assert_match('true', join(getline(1, '$'), ' '))
  let g:visibility_result.isRoomHidden = v:false
  normal r
  call assert_equal(v:false, b:wbx_member_visibility_snapshot.isRoomHidden)
  let g:visibility_result.isRoomHidden = v:null
  normal r
  call assert_match('Not provided', join(getline(1, '$'), ' '))
  let request_count = len(g:visibility_requests)
  for ignored in range(10) | call wbx#members#visibility_current() | redraw! | endfor
  call assert_equal(request_count, len(g:visibility_requests), 'render/status are not provider refreshes')
  for patch in [{'isRoomHidden': 'false'}, {'favorite': v:true}, {'muted': v:true}, {'personId': 'other'},
        \ {'membershipId': 'own'}, {'isModerator': v:false}, {'coverage': 'webex-hidden-spaces'}]
    call assert_false(wbx#protocol#member_visibility(extend(deepcopy(g:visibility_result), patch)))
  endfor
  let before = deepcopy(b:wbx_member_visibility_snapshot)
  let g:visibility_result.observedAt -= 120001
  normal r
  call assert_equal(before, b:wbx_member_visibility_snapshot, 'stale responses never become current')
  let g:visibility_result.observedAt = localtime() * 1000 + 120000
  normal r
  call assert_equal(before, b:wbx_member_visibility_snapshot, 'future timestamps cannot extend freshness')
  let g:visibility_result.observedAt = localtime() * 1000
  let g:visibility_hold = 1
  normal r
  let Away = g:VisibilityCallback
  split
  close
  call call(Away, [{'result': g:visibility_result}])
  call assert_equal(before, b:wbx_member_visibility_snapshot, 'leave-return cannot install a late observation')
  normal r
  let g:visibility_epoch += 2
  call call(g:VisibilityCallback, [{'result': g:visibility_result}])
  call assert_equal(before, b:wbx_member_visibility_snapshot, 'selected-space away-return invalidates callback')
  normal r
  setlocal modifiable
  call setline(1, 'Annotation during the read')
  call feedkeys("i\<Esc>", 'xt')
  let notes = getline(1, '$') | let note_tree = undotree()
  call call(g:VisibilityCallback, [{'result': g:visibility_result}])
  call assert_equal(notes, getline(1, '$')) | call assert_equal(note_tree, undotree())
  let request_count = len(g:visibility_requests)
  normal r
  normal q
  call assert_equal(request_count, len(g:visibility_requests))
  execute 'bwipeout! ' . list
  execute 'buffer ' . source
  call assert_equal(tree, undotree())
  WebexDirectVisibility
  let Old = g:VisibilityCallback | let old_value = deepcopy(g:visibility_result)
  let g:visibility_state.localContext.sessionId = repeat('b', 32)
  let g:visibility_result.sessionId = repeat('b', 32)
  let g:visibility_hold = 0
  WebexDirectVisibility
  call assert_equal(repeat('b', 32), b:wbx_member_visibility_snapshot.sessionId, 'a dropped old callback never wedges new explicit read')
  call call(Old, [{'result': old_value}])
  call assert_equal(repeat('b', 32), b:wbx_member_visibility_snapshot.sessionId)
  let request_count = len(g:visibility_requests)
  let g:visibility_state.localContext.sessionId = repeat('c', 32)
  let g:visibility_result.sessionId = repeat('c', 32)
  WebexDirectVisibilityRefresh
  call assert_equal(request_count, len(g:visibility_requests), 'old-session view cannot borrow a new identity through Refresh')
  normal q
  WebexDirectVisibility
  call assert_equal(repeat('c', 32), b:wbx_member_visibility_snapshot.sessionId)
  nnoremap <buffer> q :let g:visibility_user_q=1<CR>
  let g:wbx_tui = {'mappings': 0}
  call wbx#lists#setup()
  call assert_equal('', maparg('r', 'n')) | call assert_match('visibility_user_q', maparg('q', 'n'))
  call assert_true(empty(filter(copy(g:visibility_requests), 'v:val[0] !=# "members.visibility"')))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
