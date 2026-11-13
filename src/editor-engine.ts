import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { configPath, loadEditorConfig, readEditorOAuthClientSecret } from './config.js';
import { OAuthError, type OAuthSession, type OAuthConfig, type OAuthDelegate, type OAuthSeed } from './oauth.js';
import { MessagingError, parseMessage, type MessageRoom, type MessagingAPI } from './messaging-api.js';
import { webexAttachment } from './message-images.js';
import type { MessagingStore } from './messaging-store.js';
import { ContentAdmission, type ContentLease } from './content-admission.js';
import { validAttachmentOptions, type AttachmentResolveOptions } from './attachment-policy.js';
import { AttachmentTransfer, type AttachmentPull, type AttachmentComplete } from './attachment-transfer.js';
import { openSystemBrowser } from './system-browser.js';
import { chatId, chatText } from './chat-protocol.js';
import type { ReadStatusSource } from './read-status.js';
import { MESSAGE_EVENT_LIMITS, type ReadChange, type RoomReadStatus } from './read-status-protocol.js';
import { ReadSourceLifecycle } from './read-source-lifecycle.js';
import { RetainedUnread, type UnreadRetention } from './retained-unread.js';
import { DiskCacheLifecycle, DiskCacheError } from './disk-cache-lifecycle.js';
import { VerifiedStorageIdentity, StorageIdentityError } from './verified-storage-identity.js';
import type { AccessCredentials } from './auth-protocol.js';
import type { WebexSelectedPeopleProvider, SelectedPeopleStatus } from './people-selected.js';
import { type PeopleProviderOptions } from './people-status.js';
import { PresenceLifecycle, type PresenceContext } from './presence-lifecycle.js';
import type { SenderNames } from './sender-names.js';
import { ReceivedCache, receivedContentKey } from './received-cache.js';
import { composeBackendProviders, createMessagingStore, defaultReadStatusFactory, defaultPeopleFactory,
  defaultUpcomingFactory, defaultAuthorization, defaultSpacesCache } from './backend-providers.js';
import { LocalDrafts, type LocalDraft } from './local-drafts.js';
import { LocalDraftsLifecycle, LocalDraftError } from './local-drafts-lifecycle.js';
import { SectionPreferences, type SectionEdit } from './local-sections.js';
import { SectionPreferencesLifecycle, SectionPreferenceError } from './section-preferences-lifecycle.js';
import { Uploads, UploadFailure, uploadId, uploadDraftId, validUploadBinding, validSnapshotBinding, validUploadSendOptions, snapshotBinding, type SnapshotBinding, type UploadBinding, type UploadSendOptions } from './uploads.js';
import { postUpload, type UploadRequest } from './upload-http.js';
import { PublicREST, PublicProblem, type PublicRequest, type ActionREST } from './public-rest.js';
import { demoREST } from './demo-rest.js';
import { postDemoRecipientFile } from './demo-recipient-file.js';
import { MessageActions, validRichText, type MessageAction, type MutationIntent } from './message-actions.js';
import { MessageReactions, ReactionInspectionRequired } from './message-reactions.js';
import { DemoReactions } from './demo-reactions.js';
import { REACTION_LIMITS, ReactionReadError, validReactionBatch, type Reaction, type ReactionAction, type ReactionCommand, type ReactionBatch, type ReactionProgress } from './reaction-contracts.js';
import { validMessageReaders, type MessageReaders } from './message-readers.js';
import { RoomMembers, authenticatedSelf } from './room-members.js';
import { richMentions, validateMentions, type MentionConsent } from './rich-messages.js';
import { validMessageAck } from './message-ack.js';
import { ConversationActions, CONVERSATION_LIMITS, type DirectOptions } from './conversation-actions.js';
import { ServerTeams } from './server-teams.js';
import { DirectorySearch } from './directory-search.js';
import { readPersonProfile } from './people-profile.js';
import { MessageQueries } from './message-queries.js';
import type { WebexUpcomingMeetingsProvider, UpcomingMeetingsOptions } from './upcoming-meetings.js';
import { UpcomingAgenda } from './upcoming-agenda.js';
import { type SpacesCache, cachedSpaceMetadata, spacesCacheAccount, spacesCacheKey, spacesCacheScope } from './spaces-cache.js';

export class EditorError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}
interface EditorRoom extends MessageRoom { unread?: boolean; unreadStale?: boolean; unreadActivity?: string; cached?: boolean; notifications?:boolean }
/** Local owner/clock seams, not editor RPC or configuration. Existing positional owners stay compatible. */
export interface EditorEngineOwners {
  receivedCache?: () => ReceivedCache;
  messaging?: (api: MessagingAPI, pollMs: number, mode: 'demo' | 'live') => MessagingStore;
  /** Optional provider presentation clock; authorization keeps its real expiry clock. */
  now?: () => number;
  /** Local test/transport seam, never an RPC field or configurable service URL. */
  senderFetch?: typeof fetch;
  sectionPreferences?: SectionPreferences;
  localDrafts?: LocalDrafts;
  uploads?: Uploads;
  uploadRequest?: UploadRequest;
  publicRequest?: PublicRequest;
}
export interface EditorStartIntent {
  mode: 'demo' | 'live'; config?: string; readStatus?: boolean; peopleStatus?: boolean;
  upcomingMeetings?: boolean; spacesCache?: boolean; notificationPreview?: boolean; senderNames?: boolean;
}
/** Editor-neutral owner. No terminal, editor API, draft editor or screen renderer. */
export class EditorEngine extends EventEmitter {
  private store?: MessagingStore;
  private contentAdmission = new ContentAdmission();
  private attachmentOperations = new Map<number, { store: MessagingStore; generation: number; abort: AbortController }>();
  private attachmentTransfer?: AttachmentTransfer;
  private attachmentPipeline?: object;
  private oauth?: OAuthSession;
  private abort?: AbortController;
  private token = '';
  private expiresAt = 0;
  private grantedScope = '';
  private generation = 0;
  /** Ephemeral local UI fence, NOT a verified account/profile or storage key. */
  private localSession = '';
  private readonly identity: VerifiedStorageIdentity;
  private readonly drafts: LocalDraftsLifecycle;
  private renewing?: Promise<void>;
  private revision = 0;
  private mode: 'demo' | 'live' = 'demo';
  private state: 'idle' | 'connecting' | 'ready' | 'failed' = 'idle';
  private auth = 'off';
  private notice = '';
  private readonly reads: ReadSourceLifecycle;
  /** Session-local history, distinct from the current source's fresh room set. */
  private readonly unread = new RetainedUnread();
  private wantReadStatus = false;
  private wantNotificationPreview = false;
  private wantSenderNames = false;
  private senderScope?: string;
  private readonly names: SenderNames;
  private readonly preferences: SectionPreferencesLifecycle;
  private readonly uploads: Uploads;
  private uploadTransaction?: { generation: number };
  private readonly publicREST: PublicREST;
  private readonly actionREST: ActionREST;
  private readonly actions: MessageActions;
  private readonly reactions = new MessageReactions(command=>this.reactionProvider(command),Date.now,(batch,progress)=>this.reactionBatchProvider(batch,progress));
  private readonly demoReactions = new DemoReactions();
  private readonly members = new RoomMembers();
  private featureAbort?: AbortController;
  private readonly conversations: ConversationActions;
  private readonly teams = new ServerTeams();
  private readonly directory = new DirectorySearch();
  private readonly messageQueries = new MessageQueries();
  private directPending = false;
  private directTransaction?: object;
  private wantPeopleStatus = false;
  private readonly presence: PresenceLifecycle;
  private wantUpcomingMeetings = false;
  private readonly agenda: UpcomingAgenda;
  private initialRoomsPending = false;
  private readonly disk: DiskCacheLifecycle;
  private received?: ReceivedCache;
  config = configPath();
  constructor(private openBrowser = openSystemBrowser, readStatusFactory: () => ReadStatusSource = defaultReadStatusFactory,
    peopleFactory: (options: PeopleProviderOptions) => WebexSelectedPeopleProvider = defaultPeopleFactory,
    upcomingFactory: (options: UpcomingMeetingsOptions) => WebexUpcomingMeetingsProvider = defaultUpcomingFactory,
    private authorization: { create: (config: OAuthConfig, secret: string) => OAuthSession; share: (seed: OAuthSeed) => Promise<OAuthDelegate> } = defaultAuthorization(),
    private spacesCache: { create(): SpacesCache; account: typeof spacesCacheAccount } = defaultSpacesCache(), private owners: EditorEngineOwners = {}) {
    super();
    const providers = composeBackendProviders(readStatusFactory, peopleFactory, upcomingFactory, owners);
    this.identity = new VerifiedStorageIdentity((access, signal) => this.spacesCache.account(access, signal));
    this.drafts = new LocalDraftsLifecycle(() => this.owners.localDrafts ?? new LocalDrafts());
    this.preferences = new SectionPreferencesLifecycle({
      create: () => this.owners.sectionPreferences ?? new SectionPreferences(),
      rooms: () => this.snapshot().rooms.map(room => room.id), changed: () => this.publish(),
    });
    this.disk = new DiskCacheLifecycle({
      create: () => this.spacesCache.create(),
      metadata: () => this.store ? cachedSpaceMetadata(this.store.rooms) : undefined,
      changed: () => this.publish(),
    });
    this.reads = new ReadSourceLifecycle({
      create: providers.readStatus, revoked: room => this.store?.isRevoked(room) ?? false,
      observed: (rooms, observedAt, changed) => this.readRoomsObserved(rooms, observedAt, changed),
      started: rooms => { if (this.store) this.store.mergeRooms(rooms); this.publish(); },
      changed: () => this.publish(),
      eventsChanged: () => { this.observeSenderNames(); this.publish(); },
      changes: changes => { if (this.store) this.applyReadChanges(this.store, changes); },
      invalidated: () => this.reactions.reset(),
      overflow: () => { this.abort?.abort(); this.failed('Startup invalidation budget reached. Reconnect explicitly; no old access was assumed.'); },
    });
    this.presence = new PresenceLifecycle({
      create: providers.people,
      changed: () => this.publish(), now: owners.now,
    });
    this.agenda = new UpcomingAgenda({
      create: providers.upcoming,
      changed: () => this.publish(),
    });
    this.names = providers.names();
    this.names.onChange = () => {
      if (this.wantSenderNames && this.state === 'ready') {
        this.received?.observeNames(this.names.persisted()); this.publish();
      }
    };
    this.uploads = owners.uploads ?? new Uploads();
    this.uploads.onProgress = progress => { if (this.state === 'ready') this.emit('upload.progress', progress); };
    this.publicREST = new PublicREST(owners.publicRequest);
    this.actionREST = { busy: () => this.publicREST.busy(), settled: () => this.publicREST.settled(), call: async (path, method, token, signal, body) => {
      if (this.mode !== 'demo') return this.publicREST.call(path, method, token, signal, body);
      return demoREST(this.store, path, method, signal, body);
    } };
    this.actions = new MessageActions(this.actionREST, () => this.mode === 'demo'
      ? { token: 'LOCAL-DEMO', scopes: ['spark:all'], expiresAt: Number.MAX_SAFE_INTEGER }
      : { token: this.token, scopes: this.grantedScope.split(/\s+/), expiresAt: this.expiresAt }, this.members);
    this.conversations = new ConversationActions(this.actionREST, this.members, () => this.mode === 'demo'
      ? { token: 'LOCAL-DEMO', scopes: ['spark:all'], expiresAt: Number.MAX_SAFE_INTEGER }
      : { token: this.token, scopes: this.grantedScope.split(/\s+/), expiresAt: this.expiresAt },
      (signal, token) => authenticatedSelf(this.actionREST, signal, token), {
        uploads: this.uploads, knownMessage: (room, id) => this.store?.room?.id === room && !!this.store.messages.some(item => item.id === id),
        post: async (source, target, text, intent, token, signal, submitted) => {
          if (this.mode !== 'demo') return postUpload(source, { ...target, text, ...(intent.format ? { format: intent.format } : {}) },
            token, signal, submitted, this.owners.uploadRequest);
          return postDemoRecipientFile(() => this.store, source, target, text, intent, signal, submitted);
        },
      }, self => this.mode === 'demo'
        ? 'demo:' + spacesCacheKey(this.config, { clientId: 'demo', redirectUri: 'demo', scopes: [] }, self)
        : 'live:' + this.identity.partition(this.config, self));
  }
  /** Detached observational projection. Time-sensitive reads are not a whole-state memoization key. */
  snapshot() {
    const s = this.store;
    const uploadPending = !!s?.sending && this.uploadTransaction?.generation === this.generation;
    const senderNames = this.wantSenderNames && this.names.allowed();
    const cache = this.disk.snapshot();
    const sections = this.preferences.snapshot();
    const restored = s?.room && !s.ready && !s.isRevoked(s.room.id) && !s.messages.length
      ? this.received?.messages(s.room.id) ?? [] : [];
    const messages = restored.length ? restored : s?.messages ?? [];
    const rooms: EditorRoom[] = cache.rooms ? cache.rooms.filter(room => !s?.isRevoked(room.id)).map(room => {
      const value = this.roomReadStatus(room);
      return { ...value, cached: true, ...(value.unread !== undefined ? { unreadStale: true } : {}) };
    })
      : (this.initialRoomsPending || this.disk.browseOnly ? [] : s?.rooms ?? []).map(room => this.roomReadStatus(room));
    return { revision: this.revision, state: this.state, mode: this.mode, auth: this.auth, notice: this.notice || s?.notice || '',
      ...(this.state === 'ready' && this.localSession ? { localContext: { sessionId: this.localSession, coverage: 'session-only' as const } } : {}),
      rooms, room: s?.room ? this.roomReadStatus(s.room) : null,
      ...(senderNames ? { senderNames: true } : {}),
      ...(sections ? { sections } : {}),
      ...(uploadPending ? { uploadPending: true } : {}),
      ...(this.directPending ? { directPending: true } : {}),
      ...(restored.length ? { historyCached: true as const } : {}),
      ...(this.received && s?.room ? { cachedReactions: this.reads.available() || this.reads.status === 'connecting' || this.reads.evidence().degraded
        ? this.received.reactions(s.room.id, messages) : [] } : {}),
      messages: messages.map(({ authorId, senderName: _name, ...message }) => {
        const name = this.wantSenderNames ? this.names.peek(authorId) : undefined;
        return { ...message, ...(name ? { author: name, senderName: name } : {}),
          ...(message.images ? { images: message.images.map(image => ({ ...image, ...(image.lines ? { lines: [...image.lines] } : {}) })) } : {}),
          ...(message.attachments ? { attachments: message.attachments.map(file => ({ ...file })) } : {}),
          ...(message.cards ? { cards: { ...message.cards } } : {}),
        };
      }) ?? [], readStatus: this.reads.status, readStatusNotice: this.reads.notice,
      reactionSource: this.reads.evidence(),
      messageEvents: { ...this.reads.eventStatus(), ...(this.wantNotificationPreview ? { preview: true } : {}),
        ...(this.reads.senderNames() && senderNames ? { senderNames: true } : {}),
        // Do not expose a same-account echo ahead of its pending local send's
        // delivery ID. Once settled, exact local IDs are excluded natively;
        // simultaneous same-account posts from other clients can still notify.
        items: this.reads.messages().filter(item => (!item.self || !s?.sending || uploadPending)
          && Date.now() >= item.observedAt && Date.now() - item.observedAt <= MESSAGE_EVENT_LIMITS.ageMs).map(({ senderId, ...item }) => {
            const name = this.reads.senderNames() && item.preview ? this.names.peek(senderId) : undefined;
            return { ...item, ...(name ? { senderName: name } : {}) };
          }) },
      ...this.presence.snapshot(),
      spacesCache: cache.status,
      upcomingMeetings: this.agenda.snapshot(),
      joinedMeetings: this.wantUpcomingMeetings && this.wantReadStatus ? this.reads.joinedMeetings() : { state: 'off' as const, partial: true as const, items: [] },
      loading: s?.loading ?? false, loadingRooms: this.initialRoomsPending || (s?.loadingRooms ?? false),
      roomsStatus: s?.roomsStatus ?? 'unverified', ready: s?.ready ?? false,
      sending: s?.sending ?? false, moreRooms: this.disk.browseOnly ? false : s?.moreRooms ?? false, moreHistory: s?.moreHistory ?? false,
      historyLatest: !!s?.ready && !!s.latestMessageId && s.messages.at(-1)?.id === s.latestMessageId,
      uncertain: s?.room ? s.uncertain.has(s.room.id) : false };
  }
  private unreadRetention(): UnreadRetention {
    return { selected: this.store?.room?.id, freshRooms: this.reads.rooms().map(room => room.id) };
  }
  private observeReadActivity(): void {
    const store = this.store, id = store?.room?.id;
    if (!store || !id) return;
    this.unread.observeActivity(id, store.messages.map(message => message.created), store.latestMessageCreated, this.unreadRetention());
  }
  private roomReadStatus(room: MessageRoom): EditorRoom {
    // Unknown live mute preferences must not permit an early desktop alert.
    if (this.mode === 'live') room = {...room,notifications:this.reads.notifications(room.id) === true} as EditorRoom;
    if (!this.wantReadStatus) return { ...room };
    if (this.store?.isRevoked(room.id)) return { ...room };
    const observed = this.unread.peek(room.id);
    if (!observed) {
      const flag = this.disk.unread(room.id);
      return flag !== undefined ? { ...room, unread: flag, unreadStale: true } : { ...room };
    } // Never observed is unknown, not read/false. A disk flag is ALWAYS stale.
    return { ...room, unread: observed.unread, unreadActivity: observed.unreadActivity,
      // REST activity alone is not evidence of a new message. Actual observed
      // messages are; remember that contradiction even after changing rooms.
      unreadStale: this.reads.status !== 'ready' || !this.reads.hasRoom(room.id) || observed.contradicted };
  }
  private publish(): void { this.attachmentTransfer?.revalidate(); this.agenda.reconcile(); this.revision++; this.emit('state', this.snapshot()); }
  private async verifiedStorageKey(generation: number): Promise<string> {
    try {
      return await this.identity.key({ config: this.config, signal: this.abort?.signal,
        current: () => generation === this.generation && this.state === 'ready',
        access: () => ({ token: this.token, expiresAt: this.expiresAt, scope: this.grantedScope }) });
    } catch (error) {
      if (error instanceof StorageIdentityError) throw new EditorError(error.code, error.message);
      throw error;
    }
  }
  async openLocalDrafts() {
    this.connected();
    try {
      return await this.drafts.open(this.draftSession(this.generation));
    } catch (error) {
      if (error instanceof LocalDraftError) throw new EditorError(error.code, error.message);
      throw error;
    }
  }
  async saveLocalDrafts(profile: string, revision: string, items: LocalDraft[]) {
    this.connected();
    try {
      return await this.drafts.save(profile, revision, items, this.draftSession(this.generation));
    } catch (error) {
      if (error instanceof LocalDraftError) throw new EditorError(error.code, error.message);
      throw error;
    }
  }
  private draftSession(generation: number) {
    return { mode: this.mode, config: this.config, sessionId: this.localSession,
      current: () => generation === this.generation && this.state === 'ready',
      key: () => this.verifiedStorageKey(generation),
      allowed: () => this.mode === 'demo' || spacesCacheScope(this.grantedScope) && Date.now() < this.expiresAt };
  }
  private roomsLoaded(success: boolean): void {
    if (!this.disk.enabled) return;
    if (!success && this.store?.loadingRooms) return;
    this.initialRoomsPending = false;
    this.disk.roomsLoaded(success);
  }
  async clearCachedSpaces(): Promise<void> {
    try {
      const received = this.received?.clear();
      const results = await Promise.allSettled([this.disk.clear(), received]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
    catch (error) {
      throw new EditorError(-32029, error instanceof DiskCacheError && error.reason === 'unbound'
        ? 'No verified account cache is available to clear.' : 'Local spaces cache could not be cleared safely.');
    }
  }
  private startUpcoming(access: AccessCredentials): void {
    const generation = this.generation;
    this.agenda.start({
      credentials: { accountId: `editor-session-${generation}`, grantedScopes: access.scope.split(/\s+/),
        token: () => this.token && Date.now() < this.expiresAt ? this.token : '' },
      active: () => generation === this.generation && this.state === 'ready',
      signal: this.abort?.signal,
    });
  }
  async refreshUpcoming() {
    this.connected();
    this.reads.refreshJoinedMeetings();
    return this.agenda.refresh();
  }
  upcomingJoinTarget(meetingId: string, revision: number): string {
    this.connected();
    const target = this.agenda.joinTarget(meetingId, revision);
    if (!target) throw new EditorError(-32027, 'Upcoming meeting changed, expired or is not freshly joinable. Refresh the spaces list; nothing was joined.');
    return target;
  }
  private failed(message: string): void {
    this.received?.close(); this.received = undefined;
    this.disk.stop();
    this.initialRoomsPending = false;
    this.presence.stop();
    this.names.setSession();
    this.senderScope = undefined;
    this.preferences.reset();
    this.uploads.reset();
    this.uploadTransaction = undefined;
    this.actions.reset(); this.members.select(''); this.featureAbort?.abort();
    this.conversations.reset(); this.teams.reset(); this.directPending = false;
    this.directTransaction = undefined;
    this.agenda.stop();
    this.reads.sessionFailed(this.wantReadStatus);
    this.store?.close(); this.store = undefined; this.oauth?.close(); this.oauth = undefined; this.token = ''; this.expiresAt = 0;
    this.state = 'failed'; this.auth = 'failed'; this.notice = message; this.publish();
  }
  async start(mode: 'demo' | 'live', path?: string, readStatus = false, peopleStatus = false, upcomingMeetings = false, spacesCache = false, notificationPreview = false, senderNames = false): Promise<void> {
    return this.startIntent({ mode, config: path, readStatus, peopleStatus, upcomingMeetings, spacesCache, notificationPreview, senderNames });
  }
  /** Named worker entry; retain the public positional adapter and overridden owners. */
  startSession(intent: EditorStartIntent): Promise<void> {
    const args: Parameters<EditorEngine['start']> = [intent.mode, intent.config, intent.readStatus ?? false,
      intent.peopleStatus ?? false, intent.upcomingMeetings ?? false, intent.spacesCache ?? false, intent.notificationPreview ?? false, intent.senderNames ?? false];
    while (args.length > 3 && args.at(-1) === false) args.pop();
    return this.start(...args);
  }
  private async startIntent(intent: EditorStartIntent): Promise<void> {
    const { mode, config: path, readStatus = false, peopleStatus = false, upcomingMeetings = false,
      spacesCache = false, notificationPreview = false, senderNames = false } = intent;
    if (this.state === 'connecting') throw new EditorError(-32002, 'Sign-in already in progress. Cancel before starting another.');
    if (this.state === 'ready') {
      if (mode !== this.mode || path && path !== this.config || readStatus !== this.wantReadStatus || peopleStatus !== this.wantPeopleStatus || upcomingMeetings !== this.wantUpcomingMeetings
        || (mode === 'live' && spacesCache) !== this.disk.enabled || (readStatus && notificationPreview) !== this.wantNotificationPreview
        || senderNames !== this.wantSenderNames) throw new EditorError(-32002, 'Disconnect before changing account, mode or configuration.');
      this.publish(); return;
    }
    const nextConfig = configPath(path);
    this.stopSession(mode !== this.mode || nextConfig !== this.config);
    this.localSession = randomBytes(16).toString('hex');
    const generation = this.generation, abort = this.abort = new AbortController();
    const sectionIntent = this.preferences.intent();
    this.wantReadStatus = readStatus;
    this.wantNotificationPreview = readStatus && notificationPreview;
    this.wantSenderNames = senderNames;
    this.wantPeopleStatus = peopleStatus;
    this.presence.reset(peopleStatus, mode);
    this.wantUpcomingMeetings = upcomingMeetings;
    this.disk.reset(mode === 'live' && spacesCache, readStatus);
    this.received = mode === 'live' && spacesCache ? this.owners.receivedCache?.() ?? new ReceivedCache() : undefined;
    // A new authenticated cached session must not inherit another account's
    // in-memory flags before identity verification. Disk restores remain stale.
    if (this.disk.enabled) this.unread.clear();
    this.initialRoomsPending = mode === 'live' && readStatus;
    this.mode = mode; this.config = nextConfig; this.state = 'connecting'; this.auth = mode === 'demo' ? 'demo' : 'authorizing'; this.notice = ''; this.publish();
    try {
      let initialReadStatus: Promise<void> | undefined;
      if (mode === 'live') {
        const config = await loadEditorConfig(this.config, !!path || !!process.env.WBX_CONFIG);
        if (generation !== this.generation || abort.signal.aborted) return;
        if (!config.oauth) throw new EditorError(-32010, 'Configure OAuth in ~/.config/wbx-tui/config.json before connecting. No access token is requested.');
        const profile = JSON.stringify([config.oauth.clientId, config.oauth.redirectUri]);
        this.unread.useProfile(profile);
        const secret = await readEditorOAuthClientSecret(this.config, config.oauth);
        if (!secret) throw new EditorError(-32011, 'Set oauth.clientSecret locally in the private config (chmod 600). Credentials are never requested through editor buffers.');
        if (generation !== this.generation) return;
        const oauth = this.oauth = this.authorization.create(config.oauth, secret);
        const access = await oauth.authorize(this.openBrowser, abort.signal);
        if (generation !== this.generation || abort.signal.aborted) return;
        this.token = access.token; this.expiresAt = access.expiresAt; this.grantedScope = access.scope; this.auth = 'oauth';
        this.identity.configure(config.oauth);
        this.startSenderNames(access);
        oauth.onAccess = () => { if (generation === this.generation && this.oauth === oauth) void this.refreshAuth(); };
        if (peopleStatus) this.startPeopleStatus(access);
        if (upcomingMeetings) this.startUpcoming(access);
        if (readStatus) initialReadStatus = this.startReadStatus(access, generation);
        oauth.watch(access.expiresAt, () => { void this.refreshAuth(); }, () => this.failed('OAuth expired. Reconnect explicitly.'));
      }
      if (generation !== this.generation || abort.signal.aborted) return;
      const store = this.store = createMessagingStore(mode, () => {
        if (!this.token || Date.now() >= this.expiresAt) throw new MessagingError('denied', 'Access expired. Reconnect.'); return this.token;
      }, this.contentAdmission, this.owners);
      store.onChange = () => {
        if (generation !== this.generation || this.store !== store) return;
        // Reconcile actual activity and selection before any observer sees the
        // transition, including metadata changes and endpoints beyond the cap.
        const room = store.room && !store.isRevoked(store.room.id) ? store.room : undefined;
        this.observeReadActivity(); this.presence.sync(this.presenceContext()); this.observeSenderNames();
        this.members.select(room?.id ?? '');
        this.publish();
      };
      store.onAccessLost = room => {
        if (generation === this.generation && this.store === store) this.revokeRoomState(store, room);
      };
      store.onMessages = (room, messages) => {
        if (generation === this.generation && this.store === store) this.received?.observeMessages(room, messages);
      };
      store.onMessageDeleted = (room, id) => {
        if (generation === this.generation && this.store === store) this.received?.forget(room, id);
      };
      store.onDelivery = delivery => {
        if (generation === this.generation) this.emit('delivery', { requestId: delivery.requestId, roomId: delivery.roomId, status: delivery.status, message: delivery.message,
          ...(delivery.messageId !== undefined ? { messageId: delivery.messageId } : {}),
          ...(delivery.attachmentId !== undefined ? { attachmentId: delivery.attachmentId, draftId: delivery.draftId } : {}),
          ...(delivery.format ? { format: delivery.format, draftId: delivery.draftId } : {}),
          ...(delivery.format && delivery.attachmentId ? { text: delivery.text } : {}),
          ...(delivery.parentId !== undefined ? { parentId: delivery.parentId } : {}) });
      };
      this.state = 'ready';
      this.applyReadChanges(store, this.reads.takeChanges());
      this.publish();
      if (this.disk.enabled) void this.disk.bind({
        key: () => this.verifiedStorageKey(generation),
        current: () => generation === this.generation && this.state === 'ready',
        allowed: () => spacesCacheScope(this.grantedScope),
        verified: key => { void this.preferences.restore(key, this.preferenceSession(generation), sectionIntent); },
      });
      if (this.received) void this.bindReceived(generation);
      if (this.wantUpcomingMeetings) void this.refreshUpcoming().catch(() => {});
      // Default startup waits for REST + SDK. The cache opt-in releases live
      // REST independently; historical flags stay stale and unknown stays absent.
      await Promise.all([store.loadRooms().then(success => {
        if (generation === this.generation && this.store === store) this.roomsLoaded(success);
      }), initialReadStatus]);
      if (generation !== this.generation || abort.signal.aborted) return;
      if (this.reads.status === 'ready') store.mergeRooms(this.reads.rooms());
      this.initialRoomsPending = false;
      this.disk.persist();
      this.publish();
    } catch (error) {
      if (generation !== this.generation || abort.signal.aborted) return;
      const message = error instanceof EditorError ? error.message : error instanceof OAuthError ? `OAuth ${error.reason}. Reconnect explicitly; no grant was retried.` : 'Connection failed. Check the private config, permissions and browser integration.';
      this.failed(message); throw error instanceof EditorError ? error : new EditorError(-32012, message);
    }
  }
  private presenceContext(): PresenceContext {
    const store = this.store, room = store?.room;
    return { selected: room && !store!.isRevoked(room.id) ? { id: room.id, type: room.type } : undefined,
      directRooms: store?.rooms.filter(item => item.type === 'direct' && !store.isRevoked(item.id)).map(item => item.id) ?? [] };
  }
  private startPeopleStatus(access: AccessCredentials): void {
    const generation = this.generation;
    const session = { grantedScopes: access.scope.split(/\s+/).filter(Boolean), expiresAt: access.expiresAt,
      token: () => this.token && Date.now() < this.expiresAt ? this.token : '',
      active: () => generation === this.generation && this.state === 'ready' };
    if (!this.presence.renew(session)) this.presence.start(session, this.presenceContext());
  }
  private startSenderNames(access: AccessCredentials): void {
    const scope = access.scope.split(/\s+/).filter(Boolean).sort().join(' ');
    // Token renewal alone is not a new grant or permission to retry a denial.
    // The token closure below already follows the current credential.
    if (scope === this.senderScope) return;
    this.senderScope = scope;
    this.names.setSession({ enabled: this.wantSenderNames, grantedScopes: access.scope.split(/\s+/),
      token: () => this.token && Date.now() < this.expiresAt ? this.token : '' });
  }
  private observeSenderNames(): void {
    if (!this.wantSenderNames) return;
    if (this.received?.state === 'loading') return;
    const now = Date.now(), ids: string[] = [];
    for (const event of this.reads.messages()) if (event.senderId && now >= event.observedAt && now - event.observedAt <= MESSAGE_EVENT_LIMITS.ageMs) ids.push(event.senderId);
    const seen = new Set<string>();
    const messages = this.store?.messages.length ? this.store.messages
      : this.store?.room && !this.store.isRevoked(this.store.room.id) ? this.received?.messages(this.store.room.id) ?? [] : [];
    for (const message of [...messages].reverse()) {
      if (message.authorId) seen.add(message.authorId);
      if (seen.size === 64) break;
    }
    this.names.observe([...ids.reverse(), ...seen]);
  }
  private startReadStatus(access: AccessCredentials, generation: number): Promise<void> {
    return this.reads.start({ credentials: access, preview: this.wantNotificationPreview, senderNames: this.wantSenderNames, joinedMeetings: this.wantUpcomingMeetings,
      current: () => generation === this.generation,
      phase: () => this.state === 'connecting' && !this.store ? 'connecting' : this.state === 'ready' && this.store ? 'ready' : 'inactive' });
  }
  private async bindReceived(generation: number): Promise<void> {
    const cache = this.received;
    if (!cache) return;
    if (!spacesCacheScope(this.grantedScope) || !this.grantedScope.split(/\s+/).some(scope => ['spark:all', 'spark:messages_read'].includes(scope))) {
      cache.close(); this.received = undefined; this.observeSenderNames(); return;
    }
    const current = () => this.generation === generation && this.received === cache && this.state === 'ready' && cache.state !== 'off';
    try {
      const key = await this.verifiedStorageKey(generation);
      if (!current()) return;
      await cache.bind(key, current);
      if (!current()) return;
      this.names.restore(cache.restoredNames());
    } catch { if (current()) cache.state = 'unavailable'; }
    if (current()) { this.observeSenderNames(); this.publish(); }
  }
  private readRoomsObserved(rooms: RoomReadStatus[], observedAt: number, changed: boolean): void {
    // Fresh-source membership is separate from retained unread and disk-cache age.
    this.disk.observe(rooms, observedAt);
    if (changed) {
      this.unread.observeStatuses(rooms, this.unreadRetention());
      if (this.store) this.store.mergeRooms(rooms); else this.publish();
    }
    this.disk.persist();
  }
  async refreshAuth(): Promise<void> {
    if (this.renewing) return this.renewing;
    if (!this.oauth) throw new EditorError(-32010, 'OAuth is not connected.');
    const generation = this.generation, oauth = this.oauth; this.auth = 'refreshing'; this.publish();
    const renewing = oauth.refresh().then(access => {
      if (generation !== this.generation || this.state !== 'ready') return;
      this.token = access.token; this.expiresAt = access.expiresAt; this.grantedScope = access.scope; this.auth = 'oauth';
      this.startSenderNames(access);
      if (!spacesCacheScope(access.scope) || !access.scope.split(/\s+/).some(scope => ['spark:all', 'spark:messages_read'].includes(scope))) {
        this.received?.close(); this.received = undefined;
      }
      if (!this.uploadWriteAllowed() && this.uploads.diagnostics().references) {
        this.uploads.reset(); this.emit('uploads.invalidated', {});
      }
      if (!access.scope.split(/\s+/).some(scope => ['spark:all', 'spark:messages_read'].includes(scope))) {
        for (const operation of this.attachmentOperations.values()) operation.abort.abort();
      }
      if (!spacesCacheScope(access.scope)) this.disk.scopeLost();
      // Retain same-grant People ownership; renewal itself never starts optional presence reads.
      if (this.wantPeopleStatus) this.startPeopleStatus(access);
      if (this.wantUpcomingMeetings) { this.startUpcoming(access); void this.refreshUpcoming().catch(() => {}); }
      if (this.wantReadStatus) void this.startReadStatus(access, generation);
      oauth.watch(access.expiresAt, () => { void this.refreshAuth(); }, () => this.failed('OAuth expired. Reconnect.')); this.publish();
    }).catch(() => { if (generation === this.generation) this.failed('OAuth renewal failed. Reconnect explicitly; no grant was retried.'); })
      .finally(() => { if (this.renewing === renewing) this.renewing = undefined; });
    this.renewing = renewing; return renewing;
  }
  private connected(): MessagingStore {
    if (!this.store || this.state !== 'ready') throw new EditorError(-32003, 'Connect first.'); return this.store;
  }
  editSections(edit: SectionEdit, revision: number) {
    this.connected();
    try {
      return this.preferences.edit(edit, revision);
    } catch (error) {
      if (error instanceof SectionPreferenceError) throw new EditorError(error.code, error.message);
      throw error;
    }
  }
  async sectionPreferences(action: 'load' | 'save' | 'clear', revision: number) {
    this.connected();
    try {
      return await this.preferences.operate(action, revision, this.preferenceSession(this.generation));
    } catch (error) {
      if (error instanceof SectionPreferenceError) throw new EditorError(error.code, error.message);
      throw error;
    }
  }
  private preferenceSession(generation: number) {
    return { key: () => this.disk.boundKey(), current: () => this.generation === generation && this.state === 'ready',
      restoreAllowed: () => this.disk.enabled && spacesCacheScope(this.grantedScope) };
  }
  /** Node-private lease address only, never access/refresh credentials in editor RPC. */
  async meetingAuthorization(path?: string): Promise<{ socket: string; config: string } | undefined> {
    if (this.state === 'connecting') throw new EditorError(-32028, 'Messaging sign-in is already in progress. Wait for it; no second sign-in was started.');
    if (this.mode !== 'live' || this.state !== 'ready' || !this.oauth) return;
    if (path !== undefined && configPath(path) !== this.config) throw new EditorError(-32028, 'Meeting account/configuration differs from the connected login. Disconnect before changing account.');
    if (!this.grantedScope.split(/\s+/).includes('spark:all')) throw new EditorError(-32028, 'The connected grant lacks the supported SDK meeting authorization (spark:all). No second sign-in or scope change was started.');
    const oauth = this.oauth, generation = this.generation;
    try {
      const socket = await oauth.handoff(this.authorization.share);
      if (generation !== this.generation || this.oauth !== oauth || this.state !== 'ready') throw new Error();
      return { socket, config: this.config };
    } catch {
      if (generation === this.generation && this.oauth === oauth) this.failed('Connected authorization could not be shared; reconnect explicitly. No second sign-in was started.');
      throw new EditorError(-32028, 'Could not reuse connected meeting authorization. Reconnect explicitly; no second sign-in was started.');
    }
  }
  async rooms(more = false): Promise<void> {
    const store = this.connected(), generation = this.generation;
    if (more && this.disk.browseOnly) throw new EditorError(-32029, 'Refresh cached spaces before paging.');
    const success = await store.loadRooms(more);
    if (generation !== this.generation || this.store !== store) return;
    this.roomsLoaded(success);
    if (this.store === store && this.reads.status === 'ready') store.mergeRooms(this.reads.rooms());
    this.disk.persist();
  }
  async select(room: string, reload = false): Promise<void> {
    if (!chatId(room)) throw new EditorError(-32602, 'Invalid space ID.');
    if (this.disk.browseOnly) throw new EditorError(-32029, 'Cached spaces are browse-only until refreshed. Nothing was opened or acknowledged.');
    const s = this.connected(); if (!s.rooms.some(item => item.id === room)) throw new EditorError(-32602, 'Select an existing listed space.');
    if (!reload && s.room?.id === room && (s.ready || s.loading)) return;
    this.presence.pause();
    const generation = this.generation;
    this.messageQueries.reset();
    await s.select(room, reload);
    // Presence is optional: never hold the room-open/focus response behind an identity/service deadline.
    if (generation === this.generation && this.store === s && s.room?.id === room) void this.lookupPeople().catch(() => {});
  }
  /** Selected peer only: explicit reads plus one bounded minute refresh while the same session/room owns it. */
  async lookupPeople(): Promise<SelectedPeopleStatus> {
    this.presence.pause(); this.connected();
    return this.presence.lookup();
  }
  setPeopleViewport(roomIds: string[]): void {
    const store = this.connected();
    if (roomIds.length > 128 || new Set(roomIds).size !== roomIds.length
      || roomIds.some(id => !chatId(id) || !store.rooms.some(room => room.id === id && room.type === 'direct') || store.isRevoked(id))
      || this.disk.browseOnly) throw new EditorError(-32602, 'Presence requires loaded live direct-space rows.');
    this.presence.setViewport(roomIds);
  }
  setPeopleSpaces(roomIds: string[]): void {
    const store = this.connected();
    if (roomIds.length > 8 || new Set(roomIds).size !== roomIds.length
      || roomIds.some(id => !chatId(id) || !store.rooms.some(room => room.id === id && room.type === 'direct') || store.isRevoked(id))
      || this.disk.browseOnly) throw new EditorError(-32602, 'Presence requires loaded, verified direct-space rows.');
    this.presence.setSpaces(roomIds);
  }
  async history(older = false): Promise<void> { await this.connected().refresh(older); }
  async attachmentMetadata(room: string, message: string): Promise<void> {
    this.checkAttachmentPipeline();
    if (!chatId(room) || !chatId(message)) throw new EditorError(-32602, 'Invalid attachment destination.');
    await this.connected().loadAttachmentMetadata(room, message);
  }
  async images(room: string, message: string): Promise<void> {
    if (!chatId(room) || !chatId(message)) throw new EditorError(-32602, 'Invalid image destination.');
    await this.connected().loadImages(room, message);
  }
  async openImage(room: string, message: string, image: string) {
    this.checkAttachmentPipeline();
    if (!chatId(room) || !chatId(message) || !/^[a-f0-9]{64}$/.test(image)) throw new EditorError(-32602, 'Invalid image destination.');
    return this.connected().openImage(room, message, image);
  }
  async openAttachment(room: string, message: string, attachment: string) {
    this.checkAttachmentPipeline();
    if (!chatId(room) || !chatId(message) || !/^[a-f0-9]{64}$/.test(attachment)) throw new EditorError(-32602, 'Invalid attachment destination.');
    const store = this.connected(), generation = this.generation;
    const opened = await store.openAttachment(room, message, attachment);
    if (this.store !== store || generation !== this.generation) throw new EditorError(-32004, 'Attachment opening canceled by session replacement.');
    return opened;
  }
  private checkAttachmentPipeline(): void {
    this.attachmentTransfer?.revalidate();
    if (this.attachmentPipeline) throw new EditorError(-32002, 'An explicit attachment transfer is active. Retry explicitly after it finishes.');
  }
  async resolveAttachment(requestId: number, room: string, message: string, attachment: string, options: AttachmentResolveOptions, transfer?: 'chunks-v1') {
    this.checkAttachmentPipeline();
    if (!chatId(room) || !chatId(message) || !/^[a-f0-9]{64}$/.test(attachment) || !validAttachmentOptions(options)
      || !Number.isSafeInteger(requestId) || requestId < 1 || this.attachmentOperations.has(requestId)) throw new EditorError(-32602, 'Invalid typed attachment intent.');
    if (this.mode === 'live' && !this.grantedScope.split(/\s+/).some(scope => ['spark:all', 'spark:messages_read'].includes(scope))) throw new EditorError(-32003, 'Attachment read grant unavailable.');
    const store = this.connected(), generation = this.generation, abort = new AbortController();
    const operation = { store, generation, abort }; this.attachmentOperations.set(requestId, operation);
    if (transfer || options.action === 'open') this.attachmentPipeline = operation;
    const destination = store.attachmentOwner(room, message, attachment);
    const destinationSignal = store.attachmentSignal, cancelDestination = () => abort.abort();
    destinationSignal.addEventListener('abort', cancelDestination, { once: true });
    const valid = () => !abort.signal.aborted && generation === this.generation && this.store === store && this.state === 'ready'
      && destination() && (this.mode !== 'live' || this.grantedScope.split(/\s+/).some(scope => ['spark:all', 'spark:messages_read'].includes(scope)));
    let retained = false;
    let lease: ContentLease | undefined;
    options = { action: options.action, selectors: options.selectors.map(selector => ({ ...selector })) };
    try {
      if (options.action === 'open') {
        const admission = store.contentAdmission ?? this.contentAdmission;
        lease = admission.tryTyped(abort.signal, valid);
        if (!lease) lease = await admission.reserveTyped(abort.signal, valid);
      }
      const result = await store.resolveAttachment(room, message, attachment, options, abort.signal, lease);
      lease?.release();
      if (!valid()) throw new EditorError(-32004, 'Attachment opening canceled.');
      if (transfer) {
        const release = () => {
          destinationSignal.removeEventListener('abort', cancelDestination);
          if (this.attachmentPipeline === operation) { this.attachmentPipeline = undefined; this.attachmentTransfer = undefined; }
          if (this.attachmentOperations.get(requestId) === operation) this.attachmentOperations.delete(requestId);
        };
        const source = await AttachmentTransfer.create(requestId, result, valid, release);
        if (!valid()) { source.close(); throw new EditorError(-32004, 'Attachment transfer canceled before publication.'); }
        this.attachmentTransfer = source; retained = true;
        abort.signal.addEventListener('abort', () => source.close(), { once: true });
        return source.descriptor;
      }
      return result;
    } finally {
      lease?.release();
      if (!retained) {
        destinationSignal.removeEventListener('abort', cancelDestination);
        if (this.attachmentOperations.get(requestId) === operation) this.attachmentOperations.delete(requestId);
        if (this.attachmentPipeline === operation) this.attachmentPipeline = undefined;
      }
    }
  }
  private transferOwner(p: { requestId: number; transferId: string }): AttachmentTransfer {
    const source = this.attachmentTransfer;
    if (!source?.matches(p.requestId, p.transferId)) throw new EditorError(-32004, 'Attachment transfer unavailable. Nothing was retried.');
    return source;
  }
  attachmentChunk(p: AttachmentPull) {
    try { return this.transferOwner(p).pull(p); }
    catch { throw new EditorError(-32004, 'Attachment chunk canceled or out of order. Nothing was retried.'); }
  }
  completeAttachment(p: AttachmentComplete) {
    try { return this.transferOwner(p).complete(p); }
    catch { throw new EditorError(-32004, 'Attachment completion canceled or invalid. Nothing was retried.'); }
  }
  attachmentSent(requestId: number, transferId: string, seq: number): void {
    if (this.attachmentTransfer?.matches(requestId, transferId)) this.attachmentTransfer.sent(seq);
  }
  rejectAttachmentTransfer(p?: Record<string, unknown>): void {
    if (p && typeof p.requestId === 'number' && typeof p.transferId === 'string'
      && this.attachmentTransfer?.matches(p.requestId, p.transferId)) this.attachmentTransfer.close();
  }
  cancelAttachment(requestId: number): void {
    const operation = this.attachmentOperations.get(requestId);
    if (operation && operation.generation === this.generation && operation.store === this.store) operation.abort.abort();
  }
  async send(requestId: string, room: string, text: string, parentId?: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId) || !chatId(room) || !chatText(text) || parentId !== undefined && !chatId(parentId)) throw new EditorError(-32602, 'Choose a space/reply target and compose 1–1000 UTF-16 code units of plaintext.');
    const store = this.connected();
    if (this.actions.busy() || this.reactions.busy() || this.conversations.busy() || this.featureAbort) throw new EditorError(-32002, 'An explicit message/member action is active. Nothing was queued.');
    if (this.uploads.diagnostics().sending) throw new EditorError(-32002, 'A physical upload is still active. Nothing was queued or retried.');
    await store.send(requestId, room, text, parentId);
    if (this.store !== store || this.state !== 'ready') throw new EditorError(-32004, 'Messaging disconnected during delivery. Check Webex before explicitly resolving or retrying.');
  }
  private featureOwner(room: string, message?: string) {
    const store = this.connected(), generation = this.generation, current = store.conversationOwner(room);
    const valid = () => this.generation === generation && this.store === store && this.state === 'ready' && current()
      && (!message || store.messages.some(item => item.id === message));
    if (!valid()) throw new EditorError(-32034, 'Choose a ready revalidated conversation/message first.');
    return { store, valid };
  }
  private featureGrant(scopes: string[]): void {
    if (this.mode === 'demo') return;
    if (!this.token || Date.now() >= this.expiresAt || !scopes.every(scope => this.grantedScope.split(/\s+/).some(value => value === scope || value === 'spark:all'))) {
      throw new EditorError(-32034, 'Required known existing grant unavailable. No authorization was probed or expanded.');
    }
  }
  private async reactionProvider(command:ReactionCommand):Promise<unknown> {
    if (this.mode === 'demo') return this.demoReactions.reaction(command);
    try { this.featureGrant(['spark:all']); }
    catch (error) {
      if (command.action === 'summary') throw new ReactionReadError('admission:denied');
      throw error;
    }
    return this.reads.reaction(command);
  }
  private reactionReadOwner(room:string,message:string) {
    const owner = this.featureOwner(room,message);
    const key = receivedContentKey(owner.store.messages.find(item=>item.id===message)!);
    const currentSource = this.reads.lease();
    return { store:owner.store,valid:()=>owner.valid() && currentSource()
      && owner.store.messages.some(item=>item.id===message && receivedContentKey(item)===key)
      && (this.mode === 'demo' || this.reads.readable()) };
  }
  private reactionOwner(room:string,message:string) {
    const owner = this.reactionReadOwner(room,message);
    if (!owner.valid() || this.mode !== 'demo' && !this.reads.available())
      throw new EditorError(-32034,`Reaction unavailable (SDK ${this.reads.status}). ${this.reads.notice || 'The selected message/source is no longer ready; choose the unchanged target again.'} No new reaction was submitted or queued.`);
    if (owner.store.sending || this.actions.busy() || this.conversations.busy() || this.featureAbort || this.uploads.diagnostics().sending)
      throw new EditorError(-32002,'Another explicit operation is active.');
    return owner;
  }
  private async reactionBatchProvider(batch:ReactionBatch,progress?:ReactionProgress):Promise<unknown> {
    if (this.mode === 'demo') return this.demoReactions.reactions(batch);
    try { this.featureGrant(['spark:all']); } catch { throw new ReactionReadError('admission:denied'); }
    return this.reads.reactions(batch,progress);
  }
  async reactionSummaries(batch:ReactionBatch,progress?:ReactionProgress) {
    if (!validReactionBatch(batch)) throw new EditorError(-32602,'Choose at most eight distinct loaded reaction targets.');
    batch = { roomId:batch.roomId,messageIds:[...batch.messageIds] };
    // Every ID must already be loaded in the same selected conversation. A
    // bounded viewport is not permission to scan a room or retrieve history.
    const owners = batch.messageIds.map(messageId=>this.reactionReadOwner(batch.roomId,messageId));
    try {
      const value = await this.reactions.summaries(batch,()=>owners.every(owner=>owner.valid()),progress ? item => {
        this.cacheReaction(item); progress(item);
      } : undefined);
      for (const item of value.items) if ('groups' in item) this.cacheReaction(item);
      return value;
    }
    catch (error) { throw new EditorError(-32034,`Reaction summary unavailable (${error instanceof ReactionReadError ? error.reason : 'summary:unavailable'}). Nothing was sent or acknowledged.`); }
  }
  async messageReaders(room: string, message: string): Promise<MessageReaders> {
    if (!chatId(room) || !chatId(message)) throw new EditorError(-32602, 'Choose one loaded message.');
    const { store, valid } = this.reactionReadOwner(room, message);
    this.featureGrant(['spark:all']);
    if (!valid() || this.featureAbort) throw new EditorError(-32002, 'Read receipts unavailable or another inspection is active.');
    const abort = this.featureAbort = new AbortController();
    try {
      const value: MessageReaders = this.mode === 'demo'
        ? { roomId: room, messageId: message, coverage: 'space-read-watermark', observedAt: Date.now(), partial: false,
          readers: [{ personId: 'demo-reader-alex', name: 'Alex Example' },
            ...(store.room?.type === 'direct' ? [] : [{ personId: 'demo-reader-sam', name: 'Sam Example' }])] }
        : await this.reads.readers({ roomId: room, messageId: message });
      if (!valid() || abort.signal.aborted || !validMessageReaders(value) || value.roomId !== room || value.messageId !== message)
        throw new Error('Read-through owner or result changed.');
      return structuredClone(value);
    } catch {
      throw new EditorError(-32034, 'Read receipts unavailable. Nothing was sent or acknowledged; refresh explicitly.');
    } finally {
      if (this.featureAbort === abort) this.featureAbort = undefined;
    }
  }
  async reactionSummary(room:string,message:string) {
    const { valid } = this.reactionReadOwner(room,message);
    try { const value = await this.reactions.summary(room,message,valid); this.cacheReaction(value); return value; }
    catch (error) { throw new EditorError(-32034,`Reaction summary unavailable (${error instanceof ReactionReadError ? error.reason : 'summary:unavailable'}). Nothing was sent or acknowledged.`); }
  }
  async reactionDetails(room:string,message:string) {
    const {valid} = this.reactionReadOwner(room,message);
    if (this.featureAbort) throw new EditorError(-32002,'Another explicit operation is active.');
    const abort = this.featureAbort = new AbortController();
    try {
      const value = await this.reactions.details(room,message,valid), names = new Map<string,string>();
      this.cacheReaction(value.snapshot);
      let lookups = 0;
      const until = Date.now()+REACTION_LIMITS.requestMs;
      for (const actor of value.actors) {
        if (!valid() || abort.signal.aborted) throw new ReactionReadError('context:unverified');
        let name = actor.name ?? names.get(actor.personId) ?? this.names.peek(actor.personId);
        if (!name && !names.has(actor.personId) && this.mode !== 'demo' && lookups < REACTION_LIMITS.names && Date.now() < until) {
          lookups++;
          try {
            this.featureGrant(['spark:people_read']);
            const profile = await readPersonProfile(actor.personId,this.localSession,this.actionREST,()=>{
              if (!valid() || abort.signal.aborted) throw new Error('Stale reaction details');
              this.featureGrant(['spark:people_read']); return this.token;
            },abort.signal);
            name = profile.fields.displayName;
          } catch { /* Keep the disclosed person ID when an exact-name read is unavailable. */ }
        }
        names.set(actor.personId,name ?? '');
        if (name) actor.name = name;
      }
      if (!valid() || abort.signal.aborted) throw new ReactionReadError('context:unverified');
      return value; // Actor relationships never enter automatic or persistent caches.
    } catch (error) {
      throw new EditorError(-32034,`Reaction details unavailable (${error instanceof ReactionReadError ? error.reason : 'summary:unavailable'}). Nothing was sent or acknowledged.`);
    } finally { if (this.featureAbort === abort) this.featureAbort = undefined; }
  }
  private cacheReaction(value: import('./reaction-contracts.js').ReactionSnapshot): void {
    const message = this.store?.room?.id === value.roomId ? this.store.messages.find(m => m.id === value.messageId) : undefined;
    if (message) this.received?.observeReaction(value, message);
  }
  inspectReactions(room:string,message:string,requestId?:string):void {
    this.reactionOwner(room,message);
    try { this.reactions.inspect(room,message,requestId); }
    catch { throw new EditorError(-32034,'Reaction inspection is busy/unavailable. Nothing was retried.'); }
  }
  async prepareReaction(room:string,message:string,action:ReactionAction,reaction:Reaction) {
    const { valid } = this.reactionOwner(room,message);
    try { return await this.reactions.prepare(room,message,action,reaction,valid); }
    catch (error) {
      if (error instanceof ReactionInspectionRequired) throw new EditorError(-32034,'Reaction outcome unresolved. Inspect the previous reaction on this exact message in Webex, then :WebexReactionResolve. Nothing was retried.');
      if (error instanceof ReactionReadError) throw new EditorError(-32034,`Reaction summary unavailable (${error.reason}). Nothing was sent or acknowledged.`);
      throw new EditorError(-32034,'Reaction preparation unavailable or stale. Removal requires fresh verified ownership; adding an existing own reaction is not a toggle. Nothing was sent.');
    }
  }
  async submitReaction(contextId:string,requestId:string,room:string,message:string) {
    const target = this.reactions.target(contextId,requestId);
    if (!target || target.roomId !== room || target.messageId !== message) throw new EditorError(-32034,'Reaction target does not match the frozen preparation.');
    const { valid } = this.reactionOwner(room,message);
    try {
      const result = await this.reactions.submit(contextId,requestId,valid,snapshot=>this.cacheReaction(snapshot));
      if (result.status === 'unknown') this.received?.forgetReaction(room, message);
      return result;
    }
    catch { throw new EditorError(-32034,'Reaction context unavailable/uncertain. Resolve the exact target explicitly; nothing was replayed.'); }
  }
  discardReaction(contextId:string):void { this.reactions.discard(contextId); }
  private sessionOwner() {
    const store = this.connected(), generation = this.generation;
    return { store, valid: () => this.store === store && this.generation === generation && this.state === 'ready' };
  }
  private conversationAdmission() {
    const owner = this.sessionOwner();
    if (this.actions.busy() || this.reactions.busy() || this.featureAbort || this.conversations.busy() || owner.store.sending || this.uploads.diagnostics().sending) throw new EditorError(-32002, 'Another explicit operation is active. Nothing was queued.');
    return owner;
  }
  async prepareDirect(choice: string) {
    const { valid } = this.conversationAdmission();
    try { return await this.conversations.prepareDirect(choice, valid); }
    catch { throw new EditorError(-32035, 'Recipient unavailable/ambiguous or grant missing. No placeholder was sent.'); }
  }
  async sendDirect(requestId: string, targetId: string, draftId: string, text: string, options: DirectOptions = {}) {
    const { store, valid } = this.conversationAdmission(), generation = this.generation;
    const transaction = this.directTransaction = {};
    this.directPending = true; this.publish();
    try {
      const result = await this.conversations.sendDirect(requestId, targetId, draftId, text, valid, options);
      if (!valid()) throw new EditorError(-32004, 'Direct delivery invalidated. Check Webex before resolving/retrying.');
      this.emit('direct.delivery', result.outcome); // Exact exclusion precedes room publication/release.
      if (result.file && result.room && result.message) {
        const projected = store.projectSent({ ...result.message, personId: result.message.authorId, roomId: result.room.id, files: [result.file] }, result.room.id);
        if (projected) result.message = projected;
      }
      if (result.outcome.status === 'changed' && result.room && result.message) store.acceptExternalMessage(result.room, result.message);
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Direct delivery unavailable, unresolved or request ID reused. Nothing was replayed.'); }
    finally {
      if (this.directTransaction === transaction) {
        this.directTransaction = undefined; this.directPending = false;
        if (generation === this.generation) this.publish();
      }
    }
  }
  resolveDirect(targetId: string): void {
    this.connected();
    const target = this.conversations.recipient(targetId);
    if (!target) throw new EditorError(-32035, 'Recipient context expired. Check Webex before preparing another draft.');
    this.conversations.resolve('direct:' + target.personId);
  }
  discardDirect(targetId: string): void {
    this.connected();
    try { this.conversations.discardRecipient(targetId); } catch { throw new EditorError(-32035, 'Recipient operation active; no admitted write was canceled.'); }
  }
  async createSpace(requestId: string, title: string) {
    const { store, valid } = this.conversationAdmission();
    try {
      const result = await this.conversations.create(requestId, title, valid);
      if (!valid()) throw new EditorError(-32004, 'Space creation invalidated. Check Webex before resolving/retrying.');
      if (result.outcome.status === 'changed' && result.room && !result.replayed) store.mergeRooms([result.room]);
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Creation unavailable, unresolved or request ID reused. No room was automatically recreated.'); }
  }
  async renameSpace(requestId: string, roomId: string, expectedTitle: string, title: string) {
    const { store, valid } = this.featureOwner(roomId);
    this.conversationAdmission();
    if (store.room?.type !== 'group' || store.room.teamId !== undefined || store.room.isReadOnly === true || store.isRevoked(roomId)) {
      throw new EditorError(-32035, 'Rename supports only the selected ready standalone group space. No settings were changed.');
    }
    try {
      const result = await this.conversations.rename(requestId, roomId, expectedTitle, title,
        () => valid() && store.room?.title === expectedTitle);
      if (!valid()) throw new EditorError(-32004, 'Rename invalidated. Check Webex before resolving/retrying.');
      if (result.outcome.status === 'changed' && !result.replayed) {
        store.renameRoomTitle(roomId, title);
        this.disk.persist(); // Existing opt-in cache only; no observation-age/unread renewal.
      }
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Rename unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  private spaceMetadataAdmission(roomId: string) {
    const owner = this.featureOwner(roomId);
    this.conversationAdmission();
    const room = owner.store.room!;
    if (room.type !== 'group' || room.teamId !== undefined || room.isReadOnly === true || owner.store.isRevoked(roomId)) {
      throw new EditorError(-32035, 'Space metadata actions require the selected ready standalone group. No settings were changed.');
    }
    return owner;
  }
  async prepareSpaceDescription(roomId: string) {
    const { store, valid } = this.spaceMetadataAdmission(roomId), title = store.room!.title, sessionId = this.localSession;
    try {
      const snapshot = await this.conversations.readDescription(roomId, () => valid() && store.room?.title === title);
      if (!valid() || store.room?.title !== snapshot.expectedTitle) throw new EditorError(-32004, 'Description preparation changed or title is stale. Refresh/select explicitly; no edit was installed.');
      return { ...snapshot, sessionId, observedAt: Date.now() };
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Description unavailable, missing, unsafe, unresolved or busy. No empty preimage was inferred.'); }
  }
  async describeSpace(requestId: string, roomId: string, expectedTitle: string, expectedDescription: string, description: string) {
    const { store, valid } = this.spaceMetadataAdmission(roomId);
    try {
      const result = await this.conversations.describe(requestId, roomId, expectedTitle, expectedDescription, description,
        () => valid() && store.room?.title === expectedTitle);
      if (!valid()) throw new EditorError(-32004, 'Description update invalidated. Inspect Webex before resolving/retrying.');
      // No room/title/cache/history publication, including on retained-result replay.
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Description update unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  async clearSpaceDescription(requestId: string, roomId: string, expectedTitle: string, expectedDescription: string) {
    const { store, valid } = this.spaceMetadataAdmission(roomId);
    try {
      const result = await this.conversations.clearDescription(requestId, roomId, expectedTitle, expectedDescription,
        () => valid() && store.room?.title === expectedTitle);
      if (!valid()) throw new EditorError(-32004, 'Description clear invalidated. Inspect Webex before resolving/retrying.');
      // Explicit empty ACK is evidence only, never main-state or native-text deletion.
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Description clear unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  async setSpaceLocked(requestId: string, roomId: string, expectedTitle: string, expectedLocked: boolean, locked: boolean) {
    const { store, valid } = this.spaceMetadataAdmission(roomId);
    try {
      const result = await this.conversations.setLocked(requestId, roomId, expectedTitle, expectedLocked, locked,
        () => valid() && store.room?.title === expectedTitle);
      if (!valid()) throw new EditorError(-32004, 'Moderation transition invalidated. Inspect Webex before resolving/retrying.');
      // A transition ACK is not ongoing room/role authority or cache freshness.
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Moderation transition unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  async setSpaceAnnouncementOnly(requestId: string, roomId: string, expectedTitle: string,
    expectedAnnouncementOnly: boolean, announcementOnly: boolean) {
    const { store, valid } = this.spaceMetadataAdmission(roomId);
    try {
      const result = await this.conversations.setAnnouncementOnly(requestId, roomId, expectedTitle, expectedAnnouncementOnly,
        announcementOnly, () => valid() && store.room?.title === expectedTitle);
      if (!valid()) throw new EditorError(-32004, 'Announcement-mode transition invalidated. Inspect Webex before resolving/retrying.');
      // No main metadata/role/notification/delivery publication or inferred posting rights.
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Announcement-mode transition unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  async membershipAction(requestId: string, action: 'invite' | 'remove' | 'leave', room: string, target?: string) {
    const { store, valid } = this.featureOwner(room);
    const session = this.conversationAdmission();
    if (action === 'remove') {
      const roster = this.members.snapshot();
      if (roster.roomId !== room || roster.state !== 'ready' || !roster.items.some(item => item.id === target)) throw new EditorError(-32035, 'Choose an exact membership from a freshly loaded selected-room roster.');
    }
    try {
      const result = await this.conversations.membership(requestId, action, room, target, valid);
      if (!session.valid()) throw new EditorError(-32004, 'Membership operation invalidated. Check Webex before resolving/retrying.');
      if (action === 'leave' && result.outcome.status !== 'failed') {
        this.revokeRoomState(store, room);
      }
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32035, 'Membership action unavailable, unresolved or request ID reused. Nothing was replayed.'); }
  }
  private revokeRoomState(store: MessagingStore, room: string): void {
    this.received?.forget(room);
    if (store.room?.id === room) this.messageQueries.reset();
    this.uploads.revokeRoom(room);
    this.reads.forgetRoom(room); this.unread.forget(room); this.disk.forget(room);
    if (this.members.snapshot().roomId === room) this.members.select('');
    if (store.room?.id === room) this.presence.deselect();
    this.emit('room.revoked', { roomId: room });
    if (!store.isRevoked(room)) store.revokeRoom(room);
    else this.publish();
  }
  private applyReadChanges(store: MessagingStore, changes: ReadChange[]): void {
    for (const change of changes) {
      if (change.kind === 'message-deleted') store.observeDeletion(change.roomId, change.id);
      else if (change.kind === 'room-revoked' && !store.isRevoked(change.roomId)) this.revokeRoomState(store, change.roomId);
    }
    if (this.state === 'ready' && store.ready && this.reads.readable()
      && changes.some(change => change.kind === 'readers-changed' && change.roomId === store.room?.id && !store.isRevoked(change.roomId))) {
      const source = this.reads.evidence();
      this.emit('messages.readersChanged', { roomId: store.room!.id, sessionId: this.localSession,
        sourceEpoch: source.epoch, sourceRevision: source.revision });
    }
  }
  resolveConversationAction(action: 'create' | 'invite' | 'remove' | 'leave' | 'rename' | 'describe' | 'lock' | 'announcement' | 'description-clear' | 'team-rename' | 'team-describe', room?: string, requestId?: string): void {
    this.connected();
    if (action === 'team-rename' || action === 'team-describe') this.conversationAdmission();
    if (action !== 'create' && !chatId(room)) throw new EditorError(-32602, 'Choose the exact room whose uncertain action you checked.');
    try { this.conversations.resolve(action === 'create' ? 'create' : action + ':' + room, requestId); }
    catch { throw new EditorError(-32035, 'Original unknown space-action evidence unavailable, changed or physically active. Nothing was resolved/replayed.'); }
  }
  /** Wire recovery may verify retired evidence; the synchronous public API remains same-session only. */
  async recoverConversationAction(...[action, room, requestId]: Parameters<EditorEngine['resolveConversationAction']>): Promise<void> {
    if (['create', 'invite', 'remove', 'leave'].includes(action)) return this.resolveConversationAction(action, room, requestId);
    const { valid } = this.conversationAdmission();
    if (action !== 'create' && !chatId(room)) throw new EditorError(-32602, 'Choose the exact room whose uncertain action you checked.');
    try { await this.conversations.recover(action === 'create' ? 'create' : action + ':' + room, requestId, valid); }
    catch { throw new EditorError(-32035, 'Original unknown space-action evidence unavailable, changed or physically active. Nothing was resolved/replayed.'); }
  }
  async queryThread(room: string, messageId: string, more = false, revision?: number) {
    try {
      const { store, valid } = this.featureOwner(room, messageId);
      const source = store.messages.find(item => item.id === messageId)!;
      const parentId = source.parentId;
      return await this.feature(room, ['spark:messages_read'], (signal, check) => this.messageQueries.thread(
        { sessionId: this.localSession, roomId: room, messageId, ...(parentId ? { parentId } : {}) }, this.actionREST,
        () => {
          check();
          if (!valid() || store.messages.find(item => item.id === messageId)?.parentId !== parentId) throw new PublicProblem('failed');
          return this.token || 'LOCAL-DEMO';
        }, signal, more, revision));
    } catch { throw new EditorError(-32036, 'Selected-room thread unavailable, expired, changed or busy. No complete-thread claim, receipt or retry occurred.'); }
  }
  async queryMentions(room: string, more = false, revision?: number) {
    try {
      return await this.feature(room, ['spark:messages_read'], (signal, check) => this.messageQueries.mentions(
        { sessionId: this.localSession, roomId: room }, this.actionREST, () => { check(); return this.token || 'LOCAL-DEMO'; }, signal, more, revision));
    } catch { throw new EditorError(-32036, 'Selected-room API @me query unavailable, expired or busy. No account scan, @all coverage, receipt or retry was inferred.'); }
  }
  async personProfile(personId: string) {
    try {
      return await this.feature(undefined, ['spark:people_read'], (signal, check) => readPersonProfile(
        personId, this.localSession, this.actionREST, () => { check(); return this.token || 'LOCAL-DEMO'; }, signal));
    } catch { throw new EditorError(-32037, 'Exact-person textual profile unavailable, refused, canceled or busy. No presence, avatar, identity probe or retry was performed.'); }
  }
  async searchDirectory(query: string, more = false, revision?: number) {
    try {
      return await this.feature(undefined, ['spark:people_read'], async (signal, check) => {
        return this.directory.search(query, this.localSession, this.actionREST, () => { check(); return this.token || 'LOCAL-DEMO'; }, signal, more, revision);
      });
    } catch { throw new EditorError(-32035, 'Directory prefix query unavailable, expired, refused or busy. No account scan, presence poll or retry occurred.'); }
  }
  async prepareTeamDescription(teamId: string, revision: number) {
    const session = this.conversationAdmission(), sessionId = this.localSession;
    const valid = () => session.valid() && this.teams.renameTarget(sessionId, teamId, revision);
    try {
      if (!valid()) throw new PublicProblem('failed');
      const proof = await this.conversations.readTeamDescription(teamId, valid);
      if (!valid()) throw new PublicProblem('failed');
      const result = { sessionId, teamId, revision, observedAt: Date.now(), expectedName: proof.expectedName, expectedDescription: proof.expectedDescription };
      if (Buffer.byteLength(JSON.stringify(result)) > CONVERSATION_LIMITS.resultBytes) throw new PublicProblem('failed');
      return result;
    } catch { throw new EditorError(-32040, 'Team description preparation unavailable, stale, refused or physically busy. Nothing was updated.'); }
  }
  async describeTeam(requestId: string, teamId: string, revision: number, expectedName: string, expectedDescription: string, description: string) {
    const session = this.conversationAdmission(), sessionId = this.localSession;
    const valid = () => session.valid() && this.teams.renameTarget(sessionId, teamId, revision);
    try {
      const result = await this.conversations.describeTeam(requestId, teamId, expectedName, expectedDescription, description, valid);
      if (!session.valid()) throw new PublicProblem('unknown');
      return result.outcome; // Private edit settlement only: no Team query/cache/name invalidation or publication.
    } catch { throw new EditorError(-32040, 'Team description unavailable, invalidated, unresolved or request ID reused. Check original Team/request; nothing was replayed.'); }
  }
  async prepareTeamRename(teamId: string, revision: number) {
    const session = this.conversationAdmission(), sessionId = this.localSession;
    const valid = () => session.valid() && this.teams.renameTarget(sessionId, teamId, revision);
    try {
      if (!valid()) throw new PublicProblem('failed');
      const proof = await this.conversations.prepareTeamRename(teamId, valid);
      if (!valid()) throw new PublicProblem('failed');
      const result = { sessionId, teamId, revision, observedAt: Date.now(), expectedName: proof.expectedName };
      if (Buffer.byteLength(JSON.stringify(result)) > 4096) throw new PublicProblem('failed');
      return result;
    } catch { throw new EditorError(-32040, 'Team rename preparation unavailable, stale, refused or physically busy. No permission was inferred and nothing was updated.'); }
  }
  async renameTeam(requestId: string, teamId: string, revision: number, expectedName: string, name: string) {
    const session = this.conversationAdmission(), sessionId = this.localSession;
    const valid = () => session.valid() && this.teams.renameTarget(sessionId, teamId, revision);
    try {
      const result = await this.conversations.renameTeam(requestId, teamId, expectedName, name, valid);
      if (!session.valid()) throw new PublicProblem('unknown');
      if (result.outcome.status === 'changed' && !result.replayed) {
        if (!valid()) throw new PublicProblem('unknown');
        this.teams.reset(); // Only Team selection/label invalidation, never main Room/state/cache publication.
      }
      return result.outcome;
    } catch { throw new EditorError(-32040, 'Team rename unavailable, invalidated, unresolved or request ID reused. Check exact Team/request evidence; nothing was replayed.'); }
  }
  async joinedTeams(more = false, revision?: number) {
    try {
      return await this.feature(undefined, ['spark:teams_read'], (signal, check) => this.teams.joined(
        this.localSession, this.actionREST, signal, () => { check(); return this.token || 'LOCAL-DEMO'; }, more, revision));
    } catch { throw new EditorError(-32038, 'Joined-Team list unavailable, expired, refused or busy. No Team/room scan, join, grant expansion or retry occurred.'); }
  }
  async serverTeams(more = false) {
    try {
      return await this.feature(undefined, ['spark:teams_read'], async (signal, check) => {
        check();
        return this.teams.list(this.snapshot().rooms, this.actionREST, signal, () => { check(); return this.token || 'LOCAL-DEMO'; }, more);
      });
    } catch { throw new EditorError(-32035, 'Server Team labels unavailable, busy or loaded room set changed. No membership was inferred.'); }
  }
  private async feature<T>(room: string | undefined, scopes: string[], run: (signal: AbortSignal, check: () => void) => Promise<T>): Promise<T> {
    const { store, valid } = room === undefined ? this.sessionOwner() : this.featureOwner(room);
    if (this.featureAbort || this.actions.busy() || this.reactions.busy() || this.conversations.busy() || store.sending || this.uploads.diagnostics().sending) throw new EditorError(-32002, 'Another explicit action is active. Nothing was queued.');
    const abort = this.featureAbort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000);
    timer.unref?.();
    const check = () => { if (!valid() || abort.signal.aborted) throw new PublicProblem('failed'); this.featureGrant(scopes); };
    try { check(); const value = await run(abort.signal, check); check(); return value; }
    finally { clearTimeout(timer); if (this.featureAbort === abort) this.featureAbort = undefined; }
  }
  async memberVisibility(roomId: string) {
    try {
      const store = this.connected();
      if (!chatId(roomId) || store.room?.id !== roomId || store.room.type !== 'direct'
        || store.room.teamId !== undefined || store.isRevoked(roomId)) {
        throw new PublicProblem('failed');
      }
      return await this.feature(roomId, ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read'], async (signal, check) => {
        const sessionId = this.localSession;
        const value = await this.members.readOwnDirectVisibility(this.actionREST, roomId,
          () => { check(); return this.token || 'LOCAL-DEMO'; }, signal);
        check();
        const result = { sessionId, ...value, coverage: 'own-direct-membership-flag' as const, observedAt: Date.now() };
        if (Buffer.byteLength(JSON.stringify(result)) > 4096) throw new PublicProblem('failed');
        return result; // No cache/roster/main-state, notification, receipt or delivery publication.
      });
    } catch { throw new EditorError(-32039, 'Own direct-membership API flag unavailable, refused, invalidated or busy. No preference, role, notification or receipt was changed; nothing was retried.'); }
  }
  async roomMembers(more = false) {
    const room = this.connected().room?.id;
    if (!room) throw new EditorError(-32034, 'Choose a conversation first.');
    try {
      return await this.feature(room, ['spark:memberships_read'], async (signal, check) => {
        check(); const value = await this.members.load(this.actionREST, room, this.token || 'LOCAL-DEMO', signal, more);
        return { ...value, items: value.items.map(item => ({ ...item, label: this.names.peek(item.personId) ?? item.label })) };
      });
    } catch { throw new EditorError(-32034, 'Selected-room roster unavailable, invalidated or busy. Previous rows are not permission; refresh explicitly.'); }
  }
  async prepareMessageAction(room: string, message: string, action: MessageAction) {
    const { store, valid } = this.featureOwner(room, message);
    if (store.sending || this.reactions.busy() || this.conversations.busy() || this.featureAbort || this.uploads.diagnostics().sending) throw new EditorError(-32002, 'A message action is already active.');
    try { return await this.actions.prepare(room, message, action, valid); }
    catch { throw new EditorError(-32034, 'Own-message action unavailable. Verify identity/grants, text-only edit limits and current target. Nothing was mutated.'); }
  }
  async mutateMessage(intent: MutationIntent) {
    const target = this.actions.target(intent.contextId, intent.requestId);
    if (!target) throw new EditorError(-32034, 'Message context is stale. Reopen explicitly.');
    const { store, valid } = this.featureOwner(target.roomId, target.messageId);
    if (intent.format === 'markdown' && typeof intent.content === 'string') {
      const mentions = richMentions(intent.content);
      if ((mentions.people.length || mentions.all) && store.room?.type !== 'group') throw new EditorError(-32034, 'Mentions require the selected group conversation.');
    }
    if (store.sending || this.reactions.busy() || this.conversations.busy() || this.featureAbort || this.uploads.diagnostics().sending) throw new EditorError(-32002, 'A message action is already active.');
    try {
      const result = await this.actions.submit(intent, valid);
      if (!valid()) throw new EditorError(-32004, 'Message action invalidated. Check Webex before retrying.');
      if (result.outcome.status === 'changed') {
        if (intent.action === 'delete') store.reconcileMutation(target.roomId, target.messageId);
        else if (result.raw) {
          const item = store.projectSent(result.raw, target.roomId);
          if (!item || item.id !== target.messageId) throw new EditorError(-32004, 'Edit projection unavailable. Check Webex; nothing was replayed.');
          store.reconcileMutation(target.roomId, target.messageId, item);
        }
      }
      return result.outcome;
    } catch (error) { if (error instanceof EditorError) throw error; throw new EditorError(-32034, 'Message action unavailable, busy or request ID already used. Nothing was replayed.'); }
  }
  resolveMutation(room: string, message: string): void {
    this.featureOwner(room); this.actions.resolve(room, message);
  }
  discardMessageContext(id: string): void {
    this.connected();
    try { this.actions.discard(id); } catch { throw new EditorError(-32034, 'Context is active or unavailable; no mutation was canceled/retried.'); }
  }
  async sendRich(requestId: string, text: string, binding: UploadBinding, consent: MentionConsent): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId) || !validRichText(text) || !validUploadBinding(binding)) throw new EditorError(-32602, 'Invalid explicit Markdown send.');
    const { store, valid } = this.featureOwner(binding.roomId), generation = this.generation;
    if (this.actions.busy() || this.reactions.busy() || this.conversations.busy() || this.featureAbort || this.uploads.diagnostics().sending) throw new EditorError(-32002, 'Another action is active. Nothing was queued.');
    this.featureGrant(['spark:messages_write']);
    await store.sendPrepared(requestId, binding.roomId, text, binding.parentId, {
      identity: JSON.stringify(['markdown', binding.draftId, consent]), draftId: binding.draftId, format: 'markdown',
      send: async () => {
        // Store has already marked this exact new-message transaction sending.
        const abort = this.featureAbort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000);
        let submitted = false;
        let stage = 'Markdown validation';
        const check = () => {
          if (!valid() || abort.signal.aborted) throw new PublicProblem(submitted ? 'unknown' : 'failed');
          this.featureGrant(['spark:messages_write']);
        };
        try {
          check(); const mentions = richMentions(text);
          if (mentions.people.length || mentions.all) {
            stage = 'mention membership/grant validation';
            if (store.room?.type !== 'group') throw new PublicProblem('failed');
            this.featureGrant(['spark:memberships_read']);
            await validateMentions(this.actionREST, this.members, binding.roomId, text, consent, abort.signal, () => { check(); return this.token || 'LOCAL-DEMO'; });
          }
          check();
          if (this.mode === 'demo') return await store.demoRichMessage(binding.roomId, text, binding.parentId);
          stage = 'message submission';
          submitted = true;
          const response = await this.actionREST.call('/v1/messages', 'POST', this.token, abort.signal,
            { roomId: binding.roomId, markdown: text, ...(binding.parentId ? { parentId: binding.parentId } : {}) });
          check();
          stage = 'message acknowledgment validation';
          if (!validMessageAck(response.value, { roomId: binding.roomId, parentId: binding.parentId, content: text, format: 'markdown' })) {
            throw new PublicProblem('unknown');
          }
          const item = store.projectSent(response.value, binding.roomId);
          if (!item || item.parentId !== binding.parentId || !item.created) throw new PublicProblem('unknown');
          return item;
        } catch (error) {
          // A failed grant check / membership read is not an uncertain POST.
          // Only the message-write boundary can create possible-delivery evidence.
          const failed = !submitted || error instanceof PublicProblem && error.reason === 'failed';
          const status = error instanceof PublicProblem && error.status ? ` (HTTP ${error.status})` : '';
          throw new MessagingError(failed ? 'failed' : 'unknown', failed
            ? `Markdown message not sent${status}: ${stage} failed${error instanceof EditorError && error.code === -32034 ? ' (required existing grant/destination unavailable)' : ''}. Draft retained; nothing was retried.`
            : `Markdown delivery UNKNOWN${status} during ${stage}. Check Webex before resolving; nothing was replayed.`);
        }
        finally { clearTimeout(timer); if (this.featureAbort === abort) this.featureAbort = undefined; }
      },
    });
    if (generation !== this.generation || this.store !== store) throw new EditorError(-32004, 'Disconnected during rich delivery. Check Webex before resolving/retrying.');
  }
  private uploadWriteAllowed(): boolean {
    return this.mode === 'demo' || !!this.token && Date.now() < this.expiresAt
      && this.grantedScope.split(/\s+/).some(scope => scope === 'spark:all' || scope === 'spark:messages_write');
  }
  private uploadContext(binding: UploadBinding): MessagingStore {
    const store = this.connected();
    if (!validUploadBinding(binding) || !this.uploadWriteAllowed()) throw new EditorError(-32003, 'Uploads require a known existing messages_write/all grant and a valid draft target. No authorization was probed.');
    const parent = store.messages.find(message => message.id === binding.parentId);
    if (!store.ready || store.room?.id !== binding.roomId || !store.rooms.some(room => room.id === binding.roomId)
      || binding.parentId !== undefined && (parent?.parentId || !parent && !store.messages.some(message => message.parentId === binding.parentId))) throw new EditorError(-32602, 'Choose a ready validated space/root draft before staging or sending.');
    return store;
  }
  private recipientUploadContext(binding: SnapshotBinding) {
    if (!validSnapshotBinding(binding)) throw new EditorError(-32602, 'Invalid snapshot binding.');
    if ('roomId' in binding) return this.uploadContext(binding);
    this.featureGrant(['spark:people_read', 'spark:messages_write', 'spark:rooms_read']);
    const target = this.conversations.recipient(binding.targetId);
    if (!target || target.expiresAt <= Date.now()) throw new EditorError(-32003, 'Recipient preparation expired; no room ID was invented.');
    return this.connected();
  }
  async stageUpload(path: string, binding: SnapshotBinding) {
    const store = this.recipientUploadContext(binding), generation = this.generation;
    binding = snapshotBinding(binding);
    const valid = () => this.generation === generation && this.store === store && this.state === 'ready'
      && this.uploadWriteAllowed() && ('roomId' in binding ? store.rooms.some(room => room.id === binding.roomId)
        : (this.conversations.recipient(binding.targetId)?.expiresAt ?? 0) > Date.now());
    try { return await this.uploads.stage(path, binding, valid); }
    catch (error) { throw new EditorError(-32033, error instanceof UploadFailure ? error.message : 'File staging unavailable. Nothing was sent.'); }
  }
  removeUpload(attachmentId: string, binding: SnapshotBinding): void {
    if (!uploadId(attachmentId) || !validSnapshotBinding(binding)) throw new EditorError(-32602, 'Invalid staged attachment.');
    try { this.uploads.remove(attachmentId, binding); }
    catch { throw new EditorError(-32033, 'Staged attachment unavailable or belongs to another draft/session. Nothing was sent.'); }
  }
  cancelUpload(draftId: string, phase?: 'stage' | 'send'): void {
    if (!uploadDraftId(draftId)) throw new EditorError(-32602, 'Invalid draft cancellation.');
    this.uploads.cancel(draftId, phase);
  }
  async sendUpload(requestId: string, text: string, attachmentId: string, binding: UploadBinding, options: UploadSendOptions = {}): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId) || !uploadId(attachmentId) || !validUploadBinding(binding)
      || !validUploadSendOptions(options) || !(text === '' || chatText(text))
      || options.format === 'markdown' && !validRichText(text)) throw new EditorError(-32602, 'Invalid explicit attachment format, content or consent.');
    // Native binding/options are detached before FD admission or a membership await.
    binding = { roomId: binding.roomId, draftId: binding.draftId, ...(binding.parentId !== undefined ? { parentId: binding.parentId } : {}) };
    const rich = options.format === 'markdown', consent: MentionConsent = {
      ...(options.mentionsAccepted !== undefined ? { mentionsAccepted: options.mentionsAccepted } : {}),
      ...(options.allAccepted !== undefined ? { allAccepted: options.allAccepted } : {}),
    };
    const store = this.uploadContext(binding), generation = this.generation;
    if (this.actions.busy() || this.reactions.busy() || this.conversations.busy() || this.featureAbort) throw new EditorError(-32002, 'An explicit message/member action is active. Nothing was queued.');
    if (store.sending) throw new EditorError(-32002, 'A delivery is already pending. No upload was queued.');
    const selected = store.conversationOwner(binding.roomId);
    let transmitted = false;
    const valid = () => this.generation === generation && this.store === store && this.state === 'ready'
      && this.uploadWriteAllowed() && store.rooms.some(room => room.id === binding.roomId)
      && (!rich || transmitted || selected() && (binding.parentId === undefined
        || store.messages.some(item => item.id === binding.parentId && !item.parentId || item.parentId === binding.parentId)));
    const transaction = this.uploadTransaction = { generation };
    try { await store.sendPrepared(requestId, binding.roomId, text, binding.parentId, {
      identity: JSON.stringify(rich ? ['markdown-single-file-v1', attachmentId, binding.draftId, consent] : [attachmentId, binding.draftId]),
      attachmentId, draftId: binding.draftId, ...(rich ? { format: 'markdown' as const } : {}),
      send: async () => {
        try {
          return await this.uploads.send(attachmentId, binding, valid, async (source, signal, submitted) => {
            try {
              let mentionsRequired = false;
              const check = (active = signal) => {
                if (!valid() || active.aborted) throw new UploadFailure(transmitted ? 'unknown' : 'failed');
                this.featureGrant(mentionsRequired ? ['spark:messages_write', 'spark:memberships_read'] : ['spark:messages_write']);
              };
              if (rich) {
                const targets = richMentions(text);
                mentionsRequired = !!(targets.people.length || targets.all);
                if (mentionsRequired) {
                  if (store.room?.type !== 'group') throw new UploadFailure('failed');
                  check();
                  const abort = new AbortController(), timer = setTimeout(() => {
                    abort.abort();
                    // End logical preflight at its own deadline, but Uploads keeps
                    // the physical reservation until even a stubborn GET settles.
                    this.uploads.cancel(binding.draftId, 'send');
                  }, 20000);
                  timer.unref?.();
                  const preflight = AbortSignal.any([signal, abort.signal]);
                  try {
                    await validateMentions(this.actionREST, this.members, binding.roomId, text, consent, preflight,
                      () => { check(preflight); return this.token || 'LOCAL-DEMO'; });
                    check(preflight);
                  } finally {
                    clearTimeout(timer); abort.abort();
                    // PublicREST abort is logical; do not free the upload reservation
                    // while its native GET/socket/DNS is still unsettled.
                    await this.actionREST.settled?.();
                  }
                }
              }
              check();
              const submit = () => { check(); submitted(); transmitted = true; };
              if (this.mode === 'demo') {
                for await (const _ of source.read(signal)) { /* Account-free local sandbox; no transport. */ }
                submit();
                return rich ? store.demoRichMessage(binding.roomId, text, binding.parentId)
                  : store.demoUploadMessage(binding.roomId, text || `[Local demo attachment: ${source.name}]`, binding.parentId);
              }
              const raw = await postUpload(source, { roomId: binding.roomId, parentId: binding.parentId, text, ...(rich ? { format: 'markdown' as const } : {}) },
                this.token, signal, submit, this.owners.uploadRequest);
              check();
              // Validate raw acknowledgment BEFORE display normalization/registry writes.
              const ack = parseMessage(raw, binding.roomId);
              if ('errors' in raw || !ack || ack.parentId !== binding.parentId || !ack.created
                || typeof raw.created !== 'string' || raw.created.length > 128 || store.messages.some(item => item.id === ack.id)
                || rich && raw.markdown !== text || !Array.isArray(raw.files) || raw.files.length !== 1
                || !webexAttachment(raw.files[0])) throw new UploadFailure('unknown');
              const message = store.projectSent(raw, binding.roomId);
              if (!message) throw new UploadFailure('unknown');
              return message;
            } catch (error) {
              throw error instanceof UploadFailure ? error : new UploadFailure(transmitted ? 'unknown' : 'failed');
            }
          });
        } catch (error) { throw new MessagingError(error instanceof UploadFailure && error.reason === 'failed' ? 'failed' : 'unknown',
          error instanceof UploadFailure ? error.message : 'Delivery UNKNOWN. Check Webex before resolving/retrying.'); }
      },
    }); } finally { if (this.uploadTransaction === transaction) this.uploadTransaction = undefined; }
    if (this.store !== store || this.state !== 'ready') throw new EditorError(-32004, 'Disconnected during upload. Retain the draft and check Webex before resolving/retrying.');
  }
  resolveDelivery(): void { this.connected().resolveDelivery(); }
  resolveBoundDelivery(roomId: string): { roomId: string } {
    const store = this.connected();
    if (store.room?.id !== roomId || store.sending) throw new EditorError(-32004, 'Resolution destination changed or delivery is pending; uncertainty retained.');
    store.resolveDelivery(); return { roomId };
  }
  async markRead(roomId: string, messageId: string): Promise<void> {
    const store = this.connected();
    const generation = this.generation, source = this.reads.lease();
    const check = () => {
      if (this.generation !== generation || this.store !== store || this.state !== 'ready' || !source())
        throw new EditorError(-32003, 'Read receipt source changed; nothing was sent.');
      this.featureGrant(['spark:all']);
      if (this.reactions.busy()) throw new EditorError(-32002,'An explicit reaction operation is active; no receipt was queued.');
      if (!chatId(roomId) || !chatId(messageId) || store.room?.id !== roomId || !store.ready
        || store.latestMessageId !== messageId || store.messages.at(-1)?.id !== messageId) {
        throw new EditorError(-32602, 'Mark read only at the known newest endpoint in the current loaded conversation.');
      }
      if (!this.reads.available()) throw new EditorError(-32003, 'Webex read status is unavailable. Enable read_status and check SDK dependencies/scopes.');
      this.observeReadActivity();
      const status = this.roomReadStatus(store.room);
      if (status.unread === undefined || status.unreadStale) throw new EditorError(-32003, 'Read status for this space is unavailable or stale. Wait for fresh server status; nothing was sent.');
    };
    check();
    try { await this.reads.markRead(roomId, messageId, check); }
    catch { throw new EditorError(-32003, 'Read receipt failed or is still pending. Nothing was retried.'); }
  }
  stop(): void {
    this.stopSession(true);
  }
  private stopSession(clearReadCache: boolean): void {
    this.received?.close(); this.received = undefined;
    this.localSession = '';
    this.identity.reset(); this.drafts.reset();
    this.disk.stop();
    if (clearReadCache) this.unread.reset();
    this.presence.reset(); this.wantPeopleStatus = false;
    this.names.setSession(); this.senderScope = undefined; this.wantSenderNames = false;
    this.preferences.reset();
    this.uploads.reset();
    this.uploadTransaction = undefined;
    this.actions.reset(); this.members.select(''); this.featureAbort?.abort();
    this.conversations.reset(); this.teams.reset(); this.directPending = false;
    this.directory.reset();
    this.messageQueries.reset();
    this.directTransaction = undefined;
    this.agenda.stop(); this.wantUpcomingMeetings = false;
    this.initialRoomsPending = false;
    this.reads.stop(); this.wantReadStatus = false; this.wantNotificationPreview = false;
    for (const operation of this.attachmentOperations.values()) operation.abort.abort();
    this.attachmentOperations.clear();
    this.generation++; this.abort?.abort(); this.abort = undefined; this.store?.close(); this.store = undefined;
    this.oauth?.close(); this.oauth = undefined; this.token = ''; this.expiresAt = 0; this.grantedScope = ''; this.renewing = undefined;
    this.state = 'idle'; this.auth = 'off'; this.notice = ''; this.publish();
  }
}
