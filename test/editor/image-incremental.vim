" Deterministic image-registration/placement work; fake terminal, no backend.
set encoding=utf-8 hidden noswapfile lines=60 columns=160 termguicolors
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
if !has('nvim-0.10')
  call writefile([json_encode({'errors': [], 'skip': 'Incremental Kitty placements require Neovim 0.10+'})], $WBX_EDITOR_RESULT)
  qa!
endif
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 'auto', 'notifications': 0}
try
  if has('nvim-0.10')
    lua << trim LUA
      local images = require('wbx-tui.images')
      local ns = vim.api.nvim_create_namespace('wbx-tui-images')
      local saved = {send=vim.api.nvim_ui_send, uis=vim.api.nvim_list_uis, supported=images.supported,
        mark=vim.api.nvim_buf_set_extmark, clear=vim.api.nvim_buf_clear_namespace, delete=vim.api.nvim_buf_del_extmark,
        highlight=vim.api.nvim_set_hl, render=images.render, register=images.register}
      local calls = {}
      local function reset() calls = {registrations=0, bytes=0, transfers=0, placements=0, deletes=0, marks=0, clears=0, highlights=0, removed=0} end
      local channel = 101
      reset()
      vim.api.nvim_list_uis = function() return {{stdout_tty=true, chan=channel}} end
      images.supported = function() return true end
      vim.api.nvim_ui_send = function(data)
        if data:find('a=t,f=100',1,true) then calls.transfers=calls.transfers+1 end
        if data:find('a=p,U=1',1,true) then calls.placements=calls.placements+1 end
        if data:find('a=d,d=I',1,true) then calls.deletes=calls.deletes+1 end
      end
      vim.api.nvim_buf_set_extmark = function(...) calls.marks=calls.marks+1; return saved.mark(...) end
      vim.api.nvim_buf_clear_namespace = function(...) calls.clears=calls.clears+1; return saved.clear(...) end
      vim.api.nvim_buf_del_extmark = function(...) calls.removed=calls.removed+1; return saved.delete(...) end
      vim.api.nvim_set_hl = function(...) calls.highlights=calls.highlights+1; return saved.highlight(...) end
      local registration = images.register or images.render
      local function register(buf, values)
        calls.registrations=calls.registrations+1
        for _, value in ipairs(values) do calls.bytes=calls.bytes+#value.png end
        return registration(buf, values)
      end
      if images.register then images.register=register else images.render=register end
      local function refresh(buf)
        if images.refresh then images.refresh(buf) else saved.render(buf, vim.b[buf].wbx_image_placements) end
      end
      local function marks(buf) return vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, {}) end
      local function install(buf, values) vim.fn['wbx#images#render'](buf, values); vim.wait(70, function() return false end, 10) end
      local png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
      local values = {}
      for i=1,3 do values[i]={id=string.rep(tostring(i),64),row=10+(i-1)*30,png=png,width=240,height=144} end
      local buf, viewer
      local ok, err = pcall(function()
        vim.cmd('enew | file wbx://history | setlocal buftype=nofile')
        buf=vim.api.nvim_get_current_buf()
        vim.api.nvim_buf_set_lines(buf,0,-1,false,vim.fn['repeat']({'Synthetic image row'},200))
        vim.bo[buf].modified=false; vim.b[buf].wbx_kind='history'; vim.b[buf].wbx_render_tick=vim.b[buf].changedtick
        install(buf, values)
        assert(#marks(buf)==36)
        local initial=marks(buf)
        reset()
        for i=1,5 do
          vim.api.nvim_win_set_cursor(0,{i+1,0})
          vim.cmd('doautocmd CursorMoved')
          vim.wait(70,function() return false end,10)
        end
        assert(calls.registrations==0 and calls.bytes==0, 'cursor-only refresh must not marshal/register PNGs')
        assert(calls.clears==0 and calls.marks==0 and calls.highlights==0, 'unchanged viewport must retain extmarks/highlights')
        assert(vim.deep_equal(initial,marks(buf)), 'unchanged placeholder IDs must survive native cursor navigation')
        assert(calls.transfers==0)

        local caller=vim.deepcopy(values)
        register(buf,caller); caller[1].png='PRIVATE mutated input'; caller[1].row=150
        reset(); refresh(buf)
        assert(calls.transfers==0 and calls.marks==0, 'registered payloads must not alias mutable caller containers')

        reset(); values[2].row=values[2].row+1; install(buf,values)
        assert(calls.transfers==0 and calls.clears==0 and calls.marks==12, 'move only the changed image placement')
        local moved=marks(buf)
        reset()
        vim.api.nvim_buf_set_lines(buf,0,0,false,{'Prepended native row'})
        for _,value in ipairs(values) do value.row=value.row+1 end
        vim.b[buf].wbx_render_tick=vim.b[buf].changedtick
        install(buf,values)
        assert(calls.marks==0 and calls.transfers==0 and calls.clears==0, 'native extmark shifts already match the new metadata')
        local shifted=marks(buf)
        assert(shifted[1][1]==moved[1][1])

        reset()
        saved.delete(buf,ns,shifted[1][1])
        vim.api.nvim_buf_set_lines(buf,0,1,false,{'Changed chrome row'})
        vim.b[buf].wbx_render_tick=vim.b[buf].changedtick
        install(buf,values)
        assert(calls.marks==1 and calls.clears==0, 'changedtick verification repairs only a missing mark')

        reset(); vim.cmd('doautocmd ColorScheme'); vim.wait(70,function() return false end,10)
        assert(calls.highlights==3 and calls.marks==0 and calls.transfers==0, 'colorscheme refresh restores only owned image highlights')
        reset(); channel=102; refresh(buf)
        assert(calls.transfers==3, 'a new terminal route needs one fresh transmission per registered image')
        reset(); refresh(buf); assert(calls.transfers==0 and calls.marks==0)

        reset(); values[1].png=png..'AAAA'; install(buf,values)
        assert(calls.transfers==1 and calls.marks==12 and calls.clears==0, 'changed bytes with the same ID replace only that resource')
        reset(); table.remove(values,2); install(buf,values)
        assert(calls.deletes==1 and calls.removed==12 and calls.marks==0, 'removed images release only their owned marks/pixels')

        reset(); vim.api.nvim_buf_set_lines(buf,0,1,false,{'Private annotation'}); refresh(buf)
        assert(images.status(buf).reason=='view-not-owned-or-edited')
        assert(vim.api.nvim_buf_get_lines(buf,0,1,false)[1]=='Private annotation' and #marks(buf)==0)
        vim.b[buf].wbx_render_tick=vim.b[buf].changedtick
        install(buf,values)
        assert(#marks(buf)==24)
        images.clear(buf)
        local send=vim.api.nvim_ui_send
        local failures=0
        vim.api.nvim_ui_send=function() failures=failures+1; error('PRIVATE optional write failure') end
        install(buf,values)
        assert(failures==2 and images.status(buf).reason=='terminal-write-failed')
        for i=1,5 do refresh(buf) end
        assert(failures==2, 'cursor-only updates cannot repeatedly encode/resubmit failed image transfers')
        assert(not vim.inspect(images.status(buf)):find('PRIVATE',1,true))
        vim.api.nvim_ui_send=send
        install(buf,values)
        reset(); vim.bo[buf].buftype=''; refresh(buf)
        assert(#marks(buf)==0 and calls.transfers==0, 'promoted buffers cannot be painted')

        vim.cmd('new | file wbx://image | setlocal buftype=nofile bufhidden=hide')
        viewer=vim.api.nvim_get_current_buf()
        vim.api.nvim_buf_set_lines(viewer,0,-1,false,vim.fn['repeat']({''},42))
        vim.b[viewer].wbx_kind='image'; vim.b[viewer].wbx_render_tick=vim.b[viewer].changedtick
        local detail={{id=string.rep('d',64),row=3,png=png,width=960,height=600}}
        install(viewer,detail)
        local full=marks(viewer)
        reset(); vim.api.nvim_win_set_height(0,10); refresh(viewer)
        vim.wait(70,function() return false end,10)
        assert(calls.transfers==0 and calls.placements==1 and calls.clears==0, 'resize changes fitted placement, not its PNG allocation')
        assert(marks(viewer)[1][1]==full[1][1], 'resize reuses surviving row marks')
        local resized=marks(viewer)
        reset(); vim.cmd('vsplit'); refresh(viewer)
        vim.cmd('setlocal foldmethod=manual | 3,9fold')
        refresh(viewer); vim.wait(70,function() return false end,10)
        assert(calls.transfers==0 and calls.registrations==0 and calls.marks==0, 'multiple windows and native folds do not rebuild identical placeholders')
        assert(vim.deep_equal(resized,marks(viewer)))
        reset()
        for _,win in ipairs(vim.fn.win_findbuf(viewer)) do vim.api.nvim_win_set_buf(win,buf) end
        vim.wait(70,function() return false end,10)
        assert(#marks(viewer)==0 and calls.deletes==1, 'hiding the final window releases its terminal pixels')
        assert(images.status(viewer).reason=='history-hidden')
        reset(); vim.api.nvim_win_set_buf(0,viewer); refresh(viewer)
        vim.wait(70,function() return false end,10)
        assert(calls.transfers==1 and calls.registrations==0, 'reshow uses retained registered bytes, not a fresh Vim/Lua payload')
        reset(); vim.api.nvim_buf_delete(viewer,{unload=true})
        assert(calls.deletes==1, 'unload releases the exact active image')
        vim.fn.bufload(viewer); refresh(viewer)
        assert(calls.transfers==0 and #marks(viewer)==0, 'unload forgets private registered payloads until explicit restoration')
        vim.api.nvim_win_set_buf(0,viewer)
        vim.api.nvim_buf_set_lines(viewer,0,-1,false,vim.fn['repeat']({''},42))
        vim.b[viewer].wbx_render_tick=vim.b[viewer].changedtick
        install(viewer,detail)
        assert(#marks(viewer)>0)
        reset(); vim.cmd('file promoted-image-notes'); refresh(viewer)
        assert(#marks(viewer)==0 and calls.transfers==0, 'renaming promotes user work and revokes owned image resources')
        vim.api.nvim_buf_delete(viewer,{force=true}); refresh(viewer)
        assert(vim.fn['wbx#transport#running']()==0)
      end)
      if buf then images.clear(buf) end
      if viewer then images.clear(viewer) end
      vim.api.nvim_ui_send, vim.api.nvim_list_uis, images.supported = saved.send,saved.uis,saved.supported
      vim.api.nvim_buf_set_extmark, vim.api.nvim_buf_clear_namespace = saved.mark,saved.clear
      vim.api.nvim_buf_del_extmark, vim.api.nvim_set_hl = saved.delete,saved.highlight
      images.render, images.register = saved.render,saved.register
      assert(ok,err)
    LUA
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
