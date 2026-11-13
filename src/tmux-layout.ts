import type { Layout } from './config.js';
import type { Source } from './protocol.js';

export interface NativeLeaf { pane: string; source: Source }
export type NativeTree = NativeLeaf | { direction: 'vertical' | 'horizontal'; ratio: number; children: [NativeTree, NativeTree] };
export function nativeTree(layout: Layout, panes: NativeLeaf[]): NativeTree {
  const remaining = [...panes];
  const visit = (node: Layout): NativeTree | undefined => {
    if ('source' in node) {
      const index = remaining.findIndex(pane => pane.source === node.source);
      return index < 0 ? undefined : remaining.splice(index, 1)[0];
    }
    const a = visit(node.children[0]), b = visit(node.children[1]);
    return a && b ? { ...node, children: [a, b] } : a ?? b;
  };
  let tree = visit(layout);
  const extras = (panes: NativeLeaf[], direction: 'vertical' | 'horizontal'): NativeTree => {
    if (panes.length === 1) return panes[0]!;
    const middle = Math.floor(panes.length / 2);
    return { direction, ratio: middle / panes.length, children: [extras(panes.slice(0, middle), direction === 'vertical' ? 'horizontal' : 'vertical'),
      extras(panes.slice(middle), direction === 'vertical' ? 'horizontal' : 'vertical')] };
  };
  if (remaining.length) {
    const rest = extras(remaining, remaining.length <= 3 ? 'vertical' : 'horizontal');
    tree = tree ? { direction: 'horizontal', ratio: .7, children: [tree, rest] } : rest;
  }
  if (!tree) throw new Error('No native panes to arrange.');
  return tree;
}
export function layoutChecksum(body: string): string {
  let checksum = 0;
  for (const byte of Buffer.from(body)) checksum = (((checksum >>> 1) | ((checksum & 1) << 15)) + byte) & 0xffff;
  return checksum.toString(16).padStart(4, '0');
}
export function tmuxLayout(tree: NativeTree, width: number, height: number): string {
  const minimum = (node: NativeTree): [number, number] => {
    if ('pane' in node) return [2, 2];
    const a = minimum(node.children[0]), b = minimum(node.children[1]);
    return node.direction === 'vertical' ? [a[0] + b[0] + 1, Math.max(a[1], b[1])]
      : [Math.max(a[0], b[0]), a[1] + b[1] + 1];
  };
  const visit = (node: NativeTree, w: number, h: number, x: number, y: number): string => {
    const prefix = `${w}x${h},${x},${y}`;
    if ('pane' in node) {
      if (!/^%\d+$/.test(node.pane)) throw new Error('Invalid tmux pane identifier.');
      return `${prefix},${node.pane.slice(1)}`;
    }
    const side = node.direction === 'vertical', total = (side ? w : h) - 1;
    const aMin = minimum(node.children[0])[side ? 0 : 1], bMin = minimum(node.children[1])[side ? 0 : 1];
    if (total < aMin + bMin) throw new Error('Terminal too small for this custom tmux layout.');
    const first = Math.max(aMin, Math.min(total - bMin, Math.round(total * node.ratio)));
    const a = visit(node.children[0], side ? first : w, side ? h : first, x, y);
    const b = visit(node.children[1], side ? total - first : w, side ? h : total - first, side ? x + first + 1 : x, side ? y : y + first + 1);
    return `${prefix}${side ? '{' : '['}${a},${b}${side ? '}' : ']'}`;
  };
  const body = visit(tree, width, height, 0, 0);
  return `${layoutChecksum(body)},${body}`;
}
/** Translate tmux's actual saved geometry back into source-based, reusable JSON. */
export function fromTmuxLayout(text: string, panes: NativeLeaf[]): Layout {
  if (text.length > 32_768 || !/^[0-9a-f]{4},/i.test(text)) throw new Error('Invalid tmux layout.');
  let offset = 5;
  const parse = (): { layout: Layout; width: number; height: number } => {
    const head = /^(\d+)x(\d+),(\d+),(\d+)/.exec(text.slice(offset));
    if (!head) throw new Error('Invalid tmux layout geometry.');
    offset += head[0].length;
    const width = Number(head[1]), height = Number(head[2]), open = text[offset];
    if (open === ',') {
      const id = /^,(\d+)/.exec(text.slice(offset));
      if (!id) throw new Error('Invalid tmux layout pane.');
      offset += id[0].length;
      const pane = panes.find(pane => pane.pane === `%${id[1]}`);
      if (!pane) throw new Error('Cannot save a layout containing an unmanaged pane.');
      return { layout: { source: pane.source }, width, height };
    }
    if (open !== '{' && open !== '[') throw new Error('Invalid tmux layout split.');
    offset++;
    const children = [parse()];
    while (text[offset] === ',') { offset++; children.push(parse()); }
    if (text[offset++] !== (open === '{' ? '}' : ']')) throw new Error('Unclosed tmux layout split.');
    const combine = (items: typeof children): Layout => {
      if (items.length === 1) return items[0]!.layout;
      const first = items[0]!, rest = items.slice(1), side = open === '{';
      const sizes = items.map(child => side ? child.width : child.height);
      return { direction: side ? 'vertical' : 'horizontal', ratio: Math.max(.1, Math.min(.9, sizes[0]! / sizes.reduce((a, b) => a + b, 0))),
        children: [first.layout, combine(rest)] };
    };
    return { layout: combine(children), width, height };
  };
  const result = parse();
  if (offset !== text.length) throw new Error('Trailing tmux layout data.');
  return result.layout;
}
