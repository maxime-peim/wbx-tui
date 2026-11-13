" Exact explicit query/page/recipient choices with synthetic transport only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:directory_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return g:directory_available', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid directory DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:directory_requests, [a:method, deepcopy(a:params)])',
      \ 'if g:directory_hold | let g:DirectoryCallback = a:Callback | return 1 | endif',
      \ 'call call(a:Callback, [{"result": deepcopy(g:directory_result)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
call writefile(['function! wbx#conversations#direct(person) abort', 'call add(g:directory_direct, a:person)', 'endfunction'], s:stub . '/autoload/wbx/conversations.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:directory_available = 1
let g:directory_hold = 0
let g:directory_direct = []
let g:directory_requests = []
let g:directory_state = {'state': 'ready', 'ready': v:false, 'room': v:null,
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:directory_result = {'sessionId': repeat('a', 32), 'query': 'Demo', 'revision': 1, 'coverage': 'directory-prefix',
      \ 'observedAt': localtime() * 1000, 'partial': v:true, 'more': v:true,
      \ 'items': [{'personId': 'person-a', 'label': 'Same Name'}, {'personId': 'person-b', 'label': 'Same Name'}]}
command! WebexDirectoryRefresh call wbx#directory#show('', 2)
command! WebexDirectoryMore call wbx#directory#show('', 1)
command! WebexDirectoryDirect call wbx#directory#direct()
try
  call setline(1, 'Native unrelated work')
  let original = bufnr('%')
  let g:directory_available = 0
  call wbx#directory#show('Demo', 0)
  call assert_equal([], g:directory_requests)
  let g:directory_available = 1
  call wbx#directory#show('', 1)
  call wbx#directory#show('*', 0)
  call wbx#directory#show('a', 0)
  call assert_equal([], g:directory_requests, 'wrong context/invalid prefixes never query')
  call wbx#directory#show('Demo', 0)
  call assert_equal([['people.search', {'query': 'Demo'}]], g:directory_requests)
  call assert_equal('directory', b:wbx_list_kind)
  let directory = bufnr('%')
  let g:directory_result.revision = 2
  let g:directory_result.more = v:false
  let g:directory_result.partial = v:false
  call add(g:directory_result.items, {'personId': 'person-c', 'label': 'Second page'})
  normal ]p
  call assert_equal(['people.search', {'query': 'Demo', 'more': v:true, 'revision': 1}], g:directory_requests[-1], 'paging is explicit and revision-bound')
  call cursor(7, 1)
  execute "normal \<CR>"
  call assert_equal(['person-c'], g:directory_direct)
  let b:wbx_directory_snapshot.observedAt -= 120001
  execute "normal \<CR>"
  call assert_equal(['person-c'], g:directory_direct, 'expired hit never prepares a recipient')
  let b:wbx_directory_snapshot.observedAt = localtime() * 1000
  let g:directory_hold = 1
  normal r
  setlocal modifiable
  call setline(1, 'New note while query pending')
  let tree = undotree()
  call call(g:DirectoryCallback, [{'result': g:directory_result}])
  call assert_equal('New note while query pending', getline(1))
  call assert_equal(tree, undotree())
  let before = len(g:directory_requests)
  normal r
  call assert_equal(before, len(g:directory_requests), 'annotated list refuses before provider request')
  execute 'bwipeout! ' . directory
  execute 'buffer ' . original
  call wbx#directory#show('Demo', 0)
  let OldCallback = g:DirectoryCallback
  let g:directory_state.localContext.sessionId = repeat('b', 32)
  let g:directory_result.sessionId = repeat('b', 32)
  let g:directory_hold = 0
  call wbx#directory#show('Demo', 0)
  call assert_true(wbx#directory#current(), 'new session revokes a dropped callback instead of permanently wedging lookup')
  let session = b:wbx_directory_snapshot.sessionId
  let old = deepcopy(g:directory_result) | let old.sessionId = repeat('a', 32)
  call call(OldCallback, [{'result': old}])
  call assert_equal(session, b:wbx_directory_snapshot.sessionId, 'old query cannot replace newer session results')
  let invalid = deepcopy(g:directory_result)
  let invalid.items[0].emails = ['private@example.invalid']
  call assert_false(wbx#protocol#directory(invalid), 'DTO cannot leak emails/raw fields to the editor')
  let invalid = deepcopy(g:directory_result)
  let invalid.items[1].personId = invalid.items[0].personId
  call assert_false(wbx#protocol#directory(invalid))
  let g:directory_hold = 1
  normal r
  let ReturnedCallback = g:DirectoryCallback
  split
  close
  let text = getline(1, '$')
  call call(ReturnedCallback, [{'result': g:directory_result}])
  call assert_equal(text, getline(1, '$'), 'away-and-return choices cannot replace a list')
  nnoremap <buffer> q :let g:directory_user_map = 1<CR>
  let g:wbx_tui = {'mappings': 0}
  call wbx#lists#setup()
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_equal('', maparg('r', 'n'))
  call assert_match('directory_user_map', maparg('q', 'n'), 'user shadow survives opt-out')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
