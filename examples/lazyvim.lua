-- ~/.config/nvim/lua/plugins/wbx-tui.lua (LazyVim plugin spec)
return {
  {
    dir = vim.fn.expand('~/src/wbx-tui'), -- change to your checkout
    name = 'wbx-tui',
    lazy = false, -- register commands at startup; does NOT start the engine
    main = 'wbx-tui', -- opts are passed to require('wbx-tui').setup()
    build = 'npm ci && npm run build',
    opts = {
      mappings = true, -- j/k, Enter opens a space; i composes; Backspace returns
      send_with_ctrl_s = false, -- keep LazyVim's save key; Normal <localleader>s sends
      statusline = false, -- keep LazyVim's statusline
      picker = 'builtin', -- optional picker uses vim.ui.select; Enter needs none
      meeting = { display = 'auto', fallback = 'editor', leave_on_exit = false },
    },
  },
}
