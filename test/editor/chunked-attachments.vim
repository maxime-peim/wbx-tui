" Actual native -> RPC -> store/API -> bounded sink -> editor/handler chain.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0, 'upcoming_meetings': 0,
      \ 'backend': [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_ROOT . '/test/attachment-resolve-fixture.ts', '--chunks']}
let s:work = []
if $WBX_CHUNK_INLINE ==# '1'
  let g:wbx_tui.backend[-1] = '--large'
endif
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 12
    if eval(a:expression) | return | endif
    sleep 5m
  endwhile
  throw 'Timeout: ' . a:expression . ' | ' . execute('messages')
endfunction
function! s:audit() abort
  return map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)')
endfunction
function! s:reads() abort
  return len(filter(s:audit(), 'get(v:val, "method", "") ==# "GET" && get(v:val, "path", "") =~# "^/v1/contents/"'))
endfunction
function! s:answer(path, timer) abort
  if getcmdtype() !=# '@'
    call timer_start(10, function('s:answer', [a:path]))
    return
  endif
  call feedkeys("\<C-u>" . a:path . "\<CR>", 't')
endfunction
function! s:gap(timer) abort
  let now = reltime()
  let s:max_gap_us = max([s:max_gap_us, float2nr(reltimefloat(reltime(s:last_tick, now)) * 1000000)])
  let s:last_tick = now
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('room', 1, 0)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  let history = bufnr('%')
  call cursor(b:wbx_message_blocks[0].body, 1)
  if $WBX_CHUNK_BENCH ==# '1'
    call writefile(["import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';const b=readFileSync(process.argv[3]);writeFileSync(process.argv[2],JSON.stringify({bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}));"], $WBX_EDITOR_RESULT . '.bench-viewer.mjs')
    for iteration in range(1, 5)
      let s:bench_saved = $WBX_EDITOR_RESULT . '.bench-' . iteration
      let g:wbx_tui.attachment_handlers = {'.bin': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.bench-viewer.mjs', s:bench_saved]}}
      let s:last_tick = reltime()
      let s:max_gap_us = 0
      let monitor = timer_start(2, function('s:gap'), {'repeat': -1})
      let start = reltime()
      WebexAttachment 3
      call WaitFor('filereadable(s:bench_saved) && !wbx#attachments#busy() && !wbx#attachment_stream#busy()')
      call s:gap(monitor)
      call timer_stop(monitor)
      call assert_equal(6000000, json_decode(readfile(s:bench_saved)[0]).bytes)
      call add(s:work, {'case': $WBX_CHUNK_INLINE ==# '1' ? 'inline' : 'chunks', 'iteration': iteration,
            \ 'bytes': 6000000, 'total_us': float2nr(reltimefloat(reltime(start)) * 1000000), 'maximum_timer_gap_us': s:max_gap_us})
    endfor
    call wbx#shutdown()
    call writefile([json_encode({'errors': v:errors, 'work': s:work})], $WBX_EDITOR_RESULT)
    qa!
  endif
  let start = reltime()
  WebexAttachment 10
  call WaitFor('get(b:, "wbx_kind", "") ==# "image" && !wbx#attachment_stream#busy()')
  let image = b:wbx_view_image
  call assert_equal(v:t_dict, type(image.png))
  let snapshot = wbx#snapshots#value(image.png.snapshot)
  call assert_equal(147457, snapshot.body.decodedBytes)
  call assert_equal(4, snapshot.body.payload.chunks)
  call assert_equal(1, s:reads())
  if has('nvim-0.10')
    lua << trim LUA
      local images = require('wbx-tui.images')
      local saved = {send=vim.api.nvim_ui_send, uis=vim.api.nvim_list_uis, supported=images.supported,
        schedule=vim.schedule, transmission=images.transmission, concat=table.concat}
      local buf=vim.api.nvim_get_current_buf()
      local values=vim.b[buf].wbx_image_placements
      local queue, packets, total, maximum, channel = {}, 0, 0, 0, 101
      local turnbytes=0
      images.clear(buf)
      vim.schedule=function(fn) queue[#queue+1]=fn end
      vim.api.nvim_list_uis=function() return {{stdout_tty=true,chan=channel}} end
      images.supported=function() return true end
      images.transmission=function() error('Whole PNG transmission must not run') end
      table.concat=function(t, ...)
        local bytes=0;for _,v in ipairs(t) do if type(v)=='string' then bytes=bytes+#v end end
        assert(bytes<=69632,'No aggregate Kitty/base64 join on segmented path')
        return saved.concat(t,...)
      end
      vim.api.nvim_ui_send=function(data)
        local payload=data:match(';([A-Za-z0-9+/=]+)'..string.char(27))
        if payload then
          assert(#payload<=4096 and data:find('q=2',1,true))
          turnbytes=turnbytes+#payload;total=total+#payload;packets=packets+1
        end
      end
      local ok,err=pcall(function()
        images.register(buf,values)
        assert(total==0 and #queue==1,'Registration schedules, never synchronously submits a PNG')
        while #queue>0 do
          turnbytes=0;local fn=table.remove(queue,1);fn()
          maximum=math.max(maximum,turnbytes)
          assert(turnbytes<=65536,'At most one credit of graphics per scheduled turn')
        end
        assert(total==196612 and packets==49)
        local previous=total
        images.refresh(buf);assert(total==previous and #queue==0,'Unchanged refresh retains the upload')
        images.clear(buf);images.register(buf,values)
        table.remove(queue,1)()
        previous=total;channel=102
        while #queue>0 do table.remove(queue,1)() end
        assert(total==previous,'Route replacement revokes pending old-route transmission')
      end)
      images.clear(buf)
      vim.api.nvim_ui_send,vim.api.nvim_list_uis,images.supported=saved.send,saved.uis,saved.supported
      vim.schedule,images.transmission,table.concat=saved.schedule,saved.transmission,saved.concat
      assert(ok,err)
      vim.g.wbx_chunk_graphics={packets=49,maximum_payload_bytes_per_turn=maximum}
    LUA
    call add(s:work, extend({'case': 'segmented-graphics'}, g:wbx_chunk_graphics))
  endif
  let requests = filter(s:audit(), 'get(v:val, "rpc", "") ==# "messages.attachmentChunk"')
  call assert_equal(4, len(requests))
  call assert_equal([0, 1, 2, 3], map(copy(requests), 'v:val.params.seq'))
  call add(s:work, {'case': 'segmented-png', 'gets': s:reads(), 'chunks': len(requests), 'receive_us': float2nr(reltimefloat(reltime(start)) * 1000000)})
  let before = s:reads()
  WebexAttachment
  call assert_equal(before, s:reads(), 'snapshot buffer reopen is zero-fetch')

  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  WebexAttachment 10
  call assert_equal(before, s:reads(), 'source-bound history snapshot reopen is zero-fetch')
  call assert_equal('image', b:wbx_kind)

  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  WebexAttachment 2
  call WaitFor('exists("b:wbx_attachment") && !wbx#attachment_stream#busy()')
  call assert_equal('print("hello")', getline(1))
  call assert_false(&l:modeline)
  call assert_false(&l:undofile)
  call feedkeys("Goannotation\<Esc>", 'xt')
  normal! u
  call assert_equal('# vim: set textwidth=7:', getline('$'))
  let text_buffer = bufnr('%')

  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  let saved = $WBX_EDITOR_RESULT . '.saved'
  let before = s:reads()
  let start = reltime()
  call timer_start(300, function('s:answer', [saved]))
  WebexAttachmentDownload 3
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".saved") && !wbx#attachment_stream#busy()')
  call assert_equal(6000000, getfsize(saved))
  call assert_equal(before + 1, s:reads())
  let chunks = filter(s:audit(), 'get(v:val, "rpc", "") ==# "messages.attachmentChunk"')
  call assert_equal(128, len(chunks), 'four PNG, one text and 123 original chunks')
  call add(s:work, {'case': 'maximum-original', 'bytes': getfsize(saved), 'chunks': 123, 'gets': s:reads() - before,
        \ 'transfer_us': float2nr(reltimefloat(reltime(start)) * 1000000)})

  call writefile(["import {appendFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';const p=process.argv[3];appendFileSync(process.argv[2],JSON.stringify({path:p,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')})+'\\n');setTimeout(()=>{},100);"], $WBX_EDITOR_RESULT . '.viewer.mjs')
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.handler']}}
  let before = s:reads()
  WebexAttachment 1
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".handler") && !wbx#attachment_stream#busy()')
  let handler = json_decode(readfile($WBX_EDITOR_RESULT . '.handler')[0])
  call assert_false(filereadable(handler.path))
  call assert_equal(before + 1, s:reads())
  call assert_false(wbx#attachments#busy())

  call writefile(["import {appendFileSync,readFileSync} from 'node:fs';const p=process.argv[3];appendFileSync(process.argv[2],JSON.stringify({path:p,bytes:readFileSync(p).length})+'\\n');setTimeout(()=>{},3000);"], $WBX_EDITOR_RESULT . '.terminal.mjs')
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.terminal.mjs', $WBX_EDITOR_RESULT . '.terminal'], 'terminal': v:true}}
  WebexAttachment 1
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".terminal")')
  let s:terminal = json_decode(readfile($WBX_EDITOR_RESULT . '.terminal')[0])
  call assert_equal('terminal', &l:buftype)
  call assert_true(wbx#attachments#busy() && filereadable(s:terminal.path), 'actual terminal owns its committed file lease')
  bwipeout!
  call WaitFor('!wbx#attachments#busy() && !wbx#attachment_stream#busy() && !filereadable(s:terminal.path)')

  " Completed memory-only PNG remains usable after backend/session loss.
  let g:wbx_tui.attachment_handlers = {}
  execute 'buffer ' . bufnr('^wbx://image$')
  call wbx#disconnect()
  let g:wbx_tui.image_viewer = {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.offline']}
  WebexImageExternal
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".offline") && !wbx#attachment_stream#busy()')
  let offline = json_decode(readfile($WBX_EDITOR_RESULT . '.offline')[0])
  call assert_equal(snapshot.body.payload.sha256, offline.sha256)
  call assert_false(filereadable(offline.path))
  call assert_equal(before + 2, s:reads(), 'offline PNG lease never contacts backend')
  call assert_true(bufexists(text_buffer), 'separate editable text snapshot retained')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'work': s:work})], $WBX_EDITOR_RESULT)
qa!
