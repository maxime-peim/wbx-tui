import notes from './plugins/notes.mjs';

/** @param {import('../src/extension-api.js').ExtensionAPI} wbx */
export default function setup(wbx) {
  wbx.configure({ messaging: { lineNumbers: 'relative' } });
  wbx.themes.add('personal', { accent: '#82aaff', focus: '#c3e88d' });
  wbx.themes.use('personal');

  wbx.commands.add('user.greet', (context, args) => {
    wbx.notify(`Hello ${args || 'there'} · ${context.room?.title ?? 'no space selected'}`);
  });
  wbx.keymap.set('normal', '<leader> H', 'user.greet');
  wbx.keymap.set('normal', '<leader> N', () => wbx.focus('user.notes'));
  wbx.ui.statusline(context => ({
    left: ` ${context.mode.toUpperCase()}  ${context.room?.title ?? 'Choose a space'}  [${context.focus}]`,
    right: `${context.messages.length} recent messages · ${context.draft.text.length}/1000 `,
  }));
  wbx.ui.tabline(context => ` My Webex workspace  /  ${context.layout} `);
  wbx.events.on('ready', () => wbx.notify('User init loaded · Space H greets · :user.note TEXT adds a local note.'));
  return notes(wbx);
}
