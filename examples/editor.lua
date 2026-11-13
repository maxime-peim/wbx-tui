-- Plain Neovim init.lua snippet, NOT a LazyVim plugin spec.
-- For LazyVim, use examples/lazyvim.lua in lua/plugins/wbx-tui.lua instead.
-- Add this checkout with your package manager; build: npm ci && npm run build.
require('wbx-tui').setup({
  mappings = true, -- Enter opens a space; i composes; Backspace returns
  send_with_ctrl_s = false, -- keep the save key; Normal <localleader>s sends
  statusline = false,
  picker = 'auto', -- installed Telescope/fzf-lua or native vim.ui.select
  treesitter = true, -- only an already-installed Markdown parser
  which_key = true, -- optional; no installation is attempted
  meeting = { display = 'auto', fallback = 'editor', leave_on_exit = false },
  on_buffer = function(event)
    if event.kind == 'compose' or event.kind == 'history' then
      vim.bo[event.bufnr].textwidth = 0
      vim.bo[event.bufnr].spelllang = 'en'
    end
  end,
})

vim.keymap.set('n', '<leader>wo', '<Plug>(WebexOpen)')
vim.keymap.set('n', '<leader>wc', '<Plug>(WebexCompose)')
-- Native j/k/Enter navigation needs no command or picker. Existing buffer-local
-- FileType mappings win over defaults if you want different keys.
-- Use require('wbx-tui').status as a lualine component if desired.
-- Keep your colorscheme, completion and native modes. No connection starts here.
-- OAuth/clientSecret belong only in the private engine JSON, never this file.
