" Native, per-window body folds. No mappings, text changes or transport actions.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:expr = 'wbx#folds#expr(v:lnum)'

function! s:history() abort
  return get(b:, 'wbx_kind', '') ==# 'history' && bufname('%') ==# 'wbx://history' && &l:buftype ==# 'nofile'
        \ && get(b:, 'wbx_render_tick', -1) == b:changedtick || wbx#history#presentation()
endfunction
function! s:enabled() abort
  return s:history() && get(b:, 'wbx_folds', get(get(g:, 'wbx_tui', {}), 'folds', 1))
endfunction
function! s:default(option, value) abort
  " :verbose distinguishes an untouched default from :setlocal foldlevel=0
  " in a user's hook. Never reinterpret an explicit native setting as ours.
  return eval('&l:' . a:option) ==# a:value && len(split(execute('verbose setlocal ' . a:option . '?'), "\n")) == 1
endfunction
function! s:options() abort
  return {'foldmethod': &l:foldmethod, 'foldexpr': &l:foldexpr, 'foldtext': &l:foldtext, 'foldlevel': &l:foldlevel}
endfunction
function! s:release_defaults() abort
  let defaults = get(w:, 'wbx_fold_defaults', {})
  if get(defaults, 'buffer', -1) != bufnr('%') | return | endif
  " A FileType hook may opt out after pre-hook defaults were installed. Undo
  " only our still-unchanged settings, never a hook's native customization.
  for option in ['foldtext', 'foldlevel', 'foldexpr', 'foldmethod']
    if eval('&l:' . option) ==# defaults.installed[option] && defaults.before[option] !=# defaults.installed[option]
      execute 'let &l:' . option . ' = ' . string(defaults.before[option])
    endif
  endfor
  unlet! w:wbx_fold_defaults
endfunction
function! wbx#folds#setup(...) abort
  if !s:history() | call s:release_defaults() | return 0 | endif
  if !s:enabled()
    call s:release_defaults()
    return 0
  endif
  if &l:foldmethod ==# 'expr' && &l:foldexpr ==# s:expr | return 1 | endif
  if exists('w:wbx_folds_buffer') && w:wbx_folds_buffer == bufnr('%')
    " A later native :setlocal foldmethod=... wins, even after reentry/polls.
    return 0
  endif
  let w:wbx_folds_buffer = bufnr('%')
  " The explicit pre-hook flag authorizes specializing inherited *non-manual*
  " global defaults (e.g. LazyVim's indent). Local marker/manual overrides do
  " not match that contract. In particular, never seize explicit manual mode.
  let inherited = a:0 && a:1 && &l:foldmethod ==# &g:foldmethod && &l:foldmethod !=# 'manual'
  if !inherited && !s:default('foldmethod', 'manual')
    return 0
  endif
  " Existing manual folds are user work too.
  if &l:foldmethod ==# 'manual'
    for row in range(1, line('$'))
      if foldlevel(row) > 0 | return 0 | endif
    endfor
  endif
  let before = s:options()
  if s:default('foldlevel', 0) | let &l:foldlevel = 99 | endif
  if s:default('foldtext', 'foldtext()') | let &l:foldtext = 'wbx#folds#text()' | endif
  let &l:foldexpr = s:expr
  setlocal foldmethod=expr
  let w:wbx_fold_defaults = {'buffer': bufnr('%'), 'before': before, 'installed': s:options()}
  let w:wbx_thread_folds = {}
  return 1
endfunction
function! s:owned() abort
  return s:enabled() && &l:foldmethod ==# 'expr' && &l:foldexpr ==# s:expr
endfunction
function! s:block(row) abort
  let blocks = get(b:, 'wbx_message_blocks', [])
  " Fold engines normally query consecutive lines. Cache the interval, not an
  " all-history per-row table, and invalidate by metadata-list identity.
  let cached = get(w:, 'wbx_fold_lookup', {})
  if get(cached, 'blocks', v:null) is blocks
    for index in [cached.index, cached.index + 1]
      if index < len(blocks) && blocks[index].start <= a:row && a:row <= blocks[index].end
        let w:wbx_fold_lookup.index = index
        return blocks[index]
      endif
    endfor
  endif
  let low = 0
  let high = len(blocks) - 1
  while low <= high
    let middle = (low + high) / 2
    let block = blocks[middle]
    if a:row < block.start
      let high = middle - 1
    elseif a:row > block.end
      let low = middle + 1
    else
      let w:wbx_fold_lookup = {'blocks': blocks, 'index': middle}
      return block
    endif
  endwhile
  return {}
endfunction
function! wbx#folds#expr(row) abort
  let block = s:block(a:row)
  " thread_end includes the projection's trailing empty separator, not just
  " message content. Keep that row visible when the entire thread is closed.
  if !empty(block) && a:row == get(block, 'thread_end', 0) | return 0 | endif
  if !empty(block) && get(block, 'thread_start', 0) > 0
    return a:row == block.thread_start ? '>1' : a:row < block.body ? 1 : a:row == block.body ? '>2' : 2
  endif
  return empty(block) || a:row < block.body ? 0 : a:row == block.body ? '>1' : 1
endfunction
function! wbx#folds#text() abort
  let block = s:block(v:foldstart)
  if !empty(block) && get(block, 'thread_start', 0) == v:foldstart
    let label = get(block, 'thread_error', '')
    let excerpt = get(block,'excerpt','')
    let heading = getline(v:foldstart) . (empty(excerpt) ? '' : ' · ' . excerpt)
    if !empty(label)
      return heading . ' · ' . label . ' · ' . block.thread_size . ' loaded message'
    endif
    return heading . (get(block, 'thread_missing', 0) ? ' · parent not loaded' : '') . (block.loaded_replies ? ' · ' . block.loaded_replies . ' loaded replies' : '')
  endif
  let reply_count = get(block, 'loaded_replies', 0)
  if get(block, 'thread_start', 0) > 0 | let reply_count = 0 | endif
  return getline(v:foldstart) . '  [' . (v:foldend - v:foldstart) . ' more lines' . (reply_count ? ' · ' . reply_count . ' loaded replies' : '') . ']'
endfunction
function! s:heads() abort
  return filter(copy(get(b:, 'wbx_message_blocks', [])), 'get(v:val, "thread_head", 0) && get(v:val, "thread_start", 0) > 0')
endfunction
function! s:shape() abort
  return map(copy(get(b:, 'wbx_message_blocks', [])), '[v:val.id, v:val.start, v:val.body, v:val.end, get(v:val, "root", v:val.id), get(v:val, "thread_start", 0), get(v:val, "thread_end", 0), get(v:val, "thread_head", 0), get(v:val, "thread_size", 0)]')
endfunction
function! wbx#folds#save() abort
  if !s:owned() | return {} | endif
  let total = len(get(b:, 'wbx_message_blocks', []))
  let w:wbx_fold_save_checks = {'heads': total, 'bodies': total, 'shape': total}
  let room = get(b:, 'wbx_history_room', '')
  let heads = s:heads()
  let closed = {}
  let threads = empty(heads) ? copy(get(w:, 'wbx_thread_folds', {})) : {}
  let opened = []
  let view = winsaveview()
  let enabled = &l:foldenable
  try
    " Read actual inner choices, not foldclosed(body)'s outer-fold answer.
    " Even when disabled, a temporary, non-redrawing inspection is necessary
    " to observe a native za/zc issued since our previous snapshot.
    if !enabled | noautocmd let &l:foldenable = 1 | endif
    for head in heads
      let threads[head.root] = foldclosed(head.thread_start) == head.thread_start
      if threads[head.root]
        execute 'silent! ' . head.thread_start . 'foldopen'
        call add(opened, head.thread_start)
      endif
    endfor
    for block in get(b:, 'wbx_message_blocks', [])
      let closed[block.id] = foldclosed(block.body) == block.body
    endfor
  finally
    for row in opened | execute 'silent! ' . row . 'foldclose' | endfor
    if &l:foldenable != enabled | noautocmd let &l:foldenable = enabled | endif
    " Vim can normalize a pending (not yet redrawn) topline even when given
    " the identical view. Do not turn a non-moving inspection into a scroll.
    if winsaveview() !=# view | call winrestview(view) | endif
  endtry
  let w:wbx_thread_folds = threads
  let w:wbx_fold_choices = {'room': room, 'closed': closed, 'threads': threads}
  return {'room': room, 'closed': closed, 'threads': threads, 'buffer': bufnr('%'), 'window': win_getid(),
        \ 'tick': b:changedtick, 'shape': s:shape(), 'level': &l:foldlevel, 'grouped': !empty(heads)}
endfunction
function! wbx#folds#restore(state) abort
  if !s:owned() | return 0 | endif
  let view = winsaveview()
  let state = type(a:state) == v:t_dict && get(a:state, 'buffer', -1) == bufnr('%') && get(a:state, 'window', -1) == win_getid() && get(a:state, 'room', '') ==# get(b:, 'wbx_history_room', '') ? a:state : {}
  let w:wbx_thread_folds = copy(get(state, 'threads', {}))
  " The expression depends on message bounds, not body text. Same-size edits
  " already invalidate their native local range; changedtick alone must not
  " force a full-history zX. Foreign room/window states still normalize to {}.
  " With nofoldenable, native invalidation can discard hidden closed choices
  " and foldclosed() cannot inspect them. Retain the old full refresh after a
  " disabled-window text change so those choices survive a later re-enable.
  let w:wbx_fold_restore_checks = {'heads': 0, 'bodies': 0, 'shape': 0, 'resets': 0}
  if get(state, 'level', -1) == &l:foldlevel
    let w:wbx_fold_restore_checks.shape = len(get(b:, 'wbx_message_blocks', []))
  endif
  let unchanged = get(state, 'level', -1) == &l:foldlevel && get(state, 'shape', []) ==# s:shape()
        \ && (&l:foldenable || get(state, 'tick', -1) == b:changedtick)
  let w:wbx_fold_work = {'recomputed': !unchanged}
  if unchanged && !&l:foldenable | return 1 | endif
  let enabled = &l:foldenable
  let choices = {}
  let heads = s:heads()
  let w:wbx_fold_restore_checks.heads = len(get(b:, 'wbx_message_blocks', []))
  if get(state, 'grouped', 0) != !empty(heads)
    let state = extend(copy(state), {'threads': {}})
  endif
  let threads = empty(heads) ? copy(get(state, 'threads', {})) : {}
  try
    " zX recomputes the expression without zx's implicit cursor-fold opening.
    if !unchanged
      let w:wbx_fold_restore_checks.resets += 1
      normal! zX
    endif
    if !&l:foldenable | noautocmd let &l:foldenable = 1 | endif
    " Apply bodies with only the outer layer open. New reply bodies follow the
    " user's level default; a collapsed thread hides them via its outer fold.
    for head in heads
      let actual = foldclosed(head.thread_start) == head.thread_start
      let threads[head.root] = get(get(state, 'threads', {}), head.root, actual)
      if actual | execute 'silent! ' . head.thread_start . 'foldopen' | endif
    endfor
    for block in get(b:, 'wbx_message_blocks', [])
      let w:wbx_fold_restore_checks.bodies += 1
      let root = get(block, 'root', get(block, 'parent', '') ==# '' ? block.id : block.parent)
      let closed = get(get(state, 'closed', {}), block.id, empty(heads) ? get(threads, root, -1) : -1)
      if closed >= 0 && (foldclosed(block.body) == block.body) != closed
        execute 'silent! ' . block.body . (closed ? 'foldclose' : 'foldopen')
      endif
      let choices[block.id] = foldclosed(block.body) == block.body
    endfor
    for head in heads
      if threads[head.root] | execute 'silent! ' . head.thread_start . 'foldclose' | endif
    endfor
    let w:wbx_thread_folds = threads
    let w:wbx_fold_choices = {'room': get(b:, 'wbx_history_room', ''), 'closed': choices, 'threads': threads}
  finally
    if &l:foldenable != enabled | noautocmd let &l:foldenable = enabled | endif
    if winsaveview() !=# view | call winrestview(view) | endif
  endtry
  return 1
endfunction
function! wbx#folds#thread() abort
  if !s:owned() || !&l:foldenable | return 0 | endif
  let selected = s:block(line('.'))
  if empty(selected) | return 0 | endif
  if get(selected, 'thread_start', 0) > 0
    let view = winsaveview()
    let closed = foldclosed(selected.thread_start) != selected.thread_start
    try
      execute 'silent! ' . selected.thread_start . (closed ? 'foldclose' : 'foldopen')
      let w:wbx_thread_folds = get(w:, 'wbx_thread_folds', {})
      let w:wbx_thread_folds[selected.root] = closed
    finally
      call winrestview(view)
    endtry
    return 1
  endif
  let root = get(selected, 'root', get(selected, 'parent', '') ==# '' ? selected.id : selected.parent)
  let members = filter(copy(get(b:, 'wbx_message_blocks', [])), 'get(v:val, "root", v:val.id) ==# root')
  let closed = 1
  for block in members
    if foldclosed(block.body) >= 0 | let closed = 0 | break | endif
  endfor
  let view = winsaveview()
  try
    for block in members
      execute 'silent! ' . block.body . (closed ? 'foldclose' : 'foldopen')
    endfor
    let w:wbx_thread_folds = get(w:, 'wbx_thread_folds', {})
    let w:wbx_thread_folds[root] = closed
  finally
    call winrestview(view)
  endtry
  return 1
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
