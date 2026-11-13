" One room-selection intent/focus lifetime; no receipt, delivery or transport owner.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#selection#new(ports) abort
  return {'ports':a:ports, 'serial':0, 'focus':{}}
endfunction
function! wbx#selection#cancel(owner) abort
  let a:owner.focus = {}
endfunction
function! wbx#selection#leaving(owner) abort
  " Leaving and returning before a response still cancels its focus request.
  " Background win_execute() can switch a different composer buffer without
  " moving the user's origin window; that is not a navigation cancellation.
  if !empty(a:owner.focus) && win_getid() == a:owner.focus.window && bufnr('%') == a:owner.focus.buffer
    call wbx#selection#cancel(a:owner)
  endif
endfunction
function! s:selected(owner, request, message) abort
  if a:owner.focus !=# a:request
    return
  endif
  call wbx#selection#cancel(a:owner)
  if has_key(a:message, 'error') || win_getid() != a:request.window || bufnr('%') != a:request.buffer
    return
  endif
  if a:request.rooms && (!wbx#view#owned(bufnr('%'), 'rooms') || wbx#view#edited(bufnr('%')))
    return
  endif
  let context = call(a:owner.ports.Context, [])
  if get(context, 'session', '') !=# a:request.session || type(context.selected) != v:t_string || context.selected !=# a:request.id || context.disconnected
        \ || !context.ready || context.loading && !get(a:request, 'resume', 0)
        \ || empty(filter(copy(context.rooms), 'v:val.id ==# a:request.id'))
    return
  endif
  call call(a:owner.ports.Open, [a:request])
endfunction
function! wbx#selection#select(owner, id, intent) abort
  let context = call(a:owner.ports.Context, [])
  if !empty(filter(copy(context.rooms), 'v:val.id ==# a:id && get(v:val, "cached", 0)'))
    call call(a:owner.ports.Notify, ['Cached spaces are browse-only until refreshed. Nothing was opened or acknowledged.'])
    return -1
  endif
  let reload = a:intent.reload
  let same = !reload && !context.disconnected && type(context.selected) == v:t_string && context.selected ==# a:id
  " A duplicate open cannot cancel the in-flight history request/focus intent.
  if same && context.loading && !context.ready | return 0 | endif
  let resume = same && context.ready
  if !same | call call(a:owner.ports.Attachments, [1]) | endif
  " Programmatic selection remains focus-neutral unless explicitly requested.
  let a:owner.serial += 1
  call wbx#selection#cancel(a:owner)
  if a:intent.focus
    let request = {'id': a:id, 'window': win_getid(), 'buffer': bufnr('%'),
          \ 'rooms': wbx#view#owned(bufnr('%'), 'rooms'), 'serial': a:owner.serial}
    let request.session = get(context, 'session', '')
    let request.allow_read = a:intent.allow_read
    if resume | let request.resume = 1 | let request.allow_read = 0 | endif
    let listed = filter(copy(context.rooms), 'v:val.id ==# a:id')
    let request.unread = !empty(listed) && get(listed[0], 'unread', v:null) is v:true
    let a:owner.focus = request
    if resume
      call s:selected(a:owner, request, {'result': v:null})
      return 0
    endif
    let params = {'roomId': a:id}
    if reload && call(a:owner.ports.Context, []).reload | let params.reload = v:true | endif
    let id = call(a:owner.ports.Request, [params, function('s:selected', [a:owner, request])])
    if id < 0
      call wbx#selection#cancel(a:owner)
    endif
    return id
  endif
  if resume | return 0 | endif
  call call(a:owner.ports.Attachments, [0])
  let params = {'roomId': a:id}
  if reload && call(a:owner.ports.Context, []).reload | let params.reload = v:true | endif
  return call(a:owner.ports.Request, [params])
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
