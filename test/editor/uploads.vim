" Actual demo backend stages anonymous local snapshots; no Webex/OAuth/SDK/network.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
runtime autoload/wbx/uploads.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/uploads.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nlet g:wbx_replace_disclosure = a:text\nreturn get(g:, 'wbx_replace_accept', 1)\nendfunction"
let s:path = $WBX_EDITOR_RESULT . '.literal% résumé;$(false)`false`.bin'
let s:next = $WBX_EDITOR_RESULT . '.replacement.bin'
call writefile(['Original local snapshot'], s:path, 'b')
call writefile(['Replacement local snapshot'], s:next, 'b')
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:file() abort
  return wbx#drafts#upload(bufnr('%'))
endfunction
function! s:stage(path) abort
  let old = get(s:file(), 'attachmentId', '')
  call feedkeys("\\Wua" . a:path . "\<CR>", 'xt')
  call s:wait('!empty(s:file()) && get(s:file(), "attachmentId", "") !=# ' . string(old))
endfunction
function! s:send_and_change(text, replace) abort
  call wbx#send()
  call setline(1, a:text)
  if a:replace | call wbx#uploads#stage(s:next) | endif
endfunction
try
  call wbx#uploads#stage(s:path)
  call assert_false(wbx#transport#running(), 'file staging from an ordinary/unconnected buffer never starts a backend')
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  call setline(1, 'Native draft retained')
  let before = [win_getid(), bufnr('%'), getline(1, '$'), b:changedtick, undotree().seq_cur]
  let message_count = len(wbx#state().messages)
  call s:stage(s:path)
  call assert_equal(before, [win_getid(), bufnr('%'), getline(1, '$'), b:changedtick, undotree().seq_cur], 'selection/staging is not a text write or send')
  call assert_equal(fnamemodify(s:path, ':t'), s:file().name, 'percent, shell-like text, backticks and Unicode are literal filenames')
  call assert_equal(message_count, len(wbx#state().messages))
  call assert_match('FILE snapshot:', wbx#buffer_status())
  call assert_match('PLAIN.*1000 UTF-16', wbx#buffer_status())
  let g:wbx_replace_accept = 0
  let s:original_snapshot = s:file()
  call wbx#uploads#stage(s:next)
  call assert_equal(s:original_snapshot, s:file(), 'declined replacement preserves the original snapshot')
  call assert_match('previous snapshot remains if staging fails', g:wbx_replace_disclosure)
  let g:wbx_replace_accept = 1
  call assert_notmatch('résumé', string(wbx#health()), 'health does not retain paths/basenames')
  silent! write
  call feedkeys("\<CR>", 'xt')
  sleep 30m
  call assert_equal(message_count, len(wbx#state().messages), 'write/Enter cannot upload or send')
  call feedkeys("\\Wus", 'xt')
  call feedkeys("\\Wuc", 'xt')
  call feedkeys("\\Wur", 'xt')
  call assert_equal({}, s:file())
  call assert_equal(['Native draft retained'], getline(1, '$'))
  call assert_equal(message_count, len(wbx#state().messages))
  call s:stage(s:path)
  call setline(1, '')
  WebexSend
  call s:wait('!wbx#drafts#pending() && empty(s:file())')
  call assert_equal(message_count + 1, len(wbx#state().messages), 'file-only send is explicit and local in demo')
  call assert_equal([''], getline(1, '$'))
  call assert_false(wbx#destination().uncertain)
  call s:stage(s:next)
  call assert_false(wbx#drafts#is_sent(composer), 'a deliberately staged replacement is not the previous confirmed copy')
  WebexSend
  call s:wait('!wbx#drafts#pending() && empty(s:file())')
  call assert_equal(message_count + 2, len(wbx#state().messages), 'consecutive file-only sends do not need dummy caption edits')
  let message_count = len(wbx#state().messages)
  call setline(1, 'Original submitted text')
  call s:stage(s:path)
  call s:send_and_change('Newer text and attachment', 1)
  call s:wait('!wbx#drafts#pending() && get(s:file(), "name", "") ==# fnamemodify(s:next, ":t")')
  call assert_equal(['Newer text and attachment'], getline(1, '$'), 'old ACK cannot clear edited text or a replacement stage')
  call assert_equal(message_count + 1, len(wbx#state().messages))
  let staged = s:file()
  call wbx#select('demo-engineering')
  call s:wait('get(get(wbx#state(), "room", {}), "id", "") ==# "demo-engineering" && get(wbx#state(), "ready", 0)')
  WebexCompose
  call assert_equal({}, s:file(), 'another room never inherits the file')
  call wbx#select('demo-general')
  call s:wait('get(get(wbx#state(), "room", {}), "id", "") ==# "demo-general" && get(wbx#state(), "ready", 0)')
  WebexCompose
  call assert_equal(composer, bufnr('%'))
  call assert_equal(staged, s:file(), 'room re-entry retains exact snapshot association')
  let invalid = {'jsonrpc': '2.0', 'method': 'upload.progress', 'params': {'roomId': 'demo-general', 'draftId': wbx#drafts#draft_id(composer),
        \ 'attachmentId': staged.attachmentId, 'phase': 'send', 'bytes': 0, 'total': staged.bytes}}
  call assert_true(wbx#protocol#valid(invalid))
  let invalid.params.path = 'never-cross-progress'
  call assert_false(wbx#protocol#valid(invalid))
  let history = wbx#buffers().history
  let before = deepcopy([b:changedtick, undotree().seq_cur, getbufvar(history, 'changedtick'), getbufvar(history, 'wbx_render_work')])
  for i in range(50)
    call wbx#uploads#progress({'roomId': 'demo-general', 'draftId': wbx#drafts#draft_id(composer),
          \ 'attachmentId': staged.attachmentId, 'phase': 'send', 'bytes': i, 'total': 100})
  endfor
  call assert_equal(before, [b:changedtick, undotree().seq_cur, getbufvar(history, 'changedtick'), getbufvar(history, 'wbx_render_work')], 'progress only redraws status; no text/history rendering work')
  let pending = {'roomId': 'demo-general', 'text': getline(1), 'attachmentId': staged.attachmentId, 'draftId': wbx#drafts#draft_id(composer)}
  call wbx#drafts#register('disconnect-upload', pending, composer, b:changedtick)
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_true(s:file().stale)
  call assert_false(wbx#drafts#pending(), 'explicit session stop revokes pending local admission, not just backend work')
  call assert_true(wbx#drafts#uncertain('demo-general'), 'stopped delivery is retained as uncertain, never silently unsent')
  call assert_equal(['Newer text and attachment'], getline(1, '$'))
  WebexAttachRemove
  call assert_equal({}, s:file())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
