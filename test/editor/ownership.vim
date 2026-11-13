set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression)
      return
    endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call WaitFor('wbx#state().ready')
  WebexCompose
  call setline(1, 'Private ordinary file; never submit this text.')
  let ordinary = bufnr('%')
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.notes.txt')
  setlocal buftype=
  write
  call assert_equal(['Private ordinary file; never submit this text.'], readfile(bufname('%')), 'native write saves only the explicitly named ordinary file')
  call assert_equal('', get(b:, 'wbx_kind', ''), 'renamed draft releases Webex ownership')
  call assert_false(get(maparg('<C-s>', 'n', 0, 1), 'buffer', 0), 'promotion removes only the default send mapping')
  WebexSend
  sleep 50m
  call assert_equal(2, len(wbx#state().messages), 'ordinary-file content is not sent')
  WebexRefresh
  sleep 50m
  call assert_equal(ordinary, bufnr('%'), 'state updates do not replace the ordinary file window')
  call assert_equal(['Private ordinary file; never submit this text.'], getbufline(ordinary, 1, '$'))
  WebexCompose
  call assert_notequal(ordinary, bufnr('%'), 'explicit compose creates a fresh destination-bound draft')
  call assert_equal('nofile', &l:buftype)
  call setline(1, 'new explicit destination-bound send')
  WebexSend
  call WaitFor('len(wbx#state().messages) == 3 && getline(1) ==# ""')
  " A late ACK may not clear a draft after it was promoted to an ordinary file,
  " even when its text/changedtick still match the submitted snapshot.
  nnoremap <buffer> <C-s> :let g:wbx_user_save_mapping = 1<CR>
  call setline(1, 'ACK must not erase a saved copy')
  WebexSend
  let saved_copy = bufnr('%')
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.saved-copy.txt')
  setlocal buftype=
  call assert_match('wbx_user_save_mapping', maparg('<C-s>', 'n'), 'promotion preserves a later user mapping')
  call WaitFor('len(wbx#state().messages) == 4')
  call assert_equal(['ACK must not erase a saved copy'], getbufline(saved_copy, 1, '$'))
  WebexCompose
  let composer = bufnr('%')
  let buffers = wbx#buffers()
  call setbufvar(buffers.rooms, '&modifiable', 1)
  call setbufline(buffers.rooms, 4, 'Locally edited spaces row')
  call win_gotoid(win_findbuf(buffers.rooms)[0])
  normal! 4G
  call wbx#select_current()
  sleep 50m
  call assert_equal('demo-general', wbx#state().room.id, 'edited spaces rows cannot choose an unintended destination')
  call win_gotoid(win_findbuf(composer)[0])
  execute 'bwipeout! ' . buffers.rooms
  call setline(1, 'history remains live without a spaces view')
  WebexSend
  call WaitFor('len(wbx#state().messages) == 5 && getline(1) ==# ""')
  call assert_match('history remains live', join(getbufline(buffers.history, 1, '$'), "\n"), 'closing spaces does not disable the other components')
  call setbufvar(buffers.history, '&modifiable', 1)
  call setbufline(buffers.history, 1, 'Private local history annotation')
  WebexRefresh
  sleep 50m
  call assert_equal('Private local history annotation', getbufline(buffers.history, 1)[0], 'polling never discards an edited view')
  call win_gotoid(win_findbuf(buffers.history)[0])
  close
  WebexRefresh
  sleep 50m
  call assert_equal('Private local history annotation', getbufline(buffers.history, 1)[0], 'closing an edited view retains its hidden annotations')
  Webex
  call assert_false(empty(win_findbuf(buffers.history)), 'open restores a closed history view')
  call win_gotoid(win_findbuf(buffers.history)[0])
  WebexRefresh!
  sleep 50m
  call assert_match('history remains live', join(getbufline(buffers.history, 1, '$'), "\n"), 'explicitly discarded annotations allow live updates again')
  Webex
  let restored = wbx#buffers()
  call assert_true(restored.rooms > 0 && restored.rooms != buffers.rooms, 'open restores a wiped spaces buffer')
  call assert_false(empty(win_findbuf(restored.rooms)))
  call assert_false(empty(win_findbuf(ordinary)), 'restoring views preserves unrelated user windows')
  call assert_equal(['Private ordinary file; never submit this text.'], getbufline(ordinary, 1, '$'))
  " Reserved URI collisions must not adopt or clear an unrelated user buffer.
  execute 'bwipeout! ' . restored.rooms
  let collision = bufadd('wbx://spaces')
  call bufload(collision)
  call setbufline(collision, 1, 'Unrelated work occupying a reserved buffer name')
  let rejected = 0
  try
    Webex
  catch /occupied by other work/
    let rejected = 1
  endtry
  call assert_equal(1, rejected)
  call assert_equal('', getbufvar(collision, '&buftype'))
  call assert_equal(['Unrelated work occupying a reserved buffer name'], getbufline(collision, 1, '$'))
  " A buftype-only promotion keeps the reserved name. Polling must refuse the
  " collision without raising from a job callback or adopting the ordinary file.
  WebexCompose
  let type_promoted = bufnr('%')
  call setline(1, 'Ordinary work still occupying the old composer name')
  setlocal buftype=
  WebexRefresh
  sleep 50m
  WebexSend
  sleep 50m
  call assert_equal(type_promoted, bufnr('%'))
  call assert_equal(['Ordinary work still occupying the old composer name'], getline(1, '$'))
  call assert_equal(5, len(wbx#state().messages), 'changing only buftype also disables sending')
  let rejected = 0
  try
    WebexCompose
  catch /occupied by other work/
    let rejected = 1
  endtry
  call assert_equal(1, rejected, 'explicit compose cannot adopt a promoted reserved-name file')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
