" Native per-buffer setup/mapping lifetime. Actions and feature state have other owners.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! s:release_maps() abort
  for mapping in get(b:, 'wbx_default_maps', [])
    let current = maparg(mapping[1], mapping[0], 0, 1)
    if get(current, 'buffer', 0) && current ==# mapping[2]
      execute 'silent! ' . mapping[0] . 'unmap <buffer> ' . wbx#commands#key(mapping[1])
    endif
  endfor
  let b:wbx_default_maps = []
endfunction
function! s:default_map(mode, lhs, rhs, recursive) abort
  " FileType hooks/ftplugins run first and own any buffer-local mappings they set.
  if get(maparg(a:lhs, a:mode, 0, 1), 'buffer', 0)
    return
  endif
  execute a:mode . (a:recursive ? 'map' : 'noremap') . ' <silent><buffer> ' . a:lhs . ' ' . a:rhs
  let installed = maparg(a:lhs, a:mode, 0, 1)
  " Track the expanded localleader, even if the user later changes it.
  call add(b:wbx_default_maps, [a:mode, installed.lhs, installed])
endfunction
function! wbx#buffer_setup#apply(effects) abort
  if !wbx#view#owned(bufnr('%'), get(b:, 'wbx_kind', ''))
    call wbx#drafts#observe(bufnr('%'))
    call s:release_maps()
    call call(a:effects.LeaveWindow, [])
    call wbx#layout#leave()
    if wbx#history#presentation()
      " Clean thread lists own only syntax/fold metadata, never main-history
      " actions. Re-entry must not discard their message boundaries.
      call wbx#history#syntax()
      call wbx#folds#setup()
      return
    endif
    if exists('b:wbx_unread_rows')
      let b:wbx_unread_rows = []
      let b:wbx_cached_rows = []
      call wbx#rooms#syntax()
      unlet! b:wbx_unread_rows b:wbx_unread_syntax_rows b:wbx_cached_rows b:wbx_cached_syntax_rows b:wbx_local_read_rows b:wbx_local_unread_rows
    endif
    if exists('b:wbx_message_rows')
      let b:wbx_message_rows = []
      let b:wbx_quote_rows = []
      call wbx#history#syntax()
    endif
    call wbx#history#clear()
    if exists('b:wbx_image_placements') && has('nvim-0.10')
      call luaeval("require('wbx-tui.images').clear(_A)", bufnr('%'))
    endif
    unlet! b:wbx_image_placements b:wbx_image_pending b:wbx_view_image b:wbx_image_hint
    unlet! b:wbx_kind b:wbx_initialized b:wbx_room b:wbx_parent b:wbx_reply_label b:wbx_title b:wbx_default_maps b:wbx_edited_notice b:wbx_render_tick b:wbx_rooms_positioned b:wbx_history_room b:wbx_message_rows b:wbx_quote_rows b:wbx_reply_rows b:wbx_message_blocks b:wbx_history_complete b:wbx_history_syntax_rows b:wbx_history_oldest b:wbx_paging_edge b:wbx_render_work b:wbx_send_hint b:wbx_unloaded_clean b:wbx_unloaded_edited b:wbx_unloaded_text
    return
  endif
  let reload = wbx#view#loaded(bufnr('%'))
  if get(b:, 'wbx_kind', '') ==# 'history' && get(w:, 'wbx_history_fold_prepared', -1) != bufnr('%')
    " Specialize inherited global defaults only before native FileType hooks.
    " A later conservative call must never consume the first-window decision.
    call wbx#history#fold_setup(1)
    let w:wbx_history_fold_prepared = bufnr('%')
  endif
  if reload
    call call(a:effects.Render, [])
    if get(b:, 'wbx_kind', '') ==# 'image' | call wbx#images#restore() | endif
  endif
  call call(a:effects.EnterWindow, [])
  if get(b:, 'wbx_kind', '') ==# 'rooms'
    call wbx#render#position_rooms(bufnr('%'))
    call wbx#rooms#syntax()
  endif
  if get(b:, 'wbx_kind', '') ==# 'compose'
    call call(a:effects.Draft, [])
  elseif get(b:, 'wbx_kind', '') ==# 'history'
    call wbx#history#syntax()
    if get(b:, 'wbx_initialized', 0) | call wbx#history#fold_setup() | endif
  endif
  call wbx#paging#baseline()
  if get(b:, 'wbx_initialized', 0)
    return
  endif
  let b:wbx_initialized = 1
  let buffer = bufnr('%')
  let kind = get(b:, 'wbx_kind', '')
  if kind ==# 'history'
    " Native defaults precede FileType hooks, which may override them. These
    " never reapply on polls or erase a later :setlocal customization.
    setlocal wrap linebreak
    if empty(&l:showbreak) && wbx#gutter#style() ==# 'rails'
      let w:wbx_history_showbreak = {'before': &l:showbreak, 'installed': '  │ '}
      let &l:showbreak = '  │ '
    endif
    if has('conceal')
      setlocal conceallevel=2 concealcursor=nc
    endif
  elseif kind ==# 'rooms'
    " Vim's fallback presence signs share the native sign column.
    setlocal signcolumn=auto
  elseif kind ==# 'compose' && has('conceal')
    " Drafts remain literal editable text, even when split from rich history.
    setlocal conceallevel=0
  endif
  if &l:filetype !=# 'wbx-' . kind
    " Set in the actual window/buffer context so native FileType hooks and
    " ftplugins see the right buffer (setbufvar() suppresses option events).
    execute 'setlocal filetype=wbx-' . kind
  endif
  if bufnr('%') != buffer
    return
  endif
  if !wbx#view#owned(buffer, kind)
    " Native hooks may promote/rename a buffer. Do not install send mappings
    " or emit a Webex-buffer event after the user has released ownership.
    call wbx#buffer_setup#apply(a:effects)
    return
  endif
  if kind ==# 'history' | call wbx#history#fold_setup() | endif
  let b:wbx_default_maps = []
  if wbx#options#normalized().mappings
    if kind ==# 'rooms'
      call s:default_map('n', '<CR>', '<Plug>(WebexSelectSpace)', 1)
      call s:default_map('n', 'r', ':WebexRefresh<CR>', 0)
    elseif kind ==# 'history'
      call s:default_map('n', 'i', '<Plug>(WebexComposeInsert)', 1)
      call s:default_map('n', '<BS>', '<Plug>(WebexSpaces)', 1)
      call s:default_map('n', 'r', ':WebexRefresh<CR>', 0)
      call s:default_map('n', '<localleader>r', '<Plug>(WebexReply)', 1)
      call s:default_map('n', '<localleader>R', '<Plug>(WebexCancelReply)', 1)
      call s:default_map('n', '<localleader>o', '<Plug>(WebexAttachment)', 1)
      call s:default_map('n', 'o', '<Plug>(WebexAttachment)', 1)
      if wbx#options#normalized().read_status
        call s:default_map('n', 'R', '<Plug>(WebexMarkRead)', 1)
      endif
    elseif kind ==# 'compose'
      call s:default_map('n', '<localleader>s', '<Plug>(WebexSend)', 1)
      call s:default_map('n', '<localleader>R', '<Plug>(WebexCancelReply)', 1)
      if wbx#options#normalized().send_with_ctrl_s
        call s:default_map('n', '<C-s>', '<Plug>(WebexSend)', 1)
        call s:default_map('i', '<C-s>', '<Plug>(WebexSend)', 1)
      endif
    endif
  endif
  if kind ==# 'compose' | call call(a:effects.Draft, []) | endif
  if kind ==# 'history'
    let b:wbx_image_hint = wbx#commands#attachment_hint()
    call call(a:effects.Render, [])
  endif
  call wbx#paging#baseline()
  call call(a:effects.Event, ['WbxBuffer', {'bufnr': bufnr('%'), 'kind': kind}])
endfunction
function! wbx#buffer_setup#draft() abort
  if !wbx#view#owned(bufnr('%'), 'compose') | return | endif
  call wbx#completion#sync()
  call wbx#drafts#observe(bufnr('%'))
  call wbx#draft_persistence#observe(bufnr('%'))
  call wbx#draft_persistence#present()
  let b:wbx_send_hint = wbx#commands#send_hint()
  call wbx#history#draft()
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
