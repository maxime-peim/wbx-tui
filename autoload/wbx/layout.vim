" Owned window-local geometry; never change equalalways or foreign options.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:busy = 0
let s:resizing = 0
let s:timer = -1
function! s:signature(tab) abort
  return map(filter(getwininfo(), 'v:val.tabnr == a:tab'), 'v:val.winid')
endfunction
function! wbx#layout#begin() abort
  let s:busy += 1
endfunction
function! wbx#layout#end() abort
  let s:busy = max([0, s:busy - 1])
endfunction
function! wbx#layout#enter(kind) abort
  if exists('w:wbx_geometry') && (!wbx#view#owned(bufnr('%'), a:kind) || w:wbx_geometry.kind !=# a:kind)
    call wbx#layout#leave()
  endif
  if !exists('w:wbx_geometry') && wbx#view#owned(bufnr('%'), a:kind) && index(['rooms', 'compose'], a:kind) >= 0
        \ && (a:kind ==# 'rooms' ? &l:winfixwidth : &l:winfixheight)
    " :split copies fixed-size options but not their ownership variables.
    " Recover the original baseline so later foreign buffers do not inherit it.
    for info in getwininfo()
      if info.winid == win_getid() || info.bufnr != bufnr('%') | continue | endif
      let source = wbx#view#window_var(info.winid, 'wbx_geometry', {})
      if !empty(source) && source.kind ==# a:kind
        let actual = a:kind ==# 'rooms' ? winwidth(0) : winheight(0)
        let w:wbx_geometry = {'kind': a:kind, 'preferred': actual, 'fixed': source.fixed, 'observed': actual, 'screen': [&columns, &lines], 'layout': s:signature(tabpagenr())}
        break
      endif
    endfor
  endif
endfunction
function! wbx#layout#leave() abort
  if !exists('w:wbx_geometry') | return | endif
  let geometry = w:wbx_geometry
  if geometry.kind ==# 'rooms' && &l:winfixwidth
    let &l:winfixwidth = geometry.fixed
  elseif geometry.kind ==# 'compose' && &l:winfixheight
    let &l:winfixheight = geometry.fixed
  endif
  unlet w:wbx_geometry
endfunction
function! wbx#layout#register(kind, preferred) abort
  if !wbx#view#owned(bufnr('%'), a:kind) || index(['rooms', 'compose'], a:kind) < 0
    return
  endif
  if !exists('w:wbx_geometry')
    let w:wbx_geometry = {'kind': a:kind, 'preferred': a:preferred,
          \ 'fixed': a:kind ==# 'rooms' ? &l:winfixwidth : &l:winfixheight,
          \ 'observed': a:kind ==# 'rooms' ? winwidth(0) : winheight(0), 'screen': [&columns, &lines], 'layout': s:signature(tabpagenr())}
  endif
  if a:kind ==# 'rooms'
    setlocal winfixwidth
  else
    setlocal winfixheight
  endif
endfunction
function! wbx#layout#observe() abort
  if s:busy || s:resizing | return | endif
  for info in getwininfo()
    let geometry = wbx#view#window_var(info.winid, 'wbx_geometry', {})
    if empty(geometry) || !wbx#view#owned(info.bufnr, geometry.kind) | continue | endif
    let actual = geometry.kind ==# 'rooms' ? info.width : info.height
    let layout = s:signature(info.tabnr)
    if geometry.screen ==# [&columns, &lines] && get(geometry, 'layout', []) ==# layout && actual != geometry.observed
      " A native drag/:resize at a stable terminal size becomes the preference.
      let geometry.preferred = actual
    endif
    let geometry.observed = actual
    let geometry.screen = [&columns, &lines]
    let geometry.layout = layout
    call settabwinvar(info.tabnr, info.winid, 'wbx_geometry', geometry)
  endfor
endfunction
function! wbx#layout#resized() abort
  let s:resizing = 1
  if s:timer >= 0 | call timer_stop(s:timer) | endif
  " Runs after all VimResized handlers, including LazyVim's tabdo wincmd =.
  let s:timer = timer_start(0, function('s:restore'))
endfunction
function! s:restore(timer, ...) abort
  if a:timer >= 0 && a:timer == s:timer | let s:timer = -1 | endif
  let s:busy += 1
  try
    for info in getwininfo()
      if a:0 && info.tabnr != a:1 | continue | endif
      let geometry = wbx#view#window_var(info.winid, 'wbx_geometry', {})
      if empty(geometry) || !wbx#view#owned(info.bufnr, geometry.kind) | continue | endif
      let foreign = filter(getwininfo(), 'v:val.tabnr == info.tabnr && !wbx#view#owned(v:val.bufnr, getbufvar(v:val.bufnr, "wbx_kind", ""))')
      " Changing a shared split boundary would resize foreign work. In mixed
      " tabs rely only on the native owned winfix flags, never corrective moves.
      if !empty(foreign) | continue | endif
      let preferred = geometry.kind ==# 'rooms' ? max([1, min([geometry.preferred, &columns - 20])]) : max([1, min([geometry.preferred, &lines - 8])])
      call win_execute(info.winid, (geometry.kind ==# 'rooms' ? 'vertical ' : '') . 'resize ' . preferred)
      let current = getwininfo(info.winid)[0]
      let geometry.observed = geometry.kind ==# 'rooms' ? current.width : current.height
      let geometry.screen = [&columns, &lines]
      let geometry.layout = s:signature(info.tabnr)
      call settabwinvar(info.tabnr, info.winid, 'wbx_geometry', geometry)
    endfor
  finally
    let s:busy -= 1
    let s:resizing = s:timer >= 0
  endtry
endfunction
function! wbx#layout#restore() abort
  call s:restore(-1, tabpagenr())
endfunction
function! wbx#layout#reset(width, height) abort
  let s:busy += 1
  try
    for info in getwininfo()
      if info.tabnr != tabpagenr() | continue | endif
      let kind = getbufvar(info.bufnr, 'wbx_kind', '')
      if !wbx#view#owned(info.bufnr, kind) || index(['rooms', 'compose'], kind) < 0 | continue | endif
      call win_execute(info.winid, 'call wbx#layout#register(' . string(kind) . ', ' . (kind ==# 'rooms' ? a:width : a:height) . ')')
      let geometry = wbx#view#window_var(info.winid, 'wbx_geometry', {})
      let geometry.preferred = kind ==# 'rooms' ? a:width : a:height
      call settabwinvar(info.tabnr, info.winid, 'wbx_geometry', geometry)
    endfor
    call s:restore(-1, tabpagenr())
  finally
    let s:busy -= 1
  endtry
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
