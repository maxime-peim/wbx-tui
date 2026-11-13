" Loaded-space choices and provider handoff only. Selection owns requests/focus; view owns native intent.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#space_picker#new(ports) abort
  return {'ports':a:ports, 'serial':0}
endfunction
function! wbx#space_picker#context(owner) abort
  let a:owner.serial += 1
  let rooms = deepcopy(get(call(a:owner.ports.State, []), 'rooms', []))
  for room in rooms
    let room.label = room.title . ' · ' . get(room, 'type', 'unknown')
          \ . (empty(get(room, 'teamId', '')) ? '' : ' · Team space')
          \ . (get(room, 'cached', 0) ? ' · cached/browse-only' : '')
  endfor
  let counts = {} | let seen = {}
  for room in rooms | let counts[room.label] = get(counts, room.label, 0) + 1 | endfor
  for room in rooms
    let label = room.label
    if counts[label] > 1
      let seen[label] = get(seen, label, 0) + 1
      let room.label .= ' · choice ' . seen[label] . '/' . counts[label]
    endif
  endfor
  return {'serial':a:owner.serial, 'origin':wbx#view#intent(), 'rooms':rooms}
endfunction
function! wbx#space_picker#select(owner, context, id) abort
  if get(a:context, 'serial', -1) != a:owner.serial || !wbx#view#picker_valid(get(a:context, 'origin', {}))
        \ || call(a:owner.ports.Disconnected, []) || get(call(a:owner.ports.State, []), 'state', '') !=# 'ready' | return | endif
  let a:owner.serial += 1
  if empty(filter(copy(get(a:context, 'rooms', [])), 'v:val.id ==# a:id'))
        \ || empty(filter(copy(get(call(a:owner.ports.State, []), 'rooms', [])), 'v:val.id ==# a:id')) | return | endif
  " Interactive open is distinct from the focus-neutral public selection API.
  " Neither this choice nor its later focus handoff consents to a read receipt.
  call call(a:owner.ports.Select, [a:id, 1, 0])
endfunction
function! wbx#space_picker#cancel(owner, context) abort
  if get(a:context, 'serial', -1) == a:owner.serial | let a:owner.serial += 1 | endif
endfunction
function! wbx#space_picker#open(owner) abort
  if has('nvim') && luaeval("pcall(require, 'wbx-tui')")
    call luaeval("require('wbx-tui').pick_space()")
    return
  endif
  let context = wbx#space_picker#context(a:owner)
  let rooms = context.rooms
  if get(call(a:owner.ports.Options, []), 'picker', 'auto') !=# 'builtin' && (exists('*fzf#run') || !empty(globpath(&runtimepath, 'autoload/fzf.vim')))
    try
      call fzf#run(fzf#wrap({'source':map(copy(rooms), 'printf("%06d  %s", v:key + 1, v:val.label)'), 'sink':function('s:fzf_space', [a:owner, context]), 'down':'40%'}))
      return
    catch
      call call(a:owner.ports.Notify, ['Optional fzf picker failed; using the native picker.'])
      let context = wbx#space_picker#context(a:owner) | let rooms = context.rooms
    endtry
  endif
  call wbx#chooser#select(['Open loaded space (no receipt); :WebexSpaces then / for native search:']
        \ + map(copy(rooms), 'printf("%d. %s", v:key + 1, v:val.label)'), function('s:space_picked', [a:owner, context]))
endfunction
function! s:space_picked(owner, context, choice) abort
  if a:choice > 0 && a:choice <= len(a:context.rooms)
    call wbx#space_picker#select(a:owner, a:context, a:context.rooms[a:choice - 1].id)
  else
    call wbx#space_picker#cancel(a:owner, a:context)
  endif
endfunction
function! s:fzf_space(owner, context, line) abort
  let index = str2nr(matchstr(a:line, '^\d\+')) - 1
  if index >= 0 && index < len(a:context.rooms)
    call timer_start(0, function('s:picked_space', [a:owner, a:context, a:context.rooms[index].id]))
  endif
endfunction
function! s:picked_space(owner, context, id, timer) abort
  call wbx#space_picker#select(a:owner, a:context, a:id)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
