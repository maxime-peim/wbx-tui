" All data synthetic. Any RPC is a test failure; no backend, auth or file opens.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:local_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return g:local_available', 'endfunction',
      \ 'function! wbx#buffers() abort', 'return {"history": g:local_history}', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#rpc(...) abort', 'throw "Local feature attempted RPC"', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:local_available = 1
let g:local_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Synthetic'},
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'},
      \ 'messages': [{'id': 'root', 'author': 'Display label', 'text': 'literal <@all> <spark-mention data-object-id="me">Me</spark-mention> https://example.invalid/path',
      \ 'created': '2026-11-15T10:00:00.000Z'},
      \ {'id': 'reply', 'parentId': 'root', 'author': 'Reply label', 'text': 'reply', 'created': '2026-11-15T10:01:00.000Z', 'attachments': [{'id': 'inert'}]},
      \ {'id': 'orphan', 'parentId': 'missing', 'author': 'Orphan', 'text': 'orphan', 'created': '2026-11-15T10:02:00.000Z'},
      \ {'id': 'cycle-a', 'parentId': 'cycle-b', 'author': 'Cycle', 'text': 'A', 'created': '2026-11-15T10:03:00.000Z'},
      \ {'id': 'cycle-b', 'parentId': 'cycle-a', 'author': 'Cycle', 'text': 'B', 'created': '2026-11-15T10:04:00.000Z'}]}
runtime autoload/wbx/productivity.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/productivity.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nif get(g:, 'local_prompt_race', 0)\nlet g:local_state.localContext.sessionId = repeat('b', 32)\nendif\nreturn get(g:, 'local_confirm', 0)\nendfunction"
function! s:history() abort
  execute 'buffer ' . g:local_history
  let view = wbx#history#render(g:local_state.messages, 0)
  setlocal modifiable
  call setline(1, view.lines)
  if line('$') > len(view.lines) | call deletebufline(bufnr('%'), len(view.lines) + 1, '$') | endif
  let b:wbx_message_blocks = view.blocks
  let b:wbx_render_tick = b:changedtick
  setlocal nomodifiable nomodified
  call cursor(b:wbx_message_blocks[0].body, 1)
endfunction
try
  call assert_false(wbx#protocol#local_context({'sessionId': repeat('a', 32), 'coverage': 'session-only', 'account': 'invented'}))
  call assert_false(wbx#protocol#local_context({'sessionId': repeat('a', 31), 'coverage': 'session-only'}))
  call assert_false(wbx#protocol#local_context({'sessionId': repeat('A', 32), 'coverage': 'session-only'}))
  call assert_true(wbx#protocol#local_context(g:local_state.localContext))
  enew
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'r'
  let g:local_history = bufnr('%')
  call s:history()
  let history_text = getline(1, '$')
  let g:local_available = 0
  call wbx#productivity#bookmark()
  call assert_equal(0, wbx#productivity#bookmark_count(), 'missing capability refuses even with a well-shaped DTO')
  let g:local_available = 1
  let saved_context = remove(g:local_state, 'localContext')
  call wbx#productivity#bookmark()
  call assert_equal(0, wbx#productivity#bookmark_count(), 'old backend never invents a namespace')
  let g:local_state.localContext = saved_context
  call wbx#productivity#bookmark()
  call assert_equal(1, wbx#productivity#bookmark_count())
  call wbx#productivity#quote()
  enew
  file wbx://compose/r
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'r' | let b:wbx_parent = '' | let b:wbx_format = 'markdown'
  let composer = bufnr('%')
  call wbx#productivity#insert()
  call assert_equal([''], getline(1, '$'), 'no silent format switch')
  let b:wbx_format = 'plain'
  call setline(1, repeat('x', 980))
  call wbx#productivity#insert()
  call assert_equal([repeat('x', 980)], getline(1, '$'), 'no overflow clipping or partial insertion')
  call setline(1, '')
  let g:local_state.room.id = 'other'
  call wbx#productivity#insert()
  call assert_equal([''], getline(1, '$'), 'no cross-space quote fallback')
  let g:local_state.room.id = 'r'
  call wbx#productivity#insert()
  call assert_notmatch('<@\|<spark-mention', join(getline(1, '$'), "\n"))
  call assert_match('‹@all>', join(getline(1, '$'), "\n"))
  call assert_true(wbx#productivity#draft_valid(composer, g:local_state))
  let draft = getline(1, '$')
  let source_text = g:local_state.messages[0].text
  let g:local_state.messages[0].text = 'edited while drafting'
  call assert_false(wbx#productivity#draft_valid(composer, g:local_state), 'changed source blocks submit')
  let g:local_state.messages[0].text = source_text
  call assert_true(wbx#productivity#draft_valid(composer, g:local_state))
  let saved_messages = g:local_state.messages
  let g:local_state.messages = []
  call assert_false(wbx#productivity#draft_valid(composer, g:local_state), 'unloaded/revoked source blocks submit')
  let g:local_state.messages = saved_messages
  let g:local_confirm = 0
  call wbx#productivity#detach()
  call assert_equal(1, len(b:wbx_quote_sources), 'detach defaults to cancel')
  let g:local_confirm = 1
  let g:local_prompt_race = 1
  call wbx#productivity#detach()
  call assert_equal(1, len(b:wbx_quote_sources), 'new session during confirmation cannot detach old guards')
  let g:local_state.localContext = saved_context
  let g:local_prompt_race = 0
  let tree = undotree()
  call wbx#productivity#detach()
  call assert_equal([], b:wbx_quote_sources)
  call assert_equal(tree, undotree())
  call assert_equal(draft, getline(1, '$'), 'explicit detach does not rewrite ordinary text')
  call s:history()
  call wbx#productivity#thread()
  call assert_equal('thread', b:wbx_list_kind)
  call assert_equal(['root', 'reply'], uniq(map(filter(deepcopy(b:wbx_local_targets), '!empty(v:val)'), 'v:val.messageId')))
  normal q
  call cursor(filter(copy(b:wbx_message_blocks), 'v:val.id ==# "orphan"')[0].body, 1)
  call wbx#productivity#thread()
  call assert_match('not loaded', getline(3))
  normal q
  call cursor(filter(copy(b:wbx_message_blocks), 'v:val.id ==# "cycle-a"')[0].body, 1)
  call wbx#productivity#thread()
  call assert_match('cycle', getline(3))
  call assert_equal(['cycle-a'], uniq(map(filter(deepcopy(b:wbx_local_targets), '!empty(v:val)'), 'v:val.messageId')), 'cycle cannot swallow another loaded component')
  normal q
  call wbx#productivity#content('links')
  call assert_equal(5, len(b:wbx_local_targets))
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal('content', b:wbx_list_kind, 'heading never targets the last row')
  call cursor(5, 1)
  let g:local_state.room.id = 'other'
  execute "normal \<CR>"
  call assert_equal('content', b:wbx_list_kind, 'wrong selected space refuses navigation')
  let g:local_state.room.id = 'r'
  let g:local_state.localContext.sessionId = repeat('c', 32)
  execute "normal \<CR>"
  call assert_equal('content', b:wbx_list_kind, 'session replacement refuses an old row')
  call assert_equal(0, wbx#productivity#bookmark_count())
  let g:local_state.localContext = saved_context
  call s:history()
  call wbx#productivity#content('files')
  call cursor(5, 1)
  execute "normal \<CR>"
  call assert_equal(g:local_history, bufnr('%'))
  call assert_equal('reply', wbx#view#message_at(bufnr('%'), line('.')), 'files navigate by exact message ID, not a URL opener')
  call wbx#productivity#content('invalid | quit')
  call assert_equal(g:local_history, bufnr('%'))
  call assert_equal(history_text, getline(1, '$'), 'projections never write into source text')
  call wbx#productivity#content('files')
  let list = bufnr('%')
  let projection = getline(1, '$')
  enew
  execute 'bunload! ' . list
  call wbx#productivity#content('files')
  call assert_equal(list, bufnr('%'), 'explicit local regeneration reopens an unloaded clean list')
  call assert_equal(projection, getline(1, '$'))
  setlocal modifiable
  call setline(1, 'Retained unload annotation')
  setlocal nomodifiable
  enew
  execute 'bunload! ' . list
  execute 'buffer ' . list
  call assert_equal('Retained unload annotation', getline(1), 'explicit unload does not discard list annotations')
  call assert_false(wbx#lists#clean(list, 'content'))
  execute 'bwipeout! ' . list
  let g:wbx_tui = {'mappings': 0}
  call wbx#productivity#content('files')
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_equal('', maparg('r', 'n'))
  call assert_equal('', maparg('q', 'n'))
  let g:wbx_tui.mappings = 1
  let g:local_state.localContext.sessionId = repeat('d', 32)
  let g:local_state.messages = [deepcopy(saved_messages[0])]
  for index in range(129)
    let g:local_state.messages[0].id = 'bounded-' . index
    call s:history()
    call wbx#productivity#bookmark()
  endfor
  call assert_equal(128, wbx#productivity#bookmark_count(), 'saturation refuses instead of silently evicting older identities')
  let g:local_state.messages[0].id = 'bounded-0'
  call s:history()
  call wbx#productivity#bookmark()
  call assert_equal(127, wbx#productivity#bookmark_count(), 'oldest bookmark remains independently removable after saturation')
  call wbx#productivity#bookmarks()
  call assert_equal(131, len(b:wbx_local_targets))
  call assert_notmatch('literal', getline(5), 'unloaded bookmark stores only identities, not bodies')
  let g:local_state.messages[0].text = repeat('x', 3001)
  call s:history()
  call wbx#productivity#quote()
  execute 'buffer ' . composer
  let before = getline(1, '$')
  call wbx#productivity#insert()
  call assert_equal(before, getline(1, '$'), 'oversized capture/new session never revives an older captured quotation')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
