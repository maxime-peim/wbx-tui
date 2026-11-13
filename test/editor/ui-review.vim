" Presence presentation only: no identity lookup, transport or installed config.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime test/editor/helpers/presence.vim
let g:wbx_tui = {'people_status': 1, 'notifications': 0}
let s:session = 'ui-review-one'
let s:room = {'id': 'active', 'type': 'direct', 'title': 'Active person', 'unread': v:true}
function! s:observe(id, status, age, ...) abort
  let value = {'capability': 'ready', 'state': a:0 ? a:1 : 'fresh', 'presence': a:status, 'customStatus': 'unsupported',
        \ 'roomId': a:id, 'observedAt': localtime() * 1000 - a:age}
  call wbx#people#observe({'state': 'ready', 'localContext': {'sessionId': s:session},
        \ 'room': {'id': a:id, 'type': 'direct'}, 'peopleStatus': value})
endfunction
function! s:badge(id) abort
  return wbx#people#badge({'id': a:id, 'type': 'direct'}).group
endfunction
try
  enew
  file wbx://spaces
  setlocal buftype=nofile
  let b:wbx_kind = 'rooms'
  call s:observe('active', 'active', 0)
  let refused = {'capability':'ready','state':'unavailable','presence':'unknown','customStatus':'unsupported','roomId':'restricted','reason':'not-shared'}
  call assert_true(wbx#protocol#people(refused), 'native protocol admits only the added bounded refusal reason')
  call assert_match('not shared', wbx#people#line(refused))
  call assert_match('not loaded yet', wbx#people#line(extend(copy(refused), {'state':'unknown','reason':'not-loaded'})))
  call assert_match('timed out', wbx#people#line(extend(copy(refused), {'reason':'timeout'})))
  let bot = extend(copy(refused), {'roomId':'bot','state':'unknown','reason':'unsupported-person','observedAt':localtime()*1000})
  call wbx#people#observe({'state':'ready','localContext':{'sessionId':s:session},'room':{'id':'bot','type':'direct'},'peopleStatus':bot})
  call assert_equal({}, wbx#people#badge({'id':'bot','title':'Ordinary name','type':'direct'}), 'verified unsupported peer has no person cue; titles do not decide')
  call assert_equal('WbxPresenceActive', wbx#people#badge({'id':'active','title':'South Team Communications','type':'direct'}).group, 'verified person identity is not guessed from its title')
  for status in ['call', 'meeting', 'presenting', 'DoNotDisturb']
    call s:observe('busy', status, 0)
    call assert_equal('WbxPresenceBusy', s:badge('busy'))
  endfor
  let icons = []
  for status in ['call', 'meeting', 'DoNotDisturb']
    call s:observe('distinct', status, 0)
    call add(icons, trim(wbx#people#badge({'id':'distinct','type':'direct'}).cue))
  endfor
  call assert_equal(['📞','📹','⛔'], icons, 'call, video meeting and busy remain distinct without color')
  for status in ['inactive', 'OutOfOffice']
    call s:observe('away', status, 0)
    call assert_equal('WbxPresenceAway', s:badge('away'))
  endfor
  for status in ['unknown', 'pending']
    call s:observe('unknown', status, 0)
    call assert_equal('WbxPresenceUnknown', s:badge('unknown'))
  endfor
  call s:observe('stale', 'active', 60000)
  call assert_equal('WbxPresenceUnknown', s:badge('stale'))
  call assert_equal('🟢', trim(wbx#people#badge({'id':'stale','type':'direct'}).cue))
  call s:observe('stale', 'active', 300000)
  call assert_equal('? ', wbx#people#badge({'id':'stale','type':'direct'}).cue, 'five-minute expiry removes the last-known icon')
  call s:observe('stale', 'active', 0, 'stale')
  call assert_equal('WbxPresenceUnknown', s:badge('stale'), 'failed refresh cannot manufacture current presence')
  call s:observe('active', 'active', 0, 'loading')
  call assert_equal('WbxPresenceActive', s:badge('active'), 'loading cannot replace the retained observation')
  call s:observe('future', 'active', -5000)
  call assert_equal('WbxPresenceUnknown', s:badge('future'), 'a changed clock is not freshness')
  call assert_equal('WbxPresenceUnknown', s:badge('unvisited'), 'names cannot establish presence')
  call assert_equal({}, wbx#people#badge({'id': 'active', 'type': 'group'}))
  call assert_equal({}, wbx#people#badge(extend(copy(s:room), {'cached': 1})))
  let rooms = [s:room, {'id': 'busy', 'title': 'Busy person', 'type': 'direct'},
        \ {'id': 'away', 'title': 'Away person', 'type': 'direct'},
        \ {'id': 'unvisited', 'title': 'Active person', 'type': 'direct'},
        \ {'id': 'group', 'title': 'A group ● active', 'type': 'group'},
        \ {'id': 'cached', 'title': 'Cached person', 'type': 'direct', 'cached': 1}]
  let displays = map(copy(rooms), 'wbx#unread#display(v:val)')
  let rows = wbx#rooms#rows(rooms, 'active', 0, displays, 'ready')
  call assert_equal(4, len(rows.presence))
  call assert_equal('● Active person', rows.lines[0])
  call assert_equal('  Active person', rows.lines[3], 'presence never enters searchable/yankable titles')
  call assert_equal('  A group ● active', rows.lines[4], 'title dots are never presence metadata')
  call setline(1, rows.lines)
  let b:wbx_room_ids = rows.ids
  let b:wbx_presence_rows = rows.presence
  let b:wbx_unread_rows = rows.unread
  let b:wbx_cached_rows = rows.cached
  let b:wbx_render_tick = b:changedtick
  setlocal nomodified nomodifiable nonumber norelativenumber signcolumn=auto
  syntax on
  setlocal syntax=wbx-rooms
  highlight WbxPresenceActive ctermfg=2 guifg=#00aa00
  highlight WbxPresenceBusy ctermfg=1 guifg=#aa0000
  highlight WbxPresenceAway ctermfg=3 guifg=#aaaa00
  call wbx#people#highlights()
  call assert_equal('2', synIDattr(synIDtrans(hlID('WbxPresenceActive')), 'fg', 'cterm'), 'theme overrides survive defaults')
  call assert_equal('WbxUnread', synIDattr(synID(1, 5, 1), 'name'), 'unread title styling remains independent')
  let signs = WbxTestPresence(bufnr('%'))
  call assert_equal([1, 2, 3, 4], map(copy(signs), 'v:val.lnum'))
  call assert_equal(['🟢', '⛔', '🏖️', '?'], map(copy(signs), 'v:val.text'))
  if $WBX_EDITOR_SCREEN ==# '1'
    normal! ggzt
    redraw!
    let active = WbxTestPresenceCell(1)
    let busy = WbxTestPresenceCell(2)
    call assert_equal('🟢', screenstring(active.row, active.col), 'category follows the gutter, not the line number')
    call assert_equal('⛔', screenstring(busy.row, busy.col))
    call assert_notequal(screenattr(active.row, active.col), screenattr(busy.row, busy.col), 'drawn statuses have distinct colors')
    highlight WbxPresenceActive ctermfg=7 guifg=#aaaaaa
    highlight WbxPresenceBusy ctermfg=7 guifg=#aaaaaa
    highlight WbxPresenceAway ctermfg=7 guifg=#aaaaaa
    highlight WbxPresenceUnknown ctermfg=7 guifg=#aaaaaa
    setlocal nowrap
    vsplit
    vertical resize 16
    call assert_true(getwininfo(win_getid())[0].width <= 16, 'exercise an actually narrow native split')
    redraw!
    for [row, cue] in [[1, '🟢'], [2, '⛔'], [3, '🏖️'], [4, '?']]
      let cell = WbxTestPresenceCell(row)
      call assert_equal(cue, screenstring(cell.row, cell.col), 'narrow monochrome cues remain distinguishable')
    endfor
  endif
  let grouped = wbx#rooms#rows(rooms, 'active', 2, displays, 'ready',
        \ {'items': [{'id': 'friends', 'name': 'Friends', 'rooms': ['active', 'away'], 'collapsed': 0}]})
  call assert_equal(4, len(grouped.presence))
  for badge in grouped.presence
    call assert_equal(badge.roomId, grouped.ids[badge.row - 3], 'group headings preserve exact presence row identity')
  endfor
  " Exercise the inert expiry callback without waiting a real minute.
  let timers = filter(timer_info(), 'string(v:val.callback) =~# "presence_expired"')
  call assert_equal(1, len(timers), 'all observed peers share one presentation-expiry timer')
  call s:observe('active', 'active', 60000)
  let timers = filter(timer_info(), 'string(v:val.callback) =~# "presence_expired"')
  let before = [win_getid(), bufnr('%'), b:changedtick, getline(1, '$'), undotree()]
  call timer_stop(timers[0].id)
  call call(timers[0].callback, [timers[0].id])
  let sign = WbxTestPresence(bufnr('%'))[0]
  call assert_equal('WbxPresenceUnknown', sign.group, 'idle cue ages without a provider publication')
  call assert_equal('🟢', sign.text, 'staleness mutes the known icon without loading/unknown flicker')
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let expired = WbxTestPresenceCell(1)
    call assert_equal('🟢', screenstring(expired.row, expired.col), 'a stale known status keeps its icon with neutral styling')
  endif
  call assert_equal(before, [win_getid(), bufnr('%'), b:changedtick, getline(1, '$'), undotree()], 'expiry never changes native work or focus')
  call sign_define('OtherPresenceTest', {'text': '!!'})
  call sign_place(1, 'other-test', 'OtherPresenceTest', bufnr('%'), {'lnum': 1, 'priority': 100})
  let foreign = sign_getplaced(bufnr('%'), {'group': 'other-test'})
  setlocal signcolumn=no
  call wbx#rooms#syntax()
  call assert_equal('no', &l:signcolumn, 'passive presence never overrides a local margin opt-out')
  call wbx#rooms#clear_presence(bufnr('%'))
  call assert_equal(foreign, sign_getplaced(bufnr('%'), {'group': 'other-test'}), 'clearing presence never removes other signs')
  for n in range(1, 9) | call s:observe('bounded-' . n, 'active', 0) | endfor
  call assert_equal('WbxPresenceUnknown', s:badge('bounded-1'), 'only eight observations are retained')
  call assert_equal('WbxPresenceActive', s:badge('bounded-9'))
  let s:session = 'ui-review-two'
  call s:observe('new', 'meeting', 0)
  call assert_equal('WbxPresenceUnknown', s:badge('bounded-9'), 'new sessions cannot inherit observed status')
  setlocal modifiable
  call setline(1, 'My retained spaces annotation')
  setlocal nomodified nomodifiable
  let before = [win_getid(), b:changedtick, getline(1, '$'), undotree(), deepcopy(b:wbx_presence_rows)]
  let timers = filter(timer_info(), 'string(v:val.callback) =~# "presence_expired"')
  call timer_stop(timers[0].id)
  call call(timers[0].callback, [timers[0].id])
  call assert_equal(before, [win_getid(), b:changedtick, getline(1, '$'), undotree(), b:wbx_presence_rows],
        \ 'expiry cannot reclaim an annotated nofile view even with modified reset')
  call wbx#people#observe({'state': 'idle'})
  call assert_equal('WbxPresenceUnknown', s:badge('new'), 'disconnect drops observations')
  let g:wbx_tui.people_status = 0
  call assert_equal({}, wbx#people#badge(s:room), 'explicit opt-out removes dots')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
