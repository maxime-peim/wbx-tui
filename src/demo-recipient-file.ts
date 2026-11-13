/** Synthetic recipient-file posting only; upload/admission/outcome owners stay separate. */
import type { DirectFiles } from './conversation-actions.js';
import type { MessagingStore } from './messaging-store.js';
import type { UploadSource } from './uploads.js';
import type { DirectOptions } from './action-contracts.js';

export async function postDemoRecipientFile(store: () => Pick<MessagingStore, 'demoConversation'> | undefined,
  source: UploadSource, target: Parameters<DirectFiles['post']>[1], text: string, intent: DirectOptions,
  signal: AbortSignal, submitted: () => void): Promise<unknown> {
  for await (const _ of source.read(signal)) { /* Local sandbox snapshot consumption only. */ }
  submitted();
  return store()!.demoConversation('direct', { ...target, personId: 'toPersonId' in target ? target.toPersonId : undefined,
    text: intent.format ? undefined : text, markdown: intent.format ? text : undefined, file: true });
}
