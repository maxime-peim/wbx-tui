" Stateless projection ownership and per-window, message-identity view primitives.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:intents = {}
let s:intent_serial = 0
function! wbx#view#write(buffer, lines, Notify, ...) abort
  let kind = getbufvar(a:buffer, 'wbx_kind', '')
  if !wbx#view#owned(a:buffer, kind)
    return 0
  endif
  " Unloaded projections are rebuilt on explicit reopen, never confused with
  " annotations because unloading itself changes changedtick.
  if !bufloaded(a:buffer) || kind !=# 'compose'
        \ && (getbufvar(a:buffer, 'wbx_unloaded_clean', 0) || getbufvar(a:buffer, 'wbx_unloaded_edited', 0))
    return 0
  endif
  if kind !=# 'compose' && wbx#view#edited(a:buffer)
    if !getbufvar(a:buffer, 'wbx_edited_notice', 0)
      call setbufvar(a:buffer, 'wbx_edited_notice', 1)
      call call(a:Notify, ['Edited Webex view retained; refresh paused. Save your copy, then use :WebexRefresh! in that view to discard its edits.'])
    endif
    return 0
  endif
  call setbufvar(a:buffer, 'wbx_edited_notice', 0)
  let lines = empty(a:lines) ? [''] : a:lines
  let last = getbufinfo(a:buffer)[0].linecount
  if last == len(lines) && getbufline(a:buffer, 1, '$') ==# lines
    " An unchanged projection must not disturb native cursor/view/undo state or
    " trigger changedtick-based integrations on every background notification.
    return 1
  endif
  let views = kind ==# 'compose' ? {} : wbx#view#save(a:buffer)
  let modifiable = getbufvar(a:buffer, '&modifiable')
  let replaced = 0
  try
    call setbufvar(a:buffer, '&modifiable', 1)
    call wbx#view#replace(a:buffer, lines, kind ==# 'history' && a:0 ? a:1 : [])
    let replaced = 1
  finally
    " In particular, E565 under textlock must not leave a projection editable.
    if !replaced | call setbufvar(a:buffer, '&modifiable', modifiable) | endif
  endtry
  call setbufvar(a:buffer, '&modified', 0)
  if getbufvar(a:buffer, 'wbx_kind') !=# 'compose'
    call setbufvar(a:buffer, '&modifiable', 0)
    call setbufvar(a:buffer, 'wbx_render_tick', getbufvar(a:buffer, 'changedtick'))
  endif
  if kind ==# 'history' && a:0 >= 2
    call setbufvar(a:buffer, 'wbx_message_blocks', a:1)
    call setbufvar(a:buffer, 'wbx_history_room', a:2)
  endif
  for [window, saved] in items(views)
    let info = getwininfo(str2nr(window))
    if !empty(info) && info[0].bufnr == a:buffer
      call win_execute(str2nr(window), 'call wbx#view#restore(' . string(saved) . ', ' . string(kind ==# 'rooms' && a:0 ? a:1 : []) . ')')
      call win_execute(str2nr(window), 'call wbx#paging#baseline()')
    endif
  endfor
  if getbufvar(a:buffer, 'wbx_anchor_lost', 0)
    call setbufvar(a:buffer, 'wbx_anchor_lost', 0)
    call call(a:Notify, ['History memory limit evicted a visible message; reader moved to the nearest retained message. Older paging stops at 500 messages.'])
  endif
  return 1
endfunction
function! s:intent_context() abort
  let state = wbx#state()
  let room = get(state, 'room', v:null)
  return {'buffer': bufnr('%'), 'window': win_getid(), 'tick': b:changedtick, 'name': bufname('%'), 'buftype': &buftype,
        \ 'room': type(room) == v:t_dict ? get(room, 'id', '') : '', 'ready': get(state, 'ready', 0),
        \ 'state': get(state, 'state', ''), 'parent': get(b:, 'wbx_parent', ''), 'format': get(b:, 'wbx_format', 'plain'),
        \ 'session': get(get(state, 'localContext', {}), 'sessionId', ''),
        \ 'epoch': exists('*wbx#context_epoch') ? wbx#context_epoch() : 0}
endfunction
function! wbx#view#intent() abort
  let origin = s:intent_context()
  let s:intent_serial += 1
  let origin.token = string(s:intent_serial)
  if len(s:intents) >= 32 | call remove(s:intents, sort(keys(s:intents), 'n')[0]) | endif
  let s:intents[origin.token] = [origin.window, origin.buffer]
  return origin
endfunction
function! wbx#view#intent_valid(origin) abort
  if !has_key(s:intents, get(a:origin, 'token', '')) | return 0 | endif
  let context = copy(a:origin)
  call remove(context, 'token')
  return s:intent_context() ==# context
endfunction
function! wbx#view#picker_valid(origin) abort
  " vim.ui.select may temporarily focus the user's picker. Only that explicit
  " callback may ignore leave bookkeeping, never buffer/text/session/target state.
  let context = copy(a:origin)
  if !has_key(context, 'token') | return 0 | endif
  call remove(context, 'token')
  return s:intent_context() ==# context
endfunction
function! wbx#view#intent_left() abort
  " A leave-and-return is still a changed choice. Background work in ANOTHER
  " window cannot cancel the user's intent. Registry is bounded, never authority.
  call filter(s:intents, 'v:val !=# [win_getid(), bufnr("%")]')
endfunction
augroup wbx_native_intents
  autocmd!
  autocmd BufLeave,WinLeave * call wbx#view#intent_left()
augroup END

function! wbx#view#compose_name(room, parent) abort
  if empty(a:parent)
    return 'wbx://compose/' . a:room
  endif
  return 'wbx://reply/' . substitute(a:room, '[/+=]', '\=printf("%%%02X", char2nr(submatch(0)))', 'g')
        \ . '/' . substitute(a:parent, '[/+=]', '\=printf("%%%02X", char2nr(submatch(0)))', 'g')
endfunction
function! wbx#view#owned(buffer, kind) abort
  if a:buffer <= 0 || !bufexists(a:buffer) || getbufvar(a:buffer, '&buftype') !=# 'nofile' || getbufvar(a:buffer, 'wbx_kind', '') !=# a:kind
    return 0
  endif
  let names = {'rooms': 'wbx://spaces', 'history': 'wbx://history', 'meeting': 'wbx://meeting-status', 'image': 'wbx://image'}
  let expected = a:kind ==# 'compose' ? wbx#view#compose_name(getbufvar(a:buffer, 'wbx_room', ''), getbufvar(a:buffer, 'wbx_parent', '')) : get(names, a:kind, '')
  return !empty(expected) && bufname(a:buffer) ==# expected
endfunction
function! wbx#view#message_at(buffer, row) abort
  if !wbx#view#owned(a:buffer, 'history') || wbx#view#edited(a:buffer) | return '' | endif
  for block in getbufvar(a:buffer, 'wbx_message_blocks', [])
    if block.start <= a:row && a:row <= block.end | return block.id | endif
  endfor
  return ''
endfunction
function! wbx#view#local_window(buffer, ...) abort
  " Resolve only within this tab; merely inspecting candidates never focuses
  " another tab or disturbs its independent cursor/folds.
  let preferred = a:0 ? a:1 : 0
  for window in [preferred,win_getid()] + win_findbuf(a:buffer)
    let info = getwininfo(window)
    if !empty(info) && info[0].tabnr == tabpagenr() && info[0].bufnr == a:buffer
      return window
    endif
  endfor
  return 0
endfunction
function! wbx#view#jump(room, message) abort
  " Exact local navigation only. Never fetch/select/mark read or pick a near row.
  let origin = {'window': win_getid(), 'buffer': bufnr('%')}
  let before = s:intent_context()
  let state = wbx#state()
  if !wbx#supports('local-context-v1') || empty(before.session) || before.room !=# a:room || !before.ready || before.state !=# 'ready'
        \ || empty(filter(copy(get(state, 'messages', [])), 'v:val.id ==# a:message'))
    echomsg '[wbx-tui] Exact source is not loaded in the selected space. Load/select it explicitly; nothing was fetched.' | return 0
  endif
  let history = get(wbx#buffers(), 'history', 0)
  if !wbx#view#owned(history, 'history') || wbx#view#edited(history) || getbufvar(history, 'wbx_history_room', '') !=# a:room
    echomsg '[wbx-tui] Unchanged matching main history unavailable; annotations/promoted buffers retained.' | return 0
  endif
  let window = wbx#view#local_window(history,get(get(w:,'wbx_list_origin',{}),'window',0))
  if !window | execute 'sbuffer ' . history | else | call win_gotoid(window) | endif
  let after = s:intent_context()
  if !wbx#supports('local-context-v1') || [after.room, after.session, after.epoch, after.ready, after.state] !=# [before.room, before.session, before.epoch, before.ready, before.state]
        \ || bufnr('%') != history || !wbx#view#owned(history, 'history') || wbx#view#edited(history) | return 0 | endif
  for block in get(b:, 'wbx_message_blocks', [])
    if block.id !=# a:message | continue | endif
    let closed = foldclosed(block.body)
    if closed >= 0 && wbx#view#message_at(history, closed) !=# a:message
      let windows = getwininfo(origin.window)
      if !empty(windows) && windows[0].bufnr == origin.buffer | call win_gotoid(origin.window) | endif
      echomsg '[wbx-tui] Exact source is inside another message/thread fold. Open that fold explicitly; no root/nearest-row substitution.'
      return 0
    endif
    call cursor(block.body, 1)
    normal! zz
    " Cursor/WinScrolled events after an explicit local jump must not mistake it
    " for user edge motion and fetch an older history page.
    call wbx#paging#baseline()
    return 1
  endfor
  echomsg '[wbx-tui] Exact source is clipped from main history. No nearest-row substitution, fetch or receipt.'
  return 0
endfunction
function! s:blank_reload(buffer) abort
  return getbufline(a:buffer, 1, '$') ==# [''] && !getbufvar(a:buffer, '&modified')
endfunction
function! s:clean_reload(buffer) abort
  " A generated projection is read-only. An editable reload may already have
  " native edits, even if its text is now blank and nofile cleared modified.
  return s:blank_reload(a:buffer) && !getbufvar(a:buffer, '&modifiable')
endfunction
function! wbx#view#edited(buffer) abort
  if !bufloaded(a:buffer)
    return getbufvar(a:buffer, 'wbx_unloaded_edited', 0)
  endif
  if getbufvar(a:buffer, 'wbx_unloaded_clean', 0)
    " Loading changes changedtick, but the old clean marker cannot certify
    " arbitrary text subsequently written into the newly loaded buffer.
    return !s:clean_reload(a:buffer)
  endif
  if getbufvar(a:buffer, 'wbx_unloaded_edited', 0)
    return 1
  endif
  let tick = getbufvar(a:buffer, 'changedtick')
  return getbufvar(a:buffer, '&modified') || tick != getbufvar(a:buffer, 'wbx_render_tick', tick)
endfunction
function! wbx#view#unload(buffer) abort
  let kind = getbufvar(a:buffer, 'wbx_kind', '')
  if kind ==# 'compose' || !wbx#view#owned(a:buffer, kind)
    return
  endif
  if getbufvar(a:buffer, 'wbx_unloaded_edited', 0) && s:blank_reload(a:buffer)
    " A hidden load/unload cycle must not replace retained annotations with
    " the empty nofile placeholder before an explicit reopen restores them.
    return
  endif
  let edited = wbx#view#edited(a:buffer)
  call setbufvar(a:buffer, 'wbx_unloaded_edited', edited)
  call setbufvar(a:buffer, 'wbx_unloaded_clean', !edited)
  if edited
    " :bunload! is explicit but must not erase an annotated owned projection.
    call setbufvar(a:buffer, 'wbx_unloaded_text', getbufline(a:buffer, 1, '$'))
  endif
endfunction
function! wbx#view#loaded(buffer) abort
  let clean = getbufvar(a:buffer, 'wbx_unloaded_clean', 0)
  let edited = getbufvar(a:buffer, 'wbx_unloaded_edited', 0)
  if !bufloaded(a:buffer) || !(clean || edited) || bufnr('%') != a:buffer
        \ || index(win_findbuf(a:buffer), win_getid()) < 0
        \ || exists('*win_gettype') && win_gettype() ==# 'autocmd'
    " bufload() can invoke lifecycle hooks in a temporary autocommand window.
    " That is not an explicit visible reopen and cannot admit a rewrite.
    return 0
  endif
  if clean
    call setbufvar(a:buffer, 'wbx_render_tick', s:clean_reload(a:buffer) ? getbufvar(a:buffer, 'changedtick') : -1)
    call setbufvar(a:buffer, 'wbx_unloaded_clean', 0)
  endif
  if edited && s:blank_reload(a:buffer)
    let text = getbufvar(a:buffer, 'wbx_unloaded_text', [''])
    if getbufline(a:buffer, 1, '$') !=# text
      call setbufvar(a:buffer, '&modifiable', 1)
      call setbufline(a:buffer, 1, text)
    endif
    call setbufvar(a:buffer, 'wbx_unloaded_text', [])
  endif
  if edited
    " Nonempty newly loaded text is newer user work, never a blank placeholder
    " to replace with the old snapshot. Keep that snapshot as a memory-only
    " backup when preserving newer text, but do not automatically restore it.
    call setbufvar(a:buffer, 'wbx_unloaded_edited', 0)
    " Keep edited status even on editors whose nofile buffers clear modified.
    call setbufvar(a:buffer, 'wbx_render_tick', -1)
  endif
  return 1
endfunction
function! s:anchor(blocks, row) abort
  for block in a:blocks
    if a:row >= block.start && a:row <= block.end
      return {'id': block.id, 'offset': a:row - block.start}
    endif
  endfor
  return {}
endfunction
function! wbx#view#capture() abort
  let view = winsaveview()
  let blocks = get(b:, 'wbx_message_blocks', [])
  return {'view': view, 'cursor': s:anchor(blocks, view.lnum), 'top': s:anchor(blocks, view.topline),
        \ 'room': get(b:, 'wbx_history_room', ''), 'blocks': blocks,
        \ 'row': get(get(b:, 'wbx_row_ids', get(b:, 'wbx_room_ids', [])), view.lnum - 1, ''),
        \ 'folds': exists('*wbx#history#fold_save') ? wbx#history#fold_save() : {}}
endfunction
function! wbx#view#save(buffer) abort
  let views = {}
  for window in win_findbuf(a:buffer)
    call win_execute(window, 'let w:wbx_captured_view = wbx#view#capture()')
    let views[window] = wbx#view#window_var(window, 'wbx_captured_view', {})
    call win_execute(window, 'unlet w:wbx_captured_view')
  endfor
  return views
endfunction
function! wbx#view#window_var(window, name, default) abort
  let info = getwininfo(a:window)
  return empty(info) ? a:default : gettabwinvar(info[0].tabnr, a:window, a:name, a:default)
endfunction
function! s:splice(buffer, first, old, lines, work) abort
  let a:work.splices += 1
  let prefix = 0
  let suffix = 0
  while prefix < min([len(a:old), len(a:lines)]) && a:old[prefix] ==# a:lines[prefix]
    let prefix += 1
  endwhile
  while suffix < min([len(a:old), len(a:lines)]) - prefix && a:old[-suffix - 1] ==# a:lines[-suffix - 1]
    let suffix += 1
  endwhile
  let removed = len(a:old) - prefix - suffix
  let added = len(a:lines) - prefix - suffix
  let a:work.trimmed += prefix + suffix
  if !removed && !added | return | endif
  if removed == added
    " Separate distant edits (e.g. a root body plus reply previews), retaining
    " text properties/extmarks on the unchanged lines between them.
    let row = prefix
    while row < prefix + added
      if a:old[row] ==# a:lines[row]
        let row += 1
        continue
      endif
      let first = row
      while row < prefix + added && a:old[row] !=# a:lines[row] | let row += 1 | endwhile
      call setbufline(a:buffer, a:first + first, a:lines[first : row - 1])
      let a:work.writes += 1
    endwhile
    return
  endif
  let shared = min([removed, added])
  if shared > 0
    call setbufline(a:buffer, a:first + prefix, a:lines[prefix : prefix + shared - 1])
    let a:work.writes += 1
  endif
  if added > removed
    call appendbufline(a:buffer, a:first + prefix + removed - 1, a:lines[prefix + shared : prefix + added - 1])
    let a:work.writes += 1
  elseif removed > added
    call deletebufline(a:buffer, a:first + prefix + added, a:first + prefix + removed - 1)
    let a:work.writes += 1
  endif
endfunction
function! s:slice(lines, first, last) abort
  return a:last < a:first ? [] : a:lines[a:first - 1 : a:last - 1]
endfunction
function! s:edit(edits, first, old, lines, work) abort
  let a:work.gap_rows += len(a:old) + len(a:lines)
  if a:old !=# a:lines | call add(a:edits, [a:first, a:old, a:lines]) | endif
endfunction
function! wbx#view#replace(buffer, lines, ...) abort
  let old = getbufline(a:buffer, 1, '$')
  let work = {'old_blocks': 0, 'new_blocks': 0, 'compared_rows': 0, 'gap_rows': 0, 'retained': 0, 'shared_ids': 0, 'splices': 0, 'trimmed': 0, 'writes': 0}
  let oldblocks = {}
  for block in getbufvar(a:buffer, 'wbx_message_blocks', [])
    let work.old_blocks += 1
    let oldblocks[block.id] = block
  endfor
  let edits = []
  let oldpos = 1
  let newpos = 1
  for block in a:0 ? a:1 : []
    let work.new_blocks += 1
    let before = get(oldblocks, block.id, {})
    if !empty(before) | let work.shared_ids += 1 | endif
    if empty(before) || before.start < oldpos || before.end > len(old)
      continue
    endif
    " Count the exact-input row spans considered, not only native mutations.
    let work.compared_rows += before.end - before.start + 1 + block.end - block.start + 1
    if s:slice(old, before.start, before.end) !=# s:slice(a:lines, block.start, block.end) | continue | endif
    let work.retained += 1
    if oldpos < before.start || newpos < block.start
      call s:edit(edits, oldpos, s:slice(old, oldpos, before.start - 1), s:slice(a:lines, newpos, block.start - 1), work)
    endif
    let oldpos = before.end + 1
    let newpos = block.end + 1
  endfor
  if oldpos <= len(old) || newpos <= len(a:lines)
    call s:edit(edits, oldpos, s:slice(old, oldpos, len(old)), s:slice(a:lines, newpos, len(a:lines)), work)
  endif
  " Apply bottom-up so stable message chunks move natively with their marks.
  for edit in reverse(edits)
    " Keep sparse writes even for unrelated identities: a single large write
    " can make the native fold engine perform substantially more work.
    call s:splice(a:buffer, edit[0], edit[1], edit[2], work)
  endfor
  call setbufvar(a:buffer, 'wbx_view_work', work)
endfunction
function! s:resolve(anchor, blocks, old) abort
  if empty(a:anchor)
    return 0
  endif
  for block in a:blocks
    if block.id ==# a:anchor.id
      return min([block.end, block.start + a:anchor.offset])
    endif
  endfor
  " An unsolicited bounded-cache eviction can remove an anchor. Prefer the
  " nearest surviving message, not an unrelated numeric row; report the loss.
  let oldids = map(copy(a:old), 'v:val.id')
  let origin = index(oldids, a:anchor.id)
  let nearest = 0
  let distance = len(oldids) + 1
  for block in a:blocks
    let index = index(oldids, block.id)
    if index >= 0 && abs(index - origin) < distance
      let distance = abs(index - origin)
      let nearest = block.start
    endif
  endfor
  let b:wbx_anchor_lost = 1
  return nearest
endfunction
function! wbx#view#restore(saved, ids) abort
  let view = copy(a:saved.view)
  let kind = get(b:, 'wbx_kind', '')
  if kind ==# 'history'
    if a:saved.room ==# get(b:, 'wbx_history_room', '')
      let blocks = get(b:, 'wbx_message_blocks', [])
      let cursor = s:resolve(a:saved.cursor, blocks, a:saved.blocks)
      let top = s:resolve(a:saved.top, blocks, a:saved.blocks)
      if cursor > 0 | let view.lnum = cursor | endif
      if top > 0 | let view.topline = top | endif
    endif
    " The fold helper rejects another room's choices and restores native
    " defaults. Skipping it would carry closed folds over by numerical row.
    if exists('*wbx#history#fold_restore')
      call wbx#history#fold_restore(a:saved.folds)
    endif
  elseif kind ==# 'rooms'
    let id = get(a:saved, 'row', get(get(b:, 'wbx_room_ids', []), view.lnum - 1, ''))
    let row = empty(id) ? 0 : index(a:ids, id) + 1
    if row > 0
      let view.topline = max([1, view.topline + row - view.lnum])
      let view.lnum = row
    elseif !empty(id)
      " Expiry/removal must not silently retarget a meeting/room action to an
      " unrelated row that happens to inherit the old numerical position.
      let view.lnum = 1
      let view.topline = 1
    endif
  endif
  call winrestview(view)
endfunction
function! wbx#view#range_visible(first, last) abort
  " Display evidence only: no message identity, read state, ownership or receipt
  " authority. Bound all work by the viewport before examining folds/screen rows.
  let info = getwininfo(win_getid())[0]
  if a:first < line('w0') || a:last > line('w$') || a:last < a:first
        \ || a:last - a:first + 1 > info.height || !exists('*screenpos')
    return 0
  endif
  for row in range(a:first, a:last)
    if foldclosed(row) >= 0 | return 0 | endif
  endfor
  " A scrolled-away beginning of a wrapped line is incomplete too.
  if a:first == line('w0') && get(winsaveview(), 'skipcol', 0) > 0 | return 0 | endif
  let first = screenpos(win_getid(), a:first, 1)
  let last = screenpos(win_getid(), a:last, max([1, strlen(getline(a:last))]))
  if get(first, 'row', 0) < info.winrow || get(last, 'row', 0) < get(first, 'row', 0)
        \ || get(last, 'row', 0) >= info.winrow + info.height
    return 0
  endif
  if exists('*wbx#people#obscures')
    for row in range(first.row, last.row)
      if wbx#people#obscures(win_getid(), row) | return 0 | endif
    endfor
  endif
  return 1
endfunction
function! wbx#view#endpoint(message) abort
  let blocks = filter(copy(get(b:, 'wbx_message_blocks', [])), 'v:val.id ==# a:message')
  if empty(blocks) || !get(b:, 'wbx_history_complete', 0) | return 0 | endif
  " Receipt admission still supplies its own identity/freshness/intent checks.
  " A separator is not the endpoint: require the last actual body row in full.
  let endpoint = max([blocks[-1].body, blocks[-1].end - 1])
  return wbx#view#range_visible(endpoint, endpoint)
endfunction
function! wbx#view#latest(message) abort
  let blocks = filter(copy(get(b:, 'wbx_message_blocks', [])), 'v:val.id ==# a:message')
  if empty(blocks) | return 0 | endif
  let row = blocks[0].end
  " The trailing separator can remain visible outside a closed thread. Check
  " its actual content endpoint before choosing a navigation target.
  let closed = foldclosed(max([blocks[0].body, row - 1]))
  " Never open a thread/body fold to make a receipt eligible. Show the closed
  " root summary instead; the independent endpoint check remains false.
  call cursor(closed >= 0 ? closed : row, 1)
  normal! zb
  return 1
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
