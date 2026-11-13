let s:save_cpo = &cpoptions
set cpoptions&vim
let s:timer = -1
function! s:title(image) abort
  return 'Image · ' . a:image.width . '×' . a:image.height . ' pixels · fitted to window (not the thumbnail)'
endfunction
function! s:visible(timer) abort
  let s:timer = -1
  if has('nvim-0.10')
    let seen = {}
    for window in getwininfo()
      if !has_key(seen, window.bufnr) && index(['history', 'image'], getbufvar(window.bufnr, 'wbx_kind', '')) >= 0
        let seen[window.bufnr] = 1
        call luaeval("require('wbx-tui.images').refresh(_A)", window.bufnr)
      endif
    endfor
  endif
  call wbx#_images_visible()
endfunction
function! wbx#images#open(image, mode, ...) abort
  if a:mode ==# 'external'
    return a:0 >= 3 ? wbx#image_external#open(a:image, a:2, 1)
          \ : a:0 >= 2 ? wbx#image_external#open(a:image, a:2) : wbx#image_external#open(a:image)
  endif
  if a:0 >= 2 && !wbx#attachment_context(a:2) | throw 'Image opening canceled.' | endif
  let buffer = bufnr('^wbx://image$')
  if buffer > 0 && (!wbx#view#owned(buffer, 'image') || wbx#view#edited(buffer) || !bufloaded(buffer))
    throw 'Image buffer holds other work. Rename or close it explicitly before reopening.'
  endif
  if buffer < 0
    let buffer = bufadd('wbx://image')
    call setbufvar(buffer, '&buftype', 'nofile')
    call setbufvar(buffer, '&bufhidden', 'hide')
    call setbufvar(buffer, '&swapfile', 0)
    call setbufvar(buffer, '&undofile', 0)
    call setbufvar(buffer, '&modeline', 0)
    call bufload(buffer)
    if bufname(buffer) !=# 'wbx://image' || getbufvar(buffer, '&buftype') !=# 'nofile' || getbufline(buffer, 1, '$') !=# ['']
      throw 'Image buffer was changed by a native hook; retained without replacement.'
    endif
    call setbufvar(buffer, 'wbx_kind', 'image')
    call setbufvar(buffer, 'wbx_render_tick', getbufvar(buffer, 'changedtick'))
  endif
  if a:0 >= 2 && !wbx#attachment_context(a:2) | throw 'Image opening canceled by an editor hook.' | endif
  if getbufvar(buffer, 'wbx_view_image', {}) !=# a:image
    call setbufvar(buffer, '&modifiable', 1)
    call setbufline(buffer, 1, [s:title(a:image), ''] + a:image.lines + repeat([''], 28))
    if len(getbufline(buffer, 1, '$')) > 42 | call deletebufline(buffer, 43, '$') | endif
    call setbufvar(buffer, '&modified', 0)
    call setbufvar(buffer, '&modifiable', 0)
    call setbufvar(buffer, 'wbx_view_image', deepcopy(a:image))
    call setbufvar(buffer, 'wbx_render_tick', getbufvar(buffer, 'changedtick'))
  endif
  call setbufvar(buffer, 'wbx_image_placements', [{'id': a:image.id, 'row': 3, 'png': a:image.png, 'width': a:image.width, 'height': a:image.height}])
  if a:0 | call setbufvar(buffer, 'wbx_image_source', deepcopy(a:1)) | endif
  if type(a:image.png) == v:t_dict | call wbx#snapshots#bind(a:image.png.snapshot, buffer) | endif
  let windows = win_findbuf(buffer)
  if empty(windows) | execute 'sbuffer ' . buffer | else | call win_gotoid(windows[0]) | endif
  if wbx#view#owned(buffer, 'image') && !wbx#view#edited(buffer)
    if a:0 >= 2 && !wbx#attachment_valid(a:2) | return | endif
    call wbx#images#render(buffer, getbufvar(buffer, 'wbx_image_placements'))
  endif
endfunction
function! wbx#images#restore() abort
  if wbx#view#owned(bufnr('%'), 'image') && !wbx#view#edited(bufnr('%')) && exists('b:wbx_view_image')
    " Rebuild only a clean, explicitly reloaded projection, never annotations.
    if getline(1, '$') ==# ['']
      setlocal modifiable
      call setline(1, [s:title(b:wbx_view_image), ''] + b:wbx_view_image.lines + repeat([''], 28))
      setlocal nomodified nomodifiable
      let b:wbx_render_tick = b:changedtick
      call wbx#images#render(bufnr('%'), get(b:, 'wbx_image_placements', []))
    endif
    call wbx#images#schedule()
  endif
endfunction
function! wbx#images#schedule() abort
  if s:timer < 0 | let s:timer = timer_start(30, function('s:visible')) | endif
endfunction
function! wbx#images#render(buffer, images) abort
  call setbufvar(a:buffer, 'wbx_image_placements', a:images)
  if has('nvim-0.10')
    call luaeval("require('wbx-tui.images').register(_A[1], _A[2])", [a:buffer, a:images])
  endif
  call wbx#images#schedule()
endfunction
function! wbx#images#status(buffer) abort
  return has('nvim-0.10') ? luaeval("require('wbx-tui.images').status(_A)", a:buffer)
        \ : {'mode': 'unicode', 'reason': 'editor-graphics-unavailable'}
endfunction
augroup wbx_image_visibility
  autocmd!
  autocmd BufWinEnter,CursorMoved,TextChanged,TextChangedI * if index(['history', 'image'], get(b:, 'wbx_kind', '')) >= 0 | call wbx#images#schedule() | endif
  autocmd ColorScheme * call wbx#images#schedule()
  if exists('##WinResized')
    autocmd WinResized * call wbx#images#schedule()
  endif
  if exists('##WinScrolled')
    autocmd WinScrolled * if index(['history', 'image'], get(b:, 'wbx_kind', '')) >= 0 | call wbx#images#schedule() | endif
  endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
