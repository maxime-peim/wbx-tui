/** In-process demo REST translation only; no live transport, admission or sandbox state. */
import type { MessagingStore } from './messaging-store.js';
import { PublicProblem, type PublicMethod, type PublicResponse } from './public-rest.js';

export type DemoRESTStore = Pick<MessagingStore, 'room' | 'demoConversation' | 'demoMessageAction'>;

export async function demoREST(store: DemoRESTStore | undefined, path: string, method: PublicMethod,
  signal: AbortSignal, body?: object): Promise<PublicResponse> {
  if (signal.aborted || !store) throw new PublicProblem('failed');
  const url = new URL(path, 'https://webexapis.com'), p = body as Record<string, unknown> | undefined;
  if (url.pathname === '/v1/people/me') return { value: { id: 'demo-self' } };
  if (url.pathname === '/v1/people' && url.searchParams.has('displayName')) {
    const query = url.searchParams.get('displayName')!.toLowerCase();
    return { value: { items: ['a', 'b'].filter(() => 'demo participant'.startsWith(query))
      .map(id => ({ id: 'demo-directory-' + id, displayName: 'Demo Participant' })) } };
  }
  if (url.pathname === '/v1/people' || url.pathname.startsWith('/v1/people/')) {
    const email = url.searchParams.get('email');
    const person = { id: email ? 'demo-person-' + Buffer.from(email.toLowerCase()).toString('base64url').slice(0, 32) : decodeURIComponent(url.pathname.slice('/v1/people/'.length)),
      displayName: 'Participant · DEMO', firstName: 'Participant', lastName: 'Demo',
      department: 'Account-free demo', title: 'Text profile demo', timezone: 'Etc/UTC', ...(email ? { emails: [email] } : {}) };
    return { value: email ? { items: [person] } : person };
  }
  if (url.pathname === '/v1/memberships') {
    return { value: await store.demoConversation(method === 'POST' ? 'invite' : 'members',
      method === 'POST' ? p! : { roomId: url.searchParams.get('roomId'), personId: url.searchParams.get('personId') }) };
  }
  if (url.pathname.startsWith('/v1/memberships/')) return { value: await store.demoConversation(method === 'DELETE' ? 'remove' : 'membership', { id: decodeURIComponent(url.pathname.slice('/v1/memberships/'.length)) }) };
  if (url.pathname === '/v1/rooms' && method === 'POST') return { value: await store.demoConversation('create', p!) };
  if (url.pathname.startsWith('/v1/rooms/')) return { value: await store.demoConversation(method === 'PUT' ? p?.isAnnouncementOnly !== undefined ? 'announcement' : p?.isLocked !== undefined ? 'lock' : p?.description === ' ' ? 'description-clear' : p?.description !== undefined ? 'describe' : 'rename' : 'room',
    { roomId: decodeURIComponent(url.pathname.slice('/v1/rooms/'.length)),
      ...(method === 'PUT' ? { title: p?.title, ...(p?.description !== undefined ? { description: p.description } : {}),
        ...(p?.isLocked !== undefined ? { isLocked: p.isLocked } : {}),
        ...(p?.isAnnouncementOnly !== undefined ? { isAnnouncementOnly: p.isAnnouncementOnly } : {}) } : {}) }) };
  if (url.pathname === '/v1/teams' && method === 'GET') return { value: await store.demoConversation('teams', {}) };
  if (url.pathname === '/v1/team/memberships' && method === 'GET') return { value: await store.demoConversation('team-members', { id: url.searchParams.get('teamId') }) };
  if (url.pathname.startsWith('/v1/teams/')) return { value: await store.demoConversation(method === 'PUT' ? p?.description !== undefined ? 'team-describe' : 'team-rename' : 'team',
    { id: decodeURIComponent(url.pathname.slice('/v1/teams/'.length)), ...(method === 'PUT' ? { name: p?.name,
      ...(p?.description !== undefined ? { description: p.description } : {}) } : {}) }) };
  if (url.pathname === '/v1/messages' && method === 'GET') return { value: await store.demoConversation('query-messages',
    { roomId: url.searchParams.get('roomId'), parentId: url.searchParams.get('parentId'), mentionsOnly: url.searchParams.get('mentionedPeople') === 'me' }) };
  if (url.pathname === '/v1/messages' && method === 'POST') return { value: await store.demoConversation('direct', { roomId: p?.roomId, personId: p?.toPersonId, text: p?.text, markdown: p?.markdown }) };
  if (url.pathname.startsWith('/v1/messages/')) return { value: await store.demoMessageAction(store.room!.id,
    decodeURIComponent(url.pathname.slice('/v1/messages/'.length)), method === 'DELETE' ? 'delete' : method === 'PUT' ? 'edit' : 'get',
    (p?.markdown ?? p?.text) as string | undefined, typeof p?.markdown === 'string' ? 'markdown' : 'plain') };
  throw new PublicProblem('failed');
}
