" Public native opening, setup re-entry and recovery; only physical transport inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:setup_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:setup_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:setup_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:setup_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:setup_running=0 | let g:setup_writes=[] | let g:setup_key=0
let mapleader=',' | let maplocalleader=';'
let g:wbx_tui={'backend':['/bin/false'],'images':0,'people_status':0,'notifications':0,'read_status':0,
      \ 'persist_drafts':0,'spaces_cache':0,'upcoming_meetings':0,'mark_read_on_open':0,'folds':1}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:events=[]
function! s:filetype() abort
  let b:setup_hook_count=get(b:,'setup_hook_count',0)+1
  let b:setup_hook_options=[&l:wrap,&l:linebreak,&l:conceallevel,&l:foldmethod]
  if b:wbx_kind==# 'history'
    setlocal nowrap nolinebreak conceallevel=0 foldmethod=manual
    nnoremap <buffer> i :let g:setup_key=4<CR>
  elseif b:wbx_kind==# 'compose'
    nnoremap <buffer> <C-s> :let g:setup_key=1<CR>
    inoremap <buffer> <C-s> <C-o>:let g:setup_key=2<CR>
  elseif b:wbx_kind==# 'rooms'
    nnoremap <buffer> r :let g:setup_key=3<CR>
  endif
endfunction
augroup wbx_setup_workflow_hooks
  autocmd!
  autocmd FileType wbx-history,wbx-compose,wbx-rooms call s:filetype()
  autocmd User WbxBuffer call add(s:events,deepcopy(g:wbx_tui_event))
augroup END
function! s:reply() abort
  call wbx#_receive({'jsonrpc':'2.0','id':g:setup_writes[-1].id,'result':v:null})
endfunction
function! s:publish(phase) abort
  let room={'id':'A','title':'Setup A','type':'group'}
  let state={'revision':wbx#state().revision+1,'state':a:phase,'mode':'demo','ready':a:phase==# 'ready' ? v:true : v:false,
        \ 'room':room,'rooms':[room],'messages':[{'id':'A-1','author':'Synthetic','created':'','text':'Native setup workflow history'}]}
  call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}))
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
endfunction
function! s:probe() abort
  return [getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview()]
endfunction
function! s:draw(case, pattern) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  redraw!
  let info=getwininfo(win_getid())[0] | let rows=[]
  for row in range(info.winrow,info.winrow+info.height-1)
    call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
  endfor
  call assert_match(a:pattern,join(rows,"\n"))
  call add(s:drawn,{'case':a:case,'text':filter(rows,'v:val =~# a:pattern')})
endfunction
try
  let breakat=&breakat | let cpo=&cpoptions
  WebexDemo
  let buffers=wbx#buffers()
  call assert_match('setup_key=3',maparg('r','n'))
  call assert_false(empty(maparg('<CR>','n',0,1)))
  call wbx#_receive({'jsonrpc':'2.0','id':g:setup_writes[0].id,'result':{'version':1,
        \ 'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging']}})
  call s:reply() | call s:publish('ready')
  call cursor(index(b:wbx_room_ids,'A')+1,1)
  call feedkeys("\<CR>",'xt')
  call assert_equal(buffers.history,bufnr('%'),'real Enter activates the ready existing history')
  call assert_equal([1,1,2],b:setup_hook_options[:2])
  call assert_equal([0,0,0,'manual'],[&l:wrap,&l:linebreak,&l:conceallevel,&l:foldmethod])
  call assert_match('setup_key=4',maparg('i','n'))
  WebexCompose
  let draft=bufnr('%') | let draftwin=win_getid()
  call assert_equal(1,b:setup_hook_count)
  call assert_equal(0,b:setup_hook_options[2])
  call assert_match('setup_key=1',maparg('<C-s>','n'))
  call assert_match('setup_key=2',maparg('<C-s>','i'))
  call assert_equal(2,len(b:wbx_default_maps))
  call feedkeys("iNative setup draft\<CR>Second literal line\<Esc>",'xt')
  call feedkeys("\<C-s>",'xt') | call assert_equal(1,g:setup_key)
  call feedkeys("i\<C-s>\<Esc>",'xt') | call assert_equal(2,g:setup_key)
  call assert_equal(['Native setup draft','Second literal line'],getline(1,'$'))
  call add(s:checks,'public open/Enter/compose honors native FileType options and mappings; Enter and user Ctrl-S only edit native work')
  call s:draw('ordinary-composer','Native setup draft')

  nnoremap <buffer> ;s :let g:setup_later_mapping=1<CR>
  let override=maparg(';s','n',0,1)
  let maplocalleader=','
  setlocal number
  call feedkeys("\<Esc>",'xt') | call append(2,'Unsynced setup draft')
  let before=s:probe() | let event_count=len(s:events)
  for i in range(10) | call wbx#_setup_buffer() | call wbx#redraw() | endfor
  call assert_equal(before,s:probe())
  call assert_equal(override,maparg(';s','n',0,1))
  call assert_equal(1,b:setup_hook_count) | call assert_equal(event_count,len(s:events))
  call assert_equal(1,&l:number)
  call add(s:checks,'repeated public setup/redraw keeps full unsynced undo, later native options and user mapping replacements without repeating FileType')

  botright 5new | file setup-independent.txt
  call setline(1,'Independent setup foreground')
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced foreign edit')
  let foreignwin=win_getid() | let foreign=s:probe()
  let draft_tick=getbufvar(draft,'changedtick')
  call s:publish('failed') | call s:publish('ready')
  call assert_equal(foreignwin,win_getid()) | call assert_equal(foreign,s:probe())
  call assert_equal(draft_tick,getbufvar(draft,'changedtick'))
  call assert_equal(['Native setup draft','Second literal line','Unsynced setup draft'],getbufline(draft,1,'$'))
  WebexCompose
  call assert_equal(draftwin,win_getid()) | call assert_equal(1,b:setup_hook_count)
  call assert_equal(override,maparg(';s','n',0,1)) | call assert_equal(1,&l:number)
  let returned=s:probe()
  WebexDemo
  call s:reply()
  call assert_equal(draftwin,win_getid()) | call assert_equal(returned,s:probe())
  call add(s:checks,'failure/recovery and ordinary reopen/re-entry preserve draft text, setup state and user overrides without stealing foreign focus')

  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.promoted-draft.txt')
  setlocal buftype=
  call assert_false(exists('b:wbx_kind') || exists('b:wbx_initialized') || exists('b:wbx_default_maps'))
  call assert_equal({},wbx#destination())
  call assert_equal(override,maparg(';s','n',0,1))
  call assert_equal({},maparg(';R','n',0,1),'promotion removes original localleader defaults, not new user keys')
  call assert_match('setup_key=1',maparg('<C-s>','n'))
  call assert_match('setup_key=2',maparg('<C-s>','i'))
  write
  call assert_equal(getline(1,'$'),readfile(bufname('%')),'ordinary write saves only the promoted file')
  " Promotion removes virtual draft chrome. Let native screen geometry settle
  " before comparing the resulting ordinary-file view (including topfill).
  redraw!
  let promoted=bufnr('%') | let saved=s:probe() | let event_count=len(s:events)
  call wbx#_setup_buffer() | call s:publish('failed') | call s:publish('ready')
  call assert_equal(promoted,bufnr('%')) | call assert_equal(saved,s:probe())
  call assert_equal(event_count,len(s:events))
  call add(s:checks,'promotion releases only owned setup/maps; native write and later recovery retain the saved copy and user mappings')
  call s:draw('promoted-native-copy','Native setup draft')

  WebexCompose
  call assert_notequal(promoted,bufnr('%'))
  call assert_equal(1,b:setup_hook_count)
  call assert_equal('A',wbx#destination().id)
  call assert_equal([''],getline(1,'$'))
  call assert_equal(['Native setup draft','Second literal line','Unsynced setup draft'],getbufline(promoted,1,'$'))
  call assert_equal('WebexRemoveMember',filter(wbx#commands#bindings(),'v:val.lhs =~# "Wnr$"')[0].command)
  call assert_equal(breakat,&breakat) | call assert_equal(cpo,&cpoptions)
  for request in g:setup_writes
    call assert_true(index(['hello','session.start','rooms.select'],request.method)>=0,'setup/Enter/write never send, acknowledge or mutate')
  endfor
  call add(s:checks,'explicit compose after promotion creates a fresh owned buffer while preserving the copy, command family and global native options')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:setup_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'events':s:events,
      \ 'requests':map(copy(g:setup_writes),'{"id":v:val.id,"method":v:val.method}')})],$WBX_EDITOR_RESULT)
qa!
