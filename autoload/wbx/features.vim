" Closed handshake catalogue; never dispatches or authorizes a provider action.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:catalogue = json_decode(join(readfile(fnamemodify(expand('<sfile>:p'), ':h:h:h') . '/src/editor-features.json'), "\n"))
function! wbx#features#empty() abort
  let out = {'capabilities': []}
  for field in keys(s:catalogue.features) | let out[field] = [] | endfor
  return out
endfunction
function! wbx#features#copy(value) abort
  let out = wbx#features#empty()
  for field in keys(out) | let out[field] = copy(get(a:value, field, [])) | endfor
  return out
endfunction
function! wbx#features#reset(value, boundary) abort
  if !has_key(s:catalogue.lifecycle, a:boundary) | throw 'Unknown feature lifecycle boundary' | endif
  return s:catalogue.lifecycle[a:boundary] ==# 'clear' ? wbx#features#empty() : deepcopy(a:value)
endfunction
function! wbx#features#valid(value) abort
  if type(a:value) != v:t_dict | return 0 | endif
  let caps = get(a:value, 'capabilities', [])
  if type(caps) != v:t_list || len(caps) > s:catalogue.capabilityLimit | return 0 | endif
  for cap in caps
    " Unknown well-formed capability strings remain inert/forward compatible.
    if type(cap) != v:t_string || strlen(cap) > 80 || cap !~# '^[a-z][a-z0-9-]*$' | return 0 | endif
    for required in get(s:catalogue.capabilityDependencies, cap, [])
      if index(caps, required) < 0 | return 0 | endif
    endfor
  endfor
  for [field, variants] in items(s:catalogue.features)
    let values = get(a:value, field, [])
    if type(values) != v:t_list || len(values) > len(variants) | return 0 | endif
    let seen = {}
    for value in values
      if type(value) != v:t_string || !has_key(variants, value) || has_key(seen, value) | return 0 | endif
      let seen[value] = 1
      let rule = variants[value]
      for cap in rule.capabilities
        if index(caps, cap) < 0 | return 0 | endif
      endfor
      for [dependency, expected] in items(get(rule, 'features', {}))
        if get(a:value, dependency, []) !=# expected | return 0 | endif
      endfor
    endfor
  endfor
  return 1
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
