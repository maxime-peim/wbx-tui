import { sendKinds, type SendKind, type SendReason, type Status, type WorkerEvent } from '../protocol.js';
import { emptyChat, type ChatRequest } from '../chat-protocol.js';
import { SpaceChat, type MessagingSDK } from './chat.js';
import type { AccessCredentials, OAuthMeta } from '../auth-protocol.js';
import type { LocalStream } from './outgoing.js';
import { ParticipantViews, type Members, type ParticipantMedia, type RemoteManager, type RemoteVideo } from './participants.js';

// Narrow SDK boundary: deliberately no private signaling or SDK objects in IPC.
type Listener = (...args: any[]) => void;
interface Emitter { on(name: string, fn: Listener): void; off?(name: string, fn: Listener): void }
interface RemoteMedia extends RemoteVideo {}
interface Group { getRemoteMedia(): RemoteMedia[] }
// Keep the pinned SDK's own timers below the browser's signed 32-bit limit.
// Shortening its effective lifetime is conservative; Node keeps the real expiry.
const sdkExpiry = (expiresAt: number) => Math.min(expiresAt, Date.now() + 2_000_000_000);
export interface Meeting extends Emitter {
  join(options: unknown): Promise<unknown>;
  addMedia(options: unknown): Promise<unknown>;
  updateMedia?(options: { audioEnabled?: boolean; videoEnabled?: boolean }): Promise<unknown>;
  publishStreams?(streams: { microphone?: LocalStream; camera?: LocalStream; screenShare?: { video: LocalStream } }): Promise<void>;
  unpublishStreams?(streams: LocalStream[]): Promise<void>;
  members?: Members;
  remoteMediaManager?: RemoteManager;
  leave(): Promise<unknown>;
}
export interface SDK extends Emitter, MessagingSDK {
  ready?: boolean;
  credentials?: { refresh(): Promise<unknown>; getUserToken?(scope?: string): Promise<{ toString(): string }>;
    on?(name: string, listener: Listener): void; off?(name: string, listener: Listener): void };
  meetings: Emitter & {
    register(): Promise<unknown>; unregister(): Promise<unknown>;
    create(link: string): Promise<Meeting>;
    mediaHelpers?: {
      createMicrophoneStream(constraints: MediaTrackConstraints): Promise<LocalStream>;
      createCameraStream(constraints: MediaTrackConstraints): Promise<LocalStream>;
      createDisplayStream(): Promise<LocalStream>;
    };
  };
  internal?: { mercury?: { disconnect(): Promise<unknown> } };
}
export interface Factory { init(options: unknown): SDK }
export interface MediaSink {
  status(state: Status): void;
  video(stream: MediaStream | null): void;
  share(stream: MediaStream | null): void;
  audio(streams: MediaStream[]): void;
  sendEnded?(kind: SendKind, reason: SendReason): void;
  participants?(media: ParticipantMedia[]): void;
  notice?(message: string): void;
  chat?(event: Extract<WorkerEvent, { type: 'chat-state' | 'chat-result' }>): void;
  auth?(event: Extract<WorkerEvent, { type: 'auth-state' }>): void;
}
export class WebexSession {
  private sdk?: SDK;
  private meeting?: Meeting;
  private closed = false;
  private abort = new AbortController();
  private offs: (() => void)[] = [];
  private videoOffs: (() => void)[] = [];
  private connected = false;
  private localTail: Promise<unknown> = Promise.resolve();
  private localQueued = 0;
  private localFailed = false;
  private participantViews?: ParticipantViews;
  private audioStreams: MediaStream[] = [];
  private shareAudioStreams: MediaStream[] = [];
  private spaceChat?: SpaceChat;
  private oauth = false;
  private authCredential?: AccessCredentials;
  private confirmedCredential?: AccessCredentials;
  private confirming?: Promise<void>;
  constructor(private factory: Factory, private sink: MediaSink, private renew?: () => Promise<AccessCredentials>) {}

  private listen(emitter: Emitter, name: string, fn: Listener, list = this.offs): void {
    emitter.on(name, fn);
    list.push(() => emitter.off?.(name, fn));
  }
  private wait<T>(pending: Promise<T>, timeout = 45_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); this.abort.signal.removeEventListener('abort', cancel); };
      const cancel = () => { finish(); reject(new Error('Meeting operation canceled.')); };
      const timer = setTimeout(cancel, timeout);
      this.abort.signal.addEventListener('abort', cancel, { once: true });
      if (this.abort.signal.aborted) cancel();
      pending.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    });
  }
  private bind(meeting: Meeting): void {
    if (meeting.members?.getCsisForMember && this.sink.participants) {
      this.participantViews = new ParticipantViews(meeting.members, () => meeting.remoteMediaManager, this.sink.participants,
        promise => this.wait(promise, 15_000), () => this.sink.notice?.('Individual video selection unavailable; using active-speaker fallback.'));
      this.listen(meeting.members, 'members:update', (event: { full: Record<string, any> }) => this.participantViews?.update(event.full));
      this.listen(meeting.members, 'members:clear', () => this.participantViews?.update({}));
    }
    this.listen(meeting, 'meeting:self:lobbyWaiting', () => !this.closed && this.sink.status('lobby'));
    this.listen(meeting, 'meeting:self:guestAdmitted', () => !this.closed && this.sink.status('negotiating'));
    this.listen(meeting, 'media:remoteVideo:layoutChanged', (layout: {
      activeSpeakerVideoPanes: Record<string, Group>; memberVideoPanes?: Record<string, RemoteVideo>; screenShareVideo?: RemoteMedia;
    }) => {
      if (this.closed) return;
      this.videoOffs.splice(0).forEach(off => off());
      this.participantViews?.layout(layout.memberVideoPanes ?? {});
      const media = Object.values(layout.activeSpeakerVideoPanes ?? {}).flatMap(group => group.getRemoteMedia()).slice(0, 1);
      const publish = () => {
        if (!this.closed && !this.participantViews?.enabled) this.sink.video(media.find(item => item.sourceState === 'live')?.stream ?? null);
      };
      for (const remote of media) {
        this.listen(remote, 'sourceUpdate', publish, this.videoOffs);
        this.listen(remote, 'stopped', publish, this.videoOffs);
      }
      publish();
      const share = layout.screenShareVideo;
      const publishShare = () => !this.closed && this.sink.share(share?.sourceState === 'live' ? share.stream : null);
      if (share) for (const event of ['sourceUpdate', 'stopped']) this.listen(share, event, publishShare, this.videoOffs);
      publishShare();
    });
    this.listen(meeting, 'media:remoteAudio:created', (group: Group) => {
      if (!this.closed) { this.audioStreams = group.getRemoteMedia().slice(0, 3).map(remote => remote.stream); this.sink.audio([...this.audioStreams, ...this.shareAudioStreams]); }
    });
    this.listen(meeting, 'media:remoteScreenShareAudio:created', (group: Group) => {
      if (!this.closed) { this.shareAudioStreams = group.getRemoteMedia().slice(0, 1).map(remote => remote.stream); this.sink.audio([...this.audioStreams, ...this.shareAudioStreams]); }
    });
    this.listen(meeting, 'meeting:stoppedSharingRemote', () => {
      if (this.closed) return;
      this.sink.share(null); this.shareAudioStreams = []; this.sink.audio([...this.audioStreams]);
    });
    this.listen(meeting, 'meeting:stoppedSharingLocal', () => this.sink.sendEnded?.('screen', 'ended'));
    this.listen(meeting, 'meeting:self:mutedByOthers', () => this.sink.sendEnded?.('microphone', 'host-muted'));
    this.listen(meeting, 'meeting:stateChange', (event: { currentState?: string }) => {
      if (!this.closed && ['LEFT', 'ENDED', 'DESTROYED'].includes(event.currentState ?? '')) {
        this.sink.status('ended');
        void this.stop();
      }
    });
  }
  async start(token: string, link: string, oauth?: OAuthMeta): Promise<void> {
    if (this.sdk || this.closed) throw new Error('This session cannot be started again.');
    this.oauth = !!oauth;
    const refreshCallback = async () => {
      if (this.closed || !this.renew) throw new Error('OAuth renewal unavailable.');
      this.sink.auth?.({ type: 'auth-state', method: 'oauth', state: 'refreshing' });
      try {
        const next = await this.wait(this.renew(), 20_000);
        if (this.closed || next.expiresAt <= Date.now()) throw new Error('OAuth renewal canceled or expired.');
        this.authCredential = next;
        return { access_token: next.token, expires: sdkExpiry(next.expiresAt), scope: next.scope, refresh_token: 'owner-managed' };
      } catch {
        if (!this.closed) {
          this.authFailed();
        }
        throw new Error('OAuth renewal failed; sign in again.');
      }
    };
    const sdk = this.sdk = this.factory.init({ credentials: { access_token: token,
      ...(oauth ? { expires: sdkExpiry(oauth.expiresAt), scope: oauth.scope, refresh_token: 'owner-managed' } : {}) }, config: {
      ...(oauth ? { credentials: { client_id: oauth.clientId, scope: oauth.scope, refreshCallback } } : {}),
      logger: { level: 'silent', bufferLogLevel: 'silent', historyLength: 0 },
      meetings: { autoUploadLogs: false },
    } });
    if (oauth) {
      this.authCredential = { token, ...oauth };
      if (sdk.credentials?.on) this.listen(sdk.credentials as Emitter, 'change:supertoken', () => {
        void this.confirmCredentials().catch(() => this.authFailed());
      });
    } else this.sink.auth?.({ type: 'auth-state', method: 'token', state: 'ready' });
    this.listen(sdk, 'client:InvalidRequestError', () => {
      if (this.closed) return;
      this.sink.auth?.({ type: 'auth-state', method: this.oauth ? 'oauth' : 'token', state: 'failed', reason: 'expired' });
      this.sink.status('ended'); void this.stop();
    });
    this.sink.status('registering');
    if (!sdk.ready) await this.wait(new Promise<void>(resolve => this.listen(sdk, 'ready', resolve)));
    if (oauth) await this.confirmCredentials();
    const registering = sdk.meetings.register();
    void registering.then(() => { if (this.closed) void sdk.meetings.unregister().catch(() => {}); }, () => {});
    await this.wait(registering);
    this.sink.status('joining');
    const creating = sdk.meetings.create(link);
    void creating.then(meeting => { if (this.closed) void meeting.leave().catch(() => {}); }, () => {});
    const meeting = this.meeting = await this.wait(creating);
    this.bind(meeting);
    const joining = meeting.join({ enableMultistream: true });
    void joining.then(() => { if (this.closed) void meeting.leave().catch(() => {}); }, () => {});
    await this.wait(joining);
    this.sink.status('negotiating');
    const adding = meeting.addMedia({
      localStreams: {}, audioEnabled: true, videoEnabled: true,
      shareAudioEnabled: true, shareVideoEnabled: true,
      additionalMediaOptions: { sendAudio: false, sendVideo: false, receiveAudio: true, receiveVideo: true },
      remoteMediaManagerConfig: {
        audio: { numOfActiveSpeakerStreams: 3, numOfScreenShareStreams: 1 },
        video: { preferLiveVideo: true, initialLayoutId: 'Single', layouts: {
          Single: { activeSpeakerVideoPaneGroups: [{ id: 'main', numPanes: 1, size: 'medium', priority: 255 }],
            screenShareVideo: { size: 'best' } },
          People: { memberVideoPanes: Array.from({ length: 12 }, (_, i) => ({ id: `person-${i + 1}`, size: 'medium' })),
            screenShareVideo: { size: 'best' } },
        } },
      },
    });
    void adding.then(() => { if (this.closed) void meeting.leave().catch(() => {}); }, () => {});
    await this.wait(adding);
    if (!this.closed) { this.connected = true; this.sink.status('connected'); this.participantViews?.start(); }
  }
  sizeHint(source: import('../protocol.js').Source, width: number, height: number): void { this.participantViews?.sizeHint(source, width, height); }
  private authFailed(): void {
    if (this.closed) return;
    this.sink.auth?.({ type: 'auth-state', method: 'oauth', state: 'failed', reason: 'failed' });
    this.sink.status('ended'); void this.stop();
  }
  private confirmCredentials(): Promise<void> {
    if (this.confirming) return this.confirming;
    const expected = this.authCredential;
    if (!expected || this.closed || this.confirmedCredential === expected) return Promise.resolve();
    const get = this.sdk?.credentials?.getUserToken;
    if (!get) return Promise.reject(new Error('OAuth requires public SDK credential access.'));
    this.confirming = this.wait(get.call(this.sdk!.credentials, expected.scope), 20_000).then(token => {
      if (this.closed || this.authCredential !== expected) return;
      if (expected.expiresAt <= Date.now() || token.toString() !== `Bearer ${expected.token}`) throw new Error('SDK did not adopt renewed credentials.');
      this.confirmedCredential = expected;
      this.sink.auth?.({ type: 'auth-state', method: 'oauth', state: 'ready', expiresAt: expected.expiresAt });
    }).finally(() => { this.confirming = undefined; });
    return this.confirming;
  }
  async renewCredentials(): Promise<void> {
    if (this.closed || !this.oauth || !this.sdk?.credentials) { this.sink.notice?.('Credential renewal requires an OAuth call.'); return; }
    try { await this.sdk.credentials.refresh(); await this.confirmCredentials(); } catch { this.authFailed(); }
  }
  async chat(request: ChatRequest): Promise<void> {
    if (!this.connected || this.closed || !this.sdk) {
      if (request.action === 'send') this.sink.chat?.({ type: 'chat-result', requestId: request.requestId, roomId: request.roomId, status: 'failed', problem: 'not-connected' });
      else this.sink.chat?.({ type: 'chat-state', chat: { ...emptyChat(), state: 'failed', problem: 'not-connected' } });
      return;
    }
    this.spaceChat ??= new SpaceChat(this.sdk, chat => this.sink.chat?.({ type: 'chat-state', chat }),
      result => this.sink.chat?.(result), promise => this.wait(promise, 15_000));
    await this.spaceChat.handle(request);
  }
  acquireLocal(kind: SendKind): Promise<LocalStream> {
    if (this.closed || !this.connected || this.localFailed) return Promise.reject(Object.assign(new Error('Not connected or local negotiation needs a rejoin.'), { name: 'NotConnectedError' }));
    const helpers = this.sdk?.meetings.mediaHelpers;
    if (!helpers) return Promise.reject(Object.assign(new Error('Media helpers unavailable.'), { name: 'NotSupportedError' }));
    if (kind === 'microphone') return helpers.createMicrophoneStream({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    if (kind === 'camera') return helpers.createCameraStream({ width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 24 } });
    return helpers.createDisplayStream(); // video-only helper, requires a real browser click
  }
  private localOperation(operation: () => Promise<void>): Promise<void> {
    if (this.localQueued >= 8) return Promise.reject(new Error('Too many media operations.'));
    this.localQueued++;
    const next = this.localTail.then(operation);
    this.localTail = next.catch(() => {}).finally(() => { this.localQueued--; });
    return next;
  }
  publishLocal(kind: SendKind, stream: LocalStream): Promise<void> {
    return this.localOperation(async () => {
      const meeting = this.meeting;
      if (this.closed || !this.connected || this.localFailed || !meeting?.publishStreams) throw new Error('Meeting media unavailable.');
      try {
        if (kind !== 'screen') {
          if (!meeting.updateMedia) throw new Error('Meeting update API unavailable.');
          await this.wait(meeting.updateMedia(kind === 'microphone' ? { audioEnabled: true } : { videoEnabled: true }), 15_000);
        }
        if (this.closed || !stream.outputStream.getTracks().some(track => track.readyState === 'live' && track.enabled)) return;
        const publishing = meeting.publishStreams(kind === 'screen' ? { screenShare: { video: stream } } : { [kind]: stream });
        void publishing.then(() => {
          if (this.closed || !stream.outputStream.getTracks().some(track => track.readyState === 'live' && track.enabled)) {
            void meeting.unpublishStreams?.([stream]).catch(() => {});
          }
        }, () => {});
        await this.wait(publishing, 15_000);
      } catch (error) { this.localFailed = true; throw error; }
    });
  }
  unpublishLocal(stream: LocalStream): Promise<void> {
    return this.localOperation(async () => {
      if (!this.closed && this.meeting?.unpublishStreams) await this.wait(this.meeting.unpublishStreams([stream]), 15_000);
    });
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.authCredential = this.confirmedCredential = undefined;
    this.spaceChat?.close();
    this.participantViews?.close();
    for (const kind of sendKinds) this.sink.sendEnded?.(kind, 'ended');
    this.abort.abort();
    [...this.videoOffs.splice(0), ...this.offs.splice(0)].forEach(off => off());
    this.sink.video(null); this.sink.share(null); this.sink.audio([]);
    try { await this.meeting?.leave(); } catch { /* browser teardown is the hard stop */ }
    try { await this.sdk?.meetings.unregister(); } catch { /* best effort */ }
    try { await this.sdk?.internal?.mercury?.disconnect(); } catch { /* best effort */ }
  }
}
