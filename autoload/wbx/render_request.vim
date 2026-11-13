" One coalesced presentation request. Never retains/replays ACKs, sends or application snapshots.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#render_request#new(ports) abort
  return {'ports':a:ports, 'timer':-1, 'work':{}}
endfunction
function! wbx#render_request#cancel(owner) abort
  if a:owner.timer >= 0 | call timer_stop(a:owner.timer) | endif
  let a:owner.timer = -1
  let a:owner.work = {}
endfunction
function! s:current(owner, work) abort
  return a:owner.work is a:work && a:work.context ==# call(a:owner.ports.Context, [])
endfunction
function! s:attempt(owner, work) abort
  if !s:current(a:owner,a:work)
    if a:owner.work is a:work | call wbx#render_request#cancel(a:owner) | endif
    return
  endif
  try
    " Render reads CURRENT application state; no pre-lock projection is replayed.
    call call(a:owner.ports.Render, [])
  catch /^Vim\%(([^)]*)\)\=:E565:/
    if !s:current(a:owner,a:work) | return | endif
    call call(a:owner.ports.Interrupted, [])
    if !s:current(a:owner,a:work) | return | endif
    if a:work.remaining > 0
      let a:work.remaining -= 1
      let a:owner.timer = timer_start(10, function('s:retry', [a:owner, a:work]))
    else
      call wbx#render_request#cancel(a:owner)
      call call(a:owner.ports.Notify, ['Delivery/state retained; presentation is still locked. Redraw explicitly after leaving the editor callback; no send was retried.'])
    endif
    return
  finally
    " Unrelated exceptions propagate, but cannot strand a retry reservation.
    if a:owner.work is a:work && a:owner.timer < 0 | let a:owner.work = {} | endif
  endtry
endfunction
function! s:retry(owner, work, timer) abort
  if a:timer != a:owner.timer || a:owner.work isnot a:work | return | endif
  let a:owner.timer = -1
  call s:attempt(a:owner,a:work)
endfunction
function! wbx#render_request#render(owner) abort
  let context = call(a:owner.ports.Context, [])
  if a:owner.timer >= 0 && a:owner.work.context ==# context | return | endif
  call wbx#render_request#cancel(a:owner)
  let work = {'context':context, 'remaining':3}
  let a:owner.work = work
  call s:attempt(a:owner,work)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
