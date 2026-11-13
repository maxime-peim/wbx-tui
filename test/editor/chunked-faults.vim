" Adversarial remote completion and native intent ownership; no external tools.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let s:audit_base = $WBX_EDITOR_AUDIT
let s:audit_generation = 0
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0, 'upcoming_meetings': 0}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 8
    if eval(a:expression) | return | endif
    sleep 5m
  endwhile
  throw 'Timeout: ' . a:expression . ' | ' . execute('messages')
endfunction
function! s:reads() abort
  return len(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'get(v:val, "method", "") ==# "GET" && get(v:val, "path", "") =~# "^/v1/contents/"'))
endfunction
let s:selection_settled = 0
function! s:settled(response) abort
  if !has_key(a:response, 'error') | let s:selection_settled += 1 | endif
endfunction
function! s:open(mode) abort
  call wbx#transport#stop()
  call WaitFor('!wbx#attachment_stream#busy()')
  " job_stop revokes the channel synchronously, not the old OS process. Each
  " child owns its inherited audit path so a late old write cannot contaminate
  " the next generation's exact physical-read count.
  let s:audit_generation += 1
  let $WBX_EDITOR_AUDIT = s:audit_base . '.' . s:audit_generation
  let $WBX_ATTACHMENT_GENERATION = string(s:audit_generation)
  call writefile([], $WBX_EDITOR_AUDIT)
  let g:wbx_tui.backend = [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_ROOT . '/test/attachment-resolve-fixture.ts', '--chunks'] + (empty(a:mode) ? [] : [a:mode])
  WebexDemo
  " Retained previous-session rows are not readiness for this child. Require
  " this exact generation's publication before selecting/opening its message.
  call WaitFor('len(wbx#state().rooms) == 1 && wbx#state().rooms[0].title ==# "Typed attachment fixture #" . $WBX_ATTACHMENT_GENERATION')
  call wbx#select('room', 1, 0)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  " ready=true is published before the asynchronous selection reply/focus work.
  " Do not start a DIFFERENT attachment intent while that explicit UI open is
  " still entitled to reposition history. This barrier follows the real engine
  " select promise and ordered native RPC callback; no physical-read assertion
  " or away/back/preflight cancellation safeguard below is weakened.
  let next = s:selection_settled + 1
  call wbx#rpc('test.selectionBarrier', {}, function('s:settled'))
  call WaitFor('s:selection_settled == ' . next)
  call cursor(b:wbx_message_blocks[0].body, 1)
endfunction
function! s:cancel_prompt(timer) abort
  if getcmdtype() ==# '@'
    call feedkeys("\<C-u>\<CR>", 't')
  else
    call timer_start(10, function('s:cancel_prompt'))
  endif
endfunction
try
  call s:open('--preview-wait')
  call wbx#rpc('test.preview', {})
  call WaitFor('len(filter(map(readfile($WBX_EDITOR_AUDIT), "json_decode(v:val)"), ''get(v:val, "previewEntered", 0)'')) == 1')
  WebexAttachment 2
  sleep 100m
  call assert_equal(1, s:reads(), 'typed intent waits behind preview without a generic probe')
  call wbx#rpc('test.release', {})
  call WaitFor('exists("b:wbx_attachment") && !wbx#attachment_stream#busy()')
  call assert_equal(2, s:reads(), 'one preview GET plus exactly one explicit GET after physical settlement')
  call assert_equal('print("hello")', getline(1))
  call writefile(["import {writeFileSync} from 'node:fs';writeFileSync(process.argv[2],'UNEXPECTED');"], $WBX_EDITOR_RESULT . '.viewer.mjs')
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.launched']}}
  for mode in ['--resolve-fail', '--bad-digest', '--bad-seq', '--bad-complete']
    call s:open(mode)
    let history = bufnr('%')
    WebexAttachment 1
    call WaitFor('s:reads() == 1')
    call WaitFor('!wbx#attachment_stream#busy()')
    call assert_false(filereadable($WBX_EDITOR_RESULT . '.launched'), mode . ': no pre-completion launch')
    call assert_equal(history, bufnr('%'))
    call assert_equal(1, s:reads())
    call assert_equal([], glob($TMPDIR . '/wbx-attachment-*', 0, 1))
    let methods = map(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'has_key(v:val, "rpc")'), 'v:val.rpc')
    if mode ==# '--bad-digest' | call assert_equal(0, count(methods, 'messages.attachmentComplete')) | endif
  endfor
  let g:wbx_tui.attachment_handlers = {}
  call s:open('')
  let history = bufnr('%')
  WebexAttachment 10
  call wbx#compose()
  call setline(1, 'Preserved destination draft')
  let draft = bufnr('%')
  call WaitFor('!wbx#attachment_stream#busy()')
  call assert_equal(0, s:reads(), 'preflight cancellation is zero-fetch')
  call assert_equal('Preserved destination draft', getline(1))
  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  WebexAttachment 10
  call WaitFor('s:reads() == 1')
  let row = line('.')
  call cursor(row + 1, 1)
  doautocmd CursorMoved
  call cursor(row, 1)
  call WaitFor('!wbx#attachment_stream#busy()')
  sleep 150m
  call assert_equal(history, bufnr('%'), 'away/back cannot revive a canceled intent')
  call assert_equal(1, s:reads())
  call assert_equal(['Preserved destination draft'], getbufline(draft, 1, '$'))
  call assert_equal([], glob($TMPDIR . '/wbx-attachment-*', 0, 1))

  call s:open('--slow-chunks')
  let history = bufnr('%')
  WebexAttachment 10
  call WaitFor('len(filter(map(readfile($WBX_EDITOR_AUDIT), "json_decode(v:val)"), ''get(v:val, "rpc", "") ==# "messages.attachmentChunk"'')) >= 1')
  let g:wbx_tui.image_open = 'external'
  call wbx#_attachment_check(0)
  call WaitFor('!wbx#attachment_stream#busy()')
  sleep 100m
  call assert_equal(history, bufnr('%'), 'configuration change revokes an in-flight chunk')
  call assert_equal(1, s:reads())
  let g:wbx_tui.image_open = 'buffer'

  call s:open('')
  let g:wbx_tui.attachment_download_dir = $TMPDIR
  call timer_start(10, function('s:cancel_prompt'))
  WebexAttachmentDownload 3
  call WaitFor('s:reads() == 1 && !wbx#attachment_stream#busy()')
  call assert_false(filereadable($TMPDIR . '/original.bin'), 'canceling prepared save creates no destination')
  call assert_equal([], glob($TMPDIR . '/wbx-attachment-*', 0, 1))

  call s:open('')
  let g:wbx_chunk_hook = 0
  augroup wbx_chunk_hostile_hook
    autocmd!
    autocmd BufNew * if expand('<afile>') ==# 'wbx://image' | let g:wbx_chunk_hook += 1 | call wbx#disconnect() | endif
  augroup END
  WebexAttachment 10
  call WaitFor('s:reads() == 1 && !wbx#attachment_stream#busy()')
  call assert_equal(1, g:wbx_chunk_hook, 'hostile native hook actually ran')
  call assert_equal({}, getbufvar(bufnr('^wbx://image$'), 'wbx_view_image', {}), 'no late snapshot installed after disconnect hook')
  augroup wbx_chunk_hostile_hook
    autocmd!
  augroup END
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
