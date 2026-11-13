" MF15 finite negotiation, recipient/file consent and native work.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
let s:path = $WBX_EDITOR_RESULT . '.direct.bin'
call writefile(['Synthetic file'], s:path, 'b')
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! MF15Confirm(text) abort
  let race = g:mf15_race | let g:mf15_race = ''
  if race ==# 'text' | call setline(1, 'Changed during consent')
  elseif race ==# 'format' | let b:wbx_format = 'plain'
  elseif race ==# 'target' | let b:wbx_recipient.targetId = repeat('b', 32)
  elseif race ==# 'draft' | let b:wbx_recipient_draft = 'different'
  elseif race ==# 'file'
    let file = wbx#drafts#upload(bufnr('%')) | let file.attachmentId = repeat('c', 32)
    call wbx#drafts#upload(bufnr('%'), file)
  elseif race ==# 'window'
    let window = win_getid()
    wincmd w
    call win_gotoid(window)
  endif
  return 1
endfunction
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn MF15Confirm(a:text)\nendfunction"
let g:mf15_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  WebexDirect mf15-peer
  call s:wait('exists("b:wbx_recipient")')
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'local-context-v1', 'markdown-send-v1', 'uploads-v1']}
  call assert_true(wbx#protocol#hello(hello), 'omitted assertion preserves legacy plaintext')
  for invalid in ['markdown-v1', {}, v:true, ['unknown'], ['single-file-v1', 'single-file-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'directFormats': invalid})), 'new modes are finite, never arbitrary payload/provider selectors')
  endfor
  let supported = extend(deepcopy(hello), {'directFormats': ['markdown-v1', 'single-file-v1', 'markdown-single-file-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let invalid = deepcopy(supported) | call remove(invalid.capabilities, index(invalid.capabilities, 'uploads-v1'))
  call assert_false(wbx#protocol#hello(invalid))
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  call call(Hello, [{'result': hello}])
  call assert_false(wbx#supports_direct('markdown-v1'), 'separate base capabilities do not imply recipient mode support')
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_direct('markdown-single-file-v1'))
  WebexFormat markdown
  call setline(1, '**Exact recipient and snapshot**')
  call wbx#uploads#stage(s:path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let target = deepcopy(b:wbx_recipient) | let draft = b:wbx_recipient_draft | let staged = wbx#drafts#upload(bufnr('%'))
  let rooms = deepcopy(wbx#state().rooms)
  let separate = extend(deepcopy(hello), {'directFormats': ['markdown-v1', 'single-file-v1']})
  call call(Hello, [{'result': separate}])
  call assert_false(wbx#supports_direct('markdown-single-file-v1'), 'separate formats never imply the combination')
  let action = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexSend"')[0]
  call assert_false(action.available)
  call assert_match('markdown-single-file-v1', action.reason)
  WebexSend
  call assert_false(wbx#conversations#pending())
  call assert_equal(staged, wbx#drafts#upload(bufnr('%')))
  let combined = extend(deepcopy(hello), {'directFormats': ['markdown-single-file-v1']})
  call call(Hello, [{'result': combined}])
  call assert_true(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexSend"')[0].available)
  WebexFormat plain
  WebexFormat markdown
  call assert_equal('markdown', b:wbx_format, 'combination-only assertion allows its explicit draft format')
  call setline(1, '<@all>')
  WebexSend
  call assert_false(wbx#conversations#pending(), 'real mention markup cannot authorize a DM broadcast')
  call setline(1, '**Exact recipient and snapshot**')
  for race in ['text', 'format', 'target', 'draft', 'file', 'window']
    let g:mf15_race = race
    call feedkeys("i\<Esc>", 'xt')
    let tree = undotree()
    WebexSend
    call assert_false(wbx#conversations#pending(), race . ' consent race cannot admit a first mutation')
    call assert_equal(rooms, wbx#state().rooms)
    if race !=# 'text' | call assert_equal(tree, undotree()) | endif
    let b:wbx_recipient = deepcopy(target) | let b:wbx_recipient_draft = draft | let b:wbx_format = 'markdown'
    call wbx#drafts#upload(bufnr('%'), staged)
    call setline(1, '**Exact recipient and snapshot**')
  endfor
  let progress = {'targetId': target.targetId, 'draftId': draft, 'attachmentId': staged.attachmentId, 'phase': 'send', 'bytes': 0, 'total': staged.bytes}
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'upload.progress', 'params': progress}))
  let progress.roomId = 'fabricated'
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'upload.progress', 'params': progress}))
  let event = {'requestId': 'one', 'action': 'direct', 'status': 'changed', 'notice': 'Inert', 'targetId': target.targetId,
        \ 'draftId': draft, 'roomId': 'actual-room', 'messageId': 'actual-message', 'text': '**Exact**', 'format': 'markdown', 'attachmentId': staged.attachmentId}
  call assert_true(wbx#protocol#conversation(event))
  for patch in [{'format': 'html'}, {'attachmentId': 'bad'}, {'action': 'create'}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(event), patch)))
  endfor
  let missing = deepcopy(event) | call remove(missing, 'text')
  call assert_false(wbx#protocol#conversation(missing), 'new-mode ACKs require exact caption correlation')
  setlocal buftype=
  call assert_match('FILE snapshot', wbx#uploads#label(bufnr('%')), 'promoted work retains inert metadata without inventing progress')
  let tree = undotree()
  WebexSend
  call assert_false(wbx#conversations#pending())
  call assert_equal(tree, undotree(), 'promoted files are not recipient send authority')
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_direct('markdown-single-file-v1'), 'disconnect cannot retain mode authority')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
