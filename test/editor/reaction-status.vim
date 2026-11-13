" Actual coordinator, statuslines and intent lifecycle; inert transport/chooser only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=55 columns=180 laststatus=2
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:status_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:status_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:status_starts += 1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:status_running = 0','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
call writefile(['function! wbx#chooser#select(lines, Callback) abort',
      \ 'call add(g:status_menus,{"lines":copy(a:lines),"Callback":a:Callback,"status":wbx#buffer_status()})','endfunction'],s:stub . '/autoload/wbx/chooser.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:status_running = 1 | let g:status_requests = [] | let g:status_menus = [] | let g:status_starts = 0
let g:wbx_tui = {'backend':['/bin/false'],'images':0,'notifications':0,'mark_read_on_open':0,
      \ 'people_status':0,'upcoming_meetings':0,'persist_drafts':0,'folds':0}
runtime plugin/wbx.vim
let s:checks = [] | let s:drawn = []
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 3 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:publish() abort
  let s:state.revision = wbx#state().revision+1
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:reset() abort
  call wbx#reactions#invalidate()
  let s:state = deepcopy(s:base)
  call s:publish()
  call win_gotoid(s:history_window)
  call cursor(b:wbx_message_blocks[0].body,1)
endfunction
function! s:reply(request) abort
  let p = a:request.params
  let items = map(copy(get(p,'messageIds',[get(p,'messageId','')])),'{"roomId":p.roomId,"messageId":v:val,"observedAt":1,"partial":v:true,"unknown":v:true,"groups":[]}')
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':a:request.method ==# 'messages.reactionsBatch' ? {'roomId':p.roomId,'items':items} : items[0]})
endfunction
function! s:error(request) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'error':{'code':-32034,'message':'Reaction summary unavailable (worker:unavailable). Nothing was sent or acknowledged.'}})
endfunction
function! s:native() abort
  let buffers = {}
  for buffer in [s:history,s:foreground]
    let buffers[string(buffer)] = {'lines':getbufline(buffer,1,'$'),'tick':getbufvar(buffer,'changedtick'),
          \ 'undo':json_decode(trim(win_execute(buffer == s:history ? s:history_window : s:foreground_window,'echo json_encode(undotree())')))}
  endfor
  return [win_getid(),bufnr('%'),getcurpos(),winsaveview(),&breakat,buffers,
        \ getwinvar(s:history_window,'&statusline'),getwinvar(s:other_window,'&statusline')]
endfunction
function! s:phase(expected) abort
  let text = trim(win_execute(s:history_window,'echo wbx#buffer_status()'))
  if empty(a:expected)
    call assert_notmatch('reactions: \(waiting\|reading\)',text,'finished/canceled intent has no stale status token')
  else
    call assert_match('^\[reactions: ' . a:expected . '\]',text,'state-first acknowledgement is immediate in the originating window')
  endif
  let other = trim(win_execute(s:other_window,'echo wbx#buffer_status()'))
  call assert_notmatch('reactions: \(waiting\|reading\)',other,'the same history buffer in another split has independent status')
  if $WBX_EDITOR_SCREEN ==# '1' && !empty(a:expected)
    redraw!
    let info = getwininfo(s:history_window)[0]
    let row = info.winrow+info.height
    let screen = join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
    call assert_match('reactions: ' . a:expected,screen,'the native statusline is visibly drawn, not just returned by an accessor')
    call add(s:drawn,{'phase':a:expected,'row':row})
  endif
endfunction
function! s:held() abort
  call s:reset()
  let before = len(g:status_requests)
  let s:state.sending = v:false | call s:publish()
  call s:wait('len(g:status_requests) == ' . (before+1))
  let passive = g:status_requests[-1]
  call assert_equal('messages.reactionsBatch',passive.method)
  let s:state.sending = v:true | call s:publish()
  let native = s:native()
  WebexReactions
  call s:phase('waiting')
  call assert_equal(before+1,len(g:status_requests),'a waiting command does not compete with physical passive admission')
  call assert_equal(native,s:native(),'waiting feedback changes no text, full undo, focus, view or native statusline options')
  return passive
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'),[])
  let s:base = {'revision':0,'state':'ready','mode':'demo','ready':v:true,'sending':v:true,
        \ 'room':{'id':'room','title':'Status fixture','type':'group'},'rooms':[{'id':'room','title':'Status fixture','type':'group'}],
        \ 'messages':[{'id':'first','author':'Author','created':'2026-11-17T12:00:00Z','text':'First message'},
        \             {'id':'second','author':'Author','created':'2026-11-17T12:01:00Z','text':'Second message'}],
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},
        \ 'reactionSource':{'epoch':1,'revision':0,'degraded':v:false}}
  let s:state = deepcopy(s:base)
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1','viewport-batch-v1']}}])
  let s:history = wbx#buffers().history
  let s:history_window = win_findbuf(s:history)[0]
  call win_gotoid(s:history_window)
  split
  let s:other_window = win_getid()
  botright 6new | file independent-status-draft.txt
  let s:foreground_window = win_getid() | let s:foreground = bufnr('%')
  call setline(1,'Unrelated unsent native work')
  call feedkeys("i\<Esc>",'xt')
  call win_gotoid(s:history_window)

  let passive = s:held()
  call win_execute(s:foreground_window,'call append(1,"Background independent edit") | doautocmd <nomodeline> TextChanged')
  call s:phase('waiting')
  call add(s:checks,'background work in another window cannot cancel the foreground reaction intent')
  let attempts = len(g:status_requests) | let native = s:native()
  if has('profile')
    execute 'profile start ' . fnameescape($WBX_EDITOR_RESULT . '.status-profile')
    profile func wbx#state
    profile func wbx#reactions#status
  endif
  for _ in range(50) | call wbx#buffer_status() | call wbx#statusline() | endfor
  if has('profile')
    profile pause
    profile dump
    call assert_equal([],filter(readfile($WBX_EDITOR_RESULT . '.status-profile'),'v:val =~# "^FUNCTION.*wbx#state"'),'hot feedback accessors never copy main state')
  endif
  call assert_equal(attempts,len(g:status_requests),'status redraws perform no provider work')
  call assert_equal(native,s:native())
  call s:reply(passive)
  call assert_equal(attempts+1,len(g:status_requests),'one explicit read starts only after the passive result drains')
  let explicit = g:status_requests[-1]
  call assert_equal('messages.reactions',explicit.method)
  call s:phase('reading')
  WebexReactions
  call assert_equal(attempts+1,len(g:status_requests),'a repeated command cannot overlap an admitted explicit read')
  call s:phase('reading')
  call s:reply(explicit)
  call s:phase('')
  call assert_equal(1,len(g:status_menus))
  call assert_notmatch('reactions: reading',g:status_menus[-1].status,'reading feedback ends before native details open')
  call call(g:status_menus[-1].Callback,[0])
  call assert_equal(native,s:native(),'serialized details retain complete native editing state')
  call add(s:checks,'immediate waiting -> serialized reading -> clear before picker; repeated explicit read refused')

  for boundary in ['target-return','room','session','source','health-cycle','revocation','opt-out','leave-return','content-return']
    let passive = s:held()
    let attempts = len(g:status_requests) | let menus = len(g:status_menus)
    if boundary ==# 'target-return'
      call cursor(b:wbx_message_blocks[1].body,1)
      doautocmd <nomodeline> CursorMoved
      call cursor(b:wbx_message_blocks[0].body,1)
    elseif boundary ==# 'room'
      let s:state.room.id = 'other' | let s:state.rooms = [copy(s:state.room)]
      call s:publish()
    elseif boundary ==# 'session'
      let s:state.localContext.sessionId = repeat('b',32) | call s:publish()
    elseif boundary ==# 'source'
      let s:state.reactionSource.epoch += 1 | call s:publish()
    elseif boundary ==# 'health-cycle'
      let s:state.reactionSource.revision += 1 | call s:publish()
    elseif boundary ==# 'revocation'
      call wbx#_receive({'jsonrpc':'2.0','method':'room.revoked','params':{'roomId':'room'}})
    elseif boundary ==# 'opt-out'
      let g:wbx_tui.reactions = 0
      doautocmd <nomodeline> User WbxState
    elseif boundary ==# 'leave-return'
      call win_gotoid(s:foreground_window) | call win_gotoid(s:history_window)
    else
      let s:state.messages[0].text = 'Changed' | call s:publish()
      let s:state.messages[0].text = 'First message' | call s:publish()
    endif
    call s:phase('')
    let native = s:native()
    call s:reply(passive)
    call assert_equal(attempts,len(g:status_requests),boundary . ': invalid waiting intent cannot start a late explicit read')
    call assert_equal(menus,len(g:status_menus),boundary . ': no stale picker opens')
    call assert_equal(native,s:native(),boundary . ': stale completion preserves the current native state')
    if boundary ==# 'opt-out' | let g:wbx_tui.reactions = 1 | endif
    call add(s:checks,boundary . ': waiting intent and feedback fenced')
  endfor

  " A newer waiting target replaces the old intent, never the physical flight.
  let passive = s:held()
  let attempts = len(g:status_requests)
  call cursor(b:wbx_message_blocks[1].body,1)
  WebexReactions
  call s:phase('waiting')
  call assert_equal(attempts,len(g:status_requests))
  call s:reply(passive)
  call assert_equal(attempts+1,len(g:status_requests))
  call assert_equal('second',g:status_requests[-1].params.messageId)
  call s:phase('reading')
  call s:error(g:status_requests[-1])
  call s:phase('')
  call add(s:checks,'superseded waiting target admits only the latest exact intent; error clears reading')

  " Losing intent hides feedback, but cannot release an actual explicit read early.
  call s:reset()
  WebexReactions
  let explicit = g:status_requests[-1] | let attempts = len(g:status_requests)
  call s:phase('reading')
  call win_gotoid(s:foreground_window)
  call append(1,'Unsynced work during held explicit read')
  let native = s:native() | let menus = len(g:status_menus)
  call s:phase('')
  call win_gotoid(s:history_window)
  WebexReactions
  call assert_equal(attempts,len(g:status_requests),'canceled display is not permission to overlap the still-held read')
  call win_gotoid(s:foreground_window)
  let native = s:native()
  call s:reply(explicit)
  call assert_equal(native,s:native(),'old read cannot sync/focus unrelated unsent native work')
  call assert_equal(menus,len(g:status_menus),'old read does not open a picker after intent loss')
  call win_gotoid(s:history_window)
  WebexReactions
  let current = g:status_requests[-1]
  call assert_equal(attempts+1,len(g:status_requests),'a fresh explicit command works after actual settlement')
  call s:phase('reading')
  call s:reply(explicit)
  call s:phase('reading')
  call s:error(current)
  call s:phase('')
  call add(s:checks,'canceled read holds admission until settlement; late callback cannot clear newer feedback')

  call s:reset()
  WebexReactions
  let old = g:status_requests[-1] | let attempts = len(g:status_requests) | let menus = len(g:status_menus)
  call s:phase('reading')
  call wbx#_receive({'jsonrpc':'2.0','method':'room.revoked','params':{'roomId':'room'}})
  let s:state.room.id = 'other' | let s:state.rooms = [copy(s:state.room)]
  let s:state.sending = v:false | let s:state.ready = v:false | call s:publish()
  let s:state.ready = v:true | call s:publish()
  call s:phase('')
  sleep 220m
  call assert_equal(attempts,len(g:status_requests),'room invalidation cannot resume passive work while an explicit read is still held')
  let native = s:native()
  call s:reply(old)
  call assert_equal(native,s:native())
  call assert_equal(menus,len(g:status_menus),'revoked read does not display its old exact target')
  call add(s:checks,'revocation/room invalidation preserves explicit physical admission after hiding stale feedback')

  call s:reset()
  WebexReactions
  let old = g:status_requests[-1] | let attempts = len(g:status_requests)
  let s:state.localContext.sessionId = repeat('c',32) | call s:publish()
  call s:phase('')
  WebexReactions
  let current = g:status_requests[-1]
  call assert_equal(attempts+1,len(g:status_requests),'a replacement session releases only the old session orphan')
  call s:phase('reading')
  call s:reply(old)
  call s:phase('reading')
  call s:error(current)
  call s:phase('')
  call add(s:checks,'session replacement releases an orphan; old-session completion cannot retire new feedback')

  call s:reset()
  let attempts = len(g:status_requests) | let menus = len(g:status_menus)
  let s:state.sending = v:false | call s:publish()
  call s:wait('len(g:status_requests) == ' . (attempts+1))
  let passive = g:status_requests[-1]
  let s:state.sending = v:true | call s:publish()
  WebexReactionAdd
  call assert_equal(menus+1,len(g:status_menus),'Add opens its local picker immediately while the passive batch is physically held')
  call assert_equal(attempts+1,len(g:status_requests),'showing choices does not compete for read/write admission')
  call call(g:status_menus[-1].Callback,[1])
  call s:phase('waiting')
  call assert_equal(attempts+1,len(g:status_requests),'only preparation waits for the physical batch')
  call s:reply(passive)
  call assert_equal('messages.reactionPrepare',g:status_requests[-1].method)
  call s:phase('reading')
  call s:error(g:status_requests[-1])
  call add(s:checks,'immediate local Add picker -> safely serialized preparation, no mutation replay')

  call s:reset()
  let attempts = len(g:status_requests)
  WebexReactionAdd
  call s:phase('')
  call assert_equal(attempts,len(g:status_requests),'opening a local reaction choice is not a backend read')
  call call(g:status_menus[-1].Callback,[2])
  call assert_equal('messages.reactionPrepare',g:status_requests[-1].method)
  let attempts = len(g:status_requests)
  call call(g:status_menus[-1].Callback,[2])
  call assert_equal(attempts,len(g:status_requests),'even a duplicate UI callback cannot overlap physical read admission')
  call s:phase('reading')
  call s:error(g:status_requests[-1])
  call s:phase('')
  call assert_equal([],filter(copy(g:status_requests),'v:val.method ==# "messages.reactionSubmit"'),'status acknowledgement never submits a mutation')
  call add(s:checks,'preparation reading phase clears on failure without mutation')

  " Actor details reuse the same admission/intent fence, not the legacy picker.
  call s:reset()
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1','viewport-batch-v1','actor-details-v1']}}])
  WebexReactions
  let request = g:status_requests[-1]
  call assert_true(request.params.details)
  let details = {'snapshot':{'roomId':'room','messageId':'first','observedAt':1,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':'heart','label':'Heart','count':3},{'reaction':'celebrate','label':'Celebrate'}]},
        \ 'actors':[{'reaction':'heart','personId':'person','name':'Disclosed person'}],'partial':v:true}
  call assert_true(wbx#protocol#reaction_details(details))
  let oversized = deepcopy(details) | let oversized.actors = map(range(11),'{"reaction":"heart","personId":"actor-" . v:val}')
  call assert_false(wbx#protocol#reaction_details(oversized),'native actor bounds match the service ten-item page')
  let unsafe = deepcopy(details) | let unsafe.actors[0].name = "unsafe\nname"
  call assert_false(wbx#protocol#reaction_details(unsafe))
  let duplicate = deepcopy(details) | call add(duplicate.actors,duplicate.actors[0])
  call assert_false(wbx#protocol#reaction_details(duplicate))
  call cursor(b:wbx_message_blocks[1].body,1)
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':details})
  call assert_notequal('reactions',get(b:,'wbx_list_kind',''),'late details cannot steal focus after moving to a different message')
  call cursor(b:wbx_message_blocks[0].body,1)
  WebexReactions
  let request = g:status_requests[-1]
  let attempts = len(g:status_requests)
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':details})
  call assert_equal('reactions',b:wbx_list_kind)
  call assert_match('Disclosed person',join(getline(1,'$'),"\n"))
  call assert_equal(['♥️ Heart — 3','  Disclosed person','','🎉 Celebrate — ?','  People unavailable',''],getline(1,'$'))
  call assert_equal('',maparg('<CR>','n'),'people list has no inherited team action')
  call assert_equal('',maparg(']p','n'),'people list has no inherited team pagination')
  call assert_false(&modifiable)
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let info = getwininfo(win_getid())[0]
    let row = info.winrow+search('Disclosed person','nw')-line('w0')
    call assert_match('Disclosed person',join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''),
          \ 'disclosed actor names are visibly drawn in the native list')
  endif
  call feedkeys("\<CR>",'xt')
  call assert_equal(attempts,len(g:status_requests),'details list does not send, remove, page or acknowledge')
  call wbx#lists#close()
  call assert_equal(s:history,bufnr('%'))
  let people_buffer = bufnr('wbx://reactions')
  let s:state.room.id = 'other-room' | call s:publish()
  call assert_false(buflisted(people_buffer),'leaving the space discards even a hidden clean people list')
  call assert_equal([],win_findbuf(people_buffer))
  call s:reset()
  WebexReactions
  call wbx#_receive({'jsonrpc':'2.0','id':g:status_requests[-1].id,'result':details})
  let people_buffer = bufnr('%')
  let s:state.room.id = 'other-room' | call s:publish()
  call assert_equal([],win_findbuf(people_buffer),'leaving the space closes visible people windows')
  call assert_false(buflisted(people_buffer))
  call s:reset()
  WebexReactions
  let late = g:status_requests[-1]
  let s:state.room.id = 'other-room' | call s:publish()
  call wbx#_receive({'jsonrpc':'2.0','id':late.id,'result':details})
  call assert_notequal('reactions',get(b:,'wbx_list_kind',''),'late callbacks cannot reopen a departed list')
  call s:reset()
  WebexReactions
  call wbx#_receive({'jsonrpc':'2.0','id':g:status_requests[-1].id,'result':details})
  let people_buffer = bufnr('%')
  setlocal modifiable
  call append('$','My own annotation')
  setlocal nomodified
  let s:state.localContext.sessionId = repeat('b',32) | call s:publish()
  call assert_equal('My own annotation',getbufline(people_buffer,'$')[0],'changedtick protects annotations even with modified reset')
  call assert_true(buflisted(people_buffer))
  execute 'bwipeout! ' . people_buffer
  call add(s:checks,'bounded actor details are inert and stale replies cannot steal focus')

  " Respect user-owned statuslines; the plain accessor remains available.
  call s:reset()
  setlocal statusline=User-owned
  let option = &l:statusline
  WebexReactions
  call assert_equal(option,&l:statusline)
  call assert_match('reactions: reading',wbx#buffer_status())
  call s:error(g:status_requests[-1])
  call assert_equal(option,&l:statusline)
  let g:wbx_tui.backend = ['/nonexistent-wbx-backend']
  let g:status_running = 0
  WebexReactions
  call s:phase('')
  call assert_equal(0,g:status_starts,'failed explicit admission clears feedback without another read or write')
  call add(s:checks,'user statusline is not replaced; failed request admission clears transient feedback')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
let g:status_running = 0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'requests':len(g:status_requests),'backendStarts':g:status_starts})],$WBX_EDITOR_RESULT)
qa!
