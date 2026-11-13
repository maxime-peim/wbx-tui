local M = {}
function M.check()
  vim.health.start('wbx-tui editor client')
  if vim.fn.executable('node') == 1 then vim.health.ok('Node executable found; backend requires Node 22.12+')
  else vim.health.error('Node is missing') end
  if vim.fn.executable('tmux') == 1 then vim.health.ok('tmux found')
  else vim.health.warn('tmux missing: messaging still works; meetings require it') end
  if vim.fn.executable('kitty') == 1 then vim.health.ok('Kitty found; display/server availability is checked at launch')
  else vim.health.warn('Kitty missing: configure editor meeting fallback') end
  local image_status = require('wbx-tui.images').status(vim.fn.bufnr('wbx://history'))
  vim.health.info('Message images: ' .. image_status.mode .. ' (' .. image_status.reason .. '); output=' .. image_status.output)
  vim.health.info('OAuth and private credentials stay in Node. No account or network request was made by this check.')
end
return M
