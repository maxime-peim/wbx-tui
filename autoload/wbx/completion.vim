" Composer-local completion policy. Never changes a user's global configuration.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:flags = {'completion': v:false, 'cmp_enabled': v:false, 'blink_cmp_enabled': v:false,
      \ 'minicompletion_disable': v:true, 'coc_suggest_disable': 1, 'copilot_enabled': 0, 'codeium_enabled': 0}
function! s:restore_native() abort
  if !get(b:wbx_completion_before,'strict',0) | return | endif
  for key in ['complete', 'omnifunc', 'completefunc']
    if empty(eval('&l:' . key)) | execute 'let &l:' . key . ' = b:wbx_completion_before[key]' | endif
  endfor
  let b:wbx_completion_before.strict = 0
endfunction
function! wbx#completion#sync() abort
  let owned = wbx#view#owned(bufnr('%'), 'compose') || wbx#conversations#is_direct(bufnr('%'))
        \ || &buftype ==# 'nofile' && !empty(get(b:, 'wbx_message_context', {}))
        \ && bufname('%') ==# 'wbx://edit/' . b:wbx_message_context.contextId
  " Manual native completion is user-invoked, not permission to automatically
  " activate LSP/AI providers. `user` explicitly releases our provider policy.
  let policy = get(b:,'wbx_completion_policy',get(get(g:,'wbx_tui',{}),'completion_policy','manual'))
  let suppress = owned && policy !=# 'user'
  if suppress
    if !exists('b:wbx_completion_before')
      let b:wbx_completion_before = {'strict':0,'flags': {}}
      for key in keys(s:flags)
        let b:wbx_completion_before.flags[key] = has_key(b:, key) ? [1, b:[key]] : [0]
      endfor
    endif
    if policy ==# 'off'
      if !b:wbx_completion_before.strict
        for key in ['complete', 'omnifunc', 'completefunc']
          let b:wbx_completion_before[key] = eval('&l:' . key)
        endfor
        let b:wbx_completion_before.strict = 1
      endif
      setlocal complete= omnifunc= completefunc=
    else
      call s:restore_native()
    endif
    for [key, value] in items(s:flags)
      if !has_key(b:, key) || b:[key] !=# value | let b:[key] = value | endif
    endfor
  elseif exists('b:wbx_completion_before')
    call s:restore_native()
    for [key, value] in items(s:flags)
      if !has_key(b:, key) || b:[key] !=# value | continue | endif
      let old = b:wbx_completion_before.flags[key]
      if old[0] | let b:[key] = old[1] | else | call remove(b:, key) | endif
    endfor
    unlet b:wbx_completion_before
  else
    return
  endif
  if has('nvim') | call luaeval("require('wbx-tui').completion(_A)", suppress ? v:true : v:false) | endif
endfunction
augroup wbx_native_completion
  autocmd!
  autocmd FileType,BufEnter * if exists('b:wbx_completion_before') || get(b:, 'wbx_kind', '') ==# 'compose' | call wbx#completion#sync() | endif
  autocmd OptionSet buftype if exists('b:wbx_completion_before') | call wbx#completion#sync() | endif
  autocmd BufFilePost * if exists('b:wbx_completion_before') | call wbx#completion#sync() | endif
  if exists('##LspAttach')
    autocmd LspAttach * if exists('b:wbx_completion_before') | call wbx#completion#sync() | endif
  endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
