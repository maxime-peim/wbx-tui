-- Contract fixtures for optional tools, not claims about installed third-party
-- plugins. All selection requests use the real engine's account-free demo.
local wbx = require('wbx-tui')
local rooms = wbx.state().rooms
local native_calls, pick_index = 0, 2
local original_select = vim.ui.select
vim.ui.select = function(entries, opts, callback)
  assert(#entries == 3 and opts.format_item(entries[1]) == entries[1].label)
  for _, entry in ipairs(entries) do
    assert(not entry.label:find(entry.id, 1, true), 'space IDs stay internal, not in picker labels')
  end
  native_calls = native_calls + 1
  local chosen
  for _, entry in ipairs(entries) do if entry.id == rooms[pick_index].id then chosen = entry end end
  assert(chosen, 'the picker lost the requested room after recent-activity reordering')
  callback(chosen)
end
local function selected(index)
  assert(vim.wait(2000, function()
    local state = wbx.state()
    return state.room ~= vim.NIL and state.room.id == rooms[index].id and state.ready
      and vim.api.nvim_buf_get_name(0) == 'wbx://history'
  end), 'picker did not select the expected listed space')
end
wbx.setup({ picker = 'builtin', treesitter = false, which_key = false, meeting = { display = 'editor' } })
wbx.setup({ meeting = { fallback = 'error' } })
assert(vim.g.wbx_tui.meeting.display == 'editor' and vim.g.wbx_tui.meeting.fallback == 'error', 'partial setup lost existing meeting options')
wbx.pick_space(); selected(2); assert(native_calls == 1)

local replacement, closed, telescope_calls
package.loaded['telescope.finders'] = { new_table = function(spec)
  local chosen
  for _, room in ipairs(spec.results) do if room.id == rooms[3].id then chosen = room end end
  local entry = spec.entry_maker(chosen)
  assert(entry.value == rooms[3].id and not entry.display:find(rooms[3].id, 1, true))
  assert(entry.ordinal == entry.display, 'search text cannot reintroduce hidden space IDs')
  return spec
end }
package.loaded['telescope.config'] = { values = { generic_sorter = function() return 'sorter' end } }
package.loaded['telescope.actions'] = {
  select_default = { replace = function(_, callback) replacement = callback end },
  close = function(prompt) assert(prompt == 17); closed = true end,
}
package.loaded['telescope.actions.state'] = { get_selected_entry = function() return { value = rooms[3].id } end }
package.loaded['telescope.pickers'] = { new = function(_, spec)
  assert(spec.sorter == 'sorter')
  return { find = function()
    telescope_calls = (telescope_calls or 0) + 1
    assert(spec.attach_mappings(17)); replacement()
  end }
end }
wbx.setup({ picker = 'telescope' }); wbx.pick_space(); selected(3)
assert(closed and telescope_calls == 1 and native_calls == 1)

-- A partial Telescope install must fall back instead of throwing a raw error.
package.loaded['telescope.config'] = nil
package.preload['telescope.config'] = function() error('synthetic optional dependency failure') end
pick_index = 1
wbx.pick_space(); selected(1); assert(native_calls == 2)

local fzf_calls = 0
local good_fzf = { fzf_exec = function(choices, opts)
  local index
  for i, entry in ipairs(wbx.state().rooms) do if entry.id == rooms[2].id then index = i end end
  assert(index and choices[index]:match('^' .. string.format('%06d  ', index)))
  assert(not choices[index]:find(rooms[2].id, 1, true))
  fzf_calls = fzf_calls + 1
  opts.actions.default({ choices[index] })
end }
package.loaded['fzf-lua'] = good_fzf
wbx.setup({ picker = 'fzf-lua' }); wbx.pick_space(); selected(2)
assert(fzf_calls == 1 and native_calls == 2)
package.loaded['fzf-lua'] = { fzf_exec = function() error('synthetic missing fzf executable') end }
wbx.pick_space(); selected(1); assert(native_calls == 3)

-- Auto can skip a broken Telescope and use fzf-lua; common Vimscript settings
-- must also work without another Lua setup call.
package.loaded['fzf-lua'] = good_fzf
wbx.setup({ picker = 'auto' }); wbx.pick_space(); selected(2)
assert(fzf_calls == 2 and native_calls == 3)
local common = vim.g.wbx_tui; common.picker = 'builtin'; vim.g.wbx_tui = common
wbx.pick_space(); selected(1); assert(native_calls == 4)

local wk_calls, buffer_calls, registered = 0, 0, {}
package.loaded['which-key'] = { add = function(entries)
  for _, entry in ipairs(entries) do
    assert(entry.hidden == nil or type(entry.hidden) == 'boolean', 'which-key hidden does not support dynamic getters')
    registered[entry[1]] = entry
  end
  wk_calls = wk_calls + 1
end }
wbx.setup({ which_key = true, treesitter = false, on_buffer = function(event)
  assert(event.kind == 'compose'); buffer_calls = buffer_calls + 1
end })
wbx.setup({ which_key = true }) -- replaces the integration group, not duplicates
assert(wk_calls == 2, 'groups are named before any buffer event')
local prefix = vim.fn['wbx#commands#groups']()[1].lhs
assert(registered[prefix].group() == 'Webex')
for suffix, name in pairs({ a = 'Message actions', u = 'Files', n = 'Conversations', v = 'Views', m = 'Meetings' }) do
  assert(registered[prefix .. suffix].group() == name)
end
assert(registered[prefix .. 's'].group == nil and registered[prefix .. 's'].desc() == 'Pick space')
local treesitter_before = package.loaded['vim.treesitter']
local buffer = vim.fn['wbx#buffers']().drafts['demo-general']
vim.g.wbx_tui_event = { bufnr = buffer, kind = 'compose' }
vim.api.nvim_exec_autocmds('User', { pattern = 'WbxBuffer' })
assert(wk_calls == 3 and buffer_calls == 1, 'setup duplicated callbacks')
assert(registered['<Plug>(WebexSend)'].buffer == buffer)
local remove = registered[prefix .. 'nr']
assert(remove.desc() == 'Remove member' and remove.real)
vim.keymap.set('n', prefix .. 'nr', '<Nop>', { buffer = buffer })
vim.api.nvim_buf_call(buffer, function() assert(remove.desc() == nil, 'user shadows are not advertised as Webex actions') end)
vim.keymap.del('n', prefix .. 'nr', { buffer = buffer })
wbx.setup({ mappings = false })
assert(remove.desc() == nil and registered[prefix .. 'n'].group() == nil, 'mapping opt-out retires stale which-key labels')
wbx.setup({ mappings = true })
local before = wk_calls
assert(package.loaded['vim.treesitter'] == treesitter_before, 'disabled parser integration was activated')
package.loaded['which-key'] = nil
package.preload['which-key'] = function() error('synthetic unavailable which-key') end
vim.api.nvim_exec_autocmds('User', { pattern = 'WbxBuffer' })
assert(wk_calls == before and buffer_calls == 2, 'optional which-key failure broke native hooks')
vim.ui.select = original_select
