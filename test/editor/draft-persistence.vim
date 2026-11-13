" Demo-only persistence through backend/editor restarts; no network or real HOME.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
filetype plugin on
runtime plugin/wbx.vim
let g:wbx_tui = {'backend': [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js'],
      \ 'images': 0, 'notifications': 0, 'read_status': 0, 'people_status': 0, 'upcoming_meetings': 0,
      \ 'spaces_cache': 0, 'persist_drafts': 1, 'mark_read_on_open': 0}
let s:text = ['**Durable 😀 draft**', 'Second line']
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'Timeout: ' . a:expression . ' state=' . json_encode(wbx#state()) | endif
endfunction
function! s:open() abort
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call s:wait('!empty(get(b:, "wbx_draft_profile", ""))')
endfunction
try
  if $WBX_DRAFT_PHASE ==# 'restore'
    WebexDemo
    call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#draft_persistence#inventory().items) == 1')
    call assert_false(has_key(wbx#drafts#buffers(), 'demo-general'), 'fresh-process saved work is visible before its composer is created')
    WebexDrafts
    call cursor(6, 1)
    WebexDraftRestore
    call assert_equal(v:null, wbx#state().room, 'inventory restore never silently selects/loads a destination')
    call wbx#select('demo-general', 0, 0)
    call s:wait('get(wbx#state(), "ready", 0)')
    let message_count = len(wbx#state().messages)
    WebexDrafts
    call cursor(6, 1)
    WebexDraftRestore
    call assert_equal('compose', get(b:, 'wbx_kind', ''), 'explicit restore focuses only its already verified destination-bound composer')
    call assert_equal(s:text, getline(1, '$'))
    call assert_equal(message_count, len(wbx#state().messages), 'inventory/restore never sends')
  endif
  if $WBX_DRAFT_PHASE !=# 'restore'
    call s:open()
    WebexFormat markdown
    call setline(1, s:text)
    doautocmd TextChanged
    let retained = [bufnr('%'), getline(1, '$'), b:wbx_format]
    tabprevious
    WebexDemo
    WebexCompose
    call assert_equal(retained, [bufnr('%'), getline(1, '$'), b:wbx_format], 'closing/reopening plugin UI preserves native drafts')
    call wbx#shutdown()
    let files = glob($XDG_STATE_HOME . '/wbx-tui-drafts/*.json', 0, 1)
    call assert_equal(1, len(files))
    let document = json_decode(join(readfile(files[0]), "\n"))
    call assert_equal(join(s:text, "\n"), document.items[0].text)
    call assert_equal('markdown', document.items[0].format)
    if empty($WBX_DRAFT_PHASE)
      for buffer in values(wbx#drafts#buffers())
        if bufexists(buffer) | execute 'bwipeout! ' . buffer | endif
      endfor
    endif
  endif
  if $WBX_DRAFT_PHASE !=# 'save'
    call s:open()
    call s:wait('getline(1, "$") ==# s:text')
    call assert_equal('markdown', b:wbx_format)
    call assert_equal('markdown', &l:filetype, 'restored Markdown draft has Markdown editor mode')
    let before = len(wbx#state().messages)
    sleep 50m
    call assert_equal(before, len(wbx#state().messages), 'restoring never submits')
    WebexSend
    call s:wait('!wbx#drafts#pending()')
    call assert_equal([''], getline(1, '$'), 'successful unchanged Markdown send clears the draft')
    call assert_equal(join(s:text, "\n"), wbx#state().messages[-1].markdown)
    call setline(1, '**Native insert send**')
    call feedkeys("A\<C-s>\<Esc>", 'xt')
    call s:wait('!wbx#drafts#pending()')
    call assert_equal([''], getline(1, '$'), 'insert-mode Markdown send clears the matching text too')
    " Exercise an ACK while the local writer is temporarily blocked. The send
    " must happen once; only clearing may be retried after the callback returns.
    let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
    let g:OriginalDraftWrite = funcref('<SNR>' . sid . '_write')
    execute 'function! <SNR>' . sid . "_write(buffer, lines, ...) abort\nif get(g:, 'block_draft_clear', 0) && a:lines ==# [''] && getbufvar(a:buffer, 'wbx_kind', '') ==# 'compose'\nlet action = g:block_draft_clear\nif action != 3\nlet g:block_draft_clear = 0\nendif\nif action == 2\ncall setbufline(a:buffer, 1, 'New work before deferred clear')\nendif\nreturn 0\nendif\nreturn call(g:OriginalDraftWrite, [a:buffer, a:lines] + a:000)\nendfunction"
    call setline(1, '**Transient editor write lock**')
    let g:block_draft_clear = 1
    let sent = len(wbx#state().messages)
    WebexSend
    call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
    call assert_equal(sent + 1, len(wbx#state().messages), 'deferred local clearing never repeats the send')
    call setline(1, '**Retain newer edits**')
    let g:block_draft_clear = 2
    WebexSend
    call s:wait('!wbx#drafts#pending()')
    sleep 50m
    call assert_equal('New work before deferred clear', getline(1), 'deferred clearing still honors exact revision/text guards')
    call setline(1, '**Sent but permanently locked editor**')
    let g:block_draft_clear = 3
    WebexSend
    call s:wait('!wbx#drafts#pending()')
    sleep 80m
    call assert_true(wbx#drafts#is_sent(bufnr('%')), 'a failed local clear retains confirmed-send evidence')
    let sent = len(wbx#state().messages)
    WebexSend
    sleep 30m
    call assert_equal(sent, len(wbx#state().messages), 'an uncleared already-sent copy cannot be posted twice')
    call wbx#draft_persistence#flush()
    let files = glob($XDG_STATE_HOME . '/wbx-tui-drafts/*.json', 0, 1)
    call assert_equal([], json_decode(join(readfile(files[0]), "\n")).items, 'an uncleared sent copy is not resurrected from draft storage')
    let g:block_draft_clear = 0
    call setline(1, '') " Explicit synthetic-test discard, not delivery code.
    doautocmd TextChanged
    call wbx#shutdown()
    let files = glob($XDG_STATE_HOME . '/wbx-tui-drafts/*.json', 0, 1)
    let document = json_decode(join(readfile(files[0]), "\n"))
    call assert_equal([], document.items, 'successfully sent content is removed from disk')
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
