" Same metadata can accompany changed buffer text: native decorations must rebind.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=50 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime test/editor/helpers/presence.vim
let g:wbx_tui = {'people_status':1,'notifications':0}
function! WbxPresenceColumn() abort
  return '%@WbxPresenceClick@%C%s%T%l│'
endfunction
function! WbxPresenceClick(...) abort
endfunction
function! s:check(rows) abort
  let signs = WbxTestPresence(bufnr('%'))
  call assert_equal([1, 2], map(copy(signs), 'v:val.lnum'), 'margin cues stay on exact direct rows, not the following group')
  call assert_equal(['🟢', '📞'], map(copy(signs), 'v:val.text'))
  if has('nvim')
    call assert_equal([],nvim_buf_get_extmarks(bufnr('%'),nvim_create_namespace('wbx-presence'),0,-1,{}),'presence has no inline decorations')
  endif
  if $WBX_EDITOR_SCREEN ==# '1'
    normal! ggzt
    redraw
    for [row,cue] in [[1,'🟢'],[2,'📞']]
      let cell = WbxTestPresenceCell(row)
      call assert_equal(cue,screenstring(cell.row,cell.col),'redraw does not lose this cue after the gutter')
      call assert_true(cell.col < screenpos(win_getid(),row,1).col,'presence stays entirely outside the buffer text area')
      call assert_equal(strcharpart(getline(row),0,1),screenstring(cell.row,screenpos(win_getid(),row,1).col),'selection prefix remains in the unchanged text area')
      if has('nvim') && screenpos(win_getid(),row,strlen(getline(row))).row > cell.row
        call assert_equal(' ',screenstring(cell.row+1,cell.col),'wrapped continuations have an empty gutter slot, not repeated inline presence')
      endif
    endfor
    let cell = screenpos(win_getid(),3,3)
    call assert_equal('S',screenstring(cell.row,cell.col),'group title starts normally; no phantom person cue')
  endif
endfunction
try
  let rooms = [{'id':'one','type':'direct','title':'First person'},{'id':'two','type':'direct','title':'Second person'},
        \ {'id':'group','type':'group','title':'South Team Communications'}]
  let status = {'capability':'ready','state':'unknown','presence':'unknown','customStatus':'unsupported','reason':'not-selected'}
  call wbx#state()
  enew | file wbx://spaces
  setlocal buftype=nofile nonumber norelativenumber signcolumn=auto
  let b:wbx_kind = 'rooms'
  if has('nvim')
    let &l:statuscolumn = '%!WbxPresenceColumn()'
    let original_column = &l:statuscolumn
  endif
  setlocal showbreak=KEEP>
  syntax on
  setlocal syntax=wbx-rooms
  call wbx#people#observe({'state':'ready','rooms':rooms,'room':v:null,'peopleStatus':status,
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},'peopleViewport':[
        \ extend(copy(status),{'roomId':'one','state':'fresh','presence':'active','observedAt':localtime()*1000}),
        \ extend(copy(status),{'roomId':'two','state':'fresh','presence':'call','observedAt':localtime()*1000})]})
  for suffix in ['', ' updated', ' changed again' . repeat(' long title', 14)]
    let current = map(deepcopy(rooms),'extend(v:val,{"title":v:val.title . (v:val.type ==# "direct" ? suffix : "")})')
    let rows = wbx#rooms#rows(current,empty(suffix) ? '' : 'one',0,map(copy(current),'wbx#unread#display(v:val)'),'off')
    setlocal modifiable
    call wbx#view#replace(bufnr('%'),rows.lines,[])
    setlocal nomodified nomodifiable
    let b:wbx_room_ids = rows.ids | let b:wbx_presence_rows = rows.presence
    let b:wbx_unread_rows = [] | let b:wbx_cached_rows = [] | let b:wbx_render_tick = b:changedtick
    call wbx#rooms#syntax()
    call s:check(rows)
  endfor
  let native = [getline(1,'$'), b:changedtick, undotree()]
  for options in ['number norelativenumber', 'nonumber relativenumber', 'number relativenumber']
    execute 'setlocal ' . options
    let gutter = [&l:number, &l:relativenumber, exists('+statuscolumn') ? &l:statuscolumn : '', &l:signcolumn]
    call wbx#rooms#syntax()
    call s:check(rows)
    call assert_equal(gutter, [&l:number, &l:relativenumber, exists('+statuscolumn') ? &l:statuscolumn : '', &l:signcolumn])
  endfor
  call assert_equal(native, [getline(1,'$'), b:changedtick, undotree()], 'presence changes neither text nor undo')
  let native = [win_getid(), getline(1,'$'), b:changedtick, undotree(), winsaveview()]
  let b:wbx_presence_rows[0].cue = '🌙'
  let b:wbx_presence_rows[0].group = 'WbxPresenceAway'
  call wbx#rooms#syntax()
  redraw
  call assert_equal('🌙', WbxTestPresence(bufnr('%'))[0].text)
  if $WBX_EDITOR_SCREEN ==# '1'
    let cell = WbxTestPresenceCell(1)
    call assert_equal('🌙', screenstring(cell.row, cell.col), 'presence-only updates repaint the gutter without a full screen clear')
  endif
  call assert_equal(native, [win_getid(), getline(1,'$'), b:changedtick, undotree(), winsaveview()], 'presence-only refresh preserves native text, undo, focus and scroll')
  let b:wbx_presence_rows[0].cue = '🟢'
  let b:wbx_presence_rows[0].group = 'WbxPresenceActive'
  call wbx#rooms#syntax()
  call assert_equal('KEEP>',&l:showbreak,'Spaces do not acquire history continuation styling')
  if has('nvim')
    call assert_equal(original_column,w:wbx_gutter.before,'custom gutter is delegated, not replaced')
    call assert_match('%@WbxPresenceClick@',wbx#gutter#column(original_column),'original gutter click regions survive')
    call assert_match('│🟢$',nvim_eval_statusline(&l:statuscolumn,{'winid':win_getid(),'use_statuscol_lnum':1}).str,'presence is appended after the custom number column')
    call assert_equal([],sign_getplaced(bufnr('%'),{'group':'wbx-presence'})[0].signs,'presence never consumes the original sign column')
    let spaces = bufnr('%')
    let installed = &l:statuscolumn
    split
    call assert_equal(original_column,w:wbx_gutter.before,'splits inherit one gutter wrapper, not nested adapters')
    call s:check(rows)
    enew
    call assert_equal(&g:statuscolumn,&l:statuscolumn,'new ordinary buffers retain their native gutter')
    call assert_false(exists('w:wbx_gutter'),'leaving Spaces releases adapter ownership')
    execute 'buffer ' . spaces
    call assert_equal(installed,&l:statuscolumn,'returning to Spaces reinstalls the gutter slot')
    close
    let &l:statuscolumn = 'CUSTOM:%l'
    call wbx#gutter#enter()
    call wbx#rooms#syntax()
    call assert_equal('CUSTOM:%l',&l:statuscolumn,'later explicit local gutter overrides remain authoritative')
    call assert_false(exists('w:wbx_gutter'))
  endif
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
