" Delegate choices to the editor/user's UI provider; do not paint our own menu.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:next = 0
let s:pending = {}
let s:popup = 0
function! wbx#chooser#select(lines, Callback) abort
  " Only the newest menu owns a choice. Late/duplicate callbacks are inert.
  let s:pending = {}
  if s:popup
    call popup_close(s:popup)
    let s:popup = 0
  endif
  if len(a:lines) < 2 | return | endif
  let s:next += 1
  let id = s:next
  let items = map(copy(a:lines[1:]), 'substitute(v:val, "^[0-9]\\+\\. ", "", "")')
  let s:pending[string(id)] = {'Callback': a:Callback, 'count': len(items), 'origin': wbx#view#intent()}
  if has('nvim')
    try
      call luaeval("require('wbx-tui').choose(_A)", {'id': id, 'prompt': a:lines[0], 'items': items})
    catch
      call wbx#chooser#done(id, 0)
      echohl WarningMsg | echomsg '[wbx-tui] Native UI picker unavailable; no choice was made.' | echohl None
    endtry
  elseif exists('*popup_menu')
    let s:popup = popup_menu(items, {'title': ' ' . a:lines[0] . ' ', 'callback': function('s:picked', [id])})
  else
    call wbx#chooser#done(id, inputlist(a:lines))
  endif
endfunction
function! s:picked(id, window, choice) abort
  if s:popup == a:window | let s:popup = 0 | endif
  call wbx#chooser#done(a:id, a:choice)
endfunction
function! wbx#chooser#done(id, choice) abort
  let key = string(a:id)
  if !has_key(s:pending, key) | return | endif
  let pending = remove(s:pending, key)
  let choice = type(a:choice) == v:t_number && a:choice > 0 && a:choice <= pending.count
        \ && wbx#view#picker_valid(pending.origin) ? a:choice : 0
  call call(pending.Callback, [choice])
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
