/** A local-only module: never sends, saves messages, or accesses credentials. */
export default function notes(wbx) {
  const notes = ['Local scratch notes', 'Use :user.note TEXT to add a note.'];
  wbx.panels.add('user.notes', context => [
    `Space: ${context.room?.title ?? '(none)'}`, '', ...notes,
  ]);
  wbx.commands.add('user.note', (_context, args) => {
    if (args) { notes.push(args.slice(0, 200)); if (notes.length > 100) notes.splice(2, 1); }
    wbx.notify('Local note updated; nothing sent to Webex.');
  });
  wbx.layouts.add('notes', {
    direction: 'vertical', ratio: .23, children: [
      { panel: 'rooms' },
      { direction: 'vertical', ratio: .72, children: [
        { direction: 'horizontal', ratio: .72, children: [{ panel: 'messages' }, { panel: 'compose' }] },
        { panel: 'user.notes' },
      ] },
    ],
  });
  wbx.layouts.use('notes');
  return () => { notes.length = 0; };
}
