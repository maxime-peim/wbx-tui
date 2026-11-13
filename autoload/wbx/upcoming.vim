" Inert scheduling projection. No URL, timer, startup, join or transport owner.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! s:local(value) abort
  " Pure UTC civil-date conversion; no process, provider or locale-dependent
  " strptime('%z') support is needed (Vim and Neovim differ there).
  let y = str2nr(strpart(a:value, 0, 4)) | let m = str2nr(strpart(a:value, 5, 2)) | let d = str2nr(strpart(a:value, 8, 2))
  let y -= m <= 2
  let era = y / 400 | let yy = y - era * 400
  let days = era * 146097 + yy * 365 + yy / 4 - yy / 100 + (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1 - 719468
  let seconds = days * 86400 + str2nr(strpart(a:value, 11, 2)) * 3600 + str2nr(strpart(a:value, 14, 2)) * 60 + str2nr(strpart(a:value, 17, 2))
  return strftime('%Y-%m-%d %H:%M %Z', seconds)
endfunction
function! wbx#upcoming#joined(value, disconnected) abort
  let view = {'lines': [], 'ids': []}
  if !wbx#protocol#joined_meetings(a:value) || a:value.state ==# 'off' | return view | endif
  if a:disconnected || a:value.state ==# 'unavailable'
    let view.lines = ['[Joined-elsewhere discovery unavailable · no call state assumed]', '']
  elseif a:value.state ==# 'loading'
    let view.lines = ['[Checking meetings joined elsewhere…]', '']
  else
    let view.lines = ['Already joined elsewhere · read-only']
    for item in a:value.items
      call add(view.lines, '  ' . item.title . ' · joined on another device')
      call add(view.ids, json_encode(['joined-meeting', item.id]))
    endfor
    if empty(a:value.items) | call add(view.lines, '[No joined-elsewhere meetings observed]') | endif
    call extend(view.lines, ['[Partial SDK view · no join, transfer or leave controls]', ''])
    let view.ids = [''] + view.ids
  endif
  call extend(view.ids, repeat([''], len(view.lines) - len(view.ids)))
  return view
endfunction
function! wbx#upcoming#render(value, offset) abort
  let view = {'lines': [], 'ids': [], 'rows': {}, 'footer': ''}
  if !wbx#protocol#upcoming(a:value) | return view | endif
  if !empty(a:value.items)
    let view.lines = ['Upcoming · ' . (a:value.state ==# 'ready' ? 'Enter to join' : 'cached; refresh to join')]
    let view.ids = ['']
    for item in a:value.items
      call add(view.lines, '  ' . item.title . ' · ' . strpart(item.start, 0, 16) . 'Z → ' . strpart(item.end, 0, 16) . 'Z'
            \ . ' · local ' . s:local(item.start) . ' → ' . s:local(item.end)
            \ . ' · ' . (a:value.state ==# 'ready' && item.joinable ? 'Enter to join' : 'not joinable: ' . get(item, 'joinReason', 'refresh required')))
      call add(view.ids, json_encode(['meeting', item.id]))
      let view.rows[a:offset + len(view.lines)] = {'id': item.id, 'revision': a:value.revision, 'joinable': item.joinable}
    endfor
    call extend(view.lines, ['', 'Spaces'])
    call extend(view.ids, ['', ''])
  endif
  if a:value.state ==# 'scope-required'
    let view.footer = '[Upcoming meetings unavailable]'
  elseif index(['stale', 'unavailable'], a:value.state) >= 0
    let view.footer = '[Upcoming meetings unavailable · cached]'
  elseif a:value.state ==# 'ready' && !a:value.complete
    let view.footer = '[Upcoming Webex API view is partial; not a complete calendar.]'
  endif
  return view
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
