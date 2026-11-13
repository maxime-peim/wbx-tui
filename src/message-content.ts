import { parseDocument } from 'htmlparser2';
import type { ChatMessage } from './chat-protocol.js';
import { cardText } from './card-text.js';

const LIMIT = 10_000;
export const messageText = (value: unknown, max: number): string => typeof value === 'string'
  ? value.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, max) : '';
const bounded = (value: unknown): string => messageText(value, LIMIT)
  + (typeof value === 'string' && value.length > LIMIT ? '… [truncated at 10,000 characters]' : '');
const escape = (text: string): string => text.replace(/[\\`*_{}\[\]<>#+!|]/g, '\\$&');
function quotedMarkdown(markdown: string): boolean {
  let fence = '';
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = '';
    } else if (!fence && /^ {0,3}>/.test(line)) return true;
  }
  return false;
}
function compactMarkdown(markdown: string): string {
  const output: string[] = [];
  let fence = '';
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = '';
    }
    if (!fence && !line.trim() && output.at(-1) === '') continue;
    output.push(line);
  }
  return output.join('\n').trim();
}
/** Parse as inert data, never a DOM/browser. No images, links or embeds are fetched. */
function htmlMarkdown(html: string): { markdown: string; quoted: boolean } {
  const document = parseDocument(html.slice(0, 40_000)), blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form']);
  type Node = (typeof document.children)[number];
  let visited = 0, quoted = false, omitted = html.length > 40_000;
  const render = (node: Node, depth = 0, raw = false, number = 0): string => {
    if (++visited > 8192 || depth > 32) { omitted = true; return ''; }
    if (node.type === 'text') return raw ? node.data : escape(node.data);
    if (!('name' in node) || !('children' in node) || !('attribs' in node)) return '';
    const name = node.name.toLowerCase();
    if (blocked.has(name)) return '';
    if (name === 'br') return '\n';
    if (name === 'img') return '[Image]';
    let index = 0;
    const content = node.children.map(child => render(child, depth + 1, raw || name === 'pre' || name === 'code', name === 'ol' && 'name' in child && child.name === 'li' ? ++index : 0)).join('');
    if (raw) return content;
    if (name === 'spark-mention') return content.startsWith('@') ? content : '@' + content;
    if (name === 'pre') {
      const fence = '`'.repeat(Math.max(3, ...Array.from(content.matchAll(/`+/g), match => match[0].length + 1)));
      return '\n\n' + fence + '\n' + content.trimEnd() + '\n' + fence + '\n\n';
    }
    if (name === 'code') {
      const fence = '`'.repeat(Math.max(1, ...Array.from(content.matchAll(/`+/g), match => match[0].length + 1)));
      return fence + ' ' + content + ' ' + fence;
    }
    if (name === 'strong' || name === 'b') return '**' + content + '**';
    if (name === 'em' || name === 'i') return '*' + content + '*';
    if (name === 's' || name === 'del' || name === 'strike') return '~~' + content + '~~';
    if (name === 'blockquote') { quoted = true; return '\n\n' + content.trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n'; }
    if (/^h[1-6]$/.test(name)) return '\n\n' + '#'.repeat(Number(name[1])) + ' ' + content.trim() + '\n\n';
    if (name === 'li') {
      const prefix = number ? `${number}. ` : '- ';
      return '\n' + prefix + content.trim().replaceAll('\n', '\n' + ' '.repeat(prefix.length)) + '\n';
    }
    if (name === 'a') {
      try {
        const href = node.attribs.href ?? '';
        if (href.length <= 2048 && !/[\x00-\x20\x7f]/.test(href)) {
          const url = new URL(href);
          if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return '[' + content + '](<' + url.href.replace(/[<>\\]/g, encodeURIComponent) + '>)';
        }
      } catch { /* unsupported/relative URLs remain visible text, never actions */ }
    }
    if (name === 'hr') return '\n\n---\n\n';
    if (['p', 'div', 'ul', 'ol', 'table', 'tr'].includes(name)) return '\n\n' + content.trim() + '\n\n';
    if (name === 'td' || name === 'th') return content + ' | ';
    return content;
  };
  const markdown = bounded(compactMarkdown(document.children.map(node => render(node)).join('')));
  return { markdown: markdown + (omitted ? '\n[Rich text truncated at safe display limits]' : ''), quoted };
}
export function messageContent(value: Record<string, unknown>): Pick<ChatMessage, 'text' | 'markdown' | 'quoted' | 'cards'> {
  const html = typeof value.html === 'string' ? htmlMarkdown(value.html) : undefined;
  let markdown = bounded(value.markdown).trim() || html?.markdown || '';
  const quoted = html?.quoted || quotedMarkdown(markdown);
  let text = bounded(value.text) || markdown || '';
  const card = cardText(value.attachments);
  if (card.text) {
    const append = (base: string, suffix: string) => {
      const joined = (base ? base + '\n\n' : '') + suffix;
      if (joined.length <= LIMIT) return joined;
      card.partial = true;
      return joined.slice(0, LIMIT).replace(/[\ud800-\udfff]/gu, '\ufffd') + '\n[Message/card text truncated at safe display limits]';
    };
    text = append(text, card.text);
    if (markdown) markdown = append(markdown, escape(card.text));
  }
  return { text: text || '[Attachment / non-text message]', ...(markdown ? { markdown } : {}),
    ...(quoted ? { quoted: true } : {}), ...(card.count ? { cards: { count: card.count, partial: card.partial } } : {}) };
}
