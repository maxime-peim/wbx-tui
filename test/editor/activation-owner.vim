" Activation/receipt owner with inert effects; real native buffers and visibility.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:events=[] | let s:notices=[]
let s:setup_mode='' | let s:render_mode='' | let s:refuse=0
let s:options={'mark_read_on_open':1,'read_status':1}
function! s:state() abort
  return s:state
endfunction
function! s:options() abort
  return s:options
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:request(method, params, Callback) abort
  call add(s:requests,{'method':a:method,'params':copy(a:params),'Callback':a:Callback})
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:setup() abort
  call add(s:events,'setup')
  if s:setup_mode==# 'redirect' | execute 'buffer '.s:foreign | endif
  if s:setup_mode==# 'promote' | setlocal buftype= | endif
  if s:setup_mode==# 'annotate' | call setline(1,'Retained history annotation') | endif
  if s:setup_mode==# 'wrong-room' | let b:wbx_history_room='other' | endif
  if s:setup_mode==# 'error' | throw 'Synthetic setup failure' | endif
endfunction
function! s:render() abort
  call add(s:events,'render')
  let buffer=wbx#workspace#id(s:workspace,'history')
  call setbufline(buffer,1,['Synthetic history','First body','','Newest visible endpoint',''])
  call setbufvar(buffer,'wbx_history_room','A')
  call setbufvar(buffer,'wbx_history_complete',1)
  call setbufvar(buffer,'wbx_message_blocks',[{'id':'first','start':1,'body':2,'end':3},{'id':'last','start':4,'body':4,'end':5}])
  call setbufvar(buffer,'wbx_render_tick',getbufvar(buffer,'changedtick'))
  if s:render_mode==# 'replace'
    " Replace the dictionary, not just mutate the previously returned object.
    let s:state=deepcopy(s:state) | let s:state.room={'id':'other'}
  endif
endfunction
function! s:fresh() abort
  let s:state={'room':{'id':'A'},'rooms':[{'id':'A','unread':v:true}], 'messages':[{'id':'first'},{'id':'last'}],
        \ 'ready':1,'loading':0,'historyLatest':1,'readStatus':'ready'}
endfunction
function! s:new() abort
  return wbx#history_activation#new(s:workspace,{'State':function('s:state'),'Options':function('s:options'),
        \ 'Setup':function('s:setup'),'Render':function('s:render'),'Notify':function('s:notify'),'Request':function('s:request')})
endfunction
function! s:finish(index, ...) abort
  call call(s:requests[a:index].Callback,[a:0 ? {'error':{'code':-1,'message':'Synthetic unknown receipt'}} : {'result':v:null}])
endfunction
function! s:visible() abort
  return has('nvim') || $WBX_EDITOR_SCREEN==# '1'
endfunction
try
  enew | file activation-independent.txt | call setline(1,'Independent activation foreground')
  let s:foreign=bufnr('%')
  let s:workspace=wbx#workspace#new({})
  call s:fresh()
  let cpo=&cpoptions | let owner=s:new() | call assert_equal(cpo,&cpoptions)
  call wbx#history_activation#open(owner,{'id':'A','unread':1,'allow_read':1})
  let history=bufnr('%')
  call assert_equal(wbx#workspace#id(s:workspace,'history'),history)
  call assert_equal(['render','setup','render'],s:events,'ensure/render precedes show/setup and accepted activation render')
  call assert_equal(s:visible() ? 1 : 0,len(s:requests))
  if s:visible()
    call assert_equal({'roomId':'A','messageId':'last'},s:requests[-1].params)
    call s:finish(len(s:requests)-1,1)
  endif
  call add(s:checks,'ordinary activation ensures/renders/setup in order and admits only the exact physically visible endpoint')
  normal! gg
  let cursor=getcurpos() | let requests=len(s:requests)
  call wbx#history_activation#open(owner,{'id':'A','resume':1,'allow_read':0})
  call assert_equal(cursor,getcurpos()) | call assert_equal(requests,len(s:requests))
  call add(s:checks,'local resume preserves cursor and has no new automatic receipt consent')

  for mode in ['redirect','promote','annotate','wrong-room']
    execute 'buffer '.history
    setlocal buftype=nofile
    call s:render()
    let s:setup_mode=mode | let s:events=[] | let requests=len(s:requests)
    call wbx#history_activation#open(s:new(),{'id':'A','unread':1})
    call assert_equal(['setup'],s:events,mode.': setup effects must be rechecked before local-open/render/receipt effects')
    call assert_equal(requests,len(s:requests),mode)
    if mode==# 'redirect' | call assert_equal(s:foreign,bufnr('%')) | endif
    if mode==# 'annotate' | call assert_equal('Retained history annotation',getline(1)) | endif
  endfor
  let s:setup_mode='' | execute 'buffer '.history | setlocal buftype=nofile | call s:render()
  let s:render_mode='replace' | let requests=len(s:requests)
  call wbx#history_activation#open(s:new(),{'id':'A','unread':1})
  call assert_equal(requests,len(s:requests),'receipt uses application state after rendering, never the captured pre-render dictionary')
  let s:render_mode='' | call s:fresh()
  call add(s:checks,'setup redirection/promotion/annotation/identity and post-render state replacement cannot authorize receipts')

  for guard in ['no-consent','mark-off','read-off','source-failed','wrong-selected','not-ready','loading','empty','old-history','selected-stale','listed-stale','listed-read','unlisted','known-newer']
    call s:fresh() | call s:render() | let owner=s:new() | let request={'id':'A','unread':1,'allow_read':1}
    if guard==# 'no-consent' | let request.allow_read=0 | endif
    if guard==# 'mark-off' | let s:options.mark_read_on_open=0 | endif
    if guard==# 'read-off' | let s:options.read_status=0 | endif
    if guard==# 'source-failed' | let s:state.readStatus='failed' | endif
    if guard==# 'wrong-selected' | let s:state.room={'id':'other'} | endif
    if guard==# 'not-ready' | let s:state.ready=0 | endif
    if guard==# 'loading' | let s:state.loading=1 | endif
    if guard==# 'empty' | let s:state.messages=[] | endif
    if guard==# 'old-history' | let s:state.historyLatest=0 | endif
    if guard==# 'selected-stale' | let s:state.room.unreadStale=1 | endif
    if guard==# 'listed-stale' | let s:state.rooms[0].unreadStale=1 | endif
    if guard==# 'listed-read' | let s:state.rooms[0].unread=v:false | endif
    if guard==# 'unlisted' | let s:state.rooms=[] | endif
    if guard==# 'known-newer' | let owner.latest.A='newer' | endif
    let requests=len(s:requests)
    call wbx#history_activation#open(owner,request)
    call assert_equal(requests,len(s:requests),guard)
    let s:options={'mark_read_on_open':1,'read_status':1}
  endfor
  call s:fresh() | call s:render() | let owner=s:new()
  normal! Gzb
  let b:wbx_history_complete=0 | call assert_false(wbx#history_activation#newest(owner))
  let b:wbx_history_complete=1
  setlocal foldmethod=manual
  4,5fold
  call assert_false(wbx#history_activation#newest(owner),'a closed endpoint fold never grants receipt visibility')
  normal! zE
  call add(s:checks,'automatic consent/options/source/selected/listed/readiness/latest/completeness/fold guards remain independent')

  let owner=s:new() | let start=len(s:requests)
  call wbx#history_activation#read(owner,'A','last',1)
  call wbx#history_activation#read(owner,'B','other',0)
  call assert_equal(start+1,len(s:requests),'one physical pending receipt')
  call s:finish(start,1)
  call wbx#history_activation#read(owner,'A','last',1) | call assert_equal(start+1,len(s:requests),'failed endpoint is not automatically retried')
  call wbx#history_activation#read(owner,'A','last',0) | call assert_equal(start+2,len(s:requests),'manual retry is explicit recovery')
  call s:finish(start+1)
  call assert_equal('last',owner.attempts.A,'successful ACK also awaits authoritative read state')
  for evidence in ['failed','stale','unknown','missing']
    let state={'readStatus':evidence==# 'failed' ? 'failed' : 'ready','rooms':[{'id':'A','unread':v:false}]}
    if evidence==# 'stale' | let state.rooms[0].unreadStale=1 | endif
    if evidence==# 'unknown' | let state.rooms[0].unread=v:null | endif
    if evidence==# 'missing' | let state.rooms=[] | endif
    call wbx#history_activation#observe(owner,state) | call assert_true(has_key(owner.attempts,'A'),evidence)
  endfor
  call wbx#history_activation#observe(owner,{'readStatus':'ready','rooms':[{'id':'A','unread':v:false}]})
  call assert_false(has_key(owner.attempts,'A'))
  call wbx#history_activation#read(owner,'A','last',1) | call assert_equal(start+3,len(s:requests))
  call wbx#history_activation#lost(owner)
  call wbx#history_activation#read(owner,'B','other',1)
  let pending=copy(owner.pending) | call s:finish(start+2)
  call assert_equal(pending,owner.pending,'late different-endpoint callback cannot release replacement admission')
  call s:finish(start+3)
  call assert_equal('last',owner.attempts.A,'transport loss retains attempt evidence')
  call add(s:checks,'failed/unknown and ACK attempts persist until fresh authoritative read; manual recovery and matching completion keep one pending admission')

  let s:refuse=1 | let owner=s:new()
  call wbx#history_activation#read(owner,'refused','endpoint',1)
  call assert_equal({},owner.pending) | call assert_equal('endpoint',owner.attempts.refused)
  let requests=len(s:requests) | let s:refuse=0
  call wbx#history_activation#read(owner,'refused','endpoint',1) | call assert_equal(requests,len(s:requests))
  let owner=s:new()
  for number in range(500)
    call wbx#history_activation#observe(owner,{'room':{'id':string(number)},'messages':[{'id':'newest'}]})
    call wbx#history_activation#read(owner,string(number),'endpoint',1)
    call s:finish(len(s:requests)-1)
  endfor
  let requests=len(s:requests)
  call wbx#history_activation#observe(owner,{'room':{'id':'overflow'},'messages':[{'id':'newest'}]})
  call assert_equal(500,len(owner.latest))
  call assert_equal(500,len(owner.attempts))
  call wbx#history_activation#observe(owner,{'room':{'id':'1'},'messages':[{'id':'older'}],'historyLatest':0})
  call assert_equal('newest',owner.latest['1'])
  call wbx#history_activation#read(owner,'overflow','endpoint',1) | call assert_equal(requests,len(s:requests))
  call wbx#history_activation#read(owner,'overflow','endpoint',0) | call assert_equal(requests+1,len(s:requests))
  call assert_equal(500,len(owner.attempts),'manual recovery need not evict another retained automatic attempt')
  call add(s:checks,'refused dispatch retains attempts; known latest and automatic attempt capacity preserve conservative bounded admission')

  let s:setup_mode='error' | let failed=0
  try | call wbx#history_activation#open(s:new(),{'id':'A'}) | catch /Synthetic setup failure/ | let failed=1 | endtry
  call assert_equal(1,failed,'unrelated errors keep the existing contract rather than being swallowed')
  " A promoted reserved name is retained and reported, never adopted or erased.
  execute 'buffer '.history
  setlocal buftype=
  let before=[getline(1,'$'),undotree(),b:changedtick,winsaveview()]
  call wbx#history_activation#open(s:new(),{'id':'A'})
  call assert_match('occupied by other work',s:notices[-1])
  call assert_equal(before,[getline(1,'$'),undotree(),b:changedtick,winsaveview()])
  setlocal buftype=nofile
  call assert_equal([],filter(getscriptinfo(),'v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx.vim" || v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx/transport.vim"'))
  if $WBX_EDITOR_SCREEN==# '1'
    let s:setup_mode='' | call s:render() | redraw!
    let row=screenpos(win_getid(),4,1).row | let col=getwininfo(win_getid())[0].wincol
    let text=join(map(range(col,col+winwidth(0)-1),'screenstring(row,v:val)'),'')
    call assert_match('Newest visible endpoint',text) | call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(s:requests),
      \ 'scope':'inert application state/setup/render/request effects; real native ownership/endpoint visibility; no application/backend'})],$WBX_EDITOR_RESULT)
qa!
