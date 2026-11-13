" Private native rendering/folding fixture. No plugin/backend/network/media.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
" This fixture preserves the explicitly supported chronological compatibility
" mode. Grouped subtrees and nested folds have their own thread-subtrees fixture.
let g:wbx_tui = {'threaded_history': 0}
let s:messages = [
      \ {'id': 'root', 'author': 'Alice', 'created': '', 'text': "# Original body\n```md\nunclosed"},
      \ {'id': 'other', 'author': 'Carol', 'created': '', 'text': "Unrelated\nStill unrelated"},
      \ {'id': 'reply', 'parentId': 'root', 'author': 'Bob', 'created': '', 'text': "**Reply body**\nLast line"},
      \ {'id': 'orphan', 'parentId': 'missing', 'author': 'Dana', 'created': '', 'text': 'Missing parent reply'}]
function! s:block(id) abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
endfunction
function! s:publish(messages) abort
  let states = {}
  for window in win_findbuf(bufnr('%'))
    call win_execute(window, 'let w:wbx_test_saved_folds = wbx#history#fold_save()')
    let states[window] = getwinvar(window, 'wbx_test_saved_folds')
  endfor
  let view = wbx#history#render(a:messages, 2)
  let lines = ['# Synthetic history', ''] + view.lines
  let old = getline(1, '$')
  let prefix = 0
  while prefix < min([len(old), len(lines)]) && old[prefix] ==# lines[prefix] | let prefix += 1 | endwhile
  let suffix = 0
  while suffix < min([len(old), len(lines)]) - prefix && old[-1 - suffix] ==# lines[-1 - suffix] | let suffix += 1 | endwhile
  setlocal modifiable
  if len(old) - suffix > prefix | call deletebufline(bufnr('%'), prefix + 1, len(old) - suffix) | endif
  if len(lines) - suffix > prefix | call append(prefix, lines[prefix : len(lines) - suffix - 1]) | endif
  " An initial empty buffer may leave its single mandatory empty line.
  if line('$') > len(lines) | call deletebufline(bufnr('%'), len(lines) + 1, '$') | endif
  setlocal nomodifiable nomodified
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = view.blocks
  let b:wbx_message_rows = view.headers
  let b:wbx_reply_rows = view.replies
  let b:wbx_quote_rows = view.quotes
  let b:wbx_history_room = 'synthetic'
  call wbx#history#syntax()
  for window in win_findbuf(bufnr('%'))
    call win_execute(window, 'call wbx#history#fold_restore(' . string(states[window]) . ')')
  endfor
  return view
endfunction
function! s:mark_count() abort
  if b:wbx_block_display ==# 'nvim-inline'
    return len(filter(nvim_buf_get_extmarks(bufnr('%'), nvim_get_namespaces()['wbx-message-blocks'], 0, -1, {'details': v:true}), 'get(v:val[3], "virt_text_pos", "") ==# "inline"'))
  elseif b:wbx_block_display ==# 'vim-props'
    return len(prop_list(1, {'end_lnum': -1, 'types': ['WbxBlockPrefix']}))
  endif
  return len(sign_getplaced(bufnr('%'), {'group': 'wbx-message-blocks'})[0].signs)
endfunction
function! s:assert_marks(view) abort
  call assert_equal(len(a:view.lines), s:mark_count(), 'exactly one rail per rendered row, no deleted/orphan rails')
endfunction
function! s:summary(id) abort
  let block = s:block(a:id)
  if b:wbx_block_display ==# 'nvim-inline'
    return nvim_buf_get_extmark_by_id(bufnr('%'), nvim_get_namespaces()['wbx-message-blocks'], b:wbx_block_decorations[a:id].summary, {'details': v:true})[2].virt_text[0][0]
  endif
  return prop_list(block.start, {'types': ['WbxThreadSummary']})[0].text
endfunction
function! s:inherited_window() abort
  " Each case emulates a fresh owned window with inherited global defaults.
  setlocal foldmethod=manual
  normal! zE
  setlocal foldmethod< foldlevel< foldtext< foldexpr< foldenable
  unlet! w:wbx_folds_buffer w:wbx_fold_defaults w:wbx_fold_choices w:wbx_thread_folds w:wbx_fold_lookup
  unlet! b:wbx_folds
endfunction
function! s:inheritance_tests() abort
  let global_options = [&g:foldmethod, &g:foldlevel, &g:foldtext]
  let had_options = exists('g:wbx_tui')
  let options = get(g:, 'wbx_tui', {})
  let history = bufnr('%')
  new
  execute 'buffer ' . history
  augroup wbx_test_fold_hooks
    autocmd!
    autocmd FileType wbx-history execute g:wbx_test_fold_hook
  augroup END
  try
    " Matches the statically inspected LazyVim global fold defaults. This does
    " not load LazyVim, touch installed options or use an active editor session.
    setglobal foldmethod=indent foldlevel=99 foldtext=
    let g:wbx_tui = {'threaded_history': 0}
    call s:inherited_window()
    call assert_equal(1, wbx#history#fold_setup(1), 'pre-FileType opt-in specializes inherited global indent folding')
    call assert_equal(['expr', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext], 'inherited open level and empty foldtext preferences survive')
    call wbx#history#fold_restore({})
    call assert_equal(-1, foldclosed(s:block('reply').body), 'LazyVim-like defaults start with open message bodies')
    call cursor(s:block('reply').body, 1)
    call assert_equal(1, wbx#history#thread_fold())
    call assert_equal(s:block('reply').body, foldclosed(s:block('reply').body), 'loaded thread folding works with inherited indent defaults')
    call assert_equal(-1, foldclosed(s:block('other').body), 'inherited defaults still never fold an unrelated interleaved message')
    normal! zo
    call assert_equal(-1, foldclosed(s:block('reply').body), 'native zo remains effective with empty foldtext')

    call s:inherited_window()
    call wbx#history#fold_setup(1)
    let g:wbx_test_fold_hook = 'setlocal foldmethod=marker foldlevel=3'
    doautocmd <nomodeline> FileType wbx-history
    call assert_equal(0, wbx#history#fold_setup(), 'actual FileType marker override wins after specialized defaults')
    call assert_equal(0, wbx#history#fold_setup(1), 'even later pre-hook flags cannot reclaim a window overridden by the user')
    call assert_equal(['marker', 3], [&l:foldmethod, &l:foldlevel])

    call s:inherited_window()
    setlocal foldmethod=marker
    call assert_equal(0, wbx#history#fold_setup(1), 'an explicit preexisting local marker method is not an inherited indent default')
    call assert_equal('marker', &l:foldmethod)

    call s:inherited_window()
    setlocal foldmethod=manual
    execute s:block('reply').body . ',' . s:block('reply').end . 'fold'
    call assert_equal(0, wbx#history#fold_setup(1), 'explicit local manual folds remain authoritative')
    call assert_equal('manual', &l:foldmethod)
    call assert_true(foldlevel(s:block('reply').body) > 0, 'manual fold definitions are retained')

    call s:inherited_window()
    call wbx#history#fold_setup(1)
    let g:wbx_test_fold_hook = 'setlocal foldmethod=manual'
    doautocmd <nomodeline> FileType wbx-history
    execute s:block('reply').body . ',' . s:block('reply').end . 'fold'
    call assert_equal(0, wbx#history#fold_setup(), 'actual FileType manual override is not replaced')
    call assert_true(foldlevel(s:block('reply').body) > 0)

    call s:inherited_window()
    let g:wbx_tui = {'folds': 0, 'threaded_history': 0}
    call assert_equal(0, wbx#history#fold_setup(1), 'global folds=0 opts out even at the pre-hook stage')
    call assert_equal(['indent', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext])
    let g:wbx_tui = {'threaded_history': 0}
    call s:inherited_window()
    let b:wbx_folds = 0
    call assert_equal(0, wbx#history#fold_setup(1), 'buffer folds=0 opts out')
    call assert_equal('indent', &l:foldmethod)

    call s:inherited_window()
    call wbx#history#fold_setup(1)
    let g:wbx_test_fold_hook = 'let b:wbx_folds = 0'
    doautocmd <nomodeline> FileType wbx-history
    call assert_equal(0, wbx#history#fold_setup(), 'a FileType opt-out releases still-owned pre-hook defaults')
    call assert_equal(['indent', 99, ''], [&l:foldmethod, &l:foldlevel, &l:foldtext])
    call assert_equal({}, wbx#history#fold_save())
  finally
    let [&g:foldmethod, &g:foldlevel, &g:foldtext] = global_options
    if had_options | let g:wbx_tui = options | else | unlet! g:wbx_tui | endif
    unlet! b:wbx_folds g:wbx_test_fold_hook
    augroup wbx_test_fold_hooks
      autocmd!
    augroup END
    close
  endtry
endfunction
try
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history'
  let b:wbx_render_tick = b:changedtick
  let initial = s:publish(s:messages)
  setlocal syntax=wbx-history
  syntax sync fromstart
  call assert_equal(1, wbx#history#fold_setup(), 'untouched native defaults enable body folding')
  call wbx#history#fold_restore({})
  call assert_equal(-1, foldclosed(s:block('root').body), 'message bodies initially open')
  call assert_match('1 loaded replies', s:summary('root'), 'counts explicitly describe loaded replies, not server totals')
  call assert_match('parent not loaded', getline(s:block('orphan').start + 1))
  call s:assert_marks(initial)
  call assert_equal('WbxMessageHeader', synIDattr(synID(s:block('reply').start, 1, 1), 'name'), 'unclosed fences stop at message boundaries')
  call assert_match('^markdown', synIDattr(synID(s:block('reply').body, 3, 1), 'name'))
  call cursor(s:block('root').body, 1)
  normal! yy
  call assert_equal("# Original body\n", getreg('"'), 'native yank is original text, no decorations or hints')
  normal! zc
  call assert_equal(s:block('root').body, foldclosed(s:block('root').body))
  let closed_state = wbx#history#fold_save()
  normal! zo
  call assert_equal(-1, foldclosed(s:block('root').body))
  call wbx#history#fold_restore(closed_state)
  call assert_equal(s:block('root').body, foldclosed(s:block('root').body), 'explicit restore also works without text changes')
  normal! zo
  normal! za
  call assert_equal(s:block('root').body, foldclosed(s:block('root').body), 'native za is not mapped/reimplemented')
  normal! za
  call cursor(s:block('reply').body, 1)
  call wbx#history#thread_fold()
  call assert_equal(s:block('root').body, foldclosed(s:block('root').body), 'reply selection collapses its root')
  call assert_equal(s:block('reply').body, foldclosed(s:block('reply').body))
  call assert_equal(-1, foldclosed(s:block('other').body), 'interleaved unrelated bodies remain open')
  call assert_equal(-1, foldclosed(s:block('root').start), 'header remains visible')
  call assert_equal(-1, foldclosed(s:block('reply').start + 1), 'reply context remains visible')
  let first_window = win_getid()
  split
  let second_window = win_getid()
  call wbx#history#fold_setup()
  call cursor(s:block('reply').body, 1)
  call wbx#history#thread_fold()
  call assert_equal(-1, foldclosed(s:block('root').body), 'a second reader independently opens the thread')
  call win_execute(first_window, 'let w:wbx_test_foreign_folds = wbx#history#fold_save()')
  call wbx#history#fold_restore(getwinvar(first_window, 'wbx_test_foreign_folds'))
  call assert_equal(-1, foldclosed(s:block('root').body), 'another window state cannot close this reader even when buffer/room/shape match')
  call assert_equal({'recomputed': 1}, w:wbx_fold_work, 'foreign window identity requires safe recomputation')
  let root_marks = copy(b:wbx_block_decorations.root.marks)
  let other_marks = copy(b:wbx_block_decorations.other.marks)
  let other_uid = b:wbx_block_decorations.other.uid
  let appended = {'id': 'tail', 'author': 'Tail', 'created': '', 'text': "New message\nLast new line"}
  call add(s:messages, appended)
  let view = s:publish(s:messages)
  call assert_equal(1, b:wbx_decoration_work.messages, 'one append decorates one message')
  call assert_equal(root_marks, b:wbx_block_decorations.root.marks, 'unchanged native IDs survive append')
  call assert_equal(1, b:wbx_syntax_work, 'append retains previous bounded syntax definitions')
  call s:assert_marks(view)
  let tick = b:changedtick
  call wbx#history#syntax()
  call assert_equal({'messages': 0, 'rows': 0, 'removed': 0}, b:wbx_decoration_work, 'unchanged poll has no decoration work')
  call assert_equal(0, b:wbx_syntax_work, 'unchanged poll retains all bounded syntax groups')
  call assert_equal(tick, b:changedtick)
  let s:messages[2].text = "**Changed reply body**\nLast line"
  let view = s:publish(s:messages)
  call assert_equal(1, b:wbx_decoration_work.messages, 'one same-size edit decorates one message')
  call assert_equal(other_marks, b:wbx_block_decorations.other.marks)
  for window in [first_window, second_window]
    let before = getwinvar(window, 'wbx_test_saved_folds')
    call win_execute(window, 'let w:wbx_test_body_folds = wbx#history#fold_save()')
    let after = getwinvar(window, 'wbx_test_body_folds')
    call assert_notequal(before.tick, after.tick, 'body-only edit really changed the buffer')
    call assert_equal(before.shape, after.shape, 'same-size body edit retains fold bounds')
    call assert_equal(before.closed, after.closed, 'closed/open native choices survive body-only edits in each reader')
    call assert_equal({'recomputed': 0}, getwinvar(window, 'wbx_fold_work'), 'body-only edit avoids a global zX in both windows')
  endfor
  call s:assert_marks(view)
  let s:messages[-1].text .= "\nA body edit adds a row"
  let view = s:publish(s:messages)
  call assert_equal(1, b:wbx_decoration_work.messages, 'growing one body retains other native decorations')
  call assert_equal(other_marks, b:wbx_block_decorations.other.marks, 'body growth relocates later decorations')
  call assert_equal({'recomputed': 1}, w:wbx_fold_work, 'a changed body extent still forces safe recomputation')
  call s:assert_marks(view)
  call insert(s:messages, {'id': 'older', 'author': 'Older', 'created': '', 'text': "Older message\nOlder line"})
  let view = s:publish(s:messages)
  call assert_equal(other_marks, b:wbx_block_decorations.other.marks, 'native marks relocate on prepend without replacement')
  call assert_equal(other_uid, b:wbx_block_decorations.other.uid, 'message IDs back stable decoration identities')
  call s:assert_marks(view)
  call assert_equal(-1, foldclosed(s:block('root').body), 'second window retains open state after prepend')
  call win_gotoid(first_window)
  call assert_equal(s:block('root').body, foldclosed(s:block('root').body), 'first window retains closed state by message ID after prepend')
  call add(s:messages, {'id': 'later-reply', 'parentId': 'root', 'author': 'Later', 'created': '', 'text': 'A newly loaded reply'})
  let view = s:publish(s:messages)
  call assert_equal(s:block('later-reply').body, foldclosed(s:block('later-reply').body), 'new loaded replies inherit this window thread collapse')
  call assert_equal(2, b:wbx_decoration_work.messages, 'reply append updates only the new reply and root count')
  call assert_equal(root_marks, b:wbx_block_decorations.root.marks, 'loaded count updates do not replace root rails or its buffer header')
  call assert_equal(-1, foldclosed(s:block('other').body))
  call assert_match('2 loaded replies', s:summary('root'))
  call assert_equal(['older', 'root', 'other', 'reply', 'orphan', 'tail', 'later-reply'], map(copy(b:wbx_message_blocks), 'v:val.id'), 'thread folds never reorder chronology')
  call remove(s:messages, 1)
  let view = s:publish(s:messages)
  call s:assert_marks(view)
  setlocal nofoldenable
  let disabled = [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable]
  let disabled_folds = wbx#history#fold_save()
  let s:messages[-1].text = 'Body-only edit while native folds are disabled'
  let view = s:publish(s:messages)
  call assert_equal(disabled, [&l:foldmethod, &l:foldexpr, &l:foldlevel, &l:foldenable], 'background restoration preserves disabled folding and native options')
  call assert_equal({'recomputed': 1}, w:wbx_fold_work, 'disabled-fold text edits retain the safe refresh needed to restore hidden closed choices')
  call assert_equal(0, wbx#history#thread_fold(), 'disabled native folding is not silently enabled')
  setlocal foldenable
  call assert_equal(disabled_folds.closed, wbx#history#fold_save().closed, 'body edits while disabled retain choices when native folds are enabled again')
  call assert_match('parent not loaded', getline(s:block('reply').start + 1), 'root eviction updates reply labels honestly')
  call cursor(s:block('reply').start, 1)
  call wbx#history#thread_fold()
  call assert_equal(-1, foldclosed(s:block('reply').body), 'missing-parent loaded thread can still expand')
  call assert_equal(-1, foldclosed(s:block('later-reply').body))
  " Exercise the compatible sign fallback, including prepend and deletion.
  let b:wbx_block_display = 'signs'
  call wbx#history#blocks()
  call s:assert_marks(view)
  let sign_ids = copy(b:wbx_block_decorations.other.marks)
  call insert(s:messages, {'id': 'oldest', 'author': 'Oldest', 'created': '', 'text': 'Oldest'})
  let view = s:publish(s:messages)
  call assert_equal(sign_ids, b:wbx_block_decorations.other.marks, 'sign IDs also survive prepend')
  call s:assert_marks(view)
  call remove(s:messages, 0, 1)
  let view = s:publish(s:messages)
  call s:assert_marks(view)
  call cursor(s:block('reply').body, 1)
  normal! zc
  let same_ids_other_room = wbx#history#fold_save()
  let room_view = wbx#view#capture()
  let b:wbx_history_room = 'different-room'
  call wbx#view#restore(room_view, [])
  call assert_equal(-1, foldclosed(s:block('reply').body), 'the actual view-restoration path never carries closed folds into another room by row')
  call wbx#history#fold_restore(same_ids_other_room)
  call assert_equal(-1, foldclosed(s:block('reply').body), 'room changes do not inherit closure from another room even if IDs are reused')
  let b:wbx_history_room = 'synthetic'
  call wbx#history#fold_restore(same_ids_other_room)
  setlocal foldmethod=marker foldlevel=3 nofoldenable
  call assert_equal(0, wbx#history#fold_setup(), 'later native folding settings win')
  call assert_equal(0, wbx#history#fold_restore({}))
  call assert_equal(['marker', 3, 0], [&l:foldmethod, &l:foldlevel, &l:foldenable])
  let b:wbx_folds = 0
  call assert_equal({}, wbx#history#fold_save(), 'explicit opt-out leaves native state alone')
  call s:inheritance_tests()

  enew
  setlocal buftype=nofile
  let b:wbx_kind = 'compose'
  let b:wbx_parent = 'missing'
  let b:wbx_reply_label = 'parent not loaded'
  let b:wbx_send_hint = ',s sends explicitly · :WebexHelp'
  call setline(1, ['Draft text', 'Enter stays a newline'])
  let tick = b:changedtick
  let undo = undotree()
  call wbx#history#draft()
  call assert_match('Replying to parent not loaded', b:wbx_reply_banner[1])
  call assert_match(',s sends explicitly', b:wbx_reply_banner[1])
  call assert_equal(['Draft text', 'Enter stays a newline'], getline(1, '$'))
  call assert_equal(tick, b:changedtick, 'composer hint does not edit draft text')
  call assert_equal(undo, undotree(), 'composer hints do not change undo')
  let b:wbx_parent = ''
  call wbx#history#draft()
  call assert_match(escape(b:wbx_send_hint, '\.*$^~[]') . '$', b:wbx_reply_banner[1], 'normal drafts retain the exact non-sendable hint after their new context')
  call assert_match('PLAIN.*32/1000 UTF-16.*32/4000 bytes', b:wbx_reply_banner[1], 'format/count context is outside sendable draft text')
  call assert_equal(['Draft text', 'Enter stays a newline'], getline(1, '$'))
  call assert_equal(tick, b:changedtick)
  call assert_equal(undo, undotree(), 'count/format context preserves the full undo tree')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
