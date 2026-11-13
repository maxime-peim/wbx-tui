" Syntax-only redraw evidence; fresh offline editors, no plugin/backend or jobs.
set encoding=utf-8 hidden noswapfile columns=160 lines=50 laststatus=0
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
let g:wbx_tui = {'images': 0, 'threaded_history': 0}
let count = empty($WBX_SYNTAX_MESSAGES) ? 500 : str2nr($WBX_SYNTAX_MESSAGES)
let messages = []
for index in range(1, count)
  call add(messages, {'id': 'message-' . index, 'author': 'Author ' . index, 'created': '',
        \ 'text': 'Status **changes** and [design](https://example.invalid/design).' . "\n" . '- Next: integration and tests 世界'})
endfor
let metrics = []
try
  " No decoration/gutter/fold/statusline cost: this fixture isolates syntax.
  let view = wbx#history#render(messages, 2)
  call setline(1, ['# Syntax benchmark', ''] + view.lines)
  let b:wbx_message_blocks = view.blocks
  let b:wbx_message_rows = view.headers
  let b:wbx_reply_rows = view.replies
  let b:wbx_quote_rows = view.quotes
  let started = reltime()
  setlocal syntax=wbx-history
  let install_ms = reltimefloat(reltime(started)) * 1000
  call cursor(view.blocks[count / 2].body, 1)
  normal! zz
  redraw!
  syntime on
  for operation in ['redraw', 'scroll']
    let samples = []
    for sample in range(1, 7)
      let started = reltime()
      for iteration in range(1, 10)
        if operation ==# 'scroll' | execute "normal! \<C-e>" | endif
        redraw!
      endfor
      call add(samples, reltimefloat(reltime(started)) * 1000 / 10)
    endfor
    call add(metrics, {'operation': operation, 'wall_ms': samples})
  endfor
  syntime off
  call writefile(split(execute('syntime report'), "\n"), $WBX_EDITOR_RESULT . '.syntime.txt')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim',
      \ 'messages': count, 'install_ms': exists('install_ms') ? install_ms : 0, 'metrics': metrics})], $WBX_EDITOR_RESULT)
qa!
