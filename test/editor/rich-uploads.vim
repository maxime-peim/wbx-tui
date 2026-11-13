" Actual demo backend and existing commands/keys; no live services or config.
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
runtime autoload/wbx/rich.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/rich.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:rich_upload_prompts, a:text)\nreturn g:rich_upload_accept\nendfunction"
runtime autoload/wbx/uploads.vim
let s:upload_sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/uploads.vim$"')[0].sid
execute 'function! <SNR>' . s:upload_sid . "_confirm(text) abort\nreturn 1\nendfunction"
let g:rich_upload_prompts = [] | let g:rich_upload_accept = 0 | let g:rich_upload_deliveries = []
augroup rich_upload_result
  autocmd!
  autocmd User WbxDelivery call add(g:rich_upload_deliveries, deepcopy(g:wbx_tui_event))
augroup END
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call assert_true(wbx#supports_upload('markdown-single-file-v1'))
  WebexFormat markdown
  let caption = '**Native rich attachment** <@personId:demo-other|Participant>'
  call setline(1, caption)
  call feedkeys("i\<Esc>", 'xt')
  let text = getline(1, '$') | let tree = undotree()
  call wbx#uploads#stage(s:path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call assert_equal(tree, undotree(), 'staging/format do not rewrite native text')
  let message_count = len(wbx#state().messages)
  silent! write
  call assert_equal(message_count, len(wbx#state().messages), 'write never sends rich attachments')
  call feedkeys("\\s", 'xt')
  call s:wait('!wbx#drafts#pending() && empty(wbx#drafts#upload(bufnr("%")))')
  call assert_equal(message_count + 1, len(wbx#state().messages))
  call assert_equal(caption, wbx#state().messages[-1].markdown)
  call assert_equal([], g:rich_upload_prompts, 'person-tagged rich files send without an extra mention dialog')
  call assert_equal([''], getline(1, '$'))
  normal! u
  call assert_equal(text, getline(1, '$'), 'ACK cleanup is one native undo')
  let normal = bufnr('%') | let root = wbx#state().messages[-1].id
  call wbx#drafts#reply('demo-general', root)
  WebexCompose
  call assert_equal(root, b:wbx_parent)
  WebexFormat markdown
  call setline(1, '**Exact root reply**')
  call wbx#uploads#stage(s:path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  WebexSend
  call s:wait('!wbx#drafts#pending() && empty(wbx#drafts#upload(bufnr("%")))')
  call assert_equal(root, g:rich_upload_deliveries[-1].parentId)
  call assert_equal('markdown', g:rich_upload_deliveries[-1].format)
  WebexCancelReply
  call assert_equal(normal, bufnr('%'))
  call assert_equal(text, getline(1, '$'), 'reply sending cannot clear the retained normal draft')
  call wbx#uploads#stage(s:path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call setline(1, '**Broadcast** <@all>')
  let staged = wbx#drafts#upload(bufnr('%'))
  let message_count = len(wbx#state().messages)
  WebexSend
  call assert_equal(message_count, len(wbx#state().messages))
  call assert_equal(staged, wbx#drafts#upload(bufnr('%')), 'declined broadcast consent retains the file')
  call assert_equal(1, len(g:rich_upload_prompts))
  let g:rich_upload_accept = 1
  WebexSend
  call setline(1, 'Newer native work')
  let b:wbx_format = 'plain'
  call wbx#uploads#stage(s:path)
  call s:wait('!wbx#drafts#pending() && !empty(wbx#drafts#upload(bufnr("%"))) && wbx#drafts#upload(bufnr("%")).attachmentId !=# ' . string(staged.attachmentId))
  call assert_equal(['Newer native work'], getline(1, '$'), 'old rich ACK cannot clear newer text or changed format')
  call assert_notequal(staged.attachmentId, wbx#drafts#upload(bufnr('%')).attachmentId, 'old rich ACK cannot clear a replacement snapshot')
  call assert_equal(message_count + 1, len(wbx#state().messages))
  call assert_equal(2, len(g:rich_upload_prompts), 'each @all submission has only its broadcast confirmation')
  call assert_match('entire space', g:rich_upload_prompts[-1])
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wua', 'n'))
  call assert_equal(2, exists(':WebexSend'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
