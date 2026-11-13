" Native hooks must not redirect a launch or revoke another image-file lease.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let $TMPDIR = fnamemodify($WBX_EDITOR_RESULT, ':h')
let g:wbx_tui = {'notifications': 0, 'backend': ['/bin/false']}
let g:hook_image = {'id': repeat('a', 64), 'png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='}
call writefile(["import {appendFileSync} from 'node:fs';appendFileSync(process.argv[2],JSON.stringify({path:process.argv[3]})+'\\n');setTimeout(()=>{},300);"], $WBX_EDITOR_RESULT . '.viewer.mjs')
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:hook() abort
  if !empty(bufname('%')) || g:hook_fired | return | endif
  let g:hook_fired = 1
  if g:hook_mode ==# 'redirect'
    execute 'buffer ' . g:hook_target
  elseif g:hook_mode ==# 'annotate'
    call setline(1, 'Hook annotation')
    let g:hook_target = bufnr('%')
  elseif g:hook_mode ==# 'disconnect'
    call wbx#disconnect()
  elseif g:hook_mode ==# 'replace'
    call wbx#image_external#stop()
    let g:wbx_tui.image_viewer = {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.replacement'], 'terminal': 0}
    call wbx#image_external#open(g:hook_image)
  endif
endfunction
function! s:run(timer) abort
  try
    for mode in ['redirect', 'annotate', 'disconnect', 'replace', 'option-redirect', 'option-annotate', 'option-disconnect']
      execute 'new hook-target-' . mode
      let g:hook_target = bufnr('%')
      let target_tick = b:changedtick
      let target_hidden = &l:bufhidden
      enew
      execute 'file hook-origin-' . mode
      let g:hook_mode = mode
      let g:hook_fired = 0
      let g:wbx_tui.image_viewer = {'argv': [$WBX_NODE, $WBX_EDITOR_RESULT . '.viewer.mjs', $WBX_EDITOR_RESULT . '.' . mode], 'terminal': 1}
      augroup wbx_image_terminal_test
        autocmd!
        autocmd BufEnter * if g:hook_mode !~# '^option-' | call s:hook() | endif
        autocmd OptionSet bufhidden if g:hook_mode =~# '^option-' | let g:hook_mode = substitute(g:hook_mode, '^option-', '', '') | call s:hook() | endif
      augroup END
      call wbx#image_external#open(g:hook_image)
      call WaitFor('g:hook_fired')
      sleep 200m
      call assert_false(filereadable($WBX_EDITOR_RESULT . '.' . mode), mode . ': hook revokes terminal launch')
      call assert_equal([], filter(getbufinfo(), 'getbufvar(v:val.bufnr, "&buftype") ==# "terminal"'), mode . ': canceled creation leaves no terminal process buffer')
      if mode =~# 'redirect'
        call assert_equal('', getbufvar(g:hook_target, '&buftype'), 'a redirected user buffer is not converted to a terminal')
        call assert_equal(target_tick, getbufvar(g:hook_target, 'changedtick'))
        call assert_equal(target_hidden, getbufvar(g:hook_target, '&bufhidden'), 'do not install wipe-on-hide on redirected work')
      elseif mode =~# 'annotate'
        call assert_equal('Hook annotation', getbufline(g:hook_target, 1)[0])
        call assert_equal('', getbufvar(g:hook_target, '&bufhidden'), 'aborted launch cannot leave annotations wipe-on-hide')
      elseif mode ==# 'replace'
        call WaitFor('filereadable($WBX_EDITOR_RESULT . ".replacement")')
        let replacement = json_decode(readfile($WBX_EDITOR_RESULT . '.replacement')[0])
        call assert_true(filereadable(replacement.path), 'stale launch cleanup cannot release its replacement lease')
      endif
      augroup wbx_image_terminal_test
        autocmd!
      augroup END
      call wbx#image_external#stop()
      call WaitFor('empty(glob($TMPDIR . "/wbx-image-*", 0, 1))')
      if &buftype ==# 'terminal' | bwipeout! | endif
      if empty(bufname('%')) | execute 'file hook-result-' . mode | endif
      " Each case owns only private scratch windows. Bound their accumulation
      " in silent Ex without deleting the user-work stand-ins being protected.
      let retained = getbufline(g:hook_target, 1, '$')
      only
      call assert_equal(retained, getbufline(g:hook_target, 1, '$'), 'closing fixture windows retains hook-owned text')
    endfor
    call assert_false(wbx#transport#running())
  catch
    call add(v:errors, v:exception . ' at ' . v:throwpoint)
  endtry
  call wbx#image_external#stop()
  call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
  qa!
endfunction
" OptionSet is suppressed at startup; execute in the ordinary event loop.
autocmd VimEnter * call timer_start(0, function('s:run'))
