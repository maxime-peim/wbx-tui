" Native room styling follows row metadata, never text inside a room title.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#rooms#clear_presence(buffer) abort
  if !bufexists(a:buffer) | return | endif
  call setbufvar(a:buffer, 'wbx_presence_gutter', {})
  call sign_unplace('wbx-presence', {'buffer': a:buffer})
  if has('nvim')
    call nvim_buf_clear_namespace(a:buffer, nvim_create_namespace('wbx-presence'), 0, -1)
  elseif exists('*prop_remove')
    for group in keys(s:cue_texts)
      if !empty(prop_type_get(group, {'bufnr': a:buffer}))
        call prop_remove({'bufnr': a:buffer, 'type': group, 'all': 1}, 1, len(getbufline(a:buffer, 1, '$')))
      endif
    endfor
  endif
endfunction
function! s:presence_cues(badges) abort
  call wbx#rooms#clear_presence(bufnr('%'))
  for badge in a:badges
    if badge.row < 1 || badge.row > line('$') || !has_key(s:cue_texts, badge.group) | continue | endif
    let cue = get(badge, 'cue', s:cue_texts[badge.group])
    if has('nvim-0.10')
      let b:wbx_presence_gutter[string(badge.row)] = {'cue': cue, 'group': badge.group}
    else
      " Vim has no statuscolumn; keep its native sign gutter, never title text.
      let name = 'wbx-presence-' . badge.group . '-' . char2nr(cue)
      let existing = get(sign_getdefined(name), 0, {})
      if empty(existing)
        call sign_define(name, {'text': cue, 'texthl': badge.group})
      elseif get(existing, 'text', '') !=# cue || get(existing, 'texthl', '') !=# badge.group
        continue
      endif
      call sign_place(badge.row, 'wbx-presence', name, bufnr('%'), {'lnum': badge.row, 'priority': 10})
    endif
  endfor
  for window in win_findbuf(bufnr('%')) | call win_execute(window, 'call wbx#gutter#enter()') | endfor
  " Presence updates need fresh gutters, not a full-screen clear on every poll.
  redraw
endfunction
let s:cue_texts = {'WbxPresenceActive': '🟢', 'WbxPresenceBusy': '⛔', 'WbxPresenceAway': '🌙', 'WbxPresenceUnknown': '? '}
function! wbx#rooms#rows(rooms, selected, offset, displays, read_status, ...) abort
  if a:0 && (!empty(get(a:1, 'items', [])) || wbx#sections#current_filter() !=# 'all')
    return wbx#sections#rows(a:rooms, a:selected, a:offset, a:displays, a:read_status, a:1)
  endif
  let out = {'lines': [], 'ids': [], 'row_ids': [], 'unread': [], 'local_read': [], 'local_unread': [], 'cached': [], 'presence': [], 'unknown': 0, 'stale': 0}
  let index = 0
  for item in a:rooms
    let row = a:offset + index + 1
    let label = item.title
    if get(item, 'localDraft', 0) | let label .= ' [draft]' | endif
    if get(item, 'localReplyDraft', 0) | let label .= ' [reply draft]' | endif
    if get(item, 'recoverySaved', 0) | let label .= ' [saved]' | endif
    if get(item, 'recoveryUnsaved', 0) | let label .= ' [unsaved]' | endif
    if get(item, 'recoveryUncertain', 0) | let label .= ' [delivery unresolved]' | endif
    for flag in [['isLocked', 'locked'], ['isReadOnly', 'read-only'], ['isAnnouncementOnly', 'announcements']]
      if get(item, flag[0], v:false) is v:true | let label .= ' [observed ' . flag[1] . ']' | endif
    endfor
    let prefix = a:selected ==# item.id ? '● ' : '  '
    let badge = wbx#people#badge(item)
    if !empty(badge) | call add(out.presence, {'row': row, 'group': badge.group, 'cue': badge.cue, 'roomId': item.id}) | endif
    call add(out.lines, prefix . label)
    call add(out.ids, item.id)
    call add(out.row_ids, json_encode(['room', item.id]))
    if get(item, 'cached', 0) | call add(out.cached, row) | endif
    let display = a:displays[index]
    if display.unread is v:true | call add(out.unread, row) | endif
    if display.local ==# 'read' | call add(out.local_read, row) | endif
    if display.local ==# 'unread' | call add(out.local_unread, row) | endif
    if type(get(item, 'unread', v:null)) == v:t_bool
      if get(item, 'unreadStale', 0) || a:read_status !=# 'ready' | let out.stale += 1 | endif
    else
      let out.unknown += 1
    endif
    let index += 1
  endfor
  return out
endfunction

function! s:highlight(group) abort
  return hlexists(a:group) ? trim(substitute(execute('silent 0verbose highlight ' . a:group), '\_s\+', ' ', 'g')) : ''
endfunction

function! s:current_highlight() abort
  let previous = s:highlight('WbxCurrent')
  let ours = exists('s:current_default') && previous ==# s:current_default
  if ours
    highlight clear WbxCurrent
  endif
  " Background only: do not borrow a CursorLine foreground/bold that could
  " hide unread styling. Schemes without backgrounds get an underline cue.
  let definition = 'highlight default WbxCurrent term=underline'
  for [mode, attribute] in [['gui', 'bg#'], ['cterm', 'bg']]
    let background = ''
    for group in ['CursorLine', 'Visual']
      let color = synIDattr(synIDtrans(hlID(group)), attribute, mode)
      if mode ==# 'gui' ? color =~# '^\%(#[0-9A-Fa-f]\{6}\|[A-Za-z][A-Za-z0-9]*\)$' && color !=? 'NONE' : color =~# '^\d\+$'
        let background = color
        break
      endif
    endfor
    let definition .= empty(background) ? ' ' . mode . '=underline' : ' ' . mode . '=NONE ' . mode . 'bg=' . background
  endfor
  execute definition
  if ours || empty(previous) || previous =~# '\<cleared\>'
    let s:current_default = s:highlight('WbxCurrent')
  endif
endfunction

function! wbx#rooms#highlights() abort
  highlight default link WbxCachedSpace Comment
  let previous = s:highlight('WbxUnread')
  let ours = exists('s:unread_default') && previous ==# s:unread_default
  " Update only our own default when the colorscheme's accent changes. Native
  " user overrides and links remain authoritative, including after a reload.
  if ours
    highlight clear WbxUnread
  endif
  let source = synIDtrans(hlID('Special'))
  let gui = synIDattr(source, 'fg#', 'gui')
  let terminal = synIDattr(source, 'fg', 'cterm')
  let definition = 'highlight default WbxUnread term=bold cterm=bold gui=bold'
  " Neovim's built-in palette may return a named color rather than hex.
  if gui =~# '^\%(#[0-9A-Fa-f]\{6}\|[A-Za-z][A-Za-z0-9]*\)$'
    let definition .= ' guifg=' . gui
  endif
  if terminal =~# '^\d\+$'
    let definition .= ' ctermfg=' . terminal
  endif
  execute definition
  if ours || empty(previous) || previous =~# '\<cleared\>'
    let s:unread_default = s:highlight('WbxUnread')
  endif
  call s:current_highlight()
endfunction

function! wbx#rooms#clear_current() abort
  if win_gettype() ==# 'autocmd'
    return
  endif
  let owned = get(w:, 'wbx_current_match', {})
  " A user may have deleted/reused our numeric ID. Delete only the exact
  " match we installed, never all window matches or somebody else's match.
  if !empty(owned) && index(getmatches(), owned) >= 0
    call matchdelete(owned.id)
  endif
  unlet! w:wbx_current_match
endfunction

function! wbx#rooms#current() abort
  " bufload() may temporarily reuse a real window's variables in an autocmd
  " window. It must not release ownership of that real window's match.
  if win_gettype() ==# 'autocmd'
    return
  endif
  if !wbx#view#owned(bufnr('%'), 'rooms') || wbx#view#edited(bufnr('%'))
    call wbx#rooms#clear_presence(bufnr('%'))
    call wbx#gutter#enter()
    if exists('b:wbx_presence_syntax')
      for group in keys(s:cue_texts) | execute 'silent! syntax clear ' . group | endfor
      unlet! b:wbx_presence_syntax
    endif
  endif
  let row = 0
  if get(b:, 'wbx_kind', '') ==# 'rooms' && bufname('%') ==# 'wbx://spaces' && &l:buftype ==# 'nofile'
        \ && get(b:, 'wbx_render_tick', -1) == b:changedtick
    " Only trust the renderer's unchanged owned view, not a title containing
    " a marker or an unrelated file using the same syntax/highlight groups.
    let row = match(getline(1, '$'), '^● ') + 1
    if empty(get(get(b:, 'wbx_room_ids', []), row - 1, ''))
      let row = 0
    endif
  endif
  let owned = get(w:, 'wbx_current_match', {})
  if row > 0 && get(owned, 'pos1', []) ==# [row] && index(getmatches(), owned) >= 0
    return
  endif
  call wbx#rooms#clear_current()
  if row > 0
    " Native background-only matches combine with syntax foreground/bold.
    " Keep search/user matches above this cue, and never move the cursor.
    let id = matchaddpos('WbxCurrent', [row], -1)
    let w:wbx_current_match = get(filter(getmatches(), 'v:val.id == id'), 0, {})
  endif
endfunction

function! wbx#rooms#current_windows() abort
  for window in win_findbuf(bufnr('%'))
    let info = getwininfo(window)[0]
    " getwinvar() cannot inspect a window in another tab.
    if get(b:, 'wbx_kind', '') ==# 'rooms' || !empty(gettabwinvar(info.tabnr, info.winnr, 'wbx_current_match', {}))
      call win_execute(window, 'call wbx#rooms#current()')
    endif
  endfor
endfunction

function! wbx#rooms#syntax() abort
  call wbx#rooms#current()
  if get(b:, 'current_syntax', '') !=# 'wbx-rooms'
    return
  endif
  let rows = filter(copy(get(b:, 'wbx_unread_rows', [])), 'type(v:val) == v:t_number && v:val > 0 && v:val <= line("$")')
  let cached = filter(copy(get(b:, 'wbx_cached_rows', [])), 'type(v:val) == v:t_number && v:val > 0 && v:val <= line("$")')
  let presence = get(b:, 'wbx_presence_rows', [])
  if exists('b:wbx_unread_syntax_rows') && b:wbx_unread_syntax_rows ==# rows && get(b:, 'wbx_cached_syntax_rows', []) ==# cached
        \ && get(b:, 'wbx_presence_syntax', []) ==# presence && get(b:, 'wbx_decoration_tick', -1) == b:changedtick
    return
  endif
  silent! syntax clear WbxUnread
  silent! syntax clear WbxCachedSpace
  for group in ['WbxPresenceActive', 'WbxPresenceBusy', 'WbxPresenceAway', 'WbxPresenceUnknown']
    execute 'silent! syntax clear ' . group
  endfor
  if !empty(cached)
    let positions = map(copy(cached), '"\\%" . v:val . "l"')
    execute 'syntax match WbxCachedSpace /^\%(' . join(positions, '\|') . '\).*/'
  endif
  " Last-confirmed unread emphasis stays visible above the stale metadata mute;
  " provenance/receipt safety come from unreadStale, never highlight appearance.
  if !empty(rows)
    let positions = map(copy(rows), '"\\%" . v:val . "l"')
    execute 'syntax match WbxUnread /^\%(' . join(positions, '\|') . '\).*/ contains=WbxSelected'
  endif
  call s:presence_cues(presence)
  let b:wbx_unread_syntax_rows = rows
  let b:wbx_cached_syntax_rows = cached
  let b:wbx_presence_syntax = deepcopy(presence)
  " Replacing text moves signs even when row metadata did not change.
  let b:wbx_decoration_tick = b:changedtick
endfunction

augroup wbx_room_highlight_defaults
  autocmd!
  autocmd ColorScheme * call wbx#rooms#highlights()
augroup END
augroup wbx_room_current
  autocmd!
  autocmd BufWinLeave * if exists('w:wbx_current_match') | call wbx#rooms#clear_current() | endif
  autocmd BufWinEnter,WinEnter * if get(b:, 'wbx_kind', '') ==# 'rooms' || exists('w:wbx_current_match') | call wbx#rooms#current() | endif
  autocmd BufFilePost,TextChanged,TextChangedI * call wbx#rooms#current_windows()
  autocmd OptionSet buftype call wbx#rooms#current_windows()
augroup END
call wbx#rooms#highlights()

let &cpoptions = s:save_cpo
unlet s:save_cpo
