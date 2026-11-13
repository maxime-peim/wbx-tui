/** Finite Adaptive Cards 1.0–1.3 text projection. No actions, inputs, URLs or IO. */
export const CARD_TEXT_LIMITS = Object.freeze({ attachments: 10, children: 32, nodes: 128, depth: 8,
  fieldUnits: 2048, textUnits: 4096, textBytes: 16384 });
export interface CardText { text: string; count: number; partial: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const unsafe = /[\x00-\x09\x0b-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;
const omitted = '[Card content omitted or truncated; unsupported elements/actions/inputs stay inert]';
export function cardText(attachments: unknown): CardText {
  if (attachments === undefined || Array.isArray(attachments) && !attachments.length) return { text: '', count: 0, partial: false };
  if (!Array.isArray(attachments)) return { text: omitted, count: 0, partial: true };
  let text = '', count = 0, partial = attachments.length > CARD_TEXT_LIMITS.attachments, nodes = 0, stopped = false;
  const seen = new WeakSet<object>();
  const emit = (value: string) => {
    const remaining = CARD_TEXT_LIMITS.textUnits - text.length - (text ? 1 : 0);
    if (value.length > remaining) { partial = true; stopped = true; }
    if (remaining > 0 && value) text += (text ? '\n' : '') + value.slice(0, remaining);
  };
  const field = (value: unknown): string | undefined => {
    if (typeof value !== 'string') { partial = true; return; }
    if (value.length > CARD_TEXT_LIMITS.fieldUnits) partial = true;
    return value.slice(0, CARD_TEXT_LIMITS.fieldUnits).replace(/[\ud800-\udfff]/gu, '\ufffd').replace(unsafe, ' ');
  };
  const admit = (value: unknown, depth: number): value is Record<string, unknown> => {
    if (stopped) return false;
    if (++nodes > CARD_TEXT_LIMITS.nodes) { partial = true; stopped = true; return false; }
    if (depth > CARD_TEXT_LIMITS.depth || !object(value) || seen.has(value)) { partial = true; return false; }
    seen.add(value);
    // Hidden/conditional subtrees must not be inspected, even to count them.
    if (value.isVisible === false) { partial = true; return false; }
    if (value.isVisible !== undefined && value.isVisible !== true || 'requires' in value) { partial = true; return false; }
    for (const key of ['selectAction', 'actions', 'fallback', 'fallbackText', 'refresh', 'authentication', 'speak']) {
      if (key in value) partial = true; // Never inspect or render these values.
    }
    return true;
  };
  const array = (value: unknown, visit: (item: unknown) => void) => {
    if (!Array.isArray(value)) { partial = true; return; }
    if (value.length > CARD_TEXT_LIMITS.children) partial = true;
    for (let index = 0; index < Math.min(value.length, CARD_TEXT_LIMITS.children) && !stopped; index++) visit(value[index]);
  };
  const element = (value: unknown, depth: number, column = false): void => {
    if (!admit(value, depth)) return;
    if (column && value.type !== 'Column') { partial = true; return; }
    switch (value.type) {
      case 'TextBlock': {
        const line = field(value.text);
        if (line !== undefined) emit(line);
        return;
      }
      case 'FactSet':
        array(value.facts, item => {
          if (!admit(item, depth + 1)) return;
          const title = field(item.title), fact = field(item.value);
          if (title !== undefined && fact !== undefined) emit(title + ': ' + fact);
        });
        return;
      case 'Container': case 'Column':
        array(value.items, item => element(item, depth + 1));
        return;
      case 'ColumnSet':
        array(value.columns, item => element(item, depth + 1, true));
        return;
      default: partial = true; // No recursive dump, input defaults, URLs or action labels.
    }
  };
  for (let index = 0; index < Math.min(attachments.length, CARD_TEXT_LIMITS.attachments) && !stopped; index++) {
    const attachment = attachments[index];
    if (!object(attachment) || attachment.contentType !== 'application/vnd.microsoft.card.adaptive') { partial = true; continue; }
    count++;
    const card = attachment.content;
    if (!admit(card, 0) || card.type !== 'AdaptiveCard' || typeof card.version !== 'string'
      || !['1.0', '1.1', '1.2', '1.3'].includes(card.version)) {
      partial = true; continue;
    }
    emit('[Adaptive Card ' + card.version + ' · read-only text subset]');
    if (card.body !== undefined) array(card.body, item => element(item, 1));
  }
  if (partial) text = text.slice(0, CARD_TEXT_LIMITS.textUnits - omitted.length - 1) + (text ? '\n' : '') + omitted;
  // Clipping cannot leave a lone surrogate at either boundary.
  text = text.replace(/[\ud800-\udfff]/gu, '\ufffd');
  return { text, count, partial };
}
