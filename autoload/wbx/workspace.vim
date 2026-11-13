" Native window/buffer lifetime only; rendering, action authority and draft text have other owners.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#workspace#new(ports) abort
  return {'ports':a:ports, 'buffers':{'rooms':0,'history':0,'meeting':0}, 'renames':{}}
endfunction
function! wbx#workspace#id(owner, kind) abort
  return a:owner.buffers[a:kind]
endfunction
function! wbx#workspace#buffers(owner) abort
  return copy(a:owner.buffers)
endfunction
function! s:initialize(buffer, kind, room) abort
  call setbufvar(a:buffer, '&buftype', 'nofile')
  call setbufvar(a:buffer, '&bufhidden', 'hide')
  call setbufvar(a:buffer, '&swapfile', 0)
  call setbufvar(a:buffer, '&undofile', 0)
  call setbufvar(a:buffer, '&modeline', 0)
  call bufload(a:buffer)
  if a:kind ==# 'compose'
    call setbufvar(a:buffer, 'wbx_room', a:room)
  endif
  call setbufvar(a:buffer, 'wbx_kind', a:kind)
  if a:kind !=# 'compose' && getbufvar(a:buffer, 'wbx_render_tick', -1) < 0
    call setbufvar(a:buffer, 'wbx_render_tick', getbufvar(a:buffer, 'changedtick'))
  endif
  return a:buffer
endfunction
function! wbx#workspace#buffer(name, kind, ...) abort
  let known = map(getbufinfo(), 'v:val.bufnr')
  let buffer = bufadd(a:name)
  if index(known, buffer) >= 0 && !wbx#view#owned(buffer, a:kind)
    throw 'Webex buffer name is occupied by other work. Rename or close that buffer explicitly before reopening Webex.'
  endif
  return s:initialize(buffer, a:kind, a:0 ? a:1 : '')
endfunction
function! wbx#workspace#ensure(owner, kind) abort
  if !wbx#view#owned(a:owner.buffers[a:kind], a:kind)
    let names = {'rooms':'wbx://spaces','history':'wbx://history','meeting':'wbx://meeting-status'}
    let a:owner.buffers[a:kind] = wbx#workspace#buffer(names[a:kind], a:kind)
  endif
  return a:owner.buffers[a:kind]
endfunction
function! wbx#workspace#rename_pre(owner) abort
  if wbx#view#owned(bufnr('%'), get(b:, 'wbx_kind', ''))
    let a:owner.renames[bufnr('%')] = {'name': bufname('%'), 'kind': b:wbx_kind,
          \ 'room': get(b:, 'wbx_room', ''), 'parent': get(b:, 'wbx_parent', ''), 'known': map(getbufinfo(), 'v:val.bufnr')}
  endif
endfunction
function! wbx#workspace#rename_post(owner) abort
  if has_key(a:owner.renames, bufnr('%'))
    let previous = remove(a:owner.renames, bufnr('%'))
    if bufname('%') !=# previous.name
      " Reclaim only the empty alternate-name entry made by this owned rename.
      for info in getbufinfo()
        if info.name ==# previous.name && index(previous.known, info.bufnr) < 0
              \ && !info.loaded && !info.listed && !info.changed && empty(info.windows)
              \ && getbufvar(info.bufnr, '&buftype') ==# ''
              \ && empty(filter(keys(info.variables), 'v:val !=# "changedtick"'))
          call s:initialize(info.bufnr, previous.kind, previous.room)
          if previous.kind ==# 'compose'
            call setbufvar(info.bufnr, 'wbx_parent', previous.parent)
          endif
        endif
      endfor
    endif
  endif
  call call(a:owner.ports.Setup,[])
endfunction
function! wbx#workspace#window_leave() abort
  if exists('w:wbx_saved_statusline')
    if &l:statusline ==# '%!wbx#statusline()'
      let &l:statusline = w:wbx_saved_statusline
    endif
    unlet w:wbx_saved_statusline
  endif
endfunction
function! wbx#workspace#window_enter(owner) abort
  call wbx#layout#enter(get(b:, 'wbx_kind', ''))
  if !wbx#view#owned(bufnr('%'), get(b:, 'wbx_kind', '')) || !call(a:owner.ports.Statusline,[])
    call wbx#workspace#window_leave()
    return
  endif
  if !exists('w:wbx_saved_statusline')
    let previous = &l:statusline
    if previous ==# '%!wbx#statusline()'
      " Native splits copy options, not the originating window's baseline.
      let previous = &g:statusline
      for window in getwininfo()
        if window.tabnr == tabpagenr() && window.winid != win_getid() && window.bufnr == bufnr('%')
          let saved = getwinvar(window.winid, 'wbx_saved_statusline', v:null)
          if type(saved) == v:t_string
            let previous = saved
            break
          endif
        endif
      endfor
    endif
    let w:wbx_saved_statusline = previous
  endif
  let &l:statusline = '%!wbx#statusline()'
endfunction
function! s:window(buffer) abort
  for window in getwininfo()
    if window.tabnr == tabpagenr() && window.bufnr == a:buffer
      return window.winid
    endif
  endfor
  return -1
endfunction
function! wbx#workspace#show(buffer) abort
  if bufnr('%') == a:buffer
    return
  endif
  let window = s:window(a:buffer)
  if window == -1
    let windows = win_findbuf(a:buffer)
    let window = empty(windows) ? -1 : windows[0]
  endif
  if window == -1 || !win_gotoid(window)
    execute 'sbuffer ' . a:buffer
  endif
endfunction
function! wbx#workspace#composer_window() abort
  for window in getwininfo()
    if window.tabnr == tabpagenr() && wbx#view#owned(window.bufnr, 'compose')
      return window.winid
    endif
  endfor
  return -1
endfunction
function! s:dimension(owner, kind) abort
  let sizes = call(a:owner.ports.Geometry,[])
  return a:kind ==# 'rooms' ? max([15,min([80,sizes.rooms])]) : max([3,min([30,sizes.compose])])
endfunction
function! wbx#workspace#open(owner) abort
  let origin = win_getid()
  call wbx#layout#begin()
  try
    let workspace = 0
    for tab in range(1, tabpagenr('$'))
      if gettabvar(tab, 'wbx_workspace', 0)
        execute 'tabnext ' . tab
        let workspace = 1
        break
      endif
    endfor
    call wbx#workspace#ensure(a:owner,'rooms')
    call wbx#workspace#ensure(a:owner,'history')
    if workspace
      if s:window(a:owner.buffers.rooms) == -1
        execute 'topleft vertical sbuffer ' . a:owner.buffers.rooms
        execute 'vertical resize ' . s:dimension(a:owner,'rooms')
        call wbx#layout#register('rooms',s:dimension(a:owner,'rooms'))
      endif
      if s:window(a:owner.buffers.history) == -1
        let composer = wbx#workspace#composer_window()
        if composer != -1
          call win_gotoid(composer)
          execute 'aboveleft sbuffer ' . a:owner.buffers.history
        else
          execute 'botright vertical sbuffer ' . a:owner.buffers.history
        endif
      endif
      if wbx#workspace#composer_window() == -1
        call win_gotoid(s:window(a:owner.buffers.history))
        execute 'belowright sbuffer ' . call(a:owner.ports.Draft,[0])
        execute 'resize ' . s:dimension(a:owner,'compose')
        call wbx#layout#register('compose',s:dimension(a:owner,'compose'))
      endif
      call wbx#layout#restore()
      call call(a:owner.ports.Render,[])
      if !empty(getwininfo(origin)) && getwininfo(origin)[0].tabnr == tabpagenr()
        call win_gotoid(origin)
      else
        call win_gotoid(s:window(a:owner.buffers.rooms))
      endif
      return
    endif
    execute 'tab sbuffer ' . a:owner.buffers.rooms
    let t:wbx_workspace = 1
    call call(a:owner.ports.Setup,[])
    let roomswin = win_getid()
    execute 'rightbelow vsplit'
    execute 'buffer ' . a:owner.buffers.history
    call call(a:owner.ports.Setup,[])
    execute 'belowright split'
    let blank = call(a:owner.ports.Draft,[1])
    execute 'buffer ' . blank
    call call(a:owner.ports.Setup,[])
    execute 'resize ' . s:dimension(a:owner,'compose')
    call wbx#layout#register('compose',s:dimension(a:owner,'compose'))
    call win_gotoid(roomswin)
    execute 'vertical resize ' . s:dimension(a:owner,'rooms')
    call wbx#layout#register('rooms',s:dimension(a:owner,'rooms'))
    call call(a:owner.ports.Render,[])
  finally
    call wbx#layout#end()
  endtry
endfunction
function! wbx#workspace#reset_geometry(owner) abort
  call wbx#layout#reset(s:dimension(a:owner,'rooms'),s:dimension(a:owner,'compose'))
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
