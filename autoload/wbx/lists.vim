" Owned on-demand lists only. No provider requests, mutations or receipt authority.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:names = {'members': 'wbx://members', 'teams': 'wbx://server-teams',
      \ 'bookmarks': 'wbx://bookmarks', 'thread': 'wbx://loaded-thread', 'content': 'wbx://loaded-content', 'directory': 'wbx://directory',
      \ 'remote-thread': 'wbx://remote-thread', 'mentions': 'wbx://mentions', 'query-message': 'wbx://query-message', 'profile': 'wbx://profile',
      \ 'joined-teams': 'wbx://joined-teams', 'direct-visibility': 'wbx://direct-visibility', 'saved-drafts': 'wbx://saved-drafts',
      \ 'reaction-unresolved': 'wbx://reaction-unresolved', 'reactions': 'wbx://reactions', 'unread-status': 'wbx://unread-status',
      \ 'people-details': 'wbx://people-details'}
function! wbx#lists#owned(buffer, kind) abort
  return has_key(s:names, a:kind) && a:buffer > 0 && bufexists(a:buffer)
        \ && getbufvar(a:buffer, '&buftype') ==# 'nofile' && bufname(a:buffer) ==# s:names[a:kind]
        \ && getbufvar(a:buffer, 'wbx_list_kind', '') ==# a:kind
endfunction
function! wbx#lists#clean(buffer, kind) abort
  return wbx#lists#owned(a:buffer, a:kind)
        \ && !getbufvar(a:buffer, 'wbx_list_unloaded', 0)
        \ && getbufvar(a:buffer, 'wbx_list_tick', -1) == getbufvar(a:buffer, 'changedtick')
        \ && !getbufvar(a:buffer, '&modified')
endfunction
function! wbx#lists#admit(kind) abort
  if !has_key(s:names, a:kind) | return 0 | endif
  let buffer = bufnr(get(s:names, a:kind, '^$'))
  if buffer == bufnr('%') && !wbx#lists#owned(buffer, a:kind) | call wbx#lists#setup() | endif
  if buffer <= 0 || wbx#lists#clean(buffer, a:kind) | return 1 | endif
  if !bufloaded(buffer) && wbx#lists#owned(buffer, a:kind)
        \ && getbufvar(buffer, 'wbx_list_unloaded', 0) && getbufvar(buffer, 'wbx_list_saved_clean', 0) | return 1 | endif
  echomsg '[wbx-tui] List annotations/promoted buffer retained. Close/rename it explicitly before generating that view.'
  return 0
endfunction
function! wbx#lists#unload(buffer) abort
  let kind = getbufvar(a:buffer, 'wbx_list_kind', '')
  if !wbx#lists#owned(a:buffer, kind) | return | endif
  if getbufvar(a:buffer, 'wbx_list_unloaded', 0) && getbufline(a:buffer, 1, '$') ==# [''] | return | endif
  let clean = wbx#lists#clean(a:buffer, kind)
  call setbufvar(a:buffer, 'wbx_list_saved_clean', clean)
  call setbufvar(a:buffer, 'wbx_list_saved_modifiable', getbufvar(a:buffer, '&modifiable'))
  call setbufvar(a:buffer, 'wbx_list_saved_lines', getbufline(a:buffer, 1, '$'))
  call setbufvar(a:buffer, 'wbx_list_unloaded', 1)
endfunction
function! wbx#lists#loaded() abort
  let kind = get(b:, 'wbx_list_kind', '')
  if !wbx#lists#owned(bufnr('%'), kind) || !get(b:, 'wbx_list_unloaded', 0)
        \ || exists('*win_gettype') && win_gettype() ==# 'autocmd' | return | endif
  let restore = getline(1, '$') ==# [''] && !&modified
        \ && (!get(b:, 'wbx_list_saved_clean', 0) || !&modifiable)
  if restore
    setlocal modifiable
    call setline(1, get(b:, 'wbx_list_saved_lines', ['']))
    let &l:modifiable = get(b:, 'wbx_list_saved_modifiable', 0)
    setlocal nomodified
  endif
  let b:wbx_list_tick = restore && get(b:, 'wbx_list_saved_clean', 0) ? b:changedtick : -1
  let b:wbx_list_unloaded = 0
endfunction
function! wbx#lists#setup() abort
  for map in get(b:, 'wbx_list_maps', [])
    if maparg(map.lhs, 'n', 0, 1) ==# map | execute 'silent! nunmap <buffer> ' . map.lhs | endif
  endfor
  let b:wbx_list_maps = []
  let kind = get(b:, 'wbx_list_kind', '')
  if !wbx#lists#owned(bufnr('%'), kind) || !get(get(g:, 'wbx_tui', {}), 'mappings', 1) | return | endif
  if kind ==# 'profile'
    let maps = [['r', ':<C-u>WebexProfileRefresh<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif index(['unread-status', 'reactions'], kind) >= 0
    let maps = [['q', ':call wbx#lists#close()<CR>']]
  elseif kind ==# 'people-details'
    let maps = [['r', ':<C-u>WebexPeople<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif kind ==# 'reaction-unresolved'
    let maps = [['r', ':<C-u>WebexReactionUnresolved<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif kind ==# 'saved-drafts'
    let maps = [['r', ':<C-u>WebexDrafts<CR>'], ['<CR>', ':<C-u>WebexDraftExport<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif kind ==# 'direct-visibility'
    let maps = [['r', ':<C-u>WebexDirectVisibilityRefresh<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif index(['bookmarks', 'thread', 'content'], kind) >= 0
    let maps = [['r', ':<C-u>call wbx#productivity#refresh()<CR>'],
          \ ['<CR>', ':<C-u>call wbx#productivity#jump()<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  elseif index(['remote-thread', 'mentions', 'query-message'], kind) >= 0
    let maps = [['r', ':<C-u>WebexQueryRefresh<CR>'], [']p', ':<C-u>WebexQueryMore<CR>'],
          \ ['<CR>', kind ==# 'mentions' ? ':<C-u>WebexQueryMessage<CR>' : ':<C-u>WebexQueryJump<CR>'],
          \ ['q', ':call wbx#lists#close()<CR>']]
  else
    let commands = kind ==# 'members' ? ['WebexMembers', 'WebexMembersMore', 'WebexMemberAction']
          \ : kind ==# 'directory' ? ['WebexDirectoryRefresh', 'WebexDirectoryMore', 'WebexDirectoryDirect']
          \ : kind ==# 'joined-teams' ? ['WebexJoinedTeamsRefresh', 'WebexJoinedTeamsMore', 'WebexJoinedTeamFilter']
          \ : ['WebexTeams', 'WebexTeamsMore', 'WebexTeamFilter']
    let maps = [['r', ':<C-u>' . commands[0] . '<CR>'], [']p', ':<C-u>' . commands[1] . '<CR>'],
          \ ['<CR>', ':<C-u>' . commands[2] . '<CR>'], ['q', ':call wbx#lists#close()<CR>']]
  endif
  for map in maps
    if !empty(mapcheck(map[0], 'n')) | continue | endif
    execute 'nnoremap <silent> <buffer> ' . map[0] . ' ' . map[1]
    call add(b:wbx_list_maps, maparg(map[0], 'n', 0, 1))
  endfor
endfunction
function! s:anchor(rows, row) abort
  let id = get(a:rows, a:row - 1, '')
  return [id, empty(id) ? 0 : a:row - index(a:rows, id) - 1]
endfunction
function! s:anchored_row(rows, anchor) abort
  let first = empty(a:anchor[0]) ? -1 : index(a:rows, a:anchor[0])
  if first < 0 | return 0 | endif
  let offset = 0
  while offset < a:anchor[1] && get(a:rows, first + offset + 1, '') ==# a:anchor[0] | let offset += 1 | endwhile
  return first + offset + 1
endfunction
function! wbx#lists#selected_id() abort
  return get(get(b:, 'wbx_list_row_ids', []), line('.') - 1, '')
endfunction
function! wbx#lists#show(kind, lines, ...) abort
  if !wbx#lists#admit(a:kind) | return 0 | endif
  let rows = a:0 ? deepcopy(a:1) : []
  if a:0 && (type(rows) != v:t_list || len(rows) != len(a:lines) || !empty(filter(copy(rows), 'type(v:val) != v:t_string'))) | return 0 | endif
  let buffer = bufnr(s:names[a:kind])
  let origin = bufnr('%') != buffer ? {'window': win_getid(), 'buffer': bufnr('%')} : {}
  let window = wbx#view#local_window(buffer)
  let fresh = buffer <= 0
  if fresh
    execute 'new ' . s:names[a:kind]
    let buffer = bufnr('%')
    setlocal buftype=nofile bufhidden=hide noswapfile noundofile nomodeline
    let b:wbx_list_kind = a:kind
  elseif !window
    execute 'sbuffer ' . buffer
  elseif bufnr('%') != buffer
    call win_gotoid(window)
  endif
  if !empty(origin) | let w:wbx_list_origin = origin | endif
  if !fresh && !wbx#lists#clean(buffer, a:kind) | return 0 | endif
  let fold_views = {}
  if wbx#history#presentation()
    for window in win_findbuf(buffer)
      call win_execute(window,'let w:wbx_list_saved_folds = wbx#folds#save()')
      let fold_views[string(window)] = wbx#view#window_var(window,'wbx_list_saved_folds',{})
      call win_execute(window,'unlet w:wbx_list_saved_folds')
    endfor
  endif
  let view = winsaveview()
  let views = {}
  let previous = deepcopy(get(b:, 'wbx_list_row_ids', []))
  if !empty(previous) && !empty(rows)
    for window in win_findbuf(buffer)
      let saved = json_decode(trim(win_execute(window, 'echo json_encode(winsaveview())')))
      let views[string(window)] = {'view': saved, 'cursor': s:anchor(previous, saved.lnum), 'top': s:anchor(previous, saved.topline)}
    endfor
  endif
  setlocal modifiable
  if getline(1, '$') !=# a:lines
    call setline(1, a:lines)
    if line('$') > len(a:lines) | call deletebufline(buffer, len(a:lines) + 1, '$') | endif
  endif
  setlocal nomodifiable nomodified
  let b:wbx_list_tick = b:changedtick
  let b:wbx_list_row_ids = rows
  let b:wbx_list_fold_views = fold_views
  if fresh | execute 'setlocal filetype=wbx-' . a:kind | endif
  if !wbx#lists#clean(buffer, a:kind) | return 0 | endif
  if empty(views)
    call winrestview(view)
  else
    for [window, entry] in items(views)
      let info = getwininfo(str2nr(window))
      if empty(info) || info[0].bufnr != buffer | continue | endif
      let saved = entry.view
      let target = s:anchored_row(rows, entry.cursor)
      if !empty(entry.cursor[0]) && !target || empty(entry.cursor[0]) && !empty(get(rows, saved.lnum - 1, ''))
        let saved.lnum = 1 | let saved.topline = 1 | let saved.col = 0 | let saved.leftcol = 0 | let saved.skipcol = 0 | let saved.topfill = 0
      elseif target
        let top = s:anchored_row(rows, entry.top)
        let saved.topline = top ? top : max([1, target - (saved.lnum - saved.topline)])
        let saved.lnum = target
      endif
      call win_execute(str2nr(window), 'call winrestview(' . string(saved) . ')')
    endfor
  endif
  call wbx#lists#setup()
  return buffer
endfunction
function! wbx#lists#close() abort
  let kind = get(b:, 'wbx_list_kind', '')
  if !wbx#lists#clean(bufnr('%'), kind)
    echomsg '[wbx-tui] List annotations/promoted buffer retained.' | return
  endif
  let origin = get(w:,'wbx_list_origin',{})
  if winnr('$') > 1 | close | endif
  let windows = getwininfo(get(origin, 'window', 0))
  if !empty(windows) && windows[0].bufnr == get(origin, 'buffer', -1) | call win_gotoid(origin.window) | endif
endfunction
augroup wbx_native_lists
  autocmd!
  autocmd BufEnter * if exists('b:wbx_list_kind') | call wbx#lists#loaded() | call wbx#lists#setup() | endif
  autocmd BufUnload * if !empty(getbufvar(str2nr(expand('<abuf>')), 'wbx_list_kind', '')) | call wbx#lists#unload(str2nr(expand('<abuf>'))) | endif
  autocmd OptionSet buftype if exists('b:wbx_list_kind') | call wbx#lists#setup() | endif
  autocmd BufFilePost * if exists('b:wbx_list_kind') | call wbx#lists#setup() | endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
