# wbx-tui configuration and extensions

For the primary Vim/Neovim plugin, use **[the editor guide](editor.md)**:
`g:wbx_tui` / `require('wbx-tui').setup`, native mappings, filetypes and hooks.
The JSON engine configuration below still controls OAuth/media/tmux. The custom
standalone init API is a compatibility interface, not editor configuration.

| Interface | Supported customization | Not provided |
| --- | --- | --- |
| Vim/Neovim plugin | Native Vimscript/Lua, installed editor plugins, FileType/User hooks, `<Plug>` maps and optional integrations | No automatic plugin/parser installation or replacement editor |
| Engine JSON | Validated declarative settings for OAuth/media/tmux and compatibility UI | No executable JSON |
| Standalone `messages --init MODULE` | Explicitly trusted executable Node module and imports, API v1 below | No sandbox, auto-discovery or plugin package installer |

“No plugin installer” must not be read as “no executable extensions”: the trusted
init interface is supported. It is not a media/pane-extension API. The broader
[source/runtime map](architecture.md) shows which clients load it.

Native editor startup now projects only its relevant OAuth settings from the
shared bounded, permission-checked JSON reader. Compatibility-only key/layout
errors do not block native OAuth; launching/reloading compatibility clients still
performs full validation. Secret-file permissions and expected-profile checks
remain strict. Focused config/dev checks and final integrated gates are recorded
in [implementation progress](implementation-progress.md), not implied by the
historical validation table.

Native `leader_prefix` (default `<leader>W`), `folds` (default true),
`people_status` (default true), `rooms_width` and `compose_height` belong in
Vimscript/Lua setup, not this engine JSON. `mappings=false` opts out of both the
global command family and buffer defaults. The current command catalogue,
direct reset/fold/details actions and per-buffer `b:wbx_folds` opt-out are
documented in [the native guide](editor.md#global-command-family).
Native `read_status`, `spaces_cache` and `notifications.sender_names` also default
on, with explicit false/0 opt-outs and unchanged SDK/grant prerequisites.
See [the defaults follow-up](people-popup-design.md); nothing connects at startup.

The default JSON file is **`~/.config/wbx-tui/config.json`**, or
`$XDG_CONFIG_HOME/wbx-tui/config.json`. Precedence is `--config PATH`, then
`WBX_CONFIG`, then the default path. Existing files in other directories are not
moved or overwritten. Both meeting and messaging commands share this lookup.

Native meeting sessions inherit the tmux server's status/border appearance and
keybindings by default. `"tmux": {"appearance": "theme"}` explicitly opts into
the engine's scoped status and border theme; `"inherit"` restores inheritance.
Changing the in-pane video UI theme alone does not override tmux appearance.

`npm start -- messages` automatically uses the file's public `oauth` profile.
It does not silently switch to an access-token prompt if that profile is absent;
developer-token mode requires `--auth token`. `messages --check-auth` checks the
selected profile without logging in. Put optional `oauth.clientSecret` in this
file to avoid its prompt; the file must be owned by you with mode 0600 (or 0400).
It is stripped from all public config output and only read by the Node OAuth
owner. Without it, the secret is requested locally. Access/refresh grants are not
stored in JSON or inherited from OpenCode/MCP. See [OAuth setup](oauth.md).

## Beyond settings: programmable init API v1

JSON stays data-only. To explicitly trust executable local configuration:

```sh
npm start -- messages --demo --init examples/init.mjs
```

You may keep your own module at `~/.config/wbx-tui/init.mjs`, but it is only
executed when supplied through `--init`. It is **not** auto-discovered. `--help`,
`--print-config` and `--check-auth` never execute it, even if supplied.

**Security:** init modules and their imports have full Node/local-user privileges,
not a sandbox. Audit them before using a real account. The API does not supply
OAuth credentials, profile details, SDK objects or transport handles, but trusted
code can access its process, filesystem, environment and network directly.
Context snapshots include conversation text and drafts; authorize that access.

```js
export default function setup(wbx) {
  wbx.configure({ leader: ',', messaging: { lineNumbers: 'relative' } });
  wbx.commands.add('user.destination', (context, args) => {
    wbx.notify(`${args}: ${context.room?.title ?? '(none)'}`);
  });
  wbx.keymap.set('normal', '<leader> d', 'user.destination Selected');
  wbx.keymap.set('normal', '<leader> i', () => {
    wbx.action('focus.compose');
    wbx.action('insert');
  });
  const unsubscribe = wbx.events.on('room.changed', context => {
    wbx.notify(`Destination: ${context.room?.title ?? '(none)'}`);
  });
  return () => unsubscribe();
}
```

The typed contract is [`src/extension-api.ts`](../src/extension-api.ts).
[`examples/init.mjs`](../examples/init.mjs) imports a separate
[`notes` plugin](../examples/plugins/notes.mjs) that adds a local scratch panel.
This example never sends messages or contacts Webex.

| API | Purpose |
|---|---|
| `context()` | Immutable mode/focus/layout, selected room, latest 50 loaded messages, draft text/cursor |
| `configure(options)` | Validated leader, theme and messaging settings; not credentials |
| `keymap.set(mode, keys, rhs)` | Action, action array, callback, or `null` to unbind |
| `commands.add('user.NAME', handler)` | Custom command; `(context, argumentString)`; completion included |
| `events.on(event, handler)` | Subscribe and obtain an unsubscribe function |
| `panels.add('user.NAME', render)` | `(context, width, height) => string[]` custom text panel |
| `layouts.add(name, tree)` / `.use(name)` | Register/select split layouts with custom panels |
| `themes.add(name, colors)` / `.use(name)` | Named palettes, also available to `:colorscheme` |
| `ui.statusline(render)` | Return `{left, right?}` from context |
| `ui.tabline(render)` | Custom buffer-line text; auth/demo indicator remains visible |
| `action(action)` / `focus(panel)` | Invoke validated actions or focus a panel |
| `notify(text)` / `onCleanup(fn)` | Bounded notification and resource cleanup |

Custom panels/commands use `user.*` names. JSON mappings may reference registered
commands. Without their module, they fail closed with an unavailable notice;
saved custom panels show a placeholder. Required core panels remain present.
Printable Insert input and Ctrl+C retain their safety boundaries. Trusted hooks
can invoke `send`: audit automation and never automatically replay an uncertain
delivery.

## Events and reload

Events: `ready`, `room.changed`, `messages.changed`, `mode.changed`,
`draft.changed`, `focus.changed`, `config.reloaded`, `unload`, `quit`.

`:reload` validates JSON before replacing the current generation. Invalid JSON
leaves it running. Otherwise old registrations/resources are disposed, the top-level
init is re-imported, and drafts, selected room and the connection are retained.
`unload` receives `reload`, `quit` or `failed` as its argument; `quit` is only for
actual application shutdown. Return cleanup from setup or use `onCleanup()`.

Setup has a five-second asynchronous deadline, cleanup a two-second total
deadline. Failed setup restores its base configuration. Late API mutations are
refused, and late-returned cleanup is called. These deadlines cannot interrupt
synchronous loops or undo arbitrary imported side effects. Node caches imported
dependencies; keep state inside setup functions. Restart after 100 init loads.

Handlers may be asynchronous; each has at most one invocation in flight, and
events while busy are skipped rather than queued indefinitely. Renderers must be
synchronous, pure and bounded. Bad renderers are disabled; output is sanitized
plain text, not executable ANSI. Raw callback/provider errors are not printed.

This standalone API is a **messaging extensibility foundation**, not Neovim parity. Lua/Neovim
plugins, arbitrary custom modes, full operators/registers, plugin package
installation, unrestricted widget replacement and custom highlight-group trees
are not implemented. Meeting media/pane extensions also remain future work.
This does not exclude the finite native adapter to existing owned meeting
controls; see [native meeting integration](native-meeting-design.md). It is not
a new extension API or renderer.

Verify with `npm run test:messaging`: it includes real-tmux default-path lookup,
function maps, custom panels/status lines, reload, cleanup and retained drafts.
