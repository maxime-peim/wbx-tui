// Test-only camera: generated pixels, no physical camera/microphone or permissions.
window.previewRequests = [];
window.previewStreams = [];
window.previewMode = 'ok';
window.resolvePreview = null;
navigator.mediaDevices.getUserMedia = async constraints => {
  window.previewRequests.push(constraints);
  if (constraints.audio !== false) throw new Error('A local preview must never request a microphone.');
  if (window.previewMode === 'denied') throw new DOMException('Test-only permission denial', 'NotAllowedError');
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext('2d');
  context.fillStyle = '#cf3260'; context.fillRect(0, 0, 1280, 720);
  const stream = canvas.captureStream(15);
  let frame = 0;
  const timer = setInterval(() => {
    if (stream.getTracks().every(track => track.readyState === 'ended')) { clearInterval(timer); return; }
    context.fillStyle = '#cf3260'; context.fillRect(20, 20, 700, 100);
    context.fillStyle = '#fff'; context.font = '36px monospace';
    context.fillText(`GENERATED CAMERA ${++frame}`, 32, 80);
  }, 1000 / 15);
  window.previewStreams.push(stream);
  if (window.previewMode === 'deferred') return new Promise(resolve => { window.resolvePreview = () => resolve(stream); });
  return stream;
};
