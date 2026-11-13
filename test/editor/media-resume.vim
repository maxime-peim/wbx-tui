" Synthetic metadata/images only. No real HTTP, terminal graphics or files.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let g:wbx_tui = {'images': 'unicode', 'mark_read_on_open': 0}
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = ['a', 'b'].map(id => ({ id, title: id, type: 'group' }));
  const image = { id: 'a'.repeat(64), state: 'pending' };
  const messages = () => Array.from({length: 30}, (_, i) => ({ id: 'message-' + i, author: 'Local', created: '2026-11-11T12:00:00Z', text: 'Original body ' + i, ...(i === 29 ? { images: [image] } : {}) }));
  let holdImages = false, revision = 0, state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const req = JSON.parse(line), p = req.params || {}, reply = result => write({jsonrpc:'2.0', id:req.id, result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(req) + '\n');
    if (req.method === 'hello') return reply({version:1, capabilities:['same-space-resume','message-images'], state, meeting:{active:false,ready:false}});
    if (req.method === 'session.start') { state = {...state, state:'ready', rooms}; publish(); return reply(null); }
    if (req.method === 'rooms.select') {
      state = {...state, room:rooms.find(room => room.id === p.roomId), loading:true, ready:false, messages:[]}; publish();
      return setTimeout(() => { state = {...state, loading:false, ready:true, messages:messages(), moreHistory:true, historyLatest:true}; publish(); reply(null); }, 50);
    }
    if (req.method === 'messages.images') {
      if (holdImages) return;
      state.messages = state.messages.map(message => message.id === p.messageId ? {...message, images:[{...image, state:'ready',
        png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        lines:Array(12).fill('⣿'.repeat(40))}]} : message); publish(); return reply(null);
    }
    if (req.method === 'test.publish') { state = {...state,...p}; publish(); return reply(null); }
    if (req.method === 'test.holdImages') { holdImages = true; return reply(null); }
    if (req.method === 'shutdown') { reply(null); return process.exit(0); }
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui.backend = [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:requests(method) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method')
endfunction
let s:visible = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
function! s:preview() abort
  normal! G
  let before = len(s:requests('messages.images'))
  call wbx#images#schedule()
  if !s:visible
    " Silent Ex has no drawn viewport (w$ can even precede w0). Keep automatic
    " admission fail-closed; explicitly drive only this fake provider's response.
    sleep 80m
    call assert_equal(before, len(s:requests('messages.images')), 'undrawn Vim never invents visible image consent')
    call wbx#rpc('messages.images', {'roomId': wbx#state().room.id, 'messageId': b:wbx_image_pending[0].messageId})
  endif
endfunction
let s:done = 0
function! s:done(message) abort
  let s:done += 1
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 2')
  let buffers = wbx#buffers()
  let explorer = win_getid()
  call cursor(index(b:wbx_room_ids, 'a') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(wbx#state(), "loading", 0)')
  call wbx#select('a', 1)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call assert_equal(1, len(s:requests('rooms.select')), 'a duplicate open does not cancel/restart pending history')
  call s:preview()
  call WaitFor('!empty(s:requests("messages.images")) && wbx#state().messages[-1].images[0].state ==# "ready"')
  call assert_match('⣿\{40}', join(getline(1, '$'), "\n"), 'Unicode fallback contains actual raster pixels')
  call assert_notmatch('\[Image preview\]', join(getline(1, '$'), "\n"), 'Unicode previews need no placeholder')
  call assert_equal(1, len(s:requests('messages.images')), 'one visible image produces one bounded read')
  call assert_match('Original body 29', join(getline(1, '$'), "\n"), 'original body remains intact')
  let draft = wbx#buffers().drafts.a
  call setbufline(draft, 1, 'Private unsent draft')
  let draft_tick = getbufvar(draft, 'changedtick')
  normal! gg
  call cursor(10, 3)
  normal! zt
  let retained = winsaveview()
  let tick = b:changedtick
  let history_window = win_getid()
  WebexSpaces
  execute "normal \<CR>"
  call assert_equal(buffers.history, bufnr('%'))
  call assert_equal(history_window, win_getid())
  call assert_equal(retained, winsaveview(), 'same loaded space resumes the exact native reading position')
  call assert_equal(tick, b:changedtick, 're-entry does not rewrite loaded history')
  call assert_equal(1, len(s:requests('rooms.select')))
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'))
  call assert_equal(['Private unsent draft'], getbufline(draft, 1, '$'))
  call assert_equal([], s:requests('rooms.read'))
  call assert_equal([], s:requests('messages.send'))
  let good = wbx#state().messages[-1].images
  call assert_true(wbx#protocol#images(good))
  let full = map(range(1, 20), '{"id": "budget-" . v:val, "author": "Local", "created": "", "text": repeat("row\n", 999) . "row"}')
  call add(full, {'id': 'overflow', 'author': 'Local', 'created': '', 'text': '', 'images': good})
  let clipped = wbx#history#render(full, 0)
  call assert_false(clipped.complete, 'image previews cannot bypass the history display budget or receipt completeness')
  call assert_equal([], clipped.images)
  call assert_match('Image preview clipped', join(clipped.lines, "\n"))
  for bad in [{'id': repeat('a',64), 'state':'ready', 'png':"\e_Gevil", 'lines':[]}, {'id':'evil', 'state':'pending'}, {'id':repeat('a',64), 'state':'pending', 'url':'https://evil'}]
    call assert_false(wbx#protocol#images([bad]), 'untrusted image data cannot inject paths, URLs or terminal controls')
  endfor
  if has('nvim')
    lua << trim LUA
      local images = require('wbx-tui.images')
      assert(not images.supported(), 'forced Unicode never opens the terminal')
      local writes = {}
      local send, supported, stdout = vim.api.nvim_ui_send, images.supported, io.stdout
      local buf = vim.api.nvim_get_current_buf()
      vim.api.nvim_ui_send = function(data) writes[#writes+1] = data end
      images.supported = function() return true end
      local ok, err = pcall(function()
        local placements = vim.b[buf].wbx_image_placements
        images.render(buf, {placements[1], placements[1]})
        local ns = vim.api.nvim_create_namespace('wbx-tui-images')
        assert(#vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, {}) == 24)
        assert(#writes == 1, 'repeated references share one owned image allocation')
        assert(table.concat(writes):find('a=t,f=100', 1, true))
        assert(table.concat(writes):find('a=p,U=1', 1, true))
        local count = #writes
        images.render(buf, placements)
        assert(#writes == count, 'unchanged images are not retransmitted')
        assert(#vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, {}) == 12)
        images.clear(buf)
        assert(#vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, {}) == 0)
        assert(writes[#writes]:find('a=d,d=I,i=', 1, true), 'delete only owned image IDs')
        vim.api.nvim_ui_send = function() error('PRIVATE failure must not reach health') end
        images.render(buf, placements)
        assert(images.status(buf).mode == 'unicode')
        assert(images.status(buf).reason == 'terminal-write-failed')
        assert(not vim.inspect(images.status(buf)):find('PRIVATE', 1, true))
        vim.api.nvim_ui_send = nil
        io.stdout = {write = function(_, data) writes[#writes+1] = data; return true end, flush = function() return true end}
        images.render(buf, placements)
        assert(images.status(buf).mode == 'kitty', 'older built-in TUIs retain the stdout route')
        assert(images.status(buf).output == 'legacy-stdout')
        images.clear(buf)
        io.stdout = stdout
        vim.api.nvim_ui_send = function(data) writes[#writes+1] = data end
        local mark = vim.api.nvim_buf_set_extmark
        vim.api.nvim_buf_set_extmark = function() error('E999 PRIVATE placement error') end
        images.render(buf, placements)
        vim.api.nvim_buf_set_extmark = mark
        assert(images.status(buf).reason == 'renderer-error')
        assert(images.status(buf).code == 'E999')
        assert(not vim.inspect(images.status(buf)):find('PRIVATE', 1, true))
        assert(writes[#writes]:find('a=d,d=I,i=', 1, true), 'partial allocation is cleaned when a mark fails')
      end)
      images.clear(buf)
      vim.api.nvim_ui_send, images.supported = send, supported
      io.stdout = stdout
      assert(ok, err)
    LUA
  endif
  let g:wbx_tui.images = v:false
  call wbx#rpc('test.publish', {'historyLatest': v:false}, function('s:done'))
  call WaitFor('s:done == 1')
  WebexLatest
  call WaitFor('len(s:requests("rooms.select")) == 2 && get(wbx#state(), "ready", 0)')
  call assert_true(s:requests('rooms.select')[-1].params.reload, 'only explicit latest navigation requests a reset')
  sleep 80m
  call assert_equal(1, len(s:requests('messages.images')), 'disabled previews cannot download even visible pending attachments')
  call assert_equal([], s:requests('rooms.read'), 'explicit reload is not receipt consent')
  call wbx#rpc('test.holdImages', {}, function('s:done'))
  call WaitFor('s:done == 2')
  let g:wbx_tui.images = 'unicode'
  WebexSpaces
  call cursor(index(b:wbx_room_ids, 'b') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call s:preview()
  call WaitFor('len(s:requests("messages.images")) == 2')
  call wbx#shutdown()
  WebexDemo
  call WaitFor('len(s:requests("session.start")) == 2 && len(wbx#state().rooms) == 2')
  WebexSpaces
  call cursor(index(b:wbx_room_ids, 'a') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call s:preview()
  call WaitFor('len(s:requests("messages.images")) == 3 && wbx#state().messages[-1].images[0].state ==# "ready"')
  call assert_equal(['Private unsent draft'], getbufline(draft, 1, '$'), 'backend replacement cannot erase a native draft')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'positive_visibility': s:visible ? 'automatic preview admission exercised' : 'NOT RUN: undrawn Vim; automatic admission refused, explicit synthetic responses exercised'})], $WBX_EDITOR_RESULT)
qa!
