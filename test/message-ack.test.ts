import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validMessageAck } from '../src/message-ack.js';

const intent = { roomId:'room', content:'  **Hello**\n', format:'markdown' as const };
const ack = { id:'new-message', roomId:'room', created:'2026-11-19T10:00:00.000Z' };
test('positive Markdown POST responses admit server renditions, not only exact source echoes',()=>{
  for (const content of [
    { markdown:intent.content }, { markdown:'**Hello**' },
    { html:'<p><strong>Hello</strong></p>', text:'Hello' },
    { markdown:'<spark-mention data-object-id="person">Person</spark-mention>', text:'Person' },
  ]) assert.equal(validMessageAck({...ack,...content},intent),true);
  assert.equal(validMessageAck({...ack,parentId:null,html:'<p>Hello</p>'},intent),true);
});
test('Markdown response validation still refuses wrong targets, errors, invalid metadata and malformed content',()=>{
  for (const patch of [
    { roomId:'other' }, { parentId:'other' }, { id:'' }, { created:undefined }, { created:'bad' },
    { errors:[] }, { error:'refused' }, { files:['unexpected'] }, { markdown:undefined },
    { markdown:'' }, { markdown:[] }, { markdown:'\ud800' }, { markdown:'x'.repeat(40_001) },
    { html:42 }, { text:42 },
  ]) assert.equal(validMessageAck({...ack,markdown:intent.content,...patch},intent),false,JSON.stringify(patch));
  assert.equal(validMessageAck({...ack,text:'Hello'},intent),false,'plain fallback alone cannot prove a formatted response');
  assert.equal(validMessageAck({...ack,markdown:'**Hello**',parentId:'root'},{...intent,parentId:'root'}),true);
  assert.equal(validMessageAck({...ack,markdown:'**Hello**'},{...intent,parentId:'root'}),false);
});
test('plaintext acknowledgment still requires the exact raw submitted content',()=>{
  const plain={...intent,format:'plain' as const};
  assert.equal(validMessageAck({...ack,text:intent.content},plain),true);
  assert.equal(validMessageAck({...ack,text:intent.content.trim()},plain),false);
  assert.equal(validMessageAck({...ack,markdown:intent.content},plain),false);
});
