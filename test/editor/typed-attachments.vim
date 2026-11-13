" Real Node chain with local content; typed policy, single fetch, and revocation.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0, 'upcoming_meetings': 0,
      \ 'backend': [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_ROOT . '/test/attachment-resolve-fixture.ts']}
let s:work = []
let s:selection_settled = 0
function! s:settled(response) abort
  call assert_false(has_key(a:response, 'error'))
  let s:selection_settled = 1
endfunction
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:audit() abort
  return map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)')
endfunction
function! s:reads() abort
  return len(filter(s:audit(), 'get(v:val, "method", "") ==# "GET" && get(v:val, "path", "") =~# "^/v1/contents/"'))
endfunction
function! s:conversions() abort
  return len(filter(s:audit(), 'has_key(v:val, "conversion")'))
endfunction
function! s:answer(path, timer) abort
  call feedkeys("\<C-u>" . a:path . "\<CR>", 't')
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call cursor(index(b:wbx_room_ids, 'room') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call wbx#rpc('test.selectionBarrier', {}, function('s:settled'))
  call WaitFor('s:selection_settled')
  let history = bufnr('%')
  let window = win_getid()
  call cursor(b:wbx_message_blocks[0].body, 1)
  " Unknown image, unrelated handler, and file ten beyond the preview projection.
  for [handlers, number] in [[{}, 1], [{'.pdf': 'unrelated-invalid-handler'}, 1], [{}, 10]]
    let g:wbx_tui.attachment_handlers = handlers
    let before = s:reads()
    execute 'WebexAttachment ' . number
    call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
    call assert_equal(before + 1, s:reads(), 'exactly one original GET reaches native conversion')
    call add(s:work, {'attachment': number, 'handlers': empty(handlers) ? 'none' : 'unrelated', 'contentGets': s:reads() - before})
    call assert_equal(120, b:wbx_view_image.width)
    call assert_equal(80, b:wbx_view_image.height)
    if number != 10 | bwipeout! | endif
    call win_gotoid(window)
  endfor
  let before = s:reads()
  WebexAttachment 10
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(before, s:reads(), 'clean source-bound snapshot reuse is zero-fetch')
  bwipeout!
  call win_gotoid(window)
  let g:wbx_tui.attachment_handlers = {'.png': {}, 'image/png': {'argv': [$WBX_NODE, '--version']}}
  let before = s:reads()
  WebexAttachment 1
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(before + 1, s:reads(), 'empty extension suppresses MIME handler')
  let image = deepcopy(b:wbx_view_image)
  bwipeout!
  call win_gotoid(window)
  let viewer = ['import {readFileSync,writeFileSync} from "node:fs";',
        \ 'const [audit,path]=process.argv.slice(2);writeFileSync(audit,JSON.stringify({path,bytes:readFileSync(path).toString("hex")}));',
        \ 'if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on("data",()=>process.exit(0));}else setTimeout(()=>process.exit(0),150);']
  call writefile(viewer, $WBX_EDITOR_RESULT . '.viewer.mjs')
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.view.json']}}
  let before = s:reads()
  let conversions = s:conversions()
  WebexAttachment 1
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".view.json")')
  call assert_equal(before + 1, s:reads())
  call assert_equal(conversions, s:conversions(), 'configured image handlers receive originals, no raster work')
  call assert_match('^89504e470d0a1a0a', json_decode(readfile($WBX_EDITOR_RESULT . '.view.json')[0]).bytes)
  call WaitFor('!wbx#attachments#busy()')
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.terminal.json'], 'terminal': v:true}, 'image/png': 'invalid-but-shadowed'}
  WebexAttachment 1
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".terminal.json")')
  call assert_equal('terminal', &buftype)
  call assert_true(wbx#attachments#busy(), 'typed handoff retains actual terminal lease')
  let g:wbx_terminal_path = json_decode(readfile($WBX_EDITOR_RESULT . '.terminal.json')[0]).path
  bwipeout!
  call WaitFor('!wbx#attachments#busy() && !filereadable(g:wbx_terminal_path)')
  call win_gotoid(window)
  let before = s:reads()
  let g:wbx_tui.attachment_handlers = {}
  for number in range(0, 128) | let g:wbx_tui.attachment_handlers['.' . number] = {} | endfor
  WebexAttachment 1
  sleep 100m
  call assert_equal(before, s:reads(), 'oversized useful policy fails before fetching, not truncated')
  let g:wbx_tui.attachment_handlers = {'.png': 'invalid-selected-handler'}
  let conversions = s:conversions()
  WebexAttachment 1
  sleep 180m
  call assert_equal(before + 1, s:reads())
  call assert_equal(conversions, s:conversions(), 'invalid selected handler cannot fall back to native conversion')
  call assert_false(wbx#attachments#busy())
  let g:wbx_tui.attachment_handlers = {}
  WebexCompose
  call setline(1, 'Unsent typed-open draft')
  let draft = bufnr('%')
  call win_gotoid(window)
  let before = s:reads()
  WebexAttachment 1
  call wbx#compose()
  sleep 180m
  call assert_equal(draft, bufnr('%'), 'late data never steals focus')
  call assert_equal(-1, bufnr('^wbx://image$'))
  call assert_equal(before + 1, s:reads(), 'cancel never refetches')
  call win_gotoid(window)
  WebexAttachment 2
  call WaitFor('exists("b:wbx_attachment")')
  call assert_equal('python', &filetype)
  call assert_false(&modeline || &swapfile || &undofile)
  call setline(1, 'User annotation')
  let text_buffer = bufnr('%')
  call WaitFor('!wbx#attachments#busy()')
  call win_gotoid(window)
  let before = s:reads()
  let saved = $WBX_EDITOR_RESULT . '.saved.png'
  call timer_start(250, function('s:answer', [saved]))
  WebexAttachmentDownload 1
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".saved.png") && !wbx#attachments#busy()')
  call assert_equal(before + 1, s:reads())
  call assert_equal('rw-------', getfperm(saved))
  call assert_equal('User annotation', getbufline(text_buffer, 1)[0])
  call assert_equal(['Unsent typed-open draft'], getbufline(draft, 1, '$'))
  " Away/back invalidation cannot revive an old intent.
  WebexAttachment 1
  call cursor(line('.') + 1, 1)
  doautocmd CursorMoved
  call cursor(line('.') - 1, 1)
  sleep 180m
  call assert_equal(history, bufnr('%'))
  call assert_equal(-1, bufnr('^wbx://image$'))
  " A configuration revision cannot choose a newly configured handler.
  WebexAttachment 1
  let g:wbx_tui.attachment_handlers = {'.png': {'argv': [$WBX_NODE, '--version']}}
  sleep 180m
  call assert_false(wbx#attachments#busy())
  call assert_equal(history, bufnr('%'))
  let g:wbx_tui.attachment_handlers = {}
  let valid = {'meta': {'id': repeat('a', 64), 'name': 'hello.txt', 'mime': 'text/plain', 'sourceBytes': 1},
        \ 'body': {'kind': 'original', 'decodedBytes': 1, 'text': v:true, 'payload': {'mode': 'inline', 'encoding': 'base64', 'data': 'AA=='}}}
  call assert_true(wbx#protocol#resolved_attachment(valid))
  let bad = deepcopy(valid) | let bad.body.payload.data = 'AB=='
  call assert_false(wbx#protocol#resolved_attachment(bad), 'noncanonical pad bits rejected before materialization')
  let bad = deepcopy(valid) | let bad.meta.sourceBytes = 2
  call assert_false(wbx#protocol#resolved_attachment(bad))
  let raster = {'meta': {'id': image.id, 'name': 'image.png', 'mime': 'image/png', 'sourceBytes': strlen(image.png) / 4 * 3 - (image.png =~# '==$' ? 2 : (image.png =~# '=$' ? 1 : 0))},
        \ 'body': {'kind': 'png', 'decodedBytes': strlen(image.png) / 4 * 3 - (image.png =~# '==$' ? 2 : (image.png =~# '=$' ? 1 : 0)), 'width': image.width, 'height': image.height,
        \ 'lines': image.lines, 'payload': {'mode': 'inline', 'encoding': 'base64', 'data': image.png}}}
  call assert_true(wbx#protocol#resolved_attachment(raster))
  let raster.body.width += 1
  call assert_false(wbx#protocol#resolved_attachment(raster), 'wire dimensions must match PNG header')
  for case in json_decode(join(readfile($WBX_EDITOR_ROOT . '/test/attachment-policy-cases.json'), "\n"))
    call assert_equal(case.key, '.' . tolower(fnamemodify(case.name, ':e')), 'shared backend/native final-extension semantics')
  endfor
  let large = deepcopy(valid)
  let large.meta.sourceBytes = 6000000
  let large.body.decodedBytes = 6000000
  let large.body.text = v:false
  let large.body.payload.data = repeat('AAAA', 2000000)
  call assert_true(wbx#protocol#resolved_attachment(large), 'exact original/base64 maximum remains admitted')
  let large.meta.sourceBytes += 1 | let large.body.decodedBytes += 1
  call assert_false(wbx#protocol#resolved_attachment(large), 'decoded limit is not merely encoded size')
  let methods = map(filter(s:audit(), 'has_key(v:val, "rpc")'), 'v:val.rpc')
  call assert_equal(0, count(methods, 'messages.attachmentOpen'))
  call assert_equal(0, count(methods, 'messages.imageOpen'))
  call assert_equal(0, count(methods, 'messages.send'))
  call assert_equal(0, count(methods, 'rooms.read'))
  call assert_equal(0, count(methods, 'messages.images'))
  call assert_true(count(methods, 'messages.attachmentCancel') >= 2)
  for request in filter(s:audit(), 'get(v:val, "rpc", "") ==# "messages.attachmentResolve"')
    call assert_false(json_encode(request.params) =~# 'argv\|SYNTHETIC\|saved.png\|viewer.mjs')
  endfor
  call assert_true(empty(filter(s:audit(), 'has_key(v:val, "exact") && !v:val.exact')))
  " A native buffer-creation hook can revoke the operation before image writes.
  let g:wbx_tui.attachment_handlers = {}
  let g:wbx_hook_seen = 0
  augroup wbx_typed_image_hook
    autocmd!
    autocmd BufNew * let g:wbx_hook_seen += 1 | call wbx#disconnect()
  augroup END
  WebexAttachment 1
  sleep 220m
  call assert_true(g:wbx_hook_seen > 0, 'fixture must execute the hostile creation hook')
  call assert_equal(history, bufnr('%'))
  call assert_equal({}, getbufvar(bufnr('^wbx://image$'), 'wbx_view_image', {}))
  call assert_equal(['Unsent typed-open draft'], getbufline(draft, 1, '$'))
  augroup wbx_typed_image_hook
    autocmd!
  augroup END
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'work': s:work})], $WBX_EDITOR_RESULT)
qa!
