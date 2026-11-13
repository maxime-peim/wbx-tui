" Actual demo backend and default keys; same-name directory hits never send.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
runtime autoload/wbx/directory.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/directory.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_input() abort\nreturn 'Demo'\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call assert_true(wbx#state().room is v:null)
  call feedkeys("\\Wnp", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "directory" && exists("b:wbx_directory_snapshot")')
  call assert_true(wbx#directory#current())
  call assert_equal(2, len(b:wbx_directory_snapshot.items))
  call assert_match('NAME PREFIX', getline(1))
  call assert_equal(b:wbx_directory_snapshot.items[0].label, b:wbx_directory_snapshot.items[1].label)
  let directory = bufnr('%')
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal(directory, bufnr('%'), 'heading never prepares the last person')
  normal ]p
  call assert_equal(directory, bufnr('%'))
  call cursor(6, 1)
  let target = b:wbx_directory_snapshot.items[1].personId
  execute "normal \<CR>"
  call s:wait('exists("b:wbx_recipient")')
  call assert_equal(target, b:wbx_recipient.personId, 'same labels cannot substitute first or last identity')
  call assert_equal([''], getline(1, '$'))
  call assert_equal(3, len(wbx#state().rooms), 'Prepare DM does not create or post a placeholder')
  WebexDirectCancel
  execute 'buffer ' . directory
  normal r
  call s:wait('wbx#directory#current()')
  call assert_equal('Demo', b:wbx_directory_snapshot.query)
  setlocal modifiable
  call setline(1, 'Retained directory note')
  let tree = undotree()
  normal r
  execute "normal \<CR>"
  normal q
  call assert_equal('Retained directory note', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexDirectory Demo
  call assert_equal('', &buftype)
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  call assert_equal(tree, undotree())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
