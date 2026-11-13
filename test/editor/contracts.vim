" Language-neutral limits, pure projections and local destination/config contracts.
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'backend': ['/bin/false'], 'mappings': 0, 'notifications': 0}
try
  let fixture = json_decode(join(readfile($WBX_EDITOR_ROOT . '/test/contract-boundaries.json'), "\n"))
  call assert_equal(1, fixture.version)
  for row in fixture.utf8
    call assert_equal(row.bytes, strlen(row.text), 'wire units are UTF-8 bytes')
    call assert_equal(row.codePoints, strchars(row.text))
  endfor
  for row in fixture.canonical
    let value = {'meta': {'id': repeat('a', 64), 'name': 'data', 'mime': 'application/octet-stream', 'sourceBytes': row.bytes},
          \ 'body': {'kind': 'original', 'decodedBytes': row.bytes, 'text': v:false,
          \ 'payload': {'mode': 'inline', 'encoding': 'base64', 'data': row.data}}}
    call assert_equal(row.valid, wbx#protocol#resolved_attachment(value) ? v:true : v:false, 'independent Vim canonical admission')
  endfor
  for row in fixture.encoded
    let value = {'meta': {'id': repeat('a', 64), 'name': 'data', 'mime': 'application/octet-stream', 'sourceBytes': row.bytes},
          \ 'body': {'kind': 'original', 'decodedBytes': row.bytes, 'text': v:false,
          \ 'payload': {'mode': 'chunks', 'encoding': 'base64', 'requestId': 1, 'transferId': repeat('b', 32),
          \ 'chunkBytes': fixture.limits.chunkBytes, 'chunks': row.chunks, 'encodedBytes': row.base64Bytes, 'sha256': repeat('c', 64)}}}
    call assert_true(wbx#protocol#resolved_attachment(value, 1))
    let value.body.decodedBytes = fixture.limits.originalBytes + 1
    call assert_false(wbx#protocol#resolved_attachment(value, 1))
  endfor
  " Separate source/representation/text ceilings; no multi-megabyte allocation.
  for kind in ['original', 'png']
    for delta in [-1, 0, 1]
      let limit = kind ==# 'png' ? fixture.limits.rasterBytes : fixture.limits.originalBytes
      let bytes = kind ==# 'png' ? 45 : limit + delta
      let value = {'meta': {'id': repeat('a', 64), 'name': 'data', 'mime': kind ==# 'png' ? 'image/png' : 'application/octet-stream',
            \ 'sourceBytes': limit + delta}, 'body': {'kind': kind, 'decodedBytes': bytes,
            \ 'payload': {'mode': 'chunks', 'encoding': 'base64', 'requestId': 1, 'transferId': repeat('b', 32),
            \ 'chunkBytes': fixture.limits.chunkBytes, 'chunks': (bytes + fixture.limits.chunkBytes - 1) / fixture.limits.chunkBytes,
            \ 'encodedBytes': 4 * ((bytes + 2) / 3), 'sha256': repeat('c', 64)}}}
      if kind ==# 'png'
        call extend(value.body, {'width': 1, 'height': 1, 'lines': repeat([repeat('⣿', 40)], 12)})
      else
        let value.body.text = v:false
      endif
      call assert_equal(delta <= 0, !!wbx#protocol#resolved_attachment(value, 1), 'independent source ceiling')
      if kind ==# 'png'
        let value.meta.sourceBytes = 45
        let value.body.decodedBytes = fixture.limits.pngBytes + delta
        let value.body.payload.chunks = (value.body.decodedBytes + fixture.limits.chunkBytes - 1) / fixture.limits.chunkBytes
        let value.body.payload.encodedBytes = 4 * ((value.body.decodedBytes + 2) / 3)
        call assert_equal(delta <= 0, !!wbx#protocol#resolved_attachment(value, 1), 'PNG output has a distinct ceiling')
      endif
    endfor
  endfor
  for delta in [-1, 0, 1]
    let bytes = fixture.limits.textBytes + delta
    let value = {'meta': {'id': repeat('a', 64), 'name': 'data', 'mime': 'text/plain', 'sourceBytes': bytes},
          \ 'body': {'kind': 'original', 'decodedBytes': bytes, 'text': v:true,
          \ 'payload': {'mode': 'chunks', 'encoding': 'base64', 'requestId': 1, 'transferId': repeat('b', 32),
          \ 'chunkBytes': fixture.limits.chunkBytes, 'chunks': (bytes + fixture.limits.chunkBytes - 1) / fixture.limits.chunkBytes,
          \ 'encodedBytes': 4 * ((bytes + 2) / 3), 'sha256': repeat('c', 64)}}}
    call assert_equal(delta <= 0, !!wbx#protocol#resolved_attachment(value, 1), 'native text metadata ceiling')
  endfor
  let params = {'requestId': 'case', 'roomId': 'room', 'text': 'original', 'parentId': 'parent'}
  call wbx#drafts#register('case', params, 9, 12)
  let params.text = 'mutated input'
  call assert_false(wbx#drafts#delivery({'requestId': 'case', 'roomId': 'foreign', 'parentId': 'parent', 'status': 'sent'}).valid)
  call assert_true(wbx#drafts#pending('room'))
  let result = wbx#drafts#delivery({'requestId': 'case', 'roomId': 'room', 'parentId': 'parent', 'status': 'unknown'})
  call assert_equal('original', result.pending.text)
  call assert_true(wbx#drafts#uncertain('room'))
  call assert_false(wbx#drafts#delivery({'requestId': 'case', 'roomId': 'room', 'parentId': 'parent', 'status': 'sent'}).known)
  call wbx#drafts#resolve('room')
  call assert_false(wbx#drafts#uncertain('room'))
  call wbx#drafts#register('case', params, 9, 12)
  call assert_equal(1, wbx#drafts#disconnect())
  call assert_false(wbx#drafts#pending())
  call assert_true(wbx#drafts#uncertain('room'))
  call assert_false(wbx#drafts#delivery({'requestId': 'case', 'roomId': 'room', 'parentId': 'parent', 'status': 'sent'}).known, 'old session ACK cannot match a cleared send')
  call wbx#drafts#resolve('room')
  let rooms = [{'id': 'room', 'title': 'Pure', 'unread': v:true}]
  let displays = [{'unread': v:true, 'local': ''}]
  let rows = wbx#rooms#rows(rooms, 'room', 2, displays, 'ready')
  call assert_equal(['● Pure'], rows.lines)
  call assert_equal([3], rows.unread)
  let rows.lines[0] = 'mutated projection'
  call assert_equal('Pure', rooms[0].title)
  let catalogue = wbx#options#catalogue()
  call assert_equal(29, len(catalogue))
  call assert_equal(['reaction_display','icons',0,'display',1],
        \ filter(copy(catalogue),'v:val[0] ==# "reaction_display"')[0],'text fallback is an optional presentation-only native/Lua preference')
  call assert_equal(['completion_policy','manual',0,'editing',1],
        \ filter(copy(catalogue),'v:val[0] ==# "completion_policy"')[0],'the earlier native completion policy remains in the shared catalogue')
  call assert_equal(1, filter(copy(catalogue), 'v:val[0] ==# "persist_drafts"')[0][1])
  let catalogue[0][1] = 'mutated catalogue'
  call assert_equal(0, wbx#options#normalized().demo)
  let saved_options = deepcopy(g:wbx_tui)
  let g:wbx_tui = {}
  let defaults = wbx#options#normalized()
  for key in ['people_status', 'read_status', 'spaces_cache', 'upcoming_meetings', 'reactions']
    call assert_equal(1, defaults[key], key . ' is available by default for explicit connection')
  endfor
  call assert_true(wbx#notifications#status().sender_names, 'client-style sender labels default on')
  call assert_false(wbx#transport#running(), 'default feature availability cannot start a connection')
  let g:wbx_tui = {'people_status': 0, 'read_status': 0, 'spaces_cache': 0, 'reactions': 0,
        \ 'notifications': {'sender_names': 0, 'preview': 0}}
  for key in ['people_status', 'read_status', 'spaces_cache', 'reactions']
    call assert_equal(0, wbx#options#normalized()[key], 'explicit opt-out wins: ' . key)
  endfor
  call assert_false(wbx#notifications#status().sender_names)
  call assert_false(wbx#notifications#status().preview)
  let g:wbx_tui = saved_options
  if has('nvim')
    lua << trim LUA
      local input={}
      for _,entry in ipairs(vim.fn['wbx#options#catalogue']()) do input[entry[1]]=vim.deepcopy(entry[2]) end
      input.mappings=false;input.notifications={preview=false};input.images=0;input.reactions=false
      input.message_borders='none';input.backend={'/bin/false'}
      input.attachment_handlers={['.png']={},['image/png']={argv={'never-auto-launch'}}}
      input.attachment_download_dir='/local/explicit-only'
      require('wbx-tui').setup(input)
      for _,key in ipairs(vim.fn['wbx#options#forward_keys']()) do
        assert(vim.deep_equal(vim.g.wbx_tui[key],input[key]),key..' forwarded through actual Lua setup')
      end
      assert(vim.g.wbx_tui.notifications.preview==false)
      assert(vim.g.wbx_tui.reactions==false)
      local common=vim.g.wbx_tui
      common.unknown_native='retained';common.meeting={display='editor',leave_on_exit=false}
      vim.g.wbx_tui=common
      require('wbx-tui').setup({meeting={fallback='error'},unknown_setup='not-forwarded'})
      assert(vim.g.wbx_tui.meeting.display=='editor' and vim.g.wbx_tui.meeting.fallback=='error')
      assert(vim.g.wbx_tui.meeting.leave_on_exit==false)
      assert(vim.g.wbx_tui.unknown_native=='retained' and vim.g.wbx_tui.unknown_setup==nil)
    LUA
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
