" Explicit reads, native text buffers, configured handlers and downloads. No Webex/OS opener.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0, 'upcoming_meetings': 0}
nnoremap Q :let g:wbx_user_map = 1<CR>
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  import {pathToFileURL} from 'node:url';
  const {imagePreview}=await import(pathToFileURL(process.env.WBX_EDITOR_ROOT+'/src/message-images.ts').href);
  const preview=imagePreview('c'.repeat(64),Buffer.alloc(240*144*3,128));
  const image={...preview,width:240,height:144};
  const text=Buffer.from('print("hello")\n# vim: set textwidth=7:\n');
  const binary=Buffer.from([0,255,128,13,10,65]);
  const files=[{id:'a'.repeat(64),name:'example.py',mime:'text/x-python',size:text.length,text:true,data:text.toString('base64')},
    {id:'b'.repeat(64),name:'report.pdf',mime:'application/pdf',size:binary.length,text:false,data:binary.toString('base64')},
    {id:image.id,name:'picture.png',mime:'image/png',size:Buffer.from(image.png,'base64').length,text:false,data:image.png}];
  const room={id:'room',title:'Attachment fixture',type:'group'};
  let revision=0,state={revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:process.argv[2]==='legacy'?[]:['messaging','message-attachments','image-opening'],
      ...(process.argv[2]==='legacy'?{}:{attachmentMetadata:['headers-v1']}),state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){state={...state,state:'ready',rooms:[room]};publish();return reply(null);}
    if(req.method==='rooms.select'){state={...state,room,ready:true,messages:[{id:'message',author:'Local',created:'2026-11-12T12:00:00Z',text:'Three attachments',attachments:files.map(f=>({id:f.id}))}]};publish();return reply(null);}
    if(req.method==='messages.attachmentOpen')return setTimeout(()=>reply(files.find(f=>f.id===req.params.attachmentId)),80);
    if(req.method==='messages.imageOpen')return setTimeout(()=>reply(image),80);
    if(req.method==='messages.attachmentMetadata'){
      state.messages[0].attachments=files.map(({id,name,mime})=>({id,name,mime}));
      state.messages[0].images=[{id:files[1].id,state:'unsupported'}];publish();return reply(null);
    }
    if(req.method==='test.imagesReady'){state.messages[0].images=[preview];publish();return reply(null);}
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui.backend = [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_RESULT . '.backend.mjs']
let s:viewer =<< trim END
  import {readFileSync,statSync,writeFileSync} from 'node:fs';
  import {dirname} from 'node:path';
  const [audit,literal,path]=process.argv.slice(2);
  writeFileSync(audit,JSON.stringify({literal,path,mode:statSync(path).mode&511,directoryMode:statSync(dirname(path)).mode&511,bytes:readFileSync(path).toString('hex'),tty:!!process.stdin.isTTY}));
  if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',()=>process.exit(0));}
  else setTimeout(()=>process.exit(0),200);
END
call writefile(s:viewer, $WBX_EDITOR_RESULT . '.viewer.mjs')
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:answer(path, timer) abort
  if getcmdtype() !=# '@'
    call timer_start(20, function('s:answer', [a:path]))
    return
  endif
  call feedkeys("\<C-u>" . a:path . "\<CR>", 't')
endfunction
function! s:setup(values) abort
  " Exercise the documented Lua entry point, not just Vim's direct global path.
  if has('nvim')
    call luaeval("require('wbx-tui').setup(_A)", extend({'treesitter': v:false, 'which_key': v:false}, a:values))
  else
    call extend(g:wbx_tui, a:values)
  endif
endfunction
function! s:accept_default(timer) abort
  if getcmdtype() !=# '@'
    call timer_start(20, function('s:accept_default'))
    return
  endif
  let g:wbx_download_default = getcmdline()
  call feedkeys("\<CR>", 't')
endfunction
if has('nvim')
lua << EOF
  vim.ui.select = function(items, opts, done)
    local origin = vim.api.nvim_get_current_win()
    local buf = vim.api.nvim_create_buf(false,true)
    vim.api.nvim_buf_set_lines(buf,0,-1,false,items)
    local win = vim.api.nvim_open_win(buf,true,{relative='editor',row=3,col=3,width=40,height=#items,style='minimal'})
    WBXAttachmentPicker = {items=items,done=done,origin=origin,win=win}
  end
EOF
endif
function! s:attachment_menu(choice) abort
  let g:attachment_picker_settled = 0
  call feedkeys("\\Wo",'xt')
  if has('nvim')
    call assert_equal(['example.py · text/x-python','report.pdf · application/pdf','picture.png · image/png'],luaeval('WBXAttachmentPicker.items'))
    call luaeval("(function(i) local p=WBXAttachmentPicker; p.done(p.items[i],i>0 and i or nil); vim.api.nvim_win_close(p.win,true); vim.api.nvim_set_current_win(p.origin); if vim.g.attachment_picker_stale==1 then vim.api.nvim_win_set_cursor(p.origin,{1,0}) end; vim.schedule(function() vim.g.attachment_picker_settled=1 end) end)(_A)",a:choice)
    call WaitFor('g:attachment_picker_settled')
  else
    let picker = popup_list()[0]
    if get(g:,'attachment_picker_stale',0) | call cursor(1,1) | endif
    if a:choice
      for _ in range(a:choice - 1) | call popup_filter_menu(picker,'j') | endfor
      call popup_filter_menu(picker,"\<CR>")
    else
      call popup_filter_menu(picker,"\<Esc>")
    endif
  endif
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call cursor(index(b:wbx_room_ids, 'room') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  let history = bufnr('%')
  let history_window = win_getid()
  call cursor(b:wbx_message_blocks[0].body, 1)
  redraw!
  call wbx#images#schedule()
  call WaitFor('has_key(wbx#state().messages[0].attachments[0],"name")')
  call assert_match('\[Attachment: example.py · text/x-python\]', join(getline(1, '$'), "\n"))
  call assert_match('\[Attachment: report.pdf · application/pdf\]', join(getline(1, '$'), "\n"))
  call assert_notmatch('no supported image preview\|Attachments: ', join(getline(1, '$'), "\n"))
  call assert_equal(0,count(map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val).method'),'messages.images'),'images=0 still fetches labels but no previews')
  let refs = wbx#state().messages[0].attachments
  call assert_true(wbx#protocol#attachments(refs))
  for patch in [{'name':"evil\nname"},{'name':'../escape'},{'mime':"text/plain\nsecret"},{'url':'https://secret.invalid'}]
    call assert_false(wbx#protocol#attachments([extend(copy(refs[0]),patch)]),'unsafe metadata never crosses RPC')
  endfor
  call assert_notmatch(':WebexAttachment', join(getline(1, '$'), "\n"))
  call assert_equal('<Plug>(WebexAttachment)', maparg('o', 'n'))
  call assert_equal('<Plug>(WebexAttachment)', maparg('<localleader>o', 'n'))
  call assert_match('WebexAttachment', maparg('<leader>Wo', 'n'))
  call assert_equal('', maparg('<leader>Wa', 'n'), 'there is one general open action, not a separate attachment key')
  call assert_equal(0, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.attachmentOpen'), 'metadata and drawing do not download attachments')
  call s:attachment_menu(0)
  let g:attachment_picker_stale = 1
  call s:attachment_menu(1)
  let g:attachment_picker_stale = 0
  call cursor(b:wbx_message_blocks[0].body,1)
  call assert_equal(0,count(map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val).method'),'messages.attachmentOpen'),'canceled or retargeted attachment pickers cause no read/download/opener')
  WebexCompose
  call setline(1, 'Unsent attachment draft')
  let draft = bufnr('%')
  call win_gotoid(history_window)
  WebexAttachment 1
  call wbx#compose()
  sleep 200m
  call assert_equal(draft, bufnr('%'), 'late attachment reads cannot steal focus')
  call assert_equal([], glob('wbx-attachment://*', 0, 1))
  call win_gotoid(history_window)
  let history_view = winsaveview()
  call s:attachment_menu(1)
  call WaitFor('exists("b:wbx_attachment")')
  call assert_equal('example.py', b:wbx_attachment.name)
  call assert_equal('python', &filetype, 'this session owns normal filetype detection')
  call assert_equal(['print("hello")', '# vim: set textwidth=7:'], getline(1, '$'))
  call assert_false(&modeline || &swapfile || &undofile)
  call assert_notequal(7, &textwidth, 'remote modelines are never executed')
  call assert_equal('nofile', &buftype)
  call assert_true(&modifiable)
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_match('wbx_user_map', maparg('Q', 'n'), 'user mappings remain in effect')
  let text_buffer = bufnr('%')
  call feedkeys("gg0i# note \<Esc>", 'xt')
  normal! u
  call assert_equal('print("hello")', getline(1), 'native undo remains available')
  call setline(1, 'User annotation')
  call WaitFor('!wbx#attachments#busy()')
  call WaitFor('empty(glob($TMPDIR . "/wbx-attachment-*", 0, 1))')
  call win_gotoid(history_window)
  call assert_equal(history_view, winsaveview())
  WebexAttachment 2
  sleep 180m
  call assert_equal(history, bufnr('%'), 'binary without a handler does not open an OS application')
  call s:setup({'attachment_handlers': {'.pdf': 'unsafe shell string'}})
  call assert_equal({'.pdf': 'unsafe shell string'}, get(g:wbx_tui, 'attachment_handlers', {}), 'Lua forwards attachment settings for dispatch validation')
  WebexAttachment 2
  sleep 180m
  call assert_false(wbx#attachments#busy())
  call s:setup({'attachment_handlers': {'application/pdf': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.external.json', 'literal;$(never-run)']}}})
  WebexAttachment 2
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".external.json")')
  let s:export = json_decode(readfile($WBX_EDITOR_RESULT . '.external.json')[0])
  call assert_equal('literal;$(never-run)', s:export.literal)
  call assert_equal('00ff800d0a41', s:export.bytes)
  call assert_equal(384, s:export.mode)
  call assert_equal(448, s:export.directoryMode)
  call assert_false(s:export.tty)
  call assert_equal(history_window, win_getid(), 'graphical handler does not change editor focus')
  WebexAttachment 2
  call WaitFor('!wbx#attachments#busy() && !filereadable(s:export.path)')
  call assert_false(isdirectory(fnamemodify(s:export.path, ':h')))
  let handlers = deepcopy(g:wbx_tui.attachment_handlers)
  let handlers['.pdf'] = {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.terminal.json', 'extension-wins'], 'terminal': v:true}
  call s:setup({'attachment_handlers': handlers})
  WebexAttachment 2
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".terminal.json")')
  let s:export = json_decode(readfile($WBX_EDITOR_RESULT . '.terminal.json')[0])
  call assert_equal('extension-wins', s:export.literal)
  call assert_true(s:export.tty)
  call assert_equal('terminal', &buftype)
  call assert_true(exists('b:wbx_attachment_terminal'), 'handler cleanup is bound to the actual native terminal buffer')
  call assert_equal('wipe', &l:bufhidden)
  call assert_false(&swapfile || &undofile || &modeline)
  call assert_true(wbx#attachments#busy() && filereadable(s:export.path), 'native terminal creation retains its handler admission and private file')
  bwipeout!
  call WaitFor('!wbx#attachments#busy() && !filereadable(s:export.path)')
  call win_gotoid(history_window)
  " An explicit empty extension opts out of a matching MIME handler.
  let handlers['.pdf'] = {}
  call s:setup({'attachment_handlers': handlers})
  WebexAttachment 2
  sleep 180m
  call assert_false(wbx#attachments#busy())
  call assert_equal(history, bufnr('%'))
  call s:setup({'attachment_handlers': {}})
  " The same binding dispatches a raster to the existing native image viewer,
  " even with inline previews disabled and unrelated file handlers configured.
  call s:attachment_menu(3)
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(repeat('c', 64), b:wbx_view_image.id)
  call assert_equal(240, b:wbx_view_image.width)
  " Remove the clean snapshot so the next open exercises a late raster RPC,
  " rather than the existing no-refetch cache path.
  bwipeout!
  call win_gotoid(history_window)
  WebexAttachment 3
  sleep 110m
  call wbx#compose()
  sleep 140m
  call assert_equal(draft, bufnr('%'), 'the native image handoff cannot steal focus after leaving its original attachment')
  call win_gotoid(history_window)
  call s:setup({'attachment_handlers': {'.png': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.png.json', 'png-handler']}}})
  let before = count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.imageOpen')
  call s:attachment_menu(3)
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".png.json")')
  let s:export = json_decode(readfile($WBX_EDITOR_RESULT . '.png.json')[0])
  call assert_equal('png-handler', s:export.literal)
  call assert_equal('89504e470d0a1a0a', strpart(s:export.bytes, 0, 16))
  call assert_equal(history_window, win_getid())
  call assert_equal(before, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.imageOpen'), 'a configured image file handler takes precedence over native rendering')
  call WaitFor('!wbx#attachments#busy() && !filereadable(s:export.path)')
  let g:wbx_tui.attachment_handlers = {}
  call wbx#rpc('test.imagesReady', {})
  call WaitFor('get(get(wbx#state().messages[0], "images", [{}])[0], "state", "") ==# "ready"')
  let before = count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.attachmentOpen')
  call s:attachment_menu(3)
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(before, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.attachmentOpen'), 'already identified images retain the direct native image-read path')
  call win_gotoid(history_window)
  let before = count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.imageOpen')
  call s:attachment_menu(3)
  call WaitFor('get(b:, "wbx_kind", "") ==# "image"')
  call assert_equal(before, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.imageOpen'), 'general opening preserves the native image snapshot cache')
  call win_gotoid(history_window)
  let download_dir = $WBX_EDITOR_RESULT . '.downloads'
  call mkdir(download_dir, '', 0700)
  call s:setup({'attachment_download_dir': download_dir})
  call assert_equal(download_dir, get(g:wbx_tui, 'attachment_download_dir', ''), 'Lua forwards the destination prompt default')
  call timer_start(250, function('s:accept_default'))
  WebexAttachmentDownload 2
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".downloads/report.pdf") && !wbx#attachments#busy()')
  call assert_equal(download_dir . '/report.pdf', g:wbx_download_default)
  call assert_equal(6, getfsize(download_dir . '/report.pdf'))
  call s:setup({'attachment_download_dir': []})
  WebexAttachmentDownload 2
  sleep 180m
  call assert_false(wbx#attachments#busy(), 'invalid Lua directory fails closed without prompting')
  call s:setup({'attachment_download_dir': download_dir})
  let saved = $WBX_EDITOR_RESULT . '.saved.pdf'
  call timer_start(250, function('s:answer', [saved]))
  WebexAttachmentDownload 2
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".saved.pdf") && !wbx#attachments#busy()')
  call assert_equal('rw-------', getfperm(saved))
  call assert_equal(history_window, win_getid())
  call assert_equal(6, getfsize(saved))
  call assert_equal('A', readfile(saved, 'b')[-1], 'download keeps original binary bytes rather than a text conversion')
  call timer_start(250, function('s:answer', [saved]))
  WebexAttachmentDownload 1
  sleep 450m
  call assert_equal(6, getfsize(saved), 'existing download cannot be overwritten by another attachment')
  call timer_start(250, function('s:answer', ['']))
  WebexAttachmentDownload 1
  sleep 400m
  call assert_false(wbx#attachments#busy(), 'clearing the destination cancels download')
  let g:wbx_tui.attachment_handlers = {}
  augroup wbx_attachment_test_hook
    autocmd!
    autocmd FileType python call setline(1, 'FileType annotation')
  augroup END
  WebexAttachment 1
  call WaitFor('exists("b:wbx_attachment")')
  call assert_equal('FileType annotation', getline(1), 'filetype hook annotations are not overwritten after opening')
  augroup wbx_attachment_test_hook
    autocmd!
  augroup END
  call assert_equal('User annotation', getbufline(text_buffer, 1)[0], 'each open is a separate buffer; edits are never replaced')
  call assert_equal(['Unsent attachment draft'], getbufline(draft, 1, '$'))
  call WaitFor('empty(glob($TMPDIR . "/wbx-attachment-*", 0, 1))')
  for invalid in [{'id': repeat('a', 64), 'url': 'https://evil/'}, {'id': 'bad'}]
    call assert_false(wbx#protocol#attachments([invalid]))
  endfor
  let valid = {'id': repeat('a', 64), 'name': 'hello.txt', 'mime': 'text/plain', 'size': 5, 'text': v:true, 'data': 'SGVsbG8='}
  call assert_true(wbx#protocol#opened_attachment(valid))
  for invalid in [extend(copy(valid), {'name': '../escape'}), extend(copy(valid), {'data': 'PRIVATE'}), extend(copy(valid), {'size': 6000001}), extend(copy(valid), {'path': '/etc/passwd'}), extend(copy(valid), {'text': 1})]
    call assert_false(wbx#protocol#opened_attachment(invalid))
  endfor
  let methods = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(1, count(methods, 'messages.attachmentMetadata'), 'repaints/opening never refetch loaded labels')
  call assert_equal(0, count(methods, 'messages.send'))
  call assert_equal(0, count(methods, 'rooms.read'))
  call assert_equal(0, count(methods, 'messages.images'))
  " Disconnect inside a new-window hook must prevent the terminal tool launch.
  call win_gotoid(history_window)
  let g:wbx_tui.attachment_handlers = {'.pdf': {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.blocked.json', 'blocked'], 'terminal': 1}}
  augroup wbx_attachment_test_hook
    autocmd!
    autocmd BufEnter * if empty(bufname('%')) | call wbx#disconnect() | endif
  augroup END
  WebexAttachment 2
  sleep 250m
  call assert_false(filereadable($WBX_EDITOR_RESULT . '.blocked.json'), 'a disconnect from a new-window hook revokes terminal launch')
  augroup wbx_attachment_test_hook
    autocmd!
  augroup END
  call WaitFor('empty(glob($TMPDIR . "/wbx-attachment-*", 0, 1))')
  call wbx#shutdown()
  let g:wbx_tui.backend = [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_RESULT . '.backend.mjs', 'legacy']
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  WebexSpaces
  call cursor(index(b:wbx_room_ids, 'room') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call cursor(b:wbx_message_blocks[0].body, 1)
  let before = count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.attachmentOpen')
  WebexAttachment 1
  sleep 120m
  call assert_equal(before, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.attachmentOpen'), 'older backends cannot guess a download transport')
  nnoremap <leader>Wo :let g:wbx_custom_open = 1<CR>
  call wbx#commands#setup()
  call assert_match('wbx_custom_open', maparg('<leader>Wo', 'n'), 'an explicit user open binding remains authoritative')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
