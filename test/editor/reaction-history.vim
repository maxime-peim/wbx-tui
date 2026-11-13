" Inline read-only snapshots: actual native virtual text, inert RPC/service.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=35 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload','p')
call writefile(['function! wbx#reaction_context() abort','return deepcopy(g:inline_context)','endfunction',
      \ 'function! wbx#cached_reactions() abort','return deepcopy(get(g:,"inline_saved",[]))','endfunction',
      \ 'function! wbx#rpc(method, params, Callback, ...) abort',
      \ 'call add(g:inline_requests,{"method":a:method,"params":deepcopy(a:params),"Callback":a:Callback,"policy":a:0 ? a:1 : ""})',
      \ 'return len(g:inline_requests)','endfunction',
      \ 'function! wbx#_protocol_error() abort','let g:inline_errors += 1','endfunction'],s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:inline_context = {'enabled':1,'available':1,'sending':0,'sessionId':repeat('a',32),'roomId':'room','epoch':1}
let g:inline_requests = [] | let g:inline_errors = 0
call wbx#reaction_context()
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 4 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:answer(index, groups, ...) abort
  let request = g:inline_requests[a:index]
  call assert_equal('passive-reactions',request.policy,'background single reads explicitly request local quiet handling')
  let snapshot = extend(copy(request.params),{'groups':a:groups,'observedAt':localtime()*1000,'partial':v:true,'unknown':v:false})
  call remove(snapshot,'internalConsent')
  if has_key(snapshot,'selfSummary') | call remove(snapshot,'selfSummary') | endif
  call call(request.Callback,[a:0 ? a:1 : {'result':snapshot}])
endfunction
function! s:batch_answer(index) abort
  let request = g:inline_requests[a:index]
  call assert_equal('passive-reactions',request.policy,'background batches explicitly request local quiet handling')
  let items = map(copy(request.params.messageIds),'{"roomId":request.params.roomId,"messageId":v:val,"observedAt":1,"partial":v:true,"unknown":v:false,"groups":[{"reaction":"celebrate","label":"Celebrate"}]}')
  call call(request.Callback,[{'result':{'roomId':request.params.roomId,'items':items}}])
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat,winsaveview()]
endfunction
function! s:idle() abort
  let g:inline_idle += 1
endfunction
function! s:marks() abort
  if has('nvim')
    return nvim_buf_get_extmarks(0,nvim_create_namespace('wbx-history-reactions'),0,-1,{'details':v:true})
  endif
  let found = []
  let types = filter(['WbxHistoryReactions','WbxHistoryReactionsOwn','WbxHistoryReactionsMuted'],'!empty(prop_type_get(v:val))')
  for row in range(1,line('$')) | call extend(found,prop_list(row,{'types':types})) | endfor
  return found
endfunction
try
  enew | file wbx://history
  setlocal buftype=nofile nonumber norelativenumber signcolumn=no
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let lines = [] | let b:wbx_message_blocks = []
  for i in range(100)
    call extend(lines,['Author ' . i,'Actual message ' . i,''])
    call add(b:wbx_message_blocks,{'id':'message-' . i,'start':i*3+1,'body':i*3+2,'end':i*3+3,'key':'content-' . i})
  endfor
  call setline(1,lines)
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  call feedkeys("\<Esc>",'xt') | normal! ggzt
  redraw!
  let native = s:native()
  let g:inline_context.available = 0 | let g:inline_context.connecting = 1
  call wbx#reaction_history#schedule()
  sleep 220m
  call assert_equal([],g:inline_requests,'connecting source must not be probed')
  call assert_equal({},get(b:,'wbx_reaction_decorations',{}),'initial connection is pending, not a failed cached summary')
  let g:inline_context.available = 1 | let g:inline_context.connecting = 0
  let g:inline_context.self_summary = 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 1')
  call assert_equal('messages.reactions',g:inline_requests[0].method)
  call assert_true(g:inline_requests[0].params.internalConsent)
  call assert_true(g:inline_requests[0].params.selfSummary,'display-only own evidence is explicitly requested only by a supported client')
  call assert_equal('message-0',g:inline_requests[0].params.messageId,'first visible exact message')
  call assert_true(len(w:wbx_reaction_visible) <= 8,'a split never admits the entire 100-message history')
  for _ in range(60) | call wbx#reaction_history#schedule() | endfor
  call assert_equal(1,len(g:inline_requests),'motion bursts share one outstanding read')
  let heart = {'reaction':'heart','label':'Heart','count':3,'own':repeat('b',32)}
  call s:answer(0,[heart])
  call assert_equal('♥️ 3 (you)',b:wbx_reaction_decorations['message-0'].text,'own markers never depend on color alone')
  call assert_equal(3,b:wbx_reaction_decorations['message-0'].row,'footer belongs to this message, not the next body')
  call assert_equal(native,s:native(),'background callbacks preserve full native text/undo/focus/view/breakat')
  call assert_equal(1,len(s:marks()))
  if has('nvim')
    let mark = s:marks()[0]
    call assert_equal([['  ♥️ 3 (you)','WbxHistoryReactionsOwn']],mark[3].virt_lines[0])
    call assert_false(get(mark[3],'virt_lines_above',v:false))
    call assert_equal(1,mark[1],'reaction is below the last body line, leaving the blank separator untouched')
  else
    let prop = prop_list(1,{'end_lnum':-1,'types':['WbxHistoryReactionsOwn']})[0]
    call assert_equal('below',prop.text_align)
    call assert_equal(2,prop.lnum)
  endif
  let empty_snapshot = {'roomId':'room','messageId':'message-0','observedAt':localtime()*1000,'groups':[],'partial':v:true,'unknown':v:true}
  call wbx#reaction_history#accept(empty_snapshot)
  call assert_false(has_key(b:wbx_reaction_decorations,'message-0'),'an incomplete empty read is quiet, not an unknown/zero footer')
  call assert_equal([],s:marks())
  call assert_true(empty_snapshot.partial && empty_snapshot.unknown,'quiet presentation must not turn missing data into authoritative absence')
  call wbx#reaction_history#accept(extend(copy(empty_snapshot),{'groups':[heart]}))
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let row = screenpos(win_getid(),3,1).row - 1
    let visible = join(map(range(1,40),'screenstring(row,v:val)'),'')
    call assert_match('♥️ 3',visible,'reaction is visibly drawn inline without a command')
    let gap = screenpos(win_getid(),3,1).row
    call assert_match('^\s*$',join(map(range(1,40),'screenstring(gap,v:val)'),''))
    call assert_true(screenpos(win_getid(),4,1).row >= screenpos(win_getid(),2,1).row + 3,'message body, reaction and blank gap have separate screen rows')
  endif
  let example = {'roomId':'room','messageId':'message-0','observedAt':localtime()*1000,'partial':v:true,'unknown':v:false,
        \ 'groups':[{'reaction':'heart','label':'Heart','count':3,'mine':v:true},{'reaction':'thumbsup','label':'Thumbs up','count':4}]}
  call wbx#reaction_history#accept(example)
  let badge = b:wbx_reaction_decorations['message-0']
  call assert_equal('♥️ 3 (you) | 👍 4',badge.text)
  call assert_equal('WbxHistoryReactionsOwn',badge.chunks[0][0][1],'self-summary display evidence gets a highlight without a removal handle')
  call assert_equal('WbxHistoryReactions',badge.chunks[-1][-1][1],'other people reactions are not highlighted as mine')
  call assert_equal(synIDtrans(hlID('WbxHistoryReactions')),synIDtrans(hlID('WbxHistoryReactionsOwn')),'(you), not an orange background, identifies own reactions')
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let body = screenpos(win_getid(),2,1).row
    let gap = screenpos(win_getid(),3,1).row
    let rendered = []
    for row in range(body+1,gap-1)
      call add(rendered,join(map(range(1,60),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('♥️ 3 (you)',join(rendered,"\n"),'your reaction is visibly labeled in inline history, not only in metadata or a people list')
    call assert_match('👍 4',join(rendered,"\n"),'other reactions remain visible alongside yours')
    call assert_notmatch('👍 4 (you)',join(rendered,"\n"),'other reactions must not inherit the own marker')
  endif
  let applied = {'contextId':repeat('a',32),'roomId':'room','messageId':'message-0','action':'add',
        \ 'reaction':'thumbsup','label':'Thumbs up','expiresAt':localtime()*1000+30000}
  call wbx#reaction_history#applied(applied)
  call assert_equal('♥️ 3 (you) | 👍 5 (you)',b:wbx_reaction_decorations['message-0'].text,'confirmed own Add increments the last known count')
  call assert_equal('WbxHistoryReactionsOwn',b:wbx_reaction_decorations['message-0'].chunks[-1][-1][1])
  call wbx#reaction_history#applied(applied)
  call assert_equal('♥️ 3 (you) | 👍 5 (you)',b:wbx_reaction_decorations['message-0'].text,'already-owned/replayed Add does not increment again')
  let unknown_add = extend(copy(applied),{'reaction':'smiley','label':'Smile'})
  call wbx#reaction_history#applied(unknown_add)
  call assert_equal('♥️ 3 (you) | 👍 5 (you) | 🙂 1 (you)',b:wbx_reaction_decorations['message-0'].text,'a confirmed Add without a total shows your known contribution, not an unknown placeholder')
  let unknown_add.action = 'remove'
  call wbx#reaction_history#applied(unknown_add)
  let applied.action = 'remove'
  call wbx#reaction_history#applied(applied)
  call assert_equal('♥️ 3 (you) | 👍',b:wbx_reaction_decorations['message-0'].text,'removal preserves other shared groups without guessing a new total')
  let applied.action = 'add'
  for [total,mine,expected] in [[0,v:false,'👍 1 (you)'],[9007199254740991,v:false,'👍 1 (you)'],[9007199254740991,v:true,'👍 9007199254740991 (you)']]
    let example.groups = [extend({'reaction':'thumbsup','label':'Thumbs up','count':total},mine ? {'mine':v:true} : {})]
    call wbx#reaction_history#accept(example)
    call wbx#reaction_history#applied(applied)
    call assert_equal(expected,b:wbx_reaction_decorations['message-0'].text,'known count adjustment stays safe at zero/overflow and preserves owned totals')
  endfor
  let example.groups = [{'reaction':'heart','label':'Heart','count':1}]
  call wbx#reaction_history#accept(example)
  call assert_equal('♥️ 1',b:wbx_reaction_decorations['message-0'].text,'a supplied count of one is always visible')
  let example.groups = [heart]
  call wbx#reaction_history#accept(example)
  " Ex-mode Vim reports only its current row as visible. Exercise an actual
  " viewport move rather than pretending hidden rows authorize background reads.
  call cursor(4,1) | normal! zt
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 2')
  let g:inline_idle = 0
  call wbx#reaction_history#suspend(function('s:idle'))
  call assert_equal(0,g:inline_idle,'explicit action waits for the outstanding read, not a busy mutation failure')
  let history_window = win_getid()
  vnew
  file unrelated-native-draft.txt
  call setline(1,'Independent unsent native work')
  call feedkeys("i\<Esc>",'xt')
  let independent = s:native()
  call s:answer(1,[{'reaction':'thumbsup','label':'Thumbs up'}])
  call assert_equal(1,g:inline_idle)
  call assert_equal(independent,s:native(),'background painting in another split never replaces/focuses unrelated work')
  close!
  call win_gotoid(history_window)
  let attempts = len(g:inline_requests)
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'picker/confirmation suspends passive reads')
  let painted = deepcopy(b:wbx_reaction_decorations)
  call s:answer(0,[])
  call assert_equal(painted,b:wbx_reaction_decorations,'duplicate/late responses cannot overwrite newer state')
  " A same-message native redraw moves decorations, not the body/copy text.
  setlocal modifiable
  call append(0,['New header','Native metadata',''])
  for block in b:wbx_message_blocks
    let block.start += 3 | let block.body += 3 | let block.end += 3
  endfor
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  call wbx#reaction_history#resume()
  call s:wait('get(get(get(b:,"wbx_reaction_decorations",{}),"message-0",{}),"row",0) == 6')
  call assert_equal('Actual message 0',getline(5))
  call assert_notmatch('♥️',join(getline(1,'$'),"\n"))
  " Changing selected source discards old cache and fences a pending result.
  call cursor(b:wbx_message_blocks[2].start,1) | normal! zt
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) > ' . attempts)
  let old = len(g:inline_requests)-1
  let g:inline_context.epoch += 1 | let g:inline_context.available = 0
  call wbx#reaction_history#schedule()
  sleep 220m
  call s:answer(old,[heart])
  call assert_true(empty(filter(values(get(b:,'wbx_reaction_decorations',{})),'v:val.text =~# "♥️"')),'old-source reply cannot repaint as fresh')
  call assert_notmatch('unavailable',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '),'passive unavailability is health-only')
  let attempts = len(g:inline_requests)
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'missing SDK does not probe or register anything')
  let g:inline_context.available = 1 | let g:inline_context.epoch += 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) > ' . attempts)
  let request = len(g:inline_requests)-1
  call s:answer(request,[],{'error':{'code':-32034,'message':'Reaction summary unavailable (parent:denied). PRIVATE service detail must never be copied.'}})
  call assert_equal(['parent:denied'],wbx#reaction_history#diagnostics().reasons,'a fixed read failure category remains in health, not a message footer')
  call assert_notmatch('PRIVATE',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  let attempts = len(g:inline_requests)
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'failed automatic read imposes cooldown, not a viewport probe storm')
  for reason in ['admission:denied','summary:unverified','summary:unavailable']
    let attempts = len(g:inline_requests)
    let g:inline_context.epoch += 1
    call wbx#reaction_history#schedule()
    call s:wait('len(g:inline_requests) > ' . attempts)
    call s:answer(len(g:inline_requests)-1,[],{'error':{'code':-32034,'message':'Reaction summary unavailable (' . reason . '). PRIVATE must remain hidden.'}})
    call assert_equal([reason],wbx#reaction_history#diagnostics().reasons,'local failures retain their fixed health category')
    call assert_notmatch('PRIVATE',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  endfor
  let attempts = len(g:inline_requests)
  let g:inline_context.enabled = 0
  call wbx#reaction_history#schedule()
  call assert_equal({},b:wbx_reaction_decorations,'opt-out removes inline metadata')
  call assert_equal([],s:marks())
  let g:inline_context.enabled = 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) > ' . attempts)
  let request = len(g:inline_requests)-1
  setlocal modifiable
  call setline(1,'User annotation retained')
  let annotated = s:native()
  call s:answer(request,[heart])
  call assert_equal({},b:wbx_reaction_decorations,'annotations never receive stale row decorations')
  call assert_equal(annotated,s:native())
  file my-history-notes.txt
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal({},b:wbx_reaction_decorations,'promoted buffers stay ordinary native text')
  " Negotiated viewport batches publish together and remain stable across the
  " old 30-second expiry window. Clock control, never a multi-minute test sleep.
  call wbx#reaction_history#invalidate()
  let g:inline_context.batch = 1
  let g:inline_context.progressive = 1
  let g:inline_context.epoch += 1
  let g:inline_requests = []
  enew | file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let b:wbx_message_blocks = [] | let lines = []
  for i in range(8)
    call extend(lines,['Author','Body ' . i,''])
    call add(b:wbx_message_blocks,{'id':'batch-' . i,'start':i*3+1,'body':i*3+2,'end':i*3+3,'key':'batch-content-' . i})
  endfor
  call setline(1,lines)
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  call feedkeys("\<Esc>",'xt') | normal! ggzt
  redraw!
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reaction_history.vim$"')[0].sid
  let g:inline_clock = localtime()
  execute 'function! <SNR>' . sid . "_now() abort\nreturn g:inline_clock\nendfunction"
  let native = s:native()
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 1')
  call assert_equal('messages.reactionsBatch',g:inline_requests[0].method)
  let batch_count = len(g:inline_requests[0].params.messageIds)
  call assert_true(batch_count > 0 && batch_count <= 8)
  if $WBX_EDITOR_SCREEN ==# '1' | call assert_equal(8,batch_count,'one drawn viewport requests all eight visible targets together') | endif
  call assert_equal({},get(b:,'wbx_reaction_decorations',{}),'no per-message loading repaint')
  call assert_true(g:inline_requests[0].params.progressive,'progress is requested only after feature negotiation')
  let progress = {'requestId':1,'snapshot':{'roomId':g:inline_requests[0].params.roomId,
        \ 'messageId':g:inline_requests[0].params.messageIds[0],'observedAt':g:inline_clock*1000,
        \ 'partial':v:true,'unknown':v:false,'groups':[{'reaction':'celebrate','label':'Celebrate'}]}}
  call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'messages.reactionProgress','params':progress}))
  let forged = deepcopy(progress) | let forged.snapshot.groups[0].own = repeat('a',32)
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'messages.reactionProgress','params':forged}))
  let late = deepcopy(progress) | let late.requestId = 999
  call wbx#reaction_history#progress(late)
  call assert_equal({},b:wbx_reaction_decorations,'unrelated RPC progress cannot address the current viewport')
  call wbx#reaction_history#progress(progress)
  call assert_equal(1,len(b:wbx_reaction_decorations),'the first completed target paints before the held batch result')
  call assert_match('🎉',b:wbx_reaction_decorations[progress.snapshot.messageId].text)
  call assert_equal(native,s:native(),'progress painting preserves native text/full undo/focus/view/breakat')
  for _ in range(5) | call wbx#reaction_history#schedule() | endfor
  sleep 220m
  call assert_equal(1,len(g:inline_requests),'a progress notification does not release the held request')
  call wbx#reaction_history#progress(progress)
  call assert_equal(1,len(b:wbx_reaction_decorations),'duplicate progress is inert')
  call s:batch_answer(0)
  call assert_equal(batch_count,len(b:wbx_reaction_decorations),'whole returned viewport paints in one callback')
  call assert_match('🎉',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  call assert_notmatch('STALE\|unknown',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  call assert_notmatch('?',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '),'unknown totals do not add counter placeholders to badges')
  call assert_equal(native,s:native(),'batch painting preserves native text/undo/focus/view')
  let stable = deepcopy(b:wbx_reaction_decorations)
  let g:inline_clock += 61
  for _ in range(10) | call wbx#reaction_history#schedule() | endfor
  sleep 220m
  call assert_equal(1,len(g:inline_requests),'unchanged snapshots are not reloaded after 30 seconds')
  call assert_equal(stable,b:wbx_reaction_decorations,'cached labels do not flicker to STALE')
  let g:inline_clock += 240
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 2')
  call assert_equal(stable,b:wbx_reaction_decorations,'five-minute refresh keeps the last observation visible')
  call s:batch_answer(1)
  let g:inline_clock += 301
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 3')
  call call(g:inline_requests[2].Callback,[{'error':{'code':-32034,'message':'Reaction summary unavailable (parent:denied). PRIVATE'}}])
  call assert_match('🎉',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '),'failed refresh retains verified labels')
  call assert_notmatch('cached',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  call assert_true(empty(filter(values(copy(b:wbx_reaction_decorations)),'v:val.group !=# "WbxHistoryReactionsMuted"')),'staleness remains styled, never freshened')
  call assert_notmatch('PRIVATE\|STALE',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '))
  " Switching spaces must drain the old physical read, rather than forgetting
  " it and caching a worker:busy failure in the freshly opened space.
  call wbx#reaction_history#invalidate()
  let g:inline_context.sessionId = repeat('b',32)
  let g:inline_context.epoch += 1
  let g:inline_requests = []
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 1')
  let g:inline_context.enabled = 0
  call wbx#reaction_history#schedule()
  let g:inline_context.roomId = 'next-room' | let b:wbx_history_room = 'next-room'
  let g:inline_context.enabled = 1 | let g:inline_context.epoch += 1
  call wbx#reaction_history#schedule()
  sleep 220m
  call assert_equal(1,len(g:inline_requests),'new space waits for the previous admitted read, not a busy response')
  call s:batch_answer(0)
  call s:wait('len(g:inline_requests) == 2')
  call assert_equal('next-room',g:inline_requests[1].params.roomId)
  call assert_equal({},get(b:,'wbx_reaction_decorations',{}),'old-room completion cannot repaint this room')
  call s:batch_answer(1)
  " A new backend session cannot remain blocked behind a vanished old callback.
  let g:inline_context.epoch += 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 3')
  let g:inline_context.enabled = 0
  call wbx#reaction_history#schedule()
  let g:inline_context.sessionId = repeat('c',32)
  let g:inline_context.enabled = 1 | let g:inline_context.epoch += 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == 4')
  call s:batch_answer(2)
  call assert_equal({},get(b:,'wbx_reaction_decorations',{}))
  call s:batch_answer(3)
  " A genuinely transient read refusal gets a short, bounded read-only retry.
  for reason in ['worker:busy','context:unverified','admission:busy']
    let before = len(g:inline_requests)
    let g:inline_context.epoch += 1
    call wbx#reaction_history#schedule()
    call s:wait('len(g:inline_requests) > ' . before)
    call call(g:inline_requests[-1].Callback,[{'error':{'code':-32034,'message':'Reaction summary unavailable (' . reason . '). Nothing was sent or acknowledged.'}}])
    call assert_equal({},get(b:,'wbx_reaction_decorations',{}),'cold-open deferral is not an unavailable badge')
    if reason ==# 'worker:busy' | sleep 220m | endif
    let g:inline_clock += 2
    if reason !=# 'worker:busy' | call wbx#reaction_history#schedule() | endif
    call s:wait('len(g:inline_requests) == ' . (before+2))
    call s:batch_answer(len(g:inline_requests)-1)
    call assert_match('🎉',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '),'first read recovers without five-minute refresh')
  endfor
  let g:inline_context.epoch += 1
  let before = len(g:inline_requests)
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) > ' . before)
  for attempt in range(4)
    call call(g:inline_requests[-1].Callback,[{'error':{'code':-32034,'message':'Reaction summary unavailable (worker:busy). Nothing was sent or acknowledged.'}}])
    if attempt < 3
      let g:inline_clock += 2
      call wbx#reaction_history#schedule()
      call s:wait('len(g:inline_requests) == ' . (before+attempt+2))
    endif
  endfor
  let attempts = len(g:inline_requests)
  let g:inline_clock += 2
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'persistent busy is bounded, not a probe storm')
  call assert_equal(['worker:busy'],wbx#reaction_history#diagnostics().reasons,'passive failure details remain available in health')
  call assert_equal({},b:wbx_reaction_decorations,'even sustained passive errors add no unavailable footers')
  let g:inline_clock += 57
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'failed observations remain ineligible before 60 seconds')
  let g:inline_clock += 2
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == ' . (attempts+1))
  call s:batch_answer(attempts)
  call assert_notmatch('unavailable',join(map(values(b:wbx_reaction_decorations),'v:val.text'),' '),'failure expiry is one minute, not the five-minute success TTL')
  " Mixed results must not reread successful siblings at the negative deadline.
  let g:inline_clock += 301
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == ' . (attempts+2))
  let request = g:inline_requests[-1]
  let failed_id = request.params.messageIds[0]
  let items = map(copy(request.params.messageIds),'{"roomId":request.params.roomId,"messageId":v:val,"observedAt":1,"partial":v:true,"unknown":v:false,"groups":[{"reaction":"celebrate","label":"Celebrate"}]}')
  let items[0] = {'messageId':failed_id,'reason':'parent:denied'}
  call call(request.Callback,[{'result':{'roomId':request.params.roomId,'items':items}}])
  call assert_equal('WbxHistoryReactionsMuted',b:wbx_reaction_decorations[failed_id].group)
  let g:inline_clock += 61
  call wbx#reaction_history#schedule()
  call s:wait('len(g:inline_requests) == ' . (attempts+3))
  call assert_equal([failed_id],g:inline_requests[-1].params.messageIds,'only failed targets become eligible after 60 seconds')
  call s:batch_answer(len(g:inline_requests)-1)
  call wbx#reaction_history#invalidate()
  let g:inline_saved = []
  for block in b:wbx_message_blocks
    call add(g:inline_saved,{'roomId':g:inline_context.roomId,'messageId':block.id,'observedAt':g:inline_clock*1000,
          \ 'partial':v:true,'unknown':v:false,'groups':[{'reaction':'heart','label':'Heart','count':3,'mine':v:true}]})
  endfor
  let attempts = len(g:inline_requests)
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts,len(g:inline_requests),'fresh restored observations avoid an immediate duplicate passive GET')
  call assert_equal('WbxHistoryReactionsMuted',values(b:wbx_reaction_decorations)[0].group)
  let g:inline_saved = []
  call wbx#reaction_history#schedule()
  call assert_equal({},b:wbx_reaction_decorations,'expired/cleared backend snapshots remove restored-only decorations')
  call assert_equal(0,g:inline_errors)
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#reaction_history#invalidate()
call writefile([json_encode({'errors':v:errors,'messages':execute('messages'),'visible':get(w:,'wbx_reaction_visible',[]),'requests':len(g:inline_requests)})],$WBX_EDITOR_RESULT)
qa!
