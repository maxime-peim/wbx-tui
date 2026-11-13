function! WbxTestPresence(buffer) abort
  if has('nvim')
    return sort(map(items(getbufvar(a:buffer, 'wbx_presence_gutter', {})),
          \ '{"lnum":str2nr(v:val[0]),"text":trim(v:val[1].cue),"group":v:val[1].group}'),
          \ {left,right -> left.lnum - right.lnum})
  endif
  return map(sign_getplaced(a:buffer, {'group': 'wbx-presence'})[0].signs,
        \ '{"lnum":v:val.lnum,"text":trim(sign_getdefined(v:val.name)[0].text),"group":sign_getdefined(v:val.name)[0].texthl}')
endfunction
function! WbxTestPresenceCell(row) abort
  let info = getwininfo(win_getid())[0]
  return {'row': screenpos(win_getid(), a:row, 1).row,
        \ 'col': has('nvim') ? info.wincol + info.textoff - 2 : info.wincol}
endfunction
