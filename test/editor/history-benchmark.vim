" Bounded synthetic decoration benchmark; no plugin, jobs or service access.
" WBX_EDITOR_ROOT=/path/to/repo WBX_EDITOR_RESULT=/private/result.json
" nvim --headless -u NONE -i NONE -n -S test/editor/history-benchmark.vim
" Full Vim: vim -Nu NONE -i NONE -n -es -S test/editor/history-benchmark.vim
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
function! s:install(view) abort
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = a:view.blocks
  let b:wbx_message_rows = a:view.headers
  let b:wbx_reply_rows = a:view.replies
  let b:wbx_quote_rows = a:view.quotes
  call wbx#history#syntax()
endfunction
function! s:summary(samples) abort
  let sorted = sort(copy(a:samples), 'f')
  return {'median_ms': sorted[len(sorted) / 2], 'p95_ms': sorted[-1]}
endfunction
let s:results = []
try
  for [total, bodylines] in [[500, 1], [1000, 19]]
    enew!
    silent! file wbx://history
    " The one-line workload must test an actual body-only fold, not a body
    " plus its trailing separator. Only this private benchmark changes fml.
    setlocal buftype=nofile modifiable foldminlines=0
    let b:wbx_kind = 'history'
    let messages = []
    for index in range(1, total)
      call add(messages, {'id': 'message-' . index, 'author': 'Synthetic', 'created': '', 'text': join(repeat(['Native **Markdown** body'], bodylines), "\n")})
    endfor
    let initial = wbx#history#render(messages, 2)
    call setline(1, ['# Benchmark', ''] + initial.lines)
    let b:wbx_render_tick = b:changedtick
    let b:wbx_message_blocks = initial.blocks
    let b:wbx_message_rows = initial.headers
    let b:wbx_reply_rows = initial.replies
    let b:wbx_quote_rows = initial.quotes
    setlocal syntax=wbx-history
    call wbx#history#syntax()
    let samples = {'append': [], 'edit': [], 'poll': []}
    let render_samples = []
    let work = {}
    for iteration in range(1, 9)
      call add(messages, {'id': 'append-' . iteration, 'author': 'Appended', 'created': '', 'text': join(repeat(['Appended **body**'], bodylines), "\n")})
      let started = reltime()
      let view = wbx#history#render(messages, 2)
      call add(render_samples, reltimefloat(reltime(started)) * 1000)
      call append(line('$'), view.lines[len(initial.lines) :])
      let started = reltime()
      call s:install(view)
      call add(samples.append, reltimefloat(reltime(started)) * 1000)
      let work.append = copy(b:wbx_decoration_work)
      call assert_equal(1, work.append.messages)
      let messages[-1].text = substitute(messages[-1].text, 'Appended', 'Changed', 'g')
      let view = wbx#history#render(messages, 2)
      call setline(view.blocks[-1].body, split(messages[-1].text, "\n", 1))
      let started = reltime()
      call s:install(view)
      call add(samples.edit, reltimefloat(reltime(started)) * 1000)
      let work.edit = copy(b:wbx_decoration_work)
      call assert_equal(1, work.edit.messages)
      let started = reltime()
      call wbx#history#syntax()
      call add(samples.poll, reltimefloat(reltime(started)) * 1000)
      let work.poll = copy(b:wbx_decoration_work)
      call assert_equal(0, work.poll.rows)
      let initial = view
    endfor
    let fold_samples = []
    let changed_fold_samples = []
    let body_fold_samples = []
    let shape_fold_samples = []
    call wbx#history#fold_setup()
    call wbx#history#fold_restore({})
    let edited_block = view.blocks[len(view.blocks) / 2]
    let unrelated_block = view.blocks[len(view.blocks) / 2 + 1]
    execute edited_block.body . 'foldclose'
    for iteration in range(1, 9)
      let started = reltime()
      call wbx#history#fold_restore(wbx#history#fold_save())
      call add(fold_samples, reltimefloat(reltime(started)) * 1000)
      let started = reltime()
      let saved = wbx#history#fold_save()
      call setline(1, '# Benchmark ' . iteration)
      let b:wbx_render_tick = b:changedtick
      call wbx#history#fold_restore(saved)
      call add(changed_fold_samples, reltimefloat(reltime(started)) * 1000)
      let started = reltime()
      let saved = wbx#history#fold_save()
      call setline(edited_block.body, 'Native **body-only** edit ' . iteration)
      let b:wbx_render_tick = b:changedtick
      call wbx#history#fold_restore(saved)
      call add(body_fold_samples, reltimefloat(reltime(started)) * 1000)
      call assert_equal({'recomputed': 0}, w:wbx_fold_work, 'body edit uses native local invalidation rather than global zX')
      call assert_equal(edited_block.body, foldclosed(edited_block.body), 'same-size edit preserves a closed body')
      call assert_equal(-1, foldclosed(unrelated_block.body), 'body edit never closes a neighboring message')
    endfor
    for iteration in range(1, 9)
      let started = reltime()
      let saved = wbx#history#fold_save()
      call append(b:wbx_message_blocks[-1].end - 1, 'Structural body line ' . iteration)
      let b:wbx_message_blocks[-1].end += 1
      if get(b:wbx_message_blocks[-1], 'thread_end', 0) > 0 | let b:wbx_message_blocks[-1].thread_end += 1 | endif
      let b:wbx_render_tick = b:changedtick
      call wbx#history#fold_restore(saved)
      call add(shape_fold_samples, reltimefloat(reltime(started)) * 1000)
      call assert_equal({'recomputed': 1}, w:wbx_fold_work, 'shape changes retain global fold recomputation')
      call assert_equal(edited_block.body, foldclosed(edited_block.body), 'structural updates retain existing closed choices')
      call assert_equal(get(b:wbx_message_blocks[-1], 'thread_start', 0) > 0 ? 2 : 1, foldlevel(b:wbx_message_blocks[-1].end - 1), 'shape changes include the inserted final content row in its body fold')
      if get(b:wbx_message_blocks[-1], 'thread_start', 0) > 0
        call assert_equal(0, foldlevel(b:wbx_message_blocks[-1].end), 'structural updates keep the final thread separator outside the fold')
      endif
    endfor
    call add(s:results, {'rows': total * (bodylines + 2), 'messages': total, 'mode': b:wbx_block_display, 'foldminlines': &l:foldminlines,
          \ 'render': s:summary(render_samples), 'append': s:summary(samples.append), 'edit': s:summary(samples.edit), 'poll': s:summary(samples.poll), 'fold_save_restore': s:summary(fold_samples), 'changed_fold_save_restore': s:summary(changed_fold_samples),
          \ 'body_edit_fold_save_restore': s:summary(body_fold_samples), 'shape_changed_fold_save_restore': s:summary(shape_fold_samples), 'decoration_work': work,
          \ 'buffer_bytes': strlen(join(getline(1, '$'), "\n"))})
    bwipeout!
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'samples': 9, 'results': s:results})], $WBX_EDITOR_RESULT)
qa!
