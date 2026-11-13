" Actual offline demo backend: choosing an emoji is the complete reaction intent.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend':s:backend,'notifications':0,'people_status':0,'read_status':0,'upcoming_meetings':0,'mark_read_on_open':0,'persist_drafts':0}
runtime autoload/wbx/reactions.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/reactions.vim$"')[0].sid
let g:reaction_confirm = 1 | let g:reaction_prompts = [] | let g:reaction_notices = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:reaction_prompts,a:text)\nreturn g:reaction_confirm\nendfunction"
execute 'function! <SNR>' . s:sid . "_notice(text) abort\ncall add(g:reaction_notices,a:text)\nechohl WbxWarning | echomsg '[wbx-tui] ' . a:text | echohl None\nendfunction"
if has('nvim')
lua << EOF
  WBXReactionMenus = {}
  vim.ui.select = function(items,opts,done)
    local origin = vim.api.nvim_get_current_win()
    local buf = vim.api.nvim_create_buf(false,true)
    vim.api.nvim_buf_set_lines(buf,0,-1,false,items)
    local win = vim.api.nvim_open_win(buf,true,{relative='editor',row=3,col=3,width=78,height=#items,border='single',style='minimal'})
    table.insert(WBXReactionMenus,{items=items,done=done,origin=origin,win=win})
  end
  WBXReactionFinish = function(index)
    local m = WBXReactionMenus[#WBXReactionMenus]
    m.done(m.items[index],index>0 and index or nil)
    vim.api.nvim_win_close(m.win,true)
    vim.api.nvim_set_current_win(m.origin)
    vim.schedule(function() vim.g.reaction_settled=1 end)
  end
EOF
endif
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:open(command) abort
  let g:reaction_settled = 0
  if has('nvim') | let before = luaeval('#WBXReactionMenus') | endif
  execute a:command
  if has('nvim')
    call s:wait('luaeval("#WBXReactionMenus") > ' . before)
    let g:reaction_items = luaeval('WBXReactionMenus[#WBXReactionMenus].items')
  else
    call s:wait('!empty(popup_list())')
    let s:popup = popup_list()[0]
    let g:reaction_items = getbufline(winbufnr(s:popup),1,'$')
  endif
  call assert_notmatch('demo-general',join(g:reaction_items,"\n"),'picker hides space IDs')
  if $WBX_EDITOR_SCREEN ==# '1' | redraw! | endif
endfunction
function! s:finish(index) abort
  if has('nvim')
    call luaeval('WBXReactionFinish(_A)',a:index)
    call s:wait('g:reaction_settled')
  elseif a:index > 0
    for _ in range(a:index - 1) | call popup_filter_menu(s:popup,'j') | endfor
    call popup_filter_menu(s:popup,"\<CR>")
  else
    call popup_filter_menu(s:popup,"\<Esc>")
  endif
endfunction
function! s:received(response) abort
  let g:reaction_response = a:response
  let g:reaction_snapshot = get(a:response,'result',{})
endfunction
function! s:read_ready() abort
  let g:reaction_read_ready = 1
endfunction
function! s:groups(count) abort
  " Raw fixture RPC must obey the same background-read exclusion as commands.
  let g:reaction_read_ready = 0
  call wbx#reaction_history#suspend(function('s:read_ready'))
  call s:wait('g:reaction_read_ready')
  try
    let g:reaction_response = {} | let g:reaction_snapshot = {}
    call wbx#rpc('messages.reactions',{'roomId':'demo-general','messageId':s:message,'internalConsent':v:true},function('s:received'))
    call s:wait('!empty(g:reaction_response)')
    call assert_false(has_key(g:reaction_response,'error'),string(g:reaction_response))
    call assert_true(wbx#protocol#reactions(g:reaction_snapshot),string(g:reaction_response))
    call assert_equal(a:count,len(g:reaction_snapshot.groups))
  finally
    call wbx#reaction_history#resume()
  endtry
endfunction
function! s:confirmed(count) abort
  " Picker completion is not mutation completion. Never race or retry a write.
  call s:wait('len(filter(copy(g:reaction_notices),''v:val ==# "Reaction confirmed. No message was sent."'')) == ' . a:count)
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat]
endfunction
try
  WebexReactionAdd
  call assert_false(wbx#transport#running(),'native feature availability never starts a backend')
  WebexDemo
  call s:wait('get(wbx#state(),"state","") ==# "ready"')
  call wbx#select('demo-general') | call s:wait('get(wbx#state(),"ready",0)')
  WebexCompose
  call setline(1,'Unsent text <@all> and native undo')
  call feedkeys("i\<Esc>",'xt')
  let composer = bufnr('%') | let draft = getline(1,'$') | let undo = undotree()
  execute 'buffer ' . wbx#buffers().history
  let s:message = wbx#state().messages[0].id
  call cursor(filter(copy(b:wbx_message_blocks),'v:val.id ==# s:message')[0].body,1)
  call feedkeys("\<Esc>",'xt')
  let before = s:native() | let messages = deepcopy(wbx#state().messages) | let latest = wbx#state().historyLatest
  call assert_equal('',wbx#reactions#reason(),'native reactions are available by default')
  let g:wbx_tui.reactions = 0
  call assert_match('disabled explicitly',wbx#reactions#reason())
  call remove(g:wbx_tui,'reactions')
  call assert_equal('',wbx#reactions#reason())
  call wbx#reaction_history#schedule()
  call assert_false(has_key(get(b:,'wbx_reaction_decorations',{}),s:message),'empty observations leave native spacing alone')
  WebexReactions
  call s:wait('get(b:,"wbx_list_kind","") ==# "reactions"')
  call assert_match('No disclosed reactions',join(getline(1,'$'),"\n"))
  call wbx#lists#close()
  call assert_equal(before,s:native(),'summary preserves text/full undo/focus/breakat')
  call s:open('WebexReactionAdd') | call s:finish(0)
  call s:groups(0)
  call assert_equal([],g:reaction_prompts,'canceling the first picker requires no inspection or confirmation')
  for [key,command] in [['al','WebexReactions'],['aa','WebexReactionAdd'],['ar','WebexReactionRemove'],['aI','WebexReactionResolve']]
    call assert_match(command,maparg(get(g:,'mapleader','\') . 'W' . key,'n'),'reaction actions belong under the Message actions prefix')
  endfor
  let member_key = maparg(get(g:,'mapleader','\') . 'Wnr','n')
  let g:wbx_tui.mappings = 0 | call wbx#commands#setup()
  call assert_equal('',maparg(get(g:,'mapleader','\') . 'Wal','n'),'the list key obeys mapping opt-out')
  nnoremap <leader>Wal :let g:reaction_user_key = 1<CR>
  let g:wbx_tui.mappings = 1 | call wbx#commands#setup()
  call assert_match('reaction_user_key',maparg(get(g:,'mapleader','\') . 'Wal','n'),'user mappings retain precedence')
  nunmap <leader>Wal
  call wbx#commands#setup()
  call assert_match('WebexReactions',maparg(get(g:,'mapleader','\') . 'Wal','n'))
  call assert_equal(member_key,maparg(get(g:,'mapleader','\') . 'Wnr','n'),'Wnr remains Remove Member')
  let g:wbx_tui.reaction_display = 'text'
  call s:open('WebexReactionAdd')
  call assert_equal(['Thumbs up','Heart','Celebrate','Smile','Laugh','Confused','Sad','Other emoji...'],g:reaction_items,'explicit text mode also applies to native pickers')
  call s:finish(0)
  call remove(g:wbx_tui,'reaction_display')
  call s:open('WebexReactionAdd')
  call assert_equal(['👍 Thumbs up','♥️ Heart','🎉 Celebrate','🙂 Smile','😂 Laugh','😕 Confused','😢 Sad','Other emoji...'],g:reaction_items)
  if $WBX_EDITOR_SCREEN ==# '1'
    let position = has('nvim') ? nvim_win_get_position(win_getid()) : []
    let row = has('nvim') ? position[0] + 2 : popup_getpos(s:popup).core_line
    let col = has('nvim') ? position[1] + 2 : popup_getpos(s:popup).core_col
    call assert_equal('👍',screenstring(row,col),'the default picker actually draws an emoji, not only its label')
  endif
  call s:finish(0) | call s:groups(0)
  let g:reaction_confirm = 0
  call s:open('WebexReactionAdd') | call s:finish(2)
  call s:confirmed(1)
  call assert_equal('♥️ 1 (you)',get(get(b:,'wbx_reaction_decorations',{}),s:message,{}).text,'confirmed Add shows your one contribution when the aggregate total is unknown')
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let badge = b:wbx_reaction_decorations[s:message]
    let anchor = badge.row-1
    let row = screenpos(win_getid(),anchor,max([1,strlen(getline(anchor))])).row+1
    let drawn = join(map(range(1,&columns),'screenstring(row,v:val)'),'')
    call assert_match('♥️ 1 (you)',drawn,'a confirmed Add visibly draws its emoji, own count and marker')
    call assert_notmatch('♥️ ? (you)',drawn,'a confirmed Add does not visibly draw an unknown-count placeholder')
  endif
  call s:groups(1)
  call assert_equal([],g:reaction_prompts,'first-use Add sends the chosen emoji without inspection or a second confirmation')
  call assert_equal('heart',g:reaction_snapshot.groups[0].reaction)
  call assert_equal(1,g:reaction_snapshot.groups[0].count)
  call s:wait('get(get(get(b:,"wbx_reaction_decorations",{}),s:message,{}),"text","") ==# "♥️ 1 (you)"')
  call assert_notmatch('♥️',join(getline(1,'$'),"\n"),'inline metadata is not message/copy/edit text')
  if has('nvim')
    let marks = nvim_buf_get_extmarks(0,nvim_create_namespace('wbx-history-reactions'),0,-1,{'details':v:true})
    call assert_true(!empty(filter(copy(marks),'v:val[3].virt_lines[0][0] ==# ["  ♥️ 1 (you)","WbxHistoryReactionsOwn"]')))
  else
    let badge = b:wbx_reaction_decorations[s:message]
    call assert_true(!empty(prop_list(max([1,badge.row-1]),{'types':['WbxHistoryReactionsOwn']})))
  endif
  call feedkeys(get(g:,'mapleader','\') . 'Wal','xt')
  call s:wait('get(b:,"wbx_list_kind","") ==# "reactions"')
  call assert_match('Heart — 1',join(getline(1,'$'),"\n"))
  call assert_match('You (demo)',join(getline(1,'$'),"\n"))
  call assert_false(&modifiable)
  call feedkeys("\<CR>",'xt')
  call assert_equal('reactions',b:wbx_list_kind,'Enter cannot mutate a reaction')
  call wbx#lists#close()
  WebexReactionRemove
  call s:confirmed(2)
  if has('nvim')
    call assert_equal('',nvim_win_get_config(win_getid()).relative,'single own reaction removal needs no picker')
  else
    call assert_equal([],popup_list(),'single own reaction removal needs no picker')
  endif
  call assert_false(has_key(get(b:,'wbx_reaction_decorations',{}),s:message),'confirmed own-only removal paints before a read-back')
  call s:groups(0)
  call s:wait('!has_key(get(b:,"wbx_reaction_decorations",{}),s:message)')
  call assert_equal(before,s:native(),'add/remove never rewrite history or move focus')
  call assert_equal(messages,wbx#state().messages,'reactions are not messages, edits or tombstones')
  call assert_equal(latest,wbx#state().historyLatest,'reaction removal cannot invent a receipt endpoint')
  call assert_equal([],g:reaction_prompts,'explicit own-removal choice also needs no redundant confirmation')
  call s:open('WebexReactionAdd')
  call feedkeys("👩🏽‍💻\<CR>",'t')
  call s:finish(8)
  call s:confirmed(3)
  call s:groups(1)
  call assert_equal('👩🏽‍💻',g:reaction_snapshot.groups[0].reaction,'a pasted multi-codepoint emoji survives the actual RPC/demo roundtrip')
  call assert_match('👩🏽‍💻',get(get(b:,'wbx_reaction_decorations',{}),s:message,{}).text,'a non-preset reaction is drawn inline')
  let g:wbx_tui.reaction_display = 'text'
  call assert_equal('Emoji U+1F469 U+1F3FD U+200D U+1F4BB',wbx#reactions#label('👩🏽‍💻'),'Unicode reactions retain an ASCII text fallback')
  call remove(g:wbx_tui,'reaction_display')
  WebexReactions
  call s:wait('get(b:,"wbx_list_kind","") ==# "reactions"')
  call assert_match('👩🏽‍💻',join(getline(1,'$'),"\n"),'details load emoji outside the preset menu')
  call wbx#lists#close()
  WebexReactionRemove
  call s:confirmed(4)
  call s:groups(0)
  execute 'buffer ' . composer
  call assert_equal(draft,getline(1,'$')) | call assert_equal(undo,undotree())
  silent! write | call feedkeys("\<CR>",'xt')
  call assert_equal(messages,wbx#state().messages,'write/Enter never send')
  call assert_match('unchanged',wbx#reactions#reason(),'composer is not a reaction target')
  execute 'buffer ' . wbx#buffers().history
  setlocal modifiable
  call setline(1,'User annotation retained')
  WebexReactionAdd
  call assert_match('unchanged',wbx#reactions#reason())
  call assert_equal('User annotation retained',getline(1))
  WebexDisconnect
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'notices':g:reaction_notices,'response':get(g:,'reaction_response',{})})],$WBX_EDITOR_RESULT)
qa!
