" Stateless projection of accepted observations, never transmission/control or native-buffer authority.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#meeting_status#lines(meeting, events, connected) abort
  let meeting = a:meeting
  let events = a:events
  let lines = ['# Webex meeting · ' . (!a:connected ? 'STATUS UNKNOWN (backend disconnected)' : get(meeting, 'active', 0) ? 'ACTIVE' : 'inactive / no call reported'),
        \ 'Presentation: ' . get(meeting, 'display', 'editor'), 'Session: ' . string(get(meeting, 'session', '')), '',
        \ 'Controls: ' . (a:connected && get(meeting, 'ready', 0) ? 'ready' : 'unavailable; :WebexMeetingReconnect verifies the same owner (no rejoin/replay)'),
        \ 'Closing a view or editor does not imply the meeting ended.', 'Sending starts OFF.', '']
  let call_state = get(get(events, 'status', {}), 'state', 'unknown')
  let stale = !a:connected || !get(meeting, 'ready', 0) || !get(meeting, 'active', 0) || index(['failed', 'ended'], call_state) >= 0
  let prefix = stale ? 'Last reported ' : ''
  if stale | call add(lines, 'Observations STALE / current media state unknown; not proof of stopped sending.') | endif
  call add(lines, prefix . 'Call: ' . call_state)
  for kind in ['microphone', 'camera', 'screen']
    let item = get(events, 'send-state:' . kind, {})
    let state = get(item, 'state', 'unknown')
    let detail = state ==# 'on' ? ' (confirmed sending)' : state ==# 'awaiting' ? ' (pending trusted browser confirmation; not confirmed sending)'
          \ : state ==# 'starting' ? ' (starting; not confirmed sending)' : state ==# 'off' ? ' (not sending)' : ' (no observation)'
    call add(lines, prefix . kind . ': ' . state . detail . (has_key(item, 'reason') ? ' · reason: ' . item.reason : ''))
  endfor
  let preview = get(events, 'camera-state', {})
  call add(lines, prefix . 'Local preview: ' . get(preview, 'state', 'unknown') . ' · NOT SENT'
        \ . (has_key(preview, 'reason') ? ' · reason: ' . preview.reason : ''))
  let audio = get(events, 'audio-state', {})
  call add(lines, prefix . 'Rx audio playback: ' . (has_key(audio, 'enabled') ? (audio.enabled ? 'enabled' : 'disabled') : 'unknown') . ' (not microphone sending)')
  let sources = get(get(events, 'sources', {}), 'sources', v:null)
  call add(lines, prefix . 'Sources: bounded slots (max 16), NOT complete attendee/self/lobby coverage · '
        \ . (sources is v:null ? 'unknown / no observation' : empty(sources) ? 'none reported' : ''))
  call add(lines, 'Speaker layout: fixed main/secondary geometry, not active-speaker following.')
  if type(sources) == v:t_list
    for source in sources
      let role = source.id ==# 'self' ? 'Meeting camera source' : source.id ==# 'presenting' ? 'Meeting screen source'
            \ : source.id ==# 'local' ? 'Local preview (NOT SENT)' : 'Rx ' . source.kind . ': ' . substitute(source.label, '[\x00-\x1f\x7f]', ' ', 'g')
      call add(lines, '  ' . prefix . role . ' · ' . (source.available ? 'available' : 'unavailable')
            \ . (has_key(source, 'present') ? (source.present ? ' · participant present' : ' · participant not reported present') : ''))
    endfor
  endif
  for name in ['auth-state', 'notice']
    let item = get(events, name, {})
    if !empty(item)
      call add(lines, prefix . (name ==# 'notice' ? 'Notice: ' . substitute(item.message, '[\x00-\x1f\x7f]', ' ', 'g')
            \ : 'Authentication: ' . item.state . (has_key(item, 'reason') ? ' · reason: ' . item.reason : '')))
    endif
  endfor
  return lines
endfunction
function! wbx#meeting_status#compact(meeting, events, connected) abort
  if !get(a:meeting, 'active', 0) | return '' | endif
  let stale = !a:connected || !get(a:meeting, 'ready', 0) || index(['failed', 'ended'], get(get(a:events, 'status', {}), 'state', '')) >= 0
  let parts = []
  for pair in [['microphone', 'mic'], ['camera', 'cam'], ['screen', 'share']]
    call add(parts, pair[1] . ':' . (stale ? 'unknown' : get(get(a:events, 'send-state:' . pair[0], {}), 'state', 'unknown')))
  endfor
  let audio = get(a:events, 'audio-state', {})
  call add(parts, 'Rx:' . (stale || !has_key(audio, 'enabled') ? 'unknown' : audio.enabled ? 'on' : 'off'))
  return ' · CALL ' . (stale ? 'STALE/UNKNOWN' : 'reported') . ' ' . join(parts, ' ') . ' controls:' . (stale ? 'unavailable' : 'ready') . ' preview:NOT SENT'
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
