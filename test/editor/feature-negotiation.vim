" Independent legacy/partial assertions and real transport/session reset boundaries.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'backend':[$WBX_NODE,$WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs'],
      \ 'images':0,'notifications':0,'people_status':0,'upcoming_meetings':0,'spaces_cache':0}
try
  let contract = json_decode(join(readfile($WBX_EDITOR_ROOT . '/test/editor-feature-contract.json'),"\n"))
  let state = {'revision':0,'state':'idle','mode':'demo','rooms':[],'messages':[],'room':v:null,'ready':v:false}
  let base = {'version':1,'state':state,'meeting':{'active':v:false,'ready':v:false}}
  for row in contract.cases
    call assert_equal(row.valid ? 1 : 0, wbx#protocol#hello(extend(deepcopy(base),row.value)),row.label)
  endfor
  let full = extend(deepcopy(base),deepcopy(contract.advertisement))
  call assert_true(wbx#protocol#hello(full))
  let too_many = deepcopy(base) | let too_many.capabilities = repeat(['future'],33)
  call assert_false(wbx#protocol#hello(too_many),'legacy 32-capability ceiling stays exact')
  let detached = wbx#features#copy(full)
  let full.localDrafts[0] = 'mutated'
  call assert_equal(['disk-v1'],detached.localDrafts)
  call assert_equal(detached,wbx#features#reset(detached,'session'))
  let reset = wbx#features#reset(detached,'transport')
  call assert_true(empty(filter(values(reset),'!empty(v:val)')),'every field clears together')
  WebexDemo
  let start = reltime()
  while empty(wbx#state().rooms) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_false(empty(wbx#state().rooms))
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  let full = extend(deepcopy(base),deepcopy(contract.advertisement))
  let full.state.revision = wbx#state().revision + 1
  let full.state.state = 'ready'
  let full.state.localContext = {'sessionId':repeat('a',32),'coverage':'session-only'}
  let full.meeting = {'active':v:true,'ready':v:true,'session':'wbx-synthetic','attach':[],'display':'editor'}
  call Hello({'result':full})
  call assert_true(wbx#supports_local_drafts())
  for phase in ['failed','ready']
    let next = deepcopy(full.state) | let next.revision = wbx#state().revision + 1 | let next.state = phase
    if phase ==# 'failed' | call remove(next,'localContext')
    else | let next.localContext.sessionId = repeat('b',32)
    endif
    call wbx#_receive({'jsonrpc':'2.0','method':'state','params':next})
    call assert_equal(phase ==# 'ready' ? 1 : 0,wbx#supports_local_drafts(),'session admission remains guarded')
    call assert_true(wbx#meeting_supports('meeting-tmux'),'failed/renewed messaging cannot clear independent meeting controls')
  endfor
  call wbx#transport#stop()
  call assert_false(wbx#meeting_supports('meeting-tmux'))
  call assert_false(wbx#supports_local_drafts())
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
