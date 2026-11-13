" Catalogue discovery is local; actual keys invoke only registered guarded owners.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:mapleader = ','
let g:wbx_tui = {'mappings': 1, 'backend': ['/bin/false'], 'notifications': 0}
let g:action_user = 0
nnoremap ,WaeX :let g:action_user += 1<CR>
nnoremap ,Wni :let g:action_user += 1<CR>
runtime plugin/wbx.vim
function! s:entry(command) abort
  return filter(wbx#commands#catalogue(), 'v:val.command ==# a:command')[0]
endfunction
try
  call setline(1, ['Native work', 'must survive'])
  call feedkeys("i\<Esc>", 'xt')
  let original = bufnr('%')
  let origin = win_getid()
  let tree = undotree()
  call assert_false(wbx#transport#running())
  for [prefix,expected] in [['WebexFormat m',['markdown']],['WebexFilter un',['unread']],['WebexContent li',['links']],['WebexActions rec',['recovery']]]
    call assert_equal(expected,getcompletion(prefix,'cmdline'),'Ex argument completion is local and finite: ' . prefix)
  endfor
  let attachment = $WBX_EDITOR_RESULT . '.staged-file'
  call writefile(['Synthetic local file'],attachment)
  call assert_true(index(getcompletion('WebexAttach ' . attachment,'cmdline'),attachment) >= 0,'attachment paths use native filename completion without staging')
  call assert_false(wbx#transport#running(),'completing arguments never starts a backend')
  call assert_equal('', maparg(',Wae', 'n'), 'longer user descendants are not masked by a shorter default')
  call assert_match('action_user', maparg(',Wni', 'n'), 'exact user mapping retained')
  call assert_equal(2, len(wbx#commands#conflicts()))
  let groups = {}
  for group in wbx#commands#groups() | let groups[group.lhs] = group.name | endfor
  call assert_equal({',W': 'Webex', ',Wa': 'Message actions', ',Wu': 'Files', ',Wn': 'Conversations', ',Wv': 'Views', ',Wm': 'Meetings'}, groups)
  call assert_false(has_key(groups, ',Ws'), 'Pick space is a leaf, not a prefix group')
  for binding in wbx#commands#bindings()
    call assert_true(strchars(binding.description) <= 24, 'short key label: ' . binding.description)
  endfor
  let all = wbx#commands#catalogue()
  call assert_true(len(all) > 70)
  call assert_equal(len(all), len(uniq(sort(map(copy(all), 'v:val.command')))), 'single unique command catalogue')
  for command in ['WebexEdit', 'WebexFormat', 'WebexAttach', 'WebexDirect', 'WebexMembers', 'WebexSections', 'WebexNotifications',
        \ 'WebexMutationResolve', 'WebexSectionsSave', 'WebexMeetingEditor', 'WebexMeetingDetach', 'WebexHealth',
        \ 'WebexBookmark', 'WebexBookmarks', 'WebexQuote', 'WebexQuoteInsert', 'WebexQuoteDetach', 'WebexThread', 'WebexContent',
         \ 'WebexReadByToggle', 'WebexDirectory', 'WebexDirectoryMore', 'WebexDirectoryDirect', 'WebexDirectoryRefresh',
        \ 'WebexThreadFetch', 'WebexThreadReply', 'WebexMentions', 'WebexQueryMessage', 'WebexQueryJump', 'WebexQueryReply', 'WebexQueryMore', 'WebexQueryRefresh',
        \ 'WebexProfile', 'WebexProfileRefresh', 'WebexCards', 'WebexJoinedTeams', 'WebexJoinedTeamsRefresh', 'WebexJoinedTeamsMore', 'WebexJoinedTeamFilter']
    call assert_equal(2, exists(':' . command), command . ' is registered')
    call assert_true(!empty(s:entry(command).description))
  endfor
  call assert_false(s:entry('WebexEdit').available)
  call assert_match('disconnected', s:entry('WebexEdit').reason)
   for key in ['aV', 'ad', 'as', 'ac', 'af', 'am', 'aM', 'ua', 'ur', 'uc', 'us', 'nd', 'ns', 'no', 'nc', 'nr', 'nl', 'vp', 'vt', 'vf', 'vs',
        \ 'me', 'mk', 'md', 'ml', 'mm', 'mc', 'mp', 'mh', 'ma', 'ab', 'aq', 'ai', 'vb', 'vh', 'vg', 'np', 'vH', 'vi', 'aR', 'nP', 'vC', 'vT']
    call assert_match('wbx#commands#invoke', maparg(',W' . key, 'n'), key . ' default exists')
    call feedkeys(',W' . key, 'xt')
  endfor
  call assert_false(wbx#transport#running(), 'wrong-context keys cannot start/reconnect, mutate or request a provider')
  call assert_equal(['Native work', 'must survive'], getline(1, '$'))
  call assert_equal(tree, undotree())
  normal ,W?
  call assert_equal('wbx://actions', bufname('%'))
  let help = bufnr('%')
  let text = join(getline(1, '$'), "\n")
  for command in map(copy(all), 'v:val.command')
    call assert_match(':' . command . '\>', text, 'all commands/recovery actions are discoverable without optional plugins')
  endfor
  call assert_match('Unavailable:.*disconnected', text)
  call assert_match('Preserved mapping conflict:.*Wni', text)
  call assert_false(wbx#transport#running(), 'reference has no lookups, sends or receipts')
  let all_count = len(getline(1, '$'))
  WebexActions available
  call assert_true(len(getline(1, '$')) < all_count, 'available index avoids scrolling past unavailable actions')
  call assert_notmatch('\[Unavailable:', join(getline(1, '$'), "\n"))
  call assert_match('(named only)', join(getline(1, '$'), "\n"))
  WebexActions meetings
  call assert_match(':WebexMeeting', join(getline(1, '$'), "\n"))
  call assert_notmatch(':WebexSend —', join(getline(1, '$'), "\n"))
  call feedkeys("\<CR>", 'xt')
  call assert_false(wbx#transport#running(), 'Enter in a filtered index cannot execute an action')
  WebexActions all
  normal q
  call assert_equal(original, bufnr('%'))
  call assert_equal(origin, win_getid())
  call assert_equal(tree, undotree(), 'help must preserve a full native undo tree')
  " Reusing an existing reference in another tab must stay local, and each
  " reference window must retain its own exact return target.
  WebexActions
  let reference_a = win_getid()
  tabnew
  let origin_b = win_getid() | let buffer_b = bufnr('%')
  call setline(1,'Tab B native text')
  call feedkeys("i\<Esc>",'xt')
  let tree_b = undotree()
  WebexActions
  let reference_b = win_getid()
  call assert_equal(2,tabpagenr(),'reference opens locally rather than jumping to tab A')
  normal q
  call assert_equal([origin_b,buffer_b],[win_getid(),bufnr('%')])
  call assert_equal(tree_b,undotree())
  WebexActions
  call win_gotoid(reference_a)
  normal q
  call assert_equal([origin,original],[win_getid(),bufnr('%')],'tab B cannot overwrite tab A return metadata')
  call assert_equal(tree,undotree())
  tabonly
  normal ,W?
  setlocal modifiable
  call setline(1, 'Private reference annotation')
  normal q
  call assert_equal(help, bufnr('%'), 'q cannot silently close an annotated owned reference')
  let annotated = undotree()
  call wbx#commands#show()
  call assert_equal('Private reference annotation', getline(1))
  call assert_equal(annotated, undotree())
  execute 'buffer ' . original
  call wbx#commands#show()
  call assert_equal(original, bufnr('%'), 'discovery preserves annotated reference instead of replacing work')
  execute 'bwipeout! ' . help
  let g:wbx_tui.leader_prefix = ',X'
  call wbx#commands#setup()
  call assert_match('WebexEdit', maparg(',Xae', 'n'))
  call assert_match('WebexMeetingEditor', maparg(',Xme', 'n'), 'meeting key meanings preserved')
  call assert_match('WebexMeetingDetach', maparg(',Xmd', 'n'))
  call assert_match('WebexProfile', maparg(',XnP', 'n'), 'profile follows the configured prefix')
   call assert_match('WebexJoinedTeams', maparg(',XvT', 'n'), 'joined Teams follows the configured prefix')
   call assert_match('WebexReadByToggle', maparg(',XaV', 'n'), 'reader disclosure follows the configured prefix')
  nnoremap <buffer> ,Xas :let g:action_user += 10<CR>
  call wbx#commands#setup()
  call assert_match('action_user', maparg(',Xas', 'n'), 'buffer user shadows survive repeated setup')
  nnoremap <buffer> ,XnP :let g:action_user += 20<CR>
  call wbx#commands#setup()
  call assert_match('action_user', maparg(',XnP', 'n'), 'profile preserves a user shadow')
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
   call assert_equal('', maparg(',Xae', 'n'))
   call assert_equal('', maparg(',XaV', 'n'), 'reader disclosure respects mapping opt-out')
  call assert_match('action_user', maparg(',Xas', 'n'))
  call assert_match('action_user', maparg(',XnP', 'n'))
  call assert_match('WebexEdit', maparg('<Plug>(WebexEdit)', 'n'), 'remappable targets survive opt-out')
  call assert_true(empty(s:entry('WebexEdit').bindings), 'reference only promises actual effective defaults')
  call assert_equal([], wbx#commands#groups(), 'disabled mappings have no advertised prefix groups')
  call wbx#commands#show()
  call assert_equal('', maparg('q', 'n'), 'the reference also respects mapping opt-out')
  let g:wbx_tui.mappings = 1
  call wbx#commands#setup()
  call assert_match('wbx#commands#close', maparg('q', 'n'), 'reference defaults can be enabled explicitly')
  nnoremap <buffer> q :let g:action_user += 30<CR>
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_match('action_user', maparg('q', 'n'), 'disabling defaults preserves a reference user shadow')
  call wbx#commands#invoke('WebexHealth | let g:action_user = 999')
  call assert_equal(0, g:action_user, 'arbitrary Ex strings are not invokable through the finite catalogue')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
