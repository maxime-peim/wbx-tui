" Delayed read-only viewport callbacks; real split geometry, no SDK or backend.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload','p')
call writefile(['function! wbx#reaction_context() abort','return deepcopy(g:anchor_context)','endfunction',
      \ 'function! wbx#rpc(method, params, Callback, ...) abort',
      \ 'call add(g:anchor_requests,{"method":a:method,"params":deepcopy(a:params),"Callback":a:Callback,"policy":a:0 ? a:1 : ""})',
      \ 'return len(g:anchor_requests)','endfunction',
      \ 'function! wbx#_protocol_error() abort','throw "Unexpected reaction protocol error"','endfunction'],s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:anchor_context = {'enabled':1,'available':1,'batch':1,'sending':0,'sessionId':repeat('a',32),'roomId':'room','epoch':1}
let g:anchor_requests = []
let s:evidence = []
let s:visible_badges = []
let s:mode = 'plain'
call wbx#reaction_context()
function! WbxAnchorFold() abort
  return 'User-owned native fold'
endfunction
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 4 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:observe(window) abort
  return json_decode(trim(win_execute(a:window,'echo json_encode({"view":winsaveview(),"cursor":getcurpos(),'
        \ . '"row":screenpos(win_getid(),line("."),col(".")).row,'
        \ . '"folds":map(range(1,line("$")),"[foldlevel(v:val),foldclosed(v:val),foldclosedend(v:val)]"),'
        \ . '"options":[&l:scrolloff,&l:sidescrolloff,&l:scrollbind,&l:cursorbind,&l:wrap,&l:foldmethod,&l:foldexpr,&l:foldtext,&l:foldlevel,&l:foldenable,&l:foldminlines,&breakat,&lazyredraw],'
        \ . '"smoothscroll":exists("+smoothscroll") ? &l:smoothscroll : -1,'
        \ . '"text":sha256(join(getline(1,"$"),"\n")),"tick":b:changedtick,"undo":undotree()})')))
endfunction
function! s:foreground() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),winsaveview(),&breakat,&lazyredraw]
endfunction
function! s:answer(index, empty) abort
  let request = g:anchor_requests[a:index]
  call assert_equal('messages.reactionsBatch',request.method,'only the existing bounded read path is used')
  call assert_equal('passive-reactions',request.policy)
  call assert_true(request.params.internalConsent)
  call assert_true(len(request.params.messageIds) > 0 && len(request.params.messageIds) <= 8)
  let items = map(copy(request.params.messageIds),'{"roomId":"room","messageId":v:val,"observedAt":1,"partial":v:true,"unknown":v:true,"groups":a:empty ? [] : [{"reaction":"heart","label":"Heart"}]}')
  call call(request.Callback,[{'result':{'roomId':'room','items':items}}])
endfunction
function! s:complete(index, empty) abort
  let before = [s:observe(s:left),s:observe(s:right)]
  let independent = s:foreground()
  call assert_equal(0,independent[3].synced,'fixture retains a genuinely unsynced foreground undo block')
  call s:answer(a:index,a:empty)
  redraw!
  call assert_equal(independent,s:foreground(),'passive layout work cannot sync/replace unrelated native undo, focus or text')
  let after = [s:observe(s:left),s:observe(s:right)]
  for index in range(2)
    let label = index ? 'right' : 'left'
    for key in ['cursor','folds','options','smoothscroll','text','tick','undo']
      call assert_equal(before[index][key],after[index][key],label . ': delayed decoration preserves ' . key)
    endfor
    call assert_equal(before[index].view.leftcol,after[index].view.leftcol,label . ': horizontal view is unchanged')
    call win_execute(index ? s:right : s:left,'let w:anchor_page_result = wbx#paging#navigation("history",1)')
    call assert_equal(0,wbx#view#window_var(index ? s:right : s:left,'anchor_page_result',-1),'layout compensation is not a user edge-page gesture')
    if $WBX_EDITOR_SCREEN ==# '1'
      call assert_true(before[index].row > 0,label . ': anchor is actually drawn')
      if s:mode ==# 'wrapped-native-limit' && index == 1
        call assert_true(abs(before[index].row-after[index].row) <= 1,'wrapped top row with smoothscroll off uses the closest legal native position')
      else
        call assert_equal(before[index].row,after[index].row,label . ': delayed ' . (a:empty ? 'removal' : 'insertion') . ' preserves the reading screen row')
      endif
    endif
    call add(s:evidence,{'mode':s:mode,'stage':a:empty ? 'remove' : 'insert','split':label,
          \ 'rowBefore':before[index].row,'rowAfter':after[index].row,
          \ 'topBefore':before[index].view.topline,'topAfter':after[index].view.topline})
  endfor
endfunction
function! s:refresh(empty) abort
  let g:anchor_clock += 301
  call wbx#reaction_history#schedule()
  call s:wait('len(g:anchor_requests) > s:completed')
  call s:drain(a:empty)
endfunction
function! s:visible_badge(window, label) abort
  let info = getwininfo(a:window)[0]
  let found = 0
  for badge in values(getbufvar(info.bufnr,'wbx_reaction_decorations',{}))
    let gap = screenpos(a:window,badge.row,1).row
    if gap <= info.winrow || gap >= info.winrow+info.height | continue | endif
    let text = join(map(range(info.wincol,info.wincol+min([20,info.width])-1),'screenstring(gap-1,v:val)'),'')
    if text !~# '♥️' | continue | endif
    let separator = join(map(range(info.wincol,info.wincol+min([20,info.width])-1),'screenstring(gap,v:val)'),'')
    call assert_match('^\s*$',separator,a:label . ': native blank message separator is still drawn')
    call add(s:visible_badges,{'mode':s:mode,'split':a:label,'reactionRow':gap-1,'separatorRow':gap})
    let found = 1 | break
  endfor
  call assert_true(found,a:label . ': anchoring keeps real reaction text visible, not just extmark metadata')
endfunction
function! s:drain(empty) abort
  " Layout may expose a few different already-loaded targets. Every successful
  " target is read at most once before expiry; draining is finite, not a retry.
  for pass in range(4)
    if len(g:anchor_requests) <= s:completed | break | endif
    call s:complete(s:completed,a:empty)
    let s:completed += 1
    call wbx#reaction_history#schedule()
    sleep 220m
  endfor
  call assert_equal(s:completed,len(g:anchor_requests),'viewport work settles within four bounded batches')
  if !a:empty && $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    call s:visible_badge(s:left,'left')
    call s:visible_badge(s:right,'right')
  endif
endfunction
try
  enew | file wbx://history
  setlocal buftype=nofile nonumber norelativenumber signcolumn=no noscrollbind nocursorbind
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let b:wbx_message_blocks = [] | let lines = []
  for index in range(100)
    call extend(lines,['Author ' . index,'Body ' . index,'More text ' . index,'Last body row ' . index,''])
    call add(b:wbx_message_blocks,{'id':'message-' . index,'start':index*5+1,'body':index*5+2,'end':index*5+5,'key':'content-' . index})
  endfor
  " A wrapped top row exercises native display-row, not buffer-line, scrolling.
  let lines[281] = repeat('Wrapped native text ',14)
  call setline(1,lines)
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  let b:wbx_paging_edge = 100
  call wbx#paging#sync({'state':'ready','ready':1,'room':{'id':'room'},'messages':map(copy(b:wbx_message_blocks),'{"id":v:val.id}'),'moreHistory':1})
  let s:left = win_getid()
  vsplit
  let s:right = win_getid()
  botright 8new
  file independent-native-work.txt
  let foreground = win_getid()
  for [window,top,cursor,first,last] in [[s:left,81,102,92,94],[s:right,282,307,302,304]]
    call win_execute(window,'setlocal foldmethod=manual foldenable foldminlines=1 foldlevel=99 foldtext=WbxAnchorFold() scrolloff=0 sidescrolloff=0')
    call win_execute(window,'silent ' . first . ',' . last . 'fold')
    call win_execute(window,'call cursor(' . top . ',1) | normal! zt')
    call win_execute(window,'call cursor(' . cursor . ',7)')
    call win_execute(window,'call wbx#paging#baseline()')
  endfor
  call win_execute(s:left,'setlocal nowrap')
  call win_execute(s:right,'setlocal nowrap')
  call win_execute(s:left,'setlocal scrolloff=3 scrollbind')
  call win_execute(s:right,'setlocal scrolloff=5')
  setlocal scrollbind
  call setline(1,'Independent unsent text')
  call feedkeys("i\<Esc>",'xt')
  redraw!
  call wbx#reaction_history#schedule()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reaction_history.vim$"')[0].sid
  let g:anchor_clock = localtime()
  execute 'function! <SNR>' . sid . "_now() abort\nreturn g:anchor_clock\nendfunction"
  call s:wait('len(g:anchor_requests) == 1')
  " The user continues reading during the held request. Capture at paint time,
  " not the position when the read was requested.
  if $WBX_EDITOR_SCREEN ==# '1'
    call win_execute(s:left,'call cursor(107,7) | call wbx#paging#baseline()')
    call win_execute(s:right,'call cursor(312,7) | call wbx#paging#baseline()')
  endif
  call append(1,'Unsynced native edit must survive')
  redraw!
  let s:completed = 0
  call s:drain(0)
  let read_ids = []
  for request in g:anchor_requests | call extend(read_ids,request.params.messageIds) | endfor
  call assert_equal(len(read_ids),len(uniq(sort(copy(read_ids)))),'settled successful targets are never reread to compensate layout')
  call assert_equal(len(read_ids),len(getbufvar(bufnr('wbx://history'),'wbx_reaction_decorations',{})),'anchoring must not suppress the reaction badges')
  let stable = [s:observe(s:left),s:observe(s:right)]
  let requests = len(g:anchor_requests)
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(requests,len(g:anchor_requests),'screen anchoring cannot create a passive read storm')
  call assert_equal(stable,[s:observe(s:left),s:observe(s:right)],'unchanged decoration is a native-view no-op')
  call s:refresh(1)
  if $WBX_EDITOR_SCREEN ==# '1' && exists('+smoothscroll')
    set lazyredraw
    " The option is a deliberate user choice in this scenario, never toggled
    " by production code to obtain a passing screen-row assertion.
    for mode in ['wrapped-smooth','wrapped-native-limit']
      let s:mode = mode
      call win_execute(s:right,'setlocal wrap ' . (mode ==# 'wrapped-smooth' ? 'smoothscroll' : 'nosmoothscroll'))
      call win_execute(s:right,'call winrestview({"topline":282,"lnum":312,"col":6,"curswant":6,"skipcol":0,"topfill":0}) | call wbx#paging#baseline()')
      redraw!
      call assert_equal(282,s:observe(s:right).view.topline,'the wrapped native line is actually at the top of this split')
      call s:refresh(0)
      call s:refresh(1)
    endfor
  endif
  call assert_equal(foreground,win_getid())
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#reaction_history#invalidate()
call writefile([json_encode({'errors':v:errors,'anchors':s:evidence,'visibleBadges':s:visible_badges,'requests':len(g:anchor_requests),'drawn':$WBX_EDITOR_SCREEN ==# '1'})],$WBX_EDITOR_RESULT)
qa!
