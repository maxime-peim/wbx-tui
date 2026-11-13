// Generated sending streams only. No physical device, screen picker or account.
window.testLocalRequests = [];
window.testSendingStreams = [];
window.testPublished = [];
window.testUnpublished = [];
window.testMediaUpdates = [];
window.testSendMode = 'ok';
window.testPublishMode = 'ok';
window.testCompletePublish = null;
window.testShareGestures = [];
function wrap(stream, extraStop = () => {}) {
  const events = new Map();
  const value = { outputStream: stream, stop() { stream.getTracks().forEach(track => track.stop()); extraStop(); },
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    off(name, fn) { events.set(name, (events.get(name) ?? []).filter(item => item !== fn)); },
    emit(name, ...args) { for (const listener of events.get(name) ?? []) listener(...args); },
  };
  window.testSendingStreams.push(value); return value;
}
function video(kind) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const c = canvas.getContext('2d'); let frame = 0;
  const paint = () => { c.fillStyle = kind === 'camera' ? '#2386cc' : '#62bd72'; c.fillRect(0, 0, 640, 360);
    c.fillStyle = '#fff'; c.font = '28px monospace'; c.fillText(`GENERATED ${kind} ${++frame}`, 20, 160); };
  paint(); const stream = canvas.captureStream(15), timer = setInterval(paint, 1000 / 15);
  return wrap(stream, () => clearInterval(timer));
}
function request(kind, constraints) {
  window.testLocalRequests.push({ kind, constraints });
  if (window.testSendMode === 'denied') throw new DOMException('private native device details', 'NotAllowedError');
}
const original = window.Webex;
window.Webex = { init(options) {
  const sdk = original.init(options);
  sdk.meetings.mediaHelpers = {
    async createMicrophoneStream(constraints) {
      request('microphone', constraints);
      const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
      oscillator.connect(destination); oscillator.start();
      return wrap(destination.stream, () => { oscillator.stop(); void context.close(); });
    },
    async createCameraStream(constraints) { request('camera', constraints); return video('camera'); },
    async createDisplayStream() {
      window.testShareGestures.push(navigator.userActivation.isActive);
      request('screen', { audio: false }); return video('screen');
    },
  };
  return sdk;
} };
window.testMeeting.updateMedia = async options => { window.testMediaUpdates.push(options); };
window.testMeeting.publishStreams = async options => {
  window.testPublished.push(options);
  if (window.testPublishMode === 'deferred') await new Promise(resolve => { window.testCompletePublish = resolve; });
};
window.testMeeting.unpublishStreams = async streams => { window.testUnpublished.push(...streams); };
