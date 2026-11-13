" Explicit submission includes individual tags; @all alone keeps its extra gate.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime autoload/wbx/rich.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/rich.vim$"')[0].sid
let g:consent_prompts = [] | let g:consent_accept = 1
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:consent_prompts, a:text)\nreturn g:consent_accept\nendfunction"
try
  let content = '<@personId:mallory-id|Alice> <@personId:bob-id|Bob>'
  let result = wbx#rich#consent(content)
  call assert_equal({'mentionsAccepted': v:true}, result)
  call assert_equal([], g:consent_prompts, 'individual tags need no extra confirmation or label-based identity inference')
  let g:consent_accept = 0
  call assert_equal({'mentionsAccepted': v:true}, wbx#rich#consent(content), 'person tags do not consult the confirmation helper')
  call assert_equal({}, wbx#rich#consent('Literal @Name without structured markup'))
  call assert_equal([], g:consent_prompts)
  call assert_equal({'cancelled': 1}, wbx#rich#consent('<@all>'), '@all can still be canceled')
  call assert_equal(1, len(g:consent_prompts), '@all has one conspicuous prompt, not the old two-stage flow')
  call assert_match('ATTENTION: @all', g:consent_prompts[0])
  let g:consent_accept = 1 | let g:consent_prompts = []
  call assert_equal({'mentionsAccepted': v:true, 'allAccepted': v:true}, wbx#rich#consent(content . ' <@all>'))
  call assert_equal(1, len(g:consent_prompts), 'mixed person/@all submissions retain only broadcast consent')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
