" Actual UI chooser handoffs against inert state/RPC; no provider or editor reload.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:chooser_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#redraw() abort', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#meeting_state() abort', 'return deepcopy(g:chooser_meeting)', 'endfunction',
      \ 'function! wbx#meeting_supports(capability, ...) abort', 'return 1', 'endfunction',
      \ 'function! wbx#meeting_epoch() abort', 'return g:chooser_epoch', 'endfunction',
      \ 'function! wbx#_meeting_pending() abort', 'return wbx#meeting_action#pending(g:chooser_meeting_action)', 'endfunction',
      \ 'function! wbx#_meeting_reset() abort', 'call wbx#meeting_action#reset(g:chooser_meeting_action)', 'endfunction',
      \ 'function! wbx#_meeting_pane(origin, epoch, meeting, intents, choice) abort',
      \ 'let g:chooser_meeting_action.meeting=extend(deepcopy(g:chooser_meeting),{"active":v:true,"ready":v:true})',
      \ 'let g:chooser_meeting_action.epoch=g:chooser_epoch',
      \ 'call wbx#meeting_action#pane(g:chooser_meeting_action,a:origin,a:epoch,a:meeting,a:intents,a:choice)', 'endfunction',
      \ 'function! wbx#_chooser_ready() abort', 'return 1', 'endfunction',
      \ 'function! wbx#_chooser_disconnected() abort', 'return 0', 'endfunction',
      \ 'function! wbx#_chooser_capabilities() abort', 'return ["meeting-panes-v1"]', 'endfunction',
      \ 'function! wbx#_chooser_notice(text) abort', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Unexpected protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'call add(g:chooser_requests, [a:method, deepcopy(a:params)])',
      \ 'if a:0 && a:method ==# "meeting.pane"',
      \ 'call call(a:1, [{"result":{"session":a:params.session,"revision":a:params.intent.revision,"action":a:params.intent.action,"status":"applied"}}])',
      \ 'endif', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'notifications':0, 'people_status':0}
let g:chooser_state = {'state':'ready','ready':v:true,'room':{'id':'private-room-id','title':'Room','type':'group'},
      \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},
      \ 'sections':{'revision':1,'items':[{'id':'section-one','name':'Work','rooms':[],'collapsed':v:false}]}}
let g:chooser_meeting = {'session':'synthetic-owner','panes':{'revision':1,'sources':[{'id':'video','label':'Video','available':v:true}],'layouts':['gallery']}}
let g:chooser_epoch = 1 | let g:chooser_requests = []
let g:chooser_meeting_action=wbx#meeting_action#new({'Ready':function('wbx#_chooser_ready'),
      \ 'Disconnected':function('wbx#_chooser_disconnected'),'Capabilities':function('wbx#_chooser_capabilities'),
      \ 'Request':function('wbx#rpc'),'Notify':function('wbx#_chooser_notice'),'ProtocolError':function('wbx#_protocol_error')})
if has('nvim')
lua << EOF
  local module = require('wbx-tui')
  local choose = module.choose
  module.choose = function(c) vim.g.chooser_id = c.id; return choose(c) end
  WBXNativeMenus = {}
  vim.ui.select = function(items, opts, done)
    local origin = vim.api.nvim_get_current_win()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, items)
    local win = vim.api.nvim_open_win(buf, true, { relative='editor',row=3,col=3,width=70,height=#items,border='single',style='minimal' })
    table.insert(WBXNativeMenus, {items=items,opts=opts,done=done,win=win,origin=origin})
  end
  WBXNativeFinish = function(index, raw)
    local menu = WBXNativeMenus[#WBXNativeMenus]
    -- Exercise providers which call back before closing their floating window.
    menu.done(menu.items[index], raw or (index > 0 and index or nil))
    vim.api.nvim_win_close(menu.win, true)
    vim.api.nvim_set_current_win(menu.origin)
    vim.schedule(function() vim.g.chooser_settled = 1 end)
  end
EOF
endif
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 2 | sleep 5m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:open(command) abort
  let g:chooser_settled = 0
  execute a:command
  if has('nvim')
    let g:chooser_items = luaeval('WBXNativeMenus[#WBXNativeMenus].items')
  else
    let s:popup = popup_list()[0]
    let g:chooser_items = getbufline(winbufnr(s:popup),1,'$')
  endif
  call assert_notmatch('private-room-id',join(g:chooser_items,"\n"),'space identity remains internal')
  if $WBX_EDITOR_SCREEN ==# '1' | redraw! | endif
endfunction
function! s:finish(index) abort
  if has('nvim')
    call luaeval('WBXNativeFinish(_A)',a:index)
    call s:wait('g:chooser_settled')
  elseif a:index > 0
    for _ in range(a:index - 1) | call popup_filter_menu(s:popup,'j') | endfor
    call popup_filter_menu(s:popup,"\<CR>")
  else
    call popup_filter_menu(s:popup,"\<Esc>")
  endif
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat]
endfunction
function! s:record(choice) abort
  call add(g:chooser_recorded,a:choice)
endfunction
try
  enew | file unsent-native-work.txt
  call setline(1,'Unsent native work')
  call feedkeys("i\<Esc>",'xt')
  let native = s:native()
  call s:open('call wbx#notifications#menu()')
  call assert_equal(['Status','Mute for 30 minutes','Resume (never replay)','Explicit test notification'],g:chooser_items)
  call s:finish(2)
  call assert_true(wbx#notifications#status().muted,'real temporary picker focus does not revoke the explicit choice')
  call assert_equal(native,s:native(),'notifications preserve native text/full undo/focus/breakat')
  call s:open('call wbx#notifications#menu()') | call s:finish(0)
  call assert_true(wbx#notifications#status().muted,'Escape does not resume')
  call s:open('call wbx#notifications#menu()') | call s:finish(3)
  call assert_false(wbx#notifications#status().muted)

  call s:open('call wbx#sections#filter("")') | call s:finish(2)
  call assert_equal('unread',wbx#sections#current_filter())
  call s:open('call wbx#sections#filter("")')
  let g:chooser_state.sections.revision += 1
  call s:finish(1)
  call assert_equal('unread',wbx#sections#current_filter(),'changed section snapshot revokes an old filter')
  call s:open('call wbx#sections#menu()') | call s:finish(8)
  call assert_equal(['sections.preferences',{'revision':2,'action':'save'}],g:chooser_requests[-1])
  call s:open('call wbx#sections#action("toggle","")') | call s:finish(1)
  call assert_equal(['sections.edit',{'revision':2,'edit':{'action':'toggle','id':'section-one'}}],g:chooser_requests[-1])
  let attempts = len(g:chooser_requests)
  call s:open('call wbx#sections#action("remove","")')
  let g:chooser_state.sections.revision += 1
  call s:finish(1)
  call assert_equal(attempts,len(g:chooser_requests),'no stale section write')

  call s:open('call wbx#meeting#choose("sources")') | call s:finish(1)
  call assert_equal(['meeting.pane',{'session':'synthetic-owner','intent':{'revision':1,'action':'source.set','source':'video'}}],g:chooser_requests[-1])
  let attempts = len(g:chooser_requests)
  call s:open('call wbx#meeting#choose("layout")')
  let g:chooser_meeting.panes.revision += 1
  call s:finish(1)
  call assert_equal(attempts,len(g:chooser_requests),'no stale pane operation')
  call s:open('call wbx#meeting#choose("layout")') | call s:finish(1)
  call assert_equal('layout',g:chooser_requests[-1][1].intent.action)
  call assert_equal(native,s:native())

  " Generic delayed callbacks: text/session/buffer changes, invalid indices,
  " duplicates, and a newer menu must never execute the older choice.
  let g:chooser_recorded = []
  call s:open('call wbx#chooser#select(["Test:","1. One"],function("s:record"))')
  if has('nvim')
    let old = g:chooser_id
    lua WBXNativeOld = WBXNativeMenus[#WBXNativeMenus].done
  endif
  call s:finish(0)
  if has('nvim')
    call wbx#chooser#done(old,1)
    lua WBXNativeOld('One',1)
  endif
  call assert_equal([0],g:chooser_recorded,'cancel is terminal')
  call s:open('call wbx#chooser#select(["Test:","1. One"],function("s:record"))')
  let g:chooser_state.localContext.sessionId = repeat('b',32)
  call s:finish(1)
  call assert_equal([0,0],g:chooser_recorded,'changed session rejects a choice')
  call s:open('call wbx#chooser#select(["Test:","1. One"],function("s:record"))')
  if has('nvim')
    let origin = luaeval('WBXNativeMenus[#WBXNativeMenus].origin')
    call win_execute(origin,'call setline(1,"Newer native text")')
  else
    call setline(1,'Newer native text')
  endif
  call s:finish(1)
  call assert_equal([0,0,0],g:chooser_recorded,'changed text rejects a choice')
  if has('nvim')
    call s:open('call wbx#chooser#select(["Test:","1. One"],function("s:record"))')
    lua WBXNativeFinish(1,99)
    call s:wait('g:chooser_settled')
    call assert_equal([0,0,0,0],g:chooser_recorded,'out-of-range provider indices are cancellation')
    call s:open('call wbx#chooser#select(["Old:","1. One"],function("s:record"))')
    lua local m=WBXNativeMenus[#WBXNativeMenus]; WBXNativeOld=m.done; vim.api.nvim_win_close(m.win,true); vim.api.nvim_set_current_win(m.origin)
    call s:open('call wbx#chooser#select(["New:","1. One"],function("s:record"))')
    lua WBXNativeOld('One',1)
    call s:finish(1)
    call assert_equal([0,0,0,0,1],g:chooser_recorded,'only the newer menu can apply once')
  else
    call s:open('call wbx#chooser#select(["Old:","1. One"],function("s:record"))')
    let old_popup = s:popup
    let OldCallback = popup_getoptions(old_popup).callback
    call s:open('call wbx#chooser#select(["New:","1. One"],function("s:record"))')
    call assert_equal([s:popup],popup_list(),'new menu closes only the superseded owned native menu')
    call call(OldCallback,[old_popup,1])
    call s:finish(1)
    call assert_equal([0,0,0,1],g:chooser_recorded,'late older native popup callbacks cannot apply')
  endif

  let member = {'id':'exact-membership','personId':'person','label':'Exact participant','moderator':v:false}
  call wbx#lists#show('members',['Header','Coverage','Actions','Exact participant'],['','','',member.id])
  let b:wbx_members_snapshot = {'roomId':g:chooser_state.room.id,'items':[member]}
  call cursor(4,1)
  runtime autoload/wbx/conversations.vim
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
  let g:chooser_confirmations = 0
  execute 'function! <SNR>' . sid . "_confirm(text) abort\nlet g:chooser_confirmations += 1\nreturn 0\nendfunction"
  let attempts = len(g:chooser_requests)
  call s:open('call wbx#members#action()') | call s:finish(2)
  call assert_equal(1,g:chooser_confirmations,'choosing removal still requires separate confirmation')
  call assert_equal(attempts,len(g:chooser_requests),'canceling confirmation does not remove/send')
  call cursor(1,1)
  call s:open('call wbx#conversations#action("remove","")') | call s:finish(1)
  call assert_equal(2,g:chooser_confirmations,'roster picker resumes exact target through fresh confirmation')
  call s:open('call wbx#conversations#action("remove","")')
  if has('nvim')
    call win_execute(luaeval('WBXNativeMenus[#WBXNativeMenus].origin'),'let b:wbx_members_snapshot.items[0].id = "replacement-membership"')
  else
    let b:wbx_members_snapshot.items[0].id = 'replacement-membership'
  endif
  call s:finish(1)
  call assert_equal(2,g:chooser_confirmations,'replaced roster invalidates target before confirmation')
  call assert_equal(attempts,len(g:chooser_requests))
  call assert_equal([],filter(copy(g:chooser_requests),'v:val[0] =~# "send\\|read\\|members.action"'),'no unsolicited send/receipt/member writes')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
