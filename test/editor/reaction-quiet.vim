" Real RPC admission/response + passive scheduler; only transport bytes are inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=45 columns=140
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:quiet_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:quiet_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:quiet_starts += 1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:quiet_running = 0','let g:quiet_stops += 1','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:quiet_running = 1 | let g:quiet_starts = 0 | let g:quiet_stops = 0 | let g:quiet_requests = []
let g:quiet_notifications = []
if has('nvim')
  lua vim.notify = function(text) local log = vim.g.quiet_notifications; log[#log+1] = text; vim.g.quiet_notifications = log end
endif
let g:wbx_tui = {'backend':['/bin/false'],'images':0,'mark_read_on_open':0,'people_status':0,
      \ 'upcoming_meetings':0,'persist_drafts':0,'folds':0,'notifications':{'mode':'editor'}}
runtime plugin/wbx.vim
let s:checks = [] | let s:failures = 0 | let s:acks = 0
function! s:ack(response) abort
  let s:acks += 1
endfunction
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 3 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:publish() abort
  let s:state.revision += 1
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:hello(batch) abort
  let s:state.revision += 1
  call call(s:Hello,[{'result':{'version':1,'state':deepcopy(s:state),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1'] + (a:batch ? ['viewport-batch-v1'] : [])}}])
endfunction
function! s:health() abort
  silent let value = wbx#health()
  return value
endfunction
function! s:foreground() abort
  let health = s:health()
  return {'window':win_getid(),'buffer':bufnr('%'),'text':getline(1,'$'),'undo':undotree(),
        \ 'cursor':getcurpos(),'view':winsaveview(),'mode':mode(1),'breakat':&breakat,'messages':execute('messages'),
        \ 'errmsg':v:errmsg,'statusmsg':v:statusmsg,'last_notice':health.last_notice,
        \ 'notifications':health.notifications.submitted,'deliveries':deepcopy(g:quiet_notifications)}
endfunction
function! WbxQuietInsertFailure() abort
  let s:insert_mode = mode(1)
  call assert_match('^i',s:insert_mode,'the callback is actually handled while composing in Insert mode')
  let before = s:foreground()
  call s:failure(s:insert_id,'worker:unavailable')
  call assert_equal(before,s:foreground(),'failure during Insert mode preserves foreground text, mode, messages and full undo')
  let s:failures += 1
  return ''
endfunction
function! s:failure(id, reason) abort
  let message = a:reason ==# 'unrecognized' ? "PRIVATE provider body \e]52;c;payload\a"
        \ : 'Reaction summary unavailable (' . a:reason . '). PRIVATE provider body must not escape.'
  call wbx#_receive({'jsonrpc':'2.0','id':a:id,'error':{'code':-32034,'message':message}})
endfunction
function! s:passive(reason, method) abort
  let attempts = len(g:quiet_requests)
  let g:quiet_clock += 61
  call wbx#reaction_history#schedule()
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  let request = g:quiet_requests[-1]
  call assert_equal(a:method,request.method,'the real passive scheduler uses the negotiated read method')
  call assert_equal(['id','jsonrpc','method','params'],sort(keys(request)),'local policy never enters the RPC envelope')
  call assert_equal(a:method ==# 'messages.reactionsBatch' ? ['internalConsent','messageIds','roomId'] : ['internalConsent','messageId','roomId'],
        \ sort(keys(request.params)),'quiet presentation changes no closed provider contract')
  if !s:failures
    let id = wbx#rpc('rooms.refresh',{},function('s:ack'))
    call wbx#_receive({'jsonrpc':'2.0','id':id,'error':{'code':-32000,'message':'Concurrent explicit refresh failed; do not replace this notice'}})
    call assert_match('Concurrent explicit refresh failed',s:health().last_notice,'an outstanding passive read does not mute other pending requests')
  endif
  call append(line('$'),'Unsynced foreground work ' . s:failures)
  let before = s:foreground()
  call assert_equal(0,before.undo.synced,'fixture has an unsynced foreground undo block')
  call s:failure(request.id,a:reason)
  call assert_equal(before,s:foreground(),'passive failure preserves messages, unrelated errors, notifications, focus and complete unsynced undo')
  let expected = a:reason ==# 'unrecognized' ? 'summary:unavailable' : a:reason
  let diagnostic = get(s:health(),'reaction_reads',{})
  call assert_true(index(get(diagnostic,'reasons',[]),expected) >= 0,'a finite sanitized passive diagnostic stays inspectable in :WebexHealth')
  call assert_notmatch('PRIVATE\|payload',string(diagnostic))
  call assert_true(get(diagnostic,'failedTargets',0) + get(diagnostic,'pendingTargets',0) > 0)
  if !empty(get(diagnostic,'reasons',[]))
    let diagnostic.reasons[0] = 'PRIVATE injected by caller'
    call assert_notmatch('PRIVATE',string(get(s:health(),'reaction_reads',{})),'health returns detached local diagnostics, never mutable cache authority')
  endif
  let s:failures += 1
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello = function('<SNR>' . sid . '_hello')
  call call(function('<SNR>' . sid . '_layout'),[])
  let s:state = {'revision':0,'state':'ready','mode':'demo','ready':v:true,'sending':v:true,
        \ 'room':{'id':'room','title':'Quiet fixture','type':'group'},'rooms':[{'id':'room','title':'Quiet fixture','type':'group'}],
        \ 'messages':[{'id':'message','author':'Author','created':'2026-11-17T12:00:00Z','text':'Exact message'}],
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
  call s:hello(1)
  let history_window = win_findbuf(wbx#buffers().history)[0]
  call win_gotoid(history_window)
  call cursor(b:wbx_message_blocks[0].body,1)
  vnew | file independent-quiet-draft.txt
  call setline(1,'Independent foreground text')
  call feedkeys("i\<Esc>",'xt')
  let foreground_window = win_getid()
  let reaction_sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reaction_history.vim$"')[0].sid
  let g:quiet_clock = localtime()
  execute 'function! <SNR>' . reaction_sid . "_now() abort\nreturn g:quiet_clock\nendfunction"
  call wbx#rpc('test.foreground',{},function('s:ack'))
  call wbx#_receive({'jsonrpc':'2.0','id':g:quiet_requests[-1].id,'error':{'code':-32000,'message':'Unrelated explicit operation failed; retain this notice'}})
  echomsg 'Foreground native message before passive work'
  let v:errmsg = 'Unrelated native error'
  let v:statusmsg = 'Foreground native status'
  for batch in [1,0]
    let s:state.sending = v:true
    call wbx#reaction_history#invalidate()
    call s:hello(batch)
    let s:state.sending = v:false
    call s:publish()
    for reason in ['parent:denied','summary:timeout','worker:unavailable','unrecognized']
      call s:passive(reason,batch ? 'messages.reactionsBatch' : 'messages.reactions')
    endfor
    let before = s:foreground() | let attempts = len(g:quiet_requests)
    for _ in range(4) | call wbx#reaction_history#schedule() | sleep 220m | endfor
    call assert_equal(attempts,len(g:quiet_requests),'quiet failures retain the negative TTL, not a silent retry storm')
    call assert_equal(before,s:foreground())
    call add(s:checks,(batch ? 'batch' : 'single') . ': repeated quiet failures preserve foreground state and expose finite health reasons')
  endfor

  " Cold busy deferral is also quiet and remains subject to its existing budget.
  let s:state.sending = v:true
  call wbx#reaction_history#invalidate() | call s:publish()
  let s:state.sending = v:false | call s:publish()
  for _ in range(4) | call s:passive('worker:busy','messages.reactions') | endfor
  call add(s:checks,'cold busy responses remain quiet, diagnostic and bounded')

  " A success removes failure diagnostics; it cannot manufacture complete zero.
  let attempts = len(g:quiet_requests) | let g:quiet_clock += 61
  call wbx#reaction_history#schedule()
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  let before = s:foreground()
  call wbx#_receive({'jsonrpc':'2.0','id':g:quiet_requests[-1].id,'result':{'roomId':'room','messageId':'message',
        \ 'observedAt':1,'partial':v:true,'unknown':v:true,'groups':[]}})
  call assert_equal(before,s:foreground())
  call assert_equal([],get(get(s:health(),'reaction_reads',{}),'reasons',['missing']))
  call add(s:checks,'successful partial empty result clears read failures without absence or foreground claims')
  call wbx#reaction_history#accept({'roomId':'room','messageId':'message','observedAt':1,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':'heart','label':'Heart'}]})
  let g:quiet_clock += 301
  call s:passive('parent:denied','messages.reactions')
  call assert_equal('♥️',getbufvar(wbx#buffers().history,'wbx_reaction_decorations').message.text,'a quiet failed refresh keeps last-observed groups without cached text')
  call assert_equal('WbxHistoryReactionsMuted',getbufvar(wbx#buffers().history,'wbx_reaction_decorations').message.group)
  call add(s:checks,'cached-snapshot refresh failures stay quiet with inspectable sanitized reasons')

  let attempts = len(g:quiet_requests) | let g:quiet_clock += 61
  call wbx#reaction_history#schedule()
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  let stale_id = g:quiet_requests[-1].id
  let s:state.sending = v:true | call s:publish()
  call wbx#reaction_history#invalidate()
  let before = s:foreground()
  call s:failure(stale_id,'parent:denied')
  call assert_equal(before,s:foreground(),'a fenced old-view failure is quiet before the callback rejects it')
  call assert_equal([],get(get(s:health(),'reaction_reads',{}),'reasons',['missing']),'old-view errors cannot refill diagnostics')
  let s:failures += 1
  call add(s:checks,'stale-view error is silent and cannot revive old diagnostics')

  let attempts = len(g:quiet_requests)
  let s:state.sending = v:false | call s:publish()
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  let s:insert_id = g:quiet_requests[-1].id
  let last = getline('$')
  call cursor(line('$'),1)
  call feedkeys("A typing\<C-r>=WbxQuietInsertFailure()\<CR> continued\<Esc>",'xt')
  call assert_equal(last . ' typing continued',getline('$'),'typing continues without a provider/error insertion')
  call add(s:checks,'Insert-mode callback preserves editing and messages while typing continues')

  " The named explicit command is not marked passive, even after many quiet RPCs.
  let s:state.sending = v:true | call s:publish()
  call win_gotoid(history_window)
  call cursor(b:wbx_message_blocks[0].body,1)
  let before_messages = execute('messages')
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree(),getcurpos()]
  let attempts = len(g:quiet_requests)
  WebexReactions
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  call assert_equal('messages.reactions',g:quiet_requests[-1].method)
  call s:failure(g:quiet_requests[-1].id,'worker:unavailable')
  let new_messages = strpart(execute('messages'),strlen(before_messages))
  call assert_equal(1,len(filter(split(new_messages,"\n"),'v:val =~# "\\[wbx-tui\\]"')),'explicit failure yields one explanation, not silence or duplicates')
  call assert_match('WebexHealth',new_messages,'explicit failure names a local diagnostic action')
  call assert_match('WebexReactions',new_messages,'explicit failure explains deliberate refresh')
  call assert_notmatch('PRIVATE',new_messages,'explicit read feedback also uses a finite reason, never a provider body')
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),getcurpos()])
  call add(s:checks,'explicit :WebexReactions retains one sanitized actionable explanation')

  " A local policy label must never suppress mutations or unrelated RPC errors.
  for method in ['messages.reactionPrepare','messages.reactionSubmit','rooms.refresh']
    let id = wbx#rpc(method,{},function('s:ack'),'passive-reactions')
    let before = execute('messages')
    call wbx#_receive({'jsonrpc':'2.0','id':id,'error':{'code':-32000,'message':method . ' explicit/uncertain failure; inspect exact target'}})
    call assert_match('explicit/uncertain failure',strpart(execute('messages'),strlen(before)),method . ': policy is limited to reaction reads')
  endfor
  call add(s:checks,'mutations and unrelated RPC errors cannot opt into quiet reaction-read handling')

  " Invalid success DTOs remain visible protocol failures and disconnect.
  call win_gotoid(foreground_window)
  let s:state.sending = v:false | call s:publish()
  let attempts = len(g:quiet_requests) | let g:quiet_clock += 301
  call wbx#reaction_history#schedule()
  call s:wait('len(g:quiet_requests) == ' . (attempts+1))
  let stale_id = g:quiet_requests[-1].id
  call wbx#_receive({'jsonrpc':'2.0','id':stale_id,'result':{}})
  call assert_equal(1,g:quiet_stops,'passive status never suppresses protocol-invalidating failures')
  call assert_match('Invalid backend protocol',s:health().last_notice)
  let before = s:foreground()
  let attempts = len(g:quiet_requests)
  call assert_equal(-1,wbx#rpc('messages.reactions',{'roomId':'room','messageId':'message','internalConsent':v:true},
        \ function('s:ack'),'passive-reactions'),'disconnected passive reads are refused locally')
  call assert_equal(attempts,len(g:quiet_requests),'passive admission cannot start, reconnect or queue a backend request')
  call s:failure(stale_id,'parent:denied')
  call assert_equal(before,s:foreground(),'late/duplicate quiet replies cannot replace the protocol error or foreground work')
  call assert_equal(0,g:quiet_starts)
  call add(s:checks,'malformed DTO remains a foreground protocol failure; disconnected/late passive work stays fenced')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
let g:quiet_running = 0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'passiveFailures':s:failures,
      \ 'syntheticRequests':len(g:quiet_requests),'backendStarts':g:quiet_starts,'notifications':g:quiet_notifications})],$WBX_EDITOR_RESULT)
qa!
