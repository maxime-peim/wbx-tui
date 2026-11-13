" All seven labels: real native decorations/splits; inert source, no network.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload','p')
call writefile(['function! wbx#reaction_context() abort','return deepcopy(g:text_context)','endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort','call add(g:text_requests,a:method)','return -1','endfunction',
      \ 'function! wbx#_protocol_error() abort','throw "Unexpected text fixture protocol error"','endfunction'],s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:text_context = {'enabled':1,'available':1,'degraded':0,'sourceEpoch':1,'sourceRevision':0,
      \ 'sending':1,'sessionId':repeat('a',32),'roomId':'room','epoch':1}
let g:text_requests = [] | let g:wbx_tui = {}
let s:names = ['thumbsup','heart','celebrate','smiley','haha','confused','sad']
let s:labels = ['Thumbs up','Heart','Celebrate','Smile','Laugh','Confused','Sad']
let s:checks = [] | let s:drawn = [] | let s:anchors = []
call wbx#reaction_context()
function! s:repaint() abort
  call wbx#reaction_history#schedule()
  sleep 220m
  redraw!
endfunction
function! s:badge() abort
  return get(getbufvar(s:history,'wbx_reaction_decorations',{}),'message-10',{})
endfunction
function! s:observe(window) abort
  return json_decode(trim(win_execute(a:window,'echo json_encode({"cursor":getcurpos(),'
        \ . '"row":screenpos(win_getid(),line("."),col(".")).row,"undo":undotree(),"text":getline(1,"$"),'
        \ . '"badgeRow":screenpos(win_getid(),32,1).row,'
        \ . '"tick":b:changedtick,"options":[&l:wrap,&l:linebreak,&l:foldmethod,&l:foldlevel,&l:foldtext,&l:scrolloff,&l:scrollbind,'
        \ . '&l:number,&l:numberwidth,&l:relativenumber,&l:signcolumn,&l:foldcolumn,&l:winfixwidth,&breakat]})')))
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),winsaveview(),&breakat]
endfunction
function! s:screen(window, stage) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  redraw!
  let info = getwininfo(a:window)[0]
  let first = info.wincol+get(info,'textoff',0)
  let body = screenpos(a:window,32,1).row | let gap = screenpos(a:window,33,1).row
  call assert_true(body > 0 && gap > body,a:stage . ': message and separator are actually drawn')
  let lines = []
  for row in range(body+1,gap-1)
    call add(lines,trim(join(map(range(first,info.wincol+info.width-1),'screenstring(row,v:val)'),'')))
  endfor
  for label in s:labels | call assert_match(label,join(lines,"\n"),a:stage . ': full label is readable, not just metadata') | endfor
  if a:stage ==# 'all-seven' | call assert_equal(s:labels,lines,'drawn labels have no unknown-count placeholders in either native renderer') | endif
  if a:stage !=# 'all-seven'
    call assert_match('Thumbs up 3 (you)',join(lines,"\n"))
    call assert_match('9007199254740991',join(lines,"\n"),'the full known count is drawn, not an ambiguous clipped prefix')
  endif
  call assert_notmatch('cached',join(lines,"\n"),'no cached suffix in either presentation mode')
  call assert_notmatch('[^\x00-\x7f]',join(lines,"\n"),a:stage . ': text fallback uses only ASCII')
  let separator = join(map(range(first,info.wincol+info.width-1),'screenstring(gap,v:val)'),'')
  call assert_match('^\s*$',separator,'message blank separator remains native and empty')
  call add(s:drawn,{'stage':a:stage,'width':info.width,'lines':lines})
endfunction
try
  let row = filter(wbx#options#catalogue(),'v:val[0] ==# "reaction_display"')
  call assert_equal([['reaction_display','icons',0,'display',1]],row,'one shared optional native/Lua presentation contract')
  enew | file wbx://history
  setlocal buftype=nofile nonumber norelativenumber signcolumn=no foldcolumn=0 nowrap
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let lines = [] | let b:wbx_message_blocks = []
  for index in range(40)
    call extend(lines,['Author','Body ' . index,''])
    call add(b:wbx_message_blocks,{'id':'message-' . index,'start':index*3+1,'body':index*3+2,'end':index*3+3,'key':'key-' . index})
  endfor
  call setline(1,lines)
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  let s:history = bufnr('%') | let left = win_getid()
  vsplit | let right = win_getid()
  botright vnew | file independent-text-work.txt
  call setline(1,'Independent unsent work') | call feedkeys("i\<Esc>",'xt')
  let foreground = win_getid()
  call win_execute(left,'vertical resize 20 | setlocal winfixwidth')
  call win_execute(right,'vertical resize 32')
  call assert_equal([20,32],[getwininfo(left)[0].width,getwininfo(right)[0].width],'fixture really uses narrow independent splits')
  for window in [left,right] | call win_execute(window,'call cursor(32,1) | normal! zt') | endfor
  let s:value = {'roomId':'room','messageId':'message-10','observedAt':1,'partial':v:true,'unknown':v:true,'groups':[]}
  for index in range(7) | call add(s:value.groups,{'reaction':s:names[index],'label':s:labels[index]}) | endfor
  call wbx#reaction_history#accept(s:value)
  call assert_match('👍',s:badge().text,'icons remain the default')
  let source = deepcopy(s:value)
  let g:wbx_tui.reaction_display = 'text'
  call append(1,'Unsynced foreground work')
  let native = s:native()
  let before = [s:observe(left),s:observe(right)]
  call s:repaint()
  call assert_equal(native,s:native(),'presentation preference cannot sync/edit/focus unrelated native work')
  call assert_equal(source,s:value,'text formatting cannot change observed timestamps, groups or coverage flags')
  let badge = s:badge()
  call assert_equal(s:labels,get(badge,'lines',[]),'seven unknown-count groups get seven separate ASCII label rows without placeholders')
  call assert_notmatch('[^\x00-\x7f]',get(badge,'text',''))
  call assert_notmatch('0\|No reactions\|Complete',get(badge,'text',''),'missing counts and incomplete coverage are not zero')
  for [index,window] in [[0,left],[1,right]]
    let after = s:observe(window)
    for key in ['cursor','undo','text','tick','options'] | call assert_equal(before[index][key],after[key],key . ': text mode preserves native state') | endfor
    call s:screen(window,'all-seven')
  endfor
  call assert_equal([],g:text_requests,'preference changes repaint cached observations without a read')
  call add(s:checks,'default icons -> text: all seven exact ASCII labels, no count/coverage inference or native edits')

  let s:value.groups[1].mine = v:true
  call wbx#reaction_history#accept(s:value)
  call assert_equal('Heart 1 (you)',s:badge().lines[1],'text mode shows your known contribution when no total was supplied')
  call assert_false(has_key(s:value.groups[1],'count'),'the own-count display must not manufacture an aggregate count in the snapshot')

  " A provided count/own marker remains explicit; absent counts stay absent.
  let s:value.groups[0].count = 3 | let s:value.groups[0].own = repeat('b',32)
  let s:value.groups[2].count = 9007199254740991
  call wbx#reaction_history#accept(s:value)
  let badge = s:badge()
  call assert_match('Thumbs up 3 (you)',badge.text)
  call assert_match('9007199254740991',badge.text)
  for line in get(badge,'lines',[]) | call assert_true(strdisplaywidth(line)+2 <= 20,'long known counts are not silently truncated in the narrow split') | endfor
  call s:screen(left,'known-counts')
  call add(s:checks,'known count/own values remain exact; missing counts are not manufactured')

  let g:text_context.available = 0 | let g:text_context.degraded = 1
  call s:repaint()
  call assert_equal('WbxHistoryReactionsMuted',s:badge().group)
  call assert_notmatch('[^\x00-\x7f]',s:badge().text,'cached qualification is also ASCII')
  call s:screen(left,'cached')
  let g:text_context.available = 1 | let g:text_context.degraded = 0
  call s:repaint()
  call assert_equal('WbxHistoryReactionsMuted',s:badge().group,'recovery alone cannot freshen the old observation')
  call wbx#reaction_history#accept(s:value)
  call win_execute(left,'setlocal number numberwidth=4 | vertical resize 24')
  if exists('##WinResized') | doautocmd <nomodeline> WinResized
  else | doautocmd <nomodeline> VimResized | endif
  call s:repaint() | call s:screen(left,'resized-gutter')
  call assert_equal(24,getwininfo(left)[0].width)
  call win_execute(left,'setlocal nonumber | vertical resize 20')
  call s:repaint()
  call add(s:checks,'native resize/gutter changes recompute shared ASCII wrapping without touching user options')

  " Height changes above the reading cursor use the existing native anchor.
  for window in [left,right]
    call win_execute(window,'call cursor(13,1)')
    call win_execute(window,'normal! zt')
    call win_execute(window,'call cursor(41,1)')
  endfor
  redraw!
  let g:wbx_tui.reaction_display = 'icons' | call s:repaint()
  let before = [s:observe(left),s:observe(right)]
  let g:wbx_tui.reaction_display = 'text' | call s:repaint()
  for [index,window] in [[0,left],[1,right]]
    let after = s:observe(window)
    call assert_equal(41,before[index].cursor[1],'the anchor is an actual lower loaded message, not the badge itself')
    for key in ['cursor','undo','text','tick','options'] | call assert_equal(before[index][key],after[key]) | endfor
    if $WBX_EDITOR_SCREEN ==# '1'
      call assert_true(before[index].badgeRow > 0 && before[index].badgeRow < before[index].row,'the changed badge is actually drawn above the reading anchor')
      call assert_equal(before[index].row,after.row,'text-height change preserves representable native reading row')
    endif
    call add(s:anchors,{'width':getwininfo(window)[0].width,'before':before[index].row,'after':after.row,
          \ 'badgeBefore':before[index].badgeRow,'badgeAfter':after.badgeRow})
  endfor
  call assert_equal(native,s:native())
  call add(s:checks,'multiline height change preserves independent reading anchors, full undo/focus and native options')

  for window in [left,right] | call win_execute(window,'call cursor(32,1) | normal! zt') | endfor
  let empty = deepcopy(s:value) | let empty.groups = []
  call wbx#reaction_history#accept(empty)
  call assert_equal({},s:badge(),'incomplete empty observations add no footer, zero or loading rows')
  call assert_true(empty.partial && empty.unknown)
  call wbx#reaction_history#accept(s:value)
  syntax off
  set t_Co=0
  call s:repaint() | call s:screen(right,'monochrome-syntax-off')
  call add(s:checks,'quiet partial emptiness and readable syntax-off/monochrome text remain independent')

  for invalid in ['invalid',0,{},[]]
    let g:wbx_tui.reaction_display = invalid | call s:repaint()
    call assert_match('👍',s:badge().text,'invalid display preferences safely retain the default icons')
  endfor
  if has('nvim')
    lua require('wbx-tui').setup({reaction_display='text',which_key=false,treesitter=false})
  else
    let g:wbx_tui.reaction_display = 'text'
  endif
  call s:repaint()
  call assert_notmatch('[^\x00-\x7f]',s:badge().text)
  call add(s:checks,'shared Lua forwarding and invalid-option fallback do not change authority')
  let g:text_context.available = 0 | let g:text_context.degraded = 0 | let g:text_context.sourceEpoch += 1
  call s:repaint()
  for badge in values(getbufvar(s:history,'wbx_reaction_decorations',{}))
    call assert_notmatch('[^\x00-\x7f]',badge.text,'unavailable diagnostics also honor ASCII presentation')
    call assert_match('unavailable',badge.text)
  endfor
  let g:text_context.available = 1
  let g:text_context.enabled = 0 | call s:repaint()
  call assert_equal({},s:badge(),'text preference cannot bypass reactions opt-out')
  let g:text_context.enabled = 1
  call wbx#reaction_history#accept(s:value)
  call win_execute(left,'setlocal modifiable | call setline(1,"Native annotation") | doautocmd <nomodeline> TextChanged')
  call s:repaint()
  call assert_equal({},s:badge(),'annotations cannot acquire presentation on stale rows')
  call assert_equal('Native annotation',getbufline(s:history,1)[0])
  call assert_equal([],g:text_requests,'the complete fallback fixture performs zero reads, writes or receipts')
  call add(s:checks,'opt-out and annotation ownership remain effective with zero RPCs')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#reaction_history#invalidate()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'anchors':s:anchors,'requests':g:text_requests})],$WBX_EDITOR_RESULT)
qa!
