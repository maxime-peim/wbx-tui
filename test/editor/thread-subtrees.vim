" Grouped history and real nested native folds. No plugin/backend/service I/O.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
let s:messages = [
      \ {'id': 'a', 'author': 'Alice', 'created': '2026-11-09T00:00:00Z', 'text': "# Original A\n```md\nunclosed fence"},
      \ {'id': 'b', 'author': 'Bea', 'created': '2026-11-09T00:01:00Z', 'text': "Unrelated B\nB second line"},
      \ {'id': 'a1', 'parentId': 'a', 'author': 'Ana', 'created': '2026-11-09T00:02:00Z', 'text': "**A reply**\nA reply end"},
      \ {'id': 'c', 'author': 'Carol', 'created': '2026-11-09T00:03:00Z', 'text': 'Unrelated C'},
      \ {'id': 'b1', 'parentId': 'b', 'author': 'Ben', 'created': '2026-11-09T00:04:00Z', 'text': 'B reply'},
      \ {'id': 'orphan1', 'parentId': 'missing', 'author': 'One', 'created': '2026-11-09T00:06:00Z', 'text': 'First missing-root reply'},
      \ {'id': 'orphan2', 'parentId': 'orphan1', 'author': 'Two', 'created': '2026-11-09T00:07:00Z', 'text': 'Another missing-root reply'},
      \ {'id': 'a2', 'parentId': 'a1', 'author': 'Amy', 'created': '2026-11-09T00:10:00Z', 'text': "Newest canonical message\nNewest end"}]
function! s:block(id) abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
endfunction
function! s:publish(messages, ...) abort
  let states = {}
  for window in win_findbuf(bufnr('%'))
    call win_execute(window, 'let w:wbx_subtree_saved = wbx#history#fold_save()')
    let states[window] = getwinvar(window, 'wbx_subtree_saved')
  endfor
  let view = wbx#history#render(a:messages, 2)
  let lines = ['# Synthetic grouped history', ''] + view.lines
  let old = getline(1, '$')
  let prefix = 0
  while prefix < min([len(old), len(lines)]) && old[prefix] ==# lines[prefix] | let prefix += 1 | endwhile
  let suffix = 0
  while suffix < min([len(old), len(lines)]) - prefix && old[-1 - suffix] ==# lines[-1 - suffix] | let suffix += 1 | endwhile
  setlocal modifiable
  if len(old) - suffix > prefix | call deletebufline(bufnr('%'), prefix + 1, len(old) - suffix) | endif
  if len(lines) - suffix > prefix | call append(prefix, lines[prefix : len(lines) - suffix - 1]) | endif
  if line('$') > len(lines) | call deletebufline(bufnr('%'), len(lines) + 1, '$') | endif
  setlocal nomodifiable nomodified
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = view.blocks
  let b:wbx_message_rows = view.headers
  let b:wbx_reply_rows = view.replies
  let b:wbx_quote_rows = view.quotes
  let b:wbx_history_room = a:0 ? a:1 : get(b:, 'wbx_history_room', 'room-a')
  call wbx#history#syntax()
  call s:assert_rails(view)
  for window in win_findbuf(bufnr('%'))
    call win_execute(window, 'call wbx#history#fold_restore(' . string(states[window]) . ')')
  endfor
  return view
endfunction
function! s:assert_rails(view) abort
  if b:wbx_block_display ==# 'nvim-inline'
    let marks = nvim_buf_get_extmarks(bufnr('%'), nvim_get_namespaces()['wbx-message-blocks'], 0, -1, {'details': v:true})
    let rails = len(filter(copy(marks), 'get(v:val[3], "virt_text_pos", "") ==# "inline"'))
    let summaries = len(filter(copy(marks), 'get(v:val[3], "virt_text_pos", "") ==# "eol"'))
  elseif b:wbx_block_display ==# 'vim-props'
    let rails = len(prop_list(1, {'end_lnum': -1, 'types': ['WbxBlockPrefix']}))
    let summaries = len(prop_list(1, {'end_lnum': -1, 'types': ['WbxThreadSummary']}))
  else
    let rails = len(sign_getplaced(bufnr('%'), {'group': 'wbx-message-blocks'})[0].signs)
    let summaries = -1
  endif
  call assert_equal(len(a:view.lines), rails, 'group insertion/reordering/deletion leaves exactly one rail per actual message row')
  if summaries >= 0
    call assert_equal(len(filter(values(b:wbx_block_decorations), '!empty(get(v:val, "summary_text", ""))')), summaries, 'root-to-orphan/head transitions never leave orphan virtual counts')
  endif
endfunction
function! s:snapshot(window) abort
  call win_execute(a:window, 'let w:wbx_subtree_state = wbx#history#fold_save()')
  return getwinvar(a:window, 'wbx_subtree_state')
endfunction
function! s:remove(id) abort
  call filter(s:messages, 'v:val.id !=# a:id')
endfunction
function! s:assert_thread_gap(id) abort
  let block = s:block(a:id)
  let following = filter(copy(b:wbx_message_blocks), 'v:val.start > block.thread_end')
  let next = empty(following) ? {} : following[0]
  call assert_equal('', getline(block.thread_end), 'the projected separator remains an actual empty buffer line')
  call assert_equal(block.thread_end - 1, foldclosedend(block.thread_start), 'collapsed threads stop before their trailing separator')
  call assert_equal(-1, foldclosed(block.thread_end), 'a closed thread never swallows its separator')
  call assert_equal(0, foldlevel(block.thread_end), 'the trailing gap belongs to neither the outer nor nested body fold')
  if !empty(next)
    call assert_equal(block.thread_end + 1, next.start, 'the next header follows exactly one existing separator')
  endif
  if $WBX_EDITOR_SCREEN ==# '1'
    let before = winsaveview()
    try
      call cursor(block.thread_start, 1)
      normal! zt
      redraw!
      let header = screenpos(win_getid(), block.thread_start, 1)
      let gap = screenpos(win_getid(), block.thread_end, 1)
      call assert_true(header.row > 0 && gap.row > 0, 'spacing checks use a drawn native UI')
      call assert_equal(header.row + 1, gap.row, 'one visible separator screen row follows the collapsed caption')
      if !empty(next)
        let following = screenpos(win_getid(), next.start, 1)
        call assert_equal(gap.row + 1, following.row, 'the next message is drawn below the gap, not against the caption')
      endif
      if get(b:, 'wbx_border_style', '') ==# 'gutter'
        let info = getwininfo(win_getid())[0]
        let text = info.wincol + info.textoff
        call assert_equal(' ', screenstring(gap.row, text - 1), 'the exposed separator has no gutter marker')
        call assert_equal(' ', screenstring(gap.row, text), 'no virtual rail or message text fills the gap')
      endif
    finally
      call winrestview(before)
    endtry
  endif
endfunction
function! s:assert_metadata(view) abort
  let previous = 2
  for block in a:view.blocks
    call assert_equal(previous + 1, block.start, 'every input message is projected once without gaps/extra synthetic messages')
    call assert_true(block.start < block.body && block.body <= block.end)
    call assert_true(block.thread_start <= block.start && block.end <= block.thread_end)
    call assert_equal(1, foldlevel(block.start), 'every grouped sender header belongs to only its outer thread')
    call assert_equal(2, foldlevel(block.body), 'body fold is nested under its outer thread')
    call assert_equal(block.end == block.thread_end ? 0 : 2, foldlevel(block.end), 'only the final thread separator stays outside the native folds')
    let previous = block.end
  endfor
  call assert_equal(line('$'), previous)
endfunction
function! s:inherited_group_test() abort
  let globals = [&g:foldmethod, &g:foldlevel, &g:foldtext]
  let history = bufnr('%')
  new
  execute 'buffer ' . history
  try
    setglobal foldmethod=indent foldlevel=99 foldtext=
    setlocal foldmethod< foldlevel< foldtext< foldexpr< foldenable
    unlet! w:wbx_folds_buffer w:wbx_fold_defaults
    call assert_equal(1, wbx#history#fold_setup(1), 'grouped subtrees work with inherited LazyVim-style indent defaults')
    call wbx#history#fold_restore({})
    call assert_equal(['expr', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext], 'inherited level/empty foldtext preferences are retained')
    call cursor(s:block('a1').start, 1)
    call wbx#history#thread_fold()
    call assert_equal(s:block('a1').thread_end - 1, foldclosedend(s:block('a1').start))
    call s:assert_thread_gap('a1')
    call assert_equal(s:block('a1').thread_start, foldclosed(s:block('a3').start), 'the inherited-options case still has a real whole-thread outer fold')
    let b:wbx_folds = 0
    call assert_equal(0, wbx#history#fold_setup(), 'a post-hook fold opt-out releases specialized defaults even in grouped mode')
    call assert_equal(['indent', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext])
  finally
    unlet! b:wbx_folds
    let [&g:foldmethod, &g:foldlevel, &g:foldtext] = globals
    close
  endtry
endfunction
try
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history'
  let b:wbx_render_tick = b:changedtick
  let original = deepcopy(s:messages)
  let nearby = [
        \ {'id':'first','author':'Alice','created':'2026-11-09T12:00:01Z','text':'First question'},
        \ {'id':'second','author':'Alice','created':'2026-11-09T12:00:44Z','text':'Second question','markdown':'<@personId:private-id|Reader> second question'}]
  call assert_match('First question',wbx#history#reply_label(nearby,'first'))
  call assert_match('@Reader second question',wbx#history#reply_label(nearby,'second'))
  call assert_notmatch('private-id',wbx#history#reply_label(nearby,'second'))
  call assert_notequal(wbx#history#reply_label(nearby,'first'),wbx#history#reply_label(nearby,'second'),'same-author/minute roots retain distinguishable local context')
  call assert_equal('parent not loaded',wbx#history#reply_label(nearby,'absent'))
  call assert_equal('2026-11-09 12:00 UTC',wbx#history#time(nearby[0].created))
  call assert_equal('2026-03-29 01:30 +02:00',wbx#history#time('2026-03-29T01:30:00+02:00'),'offset-bearing input retains its explicit zone, not local-time inference')
  let view = s:publish(s:messages)
  call assert_true(view.threaded, 'grouped replies are the default without configuration')
  call assert_equal(original, s:messages, 'presentation never mutates canonical messages or nested parent metadata')
  call assert_equal(['a', 'a1', 'a2', 'b', 'b1', 'c', 'orphan1', 'orphan2'], map(copy(view.blocks), 'v:val.id'), 'roots chronological, loaded replies chronological inside each contiguous thread')
  call assert_equal(sort(map(copy(original), 'v:val.id')), sort(map(copy(view.blocks), 'v:val.id')), 'no missing or duplicate messages')
  call assert_equal('a2', s:messages[-1].id)
  call assert_notequal('a2', view.blocks[-1].id, 'canonical newest endpoint need not be the physically last block')
  call assert_true(s:block('a2').end < line('$'), 'newest-ID consumers must locate its metadata, never use last-block position')
  call assert_equal(s:block('a').start, s:block('a2').thread_start)
  call assert_equal(s:block('a2').end, s:block('a').thread_end)
  call assert_equal([3, 2, 1], [s:block('a').thread_size, s:block('a').loaded_replies, s:block('a').thread_head])
  call assert_equal('a', s:block('a2').root, 'bounded parent-chain resolution reaches the real root')
  call assert_equal([2, 2, 1], [s:block('orphan1').thread_size, s:block('orphan1').loaded_replies, s:block('orphan1').thread_missing], 'missing-root counts include all and only loaded replies')
  call assert_equal('missing', s:block('orphan2').root)
  call assert_match('parent not loaded', getline(s:block('orphan1').start + 1))
  call wbx#history#fold_setup(1)
  setlocal syntax=wbx-history
  syntax sync fromstart
  call wbx#history#fold_restore({})
  call s:assert_metadata(view)
  call assert_equal(-1, foldclosed(s:block('a').start), 'outer folds initially open')
  call assert_equal(-1, foldclosed(s:block('a').body), 'body folds initially open')
  call assert_equal('WbxMessageHeader', synIDattr(synID(s:block('a1').start, 1, 1), 'name'), 'unclosed Markdown stops before even a grouped reply sender')
  call assert_match('^markdown', synIDattr(synID(s:block('a1').body, 3, 1), 'name'))
  call cursor(s:block('a').body, 1)
  normal! yy
  call assert_equal("# Original A\n", getreg('"'), 'grouping does not alter native body yanks')
  call cursor(s:block('a1').body, 1)
  normal! za
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body), 'body za closes only the nested body')
  call assert_equal(s:block('a1').end, foldclosedend(s:block('a1').body))
  call assert_equal(-1, foldclosed(s:block('a1').start), 'a closed body leaves its reply header visible')
  call assert_equal(-1, foldclosed(s:block('a2').start))
  call cursor(s:block('a').start, 1)
  normal! za
  call assert_equal(s:block('a').start, foldclosed(s:block('a1').start), 'root-header za folds reply headers, not merely the current message body')
  call s:assert_thread_gap('a')
  call assert_equal(s:block('a').start, foldclosed(s:block('a2').end - 1), 'real outer range hides the canonical newest reply content endpoint')
  call assert_equal(s:block('a2').end - 1, foldclosedend(s:block('a').start), 'outer native fold is root through last reply content, not the following gap')
  call assert_equal(-1, foldclosed(s:block('b').start), 'an unrelated root is outside the outer range')
  call assert_match('2 loaded replies', foldtextresult(s:block('a').start), 'outer caption describes loaded replies, not unavailable server totals')
  call assert_match('# Original A',foldtextresult(s:block('a').start),'collapsed thread retains a bounded topic excerpt')
  let captions_before = wbx#history#fold_save()
  execute s:block('c').start . 'foldclose'
  call assert_match('Unrelated C',foldtextresult(s:block('c').start))
  call assert_notmatch('0 loaded replies',foldtextresult(s:block('c').start),'singleton captions omit zero-reply noise')
  call wbx#history#fold_restore(captions_before)
  let spacing_tick = b:changedtick
  let spacing_text = getline(1, '$')
  let spacing_undo = undotree()
  let minimum = &l:foldminlines
  let b:wbx_message_borders = 'rails'
  call wbx#history#blocks()
  call s:assert_thread_gap('a')
  unlet b:wbx_message_borders
  call wbx#history#blocks()
  call cursor(s:block('b').start, 1)
  call wbx#history#thread_fold()
  call s:assert_thread_gap('a')
  call s:assert_thread_gap('b')
  call cursor(s:block('c').start, 1)
  normal! za
  call s:assert_thread_gap('c')
  normal! za
  call cursor(s:block('b').start, 1)
  call wbx#history#thread_fold()
  call cursor(s:block('a').start, 1)
  call assert_equal(spacing_tick, b:changedtick, 'preserving a separator never inserts extra buffer lines')
  call assert_equal(spacing_text, getline(1, '$'))
  call assert_equal(spacing_undo, undotree(), 'fold spacing and border-style changes leave undo untouched')
  call assert_equal(minimum, &l:foldminlines, 'native minimum fold sizes remain authoritative, including one-line bodies')
  let before = winsaveview()
  let options = [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable, &l:foldtext]
  let tick = b:changedtick
  let focus = win_getid()
  let state = wbx#history#fold_save()
  call assert_equal([0, 1, 0], [state.closed.a, state.closed.a1, state.closed.a2], 'snapshot inspects each inner body even with its outer thread closed')
  call assert_equal(1, state.threads.a)
  call assert_equal(before, winsaveview(), 'inspection restores exact viewport/cursor')
  call assert_equal(options, [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable, &l:foldtext])
  call assert_equal(tick, b:changedtick)
  call assert_equal(focus, win_getid())
  call assert_equal(s:block('a').start, foldclosed(s:block('a1').start), 'inspection re-closes the outer fold')
  call wbx#history#fold_restore(state)
  call assert_equal(before, winsaveview(), 'restoration also returns the exact closed-thread viewport/cursor')
  call assert_equal(options, [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable, &l:foldtext])
  call assert_equal(focus, win_getid())
  let inspection_text = getline(1, '$')
  let inspection_undo = undotree()
  for repeat in range(1, 3)
    let inspected = wbx#history#fold_save()
    call assert_equal(state.closed, inspected.closed, 'repeated inspections retain inner native choices')
    call assert_equal(state.threads, inspected.threads, 'repeated inspections retain outer native choices')
    call assert_equal(before, winsaveview(), 'repeated inspections do not normalize a pending native viewport')
    call wbx#history#fold_restore(inspected)
    call assert_equal(before, winsaveview(), 'unchanged restoration remains viewport-idempotent')
  endfor
  call assert_equal(options, [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable, &l:foldtext])
  call assert_equal(focus, win_getid())
  call assert_equal(tick, b:changedtick)
  call assert_equal(inspection_text, getline(1, '$'))
  call assert_equal(inspection_undo, undotree(), 'fold inspections never change native text or undo')
  normal! za
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body), 'opening the outer fold preserves its previously closed inner body')
  call assert_equal(-1, foldclosed(s:block('a').body))
  call cursor(s:block('a2').body, 1)
  call wbx#history#thread_fold()
  call assert_equal(s:block('a').start, foldclosed(s:block('a1').start), 'Wt from any loaded descendant toggles the one real outer fold')
  call cursor(s:block('a').start, 1)
  call wbx#history#thread_fold()
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body))
  let first = win_getid()
  call wbx#history#thread_fold()
  split
  let second = win_getid()
  call wbx#history#fold_setup(1)
  call cursor(s:block('a').start, 1)
  if foldclosed(s:block('a').start) >= 0 | call wbx#history#thread_fold() | endif
  execute s:block('a1').body . 'foldopen'
  execute s:block('b').body . 'foldclose'
  let state_one = s:snapshot(first)
  let state_two = s:snapshot(second)
  call assert_equal([1, 1, 0, 0], [state_one.threads.a, state_one.closed.a1, state_two.threads.a, state_two.closed.a1], 'outer and body choices are independent per window')
  let s:messages[-1].text = "Edited newest message\nEdited newest end"
  let view = s:publish(s:messages)
  let after_one = s:snapshot(first)
  let after_two = s:snapshot(second)
  call assert_equal(state_one.closed, after_one.closed, 'closed outer does not overwrite inner body choices on body-only rerender')
  call assert_equal(state_one.threads, after_one.threads)
  call assert_equal(state_two.closed, after_two.closed)
  call assert_equal(state_two.threads, after_two.threads)
  call assert_equal({'recomputed': 0}, getwinvar(first, 'wbx_fold_work'), 'same-shape body edits preserve the fast path even under a closed outer')
  call assert_equal({'recomputed': 0}, getwinvar(second, 'wbx_fold_work'))
  let unchanged_b_marks = copy(b:wbx_block_decorations.b.marks)
  call add(s:messages, {'id': 'a3', 'parentId': 'a', 'author': 'A new reply', 'created': '2026-11-09T00:11:00Z', 'text': "Newly loaded reply\nNew reply end"})
  let view = s:publish(s:messages)
  call assert_equal(unchanged_b_marks, b:wbx_block_decorations.b.marks, 'a new reply inserted into an earlier group relocates unrelated native IDs without recreating them')
  call assert_equal(2, b:wbx_decoration_work.messages, 'grouped reply insertion decorates only the new member and its root count')
  call assert_equal(s:block('a3').end - s:block('a3').start + 2, b:wbx_decoration_work.rows, 'an earlier-thread append never rebuilds all loaded rows')
  call assert_equal({'recomputed': 1}, getwinvar(first, 'wbx_fold_work'), 'a changed outer extent forces safe native recomputation')
  call assert_equal(4, s:block('a').thread_size)
  call assert_equal(s:block('a3').end, s:block('a').thread_end)
  call assert_equal(-1, foldclosed(s:block('a3').body), 'open reader sees a new reply with the default open body')
  call assert_equal(1, s:snapshot(second).closed.b, 'relocated unrelated multiline body keeps this window choice')
  call win_gotoid(first)
  call assert_equal(s:block('a').start, foldclosed(s:block('a3').start), 'new reply header is hidden inside the enlarged closed outer thread')
  call assert_equal(s:block('a3').end - 1, foldclosedend(s:block('a').start))
  call s:assert_thread_gap('a')
  call assert_equal(-1, foldclosed(s:block('b').start))
  call assert_equal(1, s:snapshot(first).closed.a1)
  call assert_equal(0, s:snapshot(first).closed.a3, 'thread collapse must not silently close a newly loaded inner body')
  call insert(s:messages, {'id': 'older', 'author': 'Older', 'created': '2026-11-08T00:00:00Z', 'text': 'Older root'})
  let view = s:publish(s:messages)
  call assert_equal(s:block('a').start, foldclosed(s:block('a2').start), 'closed outer is restored by root ID across prepends')
  call s:assert_thread_gap('a')
  call cursor(s:block('orphan2').start, 1)
  call wbx#history#thread_fold()
  call assert_equal(s:block('orphan1').start, foldclosed(s:block('orphan2').start), 'missing-parent loaded replies have a real shared outer fold')
  call assert_match('parent not loaded', foldtextresult(s:block('orphan1').start))
  call assert_match('2 loaded replies', foldtextresult(s:block('orphan1').start))
  call s:assert_thread_gap('orphan1')
  call add(s:messages, {'id': 'missing', 'author': 'Loaded root', 'created': '2026-11-09T00:05:00Z', 'text': "Root now loaded\nRoot end"})
  let view = s:publish(s:messages)
  call assert_equal(s:block('missing').start, foldclosed(s:block('orphan2').start), 'a missing root becoming loaded retains the same outer thread ID/state')
  call assert_equal([3, 2, 0], [s:block('missing').thread_size, s:block('missing').loaded_replies, s:block('missing').thread_missing])
  call assert_notmatch('parent not loaded', foldtextresult(s:block('missing').start))
  call s:assert_thread_gap('missing')
  call s:remove('a')
  let view = s:publish(s:messages)
  call assert_equal('a', s:block('a1').root)
  call assert_equal([1, 3, 3], [s:block('a1').thread_missing, s:block('a1').thread_size, s:block('a1').loaded_replies])
  call assert_equal(s:block('a1').start, foldclosed(s:block('a3').start), 'root eviction retains collapse on the same missing-root identity')
  call s:assert_thread_gap('a1')
  call assert_equal(1, s:snapshot(first).closed.a1, 'inner choice survives root-to-orphan transition')
  setlocal nofoldenable
  let disabled_view = winsaveview()
  let disabled_state = wbx#history#fold_save()
  call assert_equal(0, &l:foldenable, 'snapshot inspection restores nofoldenable')
  call assert_equal(disabled_view, winsaveview())
  for repeat in range(1, 3)
    let inspected = wbx#history#fold_save()
    call assert_equal(disabled_state.closed, inspected.closed)
    call assert_equal(disabled_state.threads, inspected.threads)
    call assert_equal(disabled_view, winsaveview(), 'disabled inspection preserves the pending unfolded viewport')
    call wbx#history#fold_restore(inspected)
    call assert_equal(0, &l:foldenable)
    call assert_equal(disabled_view, winsaveview(), 'disabled restoration neither scrolls nor silently enables folds')
  endfor
  let s:messages[-1].text = "Root text edited\nRoot end edited"
  let view = s:publish(s:messages)
  call assert_equal(0, &l:foldenable, 'disabled outer/body restoration never silently enables folds')
  setlocal foldenable
  call assert_equal(disabled_state.closed, s:snapshot(first).closed, 'inner choices survive edits while outer folds and foldenable are closed/disabled')
  call assert_equal(disabled_state.threads, s:snapshot(first).threads)
  let view = s:publish(s:messages, 'room-b')
  call assert_equal(-1, foldclosed(s:block('a1').start), 'same IDs in another room do not inherit outer collapse')
  call assert_equal(-1, foldclosed(s:block('a1').body), 'same IDs in another room do not inherit body collapse')
  call assert_equal({'recomputed': 1}, w:wbx_fold_work)
  setlocal foldlevel=1
  call wbx#history#fold_restore({})
  call assert_equal(-1, foldclosed(s:block('a1').start), 'user foldlevel=1 leaves outer threads open')
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body), 'user foldlevel=1 initially closes nested bodies')
  call cursor(s:block('a1').start, 1)
  call wbx#history#thread_fold()
  call assert_equal(1, wbx#history#fold_save().closed.a1, 'inspection respects the user nested-body level while outer is closed')
  call wbx#history#thread_fold()
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body), 'outer expansion does not reset user nested-body defaults')
  setlocal foldlevel=99
  call wbx#history#fold_restore({})
  call s:inherited_group_test()
  let g:wbx_tui = {'threaded_history': 0}
  let view = s:publish(s:messages)
  call assert_equal(map(copy(s:messages), 'v:val.id'), map(copy(view.blocks), 'v:val.id'), 'explicit opt-out preserves canonical chronological projection exactly')
  call assert_equal([], filter(copy(view.blocks), 'v:val.thread_start != 0 || v:val.thread_end != 0 || v:val.thread_head != 0'))
  call cursor(s:block('a1').body, 1)
  call wbx#history#thread_fold()
  call assert_equal(-1, foldclosed(s:block('a1').start), 'compatibility mode keeps body-group toggles, not a fabricated interleaved outer range')
  call assert_equal(s:block('a1').body, foldclosed(s:block('a1').body))
  call assert_equal(-1, foldclosed(s:block('a2').body), 'compatibility mode preserves the old direct-parent body group rather than expanding it through nested ancestry')
  let g:wbx_tui = {}

  let malformed = [
        \ {'id': 'cycle-a', 'parentId': 'cycle-b'}, {'id': 'cycle-b', 'parentId': 'cycle-a'},
        \ {'id': 'cycle-child', 'parentId': 'cycle-a'}, {'id': 'self', 'parentId': 'self'},
        \ {'id': 'invalid', 'parentId': {'not': 'an id'}}, {'id': 'valid'}, {'id': 'valid-reply', 'parentId': 'valid'}]
  for message in malformed | call extend(message, {'author': 'Synthetic', 'created': '', 'text': message.id}) | endfor
  let original = deepcopy(malformed)
  let invalid_view = wbx#history#render(malformed, 0)
  call assert_equal(original, malformed)
  call assert_equal(sort(map(copy(malformed), 'v:val.id')), sort(map(copy(invalid_view.blocks), 'v:val.id')), 'invalid ancestry never loses/duplicates messages')
  for block in filter(copy(invalid_view.blocks), 'v:val.id !~# "^valid"')
    call assert_match('invalid parent', block.thread_error, 'invalid ancestry is explicitly labelled, not guessed')
    call assert_equal([block.id, 1, 0], [block.root, block.thread_size, block.loaded_replies], 'malformed components are honest bounded singleton groups')
  endfor
  let chain = []
  for index in range(1, 600)
    call add(chain, {'id': 'chain-' . index, 'parentId': index == 1 ? '' : 'chain-' . (index - 1), 'author': 'Chain', 'created': '', 'text': 'Raw body ' . index})
  endfor
  let original = deepcopy(reverse(chain))
  let chain_view = wbx#history#render(chain, 0)
  call assert_equal(original, chain, 'a long reversed chain is resolved without mutation or recursive call depth')
  call assert_equal(600, len(chain_view.blocks))
  call assert_equal('chain-1', chain_view.blocks[0].id)
  call assert_equal([], filter(copy(chain_view.blocks), 'v:val.root !=# "chain-1" || v:val.thread_size != 600 || v:val.loaded_replies != 599'))
  call assert_true(chain_view.complete)
  setlocal foldmethod=marker foldlevel=3 nofoldenable
  call assert_equal(0, wbx#history#fold_setup(1), 'grouped metadata does not override later native window settings')
  call assert_equal(0, wbx#history#thread_fold())
  call assert_equal(['marker', 3, 0], [&l:foldmethod, &l:foldlevel, &l:foldenable])
  let b:wbx_folds = 0
  call assert_equal({}, wbx#history#fold_save(), 'grouped mode still respects explicit fold opt-out')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
