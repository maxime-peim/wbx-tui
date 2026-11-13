" Explicit views over the existing recovery records; never another draft owner.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! s:notice(text) abort
  echomsg '[wbx-tui] ' . a:text
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Discard text", 1) == 2
endfunction
function! wbx#saved_drafts#show() abort
  let index = wbx#draft_persistence#inventory()
  if !empty(index.reason) | call s:notice(index.reason) | return | endif
  let lines = ['Verified recovery drafts · private plaintext · account-scoped local snapshot',
        \ 'Enter exports inert text · r refresh local index · q return · / native search',
        \ ':WebexDraftRestore needs an already selected ready space/root; never loads history',
        \ ':WebexDraftDiscard discards saved text only; unresolved delivery remains guarded', '']
  let rows = repeat([''], len(lines))
  for item in index.items
    call add(lines, item.roomId . (empty(item.parentId) ? ' · normal' : ' · reply ' . item.parentId)
          \ . ' · ' . item.format . ' · ' . item.bytes . 'B · ' . item.storage . (item.uncertain ? ' · DELIVERY UNRESOLVED' : ''))
    call add(rows, item.key)
  endfor
  if empty(index.items) | call add(lines, '[No verified saved/queued normal or reply drafts]') | call add(rows, '') | endif
  if wbx#lists#show('saved-drafts', lines, rows) <= 0 | return | endif
  " Only non-text snapshot metadata lives in the view, never a parallel registry.
  let b:wbx_saved_index = index
endfunction
function! s:selected() abort
  if !wbx#lists#clean(bufnr('%'), 'saved-drafts') | return {} | endif
  let previous = get(b:, 'wbx_saved_index', {})
  let current = wbx#draft_persistence#inventory()
  if !empty(current.reason) || get(previous, 'session', '') !=# current.session
        \ || get(previous, 'profile', '') !=# current.profile | return {} | endif
  let key = wbx#lists#selected_id()
  let rows = filter(copy(get(previous, 'items', [])), 'v:val.key ==# key')
  if empty(rows) | return {} | endif
  let item = wbx#draft_persistence#record(key, rows[0].fingerprint)
  return empty(item) ? {} : {'key': key, 'fingerprint': rows[0].fingerprint, 'item': item}
endfunction
function! wbx#saved_drafts#restore() abort
  let selected = s:selected()
  if empty(selected) | call s:notice('Choose an unchanged current-account recovery row; refresh the local index explicitly.') | return | endif
  call wbx#draft_persistence#restore(selected.key, selected.fingerprint)
endfunction
function! wbx#saved_drafts#current() abort
  return !empty(s:selected())
endfunction
function! wbx#saved_drafts#restore_reason() abort
  let selected = s:selected()
  return empty(selected) ? 'Choose an unchanged verified recovery-index row'
        \ : wbx#draft_persistence#restore_reason(selected.key, selected.fingerprint)
endfunction
function! wbx#saved_drafts#export() abort
  let selected = s:selected()
  if empty(selected) | call s:notice('Choose an unchanged current-account recovery row; nothing exported.') | return | endif
  let origin = wbx#view#intent()
  let name = 'wbx://draft-export/' . sha256(selected.key . selected.fingerprint)
  if bufnr(name) > 0 | call s:notice('An earlier native export is retained; inspect it explicitly. Nothing overwritten.') | return | endif
  if !wbx#view#intent_valid(origin) | return | endif
  botright new
  execute 'file ' . fnameescape(name)
  setlocal buftype= bufhidden=hide noswapfile noundofile nomodeline
  call setline(1, split(selected.item.text, "\n", 1))
  " Ordinary editable text: no destination, file handle, consent or Send mapping.
  call s:notice('Inert native text copy only. Save/export to a chosen file explicitly; no send authority or files restored.')
endfunction
function! wbx#saved_drafts#discard() abort
  let selected = s:selected()
  if empty(selected) | call s:notice('Choose an unchanged current-account recovery row; nothing discarded.') | return | endif
  let origin = wbx#view#intent()
  if !s:confirm('Discard saved TEXT for ' . selected.item.roomId . ' / ' . get(selected.item, 'parentId', 'normal')
        \ . '? No native buffer is cleared. Delivery uncertainty is NOT resolved.') | return | endif
  let current = s:selected()
  if !wbx#view#intent_valid(origin) || current !=# selected | return | endif
  if wbx#draft_persistence#discard(selected.key, selected.fingerprint) | call wbx#saved_drafts#show() | endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
