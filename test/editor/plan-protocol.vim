" New optional endpoint metadata is typed before it can affect receipt admission.
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
try
  let state = {'revision': 1, 'state': 'ready', 'mode': 'demo', 'ready': v:false, 'rooms': [], 'messages': [], 'room': v:null}
  let event = {'jsonrpc': '2.0', 'method': 'state', 'params': state}
  call assert_true(wbx#protocol#valid(event), 'older backend state remains compatible')
  let state.historyLatest = v:false
  call assert_true(wbx#protocol#valid(event), 'an older-history window explicitly reports not latest')
  let state.historyLatest = v:true
  call assert_true(wbx#protocol#valid(event))
  let state.historyLatest = 0
  call assert_false(wbx#protocol#valid(event), 'numeric zero must not masquerade as typed endpoint evidence')
  let state.historyLatest = 'true'
  call assert_false(wbx#protocol#valid(event), 'endpoint evidence is not coerced')
  let state.historyLatest = v:true
  let room = {'id': 'cached-room', 'title': 'Cached', 'unread': v:true, 'unreadStale': v:true}
  let state.rooms = [room]
  let state.room = room
  call assert_true(wbx#protocol#valid(event), 'historical unread metadata is accepted on both listed and selected rooms')
  let room.unreadStale = 1
  call assert_false(wbx#protocol#valid(event), 'cache freshness is never coerced')
  let room.unreadStale = v:false
  call remove(room, 'unread')
  call assert_false(wbx#protocol#valid(event), 'a freshness flag without any observed read/unread value is invalid')
  let upcoming = {'state': 'ready', 'coverage': 'webex-current-series', 'requiredScope': 'meeting:schedules_read', 'revision': 1,
        \ 'complete': v:true, 'items': [{'id': 'meeting', 'title': 'Synthetic', 'start': '2026-11-09T13:00:00.000Z',
        \ 'end': '2026-11-09T14:00:00.000Z', 'meetingType': 'meetingSeries', 'meetingState': 'active', 'joinable': v:true}]}
  call assert_true(wbx#protocol#upcoming(upcoming))
  let upcoming.items[0].joinUrl = 'https://example.webex.com/meet/synthetic'
  call assert_false(wbx#protocol#upcoming(upcoming), 'editor rows cannot carry action URLs, even superficially safe ones')
  call remove(upcoming.items[0], 'joinUrl')
  let upcoming.state = 'stale'
  call assert_false(wbx#protocol#upcoming(upcoming), 'a stale card cannot claim joinability')
  let upcoming.items[0].joinable = v:false
  call assert_true(wbx#protocol#upcoming(upcoming))
  let upcoming.items += [deepcopy(upcoming.items[0])]
  call assert_false(wbx#protocol#upcoming(upcoming), 'duplicate card identities cannot be rendered')
catch
  call add(v:errors, v:exception . ' @ ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
if !empty(v:errors)
  cquit 1
endif
qa!
