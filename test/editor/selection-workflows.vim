" Actual public selection, rendering and receipt guards; only transport is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:selection_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:selection_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:selection_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:selection_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:selection_running=0 | let g:selection_writes=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'people_status':0,'notifications':0,'read_status':1,
      \ 'persist_drafts':0,'spaces_cache':0,'upcoming_meetings':0,'mark_read_on_open':1,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:timings=[]
let s:rooms=map(['A','B','C','D'],'{"id":v:val,"title":"Selection ".v:val,"type":"group","unread":v:true}')
function! s:requests(method) abort
  return filter(copy(g:selection_writes),'v:val.method ==# a:method')
endfunction
function! s:receipts(number) abort
  " Plain Vim ex-mode cannot certify screen visibility; positive receipt
  " acceptance is required in its drawn run, as in the existing reading suite.
  return has('nvim') || $WBX_EDITOR_SCREEN==# '1' ? a:number : 0
endfunction
function! s:reply(id, ...) abort
  call wbx#_receive(extend({'jsonrpc':'2.0','id':a:id},a:0 ? {'error':{'code':-1,'message':'Synthetic selection failure'}} : {'result':v:null}))
endfunction
function! s:publish(room, ready, loading, ...) abort
  let phase=a:0 ? a:1 : 'ready'
  let state={'revision':wbx#state().revision+1,'state':phase,'mode':'demo','readStatus':'ready',
        \ 'ready':a:ready ? v:true : v:false,'loading':a:loading ? v:true : v:false,'rooms':s:rooms,
        \ 'room':empty(a:room) ? v:null : copy(s:rooms[index(['A','B','C','D'],a:room)]),
        \ 'messages':empty(a:room) || !a:ready ? [] : map(range(1,3),'{"id":a:room."-".v:val,"author":"Synthetic","created":"","text":"Selection ".a:room." body ".v:val}')}
  let envelope={'jsonrpc':'2.0','method':'state','params':state}
  call assert_true(wbx#protocol#valid(envelope))
  call wbx#_receive(envelope)
endfunction
function! s:enter(room) abort
  WebexSpaces
  call cursor(index(b:wbx_room_ids,a:room)+1,1)
  call feedkeys("\<CR>",'xt')
endfunction
function! s:probe() abort
  return [bufnr('%'),getline(1,'$'),undotree(),b:changedtick,winsaveview(),getcurpos()]
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
  WebexDemo
  call wbx#_receive({'jsonrpc':'2.0','id':g:selection_writes[0].id,'result':{'version':1,
        \ 'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','same-space-resume']}})
  call s:reply(g:selection_writes[-1].id)
  call s:publish('',0,0)
  let buffers=wbx#buffers()
  call s:enter('A')
  let first=g:selection_writes[-1] | call assert_equal('rooms.select',first.method)
  call s:publish('A',0,1)
  call s:enter('A')
  call assert_equal(1,len(s:requests('rooms.select')),'duplicate Enter while loading preserves the original request')
  call s:publish('A',1,0) | call s:reply(first.id)
  call assert_equal(buffers.history,bufnr('%'))
  call assert_equal('A',b:wbx_history_room)
  let receipts=s:requests('rooms.read')
  call assert_equal(s:receipts(1),len(receipts),'ordinary explicit open acknowledges only after complete fresh visible history')
  if s:receipts(1)
    call assert_equal({'roomId':'A','messageId':'A-3'},receipts[0].params)
    call s:reply(receipts[0].id)
  endif
  call add(s:checks,'ordinary Enter and duplicate loading complete one history open and one exact fresh newest-endpoint receipt')
  call s:draw('ordinary-enter','Selection A body 3')

  normal! gg
  let cursor=getcurpos()
  let request_count=len(g:selection_writes) | let started=reltime()
  call s:enter('A')
  call assert_equal(request_count,len(g:selection_writes),'same-space return is local, without select or receipt')
  call assert_equal(cursor,getcurpos(),'local resume does not jump the reader')
  call s:enter('B')
  let held=g:selection_writes[-1] | call assert_equal('B',held.params.roomId)
  let request_count=len(g:selection_writes)
  call s:enter('A')
  call assert_equal(request_count,len(g:selection_writes)) | call assert_equal(buffers.history,bufnr('%'))
  call assert_equal('A',b:wbx_history_room)
  call add(s:timings,{'case':'local A return while B held','ms':reltimefloat(reltime(started))*1000})
  call s:reply(held.id)
  call assert_equal(buffers.history,bufnr('%')) | call assert_equal('A',b:wbx_history_room)
  call assert_equal(s:receipts(1),len(s:requests('rooms.read')))
  call add(s:checks,'same-space and A-held-B-A returns do not wait, refetch, jump or acknowledge; late B cannot take focus')

  botright 5new | file selection-independent.txt
  call setline(1,'Independent selection foreground')
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced foreground work')
  let foreign=win_getid() | let native=s:probe()
  let id=wbx#select('C')
  call s:publish('C',1,0) | call s:reply(id)
  call assert_equal(foreign,win_getid()) | call assert_equal(native,s:probe())
  call assert_equal(s:receipts(1),len(s:requests('rooms.read')))
  call add(s:checks,'programmatic selection is focus-neutral and receipt-free while retaining foreign text/full unsynced undo')
  call s:draw('programmatic-selection','Independent selection foreground')

  call s:enter('B')
  let held=g:selection_writes[-1] | let roomswin=win_getid()
  call s:publish('B',0,1)
  call win_gotoid(foreign) | call win_gotoid(roomswin)
  call s:publish('B',1,0) | call s:reply(held.id)
  call assert_equal(roomswin,win_getid()) | call assert_equal(buffers.rooms,bufnr('%'))
  call assert_equal(s:receipts(1),len(s:requests('rooms.read')),'leaving and returning cancels automatic receipt as well as focus')
  call add(s:checks,'leave-and-return cancellation cannot be revived by a late response even in its original window')

  call s:enter('D')
  let failed=g:selection_writes[-1]
  call s:publish('D',0,0,'failed') | call s:reply(failed.id,1)
  call assert_equal(buffers.rooms,bufnr('%')) | call assert_equal(s:receipts(1),len(s:requests('rooms.read')))
  call s:enter('D')
  let retry=g:selection_writes[-1]
  call assert_true(retry.id>failed.id,'explicit retry has a new request and owner intent')
  call s:reply(failed.id,1)
  call s:publish('D',1,0) | call s:reply(retry.id)
  call assert_equal(buffers.history,bufnr('%')) | call assert_equal('D',b:wbx_history_room)
  let receipts=s:requests('rooms.read')
  call assert_equal(s:receipts(2),len(receipts))
  if s:receipts(2)
    call assert_equal({'roomId':'D','messageId':'D-3'},receipts[1].params)
    call s:reply(receipts[1].id)
  endif
  call add(s:checks,'failed open stays put; explicit retry recovers normally and an old error cannot consume its focus or exact receipt')
  call s:draw('explicit-recovery','Selection D body 3')

  call s:enter('B')
  let held=g:selection_writes[-1] | let roomswin=win_getid()
  WebexDisconnect
  call assert_equal('session.stop',g:selection_writes[-1].method)
  call s:reply(g:selection_writes[-1].id)
  call s:publish('',0,0,'idle')
  WebexDemo
  call assert_equal('session.start',g:selection_writes[-1].method)
  call s:reply(g:selection_writes[-1].id)
  call s:publish('B',1,0) | call s:reply(held.id)
  call assert_equal(roomswin,win_getid()) | call assert_equal(buffers.rooms,bufnr('%'))
  call assert_equal(s:receipts(2),len(s:requests('rooms.read')))
  call s:enter('B')
  call assert_equal(buffers.history,bufnr('%')) | call assert_equal('B',b:wbx_history_room)
  call assert_equal(s:receipts(2),len(s:requests('rooms.read')),'explicit ready resume after replacement is not fresh receipt consent')
  call add(s:checks,'disconnect and session replacement retire pending focus without discarding the ordinary ready return path')
  for request in g:selection_writes
    call assert_true(index(['hello','session.start','session.stop','rooms.select','rooms.read'],request.method)>=0,'navigation never sends or mutates')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:selection_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'timings':s:timings,'visible_receipt_evidence':s:receipts(1),
      \ 'requests':map(copy(g:selection_writes),'{"id":v:val.id,"method":v:val.method,"params":v:val.params}')})],$WBX_EDITOR_RESULT)
qa!
