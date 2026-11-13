// Synthetic private IPC worker. No SDK, account, network or media.
let mode = '';
let heldReactions;
const room = { id: 'room-1', title: 'Synthetic', type: 'group', lastActivity: '2026-11-09T12:00:00.000Z', lastSeen: '2026-11-09T11:00:00.000Z' };
process.on('message', value => {
  if (value.type === 'release-reactions' && heldReactions) { process.send(heldReactions); heldReactions=undefined; return; }
  if (value.type === 'stop') { process.exit(0); return; }
  if (value.type === 'start') {
    mode = value.credentials.token;
    console.log('SDK-PRIVATE ' + mode); // The parent must discard provider logs.
    if (mode === 'hang') return;
    if (mode === 'health-malformed') { process.send({ type: 'health', status: 'PRIVATE provider error' }); return; }
    if (mode === 'reason-leak') { process.send({ type: 'failed', reason: 'PRIVATE provider error' }); return; }
    if (mode === 'malformed') { process.send({ type: 'snapshot', rooms: [{ ...room, lastSeen: {} }] }); return; }
    if (mode === 'crash') { process.exit(2); return; }
    process.send({ type: 'snapshot', rooms: [room] }); process.send({ type: 'ready' });
    if (mode.startsWith('change-')) {
      const change = { kind: 'message-deleted', roomId: room.id, id: 'm' };
      const changes = mode === 'change-readers' ? [{kind:'readers-changed',roomId:room.id}]
        : mode === 'change-extra' ? [{ ...change, personId: 'PRIVATE' }]
        : mode === 'change-duplicate' ? [change, { id: 'm', roomId: room.id, kind: 'message-deleted' }]
        : mode === 'change-oversized' ? Array.from({ length: 65 }, (_, i) => ({ ...change, id: 'm-' + i }))
        : [change, { kind: 'room-revoked', roomId: room.id }];
      setTimeout(() => process.send({ type: 'changes', changes }), 30);
    }
    if (mode.startsWith('message-')) {
      const message = { id: 'm', roomId: room.id, created: new Date().toISOString(), self: false,
        ...(mode === 'message-sender' ? { preview: 'First words', senderId: 'person' } : {}),
        ...(mode === 'message-preview' ? { preview: 'First words' } : {}) };
      const messages = mode === 'message-extra' ? [{ ...message, text: 'PRIVATE' }] : mode === 'message-duplicate' ? [message, message]
        : mode === 'message-oversized' ? Array.from({ length: 65 }, (_, i) => ({ ...message, id: 'm-' + i })) : [message];
      setTimeout(() => process.send({ type: 'messages', messages }), 30);
    }
    return;
  }
  if (value.type === 'read' && mode !== 'read-hang') {
    room.lastSeen = room.lastActivity;
    process.send({ type: 'snapshot', rooms: [room] }); process.send({ type: 'read', id: value.id, ok: true });
  }
  if (value.type === 'readers') {
    if (mode === 'readers-early-receipt') { process.send({ type: 'read', id: value.id+1, ok: true }); return; }
    if (mode === 'readers-hang') return;
    if (mode === 'readers-denied') { process.send({ type: 'readers', id: value.id, failed: true }); return; }
    const result = { roomId: value.roomId, messageId: value.messageId, coverage: 'space-read-watermark',
      observedAt: Date.now(), partial: true, readers: [{ personId: 'reader', name: 'Reader Name' }] };
    if (mode === 'readers-foreign') result.messageId = 'foreign';
    if (mode === 'readers-extra') result.secret = 'PRIVATE';
    setTimeout(() => process.send({ type: 'readers', id: value.id, result }), 25);
  }
  if (value.type === 'reaction') {
    if (mode === 'reaction-hang') return;
    if (mode === 'reaction-denied' || mode === 'reaction-reason-leak') {
      process.send({ type:'reaction',id:value.id,failed:true,reason:mode === 'reaction-denied' ? 'parent:denied' : 'PRIVATE server detail' });
      return;
    }
    let result = value.command.action === 'summary'
      ? { roomId:value.command.roomId,messageId:value.command.messageId,observedAt:Date.now(),partial:true,unknown:true,groups:[] }
       : { status:'changed' };
    if (value.command.details || mode === 'reaction-details-unsolicited') {
      result = {snapshot:{...result,groups:[{reaction:'heart',label:'Heart'}]},
        actors:[{reaction:'heart',personId:'person',name:'Disclosed name'}],partial:true};
      if (mode === 'reaction-details-foreign') result.snapshot.messageId='foreign';
    }
    if (mode === 'reaction-malformed') result.secret = 'PRIVATE';
    setTimeout(()=>process.send({ type:'reaction',id:value.id,result }),25);
  }
  if (value.type === 'reactions') {
    const result={ roomId:value.batch.roomId,items:value.batch.messageIds.map(messageId=>({
      roomId:value.batch.roomId,messageId,observedAt:Date.now(),partial:true,unknown:false,groups:[{reaction:'heart',label:'Heart'}],
    })) };
    if (mode === 'reaction-batch-foreign') result.items[0].messageId='foreign';
    if (mode.startsWith('reaction-progress-') && (value.progressive === true || mode === 'reaction-progress-unsolicited')) {
      const snapshot=structuredClone(result.items[0]);
      if (mode === 'reaction-progress-foreign') snapshot.messageId='foreign';
      if (mode === 'reaction-progress-own') snapshot.groups[0].own='a'.repeat(32);
      process.send({type:'reaction-progress',id:mode === 'reaction-progress-id' ? value.id+1 : value.id,snapshot});
      if (mode === 'reaction-progress-duplicate') process.send({type:'reaction-progress',id:value.id,snapshot});
    }
    if (mode === 'reaction-progress-held') { heldReactions={type:'reactions',id:value.id,result}; return; }
    setTimeout(()=>process.send({type:'reactions',id:value.id,result}),25);
  }
});
