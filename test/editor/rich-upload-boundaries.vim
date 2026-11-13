" Actual native send routing with controlled hello/consent/ACK races, demo only.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
let s:path = $WBX_EDITOR_RESULT . '.rich.bin'
call writefile(['Synthetic immutable file'], s:path, 'b')
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! RichUploadConfirm(text) abort
  call add(g:rich_boundary_prompts, a:text)
  let race = g:rich_boundary_race | let g:rich_boundary_race = ''
  if race ==# 'text'
    call setline(1, 'Newer native work')
  elseif race ==# 'format'
    let b:wbx_format = 'plain'
  elseif race ==# 'file'
    let next = wbx#drafts#upload(bufnr('%')) | let next.attachmentId = repeat('b', 32)
    call wbx#drafts#upload(bufnr('%'), next)
  elseif race ==# 'draft'
    let b:wbx_draft_id = 'replacement-draft'
  elseif race ==# 'root'
    let b:wbx_parent = 'different-root'
  elseif race ==# 'window'
    let origin = win_getid()
    wincmd w
    call win_gotoid(origin)
  endif
  return empty(g:rich_boundary_answers) ? 0 : remove(g:rich_boundary_answers, 0)
endfunction
runtime autoload/wbx/rich.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/rich.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn RichUploadConfirm(a:text)\nendfunction"
let g:rich_boundary_prompts = [] | let g:rich_boundary_answers = [] | let g:rich_boundary_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  let text = '**Visible** <@all>'
  call setline(1, text)
  WebexFormat markdown
  call wbx#uploads#stage(s:path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let staged = wbx#drafts#upload(composer) | let draft = wbx#drafts#draft_id(composer)
  let message_count = len(wbx#state().messages)
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['messaging', 'message-replies', 'uploads-v1', 'markdown-send-v1', 'local-context-v1']}
  call assert_true(wbx#protocol#hello(hello))
  for invalid in ['markdown-single-file-v1', v:true, {}, ['unknown'], ['markdown-single-file-v1', 'markdown-single-file-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'uploadFormats': invalid})))
  endfor
  let supported = extend(deepcopy(hello), {'uploadFormats': ['markdown-single-file-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, 'uploads-v1'))
  call assert_false(wbx#protocol#hello(missing), 'assertion without prerequisites is malformed')
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  call call(Hello, [{'result': hello}])
  call assert_false(wbx#supports_upload('markdown-single-file-v1'), 'two separate capabilities are not combination support')
  let action = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexSend"')[0]
  call assert_false(action.available)
  call assert_match('Markdown plus one file', action.reason, 'effective contextual help explains combination support')
  WebexSend
  call assert_equal([], g:rich_boundary_prompts, 'old backend refuses before consent, with no downgrade or file drop')
  call assert_false(wbx#drafts#pending())
  call assert_equal(staged, wbx#drafts#upload(composer))
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_upload('markdown-single-file-v1'))
  call assert_true(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexSend"')[0].available)
  let g:rich_boundary_answers = [0]
  WebexSend
  call assert_false(wbx#drafts#pending(), 'declining independent @all consent never submits the file')
  call assert_equal(1, len(g:rich_boundary_prompts), 'only the broadcast confirmation remains')
  call assert_equal(message_count, len(wbx#state().messages))
  for race in ['text', 'format', 'file', 'draft', 'root', 'window']
    let g:rich_boundary_prompts = [] | let g:rich_boundary_answers = [1] | let g:rich_boundary_race = race
    " End fixture setline's native undo block before simulating a mode/window choice.
    call feedkeys("i\<Esc>", 'xt')
    let before = undotree()
    WebexSend
    call assert_false(wbx#drafts#pending(), race . ' changed during consent must refuse admission')
    call assert_equal(message_count, len(wbx#state().messages), race . ' cannot produce a local delivery')
    if race ==# 'text'
      call assert_equal(['Newer native work'], getline(1, '$'))
    else
      call assert_equal(before, undotree(), race . ': consent/metadata changes never rewrite native undo')
    endif
    let b:wbx_parent = '' | let b:wbx_format = 'markdown' | let b:wbx_draft_id = draft
    call wbx#drafts#upload(composer, staged)
    call setline(1, text)
  endfor
  call setline(1, ' ')
  WebexSend
  call assert_false(wbx#drafts#pending(), 'blank Markdown cannot downgrade to a plain file-only submission')
  call setline(1, text)
  let params = {'roomId': 'demo-general', 'draftId': draft, 'text': text, 'format': 'markdown', 'attachmentId': staged.attachmentId}
  call wbx#drafts#register('probe', params, composer, b:changedtick)
  let ack = extend(deepcopy(params), {'requestId': 'probe', 'status': 'sent', 'message': 'Inert test ACK', 'messageId': 'inert'})
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'delivery', 'params': ack}))
  let bad = deepcopy(ack) | call remove(bad, 'text')
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'delivery', 'params': bad}))
  for patch in [{'text': '**different**'}, {'attachmentId': repeat('c', 32)}, {'draftId': 'different'}, {'format': 'plain'}, {'parentId': 'different'}]
    call assert_false(wbx#drafts#delivery(extend(deepcopy(ack), patch)).valid)
    call assert_true(wbx#drafts#pending(), 'mismatched ACK cannot release the exact delivery')
  endfor
  call assert_true(wbx#drafts#delivery(ack).valid)
  call assert_false(wbx#drafts#pending())
  call wbx#drafts#register('older', params, composer, b:changedtick)
  call wbx#drafts#register('newer', params, composer, b:changedtick)
  let unknown = extend(deepcopy(params), {'requestId': 'newer', 'status': 'unknown', 'message': 'Unknown'})
  call wbx#drafts#delivery(unknown)
  let evidence = wbx#drafts#evidence('demo-general')
  call wbx#drafts#delivery(extend(deepcopy(ack), {'requestId': 'older'}))
  call assert_equal(evidence, wbx#drafts#evidence('demo-general'), 'older exact ACK cannot clear newer uncertainty')
  call wbx#drafts#resolve('demo-general', evidence)
  setlocal buftype=
  let before = undotree()
  WebexSend
  call assert_false(wbx#drafts#pending())
  call assert_equal(before, undotree(), 'promoted native files are never send authority')
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_upload('markdown-single-file-v1'), 'stopped session cannot borrow old negotiation')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
