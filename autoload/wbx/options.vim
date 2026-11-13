" Native options and Lua forwarding eligibility. Not the private RPC allowlist.
let s:save_cpo = &cpoptions
set cpoptions&vim
" Fields: key, default, materialize, category, Lua forwarding eligibility.
" Optional module-owned defaults are documented but are not injected into g:wbx_tui.
let s:catalogue = [
      \ ['reactions', 1, 1, 'consent', 1],
      \ ['reaction_display', 'icons', 0, 'display', 1],
      \ ['demo', 0, 1, 'connection', 1], ['config', '', 1, 'connection', 1], ['backend', [], 1, 'connection', 1],
      \ ['mappings', 1, 1, 'keys', 1], ['leader_prefix', '<leader>W', 0, 'keys', 1], ['send_with_ctrl_s', 1, 1, 'keys', 1],
      \ ['read_status', 1, 1, 'consent', 1], ['people_status', 1, 1, 'consent', 1], ['upcoming_meetings', 1, 1, 'consent', 1],
      \ ['spaces_cache', 1, 1, 'consent', 1], ['threaded_history', 1, 1, 'display', 1], ['message_borders', 'editor-dependent', 0, 'display', 1],
      \ ['images', 'auto', 0, 'display', 1], ['image_open', 'buffer', 0, 'local-tool', 1], ['image_viewer', {}, 0, 'local-tool', 1],
      \ ['attachment_handlers', {}, 0, 'local-tool', 1], ['attachment_download_dir', 'current directory', 0, 'local-tool', 1],
      \ ['notifications', 'module-owned defaults', 0, 'notifications', 1], ['mark_read_on_open', 1, 1, 'consent', 1],
      \ ['rooms_width', 30, 1, 'display', 1], ['compose_height', 8, 1, 'display', 1], ['statusline', 1, 1, 'display', 1],
      \ ['meeting', {'display': 'auto', 'fallback': 'editor', 'headless_demo': 0, 'leave_on_exit': 0}, 1, 'meeting', 1],
      \ ['picker', 'auto', 0, 'display', 1], ['folds', 1, 0, 'display', 1],
      \ ['completion_policy', 'manual', 0, 'editing', 1],
      \ ['persist_drafts', 1, 0, 'local-storage', 1]]
let s:defaults = {}
for s:entry in s:catalogue
  if s:entry[2] | let s:defaults[s:entry[0]] = deepcopy(s:entry[1]) | endif
endfor
unlet s:entry
function! wbx#options#catalogue() abort
  return deepcopy(s:catalogue)
endfunction
function! wbx#options#forward_keys() abort
  return map(filter(copy(s:catalogue), 'v:val[4]'), 'v:val[0]')
endfunction
function! wbx#options#normalized() abort
  return extend(deepcopy(s:defaults), get(g:, 'wbx_tui', {}), 'force')
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
