" Inert card bodies, native loaded list keys/undo/help; every RPC is forbidden.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:card_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return a:capability !=# "adaptive-card-text-v1" || g:card_available', 'endfunction',
      \ 'function! wbx#supports_space(action) abort', 'return 0', 'endfunction',
      \ 'function! wbx#meeting_state() abort', 'return {"active": 0}', 'endfunction',
      \ 'function! wbx#meeting_supports(capability) abort', 'return 0', 'endfunction',
      \ 'function! wbx#buffers() abort', 'return {"history": g:card_history}', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#shutdown() abort', 'endfunction',
      \ 'function! wbx#rpc(...) abort', 'throw "Card text attempted a provider/action/receipt request"', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:card_available = 1
let g:card_pwned = 0
let g:card_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'room', 'title': 'Synthetic cards'},
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
" The inert projection seam has no session/layout coordinator. Production
" command registration is independently checked by action-catalogue.vim.
command! WebexCards call wbx#productivity#content('cards')
command! -nargs=? WebexContent call wbx#productivity#content(<q-args>)
command! WebexActions call wbx#commands#show()
command! WebexQuote call wbx#productivity#quote()
command! WebexQuoteInsert call wbx#productivity#insert()
call wbx#commands#setup()
try
  " Fixed test-only parser invocation: never execute a string from card content.
  let parsed = system(shellescape($WBX_NODE) . ' --import '
        \ . shellescape($WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs') . ' '
        \ . shellescape($WBX_EDITOR_ROOT . '/test/card-native-fixture.ts'))
  call assert_equal(0, v:shell_error, parsed)
  let g:card_state.messages = json_decode(parsed)
  call assert_true(wbx#protocol#cards({'count': 1, 'partial': v:false}))
  for invalid in [{'count': 0, 'partial': v:false}, {'count': 11, 'partial': v:true},
        \ {'count': '1', 'partial': v:false}, {'count': 1, 'partial': 0},
        \ {'count': 1, 'partial': v:true, 'url': 'https://evil.invalid'}, {'content': {'data': 'PRIVATE'}}]
    call assert_false(wbx#protocol#cards(invalid))
  endfor
  enew
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let g:card_history = bufnr('%')
  let view = wbx#history#render(g:card_state.messages, 0)
  call setline(1, view.lines)
  let b:wbx_message_blocks = view.blocks | let b:wbx_render_tick = b:changedtick
  setlocal nomodifiable nomodified
  let history_text = getline(1, '$')
  call assert_match('read-only text subset', join(history_text, ' '))
  call feedkeys("\\WvC", 'xt')
  call assert_equal('content', b:wbx_list_kind)
  call assert_match('LOADED content · cards · PARTIAL', getline(1))
  call assert_match('no fetching', getline(2))
  call assert_equal(5, len(b:wbx_local_targets), 'one exact card message, not label-based inference')
  let list = bufnr('%')
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal(list, bufnr('%'), 'heading has no action target')
  WebexActions
  call assert_match('WvC.*WebexCards', join(getline(1, '$'), ' '))
  normal q
  call assert_equal(list, bufnr('%'))
  call cursor(5, 1)
  execute "normal \<CR>"
  call assert_equal(g:card_history, bufnr('%'))
  call assert_equal('card', wbx#view#message_at(bufnr('%'), line('.')))
  call assert_equal(history_text, getline(1, '$'))
  call assert_equal(0, g:card_pwned)
  WebexQuote
  enew
  file wbx://compose/room
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'room' | let b:wbx_parent = '' | let b:wbx_format = 'plain'
  call feedkeys("iIndependent native draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let before = getline(1, '$')
  WebexQuoteInsert
  call assert_match('read-only text subset', join(getline(1, '$'), ' '))
  normal! u
  call assert_equal(before, getline(1, '$'), 'copied card display remains ordinary text with one native undo')
  normal! u
  call assert_equal([''], getline(1, '$'), 'prior native typing remains independently undoable')
  execute 'buffer ' . g:card_history
  let g:card_available = 0
  WebexCards
  call assert_equal(g:card_history, bufnr('%'), 'old backend absence refuses without parsing body labels or querying')
  let g:card_available = 1
  WebexContent cards
  call assert_equal(list, bufnr('%'))
  let g:card_state.localContext.sessionId = repeat('b', 32)
  call cursor(5, 1)
  execute "normal \<CR>"
  call assert_equal(list, bufnr('%'), 'old-session card rows cannot retarget')
  execute 'buffer ' . g:card_history
  WebexCards
  setlocal modifiable
  call setline(1, 'Private card-list annotation')
  let tree = undotree()
  normal r
  normal q
  call assert_equal('Private card-list annotation', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexCards
  call assert_equal('Private card-list annotation', getline(1))
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  execute 'bwipeout! ' . list
  let g:wbx_tui = {'mappings': 0}
  call wbx#commands#setup()
  WebexCards
  call assert_equal('', maparg('\WvC', 'n'))
  call assert_equal('', maparg('r', 'n'))
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_equal(0, g:card_pwned)
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
