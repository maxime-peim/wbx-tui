" Passive selected-DM presentation only. Provider reads and native details stay elsewhere.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:popup = {}
let s:selection = []
let s:dismissed = 0
let s:updating = 0
function! s:exists() abort
  if empty(s:popup) || !bufexists(s:popup.buffer) | return 0 | endif
  return has('nvim') ? nvim_win_is_valid(s:popup.window) && nvim_win_get_buf(s:popup.window) == s:popup.buffer
        \ : !empty(popup_getpos(s:popup.window)) && winbufnr(s:popup.window) == s:popup.buffer
endfunction
function! s:clean() abort
  return s:exists() && getbufvar(s:popup.buffer, 'wbx_people_popup', '') ==# 'owned-people-snapshot'
        \ && getbufvar(s:popup.buffer, 'changedtick') == s:popup.tick
        \ && bufname(s:popup.buffer) ==# s:popup.name && getbufvar(s:popup.buffer, '&buftype') ==# s:popup.type
        \ && !getbufvar(s:popup.buffer, '&modifiable') && !getbufvar(s:popup.buffer, '&modified')
        \ && empty(filter(getwininfo(), 'v:val.bufnr == s:popup.buffer && v:val.winid != s:popup.window'))
endfunction
function! s:undo() abort
  if !has('nvim') || undotree().synced | return {} | endif
  return {'window': win_getid(), 'buffer': bufnr('%'), 'tick': b:changedtick, 'seq': undotree().seq_cur}
endfunction
function! s:restore_undo(saved) abort
  " Non-entering Neovim float APIs sync the foreground undo block; never join new edits.
  if !empty(a:saved) && win_getid() == a:saved.window && bufnr('%') == a:saved.buffer
        \ && b:changedtick == a:saved.tick && undotree().seq_cur == a:saved.seq
    silent! undojoin
  endif
endfunction
function! s:close() abort
  if s:clean()
    if has('nvim') | call nvim_win_close(s:popup.window, v:false)
    else | call popup_close(s:popup.window) | endif
  endif
  " Keep geometry, not edit ownership, while an annotated overlay still covers history.
  if !s:exists() | let s:popup = {} | endif
endfunction
function! wbx#people_popup#hide(...) abort
  if s:updating | return | endif
  let undo = s:undo()
  let s:updating = 1
  try
    call s:close()
    if a:0 && a:1 | let s:dismissed = 1 | endif
  finally
    let s:updating = 0
    call s:restore_undo(undo)
  endtry
endfunction
function! s:wrap(lines, width) abort
  let lines = []
  for text in a:lines
    let part = ''
    for char in split(text, '\zs')
      if !empty(part) && strdisplaywidth(part . char) > a:width
        call add(lines, part) | let part = ''
      endif
      let part .= char
    endfor
    call add(lines, part)
  endfor
  return lines
endfunction
function! s:sync(state) abort
  let room = get(a:state, 'room', v:null)
  let key = [get(get(a:state, 'localContext', {}), 'sessionId', ''), type(room) == v:t_dict ? get(room, 'id', '') : '']
  if key !=# s:selection
    call s:close() | let s:selection = key | let s:dismissed = 0
  endif
  if !empty(s:popup) && !s:clean()
    " External dismissal/edit/promotion is not permission to recreate or overwrite.
    if !s:exists() | let s:popup = {} | endif
    let s:dismissed = 1
  endif
  let value = get(a:state, 'peopleStatus', {})
  let kind = get(b:, 'wbx_kind', '')
  if s:dismissed || !wbx#options#normalized().people_status || get(a:state, 'state', '') !=# 'ready'
        \ || !get(a:state, 'ready', 0) || empty(key[0]) || type(room) != v:t_dict || get(room, 'type', '') !=# 'direct'
        \ || get(room, 'cached', 0) || !wbx#protocol#people(value) || get(value, 'roomId', '') !=# room.id
        \ || get(value, 'reason', '') ==# 'unsupported-person'
        \ || index(['history', 'compose', 'rooms'], kind) < 0 || !wbx#view#owned(bufnr('%'), kind)
    call s:close() | return
  endif
  let anchors = filter(getwininfo(), 'v:val.tabnr == tabpagenr() && wbx#view#owned(v:val.bufnr, "history")'
        \ . ' && !wbx#view#edited(v:val.bufnr) && getbufvar(v:val.bufnr, "wbx_history_room", "") ==# room.id')
  if empty(anchors) | call s:close() | return | endif
  let info = anchors[0]
  let width = min([64, info.width - 4]) | let height = info.height - 4
  if width < 20 || height < 3 | call s:close() | return | endif
  let lines = [wbx#people#line(value)]
  if has_key(value, 'displayName') | call insert(lines, value.displayName, 0) | endif
  if has_key(value, 'lastActivity') | call add(lines, 'Last activity: ' . value.lastActivity) | endif
  let width = min([width, max(map(copy(lines), 'strdisplaywidth(v:val)'))])
  let lines = s:wrap(lines, width)
  if len(lines) > height | let lines = lines[:height - 2] + ['…'] | endif
  let layout = [info.winid, info.winrow, info.wincol, info.width, info.height, width, len(lines)]
  if !empty(s:popup) && s:popup.layout ==# layout && getbufline(s:popup.buffer, 1, '$') ==# lines | return | endif
  let col = info.width - width - 2
  if !empty(s:popup) && s:popup.layout !=# layout
    " Resize the owned frame in place; closing it flashes on status refreshes.
    if has('nvim')
      call nvim_win_set_config(s:popup.window, {'relative': 'win', 'win': info.winid, 'row': 1, 'col': col,
            \ 'width': width, 'height': len(lines)})
    else
      call popup_move(s:popup.window, {'line': info.winrow + 1, 'col': info.wincol + col,
            \ 'minwidth': width, 'maxwidth': width, 'maxheight': len(lines)})
    endif
    let s:popup.anchor = info.winid | let s:popup.layout = layout
  endif
  if empty(s:popup)
    if has('nvim')
      let buffer = nvim_create_buf(v:false, v:true)
      call nvim_buf_set_lines(buffer, 0, -1, v:true, lines)
      let window = nvim_open_win(buffer, v:false, {'relative': 'win', 'win': info.winid, 'row': 1, 'col': col,
            \ 'width': width, 'height': len(lines), 'style': 'minimal', 'focusable': v:false, 'border': 'rounded'})
      call setwinvar(window, '&winhl', 'Normal:NormalFloat,NormalNC:NormalFloat')
      call setbufvar(buffer, '&bufhidden', 'wipe')
    elseif exists('*popup_create')
      let window = popup_create(lines, {'title': ' People ', 'line': info.winrow + 1, 'col': info.wincol + col,
            \ 'border': [1, 1, 1, 1], 'borderchars': ['─', '│', '─', '│', '╭', '╮', '╯', '╰'], 'highlight': 'Pmenu',
            \ 'borderhighlight': ['Comment'], 'minwidth': width, 'maxwidth': width, 'maxheight': len(lines),
            \ 'wrap': 0, 'mapping': 0, 'close': 'click'})
      let buffer = winbufnr(window)
    else
      return
    endif
    let s:popup = {'window': window, 'buffer': buffer, 'anchor': info.winid, 'layout': layout,
          \ 'name': bufname(buffer), 'type': getbufvar(buffer, '&buftype')}
    call setbufvar(buffer, 'wbx_people_popup', 'owned-people-snapshot')
  elseif getbufline(s:popup.buffer, 1, '$') !=# lines
    call setbufvar(s:popup.buffer, '&modifiable', 1)
    call setbufline(s:popup.buffer, 1, lines)
    if len(getbufline(s:popup.buffer, 1, '$')) > len(lines) | call deletebufline(s:popup.buffer, len(lines) + 1, '$') | endif
  endif
  call setbufvar(s:popup.buffer, '&swapfile', 0)
  call setbufvar(s:popup.buffer, '&modeline', 0)
  call setbufvar(s:popup.buffer, '&modified', 0)
  call setbufvar(s:popup.buffer, '&modifiable', 0)
  let s:popup.tick = getbufvar(s:popup.buffer, 'changedtick')
endfunction
function! wbx#people_popup#sync(state) abort
  if s:updating | return | endif
  let s:updating = 1 | let undo = s:undo()
  try
    call s:sync(a:state)
  finally
    let s:updating = 0
    call s:restore_undo(undo)
  endtry
endfunction
function! wbx#people_popup#obscures(window, row) abort
  if !s:exists() || s:popup.anchor != a:window | return 0 | endif
  if has('nvim')
    let top = nvim_win_get_position(s:popup.window)[0]
    let bottom = top + nvim_win_get_height(s:popup.window) + 2
  else
    let position = popup_getpos(s:popup.window)
    let top = position.line | let bottom = top + position.height - 1
  endif
  return a:row >= top && a:row <= bottom
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
