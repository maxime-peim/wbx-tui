" Immutable, memory-only normalized PNG pieces. Never original attachment bytes.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:records = {}
let s:committed = ''
function! wbx#snapshots#begin(value) abort
  for key in keys(s:records)
    if key !=# s:committed | call wbx#snapshots#drop(key) | endif
  endfor
  let s:serial += 1
  let key = 'png-' . s:serial
  let s:records[key] = {'value': deepcopy(a:value), 'parts': [], 'count': 0, 'verified': 0, 'buffer': -1}
  if has('nvim-0.10') | call luaeval("require('wbx-tui.images').snapshot_begin(_A)", key) | endif
  return key
endfunction
function! wbx#snapshots#append(key, data) abort
  if !has_key(s:records, a:key) || s:records[a:key].verified | throw 'PNG snapshot owner lost.' | endif
  let record = s:records[a:key]
  if record.count >= record.value.body.payload.chunks || strlen(a:data) > 65536 | throw 'PNG snapshot exceeds its bounds.' | endif
  if has('nvim-0.10')
    call luaeval("require('wbx-tui.images').snapshot_append(_A[1], _A[2])", [a:key, a:data])
  else
    call add(record.parts, a:data)
  endif
  let record.count += 1
endfunction
function! wbx#snapshots#verify(key) abort
  if !has_key(s:records, a:key) || s:records[a:key].count != s:records[a:key].value.body.payload.chunks | throw 'Incomplete PNG snapshot.' | endif
  let s:records[a:key].verified = 1
  if has('nvim-0.10') | call luaeval("require('wbx-tui.images').snapshot_verify(_A)", a:key) | endif
endfunction
function! wbx#snapshots#value(key) abort
  return has_key(s:records, a:key) && s:records[a:key].verified ? deepcopy(s:records[a:key].value) : {}
endfunction
function! wbx#snapshots#piece(key, seq) abort
  if empty(wbx#snapshots#value(a:key)) | throw 'PNG snapshot is unavailable.' | endif
  return has('nvim-0.10') ? luaeval("require('wbx-tui.images').snapshot_piece(_A[1], _A[2])", [a:key, a:seq])
        \ : s:records[a:key].parts[a:seq]
endfunction
function! wbx#snapshots#bind(key, buffer) abort
  if empty(wbx#snapshots#value(a:key)) | throw 'PNG snapshot is unverified.' | endif
  let old = s:committed
  let s:committed = a:key
  let s:records[a:key].buffer = a:buffer
  if !empty(old) && old !=# a:key | call wbx#snapshots#drop(old) | endif
endfunction
function! wbx#snapshots#drop(key) abort
  if has_key(s:records, a:key) | call remove(s:records, a:key) | endif
  if s:committed ==# a:key | let s:committed = '' | endif
  if has('nvim-0.10') | call luaeval("require('wbx-tui.images').snapshot_drop(_A)", a:key) | endif
endfunction
function! wbx#snapshots#closed(buffer, renamed) abort
  for key in keys(s:records)
    if s:records[key].buffer == a:buffer && (!a:renamed || !wbx#view#owned(a:buffer, 'image'))
      call wbx#snapshots#drop(key)
    endif
  endfor
endfunction
augroup wbx_snapshot_lifecycle
  autocmd!
  autocmd BufWipeout,BufUnload * call wbx#snapshots#closed(str2nr(expand('<abuf>')), 0)
  autocmd BufFilePost * call wbx#snapshots#closed(str2nr(expand('<abuf>')), 1)
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
