" Explicit image viewing, private exports and terminal viewers; synthetic only.
set encoding=utf-8 hidden noswapfile lines=60 columns=160 termguicolors
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0}
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  import {pathToFileURL} from 'node:url';
  const {imagePreview} = await import(pathToFileURL(process.env.WBX_EDITOR_ROOT + '/src/message-images.ts').href);
  const {detailedPNG} = await import(pathToFileURL(process.env.WBX_EDITOR_ROOT + '/test/image-fixture.ts').href);
  const ready = [imagePreview('a'.repeat(64), Buffer.alloc(240*144*3, 64)), imagePreview('b'.repeat(64), Buffer.alloc(240*144*3, 192))];
  const opened = ready.map(image=>({...image,png:detailedPNG().png.toString('base64'),width:960,height:600}));
  const room={id:'room',title:'Image viewing',type:'group'};
  let opens=0, revision=0, state={revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line', line=>{
    const req=JSON.parse(line), reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:['message-images','image-opening'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){state={...state,state:'ready',rooms:[room]};publish();return reply(null);}
    if(req.method==='rooms.select'){state={...state,room,ready:true,messages:[{id:'message',author:'Local',created:'2026-11-11T12:00:00Z',text:'Two images',images:ready.map(i=>({id:i.id,state:'pending'}))}]};publish();return reply(null);}
    if(req.method==='messages.images')return setTimeout(()=>{state.messages[0].images=ready;publish();reply(null);},100);
    if(req.method==='messages.imageOpen')return setTimeout(()=>reply(opened.find(image=>image.id===req.params.imageId)),++opens===4?350:100);
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui.backend = [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_RESULT . '.backend.mjs']
let s:viewer =<< trim END
  import {readFileSync,statSync,writeFileSync} from 'node:fs';
  import {dirname} from 'node:path';
  const [audit, literal, path]=process.argv.slice(2);
  const png=readFileSync(path);
  writeFileSync(audit,JSON.stringify({literal,path,mode:statSync(path).mode&511,directoryMode:statSync(dirname(path)).mode&511,png:png.subarray(0,8).toString('hex'),width:png.readUInt32BE(16),height:png.readUInt32BE(20),tty:!!process.stdin.isTTY}));
  if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',()=>process.exit(0));}
  else setTimeout(()=>process.exit(0),250);
END
call writefile(s:viewer, $WBX_EDITOR_RESULT . '.viewer.mjs')
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 8
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:image_idle() abort
  return !wbx#image_request#busy(getscriptinfo({'sid': s:owner_sid})[0].variables.image_request)
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  " Observe callback settlement, not elapsed time. The fourth synthetic read
  " deliberately outlasts the old 200ms sleep, preserving this race regression.
  let s:owner_sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call cursor(index(b:wbx_room_ids, 'room') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  let history = bufnr('%')
  call cursor(b:wbx_message_blocks[0].body, 1)
  let history_window = win_getid()
  WebexCompose
  call setline(1, 'Unsent image-viewing draft')
  let draft = bufnr('%')
  call win_gotoid(history_window)
  sleep 100m
  call assert_equal(0, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.images'), 'disabled inline reads stay disabled')
  " A delayed explicit read must not steal focus after the user leaves.
  WebexImageBuffer 2
  call wbx#compose()
  call WaitFor('s:image_idle()')
  call assert_equal(draft, bufnr('%'))
  call assert_equal(-1, bufnr('^wbx://image$'))
  call win_gotoid(history_window)
  let view = winsaveview()
  call assert_equal('<Plug>(WebexAttachment)', maparg('o', 'n'), 'history uses the general attachment action')
  call assert_notmatch('o opens attachment\|:WebexAttachment', join(getline(1, '$'), "\n"), 'attachment controls stay in discovery')
  call assert_match('WebexAttachment', maparg('<leader>Wo', 'n'), 'the existing global key now opens any attachment')
  WebexImageBuffer 2
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal('image', get(b:, 'wbx_kind', ''))
  call assert_equal('b', strpart(b:wbx_view_image.id, 0, 1))
  call assert_equal(42, line('$'))
  call assert_equal(960, b:wbx_view_image.width)
  call assert_equal(600, b:wbx_view_image.height)
  call assert_true(wbx#protocol#opened_image(b:wbx_view_image))
  for invalid in [extend(copy(b:wbx_view_image), {'width': 1601}), extend(copy(b:wbx_view_image), {'height': 0}), extend(copy(b:wbx_view_image), {'url': 'https://evil/'}), extend(copy(b:wbx_view_image), {'png': 'PRIVATE'})]
    call assert_false(wbx#protocol#opened_image(invalid))
  endfor
  call assert_match('960×600', getline(1), 'the viewer identifies actual higher-resolution pixels')
  call assert_equal('nofile', &buftype)
  call assert_false(&modifiable || &swapfile || &undofile || &modeline)
  let viewer_buffer = bufnr('%')
  let viewer_window = win_getid()
  call assert_equal(['Unsent image-viewing draft'], getbufline(draft, 1, '$'))
  call assert_equal('', maparg('<CR>', 'n'), 'viewer does not install a send or Enter action')
  call wbx#images#schedule()
  sleep 80m
  if has('nvim') && $WBX_EDITOR_SCREEN ==# '1'
    call assert_equal('kitty', wbx#images#status(viewer_buffer).mode, 'explicit buffer viewing works even with automatic images disabled')
  endif
  call win_gotoid(history_window)
  call assert_equal(view, winsaveview(), 'opening a split preserves the history viewport')
  normal o
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(viewer_buffer, bufnr('%'), 'one bounded viewer is reused')
  call assert_equal('a', strpart(b:wbx_view_image.id, 0, 1))
  execute 'bunload! ' . viewer_buffer
  execute 'sbuffer ' . viewer_buffer
  call assert_equal(42, line('$'), 'explicit reload reconstructs only the clean snapshot')
  let viewer_window = win_getid()
  setlocal modifiable
  call setline(1, 'User annotation')
  call win_gotoid(history_window)
  WebexImageBuffer 2
  call WaitFor('s:image_idle()')
  call assert_equal(history, bufnr('%'), 'annotations block viewer replacement')
  call assert_equal('User annotation', getbufline(viewer_buffer, 1)[0])
  call win_gotoid(viewer_window)
  file local-image-notes
  call assert_false(exists('b:wbx_kind'), 'renaming promotes the image buffer without taking user text')
  call win_gotoid(history_window)
  WebexImageBuffer 2
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal('image', b:wbx_kind)
  " A graphical external command runs without changing focused windows.
  let external_origin = win_getid()
  let g:wbx_tui.image_viewer = {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.external.json', 'literal;$(never-run)'], 'terminal': 0}
  WebexImageExternal
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".external.json")')
  let s:export = json_decode(readfile($WBX_EDITOR_RESULT . '.external.json')[0])
  call assert_equal('literal;$(never-run)', s:export.literal)
  call assert_equal(384, s:export.mode)
  call assert_equal(448, s:export.directoryMode)
  call assert_equal('89504e470d0a1a0a', s:export.png)
  call assert_equal(960, s:export.width, 'external viewers receive original-derived pixels, not the 240px thumbnail')
  call assert_equal(600, s:export.height)
  call assert_false(s:export.tty)
  call assert_equal(external_origin, win_getid())
  WebexImageExternal
  call assert_equal(external_origin, win_getid(), 'duplicate launch is refused while the foreground viewer owns its lease')
  call WaitFor('!filereadable(s:export.path)')
  call assert_false(isdirectory(fnamemodify(s:export.path, ':h')))
  " Moving away before export completion cancels launch, not a delayed focus jump.
  let g:wbx_tui.image_viewer.argv[2] = $WBX_EDITOR_RESULT . '.cancelled.json'
  WebexImageExternal
  call win_gotoid(history_window)
  sleep 200m
  call assert_false(filereadable($WBX_EDITOR_RESULT . '.cancelled.json'))
  call assert_equal([], glob($TMPDIR . '/wbx-image-*', 0, 1), 'cancelled export leaves no private-file lease')
  call win_gotoid(external_origin)
  " Terminal programs get an actual editor PTY, not the backend pipe.
  let g:wbx_tui.image_open = 'external'
  let g:wbx_tui.image_viewer.terminal = v:true
  let g:wbx_tui.image_viewer.argv[2] = $WBX_EDITOR_RESULT . '.terminal.json'
  WebexImage
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".terminal.json")')
  let s:export = json_decode(readfile($WBX_EDITOR_RESULT . '.terminal.json')[0])
  call assert_true(s:export.tty)
  call assert_equal('terminal', &buftype)
  call assert_true(exists('b:wbx_image_external'), 'lease ownership follows the actual native terminal buffer')
  call assert_equal('wipe', &l:bufhidden)
  call assert_false(&swapfile || &undofile || &modeline)
  call assert_true(filereadable(s:export.path), 'the prepared buffer wipe cannot release a running terminal viewer lease')
  bwipeout!
  call WaitFor('!filereadable(s:export.path)')
  call assert_equal(['Unsent image-viewing draft'], getbufline(draft, 1, '$'))
  call assert_equal('User annotation', getbufline(viewer_buffer, 1)[0])
  call win_gotoid(history_window)
  let g:wbx_tui.image_viewer = 'unsafe shell string'
  WebexImageExternal
  call assert_equal(history, bufnr('%'))
  " Native FileType hooks may annotate a newly shown viewer; no later overwrite.
  execute 'bwipeout! ' . bufnr('^wbx://image$')
  augroup wbx_test_image_hook
    autocmd!
    autocmd FileType wbx-image setlocal modifiable | call setline(1, 'Hook-owned annotation')
  augroup END
  WebexImageBuffer
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal('Hook-owned annotation', getline(1))
  call win_gotoid(history_window)
  WebexImageBuffer
  call assert_equal(history, bufnr('%'))
  augroup wbx_test_image_hook
    autocmd!
  augroup END
  let methods = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(0, count(methods, 'messages.images'), 'explicit opening does not replace or load inline thumbnails')
  call assert_equal(6, count(methods, 'messages.imageOpen'), 'only explicit uncached actions read higher-resolution images')
  call assert_equal(0, count(methods, 'messages.send'))
  call assert_equal(0, count(methods, 'rooms.read'))
  let health = wbx#health()
  call assert_true(has_key(health.bindings[0], 'map'), 'programmatic health retains complete mapping diagnostics')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
