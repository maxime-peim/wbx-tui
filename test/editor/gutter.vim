" Pure native display fixture: no plugin transport, backend, OAuth or media.
set encoding=utf-8 hidden noswapfile lines=55 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:messages = [
      \ {'id': 'root', 'author': 'Alice', 'created': '2026-11-10T10:00:00Z', 'text': "Literal body\nSecond line"},
      \ {'id': 'reply', 'parentId': 'root', 'author': 'Bob', 'created': '2026-11-10T10:01:00Z', 'text': repeat('abcdefghijklmnopqrstuvwxyz ', 12)},
      \ {'id': 'other', 'author': 'Carol', 'created': '2026-11-10T10:02:00Z', 'text': 'Unrelated root'}]
function! s:publish(messages) abort
  let saved = exists('*wbx#history#fold_save') ? wbx#history#fold_save() : {}
  let view = wbx#history#render(a:messages, 2)
  setlocal modifiable
  call wbx#view#replace(bufnr('%'), ['# Synthetic gutter', ''] + view.lines, view.blocks)
  let b:wbx_message_blocks = view.blocks
  let b:wbx_message_rows = view.headers
  let b:wbx_reply_rows = view.replies
  let b:wbx_quote_rows = view.quotes
  let b:wbx_render_tick = b:changedtick
  let b:wbx_history_complete = view.complete
  let b:wbx_history_room = 'gutter-fixture'
  setlocal nomodifiable nomodified
  call wbx#history#blocks()
  call wbx#history#fold_restore(saved)
  return view
endfunction
function! s:block(id) abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
endfunction
function! WbxTestColumn() abort
  let g:wbx_gutter_base_calls += 1
  return '%@WbxTestClick@%s%T%=%l '
endfunction
function! WbxTestClick(minwid, clicks, button, mods) abort
  let g:wbx_gutter_clicks += 1
endfunction
function! s:eval(row, ...) abort
  return nvim_eval_statusline(a:0 ? a:1 : &l:statuscolumn, {'winid': win_getid(), 'use_statuscol_lnum': a:row, 'highlights': v:true})
endfunction
function! s:screen_checks(...) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  let marker = a:0 ? a:1 : '▎'
  normal! ggzt
  redraw!
  let info = getwininfo(win_getid())[0]
  let text = info.wincol + info.textoff
  let root = screenpos(win_getid(), s:block('root').start, 1)
  let reply = screenpos(win_getid(), s:block('reply').start, 1)
  let wrapped = screenpos(win_getid(), s:block('reply').body, 1)
  call assert_true(root.row > 0 && reply.row > 0 && wrapped.row > 0, 'gutter checks use an actual drawn private UI')
  call assert_equal(marker, screenstring(root.row, text - 1), 'marker occupies the margin immediately before body text, after native columns')
  call assert_equal('A', screenstring(root.row, text), 'no corner/rail is inserted into root text')
  call assert_equal(marker, screenstring(reply.row, text - 1))
  call assert_equal(' ', screenstring(reply.row, text))
  call assert_equal(' ', screenstring(reply.row, text + 1))
  call assert_equal('B', screenstring(reply.row, text + 2), 'replies retain two visual indentation columns')
  call assert_equal(marker, screenstring(wrapped.row + 1, text - 1), 'wrapped message continuations keep a gutter marker')
  call assert_equal(' ', screenstring(wrapped.row + 1, text))
  call assert_equal(' ', screenstring(wrapped.row + 1, text + 1), 'wrapped reply indentation is virtual, not a showbreak rail')
  call assert_notequal('│', screenstring(wrapped.row + 1, text + 2))
endfunction
function! s:closed_gap() abort
  let before = winsaveview()
  let folds = wbx#history#fold_save()
  let root = s:block('root')
  try
    execute root.start . 'foldclose'
    call assert_equal(root.thread_end - 1, foldclosedend(root.start), 'thread folding retains its final blank separator with either statuscolumn renderer')
    call assert_equal(-1, foldclosed(root.thread_end))
    if $WBX_EDITOR_SCREEN ==# '1'
      call cursor(root.start, 1)
      normal! zt
      redraw!
      let header = screenpos(win_getid(), root.start, 1)
      let gap = screenpos(win_getid(), root.thread_end, 1)
      let following = screenpos(win_getid(), s:block('other').start, 1)
      call assert_true(header.row > 0 && gap.row > 0 && following.row > 0)
      call assert_equal(header.row + 1, gap.row)
      call assert_equal(gap.row + 1, following.row, 'Snacks/custom columns keep one blank screen row between the closed thread and the next message')
      let info = getwininfo(win_getid())[0]
      let text = info.wincol + info.textoff
      call assert_equal(' ', screenstring(gap.row, text - 1), 'the retained gap has no margin marker')
      call assert_equal(' ', screenstring(gap.row, text), 'the retained gap has no in-text rail')
    endif
  finally
    call wbx#history#fold_restore(folds)
    call winrestview(before)
  endtry
endfunction
function! s:width_checks() abort
  let before = &ambiwidth
  let widths = getcellwidths()
  let row = s:block('root').body
  try
    set ambiwidth=double
    call assert_equal(2, strdisplaywidth('▎'), 'fixture exercises the actual ambiguous-width edge case')
    call assert_match('|$', s:eval(row).str, 'double-width Unicode marker uses a single-cell ASCII fallback without redecoration')
    call s:screen_checks('|')
    call s:closed_gap()
    set ambiwidth=single
    call setcellwidths([[0x258e, 0x258e, 2]])
    call assert_equal(2, strdisplaywidth('▎'))
    call assert_match('|$', s:eval(row).str, 'explicit native cell-width overrides also keep the marker single-cell')
    call s:screen_checks('|')
    call s:closed_gap()
  finally
    call setcellwidths(widths)
    let &ambiwidth = before
  endtry
  call assert_match('▎$', s:eval(row).str, 'the normal thin marker returns immediately after restoring native width settings')
  call s:screen_checks()
  call s:closed_gap()
endfunction
try
  if !has('nvim-0.10') || !exists('+statuscolumn')
    call assert_equal('rails', wbx#gutter#style(), 'compatible Vim/old Neovim retain native rail fallback')
  else
    let g:wbx_tui = {}
    let g:wbx_gutter_base_calls = 0
    let g:wbx_gutter_clicks = 0
    let global_options = [&g:statuscolumn, &g:number, &g:relativenumber, &g:signcolumn, &g:showbreak]
    call setline(1, 'Unrelated user work')
    let ordinary = bufnr('%')
    let ordinary_column = &l:statuscolumn
    new
    file wbx://history
    setlocal buftype=nofile wrap linebreak number relativenumber signcolumn=yes foldcolumn=1
    let &l:statuscolumn = '%!WbxTestColumn()'
    let original = &l:statuscolumn
    let b:wbx_kind = 'history'
    let view = s:publish(s:messages)
    call wbx#history#fold_setup(1)
    call wbx#history#fold_restore({})
    let history = bufnr('%')
    let window = win_getid()
    call assert_equal('gutter', b:wbx_border_style, 'Neovim defaults to gutter styling')
    let installed = &l:statuscolumn
    call assert_notequal(original, installed)
    call assert_equal(original, w:wbx_gutter.before, 'the exact user/LazyVim renderer remains delegated')
    let evaluated = s:eval(s:block('root').body)
    call assert_match('▎$', evaluated.str, 'native evaluation appends the marker after the original number/sign columns')
    call assert_true(g:wbx_gutter_base_calls > 0)
    call assert_match('%@WbxTestClick@%s%T%=%l ', wbx#gutter#column(original), 'click/highlight format is retained, not flattened')
    call assert_notmatch('▎', s:eval(1).str, 'chrome rows are not presented as message bodies')
    call assert_notmatch('▎', s:eval(s:block('root').end).str, 'separator gap remains visible')
    let marks = nvim_buf_get_extmarks(history, nvim_get_namespaces()['wbx-message-blocks'], 0, -1, {'details': v:true})
    for mark in marks
      for chunk in get(mark[3], 'virt_text', [])
        call assert_notmatch('[┌│└]', chunk[0], 'gutter style has no in-text structural rails')
      endfor
    endfor
    let other_ns = nvim_create_namespace('wbx-test-foreign-signs')
    let foreign = nvim_buf_set_extmark(history, other_ns, s:block('root').body - 1, 0, {'sign_text': '!', 'sign_hl_group': 'DiagnosticWarn', 'priority': 99})
    call assert_match('!', s:eval(s:block('root').body).str, 'foreign diagnostic signs still use the original renderer')
    call s:screen_checks()
    call s:width_checks()
    call cursor(s:block('reply').body, 1)
    normal! yy
    call assert_equal(s:messages[1].text . "\n", getreg('"'), 'body yanks have no gutter or indentation text')
    let before_text = getline(1, '$')
    let tick = b:changedtick
    let reading = winsaveview()
    let undo = undotree()
    call wbx#history#blocks()
    call assert_equal(0, b:wbx_decoration_work.rows, 'unchanged display does not churn inline marks')
    call assert_equal(reading, winsaveview())
    call assert_equal(tick, b:changedtick)
    call assert_equal(undo, undotree())
    call cursor(s:block('root').start, 1)
    normal! za
    call assert_equal(s:block('root').start, foldclosed(s:block('reply').start), 'gutter keeps real native thread folding')
    let messages = s:messages + [{'id': 'new-reply', 'parentId': 'root', 'author': 'Dana', 'created': '2026-11-10T10:03:00Z', 'text': 'Incoming reply'}]
    call s:publish(messages)
    call assert_equal(s:block('root').start, foldclosed(s:block('new-reply').start), 'arrivals stay under the closed thread')
    let inserted = s:block('new-reply')
    call assert_equal(inserted.end - inserted.start + 2, b:wbx_decoration_work.rows, 'one insertion decorates its block and root count only')
    normal! zR
    split
    let second = win_getid()
    call assert_equal(original, w:wbx_gutter.before, 'split options recover the base without nesting wrappers')
    call assert_equal(installed, &l:statuscolumn)
    execute 'buffer ' . ordinary
    call assert_equal(ordinary_column, &l:statuscolumn, 'foreign buffers keep their own native local statuscolumn')
    call assert_equal(['Unrelated user work'], getline(1, '$'))
    execute 'buffer ' . history
    call assert_equal(installed, &l:statuscolumn, 'returning to history reinstalls just one wrapper')
    let &l:statuscolumn = 'CUSTOM:%l'
    call wbx#gutter#enter()
    call wbx#history#blocks()
    call assert_equal('CUSTOM:%l', &l:statuscolumn, 'explicit later local overrides stay authoritative')
    call assert_false(exists('w:wbx_gutter'))
    close
    call win_gotoid(window)
    " Native fallback has exactly the built-in number/sign/fold semantics.
    split
    call wbx#gutter#leave()
    unlet! w:wbx_gutter_override
    let &l:statuscolumn = ''
    setlocal nonumber norelativenumber signcolumn=no foldcolumn=0
    call wbx#gutter#enter()
    call assert_equal('▎', s:eval(s:block('root').body).str, 'without native columns, the marker remains a single true margin cell')
    call assert_equal(1, s:eval(s:block('root').body).width)
    set ambiwidth=double
    call assert_equal('|', s:eval(s:block('root').body).str)
    call assert_equal(1, s:eval(s:block('root').body).width, 'ambiguous-width fallback occupies exactly one margin cell')
    set ambiwidth=single
    setlocal number numberwidth=6
    let number_row = s:block('root').body
    call assert_equal(number_row . '▎', substitute(s:eval(number_row).str, '\s', '', 'g'), 'absolute number widths remain native and precede the margin marker')
    augroup wbx_test_gutter_hook
      autocmd!
      autocmd FileType wbx-history let &l:statuscolumn = 'HOOK:%l' | let &l:showbreak = 'USER>'
    augroup END
    doautocmd <nomodeline> FileType wbx-history
    call wbx#gutter#enter()
    call wbx#history#blocks()
    call assert_equal('HOOK:%l', &l:statuscolumn, 'actual FileType statuscolumn override is not reclaimed by rendering')
    call assert_equal('USER>', &l:showbreak, 'native continuation overrides are not reset')
    augroup wbx_test_gutter_hook
      autocmd!
    augroup END
    close
    call win_gotoid(window)
    " Embedded quotes in a static user format survive native option copying.
    split
    call wbx#gutter#leave()
    unlet! w:wbx_gutter_override
    let &l:statuscolumn = "LABEL:'%l "
    call wbx#gutter#enter()
    let quoted = w:wbx_gutter.before
    split
    call assert_equal(quoted, w:wbx_gutter.before, 'copied wrapper decoding never evaluates or corrupts quoted user formats')
    close
    close
    call win_gotoid(window)
    let style_tick = b:changedtick
    let style_text = getline(1, '$')
    let g:wbx_tui.message_borders = 'rails'
    call wbx#history#blocks()
    call assert_equal(original, &l:statuscolumn, 'legacy style releases the extra margin slot')
    call assert_equal('rails', b:wbx_border_style)
    let root_mark = nvim_buf_get_extmark_by_id(history, nvim_get_namespaces()['wbx-message-blocks'], b:wbx_block_decorations.root.marks[0], {'details': v:true})
    call assert_equal('┌ ', root_mark[2].virt_text[0][0], 'the previous rail style remains an explicit option')
    let g:wbx_tui.message_borders = 'gutter'
    call wbx#history#blocks()
    call assert_equal(installed, &l:statuscolumn)
    call assert_equal(style_tick, b:changedtick, 'switching border style never changes body text or undo')
    call assert_equal(style_text, getline(1, '$'))
    call assert_false(empty(nvim_buf_get_extmark_by_id(history, other_ns, foreign, {})), 'style changes leave foreign signs intact')
    call assert_equal(global_options, [&g:statuscolumn, &g:number, &g:relativenumber, &g:signcolumn, &g:showbreak], 'no global window preferences changed')
    call assert_equal('NonText', synIDattr(synIDtrans(hlID('WbxMessageGutter')), 'name'))
    highlight! link WbxMessageGutter Search
    call wbx#gutter#highlights()
    call assert_match('links to Search', execute('highlight WbxMessageGutter'), 'native highlight overrides are never force-replaced by plugin defaults')
    colorscheme default
    call assert_match('links to NonText', execute('highlight WbxMessageGutter'), 'colorscheme reset restores standard-group-aware defaults, not hard-coded colors')
    " Lua forwarding is optional; the Vimscript baseline does not require setup.
    lua require('wbx-tui').setup({ message_borders = 'rails' })
    call assert_equal('rails', g:wbx_tui.message_borders)
    let g:wbx_tui.message_borders = 'gutter'
    call wbx#history#blocks()
    " Actual installed Snacks renderer in an isolated editor, never its user config.
    if !empty($WBX_SNACKS_PATH) && filereadable($WBX_SNACKS_PATH . '/lua/snacks/statuscolumn.lua')
      call wbx#gutter#leave()
      lua << trim LUA
        vim.opt.runtimepath:append(vim.env.WBX_SNACKS_PATH)
        package.loaded.snacks = { config = { get = function(_, defaults) return defaults end },
          util = { set_hl = function() end } }
        _G.LazyVim = { statuscolumn = function() return require('snacks.statuscolumn').get() end }
      LUA
      let &l:statuscolumn = '%!v:lua.LazyVim.statuscolumn()'
      call wbx#gutter#enter()
      call assert_match('▎$', s:eval(s:block('root').start).str, 'actual Snacks/LazyVim-format output retains the right-hand message slot')
      let g:statusline_winid = win_getid()
      call assert_match('%@v:lua.require', wbx#gutter#column(w:wbx_gutter.before), 'actual Snacks fold click handler remains in the returned format')
      unlet g:statusline_winid
      call s:screen_checks()
      call s:width_checks()
    endif
    let released = w:wbx_gutter.before
    execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.promoted')
    call assert_equal(released, &l:statuscolumn, 'promotion releases only the plugin-owned wrapper')
    let &l:statuscolumn = 'FILETYPE:%l'
    call wbx#gutter#enter()
    call assert_equal('FILETYPE:%l', &l:statuscolumn, 'unowned buffers never receive a gutter or option restoration')
    call assert_equal(window, win_getid())
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
