" Real native coordinator + request owner; only transport bytes are inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:rpc_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:rpc_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:rpc_running=1','let g:rpc_starts+=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:rpc_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:rpc_running=0 | let g:rpc_starts=0 | let g:rpc_writes=[] | let g:rpc_answers=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:drawn=[] | let s:timings=[]
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:answer(tag, response) abort
  call add(g:rpc_answers,a:tag)
endfunction
function! s:reply(id, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:id,'result':deepcopy(a:value)})
endfunction
function! s:hello(request) abort
  let state={'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]}
  call s:reply(a:request.id,{'version':1,'state':state,'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging']})
endfunction
function! s:publish(room, ready) abort
  let rooms=[{'id':'A','title':'Space A','type':'group'},{'id':'B','title':'Space B','type':'group'}]
  let state={'revision':wbx#state().revision+1,'state':'ready','mode':'demo','ready':a:ready ? v:true : v:false,
        \ 'rooms':rooms,'room':rooms[a:room==# 'A' ? 0 : 1],
        \ 'messages':a:ready ? [{'id':'message-'.a:room,'author':'Synthetic','created':'2026-11-17T12:00:00Z','text':'Loaded '.a:room}] : []}
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
endfunction
function! s:draw(case) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  redraw!
  let row=screenpos(win_getid(),1,1).row | let info=getwininfo(win_getid())[0]
  let text=join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
  call assert_match('Independent native work',text)
  call add(s:drawn,{'case':a:case,'text':trim(text)})
endfunction
try
  call setline(1,'Cold native work') | call feedkeys("\<Esc>",'xt')
  let before=s:native()
  call assert_equal(-1,wbx#rpc('messages.reactions',{},function('s:answer',['cold']),'passive-reactions'))
  call assert_equal(0,g:rpc_starts) | call assert_equal([],g:rpc_writes)
  call assert_equal(before,s:native())
  WebexDemo
  call assert_equal(1,g:rpc_starts)
  call assert_equal(['hello'],map(copy(g:rpc_writes),'v:val.method'),'session.start waits for the held hello')
  let first_hello=g:rpc_writes[0]
  let queued=wbx#rpc('rooms.list',{},function('s:answer',['rooms']))
  let held=wbx#rpc('test.held',{},function('s:answer',['held']))
  call assert_equal(1,len(g:rpc_writes))
  botright 5new | file independent-rpc-work.txt
  call setline(1,'Independent native work') | call feedkeys("\<Esc>",'xt')
  call append(1,'Unsynced foreground work')
  call assert_equal(0,undotree().synced)
  let native=s:native()
  call s:hello(first_hello)
  call assert_equal(native,s:native(),'startup handshake and queue drain preserve unrelated full unsynced undo/focus')
  call assert_equal(['hello','session.start','rooms.list','test.held'],map(copy(g:rpc_writes),'v:val.method'))
  call s:reply(queued,v:null) | call s:reply(queued,v:null)
  call assert_equal(['rooms'],g:rpc_answers)
  call assert_equal(native,s:native())
  call s:draw('startup-FIFO-and-correlated-response')
  call add(s:checks,'cold passive refusal, held hello, single startup and FIFO drain')
  call add(s:checks,'duplicate/out-of-order response preserves foreground native work')

  call s:publish('A',1)
  call assert_equal(native,s:native())
  let request_b=wbx#select('B')
  call s:publish('B',0)
  let started=reltime()
  let request_a=wbx#select('A')
  call assert_true(request_a>request_b,'A request is admitted while B response is held')
  call s:publish('A',1) | call s:reply(request_a,v:null)
  call assert_equal('A',wbx#state().room.id)
  call assert_equal('Loaded A',wbx#state().messages[0].text)
  call assert_equal(native,s:native())
  call add(s:timings,{'case':'B held -> A ready','return_ms':reltimefloat(reltime(started))*1000,'B_still_held':1})
  call s:reply(request_b,v:null)
  call assert_equal('A',wbx#state().room.id,'late B acknowledgement does not select or infer state')
  call s:reply(held,v:null)
  call assert_equal(['rooms','held'],g:rpc_answers,'a slower unrelated callback still settles normally')
  call assert_equal(native,s:native())
  call add(s:checks,'held old-room response never blocks normal returning navigation')

  let lost=wbx#rpc('test.old-transport',{},function('s:answer',['old']))
  call wbx#transport#stop()
  call assert_equal(native,s:native(),'transport loss preserves native work')
  call assert_equal(-1,wbx#rpc('messages.reactionsBatch',{},function('s:answer',['passive']),'passive-reactions'))
  call assert_equal(1,g:rpc_starts,'passive work cannot reconnect')
  let before=len(g:rpc_writes)
  let current=wbx#rpc('test.new-transport',{},function('s:answer',['new']))
  call assert_equal(2,g:rpc_starts)
  call assert_true(current>lost)
  call assert_equal(before+1,len(g:rpc_writes),'reconnect sends only hello until accepted')
  let second_hello=g:rpc_writes[-1]
  call s:reply(lost,v:null)
  call assert_equal(['rooms','held'],g:rpc_answers,'late old-transport response cannot address new pending work')
  call s:hello(second_hello)
  call assert_equal('test.new-transport',g:rpc_writes[-1].method)
  call s:reply(current,v:null) | call s:reply(lost,v:null)
  call assert_equal(['rooms','held','new'],g:rpc_answers)
  call assert_equal(1,len(filter(copy(g:rpc_writes),'v:val.method ==# "test.old-transport"')),'lost requests are not replayed')
  call assert_equal(native,s:native(),'explicit reconnect and late replies preserve complete native state')
  call s:draw('explicit-reconnect-without-replay')
  silent let health=wbx#health()
  call assert_equal(0,health.rpc_requests.queued)
  call assert_equal(0,health.rpc_requests.pending)
  call assert_equal(current,health.rpc_requests.lastRequest)
  call add(s:checks,'explicit reconnect keeps IDs monotonic and discards no native work')
  for request in g:rpc_writes
    call assert_true(index(['hello','session.start','rooms.list','test.held','rooms.select','test.old-transport','test.new-transport'],request.method)>=0,
          \ 'workflow uses no send/mutation/provider/receipt operations')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:rpc_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'timings':s:timings,
      \ 'requests':map(copy(g:rpc_writes),'{"id":v:val.id,"method":v:val.method}'),'starts':g:rpc_starts})],$WBX_EDITOR_RESULT)
qa!
