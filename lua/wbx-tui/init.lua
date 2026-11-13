local M = {}
local options = { treesitter = true, picker = 'auto', which_key = true }

local function stop_history_parser(buf)
  if not vim.api.nvim_buf_is_valid(buf) or vim.api.nvim_buf_get_name(buf) ~= 'wbx://history'
    or vim.bo[buf].buftype ~= 'nofile' or vim.b[buf].wbx_kind ~= 'history' then return end
  pcall(function() vim.treesitter.stop(buf) end)
end

local function register_keys(buf)
  if not options.which_key then return end
  local ok, wk = pcall(require, 'which-key')
  if not ok or type(wk.add) ~= 'function' then return end
  local entries = {}
  if buf then entries[#entries + 1] = { '<Plug>(WebexSend)', desc = 'Send message', buffer = buf, mode = { 'n', 'i' } } end
  for _, group in ipairs(vim.fn['wbx#commands#groups']()) do
    local function name()
      if not options.which_key then return nil end
      for _, current in ipairs(vim.fn['wbx#commands#groups']()) do
        if current.lhs == group.lhs then return current.name end
      end
    end
    entries[#entries + 1] = { group.lhs, group = name, mode = 'n' }
  end
  for _, binding in ipairs(vim.fn['wbx#commands#bindings']()) do
    local function description()
      if not options.which_key then return nil end
      for _, current in ipairs(vim.fn['wbx#commands#bindings']()) do
        if current.lhs == binding.lhs and current.command == binding.command then return current.description end
      end
    end
    -- `real` removes orphaned labels after mapping opt-out. Dynamic descriptions
    -- yield to actual user mappings on a shadow; `hidden` is boolean, not a getter.
    entries[#entries + 1] = { binding.lhs, desc = description, real = true, mode = 'n' }
  end
  if #entries > 0 then pcall(wk.add, entries) end
end

local function buffer_ready()
  local event = vim.g.wbx_tui_event or {}
  local buf = event.bufnr
  if not buf or not vim.api.nvim_buf_is_valid(buf) then return end
  if event.kind == 'history' then
    -- A whole-history parser joins unrelated Markdown messages (an unclosed
    -- fence can swallow later authors). Native syntax is message-bounded.
    stop_history_parser(buf)
  elseif options.treesitter and event.kind == 'compose' then
    -- Only use installed parsers. No downloads, parser installation or LSP/AI activation.
    pcall(function() vim.treesitter.start(buf, 'markdown') end)
  end
  register_keys(buf)
  if type(options.on_buffer) == 'function' then options.on_buffer(event) end
end

function M.setup(opts)
  opts = opts or {}
  local common = vim.deepcopy(vim.g.wbx_tui or {})
  for _, key in ipairs(vim.fn['wbx#options#forward_keys']()) do
    if opts[key] ~= nil then
      if type(opts[key]) == 'function' then error(key .. ' is an editor/backend option, not a callback') end
      common[key] = key == 'meeting' and vim.tbl_deep_extend('force', common[key] or {}, opts[key]) or vim.deepcopy(opts[key])
    end
  end
  vim.g.wbx_tui = common
  vim.fn['wbx#commands#setup']()
  options = vim.tbl_extend('force', options, opts)
  register_keys()
  local group = vim.api.nvim_create_augroup('WbxTuiIntegrations', { clear = true })
  vim.api.nvim_create_autocmd('User', { group = group, pattern = 'WbxBuffer', callback = buffer_ready })
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do stop_history_parser(buf) end
end

function M.open(demo)
  if demo == nil then return vim.fn['wbx#open']() end
  return vim.fn['wbx#open'](demo and 1 or 0)
end
function M.state() return vim.fn['wbx#state']() end
function M.status() return vim.fn['wbx#status']() end -- lualine component; no global statusline takeover
function M.destination(buffer) return vim.fn['wbx#destination'](buffer or 0) end
function M.buffer_status(buffer) return vim.fn['wbx#buffer_status'](buffer or 0) end -- buffer-bound lualine component
function M.select_space(id) return vim.fn['wbx#select'](id) end
function M.send() return vim.fn['wbx#send']() end
function M.reply() return vim.fn['wbx#reply']() end
function M.cancel_reply() return vim.fn['wbx#cancel_reply']() end

function M.choose(choice)
  vim.ui.select(choice.items, { prompt = choice.prompt }, function(_, index)
    -- Providers may invoke the callback before closing their floating window.
    vim.schedule(function() vim.fn['wbx#chooser#done'](choice.id, index or 0) end)
  end)
end

local completion_before = {}
function M.completion(disabled)
  local buf = vim.api.nvim_get_current_buf()
  local cmp = package.loaded.cmp -- Never load/enable a completion plugin.
  if type(cmp) == 'table' and type(cmp.setup) == 'table' and type(cmp.setup.buffer) == 'function'
    and type(cmp.get_config) == 'function' then
    if disabled then
      if completion_before[buf] == nil then completion_before[buf] = { enabled = cmp.get_config().enabled } end
      cmp.setup.buffer({ enabled = false })
    elseif completion_before[buf] then
      cmp.setup.buffer({ enabled = completion_before[buf].enabled })
      completion_before[buf] = nil
    end
  end
  if disabled and vim.lsp.completion and vim.lsp.completion.enable then
    for _, client in ipairs(vim.lsp.get_clients({ bufnr = buf })) do
      pcall(vim.lsp.completion.enable, false, client.id, buf)
    end
  end
end

local function pick_result(context, id)
  -- A provider may call back before closing its own window. The original
  -- buffer/text/session/selection and latest picker are rechecked afterward.
  vim.schedule(function() vim.fn['wbx#pick_select'](context, id) end)
end
local function pick_cancel(context)
  vim.schedule(function() vim.fn['wbx#picker_cancel'](context) end)
end
local function telescope_space(context)
  local rooms = context.rooms
  local pickers = require('telescope.pickers')
  local finders, conf = require('telescope.finders'), require('telescope.config').values
  local actions, action_state = require('telescope.actions'), require('telescope.actions.state')
  pickers.new({}, {
    prompt_title = 'Webex spaces',
    finder = finders.new_table({ results = rooms, entry_maker = function(room) return { value = room.id, display = room.label, ordinal = room.label } end }),
    sorter = conf.generic_sorter({}),
    attach_mappings = function(prompt)
      actions.select_default:replace(function()
        local choice = action_state.get_selected_entry()
        actions.close(prompt)
        if choice then pick_result(context, choice.value) else pick_cancel(context) end
      end)
      return true
    end,
  }):find()
end
local function fzf_space(context)
  local rooms = context.rooms
  local fzf = require('fzf-lua')
  local choices = {}
  for i, room in ipairs(rooms) do choices[i] = string.format('%06d  %s', i, room.label) end
  fzf.fzf_exec(choices, { prompt = 'Webex spaces> ', actions = { default = function(selected)
    local index = tonumber(((selected or {})[1] or ''):match('^(%d+)'))
    if index and rooms[index] then pick_result(context, rooms[index].id) else pick_cancel(context) end
  end } })
end
function M.pick_space()
  local context = vim.fn['wbx#picker_context']()
  local rooms = context.rooms
  local picker = (vim.g.wbx_tui or {}).picker or options.picker
  -- Optional integrations must not break the native baseline, including a
  -- partial installation or a missing external executable/config module.
  if picker == 'auto' or picker == 'telescope' then
    if pcall(telescope_space, context) then return end
    context = vim.fn['wbx#picker_context']()
  end
  if picker == 'auto' or picker == 'fzf-lua' then
    if pcall(fzf_space, context) then return end
    context = vim.fn['wbx#picker_context']()
  end
  rooms = context.rooms
  vim.ui.select(rooms, { prompt = 'Open Webex space (no receipt); :WebexSpaces then / for native search', format_item = function(room) return room.label end }, function(room)
    if room then pick_result(context, room.id) else pick_cancel(context) end
  end)
end

return M
