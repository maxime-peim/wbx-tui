" Native UI provider handoff, exact mentions, spacing and composer completion.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax on
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:mention_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:mention_requests, [a:method, deepcopy(a:params)])',
      \ 'call call(a:Callback, [{"result": deepcopy(g:mention_members)}])', 'return 1', 'endfunction'],
      \ s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:mention_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Synthetic', 'type': 'group'}}
let g:mention_requests = []
let g:mention_members = {'roomId': 'r', 'revision': 1, 'state': 'ready', 'partial': v:false, 'more': v:false,
      \ 'items': [{'id': 'member-1', 'personId': 'long-private-person-id-ONE', 'label': 'First person', 'moderator': v:false},
      \ {'id': 'member-2', 'personId': 'long-private-person-id-TWO', 'label': 'Second person', 'moderator': v:false}]}
if has('nvim')
lua << EOF
  vim.ui.select = function(items, opts, callback)
    vim.g.native_picker_items = items
    vim.g.native_picker_options = opts
    local origin = vim.api.nvim_get_current_win()
    local buf = vim.api.nvim_create_buf(false, true)
    local win = vim.api.nvim_open_win(buf, true, { relative = 'editor', row = 2, col = 2, width = 35, height = 2, style = 'minimal' })
    vim.defer_fn(function()
      vim.api.nvim_win_close(win, true)
      vim.api.nvim_set_current_win(origin)
      if vim.g.native_picker_edit == 1 then vim.api.nvim_buf_set_lines(0, 0, -1, false, { 'New work during native picker' }) end
      local i = vim.g.native_picker_choice
      callback(i > 0 and items[i] or nil, i > 0 and i or nil)
    end, 5)
  end
EOF
endif
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 3 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:pick(choice) abort
  let g:native_picker_choice = a:choice
  let before = len(g:mention_requests)
  call wbx#rich#mention(0)
  if has('nvim')
    sleep 40m
  else
    let window = popup_list()[0]
    let g:native_picker_items = getbufline(winbufnr(window), 1, '$')
    if a:choice
      for _ in range(a:choice - 1) | call popup_filter_menu(window, 'j') | endfor
      call popup_filter_menu(window, "\<CR>")
    else
      call popup_filter_menu(window, "\<Esc>")
    endif
  endif
  call assert_equal(before + 1, len(g:mention_requests), 'only one explicitly requested participant page')
endfunction
try
  enew
  file wbx://compose/r
  setlocal buftype=nofile filetype=wbx-compose conceallevel=0
  let b:wbx_kind = 'compose' | let b:wbx_room = 'r'
  let native_completion = [&l:complete,&l:omnifunc]
  call s:pick(2)
  call assert_equal('<@personId:long-private-person-id-TWO|Second person>  ', getline(1))
  call assert_equal('markdown', b:wbx_format)
  call assert_equal('markdown', &l:filetype)
  call assert_notmatch('private-person-id', join(g:native_picker_items, "\n"))
  if has('nvim') | call assert_equal(['prompt'], keys(g:native_picker_options), 'theme/layout are entirely owned by vim.ui.select provider') | endif
  call assert_equal(native_completion,[&l:complete,&l:omnifunc],'mention preparation preserves native manual completion')
  call assert_false(b:completion)
  call assert_false(b:blink_cmp_enabled)
  call assert_true(b:minicompletion_disable)
  call assert_equal(1, b:coc_suggest_disable)
  syntax sync fromstart
  call assert_equal([1, ''], synconcealed(1, 1)[:1])
  call assert_equal([1, '@'], synconcealed(1, stridx(getline(1), '|') + 1)[:1], '@ is rendered immediately before the label')
  call assert_equal(' ', strpart(getline(1), col('.') - 1, 1), 'cursor sits on a real blank beyond the closing delimiter')
  call s:pick(1)
  call assert_match('<@personId:long-private-person-id-TWO|Second person> \+<@personId:long-private-person-id-ONE|First person>', getline(1), 'a second mention cannot split the first')
  call assert_equal(2, len(split(getline(1), '<@personId:', 1)) - 1)
  let text = getline(1)
  call s:pick(0)
  call assert_equal(text, getline(1), 'native cancellation retains the draft')
  if has('nvim')
    let g:native_picker_edit = 1
    call s:pick(1)
    call assert_equal('New work during native picker', getline(1), 'actual text changes still revoke picker intent')
    let g:native_picker_edit = 0
  endif
  " Real drawn confirmation accelerators; Vim uses private PTY test input.
  for script in $WBX_EDITOR_SCREEN ==# '1' ? ['rich', 'uploads', 'conversations', 'message_actions'] : []
    execute 'runtime autoload/wbx/' . script . '.vim'
    let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/" . script . ".vim$"')[0].sid
    let Confirm = function('<SNR>' . sid . '_confirm')
    if has('nvim') | call feedkeys('c', 't') | endif
    call assert_equal(0, Confirm('Synthetic cancel: no service is contacted.'))
    if has('nvim') | call feedkeys('y', 't') | endif
    call assert_equal(1, Confirm('Synthetic continue: no service is contacted.'))
    if has('nvim') | call feedkeys("\<CR>", 't') | endif
    call assert_equal(0, Confirm('Synthetic default: no service is contacted.'))
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
