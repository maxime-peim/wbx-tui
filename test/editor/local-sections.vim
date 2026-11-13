" Actual source backend in demo mode. No SDK, OAuth, network, notifier or receipt.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend,
      \ 'images': 0, 'upcoming_meetings': 0, 'notifications': 0, 'mark_read_on_open': 0, 'picker': 'builtin'}
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:prefs() abort
  return get(wbx#state(), 'sections', {'revision': 0, 'items': []})
endfunction
function! s:action(command) abort
  let revision = s:prefs().revision
  execute a:command
  call s:wait('s:prefs().revision > ' . revision)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0) && type(wbx#state().room) == v:t_dict')
  WebexCompose
  call setline(1, 'Private destination-bound draft')
  let draft = bufnr('%')
  let draft_tick = b:changedtick
  let undo = undotree().seq_cur
  call s:action('WebexSectionCreate Work')
  let work = s:prefs().items[0].id
  call s:action('WebexSectionCreate Friends')
  let completion_before = [s:prefs(),wbx#state().room.id,getline(1,'$'),b:changedtick]
  call assert_equal(['Work'],getcompletion('WebexFilter Wo','cmdline'))
  call assert_equal(['Friends'],getcompletion('WebexSectionAssign Fr','cmdline'))
  call assert_equal(completion_before,[s:prefs(),wbx#state().room.id,getline(1,'$'),b:changedtick],'loaded-section completion is read-only')
  call s:action('WebexSectionAssign Work')
  call assert_equal(['demo-general'], s:prefs().items[0].rooms)
  let before = [win_getid(), bufnr('%'), getbufline(draft, 1, '$'), undotree().seq_cur]
  WebexFilter direct
  call assert_equal(before, [win_getid(), bufnr('%'), getbufline(draft, 1, '$'), undotree().seq_cur], 'filter does not select/fetch or move focus')
  call assert_equal('demo-general', wbx#state().room.id, 'hidden selection remains the destination')
  let sidebar = join(getbufline(wbx#buffers().rooms, 1, '$'), "\n")
  call assert_match('1/3 loaded', sidebar, 'filtered coverage is explicit')
  call assert_match('selected hidden', sidebar, 'the hidden destination is not silently retargeted')
  WebexFilter drafts
  let sidebar = join(getbufline(wbx#buffers().rooms, 1, '$'), "\n")
  call assert_match('1/3 loaded', sidebar)
  WebexFilter unread
  let sidebar = join(getbufline(wbx#buffers().rooms, 1, '$'), "\n")
  call assert_match('0/3 loaded', sidebar)
  call assert_match('No matching loaded spaces.*WebexFilter all', sidebar, 'zero rows explain a local route back without fetching')
  WebexFilter section:Work
  let rooms = wbx#buffers().rooms
  call assert_equal(['demo-general'], filter(copy(getbufvar(rooms, 'wbx_room_ids')), '!empty(v:val)'))
  WebexSpaces
  let header = index(b:wbx_row_ids, json_encode(['section', work])) + 1
  call cursor(header, 1)
  let current = wbx#state().room.id
  call wbx#select_current()
  call s:wait('s:prefs().items[0].collapsed')
  call assert_equal(current, wbx#state().room.id, 'section headers never select rooms')
  call assert_equal([], filter(copy(getbufvar(rooms, 'wbx_room_ids')), '!empty(v:val)'))
  call assert_equal(0, getbufvar(rooms, 'wbx_paging_edge'), 'collapsed headers cannot become paging data edges')
  call s:action('WebexSectionToggle Work')
  let header = index(b:wbx_row_ids, json_encode(['section', work])) + 1
  call cursor(header, 1)
  call s:action('WebexSectionRename Renamed Work')
  call assert_equal('Renamed Work', s:prefs().items[0].name)
  call assert_equal(['Renamed Work'],getcompletion('WebexSectionToggle Ren','cmdline'),'multi-word loaded section names remain discoverable')
  let header = index(b:wbx_row_ids, json_encode(['section', work])) + 1
  call cursor(header, 1)
  call s:action('WebexSectionMove 2')
  call assert_equal(work, s:prefs().items[1].id)
  call s:action('WebexSectionRemove Renamed Work')
  call assert_equal('demo-general', wbx#state().room.id)
  call assert_equal(['Private destination-bound draft'], getbufline(draft, 1, '$'))
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'), 'section operations never rewrite the composer or its undo')
  call assert_equal('all', wbx#sections#current_filter(), 'removed section resets only the filter, not destination')
  WebexFilter all
  call assert_equal(3, len(filter(copy(getbufvar(rooms, 'wbx_room_ids')), '!empty(v:val)')))
  let invalid = deepcopy(s:prefs())
  let invalid.items[0].rooms = ['room', 'room']
  call assert_false(wbx#protocol#sections(invalid))
  let invalid = deepcopy(s:prefs())
  let invalid.items[0].name = "Unsafe\nname"
  call assert_false(wbx#protocol#sections(invalid))
  let invalid = deepcopy(s:prefs())
  let invalid.items[0].token = 'must-not-cross'
  call assert_false(wbx#protocol#sections(invalid))
  let unicode = {'revision': 1, 'persistence': 'session', 'items': [
        \ {'id': repeat('a', 24), 'name': 'ΟΣ', 'collapsed': v:false, 'rooms': []},
        \ {'id': repeat('b', 24), 'name': 'οσ', 'collapsed': v:false, 'rooms': []}]}
  call assert_true(wbx#protocol#sections(unicode), 'Unicode case policy matches Node without contextual lowercasing')
  let unicode.items[1].name = 'ΟΣ'
  call assert_false(wbx#protocol#sections(unicode))
  " At 435 rooms the projection is built once; motion reuses precomputed row IDs.
  let many = map(range(0, 434), '{"id": "r-" . v:val, "type": v:val % 2 ? "direct" : "group", "title": "Room " . v:val}')
  let prefs = {'revision': 1, 'persistence': 'session', 'items': [{'id': work, 'name': 'Work', 'collapsed': v:false, 'rooms': ['r-1', 'r-3']}]}
  let projected = wbx#rooms#rows(many, 'r-200', 2, map(copy(many), '{"unread": v:false, "local": ""}'), 'off', prefs)
  call assert_equal(435, len(filter(copy(projected.ids), '!empty(v:val)')))
  call assert_equal(435, projected.unknown)
  call assert_equal('r-434', projected.ids[-1])
  call assert_equal(2 + len(projected.lines), projected.edge)
  call assert_match('unread unknown', projected.lines[-1])
  call assert_equal(['Presence unknown'], wbx#people#lines({}))
  let saved = wbx#state()
  WebexFilter unread
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_equal('all', wbx#sections#current_filter())
  let saved.revision += 100
  let saved.rooms = many
  let saved.room = many[200]
  let saved.sections = prefs
  let saved.moreRooms = v:false
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': saved})
  let projection_count = wbx#sections#diagnostics().projections
  call win_execute(win_findbuf(rooms)[0], 'let g:wbx_section_motion_start = line(".")')
  for i in range(100)
    call win_execute(win_findbuf(rooms)[0], 'call cursor(' . (3 + i) . ', 1) | call wbx#_navigation()')
  endfor
  call assert_equal(projection_count, wbx#sections#diagnostics().projections, '435-room motion uses precomputed row identity; no per-key grouping')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
