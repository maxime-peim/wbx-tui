" Public picker -> real selection/activation/RPC owners; inert transport, native popup/temporary provider UI.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:space_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:space_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:space_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:space_flow_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
call writefile(['function! fzf#wrap(spec) abort','return a:spec','endfunction',
      \ 'function! fzf#run(spec) abort','let g:space_flow_fzf=a:spec','throw "Synthetic optional fzf failure"','endfunction'],s:stub.'/autoload/fzf.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:space_flow_running=1 | let g:space_flow_requests=[]
let g:wbx_tui={'backend':['/bin/false'],'picker':'builtin','images':0,'notifications':0,'people_status':0,'read_status':1,
      \ 'mark_read_on_open':1,'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
if has('nvim')
lua << LUA
WBXSpaceMenus={}
vim.ui.select=function(items,opts,done)
  local origin=vim.api.nvim_get_current_win()
  local buf=vim.api.nvim_create_buf(false,true)
  vim.api.nvim_buf_set_lines(buf,0,-1,false,vim.tbl_map(function(item) return opts.format_item(item) end,items))
  local win=vim.api.nvim_open_win(buf,true,{relative='editor',width=60,height=#items,row=2,col=2,style='minimal'})
  WBXSpaceMenus[#WBXSpaceMenus+1]={items=items,done=done,win=win,origin=origin}
end
function WBXSpaceFinish(index)
  local menu=WBXSpaceMenus[#WBXSpaceMenus]
  menu.done(menu.items[index])
  if vim.api.nvim_win_is_valid(menu.win) then vim.api.nvim_win_close(menu.win,true) end
  vim.api.nvim_set_current_win(menu.origin)
end
LUA
endif
let s:checks=[] | let s:drawn=[] | let s:session='a' | let s:selected='A'
let s:rooms=[{'id':'A','title':'Duplicate','type':'group','unread':v:true},
      \ {'id':'B','title':'Duplicate','type':'direct','teamId':'team','unread':v:true},
      \ {'id':'C','title':'Third loaded space','type':'group','unread':v:true},
      \ {'id':'D','title':'Refreshed space','type':'group','unread':v:true}]
function! s:state() abort
  let room=empty(s:selected) ? v:null : deepcopy(filter(copy(s:rooms),'v:val.id==# s:selected')[0])
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'readStatus':'ready',
        \ 'rooms':deepcopy(s:rooms),'room':room,'messages':empty(s:selected) ? [] :
        \ [{'id':s:selected.'-root','author':'Synthetic','created':'2026-11-16T12:00:00Z','text':'Loaded picker history '.s:selected}],
        \ 'localContext':{'sessionId':repeat(s:session,32),'coverage':'session-only'}}
endfunction
function! s:publish(room) abort
  let s:selected=a:room
  let envelope={'jsonrpc':'2.0','method':'state','params':s:state()}
  call assert_true(wbx#protocol#valid(envelope))
  call wbx#_receive(envelope)
endfunction
function! s:requests(method) abort
  return filter(copy(g:space_flow_requests),'v:val.method==# a:method')
endfunction
function! s:wait(expression) abort
  let start=reltime()
  while !eval(a:expression) && reltimefloat(reltime(start))<2 | sleep 5m | endwhile
  if !eval(a:expression) | throw 'Timeout: '.a:expression | endif
endfunction
function! s:open() abort
  let s:before_menus=has('nvim') ? luaeval('#WBXSpaceMenus') : len(popup_list())
  WebexPickSpace
  if has('nvim')
    call s:wait('luaeval("#WBXSpaceMenus")>s:before_menus')
  else
    let s:popup=popup_list()[0]
  endif
endfunction
function! s:finish(choice) abort
  if has('nvim')
    call luaeval('WBXSpaceFinish(_A)',a:choice)
  elseif a:choice<=0
    call popup_close(s:popup,-1)
  else
    for n in range(1,a:choice-1) | call popup_filter_menu(s:popup,'j') | endfor
    call popup_filter_menu(s:popup,"\<CR>")
  endif
  sleep 15m
endfunction
function! s:pick(id) abort
  let ids=map(copy(s:rooms),'v:val.id')
  call s:open() | call s:finish(index(ids,a:id)+1)
endfunction
function! s:reply(request, ...) abort
  call wbx#_receive(extend({'jsonrpc':'2.0','id':a:request.id},a:0 ? {'error':{'code':-1,'message':'Synthetic picker selection failure'}} : {'result':v:null}))
endfunction
function! s:history(id) abort
  call assert_equal('wbx://history',bufname('%')) | call assert_equal(a:id,b:wbx_history_room)
  call assert_match('Loaded picker history '.a:id,join(getline(1,'$'),"\n"))
  call assert_equal([],s:requests('rooms.read'),'picker does not grant receipt consent even with marking enabled')
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_layout'),[])
  let hello={'version':1,'state':s:state(),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','local-context-v1','same-space-resume']}
  call assert_true(wbx#protocol#hello(hello))
  call call(function('<SNR>'.sid.'_hello'),[{'result':hello}])
  WebexSpaces
  call s:pick('B')
  let request=s:requests('rooms.select')[-1]
  call assert_equal({'roomId':'B'},request.params)
  call s:publish('B') | call s:reply(request) | call s:history('B')
  call add(s:checks,'ordinary public native picker opens exact duplicate-title destination through one correlated selection and real history activation without a receipt')

  WebexSpaces | let requests=len(g:space_flow_requests)
  call s:pick('B') | call s:history('B')
  call assert_equal(requests,len(g:space_flow_requests),'ready same-space picker return is local')
  WebexSpaces | let context=wbx#picker_context()
  let removed=remove(s:rooms,3) | call s:publish('B')
  call wbx#pick_select(context,'D')
  call assert_equal(requests,len(g:space_flow_requests),'unlisted target is not recovered by guessing')
  call add(s:rooms,removed) | call s:publish('B')
  call s:pick('D') | let request=s:requests('rooms.select')[-1]
  call assert_equal('D',request.params.roomId)
  call s:publish('D') | call s:reply(request) | call s:history('D')
  call add(s:checks,'same-space pick resumes promptly without fetch/receipt; removed loaded target is not guessed and a new deliberate pick succeeds after authoritative refresh')

  WebexSpaces | call s:pick('C') | let failed=s:requests('rooms.select')[-1]
  call s:reply(failed,1)
  call assert_equal('wbx://spaces',bufname('%'))
  let requests=len(g:space_flow_requests) | sleep 25m
  call assert_equal(requests,len(g:space_flow_requests),'no automatic selection retry')
  call s:pick('C') | let current=s:requests('rooms.select')[-1]
  call assert_true(current.id>failed.id)
  call s:reply(failed,1)
  call s:publish('C') | call s:reply(current) | call s:history('C')
  call add(s:checks,'failed selection keeps origin; explicit new picker request recovers and duplicate old errors cannot consume its focus handoff')

  enew | file picker-independent.txt | call setline(1,'Independent picker origin') | call feedkeys("i\<Esc>",'xt')
  let old=wbx#picker_context() | let newer=wbx#picker_context() | let requests=len(g:space_flow_requests)
  call wbx#pick_select(old,'A')
  call wbx#picker_cancel(newer) | call wbx#pick_select(newer,'A')
  let context=wbx#picker_context() | call setline(1,'Newer native picker work') | call feedkeys("i\<Esc>",'xt')
  let native=s:native() | call wbx#pick_select(context,'A')
  call assert_equal(requests,len(g:space_flow_requests)) | call assert_equal(native,s:native())
  let context=wbx#picker_context()
  call filter(s:rooms,'v:val.id!=# "A"') | call s:publish('C')
  call wbx#pick_select(context,'A')
  call assert_equal(requests,len(g:space_flow_requests)) | call assert_equal(native,s:native())
  call insert(s:rooms,{'id':'A','title':'Duplicate','type':'group','unread':v:true},0) | call s:publish('C')
  call add(s:checks,'newer/canceled choices, native edits and removed loaded identities cannot replay or substitute targets and preserve independent native text/full undo/focus')

  let context=wbx#picker_context() | let s:session='b' | call s:publish('C')
  call wbx#pick_select(context,'B') | call assert_equal(requests,len(g:space_flow_requests))
  call s:pick('B') | let old=s:requests('rooms.select')[-1]
  let native=s:native() | let s:session='c' | call s:publish('B')
  call s:reply(old)
  call assert_equal(native,s:native(),'retired request ACK cannot open replacement-session history')
  call s:pick('A') | let current=s:requests('rooms.select')[-1]
  call assert_true(current.id>old.id)
  call s:reply(old) | call s:publish('A') | call s:reply(current) | call s:history('A')
  call add(s:checks,'existing native context fences pre-choice session replacement; selection captures session for post-dispatch ACKs and fresh explicit new-session pick-to-open succeeds')

  WebexSpaces
  if has('nvim')
    lua package.loaded['fzf-lua']={fzf_exec=function(choices,opts) WBXStaleSpaceFzf={choices=choices,done=opts.actions.default}; error('Synthetic optional fzf-lua failure') end}
    let g:wbx_tui.picker='fzf-lua'
  else
    let g:wbx_tui.picker='fzf'
  endif
  let requests=len(g:space_flow_requests)
  call s:open()
  if has('nvim')
    lua WBXStaleSpaceFzf.done({WBXStaleSpaceFzf.choices[2]})
  else
    call call(g:space_flow_fzf.sink,[g:space_flow_fzf.source[1]])
  endif
  sleep 15m | call assert_equal(requests,len(g:space_flow_requests),'failed optional provider loses its old context before fallback')
  call s:finish(index(map(copy(s:rooms),'v:val.id'),'C')+1)
  let current=s:requests('rooms.select')[-1] | call assert_equal('C',current.params.roomId)
  call s:publish('C') | call s:reply(current) | call s:history('C')
  call add(s:checks,'partial optional-provider failure falls back to a fresh native picker; a late failed-provider callback cannot race or duplicate the successful fallback selection')
  call assert_equal([],filter(copy(g:space_flow_requests),'v:val.method!=# "rooms.select"'))
  if $WBX_EDITOR_SCREEN==# '1'
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Loaded picker history C',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Loaded picker history C"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:space_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'selectRequests':len(s:requests('rooms.select')),
      \ 'methods':map(copy(g:space_flow_requests),'v:val.method'),
      \ 'scope':'public picker and actual native selection/activation/RPC/view owners; inert transport, real Vim popup and synthetic Neovim provider UI; optional fzf contract doubles only'})],$WBX_EDITOR_RESULT)
qa!
