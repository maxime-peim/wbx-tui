" MF15 actual-demo workflow, retained from expected-red. No live activation.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
let s:path = $WBX_EDITOR_RESULT . '.direct.bin'
call writefile(['Synthetic immutable recipient file'], s:path, 'b')
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:mf15_accept = 0 | let g:mf15_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:mf15_prompts, a:text)\nreturn g:mf15_accept\nendfunction"
runtime autoload/wbx/uploads.vim
let s:upload_sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/uploads.vim$"')[0].sid
execute 'function! <SNR>' . s:upload_sid . "_confirm(text) abort\nreturn 1\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call feedkeys("iOlder normal draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let normal = bufnr('%') | let normal_tree = undotree()
  call feedkeys("\\Wndmf15-peer\<CR>", 'xt')
  call s:wait('exists("b:wbx_recipient")')
  let direct = bufnr('%')
  call assert_equal('mf15-peer', b:wbx_recipient.personId)
  WebexFormat markdown
  call assert_equal('markdown', b:wbx_format)
  call feedkeys("i**First rich recipient message**\<CR>Second line\<Esc>", 'xt')
  let original = getline(1, '$')
  call feedkeys("\\Wua" . s:path . "\<CR>", 'xt')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
" Continue only after the independently negotiated recipient format is available.
try
  if empty(v:errors)
    call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
    let staged = wbx#drafts#upload(direct)
    call assert_match('FILE snapshot', wbx#conversations#status())
    call assert_match('MARKDOWN', wbx#conversations#status())
    let room_count = len(wbx#state().rooms)
    silent! write
    call assert_equal(room_count, len(wbx#state().rooms), 'Enter/write/staging cannot create a placeholder DM')
    WebexSend
    call assert_false(wbx#conversations#pending())
    call assert_equal(original, getline(1, '$'), 'declining creation cannot rewrite native rich text')
    call assert_equal(staged, wbx#drafts#upload(direct), 'declined creation consent preserves the file')
    let g:mf15_accept = 1
    WebexSend
    call setline(1, 'Newer recipient work')
    let b:wbx_format = 'plain'
    call wbx#uploads#stage(s:path)
    call s:wait('!wbx#conversations#pending() && has_key(b:wbx_recipient, "roomId") && !empty(wbx#drafts#upload(bufnr("%"))) && wbx#drafts#upload(bufnr("%")).attachmentId !=# ' . string(staged.attachmentId))
    call assert_equal(['Newer recipient work', 'Second line'], getline(1, '$'), 'old rich/file ACK cannot clear newer native text')
    call assert_equal('demo-general', wbx#state().room.id, 'ACK never selects or adopts the returned room draft')
    call assert_equal(['Older normal draft'], getbufline(normal, 1, '$'))
    execute 'buffer ' . normal
    call assert_equal(normal_tree, undotree())
    execute 'buffer ' . direct
    let returned = b:wbx_recipient.roomId
    WebexDirectOpen
    call s:wait('get(wbx#state(), "ready", 0) && wbx#state().room.id !=# "demo-general"')
    call assert_equal(returned, wbx#state().room.id)
    call assert_match('First rich recipient', wbx#state().messages[0].markdown)
    WebexCompose
    call assert_notequal(direct, bufnr('%'))
    call assert_equal([''], getline(1, '$'), 'confirmed-room normal composer does not adopt recipient text/files')
    call assert_equal({}, wbx#drafts#upload(bufnr('%')))
    execute 'buffer ' . direct
    call assert_notequal(staged.attachmentId, wbx#drafts#upload(direct).attachmentId)
    call assert_match('persistent DM', join(g:mf15_prompts, ' '))
    WebexDirect mf15-undo
    call s:wait('exists("b:wbx_recipient") && b:wbx_recipient.personId ==# "mf15-undo"')
    WebexFormat markdown
    call feedkeys("i**Native direct undo**\<CR>Second line\<Esc>", 'xt')
    call feedkeys("i\<Esc>", 'xt')
    let original = getline(1, '$')
    call wbx#uploads#stage(s:path)
    call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
    let tree = undotree()
    WebexSend
    call s:wait('!wbx#conversations#pending() && has_key(b:wbx_recipient, "roomId")')
    call assert_equal([''], getline(1, '$'), 'unchanged confirmed direct source clears')
    call assert_equal({}, wbx#drafts#upload(bufnr('%')))
    normal! u
    call assert_equal(original, getline(1, '$'), 'confirmed recipient cleanup is a native undo')
    call assert_true(undotree().seq_last >= tree.seq_last)
    let g:wbx_tui.mappings = 0
    call wbx#commands#setup()
    call assert_equal('', maparg('\Wnd', 'n'))
    call assert_equal(2, exists(':WebexSend'))
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
