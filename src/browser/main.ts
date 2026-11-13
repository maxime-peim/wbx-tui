import { encodeFrame, parseCommand, sendKinds, type Capture, type DemoPattern, type SendKind, type SendReason, type SendState, type SourceInfo, type Status, type WorkerEvent } from '../protocol.js';
import { WebexSession, type Factory } from './webex.js';
import { CameraPreview } from './camera.js';
import { MockFeed, MockShare } from './mock.js';
import { OutgoingMedia } from './outgoing.js';
import type { ParticipantMedia } from './participants.js';
import { SpaceChat, demoMessaging } from './chat.js';
import { emptyChat } from '../chat-protocol.js';
import { CredentialRefresh } from './auth.js';
import { deadline } from '../lifecycle.js';

declare global {
  interface Window {
    Webex?: Factory;
    __wbx: { connect(url: string, key: string): void };
  }
}
const video = document.querySelector<HTMLVideoElement>('#video')!;
const share = document.querySelector<HTMLVideoElement>('#share')!;
const local = document.querySelector<HTMLVideoElement>('#local')!;
const self = document.querySelector<HTMLVideoElement>('#self')!;
const presenting = document.querySelector<HTMLVideoElement>('#presenting')!;
const localPanel = document.querySelector<HTMLElement>('#local-panel')!;
const cameraButton = document.querySelector<HTMLButtonElement>('#camera')!;
const cameraStatus = document.querySelector<HTMLElement>('#camera-status')!;
const status = document.querySelector<HTMLElement>('#status')!;
const audioButton = document.querySelector<HTMLButtonElement>('#audio')!;
const canvas = document.createElement('canvas');
let socket: WebSocket | undefined;
let session: WebexSession | undefined;
let started = false, stopped = false, capturing = false, audioEnabled = false;
let generation = 0, demoFrame = 0;
let demoTimer: ReturnType<typeof setInterval> | undefined;
let demoCanvas: HTMLCanvasElement | undefined;
let audio: HTMLAudioElement[] = [];
let cameraState: 'off' | 'starting' | 'on' = 'off';
let cameraRequestId = 0;
let cameraReason: string | undefined;
const sending: Record<SendKind, SendState> = { microphone: 'off', camera: 'off', screen: 'off' };
const sendRequests: Record<SendKind, number> = { microphone: 0, camera: 0, screen: 0 };
const armed: Record<SendKind, boolean> = { microphone: false, camera: false, screen: false };
const mockFeeds = new Map<string, MockFeed>();
const peers = new Map<SourceInfo['id'], ParticipantMedia>();
const peerVideos = new Map<SourceInfo['id'], HTMLVideoElement>();
const peerGenerations = new Map<SourceInfo['id'], number>();
let demoParticipants = 0;
let demoShare: MockShare | undefined;
let demoChat: SpaceChat | undefined;
const credentials = new CredentialRefresh(requestId => send({ type: 'oauth-refresh', requestId }), reason => {
  send({ type: 'auth-state', method: 'oauth', state: 'failed', reason }); void stop();
});
function publishSources(): void {
  const available = (element: HTMLVideoElement) => element.srcObject instanceof MediaStream && element.srcObject.getVideoTracks().some(track => track.readyState === 'live');
  const sources: SourceInfo[] = [{ id: 'video', label: demoParticipants ? 'Alex Chen · MOCK 1 / test chart' : peers.get('video')?.label ?? 'Active speaker / call owner',
    kind: demoParticipants ? 'mock' : 'video', available: available(video), present: peers.has('video'), generation: peerGenerations.get('video') ?? 0 }];
  for (const [id, feed] of mockFeeds) sources.push({ id: id as SourceInfo['id'], label: `${feed.name} · MOCK ${feed.index}`, kind: 'mock', available: true });
  for (const [id, peer] of peers) if (id !== 'video') sources.push({ id, label: peer.label, kind: 'video', present: true,
    available: !!peerVideos.get(id) && available(peerVideos.get(id)!), generation: peerGenerations.get(id) ?? 0 });
  sources.push({ id: 'share', label: demoShare ? 'MOCK screen share · Team planning' : 'Received screen share', kind: 'share', available: !!demoShare || available(share) },
    { id: 'local', label: 'Local preview · NOT SENT', kind: 'local', available: available(local) },
    { id: 'self', label: `Your camera · ${sourceSending('camera', available(self))}`, kind: 'local', available: sending.camera === 'on' && available(self) },
    { id: 'presenting', label: `Your screen · ${sourceSending('screen', available(presenting))}`, kind: 'local', available: sending.screen === 'on' && available(presenting) });
  send({ type: 'sources', sources });
}
function sourceSending(kind: 'camera' | 'screen', live: boolean): string {
  return sending[kind] === 'on' ? live ? kind === 'camera' ? 'SENDING TO MEETING' : 'SHARING TO MEETING' : 'inactive · NOT SENDING'
    : sending[kind] === 'awaiting' ? 'confirmation pending · NOT SENDING'
      : sending[kind] === 'starting' ? 'starting · NOT YET SENDING' : 'off · NOT SENDING';
}
function revealConfirmation(kind: SendKind): void {
  const button = document.querySelector<HTMLButtonElement>(`#send-${kind}`)!;
  button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  button.focus({ preventScroll: true }); // focus/reveal only; never click or acquire
}
function setParticipants(media: ParticipantMedia[]): void {
  const next = new Map(media.map(peer => [peer.source, peer]));
  for (const peer of media) {
    const before = peers.get(peer.source);
    if (before?.member !== peer.member) {
      generation++;
      peerGenerations.set(peer.source, ((peerGenerations.get(peer.source) ?? 0) + 1) % 0x100000000);
    }
  }
  peers.clear(); for (const [source, peer] of next) peers.set(source, peer);
  for (const [id, element] of peerVideos) if (!next.has(id)) { stream(element, null, false); element.remove(); peerVideos.delete(id); }
  for (const peer of media) {
    if (peer.source === 'video') { stream(video, peer.stream, false); continue; }
    let element = peerVideos.get(peer.source);
    if (!element) {
      element = document.createElement('video'); element.autoplay = true; element.muted = true; element.playsInline = true;
      document.querySelector('#remote-gallery')!.append(element); peerVideos.set(peer.source, element);
    }
    element.setAttribute('aria-label', peer.label); stream(element, peer.stream, false);
  }
  if (!next.has('video')) stream(video, null, false);
  publishSources();
}
const camera = new CameraPreview(
  constraints => navigator.mediaDevices.getUserMedia(constraints),
  value => { stream(local, value); localPanel.hidden = !value; },
  (state, reason) => {
    cameraState = state;
    cameraButton.textContent = state === 'off' ? 'Start local camera preview (not sent)'
      : state === 'starting' ? 'Cancel local camera preview' : 'Stop local camera preview (not sent)';
    cameraReason = reason; updateCameraStatus();
    send({ type: 'camera-state', requestId: cameraRequestId, state, sending: false, ...(reason ? { reason } : {}) });
  },
);
function updateCameraStatus(): void {
  const status = sending.camera === 'on' ? 'ON' : sending.camera === 'off' ? 'OFF' : 'PENDING';
  cameraStatus.textContent = `Camera preview: ${cameraState}${cameraReason ? ` (${cameraReason})` : ''}. Preview is NOT SENT. Meeting video sending: ${status}.`;
}
function sendState(kind: SendKind, state: SendState, reason?: SendReason): void {
  sending[kind] = state;
  const labels = { microphone: 'meeting microphone (SENDS AUDIO)', camera: 'meeting camera (SENDS VIDEO)', screen: 'screen sharing (SENDS YOUR SCREEN)' };
  for (const item of sendKinds) {
    const button = document.querySelector<HTMLButtonElement>(`#send-${item}`)!;
    button.textContent = sending[item] === 'off' ? `Enable ${labels[item]}`
      : sending[item] === 'awaiting' ? item === 'screen' ? 'CHOOSE SCREEN TO SHARE WITH MEETING (click here)' : `CONFIRM ENABLE ${labels[item]}`
        : sending[item] === 'starting' ? `Cancel ${labels[item]}` : `Stop ${labels[item]}`;
  }
  document.querySelector('#send-status')!.textContent = `Meeting microphone: ${sending.microphone}. Meeting camera: ${sending.camera}. Screen sharing: ${sending.screen}.${reason ? ` ${kind}: ${reason}.` : ''}`;
  updateCameraStatus(); publishSources();
  send({ type: 'send-state', kind, requestId: sendRequests[kind], state, ...(reason ? { reason } : {}) });
}
const outgoing = Object.fromEntries(sendKinds.map(kind => [kind, new OutgoingMedia({
  acquire: () => session ? session.acquireLocal(kind) : Promise.reject(Object.assign(new Error('Not connected.'), { name: 'NotConnectedError' })),
  publish: value => session ? session.publishLocal(kind, value) : Promise.reject(new Error('Not connected.')),
  unpublish: value => session ? session.unpublishLocal(value) : Promise.resolve(),
}, (state, reason) => sendState(kind, state, reason), value => {
  if (kind === 'microphone') return;
  const element = kind === 'camera' ? self : presenting;
  stream(element, value); document.querySelector<HTMLElement>(`#${kind === 'camera' ? 'self' : 'presenting'}-panel`)!.hidden = !value;
})])) as Record<SendKind, OutgoingMedia>;

function send(event: WorkerEvent): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}
function setStatus(state: Status): void {
  status.textContent = state; send({ type: 'status', state });
  if (state === 'ended' && !stopped) void stop();
}
function stream(element: HTMLVideoElement, value: MediaStream | null, publish = true): void {
  if (element.srcObject === value) return;
  generation++;
  element.srcObject = value;
  if (publish) publishSources();
  if (element === share) element.style.display = value ? 'block' : 'none';
  if (value) void element.play().catch(() => { status.textContent = 'Playback blocked; use the browser view to inspect.'; });
}
async function setAudio(enabled: boolean): Promise<void> {
  audioEnabled = enabled;
  audioButton.textContent = `Received audio: ${enabled ? 'on' : 'off'}`;
  send({ type: 'audio-state', enabled });
  for (const element of audio) {
    element.muted = !enabled;
    if (enabled) await element.play();
  }
}
function setAudioStreams(streams: MediaStream[]): void {
  for (const element of audio) { element.pause(); element.srcObject = null; element.remove(); }
  audio = streams.map(value => {
    const element = document.createElement('audio');
    element.srcObject = value; element.muted = !audioEnabled; element.autoplay = true;
    document.body.append(element);
    void element.play().catch(() => send({ type: 'error', stage: 'audio' }));
    return element;
  });
}
function updateDemo(participants: number, shared: boolean): void {
  generation++; demoParticipants = participants;
  const gallery = document.querySelector('#mock-gallery')!;
  for (const [id, feed] of mockFeeds) if (feed.index > participants) { feed.canvas.remove(); mockFeeds.delete(id); }
  for (let index = 2; index <= participants; index++) if (!mockFeeds.has(`mock-${index}`)) {
    const feed = new MockFeed(index); mockFeeds.set(`mock-${index}`, feed); gallery.append(feed.canvas);
  }
  if (shared && !demoShare) { demoShare = new MockShare(); gallery.append(demoShare.canvas); }
  else if (!shared && demoShare) { demoShare.canvas.remove(); demoShare = undefined; }
  publishSources();
}
function startDemo(pattern: DemoPattern = 'chart', participants = 4, mockShare = false): void {
  demoParticipants = participants;
  updateDemo(participants, mockShare);
  demoCanvas = document.createElement('canvas');
  demoCanvas.width = 1280; demoCanvas.height = 720;
  const context = demoCanvas.getContext('2d', { alpha: false })!;
  let texture: HTMLCanvasElement | undefined;
  if (pattern === 'noise') {
    texture = document.createElement('canvas'); texture.width = 1280; texture.height = 720;
    const target = texture.getContext('2d')!;
    const image = target.createImageData(1280, 720);
    let seed = 0x12345678;
    for (let i = 0; i < image.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      image.data[i] = seed & 255; image.data[i + 1] = (seed >>> 8) & 255;
      image.data[i + 2] = (seed >>> 16) & 255; image.data[i + 3] = 255;
    }
    target.putImageData(image, 0, 0);
  }
  const draw = () => {
    for (const feed of mockFeeds.values()) feed.draw();
    demoShare?.draw();
    const width = 1280, height = 720;
    demoFrame++;
    if (texture) {
      const offset = (demoFrame * 7) % width;
      context.drawImage(texture, -offset, 0); context.drawImage(texture, width - offset, 0);
      context.fillStyle = '#101010'; context.fillRect(20, 20, 650, 80);
      context.fillStyle = '#fff'; context.font = '32px monospace';
      context.fillText(`HIGH ENTROPY • frame ${demoFrame}`, 35, 72);
      return;
    }
    context.fillStyle = '#121b29'; context.fillRect(0, 0, width, height);
    const colors = ['#d85259', '#edb853', '#64bc80', '#44b7d1', '#638bdd', '#b87bd8'];
    colors.forEach((color, i) => { context.fillStyle = color; context.fillRect(i * width / 6, 0, width / 6 + 1, 80); });
    context.strokeStyle = '#39495d'; context.lineWidth = 1;
    for (let x = 0; x < width; x += 20) { context.beginPath(); context.moveTo(x, 80); context.lineTo(x, height); context.stroke(); }
    for (let y = 80; y < height; y += 20) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    context.fillStyle = '#eef4fc'; context.font = 'bold 42px monospace';
    context.fillText('WEBEX TERMINAL • PIXEL TEST', 35, 155);
    context.font = '32px monospace'; context.fillText(`frame ${String(demoFrame).padStart(6, '0')}`, 35, 220);
    context.font = '16px monospace'; context.fillText('1280×720 source • fine detail: ABC abc 0123456789', 35, 270);
    context.font = '12px monospace'; context.fillText('12px text — compare browser, pixels, and blocks', 35, 300);
    context.fillStyle = '#70dfbe'; context.beginPath();
    context.arc(90 + (demoFrame * 8) % 1100, 410, 50, 0, Math.PI * 2); context.fill();
    for (let i = 0; i < 32; i++) {
      context.fillStyle = ((demoFrame >>> i) & 1) ? '#fff' : '#111';
      context.fillRect(35 + i * 35, 540, 30, 100);
    }
  };
  draw(); demoTimer = setInterval(draw, 1000 / 30);
  stream(video, demoCanvas.captureStream(30));
  setStatus('demo');
}
async function loadSDK(): Promise<Factory> {
  if (!window.Webex) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/sdk.js';
      script.onload = () => resolve(); script.onerror = () => reject(new Error('SDK unavailable.'));
      document.head.append(script);
    });
  }
  if (!window.Webex) throw new Error('SDK did not initialize.');
  return window.Webex;
}
async function stop(): Promise<void> {
  if (stopped) return;
  stopped = true; generation++;
  const safe = (work: () => void) => { try { work(); } catch { /* continue independent cleanup */ } };
  safe(() => camera.close());
  safe(() => credentials.close());
  safe(() => demoChat?.close());
  for (const kind of sendKinds) { armed[kind] = false; safe(() => outgoing[kind].close()); }
  clearInterval(demoTimer);
  mockFeeds.clear(); demoShare = undefined; safe(() => document.querySelector('#mock-gallery')!.replaceChildren());
  const demoStream = video.srcObject;
  if (demoCanvas && demoStream instanceof MediaStream) for (const track of demoStream.getTracks()) safe(() => track.stop());
  safe(() => stream(video, null)); safe(() => stream(share, null)); safe(() => setAudioStreams([]));
  await deadline(() => session?.stop(), 2500).catch(() => {});
  setStatus('ended'); send({ type: 'left' });
}
async function capture(request: Capture): Promise<void> {
  if (capturing || stopped) { send({ type: 'unavailable', seq: request.seq }); return; }
  const mock = request.source === 'share' ? demoShare : mockFeeds.get(request.source);
  session?.sizeHint(request.source, request.width, request.height);
  const element = peerVideos.get(request.source) ?? (request.source === 'self' ? self : request.source === 'presenting' ? presenting
    : request.source === 'local' ? local : request.source === 'share' ? share : video);
  if (request.source.startsWith('remote-') && !peerVideos.has(request.source)) { send({ type: 'unavailable', seq: request.seq }); return; }
  if (!mock && ((request.source.startsWith('mock-') && !(request.source === 'mock-1' && demoParticipants))
    || !(element.srcObject instanceof MediaStream) || !element.srcObject.getVideoTracks().some(track => track.readyState === 'live')
    || element.readyState < 2 || !element.videoWidth || !element.videoHeight)) {
    send({ type: 'unavailable', seq: request.seq }); return;
  }
  capturing = true;
  const epoch = generation;
  try {
    const sourceWidth = mock?.canvas.width ?? element.videoWidth, sourceHeight = mock?.canvas.height ?? element.videoHeight;
    const ratio = Math.min(1, request.width / sourceWidth, request.height / sourceHeight);
    const width = Math.max(1, Math.floor(sourceWidth * ratio));
    const height = Math.max(1, Math.floor(sourceHeight * ratio));
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: request.format === 'rgba' })!;
    const capturedAt = Date.now();
    context.drawImage(mock?.canvas ?? element, 0, 0, width, height);
    // Count presented media frames, not synthetic canvas ticks: a stalled video
    // element must not look healthy merely because the demo's timer advances.
    const sourceFrame = mock?.frame ?? element.getVideoPlaybackQuality().totalVideoFrames;
    const data = request.format === 'rgba' ? context.getImageData(0, 0, width, height).data
      : new Uint8Array(await (await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Frame encoding failed.')), 'image/png'))).arrayBuffer());
    if (epoch === generation && !stopped && socket?.readyState === WebSocket.OPEN && socket.bufferedAmount === 0) {
      socket.send(encodeFrame({ seq: request.seq, width, height, format: request.format, capturedAt, sourceFrame,
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }));
    } else send({ type: 'unavailable', seq: request.seq });
  } catch { send({ type: 'error', stage: 'capture' }); send({ type: 'unavailable', seq: request.seq }); }
  finally { capturing = false; canvas.width = canvas.height = 1; }
}
window.__wbx = {
  connect(url, key) {
    if (socket) throw new Error('Already connected.');
    socket = new WebSocket(url, ['wbx-proto', key]);
    socket.onopen = () => setStatus('ready');
    socket.onclose = () => { void stop(); };
    socket.onmessage = event => {
      let command;
      try { command = parseCommand(String(event.data)); }
      catch { send({ type: 'error', stage: 'protocol' }); return; }
      if (command.type === 'capture') { void capture(command); return; }
      if (command.type === 'leave') { void stop(); return; }
      if (command.type === 'oauth-token' || command.type === 'oauth-failed') { credentials.receive(command); return; }
      if (command.type === 'oauth-renew') { if (!stopped) void session?.renewCredentials(); return; }
      if (command.type === 'chat') {
        if (stopped) return;
        if (demoParticipants) {
          demoChat ??= new SpaceChat(demoMessaging(), chat => send({ type: 'chat-state', chat }), send, promise => promise, 4000, 'demo');
          void demoChat.handle(command);
        } else if (session) void session.chat(command);
        else if (command.action === 'send') send({ type: 'chat-result', requestId: command.requestId, roomId: command.roomId, status: 'failed', problem: 'not-connected' });
        else send({ type: 'chat-state', chat: { ...emptyChat(), state: 'failed', problem: 'not-connected' } });
        return;
      }
      if (command.type === 'audio') { void setAudio(command.enabled).catch(() => send({ type: 'error', stage: 'audio' })); return; }
      if (command.type === 'camera') {
        if (!stopped) { cameraRequestId = command.requestId; void camera.setEnabled(command.enabled); }
        return;
      }
      if (command.type === 'send') {
        if (stopped) return;
        sendRequests[command.kind] = command.requestId;
        armed[command.kind] = command.enabled && (sending[command.kind] === 'off' || sending[command.kind] === 'awaiting');
        if (command.enabled) {
          if (!session) { armed[command.kind] = false; sendState(command.kind, 'off', 'not-connected'); }
          else {
            if (sending[command.kind] === 'off') sendState(command.kind, 'awaiting');
            if (armed[command.kind]) revealConfirmation(command.kind);
          }
          return; // all sending requires explicit trusted browser confirmation
        }
        outgoing[command.kind].setEnabled(command.enabled); return;
      }
      if (command.type === 'demo-update') {
        if (demoParticipants && !stopped) updateDemo(command.participants ?? demoParticipants, command.share ?? !!demoShare);
        else send({ type: 'error', stage: 'protocol' });
        return;
      }
      if (started || stopped) { send({ type: 'error', stage: 'protocol' }); return; }
      started = true;
      if (command.mode === 'demo') { startDemo(command.pattern, command.participants, command.mockShare); return; }
      const { token, meeting } = command;
      void (async () => {
        let factory: Factory;
        try { factory = await loadSDK(); }
        catch { send({ type: 'error', stage: 'sdk' }); setStatus('failed'); return; }
        if (stopped) return;
        session = new WebexSession(factory, { status: setStatus,
          video: value => stream(video, value), share: value => stream(share, value), audio: setAudioStreams,
          sendEnded: (kind, reason) => { armed[kind] = false; outgoing[kind].setEnabled(false, reason); },
          participants: setParticipants, notice: message => send({ type: 'notice', message }), chat: send, auth: send }, () => credentials.refresh());
        // Space messaging shares this SDK/account; no second join or browser.
        try { await session.start(token!, meeting!, command.oauth); }
        catch { if (!stopped) { send({ type: 'error', stage: 'join' }); setStatus('failed'); } await session.stop(); }
      })();
    };
  },
};
audioButton.onclick = () => { void setAudio(!audioEnabled).catch(() => send({ type: 'error', stage: 'audio' })); };
cameraButton.onclick = () => send({ type: 'camera-request', enabled: cameraState === 'off' });
for (const kind of sendKinds) document.querySelector<HTMLButtonElement>(`#send-${kind}`)!.onclick = event => {
  if (!event.isTrusted || stopped) return;
  if (armed[kind]) {
    armed[kind] = false;
    // No WebSocket round trip here: preserve the chooser's transient activation.
    outgoing[kind].setEnabled(true); return;
  }
  if (sending[kind] === 'starting' || sending[kind] === 'on') {
    // Stop capture locally, even if the terminal/transport is stalled.
    armed[kind] = false; outgoing[kind].setEnabled(false); return;
  }
  send({ type: 'send-request', kind, enabled: sending[kind] === 'off' });
};
document.querySelector<HTMLButtonElement>('#leave')!.onclick = () => { void stop(); };
window.addEventListener('pagehide', () => { void stop(); });
