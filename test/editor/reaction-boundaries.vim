" Inert RPC fault/cancellation harness; no backend, SDK, account or network.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#state() abort','return deepcopy(g:reaction_state)','endfunction',
      \ 'function! wbx#reaction_context() abort','return {}','endfunction',
      \ 'function! wbx#supports_reactions() abort','return g:reaction_supported','endfunction',
      \ 'function! wbx#_protocol_error() abort','let g:reaction_errors += 1','endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'call add(g:reaction_requests, {"method":a:method,"params":deepcopy(a:params),"Callback":a:0 ? a:1 : 0})',
      \ 'return len(g:reaction_requests)','endfunction'],s:stub . '/autoload/wbx.vim')
call writefile(['function! wbx#chooser#select(lines, Callback) abort',
      \ 'let g:reaction_pick = {"lines":a:lines,"Callback":a:Callback}','endfunction'],s:stub . '/autoload/wbx/chooser.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'reactions':0}
let g:reaction_state = {'state':'ready','ready':v:true,'room':{'id':'private-space','title':'Selected','type':'group'},
      \ 'localContext':{'sessionId':repeat('a',32)},'messages':[{'id':'first'},{'id':'second'}]}
let g:reaction_supported = 1 | let g:reaction_errors = 0 | let g:reaction_requests = []
runtime autoload/wbx/reactions.vim
let s:sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reactions.vim$"')[0].sid
let g:reaction_confirm = 1 | let g:reaction_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:reaction_prompts,a:text)\nreturn g:reaction_confirm\nendfunction"
function! s:last(method) abort
  return filter(copy(g:reaction_requests),'v:val.method ==# a:method')[-1]
endfunction
function! s:reply(method, value) abort
  call call(s:last(a:method).Callback,[{'result':a:value}])
endfunction
function! s:context() abort
  return {'contextId':repeat('a',32),'roomId':'private-space','messageId':'first','action':'add','reaction':'heart','label':'Heart','expiresAt':localtime()*1000+30000}
endfunction
function! s:prepare() abort
  call wbx#reactions#choose('add')
  call assert_notmatch('private-space',join(g:reaction_pick.lines,' '))
  call call(g:reaction_pick.Callback,[2])
  call s:reply('messages.reactionPrepare',s:context())
endfunction
function! s:clean() abort
  call setline(1,['First message','Second message'])
  setlocal nomodified
  let b:wbx_render_tick = b:changedtick
  call cursor(1,1)
endfunction
try
  call wbx#state()
  enew | file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'private-space'
  let b:wbx_message_blocks = [{'id':'first','start':1,'end':1},{'id':'second','start':2,'end':2}]
  call s:clean()
  let before = [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat]
  call wbx#reactions#show() | call assert_equal([],g:reaction_requests,'explicit opt-out is honored')
  call remove(g:wbx_tui,'reactions')
  call assert_equal('',wbx#reactions#reason(),'omitted native option defaults on')
  let g:reaction_supported = 0
  call wbx#reactions#choose('add') | call assert_equal([],g:reaction_requests,'old backend no fallback')
  let g:reaction_supported = 1
  call wbx#reactions#choose('add')
  call cursor(2,1) | call call(g:reaction_pick.Callback,[2])
  call assert_equal([],g:reaction_requests,'cursor target change rejects delayed choice')
  call cursor(1,1)
  call wbx#reactions#choose('add')
  call call(g:reaction_pick.Callback,[0])
  call assert_equal(0,len(filter(copy(g:reaction_requests),'v:val.method ==# "messages.reactionSubmit"')))
  for text in ["\<CR>","not-an-emoji\<CR>"]
    let requests = len(g:reaction_requests)
    call wbx#reactions#choose('add')
    call feedkeys(text,'t')
    call call(g:reaction_pick.Callback,[8])
    sleep 10m
    call assert_equal(requests,len(g:reaction_requests),'empty/invalid custom emoji input never prepares or submits')
  endfor
  call s:prepare()
  call assert_equal([],g:reaction_prompts,'the explicit emoji choice is the complete write consent')
  let request = s:last('messages.reactionSubmit')
  call assert_true(request.params.confirmed) | call assert_true(request.params.internalConsent)
  let requests = len(g:reaction_requests)
  call s:reply('messages.reactionPrepare',s:context())
  call assert_equal(requests,len(g:reaction_requests),'a duplicate preparation reply cannot send twice')
  let outcome = extend(s:context(),{'requestId':request.params.requestId,'status':'unknown','notice':'Unknown; inspect exact target'})
  for key in ['reaction','label','expiresAt'] | call remove(outcome,key) | endfor
  call s:reply('messages.reactionSubmit',outcome)
  let s:request_count = len(g:reaction_requests)
  call wbx#reactions#choose('add') | call assert_equal(s:request_count,len(g:reaction_requests),'unknown blocks fresh request IDs')
  let g:reaction_confirm = 0
  call wbx#reactions#resolve() | call assert_equal(s:request_count,len(g:reaction_requests))
  let g:reaction_confirm = 1
  call wbx#reactions#resolve()
  call assert_equal(request.params.requestId,s:last('messages.reactionResolve').params.requestId)
  call assert_true(s:last('messages.reactionResolve').params.checked)
  call s:reply('messages.reactionResolve',v:null)
  call assert_equal(s:request_count+1,len(g:reaction_requests),'inspection does not replay')
  call s:prepare()
  let request = s:last('messages.reactionSubmit')
  call wbx#reactions#invalidate()
  let outcome.requestId = request.params.requestId | let outcome.status = 'changed'
  call call(request.Callback,[{'result':outcome}])
  let s:request_count = len(g:reaction_requests)
  call wbx#reactions#choose('add') | call assert_equal(s:request_count,len(g:reaction_requests),'late old ACK cannot retire disconnect uncertainty')
  call wbx#reactions#resolve()
  call assert_equal(request.params.requestId,s:last('messages.reactionResolve').params.requestId)
  call s:reply('messages.reactionResolve',v:null)
  call assert_equal(before,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat],'all faults preserve native state/full undo')
  call wbx#reactions#choose('add')
  call call(g:reaction_pick.Callback,[2])
  call setline(1,'New native annotation')
  call s:reply('messages.reactionPrepare',s:context())
  call assert_equal('messages.reactionDiscard',g:reaction_requests[-1].method,'text changes during preparation revoke authority')
  call assert_equal('New native annotation',getline(1))
  call assert_match('unchanged',wbx#reactions#reason())
  call s:clean()
  let snapshot = {'roomId':'private-space','messageId':'first','observedAt':1,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':'heart','label':'Heart','own':repeat('b',32)}]}
  call assert_true(wbx#protocol#reactions(snapshot))
  for reaction in ['🔥','👩🏽‍💻','🇫🇷','👍🏿','1️⃣','🏳️‍🌈']
    call assert_true(wbx#protocol#reaction_name(reaction),reaction)
    call assert_true(wbx#protocol#reactions(extend(deepcopy(snapshot),{'groups':[{'reaction':reaction,'label':reaction}]})),reaction)
  endfor
  for reaction in ['hello','🔥text',"🔥\n","🔥\e","🔥\u202e",'__proto__',repeat('🔥',100)]
    call assert_false(wbx#protocol#reaction_name(reaction),string(reaction))
  endfor
  let g:reaction_pick = {}
  call wbx#reactions#choose('remove')
  call s:reply('messages.reactions',snapshot)
  call assert_equal({},g:reaction_pick,'exactly one verified own type skips the picker')
  call assert_equal('remove',s:last('messages.reactionPrepare').params.action)
  let removal = extend(s:context(),{'action':'remove'})
  call s:reply('messages.reactionPrepare',removal)
  let removed = extend(copy(outcome),{'action':'remove','requestId':s:last('messages.reactionSubmit').params.requestId,'status':'changed'})
  call s:reply('messages.reactionSubmit',removed)
  call wbx#reactions#choose('remove')
  let multiple = deepcopy(snapshot)
  call add(multiple.groups,{'reaction':'🔥','label':'🔥','own':repeat('c',32)})
  call s:reply('messages.reactions',multiple)
  call assert_equal(['Remove your verified reaction:','♥️ Heart','🔥'],g:reaction_pick.lines,'multiple own types retain an explicit choice')
  call call(g:reaction_pick.Callback,[0])
  let requests = len(g:reaction_requests)
  call wbx#reactions#choose('remove')
  let display_only = deepcopy(snapshot) | call remove(display_only.groups[0],'own') | let display_only.groups[0].mine = v:true
  call s:reply('messages.reactions',display_only)
  call assert_equal(requests+1,len(g:reaction_requests),'one mine marker without a fresh handle never authorizes removal')
  for bad in [extend(deepcopy(snapshot),{'groups':[{'reaction':'heart','label':'Forged'}]}),
        \ extend(deepcopy(snapshot),{'groups':repeat(snapshot.groups,2)}),
        \ extend(deepcopy(snapshot),{'partial':1}),extend(deepcopy(snapshot),{'secret':'PRIVATE'})]
    call assert_false(wbx#protocol#reactions(bad))
  endfor
  call assert_true(wbx#protocol#reaction_context(s:context()))
  call assert_true(wbx#protocol#reaction_failure('parent:denied'))
  call assert_true(wbx#protocol#reaction_failure('admission:denied'))
  call assert_true(wbx#protocol#reaction_failure('context:unverified'))
  for reason in ['parent:denied:PRIVATE','parent:https://private.invalid','worker:PRIVATE',{}]
    call assert_false(wbx#protocol#reaction_failure(reason))
  endfor
  call assert_true(wbx#protocol#reaction_outcome(outcome))
  call assert_false(wbx#protocol#reaction_outcome(extend(copy(outcome),{'action':'delete'})))
  call assert_equal(0,g:reaction_errors)
  if $WBX_EDITOR_SCREEN ==# '1' | redraw! | endif
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
