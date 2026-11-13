" Finite presentation choices through the independent owner; never device/join ownership.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! s:notice(text) abort
  echomsg '[wbx-tui] ' . a:text
endfunction
function! wbx#meeting#choose(kind) abort
  let meeting = wbx#meeting_state()
  if !wbx#meeting_supports('meeting-panes-v1') || !has_key(meeting, 'panes')
    call s:notice('Native pane adapter unavailable: owner initializing/disconnected or older backend/owner. Existing meeting controls remain separate.') | return
  endif
  if wbx#_meeting_pending() | call s:notice('Pane operation pending/unconfirmed. No request queued.') | return | endif
  let origin = wbx#view#intent()
  let epoch = wbx#meeting_epoch()
  let intents = []
  let lines = [a:kind ==# 'sources' ? 'Bounded source SLOTS (max 16), NOT complete attendees/self/lobby; choose existing source pane:'
        \ : 'Owned tmux presentation only. speaker = fixed main/secondary geometry, NOT active-speaker following:']
  if a:kind ==# 'sources'
    " Roster and revision MUST come from the same capability envelope, never
    " an independently arriving last-reported media event from an older roster.
    for source in meeting.panes.sources
      call add(intents, {'action': 'source.set', 'source': source.id, 'available': source.available || get(source, 'present', 0)})
      call add(lines, len(intents) . '. ' . source.id . ' · ' . source.label . ' · ' . (source.available ? 'available' : 'unavailable')
            \ . (has_key(source, 'generation') ? ' · slot generation ' . source.generation : ' · slot generation unreported'))
    endfor
    if empty(intents) | call s:notice('No source slots reported; no roster completeness is implied.') | return | endif
  else
    for layout in meeting.panes.layouts
      call add(intents, {'action': 'layout', 'layout': layout})
      call add(lines, len(intents) . '. Layout: ' . layout . (layout ==# 'speaker' ? ' (fixed main/secondary)' : ''))
    endfor
    for action in ['focus.next', 'focus.previous', 'focus.left', 'focus.right', 'focus.up', 'focus.down',
          \ 'pane.split.vertical', 'pane.split.horizontal', 'pane.close', 'pane.maximize', 'pane.grow', 'pane.shrink']
      call add(intents, {'action': action})
      call add(lines, len(intents) . '. ' . action . (action ==# 'pane.close' ? ' (owner pane cannot close)' : ''))
    endfor
  endif
  call s:pick(lines, function('s:chosen', [origin, epoch, meeting, intents]))
endfunction
function! s:chosen(origin, epoch, meeting, intents, choice) abort
  call wbx#_meeting_pane(a:origin, a:epoch, a:meeting, a:intents, a:choice)
endfunction
function! wbx#meeting#reset() abort
  call wbx#_meeting_reset()
endfunction
function! wbx#meeting#reconnect() abort
  call wbx#_meeting_reconnect()
endfunction
function! wbx#meeting#auth() abort
  call wbx#_meeting_auth()
endfunction
function! wbx#meeting#compact(meeting, events, connected) abort
  return wbx#meeting_status#compact(a:meeting, a:events, a:connected)
endfunction
augroup wbx_native_meeting
  autocmd!
  autocmd User WbxDisconnected call wbx#meeting#reset()
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
