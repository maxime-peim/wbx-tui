" Synthetic clock, real notification owner, no backend, sockets or desktop tools.
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:now = wbx#notify_events#time('2026-11-11T12:00:00Z')
let s:o = {'messages': 1, 'preview': 1, 'sender_names': 1, 'suppress_visible': 1}
function! s:state() abort
  return {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true, 'senderNames': v:true,
        \ 'room': {'id': 'r', 'title': 'Selected'}, 'messages': [], 'rooms': [{'id': 'r', 'title': 'Selected'}, {'id': 'other', 'title': 'Other'}],
        \ 'messageEvents': {'state': 'live', 'received': 0, 'items': [], 'preview': v:true, 'senderNames': v:true}}
endfunction
function! s:event(id, room, self) abort
  return {'id': a:id, 'roomId': a:room, 'created': '2026-11-11T12:00:00Z', 'self': a:self,
        \ 'observedAt': s:now, 'preview': a:id . ' excerpt', 'senderName': a:id . ' sender'}
endfunction
function! s:observe() abort
  return wbx#notify_events#observe(s:t, s:state, s:now, s:o, '')
endfunction
try
  let s:t = wbx#notify_events#new() | let s:state = s:state()
  call s:observe()
  let s:state.uploadPending = v:true
  let s:state.messageEvents.items = [s:event('own', 'other', v:true), s:event('native', 'other', v:true), s:event('unrelated', 'other', v:false)]
  let s:state.messageEvents.received = 3
  let s:state.messages = [{'id': 'history', 'author': 'Native', 'senderName': 'Native', 'text': 'Selected excerpt', 'created': '2026-11-11T12:00:00Z'}]
  let events = s:observe()
  call assert_equal(1, len(events), 'unrelated off-space messages remain immediate')
  call assert_equal('unrelated excerpt', events[0].preview)
  call assert_equal(0, len(s:t.held), 'modern self events and unclassified REST echoes are suppressed, not delayed')
  " Changing rooms cannot duplicate held SDK evidence through selected history.
  let s:state.room = s:state.rooms[1]
  let s:state.messages = []
  call s:observe()
  let s:state.messages = [{'id': 'native', 'author': 'Native', 'text': 'duplicate', 'created': '2026-11-11T12:00:00Z'}]
  call assert_equal([], s:observe())
  call assert_equal(0, len(s:t.held))
  let s:now += 60000
  let s:state.messageEvents.items = []
  call wbx#notify_events#sent(s:t, 'other', 'own')
  let s:state.uploadPending = v:false
  let events = s:observe()
  call assert_equal([],events,'upload settlement cannot replay own messages from any client')
  call assert_equal(3, s:t.globalReceived, 'release is not new SDK creation evidence')
  call assert_equal([], s:observe(), 'settlement and repeated snapshots never replay')
  for mode in ['disabled', 'cached', 'removed', 'visible', 'expired', 'privacy']
    let s:now = wbx#notify_events#time('2026-11-11T12:00:00Z')
    let s:t = wbx#notify_events#new() | let s:state = s:state()
    call s:observe()
    let s:state.uploadPending = v:true
    let s:state.messageEvents.items = [s:event(mode, 'other', v:true)]
    call s:observe()
    if mode ==# 'disabled' | let s:o.messages = 0
    elseif mode ==# 'cached' | let s:state.rooms[1].cached = v:true
    elseif mode ==# 'removed' | call remove(s:state.rooms, 1)
    elseif mode ==# 'expired' | let s:now += 90001
    elseif mode ==# 'privacy'
      let s:state.messageEvents.preview = v:false | let s:state.senderNames = v:false
    endif
    let s:state.uploadPending = v:false
    let events = wbx#notify_events#observe(s:t, s:state, s:now, s:o, mode ==# 'visible' ? 'other' : '')
    call assert_equal([],events,mode . ': own creations remain suppressed after settlement')
    let s:o.messages = 1
    call assert_equal([], s:observe(), 'revoked held events never replay after ' . mode)
  endfor
  let s:t = wbx#notify_events#new() | let s:state = s:state()
  call s:observe() | let s:state.uploadPending = v:true
  for n in range(100)
    let s:state.messageEvents.items = [s:event('bounded-' . n, 'other', v:true)]
    call s:observe()
  endfor
  call assert_equal(0, len(s:t.held), 'self bursts never consume held delivery slots')
  call assert_equal(100,len(s:t.globalSeen),'self events are consumed so they cannot replay')

  " Legacy history has no actor feed; its pending-send hold stays bounded.
  let s:t = wbx#notify_events#new() | let s:state = s:state()
  call remove(s:state,'messageEvents')
  call s:observe() | let s:state.uploadPending = v:true
  for n in range(100)
    call add(s:state.messages,{'id':'legacy-' . n,'author':'Legacy','text':'Text','created':'2026-11-11T12:00:00Z'})
    call s:observe()
  endfor
  call assert_equal(64,len(s:t.held),'legacy pending-send history hold retains its hard bound')
  call assert_equal(100,len(s:t.uploadSeen),'legacy overflow remains consumed')

  " Recipient-first DMs use the same bounded hold, exact ACK exclusion and no
  " replay rules without masquerading as uploads or extending SDK freshness.
  let s:t = wbx#notify_events#new() | let s:state = s:state()
  call s:observe() | let s:state.directPending = v:true
  let s:state.messageEvents.items = [s:event('direct-own', 'other', v:true), s:event('direct-native', 'other', v:true)]
  call assert_equal([], s:observe())
  call assert_equal(0, len(s:t.held))
  call wbx#notify_events#sent(s:t, 'other', 'direct-own')
  let s:now += 35000
  let s:state.messageEvents.items = [] | let s:state.directPending = v:false
  let released = s:observe()
  call assert_equal([],released,'DM completion cannot release another-client self messages')
  call assert_equal([], s:observe(), 'DM completion cannot replay creations')
  " MF15 rich/file uses directPending too; privacy changes apply at release,
  " not just when the peer/file event first entered the shared bounded hold.
  let s:now = wbx#notify_events#time('2026-11-11T12:00:00Z')
  let s:t = wbx#notify_events#new() | let s:state = s:state()
  call s:observe() | let s:state.directPending = v:true
  let s:state.messageEvents.items = [s:event('mf15-own', 'other', v:true), s:event('mf15-other-client', 'other', v:true)]
  call assert_equal([], s:observe())
  call assert_equal(0, len(s:t.held), 'rich/file self events are suppressed without retaining a hold')
  call wbx#notify_events#sent(s:t, 'other', 'mf15-own')
  let s:state.messageEvents.preview = v:false | let s:state.senderNames = v:false
  let s:state.directPending = v:false
  let released = s:observe()
  call assert_equal([],released,'rich/file self previews and captions cannot surface after completion')

  " Exercise mute/privacy/disconnect/dispatch through the real native owner.
  let g:wbx_tui = {'notifications': {'sender_names': 1, 'suppress_visible': 0, 'mode': 'editor'}}
  call wbx#notifications#start()
  let g:upload_clock = wbx#notify_events#time('2026-11-11T12:00:00Z')
  call wbx#notifications#observe(s:state())
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/notifications.vim$"')[0].sid
  execute 'function! <SNR>' . sid . "_now() abort\nreturn g:upload_clock\nendfunction"
  let Flush = function('<SNR>' . sid . '_flush')
  for mode in ['release', 'mute', 'disabled', 'disconnect', 'privacy']
    let g:upload_clock = wbx#notify_events#time('2026-11-11T12:00:00Z')
    call wbx#notifications#stop() | call wbx#notifications#start()
    let s:now = g:upload_clock
    let state = s:state()
    call wbx#notifications#observe(state)
    let state.uploadPending = v:true
    let state.messageEvents.items = [s:event(mode, 'other', v:true)]
    let before = wbx#notifications#status().submitted.editor
    call wbx#notifications#observe(state)
    call Flush(-1)
    call assert_equal(before, wbx#notifications#status().submitted.editor, 'no pre-ACK echo alert')
    if mode ==# 'mute' | call wbx#notifications#mute('1') | call wbx#notifications#resume()
    elseif mode ==# 'disabled'
      let g:wbx_tui.notifications.enabled = 0 | call wbx#notifications#observe(state) | let g:wbx_tui.notifications.enabled = 1
    elseif mode ==# 'disconnect' | call wbx#notifications#stop() | call wbx#notifications#start()
    elseif mode ==# 'privacy'
      let state.senderNames = v:false | let state.messageEvents.senderNames = v:false | let state.messageEvents.preview = v:false
    endif
    let g:upload_clock += 60000
    let state.uploadPending = v:false | let state.messageEvents.items = []
    call wbx#notifications#observe(state) | call Flush(-1)
    call assert_equal(before, wbx#notifications#status().submitted.editor, mode . ': no self notification before or after ACK')
  endfor
  call assert_false(wbx#transport#running())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
