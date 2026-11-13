" Owned history/Spaces statuscolumn adapter; original formats/click handlers remain.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:prefix = '%!wbx#gutter#column('
function! wbx#gutter#style(...) abort
  let buffer = a:0 ? a:1 : bufnr('%')
  let style = getbufvar(buffer, 'wbx_message_borders', get(get(g:, 'wbx_tui', {}), 'message_borders', 'gutter'))
  return style ==# 'gutter' && has('nvim-0.10') && exists('+statuscolumn')
        \ && getbufvar(buffer, 'wbx_block_display', 'nvim-inline') ==# 'nvim-inline' ? 'gutter' : 'rails'
endfunction
function! s:presence(buffer) abort
  return has('nvim-0.10') && exists('+statuscolumn') && wbx#view#owned(a:buffer, 'rooms')
        \ && !empty(getbufvar(a:buffer, 'wbx_presence_gutter', {}))
endfunction
function! s:owned(buffer) abort
  if s:presence(a:buffer) | return 1 | endif
  return a:buffer > 0 && bufname(a:buffer) ==# 'wbx://history' && getbufvar(a:buffer, '&buftype') ==# 'nofile'
        \ && getbufvar(a:buffer, 'wbx_kind', '') ==# 'history'
endfunction
function! wbx#gutter#highlights() abort
  highlight default link WbxMessageGutter NonText
  highlight default link WbxReplyGutter Comment
endfunction
function! s:base(value) abort
  " Native splits copy options, not ownership variables. Decode only our own
  " generated string literal, without evaluating any option text.
  if stridx(a:value, s:prefix) != 0 || strpart(a:value, strlen(a:value) - 1) !=# ')'
    return a:value
  endif
  let literal = strpart(a:value, strlen(s:prefix), strlen(a:value) - strlen(s:prefix) - 1)
  if strlen(literal) < 2 || literal[0] !=# "'" || literal[-1:] !=# "'" | return a:value | endif
  let inside = strpart(literal, 1, strlen(literal) - 2)
  if substitute(inside, "''", '', 'g') =~# "'" | return a:value | endif
  return substitute(inside, "''", "'", 'g')
endfunction
function! s:copied_showbreak(column) abort
  if exists('w:wbx_history_showbreak') | return | endif
  for info in getwininfo()
    if info.winid == win_getid() | continue | endif
    let owner = getwinvar(info.winid, 'wbx_gutter', {})
    let gap = getwinvar(info.winid, 'wbx_history_showbreak', {})
    if get(owner, 'installed', '') ==# a:column && !empty(gap) && gap.installed ==# &l:showbreak
      let w:wbx_history_showbreak = copy(gap)
      return
    endif
  endfor
endfunction
function! wbx#gutter#leave() abort
  if exists('w:wbx_gutter')
    if exists('+statuscolumn') && &l:statuscolumn ==# w:wbx_gutter.installed
      let &l:statuscolumn = w:wbx_gutter.before
    endif
    unlet w:wbx_gutter
  elseif exists('+statuscolumn')
    let base = s:base(&l:statuscolumn)
    if base !=# &l:statuscolumn
      call s:copied_showbreak(&l:statuscolumn)
      let &l:statuscolumn = base
    endif
  endif
  if exists('w:wbx_history_showbreak')
    if &l:showbreak ==# w:wbx_history_showbreak.installed | let &l:showbreak = w:wbx_history_showbreak.before | endif
    unlet w:wbx_history_showbreak
  endif
endfunction
function! wbx#gutter#enter() abort
  if !s:owned(bufnr('%')) || !s:presence(bufnr('%')) && wbx#gutter#style() !=# 'gutter'
    if exists('w:wbx_gutter') || !s:owned(bufnr('%')) | call wbx#gutter#leave() | endif
    return
  endif
  if exists('w:wbx_history_showbreak') && w:wbx_history_showbreak.installed ==# '  │ '
    if &l:showbreak ==# w:wbx_history_showbreak.installed
      let &l:showbreak = '  '
      let w:wbx_history_showbreak.installed = '  '
    endif
  endif
  if exists('w:wbx_gutter')
    if w:wbx_gutter.buffer == bufnr('%')
      if &l:statuscolumn !=# w:wbx_gutter.installed
        " Explicit FileType/later local overrides win, including future polls.
        let w:wbx_gutter_override = bufnr('%')
        unlet w:wbx_gutter
      endif
      return
    endif
    call wbx#gutter#leave()
  endif
  if get(w:, 'wbx_gutter_override', -1) == bufnr('%') | return | endif
  let base = s:base(&l:statuscolumn)
  if base !=# &l:statuscolumn | call s:copied_showbreak(&l:statuscolumn) | endif
  let installed = s:prefix . string(base) . ')'
  let w:wbx_gutter = {'buffer': bufnr('%'), 'before': base, 'installed': installed}
  let &l:statuscolumn = installed
  if !s:presence(bufnr('%')) && empty(&l:showbreak)
    let w:wbx_history_showbreak = {'before': &l:showbreak, 'installed': '  '}
    let &l:showbreak = '  '
  endif
endfunction
function! wbx#gutter#column(base) abort
  " Native %! semantics for the user's original expression only. Never eval
  " message bodies, titles, IDs or other backend-supplied text.
  let format = stridx(a:base, '%!') == 0 ? eval(strpart(a:base, 2)) : empty(a:base) ? '%C%s%l' : a:base
  let info = getwininfo(get(g:, 'statusline_winid', win_getid()))
  if empty(info) | return format | endif
  let buffer = info[0].bufnr
  if !s:owned(buffer) || !s:presence(buffer) && wbx#gutter#style(buffer) !=# 'gutter'
        \ || getbufvar(buffer, 'wbx_render_tick', -1) != getbufvar(buffer, 'changedtick')
    return format
  endif
  if s:presence(buffer)
    let badge = v:virtnum == 0 ? get(getbufvar(buffer, 'wbx_presence_gutter', {}), string(v:lnum), {}) : {}
    let cue = get(badge, 'cue', '')
    let slot = cue . repeat(' ', max([0, 2 - strdisplaywidth(cue)]))
    return format . '%T%=%#' . get(badge, 'group', 'Normal') . '#' . slot . '%*'
  endif
  let mark = ' '
  let group = 'WbxMessageGutter'
  if v:virtnum >= 0
    let blocks = getbufvar(buffer, 'wbx_message_blocks', [])
    let low = 0
    let high = len(blocks) - 1
    while low <= high
      let middle = (low + high) / 2
      let block = blocks[middle]
      if v:lnum < block.start
        let high = middle - 1
      elseif v:lnum > block.end
        let low = middle + 1
      else
        if v:lnum != block.end
          " Ambiguous-width/custom cell-width settings must not widen the slot.
          let mark = strdisplaywidth('▎') == 1 ? '▎' : '|'
          let group = get(block, 'indent', 0) ? 'WbxReplyGutter' : 'WbxMessageGutter'
        endif
        break
      endif
    endwhile
  endif
  " Do not flatten the original format: preserve its native click regions and
  " highlight directives. The appended slot ends any inherited click region.
  return format . '%T%=%#' . group . '#' . mark . '%*'
endfunction
augroup wbx_gutter_defaults
  autocmd!
  autocmd ColorScheme * call wbx#gutter#highlights()
augroup END
augroup wbx_gutter_windows
  autocmd!
  autocmd BufWinEnter,WinEnter,WinNew * if index(['history', 'rooms'], get(b:, 'wbx_kind', '')) >= 0 || exists('w:wbx_gutter') || exists('w:wbx_history_showbreak') || exists('+statuscolumn') && stridx(&l:statuscolumn, s:prefix) == 0 | call wbx#gutter#enter() | endif
  autocmd BufWinLeave * if exists('w:wbx_gutter') || exists('w:wbx_history_showbreak') | call wbx#gutter#leave() | endif
  autocmd BufFilePost * if index(['history', 'rooms'], get(b:, 'wbx_kind', '')) >= 0 || exists('w:wbx_gutter') | call wbx#gutter#enter() | endif
  autocmd OptionSet buftype if index(['history', 'rooms'], get(b:, 'wbx_kind', '')) >= 0 || exists('w:wbx_gutter') | call wbx#gutter#enter() | endif
augroup END
call wbx#gutter#highlights()
let &cpoptions = s:save_cpo
unlet s:save_cpo
