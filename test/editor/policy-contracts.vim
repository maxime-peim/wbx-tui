" Independent native validators consume the shared data, never Node definitions.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
try
  let fixture = json_decode(join(readfile($WBX_EDITOR_ROOT . '/test/policy-contracts.json'), "\n"))
  call assert_equal(1, fixture.version)
  for row in fixture.cases
    if row.kind ==# 'person' | let valid = wbx#protocol#person_id(row.value)
    elseif row.kind ==# 'title' | let valid = wbx#protocol#space_title(row.value)
    elseif row.kind ==# 'query' | let valid = wbx#protocol#directory_query(row.value)
    elseif row.kind ==# 'description' | let valid = wbx#protocol#description_text(row.value, 0)
    elseif row.kind ==# 'drafts'
      let valid = wbx#protocol#drafts({'sessionId':repeat('a',32),'profile':repeat('f',64),'revision':repeat('d',64),'items':row.value}, 1)
    else | throw 'Unknown policy fixture kind'
    endif
    call assert_equal(row.valid ? 1 : 0, valid ? 1 : 0, json_encode(row))
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors})], $WBX_EDITOR_RESULT)
qa!
