" Contract fixture only; no external fzf executable, shell or network.
function! fzf#wrap(options) abort
  let g:wbx_fixture_fzf_options = a:options
  return a:options
endfunction
function! fzf#run(options) abort
  let g:wbx_fixture_fzf_calls = get(g:, 'wbx_fixture_fzf_calls', 0) + 1
  if get(g:, 'wbx_fixture_fzf_fail', 0)
    throw 'synthetic-fzf-error-canary'
  endif
  call call(a:options.sink, [a:options.source[1]])
endfunction
