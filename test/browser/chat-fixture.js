// Test-only public messaging API fixture. No account or network messages.
window.testChatCalls = [];
window.testChatMode = 'ok';
window.testChatItems = [
  { id: 'message-one', roomId: 'space-one', personEmail: 'sam@example.test', created: '2026-11-06T12:00:00Z', text: 'Hello from the selected space' },
  { id: 'other-room', roomId: 'space-two', personEmail: 'other@example.test', created: '2026-11-06T12:00:01Z', text: 'OTHER SPACE SECRET' },
];
window.testChatRooms = [{ id: 'space-one', title: 'Test team · persistent SPACE' }, { id: 'space-two', title: 'Another space' }];
let nextChat = 0;
window.testChatRequest = async options => {
  window.testChatCalls.push(options);
  if (window.testChatMode === 'denied') throw Object.assign(new Error('private native token details'), { statusCode: 403 });
  if (options.resource === 'rooms/') return { headers: {}, body: { items: window.testChatRooms } };
  if (options.method === 'POST') {
    if (window.testChatMode === 'deferred') await new Promise(resolve => { window.testResolveChat = resolve; });
    const item = { id: `sent-${++nextChat}`, personEmail: 'you@example.test', created: new Date().toISOString(), ...options.body };
    window.testChatItems.unshift(item); return { headers: {}, body: item };
  }
  return { headers: {}, body: { items: window.testChatItems } };
};
const chatOriginal = window.Webex;
window.Webex = { init(options) {
  const sdk = chatOriginal.init(options);
  sdk.rooms = { async list(options) { return (await window.testChatRequest({ service: 'hydra', resource: 'rooms/', qs: options })).body; } };
  sdk.messages = {
    async list(options) { return (await window.testChatRequest({ service: 'hydra', resource: 'messages', qs: options })).body; },
    async create(options) { return (await window.testChatRequest({ method: 'POST', service: 'hydra', resource: 'messages', body: options })).body; },
  };
  return sdk;
} };
