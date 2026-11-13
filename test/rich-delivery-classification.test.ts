import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI, parseMessage } from '../src/messaging-api.js';
import { PublicREST, PublicProblem, type PublicMethod } from '../src/public-rest.js';

for (const scenario of ['missing-grant', 'preflight-error', 'refused', 'post-unknown']) test(`Markdown ${scenario} has the correct delivery certainty without automatic replay`, async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-rich-certainty-'), config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ oauth: { clientId: 'synthetic', clientSecret: 'synthetic',
    redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read'] } }), { mode: 0o600 });
  const access = { token: 'SYNTHETIC', expiresAt: Date.now() + 600000,
    scope: scenario === 'missing-grant' ? 'spark:messages_write' : 'spark:messages_write spark:memberships_read' };
  t.mock.method(OAuthSession.prototype, 'authorize', async () => access);
  t.mock.method(OAuthSession.prototype, 'watch', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw Error('LIVE NETWORK FORBIDDEN'); });
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [{ id: 'group', title: 'Synthetic', type: 'group' as const, lastActivity: '' }] }));
  t.mock.method(WebexMessagingAPI.prototype, 'history', async () => ({ items: [] }));
  let broken = true, posts = 0;
  t.mock.method(PublicREST.prototype, 'call', async (path: string, method: PublicMethod, _token: string, _signal: AbortSignal, body?: object) => {
    if (method === 'GET') {
      assert.ok(path.startsWith('/v1/memberships?'));
      if (broken && scenario === 'preflight-error') throw Error('SYNTHETIC PRE-POST FAILURE');
      return { value: { items: [{ id: 'membership', roomId: 'group', personId: 'person', personDisplayName: 'Person' }] } };
    }
    assert.equal(method, 'POST'); assert.equal(path, '/v1/messages'); posts++;
    if (broken && scenario === 'refused') throw new PublicProblem('failed', 400);
    if (broken && scenario === 'post-unknown') throw new PublicProblem('unknown', 503);
    return { value: { ...body, id: `ack-${posts}`, personEmail: 'synthetic@example.invalid', created: new Date().toISOString() } };
  });
  const engine = new EditorEngine(), deliveries: any[] = [];
  engine.on('delivery', value => deliveries.push(value));
  try {
    await engine.start('live', config); await engine.select('group');
    const binding = { roomId: 'group', draftId: 'draft' };
    await engine.sendRich('first', '<@personId:person|Person>', binding, { mentionsAccepted: true });
    assert.equal(deliveries.at(-1).status, scenario === 'post-unknown' ? 'unknown' : 'failed');
    assert.equal(engine.snapshot().uncertain, scenario === 'post-unknown');
    assert.equal(posts, ['refused', 'post-unknown'].includes(scenario) ? 1 : 0, 'preflight failures never dispatched a message');
    if (scenario === 'refused') assert.match(deliveries.at(-1).message, /HTTP 400/);
    if (scenario !== 'post-unknown') assert.match(deliveries.at(-1).message, /not sent/);
    const before = posts;
    broken = false;
    // A new deliberate Markdown send without mentions needs only messages_write.
    await engine.sendRich('next', '**Next explicit message**', binding, {});
    if (scenario === 'post-unknown') {
      assert.equal(posts, before, 'a possible prior POST still blocks a new write');
      assert.equal(deliveries.at(-1).status, 'failed');
      engine.resolveBoundDelivery('group'); // Explicit synthetic inspection/resolution, never production auto-resolution.
      await engine.sendRich('after-resolution', '**Next explicit message**', binding, {});
    }
    assert.equal(deliveries.at(-1).status, 'sent', 'known no-POST failures do not poison subsequent sends');
    assert.equal(posts, before + 1);
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('Markdown server renditions and an in-flight history echo confirm once; pre-existing IDs remain uncertain',async t=>{
  const directory=await mkdtemp('/tmp/opencode/wbx-rich-ack-'),config=join(directory,'config.json');
  await writeFile(config,JSON.stringify({oauth:{clientId:'synthetic',clientSecret:'synthetic',
    redirectUri:'http://127.0.0.1:53682/oauth/callback',scopes:['spark:rooms_read']}}),{mode:0o600});
  t.mock.method(OAuthSession.prototype,'authorize',async()=>({token:'SYNTHETIC',expiresAt:Date.now()+600000,scope:'spark:messages_write'}));
  t.mock.method(OAuthSession.prototype,'watch',()=>{});
  t.mock.method(globalThis,'fetch',async()=>{throw Error('LIVE NETWORK FORBIDDEN');});
  const room={id:'room',title:'Synthetic',type:'group' as const,lastActivity:''};
  const text='  **Hello**\n',base={id:'ack',roomId:room.id,created:'2026-11-19T10:00:00.000Z'};
  let response:object={},existing=false,echo=false,posts=0,engine:EditorEngine;
  t.mock.method(WebexMessagingAPI.prototype,'rooms',async()=>({items:[room]}));
  t.mock.method(WebexMessagingAPI.prototype,'history',async()=>({items:existing?[parseMessage(response,room.id)!]:[]}));
  t.mock.method(PublicREST.prototype,'call',async(path:string,method:PublicMethod,_token:string,_signal:AbortSignal,body?:object)=>{
    assert.equal(path,'/v1/messages');assert.equal(method,'POST');
    assert.deepEqual(body,{roomId:room.id,markdown:text});posts++;
    if(echo) (engine as any).store.acceptExternalMessage(room,parseMessage(response,room.id)!);
    return {value:response};
  });
  try {
    for(const scenario of ['normalized-source','html-only','in-flight-echo','existing-id','malformed'] as const) {
      existing=scenario==='existing-id';echo=scenario==='in-flight-echo';
      response={...base,...(scenario==='html-only'?{html:'<p><strong>Hello</strong></p>',text:'Hello'}:{markdown:'**Hello**'}),
        ...(scenario==='malformed'?{roomId:'other'}:{})};
      engine=new EditorEngine();const deliveries:any[]=[];engine.on('delivery',value=>deliveries.push(value));
      try {
        await engine.start('live',config);await engine.select(room.id);
        const before=posts,binding={roomId:room.id,draftId:'draft'};
        await engine.sendRich('rich',text,binding,{});
        const unknown=existing||scenario==='malformed',delivery=deliveries.at(-1);
        assert.equal(delivery.status,unknown?'unknown':'sent',scenario);
        assert.equal(delivery.draftId,'draft');assert.equal(delivery.format,'markdown');
        assert.equal(engine.snapshot().uncertain,unknown);
        if(!unknown) {
          assert.equal(delivery.messageId,'ack');assert.equal(delivery.text,undefined,'exact native pending draft, not provider text, owns clearing');
          assert.equal(engine.snapshot().messages.filter(message=>message.id==='ack').length,1,'history echo and ACK deduplicate');
        }
        await engine.sendRich('rich',text,binding,{});
        assert.equal(posts,before+1,'historical results never replay the POST');
        if(unknown) {
          await engine.sendRich('blocked',text,binding,{});
          assert.equal(posts,before+1,'malformed/reused acknowledgments keep the unknown-delivery lock');
        }
      } finally {engine.stop();}
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
