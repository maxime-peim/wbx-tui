// Test-only fake SDK. No account, remote services, camera, or microphone.
window.testJoins = 0;
window.testCaptureCalls = 0;
navigator.mediaDevices.getUserMedia = async () => {
  window.testCaptureCalls++;
  throw new Error('Local capture is forbidden in this test.');
};
const listeners = new Map();
const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 360;
canvas.getContext('2d').fillRect(0, 0, 640, 360);
const remote = { sourceState: 'live', stream: canvas.captureStream(1), on() {}, off() {} };
const meeting = {
  on(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
  off() {},
  async join() { window.testJoins++; },
  async leave() {},
  async addMedia(options) {
    if (options.additionalMediaOptions.sendVideo || options.additionalMediaOptions.sendAudio) {
      throw new Error('Outgoing media requested.');
    }
    for (const listener of listeners.get('media:remoteVideo:layoutChanged') ?? []) {
      listener({ activeSpeakerVideoPanes: { main: { getRemoteMedia: () => [remote] } } });
    }
  },
};
window.testMeeting = meeting;
window.testEmitMeeting = (name, data) => { for (const listener of listeners.get(name) ?? []) listener(data); };
window.Webex = { init: () => ({ ready: true, on() {}, off() {}, meetings: {
  async register() {}, async unregister() {}, async create() { return meeting; },
} }) };
