" Loaded-space owner with real native intent; inert application selection/provider effects.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload','p')
call writefile(['function! wbx#state() abort','return deepcopy(g:space_owner_state)','endfunction',
      \ 'function! wbx#context_epoch() abort','return g:space_owner_epoch','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:space_owner_state={'state':'ready','ready':1,'room':v:null,'localContext':{'sessionId':repeat('a',32)}}
let g:space_owner_epoch=1
let s:checks=[] | let s:drawn=[] | let s:selections=[] | let s:notices=[] | let s:disconnected=0
let g:space_owner_state.rooms=[
      \ {'id':'private-one','title':'Duplicate','type':'direct'},
      \ {'id':'private-two','title':'Duplicate','type':'direct'},
      \ {'id':'private-cached','title':'Duplicate','type':'group','teamId':'team','cached':v:true}]
function! s:state() abort
  return g:space_owner_state
endfunction
function! s:options() abort
  return {'picker':'builtin'}
endfunction
function! s:disconnected() abort
  return s:disconnected
endfunction
function! s:select(id, focus, read) abort
  call add(s:selections,[a:id,a:focus,a:read])
endfunction
function! s:notice(text) abort
  call add(s:notices,a:text)
endfunction
function! s:context() abort
  return wbx#space_picker#context(s:owner)
endfunction
function! s:choose(context, id) abort
  call wbx#space_picker#select(s:owner,a:context,a:id)
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
function! s:drain() abort
  let start=reltime()
  while !empty(filter(timer_info(),'string(v:val.callback) =~# "<SNR>".s:picker_sid."_picked_space"')) && reltimefloat(reltime(start))<1
    sleep 5m
  endwhile
  call assert_equal([],filter(timer_info(),'string(v:val.callback) =~# "<SNR>".s:picker_sid."_picked_space"'))
endfunction
try
  enew | file space-picker-native.txt | call setline(1,'Native loaded-space picker work') | call feedkeys("i\<Esc>",'xt')
  let cpo=&cpoptions | let native=s:native()
  let s:owner=wbx#space_picker#new({'State':function('s:state'),'Options':function('s:options'),
        \ 'Disconnected':function('s:disconnected'),'Select':function('s:select'),'Notify':function('s:notice')})
  let s:picker_sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/space_picker.vim$"')[0].sid
  call assert_equal(cpo,&cpoptions) | call assert_equal(['ports','serial'],sort(keys(s:owner)))
  let context=s:context()
  call assert_equal(['Duplicate · direct · choice 1/2','Duplicate · direct · choice 2/2',
        \ 'Duplicate · group · Team space · cached/browse-only'],map(copy(context.rooms),'v:val.label'))
  call assert_equal(0,has_key(g:space_owner_state.rooms[0],'label'))
  let context.rooms[0].title='Detached caller mutation'
  call assert_equal('Duplicate',g:space_owner_state.rooms[0].title)
  for room in context.rooms | call assert_notmatch(room.id,room.label) | endfor
  call assert_equal(native,s:native()) | call assert_equal([],s:selections)
  call add(s:checks,'construction/capture are inert and detached; duplicate/type/team/cache labels distinguish loaded choices without exposing IDs or mutating application rooms')

  let context=s:context()
  call reverse(g:space_owner_state.rooms)
  let g:space_owner_state.rooms[1].title='New title does not change identity'
  call s:choose(context,'private-two')
  call assert_equal([['private-two',1,0]],s:selections)
  call s:choose(context,'private-two') | call assert_equal(1,len(s:selections))
  call assert_equal(native,s:native())
  call add(s:checks,'choice resolves its captured exact ID after current reordering/renaming and dispatches one focus request with receipt consent explicitly false')

  let old=s:context() | let current=s:context()
  call s:choose(old,'private-one') | call assert_equal(1,len(s:selections))
  call wbx#space_picker#cancel(s:owner,old)
  call s:choose(current,'private-one') | call assert_equal(2,len(s:selections),'old cancel cannot retire newer context')
  let canceled=s:context() | call wbx#space_picker#cancel(s:owner,canceled)
  call s:choose(canceled,'private-one') | call assert_equal(2,len(s:selections))
  let context=s:context() | call s:choose(context,'invented')
  call s:choose(context,'private-one') | call assert_equal(2,len(s:selections),'invalid choice consumes only its picker lifetime')
  let context=s:context() | let rooms=deepcopy(g:space_owner_state.rooms)
  call filter(g:space_owner_state.rooms,'v:val.id!=# "private-one"')
  call s:choose(context,'private-one') | call assert_equal(2,len(s:selections))
  let g:space_owner_state.rooms=rooms
  call add(s:checks,'newer/canceled/consumed contexts never replay; IDs must exist in captured and current loaded sets, and an old cancel cannot consume a newer choice')

  for guard in ['text','name','type','session','room','ready','state','epoch','disconnected','window']
    let state=deepcopy(g:space_owner_state) | let context=s:context() | let selections=len(s:selections)
    if guard==# 'text' | call setline(1,'Changed native origin') | endif
    if guard==# 'name' | file space-picker-renamed.txt | endif
    if guard==# 'type' | setlocal buftype=nofile | endif
    if guard==# 'session' | let g:space_owner_state.localContext.sessionId=repeat('b',32) | endif
    if guard==# 'room' | let g:space_owner_state.room={'id':'elsewhere'} | endif
    if guard==# 'ready' | let g:space_owner_state.ready=0 | endif
    if guard==# 'state' | let g:space_owner_state.state='failed' | endif
    if guard==# 'epoch' | let g:space_owner_epoch+=1 | endif
    if guard==# 'disconnected' | let s:disconnected=1 | endif
    if guard==# 'window' | split | endif
    let before=s:native()
    call s:choose(context,'private-one')
    call assert_equal(selections,len(s:selections),guard) | call assert_equal(before,s:native(),guard)
    if guard==# 'window' | close | endif
    let g:space_owner_state=state | let s:disconnected=0
    setlocal buftype=
    file space-picker-native.txt
    call setline(1,'Native loaded-space picker work')
  endfor
  call add(s:checks,'native buffer/window/text/name/type/session/selection/readiness/epoch and connection guards reject stale provider work without editing or refocusing native work')

  let context=s:context() | let selections=len(s:selections)
  let id=context.rooms[1].id
  call call(function('<SNR>'.s:picker_sid.'_fzf_space'),[s:owner,context,'000002  Display labels are not IDs'])
  call assert_equal(selections,len(s:selections),'provider callbacks defer until its UI can close')
  call s:drain()
  call assert_equal([id,1,0],s:selections[-1])
  let context=s:context() | let selections=len(s:selections)
  call call(function('<SNR>'.s:picker_sid.'_fzf_space'),[s:owner,context,'000001  Late callback'])
  call wbx#space_picker#cancel(s:owner,context)
  call s:drain() | call assert_equal(selections,len(s:selections))
  call assert_equal(['ports','serial'],sort(keys(s:owner)))
  call add(s:checks,'numeric fzf rows map only into captured choices; zero-delay provider handoff rechecks context and cancellation rather than queuing selection retries')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Native loaded-space picker work',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Native loaded-space picker work"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'actual native intent and moved picker policy; inert application selection/provider effects, no RPC/service'})],$WBX_EDITOR_RESULT)
qa!
