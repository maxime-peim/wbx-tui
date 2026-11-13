// Public SDK 3.13 members/receiver-selected API shape; generated remote videos.
window.testRoster = {
  a: { id: 'a', name: 'Alex Chen', isInMeeting: true, isHost: true },
  b: { id: 'b', name: 'Sam Rivera', isInMeeting: true, isAudioMuted: true },
};
window.testCsiRequests = [];
const memberListeners = new Map();
const csis = { a: 101, b: 202 };
const streams = {};
for (const [id, color] of [['a', '#c03450'], ['b', '#2c93ce']]) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const c = canvas.getContext('2d'); let f = 0;
  const paint = () => { c.fillStyle = color; c.fillRect(0, 0, 640, 360); c.fillStyle = '#fff'; c.font = '28px monospace'; c.fillText(`${id} GENERATED ${++f}`, 20, 170); };
  paint(); streams[id] = canvas.captureStream(15); setInterval(paint, 1000 / 15);
}
const slots = Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
  const listeners = new Map();
  return [`person-${i + 1}`, { stream: streams.a, sourceState: 'live', memberId: 'wrong-old-person', csi: 999,
    on(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
    off(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(value => value !== fn)); },
    emit() { for (const fn of listeners.get('sourceUpdate') ?? []) fn(); }, setSizeHint() {},
  }];
}));
let layoutId = 'Single';
window.testMeeting.members = {
  on(name, fn) { memberListeners.set(name, [...(memberListeners.get(name) ?? []), fn]); },
  off(name, fn) { memberListeners.set(name, (memberListeners.get(name) ?? []).filter(value => value !== fn)); },
  membersCollection: { getAll: () => window.testRoster },
  getCsisForMember: id => [csis[id]],
};
window.testMeeting.remoteMediaManager = {
  getLayoutId: () => layoutId,
  async setLayout(id) {
    layoutId = id;
    window.testEmitMeeting('media:remoteVideo:layoutChanged', { activeSpeakerVideoPanes: {}, memberVideoPanes: id === 'People' ? slots : {} });
  },
  setRemoteVideoCsis(requests) { window.testCsiRequests = requests.map(value => ({ ...value })); },
};
window.testRosterChanged = () => { for (const fn of memberListeners.get('members:update') ?? []) fn({ full: window.testRoster }); };
window.testApplyPinned = () => {
  for (const { remoteMedia, csi } of window.testCsiRequests) {
    const member = Object.keys(csis).find(id => csis[id] === csi);
    remoteMedia.memberId = member; remoteMedia.csi = csi; remoteMedia.sourceState = member ? 'live' : 'no source';
    if (member) remoteMedia.stream = streams[member]; remoteMedia.emit();
  }
};
