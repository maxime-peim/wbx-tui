-- Use the user's current integration (Snacks/Noice/nvim-notify), never set it up.
local M = {}
function M.show(payload)
  if type(vim.notify) ~= 'function' then return false end
  return pcall(vim.notify, payload.body, vim.log.levels.INFO, {
    title = payload.title, timeout = 5000, focusable = false,
  })
end
return M
