" Normal image path with a synthetic non-uniform PNG; never a real account.
set encoding=utf-8 hidden noswapfile lines=60 columns=160 termguicolors
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let g:wbx_tui = {'images': 'auto', 'mark_read_on_open': 0}
let s:visible = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  import { pathToFileURL } from 'node:url';
  const { imagePreview } = await import(pathToFileURL(process.env.WBX_EDITOR_ROOT + '/src/message-images.ts').href);
  const rgb = Buffer.alloc(240 * 144 * 3);
  for (let y = 0; y < 144; y++) for (let x = 0; x < 240; x++) {
    const p = (y * 240 + x) * 3;
    rgb[p] = Math.floor(x * 255 / 239); rgb[p + 1] = Math.floor(y * 255 / 143); rgb[p + 2] = x < 120 ? 32 : 224;
  }
  const ready = imagePreview('a'.repeat(64), rgb), pending = {id:ready.id,state:'pending'};
  const room = {id:'room',title:'Synthetic image',type:'group'};
  let revision = 0, state = {revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => {state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line', line => {
    const req=JSON.parse(line), p=req.params||{}, reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method})+'\n');
    if(req.method==='hello') return reply({version:1,capabilities:['message-images'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){state={...state,state:'ready',rooms:[room]};publish();return reply(null);}
    if(req.method==='rooms.select'){
      state={...state,room,ready:true,messages:[{id:'image-message',author:'Local',created:'2026-11-11T12:00:00Z',text:'[Attachment / non-text message]',images:[pending]}]};publish();return reply(null);
    }
    if(req.method==='messages.images'){state.messages=[{...state.messages[0],images:[ready]}];publish();return reply(null);}
    if(req.method==='test.poll'){publish();return reply(null);}
    if(req.method==='test.removeImage'){state.messages=state.messages.map(({images,...message})=>message);publish();return reply(null);}
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui.backend = [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_RESULT . '.backend.mjs']
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 8
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
let s:polls = 0
function! s:polled(message) abort
  let s:polls += 1
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call cursor(index(b:wbx_room_ids, 'room') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  normal! G
  call wbx#images#schedule()
  if !s:visible
    sleep 80m
    call assert_equal(0, count(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method'), 'messages.images'), 'undrawn Vim cannot automatically fetch an allegedly visible image')
    call wbx#rpc('messages.images', {'roomId': 'room', 'messageId': 'image-message'})
  endif
  call WaitFor('get(wbx#state().messages[0].images[0], "state", "") ==# "ready"')
  call assert_equal(1, len(b:wbx_image_placements), 'ready preview metadata must be attached to the exact rendered buffer')
  call assert_notmatch('\[Image preview\]', join(getline(1, '$'), "\n"), 'a displayed preview needs no placeholder')
  let tick = b:changedtick
  for i in range(1, 5)
    call wbx#rpc('test.poll', {}, function('s:polled'))
    call WaitFor('s:polls == ' . i)
    call assert_equal(1, len(b:wbx_image_placements), 'unchanged state cannot drop an already rendered image')
    call assert_equal('ready', wbx#state().messages[0].images[0].state)
    call assert_equal(tick, b:changedtick)
  endfor
  if has('nvim')
    lua << trim LUA
      local images = require('wbx-tui.images')
      local buf = vim.api.nvim_get_current_buf()
      local marks = vim.api.nvim_buf_get_extmarks(buf, vim.api.nvim_create_namespace('wbx-tui-images'), 0, -1, {})
      if vim.env.WBX_EDITOR_SCREEN == '1' then
        assert(images.supported(), 'the unmocked Kitty detector must accept this isolated TUI')
        assert(#marks == 12, 'the normal, unmocked writer must install real-image placements')
        assert(images.status(buf).mode == 'kitty')
        assert(images.status(buf).output == (vim.api.nvim_ui_send and 'ui-send' or 'legacy-stdout'))
      else
        assert(not images.supported(), 'undrawn headless editors must not write terminal graphics')
        assert(#marks == 0)
      end
    LUA
  endif
  redraw!
  sleep 100m
  call wbx#rpc('test.removeImage', {}, function('s:polled'))
  call WaitFor('s:polls == 6')
  call assert_equal([], b:wbx_image_placements)
  call assert_notmatch('\[Image preview\]', join(getline(1, '$'), "\n"), 'a state with no image metadata must not leave orphaned braille pixels')
  call assert_notmatch('[⠀-⣿]', join(getline(1, '$'), "\n"), 'removed preview rows cannot linger as dotted blocks')
  if has('nvim')
    call assert_equal(0, luaeval("#vim.api.nvim_buf_get_extmarks(0, vim.api.nvim_create_namespace('wbx-tui-images'), 0, -1, {})"))
    call assert_equal('no-ready-images', wbx#images#status(bufnr('%')).reason)
    lua << trim LUA
      local images = require('wbx-tui.images')
      local uis, system, executable, has = vim.api.nvim_list_uis, vim.system, vim.fn.executable, vim.fn.has
      local keys = {'TERM', 'TERM_PROGRAM', 'TMUX', 'TMUX_PANE', 'ZELLIJ', 'KITTY_WINDOW_ID'}
      local saved = {}
      for _, key in ipairs(keys) do saved[key] = vim.env[key] end
      local queries = 0
      local ok, err = pcall(function()
        vim.env.TERM, vim.env.TERM_PROGRAM = 'xterm-kitty', 'kitty'
        vim.env.TMUX, vim.env.TMUX_PANE, vim.env.ZELLIJ = 'synthetic-only', '%123', nil
        vim.fn.has = function(feature) return feature == 'ttyout' and 1 or has(feature) end
        if vim.api.nvim_ui_send then
          vim.api.nvim_list_uis = function() return {{stdout_tty=false}} end
          assert(not images.supported(), 'a non-terminal UI must not inherit Kitty support from the process environment')
        end
        vim.api.nvim_list_uis = function() return {{stdout_tty=true}} end
        vim.fn.executable = function(name) return name == 'tmux' and 1 or executable(name) end
        vim.system = function(argv)
          queries = queries + 1
          assert(vim.tbl_contains(argv, '-A'), 'read-only tmux checks must include inherited values')
          assert(argv[2] == 'show-options' and argv[#argv] == 'allow-passthrough')
          return {wait=function() return {code=0,stdout='on\n'} end}
        end
        assert(images.supported(), 'an inherited enabled value cannot be mistaken for a disabled pane override')
        assert(queries == 1)
        images.status(vim.api.nvim_get_current_buf())
        assert(queries == 1, 'health/status is observational, not a new terminal or tmux query')
        vim.env.TMUX_PANE = '%124'
        assert(images.supported())
        assert(queries == 2, 'a changed pane/output route must not inherit another route\'s cached passthrough result')
        images.status(vim.api.nvim_get_current_buf())
        assert(queries == 2, 'route invalidation does not make health perform discovery')
      end)
      vim.api.nvim_list_uis, vim.system, vim.fn.executable = uis, system, executable
      vim.fn.has = has
      for _, key in ipairs(keys) do vim.env[key] = saved[key] end
      assert(ok, err)
    LUA
  endif
  let methods = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(1, count(methods, 'messages.images'))
  call assert_equal(0, count(methods, 'rooms.read'))
  call assert_equal(0, count(methods, 'messages.send'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'positive_visibility': s:visible ? 'automatic preview admission exercised' : 'NOT RUN: undrawn Vim; explicit synthetic response exercised'})], $WBX_EDITOR_RESULT)
qa!
