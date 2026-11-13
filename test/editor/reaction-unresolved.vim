" Actual native/RPC state owner; held transport and consent/picker only are inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:unresolved_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:unresolved_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:unresolved_starts += 1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:unresolved_running = 0','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
call writefile(['function! wbx#chooser#select(lines, Callback) abort',
      \ 'let g:unresolved_picker = {"Callback":a:Callback,"lines":copy(a:lines)}','endfunction'],s:stub . '/autoload/wbx/chooser.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:unresolved_running = 0 | let g:unresolved_requests = [] | let g:unresolved_starts = 0
let g:unresolved_confirm = 1 | let g:unresolved_prompts = []
let g:wbx_tui = {'backend':['/bin/false'],'images':0,'notifications':0,'mark_read_on_open':0,
      \ 'people_status':0,'upcoming_meetings':0,'persist_drafts':0,'folds':0}
runtime plugin/wbx.vim
runtime autoload/wbx/reactions.vim
let s:sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reactions.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:unresolved_prompts,a:text)\nreturn g:unresolved_confirm\nendfunction"
let s:checks = [] | let s:drawn = []
function! s:publish() abort
  let s:state.revision = wbx#state().revision+1
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':s:state}) | throw 'Invalid unresolved fixture state: ' . s:state.state | endif
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:reply(request, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':deepcopy(a:value)})
endfunction
function! s:error(request) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'error':{'code':-32000,'message':'Synthetic refusal; retained unknown is not inspected'}})
endfunction
function! s:last(method) abort
  return filter(copy(g:unresolved_requests),'v:val.method ==# a:method')[-1]
endfunction
function! s:history(index) abort
  call win_gotoid(s:history_window)
  call cursor(b:wbx_message_blocks[a:index].body,1)
endfunction
function! s:prepare(index) abort
  call s:history(a:index)
  WebexReactionAdd
  call call(g:unresolved_picker.Callback,[2])
  let p = g:unresolved_requests[-1].params
  let context = {'contextId':printf('%032x',a:index+1),'roomId':p.roomId,'messageId':p.messageId,
        \ 'action':'add','reaction':'heart','label':'Heart','expiresAt':localtime()*1000+30000}
  call s:reply(g:unresolved_requests[-1],context)
  return s:last('messages.reactionSubmit')
endfunction
function! s:outcome(request, status) abort
  let p = a:request.params
  return {'contextId':p.contextId,'requestId':p.requestId,'roomId':p.roomId,'messageId':p.messageId,
        \ 'action':'add','status':a:status,'notice':'Synthetic ' . a:status . ' outcome'}
endfunction
function! s:view() abort
  let attempts = len(g:unresolved_requests) | let prompts = len(g:unresolved_prompts)
  let before = [win_getid(),bufnr('%')]
  WebexReactionUnresolved
  call assert_equal('wbx://reaction-unresolved',bufname('%'))
  call assert_true(wbx#lists#clean(bufnr('%'),'reaction-unresolved'))
  call assert_false(&modifiable,'inspection text is read-only by default')
  call assert_equal('nofile',&buftype)
  call assert_equal(attempts,len(g:unresolved_requests),'local inspection never sends RPCs, reads or receipts')
  call assert_equal(prompts,len(g:unresolved_prompts),'rediscovery is not an unlock confirmation')
  call assert_match('snapshot',join(getline(1,'$'),"\n"))
  call assert_match('editor memory',join(getline(1,'$'),"\n"))
  call assert_notmatch('contextId\|PRIVATE message\|PRIVATE title',join(getline(1,'$'),"\n"),'no context handles, bodies or titles are retained in the view')
  return before
endfunction
function! s:draw(label, token) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  call cursor(search(a:token,'nw'),1)
  normal! zt
  redraw!
  let row = screenpos(win_getid(),line('.'),1).row
  let text = join(map(range(1,&columns),'screenstring(row,v:val)'),'')
  call assert_match(a:token,text,'local write state is rendered as native readable text')
  call add(s:drawn,{'case':a:label,'text':trim(text)})
endfunction
try
  call setline(1,'Unrelated unsent native text')
  call feedkeys("i\<Esc>",'xt')
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat]
  let origin = s:view()
  call assert_match('No locally retained',join(getline(1,'$'),"\n"),'empty local evidence is not a server absence claim')
  let action = filter(wbx#commands#catalogue(),'v:val.command ==# "WebexReactionUnresolved"')[0]
  call assert_true(action.available,'read-only discovery needs no selected room/capability/backend')
  call assert_equal('',action.key,'no new default key family or Wnr remap')
  call wbx#lists#close()
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat])
  call assert_equal(0,g:unresolved_starts)
  call add(s:checks,'cold/offline inspection is local, inert and returns to exact unsent native origin')

  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'),[])
  let s:state = {'revision':1,'state':'ready','mode':'demo','ready':v:true,'sending':v:true,
        \ 'room':{'id':'room','title':'PRIVATE title','type':'group'},'rooms':[{'id':'room','title':'PRIVATE title','type':'group'}],
        \ 'messages':map(['first','second','third'],'{"id":v:val,"author":"Author","created":"2026-11-17T12:00:00Z","text":"PRIVATE message " . v:val}'),
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
  let g:unresolved_running = 1
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1','viewport-batch-v1']}}])
  let s:history_window = win_findbuf(wbx#buffers().history)[0]
  botright 6new | file independent-unresolved-draft.txt
  let draft_window = win_getid()
  call setline(1,'Independent unsent native text')
  call feedkeys("i\<Esc>",'xt')
  let request = s:prepare(0)
  let origin = s:view()
  call assert_match('PENDING',join(getline(1,'$'),"\n"))
  call assert_match('Room ID: room',join(getline(1,'$'),"\n"))
  call assert_match('Message ID: first',join(getline(1,'$'),"\n"))
  call assert_match('Request ID: ' . request.params.requestId,join(getline(1,'$'),"\n"))
  let snapshot = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  call win_execute(draft_window,'call append(1,"Unsynced independent work")')
  let draft = json_decode(trim(win_execute(draft_window,'echo json_encode([getline(1,"$"),undotree(),b:changedtick])')))
  call assert_equal(0,draft[1].synced,'pending callback exercises unrelated unsynced native undo')
  call s:reply(request,s:outcome(request,'unknown'))
  call assert_equal(snapshot,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'async result never rewrites/focuses an inspection snapshot')
  call assert_equal(draft,json_decode(trim(win_execute(draft_window,'echo json_encode([getline(1,"$"),undotree(),b:changedtick])'))),'settlement preserves unrelated text/tick/full unsynced undo')
  let before = len(g:unresolved_requests)
  call feedkeys("\<CR>",'xt')
  silent! write
  call assert_equal(before,len(g:unresolved_requests),'Enter/write do not send, resolve or replay')
  call s:view()
  call assert_match('UNKNOWN',join(getline(1,'$'),"\n"))
  call s:draw('retained unknown','UNKNOWN')
  call s:draw('exact room','Room ID: room')
  call s:draw('exact message','Message ID: first')
  call s:draw('exact original request','Request ID: ' . request.params.requestId)
  call wbx#lists#close()
  call assert_equal(origin,[win_getid(),bufnr('%')])
  call add(s:checks,'held PENDING -> UNKNOWN: immutable local snapshot, explicit refresh, Enter/write inert')

  " Clear notice history, leave the space, and return; the exact request survives.
  messages clear
  let s:state.room = {'id':'other','title':'Other','type':'group'}
  let s:state.rooms += [copy(s:state.room)]
  call s:publish()
  let g:wbx_tui.reactions = 0
  let s:state.localContext.sessionId = repeat('b',32) | call s:publish()
  let g:unresolved_running = 0
  call remove(s:state,'localContext')
  let s:state.state = 'idle' | let s:state.ready = v:false | call s:publish()
  let origin = s:view()
  let text = join(getline(1,'$'),"\n")
  call assert_match('Message ID: first',text)
  call assert_match('Request ID: ' . request.params.requestId,text)
  call assert_match('not.*server\|not.*account',text)
  call assert_match('WebexReactionResolve',text,'rediscovery explains the separate exact-target recovery action')
  call assert_equal(0,g:unresolved_starts)
  call s:draw('offline retained evidence','UNKNOWN')
  call s:draw('offline original request','Request ID: ' . request.params.requestId)
  call wbx#lists#close()
  let s:state.room = {'id':'room','title':'PRIVATE title','type':'group'}
  let s:state.state = 'ready' | let s:state.ready = v:true | let g:unresolved_running = 1
  let s:state.localContext = {'sessionId':repeat('b',32),'coverage':'session-only'}
  let g:wbx_tui.reactions = 1 | call s:publish()
  call s:history(0)
  let before = len(g:unresolved_requests)
  WebexReactionAdd
  call assert_equal(before,len(g:unresolved_requests),'rediscovery, room/session return and option toggles cannot clear write lock')
  call add(s:checks,'dismissed notices + room/session/offline/opt-out round trip retain exact unknown without write authority')

  " Mutating view metadata cannot select a request, resolve it or change authority.
  call s:view()
  let b:wbx_list_row_ids = repeat(['forged-request'],line('$'))
  let before = len(g:unresolved_requests)
  WebexReactionResolve
  call assert_equal(before,len(g:unresolved_requests),'this list is not an authoritative history/inspection target')
  let g:unresolved_confirm = 0
  call wbx#lists#close() | call s:history(0)
  WebexReactionResolve
  call assert_equal(before,len(g:unresolved_requests),'canceling the independent inspection confirmation remains inert')
  let g:unresolved_confirm = 1
  call assert_equal('',wbx#reactions#reason(),'returning history target is still unchanged and ready')
  WebexReactionResolve
  let resolution = s:last('messages.reactionResolve')
  call assert_equal(request.params.requestId,resolution.params.requestId,'resolution still uses the original retained request, never presentation metadata')
  call s:error(resolution)
  call s:view()
  call assert_match('Request ID: ' . request.params.requestId,join(getline(1,'$'),"\n"),'failed resolution retains uncertainty')
  call wbx#lists#close()
  call s:history(0)
  WebexReactionResolve
  let stale = s:last('messages.reactionResolve')
  call cursor(b:wbx_message_blocks[1].body,1)
  doautocmd <nomodeline> CursorMoved
  call s:reply(stale,v:null)
  call s:view()
  call assert_match('Request ID: ' . request.params.requestId,join(getline(1,'$'),"\n"),'stale exact-request ACK cannot retire local uncertainty after target loss')
  call wbx#lists#close() | call s:history(0)
  WebexReactionResolve
  call assert_equal(request.params.requestId,s:last('messages.reactionResolve').params.requestId)
  call s:reply(s:last('messages.reactionResolve'),v:null)
  call s:view()
  call assert_match('No locally retained',join(getline(1,'$'),"\n"),'only exact successful guarded resolution retires local unknown')
  call assert_equal(1,len(filter(copy(g:unresolved_requests),'v:val.method ==# "messages.reactionSubmit"')),'all rediscovery/recovery issued zero additional mutations')
  call add(s:checks,'view metadata has no authority; cancel/error/stale ACK retain unknown; exact guarded resolution alone retires it')
  call wbx#lists#close()

  let changed = s:prepare(1)
  call s:reply(changed,s:outcome(changed,'changed'))
  call s:view()
  call assert_match('No locally retained',join(getline(1,'$'),"\n"),'confirmed settled outcomes are not presented as unresolved')
  call wbx#lists#close()
  let pending = s:prepare(2)
  call wbx#reactions#invalidate()
  call s:reply(pending,s:outcome(pending,'changed'))
  call s:view()
  call assert_match('Request ID: ' . pending.params.requestId,join(getline(1,'$'),"\n"),'disconnect-style invalidation retains UNKNOWN despite a late old ACK')
  call assert_match('UNKNOWN',join(getline(1,'$'),"\n"))
  call add(s:checks,'settled outcomes omitted; invalidated pending write remains unknown despite late success ACK')
  call wbx#lists#close()
  let another = s:prepare(1)
  call s:reply(another,s:outcome(another,'unknown'))
  call s:view()
  for retained in [pending,another]
    call assert_match('Request ID: ' . retained.params.requestId,join(getline(1,'$'),"\n"),'multiple exact unknowns remain discoverable without eviction')
  endfor
  call assert_equal(2,len(filter(copy(getline(1,'$')),'v:val =~# "^UNKNOWN"')))
  let before = len(g:unresolved_requests) | let list_window = win_getid()
  tabnew
  let inspection_tab = tabpagenr()
  call setline(1,'Independent second-tab work')
  call feedkeys("i\<Esc>",'xt')
  let tab_native = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  call s:view()
  call assert_equal(inspection_tab,tabpagenr(),'a list in another tab cannot steal navigation')
  call wbx#lists#close()
  call assert_equal(tab_native,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'inspection returns to the exact second-tab origin')
  tabclose
  call win_gotoid(list_window)
  let g:wbx_tui.mappings = 0 | call wbx#lists#setup()
  call assert_equal('',maparg('r','n'))
  call assert_equal('',maparg('q','n'))
  WebexReactionUnresolved
  let g:wbx_tui.mappings = 1 | call wbx#lists#setup()
  call assert_equal(before,len(g:unresolved_requests))
  call add(s:checks,'multiple unknowns, independent tab returns and mappings opt-out retain local read-only semantics')

  " Local views inherit annotation/promotion protection and never auto-refresh.
  setlocal modifiable
  call append(line('$'),'My retained annotation')
  let annotation = [bufnr('%'),getline(1,'$'),undotree()]
  let before = len(g:unresolved_requests)
  WebexReactionUnresolved
  call assert_equal(annotation,[bufnr('%'),getline(1,'$'),undotree()])
  setlocal buftype=
  WebexReactionUnresolved
  call assert_equal(annotation,[bufnr('%'),getline(1,'$'),undotree()])
  call assert_equal(before,len(g:unresolved_requests),'annotated/promoted inspection never triggers remote work')
  call assert_equal('',&buftype)
  call assert_equal('',maparg('r','n'),'promotion releases owned local refresh mapping')
  call add(s:checks,'native annotations/full undo and promoted buffers survive rediscovery without repaint or request')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
  call add(v:errors,execute('messages'))
endtry
let g:unresolved_running = 0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'requests':len(g:unresolved_requests),'backendStarts':g:unresolved_starts,
      \ 'mutations':len(filter(copy(g:unresolved_requests),'v:val.method ==# "messages.reactionSubmit"'))})],$WBX_EDITOR_RESULT)
qa!
