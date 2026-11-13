" Real public workspace/connection/channel/actions; only physical transport is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:ws_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:ws_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:ws_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:ws_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:ws_running=0 | let g:ws_writes=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:drawn=[] | let s:timings=[]
function! WbxWorkspaceProbe() abort
  return {'buffer':bufnr('%'),'lines':getline(1,'$'),'undo':undotree(),'tick':b:changedtick,
        \ 'cursor':getcurpos(),'view':winsaveview(),'breakat':&breakat,'statusline':&l:statusline,
        \ 'folds':map(range(1,line('$')),'[foldclosed(v:val),foldclosedend(v:val)]')}
endfunction
function! s:capture(window) abort
  call win_execute(a:window,'let w:ws_probe=WbxWorkspaceProbe()')
  return deepcopy(wbx#view#window_var(a:window,'ws_probe',{}))
endfunction
function! s:reply(id, result) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:id,'result':a:result})
endfunction
function! s:publish(phase, room, session) abort
  let rooms=[{'id':'A','title':'Space A','type':'group'},{'id':'B','title':'Space B','type':'group'}]
  let messages=empty(a:room) ? [] : map(range(1,36),'{"id":a:room."-".v:val,"author":"Synthetic","created":"2026-11-18T12:00:00Z","text":"Loaded ".a:room." message ".v:val."\nBody"}')
  let state={'revision':wbx#state().revision+1,'state':a:phase,'mode':'demo','ready':a:phase==# 'ready' && !empty(a:room) ? v:true : v:false,
        \ 'rooms':rooms,'room':empty(a:room) ? v:null : rooms[a:room==# 'A' ? 0 : 1],'messages':messages}
  if a:phase==# 'ready' | let state.localContext={'sessionId':repeat(a:session,32),'coverage':'session-only'} | endif
  call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}),'synthetic state obeys the real session/phase contract')
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
endfunction
function! s:draw(case, text) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  redraw!
  let info=getwininfo(win_getid())[0] | let rows=[]
  for row in range(info.winrow,info.winrow+info.height-1)
    call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
  endfor
  call assert_match(a:text,join(rows,"\n"))
  call add(s:drawn,{'case':a:case,'text':filter(rows,'v:val =~# a:text')})
endfunction
function! s:open(id) abort
  WebexSpaces
  call cursor(index(b:wbx_room_ids,a:id)+1,1)
  call feedkeys("\<CR>",'xt')
  call assert_equal('rooms.select',g:ws_writes[-1].method)
  return g:ws_writes[-1].id
endfunction
try
  call setline(1,'Independent original work')
  let original=bufnr('%') | let original_window=win_getid()
  WebexDemo
  call assert_equal(['hello'],map(copy(g:ws_writes),'v:val.method'))
  call s:reply(g:ws_writes[0].id,{'version':1,'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','local-context-v1']})
  call s:reply(g:ws_writes[-1].id,v:null)
  call s:publish('ready','','a')
  let request=s:open('A')
  call s:publish('ready','A','a') | call s:reply(request,v:null)
  call assert_equal(wbx#buffers().history,bufnr('%'),'real Enter opens ready history')
  call assert_equal(['Independent original work'],getbufline(original,1,'$'))
  WebexCompose
  call setline(1,'Native workspace draft')
  call feedkeys("\<Esc>",'xt')
  call append(1,'Unsynced composer work')
  let draft=bufnr('%') | let draft_window=win_getid() | let draft_before=WbxWorkspaceProbe()
  WebexDemo
  call assert_equal(draft_window,win_getid())
  call assert_equal(draft_before,WbxWorkspaceProbe(),'ordinary reopen preserves full unsynced undo and focus')
  let buffers=wbx#buffers()
  call add(s:checks,'public open/Enter/compose/reopen works without disturbing foreign work or unsynced undo')
  call s:draw('ordinary-compose-reopen','Native workspace draft')

  execute 'aboveleft sbuffer '.buffers.history
  setlocal foldmethod=manual
  silent! normal! zE
  8,12fold
  normal! 20Gzt
  let first=win_getid()
  split
  silent! normal! zE
  22,26fold
  normal! 45Gzt
  let second=win_getid()
  let left=s:capture(first) | let right=s:capture(second)
  call assert_notequal(left.view,right.view)
  let focus=win_getid()
  call s:publish('ready','A','a')
  call assert_equal(focus,win_getid())
  call assert_equal(left,s:capture(first)) | call assert_equal(right,s:capture(second))
  call add(s:checks,'same-room publication preserves independent split cursors, scroll and manual folds')

  let held=s:open('B')
  call s:publish('ready','B','a')
  call assert_equal('B',wbx#state().room.id)
  botright 5new | file independent-workspace.txt
  call setline(1,'Independent workspace foreground')
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced foreground work')
  let independent=win_getid() | let native=WbxWorkspaceProbe()
  let started=reltime()
  let current=wbx#select('A')
  call assert_true(current>held,'return selection is admitted before old acknowledgement')
  call s:publish('ready','A','a') | call s:reply(current,v:null) | call s:reply(held,v:null)
  call assert_true(g:ws_running,'correlated navigation never stops transport')
  call assert_equal(independent,win_getid()) | call assert_equal(native,WbxWorkspaceProbe())
  call add(s:timings,{'case':'A ready while old B acknowledgement held','return_ms':reltimefloat(reltime(started))*1000})
  call add(s:checks,'returning navigation is prompt and old acknowledgement cannot steal independent focus')
  call s:draw('held-selection-return','Independent workspace foreground')

  call win_execute(first,'setlocal modifiable | call setline(1,"Private history annotation")')
  let left=s:capture(first) | let right=s:capture(second) | let draft_before=s:capture(draft_window)
  call s:publish('failed','','a')
  call s:publish('ready','A','a')
  call assert_true(g:ws_running,'messaging failure/recovery is not transport failure')
  call assert_equal(independent,win_getid()) | call assert_equal(native,WbxWorkspaceProbe())
  call assert_equal(left,s:capture(first)) | call assert_equal(right,s:capture(second))
  call assert_equal(draft_before,s:capture(draft_window))
  WebexDisconnect
  call assert_equal('session.stop',g:ws_writes[-1].method)
  call s:reply(g:ws_writes[-1].id,v:null)
  call s:publish('idle','','a')
  call wbx#transport#stop()
  call assert_equal(native,WbxWorkspaceProbe())
  WebexDemo
  let hello=g:ws_writes[-1]
  call assert_equal('hello',hello.method)
  call s:reply(hello.id,{'version':1,'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','local-context-v1']})
  call s:reply(g:ws_writes[-1].id,v:null)
  call s:publish('ready','A','b')
  call assert_equal(independent,win_getid()) | call assert_equal(native,WbxWorkspaceProbe())
  call assert_equal(left,s:capture(first)) | call assert_equal(right,s:capture(second))
  call assert_equal(draft_before,s:capture(draft_window))
  call assert_equal([buffers.rooms,buffers.history],[wbx#buffers().rooms,wbx#buffers().history])
  call add(s:checks,'failure/recovery and explicit transport/session replacement retain annotations, draft undo and independent splits')
  call s:draw('failure-recovery-session-replacement','Independent workspace foreground')

  call win_gotoid(win_findbuf(buffers.rooms)[0]) | close
  call win_gotoid(independent)
  let before=WbxWorkspaceProbe()
  WebexDemo
  call assert_equal(independent,win_getid()) | call assert_equal(before,WbxWorkspaceProbe())
  call assert_false(empty(win_findbuf(buffers.rooms)))
  call assert_true(index(win_findbuf(buffers.history),first)>=0 && index(win_findbuf(buffers.history),second)>=0)
  call add(s:checks,'explicit repair reopens missing explorer without replacing foreign work or existing history splits')
  for request in g:ws_writes
    call assert_true(index(['hello','session.start','session.stop','rooms.select'],request.method)>=0,'no send, receipt or mutation request from window lifecycle')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:ws_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'timings':s:timings,
      \ 'requests':map(copy(g:ws_writes),'{"id":v:val.id,"method":v:val.method}')})],$WBX_EDITOR_RESULT)
qa!
