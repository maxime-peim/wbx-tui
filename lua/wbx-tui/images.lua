-- Memory-only Kitty Unicode placements. No cache files, URL fetches or plugin setup.
local M = {}
local ns = vim.api.nvim_create_namespace('wbx-tui-images')
local owned = {}
local registered = {}
local snapshots = {}
local failed = {}
local last_render = {}
local highlight_epoch = 0
local gate_reason = 'not-checked'
local marks = { 0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F, 0x0346, 0x034A, 0x034B, 0x034C,
  0x0350, 0x0351, 0x0352, 0x0357, 0x035B, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
  0x036A, 0x036B, 0x036C, 0x036D, 0x036E, 0x036F, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597 }
local esc = string.char(27)
local passthrough
local passthrough_route
local function route()
  local outputs = {}
  for _, ui in ipairs(vim.api.nvim_list_uis()) do outputs[#outputs + 1] = tostring(ui.chan) .. ':' .. tostring(ui.stdout_tty) end
  table.sort(outputs)
  return table.concat({ tostring(vim.api.nvim_ui_send ~= nil), table.concat(outputs, ','),
    vim.env.TERM or '', vim.env.TERM_PROGRAM or '', vim.env.TMUX or '', vim.env.TMUX_PANE or '',
    vim.env.ZELLIJ or '', vim.env.KITTY_WINDOW_ID or '' }, '\0')
end
local function wire(data)
  if vim.env.TMUX then return esc .. 'Ptmux;' .. data:gsub(esc, esc .. esc) .. esc .. '\\' end
  return data
end
local function write(data)
  -- Neovim 0.12 separates the core from its TUI. The core need not own a
  -- controlling /dev/tty; route through the UI rather than silently dropping
  -- the transfer. Older built-in TUIs use their original stdout path.
  if vim.api.nvim_ui_send then return pcall(vim.api.nvim_ui_send, data) end
  return pcall(function() assert(io.stdout:write(data)); assert(io.stdout:flush()) end)
end
function M.supported(explicit)
  local option = (vim.g.wbx_tui or {}).images
  if not explicit and (option == false or option == 0) then gate_reason = 'disabled'; return false end
  if option == 'unicode' then gate_reason = 'configured-unicode'; return false end
  if not vim.o.termguicolors then gate_reason = 'truecolor-disabled'; return false end
  local uis = vim.api.nvim_list_uis()
  if #uis == 0 then gate_reason = 'no-terminal-ui'; return false end
  if vim.api.nvim_ui_send then
    local terminal_ui = false
    for _, ui in ipairs(uis) do if ui.stdout_tty then terminal_ui = true end end
    if not terminal_ui then gate_reason = 'no-terminal-output'; return false end
  elseif vim.fn.has('ttyout') ~= 1 then
    gate_reason = 'no-terminal-output'; return false
  end
  local term = (vim.env.TERM or ''):lower()
  local program = (vim.env.TERM_PROGRAM or ''):lower()
  if vim.env.ZELLIJ then gate_reason = 'unsupported-multiplexer'; return false end
  if vim.env.TMUX then
    local current = route()
    if passthrough_route ~= current then passthrough = nil; passthrough_route = current end
    if passthrough == nil then
      passthrough = false
      local pane = vim.env.TMUX_PANE or ''
      if pane:match('^%%%d+$') and vim.fn.executable('tmux') == 1 then
        local ok, result = pcall(function()
          return vim.system({ 'tmux', 'show-options', '-A', '-p', '-v', '-t', pane, 'allow-passthrough' }, { text = true }):wait(200)
        end)
        if ok and result.code == 0 then passthrough = vim.trim(result.stdout or '') == 'on' or vim.trim(result.stdout or '') == 'all' end
      end
    end
    if not passthrough then gate_reason = 'tmux-passthrough-unavailable'; return false end
  end
  -- Only terminals known to implement Unicode placements; never guess from COLORTERM.
  local supported = term:find('kitty', 1, true) ~= nil or term:find('ghostty', 1, true) ~= nil or program == 'kitty' or program == 'ghostty' or vim.env.KITTY_WINDOW_ID ~= nil
  gate_reason = supported and 'eligible' or 'unsupported-terminal'
  return supported
end
local function placement(id, columns, rows)
  return wire(esc .. '_Ga=p,U=1,i=' .. id .. ',p=1,c=' .. columns .. ',r=' .. rows .. ',C=1,q=2' .. esc .. '\\')
end
function M.transmission(id, png, columns, rows)
  local parts = {}
  for at = 1, #png, 4096 do
    parts[#parts + 1] = wire(esc .. '_G' .. (at == 1 and ('a=t,f=100,i=' .. id .. ',') or '')
      .. 'q=2,m=' .. (at + 4096 <= #png and '1' or '0') .. ';' .. png:sub(at, at + 4095) .. esc .. '\\')
  end
  parts[#parts + 1] = placement(id, columns or 40, rows or 12)
  return table.concat(parts)
end
function M.snapshot_begin(key)
  assert(type(key) == 'string' and key:match('^png%-%d+$') and not snapshots[key])
  snapshots[key] = { parts = {}, bytes = 0, verified = false }
end
function M.snapshot_append(key, data)
  local value = assert(snapshots[key])
  assert(not value.verified and type(data) == 'string' and #data <= 65536 and #value.parts < 123 and value.bytes + #data <= 8000000)
  value.parts[#value.parts + 1] = data
  value.bytes = value.bytes + #data
end
function M.snapshot_verify(key) assert(snapshots[key]).verified = true end
function M.snapshot_piece(key, seq)
  local value = assert(snapshots[key])
  assert(value.verified)
  return assert(value.parts[seq + 1])
end
function M.snapshot_drop(key) snapshots[key] = nil end
local function same_png(a, b)
  if type(a) == 'table' or type(b) == 'table' then
    return type(a) == 'table' and type(b) == 'table' and a.snapshot == b.snapshot
  end
  return a == b
end
local function delete_pixels(image)
  write(wire(esc .. '_Ga=d,d=I,i=' .. image.id .. ',q=2' .. esc .. '\\'))
end
local function upload(buf, identity, item)
  local key, output_route = item.png.snapshot, route()
  local value = assert(snapshots[key])
  assert(value.verified and #value.parts > 0)
  local part, at, first = 1, 1, true
  item.uploading = true
  local pump
  pump = function()
    local state = owned[buf]
    if not state or state.images[identity] ~= item then return end
    if route() ~= output_route or not snapshots[key] or not vim.api.nvim_buf_is_valid(buf)
      or vim.b[buf].wbx_render_tick ~= vim.b[buf].changedtick or #vim.fn.win_findbuf(buf) == 0
      or not M.supported(true) then M.clear(buf); return end
    local ok = pcall(function()
      -- One bounded batch per scheduled turn, never table.concat of the PNG.
      for _ = 1, 16 do
        local data = value.parts[part]
        local final = part == #value.parts and at + 4096 > #data
        local packet = wire(esc .. '_G' .. (first and ('a=t,f=100,i=' .. item.id .. ',') or '')
          .. 'q=2,m=' .. (final and '0' or '1') .. ';' .. data:sub(at, at + 4095) .. esc .. '\\')
        assert(write(packet))
        first = false
        at = at + 4096
        if at > #data then part, at = part + 1, 1 end
        if final then
          assert(write(placement(item.id, item.columns, item.rows)))
          item.uploading = false
          M.refresh(buf)
          return
        end
      end
      vim.schedule(pump)
    end)
    if not ok and owned[buf] and owned[buf].images[identity] == item then
      M.clear(buf)
      failed[buf] = { route = output_route, images = { [identity] = 'terminal-write-failed' } }
      M.refresh(buf)
    end
  end
  vim.schedule(pump)
end
function M.clear(buf)
  local state = owned[buf]
  if state then
    -- A replacement UI/terminal cannot clean an inaccessible old terminal. Never
    -- send an old route's image-ID deletions into a different output route.
    if state.route == route() then for _, image in pairs(state.images) do delete_pixels(image) end end
    if vim.api.nvim_buf_is_valid(buf) then vim.api.nvim_buf_clear_namespace(buf, ns, 0, -1) end
  end
  owned[buf] = nil
  failed[buf] = nil
  last_render[buf] = nil
end
local function forget(buf)
  M.clear(buf)
  registered[buf] = nil
end
local function delete_image(buf, image)
  delete_pixels(image)
  for _, place in pairs(image.places) do
    for _, id in ipairs(place.marks) do vim.api.nvim_buf_del_extmark(buf, ns, id) end
  end
end
function M.status(buf)
  local ret = vim.deepcopy(last_render[buf] or { mode = 'unicode', reason = 'not-rendered', images = 0 })
  ret.output = vim.api.nvim_ui_send and 'ui-send' or 'legacy-stdout'
  if not buf or not vim.api.nvim_buf_is_valid(buf) or (vim.b[buf].wbx_kind ~= 'history' and vim.b[buf].wbx_kind ~= 'image') then
    ret.mode, ret.reason, ret.images = 'off', 'no-history', 0
  end
  return ret -- Counts/enums only. No image data, URLs, IDs or terminal probes.
end
local function render(buf)
  if not vim.api.nvim_buf_is_valid(buf) then forget(buf); return end
  local images = registered[buf] or {}
  local viewer = vim.b[buf].wbx_kind == 'image' and vim.api.nvim_buf_get_name(buf) == 'wbx://image'
  local valid = (viewer or vim.b[buf].wbx_kind == 'history' and vim.api.nvim_buf_get_name(buf) == 'wbx://history')
    and vim.bo[buf].buftype == 'nofile' and vim.b[buf].wbx_render_tick == vim.b[buf].changedtick
  local windows = vim.fn.win_findbuf(buf)
  local reason = not valid and 'view-not-owned-or-edited' or #images == 0 and 'no-ready-images' or #windows == 0 and 'history-hidden' or nil
  local supported = not reason and M.supported(viewer)
  if not reason and not supported then reason = gate_reason end
  if supported then
    for _, win in ipairs(windows) do
      if vim.api.nvim_win_get_width(win) - vim.fn.getwininfo(win)[1].textoff < 46 then supported = false; reason = 'history-too-narrow' end
    end
  end
  if not supported then
    if owned[buf] then M.clear(buf) end
    failed[buf] = nil
    if not valid then registered[buf] = nil end
    last_render[buf] = { mode = 'unicode', reason = reason, images = #images }
    return
  end
  local current_route = route()
  if owned[buf] and owned[buf].route ~= current_route then M.clear(buf) end
  if failed[buf] and failed[buf].route ~= current_route then failed[buf] = nil end
  failed[buf] = failed[buf] or { route = current_route, images = {} }
  local previous = owned[buf] and owned[buf].images or {}
  local next_images = {}
  owned[buf] = { route = current_route, images = vim.tbl_extend('force', {}, previous) }
  local sent = 0
  local maxcols, maxrows = 120, 40
  if viewer then
    for _, win in ipairs(windows) do
      maxcols = math.min(maxcols, vim.api.nvim_win_get_width(win) - vim.fn.getwininfo(win)[1].textoff - 2)
      maxrows = math.min(maxrows, math.max(1, vim.api.nvim_win_get_height(win) - 3))
    end
  end
  local occurrences = {}
  local tick = vim.b[buf].changedtick
  for _, image in ipairs(images) do
    local columns, rows = 40, 12
    if viewer then
      -- Approximate terminal cells as twice as tall as wide. The transferred
      -- pixels are independently high-resolution; placement never upscales a thumb.
      local ratio = image.width / image.height
      columns = math.max(1, math.min(maxcols, math.floor(maxrows * ratio * 2)))
      rows = math.max(1, math.min(maxrows, math.ceil(columns / ratio / 2)))
    end
    local item = next_images[image.id] or previous[image.id]
    if item and not same_png(item.png, image.png) then
      if next_images[image.id] then error('Conflicting image identity') end
      delete_image(buf, item)
      previous[image.id] = nil
      owned[buf].images[image.id] = nil
      item = nil
    end
    if not item and not failed[buf].images[image.id] then
      local id = math.random(1, 0xffffff)
      local group = 'WbxImage' .. id
      if type(image.png) == 'table' then
        item = { id = id, group = group, png = image.png, columns = columns, rows = rows, places = {} }
        owned[buf].images[image.id] = item
        upload(buf, image.id, item)
      elseif write(M.transmission(id, image.png, columns, rows)) then
        item = { id = id, group = group, png = image.png, columns = columns, rows = rows, places = {} }
        owned[buf].images[image.id] = item -- Also clean up a subsequent highlight/mark failure.
      else
        failed[buf].images[image.id] = 'terminal-write-failed'
      end
    end
    if not item then reason = failed[buf].images[image.id] end
    if item and item.uploading then
      item.columns, item.rows = columns, rows
      next_images[image.id] = item
      occurrences[image.id] = 0
      reason = 'transferring'
    elseif item then
      if item.columns ~= columns or item.rows ~= rows then
        if not write(placement(item.id, columns, rows)) then error('Image placement failed') end
        item.columns, item.rows = columns, rows
      end
      if item.highlight_epoch ~= highlight_epoch then
        vim.api.nvim_set_hl(0, item.group, { fg = item.id, nocombine = true })
        item.highlight_epoch = highlight_epoch
      end
      next_images[image.id] = item
      sent = sent + 1
      local occurrence = (occurrences[image.id] or 0) + 1
      occurrences[image.id] = occurrence
      local place = item.places[occurrence] or { marks = {} }
      item.places[occurrence] = place
      if place.row ~= image.row or place.columns ~= columns or place.rows ~= rows or place.tick ~= tick then
        for row = 0, rows - 1 do
          local id = place.marks[row + 1]
          local position = id and vim.api.nvim_buf_get_extmark_by_id(buf, ns, id, {}) or {}
          if place.columns ~= columns or position[1] ~= image.row + row - 1 or position[2] ~= 0 then
            local placeholder = vim.fn.nr2char(0x10eeee) .. vim.fn.nr2char(marks[row + 1]) .. vim.fn.nr2char(marks[1]) .. vim.fn.nr2char(marks[1])
              .. string.rep(vim.fn.nr2char(0x10eeee), columns - 1)
            place.marks[row + 1] = vim.api.nvim_buf_set_extmark(buf, ns, image.row + row - 1, 0, {
              id = id, virt_text = { { placeholder, item.group } }, virt_text_pos = 'overlay', hl_mode = 'replace', priority = 150,
            })
          end
        end
        for row = #place.marks, rows + 1, -1 do
          vim.api.nvim_buf_del_extmark(buf, ns, place.marks[row]); place.marks[row] = nil
        end
        place.row, place.columns, place.rows, place.tick = image.row, columns, rows, tick
      end
    end
  end
  for key, image in pairs(previous) do if not next_images[key] then delete_image(buf, image) end end
  for key, image in pairs(next_images) do
    for occurrence = #image.places, occurrences[key] + 1, -1 do
      for _, id in ipairs(image.places[occurrence].marks) do vim.api.nvim_buf_del_extmark(buf, ns, id) end
      image.places[occurrence] = nil
    end
  end
  owned[buf].images = next_images
  last_render[buf] = { mode = sent > 0 and 'kitty' or 'unicode', reason = reason or 'sent-to-ui', images = #images, placements = sent, code = failed[buf].code }
end
function M.refresh(buf)
  -- Graphics are optional. A terminal/renderer failure must leave readable
  -- Unicode text, not interrupt state delivery or native draft ownership.
  local ok, error = pcall(render, buf)
  if not ok then
    pcall(M.clear, buf)
    local code = tostring(error):match('E%d+')
    failed[buf] = { route = route(), images = {}, code = code }
    for _, image in ipairs(registered[buf] or {}) do failed[buf].images[image.id] = 'renderer-error' end
    last_render[buf] = { mode = 'unicode', reason = 'renderer-error', images = #(registered[buf] or {}), code = code }
  end
end
function M.register(buf, images)
  -- Full, detached payloads cross the Vim/Lua boundary only on projection change.
  -- Exact PNG comparison above detects same-ID byte changes; ID is not authority.
  registered[buf] = vim.deepcopy(images)
  failed[buf] = nil -- a new projection/explicit registration may retry optional graphics, never network work
  M.refresh(buf)
end
function M.render(buf, images) M.register(buf, images) end -- compatibility for existing local integrations
local group = vim.api.nvim_create_augroup('WbxImageOwnership', { clear = true })
vim.api.nvim_create_autocmd({ 'BufWipeout', 'BufUnload', 'BufFilePost' }, { group = group, callback = function(ev) forget(ev.buf) end })
vim.api.nvim_create_autocmd('BufWinLeave', { group = group, callback = function(ev)
  if registered[ev.buf] then vim.schedule(function() M.refresh(ev.buf) end) end
end })
vim.api.nvim_create_autocmd('ColorScheme', { group = group, callback = function() highlight_epoch = highlight_epoch + 1 end })
vim.api.nvim_create_autocmd({ 'UIEnter', 'UILeave' }, { group = group, callback = function()
  vim.schedule(function() for buf in pairs(registered) do M.refresh(buf) end end)
end })
vim.api.nvim_create_autocmd('OptionSet', { group = group, pattern = 'buftype', callback = function()
  local buf = vim.api.nvim_get_current_buf()
  if registered[buf] and vim.bo[buf].buftype ~= 'nofile' then forget(buf) end
end })
vim.api.nvim_create_autocmd('VimLeavePre', { group = group, callback = function() for buf in pairs(registered) do forget(buf) end end })
return M
