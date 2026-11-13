" Synthetic cached-metadata RPC only. No real cache, account, service or media.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync, existsSync } from 'node:fs';
  const legacy = existsSync(process.env.WBX_EDITOR_RESULT + '.legacy');
  const rooms = Array.from({ length: 40 }, (_, i) => ({ id: 'space-' + i, title: 'Synthetic space ' + i, type: 'group', cached: true }));
  let revision = 0, state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false, moreRooms: false };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {}, reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    if (!request.method.startsWith('test.') && !['hello', 'shutdown'].includes(request.method)) appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(request) + '\n');
    switch (request.method) {
      case 'hello': reply({ version: 1, capabilities: legacy ? [] : ['spaces-cache'], state, meeting: { active: false, ready: false } }); break;
      case 'session.start': state = { ...state, state: 'ready', mode: 'live', loadingRooms: !legacy,
        rooms: legacy ? rooms.map(({ cached, ...room }) => room) : rooms, readStatus: 'connecting',
        spacesCache: legacy ? { state: 'off' } : { state: 'stale', verified: false, observedAt: Date.now() } }; publish(); reply(null); break;
      case 'rooms.select': state = { ...state, room: state.rooms.find(room => room.id === p.roomId), ready: true, messages: [] }; publish(); reply(null); break;
      case 'spaces.cacheClear': state = { ...state, spacesCache: { state: 'off', reason: 'cleared', verified: true } }; publish(); reply(null); break;
      case 'test.publish': state = { ...state, ...p }; publish(); reply(null); break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'spaces_cache': 1, 'read_status': 1, 'picker': 'builtin', 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:requests(method) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method')
endfunction
let s:controls = 0
function! s:controlled(message) abort
  let s:controls += 1
endfunction
function! s:publish(params) abort
  let expected = s:controls + 1
  call wbx#rpc('test.publish', a:params, function('s:controlled'))
  call WaitFor('s:controls == ' . expected)
endfunction
function! s:valid(state) abort
  return wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': a:state})
endfunction
try
  call setline(1, 'Unrelated original work')
  let ordinary = bufnr('%')
  if has('nvim')
    lua require('wbx-tui').setup({ spaces_cache = true, picker = 'builtin' })
    call assert_true(g:wbx_tui.spaces_cache, 'Lua forwards the opt-in without file/network work')
  endif
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 40')
  let buffers = wbx#buffers()
  let explorer = win_getid()
  call assert_true(s:requests('session.start')[0].params.spacesCache, 'cache opt-in is negotiated through the versioned handshake')
  call assert_false(has_key(s:requests('session.start')[0].params, 'upcomingMeetings'), 'independent optional fields are negotiated together')
  call assert_equal(40, len(b:wbx_cached_rows))
  call assert_equal([], b:wbx_unread_rows)
  call assert_equal('WbxCachedSpace', synIDattr(synID(3, 4, 1), 'name'), 'cached titles are muted, not read/unread-styled')
  call assert_match('STALE titles/order', join(getline(1, '$'), "\n"))
  call assert_notmatch('STALE', getline(1), 'cache health lives in the footer, not the spaces header')
  call assert_match('spaces cached/stale', wbx#status())
  call assert_equal('stale', wbx#health().spaces_cache.state)
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    call assert_true(screenpos(win_getid(), 3, 4).row > 0, 'cached rows are checked in an actual drawn editor')
  endif
  let unbound = buffers.drafts._none
  call setbufline(unbound, 1, 'Unsent unbound text must survive warm startup')
  let draft_tick = getbufvar(unbound, 'changedtick')
  call cursor(3, 1)
  execute "normal \<CR>"
  call assert_equal(-1, wbx#select('space-0'), 'programmatic selection cannot bypass browse-only cache admission')
  if has('nvim')
    lua << trim LUA
      local select = vim.ui.select
      vim.ui.select = function(items, _, callback) callback(items[1]) end
      require('wbx-tui').pick_space()
      vim.ui.select = select
    LUA
  endif
  sleep 20m
  call assert_equal([], s:requests('rooms.select'), 'Enter/API/picker never open cached spaces')
  call assert_equal(explorer, win_getid())
  call cursor(3, 1)
  call wbx#paging#baseline()
  normal! G
  call wbx#_navigation()
  call assert_equal([], s:requests('rooms.list'), 'cached IDs do not restore pagination cursors or auto-page')
  let cached_state = wbx#state()
  call assert_true(s:valid(cached_state))
  for bad in ['unread', 'unreadStale']
    let invalid = deepcopy(cached_state)
    let invalid.rooms[0][bad] = v:false
    call assert_false(s:valid(invalid), 'cached metadata cannot masquerade as read state')
  endfor
  let invalid = deepcopy(cached_state)
  let invalid.spacesCache.verified = v:true
  call assert_false(s:valid(invalid))
  let invalid = deepcopy(cached_state)
  call remove(invalid.rooms[0], 'cached')
  call assert_false(s:valid(invalid), 'mixed cached/live list projections are rejected')
  let invalid = deepcopy(cached_state)
  let invalid.spacesCache.accountId = 'must-not-be-in-RPC'
  call assert_false(s:valid(invalid))
  let invalid = deepcopy(cached_state)
  let invalid.room = invalid.rooms[0]
  call assert_false(s:valid(invalid), 'a cache row cannot become a selected destination')
  let known = deepcopy(cached_state.rooms)
  let known[0].unread = v:true
  let known[0].unreadStale = v:true
  let known[1].unread = v:false
  let known[1].unreadStale = v:true
  call s:publish({'rooms': known})
  call assert_equal([3], b:wbx_unread_rows, 'last-confirmed unread styling is useful even on browse-only cached rows')
  call assert_equal('WbxUnread', synIDattr(synID(3, 4, 1), 'name'), 'cached metadata mute must not hide unread emphasis')
  call assert_equal('WbxCachedSpace', synIDattr(synID(4, 4, 1), 'name'), 'a stale read flag does not become unread styling')
  call assert_match('last-known.*STALE', join(getline(1, '$'), "\n"))
  call assert_match('38 unknown', join(getline(1, '$'), "\n"))
  call assert_true(s:valid(wbx#state()), 'strict validation admits only explicitly stale cached flags')
  for bad in [v:false, 1, 'true']
    let invalid = wbx#state()
    let invalid.rooms[0].unreadStale = bad
    call assert_false(s:valid(invalid), 'cached flags can never claim freshness or coerce stale markers')
  endfor
  call assert_equal(-1, wbx#select('space-0'), 'restoring unread state does not grant cached membership or receipt consent')
  call cursor(index(b:wbx_room_ids, 'space-25') + 1, 1)
  split
  let second = win_getid()
  call cursor(index(b:wbx_room_ids, 'space-10') + 1, 1)
  let fresh = reverse(deepcopy(known))
  for item in fresh | call remove(item, 'cached') | endfor
  call s:publish({'rooms': fresh, 'loadingRooms': v:false, 'spacesCache': {'state': 'ready', 'verified': v:true}})
  call assert_equal('space-10', b:wbx_room_ids[line('.') - 1], 'warm-to-fresh reordering preserves the hovered ID')
  call win_execute(explorer, 'let g:wbx_cache_hover = b:wbx_room_ids[line(".") - 1]')
  call assert_equal('space-25', g:wbx_cache_hover, 'independent split selection survives fresh revalidation')
  call assert_equal(second, win_getid())
  call assert_equal([], b:wbx_cached_rows)
  call assert_equal([index(b:wbx_room_ids, 'space-0') + 1], b:wbx_unread_rows, 'fresh metadata retains last-confirmed flags without freshening them')
  call assert_true(filter(copy(wbx#state().rooms), 'v:val.id ==# "space-0"')[0].unreadStale)
  call assert_equal('WbxRoom', synIDattr(synID(3, 4, 1), 'name'))
  call assert_equal(draft_tick, getbufvar(unbound, 'changedtick'))
  call assert_equal(['Unsent unbound text must survive warm startup'], getbufline(unbound, 1, '$'))
  call assert_equal([], s:requests('rooms.read'))
  execute "normal \<CR>"
  call WaitFor('len(s:requests("rooms.select")) == 1 && get(b:, "wbx_kind", "") ==# "history"')
  call assert_equal('space-10', wbx#state().room.id, 'only a fresh row can become an explicit destination')
  WebexCacheClear
  call WaitFor('len(s:requests("spaces.cacheClear")) == 1')
  call assert_equal({}, s:requests('spaces.cacheClear')[0].params)
  call assert_equal([], s:requests('messages.send'))
  call assert_equal([], s:requests('rooms.read'))
  call wbx#shutdown()
  call writefile(['legacy'], $WBX_EDITOR_RESULT . '.legacy')
  WebexDemo
  call WaitFor('len(s:requests("session.start")) == 2')
  call assert_false(has_key(s:requests('session.start')[1].params, 'spacesCache'), 'an older backend never receives an unknown cache field')
  call assert_false(has_key(s:requests('session.start')[1].params, 'upcomingMeetings'))
  call assert_equal(['Unrelated original work'], getbufline(ordinary, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
