-- Isolated real lazy.nvim loader test, not the user's LazyVim configuration.
-- Never bootstrap/install plugins, run build hooks, sign in or launch media.
local errors, startup_backend_running = {}, nil
vim.notify = function(message, level)
  if level and level >= vim.log.levels.ERROR then errors[#errors + 1] = tostring(message) end
end
local ok, err = xpcall(function()
  vim.opt.rtp:prepend(vim.fn.stdpath('config'))
  vim.opt.rtp:prepend(vim.env.WBX_LAZY_PATH)
  vim.o.hidden = true
  vim.o.swapfile = false
  vim.o.statusline = 'LAZYVIM-STATUS-FIXTURE'
  local save_rhs = '<Cmd>let g:wbx_lazyvim_save_fixture = 1<CR>'
  vim.keymap.set({ 'n', 'i' }, '<C-s>', save_rhs)
  require('lazy').setup({ { import = 'plugins' } }, {
    root = vim.fn.stdpath('data') .. '/lazy',
    lockfile = vim.fn.stdpath('config') .. '/lazy-lock.json',
    defaults = { lazy = true }, -- the example must explicitly opt into startup
    local_spec = false,
    install = { missing = false },
    checker = { enabled = false },
    change_detection = { enabled = false },
    pkg = { enabled = false },
    rocks = { enabled = false },
    readme = { enabled = false },
  })
  assert(vim.g.loaded_wbx_tui == 1, 'the spec did not load the Vimscript command entry point')
  assert(package.loaded['wbx-tui'], 'main/opts did not load the Lua setup module')
  assert(vim.g.wbx_tui.mappings == true and vim.g.wbx_tui.send_with_ctrl_s == false and vim.g.wbx_tui.statusline == false, 'opts did not reach setup')
  assert(vim.g.wbx_tui.meeting.display == 'auto', 'meeting opts were lost')
  for _, name in ipairs({ 'WebexHealth', 'WebexDemo', 'WebexSpaces', 'WebexDestination', 'WebexSend', 'WebexMeetingDemo', 'WebexLeave' }) do
    assert(vim.fn.exists(':' .. name) == 2, name .. ' was not registered')
  end
  startup_backend_running = vim.fn['wbx#transport#running']()
  assert(startup_backend_running == 0, 'loading the documented spec started a backend')
  vim.cmd('WebexHealth')
  assert(vim.fn['wbx#health']().backend_built == 1, 'build the engine before running this test')
  assert(vim.fn['wbx#transport#running']() == 0, 'health started a backend')

  -- Follow the documented keyboard-first LazyVim demo workflow.
  vim.cmd('WebexDemo')
  local wbx = require('wbx-tui')
  assert(vim.wait(5000, function() return #wbx.state().rooms == 3 end), 'demo spaces did not load')
  assert(vim.bo.filetype == 'wbx-rooms', 'demo did not focus the spaces explorer')
  local rows = vim.b.wbx_room_ids
  local first = vim.fn.index(rows, 'demo-general') + 1
  assert(first > 0, 'the explorer has no destination-bound rows')
  assert(vim.api.nvim_win_get_cursor(0)[1] == first, 'first load did not position on an actual space')
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('j<CR>', true, false, true), 'xt', false)
  assert(vim.wait(5000, function()
    local state = wbx.state()
    return state.ready and type(state.room) == 'table' and state.room.id == 'demo-engineering' and vim.bo.filetype == 'wbx-history'
  end), 'j/Enter did not open the chosen space and focus its history')
  vim.api.nvim_feedkeys('i', 'xt', false)
  assert(vim.bo.filetype == 'wbx-compose', 'compose did not open a native draft')
  vim.cmd('stopinsert')
  assert(vim.o.statusline == 'LAZYVIM-STATUS-FIXTURE', 'the spec replaced the editor statusline')
  local destination = wbx.destination()
  assert(destination.id == 'demo-engineering' and destination.title == wbx.state().room.title and destination.ready,
    'statusline-disabled users cannot inspect the buffer-bound destination')
  assert(wbx.buffer_status():find(destination.title, 1, true), 'buffer status omitted the destination title')
  assert(vim.fn.execute('WebexDestination'):find('demo-engineering', 1, true), 'destination command omitted the bound ID')
  assert(vim.api.nvim_get_current_line() == '', 'destination inspection inserted sendable metadata')
  assert(vim.o.statusline == 'LAZYVIM-STATUS-FIXTURE', 'destination inspection replaced the editor statusline')
  for _, mode in ipairs({ 'n', 'i' }) do
    local mapping = vim.fn.maparg('<C-s>', mode, false, true)
    assert(mapping.rhs == save_rhs and mapping.buffer == 0, 'a Webex send map replaced the editor save binding')
  end
  vim.api.nvim_buf_set_lines(0, 0, -1, false, { 'Explicit LazyVim local demo send · 世界' })
  assert(vim.fn.maparg('<localleader>s', 'n', false, true).buffer == 1, 'the composer has no explicit keyboard send mapping')
  local send = (vim.g.maplocalleader or '\\') .. 's'
  vim.api.nvim_feedkeys(send, 'xt', false)
  assert(vim.wait(5000, function()
    return #wbx.state().messages == 3 and vim.api.nvim_get_current_line() == ''
  end), 'explicit demo send did not acknowledge the native draft')
  assert(not vim.fn['wbx#meeting_state']().active, 'documentation test unexpectedly started a meeting')
end, debug.traceback)
if not ok then errors[#errors + 1] = err end
if vim.g.loaded_wbx_tui == 1 then pcall(vim.fn['wbx#shutdown']) end
vim.fn.writefile({ vim.json.encode({ errors = errors, startup_backend_running = startup_backend_running }) }, vim.env.WBX_EDITOR_RESULT)
vim.cmd('qa!')
