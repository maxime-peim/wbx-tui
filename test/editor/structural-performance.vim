" Structural work/identity guards. Synthetic state only; no backend or service.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'notifications': 0,
      \ 'mark_read_on_open': 0, 'upcoming_meetings': 0, 'statusline': 0}
runtime plugin/wbx.vim
filetype plugin on
syntax enable
function! s:publish(state) abort
  let a:state.revision += 1
  let envelope = {'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(a:state)}
  if !wbx#protocol#valid(envelope) | throw 'Invalid synthetic structural state' | endif
  call wbx#_receive(envelope)
endfunction
function! s:block(id) abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
endfunction
function! s:folds(window) abort
  call win_execute(a:window, 'let w:wbx_structural_saved = wbx#history#fold_save()')
  return getwinvar(a:window, 'wbx_structural_saved')
endfunction
function! s:levels() abort
  for block in b:wbx_message_blocks
    for row in range(block.start, block.end)
      call assert_equal(row == block.thread_end ? 0 : row < block.body ? 1 : 2, foldlevel(row), 'native grouped fold level at ' . block.id . ':' . row)
    endfor
  endfor
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'), [])
  let state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true,
        \ 'room': {'id': 'room-a', 'title': 'Structural work', 'type': 'group'},
        \ 'rooms': [{'id': 'room-a', 'title': 'Structural work', 'type': 'group'}],
        \ 'messages': [], 'historyLatest': v:true, 'readStatus': 'off'}
  for index in range(1, 50)
    call add(state.messages, {'id': 'm-' . index, 'author': 'Synthetic', 'created': '', 'text': 'Body ' . index . "\n**Native Markdown**\nEnd"})
  endfor
  call s:publish(state)
  let history = wbx#buffers().history
  call win_gotoid(win_findbuf(history)[0])
  let first = win_getid()
  call cursor(s:block('m-25').body + 1, 3)
  normal! zt
  let view = winsaveview()
  let marks = copy(b:wbx_block_decorations['m-25'].marks)
  let rules = execute('syntax list')
  let state.messages[-1].text = "Edited body\n**Native Markdown**\nEnd"
  if has('profile')
    execute 'profile start ' . fnameescape($WBX_EDITOR_RESULT . '.profile')
    profile func *splice
    profile func wbx#history#syntax
  endif
  call s:publish(state)
  if has('profile')
    profile pause
    profile dump
    let profile = join(readfile($WBX_EDITOR_RESULT . '.profile'), "\n")
    call assert_equal(1, str2nr(matchstr(profile, 'FUNCTION  [^\n]*_splice()\n\_.\{-}Called \zs\d\+')), 'executed splice calls agree with the work counter')
    call assert_equal([], filter(split(profile, "\n"), 'v:val =~# ''^\s*\d\+\s.*let shape = '''), 'a body-only edit executes no syntax chrome reconstruction')
  endif
  call assert_equal(50, b:wbx_view_work.old_blocks)
  call assert_equal(50, b:wbx_view_work.new_blocks)
  call assert_equal(49, b:wbx_view_work.retained)
  call assert_equal(50, b:wbx_view_work.shared_ids)
  call assert_equal(1, b:wbx_view_work.splices, 'unchanged message gaps do not call the splice helper')
  call assert_equal(1, b:wbx_view_work.writes)
  call assert_equal(500, b:wbx_view_work.compared_rows, 'exact old/new row spans are counted even without native mutations')
  call assert_equal(50, b:wbx_decoration_checks.messages)
  call assert_equal(49, b:wbx_decoration_checks.locations, 'unchanged rail endpoints remain natively verified')
  call assert_equal(98, b:wbx_decoration_checks.endpoints)
  call assert_equal(0, b:wbx_decoration_checks.summaries, 'unrelated empty summaries do not run a text reconciliation')
  call assert_equal(50, b:wbx_syntax_checks.geometry)
  call assert_equal(50, b:wbx_syntax_checks.identities)
  call assert_equal(0, b:wbx_syntax_checks.messages, 'content-only changes do not rebuild per-message chrome shapes')
  call assert_equal(0, b:wbx_syntax_checks.buckets)
  call assert_equal(0, b:wbx_syntax_bucket_work)
  call assert_equal(0, w:wbx_fold_restore_checks.resets)
  call assert_equal(50, w:wbx_fold_restore_checks.shape)
  call assert_equal(50, w:wbx_fold_restore_checks.bodies, 'fold-choice inspection is counted, not claimed as eliminated')
  call assert_equal(marks, b:wbx_block_decorations['m-25'].marks)
  call assert_equal(view, winsaveview())
  call assert_equal(rules, execute('syntax list'))

  " A missing native endpoint must still be repaired on the next real edit.
  let middle = s:block('m-25')
  let missing = b:wbx_block_decorations['m-25'].marks[0]
  if b:wbx_block_display ==# 'nvim-inline'
    call nvim_buf_del_extmark(history, nvim_get_namespaces()['wbx-message-blocks'], missing)
  elseif b:wbx_block_display ==# 'vim-props'
    call prop_remove({'id': missing, 'type': 'WbxBlockPrefix', 'all': 1}, middle.start, middle.end)
  else
    call sign_unplace('wbx-message-blocks', {'buffer': history, 'id': missing})
  endif
  let state.messages[-1].text = "Another edit\n**Native Markdown**\nEnd"
  call s:publish(state)
  call assert_equal(2, b:wbx_decoration_work.messages, 'native verification repairs corruption as well as the edited message')

  " New IDs and different bytes, but exactly the same syntax row geometry.
  let state.room.id = 'room-b'
  call add(state.rooms, copy(state.room))
  for message in state.messages
    let message.id = 'other-' . message.id
    let message.text = substitute(message.text, '^\S\+', 'Replacement', '')
  endfor
  call s:publish(state)
  call assert_equal(0, b:wbx_view_work.shared_ids)
  call assert_equal(1, b:wbx_view_work.splices)
  call assert_equal(50, b:wbx_view_work.writes, 'new identity sets still retain sparse native writes rather than amplifying fold recalculation')
  call assert_equal(0, b:wbx_syntax_work)
  call assert_equal(0, b:wbx_syntax_bucket_work)
  call assert_equal(0, b:wbx_syntax_checks.messages)
  call assert_equal(rules, execute('syntax list'), 'geometry-identical spaces retain native rule definitions')
  call assert_equal(sort(map(copy(state.messages), 'v:val.id')), sort(keys(b:wbx_message_syntax)), 'syntax identity maps are rekeyed, not left attached to another room')

  let first_bucket = execute('syntax list WbxBodyBucket0')
  call add(state.messages, {'id': 'tail', 'author': 'Tail', 'created': '', 'text': "Tail body\n**Tail**\nEnd"})
  call s:publish(state)
  call assert_equal(50, b:wbx_view_work.retained)
  call assert_equal(1, b:wbx_view_work.splices)
  call assert_equal(1, b:wbx_view_work.writes)
  call assert_equal(1, b:wbx_syntax_work, 'an append after rekeying still updates only its own new syntax shape')
  call assert_equal(1, b:wbx_syntax_bucket_work)
  call assert_equal(first_bucket, execute('syntax list WbxBodyBucket0'))
  call s:levels()

  let middle = s:block('other-m-25')
  let marks = copy(b:wbx_block_decorations[middle.id].marks)
  execute middle.body . 'foldclose'
  execute s:block('other-m-1').start . 'foldclose'
  split
  let second = win_getid()
  normal! zR
  call cursor(middle.start, 3)
  normal! zt
  call add(state.messages, {'id': 'early-reply', 'parentId': 'other-m-1', 'author': 'Reply', 'created': '', 'text': "Earlier thread reply\n**Reply**\nEnd"})
  call s:publish(state)
  call assert_equal(marks, b:wbx_block_decorations['other-m-25'].marks, 'an earlier-thread insertion retains shifted native decorations')
  call assert_equal(1, s:folds(first).threads['other-m-1'])
  call assert_equal(0, s:folds(second).threads['other-m-1'])
  call assert_equal(1, s:folds(first).closed['other-m-25'])
  call assert_equal(0, s:folds(second).closed['other-m-25'])
  call assert_equal(s:block('other-m-25').start, line('.'), 'reader cursor follows message identity, not the inserted row count')
  call assert_equal(3, col('.'))
  call s:levels()
  call insert(state.messages, {'id': 'older', 'author': 'Older', 'created': '', 'text': "Older body\n**Older**\nEnd"})
  call s:publish(state)
  call assert_equal(marks, b:wbx_block_decorations['other-m-25'].marks)
  call assert_equal(s:block('other-m-25').start, line('.'), 'prepend retains the same reader anchor')
  call assert_equal(1, s:folds(first).threads['other-m-1'])
  call assert_equal(0, s:folds(second).threads['other-m-1'])

  " Bounded Unicode images exercise structural shifts, not simulated graphics.
  let g:wbx_tui.images = 'unicode'
  for index in [2, 10, 20]
    let state.messages[index].images = [{'id': repeat(index == 2 ? 'a' : index == 10 ? 'b' : 'c', 64), 'state': 'ready',
          \ 'png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'lines': repeat([repeat('⣿', 40)], 12)}]
  endfor
  call s:publish(state)
  call assert_equal(3, len(b:wbx_image_placements))
  let pixels = deepcopy(b:wbx_image_placements)
  let state.messages[-1].text = "Changed reply body\n**Reply**\nEnd"
  call s:publish(state)
  call assert_equal(pixels, b:wbx_image_placements)
  call s:levels()
  call win_gotoid(first)
  setlocal nofoldenable
  let disabled = s:folds(first)
  let state.messages[-1].text = "Edited while disabled\n**Reply**\nEnd"
  call s:publish(state)
  call assert_equal(0, &l:foldenable)
  setlocal foldenable
  call assert_equal(disabled.closed, s:folds(first).closed)
  call assert_equal(disabled.threads, s:folds(first).threads)
  call s:levels()
  close

  let state.messages = []
  for index in range(1, 21)
    call add(state.messages, {'id': 'clipped-' . index, 'author': 'Clipped', 'created': '', 'text': repeat("row\n", 999) . 'row'})
  endfor
  call s:publish(state)
  call assert_false(b:wbx_history_complete, 'structural write batching cannot certify a clipped history endpoint')
  call assert_match('Message display clipped', join(getline(1, '$'), "\n"))
  for block in b:wbx_message_blocks
    call assert_equal('WbxMessageHeader', synIDattr(synID(block.start, 1, 1), 'name'), 'clipped history still has bounded native header syntax')
  endfor
  setlocal modifiable
  call setline(1, 'Retained annotation')
  let annotated = getline(1, '$')
  let undo = undotree()
  let state.messages[0].text = 'Remote edit while annotated'
  call s:publish(state)
  call assert_equal(annotated, getline(1, '$'))
  call assert_equal(undo, undotree())
  call assert_false(wbx#transport#running(), 'projection/verification work never starts a backend, sends or acknowledges')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
