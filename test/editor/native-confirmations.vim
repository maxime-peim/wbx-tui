" Real confirm() + real send/action/reaction controllers; inert transport/menu.
" Keyboard acceptance is drawn-PTY-only. Headless mode checks Enter/write only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
set ttimeout ttimeoutlen=10
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:native_confirm_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:native_confirm_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:native_confirm_starts+=1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:native_confirm_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
" Pick Heart deterministically; final consent is NEVER stubbed/redefined.
call writefile(['function! wbx#chooser#select(lines, Callback) abort',
      \ 'let g:native_confirm_menu={"lines":a:lines,"Callback":a:Callback}','endfunction'],s:stub.'/autoload/wbx/chooser.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:native_confirm_running=1 | let g:native_confirm_starts=0 | let g:native_confirm_requests=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:dialogs=0 | let s:arms=0 | let s:positive=0
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
function! s:arm(case, steps) abort
  let s:arms+=1 | let s:dialogs+=len(a:steps)
  call writefile([json_encode({'serial':s:arms,'case':a:case,'steps':a:steps})],$WBX_EDITOR_RESULT.'.dialogs-next.json')
  call rename($WBX_EDITOR_RESULT.'.dialogs-next.json',$WBX_EDITOR_RESULT.'.dialogs.json')
endfunction
function! s:step(match, key) abort
  return {'match':a:match,'key':a:key}
endfunction
function! s:last(method) abort
  let found=filter(copy(g:native_confirm_requests),'v:val.method ==# a:method')
  if empty(found) | throw 'Expected inert request: '.a:method | endif
  return found[-1]
endfunction
function! s:reply(request, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':deepcopy(a:value)})
endfunction
function! s:zero(case) abort
  let forbidden=filter(copy(g:native_confirm_requests),
        \ 'index(["messages.actionPrepare","messages.actionDiscard","messages.reactionPrepare","messages.reactionDiscard"],v:val.method)<0')
  call assert_equal([],forbidden,a:case.': no send, mutation, receipt, resolution, preference write or provider lookup')
  call assert_false(wbx#drafts#pending())
  call assert_equal(s:messages,wbx#state().messages,a:case.': no message state change')
endfunction
function! s:enter_write(case) abort
  call feedkeys("\<Esc>",'xt')
  let before=s:native() | let requests=len(g:native_confirm_requests)
  call feedkeys("\<CR>",'xt')
  silent! write
  call assert_equal(before,s:native(),a:case.': Normal Enter/write retain text/full undo/focus/options')
  call assert_equal(requests,len(g:native_confirm_requests))
  call s:zero(a:case)
  call add(s:checks,a:case)
endfunction
function! s:history() abort
  call win_gotoid(s:history_window)
  call cursor(b:wbx_message_blocks[0].body,1)
  call feedkeys("\<Esc>",'xt')
endfunction
function! s:message_context(action) abort
  return {'contextId':repeat(a:action==# 'delete' ? 'd' : 'e',32),'roomId':'confirm-room','messageId':'confirm-message',
        \ 'action':a:action,'content':'Original message','format':'plain','expiresAt':localtime()*1000+60000}
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_layout'),[])
  let state={'revision':1,'state':'ready','mode':'live','ready':v:true,'sending':v:false,'readStatus':'off',
        \ 'room':{'id':'confirm-room','title':'Synthetic confirmation target','type':'group'},
        \ 'rooms':[{'id':'confirm-room','title':'Synthetic confirmation target','type':'group'}],
        \ 'messages':[{'id':'confirm-message','author':'Synthetic self','text':'Original message','created':'2026-11-17T12:00:00Z','self':v:true}],
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},'sections':{'revision':1,'persistence':'session','items':[]}}
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}) | throw 'Invalid inert confirmation state' | endif
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,'state':state,
        \ 'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','message-actions-v1','markdown-send-v1','local-sections-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1']}}])
  let s:messages=deepcopy(wbx#state().messages)
  let s:history_window=win_findbuf(wbx#buffers().history)[0]
  WebexCompose
  call setline(1,'Unsent native text')
  call s:enter_write('composer-enter-write')
  let original=getline(1,'$')
  call feedkeys("A\<CR>native second line\<Esc>",'xt')
  call assert_equal(['Unsent native text','native second line'],getline(1,'$'),'Insert Enter is a native newline, not Send')
  call s:zero('insert-enter')
  undo
  call assert_equal(original,getline(1,'$'),'native undo reverses only the deliberate native insertion')
  call feedkeys("\<Esc>",'xt')
  call add(s:checks,'insert-enter-and-native-undo')
  let composer=win_getid()

  if $WBX_EDITOR_SCREEN==# '1'
    " Exercise every helper without redefining it. Positive keyboard controls
    " prove the native UI actually consumed input rather than always returning 0.
    for script in ['reactions','message_actions','rich','conversations','uploads','productivity','saved_drafts']
      execute 'runtime autoload/wbx/'.script.'.vim'
      let owner=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/" . script . ".vim$"')[0].sid
      let Confirm=function('<SNR>'.owner.'_confirm')
      for key in ['enter','escape','cancel','accept']
        let text='Native confirmation '.script.' '.key.': inert helper control.'
        call s:arm(script.'/'.key,[s:step(text,key)])
        let before=s:native() | let requests=len(g:native_confirm_requests)
        let answer=Confirm(text)
        call assert_equal(key==# 'accept',answer,script.'/'.key)
        if answer | let s:positive+=1 | endif
        call assert_equal(before,s:native(),'native confirmation retains full text/undo/focus')
        call assert_equal(requests,len(g:native_confirm_requests),'helper controls have no action attached')
        call s:zero(script.'/'.key)
        call add(s:checks,'helper/'.script.'/'.key)
      endfor
    endfor
    WebexFormat markdown
    call setline(1,'Unsent <@all>')
    call feedkeys("\<Esc>",'xt')
    for key in ['enter','escape']
      let before=s:native()
      call s:arm('send-all/'.key,[s:step('ATTENTION: @all notifies the entire space.',key)])
      WebexSend
      call assert_equal(before,s:native(),'@all still needs explicit broadcast consent')
      call s:zero('send-all/'.key)
      call add(s:checks,'send-all/'.key)
    endfor
    call s:history()
    for key in ['enter','escape','cancel']
      let before=s:native()
      WebexDelete
      call s:arm('delete/'.key,[s:step('Delete YOUR message confirm-message',key)])
      call s:reply(s:last('messages.actionPrepare'),s:message_context('delete'))
      call assert_equal('messages.actionDiscard',g:native_confirm_requests[-1].method)
      call assert_equal(before,s:native())
      call s:zero('delete/'.key)
      call add(s:checks,'delete/'.key)
    endfor
  endif
  call s:history()
  WebexEdit
  call s:reply(s:last('messages.actionPrepare'),s:message_context('edit'))
  call setline(1,'Retained edit text')
  call s:enter_write('edit-enter-write')
  if $WBX_EDITOR_SCREEN==# '1'
    for key in ['enter','escape','cancel']
      let before=s:native()
      call s:arm('edit-submit/'.key,[s:step('Edit YOUR message confirm-message',key)])
      WebexEditSubmit
      call assert_equal(before,s:native())
      call s:zero('edit-submit/'.key)
      call add(s:checks,'edit-submit/'.key)
    endfor
  endif
  call s:history()
  call s:enter_write('history-enter-write')
  if $WBX_EDITOR_SCREEN==# '1'
    let before=s:native() | let requests=len(g:native_confirm_requests)
    WebexReactionAdd
    call assert_match('Add experimental reaction',g:native_confirm_menu.lines[0])
    call call(g:native_confirm_menu.Callback,[0])
    call assert_equal(requests,len(g:native_confirm_requests),'canceling the emoji picker admits no reaction')
    call assert_equal(before,s:native())
    call s:zero('reaction-picker-cancel')
    call add(s:checks,'reaction-picker-cancel')
    for key in ['enter','escape','cancel']
      let before=s:native() | let requests=len(g:native_confirm_requests)
      call s:arm('reaction-resolve/'.key,[s:step('Have you inspected EXACT room confirm-room',key)])
      WebexReactionResolve
      call assert_equal(requests,len(g:native_confirm_requests),'cancellation cannot resolve or retire uncertainty')
      call assert_equal(before,s:native())
      call s:zero('reaction-resolve/'.key)
      call add(s:checks,'reaction-resolve/'.key)
    endfor
    let before=s:native()
    WebexReactionAdd
    call call(g:native_confirm_menu.Callback,[2])
    let request=s:last('messages.reactionPrepare') | let requests=len(g:native_confirm_requests)
    call wbx#_receive({'jsonrpc':'2.0','id':request.id,'error':{'code':-32034,
          \ 'message':'Reaction outcome unresolved. Inspect the previous reaction on this exact message in Webex. Nothing was retried.'}})
    call assert_equal(requests,len(g:native_confirm_requests),'uncertainty cannot automatically unlock or replay the chosen reaction')
    call assert_equal(before,s:native())
    call s:zero('reaction-unknown-refusal')
    call add(s:checks,'reaction-unknown-refusal')
    for key in ['enter','escape','cancel']
      let before=s:native() | let requests=len(g:native_confirm_requests)
      call s:arm('sections-clear/'.key,[s:step('Replace current local grouping?',key)])
      call wbx#sections#action('clear','')
      call assert_equal(requests,len(g:native_confirm_requests),'default Cancel/Escape cannot even clear local grouping')
      call assert_equal(before,s:native())
      call s:zero('sections-clear/'.key)
      call add(s:checks,'sections-clear/'.key)
    endfor
    call assert_equal(42,s:dialogs)
    call assert_equal(7,s:positive)
  endif
  call assert_equal(0,g:native_confirm_starts)
  call s:zero('final')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:native_confirm_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'expectedNativeDialogs':s:dialogs,
      \ 'positiveHelperControls':s:positive,'backendStarts':g:native_confirm_starts,
      \ 'keyboardScope':$WBX_EDITOR_SCREEN==# '1' ? 'real native prompts, private PTY input' : 'Enter/write safety only; keyboard acceptance requires drawn mode',
      \ 'requests':map(copy(g:native_confirm_requests),'v:val.method')})],$WBX_EDITOR_RESULT)
qa!
