" Public native redraw/navigation/recovery with only physical transport inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:render_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:render_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:render_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:render_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:render_running=0 | let g:render_writes=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'people_status':0,'notifications':0,'read_status':0,
      \ 'persist_drafts':0,'spaces_cache':0,'upcoming_meetings':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let s:checks=[] | let s:drawn=[] | let s:timings=[]
let s:rooms=[{'id':'A','title':'Render A','type':'group'},{'id':'B','title':'Render B','type':'group'}]
function! WbxRenderProbe() abort
  return {'lines':getline(1,'$'),'undo':undotree(),'tick':b:changedtick,'cursor':getcurpos(),'view':winsaveview(),
        \ 'breakat':&breakat,'folds':map(range(1,line('$')),'[foldclosed(v:val),foldclosedend(v:val)]')}
endfunction
function! s:capture(window) abort
  call win_execute(a:window,'let w:render_probe=WbxRenderProbe()')
  return deepcopy(wbx#view#window_var(a:window,'render_probe',{}))
endfunction
function! s:reply() abort
  call wbx#_receive({'jsonrpc':'2.0','id':g:render_writes[-1].id,'result':v:null})
endfunction
function! s:publish() abort
  let s:state.revision=wbx#state().revision+1
  let envelope={'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)}
  call assert_true(wbx#protocol#valid(envelope))
  call wbx#_receive(envelope)
endfunction
function! s:select(id) abort
  WebexSpaces
  call cursor(index(b:wbx_room_ids,a:id)+1,1)
  call feedkeys("\<CR>",'xt')
  call assert_equal('rooms.select',g:render_writes[-1].method)
  let s:state.room=copy(s:rooms[a:id==# 'A' ? 0 : 1])
  let s:state.messages=map(range(1,30),'{"id":a:id."-".v:val,"author":"Synthetic","created":"","text":a:id." body ".v:val."\nSecond row"}')
  call s:publish() | call s:reply()
  call assert_equal(wbx#buffers().history,bufnr('%'))
  call assert_equal(a:id,b:wbx_history_room)
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
  call wbx#_receive({'jsonrpc':'2.0','id':g:render_writes[0].id,'result':{'version':1,
        \ 'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging']}})
  call s:reply()
  let s:state={'revision':0,'state':'ready','mode':'demo','ready':v:true,'rooms':s:rooms,'room':v:null,'messages':[]}
  call s:publish()
  call s:select('A')
  WebexCompose
  let old_revision=wbx#drafts#revision()
  call setline(1,'Renderer draft A')
  doautocmd TextChanged
  let draft=bufnr('%') | let draftwin=win_getid()
  call wbx#redraw_status()
  call assert_true(wbx#drafts#revision()>old_revision,'native TextChanged/status path observes a draft edit')
  let buffers=wbx#buffers()
  let ids=getbufvar(buffers.rooms,'wbx_room_ids')
  call assert_match('draft',getbufline(buffers.rooms,index(ids,'A')+1)[0])
  call s:select('B') | call s:select('A')
  call assert_equal(['Renderer draft A'],getbufline(draft,1,'$'))
  call add(s:checks,'public Enter navigation returns promptly to correct history and status redraw refreshes local draft badges')

  setlocal foldmethod=manual
  8,12fold
  normal! 20Gzt
  let first=win_getid()
  split
  silent! normal! zE
  28,32fold
  normal! 45Gzt
  let second=win_getid()
  call win_gotoid(draftwin)
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced renderer draft')
  let draft_before=WbxRenderProbe()
  let left=s:capture(first) | let right=s:capture(second)
  call assert_notequal(left.view,right.view)
  let request_count=len(g:render_writes) | let started=reltime()
  for i in range(12) | call wbx#redraw() | call wbx#redraw_status() | endfor
  call assert_equal(draftwin,win_getid()) | call assert_equal(draft_before,WbxRenderProbe())
  call assert_equal(left,s:capture(first)) | call assert_equal(right,s:capture(second))
  call assert_equal({'history':0,'images':0,'status':0},getbufvar(buffers.history,'wbx_render_work'))
  call assert_equal(request_count,len(g:render_writes))
  call add(s:timings,{'case':'12 quiet redraw/status pairs','ms':reltimefloat(reltime(started))*1000})
  call add(s:checks,'quiet public redraw preserves full unsynced undo, focus and independent split views/folds without requests')

  botright 5new | file renderer-independent.txt
  " Our explicit native window leave synchronizes the preceding draft edit.
  " Compare the complete post-navigation tree below; the unsynced redraw path
  " is checked separately above without leaving its composer.
  let draft_before=s:capture(draftwin)
  call setline(1,'Independent renderer foreground')
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced foreign edit')
  let foreign=win_getid() | let native=WbxRenderProbe()
  call add(s:state.messages,{'id':'new-tail','author':'Newest','created':'','text':'Latest renderer body'})
  call s:publish()
  call assert_equal(foreign,win_getid()) | call assert_equal(native,WbxRenderProbe())
  call assert_equal(draft_before,s:capture(draftwin))
  call assert_equal(left.cursor,s:capture(first).cursor) | call assert_equal(right.cursor,s:capture(second).cursor)
  call assert_equal(left.view,s:capture(first).view) | call assert_equal(right.view,s:capture(second).view)
  call assert_equal(left.folds,s:capture(first).folds[:len(left.folds)-1])
  call assert_equal(right.folds,s:capture(second).folds[:len(right.folds)-1])
  call assert_match('Latest renderer body',join(getbufline(buffers.history,1,'$'),"\n"))
  call add(s:checks,'changed history publishes new rows without moving independent readers, foreign focus or draft undo')

  let s:state.state='failed' | let s:state.ready=v:false
  call s:publish()
  call assert_match('Connection failed',join(getbufline(buffers.history,1,'$'),"\n"))
  call assert_equal(native,WbxRenderProbe())
  let s:state.state='ready' | let s:state.ready=v:true
  call s:publish()
  call assert_notmatch('Connection failed',join(getbufline(buffers.history,1,'$'),"\n"))
  call assert_equal(native,WbxRenderProbe())
  call assert_equal(draft_before,s:capture(draftwin))
  call add(s:checks,'clean projections show failure then recover while native draft and foreign work remain unchanged')
  call s:draw('clean-failure-recovery','Independent renderer foreground')

  call win_execute(first,'setlocal modifiable | call setline(1,"Private render annotation")')
  let left=s:capture(first) | let right=s:capture(second)
  let metadata=deepcopy(getbufvar(buffers.history,'wbx_message_blocks'))
  let s:state.messages[-1].text='New server text after annotation'
  let s:state.state='failed' | let s:state.ready=v:false
  call s:publish()
  let s:state.state='ready' | let s:state.ready=v:true
  call s:publish() | call wbx#redraw() | call wbx#redraw_status()
  call assert_equal(native,WbxRenderProbe())
  call assert_equal(left,s:capture(first)) | call assert_equal(right,s:capture(second))
  call assert_equal(metadata,getbufvar(buffers.history,'wbx_message_blocks'))
  call assert_equal(draft_before,s:capture(draftwin))
  call add(s:checks,'annotated failure/recovery retains full native undo and metadata atomically in both splits')
  call s:draw('annotated-failure-recovery','Independent renderer foreground')

  call win_gotoid(first)
  WebexRefresh!
  call assert_equal('messages.list',g:render_writes[-1].method)
  call s:reply()
  call assert_notmatch('Private render annotation',join(getline(1,'$'),"\n"))
  call assert_match('New server text after annotation',join(getline(1,'$'),"\n"))
  call assert_equal('new-tail',b:wbx_message_blocks[-1].id)
  normal! Gzb
  call s:draw('explicit-projection-recovery','New server text after annotation')
  call add(s:checks,'explicit Refresh! alone replaces annotation with latest projection and aligned message metadata')
  for request in g:render_writes
    call assert_true(index(['hello','session.start','rooms.select','messages.list'],request.method)>=0,'redraw never sends, acknowledges or mutates')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:render_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'timings':s:timings,
      \ 'requests':map(copy(g:render_writes),'{"id":v:val.id,"method":v:val.method}')})],$WBX_EDITOR_RESULT)
qa!
