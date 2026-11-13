import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

function headings(text: string): Set<string> {
  const anchors = new Set<string>(), counts = new Map<string, number>();
  let fence = '';
  for (const line of text.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      continue;
    }
    if (fence) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (heading) {
      const slug = heading.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
      const count = counts.get(slug) ?? 0;
      anchors.add(slug + (count ? `-${count}` : '')); counts.set(slug, count + 1);
    }
    for (const match of line.matchAll(/\bid=["']([^"']+)["']/g)) anchors.add(match[1]!);
  }
  return anchors;
}

test('read-by guidance distinguishes explicit member watermarks from receipts and presence', async () => {
  for (const path of ['README.md', 'docs/editor.md', 'doc/wbx-tui.txt']) {
    const text = await readFile(path, 'utf8');
    assert.ok(text.includes('WebexReadBy'), path);
    assert.ok(text.includes('<leader>Wav'), path);
    assert.ok(text.includes('WebexReadByToggle') && text.includes('<leader>WaV'), path);
    assert.match(text, /read_status=0/, path);
    assert.match(text, /read-through/, path);
  }
  const text = await readFile('docs/message-readers.md', 'utf8');
  for (const phrase of ['not exact read times', 'live results always remain partial', 'No read receipts reported',
    '32 message snapshots across rooms', '500 membership', '128 readers', 'never performs a refresh or reconnect',
    'collapsed by default', 'Read by Alice Example', 'Read by 2 [+]', 'person discussions'])
    assert.ok(text.includes(phrase), phrase);
});

test('relative documentation links and section anchors resolve inside the checkout', async () => {
  const files = ['README.md', 'optional/read-status-sdk/README.md', ...(await readdir('docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
  const root = resolve('.'), errors: string[] = [], cache = new Map<string, string>();
  const contents = async (file: string) => { if (!cache.has(file)) cache.set(file, await readFile(file, 'utf8')); return cache.get(file)!; };
  for (const file of files) {
    const text = await contents(file);
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1]!;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) continue;
      const [relative, fragment] = target.split('#');
      let path: string;
      try { path = relative ? resolve(dirname(file), decodeURIComponent(relative)) : resolve(file); }
      catch { errors.push(`${file}: invalid link ${target}`); continue; }
      if (path !== root && !path.startsWith(root + sep)) { errors.push(`${file}: link escapes checkout ${target}`); continue; }
      try {
        const info = await stat(path);
        if (info.isDirectory()) path = resolve(path, 'README.md');
        if (fragment) {
          const content = await contents(path);
          if (path.endsWith('.md')) {
            if (!headings(content).has(decodeURIComponent(fragment))) errors.push(`${file}: unknown section ${target}`);
          } else if (/^L\d+(?:-L\d+)?$/.test(fragment)) {
            const last = Number(fragment.match(/\d+$/)![0]);
            if (last > content.split('\n').length) errors.push(`${file}: line outside source ${target}`);
          }
        } else await stat(path);
      } catch { errors.push(`${file}: missing link ${target}`); }
    }
  }
  assert.deepEqual(errors, []);
});

test('native help advertises registered commands and unique help tags', async () => {
  const [help, plugin] = await Promise.all([readFile('doc/wbx-tui.txt', 'utf8'), readFile('plugin/wbx.vim', 'utf8')]);
  const commands = new Set([...plugin.matchAll(/^command!\s+[^\n]*?\b(Webex\w*)\b/gm)].map(match => match[1]));
  const advertised = [...help.matchAll(/^:(Webex\w*)\b/gm)].map(match => match[1]!);
  assert.ok(advertised.length > 20);
  for (const command of advertised) assert.ok(commands.has(command), `help command ${command} exists`);
  const tags = [...help.matchAll(/\*([\w:-]+(?:\.txt)?)\*/g)].map(match => match[1]);
  assert.equal(tags.length, new Set(tags).size, 'native help tags stay unique');
});
test('current reaction guidance distinguishes approved runtime, bounded legacy coverage and quiet partial observations', async () => {
  for (const path of ['README.md','docs/editor.md','doc/wbx-tui.txt']) {
    const text=await readFile(path,'utf8');
    assert.doesNotMatch(text,/No reaction runtime|not an approved runtime feature|no dedicated thread panes or reaction runtime/i,path);
    for (const command of ['WebexReactions','WebexReactionAdd','WebexReactionRemove','WebexReactionResolve','WebexReactionUnresolved']) assert.ok(text.includes(command),path+': '+command);
    assert.match(text,/five minutes/,path);
    assert.match(text,/thumbsup.*heart.*celebrate/s,path);
    assert.match(text,/quiet/,path);
    assert.match(text,/reaction_display/,path+': ASCII fallback option is discoverable');
    assert.match(text,/<leader>Wal/,path+': reaction actor list key is discoverable');
    assert.match(text,/same[\s-](?:session\/)?source|same\s+session\/source/,path+': return-to-space reuse is source-scoped, not write authority');
  }
  const help=await readFile('doc/wbx-tui.txt','utf8');
  assert.match(help,/completion_policy defaults to 'manual'/);
  assert.match(help,/Wnr = Remove Member/);
  for (const path of ['docs/editor.md','doc/wbx-tui.txt']) {
    const text=await readFile(path,'utf8');
    assert.match(text,/reaction_reads/,path+': quiet passive failures remain inspectable');
    assert.match(text,/WebexHealth/,path+': local health guidance remains discoverable');
    assert.match(text,/reactions: waiting/,path+': explicit waiting feedback is documented');
    assert.match(text,/reactions: reading/,path+': explicit reading feedback is documented');
    assert.match(text,/editor.memory/,path+': unresolved inspection is editor-local, not a server/account claim');
    assert.match(text,/original request/,path+': exact-request resolution is not replaced by text inspection');
    assert.match(text,/ASCII/,path+': text fallback and its scope are documented');
    assert.match(text,/64 entries[\s\S]{0,30}across rooms/,path+': retained presentation has one cross-room cap');
  }
});
test('the shared contextual catalogue includes every registered native command once', async () => {
  const [plugin, catalogue] = await Promise.all([readFile('plugin/wbx.vim', 'utf8'), readFile('autoload/wbx/commands.vim', 'utf8')]);
  const registered = [...plugin.matchAll(/^command!\s+[^\n]*?\b(Webex\w*)\b/gm)].map(match => match[1]!);
  const entries = [...catalogue.matchAll(/^\s*\\ \['[^']*', '(Webex\w*)',/gm)].map(match => match[1]!);
  assert.deepEqual(entries.sort(), registered.sort(), 'no second partial discovery inventory or hidden recovery commands');
});

test('current quick references advertise general attachment open/download, not image-only keys or grouped-history G receipts', async () => {
  const [readme, help, editor, catalogue] = await Promise.all([
    readFile('README.md', 'utf8'), readFile('doc/wbx-tui.txt', 'utf8'),
    readFile('docs/editor.md', 'utf8'), readFile('autoload/wbx/commands.vim', 'utf8'),
  ]);
  for (const [suffix, command] of [['o', 'WebexAttachment'], ['A', 'WebexAttachmentDownload']]) {
    assert.ok(catalogue.includes(`['${suffix}', '${command}'`));
    const row = readme.split('\n').find(line => line.startsWith('| History |') && line.includes(`\`<leader>W${suffix}\``));
    assert.ok(row?.includes(`:${command}`), `README key W${suffix} agrees with the native command catalogue`);
  }
  const keys = help.split('*wbx-tui-keys*')[1]!.split('*wbx-tui-layout*')[0]!;
  assert.match(keys, /\bo\s+Open attachment\s+A\s+Download/);
  assert.doesNotMatch(help, /\(G, R\)|G then R/);
  assert.doesNotMatch(editor, /Attachments, dedicated thread panes/);
  assert.match(editor, /canonical newest message/);
});

test('current guidance links the native option catalogue, verification index and optional isolated benchmark', async () => {
  const [readme, editor, help, architecture, performance, catalogue] = await Promise.all([
    readFile('README.md', 'utf8'), readFile('docs/editor.md', 'utf8'), readFile('doc/wbx-tui.txt', 'utf8'),
    readFile('docs/architecture.md', 'utf8'), readFile('docs/performance.md', 'utf8'), readFile('docs/native-options.md', 'utf8'),
  ]);
  for (const text of [readme, editor, help, architecture]) assert.match(text, /verification-index\.md/);
  for (const text of [editor, help]) assert.match(text, /native-options\.md/);
  assert.match(performance, /python3 scripts\/editor-performance\.py --attachments/);
  assert.match(performance, /no latency threshold/);
  assert.match(catalogue, /not.*forward keys to RPC/);
  assert.match(architecture, /drafts\.vim/);
});

test('sender-name guidance preserves independent opt-out and preview privacy', async () => {
  const paths = ['README.md', 'docs/notifications.md', 'docs/editor.md', 'doc/wbx-tui.txt'];
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /sender_names/);
    assert.match(text, /sender-names-design\.md/);
  }
  const contract = await readFile('docs/sender-names-design.md', 'utf8');
  assert.match(contract, /preview=false/);
  assert.match(contract, /sender-names-v1/);
  assert.match(contract, /never increments its/);
  assert.match(contract, /ordinary same-grant token/);
});
test('catalogue guidance reserves absence for successful discovery independently of caching', async () => {
  for (const path of ['README.md','docs/editor.md','doc/wbx-tui.txt']) {
    const text=await readFile(path,'utf8');
    assert.match(text,/independent(?:ly)? of [`]?spaces_cache/,path+': catalogue evidence is not a cache opt-in');
    assert.match(text,/successful empty list with no next page/,path+': empty page or failed reads cannot claim absence');
    assert.match(text,/:WebexRefresh/,path+': recovery is an explicit existing read command');
  }
});
test('highlighted-space unread inspection documents separate provenance without an open or receipt', async () => {
  for (const path of ['README.md','docs/editor.md','doc/wbx-tui.txt']) {
    const text=await readFile(path,'utf8');
    assert.match(text,/WebexUnreadStatus/,path+': named read-only inspection is discoverable');
    assert.match(text,/highlighted/,path+': inspection targets the cursor row, not the open destination');
    assert.match(text,/session-only local override/,path+': local display is distinct from server state');
    assert.match(text,/mark_read_on_open=1/,path+': inspection is not an explicit open/receipt');
  }
});
test('passive People presence stays automatic while details are navigable local text, not a provider lookup', async () => {
  for (const path of ['README.md', 'docs/editor.md', 'docs/native-options.md', 'doc/wbx-tui.txt']) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /automat(?:ic|ically)/, path);
    assert.match(text, /people_status/, path);
    assert.match(text, /(?:opt out|opt-out|opts out)/, path);
    assert.match(text, /native.*(?:snapshot|details)|snapshot.*native/i, path);
    assert.match(text, /WebexPeopleRefresh/, path);
    assert.match(text, /Enter\/write\s+never send/, path);
    assert.match(text, /exact[- ](?:origin|window)/, path);
  }
  const commands = await readFile('autoload/wbx/commands.vim', 'utf8');
  assert.match(commands, /'WebexPeople', 'People details'/);
  assert.doesNotMatch(commands, /People details \(presence opt-in\)/);
  assert.match(commands, /'WebexPeople', 'People details', 'any'/, 'local inspection is discoverable offline too');
  const people = await readFile('autoload/wbx/people.vim', 'utf8');
  assert.doesNotMatch(people, /popup_create|nvim_open_win|s:dismissed|s:owner_next/, 'provider/snapshot helper does not own popup geometry');
  const popup = await readFile('autoload/wbx/people_popup.vim', 'utf8');
  assert.doesNotMatch(popup, /wbx#rpc|people\.lookup|timer_start/, 'passive popup never adds provider work or a polling loop');
  const show = people.slice(people.indexOf('function! wbx#people#show()'), people.indexOf('function! wbx#people#_state()'));
  assert.doesNotMatch(show, /wbx#rpc|people\.lookup/, 'local details have no provider request path');
});
test('current presence guidance describes selected-peer refresh, status cues and concise discovery', async () => {
  for (const path of ['docs/editor.md', 'docs/people-status.md', 'doc/wbx-tui.txt']) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /60 seconds|60-second/, path);
    assert.match(text, /neutral/, path);
    assert.match(text, /selected (?:direct|peer)/, path);
  }
  const editor = await readFile('docs/editor.md', 'utf8');
  assert.match(editor, /Message actions.*Files.*Conversations.*Views.*Meetings/s);
  assert.match(editor, /`s` remains.*Pick space/);
  assert.match(editor, /without opening their conversations/);
  const protocol = await readFile('docs/editor-protocol.md', 'utf8');
  assert.match(protocol, /peopleSpaces: \['visible-v1'\]/);
  assert.match(protocol, /at most 32/);
});
test('conversation command discovery preserves explicit one-shot consent and distinguishes Server Teams from personal Sections', async () => {
  const [catalogue, help, contract] = await Promise.all([
    readFile('autoload/wbx/commands.vim', 'utf8'), readFile('doc/wbx-tui.txt', 'utf8'),
    readFile('docs/conversations-design.md', 'utf8'),
  ]);
  for (const command of ['WebexDirect', 'WebexCreateSpace', 'WebexInvite', 'WebexRemoveMember', 'WebexLeaveSpace', 'WebexTeams', 'WebexTeamFilter']) {
    assert.ok(catalogue.includes(command)); assert.ok(help.includes(command));
  }
  for (const text of [help, contract]) {
    assert.match(text, /placeholder/); assert.match(text, /separate/); assert.match(text, /unknown/i);
    assert.match(text, /personal Webex Sections/);
  }
});
