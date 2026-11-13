" Native uncertainty recovery, no provider/transport. Callbacks are deliberately held.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:mutation_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Unexpected protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'call add(g:mutation_requests, {"method": a:method, "params": deepcopy(a:params)})',
      \ 'if !a:0 | return 1 | endif',
      \ 'if a:method ==# "messages.actionPrepare"',
      \ 'let g:mutation_context.action = a:params.action',
      \ 'call call(a:1, [{"result": deepcopy(g:mutation_context)}])',
      \ 'elseif a:method ==# "messages.actionSubmit"',
      \ 'let value = extend(deepcopy(g:mutation_context), deepcopy(a:params))',
      \ 'let g:mutation_outcome = {"requestId": value.requestId, "contextId": value.contextId, "roomId": value.roomId, "messageId": value.messageId, "action": value.action, "revision": value.revision, "status": "unknown", "notice": "UNKNOWN; inspect exact message"}',
      \ 'if get(g:, "mutation_hold", 0)', 'let g:MutationCallback = a:1',
      \ 'else', 'call call(a:1, [{"result": deepcopy(g:mutation_outcome)}])', 'endif',
      \ 'elseif a:method ==# "messages.actionResolve"',
      \ 'if get(g:, "mutation_resolve_hold", 0) | let g:ResolveCallback = a:1 | return 1 | endif',
      \ 'call call(a:1, [get(g:, "mutation_resolve_fail", 0) ? {"error": {"code": -1, "message": "Synthetic refusal"}} : {"result": v:null}])',
      \ 'endif', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:mutation_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Synthetic', 'type': 'group'}}
let g:mutation_requests = []
let g:mutation_context = {'contextId': repeat('a', 32), 'roomId': 'r', 'messageId': 'm',
      \ 'action': 'delete', 'content': 'Own native text', 'format': 'plain', 'expiresAt': 1999999999999}
runtime autoload/wbx/message_actions.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/message_actions.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn 1\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\nif get(g:, 'mutation_pick_hold', 0) | let g:MutationPick = a:Callback | return | endif\nnew\nclose\ncall call(a:Callback, [1])\nendfunction"
function! s:history() abort
  enew
  file wbx://history
  setlocal buftype=nofile modifiable
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'r'
  call setline(1, ['Header', 'Own native text', ''])
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = [{'id': 'm', 'start': 1, 'body': 2, 'end': 3}]
  call cursor(2, 1)
endfunction
try
  call s:history()
  call wbx#message_actions#prepare('delete')
  call assert_equal('messages.actionSubmit', g:mutation_requests[-1].method)
  let b:wbx_message_blocks = []
  let g:mutation_pick_hold = 1
  call wbx#message_actions#resolve()
  let attempts = len(g:mutation_requests)
  let g:mutation_state.room.id = 'different'
  call call(g:MutationPick,[1])
  call assert_equal(attempts,len(g:mutation_requests),'changed destination rejects delayed recovery menu')
  let g:mutation_state.room.id = 'r' | let g:mutation_pick_hold = 0
  let g:mutation_resolve_fail = 1
  call wbx#message_actions#resolve()
  call assert_equal('messages.actionResolve', g:mutation_requests[-1].method, 'delete uncertainty is recoverable even without an edit buffer or remaining history row')
  let g:mutation_resolve_fail = 0
  call wbx#message_actions#resolve()
  call assert_equal(2, count(map(copy(g:mutation_requests), 'v:val.method'), 'messages.actionResolve'), 'failed resolution retains the exact uncertain identity')
  call assert_equal({'roomId': 'r', 'messageId': 'm'}, g:mutation_requests[-1].params)
  call assert_equal(1, count(map(copy(g:mutation_requests), 'v:val.method'), 'messages.actionSubmit'), 'resolution never replays deletion')
  let b:wbx_message_blocks = [{'id': 'm', 'start': 1, 'body': 2, 'end': 3}]
  call wbx#message_actions#prepare('delete')
  let g:mutation_resolve_hold = 1
  call wbx#message_actions#resolve()
  let g:mutation_resolve_hold = 0
  call wbx#message_actions#resolve()
  call wbx#message_actions#prepare('delete')
  call call(g:ResolveCallback, [{'result': v:null}])
  let attempts = len(g:mutation_requests)
  call wbx#message_actions#prepare('delete')
  call assert_equal(attempts, len(g:mutation_requests), 'a late older resolution cannot clear a newer unknown result')
  call wbx#message_actions#resolve()
  let g:mutation_hold = 1
  call wbx#message_actions#prepare('edit')
  let edit = bufnr('%')
  call setline(1, 'New native edit text')
  call feedkeys("i\<Esc>",'xt')
  let native = [b:changedtick,undotree()]
  call wbx#message_actions#submit()
  call assert_match('^submitting',b:wbx_mutation_status)
  call assert_match('^EDIT.*submitting',b:wbx_reply_banner[1],'pending state is first, before potentially long target IDs')
  let edit_window = win_getid()
  vnew
  call setline(1,'Independent unsent text')
  let independent = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  call call(g:MutationCallback,[{'error':{'code':-1,'message':'Synthetic transport failure'}}])
  call assert_equal(independent,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'background outcome never steals focus or undo')
  call assert_match('unknown.*:WebexMutationResolve',getbufvar(edit,'wbx_reply_banner')[1],'visible edit banner updates even while another split is focused')
  close
  call win_gotoid(edit_window)
  call assert_equal(native,[b:changedtick,undotree()])
  let methods = len(g:mutation_requests)
  call wbx#message_actions#submit()
  call assert_equal(methods,len(g:mutation_requests),'transport uncertainty cannot admit a second write')
  call wbx#message_actions#resolve()
  execute 'buffer ' . bufnr('wbx://history')
  let g:mutation_context.contextId = repeat('b',32)
  call wbx#message_actions#prepare('edit')
  let edit = bufnr('%')
  call setline(1,'New native edit text')
  call wbx#message_actions#submit()
  let methods = len(g:mutation_requests)
  call wbx#message_actions#invalidate()
  call assert_match('unknown', b:wbx_mutation_status)
  call wbx#message_actions#submit()
  call assert_equal(methods, len(g:mutation_requests), 'disconnect/unknown status cannot silently admit another edit')
  call call(g:MutationCallback, [{'result': extend(copy(g:mutation_outcome), {'status': 'changed'})}])
  call assert_match('unknown', b:wbx_mutation_status, 'late old-session callback cannot clear uncertainty')
  call assert_equal(['New native edit text'], getline(1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
