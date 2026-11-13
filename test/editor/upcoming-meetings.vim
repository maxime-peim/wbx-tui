" Scheduling rows dispatch identity/revision to fake RPC, never URLs or media.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = Array.from({ length: 40 }, (_, i) => ({ id: i === 0 ? 'same-id' : 'room-' + i, title: 'Synthetic space ' + i, type: 'group', unread: true }));
  let revision = 0, state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false, moreRooms: true };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {}, reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    if (!request.method.startsWith('test.') && !['hello', 'shutdown'].includes(request.method)) appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(request) + '\n');
    switch (request.method) {
      case 'hello': reply({ version: 1, capabilities: ['upcoming-meetings'], state, meeting: { active: false, ready: false } }); break;
      case 'session.start': state = { ...state, state: 'ready', rooms }; publish(); reply(null); break;
      case 'rooms.select': state = { ...state, room: rooms.find(room => room.id === p.roomId), ready: true, messages: [] }; publish(); reply(null); break;
      case 'rooms.list': state = { ...state, moreRooms: false }; publish(); reply(null); break;
      case 'test.publish': state = { ...state, ...p }; publish(); reply(null); break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'read_status': 1, 'mark_read_on_open': 0, 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
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
function! s:requests(method) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method')
endfunction
function! s:card(id, title) abort
  return {'id': a:id, 'title': a:title, 'start': '2026-11-09T13:00:00.000Z', 'end': '2026-11-09T14:00:00.000Z',
        \ 'meetingType': 'meetingSeries', 'meetingState': 'active', 'joinable': v:true}
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 40')
  let buffers = wbx#buffers()
  let explorer = win_getid()
  call assert_true(s:requests('session.start')[0].params.upcomingMeetings, 'discovery requested independently of read/presence scopes')
  call wbx#select('same-id')
  call WaitFor('wbx#state().ready')
  let draft = wbx#buffers().drafts['same-id']
  call setbufline(draft, 1, 'Unsent meeting-safe draft')
  let draft_tick = getbufvar(draft, 'changedtick')
  call cursor(index(b:wbx_room_ids, 'room-10') + 1, 1)
  let upcoming = {'state': 'ready', 'coverage': 'webex-current-series', 'requiredScope': 'meeting:schedules_read', 'complete': v:true,
        \ 'revision': 1, 'items': [s:card('same-id', 'Synthetic imminent meeting')]}
  call s:publish({'upcomingMeetings': upcoming})
  call assert_equal(explorer, win_getid(), 'new meeting cards never steal focus')
  call assert_equal('room-10', b:wbx_room_ids[line('.') - 1], 'new cards retain the hovered room by identity')
  call assert_match('Upcoming', getline(3))
  call assert_match('2026-11-09T13:00Z.*2026-11-09T14:00Z.*local.*Enter to join', getline(4), 'both UTC endpoints, local time and joinability are visible')
  call assert_equal('', b:wbx_room_ids[3], 'meeting cards are never admitted as spaces, even with an identical ID')
  call assert_equal(4, str2nr(keys(b:wbx_meeting_rows)[0]))
  call assert_equal([], s:requests('meeting.joinUpcoming'), 'background discovery never joins')
  call assert_equal([], s:requests('rooms.read'), 'background discovery never acknowledges messages')
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'))
  split
  let meeting_window = win_getid()
  call cursor(4, 1)
  let upcoming.items = [s:card('earlier', 'Earlier synthetic meeting'), upcoming.items[0]]
  let upcoming.revision = 2
  call s:publish({'upcomingMeetings': upcoming})
  call assert_equal(json_encode(['meeting', 'same-id']), b:wbx_row_ids[line('.') - 1], 'meeting cursor follows its typed identity after insertion')
  call win_execute(explorer, 'let g:wbx_upcoming_hovered = b:wbx_room_ids[line(".") - 1]')
  call assert_equal('room-10', g:wbx_upcoming_hovered, 'another window retains its independent hovered space')
  execute "normal \<CR>"
  call WaitFor('len(s:requests("meeting.joinUpcoming")) == 1')
  call assert_equal({'meetingId': 'same-id', 'revision': 2, 'display': 'auto', 'fallback': 'editor'}, s:requests('meeting.joinUpcoming')[0].params)
  call assert_equal(1, len(s:requests('rooms.select')), 'Enter on meeting cannot select a space with the same ID')
  call assert_equal(meeting_window, win_getid(), 'mock join response does not change editor focus')
  let upcoming.state = 'stale'
  let upcoming.revision = 3
  for item in upcoming.items | let item.joinable = v:false | let item.joinReason = 'stale' | endfor
  call s:publish({'upcomingMeetings': upcoming})
  call assert_match('not joinable: stale', getline(4))
  execute "normal \<CR>"
  sleep 20m
  call assert_equal(1, len(s:requests('meeting.joinUpcoming')), 'cached/loading cards cannot join')
  let upcoming.items = []
  let upcoming.revision = 4
  call s:publish({'upcomingMeetings': upcoming})
  call assert_equal(1, line('.'), 'expired meeting selection moves to neutral chrome, not a different actionable row')
  execute "normal \<CR>"
  call assert_equal(1, len(s:requests('rooms.select')))
  call assert_equal(1, len(s:requests('meeting.joinUpcoming')))
  call assert_match('unavailable.*cached', join(getline(1, '$'), "\n"))
  let upcoming.state = 'ready'
  let upcoming.items = [s:card('same-id', 'Synthetic imminent meeting')]
  let upcoming.revision = 5
  call s:publish({'upcomingMeetings': upcoming})
  call cursor(index(b:wbx_room_ids, 'room-20') + 1, 1)
  call wbx#paging#baseline()
  call cursor(index(b:wbx_room_ids, 'room-39') + 1, 1)
  call wbx#_navigation()
  call WaitFor('len(s:requests("rooms.list")) == 1')
  call assert_true(s:requests('rooms.list')[0].params.more, 'automatic paging uses actual space rows below meeting cards')
  call assert_equal(['Unsent meeting-safe draft'], getbufline(draft, 1, '$'))
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'))
  call assert_equal([], s:requests('rooms.read'))
  call assert_equal([], s:requests('messages.send'))
  " Cross-device observations are inert rows, never schedule cards or spaces.
  let joined = {'state': 'ready', 'partial': v:true, 'observedAt': 1794225600000,
        \ 'items': [{'id': repeat('a', 64), 'title': 'Already running synthetic call'}]}
  call cursor(index(b:wbx_room_ids, 'room-20') + 1, 1)
  let focused = win_getid()
  call s:publish({'joinedMeetings': joined})
  call assert_equal(focused, win_getid())
  call assert_equal('room-20', b:wbx_room_ids[line('.') - 1])
  call assert_match('Already joined elsewhere.*read-only', getline(3))
  call assert_match('Already running synthetic call.*another device', getline(4))
  call assert_equal('', b:wbx_room_ids[3])
  call assert_equal(json_encode(['joined-meeting', repeat('a', 64)]), b:wbx_row_ids[3])
  call assert_false(has_key(b:wbx_meeting_rows, '4'), 'no join action for cross-device observations')
  call cursor(4, 1)
  execute "normal \<CR>"
  sleep 20m
  call assert_equal(1, len(s:requests('meeting.joinUpcoming')))
  call assert_equal(1, len(s:requests('rooms.select')))
  let joined.state = 'unavailable' | let joined.items = [] | unlet joined.observedAt
  call s:publish({'joinedMeetings': joined})
  call assert_equal(1, line('.'), 'removed observation cannot select an actionable replacement')
  call assert_notmatch('Already running synthetic call', join(getline(1, '$'), "\n"))
  call assert_match('Joined-elsewhere discovery unavailable', join(getline(1, '$'), "\n"))
  call assert_equal(['Unsent meeting-safe draft'], getbufline(draft, 1, '$'))
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'))
  call assert_equal([], s:requests('rooms.read'))
  call assert_equal([], s:requests('meeting.leave'))
  call assert_equal([], s:requests('meeting.control'))
  call assert_equal([], s:requests('messages.send'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
